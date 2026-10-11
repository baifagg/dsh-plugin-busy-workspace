# DeepSeek Harness version support

Which DeepSeek Harness (`dsh`) releases this plugin runs on, how the harness
decides that for itself, what the plugin actually depends on, and what to do
when a release line is not listed yet.

中文版：[COMPATIBILITY.zh.md](COMPATIBILITY.zh.md)

---

## 1. The declared range

`package.json` states the requirement twice, because two different readers look
at it. Both carry the same range:

```jsonc
{
  "dsh": {
    "engines": {
      // Read by dsh-market's storefront, which combines it with the peers below.
      "dsh": ">=0.1.5-rc.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 || >=0.1.7-alpha.1 <0.2.0-0 || >=0.2.0-alpha.1 <0.2.1-0 || >=0.2.1-alpha.1 <0.3.0-0"
    }
  },
  "peerDependencies": {
    // Read by the harness itself, before the plugin is imported.
    "@deepseek-ai/dsh": ">=0.1.5-rc.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 || >=0.1.7-alpha.1 <0.2.0-0 || >=0.2.0-alpha.1 <0.2.1-0 || >=0.2.1-alpha.1 <0.3.0-0"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh": { "optional": true }
  }
}
```

Plain reading: **0.1.5-rc.1 and later, up to but not including 0.3.0** — with
0.1.0–0.1.4 deliberately excluded, because the contracts in §3 were not all
present before the 0.1.5 line.

### Why the range is written as `||` branches instead of one `>= … < …`

Because a prerelease only satisfies a range under plain semver when *some*
comparator in that range shares the version's exact `major.minor.patch` tuple
and itself carries a prerelease tag. So a range that reads perfectly well —

```
>=0.1.5-rc.1 <0.3.0-0        // ❌ excludes 0.1.6-*, 0.1.7-*, 0.2.*-*
```

— resolves to `false` for `0.1.7-rc.2` under a plain semver evaluator (the one
`pnpm` uses against a registry package), while the harness's own check accepts
it. One branch per release line, each carrying a prerelease tag, makes both
evaluators agree:

| Runtime version | Harness gate¹ | Storefront² | Plain semver³ |
| --- | --- | --- | --- |
| `0.1.4-rc.1` | incompatible | incompatible | `false` |
| `0.1.5-alpha.2` | incompatible | incompatible | `false` |
| `0.1.5-rc.1` | compatible | compatible | `true` |
| `0.1.5-rc.3` | compatible | compatible | `true` |
| `0.1.6-alpha.1` | compatible | compatible | `true` |
| `0.1.7-alpha.2` | compatible | compatible | `true` |
| `0.1.7-rc.1` | compatible | compatible | `true` |
| `0.1.7-rc.2` | compatible | compatible | `true` |
| `0.2.0-rc.1` | compatible | compatible | `true` |
| `0.2.0-rc.2` | compatible | compatible | `true` |
| `0.2.1-alpha.1` | compatible | compatible | `true` |
| `0.2.1-alpha.2` | compatible | compatible | `true` |
| `0.3.0-rc.1` | incompatible | incompatible | `false` |

¹ `evaluatePluginCompatibility()` from `@deepseek-ai/dsh-app-boot`, called with
an empty exemption table and the runtime version in column 1.
² `deriveHostCompatibility()` from `dshmarket/lib/discovery-compatibility.js`,
given the parsed manifest facts and a host package set containing
`@deepseek-ai/dsh`.
³ `semver.satisfies(version, range)` with default options — what `pnpm`
evaluates for a registry install.

The one case where ¹ and ³ can still disagree is a *future* patch line inside an
already-listed minor (a hypothetical `0.2.2-rc.1`): the harness accepts it,
plain semver does not, because no comparator carries that tuple yet. The
harness's verdict is the one that decides whether the plugin loads; the plain
semver verdict would at worst print a peer warning during a registry install.

## 2. How the harness decides

DeepSeek Harness gates plugins itself. The exact mechanism, as implemented in
`@deepseek-ai/dsh-app-boot`:

- **What is compared.** Every entry of `peerDependencies` whose name is
  `@deepseek-ai/dsh` or starts with `@deepseek-ai/dsh-`. Plugins that declare no
  such peer are not gated at all — "missing DSH peers impose no constraint" —
  which is the usual reason a plugin silently keeps loading on a harness it was
  never written for. Declaring one is what turns a wish into a check.
- **Against what.** `getDshRuntimeVersion()` — the version of the running
  `@deepseek-ai/dsh-app-boot` package, i.e. one version for the whole process,
  not one per package.
- **With which semantics.** `semver.satisfies(runtimeVersion, range,
  { includePrerelease: true })`. Prereleases participate in range matching;
  an empty or invalid range counts as *incompatible*.
- **`engines.dsh` is not read by the harness.** The harness uses peer
  declarations only. (`dsh-market`'s storefront does read `engines.dsh` — both
  the top-level field and `dsh.engines.dsh` — and combines every declaration it
  finds conjunctively, which is why this plugin fills both in with the same
  range rather than letting them drift.)
- **What a refusal looks like.** The bundle is skipped like an unreadable one
  and listed in the profile's `skippedBundles`; the launcher prints the package,
  the versions and the risk. Nothing is rewritten in your profile.
- **The escape hatch.** An exact `package@version` can be allowed for an exact
  runtime version, stored in the profile's `compatibility.json`:

  ```sh
  dsh plugin --profile web allow-version dsh-plugin-busy-workspace@1.1.0 \
    --dsh-version 0.2.0-rc.2 --accept-risk
  dsh plugin --profile web version-exemptions   # list what is granted
  ```

  A grant does not survive a plugin upgrade or a harness upgrade, and DSH warns
  before saving one: an incompatible plugin may crash or corrupt data. This
  plugin is a read-and-decorate observer (see §5), so on an unlisted line the
  realistic failure is that marks stop appearing — but the harness cannot know
  that, and the warning is correct as a default.

## 3. What this plugin actually depends on

Every item below is a contract with the harness. If one changes, the matching
feature degrades to "no mark" rather than to an error — nothing here mutates
session data, session order, or another plugin's nodes.

| Contract | Used for | Sensitivity |
| --- | --- | --- |
| `data-state` on a session row's status dot, values `warning` / `ongoing` / `done` / `idle` | the whole attention model | **High** — absent or renamed, nothing is marked. The lookup also requires the primitive's own `aria-hidden="true"` and filters to those four values, so a foreign `data-state` in the same cell is not misread |
| `[class*="_sessionRow"]`, `[class*="_groupSection"]`, `[class*="_projectRow"]`, `[class*="_title"]`, `[class*="_slot"]`, `[class*="_visuallyHidden"]`, `[class*="_time"]` | finding rows, groups and labels | **High** — matched by the stable suffix of build-hashed CSS-module names; a rename on either side stops the match |
| `aria-selected` on the session row | "you are reading this row", which is what keeps a `seen` completion promoted | Medium — without it, a `seen` row lives for `seenHoldMinutes` instead of while selected |
| the row's relative-time label, as a direct child, in the shipped locale | every age decision (`unreadHoldMinutes`, `seenHoldMinutes`, `staleRunMinutes`) | Medium — an unparsable label makes an age-based decision fall back to "no age", which keeps `warning` and `unread` promoted and never invents an `interrupted` |
| the hidden status label inside the row's leading cell (`子智能体` / `subagent(s)`, `待审批` / `Approval`, …) | the subagent chip and the workspace badge wording | Low — absent, the chip and the word are simply not drawn |
| `window.__ModuleLoader__.load({ id, factory })` + `dsh.client.platform: "web"` | loading the client half at all | **High** — this is the documented client-bundle contract; if it changed, the bundle would not execute |
| `ctx.get("webServer").route(path, handler)` | serving `GET/POST /busy-workspace/api/settings` | Low — the route is optional by design; without it the client half uses its built-in defaults |
| `--dsw-alias-*` / `--dsw-static-*` theme tokens | every colour, always with a literal fallback | Low — the fallbacks keep the plugin readable on a theme that defines fewer tokens |

Nothing else is assumed: no React component, no store, no internal module, no
class name in full, and no ARIA role for the list container. (An earlier version
did scope itself to `[class*="_list"][role="tree"]`; the official sidebar renders
no `role="tree"`, and both promotion and header tinting silently never ran. The
list is now reached structurally, as the groups' parent element.)

## 4. Verification status per release line

"Supported" below is a claim about the declared range. What differs between the
lines is how much has actually been run.

| Harness line | Declared | Verified how |
| --- | --- | --- |
| `0.1.0` – `0.1.4` | excluded | — (the range deliberately starts later) |
| `0.1.5-rc.1` – `0.1.5-rc.3` | supported | gate check + the offline contract suite (59 checks); the line the 1.0.0 revision was written against. Not re-run in a live GUI for 1.1.0 |
| `0.1.6-alpha.1` | supported | gate check + offline contract suite |
| `0.1.7-alpha.1` – `0.1.7-rc.2` | supported | gate check + offline contract suite |
| `0.2.0-rc.1`, `0.2.0-rc.2` | supported | **end-to-end**: 1.1.0 is loaded and observed in a real Web GUI on `0.2.0-rc.2`, with both halves byte-identical to this tree |
| `0.2.1-alpha.1`, `0.2.1-alpha.2` | supported | gate check + offline contract suite |
| `0.3.0` and later | not declared | the harness refuses the bundle and prints the `allow-version` command |

Evidence levels, honestly stated:

- **End-to-end** means the plugin was loaded by a running harness and its marks
  were observed on real session rows. This is the only level that proves the DOM
  contracts in §3 still match, and today it covers `0.2.0-rc.2`.
- **Gate check** means the manifest was evaluated with the harness's own
  `evaluatePluginCompatibility()` at that runtime version, so the version will
  *load* rather than be refused. It says nothing about the DOM.
- **Offline contract suite** is `npm test`: 59 checks that lift the plugin's own
  functions out of `lib/client.js` and run them against synthetic rows, plus a
  real-DOM paint pass. It needs no harness and no browser, and it is what
  catches a regression in the model. It cannot catch a rename inside the
  harness.

### Reproducing the gate check

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
const boot = await import("@deepseek-ai/dsh-app-boot");
const manifest = JSON.parse(readFileSync("./package.json", "utf8"));
for (const v of ["0.1.4-rc.1", "0.1.5-rc.1", "0.1.7-rc.2", "0.2.0-rc.2", "0.3.0-rc.1"]) {
  const refused = boot.evaluatePluginCompatibility(manifest, {}, v);
  console.log(v, refused === undefined ? "compatible" : "REFUSED " + JSON.stringify(refused.peers));
}'
```

## 5. What happens on a line that is not listed

Nothing catastrophic, by construction:

- The client half is a `MutationObserver` plus one injected `<style>` element. It
  writes only its own `data-busy-*` attributes onto existing nodes and never
  appends, removes or reorders DOM nodes — promotion is CSS `order`, so the
  renderer's own reconciliation is never fought.
- A paint failure is caught per pass (`a paint failure is contained`), and the
  settings fetch is allowed to fail (`a settings fetch failure cannot break the
  host UI`). Both are asserted by the test suite rather than asserted in prose.
- The Host half owns one JSON file and one optional route. It reads no session
  state and touches no other plugin's storage.
- If the sidebar is not rendered at all — a composition without the Web surface
  — the observer has nothing to watch and the plugin is inert.

So the failure mode to expect from an unrecognised harness is **silence**: the
sidebar looks stock. That is exactly why the range is declared rather than left
open: an unlisted line is refused loudly, with a command that lets you proceed
deliberately, instead of a plugin that keeps loading and quietly does nothing.

If you do run an unlisted line and want it listed, the useful report is:

1. `dsh --version` (or the desktop app's version) and the profile's
   `skippedBundles` entry, if there is one;
2. whether session rows carry a status dot with `data-state`, and which values
   appear — the four official ones are `warning`, `ongoing`, `done`, `idle`;
3. whether the sidebar's group and row elements still end in `_groupSection`,
   `_projectRow` and `_sessionRow`;
4. whether the row's relative-time label is still a direct child of the row.

## 6. Adding a release line

For a new line `0.X.Y-<tag>`:

1. Append a branch to both ranges in `package.json`:
   `|| >=0.X.Y-alpha.1 <0.X.(Y+1)-0` for a new minor/patch line — the branch must
   carry a prerelease tag of its own, or plain semver will not match anything on
   that tuple.
2. Run the gate check (§4) for the new version and for the previous ceiling.
3. Run `npm test`, and load the plugin in a real GUI on that line if you can;
   record which of the three evidence levels you reached in §4.
4. Note the change in `CHANGELOG.md` under `### Compatibility`.

Raising the floor or removing a line is a breaking change for anyone below it
and needs a major version bump of this plugin.
