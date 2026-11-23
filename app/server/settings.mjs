// Per-user settings (A9_DEFAULTDRV 2026-11-22): stored in <data>/private/settings.json, never shipped (data/private is gitignored).
// Pure helpers so the route logic can be tested without a running server (app/tests/settings.test.ts).
import fs from "node:fs";
import path from "node:path";
import { renameRetry } from "./fsx.mjs"; // W1_WINDOWS

export const SETTINGS_KEYS = ["defaultDriverId", "defaultProject", "defaultTab", "defaultSection"];
/** Tabs the app can open on (A10_NEWBOX_DEFAULT; B1_SHELL added boards, door, ib, project). */
export const TABS = ["design", "fix", "drivers", "help", "boards", "door", "ib", "project"];
/** Sections (B1_SHELL, R37): same ids as app/src/ui/sections.ts. */
export const SECTIONS = ["subwoofer", "door", "ib", "home", "computer"];
const SAFE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

/** Path of the settings file for a data folder. */
export const settingsFile = (dataDir) => path.join(dataDir, "private", "settings.json");

/** Read the settings; a missing or broken file gives {}. */
export function readSettings(dataDir) {
  try { const s = JSON.parse(fs.readFileSync(settingsFile(dataDir), "utf8")); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; } catch { return {}; }
}

/**
 * Check and merge a change into the stored settings.
 * patch: object with known keys only; defaultDriverId must be "" / null (clear) or the id of an existing driver;
 * defaultProject (A10) "" / null (clear) or the name of an existing project; defaultTab (A10) "" / null (clear) or one of TABS;
 * defaultSection (B1) "" / null (clear) or one of SECTIONS.
 * driverExists(id) / projectExists(name) -> boolean. Returns { ok: true, settings } or { ok: false, code, error }.
 */
export function validateSettings(current, patch, driverExists, projectExists = () => false) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, code: 400, error: "settings must be a JSON object" };
  const unknown = Object.keys(patch).filter((k) => !SETTINGS_KEYS.includes(k));
  if (unknown.length) return { ok: false, code: 400, error: "unknown setting: " + unknown.join(", ") };
  const next = { ...current };
  if ("defaultDriverId" in patch) {
    const id = patch.defaultDriverId;
    if (id === "" || id === null) delete next.defaultDriverId;
    else if (typeof id !== "string" || !SAFE.test(id)) return { ok: false, code: 400, error: "bad driver id" };
    else if (!driverExists(id)) return { ok: false, code: 404, error: "no driver with id " + id };
    else next.defaultDriverId = id;
  }
  if ("defaultProject" in patch) {
    const n = patch.defaultProject;
    if (n === "" || n === null) delete next.defaultProject;
    else if (typeof n !== "string" || !SAFE.test(n)) return { ok: false, code: 400, error: "bad project name" };
    else if (!projectExists(n)) return { ok: false, code: 404, error: "no project named " + n };
    else next.defaultProject = n;
  }
  if ("defaultTab" in patch) {
    const t = patch.defaultTab;
    if (t === "" || t === null) delete next.defaultTab;
    else if (!TABS.includes(t)) return { ok: false, code: 400, error: "defaultTab must be one of " + TABS.join(", ") };
    else next.defaultTab = t;
  }
  if ("defaultSection" in patch) {
    const x = patch.defaultSection;
    if (x === "" || x === null) delete next.defaultSection;
    else if (!SECTIONS.includes(x)) return { ok: false, code: 400, error: "defaultSection must be one of " + SECTIONS.join(", ") };
    else next.defaultSection = x;
  }
  return { ok: true, settings: next };
}

/** Validate and write (atomic). Same return as validateSettings. */
export function writeSettings(dataDir, patch, driverExists, projectExists) {
  const r = validateSettings(readSettings(dataDir), patch, driverExists, projectExists);
  if (!r.ok) return r;
  const f = settingsFile(dataDir); fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(r.settings, null, 2) + "\n"); renameRetry(tmp, f);
  return r;
}
