/**
 * Host half of dsh-plugin-busy-workspace.
 *
 * Owns one small durable settings record so the visual behaviour survives a
 * reload, and exposes it over the plugin's own JSON route. The client half
 * reads that route once at mount and falls back to its defaults when the Host
 * is unreachable, so the indicator still works on a composition that only
 * carries the client bundle.
 *
 * The Host deliberately owns no DOM and no session state: "running" is read
 * from the official workspace-browser projection in the browser, where it is
 * already derived. This file exists for configuration and observability only.
 *
 * @module dsh-plugin-busy-workspace
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Stable Cordis plugin name. */
const name = "busy-workspace";

/** Route prefix owned by this plugin; the client half reads exactly this path. */
const API_PREFIX = "/busy-workspace/api";
const API_PATH_SETTINGS = `${API_PREFIX}/settings`;

/**
 * Defaults, mirrored by the client half. Kept in one literal so the two halves
 * cannot drift on a field name.
 */
const DEFAULT_SETTINGS = {
  /** Pin workspaces holding a running session above the rest of the list. */
  pinBusyWorkspaces: true,
  /** Draw the highlighted running-session row. */
  highlightRunningSessions: true,
  /** Tint a workspace header that contains a running session. */
  highlightBusyWorkspaceHeaders: true,
  /** Play the settle animation when a session stops running. */
  notifyOnCompletion: true,
  /** Accent strength, 0..1. Scales border/background alpha without changing hue. */
  intensity: 0.6,
};

/** Bounds for {@link DEFAULT_SETTINGS.intensity}. */
const INTENSITY_MIN = 0;
const INTENSITY_MAX = 1;

/** Settings file lives under the Harness home, beside the other plugin state. */
function settingsPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME !== "" ? process.env.DSH_HOME : join(homedir(), ".dsh");
  return join(home, "busy-workspace", "settings.json");
}

/** Clamp one numeric field, falling back to the default on a non-number. */
function clampNumber(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Coerce an arbitrary parsed document into a complete, in-range settings
 * record. Unknown keys are dropped rather than carried, so a stale file cannot
 * leak fields into the client half.
 * @param raw - parsed JSON, or anything when the file was absent.
 * @returns a complete settings record.
 */
function normalizeSettings(raw) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  return {
    pinBusyWorkspaces: typeof source.pinBusyWorkspaces === "boolean" ? source.pinBusyWorkspaces : DEFAULT_SETTINGS.pinBusyWorkspaces,
    highlightRunningSessions:
      typeof source.highlightRunningSessions === "boolean"
        ? source.highlightRunningSessions
        : DEFAULT_SETTINGS.highlightRunningSessions,
    highlightBusyWorkspaceHeaders:
      typeof source.highlightBusyWorkspaceHeaders === "boolean"
        ? source.highlightBusyWorkspaceHeaders
        : DEFAULT_SETTINGS.highlightBusyWorkspaceHeaders,
    notifyOnCompletion:
      typeof source.notifyOnCompletion === "boolean" ? source.notifyOnCompletion : DEFAULT_SETTINGS.notifyOnCompletion,
    intensity: clampNumber(source.intensity, DEFAULT_SETTINGS.intensity, INTENSITY_MIN, INTENSITY_MAX),
  };
}

/** Read the durable settings record; an absent or unreadable file reads as defaults. */
async function readSettings() {
  try {
    const text = await readFile(settingsPath(), "utf8");
    return normalizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Write the settings record through a temp file and a rename, so a crash
 * mid-write cannot leave a half-written document behind.
 * @param settings - the complete record to persist.
 */
async function writeSettings(settings) {
  const target = settingsPath();
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  await writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

/** JSON response helper. */
function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(body)),
  });
  res.end(body);
}

/** Read a bounded JSON body; an absent or malformed body reads as an empty object. */
async function readJsonBody(req, limit = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return {};
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Mount the settings route.
 *
 * The route is registered through the webserver's named-route seat when the
 * composition offers one; otherwise the plugin registers a bare handler and
 * reports the absence, because a client half that cannot reach it simply keeps
 * its defaults. Neither outcome is fatal.
 *
 * @param ctx - plugin context.
 */
function apply(ctx) {
  const logger = ctx.logger ?? console;

  const handleSettings = async (req, res) => {
    const method = req.method ?? "GET";
    if (method === "GET") {
      writeJson(res, 200, { ok: true, settings: await readSettings(), defaults: DEFAULT_SETTINGS });
      return;
    }
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const body = await readJsonBody(req);
      const current = await readSettings();
      const merged = normalizeSettings({ ...current, ...(body.settings ?? body) });
      try {
        await writeSettings(merged);
      } catch (error) {
        logger.warn?.("busy-workspace: settings write failed");
        logger.warn?.(error);
        writeJson(res, 500, { ok: false, code: "write-failed" });
        return;
      }
      writeJson(res, 200, { ok: true, settings: merged, defaults: DEFAULT_SETTINGS });
      return;
    }
    writeJson(res, 405, { ok: false, code: "method-not-allowed" });
  };

  const webserver = ctx.get?.("webServer");
  if (webserver !== undefined && typeof webserver.route === "function") {
    ctx.effect(
      () => webserver.route(API_PATH_SETTINGS, handleSettings),
      "busy-workspace: settings route",
    );
    logger.info?.("busy-workspace: settings route mounted at %s", API_PATH_SETTINGS);
  } else {
    logger.info?.("busy-workspace: no webserver route seat; the client half uses its defaults");
  }
}

export { apply, name, DEFAULT_SETTINGS, API_PATH_SETTINGS, normalizeSettings };
