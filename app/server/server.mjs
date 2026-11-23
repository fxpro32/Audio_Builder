// Audio_Builder local server: serves the built web app and stores drivers/projects as JSON under the project's data/ folder.
// Run: npm start (after npm run build). Port: PORT env or 8420. Binds 0.0.0.0 so the host can reach it if the port is published;
// on Windows it binds 127.0.0.1 (no firewall prompt, not open to the network). AB_HOST overrides both (W1_WINDOWS).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { readSettings, writeSettings } from "./settings.mjs";
import { insideDir, renameRetry, safeId } from "./fsx.mjs"; // W1_WINDOWS: Windows-safe rename, path check, ids
import { backupBeforeV2, FEATURES, findLogo, itemSummary, LOGO_NAMES, moveToDeleted, projectSummary, writeToDeleted } from "./store2.mjs"; // B1_SHELL

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..");
const DIST = path.join(APP, "dist");
const DATA = process.env.AB_DATA_DIR ? path.resolve(process.env.AB_DATA_DIR) : path.resolve(APP, "..", "data"); // AB_DATA_DIR: isolated copy for test runs
const LIBRARY = path.join(DATA, "drivers", "library"); // bundled read-only driver libraries (scripts/import_driver_libraries.mjs)
// P1_PUBLIC_DATA: private overlay. A file at data/private/<same relative path> (gitignored: retailer prices, supplier catalogues,
// retailer-listing records) replaces the public file of the same name, for the driver libraries, the parts bundles and the
// board catalogues (scripts/lib_overlay.mjs, scripts/public_data/split.py). A fresh clone has only the public files.
const PRIVATE = path.join(DATA, "private");
const PRIVATE_LIBRARY = path.join(PRIVATE, "drivers", "library");
/** data/private/<rel> when it exists, else data/<rel>. */
const overlay = (...rel) => { const p = path.join(PRIVATE, ...rel); return fs.existsSync(p) ? p : path.join(DATA, ...rel); };
const DIRS = { drivers: path.join(DATA, "drivers"), private: path.join(DATA, "private", "drivers"), projects: path.join(DATA, "projects"), items: path.join(DATA, "items") }; // items: My items (B1_SHELL)
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
const PORT = Number(process.env.PORT || 8420);
const SAFE = { test: (s) => safeId(s) }; // same rule as before; on Windows the device names (con, nul, com1...) are refused too (W1_WINDOWS)
const HOST = process.env.AB_HOST || (process.platform === "win32" ? "127.0.0.1" : "0.0.0.0"); // W1_WINDOWS
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".glb": "model/gltf-binary", ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg" };

const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const readBody = (req, limit = 50e6) => new Promise((ok, bad) => { const chunks = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > limit) { bad(new Error("too large")); req.destroy(); } else chunks.push(c); }); req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", bad); });
const listJson = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } }).filter(Boolean) : [];
let libCache = null; // library bundles are large and change only when re-imported
// B3_PARTS_DB: a bundle may name older bundles it replaces (`supersedes`, e.g. car-subs -> hp-car-subs); those stay on disk
// (old projects' ids are mapped by the newer bundle's `aliases`) but are not listed twice.
const readLibrary = () => {
  const names = new Set(); for (const d of [LIBRARY, PRIVATE_LIBRARY]) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith(".json")) names.add(f);
  if (!names.size) return { list: [], meta: [], aliases: {} };
  const files = [...names].sort().map((f) => overlay("drivers", "library", f)); // P1: the private copy of a bundle wins
  const key = files.map((f) => f + fs.statSync(f).mtimeMs).join("|");
  if (libCache?.key === key) return libCache;
  const bundles = [];
  for (const f of files) { try { bundles.push(JSON.parse(fs.readFileSync(f, "utf8"))); } catch { /* skip a broken bundle */ } }
  const gone = new Set(bundles.flatMap((b) => (Array.isArray(b.supersedes) ? b.supersedes : [])));
  const list = [], meta = [], aliases = {};
  for (const b of bundles) {
    if (gone.has(b.source)) continue;
    for (const d of b.drivers || []) list.push({ ...d, library: d.library || b.source, licence: b.licence });
    const { drivers, ...m } = b; meta.push(m); Object.assign(aliases, b.aliases || {});
  }
  libCache = { key, list, meta, aliases, gz: undefined };
  return libCache;
};
const listLibrary = () => readLibrary().list;
const libraryInfo = () => readLibrary().meta;
/** A driver id from an older bundle (B3: hp-car-subs) -> its id now; unchanged when not an alias. */
const resolveDriverId = (id) => readLibrary().aliases[id] ?? id;
// B3_PARTS_DB: gzip large JSON answers when the browser accepts it (the driver list is several MB)
const sendJsonGz = (req, res, buf) => {
  if (!/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) return send(res, 200, buf);
  res.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip", "Cache-Control": "no-store" }); res.end(zlib.gzipSync(buf, { level: 6 }));
};
const PARTS = path.join(DATA, "parts"); // B3_PARTS_DB: data/parts/<category>.json (scripts/import_parts.mjs); P1: data/private/parts/ wins
const PART_CATS = ["amplifiers", "dsp", "capacitors", "batteries", "fuses", "distribution", "cable", "interconnects", "terminals", "wiring_kits"];
const writeJsonAtomic = (file, obj) => { const tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); renameRetry(tmp, file); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "api") {
      const [, kind, id, sub, file] = parts;
      if (kind === "health") return send(res, 200, { ok: true, data: DATA, features: FEATURES });
      if (kind === "branding") {
        // B1_SHELL (R43): the logo, data/branding/logo.svg|png|webp|jpg (README there); null until a logo file is added
        if (!id && req.method === "GET") return send(res, 200, { logo: findLogo(DATA) });
        if (id && LOGO_NAMES.includes(id) && req.method === "GET") { const f = path.join(DATA, "branding", id); return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)]) : send(res, 404, { error: "no logo" }); }
        return send(res, 404, { error: "unknown branding file" });
      }
      if (kind === "trash" && id && SAFE.test(id) && req.method === "PUT") {
        // B1_SHELL: an item removed from a project keeps a copy in data/private/deleted
        let o; try { o = JSON.parse((await readBody(req)).toString("utf8")); } catch { return send(res, 400, { error: "bad JSON" }); }
        return send(res, 200, { ok: true, path: writeToDeleted(DATA, id, o) });
      }
      if (kind === "items") {
        // B1_SHELL (R42, R43): My items, one JSON per item in data/items; delete = move to data/private/deleted
        if (req.method === "GET" && !id) return send(res, 200, listJson(DIRS.items).map(itemSummary).sort((a, b) => String(b.saved || "").localeCompare(String(a.saved || ""))));
        if (!id || !SAFE.test(id)) return send(res, 400, { error: "bad item id" });
        const f = path.join(DIRS.items, id + ".json");
        if (req.method === "GET") return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f)) : send(res, 404, { error: "not found" });
        if (req.method === "PUT") {
          let it; try { it = JSON.parse((await readBody(req)).toString("utf8")); } catch { return send(res, 400, { error: "bad JSON" }); }
          if (!it || typeof it !== "object" || Array.isArray(it) || typeof it.kind !== "string" || typeof it.section !== "string") return send(res, 400, { error: "an item needs kind and section" });
          it.id = id; it.format = 2; it.type = "item"; it.saved = new Date().toISOString(); writeJsonAtomic(f, it); return send(res, 200, { ok: true, saved: it.saved });
        }
        if (req.method === "DELETE") return send(res, 200, { ok: true, moved: moveToDeleted(DATA, f, `item.${id}`) });
      }
      if (kind === "boards" && (!id || id === "plywood") && req.method === "GET") {
        // A13_BOARDS (MDF) and B7_PLYWOOD_BOARDS (plywood), read-only. P1_PUBLIC_DATA: the supplier catalogue with prices
        // (data/private/boards/mdf_sheets_au.json or plywood_sheets_au.json) when present, else the public generic sizes
        // (data/boards/generic_sheets.json: no prices, no suppliers), its MDF or its plywood records.
        const f = path.join(PRIVATE, "boards", id ? "plywood_sheets_au.json" : "mdf_sheets_au.json");
        if (fs.existsSync(f)) return send(res, 200, fs.readFileSync(f));
        const g = path.join(DATA, "boards", "generic_sheets.json");
        if (!fs.existsSync(g)) return send(res, 404, { error: "no board catalogue (data/boards/generic_sheets.json)" });
        const cat = JSON.parse(fs.readFileSync(g, "utf8")); const mdf = (s) => s.category === "standard" || s.category === "moisture_resistant";
        return send(res, 200, { ...cat, sheets: (cat.sheets || []).filter((s) => (id ? !mdf(s) : mdf(s))) });
      }
      if (kind === "parts" && req.method === "GET") {
        // B3_PARTS_DB (R40): parts database, one bundle per category, read-only; the browser loads a category when it is opened
        if (!id) { const f = overlay("parts", "index.json"); return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f)) : send(res, 404, { error: "no parts database (run node scripts/import_parts.mjs)" }); }
        if (!PART_CATS.includes(id)) return send(res, 404, { error: "unknown parts category" });
        const f = overlay("parts", id + ".json");
        return fs.existsSync(f) ? sendJsonGz(req, res, fs.readFileSync(f)) : send(res, 404, { error: `no parts bundle data/parts/${id}.json` });
      }
      if (kind === "settings" && !id) {
        // per-user settings in data/private/settings.json (A9_DEFAULTDRV, A10_NEWBOX_DEFAULT): { defaultDriverId, defaultProject, defaultTab }
        if (req.method === "GET") return send(res, 200, readSettings(DATA));
        if (req.method === "PUT") {
          let patch; try { patch = JSON.parse((await readBody(req, 1e5)).toString("utf8")); } catch { return send(res, 400, { error: "bad JSON" }); }
          const exists = (did) => [DIRS.drivers, DIRS.private].some((d) => fs.existsSync(path.join(d, did + ".json"))) || listLibrary().some((d) => d.id === resolveDriverId(did));
          const projectExists = (n) => fs.existsSync(path.join(DIRS.projects, n + ".json"));
          const r = writeSettings(DATA, patch, exists, projectExists);
          return r.ok ? send(res, 200, r.settings) : send(res, r.code, { error: r.error });
        }
      }
      if (kind === "drivers") {
        if (req.method === "GET" && !id) return sendJsonGz(req, res, Buffer.from(JSON.stringify([...listJson(DIRS.drivers), ...listJson(DIRS.private).map((d) => ({ ...d, private: true })), ...listLibrary()])));
        if (req.method === "GET" && id === "_libraries") return sendJsonGz(req, res, Buffer.from(JSON.stringify(libraryInfo())));
        if (req.method === "GET" && id === "_aliases") return send(res, 200, readLibrary().aliases); // B3: old library ids -> new
        if (!id || !SAFE.test(id)) return send(res, 400, { error: "bad id" });
        if (req.method === "PUT") {
          const d = JSON.parse((await readBody(req)).toString("utf8"));
          if (id.startsWith("lib-")) return send(res, 400, { error: "library drivers are read-only; save under a new name" });
          d.id = id; delete d.library; delete d.licence;
          const dir = d.private ? DIRS.private : DIRS.drivers;
          const other = d.private ? DIRS.drivers : DIRS.private;
          if (fs.existsSync(path.join(other, id + ".json"))) fs.unlinkSync(path.join(other, id + ".json"));
          writeJsonAtomic(path.join(dir, id + ".json"), d);
          return send(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          if (id.startsWith("lib-")) return send(res, 200, { ok: true, kept: "library entry (read-only)" });
          for (const dir of [DIRS.drivers, DIRS.private]) { const f = path.join(dir, id + ".json"); if (fs.existsSync(f)) { fs.mkdirSync(path.join(DATA, "private", "deleted"), { recursive: true }); renameRetry(f, path.join(DATA, "private", "deleted", `${id}.${Date.now()}.json`)); } }
          return send(res, 200, { ok: true });
        }
      }
      if (kind === "projects") {
        if (req.method === "GET" && !id) return send(res, 200, listJson(DIRS.projects).map(projectSummary)); // B1: + format, section, items, saved
        if (!id || !SAFE.test(id)) return send(res, 400, { error: "bad name" });
        const f = path.join(DIRS.projects, id + ".json");
        if (!sub) {
          if (req.method === "GET") return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f)) : send(res, 404, { error: "not found" });
          if (req.method === "PUT") { const p = JSON.parse((await readBody(req)).toString("utf8")); p.name = id; p.saved = new Date().toISOString(); const bak = backupBeforeV2(DATA, f, id, p); if (fs.existsSync(f)) fs.copyFileSync(f, f + ".prev"); writeJsonAtomic(f, p); return send(res, 200, { ok: true, saved: p.saved, ...(bak ? { backup: bak } : {}) }); } // B1: v1 file backed up before its first v2 write
          if (req.method === "DELETE") { // B1_SHELL: delete = move the project file and its folder (measurements, exports) to data/private/deleted
            if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
            const moved = moveToDeleted(DATA, f, `project.${id}`); const dir = path.join(DIRS.projects, id); const movedDir = fs.existsSync(dir) ? moveToDeleted(DATA, dir, `project.${id}.folder`) : null;
            return send(res, 200, { ok: true, moved, movedDir });
          }
        }
        if (sub === "measurements") {
          // Measured curves (REW imports) per project: data/projects/<project>/measurements/<id>.json (A5_REW)
          const dir = path.join(DIRS.projects, id, "measurements");
          if (!file && req.method === "GET") return send(res, 200, listJson(dir).sort((a, b) => String(a.created || "").localeCompare(String(b.created || ""))));
          if (!file || !SAFE.test(file)) return send(res, 400, { error: "bad measurement id" });
          const mf = path.join(dir, file + ".json");
          if (req.method === "GET") return fs.existsSync(mf) ? send(res, 200, fs.readFileSync(mf)) : send(res, 404, { error: "not found" });
          if (req.method === "PUT") {
            const m = JSON.parse((await readBody(req, 20e6)).toString("utf8"));
            const okArr = (a) => Array.isArray(a) && a.every((v) => typeof v === "number" && isFinite(v));
            if (!["impedance", "response"].includes(m.kind) || !okArr(m.f) || !okArr(m.mag) || m.f.length !== m.mag.length || m.f.length < 5 || (m.phase !== undefined && m.phase !== null && (!okArr(m.phase) || m.phase.length !== m.f.length)))
              return send(res, 400, { error: "a measurement needs kind (impedance/response) and equal-length numeric f, mag (and optional phase) arrays, at least 5 points" });
            m.id = file; m.project = id; m.saved = new Date().toISOString(); m.created ??= m.saved;
            fs.mkdirSync(dir, { recursive: true }); writeJsonAtomic(mf, m);
            return send(res, 200, { ok: true, id: file, path: mf });
          }
          if (req.method === "DELETE") {
            if (fs.existsSync(mf)) { const del = path.join(DATA, "private", "deleted"); fs.mkdirSync(del, { recursive: true }); renameRetry(mf, path.join(del, `${id}.measurement.${file}.${Date.now()}.json`)); }
            return send(res, 200, { ok: true });
          }
        }
        if (sub === "exports" && file && SAFE.test(file) && req.method === "GET") {
          const f2 = path.join(DIRS.projects, id, "exports", file);
          return fs.existsSync(f2) ? send(res, 200, fs.readFileSync(f2), "application/octet-stream") : send(res, 404, { error: "not found" });
        }
        if (sub === "exports" && file && SAFE.test(file) && req.method === "PUT") {
          const dir = path.join(DIRS.projects, id, "exports"); fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, file), await readBody(req));
          return send(res, 200, { ok: true, path: path.join(dir, file) });
        }
      }
      return send(res, 404, { error: "unknown api" });
    }
    // static
    let p = path.normalize(path.join(DIST, url.pathname));
    if (!insideDir(DIST, p)) return send(res, 403, "forbidden", "text/plain");
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
    if (!fs.existsSync(p)) return send(res, 500, `App not built: run "npm run build" in ${APP}`, "text/plain");
    send(res, 200, fs.readFileSync(p), TYPES[path.extname(p)] || "application/octet-stream");
  } catch (e) { send(res, 500, { error: String(e?.message || e) }); }
});
server.listen(PORT, HOST, () => console.log(`Audio_Builder on http://${HOST}:${PORT}  (open http://localhost:${PORT}; data: ${DATA})`));
