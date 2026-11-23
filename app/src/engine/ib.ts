// Infinite baffle (IB) in a car (B2_SECTIONS, R37), from references/research_h_ib_door_home_pc.md section 1.7 and section 4.
// Trunk IB: the drivers sit on a sealed baffle between the boot and the cabin; the boot air is the rear load and the closed
// cabin is the front load. True IB: the drivers breathe to the outside (through the floor / spare-wheel well), so the rear load
// is infinite and the cabin is the only air the cone works into. Free air: no rear and no front load (a door, a rear deck in a
// very leaky car): the driver's own fs / Qts high-pass.
// Closed-box maths (research_c section 2): alpha = N*Vas/V_rear (+ N*Vas/V_cabin for the cabin front load), fc = fs*sqrt(1+alpha),
// Qtc = Qts*sqrt(1+alpha). Lumped model (research_c section 6): per driver, Zm = Zms + N*Sd^2*(Zs || ZL), Zs = rear + cabin
// compliance impedances in series, ZL = the leak between boot and cabin (acoustic mass rho*Leff/A, Leff = t + 1.7*sqrt(A/pi),
// two flanged ends; plus a loss resistance at Q_LEAK, our assumption). Cabin pressure below the first cabin mode:
// p = rho*c^2*Sd*x/V_cabin (adiabatic gas law, research_h 1.7 item 4). All SI unless named otherwise.
import { Air, AIR_20C, P_REF } from "./air";
import { C, abs, add, c, div, inv, mul, scale } from "./complex";
import { FullParams } from "./driver";
import { sealed, sealedF3 } from "./alignments";
import { butterHP, Cabin, cabinGainDb } from "./filters";
import { freqs } from "./model";

export type IBMode = "trunk" | "true" | "free";
export interface IBConfig {
  mode: IBMode;
  n: number;            // drivers on the baffle, all driven alike
  Vrear?: number;       // m3, boot air (trunk IB); ignored for true IB / free air (infinite)
  Vcabin?: number;      // m3, cabin air; used when cabinLoad
  cabinLoad: boolean;   // count the closed cabin as a front load (research_h 1.7 item 4)
  leakA?: number;       // m2, total leak area between boot and cabin (trunk IB only)
  leakT?: number;       // m, leak thickness (baffle / seal thickness)
}
export interface IBDrive { Vrms: number; hpHz?: number; hpOrder?: number; cabin?: Cabin }

/** Loss of the leak branch (Q at its tuning): our assumption, so the leak resonance is not an infinite spike. Approximate. */
export const Q_LEAK = 5;
/** End correction of a gap with two flanged ends (research_h 1.7 item 5: 0.85 r per end, 1.7 r for both). */
export const leakLeff = (A: number, t: number) => t + 1.7 * Math.sqrt(A / Math.PI);

export interface IBAlign { alphaRear: number; alphaCabin: number; alpha: number; fc: number; Qtc: number; f3: number }
/** Closed-box figures for N drivers with rear volume Vrear and (optionally) the cabin as a front load. Infinity = no load. */
export function ibAlignment(fs: number, Qts: number, Vas: number, n: number, Vrear = Infinity, Vcabin = Infinity): IBAlign {
  const alphaRear = isFinite(Vrear) && Vrear > 0 ? (n * Vas) / Vrear : 0;
  const alphaCabin = isFinite(Vcabin) && Vcabin > 0 ? (n * Vas) / Vcabin : 0;
  const alpha = alphaRear + alphaCabin;
  const fc = fs * Math.sqrt(1 + alpha), Qtc = Qts * Math.sqrt(1 + alpha);
  return { alphaRear, alphaCabin, alpha, fc, Qtc, f3: sealedF3(fc, Qtc) };
}
/** Same as research_c's sealed(): N drivers in one volume = one driver with N*Vas (research_h 1.7 item 2). */
export const ibSealed = (fs: number, Qts: number, Vas: number, n: number, Vb: number) => sealed(fs, Qts, n * Vas, Vb);

/** Tuning of the leak between boot and cabin: the gap is a port between the two air volumes (research_h 1.7 item 5). */
export function leakTuning(A: number, t: number, Vboot: number, Vcabin: number, cAir = 343.2): { fLeak: number; Leff: number; Veff: number } {
  const Leff = leakLeff(A, t);
  const Veff = 1 / ((isFinite(Vboot) && Vboot > 0 ? 1 / Vboot : 0) + (isFinite(Vcabin) && Vcabin > 0 ? 1 / Vcabin : 0));
  const fLeak = A > 0 && isFinite(Veff) ? (cAir / (2 * Math.PI)) * Math.sqrt(A / (Veff * Leff)) : 0;
  return { fLeak, Leff, Veff };
}

/** Peak cabin pressure (Pa) and level (dB re 20 uPa, from the PEAK pressure) when N cones move x (peak, m) in a closed cabin. */
export function cabinPressure(sdTotal: number, xPeak: number, Vcabin: number, air: Air = AIR_20C): { pPeak: number; dbPeak: number; dbRms: number } {
  const pPeak = (air.rho * air.c * air.c * sdTotal * xPeak) / Vcabin;
  const dbPeak = 20 * Math.log10(pPeak / P_REF);
  return { pPeak, dbPeak, dbRms: dbPeak - 20 * Math.log10(Math.SQRT2) };
}

export interface IBSim {
  f: number[];
  free: number[];        // dB, half space 1 m, all N drivers (net volume velocity: cone minus leak)
  inCar: number[];       // dB, free field + the app's empirical cabin gain (only if drive.cabin is given), else = free
  cabinDb: number[];     // dB rms, pressure-field cabin level (cabin load on and cabin volume known), else []
  xmm: number[];         // peak cone travel, mm
  zmag: number[];        // ohm, one driver
  powerW: number[];      // W drawn by all N drivers (real part of V^2/Z)
  refSpl: number;
}
const sum = (a: C, b: C) => add(a, b);
/** Lumped simulation of an IB system (per driver, N alike). */
export function simulateIB(d: FullParams, cfg: IBConfig, drive: IBDrive, air: Air = AIR_20C, fs = freqs(10, 500, 48)): IBSim {
  const rc2 = air.rho * air.c * air.c; const N = Math.max(1, Math.round(cfg.n));
  const rear = cfg.mode === "trunk" && cfg.Vrear && cfg.Vrear > 0 ? cfg.Vrear / rc2 : Infinity;      // acoustic compliance
  const cab = cfg.mode !== "free" && cfg.cabinLoad && cfg.Vcabin && cfg.Vcabin > 0 ? cfg.Vcabin / rc2 : Infinity;
  const leakOn = cfg.mode === "trunk" && (cfg.leakA ?? 0) > 0 && isFinite(rear);
  const ML = leakOn ? (air.rho * leakLeff(cfg.leakA!, cfg.leakT ?? 0.02)) / cfg.leakA! : 0;
  const Ceff = 1 / ((isFinite(rear) ? 1 / rear : 0) + (isFinite(cab) ? 1 / cab : 0));
  const wL = leakOn && isFinite(Ceff) ? 1 / Math.sqrt(ML * Ceff) : 0;
  const RL = leakOn ? (wL * ML) / Q_LEAK : 0;
  const out: IBSim = { f: fs, free: [], inCar: [], cabinDb: [], xmm: [], zmag: [], powerW: [], refSpl: 0 };
  for (const f of fs) {
    const w = 2 * Math.PI * f; const jw = c(0, w);
    let Zs: C | null = null; // series compliance impedance of rear + cabin
    if (isFinite(rear)) Zs = inv(mul(jw, c(rear)));
    if (isFinite(cab)) { const z = inv(mul(jw, c(cab))); Zs = Zs ? sum(Zs, z) : z; }
    let Zload: C | null = Zs; let leakShare: C = c(0); // fraction of the cone flow that goes back through the leak
    if (Zs && leakOn) { const ZL = add(c(RL), mul(jw, c(ML))); const den = add(Zs, ZL); Zload = div(mul(Zs, ZL), den); leakShare = div(Zs, den); }
    let Zm = add(add(mul(jw, c(d.Mms)), c(d.Rms)), inv(mul(jw, c(d.Cms))));
    if (Zload) Zm = add(Zm, scale(Zload, N * d.Sd * d.Sd));
    const Ze = add(add(c(d.Re), mul(jw, c(d.Le))), div(c(d.Bl * d.Bl), Zm));
    const hp = drive.hpHz ? butterHP(f, drive.hpHz, drive.hpOrder ?? 4) : c(1);
    const V = scale(hp, drive.Vrms); const i = div(V, Ze); const u = div(scale(i, d.Bl), Zm);
    const U = scale(u, N * d.Sd); const Unet = mul(U, add(c(1), scale(leakShare, -1)));
    const p = scale(mul(jw, Unet), air.rho / (2 * Math.PI));
    const free = 20 * Math.log10(abs(p) / P_REF + 1e-30);
    out.free.push(free); out.inCar.push(free + cabinGainDb(f, drive.cabin));
    if (isFinite(cab)) { // cabin pressure: net flow into the cabin over the cabin compliance
      const pc = div(Unet, mul(jw, c(cab)));
      out.cabinDb.push(20 * Math.log10(abs(pc) / P_REF + 1e-30));
    }
    out.xmm.push(Math.SQRT2 * abs(div(u, jw)) * 1000);
    out.zmag.push(abs(Ze));
    const y = inv(Ze); const vv = abs(V) ** 2; out.powerW.push(N * vv * y.re);
  }
  out.refSpl = 10 * Math.log10((d.eta0 * (drive.Vrms ** 2 / d.Re) * air.rho * air.c) / (2 * Math.PI) / (P_REF * P_REF)) + 20 * Math.log10(N);
  return out;
}

/** Lowest 4th-order Butterworth high-pass (whole Hz) that keeps the cone within Xmax at this drive, 0 = none needed,
 * NaN = even maxHz is not enough (research_c part 2, 2.4). */
export function ibSubsonic(d: FullParams, cfg: IBConfig, drive: IBDrive, air: Air = AIR_20C, maxHz = 80): number {
  if (!(d.Xmax > 0)) return NaN;
  const F = freqs(5, Math.max(300, maxHz * 4), 24); const xm = d.Xmax * 1000;
  const maxX = (hp?: number) => Math.max(...simulateIB(d, cfg, { ...drive, hpHz: hp, hpOrder: 4, cabin: undefined }, air, F).xmm);
  if (maxX() <= xm) return 0;
  if (maxX(maxHz) > xm) return NaN;
  let lo = 3, hi = maxHz;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (maxX(m) > xm) lo = m; else hi = m; }
  return Math.ceil(hi);
}

/** Displacement-limited SPL (dB, half space 1 m, N drivers) at f when every cone moves Xmax (peak): U = w*N*Sd*Xmax. */
export function xmaxSplFree(d: FullParams, n: number, f: number, air: Air = AIR_20C): number {
  const Upk = 2 * Math.PI * f * n * d.Sd * d.Xmax; const pRms = (air.rho * 2 * Math.PI * f * Upk) / (2 * Math.PI) / Math.SQRT2;
  return 20 * Math.log10(pRms / P_REF + 1e-30);
}

// ---------- driver suitability (cited guides, shown as notes, not hard rules: research_h 1.4 and section 4 item 3) ----------
export type Verdict = "pass" | "fail" | "unknown" | "info";
export interface Rule { id: string; who: string; rule: string; value: string; verdict: Verdict; source: string }
export const SRC_PS_Y6 = "PS Sound, \"Possibly The Best IB subwoofers?\" (YouTube, 2020-07-24) 10:11-11:23: https://www.youtube.com/watch?v=by80YowQDIQ";
export const SRC_PS_Y9 = "PS Sound, \"How Much Power IB Subwoofer Need/Draw\" (YouTube, 2021-03-04) 15:30: https://www.youtube.com/watch?v=HIFdf4eQxQw";
export const SRC_MTX = "MTX knowledge base, Mobile audio subwoofer enclosure design: https://help.mtx.com/knowledge-base/mobile-audio-subwoofer-enclosure-design";
export const SRC_LUCAS = "A. Lucas (Eminence), \"More Speaker Parameters Explained\", Premier Guitar, 2007-05-14: https://www.premierguitar.com/more-speaker-parameters-explained";
/** Which cited rule each driver passes. fs, Qts, Vas, Sd in SI as published (undefined = not published). */
export function ibRules(p: { fs?: number; Qts?: number; Vas?: number; Sd?: number; Le?: number; Mms?: number; Xmax?: number; sens1W?: number }, n: number, Vrear?: number): Rule[] {
  const f = (v: number, k = 2) => v.toFixed(k);
  const r: Rule[] = [];
  const q = p.Qts;
  r.push({ id: "fs", who: "PS Sound", rule: "Fs as low as possible, \"to 20 if not below\"", value: p.fs ? `${f(p.fs, 1)} Hz` : "not published", verdict: p.fs ? (p.fs <= 21 ? "pass" : p.fs <= 25 ? "info" : "fail") : "unknown", source: SRC_PS_Y6 });
  r.push({ id: "qts", who: "PS Sound", rule: "Qts \"anything above 0.5\", up to about 0.7 (depends on trunk or true IB and the car's air space)", value: q !== undefined ? f(q) : "not published", verdict: q === undefined ? "unknown" : q >= 0.5 && q <= 0.75 ? "pass" : "fail", source: SRC_PS_Y6 });
  r.push({ id: "sd", who: "PS Sound", rule: "Cone area \"is king\" (and you need excursion as well)", value: p.Sd ? `${f(p.Sd * 1e4 * n, 0)} cm² in all (${n} × ${f(p.Sd * 1e4, 0)} cm²)${p.Xmax ? `, Xmax ${f(p.Xmax * 1000, 1)} mm` : ""}` : "not published", verdict: p.Sd ? "info" : "unknown", source: SRC_PS_Y9 });
  r.push({ id: "le", who: "PS Sound", rule: "Low inductance, low moving mass, high sensitivity", value: [p.Le ? `Le ${f(p.Le * 1000, 2)} mH` : "Le not published", p.Mms ? `Mms ${f(p.Mms * 1000, 0)} g` : "Mms not published", p.sens1W ? `${f(p.sens1W, 1)} dB 1 W` : "sensitivity not published"].join(", "), verdict: "info", source: SRC_PS_Y6 });
  r.push({ id: "mtx-qts", who: "MTX", rule: "Qts greater than 0.6", value: q !== undefined ? f(q) : "not published", verdict: q === undefined ? "unknown" : q > 0.6 ? "pass" : "fail", source: SRC_MTX });
  if (Vrear && isFinite(Vrear)) r.push({ id: "mtx-vas", who: "MTX", rule: "Vas lower than the volume available (all drivers together)", value: p.Vas ? `${f(p.Vas * 1000 * n, 0)} L vs ${f(Vrear * 1000, 0)} L` : "not published", verdict: p.Vas ? (p.Vas * n < Vrear ? "pass" : "fail") : "unknown", source: SRC_MTX });
  r.push({ id: "lucas", who: "Lucas (Eminence)", rule: "Qts 0.7 or above suits free air / infinite baffle (0.4 to 0.7: sealed)", value: q !== undefined ? f(q) : "not published", verdict: q === undefined ? "unknown" : q >= 0.7 ? "pass" : "fail", source: SRC_LUCAS });
  return r;
}
/** One plain-words verdict from PS Sound's three rules (fs, Qts, cone area). */
export function ibVerdict(p: { fs?: number; Qts?: number; Sd?: number }, n: number): { level: "ok" | "warn" | "bad"; text: string } {
  if (p.fs === undefined || p.Qts === undefined) return { level: "warn", text: "Fs or Qts is not published: cannot check this driver against PS Sound's rules." };
  const lowFs = p.fs <= 21, okQ = p.Qts >= 0.5 && p.Qts <= 0.75;
  const area = p.Sd ? ` Cone area ${(p.Sd * 1e4 * n).toFixed(0)} cm² in all: more is better ("cone area is king").` : "";
  if (lowFs && okQ) return { level: "ok", text: `Suits IB by PS Sound's rules: Fs ${p.fs.toFixed(1)} Hz (about 20 Hz or below) and Qts ${p.Qts.toFixed(2)} (above 0.5, up to about 0.7).${area}` };
  const why = [!lowFs ? `Fs ${p.fs.toFixed(1)} Hz is above about 20 Hz` : "", !okQ ? `Qts ${p.Qts.toFixed(2)} is ${p.Qts < 0.5 ? "below 0.5 (a driver made for a box)" : "above about 0.7"}` : ""].filter(Boolean).join("; ");
  return { level: !okQ && p.Qts < 0.45 ? "bad" : "warn", text: `Not a typical IB driver by PS Sound's rules: ${why}.${area}` };
}

/** Plain words for the leak: share of the cone area and what it does. */
export function leakWords(fLeak: number, A: number, sdTotal: number): { level: "ok" | "warn" | "bad"; text: string } {
  const pct = (A / sdTotal) * 100;
  if (!(A > 0)) return { level: "ok", text: "No leak entered: the baffle is taken as fully sealed." };
  const base = `Leak ${(A * 1e4).toFixed(0)} cm² = ${pct.toFixed(1)} % of the cone area; it tunes with the boot and cabin air at about ${fLeak.toFixed(1)} Hz. Below that the front and back waves meet through the gap and the bass falls away.`;
  if (fLeak > 30) return { level: "bad", text: base + " That is above 30 Hz: seal the baffle edges and the parcel shelf." };
  if (fLeak > 20) return { level: "warn", text: base + " That is above about 20 Hz, so the deep bass IB is chosen for is lost: seal more." };
  return { level: "ok", text: base + " Below about 20 Hz this costs little." };
}
