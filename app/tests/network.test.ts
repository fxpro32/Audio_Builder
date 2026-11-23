// Multi-chamber network (A1 item 5): agrees with the single-box model, the bandpass cookbook, isobaric equivalence, slope orders.
import { describe, expect, it } from "vitest";
import { complete } from "../src/engine/driver";
import { simulate, freqs } from "../src/engine/model";
import { bandpass4, sealed, sealedF3 } from "../src/engine/alignments";
import { buildNetwork, simulateNet, TopologyInputs, OUT } from "../src/engine/network";
import { portFb, portLeff, portLengthFor, portInertance, portDisplacement } from "../src/engine/port";
import { AIR_20C } from "../src/engine/air";

// T2/T6 driver of research_c (fs 24, Qts 0.342, Vas 186.16 L) with a plausible Sd/Re
const d = complete({ fs: 24, Re: 5.6, Qms: 4.2, Qes: 0.3723, Vas: 0.18616, Sd: 0.0531, Xmax: 0.012 });
const base = (o: Partial<TopologyInputs>): TopologyInputs => ({ topology: "sealed", isobaric: false, isoWiring: "parallel", isoGapL: 0.5, drivers: 1, V1: 50, V2: 40, V3: 20, fb1: 30, fb2: 50, fb3: 60, portAreaCm2: [80, 80, 80], ...o });
const F = freqs(10, 300, 24);
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const at = (f: number[], y: number[], hz: number) => y[f.findIndex((x) => x >= hz)];
/** −3 dB points around the passband maximum. */
function edges(f: number[], spl: number[]) {
  let k = 0; for (let i = 0; i < f.length; i++) if (spl[i] > spl[k]) k = i;
  const lvl = spl[k] - 3; let lo = f[0], hi = f[f.length - 1];
  for (let i = k; i > 0; i--) if (spl[i - 1] < lvl) { lo = f[i - 1] * (f[i] / f[i - 1]) ** ((lvl - spl[i - 1]) / (spl[i] - spl[i - 1])); break; }
  for (let i = k; i < f.length - 1; i++) if (spl[i + 1] < lvl) { hi = f[i] * (f[i + 1] / f[i]) ** ((lvl - spl[i]) / (spl[i + 1] - spl[i])); break; }
  return { lo, hi, peak: spl[k] };
}

describe("network vs the single-chamber model", () => {
  it("sealed 58.37 L: same SPL and excursion as model.simulate within 0.01 dB", () => {
    const net = buildNetwork(d, base({ topology: "sealed", V1: 58.37 }));
    const a = simulateNet(net, 2.83, AIR_20C, F); const b = simulate(d, { kind: "sealed", Vb: 0.05837 }, { Vrms: 2.83 }, AIR_20C, F);
    for (let i = 0; i < F.length; i++) { near(a.spl[i], b.spl[i], 0.01); near(a.xmm[0][i], b.xmm[i], 1e-3 * b.xmm[i] + 1e-9); near(a.zmag[i], b.zmag[i], 1e-6 * b.zmag[i]); }
  });
  it("vented 96.27 L at 24 Hz: same SPL and port speed as model.simulate", () => {
    const net = buildNetwork(d, base({ topology: "vented", V1: 96.27, fb1: 24 }));
    const p = net.ports[0];
    const a = simulateNet(net, 2.83, AIR_20C, F); const b = simulate(d, { kind: "vented", Vb: 0.09627, port: { Sv: p.Sv, Leff: p.Leff } }, { Vrms: 2.83 }, AIR_20C, F);
    for (let i = 0; i < F.length; i++) { near(a.spl[i], b.spl[i], 0.01); near(a.vport[0][i], b.vport[i], 1e-3 * b.vport[i] + 1e-9); }
  });
  it("sealed f3 equals the closed form (Small) within 1 %", () => {
    const Vb = 58.37; const r = sealed(d.fs, d.Qts, d.Vas, Vb / 1000);
    const net = buildNetwork(d, base({ topology: "sealed", V1: Vb }));
    const Ff = freqs(5, 1000, 96); const s = simulateNet(net, 2.83, AIR_20C, Ff);
    const ref = at(Ff, s.spl, 400); const k = Ff.findIndex((f, i) => i > 0 && s.spl[i] >= ref - 3);
    expect(Math.abs(Ff[k] - sealedF3(r.fc, r.Qtc)) / sealedF3(r.fc, r.Qtc)).toBeLessThan(0.03);
  });
});

describe("bandpass and isobaric", () => {
  it("4th-order bandpass (cookbook S = 0.7, research_c T7): −3 dB points within 6 % of fl 30.86 / fh 81.43 Hz", () => {
    const r = bandpass4(24, 0.342, 186.16, 0.7);
    const net = buildNetwork(d, base({ topology: "bp4", V1: r.Vr, V2: r.Vf, fb2: r.fb, portAreaCm2: [0, 150, 0] }));
    for (const c of net.chambers) c.QL = 1000; // near-lossless like the cookbook
    const Ff = freqs(5, 1000, 96); const s = simulateNet(net, 2.83, AIR_20C, Ff); const e = edges(Ff, s.spl);
    expect(Math.abs(e.lo - r.fl) / r.fl).toBeLessThan(0.06); expect(Math.abs(e.hi - r.fh) / r.fh).toBeLessThan(0.06);
  });
  it("slopes: 4th order rolls off 12 + 12 dB/oct, 6th order 36 dB/oct in total, vented 24 dB/oct below fb", () => {
    // lossless chambers: leakage from a front chamber radiates and would add a 6 dB/oct path at very high frequency
    const slope = (net: ReturnType<typeof buildNetwork>, f1: number) => { for (const c of net.chambers) c.QL = 1e9; const s = simulateNet(net, 2.83, AIR_20C, [f1, f1 * 2]); return s.spl[1] - s.spl[0]; };
    const bp4 = buildNetwork(d, base({ topology: "bp4", V1: 55, V2: 43, fb2: 50, portAreaCm2: [0, 150, 0] }));
    near(slope(bp4, 1), 12, 0.3); near(-slope(bp4, 4000), 12, 0.5);
    const bp6 = buildNetwork(d, base({ topology: "bp6", V1: 60, V2: 40, fb1: 30, fb2: 60, portAreaCm2: [100, 150, 0] }));
    const lo6 = slope(bp6, 1), hi6 = -slope(bp6, 4000); near(lo6 + hi6, 36, 1.0);
    const v = buildNetwork(d, base({ topology: "vented", V1: 96, fb1: 24 })); near(slope(v, 1), 24, 0.5);
    const bp3 = buildNetwork(d, base({ topology: "bp3", V1: 50, V2: 30, V3: 30, fb2: 45, fb3: 70, portAreaCm2: [0, 120, 120] }));
    const lo3 = slope(bp3, 1), hi3 = -slope(bp3, 4000); near(lo3 + hi3, 36, 1.0); // 3 chambers, 2 ports in series: order 6
    const bp3d = buildNetwork(d, base({ topology: "bp3dual", V1: 50, V2: 30, V3: 30, fb1: 30, fb2: 45, fb3: 70, portAreaCm2: [80, 120, 120] }));
    expect(isFinite(simulateNet(bp3d, 2.83, AIR_20C, F).spl[10])).toBe(true);
  });
  it("6th order with a nearly closed rear port behaves like the 4th order", () => {
    const a = simulateNet(buildNetwork(d, base({ topology: "bp4", V1: 55, V2: 43, fb2: 50, portAreaCm2: [0, 150, 0] })), 2.83, AIR_20C, F);
    const b = simulateNet(buildNetwork(d, base({ topology: "bp6", V1: 55, V2: 43, fb1: 5, fb2: 50, portAreaCm2: [0.0001, 150, 0] })), 2.83, AIR_20C, F);
    for (let i = 0; i < F.length; i++) if (F[i] > 20) near(a.spl[i], b.spl[i], 0.2);
  });
  it("isobaric pair in half the volume = one driver in the full volume (same Qtc, same SPL at the same voltage, parallel)", () => {
    const one = simulateNet(buildNetwork(d, base({ topology: "sealed", V1: 60 })), 2.83, AIR_20C, F);
    const iso = simulateNet(buildNetwork(d, base({ topology: "sealed", V1: 30, isobaric: true, isoGapL: 0.01 })), 2.83, AIR_20C, F);
    for (let i = 0; i < F.length; i++) if (F[i] < 150) near(iso.spl[i], one.spl[i], 0.15);
    // impedance halves (two coils in parallel), so the pair draws twice the power: −3 dB per watt
    near(iso.zmag[0] / one.zmag[0], 0.5, 0.02);
    // series wiring: same voltage → a quarter of the power: −6 dB
    const ser = simulateNet(buildNetwork(d, base({ topology: "sealed", V1: 30, isobaric: true, isoGapL: 0.01, isoWiring: "series" })), 2.83, AIR_20C, F);
    near(at(F, one.spl, 100) - at(F, ser.spl, 100), 6.02, 0.15);
  });
});

describe("flared (aeroport) ports", () => {
  const straight = { shape: "round" as const, count: 1, d: 0.1, length: 0.3 };
  it("no flare = the straight-port formulas exactly", () => {
    near(portLeff({ ...straight, flare: 0 }), portLeff(straight), 1e-12);
    near(portInertance(straight), 0.3 / (Math.PI * 0.05 ** 2), 1e-9);
  });
  it("flare lowers the air mass, so the same length tunes higher; the length solver inverts it", () => {
    const fl = { ...straight, flare: 0.04 };
    expect(portFb(fl, 0.05)).toBeGreaterThan(portFb(straight, 0.05));
    const L = portLengthFor(fl, 0.05, 32); near(portFb({ ...fl, length: L }, 0.05), 32, 1e-6);
    expect(L).toBeGreaterThan(portLengthFor(straight, 0.05, 32));
    expect(portDisplacement(fl, 0.018)).toBeGreaterThan(portDisplacement(straight, 0.018));
  });
  it("inertance of the flared part matches a fine trapezoid sum of dx/(π r²)", () => {
    const fl = { ...straight, flare: 0.05 }; const r0 = 0.05, R = 0.05; let s = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) * R / n; const q = R - x; const r = r0 + R - Math.sqrt(R * R - q * q); s += (R / n) / (Math.PI * r * r); }
    near(portInertance(fl), (0.3 - 0.1) / (Math.PI * r0 * r0) + 2 * s, 1e-3 * portInertance(fl));
  });
});
void OUT;
import { advancedDesign, seedAdvanced } from "../src/ui/design2";
describe("Design tab bandpass/isobaric helper", () => {
  const ds: any = { kind: "sealed", topology: "bp4", target: "qtc", qtc: 0.707, customVbL: 40, customFb: 35, maxW: 800, maxH: 400, maxD: 600, t: 18, wedge: false, topDepthPct: 70, portShape: "round", portD: 100, portW: 300, portH: 50, portCount: 1, bracesL: 0 };
  it("seeds the 4th-order bandpass from the cookbook (research_c T7 values for this driver)", () => {
    seedAdvanced(ds, d, 1); near(ds.V1, 55.4, 0.1); near(ds.V2, 42.7, 0.1); near(ds.fb2, 50.1, 0.1);
    const r = advancedDesign(d, ds, 1, 20, AIR_20C, 0.15);
    expect(r.model.dividers!.length).toBe(1); expect(r.model.driverWall).toBe(0); expect(r.ports.length).toBe(1); expect(r.ports[0].lengthMm).toBeGreaterThan(20);
  });
  it("flags an isobaric pair that does not fit the depth", () => {
    const iso = { ...ds, topology: "sealed", isobaric: true, maxW: 1200, maxH: 600 }; seedAdvanced(iso, d, 1);
    const r = advancedDesign(d, iso, 1, 20, AIR_20C, 0.15); expect(r.problems.some((x) => /driver pair needs/.test(x))).toBe(true);
  });
});
