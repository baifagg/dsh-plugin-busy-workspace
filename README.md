# dsh-plugin-busy-workspace

**Know which workspace is working, at a glance.**

A DeepSeek Harness (`dsh`) Web GUI plugin that highlights running sessions and pins busy workspaces to the top of the sidebar.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4d6bfe.svg)](https://github.com/topics/dsh-plugin)
[![theme aware](https://img.shields.io/badge/theme-adaptive-16a34a.svg)](#theme-adaptive-by-design)

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

Three focused changes, all in the sidebar, all driven by the state the Harness already computes.

### 1. Busy workspaces rise to the top

A workspace containing a running session is lifted above the rest of the list. The move is presentational only — your manually dragged workspace order is never rewritten, so when the last session in a workspace finishes, the list quietly returns to the order you set.

### 2. Running sessions get a real visual identity

The running session row gets an accent frame, a tinted background, an accent-coloured bold title, and a slow breathing bar on its leading edge. You can identify it from across the room without reading a single word.

### 3. You see the moment a session finishes

When a session stops running, its row plays one short green settle pulse and then returns to normal. You learn that a task completed without watching it.

## Theme-adaptive by design

Every colour is read from the active theme's own `--dsw-alias-*` tokens. Nothing is hardcoded, which means one stylesheet works across the built-in light and dark themes and across community theme packs (Catppuccin, Nord, Dracula, Tokyo Night, Gruvbox, and any other theme that defines the standard token set).

| Role | Token |
| --- | --- |
| Running accent | `--dsw-alias-state-business-primary`, falling back to `--dsw-alias-brand-primary` |
| Settle colour | `--dsw-alias-state-success-primary` |
| Row title | `--dsw-alias-label-primary` |
| Hover surface | `--dsw-alias-interactive-bg-hover` |

The plugin deliberately picks the **semantic state tokens** rather than brand tokens. A brand token turns orange when your theme's brand is orange, which would read as a warning rather than as activity. The state tokens keep their meaning across every theme.

Transparency is composed with `color-mix()` against the theme's own surface, so the tint always sits correctly on light and dark backgrounds alike.

## Install

```sh
# From your dsh profile directory
cd ~/.dsh/profiles/web
pnpm add github:yangx/dsh-plugin-busy-workspace
```

Then register the bundle in that profile's `package.json`:

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

Restart the Web GUI and reload the page. The sidebar picks it up with no further configuration.

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
| `pinBusyWorkspaces` | `true` | Lift workspaces with a running session to the top of the list |
| `highlightRunningSessions` | `true` | Draw the accent frame, tint, and breathing bar on a running row |
| `highlightBusyWorkspaceHeaders` | `true` | Tint and accent-bar the header of a busy workspace |
| `notifyOnCompletion` | `true` | Play the settle pulse when a session stops running |
| `intensity` | `0.6` | Accent strength, `0`–`1`. Scales alpha only; hue always comes from the theme |

The Host half is optional. A composition carrying only the client bundle keeps these defaults, which is a fully working configuration.

## How it works

The plugin reads `data-state` from the status dot the Harness already renders on every session row — `ongoing`, `warning`, or `done`. That single attribute is the official contract, and reading it has three consequences worth stating:

- **No second source of truth.** The plugin never re-derives activity from the transport, so it cannot disagree with the dot you are looking at.
- **No race with the renderer.** Marks are applied as attributes plus CSS. React re-renders overwrite attributes freely and the observer simply re-applies them; DOM order is never touched, so reconciliation is never fought.
- **No layout shift.** The running frame is drawn with an inset `box-shadow` ring rather than a border, because a border would change the row's box size and shift every row below it the moment a session starts.

Workspace lifting uses CSS `order` on the flex list column. Reordering nodes directly would fight React; an `order` value is a purely presentational hint the renderer never reads back.

Motion respects `prefers-reduced-motion`: users who ask for less motion keep every state indication and lose only the movement.

## Compatibility

| | |
| --- | --- |
| Harness | DeepSeek Harness `0.1.5-rc` and later |
| Surface | Web GUI sidebar (`sidebar.workspaces`) |
| Themes | Any theme defining the standard `--dsw-alias-*` tokens |
| Conflicts | None known. The plugin owns one style element and one settings file, and reads no other plugin's state |

## FAQ

**Does it change my workspace order permanently?**
No. Lifting is purely visual. Your persisted order is never written, so the list returns to your arrangement as soon as the work stops.

**What counts as "running"?**
Exactly what the status dot means by `ongoing`: the session's turn is in flight. A session waiting on your approval, plan review, or an answer shows the official `warning` dot and is left alone — that is your cue, not a busy cue.

**Will it fight my theme?**
No. It defines no palette. It consumes your theme's tokens, so it inherits whatever you installed and stays correct when you switch themes.

**Does it slow the sidebar down?**
Marks are recomputed once per animation frame from a batched mutation observer, and only written when a value actually changes. The observer cannot drive itself, because it writes attributes it does not itself observe into a loop.

## Keywords

DeepSeek Harness · dsh plugin · dsh-plugin · cordis plugin · DeepSeek Web GUI · sidebar · workspace sidebar · session list · running session indicator · busy workspace · agent activity indicator · parallel agent monitoring · session status dot · pin active workspace · workspace sorting · theme adaptive · `--dsw-alias` tokens · Catppuccin · Nord · Dracula · Tokyo Night · Gruvbox · productivity · developer tooling

## License

MIT © 2026 baifagg
