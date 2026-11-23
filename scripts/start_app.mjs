#!/usr/bin/env node
// Cross-platform starter (W1_WINDOWS, R45, 2026-11-23): Windows, Linux and macOS. Same steps as scripts/start_app.sh:
// npm ci the first time (cache in .npm-cache/cache), build if app/dist/index.html is missing, then start the server in the
// background on port 8420 (log: data/private/server.log) unless /api/health already answers.
// Run: node scripts/start_app.mjs [--open]   (or: cd app && npm run app; Windows: scripts\start_app.cmd)
// --open: open http://localhost:8420 in the default web browser at the end.
// PORT and AB_DATA_DIR are passed to the server as usual (the log then goes to <AB_DATA_DIR>/private/server.log).
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app");
const PORT = Number(process.env.PORT || 8420);
const URL_OPEN = `http://localhost:${PORT}`;
const DATA = process.env.AB_DATA_DIR ? path.resolve(process.env.AB_DATA_DIR) : path.join(ROOT, "data");
const LOG = path.join(DATA, "private", "server.log");
const WIN = process.platform === "win32";
const OPEN = process.argv.includes("--open");

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 12)) {
  console.log(`Node.js ${process.versions.node} is too old: the app needs Node.js 22.12 or newer (the LTS version from https://nodejs.org/ is fine).`);
  process.exit(1);
}

/** Run an npm command in app/, output shown; npm is npm.cmd on Windows, which Node only starts through the shell. */
const npm = (args) => {
  console.log(`> npm ${args.join(" ")}`);
  const r = spawnSync(WIN ? "npm.cmd" : "npm", args, { cwd: APP, stdio: "inherit", shell: WIN, env: { ...process.env, npm_config_cache: path.join(ROOT, ".npm-cache", "cache") } });
  if (r.error?.code === "ENOENT") { console.log("npm was not found. Install Node.js (it includes npm) from https://nodejs.org/"); process.exit(1); }
  if (r.status !== 0) { console.log(`"npm ${args.join(" ")}" failed (exit ${r.status ?? r.signal}); see the messages above.`); process.exit(1); }
};

const health = async () => {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; }
};

const openBrowser = () => {
  if (!OPEN) return;
  const [cmd, args] = WIN ? ["cmd.exe", ["/c", "start", "", URL_OPEN]] : process.platform === "darwin" ? ["open", [URL_OPEN]] : ["xdg-open", [URL_OPEN]];
  try { const c = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }); c.on("error", () => {}); c.unref(); } catch { /* no browser opener: the address is printed */ }
};

if (!fs.existsSync(path.join(APP, "node_modules"))) npm(["ci"]);
if (!fs.existsSync(path.join(APP, "dist", "index.html"))) npm(["run", "build"]);
if (await health()) { console.log(`Already running: open ${URL_OPEN} in your web browser`); openBrowser(); process.exit(0); }

fs.mkdirSync(path.dirname(LOG), { recursive: true });
const out = fs.openSync(LOG, "a");
// Relative script path, as start_app.sh uses: restart_app.sh / restart_app.ps1 recognise the server by "server/server.mjs" (or server\server.mjs).
const child = spawn(process.execPath, ["server/server.mjs"], { cwd: APP, detached: true, stdio: ["ignore", out, out], windowsHide: true, env: process.env });
child.unref(); fs.closeSync(out);

let up = false;
for (let i = 0; i < 20 && !up; i++) { await new Promise((ok) => setTimeout(ok, 500)); up = await health(); } // up to 10 s (first start on Windows can be slow while antivirus scans)
if (up) { console.log(`Running: open ${URL_OPEN} in your web browser`); openBrowser(); process.exit(0); }
console.log(`Failed: see ${LOG}`); process.exit(1);
