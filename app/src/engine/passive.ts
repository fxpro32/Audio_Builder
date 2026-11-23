// Passive radiators (A11_AUTOSIZE, R32): a cone with a suspension but no voice coil or magnet, driven by the box pressure.
// Small, "Passive-Radiator Loudspeaker Systems" Parts 1-2, JAES 22(8):592-601 and 22(9), 1974 (research_c §5 [S4]):
// the PR is a branch from the box to the outside: acoustic mass Map = Mmp/Sp², in series with its suspension compliance
// Cap = Cmp·Sp² and loss Rap = Rmp/Sp². With n drivers and m PRs in one box, each driver's share of the box (Vb/n) carries
// m/n PRs (parallel: masses and losses ÷ m/n, compliances × m/n).
// Tuning, from that circuit: the PR mass resonates with its own compliance in series with the box compliance:
//   fp = 1 / (2π·√(Map·Cap))                 (the PR's own resonance with the added mass: a response notch, Small Part 1)
//   fb = 1 / (2π·√(Map·Cap·CAB/(Cap+CAB))) = fp·√(1 + Vap/Vb),  Vap = ρc²·Cap   (box tuning, the impedance minimum)
// Rule of thumb from Small's Part 1 abstract (research_c §5, part2 (e)): the PR's linear displacement volume Sp·Xmax should be
// at least twice the driver's (otherwise the PR runs out of travel first).
import { Air, AIR_20C } from "./air";
import { DriverParams } from "./driver";

export interface PRParams { Sd: number; Mms: number; Cms: number; Rms: number; fs: number; Qms: number; Vas: number; Xmax: number; dia?: number; cutout?: number; depth?: number; displacement?: number }

/** Full PR parameters from what a sheet gives: Sd, the moving mass (Mms/Mmd) or fs, the compliance (Cms, Vas or fs), and the
 * loss (Qms or Rms). Throws when a value would have to be guessed. */
export function completePR(p: Partial<DriverParams>, air: Air = AIR_20C): PRParams {
  const Sd = p.Sd ?? 0; if (!(Sd > 0)) throw new Error("Need the cone area Sd");
  const rc2 = air.rho * air.c * air.c;
  let Cms = p.Cms && p.Cms > 0 ? p.Cms : p.Vas && p.Vas > 0 ? p.Vas / (rc2 * Sd * Sd) : undefined;
  let Mms = p.Mms && p.Mms > 0 ? p.Mms : undefined;
  const fs0 = p.fs && p.fs > 0 ? p.fs : undefined;
  if (Cms === undefined && Mms !== undefined && fs0) Cms = 1 / ((2 * Math.PI * fs0) ** 2 * Mms);
  if (Mms === undefined && Cms !== undefined && fs0) Mms = 1 / ((2 * Math.PI * fs0) ** 2 * Cms);
  if (Mms === undefined) throw new Error("Need the moving mass Mms (Mmd), or fs with Cms or Vas");
  if (Cms === undefined) throw new Error("Need the compliance Cms or Vas, or fs with Mms");
  const fs = 1 / (2 * Math.PI * Math.sqrt(Mms * Cms)); const w = 2 * Math.PI * fs;
  let Rms = p.Rms && p.Rms > 0 ? p.Rms : undefined; let Qms = p.Qms && p.Qms > 0 ? p.Qms : undefined;
  if (Rms === undefined && Qms !== undefined) Rms = (w * Mms) / Qms;
  if (Rms === undefined) throw new Error("Need Qms or Rms (the suspension loss)");
  Qms ??= (w * Mms) / Rms;
  return { Sd, Mms, Cms, Rms, fs, Qms, Vas: rc2 * Sd * Sd * Cms, Xmax: p.Xmax ?? 0, dia: p.dia, cutout: p.cutout, depth: p.depth, displacement: p.displacement };
}

/** Acoustic branch of the PRs in one driver's share of the box (per share: m/n PRs in parallel). addKg = added mass per PR. */
export function prBranch(pr: PRParams, addKg: number, m: number, n: number) {
  const q = m / Math.max(1, n); const S2 = pr.Sd * pr.Sd;
  return { Map: (pr.Mms + addKg) / (S2 * q), Cap: pr.Cms * S2 * q, Rap: pr.Rms / (S2 * q), S: pr.Sd * q };
}
/** Tuning of a PR box: fp (PR resonance with its added mass) and fb (box tuning). VbTotal = net box volume m³, n drivers, m PRs. */
export function prTuning(pr: PRParams, addKg: number, m: number, n: number, VbTotal: number, air: Air = AIR_20C) {
  const b = prBranch(pr, addKg, m, n); const CAB = VbTotal / n / (air.rho * air.c * air.c);
  const fp = 1 / (2 * Math.PI * Math.sqrt(b.Map * b.Cap));
  const fb = 1 / (2 * Math.PI * Math.sqrt((b.Map * b.Cap * CAB) / (b.Cap + CAB)));
  return { fp, fb };
}
/** Added mass per PR (kg) that tunes the box to fb. Negative = the bare PR is already too heavy for that tuning. */
export function prMassFor(pr: PRParams, m: number, n: number, VbTotal: number, fb: number, air: Air = AIR_20C): number {
  const q = m / Math.max(1, n); const CAB = VbTotal / n / (air.rho * air.c * air.c); const Cap = pr.Cms * pr.Sd * pr.Sd * q;
  const Ceq = (Cap * CAB) / (Cap + CAB); const Map = 1 / ((2 * Math.PI * fb) ** 2 * Ceq);
  return Map * pr.Sd * pr.Sd * q - pr.Mms;
}
/** Small's rule of thumb: PR displacement volume (all PRs) against the drivers'. Ratio; undefined if an Xmax is missing. */
export function prVdRatio(pr: PRParams, m: number, drvSd: number, drvXmax: number, n: number): number | undefined {
  if (!(pr.Xmax > 0) || !(drvXmax > 0)) return undefined;
  return (pr.Sd * pr.Xmax * m) / (drvSd * drvXmax * n);
}
