// Unified lumped electro-mechano-acoustic model (research_c §6). Sealed and vented boxes; infinite baffle when Vb = 0.
import { Air, AIR_20C, P_REF } from "./air";
import { C, abs, add, arg, c, div, inv, mul, par, scale, sub } from "./complex";
import { FullParams } from "./driver";
import { butterHP, Cabin, cabinGainDb } from "./filters";

export interface PortSpec { Sv: number; Leff: number } // total area m², effective length m
export interface BoxSpec {
  kind: "sealed" | "vented" | "infinite" | "passive";
  Vb: number;            // net acoustic volume per driver, m³ (fill already applied)
  port?: PortSpec;       // per driver share
  QL?: number;           // leakage loss, default 7 for vented, 100 for sealed
  QP?: number;           // port loss, default 100 (vented only)
  QA?: number;           // absorption loss (resistance in series with the box compliance, Small 1973's QA); undefined = none
  pr?: { Map: number; Cap: number; Rap: number; S: number }; // passive radiators of this driver's share (engine/passive.ts prBranch); kind "passive"
}
export interface Drive { Vrms: number; Rs?: number; hpHz?: number; hpOrder?: number; cabin?: Cabin; count?: number }

export interface SimResult {
  f: number[]; spl: number[]; xmm: number[]; vport: number[]; zmag: number[]; zph: number[]; gdMs: number[];
  xpr?: number[]; // passive box: peak travel of one passive radiator, mm
  refSpl: number; air: Air;
}

export function freqs(fmin = 10, fmax = 500, perOct = 48): number[] {
  const out: number[] = [];
  const n = Math.ceil(Math.log2(fmax / fmin) * perOct);
  for (let i = 0; i <= n; i++) out.push(fmin * 2 ** (i / perOct));
  return out;
}

/** Simulate one driver in its box share; count N identical drivers each with own share → SPL +20·log10(N). */
export function simulate(d: FullParams, box: BoxSpec, drive: Drive, air: Air = AIR_20C, fs = freqs()): SimResult {
  const rc2 = air.rho * air.c * air.c;
  const N = Math.max(1, drive.count ?? 1);
  const Rs = drive.Rs ?? 0;
  const CAB = box.Vb / rc2;
  const out: SimResult = { f: fs, spl: [], xmm: [], vport: [], zmag: [], zph: [], gdMs: [], refSpl: 0, air };
  const phases: number[] = [];
  let wb = 0;
  if (box.kind === "vented" && box.port) wb = 1 / Math.sqrt((air.rho * box.port.Leff / box.port.Sv) * CAB);
  if (box.kind === "passive" && box.pr) { wb = 1 / Math.sqrt(box.pr.Map * (box.pr.Cap * CAB) / (box.pr.Cap + CAB)); out.xpr = []; }
  for (const f of fs) {
    const w = 2 * Math.PI * f;
    const jw = c(0, w);
    // Acoustic load behind the cone (Pa·s/m³), and port branch
    let Zab: C | null = null; let Zport: C | null = null; let RALv = Infinity;
    if (box.kind === "sealed") {
      const QL = box.QL ?? 100;
      const Zc = inv(mul(jw, c(CAB)));
      const wc = 2 * Math.PI * d.fs * Math.sqrt(1 + d.Vas / box.Vb); // box resonance, for the leakage-Q definition
      const RAL = QL / (wc * CAB); RALv = RAL;
      const RAB = box.QA ? 1 / (box.QA * wc * CAB) : 0;
      Zab = par(add(Zc, c(RAB)), c(RAL));
    } else if (box.kind === "vented" && box.port) {
      const MAP = (air.rho * box.port.Leff) / box.port.Sv;
      const QL = box.QL ?? 7, QP = box.QP ?? 100;
      const RAL = QL / (wb * CAB), RAP = 1 / (QP * wb * CAB); RALv = RAL;
      Zport = add(mul(jw, c(MAP)), c(RAP));
      const RAB = box.QA ? 1 / (box.QA * wb * CAB) : 0;
      Zab = par(add(inv(mul(jw, c(CAB))), c(RAB)), c(RAL), Zport);
    } else if (box.kind === "passive" && box.pr) {
      // passive radiator branch (Small 1974): mass + loss + its own suspension compliance, from the box to the outside
      const QL = box.QL ?? 7; const RAL = QL / (wb * CAB); RALv = RAL;
      Zport = add(add(mul(jw, c(box.pr.Map)), c(box.pr.Rap)), inv(mul(jw, c(box.pr.Cap))));
      const RAB = box.QA ? 1 / (box.QA * wb * CAB) : 0;
      Zab = par(add(inv(mul(jw, c(CAB))), c(RAB)), c(RAL), Zport);
    }
    // Mechanical impedance
    let Zm = add(add(mul(jw, c(d.Mms)), c(d.Rms)), inv(mul(jw, c(d.Cms))));
    if (Zab) Zm = add(Zm, scale(Zab, d.Sd * d.Sd));
    const Ze = add(add(c(d.Re + Rs), mul(jw, c(d.Le))), div(c(d.Bl * d.Bl), Zm));
    const hp = drive.hpHz ? butterHP(f, drive.hpHz, drive.hpOrder ?? 2) : c(1);
    const V = scale(hp, drive.Vrms);
    const i = div(V, Ze);
    const u = div(scale(i, d.Bl), Zm); // cone velocity (rms, complex)
    const Ucone = scale(u, d.Sd);
    let Unet = Ucone; let Uport = c(0);
    if (Zab && !Zport && isFinite(RALv)) {
      const pb = scale(mul(Ucone, Zab), -1);
      Unet = add(Ucone, div(pb, c(RALv))); // sealed-box leak radiates too
    }
    if (Zab && Zport) {
      const pb = scale(mul(Ucone, Zab), -1); // box pressure when cone moves out
      Uport = div(pb, Zport);                 // outward flow through port
      const Uleak = div(pb, c(RALv));         // leakage flow also leaves the box and radiates (Small's U0 = UD + UP + UL)
      Unet = add(add(Ucone, Uport), Uleak);
    }
    const p = scale(mul(jw, Unet), air.rho / (2 * Math.PI)); // half-space, 1 m
    const pN = scale(p, N);
    const g = cabinGainDb(f, drive.cabin);
    out.spl.push(20 * Math.log10(abs(pN) / P_REF + 1e-30) + g);
    out.xmm.push(Math.SQRT2 * abs(div(u, jw)) * 1000);
    out.vport.push(box.port && box.kind === "vented" ? (Math.SQRT2 * abs(Uport)) / box.port.Sv : 0);
    if (out.xpr && box.pr) out.xpr.push(Math.SQRT2 * abs(div(Uport, jw)) / box.pr.S * 1000);
    const Zin = add(Ze, c(-Rs));
    out.zmag.push(abs(Zin)); // per driver (wiring of several drivers is shown separately)
    out.zph.push((arg(Zin) * 180) / Math.PI);
    phases.push(arg(pN));
  }
  // group delay
  const ph = unwrap(phases);
  for (let k = 0; k < fs.length; k++) {
    const a = Math.max(0, k - 1), b = Math.min(fs.length - 1, k + 1);
    const dw = 2 * Math.PI * (fs[b] - fs[a]);
    out.gdMs.push((-(ph[b] - ph[a]) / dw) * 1000);
  }
  // reference: theoretical passband SPL for this drive (η0 at the electrical power into Re), N drivers
  const P = (drive.Vrms * drive.Vrms) / (d.Re + Rs) * (d.Re / (d.Re + Rs));
  // Half-space 1 m: I = η0·P/(2π r²), p² = ρc·I. (The textbook 112.02 dB constant assumes ρc ≈ 407; computing it keeps the model and reference on the same air.)
  out.refSpl = 10 * Math.log10((d.eta0 * P * air.rho * air.c) / (2 * Math.PI) / (P_REF * P_REF)) + 20 * Math.log10(N);
  return out;
}

function unwrap(p: number[]): number[] {
  const o = p.slice();
  for (let i = 1; i < o.length; i++) {
    let d = o[i] - o[i - 1];
    while (d > Math.PI) { o[i] -= 2 * Math.PI; d -= 2 * Math.PI; }
    while (d < -Math.PI) { o[i] += 2 * Math.PI; d += 2 * Math.PI; }
  }
  return o;
}

export interface Summary { f3: number; peakDb: number; peakHz: number; maxXmm: number; maxXHz: number; xOverBelow?: number; maxVport: number; maxVportHz: number; gdAtLowMs: number; minZ: number }
/** Metrics over the bass range. f3 is the highest f below the passband where SPL first falls 3 dB under refSpl (cabin gain excluded via refSpl only if not enabled). */
export function summarise(r: SimResult, d: FullParams, fmaxBass = 200): Summary {
  let peakDb = -1e9, peakHz = 0, maxX = 0, maxXHz = 0, maxV = 0, maxVHz = 0, minZ = 1e9;
  let xUpper: number | undefined; // highest f in the bass range where x > Xmax: over-excursion at and below about this frequency
  for (let k = 0; k < r.f.length && r.f[k] <= fmaxBass; k++) {
    const f = r.f[k];
    const rel = r.spl[k] - r.refSpl;
    if (rel > peakDb) { peakDb = rel; peakHz = f; }
    if (r.xmm[k] > maxX) { maxX = r.xmm[k]; maxXHz = f; }
    if (r.vport[k] > maxV) { maxV = r.vport[k]; maxVHz = f; }
    if (r.zmag[k] < minZ) minZ = r.zmag[k];
    if (d.Xmax > 0 && r.xmm[k] > d.Xmax * 1000) xUpper = f;
  }
  // f3: scanning down from the top of the range, the first crossing of refSpl − 3 dB (log-interpolated)
  let f3 = r.f[0];
  for (let k = r.f.length - 1; k > 0; k--) {
    if (r.f[k] > fmaxBass * 2) continue;
    if (r.spl[k - 1] < r.refSpl - 3 && r.spl[k] >= r.refSpl - 3) {
      const t = (r.refSpl - 3 - r.spl[k - 1]) / (r.spl[k] - r.spl[k - 1]);
      f3 = r.f[k - 1] * (r.f[k] / r.f[k - 1]) ** t; break;
    }
  }
  const kLow = Math.max(0, r.f.findIndex((f) => f >= f3));
  return { f3, peakDb, peakHz, maxXmm: maxX, maxXHz, xOverBelow: xUpper, maxVport: maxV, maxVportHz: maxVHz, gdAtLowMs: r.gdMs[kLow], minZ };
}
