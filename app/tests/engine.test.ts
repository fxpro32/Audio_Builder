// Test cases from references/research_c_design_maths.md §7 and part2 §3, plus closed-form vs lumped-model agreement.
import { describe, expect, it } from "vitest";
import { sealed, sealedVbForQtc, ventedCoeffs, ventedMag2, ventedF3Ratio, qb3, sbb4, bandpass4 } from "../src/engine/alignments";
import { complete, crossCheck } from "../src/engine/driver";
import { simulate, summarise, freqs } from "../src/engine/model";
import { AIR_20C, AIR_PRESETS } from "../src/engine/air";
import { grossVolume } from "../src/engine/volume";
import { portLengthFor } from "../src/engine/port";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("closed-form test cases (research_c §7)", () => {
  it("T1 sealed pikku9", () => {
    const r = sealed(60, 0.38, 5.0, 5.0);
    near(r.alpha, 1, 1e-9); near(r.Qtc, 0.537, 0.001); near(r.fc, 84.85, 0.01); near(r.f3, 119.1, 0.1);
  });
  it("T2 sealed ajdesigner", () => {
    const Vb = sealedVbForQtc(0.342, 186.16, 0.7);
    near(Vb, 58.37, 0.01);
    const r = sealed(24, 0.342, 186.16, Vb);
    near(r.fc, 49.123, 0.005); near(r.f3, 49.627, 0.01);
  });
  it("T3 B4 lossless", () => {
    const q = Math.cos((3 * Math.PI) / 8);
    const k = ventedCoeffs(1, Math.SQRT2, q, 1e12);
    near(k.a1, 2.6131, 1e-3); near(k.a2, 3.4142, 1e-3); near(k.a3, 2.6131, 1e-3);
    near(ventedF3Ratio(1, Math.SQRT2, q, 1e12), 1, 1e-3);
  });
  it("T4 B4 lossy QL=7 → |G(fs)|² = 0.5", () => near(ventedMag2(1, 1, 1.0613, 0.4048, 7), 0.5, 0.002));
  it("T5 QB3 Leach QL=7", () => {
    const a = qb3(0.326, 7);
    near(a.h, 1.2165, 0.002); near(a.alpha, 2.24, 0.002);
    near(ventedF3Ratio(a.h, a.alpha, 0.326, 7), 1.4074, 0.002);
    // port: 3 in ID with Leach's chart values Vb = 2.14 ft³, fb = 34 Hz → 5.44 in (research_c T5; Leach built 5.5 in)
    const ft3 = 0.0283168, inch = 0.0254;
    const Vb = 2.14 * ft3, fb = 34;
    const L = portLengthFor({ shape: "round", count: 1, d: 3 * inch, length: 0 }, Vb, fb, 343, 1.463);
    near(L / inch, 5.44, 0.08);
  });
  it("T6 SBB4", () => {
    const a = sbb4(0.342, 7);
    near(a.alpha, 1.9337, 0.001); near(186.16 / a.alpha, 96.27, 0.05);
    near(ventedF3Ratio(1, a.alpha, 0.342, 7) * 24, 34.23, 0.05);
  });
  it("T7 4th-order bandpass", () => {
    const r = bandpass4(24, 0.342, 186.16, 0.7);
    near(r.Vf, 42.677, 0.005); near(r.Vr, 55.371, 0.005); near(r.fb, 50.125, 0.005); near(r.fl, 30.857, 0.005); near(r.fh, 81.425, 0.005);
  });
  it("T8 RS225-8 cross-check", () => {
    const air = AIR_PRESETS[1]; // rho 1.18, c 343 as used in the research
    const p = { fs: 28.3, Re: 6.6, Qms: 1.46, Qes: 0.514, Qts: 0.38, Vas: 0.0566, Mms: 0.036, Cms: 0.883e-3, Rms: 4.36, Sd: 212.66e-4, Xmax: 0.007 };
    const f = complete(p, air);
    near(f.Qts, 0.3802, 0.0005);
    const rows = crossCheck(p, air);
    const vas = rows.find((r) => r.name === "Vas")!; near(vas.computed * 1000, 55.4, 0.1);
    near(f.eta0 * 100, 0.244, 0.003);
    near(f.Bl, 9.07, 0.25); // Bl from Qes with Mms derived from Vas (−2 % Cms) → slightly different from 9.07
  });
  it("construction: boot wedge 91.0 L", () => {
    // internal 0.80 × 0.35, depth 0.40 bottom 0.25 top; use t = 0 so external = internal
    near(grossVolume({ W: 0.8, H: 0.35, D: 0.4, Dtop: 0.25, t: 0 }) * 1000, 91.0, 0.01);
  });
});

describe("lumped model agrees with closed forms", () => {
  const d = complete({ fs: 28.3, Re: 6.6, Qms: 1.46, Qes: 0.514, Vas: 0.0566, Sd: 212.66e-4, Xmax: 0.007 });
  it("infinite-baffle passband SPL = 112.02 + 10·log10(η0·P)", () => {
    const r = simulate(d, { kind: "infinite", Vb: 0 }, { Vrms: 2.83 }, AIR_20C, [5000]); // far above fs (Le = 0), where the 2nd-order roll-off is gone
    near(r.spl[0], r.refSpl, 0.02);
  });
  it("sealed: model f3 matches closed form (high QL)", () => {
    const Vb = 0.03;
    const cf = sealed(d.fs, d.Qts, d.Vas, Vb);
    const r = simulate(d, { kind: "sealed", Vb, QL: 1e9 }, { Vrms: 2.83 }, AIR_20C, freqs(5, 400, 400));
    const s = summarise(r, d, 400);
    near(s.f3, cf.f3, cf.f3 * 0.003);
  });
  it("vented: model |H| matches Small's G (QL=7, QP→∞)", () => {
    const a = qb3(d.Qts, 7);
    const Vb = d.Vas / a.alpha, fb = a.h * d.fs;
    // choose port area, compute Leff for fb directly
    const Sv = 0.005, Leff = (AIR_20C.c ** 2 * Sv) / (4 * Math.PI ** 2 * fb * fb * Vb);
    for (const ratio of [0.7, 1, 1.4, 2]) {
      const f = ratio * d.fs;
      const r = simulate(d, { kind: "vented", Vb, port: { Sv, Leff }, QL: 7, QP: 1e9 }, { Vrms: 2.83 }, AIR_20C, [f]);
      const modelDb = r.spl[0] - r.refSpl;
      const smallDb = 10 * Math.log10(ventedMag2(ratio, a.h, a.alpha, d.Qts, 7));
      near(modelDb, smallDb, 0.01);
    }
  });
  it("sealed low-frequency excursion = √2·V·Bl·Cms/(Re(1+α))", () => {
    const Vb = 0.03, alpha = d.Vas / Vb;
    const r = simulate(d, { kind: "sealed", Vb, QL: 1e9 }, { Vrms: 10 }, AIR_20C, [2]);
    near(r.xmm[0], (Math.SQRT2 * 10 * d.Bl * d.Cms) / (d.Re * (1 + alpha)) * 1000, 0.05);
  });
});

import { diagnose } from "../src/engine/diagnose";
describe("FIX/TWEAK reproduces research_c part2 §1.4 case A", () => {
  it("high-Qts 12 in in an oversized vented box: over-excursion, port speed, block-port Qtc 0.81", () => {
    const d = complete({ fs: 30, Re: 3.4, Qms: 4.0, Qes: 0.7, Vas: 0.1, Sd: 507e-4, Xmax: 0.01 });
    // 120 L net, fb 25 Hz, port r = 5 cm: build geometry with t = 0 and a port of the right length
    const geom = { W: 0.5, H: 0.4, D: 0.6, t: 0 }; // 120 L
    const port = { shape: "round" as const, count: 1, d: 0.1, length: 0, wall: 0 };
    port.length = portLengthFor(port, 0.12, 25);
    const dg = diagnose(d, { geom, kind: "vented", port: { ...port, wall: -0.05 }, drivers: 1 }, { wattsPerDriver: 100, impedance: 3.4 });
    near(dg.fb!, 25, 0.05);
    const a = dg.options[0].summary;
    near(a.maxXmm, 22.6, 1.0); near(a.maxVport, 25.7, 1.5);
    expect(dg.findings.some((f) => f.title.startsWith("Cone over-excursion"))).toBe(true);
    const block = dg.options.find((o) => o.id === "block")!;
    expect(block.steps.join(" ")).toContain("Qtc 0.81");
  });
});

import { parseWdr, writeWdr } from "../src/io/wdr";
import { parseCsv, rowsToDrivers } from "../src/io/csv";
import { readFileSync } from "node:fs";
describe("import", () => {
  it(".wdr sample (ACI SV10) parses and completes", () => {
    const d = parseWdr(readFileSync(new URL("./fixtures/openisd_sample_ACI_SV10.wdr", import.meta.url), "utf8"), "ACI SV10.wdr");
    expect(d.brand).toBe("ACI"); near(d.params.fs, 18.62, 1e-9); near(d.params.Vas!, 0.08946, 1e-9);
    const f = complete(d.params); near(f.Qts, 0.36, 0.005);
    const back = parseWdr(writeWdr(d)); near(back.params.Bl!, 9.4801, 1e-9);
  });
  it("CSV with units in headers", () => {
    const csv = 'Brand,Model,Fs (Hz),Re (ohm),Qms,Qes,Vas (L),Sd (cm2),Xmax (mm)\nAcme,"SW 12, rev2",30,3.4,4,0.7,100,507,10\n,bad,,,,,,,\n';
    const r = rowsToDrivers(parseCsv(csv), "test.csv");
    expect(r.drivers.length).toBe(1); expect(r.skipped).toBe(1);
    const p = r.drivers[0].params; near(p.Vas!, 0.1, 1e-12); near(p.Sd, 0.0507, 1e-12); near(p.Xmax!, 0.01, 1e-12);
    expect(r.drivers[0].model).toBe("SW 12, rev2");
  });
});
