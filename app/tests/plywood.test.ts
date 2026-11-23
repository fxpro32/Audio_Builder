// B7_PLYWOOD_BOARDS: board materials (MDF + plywood types), thickness tolerance, grain lock, panel weight, BOM sheet line per
// material. P1_PUBLIC_DATA: uses the synthetic test catalogues tests/fixtures/board_catalogues.json (the real supplier catalogues
// are private data, data/private/boards/).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_BOX_MATERIAL, DEFAULT_IB_MATERIAL, itemMaterial, materialInfo, MATERIALS, matchThickness, panelsWeight, sheetsOfMaterial, THICKNESS_TOL_MM } from "../src/engine/boardmat";
import { checkLayout, grainErrors, nest, nestRepeat, Piece, piecesFromRows, smallestSheet, cheapestBuys } from "../src/engine/nest";
import { bomForProject } from "../src/engine/bom";
import type { BoxSource } from "../src/engine/bom";
import { bomSystem, lookups, catalogue as mdfCat, boardFixture } from "./bomfixture";
import type { Item } from "../src/ui/projectv2";

const plyCat = boardFixture.plywood;
const DATE = "2026-11-23";

describe("materials and the catalogues", () => {
  it("each material takes only its own sheets; MDF = every MDF sheet; formwork and decorative are not offered", () => {
    expect(sheetsOfMaterial("mdf", mdfCat.sheets, plyCat.sheets)).toHaveLength(mdfCat.sheets.length);
    const cats: Record<string, string> = { birch: "birch plywood", marine: "marine plywood", hoop: "hoop pine plywood", structural: "structural plywood", nonstructural: "non-structural plywood", exterior: "exterior plywood" };
    for (const [id, cat] of Object.entries(cats)) {
      const s = sheetsOfMaterial(id as any, mdfCat.sheets, plyCat.sheets);
      expect(s.length).toBeGreaterThan(0);
      expect(s.every((x: any) => x.category === cat)).toBe(true);
      expect(s).toHaveLength(plyCat.sheets.filter((x: any) => x.category === cat).length);
    }
    const offered = new Set(MATERIALS.flatMap((m) => m.categories ?? []));
    expect(offered.has("formwork plywood")).toBe(false); expect(offered.has("decorative plywood")).toBe(false);
  });
  it("defaults: MDF for a box, birch plywood for an IB baffle; a saved choice wins; unknown values fall back", () => {
    expect(DEFAULT_BOX_MATERIAL).toBe("mdf"); expect(DEFAULT_IB_MATERIAL).toBe("birch");
    expect(itemMaterial("box", undefined)).toBe("mdf"); expect(itemMaterial("ib", undefined)).toBe("birch");
    expect(itemMaterial("ib", "marine")).toBe("marine"); expect(itemMaterial("box", "nonsense")).toBe("mdf");
  });
  it("densities are the sourced catalogue figures (MDF 740 Alpine, birch 680 Metsa, hoop pine 600 Plytech, radiata 550 STRUCTAply); none for hardwood exterior", () => {
    const byType = (re: RegExp) => plyCat.densityKgM3.find((d: any) => re.test(d.type));
    expect(materialInfo("birch").density.kgM3).toBe(byType(/^birch/).kgM3);
    expect(materialInfo("hoop").density.kgM3).toBe(byType(/^hoop pine/).kgM3);
    expect(materialInfo("structural").density.kgM3).toBe(byType(/radiata/).kgM3);
    expect(materialInfo("mdf").density.kgM3).toBe(byType(/^MDF/).kgM3);
    expect(byType(/^birch/).source).toContain(materialInfo("birch").density.source);
    expect(byType(/^MDF/).source).toContain(materialInfo("mdf").density.source);
    expect(materialInfo("exterior").density.kgM3).toBeUndefined();
  });
});

describe("thickness tolerance", () => {
  it("18.5 mm hoop pine counts for an 18 mm design and is reported; 19 mm does not (tolerance 0.5 mm)", () => {
    expect(THICKNESS_TOL_MM).toBe(0.5);
    const hoop = sheetsOfMaterial("hoop", [], plyCat.sheets);
    const m = matchThickness(hoop, 18);
    expect(m.sheets.length).toBeGreaterThan(0);
    expect(m.sheets.some((s: any) => s.thicknessMm === 18.5)).toBe(true);
    expect(m.sheets.every((s: any) => Math.abs(s.thicknessMm - 18) <= 0.5)).toBe(true);
    expect(m.off).toEqual([18.5]);
    expect(matchThickness(hoop, 12).off).toEqual([12.5]);
    expect(matchThickness([{ thicknessMm: 19 }], 18).sheets).toHaveLength(0);
    expect(matchThickness(sheetsOfMaterial("birch", [], plyCat.sheets), 18).off).toEqual([]);
  });
});

/** Rectangle panels of a 405 x 360 x 255 box in 18 mm plus a 2-layer IB baffle 1000 x 500. */
const boxPieces = (): Piece[] => piecesFromRows([
  { name: "Side", qty: 2, a: 255, b: 360 }, { name: "Top/bottom", qty: 2, a: 369, b: 255 }, { name: "Front/back", qty: 2, a: 369, b: 324 },
  { name: "Baffle layer", qty: 2, a: 1000, b: 500 }, { name: "Strip", qty: 4, a: 120, b: 700 }]);

describe("grain lock", () => {
  it("never turns a panel so its long side runs across the grain, on every sheet size of birch and marine plywood", () => {
    const sizes = [...new Map(plyCat.sheets.filter((s: any) => /birch|marine/.test(s.category)).map((s: any) => [`${s.lengthMm}x${s.widthMm}`, s])).values()] as any[];
    let checked = 0;
    for (const s of sizes) {
      const plan = nestRepeat(boxPieces(), s.lengthMm, s.widthMm, { kerf: 3.2, trim: 5, pair: true, grain: true });
      for (const sh of plan.sheets) { expect(grainErrors(sh)).toEqual([]); expect(checkLayout(sh)).toEqual([]); checked += sh.placed.length; }
    }
    expect(checked).toBeGreaterThan(20);
  });
  it("wedge sides (trapezoids, paired head-to-tail) keep their long side along the sheet too", () => {
    const pcs = piecesFromRows([{ name: "Side", qty: 2, a: 360, b: 255, trap: { bottom: 360, top: 178 } }, { name: "Bottom", qty: 1, a: 373, b: 255 }, { name: "Back", qty: 1, a: 373, b: 337 }]);
    for (const [L, W] of [[1200, 600], [2440, 1220]]) { const p = nest(pcs, [{ L, W }], { kerf: 3.2, trim: 5, pair: true, grain: true }); expect(p.unplaced).toEqual([]); expect(grainErrors(p.sheets[0])).toEqual([]); }
  });
  it("without the lock the packer does turn panels across the grain for this set (so the lock is doing something)", () => {
    const pcs = piecesFromRows([{ name: "Tall", qty: 5, a: 300, b: 700 }]);
    const free = nest(pcs, [{ L: 1800, W: 900 }], { kerf: 3.2, trim: 5, grain: false });
    const locked = nest(pcs, [{ L: 1800, W: 900 }], { kerf: 3.2, trim: 5, grain: true });
    expect(free.sheets.flatMap(grainErrors).length).toBeGreaterThan(0);
    expect(locked.sheets.flatMap(grainErrors)).toEqual([]);
    expect(locked.unplaced.length + locked.sheets.reduce((a, s) => a + s.placed.length, 0)).toBe(5);
  });
  it("smallest sheet and cheapest buy honour the lock", () => {
    const birch = matchThickness(sheetsOfMaterial("birch", [], plyCat.sheets), 18).sheets.map((s: any, i: number) => ({ key: "k" + i, L: s.lengthMm, W: s.widthMm, price: s.priceAud, group: s.supplier }));
    const o = { kerf: 3.2, trim: 5, pair: true, grain: true };
    const sm = smallestSheet(boxPieces(), birch, o)!; expect(sm).toBeTruthy(); expect(grainErrors(sm.plan.sheets[0])).toEqual([]);
    for (const b of cheapestBuys(boxPieces(), birch, o)) for (const s of b.plan.sheets) expect(grainErrors(s)).toEqual([]);
  });
});

describe("weight", () => {
  it("about N kg = board volume x density (1 m2 of 18 mm: birch 12.24 kg, MDF 13.32 kg); no figure for hardwood exterior", () => {
    const sq: (Piece & { t: number })[] = [{ id: "a", name: "a", w: 1000, h: 1000, t: 18 }];
    expect(panelsWeight(sq, "birch").kg!).toBeCloseTo(12.24, 6);
    expect(panelsWeight(sq, "mdf").kg!).toBeCloseTo(13.32, 6);
    expect(panelsWeight(sq, "structural").kg!).toBeCloseTo(9.9, 6);
    expect(panelsWeight(sq, "exterior").kg).toBeUndefined();
    const tri: (Piece & { t: number })[] = [{ id: "t", name: "t", w: 1000, h: 1000, t: 10, trap: { bottom: 1000, top: 0 } }];
    expect(panelsWeight(tri, "hoop").kg!).toBeCloseTo(0.5 * 0.01 * 600, 6); // real (trapezoid) area, not the blank
  });
});

describe("BOM sheet line follows the material (B7)", () => {
  const ibItem = (material?: string): Item => ({ id: "ib1", section: "ib", kind: "ib", name: "Trunk IB", data: { driverId: "drvA", count: 2, ...(material ? { boardMaterial: material } : {}) }, links: [] });
  const ibSrc: BoxSource = { label: "IB", kind: "ib", panels: piecesFromRows([{ name: "Baffle layer", qty: 2, a: 1000, b: 500 }]).map((p) => ({ ...p, t: 18 })) };
  const lk = (extra: Partial<ReturnType<typeof lookups>> = {}, mats: Record<string, string | undefined> = {}) => {
    const base = lookups();
    return { ...base, plySheets: plyCat.sheets, ...extra, box: (it: Item) => { const s = it.kind === "ib" ? { ...ibSrc } : base.box!(it); return s ? { ...s, material: mats[it.id] ?? it.data?.boardMaterial } : s; } };
  };
  const sheetLines = (b: ReturnType<typeof bomForProject>) => b.groups.find((g) => g.id === "enclosure")!.lines.filter((l) => /sheet/.test(String(l.category)));
  it("box on MDF (default, key unchanged) and IB baffle on birch plywood by default", () => {
    const doc = bomSystem(); doc.items.push(ibItem());
    const ls = sheetLines(bomForProject(doc, lk(), { date: DATE }));
    const mdf = ls.find((l) => l.key.startsWith("mdf:16:"))!; expect(mdf.category).toBe("MDF sheet");
    const ply = ls.find((l) => l.key.startsWith("ply:birch:18:"))!;
    expect(ply).toBeTruthy(); expect(ply.category).toBe("Plywood sheet"); expect(ply.item).toMatch(/^Birch plywood sheet 18 mm, \d+ x \d+ mm$/);
    expect(ply.fromNames).toEqual(["Trunk IB"]); expect(ply.derived).toContain("Grain lock");
    expect(ply.specs).toContain("panels about 12.2 kg at 680 kg/m³"); // 2 x 0.5 m2 x 0.018 m x 680 kg/m3 = 12.24 kg
    const birchSizes = plyCat.sheets.filter((s: any) => s.category === "birch plywood" && s.thicknessMm === 18).map((s: any) => `${s.lengthMm}x${s.widthMm}`);
    expect(birchSizes).toContain(ply.key.split(":").pop());
  });
  it("box switched to marine plywood: its sheet line is marine plywood; IB set to marine joins the same 18 mm marine line only at the same thickness", () => {
    const doc = bomSystem(); doc.items.find((i) => i.id === "box-1")!.data.boardMaterial = "marine";
    const ls = sheetLines(bomForProject(doc, lk(), { date: DATE }));
    expect(ls.some((l) => l.key.startsWith("mdf:"))).toBe(false);
    const m = ls.find((l) => l.key.startsWith("ply:marine:16:")) ; // 16 mm: is there marine within 0.5 mm? if not, a missing line
    const missing = bomForProject(doc, lk(), { date: DATE }).missing.find((x) => x.key.startsWith("miss:ply:marine:16"));
    const has16 = plyCat.sheets.some((s: any) => s.category === "marine plywood" && Math.abs(s.thicknessMm - 16) <= 0.5);
    if (has16) expect(m).toBeTruthy(); else expect(missing).toBeTruthy();
    doc.items.find((i) => i.id === "box-1")!.data.geom.t = 18;
    const ls18 = sheetLines(bomForProject(doc, lk(), { date: DATE }));
    const mar = ls18.find((l) => l.key.startsWith("ply:marine:18:"))!; expect(mar.item).toMatch(/^Marine plywood sheet 18 mm/);
    expect(mar.prices!.length).toBeGreaterThan(0);
  });
  it("plywood sheet list not loaded (older server): a missing line names the restart", () => {
    const doc = bomSystem(); doc.items.push(ibItem());
    const b = bomForProject(doc, lk({ plySheets: undefined }), { date: DATE });
    const miss = b.missing.find((x) => x.key.startsWith("miss:ply:birch:18"))!;
    expect(miss).toBeTruthy(); expect(JSON.stringify(miss)).toContain("restart");
  });
});

// PM 2026-11-23: "comparison only" sheets (Trademaster, Sydney) are listed but never the recommended buy for a Melbourne user
import { buyable, isComparisonOnly } from "../src/engine/boardmat";
describe("comparison-only sheets", () => {
  it("are kept out of the buy pool when other sheets exist, and used only when they are all there is", () => {
    const birch18 = matchThickness(sheetsOfMaterial("birch", [], plyCat.sheets), 18).sheets as any[];
    expect(birch18.some((s) => isComparisonOnly(s))).toBe(true);
    const pool = buyable(birch18, (s) => s);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((s) => !isComparisonOnly(s))).toBe(true);
    const onlyCmp = birch18.filter((s) => isComparisonOnly(s));
    expect(buyable(onlyCmp, (s) => s)).toEqual(onlyCmp);
  });
});

// P1_PUBLIC_DATA: the public app has only generic sheet sizes without prices (data/boards/generic_sheets.json)
describe("generic sheet list (public data, no prices)", () => {
  const gen = JSON.parse(readFileSync(new URL("../../data/boards/generic_sheets.json", import.meta.url), "utf8"));
  const isMdf = (s: any) => s.category === "standard" || s.category === "moisture_resistant";
  it("no prices, no suppliers, no links; every material has sheets", () => {
    expect(gen.sheets.length).toBeGreaterThan(20);
    for (const s of gen.sheets) { expect(s.priceAud).toBeNull(); expect(s.url).toBeNull(); expect(s.supplier).toBe("Generic size"); }
    for (const m of MATERIALS) expect(sheetsOfMaterial(m.id, gen.sheets.filter(isMdf), gen.sheets.filter((s: any) => !isMdf(s))).length, m.id).toBeGreaterThan(0);
  });
  it("smallest sheet still found; no cheapest buy without prices; the BOM counts sheets with no price", () => {
    const o = { kerf: 3.2, trim: 5, pair: true };
    const specs = gen.sheets.filter((s: any) => isMdf(s) && s.thicknessMm === 18).map((s: any, i: number) => ({ key: "g" + i, L: s.lengthMm, W: s.widthMm, price: s.priceAud, group: s.supplier }));
    expect(smallestSheet(boxPieces(), specs, o)).toBeTruthy();
    expect(cheapestBuys(boxPieces(), specs, o)).toEqual([]);
    const doc = bomSystem();
    const b = bomForProject(doc, { ...lookups(), sheets: gen.sheets.filter(isMdf), plySheets: gen.sheets.filter((s: any) => !isMdf(s)) }, { date: DATE });
    const l = b.groups.find((g) => g.id === "enclosure")!.lines.find((x) => x.key.startsWith("mdf:16:"))!;
    expect(l.qty).toBeGreaterThanOrEqual(1); expect(l.unitPrice).toBeUndefined(); expect(l.prices).toEqual([]);
    // a panel set bigger than any single sheet: counted as several sheets of the largest size, not "does not fit"
    const ib: Item = { id: "ib1", section: "ib", kind: "ib", name: "Big IB", data: { driverId: "drvA", count: 2, boardMaterial: "birch" }, links: [] };
    doc.items.push(ib);
    const big: BoxSource = { label: "IB", kind: "ib", material: "birch", panels: piecesFromRows([{ name: "Baffle layer", qty: 4, a: 2000, b: 1000 }]).map((p) => ({ ...p, t: 18 })) } as any;
    const lk2 = { ...lookups(), sheets: gen.sheets.filter(isMdf), plySheets: gen.sheets.filter((s: any) => !isMdf(s)), box: (it: Item) => (it.kind === "ib" ? big : lookups().box!(it)) };
    const b2 = bomForProject(doc, lk2, { date: DATE });
    const pl = b2.groups.find((g) => g.id === "enclosure")!.lines.find((x) => x.key.startsWith("ply:birch:18:"))!;
    expect(pl).toBeTruthy(); expect(pl.qty).toBeGreaterThanOrEqual(2); expect(pl.unitPrice).toBeUndefined();
    expect(b2.missing.some((x) => x.key.startsWith("miss:ply:birch:18"))).toBe(false);
  });
});
