/**
 * Self-contained checks for the pure parts of both halves.
 *
 * These run without a browser and without a Harness: they cover the settings
 * normalisation on the Host side and the selector/decision logic on the client
 * side, which are the two places a silent regression would change behaviour
 * without changing the DOM shape.
 *
 * Run with `node test/run.mjs`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const host = await import(`file://${join(root, "lib", "index.js").replace(/\\/g, "/")}`);
const clientSource = readFileSync(join(root, "lib", "client.js"), "utf8");

let passed = 0;
let failed = 0;

/** Run one named check, reporting rather than throwing. */
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

console.log("host: settings normalisation");

check("defaults are returned for a non-object", () => {
  const s = host.normalizeSettings(null);
  assert.equal(s.pinBusyWorkspaces, true);
  assert.equal(s.intensity, 0.6);
});

check("booleans are taken from the document", () => {
  const s = host.normalizeSettings({ pinBusyWorkspaces: false, notifyOnCompletion: false });
  assert.equal(s.pinBusyWorkspaces, false);
  assert.equal(s.notifyOnCompletion, false);
});

check("a non-boolean falls back to the default", () => {
  const s = host.normalizeSettings({ pinBusyWorkspaces: "yes" });
  assert.equal(s.pinBusyWorkspaces, true);
});

check("intensity is clamped into range", () => {
  assert.equal(host.normalizeSettings({ intensity: 5 }).intensity, 1);
  assert.equal(host.normalizeSettings({ intensity: -3 }).intensity, 0);
});

check("a non-finite intensity falls back to the default", () => {
  assert.equal(host.normalizeSettings({ intensity: Number.NaN }).intensity, 0.6);
  assert.equal(host.normalizeSettings({ intensity: "0.9" }).intensity, 0.6);
});

check("unknown keys are dropped", () => {
  const s = host.normalizeSettings({ pinned: true, __proto__: { polluted: true } });
  assert.equal(Object.hasOwn(s, "pinned"), false);
  assert.equal(Object.hasOwn(s, "polluted"), false);
});

check("every default field survives normalisation", () => {
  const s = host.normalizeSettings({});
  assert.deepEqual(Object.keys(s).sort(), Object.keys(host.DEFAULT_SETTINGS).sort());
});

console.log("client: module contract");

check("declares the official loader entry", () => {
  assert.match(clientSource, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(clientSource, /id: "dsh-plugin-busy-workspace"/);
  assert.match(clientSource, /factory: \(require\)/);
});

check("exports apply and inject", () => {
  assert.match(clientSource, /exports\.apply = apply/);
  assert.match(clientSource, /exports\.inject = inject/);
  assert.match(clientSource, /const inject = \["slots"\]/);
});

check("the served module id matches the bundle name", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsh-plugin-busy-workspace");
  assert.ok(clientSource.includes(`id: "${pkg.name}"`));
});

console.log("client: selector contract");

check("the status attribute is matched, not the hashed class", () => {
  // data-state is the primitive's own contract and must be matched exactly.
  assert.match(clientSource, /statusDot: "\[data-state\]"/);
  assert.match(clientSource, /=== "ongoing"/);
});

check("hashed CSS-module classes are matched by suffix", () => {
  // A full class name carries a build-time hash; matching the suffix survives it.
  for (const suffix of ["_groupSection", "_projectRow", "_sessionRow", "_title"]) {
    assert.ok(
      clientSource.includes(`[class*="${suffix}"]`),
      `expected a suffix selector for ${suffix}`,
    );
  }
});

check("the flat-list selector still requires the tree role", () => {
  assert.match(clientSource, /_list"\]\[role="tree"\]/);
});

console.log("client: styling contract");

check("no hardcoded palette outside the documented fallbacks", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(css !== null, "stylesheet literal missing");
  const body = css[1];
  // Every colour literal must be the fallback of a custom-property definition,
  // e.g. `--bw-running: var(--dsw-static-deepseek-450, #5686fe);`. A literal
  // anywhere else is a hardcoded colour that would not follow the theme.
  const definitions = [...body.matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm)];
  const allowed = new Set();
  for (const [, , value] of definitions) {
    for (const hex of value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) allowed.add(hex);
  }
  // Colour keywords that are legitimate in a fallback position.
  for (const keyword of ["transparent", "currentColor", "inherit"]) allowed.add(keyword);

  const literals = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  for (const hex of literals) {
    assert.ok(allowed.has(hex), `${hex} is not a custom-property fallback`);
  }
  // The declarations that define the palette must actually carry a fallback, so
  // a missing theme token degrades to a known colour rather than to nothing.
  assert.match(body, /--bw-running:\s*var\(--dsw-static-deepseek-450,\s*#[0-9a-fA-F]{6}\)/);
  assert.match(body, /--bw-settle:\s*var\(--dsw-alias-state-success-primary,\s*#[0-9a-fA-F]{6}\)/);
});

check("the running colour is the token the status dot uses", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  // The dot's `ongoing` matrix is painted with this exact token. Sharing it is
  // what makes the row highlight and the dot read as one signal.
  assert.match(css, /--bw-running:\s*var\(--dsw-static-deepseek-450/);
  // The near-black brand token must not be reachable as a fallback.
  assert.ok(!/var\(--dsw-alias-brand-primary/.test(css), "--dsw-alias-brand-primary resolves to near-black");
});

check("the selected surface outranks the running fill", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  // A row that is both selected and running must keep the official selected
  // surface, not the running fill.
  const selectedRule = css.match(
    /\[class\*="_sessionRow"\]\[data-busy-session="true"\]\[class\*="_selected"\]\s*\{([^}]*)\}/,
  );
  assert.ok(selectedRule !== null, "expected a selected-and-running rule");
  assert.match(selectedRule[1], /background:\s*var\(--dsw-alias-interactive-bg-hover\)/);
  assert.ok(
    !/color-mix\([^)]*--bw-running[^)]*\)\s*;?\s*$/.test(selectedRule[1].match(/background:[^;]*/)?.[0] ?? ""),
    "the selected background must not be a running tint",
  );
});

check("the running fill stays below the selected surface's weight", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const fill = css.match(/--bw-fill-alpha:\s*calc\(var\(--bw-intensity\)\s*\*\s*([\d.]+)(%?)\)/);
  assert.ok(fill !== null, "expected a fill alpha definition");
  const alpha = fill[2] === "%" ? Number(fill[1]) / 100 : Number(fill[1]);
  // The official selected surface is ~6% alpha. A running fill at or above it
  // would make a running row look more selected than the selected row.
  assert.ok(alpha <= 0.08, `fill alpha ${alpha} would out-shout the selected surface`);
});

check("the running frame is drawn without changing the box model", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const runningBlock = css.split('data-busy-session="true"]')[1] ?? "";
  assert.ok(runningBlock.includes("box-shadow"), "expected an inset ring");
  // A border on the running row would shift every row below it.
  assert.ok(!/border:\s*1px/.test(runningBlock), "a border would shift layout");
});

check("reduced motion keeps the states and drops the movement", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const reduced = css.split("prefers-reduced-motion: reduce")[1] ?? "";
  assert.ok(reduced.includes("animation: none"), "expected animations to be disabled");
  assert.ok(!/display:\s*none/.test(reduced), "reduced motion must not hide the indicators");
});

check("motion is bounded and low-frequency", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const durations = [...css.matchAll(/([\d.]+)s\s+var\(--ds-ease-in-out/g)].map((m) => Number(m[1]));
  assert.ok(durations.length > 0, "expected keyframed transitions");
  for (const d of durations) {
    assert.ok(d >= 0.1, `${d}s is too fast to read as a deliberate state`);
  }
});

console.log("client: runtime discipline");

check("the observer cannot drive itself", () => {
  const filter = clientSource.match(/attributeFilter: \[([^\]]+)\]/);
  assert.ok(filter !== null, "expected an attributeFilter");
  const observed = filter[1];
  // The plugin writes data-busy-* attributes; observing them would loop.
  assert.ok(!observed.includes("data-busy"), "the observer must not watch its own writes");
});

check("paint work is coalesced per frame", () => {
  assert.match(clientSource, /requestAnimationFrame\(run\)/);
  assert.match(clientSource, /if \(scheduled\) return/);
});

check("attribute writes are guarded by a change check", () => {
  assert.match(clientSource, /if \(group\.getAttribute\(BUSY_ATTR\) !== next\)/);
  assert.match(clientSource, /if \(row\.getAttribute\(RUNNING_ATTR\) !== next\)/);
});

check("the settle attribute is cleared even without an animationend", () => {
  assert.match(clientSource, /addEventListener\("animationend", clear/);
  assert.match(clientSource, /setTimeout\(clear, 1400\)/);
});

check("a disconnected observer leaves nothing behind", () => {
  assert.match(clientSource, /observer\.disconnect\(\)/);
  assert.match(clientSource, /removeEventListener\("focus", onFocus\)/);
  assert.match(clientSource, /disposeStyle\(\)/);
});

check("a settings fetch failure cannot break the host UI", () => {
  assert.match(clientSource, /catch \{\s*\/\* defaults already applied \*\/\s*\}/);
  assert.match(clientSource, /catch \{\s*\/\* keep the last known settings \*\/\s*\}/);
});

check("a paint failure is contained", () => {
  assert.match(clientSource, /catch \{\s*\/\/ A paint failure must never break the host UI/);
});

console.log("");
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
