# dsh-plugin-busy-workspace

**Shows which workspace is working, in the sidebar.**

A DeepSeek Harness (`dsh`) Web GUI plugin that highlights running sessions and pins busy workspaces to the top of the sidebar.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4d6bfe.svg)](https://github.com/topics/dsh-plugin)
[![theme aware](https://img.shields.io/badge/theme-adaptive-16a34a.svg)](#theme-adaptive-by-design)

---

![Five attention phases in one list, ranked: waiting, running, finished-unread, seen, and a quiet run marked but not promoted](assets/screenshot-1.png)

*One list, five phases, ranked by urgency: waiting (amber) first, then running (blue, carrying its subagent chip), then finished-unread (green), then seen — the selected row, in the plugin's own violet — and last a run that went quiet (red), marked but deliberately not promoted. Every bar, tint, ring and badge here is the plugin's own CSS, driven by its own `paint()` over real `data-state` values. The list contents are a fixture and the workspace names are blurred, because a sidebar's real contents are per-installation; regenerate with `node scripts/capture-screenshots.mjs`.*

---

## The problem

If you run more than one agent at a time, the `dsh` sidebar becomes a wall of look-alike rows. Every workspace header renders identically, every session row renders identically, and the only signal that something is running is a ten-pixel dot you have to hunt for.

The result is a set of real, recurring failures:

| What happens | What it costs you |
| --- | --- |
| You cannot tell which workspace has an agent mid-task | You open workspaces one by one to check, or you interrupt a session that was already working |
| Busy workspaces drift down the list as you touch others | The thing you actually care about is the thing you have to scroll to find |
| A session finishes and nothing tells you | You wait on a task that already ended, or you miss the moment to review its output |
| The status dot is the only cue, and it is tiny, grey, and low-contrast | You cannot read the sidebar from a step back or on a small display |

Existing themes and skins restyle the whole interface but none of them answer the one question that matters during parallel work: **which one is running right now?**

## What this plugin does

It answers two different questions: **what is moving right now**, and **where did the thing I started go**. Conflating them is what produced the worst defect in its earlier versions — see "a completion stays findable" below.

### 1. Promoted to the top, in order of urgency

Workspaces holding an active session rise to the top of the list, **sorted by urgency**: waiting on you first, then running, then unopened completions, then ones you have already read. With three workspaces in flight, the first one is always the one blocked on you.

The move is presentational only — your manually dragged workspace order is never rewritten, so when the work stops the list quietly returns to the order you set.

### 2. Five attention phases, five visual weights

Each session row is coloured by its **attention phase**, and every colour is the exact token that row's own status dot paints itself with, so a row and its dot can never disagree:

| Phase | Entered when | Colour | Promoted |
| --- | --- | --- | --- |
| Waiting | `warning`: your approval, plan review, or answer | amber | yes, **first** |
| Running | `ongoing`, recently active | blue | yes |
| Finished (unread) | `done`: it finished and you have not opened it | green | yes, held 8 hours |
| Seen | you opened it and read the result | green, **faded** | yes, while selected, then 15 minutes |
| Interrupted | claims running, silent for over 6 hours | red | **no**, marked only |

Each marked row gets a solid 3px bar on its leading edge, a tinted surface and ring in the same family, and a weighted, coloured title. Only a live run moves; every other phase is still, because a throbbing red row reads as an alarm rather than a report.

**The three "waiting on you" kinds share one amber.** They are all the same situation — blocked on the user — and splitting them into three hues would only make the palette something to re-learn. They are told apart by **word**: the badge shows the official 待审批 / 计划待审 / 待回答 (or Approval / Plan review / Answer) rather than a vague "needs you". Likewise, **subagents are not a colour but a count**: the Harness renders "3 subagents running" as a hidden label, and the plugin turns it into a small chip on the running row.

### 3. A completion stays findable (the worst earlier defect)

The official `done` means `completionUnread` — **finished, and you have not opened it** — and that flag clears the instant you open the session. Read naively, that produces an absurd result: **the moment you click the row to read the result, it disappears from the promoted band. The row you are reading jumps away.**

So the plugin's rule is: **promotion decays, it does not snap.**

- Opening a finished session only turns "unread" into "seen" — **it stays promoted**;
- for as long as you are **still sitting on that row** it stays, however long you read;
- the 15-minute dwell only starts once you move the selection elsewhere.
- An unopened completion is held for 8 hours — long enough to leave for lunch and come back, short enough that yesterday's work stops nagging.

**A reload does not lose it.** None of this needs persisting: the Harness already stores whether you looked. After a reload a still-unopened completion is still `done` and is held by age, and one you opened is `idle` and stays quiet.

### 4. You see the moment a session finishes

When a session stops running, its row plays one short green settle pulse and then returns to normal. You learn that a task completed without watching it.

## Theme-adaptive by design

![The same five phases under the default dark theme](assets/screenshot-2.png)

*The same stylesheet on the default dark theme. Nothing is restated for it and nothing has to be kept in sync, because the plugin defines no colours of its own.*

Every colour is read from the active theme's own `--dsw-alias-*` / `--dsw-static-*` tokens. Nothing is hardcoded, which means one stylesheet works across the built-in light and dark themes and across community theme packs (Catppuccin, Nord, Dracula, Tokyo Night, Gruvbox, and any other theme that defines the standard token set).

| Role | Token |
| --- | --- |
| Running (the `ongoing` dot's colour) | `--dsw-static-deepseek-450` |
| Waiting (the `warning` dot's colour) | `--dsw-alias-state-warn-primary` |
| Finished / seen (the `done` dot's colour) | `--dsw-alias-state-success-primary` |
| Interrupted | `--dsw-alias-state-error-primary` |
| **Selected** (its own fifth hue, a violet) | mixed from `--bw-running` and `--bw-interrupted` |
| Row title | `--dsw-alias-label-primary` |

Each phase declares `--bw-tone` once and every other rule is written against that variable, so the five status weights cannot drift apart. Sharing the dot's tokens is also what keeps the plugin inside the theme's own vocabulary: a theme that retunes a dot retunes the matching highlight with it.

The seen phase is **the same green**, with `--bw-fade` set to 0.42 — it is not another state, it is the same completion on its way out.

Transparency is composed with `color-mix()` against the theme's own surface, so the tint sits correctly on light and dark backgrounds alike. In the default themes the running token resolves to `#5686fe` on light and a lighter blue on dark, without the plugin knowing either value.

### Selection is its own hue, and borrows no status colour

**This is what fixed "the selected row looks like a running row".** The selected row used to keep the official 6% neutral surface but still draw its **ring in the status colour**, while that same status colour also tinted the bar and the title — so a row that was both selected and running was blue in all three channels and read as just another running row.

Selection now has its own hue, and it is handled **exactly the way the four statuses are**: a saturated colour laid down as a pale tint at the same weight (`--bw-fill-alpha`), with a ring in the same hue. Only the hue differs. The status keeps the **leading bar** and the **title colour**, which is what those two were always for:

| Row | Surface | Ring | Leading bar |
| --- | --- | --- | --- |
| Running · selected | violet 9.6% | violet | blue |
| Running · not selected | blue 9.6% | blue | blue |
| Idle · selected | violet 9.6% | violet | none |

Selection therefore looks the same whatever the row underneath is doing — running, waiting, finished or plain. Measured: selection resolves to `rgb(126,92,187)` (a violet), at a distance of 84 from running `rgb(77,107,254)`, 191 from waiting, 163 from finished and 157 from interrupted.

**Why a mixed violet?** Because the Harness palette has exactly six hue families (amber, blue, deepseek, green, neutral, red), the four statuses already occupy four, and there is no fifth hue to take; `--dsw-alias-brand-primary` resolves to near-black or near-white, not to a hue. So selection is mixed from two of the theme's own bright tokens (the running blue and the failure red, at roughly 2:1), which lands it on a violet that is **by construction none of the four status hues** while still following the theme instead of pinning a literal.

To use a different hue, override the two variables — no rule needs to change:

```css
--bw-selection: #d946a8;              /* any hue you like */
--bw-selection-ring: color-mix(in srgb, var(--bw-selection) 52%, transparent);
```

If the selected row should be louder, raise the `100%` multiplier on `--bw-fill-alpha` in the selection rules; the default deliberately matches the status weight so it cannot out-shout a status.

The fill is deliberately only a backing: the signal is carried by things that have a shape — the 3px solid bar, and the header badge that names the state in words. An earlier version expressed "running" mostly as a blue title, but the official row title is already blue, so that signal did not exist.

## Install

```sh
dsh plugin --profile web add dsh-plugin-busy-workspace
```

That is the whole command. It is published on npm, and no build step runs —
`lib/` ships built, there are no runtime dependencies, and the only official
package involved is a peer the profile already provides.

Prefer not to go through npm? The same package installs from the repository or
from the prebuilt tarball on the release page:

```sh
dsh plugin --profile web add github:baifagg/dsh-plugin-busy-workspace
dsh plugin --profile web add https://github.com/baifagg/dsh-plugin-busy-workspace/releases/latest/download/dsh-plugin-busy-workspace.tgz
```

Either way the bundle has to be listed in that profile's `package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-plugin-busy-workspace"
      ]
    }
  }
}
```

`dsh plugin add` does this for you; if you installed by hand with `pnpm add`,
edit the list yourself. Then restart the Web GUI and reload the page — the
sidebar picks it up with no further configuration.

Before it imports the plugin, the harness checks the declared harness range
(see [Compatibility](#compatibility)). A version it refuses is skipped and
reported; it is never partially loaded.

## Configuration

Settings persist at `$DSH_HOME/busy-workspace/settings.json` and are served over `GET /busy-workspace/api/settings`.

```json
{
  "pinBusyWorkspaces": true,
  "highlightRunningSessions": true,
  "highlightBusyWorkspaceHeaders": true,
  "notifyOnCompletion": true,
  "intensity": 0.6
}
```

| Field | Default | Effect |
| --- | --- | --- |
| `pinBusyWorkspaces` | `true` | Promote workspaces with an active session, in order of urgency |
| `highlightRunningSessions` | `true` | Draw the matching bar, tint, and coloured title on a row in any phase |
| `highlightBusyWorkspaceHeaders` | `true` | Give the header of an active workspace its family's tint, bar, and state badge |
| `notifyOnCompletion` | `true` | Play the settle pulse when a session stops running |
| `intensity` | `0.6` | Accent strength, `0`–`1`. Scales alpha only; hue always comes from the theme |
| `unreadHoldMinutes` | `480` | How long an unopened completion stays promoted (8 hours). Range `0`–`10080` |
| `seenHoldMinutes` | `15` | How long a completion stays promoted after you open it and move on. Range `0`–`1440` |
| `staleRunMinutes` | `360` | Silence after which a run that claims to be running is read as interrupted. Range `30`–`10080` |

The last three are the **retention policy**, exposed as settings rather than constants because they encode a working rhythm, not a fact. Set them to `0` and completions leave no trace at all; set `unreadHoldMinutes` to `10080` and they stay for a week.

The Host half is optional. A composition carrying only the client bundle keeps these defaults, which is a fully working configuration.

## How it works

The plugin reads `data-state` from the status dot the Harness already renders on every session row. That attribute is the official contract and carries exactly four values, straight from the Harness's own `sessionStatuses` / `sessionNode` derivation and in its own priority order: `warning` (waiting on you, outranking everything) → `ongoing` (running) → `done` (completed, unread) → `idle`.

Those four states cannot express **"I came back for the result"**, so the plugin keeps its own **attention phase** on top of them. The only extra information is whether the user has acknowledged the row, and whether the user is currently sitting on it — and neither needs persisting, because the Harness already stores the acknowledgement.

The transitions, which are the whole of `assess()`:

- `warning` → **waiting**; never age-gated, because it is blocking.
- `ongoing` and younger than `staleRunMinutes` → **running**; otherwise **interrupted** (marked red, not promoted).
- `done` and younger than `unreadHoldMinutes` → **finished (unread)**; older, entirely quiet.
- `done → idle` — which is exactly what opening a session does — → **seen**. While that row is also selected, its dwell clock is restarted on every pass, so reading never loses its place; the `seenHoldMinutes` countdown only begins once the user moves on.

Three selector details are load-bearing:

- **The status read is pinned to the dot's own node.** A row's leading 16px cell renders *either* the status dot *or* a `sidebar.session.row.leading` seat contributed by another plugin, so the lookup requires the primitive's `aria-hidden` marker and restricts the value to the four session states. Without that, a foreign element carrying a `data-state` (the installer's `error` mark, say) can be misread as the session's status. A session row itself never carries `error`.
- **The subagent count comes from the row's hidden status label**, and the unit is taken from that same label (`子智能体` / `subagent(s)`), so the chip is localized by construction rather than by the plugin shipping translations.
- **The relative-time label is read back.** It is a direct child of the row, and parsing it is what makes every age decision above decidable. A row waiting on the user shows the pending kind there rather than an age and parses to null — which is correct, since a waiting row is never judged by age; that same word is reused as the workspace badge text.

Promotion uses CSS `order` on a flex list column. The official list is a plain block scroller, so the plugin first marks the **parent element of the workspace groups** and lets CSS turn that into a flex column; reordering nodes directly would fight React, whereas an `order` value is a purely presentational hint the renderer never reads back. **Ranking rides the same mechanism**: groups tagged `data-busy-rank` 4/3/2/1 receive `order: -4/-3/-2/-1`, so the most urgent is always first. A list with nothing promoted is left untouched.

**Interrupted (red) is a derived state.** No session-row field reports a failure, so the plugin reads "the dot still says `ongoing` but the last activity is older than `staleRunMinutes`" as a run that died, and draws it red rather than continuing to claim it is live. Such a row does not promote its workspace either, so the list never reorders itself for a stale mark from days ago.

Motion respects `prefers-reduced-motion`: users who ask for less motion keep every state indication and lose only the movement.

## Verification

`npm test` runs 59 checks over both halves with no browser and no Harness: settings normalisation on the Host side (including the ranges of the three new durations), the module/selector/styling/runtime contracts on the client side, and the **attention model's behaviour**.

The strongest group is behavioural: the checks lift the real bodies of `assess` / `ageOf` / `subagentsOf` and friends out of `lib/client.js` by brace matching, evaluate them, and feed them mutable synthetic rows (a status dot, a relative-time label, a selection, a hidden subagent label) — then walk a row through its whole lifecycle the way a user would. Those assert:

- **opening a finished session keeps it promoted** (`done → idle` yields the seen phase rather than disappearing) — the core of this fix;
- **staying on that row for twelve minutes keeps it promoted** (the dwell clock keeps restarting);
- leaving it leaves a 15-minute dwell, after which it releases;
- an unopened completion is held 8 hours, while 9-hour, 11-day and 3-month-old ones are entirely quiet;
- a row claiming to run but silent for 7 hours becomes interrupted with `rank = 0` (not promoted), while 5 hours is still running;
- the age parses in both shipped locales, and `3mo` is never read as minutes;
- waiting is never age-gated, and the official word is surfaced (`待审批` / `Approval`);
- the subagent chip assembles in both locales (`3 子智能体` / `2 subagents`);
- a foreign element carrying `data-state="error"` / `"failed"` is **not** read as a session state.

**The checks are not vacuous**: mutating the fix away (deleting the `done → idle` branch) makes **exactly those 4 retention checks fail while the other 55 still pass** — so they are pinned to the behaviour, not to a restatement of it.

The styling checks assert the invariants stated above — no bare hex outside a token fallback, no `border` on a marked row, selection drawn from its own family and never from a status tone, motion bound to the running phase alone, reduced motion keeping the states, all five status weights taken from the dot's own tokens, the full set of rank `order` rules, the badge counting only the phase it names, and the list container not depending on `role="tree"`.

Finally the **real `paint()` runs against a real DOM**: six workspaces are laid out in the **reverse** of their urgency order, two paint passes run (the second after flipping a row from `done` to `idle` and selecting it, i.e. simulating the user opening the result), and the result is read back — the rendered order is waiting (-4) → running (-3) → unread (-2) → seen (-1) → the two rank-0 groups keeping DOM order; the seen row's bar measures opacity 0.42 at `rgb(18,183,106)`; the "3 子智能体" chip resolves from the official hidden label; a stale completion's bar and surface are fully transparent; and every row is still 32px tall.

The client half is also exercised in a real Web GUI: the module is loaded through the official `__ModuleLoader__` contract, `apply()` runs against a stub context, and the observer is driven with real `data-state="ongoing"` → `"done"` transitions, asserting that the workspace mark, the row mark, and the settle mark are set and cleared in that order. A 200px-wide sidebar is used as a pressure test to confirm the title plus badge do not overflow.

## Compatibility

DeepSeek Harness gates a plugin **itself**, and it does so through
`peerDependencies`, not through `engines.dsh`: before importing a plugin it
compares every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer against the running
runtime version with `semver.satisfies(range, { includePrerelease: true })`. A
plugin that declares no such peer is not checked at all. So this one declares
one, spelled as one branch per release line so that the harness's own check and a
plain semver evaluator agree:

```
>=0.1.5-rc.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 || >=0.1.7-alpha.1 <0.2.0-0
  || >=0.2.0-alpha.1 <0.2.1-0 || >=0.2.1-alpha.1 <0.3.0-0
```

| | |
| --- | --- |
| Harness | **0.1.5-rc.1 and later, below 0.3.0** — every release line from 0.1.5 to 0.2.1 is declared. 0.1.0–0.1.4 and 0.3.0+ are refused, loudly, with the profile's `skippedBundles` entry and the `dsh plugin allow-version …` command to override it deliberately |
| Enforced from | `0.1.7-rc.1` — earlier builds contain no compatibility check at all, so there the declared range is a statement rather than a gate |
| Verified end-to-end | `0.2.0-rc.2` — loaded and observed in a real Web GUI, both halves byte-identical to this tree |
| Contract-inspected | the status dot's `data-state` and all seven theme tokens are present in `0.1.5-rc.1`, so the floor is a real contract floor and not a guess |
| Verified offline | every declared line — `npm test` needs neither harness nor browser |
| Declared, not yet exercised live | `0.1.5-rc.*`, `0.1.6-alpha.*`, `0.1.7-alpha.*` / `-rc.*`, `0.2.0-rc.1`, `0.2.1-alpha.*` |
| Surface | Web GUI sidebar (`sidebar.workspaces`) |
| Themes | Any theme defining the standard `--dsw-alias-*` tokens |
| Conflicts | None known. The plugin owns one style element and one settings file, reads no other plugin's state, and registers no UI seat |

The full mechanism, the contract-by-contract dependency table, what each
evidence level does and does not prove, and the procedure for adding a release
line are in **[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)**
([中文](docs/COMPATIBILITY.zh.md)).

If a harness release changes one of the DOM contracts above, the failure mode is
silence rather than breakage — the sidebar simply looks stock. The plugin writes
only its own `data-busy-*` attributes on existing nodes, never adds, removes or
reorders them, and contains a failed paint pass instead of propagating it.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Version 1.1.0 is the revision that replaced
the single "busy" state with the five attention phases and the retention policy;
1.0.0 was the first release.

## FAQ

**Does it change my workspace order permanently?**
No. Promotion is purely visual. Your persisted order is never written, so the list returns to your arrangement as soon as the work stops.

**I clicked a finished session to read the result — does it fall out of the promoted band?**
No, and that is the core defect this revision fixes. Opening it only turns "unread" into "seen", and it stays where it is; for as long as you are sitting on that row it stays, however long you read; the 15-minute dwell begins only once you move away. The Harness clears its own `completionUnread` flag the instant you open a session, so this is something the plugin has to remember for itself.

**Why did the session I finished three days ago stop notifying me?**
Because the official `done` means "completion unread" and never expires on its own, so a three-day-old completion still reads as `done` upstream. The plugin ages it out using the label the row already displays (8 hours by default). Raise `unreadHoldMinutes` to keep completions around longer.

**Why is one row red, and where does that red come from?**
Session rows have no failure field — the Harness gives a row four states and `error` is not one of them. The red is therefore derived: the dot still says `ongoing` while the row's last activity is older than `staleRunMinutes` (6 hours by default), which is a run that died rather than one that is live. Such a row does not promote its workspace either. If you would rather those stale records were entirely silent — no red at all — remove the `interrupted` rules from `lib/client.js`.

**Why do all three "waiting on you" kinds share one amber?**
Because they are one situation: blocked on you. Splitting them into three hues would only make the palette something to re-learn, so the plugin distinguishes them by **word** instead — the badge shows the official 待审批 / 计划待审 / 待回答 (Approval / Plan review / Answer), so you can see what is actually being asked.

**Why do running subagents not get their own colour?**
Because they are not a state, they are a quantity. The Harness renders "N subagents running" as a hidden label, and the plugin turns it into a small chip on the running row; giving a number its own hue would lengthen the palette without adding meaning.

**What have the revisions fixed, in order?**
First: the original scoped both promotion and the workspace-header treatment to `[class*="_list"][role="tree"]`. The official sidebar session list renders no `role="tree"` — that role belongs to an unrelated JSON viewer — so the selector matched nothing and **promotion and header tinting never ran at all**; only the session-row highlight worked. The list container is now reached as the parent element of the workspace groups, which depends on no class name, no hash, and no ARIA contract. Second: a `data-state="error"` red rule was treated as a session state, which no session row can carry, and the status lookup was unscoped enough to read a decoration another plugin had placed in the row's leading cell; values are now restricted to the official four and the primitive's own node is required. Third: the previous revision dropped the promotion as soon as a run ended and gated it on a hard 15-minute window, so **the moment you went to look at a result it vanished** — the retention model replaces the timer with the user's own behaviour, keeping the timer only as a backstop.

**Will it fight my theme?**
No. It defines no palette. It consumes your theme's tokens, so it inherits whatever you installed and stays correct when you switch themes.

**Does it slow the sidebar down?**
Marks are recomputed once per animation frame from a batched mutation observer, and only written when a value actually changes. The observer cannot drive itself, because it writes attributes it does not itself observe into a loop. A one-minute timer re-runs the same pass so that age-derived marks can expire without a DOM change; one minute is far finer than the windows it guards.

## Keywords

DeepSeek Harness · dsh plugin · dsh-plugin · cordis plugin · DeepSeek Web GUI · sidebar · workspace sidebar · session list · running session indicator · busy workspace · agent activity indicator · parallel agent monitoring · session status dot · pin active workspace · workspace sorting · theme adaptive · `--dsw-alias` tokens · Catppuccin · Nord · Dracula · Tokyo Night · Gruvbox · productivity · developer tooling

## License

MIT © 2026 baifagg
