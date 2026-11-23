// Project model v2 storage helpers (B1_SHELL, R42, 2026-11-23): backup of a v1 project before its first v2 write, "delete" =
// move to <data>/private/deleted, My items (data/items), branding logo (data/branding). Pure fs helpers, tested in
// app/tests/projectv2.test.ts. Schema: docs/project_model_v2.md.
import fs from "node:fs";
import path from "node:path";
import { renameRetry } from "./fsx.mjs"; // W1_WINDOWS

export const SAFE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
/** Features this server has, reported by GET /api/health (the app checks them before using v2 routes). */
export const FEATURES = ["projects-v2", "items", "trash", "branding", "project-delete", "parts", "driver-aliases", "boards-plywood"]; // B3_PARTS_DB: parts, driver-aliases; B7: boards-plywood
export const isV2 = (o) => !!o && o.format === 2 && Array.isArray(o.items);
const today = () => new Date().toISOString().slice(0, 10);
export const deletedDir = (dataDir) => path.join(dataDir, "private", "deleted");

/** Before a v2 document is written over a v1 project file: copy the v1 file to
 * <data>/private/deleted/<name>.bak-<YYYY-MM-DD>-pre-B1.json (kept if one exists already). Returns the backup path or null. */
export function backupBeforeV2(dataDir, file, name, incoming) {
  if (!isV2(incoming) || !fs.existsSync(file)) return null;
  let cur; try { cur = JSON.parse(fs.readFileSync(file, "utf8")); } catch { cur = null; }
  if (isV2(cur)) return null;
  const dir = deletedDir(dataDir); fs.mkdirSync(dir, { recursive: true });
  const bak = path.join(dir, `${name}.bak-${today()}-pre-B1.json`);
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  return bak;
}

/** Move a file or folder to <data>/private/deleted/<label>.<timestamp><ext>; never a real delete. Returns the new path or null. */
export function moveToDeleted(dataDir, p, label) {
  if (!fs.existsSync(p)) return null;
  const dir = deletedDir(dataDir); fs.mkdirSync(dir, { recursive: true });
  const ext = fs.statSync(p).isDirectory() ? "" : path.extname(p);
  const dest = path.join(dir, `${label}.${Date.now()}${ext}`);
  renameRetry(p, dest);
  return dest;
}

/** Write any JSON into the deleted folder (an item removed from a project keeps a copy there). */
export function writeToDeleted(dataDir, label, obj) {
  const dir = deletedDir(dataDir); fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${label}.${Date.now()}.json`);
  fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
  return dest;
}

/** One line per project for the lists (menu, Open a project): format, section and item count added in B1. */
export function projectSummary(p) {
  const v2 = isV2(p);
  return { name: p.name, title: p.title, format: v2 ? 2 : 1, section: v2 ? p.section ?? "subwoofer" : "subwoofer", items: v2 ? p.items.length : 1, saved: p.saved };
}
/** One line per My items entry. */
export const itemSummary = (it) => ({ id: it.id, name: it.name, section: it.section, kind: it.kind, saved: it.saved });

/** The logo file in <data>/branding (logo.svg, logo.png, logo.webp or logo.jpg; first found), or null. */
export const LOGO_NAMES = ["logo.svg", "logo.png", "logo.webp", "logo.jpg"];
export function findLogo(dataDir) {
  for (const n of LOGO_NAMES) if (fs.existsSync(path.join(dataDir, "branding", n))) return n;
  return null;
}
