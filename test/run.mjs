/**
 * Self-contained checks for the pure parts of both halves.
 *
 * These run without a browser and without a Harness. They cover the settings
 * normalisation on the Host side, the selector contracts on the client side,
 * and — most importantly — the **attention model**, which is exercised by
 * lifting the real `assess()` / `ageOf()` bodies out of the bundle and running
 * them against synthetic official rows. The retention rules are the part a
 * silent regression would break without changing any DOM shape.
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
  assert.equal(s.unreadHoldMinutes, 480);
  assert.equal(s.seenHoldMinutes, 15);
  assert.equal(s.staleRunMinutes, 360);
});

check("booleans are taken from the document", () => {
  const s = host.normalizeSettings({ pinBusyWorkspaces: false, notifyOnCompletion: false });
  assert.equal(s.pinBusyWorkspaces, false);
  assert.equal(s.notifyOnCompletion, false);
});

check("a non-boolean falls back to the default", () => {
  assert.equal(host.normalizeSettings({ pinBusyWorkspaces: "yes" }).pinBusyWorkspaces, true);
});

check("intensity is clamped into range", () => {
  assert.equal(host.normalizeSettings({ intensity: 5 }).intensity, 1);
  assert.equal(host.normalizeSettings({ intensity: -3 }).intensity, 0);
});

check("the retention windows are clamped into range", () => {
  assert.equal(host.normalizeSettings({ unreadHoldMinutes: 99999 }).unreadHoldMinutes, 10080);
  assert.equal(host.normalizeSettings({ unreadHoldMinutes: -1 }).unreadHoldMinutes, 0);
  assert.equal(host.normalizeSettings({ seenHoldMinutes: 99999 }).seenHoldMinutes, 1440);
  assert.equal(host.normalizeSettings({ seenHoldMinutes: -5 }).seenHoldMinutes, 0);
  // A zero stale window would mark every running session as interrupted.
  assert.equal(host.normalizeSettings({ staleRunMinutes: 0 }).staleRunMinutes, 30);
  assert.equal(host.normalizeSettings({ staleRunMinutes: 1e9 }).staleRunMinutes, 10080);
});

check("non-numeric durations fall back to the defaults", () => {
  const s = host.normalizeSettings({ unreadHoldMinutes: "8h", seenHoldMinutes: Number.NaN, staleRunMinutes: null });
  assert.equal(s.unreadHoldMinutes, 480);
  assert.equal(s.seenHoldMinutes, 15);
  assert.equal(s.staleRunMinutes, 360);
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

check("every numeric default has a declared range", () => {
  // Adding a field to the defaults without a range would silently skip clamping.
  const clientLimits = clientSource.match(/const NUMERIC_LIMITS = (\{[\s\S]*?\n    \});/)[1];
  const declared = Object.keys(eval(`(${clientLimits})`));
  for (const field of ["intensity", "unreadHoldMinutes", "seenHoldMinutes", "staleRunMinutes"]) {
    assert.ok(declared.includes(field), `expected a client range for ${field}`);
    assert.equal(typeof host.normalizeSettings({})[field], "number");
  }
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

check("the client defaults mirror the Host defaults", () => {
  const literal = clientSource.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n    \});/)[1];
  const clientDefaults = eval(`(${literal})`);
  assert.deepEqual(clientDefaults, host.DEFAULT_SETTINGS);
});

console.log("client: selector contract");

check("the status attribute is matched, not the hashed class", () => {
  // data-state is the primitive's own contract. It is additionally required to
  // be the primitive's own node (aria-hidden) and to carry a known session
  // value, because a row's leading cell can also hold another plugin's seat.
  assert.match(clientSource, /statusDot: '\[data-state\]\[aria-hidden="true"\]'/);
  assert.match(clientSource, /KNOWN_STATES\.has\(state\)/);
});

check("hashed CSS-module classes are matched by suffix", () => {
  for (const suffix of ["_groupSection", "_projectRow", "_sessionRow", "_title", "_time", "_slot", "_visuallyHidden"]) {
    assert.ok(
      clientSource.includes(`[class*="${suffix}"]`),
      `expected a suffix selector for ${suffix}`,
    );
  }
});

check("the list container is reached as the group's parent, not by role", () => {
  // The official session list renders no role="tree", so an earlier version's
  // `[class*="_list"][role="tree"]` matched nothing and promotion never ran.
  // Comments are stripped first: the source explains the old selector in prose.
  const code = clientSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(
    !/\[[^\]]*role="tree"/.test(code),
    'a role="tree" selector would silently match nothing in the official sidebar',
  );
  assert.match(clientSource, /group\.parentElement/);
  assert.match(clientSource, /LIST_ATTR/);
  assert.match(clientSource, /\[data-busy-list="true"\] > \[data-busy-rank="4"\]/);
});

check("the session state set is the official ongoing/warning/done/idle", () => {
  // Read from the Harness's own sessionStatuses/sessionNode derivation. `error`
  // belongs to the install wizard and never appears on a session row.
  assert.match(clientSource, /KNOWN_STATES = new Set\(\["ongoing", "warning", "done", "idle"\]\)/);
  for (const state of ['"warning"', '"ongoing"', '"done"']) {
    assert.ok(clientSource.includes(`=== ${state}`), `expected a branch for ${state}`);
  }
  assert.ok(!/=== "error"/.test(clientSource), "error is not a session-row state");
});

check("selection is read from the accessibility contract", () => {
  assert.match(clientSource, /row\.getAttribute\("aria-selected"\) === "true"/);
  assert.ok(
    clientSource.includes('attributeFilter: ["data-state", "class", "aria-selected"]'),
    "a selection change must trigger a repaint",
  );
});

console.log("client: attention model (the behaviour this plugin exists for)");

/**
 * Pull one function's exact source out of the client bundle by brace matching,
 * so the checks below run the shipped logic rather than a restatement of it.
 */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected ${name} in the client source`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** Pull out a literal assigned with a known opener, tolerating nested braces. */
function extractLiteral(source, name, open, close) {
  const prefix = `const ${name} = ${open}`;
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `expected ${name} in the client source`);
  let depth = 0;
  for (let i = start + prefix.length - 1; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start + prefix.length - 1, i + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

const literal = (name, open, close) => eval(`(${extractLiteral(clientSource, name, open, close)})`);

const SELECTOR = literal("SELECTOR", "{", "}");
const PHASE = literal("PHASE", "{", "}");
const AGE_UNITS = literal("AGE_UNITS", "[", "]");
const KNOWN_STATES = new Set(eval(clientSource.match(/const KNOWN_STATES = new Set\((\[[^\]]*\])\)/)[1]));

const sandbox = new Function(
  "SELECTOR",
  "KNOWN_STATES",
  "AGE_UNITS",
  "PHASE",
  `${extractFunction(clientSource, "statusStateOf")}
   ${extractFunction(clientSource, "ageOf")}
   ${extractFunction(clientSource, "pendingWordOf")}
   ${extractFunction(clientSource, "isSelected")}
   ${extractFunction(clientSource, "subagentsOf")}
   ${extractFunction(clientSource, "groupOf")}
   ${extractFunction(clientSource, "rowKey")}
   ${extractFunction(clientSource, "assess")}
   return { statusStateOf, ageOf, pendingWordOf, isSelected, subagentsOf, rowKey, assess };`,
)(SELECTOR, KNOWN_STATES, AGE_UNITS, PHASE);

const SETTINGS = {
  pinBusyWorkspaces: true,
  highlightRunningSessions: true,
  highlightBusyWorkspaceHeaders: true,
  notifyOnCompletion: true,
  intensity: 0.6,
  unreadHoldMinutes: 480,
  seenHoldMinutes: 15,
  staleRunMinutes: 360,
};

const MINUTE = 60 * 1000;

/**
 * A stand-in for one official session row: a status dot, a relative-time (or
 * pending) label, an optional selection, and an optional hidden subagent label.
 * Every field is mutable so a test can drive a row through a lifecycle.
 */
function makeRow(initial = {}) {
  const row = {
    dot: initial.dot ?? null,
    time: initial.time ?? null,
    selected: initial.selected ?? false,
    subagents: initial.subagents ?? null,
    key: initial.key ?? "session:1",
    className: "",
    getAttribute(name) {
      if (name === "data-row-key") return row.key;
      if (name === "aria-selected") return row.selected ? "true" : "false";
      return null;
    },
    querySelector(selector) {
      if (selector === SELECTOR.statusDot) {
        return row.dot === null ? null : { getAttribute: () => row.dot };
      }
      if (selector === SELECTOR.time) {
        return row.time === null ? null : { textContent: row.time };
      }
      if (selector === SELECTOR.leading) {
        return row.subagents === null
          ? null
          : { querySelectorAll: () => [{ textContent: row.subagents }] };
      }
      if (selector === SELECTOR.title) return { textContent: "" };
      return null;
    },
    closest() {
      return null;
    },
  };
  return row;
}

const assess = (row, now, memory = new Map(), settings = SETTINGS) =>
  sandbox.assess(row, now, memory, settings);

check("the displayed age is parsed in both shipped locales", () => {
  const cases = [
    ["刚刚", 0],
    ["9分钟", 9 * MINUTE],
    ["2小时", 2 * 60 * MINUTE],
    ["11天", 11 * 24 * 60 * MINUTE],
    ["3个月", 3 * 30 * 24 * 60 * MINUTE],
    ["1年", 365 * 24 * 60 * MINUTE],
    ["now", 0],
    ["9min", 9 * MINUTE],
    ["2h", 2 * 60 * MINUTE],
    ["11d", 11 * 24 * 60 * MINUTE],
    ["3mo", 3 * 30 * 24 * 60 * MINUTE],
    ["2y", 2 * 365 * 24 * 60 * MINUTE],
  ];
  for (const [label, expected] of cases) {
    assert.equal(sandbox.ageOf(makeRow({ dot: "done", time: label })), expected, `age of "${label}"`);
  }
});

check("a pending-interaction label is not mistaken for an age", () => {
  for (const label of ["待审批", "计划待审", "待回答", "Approval", ""]) {
    assert.equal(sandbox.ageOf(makeRow({ dot: "warning", time: label })), null, `age of "${label}"`);
  }
});

check("a foreign element carrying data-state is not read as the session status", () => {
  for (const foreign of ["error", "failed", "preparing", ""]) {
    assert.equal(sandbox.statusStateOf(makeRow({ dot: foreign, time: "1分钟" })), null, `state "${foreign}"`);
  }
  for (const known of ["ongoing", "warning", "done", "idle"]) {
    assert.equal(sandbox.statusStateOf(makeRow({ dot: known, time: "1分钟" })), known);
  }
});

check("waiting on the user outranks everything and is never age-gated", () => {
  const verdict = assess(makeRow({ dot: "warning", time: "待审批" }));
  assert.equal(verdict.phase, "pending");
  assert.equal(verdict.rank, 4, "waiting must sort above running");
  assert.equal(verdict.active, true);
  // The exact official kind is surfaced, so the badge can name the action.
  assert.equal(verdict.word, "待审批");
  assert.equal(assess(makeRow({ dot: "warning", time: "Approval" })).word, "Approval");
});

check("a genuinely running session is blue and promoted", () => {
  for (const label of ["刚刚", "1分钟", "10分钟", "5小时"]) {
    const verdict = assess(makeRow({ dot: "ongoing", time: label }));
    assert.equal(verdict.phase, "running", `running "${label}"`);
    assert.equal(verdict.rank, 3);
    assert.equal(verdict.active, true);
  }
});

check("a stale 'running' row is reported as interrupted but never promoted", () => {
  // Promoting it is what dragged days-old workspaces back to the top.
  for (const label of ["7小时", "2天", "11天"]) {
    const verdict = assess(makeRow({ dot: "ongoing", time: label }));
    assert.equal(verdict.mark, "interrupted", `stale "${label}"`);
    assert.equal(verdict.rank, 0, `stale "${label}" must not promote`);
    assert.equal(verdict.active, false);
  }
});

check("an unopened completion is promoted for the unread window", () => {
  for (const label of ["刚刚", "9分钟", "2小时", "7小时"]) {
    const verdict = assess(makeRow({ dot: "done", time: label }));
    assert.equal(verdict.phase, "unread", `completion "${label}"`);
    assert.equal(verdict.rank, 2);
    assert.equal(verdict.active, true, `completion "${label}" should still be promoted`);
  }
});

check("a completion from days ago is quiet again", () => {
  // `done` means "unread completion" and never expires on its own, so without
  // the window a week-old completion kept coming back as a notification.
  for (const label of ["9小时", "11天", "3个月"]) {
    const verdict = assess(makeRow({ dot: "done", time: label }));
    assert.equal(verdict.active, false, `completion "${label}" should not be promoted`);
    assert.equal(verdict.mark, null);
  }
});

check("THE FIX: opening a finished session does not drop it out of the band", () => {
  // Opening a session is what clears the Harness's `completionUnread` flag, so a
  // naive reading drops the row exactly as the user starts reading the result.
  const row = makeRow({ dot: "done", time: "刚刚", key: "session:fix" });
  const memory = new Map();
  let now = 1_000_000;

  const before = assess(row, now, memory);
  assert.equal(before.phase, "unread");
  assert.equal(before.active, true);

  // The user clicks it, and the flag clears.
  row.dot = "idle";
  row.selected = true;
  now += MINUTE;
  const opened = assess(row, now, memory);
  assert.equal(opened.phase, "seen");
  assert.equal(opened.active, true, "reading a result must not lose its place in the list");
  assert.equal(opened.mark, "seen");
  assert.equal(opened.rank, 1);
});

check("a row being read stays promoted however long the user reads", () => {
  const row = makeRow({ dot: "done", time: "刚刚", key: "session:read", selected: true });
  const memory = new Map();
  let now = 2_000_000;
  assess(row, now, memory); // unread, then the user opens it
  row.dot = "idle";

  for (const elapsed of [MINUTE, 30 * MINUTE, 3 * 60 * MINUTE, 12 * 60 * MINUTE]) {
    now += elapsed;
    const verdict = assess(row, now, memory);
    assert.equal(verdict.active, true, `still promoted after ${elapsed / MINUTE} minutes of reading`);
  }
});

check("the dwell only starts once the user moves on, then releases", () => {
  const row = makeRow({ dot: "done", time: "刚刚", key: "session:dwell", selected: true });
  const memory = new Map();
  let now = 3_000_000;
  assess(row, now, memory);
  row.dot = "idle";

  now += 4 * MINUTE;
  assess(row, now, memory); // still selected: the clock keeps restarting

  // The user clicks another session.
  row.selected = false;
  now += MINUTE;
  assert.equal(assess(row, now, memory).active, true, "a short dwell remains after leaving");

  now += 16 * MINUTE;
  const released = assess(row, now, memory);
  assert.equal(released.active, false, "and then the row releases");
  assert.equal(released.mark, null);
});

check("a completion opened elsewhere still gets its dwell", () => {
  // The user may acknowledge a completion without selecting it here; the dwell
  // must start at the acknowledgement, not at process start.
  const row = makeRow({ dot: "done", time: "刚刚", key: "session:elsewhere" });
  const memory = new Map();
  let now = 4_000_000;
  assess(row, now, memory);

  row.dot = "idle"; // cleared in another window, never selected here
  now += MINUTE;
  assert.equal(assess(row, now, memory).active, true, "the dwell starts when seen");

  now += 16 * MINUTE;
  assert.equal(assess(row, now, memory).active, false);
});

check("after a reload an already-opened completion stays quiet", () => {
  // Nothing is persisted, and nothing needs to be: the Harness already stores
  // the acknowledgement, so a page load sees a plain idle row.
  const reopened = assess(makeRow({ dot: "idle", time: "5分钟" }), 5_000_000, new Map());
  assert.equal(reopened.phase, "idle");
  assert.equal(reopened.active, false);
});

check("idle rows and rows without a dot are left alone", () => {
  assert.equal(assess(makeRow({ dot: "idle", time: "5天" })).active, false);
  assert.equal(assess(makeRow({ dot: null, time: "5天" })).active, false);
});

check("the running-subagent count is read from the official label", () => {
  const zh = assess(makeRow({ dot: "ongoing", time: "1分钟", subagents: "3 个子智能体运行中" }));
  assert.equal(zh.subagents, "3 子智能体");
  const en = assess(makeRow({ dot: "ongoing", time: "1m", subagents: "2 subagents running" }));
  assert.equal(en.subagents, "2 subagents");
  const one = assess(makeRow({ dot: "ongoing", time: "1m", subagents: "1 subagent running" }));
  assert.equal(one.subagents, "1 subagent");
  // No subagent label means no chip, and a non-running row never gets one.
  assert.equal(assess(makeRow({ dot: "ongoing", time: "1分钟" })).subagents, null);
  assert.equal(assess(makeRow({ dot: "done", time: "1分钟", subagents: "3 个子智能体运行中" })).subagents, null);
});

check("row identity prefers the official data-row-key", () => {
  assert.equal(sandbox.rowKey(makeRow({ key: "session:abc" })), "session:abc");
  assert.match(clientSource, /row\.getAttribute\("data-row-key"\)/);
});

check("the memory records a phase and a dwell clock per row", () => {
  const memory = new Map();
  const row = makeRow({ dot: "done", time: "刚刚", key: "session:mem" });
  assess(row, 6_000_000, memory);
  assert.deepEqual(memory.get("session:mem"), { phase: "unread", seenAt: 0 });
  // A long-lived tab must not accumulate state for rows that are gone.
  assert.match(clientSource, /if \(!seen\.has\(key\)\) memory\.delete\(key\)/);
  assert.match(clientSource, /if \(!seen\.has\(key\)\) settleWatch\.delete\(key\)/);
});

console.log("client: styling contract");

check("no hardcoded palette outside the documented fallbacks", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(css !== null, "stylesheet literal missing");
  const body = css[1];
  // Every colour literal must be the fallback of a custom-property definition.
  const definitions = [...body.matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm)];
  const allowed = new Set();
  for (const [, , value] of definitions) {
    for (const hex of value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) allowed.add(hex);
  }
  for (const keyword of ["transparent", "currentColor", "inherit"]) allowed.add(keyword);

  for (const [hex] of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    assert.ok(allowed.has(hex), `${hex} is not a custom-property fallback`);
  }
  assert.match(body, /--bw-running:\s*var\(--dsw-static-deepseek-450,\s*#[0-9a-fA-F]{6}\)/);
  assert.match(body, /--bw-settle:\s*var\(--dsw-alias-state-success-primary,\s*#[0-9a-fA-F]{6}\)/);
});

check("each phase takes its colour from the dot's own token", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const families = {
    running: "--dsw-static-deepseek-450",
    waiting: "--dsw-alias-state-warn-primary",
    done: "--dsw-alias-state-success-primary",
    interrupted: "--dsw-alias-state-error-primary",
  };
  for (const [name, token] of Object.entries(families)) {
    assert.match(css, new RegExp(`--bw-${name}:\\s*var\\(${token},`), `expected ${name} to use ${token}`);
  }
  // Every phase must route through the shared tone variable, so a phase cannot
  // be styled somewhere the others are not.
  for (const mark of ["running", "pending", "unread", "seen", "interrupted"]) {
    assert.ok(css.includes(`[data-busy-session="${mark}"]`), `expected a rule for the ${mark} phase`);
  }
});

check("the acknowledged completion is the same green, cooled down", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const seen = css.match(/\[data-busy-session="seen"\]\s*\{([^}]*)\}/)[1];
  assert.match(seen, /--bw-tone:\s*var\(--bw-done\)/, "seen must share the completion green");
  assert.match(seen, /--bw-fade:\s*0?\.\d+/, "seen must be visibly on its way out");
  // The fade has to actually reach the drawn marks.
  for (const mark of ["background", "box-shadow"]) {
    assert.ok(
      new RegExp(`var\\(--bw-fade\\)`).test(css.split(`[class*="_sessionRow"][data-busy-session] {`)[1].split("}")[0]),
      `the row ${mark} must be scaled by the fade`,
    );
  }
});

check("a header badge names the state in words", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  assert.match(css, /content: attr\(data-busy-label\)/);
  assert.match(css, /content: attr\(data-busy-count\)/);
  assert.match(clientSource, /pending: \{ mark: "pending", rank: 4, label: "待处理" \}/);
  assert.match(clientSource, /running: \{ mark: "running", rank: 3, label: "运行中" \}/);
  assert.match(clientSource, /unread: \{ mark: "unread", rank: 2, label: "已完成" \}/);
});

check("the badge counts the phase it names, not every phase combined", () => {
  // Summing across phases let a workspace with one running and one finishing
  // row claim "2 个运行中", which neither row says.
  assert.match(clientSource, /const word = dominant === "pending" && entry\.words\.size === 1/);
  assert.match(clientSource, /count: entry\.tally\.get\(dominant\)/);
  assert.match(clientSource, /PHASE\[phase\]\.rank > PHASE\[dominant\]\.rank/);
});

check("the promotion order follows the urgency order", () => {
  const ranks = { pending: PHASE.pending.rank, running: PHASE.running.rank, unread: PHASE.unread.rank, seen: PHASE.seen.rank };
  assert.ok(ranks.pending > ranks.running, "waiting must sort above running");
  assert.ok(ranks.running > ranks.unread, "running must sort above a completion");
  assert.ok(ranks.unread > ranks.seen, "an unread completion must sort above a seen one");
  assert.equal(PHASE.interrupted.rank, 0, "an interrupted run must not promote");
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  for (const rank of [1, 2, 3, 4]) {
    assert.ok(css.includes(`> [data-busy-rank="${rank}"] { order: -${rank}; }`), `expected an order rule for rank ${rank}`);
  }
});

check("selection is its own hue, and never inherits the status tone", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];

  // A selected row must not be painted from --bw-tone: that is exactly what made
  // a selected-and-running row indistinguishable from a plain running one.
  const selectedRules = [...css.matchAll(/\[class\*="_sessionRow"\]\[class\*="_selected"\][^{]*\{([^}]*)\}/g)];
  assert.ok(selectedRules.length >= 2, "expected a selected surface and a selected hover rule");
  for (const [, body] of selectedRules) {
    assert.ok(!/--bw-tone/.test(body), "a selected row must not be drawn from the status tone");
  }

  // Both the surface and the ring come from the selection family, at the same
  // weights a status row uses for its own tone — a saturated hue as a pale tint,
  // not a neutral wash.
  assert.match(selectedRules[0][1], /background:\s*color-mix\(\s*in srgb,\s*var\(--bw-selection\) calc\(var\(--bw-fill-alpha\) \* 100%\)/);
  assert.match(selectedRules[0][1], /box-shadow:\s*inset 0 0 0 1px var\(--bw-selection-ring\)/);

  // The family must be a chromatic hue composed from the theme, not the dark
  // selection neutral the first attempt used (which read as a grey block).
  const selection = css.match(/--bw-selection:\s*([^;]+);/)[1];
  assert.match(selection, /color-mix\(in srgb, var\(--bw-running\)/, "selection must be composed from a theme hue");
  assert.ok(
    !/interactive-bg-hover-accent/.test(selection),
    "the neutral selection wash is what made the row look grey",
  );
  assert.match(css, /--bw-selection-ring:\s*color-mix\(in srgb, var\(--bw-selection\)/);
});

check("selection outranks every status treatment, including on hover", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const indexOf = (needle) => css.indexOf(needle);
  // Equal specificity everywhere (2 attribute selectors, 3 with :hover), so
  // source order is what decides: selection must come last to win.
  const marked = indexOf('[class*="_sessionRow"][data-busy-session] {');
  const markedHover = indexOf('[class*="_sessionRow"][data-busy-session]:hover');
  const selected = indexOf('[class*="_sessionRow"][class*="_selected"] {');
  const selectedHover = indexOf('[class*="_sessionRow"][class*="_selected"]:hover');
  assert.ok(marked >= 0 && selected >= 0, "expected both families to be declared");
  assert.ok(selected > marked, "the selection surface must come after the status surface");
  assert.ok(selectedHover > markedHover, "the selection hover must come after the status hover");
});

check("a selected row is still identifiable as running", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  // Selection owns the surface, so the status has to survive on the bar and the
  // title — those rules are not scoped away by the selection rules.
  assert.match(css, /\[class\*="_sessionRow"\]\[data-busy-session\]::before\s*\{[\s\S]*?background:\s*var\(--bw-tone\)/);
  assert.match(css, /\[class\*="_sessionRow"\]\[data-busy-session\] \[class\*="_title"\]\s*\{[\s\S]*?var\(--bw-tone\) var\(--bw-title-mix\)/);
});

check("the marked row is drawn by a solid bar, not only a tint", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const bar = css.match(/\[class\*="_sessionRow"\]\[data-busy-session\]::before\s*\{([^}]*)\}/);
  assert.ok(bar !== null, "expected a leading bar shared by every phase");
  assert.match(bar[1], /background:\s*var\(--bw-tone\)/);
  assert.match(bar[1], /position:\s*absolute/);
  assert.match(bar[1], /width:\s*var\(--bw-bar-width\)/);
});

check("only a live run animates", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const animated = ["running", "pending", "unread", "seen", "interrupted"].filter((mark) => {
    const marker = `[data-busy-session="${mark}"]::before`;
    const block = css.split(marker)[1];
    return block !== undefined && block.slice(0, block.indexOf("}")).includes("animation:");
  });
  assert.deepEqual(animated, ["running"], `animated phases: ${animated.join(",")}`);
});

check("the running frame is drawn without changing the box model", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const runningBlock = css.split('data-busy-session="running"]')[1] ?? "";
  assert.ok(runningBlock.includes("box-shadow"), "expected an inset ring");
  assert.ok(!/border:\s*1px/.test(runningBlock), "a border would shift layout");
});

check("the running fill stays a tint rather than a block", () => {
  const css = clientSource.match(/const CSS = `([\s\S]*?)`;/)[1];
  const fill = css.match(/--bw-fill-alpha:\s*calc\(var\(--bw-intensity\)\s*\*\s*([\d.]+)(%?)\)/);
  assert.ok(fill !== null, "expected a fill alpha definition");
  const alpha = fill[2] === "%" ? Number(fill[1]) / 100 : Number(fill[1]);
  assert.ok(alpha > 0.08, `fill alpha ${alpha} is too faint to read as a signal`);
  assert.ok(alpha <= 0.2, `fill alpha ${alpha} would read as a saturated block`);
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
  assert.ok(!filter[1].includes("data-busy"), "the observer must not watch its own writes");
});

check("paint work is coalesced per frame", () => {
  assert.match(clientSource, /requestAnimationFrame\(run\)/);
  assert.match(clientSource, /if \(scheduled\) return/);
});

check("attribute writes are guarded by a change check", () => {
  assert.match(clientSource, /function setAttr\(element, attribute, value\) \{\s*if \(element\.getAttribute\(attribute\) !== value\)/);
  assert.match(clientSource, /function dropAttr\(element, attribute\) \{\s*if \(element\.hasAttribute\(attribute\)\)/);
  assert.ok(
    !/setAttribute\((?:BUSY_ATTR|RANK_ATTR|MARK_ATTR|LIST_ATTR)/.test(clientSource),
    "a marked attribute is written without a change check",
  );
});

check("time-derived marks can expire without a DOM change", () => {
  // A retained row goes quiet because time passed, not because React rendered.
  assert.match(clientSource, /setInterval\(schedule, 60 \* 1000\)/);
  assert.match(clientSource, /clearInterval\(tick\)/);
});

check("the settle attribute is cleared even without an animationend", () => {
  assert.match(clientSource, /addEventListener\("animationend", clear/);
  assert.match(clientSource, /setTimeout\(clear, 1400\)/);
});

check("a disconnected observer leaves nothing behind", () => {
  assert.match(clientSource, /observer\.disconnect\(\)/);
  assert.match(clientSource, /window\.removeEventListener\("focus", onFocus\)/);
  assert.match(clientSource, /disposeStyle\(\)/);
  assert.match(clientSource, /memory\.clear\(\)/);
  assert.match(clientSource, /settleWatch\.clear\(\)/);
});

check("a settings fetch failure cannot break the host UI", () => {
  assert.match(clientSource, /catch \{\s*\/\* defaults already applied \*\/\s*\}/);
});

check("a paint failure is contained", () => {
  assert.match(clientSource, /catch \{\s*\/\/ A paint failure must never break the host UI/);
});

console.log("");
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
