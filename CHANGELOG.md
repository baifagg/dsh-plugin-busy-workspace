# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Compatibility with individual DeepSeek Harness releases is tracked separately in
[`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) ([中文](docs/COMPATIBILITY.zh.md)).

**Release checklist.** Every release must carry a tarball asset named
`dsh-plugin-busy-workspace.tgz` — version-free on purpose, because the README,
the marketplace entry and the storefronts point at
`releases/latest/download/dsh-plugin-busy-workspace.tgz`, which resolves `latest`
at request time but takes the filename literally. Forgetting the asset on one
release 404s that link until the next one. The same artifact is published to npm
from the same tagged tree, so all three channels ship identical bytes.

## [Unreleased]

### Added

- **A workspace header now stands in for rows the list is holding back.** The
  official session list keeps five idle sessions per workspace on screen and
  holds the rest behind its overflow row, so a session that finished while the
  user was away could be exactly the one taken off screen — and then nothing
  visible said the workspace was worth opening. A workspace whose list is
  holding rows back is marked `data-busy-held` and its header is raised from a
  summary to the weight a marked session row uses; the phase each workspace last
  reported is remembered under its official `workspace:<id>` row key, on the
  `unreadHoldMinutes` clock, so the completion is still announced after its own
  row is gone. A collapsed sub-workspace tree is treated the same way, because
  there too the header is the only thing left on screen.
- The folder glyph on a marked header now carries the phase colour, so the
  state survives a truncated or blurred name.

### Changed

- **The screenshots are now generated from the code they document.**
  `assets/screenshot-1.png` and `assets/screenshot-2.png` had not been re-taken
  since before the five attention phases shipped, so the project page was still
  showing the single-state version: no urgency ranking, no workspace badges, no
  subagent chip, no selection hue. Both images are re-captured from the current
  stylesheet and the current `paint()`, and the light one now also shows a
  workspace whose rows are held back.
- `scripts/capture-screenshots.mjs` now produces them by reading the CSS and the
  functions out of `lib/client.js` itself and driving a fixture sidebar with the
  real `paint()`. Re-running it after an edit is the whole update procedure, so
  the pictures can no longer silently fall behind the code. The second image is
  the default dark theme; workspace names in the published images are blurred,
  and the Chinese README now carries both.

## [1.1.1] — 2026-10-11

### Changed

- Documentation only; no behaviour change. The install section now leads with
  the npm command (`dsh plugin --profile web add dsh-plugin-busy-workspace`),
  which is what the plugin directories and storefronts tell users to run, and
  keeps the git and release-tarball forms underneath it. Published so the README
  inside the npm package matches the README in the repository.

## [1.1.0] — 2026-10-11

The revision that stops treating "running" as the only state worth showing, and
stops dropping a completion the moment you go to read it.

### Added

- **Five attention phases** behind the official four states: `pending`
  (`warning`), `running` (`ongoing`), `unread` (`done`, never opened), `seen`
  (opened, still worth finding), and `interrupted` (claims to run, silent for
  `staleRunMinutes`). Every phase paints from the token its own status dot uses.
- **Urgency-ranked promotion.** Workspaces in the promoted band now sort
  waiting → running → unread → seen instead of sharing one band, so the
  workspace blocked on you is always first (`data-busy-rank`, CSS `order`
  `-4` / `-3` / `-2` / `-1`).
- **A retention policy, as settings**: `unreadHoldMinutes` (default `480`),
  `seenHoldMinutes` (default `15`), `staleRunMinutes` (default `360`), each
  clamped to a documented range.
- **A `seen` phase** that keeps an opened completion promoted — for as long as
  you stay on the row, then for `seenHoldMinutes` after you move on.
- **A workspace state badge** that names the state in the harness's own words
  (待审批 / 计划待审 / 待回答, Approval / Plan review / Answer) rather than a
  generic "needs you".
- **A subagent chip** on the running row, counted from the row's hidden
  official status label, so it is localized by construction (`3 子智能体` /
  `2 subagents`) instead of by shipping translations.
- **An `interrupted` phase**: a session whose dot still says `ongoing` but
  whose last activity is older than `staleRunMinutes` is drawn red and is
  deliberately **not** promoted.
- **`npm test`** grew from 24 to 59 checks, including a behavioural group that
  lifts `assess` / `ageOf` / `subagentsOf` out of `lib/client.js` and walks a
  synthetic row through its whole lifecycle.

### Fixed

- **Promotion and workspace-header treatment matched nothing.** The list was
  located as `[class*="_list"][role="tree"]`, and the official sidebar session
  list renders no `role="tree"` — that role belongs to an unrelated JSON
  viewer — so the two features never ran; only the session-row highlight did.
  The list container is now reached as the parent element of the workspace
  groups, which depends on no class name, no build hash, and no ARIA contract.
- **A completion vanished exactly when you went to read it.** The previous
  revision dropped the promotion as soon as a run ended and gated it on a hard
  15-minute window, so opening the finished session — which is what clears the
  harness's own `completionUnread` flag — removed the row from the band. The
  retention model replaces the timer with the user's own behaviour, keeping a
  timer only as a backstop.
- **The status lookup could read a foreign element's state.** A bare
  `[data-state]` lookup inside a row could pick up a decoration another plugin
  had placed in the row's leading cell (an installer's `error` mark, say), and
  a red rule for `data-state="error"` treated it as a session state no session
  row can carry. The lookup now requires the primitive's own `aria-hidden`
  marker and restricts the value to the official four.

### Changed

- **`data-busy-session` now carries the phase name** (`pending` / `running` /
  `unread` / `seen` / `interrupted`) instead of the string `"true"`. Anything
  keying off `[data-busy-session="true"]` should read the attribute's presence
  instead. New attributes: `data-busy-list`, `data-busy-rank`,
  `data-busy-state`, `data-busy-label`, `data-busy-count`, `data-busy-multi`,
  `data-busy-subagents`.
- **Selection is drawn from its own hue.** A row that was both selected and
  running used to paint its ring, bar and title in the status colour and read
  as just another running row; selection now mixes its own violet from the
  theme's own tokens and keeps the status on the bar and title.
- Settings normalisation is driven by one defaults table plus a
  numeric-limits table, so a field cannot be added without a range.
- Declared DeepSeek Harness compatibility explicitly (see below) and documented
  it in `docs/COMPATIBILITY.md`.

### Compatibility

- Declares `@deepseek-ai/dsh` as a peer, which is what the harness itself
  evaluates: `>=0.1.5-rc.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 ||
  >=0.1.7-alpha.1 <0.2.0-0 || >=0.2.0-alpha.1 <0.2.1-0 ||
  >=0.2.1-alpha.1 <0.3.0-0` — one branch per released release line, each
  carrying a prerelease tag, so both the harness's own check and a plain
  semver evaluator resolve it the same way.
- No change to the install path: still a Web GUI client bundle plus an optional
  Host half, still no build step and no runtime dependencies.

## [1.0.0] — 2026-09-28

First release.

### Added

- Workspaces holding a running session are promoted to the top of the sidebar
  session list, presentational only (CSS `order`; your dragged order is never
  rewritten).
- Running session rows get an accent frame, a tinted surface and a coloured
  title, all read from the active theme's own `--dsw-*` tokens.
- A short settle pulse when a session stops running.
- Settings at `$DSH_HOME/busy-workspace/settings.json`, served over
  `GET /busy-workspace/api/settings`: `pinBusyWorkspaces`,
  `highlightRunningSessions`, `highlightBusyWorkspaceHeaders`,
  `notifyOnCompletion`, `intensity`.
- `npm test` with 24 checks over the Host and client contracts.
