// Closed-form alignments (research_c §2-§4). Used for synthesis targets and as test oracles for the lumped model.
export interface SealedResult { alpha: number; fc: number; Qtc: number; f3: number }
export function sealed(fs: number, Qts: number, Vas: number, Vb: number): SealedResult {
  const alpha = Vas / Vb;
  const fc = fs * Math.sqrt(1 + alpha);
  const Qtc = Qts * Math.sqrt(1 + alpha);
  return { alpha, fc, Qtc, f3: sealedF3(fc, Qtc) };
}
export function sealedF3(fc: number, Qtc: number): number {
  const C = 1 / (Qtc * Qtc) - 2;
  return fc * Math.sqrt((C + Math.sqrt(C * C + 4)) / 2);
}
/** Net volume for a target Qtc; Infinity/NaN if Qts >= Qtc (impossible). */
export const sealedVbForQtc = (Qts: number, Vas: number, Qtc: number) => Vas / ((Qtc / Qts) ** 2 - 1);

/** Small's 4th-order vented coefficients (research_c §3). */
export function ventedCoeffs(h: number, alpha: number, Qts: number, QL: number) {
  const sh = Math.sqrt(h);
  const a1 = (QL + h * Qts) / (sh * QL * Qts);
  const a2 = (h + (alpha + 1 + h * h) * QL * Qts) / (h * QL * Qts);
  const a3 = (h * QL + Qts) / (sh * QL * Qts);
  return { a1, a2, a3 };
}
/** |G|² at frequency ratio f/fs. */
export function ventedMag2(fOverFs: number, h: number, alpha: number, Qts: number, QL: number): number {
  const { a1, a2, a3 } = ventedCoeffs(h, alpha, Qts, QL);
  const w = fOverFs / Math.sqrt(h); // normalised to w0 = sqrt(h)·ws
  const A1 = a1 * a1 - 2 * a2, A2 = a2 * a2 + 2 - 2 * a1 * a3, A3 = a3 * a3 - 2 * a2;
  const w2 = w * w, w4 = w2 * w2, w6 = w4 * w2, w8 = w4 * w4;
  return w8 / (w8 + A1 * w6 + A2 * w4 + A3 * w2 + 1);
}
/** f3/fs by bisection on |G|² = 0.5 (scanning down from high frequency). */
export function ventedF3Ratio(h: number, alpha: number, Qts: number, QL: number): number {
  let hi = 20, lo = 0.05;
  // find the highest crossing: step down until below 0.5
  let x = hi;
  while (x > lo && ventedMag2(x, h, alpha, Qts, QL) >= 0.5) x /= 1.01;
  let a = x, b = x * 1.01;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (ventedMag2(m, h, alpha, Qts, QL) >= 0.5) b = m; else a = m; }
  return (a + b) / 2;
}
/** QB3 quasi-alignment by fixed-point iteration (Speakerbench method, research_c §3). Valid for Qts below the B4 value. */
export function qb3(Qts: number, QL = 7): { h: number; alpha: number } {
  const q = 1 / Qts, e = Qts / QL;
  const A1 = 0, A2 = 0;
  let h = 1, alpha = 0;
  for (let i = 0; i < 200; i++) {
    const G = -e * q * q + Math.sqrt(A2 - 2 + 2 * q * q * (1 + e * e + e * (h + 1 / h)));
    const hn = (q * q) / (2 * G + A1 - e * e * q * q * h);
    alpha = G * hn - (1 + hn * hn);
    if (Math.abs(hn - h) < 1e-12) { h = hn; break; }
    h = hn;
  }
  return { h, alpha };
}
/** SBB4 / BB4 (Bullock): h = 1. */
export function sbb4(Qts: number, QL = 7): { h: number; alpha: number } {
  return { h: 1, alpha: (1 / Qts - 1 / QL) ** 2 / 4 };
}
/** 4th-order bandpass cookbook (ajdesigner/Dickason, research_c §4). S in {0.5,0.6,0.7}. */
export function bandpass4(fs: number, Qts: number, Vas: number, S: 0.5 | 0.6 | 0.7) {
  const b = { 0.7: 0.7206, 0.6: 0.956, 0.5: 1.2712 }[S];
  const Vf = (2 * S * Qts) ** 2 * Vas;
  const Qbp = 1 / (2 * S);
  const Vr = Vas / ((Qbp / Qts) ** 2 - 1);
  const fb = (Qbp * fs) / Qts;
  const B = (b * fs) / Qts;
  const fl = (-B + Math.sqrt(B * B + 4 * fb * fb)) / 2;
  const fh = (B + Math.sqrt(B * B + 4 * fb * fb)) / 2;
  return { Vf, Vr, fb, fl, fh };
}
