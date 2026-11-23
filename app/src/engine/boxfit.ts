// Fit the box of an existing system to a measured "driver in box" impedance sweep: least squares on ln|Z| with the same lumped
// model the app uses everywhere (model.ts), the driver's T/S held fixed. Free parameters: net volume per driver Vb, tuning fb
// (vented), the loss Qs QL (leakage), QA (absorption, optional) and QP (port, vented), and an optional Re offset (coil temperature,
// lead resistance). Box loss Q definitions after Small 1973 (vented) as used in research_c §3/§6.
import { Air, AIR_20C } from "./air";
import { FullParams } from "./driver";
import { BoxSpec, freqs, simulate } from "./model";
import { boxFromPeaks, BoxFromPeaks, Curve, interpLog } from "./measure";

export interface FitOptions { fitQL?: boolean; fitQA?: boolean; fitQP?: boolean; fitRe?: boolean; start?: { Vb?: number; fb?: number } }
export interface BoxFit {
  kind: "sealed" | "vented"; VbPer: number; fb?: number; QL: number; QA?: number; QP?: number; dRe: number;
  rmsPct: number; band: [number, number]; peaks: BoxFromPeaks; model: { f: number[]; zmag: number[] }; notes: string[]; evals: number;
}

/** Nelder-Mead simplex minimiser (small, dependency free). */
export function nelderMead(fn: (x: number[]) => number, x0: number[], step: number[], maxEval = 1500, tol = 1e-10): { x: number[]; f: number; n: number } {
  const n = x0.length; let evals = 0; const F = (x: number[]) => { evals++; const v = fn(x); return isFinite(v) ? v : 1e30; };
  let S = [x0.slice(), ...x0.map((_, i) => { const x = x0.slice(); x[i] += step[i]; return x; })].map((x) => ({ x, f: F(x) }));
  while (evals < maxEval) {
    S.sort((a, b) => a.f - b.f);
    if (Math.abs(S[n].f - S[0].f) <= tol * (Math.abs(S[0].f) + 1e-20)) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i].x[j] / n;
    const at = (t: number) => c.map((cj, j) => cj + t * (S[n].x[j] - cj));
    const r = at(-1); const fr = F(r);
    if (fr < S[0].f) { const e = at(-2); const fe = F(e); S[n] = fe < fr ? { x: e, f: fe } : { x: r, f: fr }; }
    else if (fr < S[n - 1].f) S[n] = { x: r, f: fr };
    else {
      const k = fr < S[n].f ? at(-0.5) : at(0.5); const fk = F(k);
      if (fk < Math.min(fr, S[n].f)) S[n] = { x: k, f: fk };
      else S = S.map((p, i) => (i === 0 ? p : (() => { const x = p.x.map((v, j) => S[0].x[j] + 0.5 * (v - S[0].x[j])); return { x, f: F(x) }; })()));
    }
  }
  S.sort((a, b) => a.f - b.f); return { x: S[0].x, f: S[0].f, n: evals };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Fit. `d` = the driver (already converted to the coil wiring used in the sweep); `Sv` = port area per driver (m², vented only). */
export function fitBox(d: FullParams, kind: "sealed" | "vented", meas: Curve, Sv: number | undefined, opt: FitOptions = {}, air: Air = AIR_20C): BoxFit {
  const notes: string[] = [];
  const pk = boxFromPeaks(meas, { fs: d.fs, Vas: d.Vas, Re: d.Re });
  notes.push(...pk.notes);
  let k = kind;
  if (kind === "vented" && pk.kind === "sealed") notes.push("The project says ported, but the sweep shows one peak: is the port blocked? Fitted as ported anyway; compare with a sealed fit.");
  if (kind === "sealed" && pk.kind === "vented") notes.push("The project says sealed, but the sweep shows two peaks (a port or a big leak?). Fitted as sealed anyway.");
  if (k === "vented" && !(Sv && Sv > 0)) { notes.push("No port area known: fitted as sealed."); k = "sealed"; }
  // band around the resonances
  const f0 = meas.f[0], f1 = meas.f[meas.f.length - 1];
  const lo = k === "vented" && pk.fL ? pk.fL / 2.5 : (pk.fc ?? pk.peaks[0]?.f ?? d.fs * 1.5) / 3;
  const hi = k === "vented" && pk.fH ? pk.fH * 2.5 : (pk.fc ?? pk.peaks[0]?.f ?? d.fs * 1.5) * 3;
  const band: [number, number] = [Math.max(f0, lo, 5), Math.min(f1, hi, 400)];
  if (!(band[1] > band[0] * 1.5)) throw new Error(`The sweep (${f0.toFixed(1)}-${f1.toFixed(1)} Hz) does not cover the box resonances: sweep from about 5 Hz to at least 300 Hz.`);
  const F = freqs(band[0], band[1], 48).filter((x) => x <= band[1]);
  const lnMeas = F.map((x) => Math.log(interpLog(meas.f, meas.mag, x)));
  // parameter vector: [ln Vb, ln fb?, ln QL?, ln QA?, ln QP?, dRe?]
  const VbStart = clamp(opt.start?.Vb && opt.start.Vb > 0 ? opt.start.Vb : pk.Vb && pk.Vb > 0 ? pk.Vb : d.Vas, d.Vas / 50, d.Vas * 20);
  const fbStart = opt.start?.fb && opt.start.fb > 0 ? opt.start.fb : pk.fb && pk.fb > 0 ? pk.fb : d.fs;
  const fitQL = opt.fitQL ?? true, fitQA = opt.fitQA ?? false, fitQP = opt.fitQP ?? (k === "vented"), fitRe = opt.fitRe ?? true;
  const names: string[] = ["Vb"]; const x0: number[] = [Math.log(VbStart)]; const st: number[] = [0.3];
  if (k === "vented") { names.push("fb"); x0.push(Math.log(fbStart)); st.push(0.1); }
  if (fitQL) { names.push("QL"); x0.push(Math.log(k === "vented" ? 7 : 15)); st.push(0.7); }
  if (fitQA) { names.push("QA"); x0.push(Math.log(30)); st.push(0.7); }
  if (fitQP && k === "vented") { names.push("QP"); x0.push(Math.log(50)); st.push(0.7); }
  if (fitRe) { names.push("dRe"); x0.push(0); st.push(0.05 * d.Re); }
  const unpack = (x: number[]) => {
    const v: Record<string, number> = {}; names.forEach((nm, i) => (v[nm] = x[i]));
    return {
      Vb: Math.exp(clamp(v.Vb, Math.log(d.Vas / 100), Math.log(d.Vas * 50))), fb: v.fb !== undefined ? Math.exp(clamp(v.fb, Math.log(3), Math.log(300))) : undefined,
      QL: v.QL !== undefined ? Math.exp(clamp(v.QL, 0, Math.log(300))) : k === "vented" ? 7 : 100,
      QA: v.QA !== undefined ? Math.exp(clamp(v.QA, 0, Math.log(300))) : undefined,
      QP: v.QP !== undefined ? Math.exp(clamp(v.QP, Math.log(2), Math.log(500))) : k === "vented" ? 100 : undefined,
      dRe: v.dRe !== undefined ? clamp(v.dRe, -0.3 * d.Re, 0.5 * d.Re) : 0,
    };
  };
  const spec = (u: ReturnType<typeof unpack>): BoxSpec => {
    if (k === "vented") { const Leff = (air.c ** 2 * Sv!) / (4 * Math.PI ** 2 * u.fb! * u.fb! * u.Vb); return { kind: "vented", Vb: u.Vb, port: { Sv: Sv!, Leff }, QL: u.QL, QA: u.QA, QP: u.QP }; }
    return { kind: "sealed", Vb: u.Vb, QL: u.QL, QA: u.QA };
  };
  const zOf = (u: ReturnType<typeof unpack>, fs = F) => simulate({ ...d, Re: d.Re + u.dRe }, spec(u), { Vrms: 1 }, air, fs).zmag;
  const cost = (x: number[]) => { const z = zOf(unpack(x)); let s = 0, n = 0; for (let i = 0; i < F.length; i++) if (isFinite(lnMeas[i])) { const e = Math.log(z[i]) - lnMeas[i]; s += e * e; n++; } return s / Math.max(1, n); };
  // two starts (peak read-out, and volume ×1.5 / ×0.67 around it); keep the best, then polish
  let best = nelderMead(cost, x0, st, 1500); let evals = best.n;
  for (const m of [1.6, 0.6]) { const x = x0.slice(); x[0] += Math.log(m); const r = nelderMead(cost, x, st, 1500); evals += r.n; if (r.f < best.f) best = r; }
  const pol = nelderMead(cost, best.x, st.map((s) => s * 0.1), 1500); evals += pol.n; if (pol.f < best.f) best = pol;
  const u = unpack(best.x);
  const rmsPct = (Math.exp(Math.sqrt(best.f)) - 1) * 100;
  if (rmsPct > 10) notes.push(`The model matches the measurement only to ${rmsPct.toFixed(0)} % rms: the driver's T/S values are probably off (a free-air sweep gives the real ones), or the sweep is noisy / the coil wiring is set wrong.`);
  if (Math.abs(u.dRe) > 0.1 * d.Re) notes.push(`The fit needed Re ${u.dRe > 0 ? "+" : ""}${u.dRe.toFixed(2)} Ω: check the coil wiring setting, lead resistance and the jig calibration.`);
  if (fitQL && u.QL < 3) notes.push(`QL ${u.QL.toFixed(1)} is very low: a big air leak (driver gasket, terminal cup, seams) or lots of fill. Seal the box and measure again.`);
  const fm = freqs(Math.max(5, meas.f[0]), Math.min(400, meas.f[meas.f.length - 1]), 48);
  return { kind: k, VbPer: u.Vb, fb: u.fb, QL: u.QL, QA: u.QA, QP: u.QP, dRe: u.dRe, rmsPct, band, peaks: pk, model: { f: fm, zmag: zOf(u, fm) }, notes, evals };
}
