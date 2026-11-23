// Cross-platform file helpers for the server (W1_WINDOWS, R45, 2026-11-23). On Linux and macOS they behave exactly like the
// plain fs/path calls they replace; on Windows they work around its file-system rules. Tested in app/tests/fsx.test.ts.
import fs from "node:fs";
import path from "node:path";

/** True when `p` is `base` itself or inside it (path.relative, so a sibling such as dist-old never passes; case-insensitive on Windows). */
export function insideDir(base, p, pathApi = path) {
  const rel = pathApi.relative(base, p);
  return rel === "" || (!rel.startsWith("..") && !pathApi.isAbsolute(rel));
}

/** Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), alone or with any extension: such files cannot be made on Windows. */
export const isWindowsReservedName = (name) => /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i.test(String(name));

const SAFE_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
/** The server's id / file-name rule; on Windows the device names are refused too (on other systems they stay allowed, as before). */
export const safeId = (id, platform = process.platform) => SAFE_RE.test(String(id)) && !(platform === "win32" && isWindowsReservedName(id));

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);

/**
 * fs.renameSync that also works where Windows refuses: a file held open for a moment by antivirus or the search indexer gives
 * EPERM / EACCES / EBUSY, so on Windows the rename is retried for up to about 2 s. A move across drives (EXDEV, any system)
 * copies then removes the source. Otherwise it is fs.renameSync.
 */
export function renameRetry(src, dest, { platform = process.platform, fsApi = fs, tries = 20, waitMs = 100 } = {}) {
  for (let i = 0; ; i++) {
    try { return fsApi.renameSync(src, dest); } catch (e) {
      if (e?.code === "EXDEV") { fsApi.cpSync(src, dest, { recursive: true }); fsApi.rmSync(src, { recursive: true, force: true }); return; }
      if (platform !== "win32" || !BUSY.has(e?.code) || i >= tries - 1) throw e;
      sleepMs(waitMs);
    }
  }
}
