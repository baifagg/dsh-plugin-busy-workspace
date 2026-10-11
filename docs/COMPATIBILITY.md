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
0.1.0–0.1.4 deliberately excluded, because the contracts in §4 were not all
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

## 2. Released versions

Every `@deepseek-ai/dsh` release so far is a **prerelease**; there is no stable
0.x to target. Measured on 2026-10-11: `latest` and `next` both point at
`0.2.0-rc.2`, `alpha` at `0.2.1-alpha.2`.

| Released | Version | | Released | Version |
| --- | --- | --- | --- | --- |
| 2026-08-10 | `0.0.1-rc.1` | | 2026-09-10 | `0.1.5-rc.1` |
| 2026-08-11 | `0.0.1-rc.2` | | 2026-09-10 | `0.1.5-rc.2` |
| 2026-08-12 | `0.0.1-rc.5` | | 2026-09-15 | `0.1.6-alpha.1` |
| 2026-08-13 | `0.1.0-rc.2` | | 2026-09-17 | `0.1.6-alpha.2` |
| 2026-08-13 | `0.1.0-rc.3` | | 2026-09-22 | `0.1.5-rc.3` |
| 2026-08-13 | `0.1.0-rc.6` | | 2026-09-22 | `0.1.7-alpha.1` |
| 2026-08-17 | `0.1.0-rc.7` | | 2026-09-22 | `0.1.7-alpha.2` |
| 2026-08-19 | `0.1.0-rc.8` | | 2026-09-23 | `0.1.7-rc.1` |
| 2026-08-21 | `0.1.1-rc.1` | | 2026-09-24 | `0.1.7-rc.2` |
| 2026-08-21 | `0.1.1-rc.2` | | 2026-09-28 | `0.2.0-rc.1` |
| 2026-08-30 | `0.1.2-alpha.2` | | 2026-09-29 | `0.2.0-rc.2` |
| 2026-08-31 | `0.1.2-alpha.3` | | 2026-10-03 | `0.2.1-alpha.1` |
| 2026-09-01 | `0.1.2-alpha.4` | | 2026-10-09 | `0.2.1-alpha.2` |
| 2026-09-02 | `0.1.2-alpha.5` | | | |
| 2026-09-03 | `0.1.2-rc.1` | | | |
| 2026-09-07 | `0.1.3-alpha.2` | | | |
| 2026-09-08 | `0.1.5-alpha.1` | | | |
| 2026-09-09 | `0.1.5-alpha.2` | | | |

(31 versions; source: the npm packument for `@deepseek-ai/dsh`.)

Four things worth knowing before reading that table:

- **No stable release exists.** All 31 versions carry a prerelease tag, which is
  the root cause of the whole `||`-branch business in §1: a range with no
  prerelease comparator matches none of them — not even `*`.
- **`0.1.4` was never released**, and `0.1.3` shipped as alpha only. Version
  numbers are not consecutive releases.
- **Publication order is not version order.** `0.1.5-rc.3` was published on
  2026-09-22, five days *after* `0.1.6-alpha.2` (2026-09-17) — a backfill. Do
  not read "published last" as "newest".
- **The plugin-facing version is the running `@deepseek-ai/dsh-app-boot`**, not
  any `@deepseek-ai/dsh-client-ui-*` subpackage. Those subpackages carry their
  own, often stale npm dist-tags — `@deepseek-ai/dsh-client-ui-workspace` still
  points `latest` at `0.0.1-rc.1` while the current line lives on `next` — so a
  client subpackage must never be pinned with `*` or `latest`.

The harness starts **enforcing** the peer declaration at `0.1.7-rc.1`: the
package that implements the check contains no `evaluatePluginCompatibility` at
`0.1.5-rc.3` or `0.1.6-alpha.2`, and does from `0.1.7-rc.1` on. Below that line
the declared range is a statement of intent rather than a gate — the plugin loads
whatever it is handed.

## 3. How the harness decides

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
  plugin is a read-and-decorate observer (see §6), so on an unlisted line the
  realistic failure is that marks stop appearing — but the harness cannot know
  that, and the warning is correct as a default.

## 4. What this plugin actually depends on

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

### Where those contracts come from, and since when

- The status dot is `StateDot` from `@deepseek-ai/dsh-client-ui-primitives`, and
  its `data-state` attribute is present from `0.1.5-rc.1` on (verified by
  unpacking that version's tarball and finding the attribute in four files).
- The 16px cell that dot occupies can instead hold a
  `sidebar.session.row.leading` occupant contributed by another plugin. That seat
  first appears in `@deepseek-ai/dsh-client-ui-workspace@0.1.7-rc.2` (absent in
  `0.1.5-rc.1` and `0.1.7-rc.1`), and the seat's own documentation says it is
  mounted only by a row whose primary state is `idle`, so an occupant never
  renders beside a status dot. **This plugin does not occupy that seat** — it has
  no slot registration at all, only a `MutationObserver` — it just reads the dot.
  The seat's arrival is a neighbour changing the cell, not a dependency of ours.
- The seven theme tokens in the table are defined by
  `@deepseek-ai/dsh-client-ui-theme`'s design platform, and all of them are
  present in `0.1.5-rc.1` as well. They are consumed with literal fallbacks
  regardless.

## 5. Verification status per release line

"Supported" below is a claim about the declared range. What differs between the
lines is how much has actually been run.

| Harness line | Declared | Verified how |
| --- | --- | --- |
| `0.0.1` – `0.1.4` | excluded | — (the range deliberately starts later) |
| `0.1.5-alpha.1`, `0.1.5-alpha.2` | excluded | — (predate `rc.1`) |
| `0.1.5-rc.1` – `0.1.5-rc.3` | supported | contract inspection (the status dot and the theme tokens are already there in `0.1.5-rc.1`) + offline contract suite. The line the 1.0.0 revision was written against; not exercised live for 1.1.0. No harness-side gate exists on this line |
| `0.1.6-alpha.1`, `0.1.6-alpha.2` | supported | contract inspection + offline contract suite; still no harness-side gate |
| `0.1.7-alpha.1`, `0.1.7-alpha.2` | supported | contract inspection + offline contract suite; no gate yet on this line either |
| `0.1.7-rc.1` | supported | gate check + offline contract suite. **Peer enforcement begins here** |
| `0.1.7-rc.2` | supported | gate check + offline contract suite; the `sidebar.session.row.leading` seat appears here, which changes the leading cell of an *idle* row only |
| `0.2.0-rc.1`, `0.2.0-rc.2` | supported | **end-to-end**: 1.1.0 is loaded and observed in a real Web GUI on `0.2.0-rc.2`, with both halves byte-identical to this tree |
| `0.2.1-alpha.1`, `0.2.1-alpha.2` | supported | gate check + offline contract suite |
| `0.3.0` and later | not declared | the harness refuses the bundle and prints the `allow-version` command |

Evidence levels, honestly stated:

- **End-to-end** means the plugin was loaded by a running harness and its marks
  were observed on real session rows. This is the only level that proves the DOM
  contracts in §4 still match, and today it covers `0.2.0-rc.2`.
- **Gate check** means the manifest was evaluated with the harness's own
  `evaluatePluginCompatibility()` at that runtime version, so the version will
  *load* rather than be refused. It says nothing about the DOM.
- **Contract inspection** means the official package named in §4 was unpacked at
  that version and the attribute, token or seat was looked for directly. It
  proves the contract exists there; it does not prove this plugin renders
  correctly against it.
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

## 6. What happens on a line that is not listed

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

## 7. Adding a release line

For a new line `0.X.Y-<tag>`:

1. Append a branch to both ranges in `package.json`:
   `|| >=0.X.Y-alpha.1 <0.X.(Y+1)-0` for a new minor/patch line — the branch must
   carry a prerelease tag of its own, or plain semver will not match anything on
   that tuple.
2. Run the gate check (§5) for the new version and for the previous ceiling.
3. Run `npm test`, and load the plugin in a real GUI on that line if you can;
   record which of the three evidence levels you reached in §5.
4. Note the change in `CHANGELOG.md` under `### Compatibility`.

Raising the floor or removing a line is a breaking change for anyone below it
and needs a major version bump of this plugin.
