// B4A_CABLE_ENGINE (R41): cable calculator engine. Worked examples E1-E3 of references/research_i_car_electronics.md section B9
// reproduced to their stated precision, unit tests for each rule, and the chain built from a project (model v2 items + links).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as cb from "../src/engine/cable";
import type { ProjectDoc } from "../src/ui/projectv2";

const ROOT = path.resolve(__dirname, "..", "..");
const CONST = JSON.parse(fs.readFileSync(path.join(ROOT, "data/parts_raw/_reference/cable_constants.json"), "utf8"));
const readParts = (cat: string, brand: string) => JSON.parse(fs.readFileSync(path.join(ROOT, "data/parts_raw", cat, brand + ".json"), "utf8")).records as any[];
const allCable = () => fs.readdirSync(path.join(ROOT, "data/parts_raw/cable")).filter((f) => f.endsWith(".json")).flatMap((f) => readParts("cable", f.replace(/\.json$/, "")));

describe("constants match data/parts_raw/_reference/cable_constants.json", () => {
  it("conductors", () => {
    expect(cb.CONDUCTORS.copper.rho20).toBe(CONST.conductors.copper.rho20_ohm_mm2_per_m);
    expect(cb.CONDUCTORS.copper.alpha).toBe(CONST.conductors.copper.alpha_per_C);
    expect(cb.CONDUCTORS.cca.rho20).toBe(CONST.conductors.cca_10pct.rho20_ohm_mm2_per_m);
    expect(cb.CONDUCTORS.cca.alpha).toBe(CONST.conductors.cca_10pct.alpha_per_C);
  });
  it("AWG table: areas, SAE minimum areas, ABYC ampacity columns", () => {
    for (const r of CONST.awg_table) {
      const t = cb.awgInfo(r.awg)!;
      expect(t.areaMm2).toBe(r.area_mm2); expect(t.dMm).toBe(r.d_mm);
      expect(t.saeMinMm2).toBe(r.sae_min_area_mm2 ?? undefined);
      expect(t.out105).toBe(r.abyc_105C_outside_engine_a ?? undefined);
      expect(t.eng105).toBe(r.abyc_105C_inside_engine_a ?? undefined);
      expect(t.out90).toBe(r.abyc_90C_outside_engine_a ?? undefined);
      // resistance per metre at 20 C: the table column was computed from the unrounded formula area, the calculator (like
      // cable_calc.py) uses the 2-decimal area, so they differ by up to 0.4 % (18 AWG: 0.82 vs 0.8231 mm2)
      expect(Math.abs(cb.rPerM(r.area_mm2, "copper", 20) * 1000 / r.r_mohm_per_m_cu_20C - 1)).toBeLessThan(0.005);
      expect(Math.abs(cb.rPerM(r.area_mm2, "cca", 20) * 1000 / r.r_mohm_per_m_cca_20C - 1)).toBeLessThan(0.005);
    }
  });
  it("ISO 10133 and AU mm labels", () => {
    expect(cb.ISO_105C).toHaveLength(Object.keys(CONST.iso_10133_105C_a).length);
    for (const [a, amp] of cb.ISO_105C) expect(CONST.iso_10133_105C_a[Number.isInteger(a) ? a.toFixed(1) : String(a)]).toBe(amp);
    for (const [k, v] of Object.entries(CONST.au_auto_cable_mm_label_to_mm2)) expect(cb.auMmLabelToMm2(k)).toBe(v);
  });
  it("AWG formula (ASTM B258) gives the tabulated diameters", () => {
    const d = (n: number) => 0.127 * 92 ** ((36 - n) / 39);
    expect(d(4)).toBeCloseTo(5.189, 3); expect(d(0)).toBeCloseTo(8.251, 3); expect(d(-3)).toBeCloseTo(11.684, 3);
  });
});

describe("E1: Rockford T1500-1bdCP, 5.0 m power + 0.5 m ground, 50 C (research B9)", () => {
  const amp: cb.LoadInput = { id: "t1500", name: "T1500-1bdCP", cls: "Class BD", rmsTotalW: 1500, iMaxA: 200, iMusicA: 100, fuseA: 200, powerWireAwgMaker: "4" };
  it("current: maker maximum 200 A, music 100 A, fuse 200 A", () => {
    const c = cb.loadCurrent(amp);
    expect(c.maxA).toBe(200); expect(c.musicA).toBe(100); expect(c.source).toBe("maker max");
    expect(cb.nextFuse(200)).toBe(200);
  });
  it("table: 4 AWG 1.00 V / 0.50 V / 160 A; 2 AWG 0.63 / 0.32 / 210; 1/0 0.40 / 0.20 / 285", () => {
    const rows: [string, number, number, number][] = [["4", 1.0, 0.5, 160], ["2", 0.63, 0.32, 210], ["1/0", 0.4, 0.2, 285]];
    for (const [g, v200, v100, a] of rows) {
      expect(cb.dropAwg(g, 200, 5.5).toFixed(2)).toBe(v200.toFixed(2));
      expect(cb.dropAwg(g, 100, 5.5).toFixed(2)).toBe(v100.toFixed(2));
      expect(cb.ampacityAwg(g)).toBe(a);
    }
  });
  it("calculator: 1/0 AWG copper, loop 1.98 mOhm, 0.396 V of 0.414 V; CCA needs 3/0", () => {
    const r = cb.calcCableSystem({ loads: [amp], feeds: [{ id: "main", lengthM: 5.0, groundLengthM: 0.5, fuseDistanceMm: 150, to: { load: "t1500" } }] });
    const run = r.runs[0];
    expect(r.allowedV.toFixed(3)).toBe("0.414");
    expect(run.fuseA).toBe(200);
    const cu = run.recommended.awg.copper!;
    expect(cu.size).toBe("1/0"); expect((cu.loopOhm * 1000).toFixed(2)).toBe("1.98"); expect(cu.dropV.toFixed(3)).toBe("0.396");
    expect(run.recommended.awg.cca!.size).toBe("3/0");
    expect(run.recommended.awg.cca!.ampacityA.toFixed(1)).toBe("305.2"); // 385 x CCA factor (cable_calc.py output)
    expect(run.used!.dropMusicV.toFixed(3)).toBe("0.198");
    expect(run.used!.lossW).toBeCloseTo(200 * 200 * cu.loopOhm, 9);
    // maker 4 AWG shown next to the calculated 1/0
    expect(run.makerWireAwg).toBe("4");
    expect(run.warnings.map((w) => w.code)).toContain("maker-wire-thinner");
    // the maker's 4 AWG, checked: 1.00 V and below the 200 A fuse
    const chk = cb.calcCableSystem({ loads: [amp], feeds: [{ id: "main", lengthM: 5.0, groundLengthM: 0.5, cable: { size: "4" }, to: { load: "t1500" } }] }).runs[0];
    expect(chk.chosen!.dropV.toFixed(2)).toBe("1.00"); expect(chk.chosen!.ok).toBe(false);
    expect(chk.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["chosen-drop", "fuse-over-ampacity"]));
  });
  it("ABYC circular-mil formula agrees: 93,600 cmil -> 1/0 (105,600)", () => {
    // research: 93,600 cmil; exact 5.5 m = 18.04 ft gives 93,708 (0.1 % rounding difference, same answer)
    const ft = 5.5 / 0.3048, cm = (10.75 * 200 * ft) / 0.414;
    expect(Math.abs(cm / 93600 - 1)).toBeLessThan(0.002);
    expect(cm).toBeGreaterThan(cb.awgInfo("1")!.areaMm2 * 1973.5); expect(cm).toBeLessThan(105600);
  });
});

describe("E2: 1000 W class D mono + 4 x 100 W class A/B via a distribution block (research B9)", () => {
  const loads: cb.LoadInput[] = [{ id: "a1", cls: "D", rmsTotalW: 1000 }, { id: "a2", cls: "AB", rmsTotalW: 400 }];
  const feed: cb.RunInput = { id: "main", lengthM: 5, groundLengthM: 0, fuseDistanceMm: 100, to: { junction: { id: "db", fused: true, branches: [
    { id: "b1", lengthM: 0.5, groundLengthM: 0.5, to: { load: "a1" } }, { id: "b2", lengthM: 0.5, groundLengthM: 0.5, to: { load: "a2" } }] } } };
  const r = cb.calcCableSystem({ loads, feeds: [feed] });
  const run = (id: string) => r.runs.find((x) => x.id === id)!;
  it("design currents 145 A and 64 A, total 209 A", () => {
    expect(Math.round(r.loads[0].maxA)).toBe(145); expect(Math.round(r.loads[1].maxA)).toBe(64); expect(Math.round(r.totalMaxA)).toBe(209);
    expect(r.loads[0].eta).toBe(0.5); expect(r.loads[1].eta).toBe(0.45);
  });
  it("main fuse 225 A, main run 3/0 AWG at 0.237 V (2 % budget 0.276 V)", () => {
    const m = run("main");
    expect(m.fuseA).toBe(225); expect(m.recommended.awg.copper!.size).toBe("3/0");
    expect(m.recommended.awg.copper!.dropV.toFixed(3)).toBe("0.237"); expect(m.allowedV.toFixed(3)).toBe("0.276");
  });
  it("branches: amp 1 fuse 150 A, 4 AWG, 0.369 V incl. main; amp 2 fuse 80 A, 8 AWG, 0.385 V", () => {
    const b1 = run("b1"), b2 = run("b2");
    expect(b1.fuseA).toBe(150); expect(b1.recommended.awg.copper!.size).toBe("4"); expect(b1.recommended.awg.copper!.totalDropV.toFixed(3)).toBe("0.369");
    expect(b2.fuseA).toBe(80); expect(b2.recommended.awg.copper!.size).toBe("8"); expect(Math.abs(b2.recommended.awg.copper!.totalDropV - 0.385)).toBeLessThan(0.001);
    // research 0.385 V used the main loop rounded to 1.13 mOhm; unrounded it is 0.3856 V
    expect(b2.recommended.awg.copper!.totalDropV).toBeCloseTo(0.38558, 4);
    expect(b1.upstreamDropV).toBeCloseTo(m3(run("main")), 12);
  });
  const m3 = (m: cb.RunResult) => m.used!.dropV;
});

describe("E3: speaker cable 4 m to a 2 ohm load, copper, Rout 0.02 ohm (research B9)", () => {
  it("rows 16/14/12/10 AWG to the stated precision", () => {
    const want: [string, string, string, string, string, number][] = [
      ["16", "0.105", "5.3", "-0.45", "5.0", 16], ["14", "0.066", "3.3", "-0.28", "3.2", 23], ["12", "0.042", "2.1", "-0.18", "2.0", 32], ["10", "0.026", "1.3", "-0.11", "1.3", 43]];
    for (const [g, R, pct, db, lost, df] of want) {
      const x = cb.speakerRow(g, 4, 2, 0.02);
      expect(x.loopOhm.toFixed(3)).toBe(R); expect(x.pctOfZ.toFixed(1)).toBe(pct); expect(x.lossDb.toFixed(2)).toBe(db);
      expect(x.powerLostPct.toFixed(1)).toBe(lost); expect(Math.round(x.dampingFactor!)).toBe(df);
    }
  });
  it("smallest gauge for 5 %: 14 AWG; a 4 ohm door speaker 5 m away: 16 AWG", () => {
    expect(cb.speakerMinAwg(4, 2)).toBe("14"); expect(cb.speakerMinAwg(5, 4)).toBe("16");
    const s = cb.speakerRun({ id: "s", lengthM: 4, loadOhm: 2, size: "16" });
    expect(s.recommendedAwg).toBe("14"); expect(s.warnings.map((w) => w.code)).toContain("speaker-chosen-thin");
  });
  it("Roger Russell table reproduced by the formula within 6 % (feet)", () => {
    const table: Record<number, number[]> = { 2: [8, 12, 20, 30, 50], 4: [16, 24, 40, 60, 100], 8: [32, 48, 80, 120, 200] };
    for (const [z, ft] of Object.entries(table)) ["18", "16", "14", "12", "10"].forEach((g, i) => {
      const f = cb.speakerMaxLengthM(g, +z) / 0.3048;
      expect(Math.abs(f - ft[i]) / ft[i]).toBeLessThan(0.06);
    });
  });
  it("speaker current against ampacity (extra check)", () => {
    const s = cb.speakerRun({ id: "s", lengthM: 1, loadOhm: 1, size: "16", powerW: 1500 });
    expect(s.currentA).toBeCloseTo(Math.sqrt(1500), 9);
    expect(s.warnings.map((w) => w.code)).toContain("speaker-current");
  });
});

describe("rules", () => {
  it("resistance with temperature; CCA about 1.59 x copper", () => {
    expect(cb.rPerM(1, "copper", 20)).toBe(0.017241);
    expect(cb.rPerM(1, "copper", 60) / cb.rPerM(1, "copper", 20)).toBeCloseTo(1 + 0.00393 * 40, 12);
    expect(cb.rPerM(1, "cca", 20) / cb.rPerM(1, "copper", 20)).toBeCloseTo(1.591, 3);
  });
  it("ampacity: engine column, bundling factors, 90 C, CCA factor 0.79", () => {
    expect(cb.ampacityAwg("4", { location: "engine" })).toBe(136);
    expect(cb.bundlingFactor(2)).toBe(1); expect(cb.bundlingFactor(3)).toBe(0.7); expect(cb.bundlingFactor(5)).toBe(0.6); expect(cb.bundlingFactor(10)).toBe(0.5);
    expect(cb.ampacityAwg("4", { bundled: 4 })).toBeCloseTo(96, 9);
    expect(cb.ampacityAwg("1/0", { insulationC: 90 })).toBe(245);
    expect(cb.CCA_AMPACITY_FACTOR).toBeCloseTo(0.79, 2);
    expect(cb.ampacityAwg("5")).toBeUndefined();
    expect(cb.ampacityForArea(65.2)).toEqual({ ampacityA: 285, basisAwg: "1/0" });
    expect(cb.ampacityForArea(4.59)!.basisAwg).toBe("12");
    expect(cb.ampacityMetric(25)).toBe(170);
  });
  it("AWG names", () => {
    expect(cb.normAwg("0")).toBe("1/0"); expect(cb.normAwg("00")).toBe("2/0"); expect(cb.normAwg("1/0 AWG")).toBe("1/0");
    expect(cb.normAwg("4 B&S")).toBe("4"); expect(cb.normAwg("8 GA")).toBe("8"); expect(cb.normAwg("7")).toBeUndefined();
    expect(cb.auMmLabelToMm2("6 mm")).toBe(4.59); expect(cb.auMmLabelToMm2("6mm2")).toBeUndefined();
  });
  it("amp current: maker max > maker fuse > P/(eta V); classes; music = half", () => {
    expect(cb.loadCurrent({ id: "x", iMaxA: 90, fuseA: 100, rmsTotalW: 1000 }).maxA).toBe(90);
    const f = cb.loadCurrent({ id: "x", fuseA: 100, rmsTotalW: 1000 }); expect(f.maxA).toBe(100); expect(f.musicA).toBe(50); expect(f.source).toBe("maker fuse");
    expect(cb.loadCurrent({ id: "x", rmsTotalW: 690, cls: "Class A/B" }).maxA).toBeCloseTo(690 / (0.45 * 13.8), 9);
    expect(cb.loadCurrent({ id: "x", rmsTotalW: 690, cls: "AB" }, { supplyV: 12.6 }).maxA).toBeCloseTo(690 / (0.45 * 12.6), 9);
    expect(cb.ampClass("Class BD").cls).toBe("BD"); expect(cb.ampClass("Class-A/D").cls).toBe("AD"); expect(cb.ampClass("Class A/B + Class BD (Sub)").cls).toBe("AB");
    expect(cb.ampClass(undefined)).toEqual({ cls: "D", eta: 0.5, known: false });
    expect(cb.loadCurrent({ id: "x" }).source).toBe("none");
  });
  it("fuse: next stocked rating; below load, over ampacity, over the ABYC 150 % ceiling", () => {
    expect(cb.nextFuse(145)).toBe(150); expect(cb.nextFuse(64.4)).toBe(80); expect(cb.nextFuse(501)).toBeUndefined();
    expect(cb.checkFuse(150, 160, 210)).toEqual([expect.objectContaining({ code: "fuse-below-load" })]);
    expect(cb.checkFuse(200, 150, 160).map((w) => w.code)).toEqual(["fuse-over-ampacity"]);
    expect(cb.checkFuse(250, 150, 160).map((w) => w.code)).toEqual(["fuse-over-abyc-ceiling"]);
    expect(cb.checkFuse(200, 150, 160, 150)).toEqual([]);
  });
  it("fuse distance: 175 mm ABYC, sheathed to 1830 mm, 457 mm maker limit", () => {
    expect(cb.checkFuseDistance(170)).toEqual([]);
    expect(cb.checkFuseDistance(300)[0].code).toBe("fuse-distance-over-abyc");
    expect(cb.checkFuseDistance(300, true)[0].code).toBe("fuse-distance-sheathed");
    expect(cb.checkFuseDistance(500)[0].level).toBe("error");
    expect(cb.checkFuseDistance(undefined)[0].code).toBe("fuse-distance-unknown");
  });
  it("drop limit 3 % or 0.5 V (labelled without a primary source)", () => {
    expect(cb.allowedDropV(cb.withDefaults())).toBeCloseTo(0.414, 12);
    expect(cb.allowedDropV(cb.withDefaults({ supplyV: 12.6 }))).toBeCloseTo(0.378, 12);
    const r = cb.calcCableSystem({ options: { dropMode: "0.5V" }, loads: [{ id: "a", iMaxA: 200 }], feeds: [{ id: "f", lengthM: 5, groundLengthM: 0.5, to: { load: "a" } }] });
    expect(r.allowedV).toBe(0.5); expect(r.warnings.map((w) => w.code)).toContain("drop-0.5v");
    expect(r.runs[0].recommended.awg.copper!.size).toBe("1"); // 1 AWG drops 0.49992 V: fits 0.5 V, not 0.414 V
    expect(r.runs[0].recommended.awg.copper!.dropV).toBeLessThanOrEqual(0.5);
  });
  it("unfused branch must carry the upstream fuse; no main fuse is an error; long runs: no size fits", () => {
    const r = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 30 }, { id: "b", iMaxA: 30 }], feeds: [{ id: "m", lengthM: 3, fuseA: 100, to: { junction: { id: "j", fused: false, branches: [{ id: "x", lengthM: 0.5, groundLengthM: 0.5, to: { load: "a" } }, { id: "y", lengthM: 0.5, groundLengthM: 0.5, to: { load: "b" } }] } } }] });
    const x = r.runs.find((q) => q.id === "x")!;
    expect(x.fused).toBe(false); expect(x.protectedByA).toBe(100); expect(cb.ampacityAwg(x.recommended.awg.copper!.size)!).toBeGreaterThanOrEqual(100);
    expect(x.warnings.map((w) => w.code)).toContain("branch-unfused");
    const nf = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 30 }], feeds: [{ id: "m", lengthM: 1, groundLengthM: 1, fused: false, to: { load: "a" } }] });
    expect(nf.runs[0].warnings.map((w) => w.code)).toContain("no-main-fuse");
    const long = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 400 }], feeds: [{ id: "m", lengthM: 30, groundLengthM: 1, to: { load: "a" } }] });
    expect(long.runs[0].warnings.map((w) => w.code)).toContain("no-size-fits");
  });
  it("metric sizes and ground-length warning", () => {
    const r = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 200 }], feeds: [{ id: "f", lengthM: 5, groundLengthM: 0.5, to: { load: "a" } }] });
    const m = r.runs[0].recommended.metric.copper!; expect(m.size).toBe("70 mm2"); // 50 mm2 drops 0.424 V expect(m.ampacityA).toBeGreaterThanOrEqual(200);
    const g = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 50 }], feeds: [{ id: "f", lengthM: 5, to: { load: "a" } }] });
    expect(g.runs[0].warnings.map((w) => w.code)).toContain("ground-length-unknown");
  });
  it("capacitor: energy, usable energy, tau, inrush; 1 F per 1000 W only for comparison", () => {
    const c = cb.capacitor(1, { supplyV: 14, ampMaxA: 145, ampRmsW: 1000 });
    expect(c.energyJ).toBeCloseTo(98, 9); expect(c.tauS).toBe(1000); expect(c.fullChargeS).toBe(5000); expect(c.inrushA).toBeCloseTo(0.014, 9);
    expect(c.usableJ).toBeCloseTo(0.5 * (14.4 ** 2 - 12.6 ** 2), 9);
    expect(c.holdupMs).toBeCloseTo((1000 * c.usableJ!) / (145 * 14), 9);
    expect(c.ruleOfThumbF).toBe(1); expect(c.notes.join(" ")).toMatch(/no maker test basis/);
    expect(cb.capacitor(1, { prechargeOhm: 30 }).tauS).toBe(30);
    expect(cb.capacitor(1, { ratedV: 12 }).warnings[0].code).toBe("cap-voltage");
  });
  it("alternator: music above spare warns, peak above spare informs; maker suggested sum", () => {
    const loads = [{ id: "a", iMaxA: 200, iMusicA: 100, suggestedAlternatorA: 100 }];
    const feeds: cb.RunInput[] = [{ id: "f", lengthM: 1, groundLengthM: 0.5, to: { load: "a" } }];
    const w1 = cb.calcCableSystem({ loads, feeds, alternator: { ratingA: 120, vehicleLoadA: 40 } }).alternator!;
    expect(w1.spareA).toBe(80); expect(w1.warnings.map((w) => w.code)).toContain("alternator-music");
    const w2 = cb.calcCableSystem({ loads, feeds, alternator: { ratingA: 150 } }).alternator!;
    expect(w2.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["vehicle-load-unknown", "alternator-peak"]));
    expect(cb.calcCableSystem({ loads, feeds, alternator: { ratingA: 90, vehicleLoadA: 0 } }).alternator!.warnings.map((w) => w.code)).toContain("alternator-maker");
  });
  it("big 3: sized for the total current, at least the main feed size", () => {
    const r = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 200 }], feeds: [{ id: "f", lengthM: 5, groundLengthM: 0.5, to: { load: "a" } }], big3: { altPosM: 1, batNegM: 0.5, engineGroundM: 0.5 } });
    expect(r.big3!.runs).toHaveLength(3);
    for (const b of r.big3!.runs) expect(["1/0", "2/0", "3/0", "4/0"]).toContain(b.size);
  });
});

describe("real products (data/parts_raw/cable) by real copper area", () => {
  const recs = allCable();
  it("area: strand count, published mm2 (Narva 6 mm = 4.59), else the AWG label (flagged)", () => {
    const kol = readParts("cable", "knukonceptz").find((r) => /kolossus/i.test(r.id) && r.awg === "1/0")!;
    expect(cb.productArea(kol)).toMatchObject({ areaMm2: 65.2, labelOnly: false });
    const narva6 = readParts("cable", "narva").find((r) => r.size_label === "6 mm")!;
    expect(cb.productArea(narva6).areaMm2).toBe(4.59);
    expect(cb.productArea({ size_label: "6 mm" }).areaMm2).toBe(4.59); // never 6 mm2
    expect(cb.productArea({ awg: "4" })).toMatchObject({ areaMm2: 21.15, labelOnly: true });
    expect(cb.productMaterial({ material: "Tinned Oxygen Free Copper" })).toBe("copper");
    expect(cb.productMaterial({ material: "CCA" })).toBe("cca");
  });
  it("E1 run: every suggestion meets ampacity and drop with its own area and material; AUD per metre first", () => {
    const r = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 200 }], feeds: [{ id: "f", lengthM: 5, groundLengthM: 0.5, to: { load: "a" } }] });
    const m = cb.matchCableProducts(recs, cb.needForRun(r.runs[0], r.options), 50);
    expect(m.length).toBeGreaterThan(0);
    for (const p of m) {
      expect(p.ampacityA!).toBeGreaterThanOrEqual(200);
      expect(p.dropV!).toBeLessThanOrEqual(0.414 + 1e-12);
    }
    const priced = m.filter((p) => p.pricePerMAud !== undefined).map((p) => p.pricePerMAud!);
    expect(priced).toEqual([...priced].sort((a, b) => a - b));
    expect(m.some((p) => /kolossus/i.test(p.id))).toBe(true); // 65.2 mm2 real copper
  });
  it("Narva 6 mm auto cable (4.59 mm2) is not offered for a 40 A, 5 m run, but fits 10 A over 2 m", () => {
    const big = cb.matchCableProducts(recs, { purpose: "power", iA: 40, fuseA: 40, lengthM: 5, groundLengthM: 0.5, allowedV: 0.414 }, 500);
    expect(big.some((p) => /^narva/.test(p.id) && p.areaMm2 === 4.59)).toBe(false);
    const small = cb.matchCableProducts(recs, { purpose: "power", iA: 10, fuseA: 10, lengthM: 2, groundLengthM: 0.5, allowedV: 0.414 }, 500);
    expect(small.some((p) => /^narva/.test(p.id) && p.areaMm2 === 4.59)).toBe(true);
  });
  it("speaker products for E3 (4 m, 2 ohm) are 14 AWG or thicker in copper terms", () => {
    const m = cb.matchCableProducts(recs, { purpose: "speaker", iA: 0, lengthM: 4, allowedV: 0, zOhm: 2 }, 500);
    expect(m.length).toBeGreaterThan(0);
    for (const p of m) expect(p.pctOfZ!).toBeLessThanOrEqual(5 + 1e-9);
  });
});

describe("building the chain from a project (model v2 items + typed links)", () => {
  const rf = readParts("amplifiers", "rockford-fosgate");
  const parts = new Map<string, any>(rf.map((r) => [r.id, r]));
  const lk: cb.CableLookups = { part: (id) => parts.get(id), driver: (id) => (id === "door4" ? { ohmsPerCoil: 4, coils: 1 } : undefined) };
  const item = (id: string, kind: string, data: any = {}, links: any[] = []) => ({ id, section: "electrical", kind, name: id, data, links: links.map((l) => ({ from: id, ...l })) });
  const docE1 = (): ProjectDoc => ({ format: 2, name: "t", title: "t", section: "subwoofer", items: [
    item("bat", "battery", { alternatorA: 120, vehicleLoadA: 40 }, [{ to: "fuse", kind: "power" }]),
    item("fuse", "fuseholder", { ratingA: 200, distanceMm: 150 }, [{ to: "amp", kind: "power", cableItemId: "pc" }]),
    item("pc", "cable", { lengthM: 5.0, size: "1/0", material: "copper" }),
    item("gc", "cable", { lengthM: 0.5, size: "1/0" }),
    item("gnd", "other", { role: "ground" }),
    item("sc", "cable", { lengthM: 4, size: "12" }),
    item("amp", "amplifier", { partId: "rockford-t1500-1bdcp" }, [{ to: "gnd", kind: "ground", cableItemId: "gc" }, { to: "box-1", kind: "speaker", cableItemId: "sc" }]),
    { id: "box-1", section: "subwoofer", kind: "box", name: "Sub", data: { drivers: 1, power: { watts: 1500, impedance: 2 } }, links: [] },
  ] as any });
  it("E1 from a project: maker data from the parts record, ground length from the ground link, 1/0 checked OK", () => {
    const inp = cb.buildCableSystem(docE1(), lk);
    expect(inp.loads[0]).toMatchObject({ iMaxA: 200, iMusicA: 100, fuseA: 200, powerWireAwgMaker: "4", suggestedAlternatorA: 100, loadOhm: 2, rmsTotalW: 1500 });
    expect(inp.feeds).toHaveLength(1);
    expect(inp.feeds[0]).toMatchObject({ lengthM: 5, groundLengthM: 0.5, fuseA: 200, fuseDistanceMm: 150, to: { load: "amp" }, cable: { size: "1/0", material: "copper" } });
    const r = cb.calcCableSystem(inp);
    expect(r.runs[0].recommended.awg.copper!.size).toBe("1/0");
    expect(r.runs[0].chosen!.ok).toBe(true); expect(r.runs[0].chosen!.dropV.toFixed(3)).toBe("0.396");
    expect(r.speakers[0]).toMatchObject({ loadOhm: 2, lengthM: 4, recommendedAwg: "14" });
    expect(r.speakers[0].chosen!.size).toBe("12");
    expect(r.alternator!.spareA).toBe(80);
    expect(r.alternator!.warnings.map((w) => w.code)).toContain("alternator-music");
  });
  it("E2 from a project: battery -> ANL -> 5 m -> fused distribution block -> two amps (with a capacitor) -> branch figures", () => {
    const doc: ProjectDoc = { format: 2, name: "t", title: "t", section: "subwoofer", items: [
      item("bat", "battery", {}, [{ to: "anl", kind: "power" }]),
      item("anl", "fuse", { distanceMm: 120 }, [{ to: "db", kind: "power", cableItemId: "main" }]),
      item("main", "cable", { lengthM: 5 }),
      item("db", "distribution", { fused: true }, [{ to: "cap", kind: "power", cableItemId: "c1" }, { to: "a2", kind: "power", cableItemId: "c2" }]),
      item("c1", "cable", { lengthM: 0.5, groundLengthM: 0.5 }), item("c2", "cable", { lengthM: 0.5, groundLengthM: 0.5 }),
      item("cap", "capacitor", { farads: 1 }, [{ to: "a1", kind: "power" }]),
      item("a1", "amplifier", { class: "D", rmsW: 1000 }), item("a2", "amplifier", { class: "AB", rmsW: 400 }),
    ] as any };
    const inp = cb.buildCableSystem(doc, lk);
    expect(inp.feeds[0].fuseA).toBeUndefined();
    const r = cb.calcCableSystem(inp);
    const by = (id: string) => r.runs.find((x) => x.loadIds.length === 1 && x.loadIds[0] === id)!;
    expect(r.runs[0].fuseA).toBe(225); expect(r.runs[0].recommended.awg.copper!.size).toBe("3/0");
    expect(by("a1").fuseA).toBe(150); expect(by("a1").recommended.awg.copper!.totalDropV.toFixed(3)).toBe("0.369");
    expect(by("a2").fuseA).toBe(80); expect(by("a2").recommended.awg.copper!.totalDropV).toBeCloseTo(0.38558, 4);
    expect(r.capacitors[0]).toMatchObject({ id: "cap", farads: 1, tauS: 1000 });
    expect(r.capacitors[0].holdupMs).toBeGreaterThan(0);
    expect(by("a1").warnings.map((w) => w.code)).toContain("capacitor-wiring");
    expect(r.warnings.filter((w) => w.level !== "info")).toEqual([]);
  });
  it("missing pieces are reported: no battery, no fuse at the battery, amp not powered, door load from the driver", () => {
    const noBat = cb.buildCableSystem({ format: 2, name: "t", title: "t", section: "door", items: [item("a", "amplifier", { rmsW: 400, class: "D" })] } as any, lk);
    expect(noBat.warnings!.map((w) => w.code)).toEqual(expect.arrayContaining(["no-battery", "amp-no-speakers"]));
    expect(cb.calcCableSystem(noBat).warnings.map((w) => w.code)).toContain("load-not-powered");
    const noFuse = cb.calcCableSystem(cb.buildCableSystem({ format: 2, name: "t", title: "t", section: "door", items: [
      item("bat", "battery", {}, [{ to: "a", kind: "power", cableItemId: "c" }]), item("c", "cable", { lengthM: 2, groundLengthM: 0.5 }),
      item("a", "amplifier", { rmsW: 400, class: "D" }, [{ to: "d", kind: "speaker", cableItemId: "s" }]), item("s", "cable", { lengthM: 5 }),
      item("d", "door", { driverId: "door4", count: 2 }),
    ] } as any, lk));
    expect(noFuse.runs[0].warnings.map((w) => w.code)).toContain("no-main-fuse");
    expect(noFuse.speakers[0]).toMatchObject({ loadOhm: 4, recommendedAwg: "16" });
  });
  it("one fuse holder feeding two amps: the branches are unfused and must carry that fuse", () => {
    const doc = { format: 2, name: "t", title: "t", section: "subwoofer", items: [
      item("bat", "battery", {}, [{ to: "f", kind: "power" }]),
      item("f", "fuseholder", { ratingA: 100, distanceMm: 100 }, [{ to: "a", kind: "power", cableItemId: "c1" }, { to: "b", kind: "power", cableItemId: "c2" }]),
      item("c1", "cable", { lengthM: 3, groundLengthM: 0.5 }), item("c2", "cable", { lengthM: 3, groundLengthM: 0.5 }),
      item("a", "amplifier", { iMaxA: 30 }), item("b", "amplifier", { iMaxA: 30 }),
    ] } as any;
    const r = cb.calcProject(doc, lk);
    const br = r.runs.filter((x) => x.depth === 1);
    expect(br).toHaveLength(2);
    for (const b of br) { expect(b.fused).toBe(false); expect(b.protectedByA).toBe(100); expect(cb.ampacityAwg(b.recommended.awg.copper!.size)!).toBeGreaterThanOrEqual(100); }
  });
  it("rmsAtLoad: exact load, below the lowest rating, unknown", () => {
    const t = parts.get("rockford-t1500-1bdcp");
    expect(cb.rmsAtLoad(t, 4).w).toBe(1000); expect(cb.rmsAtLoad(t, 2).w).toBe(1500);
    expect(cb.rmsAtLoad(t, 0.5).note).toMatch(/below/);
    expect(cb.rmsAtLoad(t).w).toBe(1500);
  });
  it("box load uses coils.ts finalLoad: 2 drivers of 2 ohm in parallel = 1 ohm", () => {
    expect(cb.itemLoadOhm({ id: "b", section: "subwoofer", kind: "box", name: "b", data: { drivers: 2, power: { watts: 500, impedance: 2 } } }).ohm).toBe(1);
  });
});

// B7_PLYWOOD_BOARDS: a branch whose upstream run already uses (nearly) the whole drop budget names the upstream run as the cause
// (B5 sign-off follow-up; the B5 dry run had the run "to Fused block" on 1/0 copper dropping 0.423 V at 261 A of 0.414 V allowed).
describe("upstream run uses the drop budget (B7)", () => {
  const sys = (upV: number, branchLen = 0.5, branchA = 200) => {
    const R = cb.rPerM(cb.awgInfo("1/0")!.areaMm2, "copper", 50), maxA = branchA + 60 + 1;
    return cb.calcCableSystem({ loads: [{ id: "mono", iMaxA: branchA }, { id: "quad", iMaxA: 60 }, { id: "dsp", iMaxA: 1 }],
      feeds: [{ id: "main", name: "to Fused block", lengthM: upV / (maxA * R), groundLengthM: 0, fuseA: 150, cable: { size: "1/0", material: "copper" },
        to: { junction: { id: "fb", fused: true, branches: [
          { id: "b1", name: "to Mono amp", lengthM: branchLen, groundLengthM: 0.4, fuseA: 200, cable: { size: "4", material: "copper" }, to: { load: "mono" } },
          { id: "b2", name: "to 4ch amp", lengthM: 0.6, groundLengthM: 0.4, fuseA: 60, cable: { size: "8", material: "copper" }, to: { load: "quad" } },
          { id: "b3", name: "to DSP", lengthM: 0.6, groundLengthM: 0.4, fuseA: 35, cable: { size: "10", material: "copper" }, to: { load: "dsp" } }] } } }] });
  };
  it("B5 fixture case: upstream 0.423 V of 0.414 V; every branch names the upstream run, never 'shorten the run' about itself", () => {
    const r = sys(0.423);
    const main = r.runs.find((x) => x.id === "main")!;
    expect(main.used!.dropV.toFixed(3)).toBe("0.423"); expect(r.allowedV.toFixed(3)).toBe("0.414");
    for (const id of ["b1", "b2", "b3"]) {
      const b = r.runs.find((x) => x.id === id)!;
      expect(b.upstreamDropV.toFixed(3)).toBe("0.423");
      const codes = b.warnings.map((w) => w.code);
      expect(codes).toContain("upstream-budget"); expect(codes).not.toContain("no-size-fits");
      const t = b.warnings.find((w) => w.code === "upstream-budget")!.text;
      expect(t).toContain("upstream run to Fused block"); expect(t).toContain("already uses 0.423 V of the 0.414 V drop allowed, the whole budget");
      expect(t).toContain("thicker or shorter upstream run (to Fused block)"); expect(t).not.toMatch(/No standard size|split it into parallel/);
      const cd = b.warnings.find((w) => w.code === "chosen-drop")!.text;
      expect(cd).toContain("including 0.423 V on the upstream run to Fused block"); expect(cd).toContain("use a thicker or shorter upstream run first");
    }
  });
  it("nearly the whole budget (0.400 of 0.414 V): still the upstream run, with the volts left", () => {
    const t = sys(0.4).runs.find((x) => x.id === "b1")!.warnings.find((w) => w.code === "upstream-budget")!.text;
    expect(t).toContain("already uses 0.400 V of the 0.414 V drop allowed, leaving 0.014 V for this branch");
  });
  it("a small upstream drop and a branch too long on its own: the old branch message stays", () => {
    const r = cb.calcCableSystem({ loads: [{ id: "a", iMaxA: 400 }], feeds: [{ id: "m", name: "to block", lengthM: 0.2, groundLengthM: 0, fuseA: 500, cable: { size: "4/0" }, to: { junction: { id: "j", fused: true, branches: [{ id: "x", name: "to amp", lengthM: 30, groundLengthM: 1, to: { load: "a" } }] } } }] });
    const x = r.runs.find((q) => q.id === "x")!;
    expect(x.upstreamDropV).toBeGreaterThan(0); expect(x.upstreamDropV).toBeLessThan(0.1);
    expect(x.warnings.map((w) => w.code)).toContain("no-size-fits"); expect(x.warnings.map((w) => w.code)).not.toContain("upstream-budget");
  });
  it("upstreamBudget: cause when under 10 % is left or the branch fits on its own", () => {
    const base = { iA: 10, fuseA: 10, lengthM: 1, groundLengthM: 0.5, allowedV: 0.414, extraDropV: 0, material: "copper" as const };
    expect(cb.upstreamBudget(0.45, 0.414, 0.414, base)).toMatchObject({ cause: true, aloneOk: true });
    expect(cb.upstreamBudget(0, 0.414, 0.414, base).cause).toBe(false);
  });
});
