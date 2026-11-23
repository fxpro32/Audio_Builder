// A15_TLINE: transmission line model, folded geometry and design helper.
import { describe, expect, it } from "vitest";
import { AIR_20C } from "../src/engine/air";
import { abs } from "../src/engine/complex";
import { complete } from "../src/engine/driver";
import { freqs, simulate } from "../src/engine/model";
import { kingLambda, lineAt, lineSize, maxSplCurve, quarterWaveHz, radiationZ, simulateTL, stuffedC, struveH1, LineSpec } from "../src/engine/tline";
import { foldLine, lengthFactor, suggestTL, tlSuitability } from "../src/engine/tlfold";

const air = AIR_20C;
const pio = complete({ fs: 31.4, Re: 6.6, Qms: 15.13, Qes: 0.68, Vas: 0.01303, Sd: 0.0437, Le: 0.00555, Xmax: 0.0129, Pe: 1000 }, air);
// King 2021 sample driver, SB Acoustics Satori WO24P-4 (TL_Alignments.pdf Fig. 2)
const sat = complete({ fs: 28, Re: 3.3, Qms: 6.7, Qes: 0.42, Vas: 0.071, Sd: 0.0255, Le: 0.00029, Xmax: 0.0085 }, air);
const peaks = (f: number[], z: number[], hi = 150) => { const p: [number, number][] = []; for (let i = 1; i < f.length - 1; i++) if (z[i] > z[i - 1] && z[i] >= z[i + 1] && f[i] < hi) p.push([f[i], z[i]]); return p; };

describe("helpers", () => {
  it("Struve H1 approximation and radiation end correction", () => {
    expect(struveH1(1)).toBeCloseTo(0.198457, 2); // tabulated H1(1) = 0.19846
    expect(struveH1(3)).toBeCloseTo(1.0189, 2);  // H1(3) = 1.0189 (Abramowitz & Stegun table 12.1)
    const S = 0.01, f = 20; const Z = radiationZ(f, S, air); const a = Math.sqrt(S / Math.PI);
    const dl = (Z.im * S) / (air.rho * 2 * Math.PI * f); // mass end correction
    expect(dl / a).toBeCloseTo(8 / (3 * Math.PI), 2);
  });
  it("King's stuffing values", () => {
    expect(stuffedC(0, air)).toBeCloseTo(air.c, 6);
    expect(stuffedC(0.382 * 16.0185, { ...air, c: 342 })).toBeCloseTo(325, 3);
    expect(kingLambda(1000, 0)).toBeCloseTo(10, 6);
    expect(kingLambda(5000, 0.5 * 16.0185)).toBeCloseTo(10 + 785 * (100 / 101), 6); // order 1 above 0.4 lb/ft³: (f/50)/(1+f/50)
    expect(kingLambda(50, 0.1 * 16.0185)).toBeCloseTo(10 + 157 * 0.5, 6);     // at 50 Hz the high-pass is at half
  });
});

describe("validation (a): straight empty pipe", () => {
  it("quarter-wave pole at c/(4(L + 0.849a))", () => {
    const L = 2, S = 0.01; const spec: LineSpec = { segs: [{ len: L, S0: S, S1: S, stuff: 0 }], driverAt: 0, maxEl: 0.005 };
    let fz = 0, zm = 0; for (const f of freqs(20, 60, 3000)) { const z = abs(lineAt(spec, f, air).Zin); if (z > zm) { zm = z; fz = f; } }
    expect(Math.abs(fz / quarterWaveHz(L, S, air.c) - 1)).toBeLessThan(0.001);
  });
  it("element length converges", () => {
    const segs = [{ len: 2.181, S0: 0.0357, S1: 0.0071, stuff: 8 }];
    const a = simulateTL(sat, { segs, driverAt: 0, maxEl: 0.02 }, { Vrms: 2.83 }, air, freqs(10, 300, 24));
    const b = simulateTL(sat, { segs, driverAt: 0, maxEl: 0.004 }, { Vrms: 2.83 }, air, freqs(10, 300, 24));
    for (let i = 0; i < a.f.length; i++) expect(Math.abs(a.spl[i] - b.spl[i])).toBeLessThan(0.3);
  });
});

describe("validation (b): limits", () => {
  it("a closed short line is a sealed box", () => {
    const tc = simulateTL(pio, { segs: [{ len: 0.1, S0: 0.2, S1: 0.2, stuff: 0 }], driverAt: 0, terminus: "closed", maxEl: 0.005 }, { Vrms: 2.83 }, air);
    const sb = simulate(pio, { kind: "sealed", Vb: 0.02, QL: 1e9 }, { Vrms: 2.83 }, air, tc.f);
    tc.f.forEach((f, i) => { if (f <= 150) { expect(Math.abs(tc.spl[i] - sb.spl[i])).toBeLessThan(0.05); expect(Math.abs(tc.xmm[i] / sb.xmm[i] - 1)).toBeLessThan(0.01); } });
  });
  it("a fat short line with a narrow end is a vented box", () => {
    const Vb = 0.03, Lb = 0.15, Sb = Vb / Lb, Sp = 0.005, Lp = 0.15; const a = Math.sqrt(Sp / Math.PI);
    const tl = simulateTL(pio, { segs: [{ len: Lb, S0: Sb, S1: Sb, stuff: 0 }, { len: Lp, S0: Sp, S1: Sp, stuff: 0 }], driverAt: 0, maxEl: 0.005 }, { Vrms: 2.83 }, air);
    const vb = simulate(pio, { kind: "vented", Vb, port: { Sv: Sp, Leff: Lp + 0.8488 * a }, QL: 1e6, QP: 1e6 }, { Vrms: 2.83 }, air, tl.f);
    const fbL = (air.c / (2 * Math.PI)) * Math.sqrt(Sp / (Vb * (Lp + 0.8488 * a)));
    expect(Math.abs((tl.tuningHz ?? 0) / fbL - 1)).toBeLessThan(0.02);
    tl.f.forEach((f, i) => { if (f >= 15 && f <= 100 && (f < 0.75 * fbL || f > 1.3 * fbL)) expect(Math.abs(tl.spl[i] - vb.spl[i])).toBeLessThan(0.5); });
  });
});

describe("validation (c): King 2021 tapered 5:1 line, Satori WO24P-4", () => {
  const L = 2.181, S0 = 0.0357, SL = 0.0071;
  it("unstuffed: impedance peaks near 14.5 and 48 Hz, cone dip near 28 Hz", () => {
    const r = simulateTL(sat, { segs: [{ len: L, S0, S1: SL, stuff: 0 }], driverAt: 0.2 * L }, { Vrms: 2.83 }, air, freqs(8, 300, 96));
    const p = peaks(r.f, r.zmag);
    expect(Math.abs(p[0][0] / 14.5 - 1)).toBeLessThan(0.08);
    expect(Math.abs(p[1][0] / 48 - 1)).toBeLessThan(0.1);
    expect(Math.abs((r.tuningHz ?? 0) / 28 - 1)).toBeLessThan(0.05);
  });
  it("stuffed 0.5 lb/ft³ over the first 3/4: low peak gone, upper peak 40-52 Hz and 12-20 ohm", () => {
    const Sm = S0 + (SL - S0) * 0.75;
    const r = simulateTL(sat, { segs: [{ len: 0.75 * L, S0, S1: Sm, stuff: 0.5 * 16.0185 }, { len: 0.25 * L, S0: Sm, S1: SL, stuff: 0 }], driverAt: 0 }, { Vrms: 2.83 }, air, freqs(8, 300, 96));
    const p = peaks(r.f, r.zmag).filter((q) => q[0] > 30);
    expect(Math.max(...r.zmag.filter((_, i) => r.f[i] < 25))).toBeLessThan(9);
    expect(p[0][0]).toBeGreaterThan(40); expect(p[0][0]).toBeLessThan(52);
    expect(p[0][1]).toBeGreaterThan(12); expect(p[0][1]).toBeLessThan(20);
  });
});

describe("folded line and helper", () => {
  const drv = { outer: 0.295, cutout: 0.265, depth: 0.147, disp: 0.00512 };
  it("geometry: channels fill the inside depth, cut list complete, length is the centre line", () => {
    const g = foldLine({ W: 400, H: 500, D: 480, t: 18, channels: 4, taper: 0.3, driverY: 0, stuffKgM3: 8, stuffPct: 75, count: 1 }, drv);
    const Di = 0.48 - 0.036;
    expect(g.depths.reduce((s, d) => s + d, 0) + 3 * 0.018).toBeCloseTo(Di, 9);
    expect(g.depths[3] / g.depths[0]).toBeCloseTo(0.3, 9);
    expect(g.rows.length).toBe(5 + 3);
    expect(g.terminus.where).toBe("back"); // 4 channels: the last runs down
    expect(lineSize(g.spec).length).toBeCloseTo(g.length, 9);
    const stuffed = g.spec.segs.filter((s) => s.stuff > 0).reduce((s, q) => s + q.len, 0);
    expect(stuffed / g.length).toBeCloseTo(0.75, 6);
    expect(g.netL).toBeCloseTo(g.grossL - g.dividers.reduce((s, d) => s + g.Wi * d.h * 0.018, 0) * 1000 - 5.12, 6);
    expect(Math.abs(g.airL / g.netL - 1)).toBeLessThan(0.1); // centre-line volume close to the real net air
    expect(g.bad).toEqual([]);
    const odd = foldLine({ W: 400, H: 500, D: 450, t: 18, channels: 3, taper: 0.5, driverY: 0, stuffKgM3: 0, stuffPct: 0, count: 1 }, drv);
    expect(odd.terminus.where).toBe("top");
  });
  it("geometry: flags a first channel too shallow for the magnet and a driver that does not fit", () => {
    const g = foldLine({ W: 300, H: 280, D: 250, t: 18, channels: 4, taper: 0.5, driverY: 0, stuffKgM3: 0, stuffPct: 0, count: 2 }, drv);
    expect(g.bad.some((b) => b.includes("Channel 1"))).toBe(true);
    expect(g.bad.some((b) => b.includes("baffle width"))).toBe(true);
  });
  it("length factor follows King's Table 1", () => {
    expect(lengthFactor(1)).toBeCloseTo(1, 9); expect(lengthFactor(0.2)).toBeCloseTo(0.71, 9); expect(lengthFactor(5)).toBeCloseTo(1.32, 9);
    expect(lengthFactor(0.25)).toBeGreaterThan(0.71); expect(lengthFactor(0.25)).toBeLessThan(0.8);
  });
  it("suitability in plain words: Pioneer poor, Satori good", () => {
    expect(tlSuitability(pio).level).toBe("poor"); expect(tlSuitability(pio).text).toMatch(/Qts 0.65/);
    expect(tlSuitability(sat).level).toBe("good");
  });
  it("King's own sample: helper reproduces L = 2.181 m and S0 = 0.0357 m² at TR 0.2 when the driver fits", () => {
    const s = suggestTL(sat, { outer: 0.1, cutout: 0.09, depth: 0.05, disp: 0 }, { taper: 0.2, t: 18, air: { ...air, c: 344 } });
    expect(s.fb).toBeCloseTo(28 * 1, 0);
    expect(s.Lm).toBeCloseTo(2.181, 2);
  });
  it("Pioneer suggestion: line tuned near fs, folded geometry valid, tuning from the model near the target", () => {
    const s = suggestTL(pio, drv, { t: 16 });
    const g = foldLine(s.box, drv);
    expect(g.bad).toEqual([]);
    expect(Math.abs(g.length / s.Lm - 1)).toBeLessThan(0.01);
    const r = simulateTL(pio, g.spec, { Vrms: 49 }, air);
    expect(Math.abs((r.tuningHz ?? 0) / s.fb - 1)).toBeLessThan(0.2);
    expect(s.suit.level).toBe("poor");
  });
  it("max SPL: limited by Xmax where travel is large, by power elsewhere", () => {
    const m = maxSplCurve([100, 100], [20, 1], 10, 10, 20);
    expect(m.spl[0]).toBeCloseTo(100 + 20 * Math.log10(0.5), 9); expect(m.limit[0]).toBe("Xmax");
    expect(m.spl[1]).toBeCloseTo(100 + 20 * Math.log10(2), 9); expect(m.limit[1]).toBe("power");
  });
});
