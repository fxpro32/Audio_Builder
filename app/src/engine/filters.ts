// Subsonic high-pass (Butterworth) and simple cabin-gain model (research_c part2 §2.1, §2.4).
import { C, c, div, mul } from "./complex";

/** Butterworth high-pass of order n (1-8) at fc, evaluated at f. */
export function butterHP(f: number, fc: number, n: number): C {
  if (!(fc > 0) || n < 1) return c(1);
  const s = c(0, f / fc); // normalised jω/ωc
  let h = c(1);
  const pairs = Math.floor(n / 2);
  for (let k = 0; k < pairs; k++) {
    const theta = (Math.PI * (2 * k + 1)) / (2 * n);
    const q = 1 / (2 * Math.sin(theta));
    // s² / (s² + s/q + 1)
    const s2 = mul(s, s);
    h = mul(h, div(s2, c(s2.re + s.re / q + 1, s2.im + s.im / q)));
  }
  if (n % 2 === 1) h = mul(h, div(s, c(s.re + 1, s.im)));
  return h;
}

export interface Cabin { enabled: boolean; cornerHz: number; slopeDbPerOct: number; leakHz?: number }
/** Cabin gain in dB: 0 above corner F, rising slopeDbPerOct below it, flattening below the optional leak corner. */
export function cabinGainDb(f: number, cab?: Cabin): number {
  if (!cab || !cab.enabled || !(cab.cornerHz > 0)) return 0;
  const lo = cab.leakHz && cab.leakHz > 0 ? Math.max(f, cab.leakHz) : f;
  if (lo >= cab.cornerHz) return 0;
  return cab.slopeDbPerOct * Math.log2(cab.cornerHz / lo);
}
/** Corner F = c/(2·L), L = longest interior dimension (research_c part2 §2.1, Polk 565/L ft). */
export const cabinCorner = (longestM: number, cAir = 343.2) => cAir / (2 * longestM);
