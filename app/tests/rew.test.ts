// REW / FRD / ZMA parsing, impedance peak finding, T/S extraction, DVC conversion and box fitting (A5_REW).
// Synthetic curves come from the app's own lumped model with seeded noise, so the true values are known exactly.
import { describe, expect, it } from "vitest";
import { parseMeasurement, writeFrdZma, writeRewText, MeasurementParseError } from "../src/io/rew";
import { boxFromPeaks, convertWiring, extractTS, findPeaks, impedanceQ } from "../src/engine/measure";
import { fitBox, nelderMead } from "../src/engine/boxfit";
import { complete, FullParams } from "../src/engine/driver";
import { BoxSpec, freqs, simulate } from "../src/engine/model";
import { diagnose } from "../src/engine/diagnose";
import { AIR_20C } from "../src/engine/air";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
// seeded PRNG (mulberry32) + Box-Muller
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
// a 12" sub like the Pioneer (series coils), but with known exact values
const P = { fs: 35, Re: 5.8, Qms: 11.5, Qes: 0.622, Vas: 0.0346, Sd: 0.0552, Le: 0.002, Xmax: 0.0138 };
const D: FullParams = complete(P);
const F = freqs(5, 2000, 96);
function sweep(d: FullParams, box: BoxSpec, noise = 0.01, seed = 1) {
  const r = simulate(d, box, { Vrms: 1 }, AIR_20C, F); const g = rng(seed);
  return { f: F, mag: r.zmag.map((z) => z * (1 + noise * gauss(g))), phase: r.zph.map((p) => p + noise * 50 * gauss(g)) };
}
const FREE: BoxSpec = { kind: "infinite", Vb: 0 };

describe("REW / FRD / ZMA parsing", () => {
  it("REW impedance text export (format of REW's help sample) → impedance with phase and header", () => {
    const txt = `* Measurement data saved by REW V5.00\n* Source: Line (ESI MAYA44 Audio), no input selected, Right channel, volume: no control\n* Format:   1M Log Swept Sine, 1 sweep at -30,0 dBFS\n* Dated: 31-Dec-2010 11:26:49\n* Sense Resistor: 100.0\n* Lead resistance: 0.000\n* Calibration factor: 1.0028\n* Note: horizontal\n* Measurement: test\n* Frequency Step: 0.36621094 Hz\n* Start Frequency: 1.8310547 Hz\n*\n* Freq(Hz) Z(Ohms) Phase(degrees)\n1.831 6.423 5.392\n2.197 6.444 6.426\n2.563 6.481 7.302\n2.930 6.522 8.049\n3.296 6.558 8.714\n3.662 6.586 9.368\n`;
    const m = parseMeasurement(txt, "sub.txt");
    expect(m.kind).toBe("impedance"); expect(m.f.length).toBe(6); expect(m.phase?.[0]).toBeCloseTo(5.392);
    expect(m.header["Sense Resistor"]).toBe("100.0"); expect(m.header["Note"]).toBe("horizontal"); expect(m.format).toBe("REW text");
  });
  it("REW comma-delimited SPL (help sample layout, no '*' lines, comment after a value) → response", () => {
    const txt = `SPL measurements acquired by REW V3.08\nFormat: Comma delimited data\nDated: 05-Mar-2005 17:53:56\n\n20.0, 65.01\n21.0, 65.77\n22.0, 67.50\n23.0, 67.93\n24.0, 68.22\n27.0, 68.31, this line has a comment\n`;
    const m = parseMeasurement(txt, "car.txt");
    expect(m.kind).toBe("response"); expect(m.mag[5]).toBeCloseTo(68.31); expect(m.phase).toBeUndefined();
  });
  it("tab, semicolon and decimal-comma exports", () => {
    const tab = "* Freq(Hz)\tSPL(dB)\tPhase(degrees)\n" + [20, 25, 31.5, 40, 50, 63].map((f, i) => `${f}\t${80 + i}\t${-10 * i}`).join("\n");
    expect(parseMeasurement(tab).kind).toBe("response");
    const semi = [20, 25, 31, 40, 50, 63].map((f, i) => `${f};${(8 + i * 3).toString().replace(".", ",")},5;${i},25`).join("\n");
    const m = parseMeasurement(semi, "x.zma"); expect(m.kind).toBe("impedance"); expect(m.mag[0]).toBeCloseTo(8.5); expect(m.phase![1]).toBeCloseTo(1.25);
  });
  it("FRD and ZMA writers round-trip; kind from extension and value range", () => {
    const s = sweep(D, FREE, 0);
    const z = parseMeasurement(writeFrdZma("impedance", s.f, s.mag, s.phase), "drv.zma"); expect(z.kind).toBe("impedance"); expect(rel(z.mag[100], s.mag[100])).toBeLessThan(1e-4);
    const r = parseMeasurement(writeFrdZma("response", s.f, s.mag.map((v) => 80 + Math.log10(v)), undefined), "drv.frd"); expect(r.kind).toBe("response"); expect(r.phase).toBeUndefined();
    // no header, no telling extension: range decides
    const bare = s.f.map((f, i) => `${f} ${s.mag[i]}`).join("\n"); expect(parseMeasurement(bare, "a.dat").kind).toBe("impedance");
    const bareSpl = s.f.map((f, i) => `${f} ${85 + Math.sin(i / 20) * 5}`).join("\n"); expect(parseMeasurement(bareSpl, "a.dat").kind).toBe("response");
    const rew = parseMeasurement(writeRewText("impedance", s.f, s.mag, s.phase, { note: "free air" }), "x.txt"); expect(rew.kind).toBe("impedance"); expect(rew.format).toBe("REW text");
  });
  it("rejects garbage with clear messages", () => {
    const bad = (t: string, re: RegExp, name = "f.txt") => { try { parseMeasurement(t, name); throw new Error("accepted"); } catch (e) { expect(e).toBeInstanceOf(MeasurementParseError); expect((e as Error).message).toMatch(re); } };
    bad("", /empty/);
    bad("hello\nworld\n", /No data lines/);
    bad("\x00\x01\x02binary\x00stuff", /binary/);
    bad("1\n2\n3\n4\n5\n6\n", /two numbers/);
    bad("20 1\n30 2\n40 3\n", /at least 5/);
    bad("20 5\n30 6\n25 7\n40 8\n50 9\n60 9\n", /increase/);
    bad("0 5\n30 6\n35 7\n40 8\n50 9\n60 9\n", /above 0 Hz/);
    bad("20 -5\n30 6\n35 7\n40 8\n50 9\n60 9\n", /0 Ω/, "neg.zma");
  });
  it("all-zero phase column (REW writes 0.0 without phase) is dropped", () => {
    const m = parseMeasurement("* Freq(Hz) SPL(dB) Phase(degrees)\n" + [20, 30, 40, 50, 60].map((f) => `${f} 80 0.0`).join("\n"));
    expect(m.phase).toBeUndefined(); expect(m.warnings.join()).toMatch(/phase/);
  });
});

describe("impedance peaks and T/S extraction", () => {
  it("free air: one peak at fs; T/S recovered (with phase, Re from a meter) within 2 %", () => {
    const s = sweep(D, FREE, 0.005, 3);
    expect(findPeaks(s).length).toBe(1);
    const r = extractTS({ free: s, ReDC: P.Re, Sd: P.Sd, wiring: "series", target: "series" });
    expect(rel(r.fs, P.fs)).toBeLessThan(0.01); expect(rel(r.Qms, P.Qms)).toBeLessThan(0.03); expect(rel(r.Qes, P.Qes)).toBeLessThan(0.02);
    expect(rel(r.Qts, D.Qts)).toBeLessThan(0.02); expect(rel(r.Le!, P.Le)).toBeLessThan(0.05); expect(r.usedReal).toBe(true);
  });
  it("magnitude-only file (no phase) uses Small's sqrt(r0) points; Qs within 5 % with Le = 2 mH", () => {
    const s = sweep(D, FREE, 0, 3); const q = impedanceQ({ f: s.f, mag: s.mag }, P.Re)!;
    expect(rel(q.fs, P.fs)).toBeLessThan(0.02); expect(rel(q.Qms, P.Qms)).toBeLessThan(0.05); expect(rel(q.Qes, P.Qes)).toBeLessThan(0.05);
  });
  it("Re estimated from the curve when no meter reading: marked, close", () => {
    const r = extractTS({ free: sweep(D, FREE, 0, 4), Sd: P.Sd, wiring: "single", target: "single" });
    expect(r.ReHow).toMatch(/estimated/); expect(rel(r.Re, P.Re)).toBeLessThan(0.02); expect(r.notes.join()).toMatch(/meter/);
  });
  it("added mass: Vas, Mms, Bl recovered within 3 %", () => {
    const m = 0.12; const Dm: FullParams = { ...D, Mms: D.Mms + m };
    const r = extractTS({ free: sweep(D, FREE, 0.005, 5), ReDC: P.Re, Sd: P.Sd, wiring: "series", target: "series", addedMass: { kg: m, curve: sweep(Dm, FREE, 0.005, 6) } });
    expect(rel(r.Vas!, P.Vas)).toBeLessThan(0.03); expect(rel(r.Mms!, D.Mms)).toBeLessThan(0.03); expect(rel(r.Bl!, D.Bl)).toBeLessThan(0.03);
  });
  it("known closed box: Vas recovered within 3 %", () => {
    const Vb = 0.025;
    const r = extractTS({ free: sweep(D, FREE, 0.005, 7), ReDC: P.Re, Sd: P.Sd, wiring: "single", target: "single", closedBox: { Vb, curve: sweep(D, { kind: "sealed", Vb, QL: 100 }, 0.005, 8) } });
    expect(rel(r.Vas!, P.Vas)).toBeLessThan(0.03);
  });
  it("rejects an added-mass sweep that does not lower fs", () => {
    expect(() => extractTS({ free: sweep(D, FREE, 0, 1), ReDC: P.Re, Sd: P.Sd, wiring: "single", target: "single", addedMass: { kg: 0.01, curve: sweep(D, FREE, 0, 2) } })).toThrow(/not clearly below/);
  });
});

describe("dual voice coil wiring", () => {
  const one = { Re: 2.9, Bl: 11.2, Le: 0.0015, Qes: 1.244 }; // one coil driven, other open (Qes per coil)
  it("series: Re×2, Bl×2, Qes = one-coil Qes / 2; parallel: Re/2, Bl same, Qes same as series", () => {
    const s = convertWiring(one, "one", "series"), p = convertWiring(one, "one", "parallel");
    expect(s.Re).toBeCloseTo(5.8); expect(s.Bl).toBeCloseTo(22.4); expect(s.Qes).toBeCloseTo(0.622);
    expect(p.Re).toBeCloseTo(1.45); expect(p.Bl).toBeCloseTo(11.2); expect(p.Qes).toBeCloseTo(0.622);
    expect(s.Le! / p.Le!).toBeCloseTo(4);
    const back = convertWiring(s, "series", "one"); expect(back.Re).toBeCloseTo(2.9); expect(back.Qes).toBeCloseTo(1.244);
  });
  it("Qes = 2π·fs·Mms·Re/Bl² holds in every wiring", () => {
    for (const w of ["series", "parallel", "one"] as const) { const c = convertWiring(one, "one", w); expect((2 * Math.PI * 35 * D.Mms * c.Re) / (c.Bl! ** 2) / c.Qes).toBeCloseTo((2 * Math.PI * 35 * D.Mms * one.Re) / (one.Bl ** 2) / one.Qes, 6); }
  });
  it("model check: a parallel-wired sweep is the series sweep / 4 (same driver), and extraction converts back", () => {
    const par = complete({ ...P, Re: P.Re / 4, Qes: P.Qes, Le: P.Le / 4 });
    const s = sweep(par, FREE, 0, 9);
    const r = extractTS({ free: s, ReDC: P.Re / 4, Sd: P.Sd, wiring: "parallel", target: "series" });
    expect(rel(r.Re, P.Re)).toBeLessThan(1e-9); expect(rel(r.Qes, P.Qes)).toBeLessThan(0.02); expect(r.notes.join()).toMatch(/two identical coils/);
  });
});

describe("box from the measured impedance", () => {
  const Sv = Math.PI * 0.05 ** 2; // 100 mm round port
  const ventBox = (Vb: number, fb: number, QL: number): BoxSpec => ({ kind: "vented", Vb, port: { Sv, Leff: (AIR_20C.c ** 2 * Sv) / (4 * Math.PI ** 2 * fb * fb * Vb) }, QL, QP: 100 });
  it("peak read-out: two peaks, minimum near fb, Vb from the two-resonator relations (lossless-ish box)", () => {
    const pk = boxFromPeaks(sweep(D, ventBox(0.06, 30, 50), 0, 1), D);
    expect(pk.kind).toBe("vented"); expect(Math.abs(pk.fb! - 30)).toBeLessThan(1.0); expect(rel(pk.Vb!, 0.06)).toBeLessThan(0.08);
  });
  it("vented fit recovers Vb within 3 %, fb within 2 %, QL within 30 % from a noisy sweep (1 % noise)", () => {
    for (const [Vb, fb, QL, seed] of [[0.06, 30, 7, 11], [0.09, 34, 12, 12], [0.04, 40, 5, 13]] as const) {
      const fit = fitBox(D, "vented", sweep(D, ventBox(Vb, fb, QL), 0.01, seed), Sv);
      expect(rel(fit.VbPer, Vb)).toBeLessThan(0.03); expect(rel(fit.fb!, fb)).toBeLessThan(0.02); expect(rel(fit.QL, QL)).toBeLessThan(0.3);
      expect(fit.rmsPct).toBeLessThan(2);
    }
  });
  it("sealed fit recovers Vb within 3 % and the Re offset", () => {
    const Vb = 0.03, QL = 20; const hot: FullParams = { ...D, Re: D.Re + 0.3 };
    const fit = fitBox(D, "sealed", sweep(hot, { kind: "sealed", Vb, QL }, 0.01, 21), undefined);
    expect(rel(fit.VbPer, Vb)).toBeLessThan(0.03); expect(Math.abs(fit.dRe - 0.3)).toBeLessThan(0.05);
  });
  it("using the fitted box changes the diagnosis (volume, tuning)", () => {
    const ex = { geom: { W: 0.6, H: 0.4, D: 0.5, t: 0.018 }, kind: "vented" as const, port: { shape: "round" as const, count: 1, d: 0.1, length: 0.2 }, drivers: 1 };
    const a = diagnose(D, ex, { wattsPerDriver: 300, impedance: 8 });
    const b = diagnose(D, { ...ex, fitted: { VbPer: 0.05, fb: 33, QL: 6, QP: 60 } }, { wattsPerDriver: 300, impedance: 8 });
    expect(b.Vb).toBeCloseTo(0.05, 6); expect(b.fb).toBeCloseTo(33, 6); expect(a.Vb).not.toBeCloseTo(0.05, 3);
    expect(b.options[0].box.QL).toBe(6);
  });
  it("QA absorption loss off by default leaves the model unchanged; on lowers the impedance peaks", () => {
    const b = ventBox(0.06, 30, 7);
    const z0 = simulate(D, b, { Vrms: 1 }).zmag, z1 = simulate(D, { ...b, QA: undefined }, { Vrms: 1 }).zmag, z2 = simulate(D, { ...b, QA: 5 }, { Vrms: 1 }).zmag;
    expect(z1).toEqual(z0); expect(Math.max(...z2)).toBeLessThan(Math.max(...z0));
  });
  it("Nelder-Mead finds a known minimum", () => {
    const r = nelderMead((x) => (x[0] - 3) ** 2 + 10 * (x[1] + 1) ** 2, [0, 0], [1, 1]);
    expect(r.x[0]).toBeCloseTo(3, 4); expect(r.x[1]).toBeCloseTo(-1, 4);
  });
});
