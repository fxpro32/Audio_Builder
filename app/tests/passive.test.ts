// A11_AUTOSIZE: passive radiator model (Small 1974) against closed-form limits.
import { describe, expect, it } from "vitest";
import { complete } from "../src/engine/driver";
import { simulate, freqs } from "../src/engine/model";
import { AIR_20C } from "../src/engine/air";
import { completePR, prBranch, prMassFor, prTuning, prVdRatio } from "../src/engine/passive";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const air = AIR_20C; const rc2 = air.rho * air.c * air.c;
// a 12 in subwoofer with round numbers (test driver, not a product)
const drv = complete({ fs: 30, Re: 3.5, Qms: 6, Qes: 0.45, Vas: 0.05, Sd: 0.05, Xmax: 0.015 }, air);
const F = freqs(10, 200, 24);
const drive = { Vrms: 10 };

describe("completePR", () => {
  it("from Sd, Mms, Cms, Qms", () => {
    const p = completePR({ Sd: 0.05, Mms: 0.2, Cms: 2e-4, Qms: 8 });
    near(p.fs, 1 / (2 * Math.PI * Math.sqrt(0.2 * 2e-4)), 1e-9); near(p.Rms, (2 * Math.PI * p.fs * 0.2) / 8, 1e-9); near(p.Vas, rc2 * 0.05 ** 2 * 2e-4, 1e-12);
  });
  it("from fs + Vas (mass derived)", () => { const p = completePR({ Sd: 0.05, fs: 20, Vas: 0.1, Rms: 3 }); near(p.fs, 20, 1e-9); expect(p.Mms).toBeGreaterThan(0); });
  it("missing loss or mass: refuses (never guesses)", () => {
    expect(() => completePR({ Sd: 0.05, Mms: 0.2, Cms: 2e-4 })).toThrow(/Qms or Rms/);
    expect(() => completePR({ Sd: 0.05, Cms: 2e-4, Qms: 5 })).toThrow(/moving mass/);
    expect(() => completePR({ Mms: 0.2, Cms: 2e-4, Qms: 5 })).toThrow(/Sd/);
  });
});

describe("PR box against closed-form limits", () => {
  const Vb = 0.04;
  it("very stiff PR = sealed box", () => {
    const pr = completePR({ Sd: 0.05, Mms: 0.2, Cms: 1e-10, Qms: 10 });
    const a = simulate(drv, { kind: "passive", Vb, pr: prBranch(pr, 0, 1, 1), QL: 1e9 }, drive, air, F);
    const b = simulate(drv, { kind: "sealed", Vb, QL: 1e9 }, drive, air, F);
    for (let i = 0; i < F.length; i++) near(a.spl[i], b.spl[i], 0.05);
    expect(Math.max(...a.xpr!)).toBeLessThan(0.01);
  });
  it("very compliant PR = vented box with a port of the same air mass", () => {
    const Sv = 0.01, Leff = 0.3; const MAP = (air.rho * Leff) / Sv;
    const pr = completePR({ Sd: 0.05, Mms: MAP * 0.05 ** 2, Cms: 1e3, Rms: 1e-9 });
    const a = simulate(drv, { kind: "passive", Vb, pr: prBranch(pr, 0, 1, 1), QL: 7 }, drive, air, F);
    const b = simulate(drv, { kind: "vented", Vb, port: { Sv, Leff }, QL: 7, QP: 1e12 }, drive, air, F);
    for (let i = 0; i < F.length; i++) near(a.spl[i], b.spl[i], 0.05);
  });
  it("added mass tunes the box: fb from the formula, impedance minimum there, notch at fp", () => {
    const pr = completePR({ Sd: 0.05, Mms: 0.15, Cms: 4e-4, Qms: 10, Xmax: 0.03 });
    const add = prMassFor(pr, 2, 1, Vb, 25, air); expect(add).toBeGreaterThan(0);
    const t = prTuning(pr, add, 2, 1, Vb, air); near(t.fb, 25, 1e-6); near(t.fb, t.fp * Math.sqrt(1 + (rc2 * pr.Cms * pr.Sd ** 2 * 2) / Vb), 1e-6);
    const FF = freqs(10, 100, 96);
    const s = simulate(drv, { kind: "passive", Vb, pr: prBranch(pr, add, 2, 1), QL: 1e6 }, drive, air, FF);
    // impedance minimum between the two peaks
    let lo = FF.findIndex((f) => f > 15), hi = FF.findIndex((f) => f > 40); let kmin = lo;
    for (let k = lo; k < hi; k++) if (s.zmag[k] < s.zmag[kmin]) kmin = k;
    near(FF[kmin], 25, 25 * 0.04);
    // response notch at fp (the PR's own resonance cancels the cone's output)
    const kp = FF.findIndex((f) => f >= t.fp); expect(s.spl[kp]).toBeLessThan(s.spl[FF.findIndex((f) => f >= 25)] - 15);
    // the PR moves most near fb, and more than the cone there
    const kb = FF.findIndex((f) => f >= 25); expect(s.xpr![kb]).toBeGreaterThan(s.xmm[kb]);
  });
  it("two drivers sharing the box: each share sees half the box and half the PRs (same as one driver alone)", () => {
    const pr = completePR({ Sd: 0.05, Mms: 0.15, Cms: 4e-4, Qms: 10 });
    const one = simulate(drv, { kind: "passive", Vb, pr: prBranch(pr, 0.1, 2, 1) }, drive, air, F);
    const two = simulate(drv, { kind: "passive", Vb, pr: prBranch(pr, 0.1, 4, 2) }, { ...drive, count: 2 }, air, F);
    for (let i = 0; i < F.length; i++) { near(two.spl[i] - one.spl[i], 20 * Math.log10(2), 1e-6); near(two.xpr![i], one.xpr![i], 1e-9); }
  });
  it("Vd rule of thumb", () => {
    const pr = completePR({ Sd: 0.05, Mms: 0.15, Cms: 4e-4, Qms: 10, Xmax: 0.03 });
    near(prVdRatio(pr, 2, drv.Sd, drv.Xmax, 1)!, (0.05 * 0.03 * 2) / (0.05 * 0.015), 1e-9);
    expect(prVdRatio({ ...pr, Xmax: 0 }, 2, drv.Sd, drv.Xmax, 1)).toBeUndefined();
  });
});
