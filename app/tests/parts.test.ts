// B3_PARTS_DB (R39, R40): importers (car subs, car drivers, parts bundles), normalisation of known records, part -> item
// mapping (field names of docs/cable_engine.md / docs/diagram_engine.md), Parts tab filters, driver helpers.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { fuseFamily, ITEM_FIELDS, itemKindFor, normalisePart, normClass, Part, PART_CATEGORIES, partToItem, setItemField } from "../src/engine/parts";
import { calcProject, productArea, productMaterial } from "../src/engine/cable";
import { checkSystem } from "../src/engine/syscheck";
import { partMatches, sortParts, PART_COLUMNS } from "../src/ui/partslist";
import { findDriver, isSubwoofer, modelKey, shadowedLibraryIds, driverType } from "../src/ui/driverlist";
import { driverFitsSection } from "../src/ui/sections";
import type { Driver } from "../src/engine/driver";
import type { ProjectDoc } from "../src/ui/projectv2";

const ROOT = path.resolve(__dirname, "..", "..");
const LIB = path.join(ROOT, "data", "drivers", "library");
const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));
const carSubs = read(path.join(LIB, "car-subs.json"));
const carDrv = read(path.join(LIB, "car-drivers.json"));
const hp = read(path.join(LIB, "hp-car-subs.json"));
const bundle = (c: string) => read(path.join(ROOT, "data", "parts", c + ".json"));
// P1_PUBLIC_DATA: the full bundles with prices and retailer-listing records are private data (data/private/parts/), present only
// on the owner's machine; checks that need them are skipped on a fresh clone
const PRIVATE_PARTS = path.join(ROOT, "data", "private", "parts");
const privateBundle = (c: string) => read(path.join(PRIVATE_PARTS, c + ".json"));
const rawCount = (dir: string, key: string) => fs.readdirSync(dir, { recursive: true } as any).filter((f: any) => String(f).endsWith(".json")).reduce((n: number, f: any) => n + (read(path.join(dir, String(f)))[key]?.length ?? 0), 0);

describe("car-subs bundle (import_car_subs.mjs)", () => {
  it("shape, licence, supersedes hp-car-subs, counts match the raw files", () => {
    expect(carSubs.source).toBe("car-subs"); expect(carSubs.licence).toBe("CC BY 4.0"); expect(carSubs.attribution).toBeTruthy();
    expect(carSubs.supersedes).toEqual(["hp-car-subs"]); expect(carSubs.count).toBe(carSubs.drivers.length);
    const raw = rawCount(path.join(ROOT, "data", "car_subs_raw"), "drivers");
    const carried = carSubs.drivers.filter((d: any) => d.id.startsWith("lib-hpsubs-")).length;
    expect(carSubs.drivers.length).toBeGreaterThan(1000);
    expect(carSubs.drivers.length).toBeLessThanOrEqual(raw + carried); // duplicates merged, never invented
  });
  it("ids unique, every record a subwoofer with at least one maker source URL", () => {
    const ids = new Set<string>();
    for (const d of carSubs.drivers) { expect(ids.has(d.id)).toBe(false); ids.add(d.id); expect(d.type).toBe("subwoofer"); expect(d.sources.length).toBeGreaterThan(0); expect(d.sources.some((s: any) => /^https?:\/\//.test(s.source ?? "") || /manual|sheet|catalog/i.test(s.where ?? "")), d.id).toBe(true); } // a maker URL, or a named maker document (Pioneer TS-W3002D4: the owner's manual supplied by the project owner, no URL)
  });
  it("every old hp-car-subs id still resolves (alias or carried over), to the same brand and model", () => {
    const list: Driver[] = carSubs.drivers;
    for (const h of hp.drivers) { const d = findDriver(list, h.id, carSubs.aliases); expect(d, h.id).toBeTruthy(); expect(d!.brand).toBe(h.brand); expect(d!.model).toBe(h.model); }
    for (const v of Object.values(carSubs.aliases)) expect(list.some((d) => d.id === v)).toBe(true);
  });
  it("running the importer twice on the same files gives the same bytes (deterministic)", () => {
    // R2B may still be adding raw files, so two fresh runs are compared (not the bundle on disk)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b3cs_"));
    fs.mkdirSync(path.join(tmp, "drivers", "library"), { recursive: true });
    fs.cpSync(path.join(ROOT, "data", "car_subs_raw"), path.join(tmp, "car_subs_raw"), { recursive: true });
    fs.copyFileSync(path.join(LIB, "hp-car-subs.json"), path.join(tmp, "drivers", "library", "hp-car-subs.json"));
    const out = path.join(tmp, "drivers", "library", "car-subs.json");
    execFileSync("node", [path.join(ROOT, "scripts", "import_car_subs.mjs"), tmp], { stdio: "ignore" }); const a = fs.readFileSync(out, "utf8");
    execFileSync("node", [path.join(ROOT, "scripts", "import_car_subs.mjs"), tmp], { stdio: "ignore" }); const b = fs.readFileSync(out, "utf8");
    expect(a === b).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("car-drivers bundle (import_car_drivers.mjs)", () => {
  it("shape, counts = raw records, ids unique, sources, types", () => {
    expect(carDrv.source).toBe("car-drivers"); expect(carDrv.licence).toBe("CC BY 4.0");
    expect(carDrv.count).toBe(carDrv.drivers.length);
    expect(carDrv.drivers.length).toBe(rawCount(path.join(ROOT, "data", "car_drivers_raw"), "drivers"));
    const ids = new Set<string>();
    for (const d of carDrv.drivers) {
      expect(ids.has(d.id)).toBe(false); ids.add(d.id); expect(d.id.startsWith("lib-cardrv-")).toBe(true);
      expect(["tweeter", "midrange", "midbass", "coaxial", "component_set", "fullrange"]).toContain(d.type);
      expect(d.sources.some((s: any) => /^https?:\/\//.test(s.source))).toBe(true);
    }
  });
  it("ETON GRAPHIT 16 midbass: maker values in SI, mounting depth and cut-out", () => {
    const d = carDrv.drivers.find((x: any) => x.model === "GRAPHIT 16");
    expect(d.type).toBe("midbass"); expect(d.params.fs).toBe(66); expect(d.params.Vas).toBeCloseTo(0.0073, 9); expect(d.params.Sd).toBeCloseTo(0.0132, 9);
    expect(d.params.depth).toBeCloseTo(0.0688, 9); expect(d.params.cutout).toBeCloseTo(0.146, 9); expect(d.params.Znom).toBe(4); expect(d.incomplete).toBeUndefined();
  });
});

describe("driver lists (driverlist.ts, sections.ts)", () => {
  const all: Driver[] = [...carSubs.drivers, ...carDrv.drivers];
  it("Subwoofers only keeps car subs and drops tweeters / midbass of any size", () => {
    expect(carSubs.drivers.every((d: Driver) => isSubwoofer(d))).toBe(true);
    expect(carDrv.drivers.some((d: Driver) => isSubwoofer(d))).toBe(false);
  });
  it("door: car midbass / midrange / coaxial / sets 4-8 in, never tweeters or subs; IB: no car speakers", () => {
    const door = all.filter((d) => driverFitsSection(d, "door"));
    expect(door.some((d) => d.type === "midbass")).toBe(true); expect(door.some((d) => d.type === "coaxial")).toBe(true);
    expect(door.some((d) => d.type === "tweeter" || d.type === "subwoofer")).toBe(false);
    expect(all.filter((d) => driverFitsSection(d, "ib")).every((d) => driverType(d) === "subwoofer")).toBe(true);
  });
  it("the car-subs Pioneer TS-W3002D4 is hidden behind your own (private) entry, still found by id", () => {
    const mine: Driver = { id: "pioneer-ts-w3002d4", brand: "Pioneer", model: "TS-W3002D4 (Champion Series PRO 12\", DVC 2×4 Ω)", params: { fs: 1, Re: 1, Qms: 1, Qes: 1, Sd: 1 }, private: true };
    const lib = carSubs.drivers.find((d: Driver) => d.brand === "Pioneer" && /^TS-W3002D4/.test(d.model));
    expect(lib).toBeTruthy(); expect(modelKey(lib)).toBe(modelKey(mine));
    const sh = shadowedLibraryIds([mine, ...all]); expect(sh.has(lib.id)).toBe(true); expect(sh.size).toBe(1);
    expect(findDriver([mine, ...all], lib.id)).toBe(lib);
  });
});

describe("parts bundles (import_parts.mjs)", () => {
  const rawDir = (c: string) => path.join(ROOT, "data", "parts_raw", c);
  it("one bundle per category, counts = raw records, ids unique in each category, every record has a source URL and check text kept", () => {
    // the same product may be in two categories with the same id (e.g. AudioControl D-4.800: amplifiers and dsp); lookups give the category
    for (const { id: c } of PART_CATEGORIES) {
      const ids = new Set<string>();
      const b = bundle(c); expect(b.schema).toBe("parts/1"); expect(b.licence).toBe("CC BY 4.0"); expect(b.attribution).toBeTruthy();
      expect(b.count).toBe(b.records.length); expect(b.records.length).toBe(rawCount(rawDir(c), "records"));
      for (const r of b.records) {
        expect(ids.has(r.id), r.id).toBe(false); ids.add(r.id);
        expect(r.category).toBe(c); expect(r.brand).toBeTruthy();
        expect(/^https?:\/\//.test(r.sourceUrl ?? ""), r.id).toBe(true);
        if (r.quality_issues?.length) expect(r.check).toBeTruthy();
        for (const p of r.n.prices) { expect(p.priceAud).toBeGreaterThan(0); expect(p.supplier).toBeTruthy(); }
      }
    }
  });
  it("Rockford Fosgate T1500-1bdCP: class BD, 1 x 1500 W at 2 and 1 ohm, 200 A max, 200 A fuse, 4 AWG; the cable engine uses the maker's 200 A", () => {
    const p: Part = bundle("amplifiers").records.find((r: any) => r.id === "rockford-t1500-1bdcp");
    expect(p.n.cls).toBe("BD"); expect(p.n.channels).toBe(1); expect(p.n.minLoadOhm).toBe(1);
    expect(p.n.rms).toEqual({ "4": 1000, "2": 1500, "1": 1500 }); expect(p.n.iMaxA).toBe(200); expect(p.n.fuseA).toBe(200); expect(p.n.powerWireAwg).toBe("4");
    expect(p.n.priceAud).toBeUndefined(); // P1_PUBLIC_DATA: the public bundle carries no prices
    if (fs.existsSync(PRIVATE_PARTS)) expect(privateBundle("amplifiers").records.find((r: any) => r.id === "rockford-t1500-1bdcp").n.priceAud).toBeCloseTo(1065.78, 2);
    const amp = { id: "a", section: "electrical", kind: "amplifier", name: "amp", data: partToItem(p).data, links: [] as any[] };
    expect(amp.data).toEqual({ partId: "rockford-t1500-1bdcp", partCategory: "amplifiers", class: "BD", channels: 1, minLoadOhm: 1 });
    const doc: ProjectDoc = { format: 2, name: "t", title: "t", section: "subwoofer", activeItem: "b", items: [
      { id: "b", section: "electrical", kind: "battery", name: "battery", data: {}, links: [{ from: "b", to: "f", kind: "power" }] },
      { id: "f", section: "electrical", kind: "fuse", name: "fuse", data: { ratingA: 200, distanceMm: 100 }, links: [{ from: "f", to: "a", kind: "power", cableItemId: "c" }] },
      { id: "c", section: "electrical", kind: "cable", name: "power", data: { lengthM: 5, size: "4", material: "copper" }, links: [] },
      amp] } as any;
    const lk = { part: (id: string) => (id === p.id ? p : undefined) };
    const res = calcProject(doc, lk);
    expect(res.loads[0].maxA).toBe(200); expect(res.loads[0].source).toBe("maker max");
    expect(checkSystem(doc, lk).some((i) => i.rule === "amp-no-power")).toBe(false);
  });
  it("Audiopipe APHF-500.4D-H2: 4 x 300 W at 4 ohm not bridged, 2 x 1000 W bridged", () => {
    const p: Part = bundle("amplifiers").records.find((r: any) => r.model === "APHF-500.4D-H2");
    expect(p.n.channels).toBe(4); expect(p.n.rmsPerCh!["4"]).toBe(300); expect(p.n.rms!["4"]).toBe(1200);
    expect(p.n.bridged).toEqual([{ w: 1000, ch: 2, ohm: 4 }]); expect(p.n.bridgedW).toBe(2000); expect(p.n.minLoadOhm).toBe(2);
    expect(p.n.priceAud).toBeUndefined(); // USD store price only: never converted or mixed
  });
  it("cable: real copper area and material are the cable engine's (productArea / productMaterial) for every record", () => {
    for (const r of bundle("cable").records) { const a = productArea(r); expect(r.n.areaMm2).toBe(a.areaMm2 === undefined ? undefined : +a.areaMm2.toFixed(3)); expect(r.n.material).toBe(productMaterial(r)); }
    const k = bundle("cable").records.find((r: any) => /kolossus/i.test(r.title ?? "") && r.awg === "1/0");
    if (k) expect(k.n.areaMm2).toBeCloseTo(65.2, 1);
  });
  it("a fuse rating that is only the SKU's digits is left empty (synthetic record), a stated one is kept", () => {
    // P1_PUBLIC_DATA: the Aerpro record below is a retailer-listing record (private data); this synthetic one keeps the rule tested
    const s = normalisePart({ id: "x-ap462a", model: "AP462A", kind: "fuse", fuse_type: "ANL", rating_a: null, rating_a_as_parsed: 462, sources: [{ url: "https://example.com/x" }] }, "fuses", { brand: "B" });
    expect(s.n.ratingA).toBeUndefined(); expect(partToItem(s).data.ratingA).toBeUndefined();
    const rf = bundle("fuses").records.find((r: any) => r.model === "RFFA500"); if (rf) { expect(rf.n.ratingA).toBe(500); expect(rf.n.warnings).toBeUndefined(); }
  });
  it.skipIf(!fs.existsSync(PRIVATE_PARTS))("local private bundle: Aerpro AP462A rating from the SKU's digits is left empty", () => {
    const f = privateBundle("fuses").records;
    const a = f.find((r: any) => r.id === "aerpro-ap462a"); expect(a.rating_a).toBeNull(); expect(a.rating_a_as_parsed).toBe(462); expect(a.n.ratingA).toBeUndefined(); expect(a.n.warnings.length).toBe(1);
    expect(partToItem(a).data.ratingA).toBeUndefined();
    const rf = f.find((r: any) => r.model === "RFFA500"); if (rf) { expect(rf.n.ratingA).toBe(500); expect(rf.n.warnings).toBeUndefined(); }
  });
  it("normalisation helpers", () => {
    expect(normClass("Class A/B")).toBe("AB"); expect(normClass("Class-D")).toBe("D"); expect(normClass("(PT) Class D")).toBe("D"); expect(normClass("Class A/B + Class BD (Sub)")).toBe("AB+BD");
    expect(fuseFamily("mini ANL / AFS")).toBe("MANL/AFS"); expect(fuseFamily("ANL")).toBe("ANL"); expect(fuseFamily("Midi")).toBe("MIDI"); expect(fuseFamily("standard blade (ATO/ATC)")).toBe("blade"); expect(fuseFamily("high-amp circuit breaker")).toBe("breaker");
    const raw = { id: "x-1", model: "X", prices_aud: [{ supplier: "S", price_aud: 20, url: "https://a", read_date: "2026-11-23" }, { supplier: "T", price_aud: 15, url: "https://b" }], sources: [{ url: "https://m", read_date: "2026-11-23" }], kind: "fuse holder", fuse_type: "ANL", fuse_included_a: 150 };
    const p = normalisePart(raw, "fuses", { brand: "B" });
    expect(p.n.priceAud).toBe(15); expect(p.n.fuseType).toBe("ANL"); expect(p.n.ratingA).toBe(150); expect(p.sourceUrl).toBe("https://m"); expect(p.fuse_type).toBe("ANL");
  });
});

describe("part -> project item (field names of the cable and diagram engines)", () => {
  const mk = (category: any, extra: any): Part => normalisePart({ id: "p", model: "M", sources: [{ url: "https://x" }], ...extra }, category, { brand: "B" });
  it("kinds", () => {
    expect(itemKindFor({ category: "amplifiers" })).toBe("amplifier"); expect(itemKindFor({ category: "dsp" })).toBe("dsp");
    expect(itemKindFor({ category: "capacitors" })).toBe("capacitor"); expect(itemKindFor({ category: "batteries" })).toBe("battery");
    expect(itemKindFor({ category: "fuses", kind: "fuse" })).toBe("fuse"); expect(itemKindFor({ category: "fuses", kind: "fuse holder" })).toBe("fuseholder");
    expect(itemKindFor({ category: "fuses", kind: "fuse block" })).toBe("distribution"); expect(itemKindFor({ category: "distribution" })).toBe("distribution");
    expect(itemKindFor({ category: "cable" })).toBe("cable"); expect(itemKindFor({ category: "terminals" })).toBe("connector"); expect(itemKindFor({ category: "interconnects" })).toBe("connector");
  });
  it("cable with length, fuse rating, capacitor, distribution", () => {
    const c = partToItem(mk("cable", { kind: "power/ground", awg: "4", material: "OFC", actual_area_mm2_from_strands: 19.8 }), { lengthM: 5.5 });
    expect(c).toMatchObject({ section: "electrical", kind: "cable", name: "B M", data: { partId: "p", partCategory: "cable", lengthM: 5.5, size: "4", areaMm2: 19.8, material: "copper" } });
    const cl = partToItem(mk("cable", { kind: "power/ground", awg: "4", material: "CCA" })); // gauge label only: area left to the engine (labelOnly)
    expect(cl.data.areaMm2).toBeUndefined(); expect(cl.data.material).toBe("cca"); expect(cl.data.lengthM).toBeUndefined();
    expect(partToItem(mk("fuses", { kind: "fuse", fuse_type: "ANL", rating_a: 150 })).data).toEqual({ partId: "p", partCategory: "fuses", ratingA: 150 });
    expect(partToItem(mk("capacitors", { farads: 1, voltage_v: 20 })).data).toMatchObject({ farads: 1, voltageV: 20 });
    expect(partToItem(mk("distribution", { kind: "fused distribution block" })).data).toMatchObject({ fused: true });
  });
  it("edit fields use exactly the engines' names", () => {
    const keys = (k: string) => ITEM_FIELDS[k].map((f) => f.key);
    expect(keys("amplifier")).toEqual(expect.arrayContaining(["class", "channels", "minLoadOhm", "loadOhm", "rmsW", "iMaxA", "iMusicA", "fuseA", "powerWireAwg", "suggestedAlternatorA", "autoOn", "source"]));
    expect(keys("cable")).toEqual(expect.arrayContaining(["lengthM", "groundLengthM", "size", "areaMm2", "material", "location", "bundled"]));
    expect(keys("fuse")).toEqual(expect.arrayContaining(["ratingA", "distanceMm", "sheathed"])); expect(keys("capacitor")).toEqual(expect.arrayContaining(["farads", "voltageV", "prechargeOhm"]));
    expect(keys("battery")).toEqual(["alternatorA", "vehicleLoadA"]); expect(keys("distribution")).toEqual(["fused", "fuseA"]);
    const d: any = {}; setItemField(d, ITEM_FIELDS.cable[0], "4.5"); setItemField(d, ITEM_FIELDS.cable[4], "cca"); expect(d).toEqual({ lengthM: 4.5, material: "cca" });
    setItemField(d, ITEM_FIELDS.cable[0], ""); expect(d.lengthM).toBeUndefined();
  });
});

describe("Parts tab filters and sorting (partslist.ts)", () => {
  const amps: Part[] = bundle("amplifiers").records;
  it("amplifiers: channels, class, RMS at a load, bridged, min load, price", () => {
    const f = amps.filter((p) => partMatches(p, "amplifiers", { ch: "1", load: "1", rmsMin: "1500", minLoad: "1" }));
    expect(f.some((p) => p.id === "rockford-t1500-1bdcp")).toBe(true);
    expect(f.every((p) => p.n.channels === 1 && (p.n.rms?.["1"] ?? 0) >= 1500 && p.n.minLoadOhm! <= 1)).toBe(true);
    expect(amps.filter((p) => partMatches(p, "amplifiers", { load: "bridged", rmsMin: "2000" })).some((p) => p.model === "APHF-500.4D-H2")).toBe(true);
    expect(amps.filter((p) => partMatches(p, "amplifiers", { priceMax: "500" })).every((p) => p.n.priceAud! <= 500)).toBe(true);
    expect(amps.filter((p) => partMatches(p, "amplifiers", { q: "t1500 rockford" })).map((p) => p.id)).toContain("rockford-t1500-1bdcp");
  });
  it("cable by real copper area and material; fuses by type and rating", () => {
    const cab: Part[] = bundle("cable").records;
    const big = cab.filter((p) => partMatches(p, "cable", { areaMin: "50", mat: "copper" }));
    expect(big.length).toBeGreaterThan(0); expect(big.every((p) => p.n.areaMm2! >= 50 && p.n.material === "copper")).toBe(true);
    const fu: Part[] = bundle("fuses").records;
    const anl = fu.filter((p) => partMatches(p, "fuses", { type: "ANL", aMin: "100", aMax: "200" }));
    expect(anl.length).toBeGreaterThan(0); expect(anl.every((p) => p.n.fuseType === "ANL" && p.n.ratingA! >= 100 && p.n.ratingA! <= 200)).toBe(true);
  });
  it("sort: numbers numerically, empty values last both ways", () => {
    const up = sortParts(amps, "amplifiers", "rms1", 1), down = sortParts(amps, "amplifiers", "rms1", -1);
    const v = (l: Part[]) => l.map((p) => p.n.rms?.["1"]).filter((x) => x !== undefined) as number[];
    expect(v(up)).toEqual([...v(up)].sort((a, b) => a - b)); expect(v(down)).toEqual([...v(down)].sort((a, b) => b - a));
    expect(up[up.length - 1].n.rms?.["1"]).toBeUndefined(); expect(down[down.length - 1].n.rms?.["1"]).toBeUndefined();
    for (const c of PART_CATEGORIES) expect(PART_COLUMNS[c.id].length).toBeGreaterThan(3);
  });
});
