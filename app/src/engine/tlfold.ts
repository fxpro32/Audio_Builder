// Folded transmission line inside a rectangular box, and the starting-design helper (A15_TLINE, R36). docs/tline_help.md.
//
// Layout (side view, front on the left): the inside is split by upright dividers parallel to the front baffle into `channels`
// vertical channels, each the full inside width. Channel 1 is right behind the front baffle; the driver sits on the baffle and
// fires its back into channel 1. The line starts closed at the bottom of channel 1, runs up, over divider 1 (gap at the top),
// down channel 2, under divider 2 (gap at the bottom), and so on. The last channel ends at an opening (the terminus): through
// the top panel when it runs up (odd channel count), through the back panel at the bottom when it runs down (even count).
// Channel depths fall (or rise) linearly from channel 1 to the last one by the taper ratio TR = S_L/S_0 (width is constant,
// so the area ratio is the depth ratio). A fold gap is the mean of the two channel depths it joins, so the air keeps about the
// same area through the turn. The line used by the model follows the centre line: channel runs plus the turns.
import { Air, AIR_20C } from "./air";
import { qb3, sbb4 } from "./alignments";
import { FullParams } from "./driver";
import { LineSeg, LineSpec } from "./tline";

export interface TLBox {
  W: number; H: number; D: number; t: number;  // outside sizes and panel thickness, mm
  channels: number; taper: number;            // number of vertical channels (1 = a single straight pipe); TR = last/first depth
  driverY: number;                            // driver centre above the inside bottom, mm (0 = automatic)
  stuffKgM3: number; stuffPct: number;        // stuffing density (kg/m³) and how much of the line, from the closed end, is stuffed (%)
  count: number;                              // drivers, side by side on the baffle, all into channel 1
}
export interface DriverDims { outer: number; cutout: number; depth: number; disp: number } // m, m³ (one driver)
export interface Divider { z0: number; h: number; gapTop: boolean } // m: front face of the divider from the inside face of the front baffle; height
export interface TLGeom {
  Wi: number; Hi: number; Di: number; depths: number[]; gaps: number[]; dividers: Divider[];
  segs: LineSeg[]; spec: LineSpec; length: number; netL: number; airL: number; grossL: number; outerL: number;
  driverY: number; driverAuto: boolean; driverXs: number[]; terminus: { where: "top" | "back"; areaM2: number; w: number; h: number; z0: number };
  path: [number, number][]; stuffLen: number; // centre line (y above the inside bottom, z behind the baffle's inside face), stuffed length (m)
  bad: string[]; notes: string[];
  rows: { name: string; qty: number; a: number; b: number; note: string }[];
}
const MIN_CH = 0.03; // m, narrowest channel worth building
const CLEAR = 0.01;  // m, magnet clearance and frame spacing

/** Build the folded line for the outside sizes given. All results in m / m³ except the *L fields (litres) and the cut-list rows (mm). */
export function foldLine(b: TLBox, drv: DriverDims): TLGeom {
  const t = b.t / 1000, n = Math.max(1, Math.round(b.channels)), TR = n > 1 ? Math.max(0.05, b.taper) : 1, N = Math.max(1, Math.round(b.count));
  const Wi = b.W / 1000 - 2 * t, Hi = b.H / 1000 - 2 * t, Di = b.D / 1000 - 2 * t;
  const bad: string[] = [], notes: string[] = [];
  const room = Di - (n - 1) * t; // total channel depth
  const d1 = n > 1 ? (2 * room) / (n * (1 + TR)) : room;
  const depths = Array.from({ length: n }, (_, i) => (n > 1 ? d1 * (1 + ((TR - 1) * i) / (n - 1)) : d1));
  const gaps = depths.slice(0, -1).map((d, i) => (d + depths[i + 1]) / 2);
  const dividers: Divider[] = []; let z = 0;
  for (let i = 0; i < n - 1; i++) { z += depths[i]; dividers.push({ z0: z, h: Hi - gaps[i], gapTop: i % 2 === 0 }); z += t; }
  if (Wi <= 0 || Hi <= 0 || Di <= 0) bad.push("The outside sizes leave no room inside the panels.");
  if (Math.min(...depths) < MIN_CH) bad.push(`A channel is only ${Math.round(Math.min(...depths) * 1000)} mm deep (under ${MIN_CH * 1000} mm): use fewer channels, a gentler taper or a deeper box.`);
  if (gaps.some((g) => g > Hi - 0.05)) bad.push("The fold gaps take almost the whole height: the box is too low for these channel depths (make it taller or use fewer channels).");
  // driver: on the front baffle over channel 1, centre at driverY above the inside bottom; magnet inside channel 1
  const rc = drv.cutout / 2, ro = drv.outer / 2;
  const turn1 = n > 1 ? Hi - gaps[0] / 2 : Hi; // channel 1 runs from 0 (closed end) up to here
  const yMin = Math.max(rc, ro - t) + CLEAR, yMax = Math.min(Hi - rc, Hi + t - ro) - CLEAR; // cut-out inside, frame on the front face
  const auto = !(b.driverY > 0);
  let yd = auto ? Math.max(yMin, Math.min(yMax, 0.2 * estLength(depths, gaps, Hi, t))) : b.driverY / 1000; // King: an offset damps the 3/4-wave mode
  if (auto && yMax < yMin) yd = Hi / 2;
  if (!auto && (yd < yMin - 1e-6 || yd > yMax + 1e-6)) bad.push(`Driver height ${Math.round(yd * 1000)} mm: it must be between ${Math.round(yMin * 1000)} and ${Math.round(yMax * 1000)} mm above the inside bottom for the driver to fit on the baffle.`);
  if (drv.outer > Hi + 2 * t) bad.push(`The driver (outer ${Math.round(drv.outer * 1000)} mm) is taller than the box.`);
  const needW = N * drv.outer + (N - 1) * 0.02;
  if (needW > Wi + 2 * t - 2 * CLEAR) bad.push(`${N} driver${N > 1 ? "s" : ""} need about ${Math.round(needW * 1000)} mm of baffle width; the box is ${Math.round(b.W)} mm wide outside.`);
  const magnetIn = drv.depth - t; // part of the driver inside the box, behind the baffle
  if (magnetIn + CLEAR > depths[0]) bad.push(`Channel 1 is ${Math.round(depths[0] * 1000)} mm deep, but the driver reaches about ${Math.round(magnetIn * 1000)} mm in behind the baffle (+${CLEAR * 1000} mm clearance): make the box deeper, use fewer channels or a smaller taper ratio (bigger first channel).`);
  const driverXs = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * (drv.outer + 0.02));
  // line segments along the centre line
  const segs: LineSeg[] = [];
  const S = (d: number) => Wi * d;
  const blockLen = 2 * rc; const dispArea = (drv.disp * N) / Math.max(1e-6, blockLen); // driver basket and magnet taking room in channel 1
  const a0 = Math.max(0, yd - rc), a1 = Math.min(turn1, yd + rc);
  const S1 = S(depths[0]); const Sdrv = Math.max(S1 * 0.1, S1 - dispArea);
  if (dispArea > 0.6 * S1) notes.push(`The driver body fills ${Math.round((dispArea / S1) * 100)} % of channel 1 where it sits: the air squeezes past the magnet (modelled as a narrower stretch of the line).`);
  if (a0 > 0) segs.push({ len: a0, S0: S1, S1: S1, stuff: 0, name: "Channel 1 (below the driver)" });
  segs.push({ len: Math.max(1e-4, a1 - a0), S0: Sdrv, S1: Sdrv, stuff: 0, name: "Channel 1 (beside the driver)" });
  if (turn1 > a1) segs.push({ len: turn1 - a1, S0: S1, S1: S1, stuff: 0, name: "Channel 1" });
  for (let i = 1; i < n; i++) {
    segs.push({ len: depths[i - 1] / 2 + t + depths[i] / 2, S0: S(gaps[i - 1]), S1: S(gaps[i - 1]), stuff: 0, name: `Fold ${i}` });
    const run = i < n - 1 ? Hi - gaps[i - 1] / 2 - gaps[i] / 2 : Hi - gaps[i - 1] / 2;
    segs.push({ len: Math.max(1e-4, run), S0: S(depths[i]), S1: S(depths[i]), stuff: 0, name: `Channel ${i + 1}` });
  }
  const length = segs.reduce((s, q) => s + q.len, 0);
  // stuffing over the first stuffPct % of the length from the closed end
  const stuffed = splitStuff(segs, (length * Math.max(0, Math.min(100, b.stuffPct))) / 100, b.stuffKgM3);
  const spec: LineSpec = { segs: stuffed, driverAt: yd };
  const airL = stuffed.reduce((s, q) => s + (q.len * (q.S0 + q.S1)) / 2, 0) * 1000; // along the centre line (a check on netL)
  const grossL = Wi * Hi * Di * 1000;
  const divL = dividers.reduce((s, dv) => s + Wi * dv.h * t, 0) * 1000;
  const netL = grossL - divL - drv.disp * N * 1000;
  const lastUp = n % 2 === 1;
  // centre line for the 3D view
  const zc: number[] = []; { let zz = 0; for (let i = 0; i < n; i++) { zc.push(zz + depths[i] / 2); zz += depths[i] + t; } }
  const path: [number, number][] = [[0, zc[0]]];
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0; const yEnd = i < n - 1 ? (up ? Hi - gaps[i] / 2 : gaps[i] / 2) : (up ? Hi : depths[i] / 2);
    path.push([yEnd, zc[i]]);
    if (i < n - 1) path.push([yEnd, zc[i + 1]]);
    else if (!up) path.push([yEnd, Di]);
  }
  const stuffLen = b.stuffKgM3 > 0 ? (length * Math.max(0, Math.min(100, b.stuffPct))) / 100 : 0;
  const dn = depths[n - 1];
  const terminus = { where: (lastUp ? "top" : "back") as "top" | "back", areaM2: S(dn), w: Wi, h: dn, z0: Di - dn };
  const holes = `${N} × driver cut-out Ø ${Math.round(drv.cutout * 1000)} mm over channel 1, centre ${Math.round((yd + t) * 1000)} mm above the outside bottom`;
  const Wmm = Math.round(Wi * 1000), Hmm = Math.round(Hi * 1000);
  const rows = [
    { name: "Side", qty: 2, a: b.D, b: b.H, note: "dividers glued in between: positions in the drawing" },
    { name: "Bottom", qty: 1, a: Wmm, b: b.D, note: "" },
    { name: "Top", qty: 1, a: Wmm, b: b.D, note: lastUp ? `terminus opening ${Wmm} × ${Math.round(dn * 1000)} mm at the back` : "" },
    { name: "Front baffle", qty: 1, a: Wmm, b: Hmm, note: holes },
    { name: "Back", qty: 1, a: Wmm, b: Hmm, note: lastUp ? "" : `terminus opening ${Wmm} × ${Math.round(dn * 1000)} mm at the bottom` },
    ...dividers.map((dv, i) => ({ name: `Divider ${i + 1}`, qty: 1, a: Wmm, b: Math.round(dv.h * 1000), note: `${Math.round((dv.z0 + t) * 1000)} mm behind the front outside face, gap ${Math.round(gaps[i] * 1000)} mm at the ${dv.gapTop ? "top" : "bottom"}` })),
  ];
  return { Wi, Hi, Di, depths, gaps, dividers, segs: stuffed, spec, length, netL, airL, grossL, outerL: (b.W * b.H * b.D) / 1e6, driverY: yd, driverAuto: auto, driverXs, terminus, path, stuffLen, bad, notes, rows };
}
function estLength(depths: number[], gaps: number[], Hi: number, t: number) {
  let L = Hi * depths.length - gaps.reduce((s, g) => s + g, 0);
  for (let i = 1; i < depths.length; i++) L += depths[i - 1] / 2 + t + depths[i] / 2;
  return L;
}
function splitStuff(segs: LineSeg[], until: number, dens: number): LineSeg[] {
  if (!(dens > 0) || !(until > 0)) return segs.map((s) => ({ ...s, stuff: 0 }));
  const out: LineSeg[] = []; let x = 0;
  for (const s of segs) {
    if (x + s.len <= until + 1e-9) out.push({ ...s, stuff: dens });
    else if (x >= until) out.push({ ...s, stuff: 0 });
    else { const a = until - x; const Sm = s.S0 + ((s.S1 - s.S0) * a) / s.len; out.push({ ...s, len: a, S1: Sm, stuff: dens }, { ...s, len: s.len - a, S0: Sm, stuff: 0 }); }
    x += s.len;
  }
  return out;
}

// ---------- design helper ----------
/** King 2021, "Classic Transmission Line Enclosure Alignments", Table 1: length scale factor SF against taper ratio TR = S_L/S_0
 * (Length = SF × 344 / (4 fb)). Interpolated in log(TR). */
const SF_TABLE: [number, number][] = [[0.1, 0.62], [0.2, 0.71], [0.33, 0.8], [0.5, 0.87], [1, 1], [2, 1.14], [3, 1.22], [5, 1.32], [10, 1.42]];
export function lengthFactor(TR: number): number {
  const x = Math.log(Math.max(0.1, Math.min(10, TR)));
  for (let i = 1; i < SF_TABLE.length; i++) { const [a, fa] = SF_TABLE[i - 1], [b, fb] = SF_TABLE[i]; if (x <= Math.log(b) + 1e-12) return fa + ((x - Math.log(a)) / (Math.log(b) - Math.log(a))) * (fb - fa); }
  return SF_TABLE[SF_TABLE.length - 1][1];
}
export interface Suitability { level: "good" | "fair" | "poor"; text: string }
/** Plain-words fit of a driver for a TL (and a ported box, its close relative): Qts and EBP = fs/Qes. */
export function tlSuitability(fp: FullParams): Suitability {
  const ebp = fp.fs / fp.Qes; const q = fp.Qts.toFixed(2), e = ebp.toFixed(0);
  if (fp.Qts > 0.5 || ebp < 50) return { level: "poor", text: `Poor TL candidate: Qts ${q} is high and EBP (fs/Qes) is ${e}. A transmission line works like a ported box of the same volume and tuning (King 2021), and those want a driver with a strong motor for its moving mass: Qts about 0.25 to 0.5, EBP over about 50 (over 100 suits ported best). With Qts ${q} the line either gives a boomy hump near its tuning or, once stuffed enough to tame it, loses the deep bass it was built for. It can still work, but expect about what a well-sized ported box gives, in a bigger box; it will not make this driver hit harder than a good ported box.` };
  if (fp.Qts > 0.45) return { level: "fair", text: `Fair TL candidate: Qts ${q}, EBP ${e}. Works, but the line needs more volume and some stuffing to stay smooth.` };
  return { level: "good", text: `Good TL candidate: Qts ${q}, EBP ${e} (low Qts and a strong motor suit lines and ported boxes).` };
}
export interface TLSuggestion {
  box: TLBox; VbL: number; fb: number; alignment: string; Lm: number; S0: number; SL: number; TRalign: number; TRbuilt: number;
  notes: string[]; suit: Suitability; lineL: number;
}
/** A starting line for this driver (King 2021 method): Vb and fb from the ported alignment for its Qts (QB3 under Qts 0.383,
 * else SBB4), L = SF(TR)·c/(4·fb), S0 = 2·Vb/((1+TR)·L), SL = TR·S0; then laid out as a folded box. The first channel must hold
 * the driver's magnet and the baffle must hold the frame, which can force a larger line than the alignment: said in `notes`. */
export function suggestTL(fp: FullParams, drv: DriverDims, o: { count?: number; t?: number; taper?: number; channels?: number; air?: Air; stuffKgM3?: number; stuffPct?: number } = {}): TLSuggestion {
  const air = o.air ?? AIR_20C; const N = Math.max(1, o.count ?? 1); const tm = (o.t ?? 18) / 1000; const TR0 = o.taper ?? 0.33;
  const a = fp.Qts < 0.383 ? { ...qb3(fp.Qts), name: "QB3" } : { ...sbb4(fp.Qts), name: "SBB4" };
  const Vb = (fp.Vas / a.alpha) * N; const fb = a.h * fp.fs;
  const notes: string[] = [];
  let TR = TR0, L = 0, S0 = 0;
  const Wi = Math.max(N * drv.outer + (N - 1) * 0.02 + 2 * CLEAR - 2 * tm, 0.1);
  const d1min = Math.max(drv.depth - tm + CLEAR + 0.005, MIN_CH);
  const S0align = (() => { const L0 = (lengthFactor(TR0) * air.c) / (4 * fb); return (2 * Vb) / ((1 + TR0) * L0); })();
  let d1 = Math.max(d1min, S0align / Wi);
  for (let it = 0; it < 8; it++) {
    L = (lengthFactor(TR) * air.c) / (4 * fb);
    S0 = Wi * d1;
    const TRneed = (2 * Vb) / (L * S0) - 1; // taper that keeps the alignment volume with this first channel
    const TRmin = Math.max(0.1, (MIN_CH + 0.005) / d1); // last channel at least 35 mm
    const next = Math.max(TRmin, Math.min(TR0, TRneed));
    if (Math.abs(next - TR) < 1e-4) { TR = next; break; } TR = next;
  }
  L = (lengthFactor(TR) * air.c) / (4 * fb); S0 = Wi * d1;
  const lineVol = ((S0 * (1 + TR)) / 2) * L;
  if (S0 > S0align * 1.05) notes.push(`The driver needs a first channel at least ${Math.round(d1min * 1000)} mm deep for its magnet and ${Math.round((Wi + 2 * tm) * 1000)} mm of baffle width, so the line starts at ${Math.round(S0 * 1e4)} cm² instead of the ${Math.round(S0align * 1e4)} cm² the alignment asks for${TR < TR0 - 1e-3 ? `; a stronger taper (${TR.toFixed(2)}) brings the volume back toward ${(Vb * 1000).toFixed(1)} L` : ""}.`);
  if (lineVol > Vb * 1.1) notes.push(`The line holds about ${(lineVol * 1000).toFixed(1)} L of air (before folding), more than the ${(Vb * 1000).toFixed(1)} L alignment volume (the narrowest channel is ${MIN_CH * 1000} mm). A bigger line tunes the same but changes the response: check the curves.`);
  // channels and height: aim for an inside height of about 0.5 m or less
  const n = Math.max(1, o.channels ?? Math.ceil(L / 0.5));
  const depths = Array.from({ length: n }, (_, i) => (n > 1 ? d1 * (1 + ((TR - 1) * i) / (n - 1)) : d1));
  const Dout = depths.reduce((s, d) => s + d, 0) + (n - 1) * tm + 2 * tm;
  const box: TLBox = { W: Math.ceil((Wi + 2 * tm) * 1000), H: 0, D: Math.ceil(Dout * 1000), t: o.t ?? 18, channels: n, taper: +TR.toFixed(3), driverY: 0, stuffKgM3: o.stuffKgM3 ?? 8, stuffPct: o.stuffPct ?? 75, count: N };
  // height so that the folded centre line is L long (bisection)
  let lo = 0.1, hi = 5;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; const g = foldLine({ ...box, H: m * 1000 }, drv); if (g.length < L) lo = m; else hi = m; }
  box.H = Math.ceil(hi * 1000);
  const g = foldLine(box, drv);
  return { box, VbL: Vb * 1000, fb, alignment: `${a.name} (h ${a.h.toFixed(2)}, alpha ${a.alpha.toFixed(3)})`, Lm: L, S0, SL: S0 * TR, TRalign: TR0, TRbuilt: TR, notes, suit: tlSuitability(fp), lineL: g.netL };
}
