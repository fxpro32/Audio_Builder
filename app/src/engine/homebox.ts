// Home and computer speaker box figures (B2_SECTIONS, R37), from references/research_h_ib_door_home_pc.md section 3.
// Baffle step: f3 = 115 / baffle width (m) (380 / width in feet), after John Murphy (True Audio), based on Olson 1969;
// R. Elliott, ESP, Baffle Step Compensation: https://www.sound-au.com/bafflestep.htm . Up to 6 dB from low to high frequencies.
// Inside / outside volume of real products: Wharfedale Diamond 12.1 0.58, 12.2 0.62, 12.3 0.50, 12.4 0.53 (research_h 3.1).
// Depth rule: the shallowest of the reference products in research_h 3.1 is about 0.81 x its width (JBL 104: 124 / 153 mm;
// LS3/5A 160 / 190 = 0.84; Genelec 8010A 115 / 121 = 0.95); so a home or computer box is kept at least 0.8 x as deep as wide.
import { grossL, holdVolume, HoldResult, Locks, SizeSpec, Sizes } from "./autosize";

export const BAFFLE_STEP_K = 115;
/** Baffle-step frequency (Hz) for a front baffle W metres wide. */
export const baffleStepHz = (wM: number) => (wM > 0 ? BAFFLE_STEP_K / wM : NaN);
/** Inside proportions for Best size in the home / computer sections: Sepmeyer's ratio B (autosize.ts) turned upright, width
 * smallest, height largest (1 : 1.28 : 1.54 as width : depth : height), the usual bookshelf shape. */
export const RATIO_UPRIGHT = { W: 1, D: 1.28, H: 1.54 };
/** Smallest depth / width of a home or computer box (outside). */
export const MIN_DEPTH_RATIO = 0.8;
/** Wharfedale Diamond 12 series inside / outside volume (research_h 3.1). */
export const WHARFEDALE_RATIO = { min: 0.5, max: 0.62 };
/** Two-way crossover seen in every product read (research_h 3.1 / 3.2). */
export const XOVER_2WAY_HZ = [2000, 3000];

/** Outside volume (L) of a rectangular box (mm). */
export const outsideL = (s: Sizes) => (s.W * s.H * s.D) / 1e6;

export interface DepthFit { sizes: Sizes; changed: boolean; heightGaveWay: boolean; hold?: HoldResult; msg?: string }
/**
 * Keep a home / computer box at least MIN_DEPTH_RATIO x as deep as wide while it holds the volume. If the box (after Keep the
 * volume / Best size) came out shallower, the depth is set to that ratio and the HEIGHT gives way (even when it was locked, as
 * the floor-standing preset locks it), so the volume is still kept; the message says so. Width is left as it is (it is usually
 * set by the drivers on the front).
 */
export function keepDepth(s: Sizes, k: SizeSpec, req: number | ((s: Sizes) => number), locks: Locks, mins: (s: Sizes) => Sizes, ratio = MIN_DEPTH_RATIO): DepthFit {
  if (s.D >= ratio * s.W - 0.5) return { sizes: s, changed: false, heightGaveWay: false };
  const D = Math.ceil(ratio * s.W);
  const start = { ...s, D };
  const r = holdVolume(start, null, k, req, { W: true, D: true }, mins);
  if (!r.ok && r.clamped.includes("H")) { // the height stopped at what the drivers need: the volume is too small for this width at 0.8 x, so the depth gives way instead
    const h = holdVolume({ ...s, H: r.sizes.H }, null, k, req, { W: true, H: true }, mins);
    return { sizes: h.sizes, changed: true, heightGaveWay: true, hold: h, msg: `The drivers need a front of ${Math.round(s.W)} × ${Math.round(r.sizes.H)} mm, and this driver needs so little volume that the box can only be ${Math.round(h.sizes.D)} mm deep (${(h.sizes.D / s.W).toFixed(2)} × the width, under the usual ${ratio} ×): fine for a small sealed box; for more depth use a bigger volume (Qtc target lower, or My own volume).` };
  }
  const msg = `A ${Math.round(s.H)} mm tall box would be only ${Math.round(s.D)} mm deep for this volume: the depth was set to ${D} mm (${ratio} × the width) and the height ${locks.H ? "(unlocked for this) " : ""}went to ${Math.round(r.sizes.H)} mm so the volume is kept.`;
  return { sizes: r.sizes, changed: true, heightGaveWay: true, hold: r, msg };
}

export interface HomeFacts { stepHz: number; insideL: number; outsideL: number; ratio: number }
export function homeFacts(s: Sizes, k: SizeSpec): HomeFacts {
  const g = grossL(s, k); const o = outsideL(s);
  return { stepHz: baffleStepHz(s.W / 1000), insideL: g, outsideL: o, ratio: o > 0 ? g / o : 0 };
}
