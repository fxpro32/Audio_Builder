// /api/settings logic (A9_DEFAULTDRV): per-user default driver in <data>/private/settings.json.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSettings, validateSettings, writeSettings, settingsFile, TABS } from "../server/settings.mjs";
import { blankProject } from "../src/ui/model";

const known = new Set(["pioneer-ts-w3002d4", "lib-x-1"]);
const exists = (id: string) => known.has(id);
const projs = new Set(["new_sub_box", "existing_sub"]);
const projExists = (n: string) => projs.has(n);
let dir = "";
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-settings-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("settings", () => {
  it("missing or broken file reads as empty", () => {
    expect(readSettings(dir)).toEqual({});
    fs.mkdirSync(path.join(dir, "private")); fs.writeFileSync(settingsFile(dir), "{not json");
    expect(readSettings(dir)).toEqual({});
  });
  it("stores a known driver id under private/ and reads it back", () => {
    const r = writeSettings(dir, { defaultDriverId: "pioneer-ts-w3002d4" }, exists);
    expect(r.ok).toBe(true);
    expect(settingsFile(dir)).toBe(path.join(dir, "private", "settings.json"));
    expect(readSettings(dir)).toEqual({ defaultDriverId: "pioneer-ts-w3002d4" });
    expect(writeSettings(dir, { defaultDriverId: "lib-x-1" }, exists).ok).toBe(true);
    expect(readSettings(dir).defaultDriverId).toBe("lib-x-1");
  });
  it("rejects unknown ids, bad ids, unknown keys and non-objects without writing", () => {
    writeSettings(dir, { defaultDriverId: "pioneer-ts-w3002d4" }, exists);
    expect(writeSettings(dir, { defaultDriverId: "nope" }, exists)).toMatchObject({ ok: false, code: 404 });
    expect(writeSettings(dir, { defaultDriverId: "../etc/passwd" }, exists)).toMatchObject({ ok: false, code: 400 });
    expect(writeSettings(dir, { defaultDriverId: 5 }, exists)).toMatchObject({ ok: false, code: 400 });
    expect(writeSettings(dir, { colour: "red" }, exists)).toMatchObject({ ok: false, code: 400 });
    expect(writeSettings(dir, [1], exists)).toMatchObject({ ok: false, code: 400 });
    expect(readSettings(dir)).toEqual({ defaultDriverId: "pioneer-ts-w3002d4" });
  });
  it("empty id clears the default", () => {
    expect(validateSettings({ defaultDriverId: "a" }, { defaultDriverId: "" }, exists)).toEqual({ ok: true, settings: {} });
  });
  it("blankProject takes the default driver only when given", () => {
    expect(blankProject("a", "A", "pioneer-ts-w3002d4").driverId).toBe("pioneer-ts-w3002d4");
    expect("driverId" in blankProject("a", "A")).toBe(false);
  });
  // A10_NEWBOX_DEFAULT: start-up project and tab
  it("stores defaultProject and defaultTab next to defaultDriverId", () => {
    expect(writeSettings(dir, { defaultDriverId: "pioneer-ts-w3002d4" }, exists, projExists).ok).toBe(true);
    const r = writeSettings(dir, { defaultProject: "new_sub_box", defaultTab: "design" }, exists, projExists);
    expect(r.ok).toBe(true);
    expect(readSettings(dir)).toEqual({ defaultDriverId: "pioneer-ts-w3002d4", defaultProject: "new_sub_box", defaultTab: "design" });
    expect(TABS).toEqual(["design", "fix", "drivers", "help", "boards", "door", "ib", "project"]); // B1_SHELL added the last four
    for (const t of TABS) expect(validateSettings({}, { defaultTab: t }, exists, projExists).ok).toBe(true);
  });
  it("rejects a missing project, an unsafe name and an unknown tab without writing", () => {
    writeSettings(dir, { defaultProject: "new_sub_box", defaultTab: "design" }, exists, projExists);
    expect(writeSettings(dir, { defaultProject: "nope" }, exists, projExists)).toMatchObject({ ok: false, code: 404 });
    expect(writeSettings(dir, { defaultProject: "../private/settings" }, exists, projExists)).toMatchObject({ ok: false, code: 400 });
    expect(writeSettings(dir, { defaultProject: 3 }, exists, projExists)).toMatchObject({ ok: false, code: 400 });
    expect(writeSettings(dir, { defaultTab: "kitchen" }, exists, projExists)).toMatchObject({ ok: false, code: 400 });
    expect(writeSettings(dir, { defaultTab: 1 }, exists, projExists)).toMatchObject({ ok: false, code: 400 });
    // a bad key in the same patch blocks the good one too
    expect(writeSettings(dir, { defaultProject: "existing_sub", defaultTab: "x" }, exists, projExists)).toMatchObject({ ok: false });
    // no project checker given (older callers): no project counts as existing
    expect(validateSettings({}, { defaultProject: "new_sub_box" }, exists)).toMatchObject({ ok: false, code: 404 });
    expect(readSettings(dir)).toEqual({ defaultProject: "new_sub_box", defaultTab: "design" });
  });
  it("empty or null clears defaultProject and defaultTab, keeping the driver", () => {
    const cur = { defaultDriverId: "a", defaultProject: "new_sub_box", defaultTab: "design" as const };
    expect(validateSettings(cur, { defaultProject: "", defaultTab: null }, exists, projExists)).toEqual({ ok: true, settings: { defaultDriverId: "a" } });
  });
  // B1_SHELL: start-up section
  it("stores defaultSection, rejects unknown sections, clears with empty", () => {
    expect(writeSettings(dir, { defaultSection: "door" }, exists, projExists)).toMatchObject({ ok: true, settings: { defaultSection: "door" } });
    expect(writeSettings(dir, { defaultSection: "kitchen" }, exists, projExists)).toMatchObject({ ok: false, code: 400 });
    expect(validateSettings({ defaultSection: "home" }, { defaultSection: "" }, exists)).toEqual({ ok: true, settings: {} });
    expect(readSettings(dir)).toEqual({ defaultSection: "door" });
  });
});
