// B1_SHELL (R37, R42): project model v2 (migration on read, legacy write rule, items, add to project, links), sections
// (driver filters, presets, default drivers) and the server storage helpers (backup before the first v2 write, delete = move).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pv2 from "../src/ui/projectv2";
import { blankProject, upgradeProject } from "../src/ui/model";
import { driverFitsSection, PRESETS, SECTION_DEFAULT_DRIVER, SECTIONS, sectionInfo, sectionTopologies } from "../src/ui/sections";
import { complete } from "../src/engine/driver";
import { AIR_PRESETS } from "../src/engine/air";
import type { Driver } from "../src/engine/driver";
import { backupBeforeV2, findLogo, itemSummary, moveToDeleted, projectSummary, writeToDeleted } from "../server/store2.mjs";

const DATA = path.resolve(__dirname, "..", "..", "data");
// the local projects in data/projects (gitignored, not shipped): none on a fresh clone
const OLD = fs.existsSync(path.join(DATA, "projects")) ? fs.readdirSync(path.join(DATA, "projects")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort() : [];
const readOld = (n: string) => JSON.parse(fs.readFileSync(path.join(DATA, "projects", n + ".json"), "utf8"));
const strip = (o: any) => { const { saved: _s, ...r } = o; return r; };

describe("migration on read (v1 project = project with one Subwoofer box item)", () => {
  for (const n of OLD) it(`${n}: the box item holds exactly what the app showed before`, () => {
    if (!fs.existsSync(path.join(DATA, "projects", n + ".json"))) return; // local projects only (not shipped)
    const raw = readOld(n); if (pv2.isV2(raw)) return; // already v2 (not the case on 2026-11-23)
    const { doc, legacy } = pv2.readProject(raw);
    expect(legacy).toBe(true);
    expect(doc).toMatchObject({ format: 2, name: raw.name, title: raw.title, section: "subwoofer" });
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0]).toMatchObject({ id: pv2.LEGACY_ITEM_ID, section: "subwoofer", kind: "box", name: pv2.LEGACY_ITEM_NAME });
    expect(doc.items[0].data).toEqual(upgradeProject(raw));
    // written back unchanged in the v1 format (the same object the app wrote before B1, the server adds "saved")
    const out = pv2.toDisk(doc, legacy);
    expect(pv2.isV2(out)).toBe(false);
    expect(strip(out)).toEqual(strip(upgradeProject(raw)));
    expect(Object.keys(out).slice(0, 2)).toEqual(["name", "title"]);
  });
  it("a v1 project is written as v2 once it holds more than its box (a second item, a renamed item, a link)", () => {
    const raw = blankProject("p", "P");
    let r = pv2.readProject(raw); r.doc.items.push(pv2.newItem("door", "door", "Door speakers", { driverId: "", count: 2 }));
    expect(pv2.isV2(pv2.toDisk(r.doc, r.legacy))).toBe(true);
    r = pv2.readProject(raw); r.doc.items[0].name = "Main sub";
    expect(pv2.isV2(pv2.toDisk(r.doc, r.legacy))).toBe(true);
    r = pv2.readProject(raw); expect(pv2.isV2(pv2.toDisk(r.doc, false))).toBe(true); // a v2 file stays v2
  });
  it("items made in memory only (a section opened, nothing changed) are not written", () => {
    const r = pv2.readProject(blankProject("p", "P"));
    const it = pv2.newItem("door", "door", "Door speakers", {}); r.doc.items.push(it);
    const out = pv2.toDisk(r.doc, r.legacy, new Set([it.id]));
    expect(pv2.isV2(out)).toBe(false); // still the plain v1 project
  });
  it("v2 round trip: box data loses only the project name/title inside it, items and links stay", () => {
    const box = pv2.newItem("home", "box", "Home speaker box", blankProject("x", "X", "lib-a"));
    const door = pv2.newItem("door", "door", "Door speakers", { driverId: "d1", count: 2, notes: "front" });
    const doc = pv2.newProject("sys", "System", box); doc.items.push(door);
    expect(pv2.linkItems(doc, door.id, box.id, "speaker", { fromPort: "out L" }).ok).toBe(true);
    const disk = JSON.parse(JSON.stringify(pv2.toDisk(doc, false)));
    expect(disk.format).toBe(2); expect(disk.items[0].data.name).toBeUndefined(); expect(disk.items[0].data.driverId).toBe("lib-a");
    const back = pv2.readProject(disk);
    expect(back.legacy).toBe(false);
    expect(back.doc.items.map((i) => i.id)).toEqual([box.id, door.id]);
    expect(back.doc.items[1].links).toEqual([{ from: door.id, fromPort: "out L", to: box.id, kind: "speaker" }]);
    expect(back.doc.items[1].data).toEqual({ driverId: "d1", count: 2, notes: "front" });
    expect(back.doc.items[0].data.geom).toEqual(blankProject("x", "X").geom);
    expect(pv2.boxOf(back.doc.items[0], "sys", "System")).toMatchObject({ name: "sys", title: "System", driverId: "lib-a" });
  });
  it("later item kinds are kept as they are (amplifier, cable...)", () => {
    const amp = { id: "a1", section: "electrical", kind: "amplifier", name: "Amp", data: { brand: "X", rmsW: 1000 }, links: [{ from: "a1", to: "s1", kind: "speaker", fromPort: "CH1", toPort: "+", cableItemId: "c1" }] };
    const r = pv2.readProject({ format: 2, name: "p", title: "P", section: "subwoofer", items: [amp] });
    expect(r.doc.items[0]).toMatchObject(amp);
    expect(pv2.ITEM_KINDS).toEqual(expect.arrayContaining(["amplifier", "dsp", "capacitor", "fuse", "cable", "connector"]));
  });
});

describe("items: My items, add to project, duplicate, remove, links", () => {
  it("a single item saved to My items and added to a project appears there as a copy with a new id", () => {
    const single = pv2.newItem("door", "door", "Front doors", { driverId: "d1", count: 2, notes: "" });
    const saved = pv2.toSavedItem(single);
    expect(saved).toMatchObject({ format: 2, type: "item", section: "door", kind: "door", name: "Front doors" });
    const r = pv2.readProject(blankProject("p", "P"));
    const added = pv2.addItemToProject(r.doc, pv2.readSavedItem(JSON.parse(JSON.stringify(saved))), { item: saved.id });
    expect(r.doc.items).toHaveLength(2);
    expect(added.id).not.toBe(saved.id); expect(added.from).toEqual({ item: saved.id });
    expect((added as any).format).toBeUndefined(); expect((added as any).type).toBeUndefined();
    expect(added.data).toEqual({ driverId: "d1", count: 2, notes: "" });
    added.data.count = 4; expect(saved.data.count).toBe(2); // a copy, not shared
    expect(pv2.isV2(pv2.toDisk(r.doc, r.legacy))).toBe(true);
  });
  it("an item saved from a project to My items remembers where it came from and drops its links", () => {
    const doc = pv2.newProject("p", "P", pv2.newItem("subwoofer", "box", "Sub", blankProject("", "")));
    const b = pv2.newItem("door", "door", "Doors", {}); doc.items.push(b); pv2.linkItems(doc, doc.items[0].id, b.id, "signal");
    const s = pv2.toSavedItem(doc.items[0], "p");
    expect(s.from).toEqual({ item: doc.items[0].id, project: "p" }); expect(s.links).toEqual([]); expect(s.data.name).toBeUndefined();
  });
  it("typed links (R44): kinds, ports, cable item; no self links, unknown items or kinds, no duplicates; removal cleans up", () => {
    const doc = pv2.newProject("p", "P", pv2.newItem("subwoofer", "box", "Sub", blankProject("", "")));
    const amp = pv2.newItem("electrical", "amplifier", "Amp", {}, doc.items.map((i) => i.id)); doc.items.push(amp);
    const cab = pv2.newItem("electrical", "cable", "Speaker cable", {}, doc.items.map((i) => i.id)); doc.items.push(cab);
    const sub = doc.items[0].id;
    expect(pv2.LINK_KINDS).toEqual(["power", "ground", "signal", "speaker", "remote"]);
    expect(pv2.linkItems(doc, amp.id, amp.id, "speaker").ok).toBe(false);
    expect(pv2.linkItems(doc, amp.id, "nope", "speaker").ok).toBe(false);
    expect(pv2.linkItems(doc, amp.id, sub, "drives").ok).toBe(false);
    expect(pv2.linkItems(doc, amp.id, sub, "speaker", { cableItemId: "nope" }).ok).toBe(false);
    expect(pv2.linkItems(doc, amp.id, sub, "speaker", { fromPort: "CH1", toPort: "+", cableItemId: cab.id }).ok).toBe(true);
    expect(pv2.linkItems(doc, amp.id, sub, "speaker", { fromPort: "CH1", toPort: "+" }).ok).toBe(false); // same ports again
    expect(pv2.linkItems(doc, amp.id, sub, "speaker", { fromPort: "CH2", toPort: "-" }).ok).toBe(true);
    expect(pv2.linksTo(doc, sub)[0]).toEqual({ from: amp.id, fromPort: "CH1", to: sub, toPort: "+", kind: "speaker", cableItemId: cab.id });
    expect(pv2.allLinks(doc)).toHaveLength(2);
    pv2.removeItem(doc, cab.id); expect(amp.links!.every((l) => l.cableItemId === undefined)).toBe(true);
    pv2.unlinkItems(doc, amp.id, sub, "speaker"); expect(pv2.linksTo(doc, sub)).toEqual([]);
    pv2.linkItems(doc, amp.id, sub, "remote");
    expect(pv2.removeItem(doc, sub)?.id).toBe(sub);
    expect(amp.links).toEqual([]); expect(doc.activeItem).toBe(amp.id);
    // stored links: from is the owner, unknown kinds dropped
    const r = pv2.readProject({ format: 2, name: "q", title: "Q", section: "subwoofer", items: [{ id: "x", kind: "amplifier", section: "electrical", name: "A", data: {}, links: [{ from: "other", to: "y", kind: "power" }, { to: "y", role: "drives" }] }, { id: "y", kind: "box", section: "subwoofer", name: "B", data: {} }] });
    expect(r.doc.items[0].links).toEqual([{ from: "x", to: "y", kind: "power" }]);
  });
  it("duplicating an item points its links' from at the copy", () => {
    const doc = pv2.newProject("p", "P", pv2.newItem("subwoofer", "box", "Sub", blankProject("", "")));
    const amp = pv2.newItem("electrical", "amplifier", "Amp", {}); doc.items.push(amp); pv2.linkItems(doc, amp.id, doc.items[0].id, "speaker");
    const c = pv2.duplicateItem(doc, amp.id)!; expect(c.links![0].from).toBe(c.id);
  });
  it("the project save hook runs registered handlers and survives a failing one", async () => {
    const { addProjectSaveHook, onProjectSave } = await import("../src/ui/hooks");
    const doc = pv2.newProject("p", "P", pv2.newItem("door", "door", "D", {})); const seen: string[] = [];
    const off1 = addProjectSaveHook(() => { throw new Error("boom"); }); const off2 = addProjectSaveHook((d) => seen.push(d.name));
    expect(() => onProjectSave(doc, { legacy: false })).not.toThrow(); expect(seen).toEqual(["p"]);
    off1(); off2(); onProjectSave(doc, { legacy: false }); expect(seen).toEqual(["p"]);
  });
  it("duplicate item and project", () => {
    const doc = pv2.newProject("p", "P", pv2.newItem("subwoofer", "box", "Sub", blankProject("", "")));
    const c = pv2.duplicateItem(doc, doc.items[0].id)!;
    expect(c.name).toBe("Sub (copy)"); expect(c.id).not.toBe(doc.items[0].id); expect(doc.items).toHaveLength(2);
    const d = pv2.duplicateProject(doc, "p2", "P2");
    expect(d).toMatchObject({ name: "p2", title: "P2" }); expect(d.items.map((i) => i.id)).toEqual(doc.items.map((i) => i.id));
    d.items[0].name = "changed"; expect(doc.items[0].name).toBe("Sub");
  });
  it("new item ids are unique and safe as file names", () => {
    const ids = new Set<string>(); for (let i = 0; i < 200; i++) ids.add(pv2.newItemId(ids));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9._-]{0,99}$/i);
  });
});

describe("sections", () => {
  const drv = (o: Partial<Driver>): Driver => ({ id: "x", brand: "B", model: "M", params: { fs: 30, Re: 3.5, Qms: 5, Qes: 0.5, Sd: 0.05 }, ...o });
  it("five sections in the requested order; door and infinite baffle have no box tabs; subwoofer keeps every tab", () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(["Subwoofer", "Door speaker", "Infinite baffle", "Home speakers", "Computer speakers"]);
    expect(sectionInfo("subwoofer").tabs).toEqual(["design", "fix", "boards", "drivers", "parts", "system", "bom", "project", "help"]); // B4: System tab; B5: BOM tab
    for (const id of ["door", "ib"] as const) { const t = sectionInfo(id).tabs; expect(t).not.toContain("design"); expect(t).not.toContain("fix"); expect(sectionInfo(id).box).toBe(false); }
    expect(sectionInfo("door").tabs).not.toContain("boards"); expect(sectionInfo("ib").tabs).toContain("boards"); // B2: the IB baffle board goes to Boards
    expect(sectionInfo("home").tabs).toContain("boards"); expect(sectionInfo("computer").tabs).toContain("design");
    expect(sectionInfo("nope").id).toBe("subwoofer");
  });
  it("driver sizes per section; subwoofer lists every driver as before", () => {
    expect(driverFitsSection(drv({ sizeIn: 6.5 }), "door")).toBe(true);
    expect(driverFitsSection(drv({ sizeIn: 12 }), "door")).toBe(false);
    expect(driverFitsSection(drv({ sizeIn: 3 }), "computer")).toBe(true);
    expect(driverFitsSection(drv({ sizeIn: 6.5 }), "computer")).toBe(false);
    expect(driverFitsSection(drv({ sizeIn: 10 }), "home")).toBe(true);
    expect(driverFitsSection(drv({ sizeIn: 15 }), "home")).toBe(false);
    expect(driverFitsSection(drv({ sizeIn: 1 }), "subwoofer")).toBe(true);
    expect(driverFitsSection(drv({ kind: "passive", sizeIn: 6 }), "home")).toBe(false);
    expect(driverFitsSection(drv({ library: "qspeakers" }), "door")).toBe(false); // library driver without a size
    expect(driverFitsSection(drv({}), "door")).toBe(true); // your own driver without a size
  });
  it("home / computer: sealed, ported and passive radiator only; presets have positive sizes; only floor-standing locks its height", () => {
    expect(sectionTopologies("home")).toEqual(["sealed", "vented", "pr"]); expect(sectionTopologies("subwoofer")).toBeUndefined();
    for (const id of ["home", "computer"] as const) for (const p of PRESETS[id]!) {
      expect(p.design.maxW! > 0 && p.design.maxH! > 0 && p.design.maxD! > 0 && p.design.t! > 0).toBe(true);
      expect(!!p.design.lockH).toBe(p.id === "floor-ported"); expect(["sealed", "vented"]).toContain(p.design.kind);
    }
  });
  it("the home and computer default drivers exist in the bundled libraries, fit their section and can be simulated", () => {
    const all: Driver[] = [];
    for (const f of fs.readdirSync(path.join(DATA, "drivers", "library")).filter((x) => x.endsWith(".json"))) all.push(...JSON.parse(fs.readFileSync(path.join(DATA, "drivers", "library", f), "utf8")).drivers);
    for (const id of ["home", "computer"] as const) {
      const d = all.find((x) => x.id === SECTION_DEFAULT_DRIVER[id]);
      expect(d, SECTION_DEFAULT_DRIVER[id]).toBeTruthy();
      expect(driverFitsSection(d!, id)).toBe(true);
      expect(complete(d!.params, AIR_PRESETS[0]).Qts).toBeGreaterThan(0);
    }
  });
});

describe("server storage helpers (app/server/store2.mjs)", () => {
  let dir = "";
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-store2-")); fs.mkdirSync(path.join(dir, "projects")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  it("backs up a v1 file once before the first v2 write; never for v1 writes or over a v2 file", () => {
    const f = path.join(dir, "projects", "old.json"); const v1 = JSON.stringify(blankProject("old", "Old")); fs.writeFileSync(f, v1);
    expect(backupBeforeV2(dir, f, "old", blankProject("old", "Old"))).toBeNull(); // a v1 write: no backup
    const v2 = pv2.toDisk(pv2.newProject("old", "Old", pv2.newItem("door", "door", "D", {})), false);
    const bak = backupBeforeV2(dir, f, "old", v2)!;
    expect(bak).toMatch(/private\/deleted\/old\.bak-\d{4}-\d{2}-\d{2}-pre-B1\.json$/);
    expect(fs.readFileSync(bak, "utf8")).toBe(v1);
    fs.writeFileSync(f, JSON.stringify(v2));
    expect(backupBeforeV2(dir, f, "old", v2)).toBeNull(); // already v2
    expect(backupBeforeV2(dir, path.join(dir, "projects", "new.json"), "new", v2)).toBeNull(); // new file
  });
  it("delete moves files and folders into private/deleted; nothing is lost", () => {
    const f = path.join(dir, "projects", "p.json"); fs.writeFileSync(f, "{}");
    const sub = path.join(dir, "projects", "p"); fs.mkdirSync(path.join(sub, "exports"), { recursive: true }); fs.writeFileSync(path.join(sub, "exports", "a.svg"), "x");
    const m1 = moveToDeleted(dir, f, "project.p")!; const m2 = moveToDeleted(dir, sub, "project.p.folder")!;
    expect(fs.existsSync(f)).toBe(false); expect(fs.readFileSync(m1, "utf8")).toBe("{}");
    expect(fs.readFileSync(path.join(m2, "exports", "a.svg"), "utf8")).toBe("x");
    expect(moveToDeleted(dir, f, "again")).toBeNull();
    expect(JSON.parse(fs.readFileSync(writeToDeleted(dir, "p.item.x", { a: 1 }), "utf8"))).toEqual({ a: 1 });
  });
  it("list summaries and the logo slot", () => {
    expect(projectSummary(blankProject("a", "A"))).toMatchObject({ name: "a", title: "A", format: 1, section: "subwoofer", items: 1 });
    const d = pv2.toDisk(pv2.newProject("b", "B", pv2.newItem("home", "box", "H", {})), false);
    expect(projectSummary(d)).toMatchObject({ format: 2, section: "home", items: 1 });
    expect(itemSummary({ id: "i", name: "N", section: "door", kind: "door", data: {} })).toEqual({ id: "i", name: "N", section: "door", kind: "door", saved: undefined });
    expect(findLogo(dir)).toBeNull();
    fs.mkdirSync(path.join(dir, "branding")); fs.writeFileSync(path.join(dir, "branding", "logo.png"), "x");
    expect(findLogo(dir)).toBe("logo.png");
    fs.writeFileSync(path.join(dir, "branding", "logo.svg"), "<svg/>"); expect(findLogo(dir)).toBe("logo.svg");
  });
});
