// W1_WINDOWS (R45): cross-platform file helpers of the server (app/server/fsx.mjs).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { insideDir, isWindowsReservedName, renameRetry, safeId } from "../server/fsx.mjs";

describe("insideDir", () => {
  it("POSIX paths", () => {
    const P = path.posix;
    expect(insideDir("/a/dist", "/a/dist/index.html", P)).toBe(true);
    expect(insideDir("/a/dist", "/a/dist", P)).toBe(true);
    expect(insideDir("/a/dist", "/a/dist/x/../y.js", P)).toBe(true);
    expect(insideDir("/a/dist", "/a/dist-tsc/x.js", P)).toBe(false); // the old startsWith check let this through
    expect(insideDir("/a/dist", "/a/other", P)).toBe(false);
    expect(insideDir("/a/dist", "/a/dist/..foo", P)).toBe(false); // conservative: names starting ".." are refused
  });
  it("Windows paths (backslashes, drive letter case, other drive)", () => {
    const W = path.win32;
    expect(insideDir("C:\\x\\app\\dist", "C:\\x\\app\\dist\\assets\\a.js", W)).toBe(true);
    expect(insideDir("C:\\x\\app\\dist", "c:\\X\\APP\\DIST\\index.html", W)).toBe(true);
    expect(insideDir("C:\\x\\app\\dist", W.normalize(W.join("C:\\x\\app\\dist", "/../server/server.mjs")), W)).toBe(false);
    expect(insideDir("C:\\x\\app\\dist", "D:\\x\\app\\dist\\a.js", W)).toBe(false);
    expect(insideDir("C:\\x\\app\\dist", "C:\\x\\app\\dist-old\\a.js", W)).toBe(false);
  });
});

describe("safeId and Windows device names", () => {
  it("device names", () => {
    for (const n of ["con", "CON", "nul", "aux", "prn", "com1", "LPT9", "con.json", "nul.txt"]) expect(isWindowsReservedName(n)).toBe(true);
    for (const n of ["console", "contour", "nul_box", "com10", "a.con", "my-sub"]) expect(isWindowsReservedName(n)).toBe(false);
  });
  it("same rule as before on Linux; device names refused on Windows only", () => {
    expect(safeId("existing_sub", "linux")).toBe(true);
    expect(safeId("con", "linux")).toBe(true);
    expect(safeId("con", "win32")).toBe(false);
    expect(safeId("existing_sub", "win32")).toBe(true);
    for (const p of ["linux", "win32"]) { expect(safeId("../x", p)).toBe(false); expect(safeId("a b", p)).toBe(false); expect(safeId("", p)).toBe(false); }
  });
});

describe("renameRetry", () => {
  const busyFs = (failures: number, code: string) => { let n = 0; return { calls: () => n, renameSync: () => { n++; if (n <= failures) { const e: any = new Error(code); e.code = code; throw e; } } }; };
  it("retries EPERM / EBUSY on Windows, then succeeds", () => {
    const f = busyFs(3, "EPERM"); renameRetry("a", "b", { platform: "win32", fsApi: f, waitMs: 1 }); expect(f.calls()).toBe(4);
    const g = busyFs(2, "EBUSY"); renameRetry("a", "b", { platform: "win32", fsApi: g, waitMs: 1 }); expect(g.calls()).toBe(3);
  });
  it("gives up after the tries on Windows", () => {
    const f = busyFs(99, "EPERM"); expect(() => renameRetry("a", "b", { platform: "win32", fsApi: f, waitMs: 1, tries: 4 })).toThrow("EPERM"); expect(f.calls()).toBe(4);
  });
  it("no retry on Linux (unchanged behaviour)", () => {
    const f = busyFs(1, "EPERM"); expect(() => renameRetry("a", "b", { platform: "linux", fsApi: f })).toThrow("EPERM"); expect(f.calls()).toBe(1);
  });
  it("real rename over an existing file, and EXDEV falls back to copy + remove", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-fsx-"));
    try {
      const a = path.join(dir, "a.json"), b = path.join(dir, "b.json");
      fs.writeFileSync(a, "new"); fs.writeFileSync(b, "old"); renameRetry(a, b);
      expect(fs.readFileSync(b, "utf8")).toBe("new"); expect(fs.existsSync(a)).toBe(false);
      const src = path.join(dir, "folder"); fs.mkdirSync(src); fs.writeFileSync(path.join(src, "x.txt"), "x");
      const exdev = { ...fs, renameSync: () => { const e: any = new Error("EXDEV"); e.code = "EXDEV"; throw e; } };
      const dest = path.join(dir, "moved"); renameRetry(src, dest, { fsApi: exdev });
      expect(fs.readFileSync(path.join(dest, "x.txt"), "utf8")).toBe("x"); expect(fs.existsSync(src)).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
