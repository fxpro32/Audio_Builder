// Port layout inside a classic box (rectangle or wedge with a sloped back), A8 2026-11-22.
// Coordinates in metres: s = depth from the OUTER front face inwards, y = height from the outer bottom, x = across (0 = centre).
// A port is laid out straight (front to back) when it fits; otherwise with one 90° fold (an "L": along the bottom, then up the back).
// Length convention: the port's physical length is its CENTRE-LINE length, measured from the outer front face, through the bend.
// This is the usual builders' practice (e.g. https://www.diyaudio.com/community/threads/calculating-bent-port-length.32963 ,
// https://www.diyaudio.com/community/threads/folded-slot-port.123204 ); no primary (journal) source was found: UNVERIFIED.
// The tuning maths (port.ts) is unchanged: a fold is treated as a straight duct of the same centre-line length and area.
// End clearance: the open inner end stays at least one port diameter (slot: its height) from the nearest wall, the same rule of
// thumb (UNVERIFIED) the free-form analysis uses (freeform.ts).
import { PortGeom, flareOf, portDisplacement, portLengthFor } from "./port";

export interface PortBox { W: number; H: number; D: number; Dtop?: number; t: number; baffleExtra?: number }
export interface PortLayout {
  mode: "straight" | "folded" | "none";  // none = does not fit even folded (do not draw it)
  fits: boolean;
  need: number;          // centre-line length per port (= p.length)
  straightMax: number;   // longest straight port that fits
  foldMax: number;       // longest L-folded port that fits (0 = no fold possible)
  clearance: number;
  yc: number;            // height of the horizontal leg's centre line
  sBend: number;         // depth of the vertical leg's centre line (folded)
  yEnd: number;          // height of the open inner end (folded)
  L1: number; L2: number; // centre-line legs: along the bottom (from the outer front face) and up (0 when straight)
  w: number;             // slot width per port actually used (slots side by side across the inside width); round: d
  xs: number[];          // across-width centres of the ports
  rx: number;            // round: outside radius incl. wall and flare; slot: half the slot width
  rearBoard: boolean;    // folded slot not against the back wall (or wedge): an extra board behind the vertical leg
  legFront: number;      // folded: depth of the front face of the vertical leg (boards / tube), for driver clash checks
  displacement: number;  // m³ of air + boards of all ports inside the box
  reason?: string;       // why it does not fit
}

/** 0.5 mm: lengths are rounded to whole mm in the UI. */
const TOL = 5e-4;
export const portClearance = (p: PortGeom) => (p.shape === "round" ? p.d! : p.h!);
/** Depth of the back panel's inside face at height y (linear between the bottom and the top for a wedge). */
export function backInner(b: PortBox, y: number): number {
  const Hi = b.H - 2 * b.t; const Dt = b.Dtop ?? b.D; const f = Math.min(1, Math.max(0, (y - b.t) / Hi));
  return b.D - b.t + (Dt - b.D) * f;
}

export function portLayout(b: PortBox, p: PortGeom): PortLayout {
  const t = b.t, tb = t + (b.baffleExtra ?? 0), Wi = b.W - 2 * t, n = Math.max(1, p.count);
  const round = p.shape === "round"; const c = portClearance(p); const L = p.length;
  const wall = round ? p.wall ?? 0.003 : 0;
  const rx = round ? p.d! / 2 + wall + flareOf(p) : 0;
  const w = round ? p.d! : Math.min(p.w!, (Wi - (n - 1) * t) / n);
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(round ? -Wi / 2 + rx + 0.02 + i * (2 * rx + 0.02) : -Wi / 2 + i * (w + t) + w / 2);
  const h = round ? 0 : p.h!;
  const yc = round ? t + 0.02 + rx : t + h / 2;
  const eHalf = round ? rx : h / 2;           // half the cross size of the duct in the fold plane
  const topEdge = round ? yc + rx : t + h + t; // highest point of a straight port (slot: its top board)
  const straightMax = backInner(b, topEdge) - c;
  // fold: the vertical leg's mouth must be c below the top panel and clear the sloped back up to c above the mouth
  const yEndMax = b.H - t - c;
  const yEndMin = round ? yc + 2 * rx : t + h + t + h; // the leg rises at least one duct size above the horizontal leg
  const wedge = (b.Dtop ?? b.D) < b.D - 1e-9;
  const sBendMax = (yEnd: number) => { const back = backInner(b, Math.min(yEnd + c, b.H - t)); return round ? back - rx : back - (wedge ? t : 0) - h / 2; };
  const f = (yEnd: number) => sBendMax(yEnd) + (yEnd - yc);
  const foldOK = yEndMax >= yEndMin;
  const foldMax = foldOK ? Math.max(f(yEndMin), f(yEndMax)) : 0;
  const base = { need: L, straightMax, foldMax, clearance: c, yc, w, xs, rx: round ? rx : w / 2 };
  let mode: PortLayout["mode"] = "none", sBend = 0, yEnd = 0, L1 = L, L2 = 0, rearBoard = false, reason: string | undefined;
  const acrossOK = round ? xs[n - 1] + rx <= Wi / 2 + 1e-9 : w > 0;
  if (!acrossOK) reason = `${n} ports of ${Math.round(2 * rx * 1000)} mm do not fit side by side across ${Math.round(Wi * 1000)} mm inside`;
  else if (L <= straightMax + TOL) mode = "straight";
  else if (foldOK && L <= foldMax + TOL) {
    mode = "folded";
    if (L <= f(yEndMin)) { yEnd = yEndMin; sBend = Math.min(sBendMax(yEnd), L - (yEnd - yc)); rearBoard = !round && sBend < sBendMax(yEnd) - 1e-6; }
    else {
      let lo = yEndMin, hi = yEndMax; const up = f(yEndMax) >= f(yEndMin);
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if ((f(m) < L) === up) lo = m; else hi = m; }
      yEnd = Math.min(yEndMax, (lo + hi) / 2); sBend = sBendMax(yEnd);
    }
    if (!round && wedge) rearBoard = true;
    L1 = sBend; L2 = yEnd - yc;
  } else reason = `needs ${Math.round(L * 1000)} mm, the box holds ${Math.round(Math.max(straightMax, foldMax) * 1000)} mm${foldOK ? " even folded" : ""}`;
  const legFront = mode === "folded" ? sBend - eHalf - (round ? 0 : t) : Infinity;
  // displacement: the straight-duct formula along the centre line (air + boards), plus a closing side board when the slots
  // do not reach the right-hand wall, plus the rear board of a folded slot that is not against the back wall
  const pp: PortGeom = { ...p, w: round ? p.w : w };
  let disp = portDisplacement(pp, t, tb);
  if (!round) {
    const used = n * w + (n - 1) * t;
    if (used < Wi - 1e-4) disp += h * t * Math.max(0, L - tb);
    if (mode === "folded" && rearBoard) disp += Math.min(Wi, used + t) * t * L2;
  }
  return { ...base, mode, fits: mode !== "none", sBend, yEnd, L1, L2, rearBoard, legFront, displacement: disp, reason };
}

export interface PortFit { port: PortGeom; layout: PortLayout; resized: boolean; from: number; to: number }
/**
 * Size a port so it fits the box (straight, else folded): slots keep their height and get narrower (never below their height),
 * round ports get a smaller diameter (never below half the asked one). Length per port for net volume Vb and tuning fb.
 * Returns the asked size with layout.mode "none" when even the smallest allowed size does not fit.
 */
export function fitPort(b: PortBox, p: PortGeom, Vb: number, fb: number, cAir = 343.2): PortFit {
  const round = p.shape === "round";
  const at = (s: number): { port: PortGeom; layout: PortLayout } => {
    const q: PortGeom = round ? { ...p, d: s } : { ...p, w: s };
    q.length = Math.max(0.01, portLengthFor(q, Vb, fb, cAir));
    return { port: q, layout: portLayout(b, q) };
  };
  const Wi = b.W - 2 * b.t, n = Math.max(1, p.count);
  const sMax = round ? p.d! : Math.min(p.w!, (Wi - (n - 1) * b.t) / n);
  const sMin = round ? p.d! / 2 : p.h!;
  const first = at(sMax);
  if (first.layout.fits || sMax <= sMin) return { ...first, resized: false, from: sMax, to: sMax };
  const low = at(sMin);
  if (!low.layout.fits) return { ...first, resized: false, from: sMax, to: sMax };
  let lo = sMin, hi = sMax;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (at(m).layout.fits) lo = m; else hi = m; }
  const s = Math.floor(lo * 1000) / 1000; const r = at(Math.max(sMin, s));
  return { ...r, resized: true, from: sMax, to: Math.max(sMin, s) };
}
