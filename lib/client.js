/**
 * Client half of dsh-plugin-busy-workspace.
 *
 * Why this is a DOM observer rather than a React component: the sidebar
 * session list already derives every fact this plugin needs. The official
 * workspace browser renders one `StateDot` per session row, and that primitive
 * carries its state as a `data-state` attribute. Reading it means this plugin
 * never re-derives activity from the transport, never races the official
 * projection, and cannot disagree with the dot the user already sees.
 *
 * ## The design problem
 *
 * A sidebar row has two jobs, and conflating them is what produced the bug this
 * version fixes:
 *
 * 1. **Status** — what is this session doing right now?
 * 2. **A way back** — I started something, walked away, and now I want to see
 *    what it produced.
 *
 * The official states describe (1) only. `done` is not "just finished" but
 * `completionUnread`, and that flag clears **the moment the session is opened**.
 * So a naive reading promotes a workspace while a run is going, drops it the
 * instant the run ends, and — if it does notice the completion — drops it again
 * the moment the user clicks the row to read the result. The row the user is
 * reading jumps out of the promoted band. That is the defect.
 *
 * ## The model: attention decays, it does not snap
 *
 * The plugin therefore keeps its own **attention phase** per row, derived from
 * the official state plus two things the official state cannot express: whether
 * the user has acknowledged the row, and whether the user is sitting on it.
 *
 * | Phase | Entered when | Colour | Promoted |
 * | --- | --- | --- | --- |
 * | `pending` | `warning` — approval / plan review / question | amber | yes, first |
 * | `running` | `ongoing` and recently active | blue | yes |
 * | `unread` | `done` — finished, never opened | green | yes, for `unreadHoldMinutes` |
 * | `seen` | was `unread`, then opened (`done` → `idle`) | green, muted | yes, while selected, then `seenHoldMinutes` |
 * | `interrupted` | `ongoing` but silent for `staleRunMinutes` | red | no |
 * | `idle` | anything else | — | no |
 *
 * Two properties make this behave the way the user expects:
 *
 * - **Reading the result never un-promotes the row.** Opening a completion moves
 *   it from `unread` to `seen`, which is still promoted. Its dwell clock only
 *   starts running once the user moves the selection elsewhere, because a row
 *   that is still selected keeps restarting that clock.
 * - **Nothing has to be persisted.** After a reload the official state is read
 *   again: a still-unopened completion is still `done` and is promoted by age,
 *   and an opened one is `idle` and stays quiet. The Harness already stores the
 *   acknowledgement, so the plugin does not have to.
 *
 * Promotion order is the urgency order above, so with several workspaces in the
 * band the one that is blocked on the user is always first.
 *
 * ## What is deliberately not a separate colour
 *
 * The three `warning` kinds (`approval`, `plan-review`, `question`) share one
 * amber family: they are all "blocked on you", and splitting them into three
 * hues would cost learnability for no gain. They are told apart by **word** —
 * the row's trailing label already says 待审批 / 计划待审 / 待回答, and the
 * plugin reuses that exact text in the workspace badge. Running subagents are
 * likewise not a colour but a count: the official row renders them as a hidden
 * label, which the plugin turns into a small chip on the running row.
 *
 * Every colour is read from the active theme's own tokens, and each one is the
 * token the matching status dot paints itself with, so a row and its dot can
 * never disagree.
 *
 * @module dsh-plugin-busy-workspace/client
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-busy-workspace",
  factory: (require) => {
    const exports = {};
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    /** Stable Cordis plugin name; matches the Host half's `name`. */
    const name = "busy-workspace/client";

    /**
     * Service names this plugin reads. `slots` is what every UI plugin
     * injects; nothing here is optional beyond it, so a composition without a
     * sidebar simply never renders the elements the observer watches.
     */
    const inject = ["slots"];

    /** Route the Host half serves; absent Host means the defaults below apply. */
    const SETTINGS_PATH = "/busy-workspace/api/settings";

    /** Mirrors `lib/index.js` DEFAULT_SETTINGS. */
    const DEFAULT_SETTINGS = {
      pinBusyWorkspaces: true,
      highlightRunningSessions: true,
      highlightBusyWorkspaceHeaders: true,
      notifyOnCompletion: true,
      intensity: 0.6,
      unreadHoldMinutes: 480,
      seenHoldMinutes: 15,
      staleRunMinutes: 360,
    };

    /** Mirrors `lib/index.js` NUMERIC_LIMITS. */
    const NUMERIC_LIMITS = {
      intensity: { min: 0, max: 1 },
      unreadHoldMinutes: { min: 0, max: 10080 },
      seenHoldMinutes: { min: 0, max: 1440 },
      staleRunMinutes: { min: 30, max: 10080 },
    };

    /** The four states a session row's dot can carry, plus `idle` (no mark). */
    const KNOWN_STATES = new Set(["ongoing", "warning", "done", "idle"]);

    /**
     * The attention phases, each with the attribute value it writes, the
     * promotion rank it earns, and the badge word it contributes.
     *
     * A higher rank is more urgent and sorts first. Rank 0 means the row is
     * marked but does not promote its workspace — which is how a stale run gets
     * reported without dragging a days-old workspace back to the top.
     */
    const PHASE = {
      pending: { mark: "pending", rank: 4, label: "待处理" },
      running: { mark: "running", rank: 3, label: "运行中" },
      unread: { mark: "unread", rank: 2, label: "已完成" },
      seen: { mark: "seen", rank: 1, label: "已查看" },
      interrupted: { mark: "interrupted", rank: 0, label: "已中断" },
      idle: { mark: null, rank: 0, label: "" },
    };

    /**
     * The official session row, workspace group, and status-dot selectors.
     *
     * The class names carry a build-time hash prefix produced by the CSS-module
     * loader, so they are matched by their stable suffix rather than in full.
     * The primitive's own attributes are the real contract.
     *
     * Four details are load-bearing:
     *
     * - `statusDot` requires `aria-hidden="true"` and is filtered against
     *   {@link KNOWN_STATES}. A row's leading 16px cell renders *either* the
     *   status dot *or* a `sidebar.session.row.leading` seat contributed by
     *   another plugin, so a bare `[data-state]` lookup can read a foreign
     *   decoration — including an `error` value, which no session row carries.
     * - `leading` scopes the hidden status labels. The official row renders its
     *   status words into `visuallyHidden` spans *inside* the leading cell, and
     *   the class suffix alone is used by other CSS modules elsewhere in the
     *   app, so the lookup is scoped to the row's own cell.
     * - `time` is the row's relative-time label (or, for a row waiting on the
     *   user, the pending kind). It is a direct child, hence the `:scope >`.
     * - `selected` reads the official selection from `aria-selected`, which is
     *   the accessibility contract rather than a hashed class.
     *
     * There is deliberately no selector for the *list container*. An earlier
     * version scoped every group query to `[class*="_list"][role="tree"]`, but
     * the official session list renders no `role="tree"` — that role belongs to
     * an unrelated JSON viewer — so the selector matched nothing and both the
     * promotion and the workspace-header treatment silently never ran. The list
     * is now reached as the group's own parent element.
     */
    const SELECTOR = {
      group: '[class*="_groupSection"]',
      projectRow: '[class*="_projectRow"]',
      sessionRow: '[class*="_sessionRow"]',
      title: '[class*="_title"]',
      leading: '[class*="_slot"]',
      hidden: '[class*="_visuallyHidden"]',
      time: ':scope > [class*="_time"]',
      statusDot: '[data-state][aria-hidden="true"]',
      /*
       * The official overflow control, present only while the workspace is
       * holding session rows back. It carries its own stable row key, so the
       * lookup survives the hashed class rename this selector would otherwise
       * depend on.
       */
      overflow: '[data-row-key^="overflow:"]',
      header: '[data-row-key^="workspace:"]',
    };

    /** Marks a workspace group that holds a session worth showing. */
    const BUSY_ATTR = "data-busy-workspace";
    /** Marks the list container that must become a flex column for `order` to bite. */
    const LIST_ATTR = "data-busy-list";
    /** The promotion rank of a group; `0` means it does not promote. */
    const RANK_ATTR = "data-busy-rank";
    /** Carries the number of rows the header badge is speaking for. */
    const COUNT_ATTR = "data-busy-count";
    /** Set when more than one row is behind the badge, so it can name the count. */
    const MULTI_ATTR = "data-busy-multi";
    /** The badge word: the official pending kind when there is one, else the phase label. */
    const LABEL_ATTR = "data-busy-label";
    /** The dominant phase of a header, which selects its colour family. */
    const STATE_ATTR = "data-busy-state";
    /** The attention phase of a session row. */
    const MARK_ATTR = "data-busy-session";
    /** The running-subagent chip text, present only while subagents run. */
    const SUBAGENT_ATTR = "data-busy-subagents";
    /** Attribute carrying the settle animation state (`true` while playing). */
    const SETTLED_ATTR = "data-busy-settled";
    /** Root attribute exposing the resolved intensity for CSS to scale against. */
    const INTENSITY_ATTR = "data-busy-intensity";
    /**
     * Set on a workspace whose session list is currently holding rows back, so
     * CSS can raise the header to the weight of the rows it stands in for.
     */
    const HELD_ATTR = "data-busy-held";

    /** Style element identity, so a reload replaces rather than duplicates it. */
    const STYLE_ID = "dsh-plugin-busy-workspace/css";

    /**
     * The plugin's stylesheet.
     *
     * Colour roles — every one is the token the matching status dot paints
     * itself with, which is what keeps a row and its dot reading as one signal
     * instead of two colours that almost match:
     *
     * - `--bw-running`     `--dsw-static-deepseek-450`          the `ongoing` spinner
     * - `--bw-waiting`     `--dsw-alias-state-warn-primary`     the `warning` dot
     * - `--bw-done`        `--dsw-alias-state-success-primary`  the `done` dot
     * - `--bw-interrupted` `--dsw-alias-state-error-primary`    the failure colour
     *
     * One grammar serves every phase: a phase declares `--bw-tone` (plus, for
     * the acknowledged completion, a `--bw-fade` that cools it down), and the
     * shared rules below are written once against those variables. A phase
     * therefore cannot drift out of the grammar by being styled somewhere else.
     *
     * The fallback chain deliberately stops at a literal rather than falling
     * through to `--dsw-alias-brand-primary`: in the default theme that token
     * resolves to near-black, so a missing running token would paint the
     * highlight as a black block.
     *
     * Hierarchy: the signal is carried by things that have a shape — a solid 3px
     * bar on the leading edge, and the header badge that names the state — with
     * the surface tint backing them up. An earlier version expressed "running"
     * mostly as a blue title, but the official row title is *already* blue, so
     * that signal did not exist.
     *
     * **Selection is a fifth, independent hue.** It is a violet composed from
     * the theme's own bright tokens, because the palette ships no fifth hue and
     * a selected row that borrows a status colour is indistinguishable from a
     * plain running one. See the selection rules in section 2.
     */
    const CSS = `
:root {
  --bw-intensity: 0.6;
  --bw-running: var(--dsw-static-deepseek-450, #5686fe);
  --bw-waiting: var(--dsw-alias-state-warn-primary, #e08a1e);
  --bw-done: var(--dsw-alias-state-success-primary, #12b76a);
  --bw-interrupted: var(--dsw-alias-state-error-primary, #d93f3f);
  --bw-settle: var(--dsw-alias-state-success-primary, #12b76a);

  --bw-bar-width: 3px;
  /*
   * The bar and the badge carry the signal; the fill only backs them up, and
   * is scaled by intensity so the settings slider still means something.
   */
  --bw-fill-alpha: calc(var(--bw-intensity) * 0.16);
  --bw-ring-alpha: calc(0.30 + var(--bw-intensity) * 0.28);
  --bw-fade: 1;
  --bw-title-mix: 82%;

  /*
   * Selection is a bright hue, in the same family of treatments as the four
   * statuses: a saturated colour laid down as a pale tint, not a neutral wash.
   * The first attempt used the Harness's own selection neutral
   * (--dsw-alias-interactive-bg-hover-accent), which is a dark navy at 14% and
   * therefore reads as a grey block next to the status rows — the opposite of
   * what a selected row should look like.
   *
   * The palette ships no fifth hue (amber, blue, deepseek, green, neutral and
   * red are all of them), so selection is composed from two of the theme's own
   * bright tokens: the running blue and the failure red. Mixed at roughly two
   * to one that lands on a violet — by construction none of the four status
   * hues, and still derived from the theme rather than pinned to a literal.
   *
   * Override --bw-selection (and --bw-selection-ring) to retune it, or set both
   * to a literal if you want a fixed accent.
   */
  --bw-selection: color-mix(in srgb, var(--bw-running) 65%, var(--bw-interrupted));
  --bw-selection-ring: color-mix(in srgb, var(--bw-selection) 52%, transparent);
}

/* ---------------------------------------------------------------- *
 * 0. Colour families, one per attention phase
 * ---------------------------------------------------------------- */

/*
 * Declaring the tone once per phase and styling everything against it is what
 * keeps the families from drifting apart. The seen phase is the same green as an
 * unread completion with the volume turned down: the user has already read that
 * result, so the row is still present but visibly on its way out.
 */
[data-busy-session="running"]     { --bw-tone: var(--bw-running); --bw-title-mix: 82%; }
[data-busy-session="pending"]     { --bw-tone: var(--bw-waiting); --bw-title-mix: 86%; }
[data-busy-session="unread"]      { --bw-tone: var(--bw-done);    --bw-title-mix: 82%; }
[data-busy-session="seen"]        { --bw-tone: var(--bw-done);    --bw-title-mix: 46%; --bw-fade: 0.42; }
[data-busy-session="interrupted"] { --bw-tone: var(--bw-interrupted); --bw-title-mix: 86%; }

[data-busy-state="running"] { --bw-tone: var(--bw-running); }
[data-busy-state="pending"] { --bw-tone: var(--bw-waiting); }
[data-busy-state="unread"]  { --bw-tone: var(--bw-done); }
[data-busy-state="seen"]    { --bw-tone: var(--bw-done); --bw-fade: 0.6; }

/*
 * The fifth family: selection. It is declared here beside the others so the
 * whole colour system is readable in one place, but it is deliberately *not*
 * routed through --bw-tone — selection is not a status and must never inherit
 * one. --bw-selection and --bw-selection-ring are defined in :root above.
 */
/* ---------------------------------------------------------------- *
 * 1. Promotion, ordered by urgency
 * ---------------------------------------------------------------- */

/*
 * The official list is a plain block scroller, so data-busy-list is what turns
 * it into a flex column; until that attribute is present the rules below are
 * inert. The plugin sets it from JavaScript on the group's own parent element,
 * so nothing here depends on a hashed class name or on the list carrying an
 * ARIA role it does not have.
 *
 * Visual order is then expressed as order without touching the DOM: reordering
 * nodes directly would fight React's reconciliation, while an order value is a
 * purely presentational hint the renderer never reads back.
 */
[data-busy-list="true"] {
  display: flex;
  flex-direction: column;
}

/* Keep every row at its natural height; only the order may change. */
[data-busy-list="true"] > * {
  flex: 0 0 auto;
}

/* Rank 4 is the most urgent, so it sorts first; rank 0 is not promoted at all. */
[data-busy-list="true"] > [data-busy-rank="4"] { order: -4; }
[data-busy-list="true"] > [data-busy-rank="3"] { order: -3; }
[data-busy-list="true"] > [data-busy-rank="2"] { order: -2; }
[data-busy-list="true"] > [data-busy-rank="1"] { order: -1; }

/*
 * The header states the situation instead of hinting at it: a solid bar on the
 * leading edge plus a badge naming the state, both in the dominant phase's
 * colour family.
 *
 * While the rows it speaks for are on screen the header deliberately stays a
 * step below them — it is a summary, and two equally loud signals for one fact
 * read as clutter. But a workspace can be collapsed, and then the header is
 * *all* that is left: it is no longer summarising a visible row, it is the only
 * place the state can appear at all. So the tint is not fixed; the rule below
 * brings a collapsed header up to the weight a marked session row uses.
 */
[class*="_groupSection"][data-busy-workspace="true"] > [class*="_projectRow"] {
  position: relative;
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--bw-tone) calc(var(--bw-fill-alpha) * 68% * var(--bw-fade)),
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--bw-tone) calc(var(--bw-ring-alpha) * 70%), transparent);
  transition: background 160ms var(--ds-ease-in-out, ease),
              box-shadow 160ms var(--ds-ease-in-out, ease);
}

/* The bar sits inside the header's own leading padding, so no text moves. */
[class*="_groupSection"][data-busy-workspace="true"] > [class*="_projectRow"]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  translate: 0 -50%;
  width: var(--bw-bar-width);
  height: 20px;
  border-radius: 0 2px 2px 0;
  background: var(--bw-tone);
  opacity: var(--bw-fade);
}

/*
 * The badge. It is a flex item rather than an absolute overlay, so it can never
 * cover the folder icon, the title, or the hover actions; the title simply
 * truncates when the sidebar is narrow. The word comes from the phase the
 * workspace is speaking for — and for a workspace waiting on the user it is the
 * official pending kind, so the badge says 待审批 or 待回答 rather than a vague
 * "needs you".
 */
[class*="_groupSection"][data-busy-workspace="true"] > [class*="_projectRow"]::after {
  content: attr(data-busy-label);
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 7px;
  margin-inline-start: 2px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.2px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: color-mix(in srgb, var(--bw-tone) 86%, var(--dsw-alias-label-primary, currentColor));
  background: color-mix(
    in srgb,
    var(--bw-tone) calc((13% + var(--bw-intensity) * 5%) * var(--bw-fade)),
    transparent
  );
}

[class*="_groupSection"][data-busy-workspace="true"]
  > [class*="_projectRow"][data-busy-multi="true"]::after {
  content: attr(data-busy-count) " 个" attr(data-busy-label);
}

/* The workspace label picks up the tone so the header reads as active. */
[class*="_groupSection"][data-busy-workspace="true"]
  > [class*="_projectRow"] [class*="_projectText"] {
  color: color-mix(in srgb, var(--bw-tone) 78%, var(--dsw-alias-label-primary, currentColor));
  font-weight: 600;
}

/*
 * The folder glyph is the one shape on a header that is not text, and the first
 * thing the eye lands on when scanning a collapsed list. It carries the family
 * colour too, so a workspace is identifiable from its icon alone.
 *
 * It is tinted whatever the collapsed state is: a coloured folder is a state
 * mark on the row itself, not a second summary competing with the rows below.
 */
[class*="_groupSection"][data-busy-workspace="true"]
  > [class*="_projectRow"] [class*="_folder"] {
  color: var(--bw-tone);
}

/*
 * When the rows go away, the header stops being a summary and becomes the row:
 * its fill, its ring and its bar all come up to the weights a marked session row
 * uses — same grammar, same voice, no new colour.
 *
 * Two different collapses can take the rows off screen, and both are read from
 * the official DOM rather than guessed:
 *
 * - the plugin's own data-busy-held mark, set on a workspace whose session
 *   list is holding rows back (read each pass from the official overflow
 *   control). This is the common case: the list keeps five idle sessions on
 *   screen and holds the rest behind "展开其余 N 个会话", so the visible rows no
 *   longer describe the workspace on their own.
 * - aria-expanded="false" on the header itself — a collapsed sub-workspace
 *   tree. The official control owns that attribute, so reading it needs no
 *   plugin state and cannot disagree with the arrow the user just clicked.
 *
 * (Backticks are avoided in this block on purpose: the sheet is a template
 * literal, so one would close it.)
 */
[class*="_groupSection"][data-busy-workspace="true"][data-busy-held="true"]
  > [class*="_projectRow"],
[class*="_groupSection"][data-busy-workspace="true"]:has(> [class*="_projectRow"][aria-expanded="false"])
  > [class*="_projectRow"] {
  background: color-mix(
    in srgb,
    var(--bw-tone) calc(var(--bw-fill-alpha) * 100% * var(--bw-fade)),
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--bw-tone) calc(var(--bw-ring-alpha) * 100% * var(--bw-fade)), transparent);
}

/* The bar grows with the row so a collapsed header reads as one solid mark. */
[class*="_groupSection"][data-busy-workspace="true"][data-busy-held="true"]
  > [class*="_projectRow"]::before,
[class*="_groupSection"][data-busy-workspace="true"]:has(> [class*="_projectRow"][aria-expanded="false"])
  > [class*="_projectRow"]::before {
  height: 26px;
}

/* ---------------------------------------------------------------- *
 * 2. Session rows, one grammar for every phase
 * ---------------------------------------------------------------- */

/**
 * The surface is drawn with a box-shadow ring rather than a border. A border
 * would change the row's box size and shift every row below it by two pixels
 * the moment a session starts; a ring is painted outside the box model, so the
 * list never moves.
 */
[class*="_sessionRow"][data-busy-session] {
  position: relative;
  background: color-mix(
    in srgb,
    var(--bw-tone) calc(var(--bw-fill-alpha) * 100% * var(--bw-fade)),
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--bw-tone) calc(var(--bw-ring-alpha) * 100% * var(--bw-fade)), transparent);
  transition: background 180ms var(--ds-ease-in-out, ease),
              box-shadow 180ms var(--ds-ease-in-out, ease);
}

/* Hovering a marked row deepens the tint instead of replacing it. */
[class*="_sessionRow"][data-busy-session]:hover {
  background: color-mix(
    in srgb,
    var(--bw-tone) calc(var(--bw-fill-alpha) * 145% * var(--bw-fade)),
    transparent
  );
}

/*
 * The bar is the load-bearing part of the signal: a solid 3px mark on the
 * leading edge, inside the row's own padding so it never overlaps the dot. It
 * is absolutely positioned because the row is a flex container — as a flow item
 * it would take width and shove the title sideways.
 */
[class*="_sessionRow"][data-busy-session]::before {
  content: "";
  position: absolute;
  inset-block: 5px;
  inset-inline-start: 0;
  width: var(--bw-bar-width);
  border-radius: 0 2px 2px 0;
  background: var(--bw-tone);
  opacity: var(--bw-fade);
  pointer-events: none;
}

/*
 * Only a live run moves. A pulse on the running bar is the plugin's one piece of
 * motion; waiting, finished and interrupted rows stay still, because they are
 * states rather than activity — and a red row that throbbed would read as an
 * alarm rather than a report.
 */
[class*="_sessionRow"][data-busy-session="running"]::before {
  animation: bw-breathe 2.4s var(--ds-ease-in-out, ease-in-out) infinite;
}

@keyframes bw-breathe {
  0%, 100% { opacity: calc(var(--bw-fade) * 0.6); }
  50%      { opacity: var(--bw-fade); }
}

/*
 * The title carries the phase colour. Weight is raised as well as colour, so
 * the mark survives a theme whose label colour is already close to the tone.
 */
[class*="_sessionRow"][data-busy-session] [class*="_title"] {
  color: color-mix(
    in srgb,
    var(--bw-tone) var(--bw-title-mix),
    var(--dsw-alias-label-primary, currentColor)
  );
  font-weight: 600;
}

/*
 * A running row also reports how many subagents it has in flight. The count
 * comes from the official hidden status label, and the chip is only rendered
 * while that label exists, so it can never show a stale number.
 */
[class*="_sessionRow"][data-busy-subagents]::after {
  content: attr(data-busy-subagents);
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 15px;
  padding: 0 6px;
  margin-inline-start: 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: color-mix(in srgb, var(--bw-running) 78%, var(--dsw-alias-label-primary, currentColor));
  background: color-mix(in srgb, var(--bw-running) 11%, transparent);
}

/*
 * Selection is a separate channel from status, and it has its own hue instead
 * of borrowing one.
 *
 * This is the fix for "the selected row looks like a running row": a selected
 * row used to keep the official 6% neutral surface but draw its ring in the
 * status tone, while the status tone also coloured the bar and the title — so a
 * row that was both selected and running was blue in every channel and read as
 * just another running row.
 *
 * The surface and the ring are now drawn from --bw-selection at exactly the
 * same weights a status row uses for its own tone, so selection belongs to the
 * same family of treatments — a saturated hue laid down as a pale tint — while
 * being unmistakably not one of the four status hues. The status keeps the bar
 * and the title, which is what those two were always for. Selection therefore
 * looks the same whatever the row underneath is doing, and can never be
 * mistaken for a status.
 */
[class*="_sessionRow"][class*="_selected"] {
  background: color-mix(
    in srgb,
    var(--bw-selection) calc(var(--bw-fill-alpha) * 100%),
    transparent
  );
  box-shadow: inset 0 0 0 1px var(--bw-selection-ring);
}

/* Selection feedback deepens its own tint rather than swapping in a status hue. */
[class*="_sessionRow"][class*="_selected"]:hover {
  background: color-mix(
    in srgb,
    var(--bw-selection) calc(var(--bw-fill-alpha) * 150%),
    transparent
  );
}

/* ---------------------------------------------------------------- *
 * 3. The settle moment
 * ---------------------------------------------------------------- */

/*
 * One short pulse when a session leaves the running phase. The animation is
 * attached only while the attribute is present, and the attribute is removed on
 * animationend, so a re-render mid-animation cannot restart it.
 */
[class*="_sessionRow"][data-busy-settled="true"] {
  animation: bw-settle 1.1s var(--ds-ease-in-out, ease-out) 1;
}

@keyframes bw-settle {
  0% {
    background: color-mix(
      in srgb,
      var(--bw-settle) calc(var(--bw-intensity) * 42%),
      transparent
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--bw-settle) 62%, transparent);
  }
  100% {
    background: transparent;
    box-shadow: inset 0 0 0 1px transparent;
  }
}

/* A finished row flashes its title toward the settle colour, then returns. */
[class*="_sessionRow"][data-busy-settled="true"] [class*="_title"] {
  animation: bw-settle-title 1.1s var(--ds-ease-in-out, ease-out) 1;
}

@keyframes bw-settle-title {
  0%   { color: var(--bw-settle); }
  100% { color: inherit; }
}

/* Respect a user who asked the system for less motion: keep the states, drop the movement. */
@media (prefers-reduced-motion: reduce) {
  [class*="_sessionRow"][data-busy-session="running"]::before {
    animation: none;
    opacity: var(--bw-fade);
  }
  [class*="_sessionRow"][data-busy-settled="true"],
  [class*="_sessionRow"][data-busy-settled="true"] [class*="_title"] {
    animation: none;
  }
}
`;

    /**
     * Relative-age units, in both locales the Harness ships.
     *
     * The label comes from the official `relativeTime` bucketing, so it is
     * always a bare number plus one of these units — `刚刚` / `9分钟` / `2小时`
     * / `11天` / `3个月` / `1年`, or `now` / `9min` / `2h` / `11d` / `3mo` / `1y`.
     * Longer-unit spellings are listed before shorter ones so `mo` is never read
     * as `m`, and `个月` never as `天`.
     */
    const AGE_UNITS = [
      [/^(?:刚刚|now)$/i, 0],
      [/^(\d+)\s*(?:分钟|min|m)$/i, 60 * 1000],
      [/^(\d+)\s*(?:小时|hr|h)$/i, 60 * 60 * 1000],
      [/^(\d+)\s*(?:个月|mo)$/i, 30 * 24 * 60 * 60 * 1000],
      [/^(\d+)\s*(?:天|d)$/i, 24 * 60 * 60 * 1000],
      [/^(\d+)\s*(?:年|y)$/i, 365 * 24 * 60 * 60 * 1000],
    ];

    /** Insert the stylesheet once; returns a disposer. */
    function insertStyle() {
      const existing = document.getElementById(STYLE_ID);
      if (existing !== null) existing.remove();
      const tag = document.createElement("style");
      tag.id = STYLE_ID;
      tag.dataset.plugin = "dsh-plugin-busy-workspace";
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    /**
     * The state of the row's own status dot, or null when the row carries none.
     *
     * The value is filtered against {@link KNOWN_STATES} on purpose: a row's
     * leading cell holds either the status dot or another plugin's seat, and a
     * foreign element carrying a `data-state` (an installer mark, say, with the
     * value `error`) must never be mistaken for the session's own status.
     */
    function statusStateOf(row) {
      const dot = row.querySelector(SELECTOR.statusDot);
      if (dot === null) return null;
      const state = dot.getAttribute("data-state");
      return state !== null && KNOWN_STATES.has(state) ? state : null;
    }

    /**
     * The row's own relative age in milliseconds, or null when it cannot be read.
     *
     * A row in a pending-interaction state shows the pending kind in this slot
     * ("待审批") rather than an age, and parses to null — which is correct, since
     * a row waiting on the user is never judged by age.
     */
    function ageOf(row) {
      const element = row.querySelector(SELECTOR.time);
      if (element === null) return null;
      const text = (element.textContent ?? "").trim();
      if (text === "") return null;
      for (const [pattern, unit] of AGE_UNITS) {
        const match = pattern.exec(text);
        if (match === null) continue;
        return match[1] === undefined ? unit : Number(match[1]) * unit;
      }
      return null;
    }

    /**
     * The official pending kind for a row, or null.
     *
     * The Harness writes the kind into the row's own time slot — 待审批 /
     * 计划待审 / 待回答, or Approval / Plan review / Answer — so the plugin can
     * name the exact thing the user has to do instead of inventing a word for
     * it. The length guard rejects anything that is plainly not a label.
     */
    function pendingWordOf(row) {
      const element = row.querySelector(SELECTOR.time);
      if (element === null) return null;
      const text = (element.textContent ?? "").trim();
      if (text === "" || text.length > 12) return null;
      return text;
    }

    /**
     * Whether the official row is the selected session.
     *
     * `aria-selected` is the accessibility contract and the one worth trusting;
     * the class is kept as a fallback for a composition that renders the row
     * without the attribute.
     */
    function isSelected(row) {
      if (row.getAttribute("aria-selected") === "true") return true;
      const className = row.className;
      return typeof className === "string" && className.includes("_selected");
    }

    /**
     * The running-subagent chip text, or null when no subagent is running.
     *
     * The official row renders its status words into hidden spans inside the
     * leading cell; a running subagent adds one reading "3 个子智能体运行中" or
     * "3 subagents running". The unit is taken from that same label, so the chip
     * is localized by construction rather than by the plugin carrying its own
     * translations. Anything that does not match simply yields no chip.
     */
    function subagentsOf(row) {
      const cell = row.querySelector(SELECTOR.leading);
      if (cell === null) return null;
      for (const label of cell.querySelectorAll(SELECTOR.hidden)) {
        const text = (label.textContent ?? "").trim();
        const match = /^(\d+)\s*(?:个\s*)?(子智能体|subagents?)/i.exec(text);
        if (match !== null) return `${match[1]} ${match[2]}`;
      }
      return null;
    }

    /**
     * Decide a row's attention phase and whether it promotes its workspace.
     *
     * This is the whole behavioural core, kept as one pure-ish function of
     * (row, now, memory, settings) so the retention rules can be exercised
     * directly rather than inferred from the DOM afterwards.
     *
     * @param row - one official session row.
     * @param now - epoch ms for this pass.
     * @param memory - per-row `{ phase, seenAt }` carried across passes.
     * @param settings - resolved settings record.
     * @returns `{ phase, mark, rank, active, label, subagents }`.
     */
    function assess(row, now, memory, settings) {
      const key = rowKey(row);
      const previous = memory.get(key);
      const state = statusStateOf(row);
      const age = ageOf(row);
      const selected = isSelected(row);
      const staleMs = settings.staleRunMinutes * 60 * 1000;
      const unreadMs = settings.unreadHoldMinutes * 60 * 1000;
      const seenMs = settings.seenHoldMinutes * 60 * 1000;

      let phase;
      if (state === "warning") {
        phase = "pending";
      } else if (state === "ongoing") {
        phase = age !== null && age >= staleMs ? "interrupted" : "running";
      } else if (state === "done") {
        phase = "unread";
      } else if (previous?.phase === "unread" || previous?.phase === "seen") {
        // The Harness cleared `completionUnread`, which is exactly what opening
        // the session does. The completion is acknowledged, not gone.
        phase = "seen";
      } else {
        phase = "idle";
      }

      // A `seen` row's dwell clock starts when the acknowledgement is observed
      // — not at some earlier moment — and is restarted for as long as the user
      // is still sitting on the row, so reading a result never loses its place.
      let seenAt = previous?.seenAt ?? 0;
      if (phase === "seen" && (previous?.phase !== "seen" || selected)) seenAt = now;

      const active =
        phase === "pending" ||
        phase === "running" ||
        (phase === "unread" && (age === null || age <= unreadMs)) ||
        (phase === "seen" && (selected || now - seenAt <= seenMs));

      memory.set(key, { phase, seenAt });

      // A run that has gone quiet is reported, but never promoted: surfacing it
      // would drag a days-old workspace back to the top, which is the noise this
      // plugin is supposed to remove.
      if (phase === "interrupted") {
        return {
          phase,
          mark: PHASE.interrupted.mark,
          rank: 0,
          active: false,
          label: PHASE.interrupted.label,
          word: null,
          subagents: null,
        };
      }
      if (!active) {
        return { phase, mark: null, rank: 0, active: false, label: "", word: null, subagents: null };
      }

      const meta = PHASE[phase];
      return {
        phase,
        mark: meta.mark,
        rank: meta.rank,
        active: true,
        label: meta.label,
        word: phase === "pending" ? pendingWordOf(row) : null,
        subagents: phase === "running" ? subagentsOf(row) : null,
      };
    }

    /** Resolve the closest ancestor group section for one row. */
    function groupOf(row) {
      return row.closest(SELECTOR.group);
    }

    /**
     * A stable identity for one workspace group across renders.
     *
     * The official header carries `data-row-key="workspace:<id>"`, which holds
     * across a rename, a reorder and a collapse. A composition that renders
     * groups without it gets `null` and keeps no group memory at all — better
     * than keying that memory on a label the user can edit, which would hand
     * one workspace another's remembered phase.
     */
    function groupIdentity(group) {
      const header = group.querySelector(SELECTOR.header);
      if (header === null) return null;
      const key = header.getAttribute("data-row-key");
      return key === null || key === "" ? null : key;
    }

    /** Write an attribute only when it would actually change. */
    function setAttr(element, attribute, value) {
      if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
    }

    /** Remove an attribute only when it is actually present. */
    function dropAttr(element, attribute) {
      if (element.hasAttribute(attribute)) element.removeAttribute(attribute);
    }

    /**
     * A stable identity for one row across renders.
     *
     * The official row carries `data-row-key="session:<id>"`, which is the only
     * identity that survives a rename, a reorder, or a move between groups. The
     * header-plus-title fallback exists only for a composition that renders rows
     * without the attribute, and is deliberately last.
     */
    function rowKey(row) {
      const key = row.getAttribute("data-row-key");
      if (key !== null && key !== "") return key;
      const group = groupOf(row);
      const label = row.querySelector(SELECTOR.title)?.textContent ?? "";
      if (group === null) return `flat:${label}`;
      const header = group.querySelector(SELECTOR.projectRow)?.textContent ?? "";
      return `${header}\u0000${label}`;
    }

    /** Merge Host settings over the defaults, ignoring a malformed payload. */
    function mergeSettings(raw) {
      if (raw === null || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
      const out = { ...DEFAULT_SETTINGS };
      for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
        const value = raw[key];
        const limits = NUMERIC_LIMITS[key];
        if (limits !== undefined) {
          if (typeof value === "number" && Number.isFinite(value)) {
            out[key] = Math.min(limits.max, Math.max(limits.min, value));
          }
        } else if (typeof value === "boolean") {
          out[key] = value;
        }
      }
      return out;
    }

    /**
     * Apply the plugin's marks to the current DOM.
     *
     * Called on every mutation batch and on a slow timer. It only writes when a
     * value actually changes, so the observer cannot drive itself in a loop
     * through its own attribute writes.
     *
     * @param settings - resolved settings record.
     * @param memory - per-row attention memory, carried across passes.
     */
    function paint(settings, memory) {
      const now = Date.now();
      const unreadMs = settings.unreadHoldMinutes * 60 * 1000;
      const root = document.documentElement;
      root.setAttribute(INTENSITY_ATTR, String(settings.intensity));

      // --- session rows ---
      // Assessed first, because the workspace marks are a summary of them.
      const rows = [...document.querySelectorAll(SELECTOR.sessionRow)];
      const seen = new Set();
      const perGroup = new Map();

      for (const row of rows) {
        const verdict = assess(row, now, memory, settings);
        seen.add(rowKey(row));

        const mark = settings.highlightRunningSessions ? verdict.mark : null;
        if (mark !== null) setAttr(row, MARK_ATTR, mark);
        else dropAttr(row, MARK_ATTR);

        if (verdict.subagents !== null && settings.highlightRunningSessions) {
          setAttr(row, SUBAGENT_ATTR, verdict.subagents);
        } else {
          dropAttr(row, SUBAGENT_ATTR);
        }

        const group = groupOf(row);
        if (group !== null && verdict.active) {
          let entry = perGroup.get(group);
          if (entry === undefined) {
            entry = { tally: new Map(), words: new Set() };
            perGroup.set(group, entry);
          }
          entry.tally.set(verdict.phase, (entry.tally.get(verdict.phase) ?? 0) + 1);
          if (verdict.word !== null) entry.words.add(verdict.word);
        }
      }

      // Forget rows that are gone, so a long-lived tab cannot accumulate state.
      for (const key of [...memory.keys()]) {
        if (!seen.has(key)) memory.delete(key);
      }

      // --- workspace groups ---
      // Collected globally, not through the list container: the container is
      // reached as each group's parent, the only handle that survives a hashed
      // class rename or a role change.
      const groups = [...document.querySelectorAll(SELECTOR.group)];
      const listParents = new Set();
      const promotedParents = new Set();

      /*
       * The workspaces whose session list is holding rows back. The official
       * control renders only while there is something behind it, and its own
       * `aria-expanded` says whether those rows are still out of sight — so
       * this reads a contract the list already maintains rather than inferring
       * a count from what happens to be visible.
       */
      const held = new Set();
      for (const control of document.querySelectorAll(SELECTOR.overflow)) {
        if (control.getAttribute("aria-expanded") !== "false") continue;
        const holder = control.closest(SELECTOR.group);
        if (holder !== null) held.add(holder);
      }

      const liveGroups = new Set();

      for (const group of groups) {
        const parent = group.parentElement;
        if (parent !== null) listParents.add(parent);

        const identity = groupIdentity(group);
        if (identity !== null) liveGroups.add(identity);
        const isHeld = held.has(group);
        setAttr(group, HELD_ATTR, isHeld ? "true" : "false");

        let summary = summarise(perGroup.get(group));
        if (summary !== null) {
          if (identity !== null) groupMemory.set(identity, { summary, at: now });
        } else if (isHeld && identity !== null) {
          /*
           * Rows are being held back and none of the visible ones is active.
           * The workspace may still be holding the one row the user needed to
           * see; the last phase it reported is reused until it ages out, on the
           * same clock an unread completion is held for.
           */
          const remembered = groupMemory.get(identity);
          if (remembered !== undefined && now - remembered.at <= unreadMs) summary = remembered.summary;
        }

        const promoted =
          summary !== null && (settings.pinBusyWorkspaces || settings.highlightBusyWorkspaceHeaders);
        setAttr(group, BUSY_ATTR, promoted ? "true" : "false");

        const rank = summary !== null && settings.pinBusyWorkspaces ? summary.rank : 0;
        setAttr(group, RANK_ATTR, String(rank));
        if (rank > 0 && parent !== null) promotedParents.add(parent);

        const header = group.querySelector(SELECTOR.projectRow);
        if (header !== null) {
          setAttr(header, COUNT_ATTR, String(summary?.count ?? 0));
          setAttr(header, MULTI_ATTR, (summary?.count ?? 0) > 1 ? "true" : "false");
          setAttr(header, STATE_ATTR, summary?.mark ?? "none");
          setAttr(header, LABEL_ATTR, summary?.label ?? "");
        }
      }

      // Forget workspaces that are gone, on the same principle as the row map.
      for (const key of [...groupMemory.keys()]) {
        if (!liveGroups.has(key)) groupMemory.delete(key);
      }

      // Only a container that actually holds a promoted group becomes a flex
      // column, so an unmodified list keeps its official layout exactly.
      for (const parent of listParents) {
        if (promotedParents.has(parent)) setAttr(parent, LIST_ATTR, "true");
        else dropAttr(parent, LIST_ATTR);
      }

      // --- the settle moment ---
      for (const row of rows) {
        const mark = row.getAttribute(MARK_ATTR);
        const key = rowKey(row);
        const wasRunning = settleWatch.get(key) === true;
        const running = mark === "running";

        // A run that ended normally gets one pulse. An interrupted or promoted
        // row is skipped: a green flash there would misreport what happened.
        if (settings.notifyOnCompletion && wasRunning && !running && mark !== "interrupted") {
          if (row.getAttribute(SETTLED_ATTR) !== "true") {
            row.setAttribute(SETTLED_ATTR, "true");
            const clear = () => {
              row.removeAttribute(SETTLED_ATTR);
              row.removeEventListener("animationend", clear);
            };
            row.addEventListener("animationend", clear, { once: true });
            // A reduced-motion user gets no animationend, so the attribute is
            // cleared on a timer as well; the flag is idempotent either way.
            setTimeout(clear, 1400);
          }
        }
        settleWatch.set(key, running);
      }
      for (const key of [...settleWatch.keys()]) {
        if (!seen.has(key)) settleWatch.delete(key);
      }
    }

    /** The attribute value for a phase, used when summarising a workspace. */
    function markOf(phase) {
      return PHASE[phase]?.mark ?? null;
    }

    /**
     * Reduce one workspace's promoted rows to the single line its header states.
     *
     * The header speaks for its most urgent phase — so a workspace with one
     * waiting and one running session says it is waiting, because that is the
     * one that needs the user — and the count belongs to that phase alone.
     * Summing across phases would let a workspace with one running and one
     * finishing row claim "2 个运行中", which neither row says.
     *
     * @param entry - the tally collected for this group, or undefined.
     * @returns the summary, or null when nothing promotes.
     */
    function summarise(entry) {
      if (entry === undefined || entry.tally.size === 0) return null;
      let dominant = null;
      for (const phase of entry.tally.keys()) {
        if (dominant === null || PHASE[phase].rank > PHASE[dominant].rank) dominant = phase;
      }
      // A workspace whose waiting rows all want the same thing says that thing;
      // a mixed bag falls back to the phase's own word.
      const word = dominant === "pending" && entry.words.size === 1 ? [...entry.words][0] : null;
      return {
        phase: dominant,
        mark: markOf(dominant),
        rank: PHASE[dominant].rank,
        count: entry.tally.get(dominant),
        label: word ?? PHASE[dominant].label,
      };
    }

    /**
     * Rows that were running on the previous pass, for the settle animation.
     *
     * Kept separate from the attention memory because it answers a different
     * question: the memory asks "what is this row now", this asks "was it live a
     * moment ago".
     */
    const settleWatch = new Map();

    /**
     * The last attention phase each workspace reported, keyed by its own
     * `data-row-key`.
     *
     * This exists for one situation the row memory cannot cover: the official
     * list keeps five idle sessions on screen and holds the rest behind its
     * overflow control. A session that finished while the user was away can be
     * one of the held rows, and then nothing in the DOM says the workspace is
     * worth looking at — the row that would have said it is simply not
     * rendered. Remembering the phase the group reached while that row was
     * still visible is what keeps a completion findable through a collapse.
     *
     * It is deliberately bounded by the same clock as an unread completion, so
     * a remembered phase cannot outlive the thing it reports.
     */
    const groupMemory = new Map();

    /**
     * Mount the observer.
     *
     * The observer is attached to `document.body` with `subtree` so it also
     * survives the sidebar being unmounted and remounted (a collapsed rail, a
     * narrow viewport, a plugin slot re-registering). The paint pass is
     * coalesced into one animation frame because a single React commit mutates
     * many nodes and repainting per record would be wasted work.
     *
     * A slow timer drives the same pass as well, because a row crosses the
     * retention windows by the passage of time rather than by a DOM change:
     * without it, a promoted completion could never go quiet on its own, and a
     * `seen` row could never finish its dwell.
     *
     * @param ctx - plugin context.
     */
    function register(ctx) {
      const disposeStyle = insertStyle();
      const memory = new Map();
      let settings = { ...DEFAULT_SETTINGS };
      let scheduled = false;

      const run = () => {
        scheduled = false;
        try {
          paint(settings, memory);
        } catch {
          // A paint failure must never break the host UI; the next mutation retries.
        }
      };

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(run);
      };

      const observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "class", "aria-selected"],
      });

      // One minute is far finer than any window it guards, so the cost is a
      // rounding error next to their resolution.
      const tick = setInterval(schedule, 60 * 1000);

      // The Host half is optional: a composition carrying only the client
      // bundle keeps the defaults, which is a working configuration.
      const load = async () => {
        try {
          const response = await fetch(SETTINGS_PATH, { headers: { accept: "application/json" } });
          if (!response.ok) return;
          const payload = await response.json();
          settings = mergeSettings(payload?.settings);
          schedule();
        } catch {
          /* defaults already applied */
        }
      };
      void load();

      // Re-read settings when the tab regains focus, so a settings change made
      // in another window lands without a reload.
      const onFocus = () => {
        void load();
      };
      window.addEventListener("focus", onFocus);

      schedule();

      ctx.effect(
        () => () => {
          observer.disconnect();
          clearInterval(tick);
          window.removeEventListener("focus", onFocus);
          disposeStyle();
          memory.clear();
          settleWatch.clear();
        },
        "busy-workspace: sidebar observer",
      );

      // Named so the Host-side plugin inventory can see what mounted.
      ctx.logger?.info?.("busy-workspace: sidebar indicator active");
    }

    /** Client entry point. */
    function apply(ctx) {
      register(ctx);
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return exports;
  },
});
