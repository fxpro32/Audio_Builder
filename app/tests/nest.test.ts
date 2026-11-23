// A13_BOARDS: sheet nesting (engine/nest.ts) and the board catalogue.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkLayout, cheapestBuys, makeItems, nest, nestRepeat, packSheet, Piece, pieceArea, pieceFromOutline, piecesFromRows, SheetSpec, smallestSheet } from "../src/engine/nest";
import { blankProject, cutList } from "../src/ui/model";

const rect = (id: string, w: number, h: number): Piece => ({ id, name: id, w, h });
const O = { kerf: 3.2, trim: 5, pair: true };
const allPieces = (p: ReturnType<typeof nest>) => p.sheets.flatMap((s) => s.placed.flatMap((x) => x.parts.map((q) => q.piece.id)));

// The sample new_sub_box as stored (geom 405 × 360 × 255 → 178 top, 16 mm)
const sub = { ...blankProject("t", "t"), geom: { ...blankProject("t", "t").geom, W: 405, H: 360, D: 255, wedge: true, Dtop: 178, t: 16 } };
const subPieces = piecesFromRows(cutList(sub));
// P1_PUBLIC_DATA: synthetic test catalogue (made-up suppliers and prices); the real supplier catalogue is private data
const catalogue = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/board_catalogues.json"), "utf8")).mdf;
const PRIVATE_MDF = path.resolve(__dirname, "../../data/private/boards/mdf_sheets_au.json");

describe("nesting basics", () => {
  it("never overlaps, keeps the kerf and the trimmed edges, places every panel or reports it", () => {
    const pcs = [rect("a", 700, 400), rect("b", 700, 400), rect("c", 500, 300), rect("d", 300, 300), rect("e", 1000, 200), rect("f", 250, 150), rect("g", 250, 150), rect("h", 3000, 100)];
    const plan = nest(pcs, [{ L: 2400, W: 1200 }], O);
    for (const s of plan.sheets) expect(checkLayout(s)).toEqual([]);
    expect(plan.unplaced.map((p) => p.id)).toEqual(["h"]); // longer than the sheet: reported, not dropped
    expect(allPieces(plan).sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
  it("respects the sheet size exactly: a panel the full trimmed size fits, 1 mm more does not", () => {
    const L = 1200, W = 600;
    expect(nest([rect("x", L - 10, W - 10)], [{ L, W }], O).unplaced).toHaveLength(0);
    expect(nest([rect("x", L - 9, W - 10)], [{ L, W }], O).unplaced).toHaveLength(1);
    expect(nest([rect("x", L, W)], [{ L, W }], { kerf: 3.2, trim: 0 }).unplaced).toHaveLength(0);
  });
  it("kerf matters: two halves of a trimmed sheet do not fit with a 3.2 mm kerf, they do with 0", () => {
    const pcs = [rect("a", 595, 590), rect("b", 595, 590)]; // 1200 × 600 sheet, trim 5 → 1190 × 590 usable
    expect(nest(pcs, [{ L: 1200, W: 600 }], { kerf: 3.2, trim: 5 }).unplaced).toHaveLength(1);
    expect(nest(pcs, [{ L: 1200, W: 600 }], { kerf: 0, trim: 5 }).unplaced).toHaveLength(0);
  });
  it("turns panels 90° when that is the only way they fit", () => {
    const plan = nest([rect("tall", 300, 1100)], [{ L: 1200, W: 600 }], O); // 1100 high only fits along the 1200 length
    expect(plan.unplaced).toHaveLength(0);
    const p = plan.sheets[0].placed[0]; expect(p.w).toBeCloseTo(1100); expect(p.h).toBeCloseTo(300);
    expect(checkLayout(plan.sheets[0])).toEqual([]);
  });
  it("cut order: stage-1 cuts first, numbered 1..n, each cut a straight edge-to-edge line", () => {
    const plan = nest([rect("a", 500, 400), rect("b", 500, 400), rect("c", 500, 300)], [{ L: 1200, W: 900 }], O);
    const cuts = plan.sheets[0].cuts;
    expect(cuts.map((c) => c.n)).toEqual(cuts.map((_, i) => i + 1));
    const stages = cuts.map((c) => c.stage); expect([...stages].sort((a, b) => a - b)[0]).toBe(stages[0]);
    const firstNon1 = stages.findIndex((s) => s !== 1); if (firstNon1 >= 0) expect(stages.slice(firstNon1).includes(1)).toBe(false);
    for (const c of cuts.filter((c) => c.stage === 1)) expect(c.line[0][0] === c.line[1][0] || c.line[0][1] === c.line[1][1]).toBe(true);
  });
  it("several sheets when one is not enough", () => {
    const pcs = Array.from({ length: 6 }, (_, i) => rect("p" + i, 550, 550));
    const plan = nestRepeat(pcs, 1200, 600, O);
    expect(plan.unplaced).toHaveLength(0); expect(plan.sheets.length).toBe(3);
    for (const s of plan.sheets) expect(checkLayout(s)).toEqual([]);
  });
});

describe("wedge sides (right trapezoids)", () => {
  it("pair head-to-tail into one blank, the sloped cut kerf-wide, both outlines inside the blank", () => {
    const t: Piece = { id: "s1", name: "Side 1", w: 255, h: 360, trap: { bottom: 255, top: 178 }, pairKey: "Side" };
    const items = makeItems([t, { ...t, id: "s2", name: "Side 2" }], 3.2, true);
    expect(items).toHaveLength(1);
    const it0 = items[0]; const s = (3.2 * Math.hypot(255 - 178, 360)) / 360;
    expect(it0.w).toBeCloseTo(255 + 178 + s, 6); expect(it0.h).toBe(360);
    // the two slopes are parallel and exactly one kerf apart (perpendicular distance)
    const [a, b] = [it0.parts[0].poly, it0.parts[1].poly];
    const p1 = a[1], p2 = a[2]; const q1 = b[2]; const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const dist = Math.abs(dx * (q1[1] - p1[1]) - dy * (q1[0] - p1[0])) / Math.hypot(dx, dy);
    expect(dist).toBeCloseTo(3.2, 6);
    for (const poly of [a, b]) for (const [x, y] of poly) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(it0.w + 1e-9); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(360); }
    expect(pieceArea(t)).toBeCloseTo(((255 + 178) / 2) * 360, 6);
  });
  it("pairing is used when it saves sheets, and the layout has a sloped cut", () => {
    const t: Piece = { id: "s1", name: "Side 1", w: 600, h: 500, trap: { bottom: 600, top: 100 }, pairKey: "Side" };
    // sheet usable 790 × 590: two 600 × 500 blanks cannot sit side by side (1203 > 790) or stacked (1003 > 590); paired = 703.x × 500
    const plan = nest([t, { ...t, id: "s2", name: "Side 2" }], [{ L: 800, W: 600 }], O);
    expect(plan.unplaced).toHaveLength(0); expect(plan.paired).toBe(true);
    expect(plan.sheets[0].cuts.some((c) => c.kind === "slope")).toBe(true);
    expect(nest([t, { ...t, id: "s2", name: "Side 2" }], [{ L: 800, W: 600 }], { ...O, pair: false }).unplaced).toHaveLength(1);
  });
  it("the sample wedge cut list gives 2 trapezoid sides and 4 rectangles in whole mm", () => {
    expect(subPieces.map((p) => `${p.name} ${p.w}x${p.h}${p.trap ? " trap" : ""}`)).toEqual(["Side 1 255x360 trap", "Side 2 255x360 trap", "Bottom 373x255", "Top 373x178", "Front baffle 373x328", "Back 373x337"]);
  });
});

describe("free-form outlines", () => {
  it("a tilted triangle turns to its smallest bounding rectangle with the outline inside", () => {
    const c = Math.cos(0.3), s = Math.sin(0.3);
    const tri: [number, number][] = [[0, 0], [400, 0], [0, 300]].map(([x, y]) => [x * c - y * s + 50, x * s + y * c - 20] as [number, number]);
    const p = pieceFromOutline("t", "Tri", tri);
    expect(p.w * p.h).toBeLessThanOrEqual(400 * 300 + 400 + 300 + 1);
    for (const [x, y] of p.poly!) { expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(p.w + 1e-6); expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(p.h + 1e-6); }
    expect(pieceArea(p)).toBeCloseTo(60000, 3);
  });
});

describe("best fit on a known case", () => {
  const sheets: SheetSpec[] = [
    { key: "A 2400x1200", L: 2400, W: 1200, price: 55, group: "A" }, { key: "A 1200x900", L: 1200, W: 900, price: 45, group: "A" },
    { key: "A 900x600", L: 900, W: 600, price: 21, group: "A" }, { key: "A 1800x600", L: 1800, W: 600, price: 50, group: "A" },
  ];
  it("smallest single sheet: by area then by length", () => {
    const pcs = [rect("a", 800, 500), rect("b", 800, 300)]; // 900 × 600 cannot hold both; 1200 × 900 and 1800 × 600 can (same area)
    const r = smallestSheet(pcs, sheets, O)!;
    expect(r.sheet.key).toBe("A 1200x900"); expect(r.plan.unplaced).toHaveLength(0);
  });
  it("cheapest buy may be two small sheets instead of one big one", () => {
    const pcs = [rect("a", 850, 550), rect("b", 850, 550)]; // one each on 900 × 600 (2 × 21 = 42) beats 1200 × 900 (45), 1800 × 600 (50), 2400 × 1200 (55)
    const b = cheapestBuys(pcs, sheets, O)[0];
    expect(b.cost).toBe(42); expect(b.sheets.map((s) => s.key)).toEqual(["A 900x600", "A 900x600"]);
    for (const s of b.plan.sheets) expect(checkLayout(s)).toEqual([]);
  });
  it("the sample new_sub_box (16 mm) fits one sheet; every catalogue layout is overlap-free", () => {
    const s16: SheetSpec[] = catalogue.sheets.filter((s: any) => s.thicknessMm === 16).map((s: any) => ({ key: `${s.supplier} ${s.lengthMm}x${s.widthMm} ${s.category}`, L: s.lengthMm, W: s.widthMm, price: s.priceAud, group: s.supplier }));
    const best = smallestSheet(subPieces, s16, O)!;
    expect(best).toBeTruthy();
    expect(best.plan.sheets).toHaveLength(1); expect(checkLayout(best.plan.sheets[0])).toEqual([]);
    const buys = cheapestBuys(subPieces, s16, O);
    expect(buys.length).toBeGreaterThan(0);
    for (const b of buys) for (const s of b.plan.sheets) expect(checkLayout(s)).toEqual([]);
    console.log("new_sub_box smallest:", best.sheet.key, best.sheet.price, best.plan.sheets[0].pct.toFixed(1) + " %", "paired", best.plan.paired, "| cheapest:", buys.slice(0, 3).map((b) => `${b.group} ${b.sheets.map((s) => s.L + "x" + s.W).join("+")} $${b.cost}`).join("; "));
  });
  it("a supplier that sells 18 mm only as 3600 × 1200 (the big-sheet case the Boards tab reports)", () => {
    const b18 = catalogue.sheets.filter((s: any) => s.supplier === "Supplier B" && s.thicknessMm === 18).map((s: any) => `${s.lengthMm}x${s.widthMm}`);
    expect([...new Set(b18)]).toEqual(["3600x1200"]);
  });
  it.skipIf(!fs.existsSync(PRIVATE_MDF))("local supplier catalogue (private data, when present): 18 mm at Bunnings is only 3600 × 1200", () => {
    const real = JSON.parse(fs.readFileSync(PRIVATE_MDF, "utf8"));
    const b18 = real.sheets.filter((s: any) => s.supplier === "Bunnings" && s.thicknessMm === 18).map((s: any) => `${s.lengthMm}x${s.widthMm}`);
    expect([...new Set(b18)]).toEqual(["3600x1200"]);
  });
  it("packSheet keeps every item it does not place", () => {
    const items = makeItems([rect("a", 500, 500), rect("b", 500, 500), rect("c", 500, 500)], 3.2, false);
    const r = packSheet(items, 1100, 600, O);
    expect(r.layout.placed.length + r.left.length).toBe(3); expect(r.layout.placed.length).toBe(2);
  });
});
