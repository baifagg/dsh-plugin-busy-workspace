/**
 * Client half of dsh-plugin-busy-workspace.
 *
 * Why this is a DOM observer rather than a React component: the sidebar
 * session list already derives every fact this plugin needs. The official
 * workspace browser renders one `StateDot` per session row, and that primitive
 * carries the running state as a `data-state="ongoing"` attribute (see
 * `dsh-client-ui-primitives`). Reading that attribute means this plugin never
 * re-derives activity from the transport, never races the official
 * projection, and cannot disagree with the status dot the user already sees.
 *
 * Three effects, all expressed as attributes plus CSS so React re-renders
 * never fight the plugin:
 *
 * 1. A workspace group holding an `ongoing` row is marked busy and lifted to
 *    the top of the list through CSS `order`.
 * 2. The `ongoing` row itself gets an accent frame, a tinted title, and a
 *    live sheen.
 * 3. A row that leaves `ongoing` plays one settle animation, so the moment a
 *    session finishes is visible without watching the dot.
 *
 * Every colour is read from the active theme's `--dsw-alias-*` tokens, so the
 * plugin inherits whatever theme is installed instead of hardcoding a palette.
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
    };

    /**
     * The official session row, workspace group, and status-dot selectors.
     *
     * The class names carry a build-time hash prefix produced by the CSS-module
     * loader, so they are matched by their stable suffix rather than in full:
     * `[class*="_sessionRow"]` survives a hash change, an exact class does not.
     * The primitive's own attribute is the real contract and is matched
     * exactly.
     */
    const SELECTOR = {
      /** One workspace group section (a header row plus its session rows). */
      group: '[class*="_groupSection"]',
      /** One workspace (project) header row. */
      projectRow: '[class*="_projectRow"]',
      /** One session row in a group or the flat list. */
      sessionRow: '[class*="_sessionRow"]',
      /** The session title span inside a row. */
      title: '[class*="_title"]',
      /** The scroll container the group sections live in. */
      list: '[class*="_list"][role="tree"]',
      /** Status dot primitive: `data-state` is `ongoing` | `warning` | `done`. */
      statusDot: "[data-state]",
    };

    /** Root attribute marking a workspace group that holds a running session. */
    const BUSY_ATTR = "data-busy-workspace";
    /** Root attribute marking a session row that is currently running. */
    const RUNNING_ATTR = "data-busy-session";
    /** Attribute carrying the settle animation state (`settled` while playing). */
    const SETTLED_ATTR = "data-busy-settled";
    /** Root attribute exposing the resolved intensity for CSS to scale against. */
    const INTENSITY_ATTR = "data-busy-intensity";

    /** Style element identity, so a reload replaces rather than duplicates it. */
    const STYLE_ID = "dsh-plugin-busy-workspace/css";

    /**
     * The plugin's stylesheet.
     *
     * Palette discipline: every colour comes from a `--dsw-alias-*` token the
     * active theme defines, with a `color-mix` against the theme's own surface
     * for translucency. That is what makes one stylesheet work across the
     * built-in light/dark themes and the community theme packs alike: the token
     * names are the stable contract, the values are the theme's business.
     *
     * `--bw-accent` is the one role the plugin picks: `state-business-primary`
     * is the blue-family "in progress" accent the Harness itself uses for
     * active-work affordances. `state-success-primary` supplies the settle
     * colour. Both are semantic state tokens rather than brand tokens, so they
     * stay legible when the brand hue is orange, purple, or green.
     */
    const CSS = `
:root {
  --bw-intensity: 0.6;
  --bw-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  --bw-settle: var(--dsw-alias-state-success-primary, #16a34a);
}

/* ---------------------------------------------------------------- *
 * 1. Busy workspace group, lifted to the top of the list
 * ---------------------------------------------------------------- */

/*
 * The list is a flex column, so visual order is expressed as \`order\` without
 * touching the DOM. That matters: reordering nodes directly would fight
 * React's reconciliation on the next render, while an order value is a purely
 * presentational hint the renderer never reads back.
 */
[class*="_list"][role="tree"] {
  display: flex;
  flex-direction: column;
}

[class*="_groupSection"][data-busy-workspace="true"] {
  order: -1;
}

/* A hairline accent on the busy group, so the lifted block reads as deliberate. */
[class*="_groupSection"][data-busy-workspace="true"] > [class*="_projectRow"] {
  position: relative;
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--bw-accent) calc(var(--bw-intensity) * 13%),
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--bw-accent) calc(var(--bw-intensity) * 34%), transparent);
  transition: background 160ms var(--ds-ease-in-out, ease),
              box-shadow 160ms var(--ds-ease-in-out, ease);
}

/* The accent bar sits on the leading edge of the busy workspace header. */
[class*="_groupSection"][data-busy-workspace="true"] > [class*="_projectRow"]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  translate: 0 -50%;
  width: 2px;
  height: 16px;
  border-radius: 1px;
  background: var(--bw-accent);
  opacity: calc(0.45 + var(--bw-intensity) * 0.55);
}

/* The workspace label picks up the accent so the header reads as active. */
[class*="_groupSection"][data-busy-workspace="true"] > [class*="_projectRow"] [class*="_projectText"] {
  color: color-mix(
    in srgb,
    var(--bw-accent) 72%,
    var(--dsw-alias-label-primary, currentColor)
  );
  font-weight: 550;
}

/* ---------------------------------------------------------------- *
 * 2. The running session row
 * ---------------------------------------------------------------- */

/**
 * The frame is drawn with a box-shadow ring rather than a border. A border
 * would change the row's box size and shift every row below it by two pixels
 * the moment a session starts; a ring is painted outside the box model, so the
 * list never moves.
 */
[class*="_sessionRow"][data-busy-session="true"] {
  position: relative;
  background: color-mix(
    in srgb,
    var(--bw-accent) calc(var(--bw-intensity) * 14%),
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--bw-accent) calc(var(--bw-intensity) * 46%), transparent);
  transition: background 180ms var(--ds-ease-in-out, ease),
              box-shadow 180ms var(--ds-ease-in-out, ease);
}

/* Hovering a running row deepens the tint instead of replacing it. */
[class*="_sessionRow"][data-busy-session="true"]:hover {
  background: color-mix(
    in srgb,
    var(--bw-accent) calc(var(--bw-intensity) * 21%),
    transparent
  );
}

/* The title carries the accent; this is the "which one is live" signal at a glance. */
[class*="_sessionRow"][data-busy-session="true"] [class*="_title"] {
  color: color-mix(
    in srgb,
    var(--bw-accent) 78%,
    var(--dsw-alias-label-primary, currentColor)
  );
  font-weight: 550;
}

/*
 * A slow sheen travels the leading edge of a running row. It is the only
 * motion in the plugin and it is deliberately low contrast: the row must read
 * as active from across the room, not strobe while the user is typing.
 */
[class*="_sessionRow"][data-busy-session="true"]::after {
  content: "";
  position: absolute;
  inset-block: 3px;
  inset-inline-start: 0;
  width: 2px;
  border-radius: 1px;
  background: linear-gradient(
    180deg,
    transparent,
    var(--bw-accent) 45%,
    var(--bw-accent) 55%,
    transparent
  );
  opacity: calc(0.5 + var(--bw-intensity) * 0.5);
  animation: bw-breathe 2.4s var(--ds-ease-in-out, ease-in-out) infinite;
  pointer-events: none;
}

@keyframes bw-breathe {
  0%, 100% { opacity: calc(0.28 + var(--bw-intensity) * 0.28); }
  50%      { opacity: calc(0.70 + var(--bw-intensity) * 0.30); }
}

/* ---------------------------------------------------------------- *
 * 3. The settle moment
 * ---------------------------------------------------------------- */

/*
 * One short pulse when a session leaves \`ongoing\`. The animation is attached
 * only while the attribute is present, and the attribute is removed on
 * animationend, so a re-render mid-animation cannot restart it.
 */
[class*="_sessionRow"][data-busy-settled="true"] {
  animation: bw-settle 1.1s var(--ds-ease-in-out, ease-out) 1;
}

@keyframes bw-settle {
  0% {
    background: color-mix(
      in srgb,
      var(--bw-settle) calc(var(--bw-intensity) * 34%),
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
  [class*="_sessionRow"][data-busy-session="true"]::after {
    animation: none;
    opacity: calc(0.5 + var(--bw-intensity) * 0.5);
  }
  [class*="_sessionRow"][data-busy-settled="true"],
  [class*="_sessionRow"][data-busy-settled="true"] [class*="_title"] {
    animation: none;
  }
}
`;

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

    /** Read the model's status state, or null when the row carries no dot. */
    function statusStateOf(row) {
      // The visible dot is the first `[data-state]` descendant; the search row
      // and the session row both render exactly one.
      const dot = row.querySelector(SELECTOR.statusDot);
      if (dot === null) return null;
      return dot.getAttribute("data-state");
    }

    /** True when the row's own status is `ongoing` (running, not waiting). */
    function isRowRunning(row) {
      return statusStateOf(row) === "ongoing";
    }

    /**
     * Resolve the closest ancestor group section for one row, or null when the
     * row is rendered in the flat list (no group).
     */
    function groupOf(row) {
      return row.closest(SELECTOR.group);
    }

    /**
     * Apply the plugin's three marks to the current DOM.
     *
     * Called on every mutation batch. It only writes when a value actually
     * changes, so the observer cannot drive itself in a loop through its own
     * attribute writes.
     *
     * @param settings - resolved settings record.
     * @param remember - records a row's previous running state for the settle pass.
     */
    function paint(settings, remember) {
      const root = document.documentElement;
      root.setAttribute(INTENSITY_ATTR, String(settings.intensity));

      // --- workspace groups ---
      const groups = document.querySelectorAll(`${SELECTOR.list} > ${SELECTOR.group}`);
      for (const group of groups) {
        const rows = group.querySelectorAll(SELECTOR.sessionRow);
        let busy = false;
        for (const row of rows) {
          if (isRowRunning(row)) {
            busy = true;
            break;
          }
        }
        const want = settings.pinBusyWorkspaces || settings.highlightBusyWorkspaceHeaders ? busy : false;
        const next = want ? "true" : "false";
        if (group.getAttribute(BUSY_ATTR) !== next) group.setAttribute(BUSY_ATTR, next);
      }

      // --- session rows ---
      const rows = document.querySelectorAll(SELECTOR.sessionRow);
      for (const row of rows) {
        const running = isRowRunning(row);
        const key = rowKey(row);
        const was = remember.get(key);
        if (was !== undefined) {
          const next = running ? "true" : "false";
          if (row.getAttribute(RUNNING_ATTR) !== next) row.setAttribute(RUNNING_ATTR, next);
        } else if (running) {
          row.setAttribute(RUNNING_ATTR, "true");
        }
        if (!settings.highlightRunningSessions) row.removeAttribute(RUNNING_ATTR);

        // Settle: a row that was running and is running no longer.
        if (settings.notifyOnCompletion && was === true && !running) {
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
        remember.set(key, running);
      }
    }

    /**
     * A stable identity for one row across renders.
     *
     * Session rows are not reachable by id in the DOM, so identity is taken
     * from the row's position in its list plus its title. That is stable while
     * a session stays in place, which is the only window the settle animation
     * needs; a row that moves is treated as new and simply does not animate.
     */
    function rowKey(row) {
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
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const value = raw[key];
        if (key === "intensity") {
          if (typeof value === "number" && Number.isFinite(value)) {
            out.intensity = Math.min(1, Math.max(0, value));
          }
        } else if (typeof value === "boolean") {
          out[key] = value;
        }
      }
      return out;
    }

    /**
     * Mount the observer.
     *
     * The observer is attached to `document.body` with `subtree` so it also
     * survives the sidebar being unmounted and remounted (a collapsed rail, a
     * narrow viewport, a plugin slot re-registering). The paint pass is
     * coalesced into one animation frame because a single React commit mutates
     * many nodes and repainting per record would be wasted work.
     *
     * @param ctx - plugin context.
     */
    function register(ctx) {
      const disposeStyle = insertStyle();
      const remember = new Map();
      let settings = { ...DEFAULT_SETTINGS };
      let scheduled = false;

      const run = () => {
        scheduled = false;
        try {
          paint(settings, remember);
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
        attributeFilter: ["data-state", "class"],
      });

      // The Host half is optional: a composition carrying only the client
      // bundle keeps the defaults, which is a working configuration.
      void (async () => {
        try {
          const response = await fetch(SETTINGS_PATH, { headers: { accept: "application/json" } });
          if (!response.ok) return;
          const payload = await response.json();
          settings = mergeSettings(payload?.settings);
          schedule();
        } catch {
          /* defaults already applied */
        }
      })();

      // Re-read settings when the tab regains focus, so a settings change made
      // in another window lands without a reload.
      const onFocus = () => {
        void (async () => {
          try {
            const response = await fetch(SETTINGS_PATH, { headers: { accept: "application/json" } });
            if (!response.ok) return;
            const payload = await response.json();
            settings = mergeSettings(payload?.settings);
            schedule();
          } catch {
            /* keep the last known settings */
          }
        })();
      };
      window.addEventListener("focus", onFocus);

      schedule();

      ctx.effect(
        () => () => {
          observer.disconnect();
          window.removeEventListener("focus", onFocus);
          disposeStyle();
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
