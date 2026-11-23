// Measured impedance curves: peak finding, Thiele/Small extraction (free air + added mass or known box), dual voice coil wiring.
// Formula sources (the primary AES papers are paywalled; what was read is named in each case):
// - Impedance (Small's) method: Re, Zmax at fs, r0 = Zmax/Re, f1 and f2 where |Z| = sqrt(r0)·Re, fs = sqrt(f1·f2),
//   Qms = fs·sqrt(r0)/(f2 - f1), Qes = Qms/(r0 - 1), Qts = Qms·Qes/(Qms + Qes).
//   Read in: R. Elliott, "Measuring Thiele/Small loudspeaker parameters", Elliott Sound Products, https://sound-au.com/tsp.htm
//   (section 1.1, which attributes the sqrt(r0)·Re points and r0 = (Re + Res)/Re to R. H. Small, "Direct-Radiator Loudspeaker
//   System Analysis", JAES 20(5), 1972; Small's text itself was not read).
// - Added mass: Mms = m/((fs/fs')² - 1), Cms = 1/((2π·fs)²·Mms), Vas = ρc²·Sd²·Cms (same ESP page, section 3).
// - Known closed box: Vas = Vb·((fc·Qec)/(fs·Qes) - 1) (R. H. Small, "Closed-Box Loudspeaker Systems Part I: Analysis",
//   JAES 20(10), 1972, as commonly quoted; primary text not read, UNVERIFIED). The simpler Vb·((fc/fs)² - 1) (ESP section 2)
//   is the same thing when the box adds no air mass and no losses; both are reported.
// - Real-part variant [N, derived here]: with a pure-inductance coil model, Re{Z} = Re + Res/(1 + Qms²(f/fs - fs/f)²) exactly,
//   so when the file has phase the method is applied to Re{Z} and the voice-coil inductance no longer skews r0, f1 and f2.
//   On Re{Z} the half-height points (Re{Z} = Re + Res/2) are where Qms·(f/fs - fs/f) = ±1, so Qms = fs/(f2 - f1) there and
//   f1·f2 = fs². (On |Z| the sqrt(r0)·Re points are where Qms·(f/fs - fs/f) = ±sqrt(r0), which gives Small's formula above.)
// - Vented box from two impedance peaks fL < fH: fL·fH = fs·fb, fL² + fH² = fs²(1 + α) + fb² (research_c part 2 §1.1, [N]).
import { Air, AIR_20C } from "./air";

export interface Curve { f: number[]; mag: number[]; phase?: number[] }

/** Linear interpolation on log-frequency; NaN outside the curve. */
export function interpLog(f: number[], y: number[], x: number): number {
  if (x < f[0] || x > f[f.length - 1]) return NaN;
  let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m] <= x) lo = m; else hi = m; }
  if (f[hi] === f[lo]) return y[lo];
  const t = (Math.log(x) - Math.log(f[lo])) / (Math.log(f[hi]) - Math.log(f[lo]));
  return y[lo] + t * (y[hi] - y[lo]);
}
/** Light smoothing (moving average of ln|Z| over ±1/24 octave) so measurement noise does not create false peaks. */
export function smoothLog(f: number[], y: number[], frac = 1 / 24): number[] {
  const out: number[] = []; const k = 2 ** frac;
  let a = 0, b = 0, s = 0;
  for (let i = 0; i < f.length; i++) {
    while (f[a] < f[i] / k) { s -= Math.log(y[a]); a++; }
    while (b < f.length && f[b] <= f[i] * k) { s += Math.log(y[b]); b++; }
    out.push(Math.exp(s / (b - a)));
  }
  return out;
}
export interface Peak { f: number; z: number; i: number }
/** Impedance peaks (local maxima standing at least `prominence`× above the lowest point on both sides) between fmin and fmax. */
export function findPeaks(c: Curve, fmin = 5, fmax = 400, prominence = 1.15): Peak[] {
  const z = smoothLog(c.f, c.mag); const out: Peak[] = [];
  for (let i = 1; i < z.length - 1; i++) {
    if (c.f[i] < fmin || c.f[i] > fmax) continue;
    if (!(z[i] >= z[i - 1] && z[i] > z[i + 1])) continue;
    let l = z[i], r = z[i];
    for (let j = i - 1; j >= 0 && z[j] <= z[i]; j--) l = Math.min(l, z[j]);
    for (let j = i + 1; j < z.length && z[j] <= z[i]; j++) r = Math.min(r, z[j]);
    if (z[i] / Math.max(l, r) < prominence) continue;
    out.push({ f: refine(c.f, z, i), z: z[i], i });
  }
  return out;
}
/** Parabolic refinement of an extremum on a log-frequency axis. */
function refine(f: number[], y: number[], i: number): number {
  const x0 = Math.log(f[i - 1]), x1 = Math.log(f[i]), x2 = Math.log(f[i + 1]);
  const d = (y[i - 1] - 2 * y[i] + y[i + 1]);
  if (Math.abs(x2 - x1 - (x1 - x0)) > 1e-6 * Math.abs(x1) || d === 0) return f[i];
  const off = 0.5 * (y[i - 1] - y[i + 1]) / d; return Math.exp(x1 + Math.max(-1, Math.min(1, off)) * (x1 - x0));
}
/** Lowest point between two frequencies. */
export function minBetween(c: Curve, fa: number, fb: number): Peak {
  const z = smoothLog(c.f, c.mag); let best = -1;
  for (let i = 1; i < z.length - 1; i++) if (c.f[i] > fa && c.f[i] < fb && (best < 0 || z[i] < z[best])) best = i;
  if (best < 0) return { f: NaN, z: NaN, i: -1 };
  // refine on the inverted curve
  return { f: refine(c.f, z.map((v) => -v), best), z: z[best], i: best };
}

export interface BoxFromPeaks {
  kind: "vented" | "sealed" | "unclear"; peaks: Peak[]; fL?: number; fH?: number; fb?: number; fc?: number;
  alpha?: number; Vb?: number; Qtc?: number; Qec?: number; Qmc?: number; notes: string[];
}
/** Quick box read-out from the peaks (no fitting): vented → fb from the minimum between the two peaks, α and Vb from the
 *  two-resonator relations; sealed → fc, Qtc by the same impedance method as a free-air sweep. Needs the driver's fs, Vas, Re. */
export function boxFromPeaks(c: Curve, drv: { fs: number; Vas: number; Re: number }): BoxFromPeaks {
  const notes: string[] = [];
  const peaks = findPeaks(c, 5, 300).sort((a, b) => b.z - a.z).slice(0, 2).sort((a, b) => a.f - b.f);
  if (peaks.length === 2) {
    const [L, H] = peaks; const m = minBetween(c, L.f, H.f);
    const fb = m.f; const alpha = (L.f ** 2 + H.f ** 2 - fb * fb) / (drv.fs ** 2) - 1;
    notes.push(`Two peaks at ${L.f.toFixed(1)} and ${H.f.toFixed(1)} Hz with a minimum at ${fb.toFixed(1)} Hz: a ported box tuned to about ${fb.toFixed(1)} Hz (box losses move the minimum a little; the fit below accounts for them).`);
    const chk = (L.f * H.f) / (drv.fs * fb);
    if (Math.abs(chk - 1) > 0.15) notes.push(`fL·fH / (fs·fb) = ${chk.toFixed(2)} (should be about 1): the driver's fs (${drv.fs.toFixed(1)} Hz) does not match this box measurement well. The driver's published values may be off: a free-air sweep of this driver would settle it.`);
    return { kind: "vented", peaks, fL: L.f, fH: H.f, fb, alpha, Vb: alpha > 0 ? drv.Vas / alpha : NaN, notes };
  }
  if (peaks.length === 1) {
    const fc = peaks[0].f; const r = impedanceQ(c, drv.Re, fc);
    const alpha = (fc / drv.fs) ** 2 - 1;
    notes.push(`One peak at ${fc.toFixed(1)} Hz: the box behaves as sealed (or the port is blocked). Qtc from the peak width.`);
    if (alpha <= 0) notes.push(`fc is not above the driver's fs (${drv.fs.toFixed(1)} Hz): either the driver's fs is wrong or this is a free-air sweep.`);
    return { kind: "sealed", peaks, fc, alpha, Vb: alpha > 0 ? drv.Vas / alpha : NaN, Qtc: r?.Qts, Qec: r?.Qes, Qmc: r?.Qms, notes };
  }
  notes.push("No clear impedance peak between 5 and 300 Hz: check the sweep range (start at 5-10 Hz) and the jig.");
  return { kind: "unclear", peaks, notes };
}

export interface QResult { fs: number; Zmax: number; r0: number; f1: number; f2: number; Qms: number; Qes: number; Qts: number; usedReal: boolean }
/** Small's impedance method around one resonance. Uses Re{Z} if phase is given (see header), |Z| otherwise. */
export function impedanceQ(c: Curve, Re: number, fGuess?: number): QResult | undefined {
  const usedReal = !!c.phase;
  const y = c.phase ? c.mag.map((m, i) => m * Math.cos((c.phase![i] * Math.PI) / 180)) : c.mag.slice();
  // peak: highest point of the (lightly smoothed) curve near the guess, or the global maximum below 400 Hz
  const ys = smoothLog(c.f, y.map((v) => Math.max(v, 1e-6)));
  let ip = -1;
  for (let i = 0; i < c.f.length; i++) {
    if (c.f[i] > 400) break;
    if (fGuess && (c.f[i] < fGuess / 1.5 || c.f[i] > fGuess * 1.5)) continue;
    if (ip < 0 || ys[i] > ys[ip]) ip = i;
  }
  if (ip <= 0 || ip >= c.f.length - 1) return undefined;
  // peak height from the raw curve, refined with a parabola on the three highest points
  for (let k = 0; k < 4; k++) { if (ip > 1 && y[ip - 1] > y[ip]) ip--; else if (ip < c.f.length - 2 && y[ip + 1] > y[ip]) ip++; }
  const den = y[ip - 1] - 2 * y[ip] + y[ip + 1];
  const Zmax = den < 0 ? y[ip] - (y[ip - 1] - y[ip + 1]) ** 2 / (8 * den) : y[ip];
  const r0 = Zmax / Re; if (!(r0 > 1.05)) return undefined;
  const zt = usedReal ? Re + (Zmax - Re) / 2 : Math.sqrt(r0) * Re;
  const cross = (dir: -1 | 1) => { for (let i = ip; i > 0 && i < c.f.length - 1; i += dir) { const j = i + dir; if (y[j] <= zt) { const t = (y[i] - zt) / (y[i] - y[j]); return Math.exp(Math.log(c.f[i]) + t * (Math.log(c.f[j]) - Math.log(c.f[i]))); } } return NaN; };
  const f1 = cross(-1), f2 = cross(1);
  if (!isFinite(f1) || !isFinite(f2)) return undefined;
  const fs = Math.sqrt(f1 * f2);
  const Qms = usedReal ? fs / (f2 - f1) : (fs * Math.sqrt(r0)) / (f2 - f1);
  const Qes = Qms / (r0 - 1);
  return { fs, Zmax, r0, f1, f2, Qms, Qes, Qts: (Qms * Qes) / (Qms + Qes), usedReal };
}

/** Re estimate when no meter reading is given: lowest Re{Z} (phase known) or lowest |Z| above fs below 10·fs. Always a little high. */
export function estimateRe(c: Curve, fsGuess?: number): { Re: number; how: string } {
  if (c.phase) {
    let m = Infinity; for (let i = 0; i < c.f.length; i++) { if (fsGuess && c.f[i] > 10 * fsGuess) break; m = Math.min(m, c.mag[i] * Math.cos((c.phase[i] * Math.PI) / 180)); }
    return { Re: m, how: "estimated: lowest real part of the measured impedance (slightly above the true DC resistance)" };
  }
  let m = Infinity; const fsx = fsGuess ?? 0;
  for (let i = 0; i < c.f.length; i++) { if (c.f[i] < fsx) continue; if (fsGuess && c.f[i] > 10 * fsGuess) break; m = Math.min(m, c.mag[i]); }
  return { Re: m, how: "estimated: impedance minimum above fs (above the true DC resistance because of the coil inductance)" };
}

/** Le estimate from the imaginary part well above fs (pure inductance model; real coils are lossy, so it depends on frequency). */
export function estimateLe(c: Curve, q: QResult, Re: number): { Le: number; how: string } | undefined {
  const Res = Re * (q.r0 - 1); const vals: number[] = []; let fmin = Infinity, fmax = 0;
  for (let i = 0; i < c.f.length; i++) {
    const f = c.f[i]; if (f < 6 * q.fs || f > 1000) continue;
    const u = q.Qms * (f / q.fs - q.fs / f); const w = 2 * Math.PI * f;
    const motRe = Res / (1 + u * u), motIm = -Res * u / (1 + u * u);
    let im: number;
    if (c.phase) im = c.mag[i] * Math.sin((c.phase[i] * Math.PI) / 180) - motIm;
    else { const re = Re + motRe; const z2 = c.mag[i] ** 2 - re * re; if (z2 <= 0) continue; im = Math.sqrt(z2) - motIm; }
    if (im > 0) { vals.push(im / w); fmin = Math.min(fmin, f); fmax = Math.max(fmax, f); }
  }
  if (!vals.length) return undefined;
  vals.sort((a, b) => a - b);
  return { Le: vals[vals.length >> 1], how: `estimate (median over ${fmin.toFixed(0)}-${fmax.toFixed(0)} Hz, pure-inductance model, ${c.phase ? "from the phase" : "from |Z| only"})` };
}

// ---------- dual voice coil ----------
/** How the coils were connected: "single" = single-coil driver; "one" = one coil of a DVC driven, the other left OPEN. */
export type CoilWiring = "single" | "one" | "series" | "parallel";
export const WIRING_TEXT: Record<CoilWiring, string> = {
  single: "single voice coil driver", one: "dual coil: ONE coil driven, the other left open", series: "dual coil: both coils in series", parallel: "dual coil: both coils in parallel",
};
interface Elec { Re: number; Bl?: number; Le?: number; Qes: number }
/** Convert the electrical T/S values between DVC wirings, assuming two identical coils.
 *  Series: Re×2, Bl×2 of one coil; parallel: Re/2, Bl of one coil; both coils driven: Qes is the same for series and parallel
 *  and half the one-coil Qes (Bl²/Re doubles); one coil with the other open: Qes per coil. fs, Qms, Vas, Mms do not change.
 *  Le: series ≈ 4× parallel and one coil ≈ parallel ASSUMED (tightly coupled coils on one former; UNVERIFIED, measure if it matters). */
export function convertWiring(p: Elec, from: CoilWiring, to: CoilWiring): Elec {
  if (from === to || from === "single" || to === "single") return { ...p };
  // to one-coil values
  const k = { one: { R: 1, B: 1, L: 1, Q: 1 }, series: { R: 2, B: 2, L: 4, Q: 0.5 }, parallel: { R: 0.5, B: 1, L: 1, Q: 0.5 } } as const;
  const a = k[from], b = k[to];
  return { Re: (p.Re / a.R) * b.R, Bl: p.Bl !== undefined ? (p.Bl / a.B) * b.B : undefined, Le: p.Le !== undefined ? (p.Le / a.L) * b.L : undefined, Qes: (p.Qes / a.Q) * b.Q };
}

// ---------- full T/S extraction ----------
export interface TSInputs {
  free: Curve;                        // free-air impedance
  ReDC?: number;                      // meter reading (Ω) for the wiring used during the sweep
  Sd: number;                         // m²
  wiring: CoilWiring;                 // wiring during the sweeps
  target: CoilWiring;                 // wiring the saved values should describe
  addedMass?: { kg: number; curve: Curve };
  closedBox?: { Vb: number; curve: Curve }; // net volume m³
  air?: Air;
}
export interface TSValue { key: string; value: number; how: string }
export interface TSResult {
  fs: number; Re: number; Qms: number; Qes: number; Qts: number; Le?: number; Vas?: number; Mms?: number; Cms?: number; Bl?: number; Rms?: number;
  r0: number; Zmax: number; f1: number; f2: number; usedReal: boolean; ReHow: string; LeHow?: string; vasHow?: string; vasSimple?: number;
  rows: TSValue[]; notes: string[];
}
export function extractTS(inp: TSInputs): TSResult {
  const air = inp.air ?? AIR_20C; const notes: string[] = []; const rows: TSValue[] = [];
  const pk = findPeaks(inp.free, 5, 400).sort((a, b) => b.z - a.z)[0];
  let ReHow = "your meter reading (DC resistance)"; let Re = inp.ReDC ?? NaN;
  if (!(Re > 0)) { const e = estimateRe(inp.free, pk?.f); Re = e.Re; ReHow = e.how; notes.push("Re was not measured with a meter: it is " + e.how + ". Qes and Qts come out slightly low; measure Re with a meter for better values."); }
  const q = impedanceQ(inp.free, Re, pk?.f);
  if (!q) throw new Error("Could not find a clear resonance peak in the free-air sweep (it must rise well above Re). Check the sweep starts below fs and the jig is calibrated.");
  if (!q.usedReal) notes.push("The file has no phase, so the magnitude |Z| was used; the coil inductance then makes Qms/Qes slightly less accurate. REW text exports include phase: keep it.");
  rows.push({ key: "Re", value: Re, how: ReHow });
  rows.push({ key: "fs", value: q.fs, how: q.usedReal ? `sqrt(f1·f2), f1 ${q.f1.toFixed(2)} Hz and f2 ${q.f2.toFixed(2)} Hz at half height of the real part of Z` : `sqrt(f1·f2), f1 ${q.f1.toFixed(2)} Hz and f2 ${q.f2.toFixed(2)} Hz where |Z| = sqrt(r0)·Re` });
  rows.push({ key: "Qms", value: q.Qms, how: (q.usedReal ? "fs/(f2 - f1)" : "fs·sqrt(r0)/(f2 - f1)") + `, r0 = Zmax/Re = ${q.Zmax.toFixed(2)}/${Re.toFixed(2)} = ${q.r0.toFixed(2)}` });
  rows.push({ key: "Qes", value: q.Qes, how: "Qms/(r0 - 1)" });
  rows.push({ key: "Qts", value: q.Qts, how: "Qms·Qes/(Qms + Qes)" });
  const le = estimateLe(inp.free, q, Re); if (le) rows.push({ key: "Le", value: le.Le, how: le.how });
  const res: TSResult = { fs: q.fs, Re, Qms: q.Qms, Qes: q.Qes, Qts: q.Qts, Le: le?.Le, r0: q.r0, Zmax: q.Zmax, f1: q.f1, f2: q.f2, usedReal: q.usedReal, ReHow, LeHow: le?.how, rows, notes };
  const rc2 = air.rho * air.c * air.c; const w = 2 * Math.PI * q.fs;
  if (inp.addedMass) {
    const p2 = findPeaks(inp.addedMass.curve, 5, 400).sort((a, b) => b.z - a.z)[0];
    const q2 = impedanceQ(inp.addedMass.curve, Re, p2?.f);
    if (!q2) throw new Error("Could not find the resonance in the added-mass sweep.");
    if (!(q2.fs < q.fs * 0.97)) throw new Error(`The added-mass resonance (${q2.fs.toFixed(1)} Hz) is not clearly below the free-air one (${q.fs.toFixed(1)} Hz): add more mass (about half the expected Mms, as REW's help suggests) or check the files.`);
    const Mms = inp.addedMass.kg / ((q.fs / q2.fs) ** 2 - 1);
    const Cms = 1 / (w * w * Mms); const Vas = rc2 * inp.Sd ** 2 * Cms;
    Object.assign(res, { Mms, Cms, Vas, vasHow: `added mass ${(inp.addedMass.kg * 1000).toFixed(1)} g: fs' ${q2.fs.toFixed(2)} Hz, Mms = m/((fs/fs')² - 1)` });
    if (inp.addedMass.kg < 0.25 * Mms) notes.push(`The added mass is only ${(inp.addedMass.kg / Mms * 100).toFixed(0)} % of Mms: the frequency shift is small, so Vas is sensitive to noise. About 50 % is better (REW help).`);
  } else if (inp.closedBox) {
    const pc = findPeaks(inp.closedBox.curve, 5, 400).sort((a, b) => b.z - a.z)[0];
    const qc = impedanceQ(inp.closedBox.curve, Re, pc?.f);
    if (!qc) throw new Error("Could not find the resonance in the closed-box sweep.");
    if (!(qc.fs > q.fs * 1.03)) throw new Error(`The closed-box resonance (${qc.fs.toFixed(1)} Hz) is not clearly above the free-air one (${q.fs.toFixed(1)} Hz): use a smaller box (a little less than the expected Vas, REW help) and make sure it is airtight.`);
    const Vas = inp.closedBox.Vb * ((qc.fs * qc.Qes) / (q.fs * q.Qes) - 1);
    const vasSimple = inp.closedBox.Vb * ((qc.fs / q.fs) ** 2 - 1);
    const Cms = Vas / (rc2 * inp.Sd ** 2); const Mms = 1 / (w * w * Cms);
    Object.assign(res, { Vas, Cms, Mms, vasSimple, vasHow: `closed box ${(inp.closedBox.Vb * 1000).toFixed(1)} L: fc ${qc.fs.toFixed(2)} Hz, Qec ${qc.Qes.toFixed(3)}; Vas = Vb·((fc·Qec)/(fs·Qes) - 1) (Small 1972); simple form Vb·((fc/fs)² - 1) gives ${(vasSimple * 1000).toFixed(1)} L` });
  } else notes.push("No second sweep: Vas, Mms, Cms and Bl cannot be worked out from one sweep (added-mass or closed-box sweep needed). The saved copy keeps the original Vas.");
  if (res.Mms) {
    res.Bl = Math.sqrt((w * res.Mms * Re) / q.Qes); res.Rms = (w * res.Mms) / q.Qms;
    rows.push({ key: "Vas", value: res.Vas!, how: res.vasHow! }, { key: "Mms", value: res.Mms, how: "from the second sweep" }, { key: "Cms", value: res.Cms!, how: "1/((2π·fs)²·Mms)" },
      { key: "Bl", value: res.Bl, how: "sqrt(2π·fs·Mms·Re/Qes)" }, { key: "Rms", value: res.Rms, how: "2π·fs·Mms/Qms" });
  }
  // wiring
  if (inp.wiring !== inp.target && inp.wiring !== "single" && inp.target !== "single") {
    const cv = convertWiring({ Re: res.Re, Bl: res.Bl, Le: res.Le, Qes: res.Qes }, inp.wiring, inp.target);
    notes.push(`Measured as "${WIRING_TEXT[inp.wiring]}", saved as "${WIRING_TEXT[inp.target]}" (two identical coils assumed): Re ${res.Re.toFixed(2)} → ${cv.Re.toFixed(2)} Ω, Qes ${res.Qes.toFixed(3)} → ${cv.Qes.toFixed(3)}${res.Bl ? `, Bl ${res.Bl.toFixed(2)} → ${cv.Bl!.toFixed(2)} T·m` : ""}${res.Le ? `, Le ${(res.Le * 1000).toFixed(2)} → ${(cv.Le! * 1000).toFixed(2)} mH (Le factor assumed)` : ""}.`);
    res.Re = cv.Re; res.Qes = cv.Qes; res.Bl = cv.Bl; res.Le = cv.Le; res.Qts = (res.Qms * res.Qes) / (res.Qms + res.Qes);
    for (const r of rows) { const v = (res as any)[r.key]; if (typeof v === "number" && ["Re", "Qes", "Qts", "Bl", "Le"].includes(r.key)) { r.value = v; r.how += ` (converted to ${inp.target})`; } }
  } else if (inp.wiring === "one") notes.push("Measured with one coil driven and the other open: the values are per coil. With both coils driven (series or parallel) Qes is half of this one-coil Qes. Choose the wiring to save as.");
  return res;
}
