// B2_SECTIONS: infinite baffle maths against the worked cases in references/research_h_ib_door_home_pc.md (1.7 items 4, 5, 8),
// and the home-box helpers (baffle step, depth rule).
import { describe, expect, it } from "vitest";
import { complete } from "../src/engine/driver";
import { simulate, freqs } from "../src/engine/model";
import { AIR_20C } from "../src/engine/air";
import { cabinPressure, ibAlignment, ibRules, ibSealed, ibSubsonic, ibVerdict, leakTuning, leakWords, simulateIB } from "../src/engine/ib";
import { baffleStepHz, keepDepth, MIN_DEPTH_RATIO } from "../src/engine/homebox";
import { grossL } from "../src/engine/autosize";
import fs from "node:fs";
import path from "node:path";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
// Acoustic Elegance IB15AU 4 ohm, PS Sound shop page (data/drivers/acoustic-elegance-ib15au-4ohm.json)
const AE = { fs: 20.41, Qts: 0.62, Vas: 0.387, Sd: 0.083, Xmax: 0.018 };
const air = AIR_20C;

describe("IB closed-box figures (research_h 1.7 item 8)", () => {
  it("1 x IB15AU in 500 L: alpha 0.774, fc 27.2, Qtc 0.826", () => {
    const r = ibSealed(AE.fs, AE.Qts, AE.Vas, 1, 0.5); near(r.alpha, 0.774, 0.001); near(r.fc, 27.2, 0.05); near(r.Qtc, 0.826, 0.001);
  });
  it("2 x IB15AU in 500 L: alpha 1.548, fc 32.6, Qtc 0.990, f3 25.7", () => {
    const r = ibAlignment(AE.fs, AE.Qts, AE.Vas, 2, 0.5); near(r.alpha, 1.548, 0.001); near(r.fc, 32.6, 0.05); near(r.Qtc, 0.990, 0.001); near(r.f3, 25.7, 0.05);
  });
  it("2 x IB15AU, cabin of 3,000 L as the only load (true IB): alpha 0.258, fc 22.9, Qtc 0.695, f3 23.3", () => {
    const r = ibAlignment(AE.fs, AE.Qts, AE.Vas, 2, Infinity, 3); near(r.alpha, 0.258, 0.001); near(r.fc, 22.9, 0.05); near(r.Qtc, 0.695, 0.001); near(r.f3, 23.3, 0.05);
    expect(r.alphaRear).toBe(0); near(r.alphaCabin, 0.258, 0.001);
  });
  it("trunk IB with the cabin load: the two alphas add", () => {
    const r = ibAlignment(AE.fs, AE.Qts, AE.Vas, 2, 0.5, 3); near(r.alpha, 1.548 + 0.258, 0.002);
  });
  it("free air: alpha 0, fc = fs, Qtc = Qts", () => { const r = ibAlignment(AE.fs, AE.Qts, AE.Vas, 1); expect(r.alpha).toBe(0); near(r.fc, AE.fs, 1e-9); near(r.Qtc, AE.Qts, 1e-9); });
});

describe("leak between boot and cabin (research_h 1.7 item 5)", () => {
  // boot 400 L, cabin 3,000 L, 20 mm thick: 5, 20, 100, 500 cm2 -> about 10, 16, 27, 42 Hz (PM recomputed 10.2/16.5/27.1/42.5)
  const cases: [number, number][] = [[5, 10.2], [20, 16.5], [100, 27.1], [500, 42.5]];
  for (const [cm2, hz] of cases) it(`${cm2} cm2 -> about ${hz} Hz`, () => { near(leakTuning(cm2 * 1e-4, 0.02, 0.4, 3).fLeak, hz, 0.15); });
  it("plain words: warns above 20 Hz, bad above 30 Hz, quotes the share of the cone area", () => {
    expect(leakWords(16.5, 20e-4, 0.166).level).toBe("ok");
    expect(leakWords(27.1, 100e-4, 0.166).level).toBe("warn");
    const b = leakWords(42.5, 500e-4, 0.166); expect(b.level).toBe("bad"); expect(b.text).toMatch(/30\.1 % of the cone area/);
  });
});

describe("cabin pressure (research_h 1.7 item 4)", () => {
  it("2 x IB15AU at Xmax in a 3,000 L cabin: about 137 dB (peak pressure)", () => {
    const r = cabinPressure(2 * AE.Sd, AE.Xmax, 3, air); near(r.dbPeak, 137.0, 0.1); near(r.dbPeak - r.dbRms, 3.01, 0.01);
  });
  it("a smaller cabin gives more pressure: 2,000 L is 20*log10(1.5) dB above 3,000 L", () => {
    const a = cabinPressure(2 * AE.Sd, AE.Xmax, 2, air); near(a.dbPeak - cabinPressure(2 * AE.Sd, AE.Xmax, 3, air).dbPeak, 20 * Math.log10(1.5), 1e-9);
  });
});

describe("lumped IB model", () => {
  const d = complete({ fs: 20.41, Re: 2.7, Qms: 6, Qes: 0.69, Vas: 0.387, Sd: 0.083, Xmax: 0.018, Le: 0.00033 }, air);
  const F = freqs(8, 300, 48);
  it("trunk IB without leak and cabin = model.ts sealed box with each driver's share of the boot", () => {
    const a = simulateIB(d, { mode: "trunk", n: 2, Vrear: 0.5, cabinLoad: false }, { Vrms: 10 }, air, F);
    const b = simulate(d, { kind: "sealed", Vb: 0.25, QL: 1e9 }, { Vrms: 10, count: 2 }, air, F);
    for (let k = 0; k < F.length; k += 12) { near(a.free[k], b.spl[k], 0.01); near(a.xmm[k], b.xmm[k], 1e-3); near(a.zmag[k], b.zmag[k], 1e-3); }
  });
  it("impedance peak sits at fc of the closed-box figures (true IB, 3,000 L cabin)", () => {
    const s = simulateIB(d, { mode: "true", n: 2, Vcabin: 3, cabinLoad: true }, { Vrms: 10 }, air, F);
    const k = s.zmag.indexOf(Math.max(...s.zmag)); near(F[k], ibAlignment(d.fs, d.Qts, d.Vas, 2, Infinity, 3).fc, 0.4);
  });
  it("cabin pressure-field level at low frequency: x and pressure agree with p = rho c^2 N Sd x / V", () => {
    const s = simulateIB(d, { mode: "true", n: 2, Vcabin: 3, cabinLoad: true }, { Vrms: 10 }, air, F);
    const p = cabinPressure(2 * d.Sd, s.xmm[0] / 1000, 3, air); near(s.cabinDb[0], p.dbRms, 0.05);
  });
  it("a big leak takes away the deep bass (trunk IB)", () => {
    const sealed = simulateIB(d, { mode: "trunk", n: 2, Vrear: 0.4, Vcabin: 3, cabinLoad: true }, { Vrms: 10 }, air, F);
    const leaky = simulateIB(d, { mode: "trunk", n: 2, Vrear: 0.4, Vcabin: 3, cabinLoad: true, leakA: 0.05, leakT: 0.02 }, { Vrms: 10 }, air, F);
    expect(leaky.free[0]).toBeLessThan(sealed.free[0] - 10);
    near(leaky.free[F.length - 1], sealed.free[F.length - 1], 0.2); // no change well above the leak tuning
  });
  it("power drawn is small at the impedance peak (PS Sound's point, research_h 1.5)", () => {
    const s = simulateIB(d, { mode: "true", n: 2, Vcabin: 3, cabinLoad: true }, { Vrms: 20 }, air, F);
    const kPk = s.zmag.indexOf(Math.max(...s.zmag)); const kHi = F.findIndex((f) => f >= 100);
    expect(s.powerW[kPk]).toBeLessThan(s.powerW[kHi] / 3);
  });
  it("subsonic: none needed at 1 W, a filter at high power, keeps travel within Xmax", () => {
    const cfg = { mode: "true" as const, n: 2, Vcabin: 3, cabinLoad: true };
    expect(ibSubsonic(d, cfg, { Vrms: Math.sqrt(1 * 2.7) }, air)).toBe(0);
    const hp = ibSubsonic(d, cfg, { Vrms: Math.sqrt(500 * 4) }, air); expect(hp).toBeGreaterThan(5);
    const s = simulateIB(d, cfg, { Vrms: Math.sqrt(500 * 4), hpHz: hp, hpOrder: 4 }, air, freqs(5, 300, 24));
    expect(Math.max(...s.xmm)).toBeLessThanOrEqual(18.05);
  });
});

describe("IB driver rules (cited, shown as notes)", () => {
  it("IB15AU passes PS Sound's Fs and Qts rules and MTX's Qts > 0.6", () => {
    expect(ibVerdict(AE, 2).level).toBe("ok");
    const r = ibRules(AE, 2, 0.5); const v = (id: string) => r.find((x) => x.id === id)!.verdict;
    expect(v("fs")).toBe("pass"); expect(v("qts")).toBe("pass"); expect(v("mtx-qts")).toBe("pass"); expect(v("mtx-vas")).toBe("fail"); expect(v("lucas")).toBe("fail");
  });
  it("a low-Qts box sub is not an IB driver; missing values are unknown, never guessed", () => {
    expect(ibVerdict({ fs: 32, Qts: 0.38 }, 1).level).toBe("bad");
    expect(ibRules({}, 1)[0].verdict).toBe("unknown");
  });
  it("the IB15AU driver files hold the values of the PS Sound shop page", () => {
    for (const ohm of [4, 8]) {
      const j = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/drivers", `acoustic-elegance-ib15au-${ohm}ohm.json`), "utf8"));
      expect(j.params.fs).toBe(20.41); expect(j.params.Qts).toBe(0.62); expect(j.params.Vas).toBe(0.387); expect(j.params.Sd).toBe(0.083); expect(j.params.Xmax).toBe(0.018);
      expect(j.sources[0].source).toMatch(/pssound/); expect(complete(j.params, air).Qts).toBeCloseTo(0.62, 2);
    }
  });
});

describe("home boxes (research_h 3.3)", () => {
  it("baffle step f3 = 115 / width: 121 mm 950 Hz, 180 mm 639 Hz, 200 mm 575 Hz", () => {
    near(baffleStepHz(0.121), 950, 1); near(baffleStepHz(0.18), 639, 1); near(baffleStepHz(0.2), 575, 0.1);
  });
  it("depth rule: a shallow tall box gets depth 0.8 x width and the height gives way, volume kept", () => {
    const k = { t: 18, top: 1 }; const s = { W: 238.5, H: 950, D: 150.8 }; const req = grossL(s, k);
    const r = keepDepth(s, k, req, { H: true }, () => ({ W: 0, H: 0, D: 0 }));
    expect(r.changed).toBe(true); expect(r.sizes.D).toBeGreaterThanOrEqual(MIN_DEPTH_RATIO * s.W); expect(r.sizes.H).toBeLessThan(950);
    near(grossL(r.sizes, k), req, 0.1); expect(r.msg).toMatch(/height/);
  });
  it("depth rule leaves a sensible box alone", () => { const s = { W: 200, H: 335, D: 285 }; expect(keepDepth(s, { t: 18, top: 1 }, 10, {}, () => ({ W: 0, H: 0, D: 0 })).changed).toBe(false); });
});

describe("depth rule when the drivers' front is already the smallest box", () => {
  it("height at its minimum: the depth gives way so the volume is still kept", () => {
    const k = { t: 18, top: 1 }; const mins = () => ({ W: 238.5, H: 238.5, D: 100 });
    const s = { W: 238.5, H: 250, D: 140 }; const req = 5;
    const r = keepDepth(s, k, req, {}, mins);
    expect(r.changed).toBe(true); near(grossL(r.sizes, k), 5, 0.1); expect(r.sizes.H).toBeGreaterThanOrEqual(238.5 - 1e-6); expect(r.msg).toMatch(/drivers need a front/);
  });
});
