// Transmission line (quarter-wave) enclosure: 1-D acoustic line model (A15_TLINE, R36). Formulas and sources: docs/tline_help.md.
//
// The line is cut into short elements; each element is a uniform duct with a lossy medium, described by its chain (ABCD)
// matrix [p1; U1] = T [p2; U2] (p pressure, U volume velocity along the line). Element constants per unit length:
//   series impedance  z = (jωρ + λ) / S      (air mass plus King's viscous damping λ of the fibre stuffing)
//   shunt admittance  y = jω S / (ρ c_e²)    (air compliance, c_e = speed of sound in the stuffed line)
//   γ = √(z y), Zc = √(z / y), T = [[cosh γl, Zc sinh γl], [sinh γl / Zc, cosh γl]]
// (M. J. King, "Section 4.0: The Calculation Algorithm" and "Section 3.0: A Mathematical Model for an Expanding Fiber Damped
// Transmission Line", 2002, http://www.quarter-wave.com/TLs/TL_Theory.html; standard plane-wave duct matrices, Kinsler & Frey.)
// Tapered parts are a staircase of short uniform elements (area at each element's middle, so the volume is kept).
// Stuffing: King's empirical λ(f, density) and c(density) for polyester fibre (Dacron Hollofil II), "Section 5.0: Derivation and
// Correlation of the Viscous Damping Coefficient" (revised 2003). The fibres do not move with the air (King 2026, "Are the Fibers
// Moving in my TL Slowing the Speed of Sound?"); Bradbury's moving-fibre mass loading is not used (references/research_g_transmission_line.md).
// Terminus: radiation impedance of a piston in an infinite baffle (half space) of the same area, exact Bessel J1 and Struve H1
// (Aarts & Janssen 2003 approximation of H1). The driver couples to the line at its position (closed end or offset/tapped):
// the line seen from the driver is the closed part in parallel with the open part (King, "Section 6.0: Advanced Transmission
// Line Modeling Techniques", offset driver, Fig. 6.2).
import { Air, AIR_20C, P_REF } from "./air";
import { C, abs, add, arg, c, div, inv, mul, scale, sub } from "./complex";
import { FullParams } from "./driver";
import { butterHP, Cabin, cabinGainDb } from "./filters";
import { freqs } from "./model";

// ---------- complex helpers ----------
export const csqrt = (a: C): C => { const r = abs(a); const re = Math.sqrt((r + a.re) / 2); const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2)); return c(re, im); };
export const cexp = (a: C): C => { const e = Math.exp(a.re); return c(e * Math.cos(a.im), e * Math.sin(a.im)); };
const ccoshsinh = (a: C): [C, C] => { const ep = cexp(a), em = cexp(scale(a, -1)); return [scale(add(ep, em), 0.5), scale(sub(ep, em), 0.5)]; };

// ---------- stuffing (King 2002/2003, Dacron Hollofil II) ----------
export const KGM3_PER_LBFT3 = 16.0185;
/** Speed of sound in the stuffed line, King's values: 342, 335, 325, 320 m/s at 0, 0.191, 0.382, 0.573 lb/ft³; about 319 m/s
 * minimum up to 1 lb/ft³ (his Fig. 5.5). Linear between, flat above 1 lb/ft³; scaled to the chosen air (empty = air.c). */
const C_TABLE: [number, number][] = [[0, 342], [0.191, 335], [0.382, 325], [0.573, 320], [1.0, 319]];
export function stuffedC(densityKgM3: number, air: Air = AIR_20C): number {
  const D = Math.max(0, densityKgM3) / KGM3_PER_LBFT3;
  let v = C_TABLE[C_TABLE.length - 1][1];
  for (let i = 1; i < C_TABLE.length; i++) if (D <= C_TABLE[i][0]) { const [x0, y0] = C_TABLE[i - 1], [x1, y1] = C_TABLE[i]; v = y0 + ((D - x0) / (x1 - x0)) * (y1 - y0); break; }
  return (v / 342) * air.c;
}
export const LAMBDA_TUBE = 10; // N·s/m⁴: small loss of the empty tube (King)
/** King's viscous damping coefficient λ (N·s/m⁴) at frequency f for a stuffing density (kg/m³):
 * λ = λ_tube + 1570·D·(f/50)^n / (1 + (f/50)^n), D in lb/ft³, n = 2 up to 0.2 lb/ft³, falling linearly to 1 at 0.4 lb/ft³. */
export function kingLambda(f: number, densityKgM3: number): number {
  const D = Math.max(0, densityKgM3) / KGM3_PER_LBFT3;
  const H = (x: number) => (x >= 0 ? 1 : 0);
  const order = 2 - 5 * (D - 0.2) * H(D - 0.2) + 5 * (D - 0.4) * H(D - 0.4);
  const r = (f / 50) ** order;
  return LAMBDA_TUBE + 1570 * D * (r / (1 + r));
}

// ---------- radiation of the terminus ----------
function besselJ(n: 0 | 1, x: number): number { // power series, fine for |x| < 20
  let sum = 0, term = n === 0 ? 1 : x / 2; const q = -(x * x) / 4;
  for (let k = 0; k < 60; k++) { sum += term; term *= q / ((k + 1) * (k + 1 + n)); if (Math.abs(term) < 1e-17) break; }
  return sum;
}
/** Struve H1, Aarts & Janssen, JASA 113(5) 2003 (max error about 0.005). */
export function struveH1(x: number): number {
  if (x === 0) return 0;
  return 2 / Math.PI - besselJ(0, x) + (16 / Math.PI - 5) * Math.sin(x) / x + (12 - 36 / Math.PI) * (1 - Math.cos(x)) / (x * x);
}
/** Radiation impedance (Pa·s/m³) of a rigid piston of area S in an infinite baffle: (ρc/S)·[1 − 2J1(2ka)/(2ka) + j·2H1(2ka)/(2ka)].
 * At low frequency its mass equals an end correction of 8a/(3π) ≈ 0.849·a. */
export function radiationZ(f: number, S: number, air: Air = AIR_20C): C {
  const a = Math.sqrt(S / Math.PI); const x = 2 * (2 * Math.PI * f / air.c) * a; const k = (air.rho * air.c) / S;
  if (x < 1e-6) return c(0, 0);
  return c(k * (1 - (2 * besselJ(1, x)) / x), (k * 2 * struveH1(x)) / x);
}

// ---------- the line ----------
/** One stretch of the line: length (m), cross-section area at its start and end (m², linear in between), stuffing density (kg/m³). */
export interface LineSeg { len: number; S0: number; S1: number; stuff: number; name?: string }
export interface LineSpec {
  segs: LineSeg[];          // from the closed end to the terminus
  driverAt: number;         // m from the closed end along the line (0 = at the closed end)
  terminus?: "open" | "closed"; // closed = test case (a closed pipe)
  maxEl?: number;           // longest element, m (default 0.02)
}
interface El { l: number; S: number; stuff: number; x0: number }
export function elements(spec: LineSpec): El[] {
  const out: El[] = []; const maxEl = spec.maxEl ?? 0.02; let x = 0;
  for (const s of spec.segs) {
    if (!(s.len > 0)) continue;
    const n = Math.max(1, Math.ceil(s.len / maxEl)); const l = s.len / n;
    for (let i = 0; i < n; i++) { const m = (i + 0.5) / n; out.push({ l, S: s.S0 + (s.S1 - s.S0) * m, stuff: s.stuff, x0: x + i * l }); }
    x += s.len;
  }
  return out;
}
/** Split elements at the driver position (so it sits exactly on an element boundary). */
function splitAt(els: El[], xd: number): { closed: El[]; open: El[] } {
  const closed: El[] = [], open: El[] = [];
  for (const e of els) {
    if (e.x0 + e.l <= xd + 1e-12) closed.push(e);
    else if (e.x0 >= xd - 1e-12) open.push(e);
    else { closed.push({ ...e, l: xd - e.x0 }); open.push({ ...e, x0: xd, l: e.x0 + e.l - xd }); }
  }
  return { closed, open };
}
type M2 = [C, C, C, C]; // [A, B, C, D]
const mmul = (m: M2, n: M2): M2 => [add(mul(m[0], n[0]), mul(m[1], n[2])), add(mul(m[0], n[1]), mul(m[1], n[3])), add(mul(m[2], n[0]), mul(m[3], n[2])), add(mul(m[2], n[1]), mul(m[3], n[3]))];
const I2: M2 = [c(1), c(0), c(0), c(1)];
function elMatrix(e: El, f: number, air: Air, areaScale: number): M2 {
  const w = 2 * Math.PI * f; const S = e.S * areaScale;
  const ce = stuffedC(e.stuff, air); const lam = e.stuff > 0 ? kingLambda(f, e.stuff) : LAMBDA_TUBE;
  const z = div(c(lam, w * air.rho), c(S)); const y = c(0, (w * S) / (air.rho * ce * ce));
  const g = csqrt(mul(z, y)); const Zc = div(z, g); // Zc = z/γ keeps the sign pair consistent
  const [ch, sh] = ccoshsinh(scale(g, e.l));
  return [ch, mul(Zc, sh), div(sh, Zc), ch];
}
const chain = (els: El[], f: number, air: Air, k: number): M2 => els.reduce((m, e) => mmul(m, elMatrix(e, f, air, k)), I2);

export interface LinePoint { Zin: C; Zclosed?: C; Zopen: C; tOpen: M2; Zrad: C } // per frequency
/** Acoustic quantities of the line at one frequency, per driver (areas × areaScale). */
export function lineAt(spec: LineSpec, f: number, air: Air = AIR_20C, areaScale = 1, els = elements(spec)): LinePoint {
  const xd = Math.max(0, Math.min(spec.driverAt, els.reduce((s, e) => s + e.l, 0)));
  const { closed, open } = splitAt(els, xd);
  const tOpen = chain(open, f, air, areaScale);
  const SL = (open.length ? open[open.length - 1].S : els[els.length - 1].S) * areaScale;
  const Zrad = radiationZ(f, SL, air);
  const [A, B, Cc, D] = tOpen;
  const Zopen = spec.terminus === "closed" ? div(A, Cc) : div(add(mul(A, Zrad), B), add(mul(Cc, Zrad), D));
  let Zclosed: C | undefined;
  if (closed.length && xd > 1e-9) {
    const rev = [...closed].reverse(); const t = chain(rev, f, air, areaScale); // from the driver towards the closed end (elements are symmetric)
    Zclosed = div(t[0], t[2]); // closed end: U = 0
  }
  const Zin = Zclosed ? inv(add(inv(Zopen), inv(Zclosed))) : Zopen;
  return { Zin, Zclosed, Zopen, tOpen, Zrad };
}

export interface TLDrive { Vrms: number; count?: number; hpHz?: number; hpOrder?: number; cabin?: Cabin }
export interface TLResult {
  f: number[]; spl: number[]; splDriver: number[]; splTerminus: number[]; xmm: number[]; vterm: number[]; zmag: number[]; zph: number[]; gdMs: number[];
  refSpl: number; air: Air; tuningHz?: number;
}
/** Simulate count identical drivers on the line (the line's areas are the total for all drivers: each driver gets S/count). */
export function simulateTL(d: FullParams, spec: LineSpec, drive: TLDrive, air: Air = AIR_20C, fs = freqs(10, 300, 48)): TLResult {
  const N = Math.max(1, drive.count ?? 1); const k = 1 / N; const els = elements(spec);
  const SL = els[els.length - 1].S * k;
  const out: TLResult = { f: fs, spl: [], splDriver: [], splTerminus: [], xmm: [], vterm: [], zmag: [], zph: [], gdMs: [], refSpl: 0, air };
  const phases: number[] = [];
  for (const f of fs) {
    const w = 2 * Math.PI * f; const jw = c(0, w);
    const L = lineAt(spec, f, air, k, els);
    let Zm = add(add(mul(jw, c(d.Mms)), c(d.Rms)), inv(mul(jw, c(d.Cms))));
    Zm = add(Zm, scale(L.Zin, d.Sd * d.Sd)); // back of the cone loaded by the line
    const Ze = add(add(c(d.Re), mul(jw, c(d.Le))), div(c(d.Bl * d.Bl), Zm));
    const hp = drive.hpHz ? butterHP(f, drive.hpHz, drive.hpOrder ?? 2) : c(1);
    const V = scale(hp, drive.Vrms);
    const i = div(V, Ze); const u = div(scale(i, d.Bl), Zm);
    const Ucone = scale(u, d.Sd);
    const pd = scale(mul(Ucone, L.Zin), -1);          // pressure at the driver's back: cone out draws air from the line
    let UL = c(0);
    if (spec.terminus !== "closed") { const Uo = div(pd, L.Zopen); const [, , Cc, D] = L.tOpen; UL = div(Uo, add(mul(Cc, L.Zrad), D)); } // volume velocity out of the terminus
    const g = cabinGainDb(f, drive.cabin);
    const pOf = (U: C) => scale(mul(jw, U), (air.rho / (2 * Math.PI)) * N); // half space, 1 m, N drivers/lines
    const pT = pOf(add(Ucone, UL));
    const db = (p: C) => 20 * Math.log10(abs(p) / P_REF + 1e-30) + g;
    out.spl.push(db(pT)); out.splDriver.push(db(pOf(Ucone))); out.splTerminus.push(db(pOf(UL)));
    out.xmm.push(Math.SQRT2 * abs(div(u, jw)) * 1000);
    out.vterm.push((Math.SQRT2 * abs(UL)) / SL);
    out.zmag.push(abs(Ze)); out.zph.push((arg(Ze) * 180) / Math.PI);
    phases.push(arg(pT));
  }
  const ph = phases.slice(); for (let i = 1; i < ph.length; i++) { let dd = ph[i] - ph[i - 1]; while (dd > Math.PI) { ph[i] -= 2 * Math.PI; dd -= 2 * Math.PI; } while (dd < -Math.PI) { ph[i] += 2 * Math.PI; dd += 2 * Math.PI; } }
  for (let j = 0; j < fs.length; j++) { const a = Math.max(0, j - 1), b = Math.min(fs.length - 1, j + 1); out.gdMs.push((-(ph[b] - ph[a]) / (2 * Math.PI * (fs[b] - fs[a]))) * 1000); }
  const P = (drive.Vrms * drive.Vrms) / d.Re;
  out.refSpl = 10 * Math.log10((d.eta0 * P * air.rho * air.c) / (2 * Math.PI) / (P_REF * P_REF)) + 20 * Math.log10(N);
  out.tuningHz = coneDipHz(out.f, out.xmm);
  return out;
}
/** Line tuning as King defines it: the frequency of the deepest dip of the cone travel between 12 and 150 Hz (the woofer's null). */
export function coneDipHz(f: number[], x: number[], lo = 12, hi = 150): number | undefined {
  let best: number | undefined, bestRatio = 1;
  for (let i = 1; i < f.length - 1; i++) {
    if (f[i] < lo || f[i] > hi) continue;
    if (x[i] < x[i - 1] && x[i] <= x[i + 1]) { // local minimum; depth against the larger neighbour maximum within an octave
      let mx = 0; for (let j = 0; j < f.length; j++) if (f[j] > f[i] / 2 && f[j] < f[i] * 2) mx = Math.max(mx, x[j]);
      const ratio = x[i] / (mx || 1); if (ratio < bestRatio) { bestRatio = ratio; best = f[i]; }
    }
  }
  return bestRatio < 0.95 ? best : undefined;
}
/** Quarter-wave frequency of a straight open pipe: c / (4·(L + 0.849·a)), a = radius of the open end (baffled). */
export const quarterWaveHz = (L: number, S: number, cAir = AIR_20C.c) => cAir / (4 * (L + (8 / (3 * Math.PI)) * Math.sqrt(S / Math.PI)));
/** Total length (m) and air volume (m³) of a line. */
export function lineSize(spec: LineSpec): { length: number; volume: number } {
  let length = 0, volume = 0; for (const s of spec.segs) { length += s.len; volume += (s.len * (s.S0 + s.S1)) / 2; } return { length, volume };
}

// ---------- maximum output ----------
/** Highest SPL per frequency before the cone reaches Xmax or the amplifier voltage reaches the driver's rated power, from a
 * linear simulation at Vrms. Vpe = √(Pe·Z) (rated power into the impedance the amplifier power is quoted for). */
export function maxSplCurve(spl: number[], xmm: number[], Vrms: number, xmaxMm: number, Vpe: number): { spl: number[]; limit: ("Xmax" | "power")[] } {
  const outS: number[] = [], lim: ("Xmax" | "power")[] = [];
  for (let i = 0; i < spl.length; i++) {
    const vx = xmaxMm > 0 && xmm[i] > 0 ? (Vrms * xmaxMm) / xmm[i] : Infinity;
    const v = Math.min(vx, Vpe > 0 ? Vpe : Infinity);
    outS.push(isFinite(v) ? spl[i] + 20 * Math.log10(v / Vrms) : spl[i]); lim.push(vx < Vpe ? "Xmax" : "power");
  }
  return { spl: outS, limit: lim };
}
