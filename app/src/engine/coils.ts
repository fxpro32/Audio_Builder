// Voice-coil wiring for library drivers (A4_HPDB, 2026-11-22): which wiring the published T/S values describe,
// conversion to the wiring the user chooses, and the load the amplifier sees.
// The electrical conversion itself is convertWiring() in measure.ts (two identical coils; written by A5); it is reused here.
import { Driver, DriverParams } from "./driver";
import { convertWiring, CoilWiring, WIRING_TEXT } from "./measure";

/** Wiring of one driver's coils: both in series, both in parallel, or one coil driven and the other left open. */
export type Wiring = "series" | "parallel" | "one";
export const WIRING_LABEL: Record<Wiring, string> = { series: "Both coils in series", parallel: "Both coils in parallel", one: "One coil only (other open)" };

/** A wiring choice is offered for two-coil drivers with a known coil impedance (convertWiring models two identical coils). */
export const hasCoilChoice = (d?: Driver): boolean => !!d && d.coils === 2 && (d.ohmsPerCoil ?? 0) > 0;

/** Nominal impedance of one driver for a wiring (Ω). */
export function wiredImpedance(ohmsPerCoil: number, coils: number, w: Wiring): number {
  if (coils <= 1) return ohmsPerCoil;
  return w === "series" ? ohmsPerCoil * coils : w === "parallel" ? ohmsPerCoil / coils : ohmsPerCoil;
}
/** Load the amplifier sees for n identical drivers, all wired in parallel or all in series. */
export const finalLoad = (zPerDriver: number, n: number, chain: "parallel" | "series" = "parallel"): number => (chain === "parallel" ? zPerDriver / n : zPerDriver * n);

/** Every load ONE driver can present with both/all coils used: SVC [R]; DVC [R/2, 2R]; QVC [R/4, R, 4R] (series-parallel gives R). */
export function finalLoadsFor(coils: number, ohmsPerCoil: number): number[] {
  if (!(ohmsPerCoil > 0) || !(coils >= 1)) return [];
  if (coils === 1) return [ohmsPerCoil];
  const out = new Set<number>([ohmsPerCoil / coils, ohmsPerCoil * coils]);
  if (coils === 4) out.add(ohmsPerCoil); // two series pairs in parallel
  return [...out].map((x) => +x.toFixed(4)).sort((a, b) => a - b);
}

/** The wiring the published values describe. Unknown basis: assumed from Re against the coil impedance
 *  (Re of one coil is typically 0.7 to 1.0 × its nominal impedance, so about 2× means series and about ½× parallel). */
export function inferBasis(d: Driver): { basis: CoilWiring; assumed: boolean; text: string } {
  const map: Record<string, CoilWiring> = { per_coil: "one", series: "series", parallel: "parallel" };
  if (d.tsBasis && map[d.tsBasis]) return { basis: map[d.tsBasis], assumed: false, text: `published for ${WIRING_TEXT[map[d.tsBasis]]}` };
  const Re = d.params.Re, z = d.ohmsPerCoil ?? 0;
  if (!(Re > 0) || !(z > 0)) return { basis: "parallel", assumed: true, text: "Re or the coil impedance is missing, so both coils in parallel were assumed" };
  const r = Re / z;
  const basis: CoilWiring = r >= 1.4 ? "series" : r <= 0.65 ? "parallel" : "one";
  return { basis, assumed: true, text: `Re ${+Re.toFixed(3)} Ω is ${r.toFixed(2)} × the ${z} Ω coil impedance, so the values were taken as ${WIRING_TEXT[basis]}` };
}

export interface WiredParams { params: DriverParams; basis: CoilWiring; assumed: boolean; basisText: string; usedPublished: boolean; converted: boolean; zDriver?: number; notes: string[] }

/** Parameters of a library driver for the chosen wiring. A maker-published set for that wiring is used directly;
 *  otherwise Re, Bl, Le and Qes are converted from the published basis with convertWiring (fs, Qms, Vas, Mms, Sd unchanged). */
export function paramsForWiring(d: Driver, w: Wiring, basisOverride?: CoilWiring): WiredParams {
  if (!hasCoilChoice(d)) return { params: d.params, basis: "single", assumed: false, basisText: "", usedPublished: false, converted: false, zDriver: d.ohmsPerCoil, notes: [] };
  const inf = inferBasis(d);
  const basis = basisOverride && basisOverride !== "single" ? basisOverride : inf.basis;
  const assumed = basisOverride ? false : inf.assumed;
  const basisText = basisOverride && basisOverride !== inf.basis ? `set by you: ${WIRING_TEXT[basis]}` : inf.text;
  const zDriver = wiredImpedance(d.ohmsPerCoil!, d.coils!, w);
  const p = d.params, notes: string[] = [];
  const published = w === "series" ? d.paramsSeries : w === "parallel" ? d.paramsParallel : undefined;
  let out: DriverParams; let converted = false, usedPublished = false;
  if (basis === w) out = { ...p };
  else {
    const e = convertWiring({ Re: p.Re, Bl: p.Bl, Le: p.Le, Qes: p.Qes }, basis, w);
    out = { ...p, Re: e.Re, Qes: e.Qes, Bl: e.Bl, Le: e.Le, Qts: undefined };
    converted = true;
    notes.push(`Converted from ${WIRING_TEXT[basis]} to ${WIRING_TEXT[w]} (two identical coils): Re ${+p.Re.toFixed(3)} → ${+e.Re.toFixed(3)} Ω, Qes ${+p.Qes.toFixed(3)} → ${+e.Qes.toFixed(3)}${p.Bl && e.Bl ? `, Bl ${+p.Bl.toFixed(2)} → ${+e.Bl.toFixed(2)} T·m` : ""}.`);
  }
  if (published && Object.keys(published).length && basis !== w) {
    for (const [k, v] of Object.entries(published)) if (typeof v === "number" && v > 0) (out as any)[k] = v;
    if (!published.Qts) out.Qts = undefined;
    usedPublished = true; converted = false;
    notes.length = 0; notes.push(`The maker publishes values for ${WIRING_TEXT[w]}: those are used directly.`);
  }
  out.Znom = zDriver;
  return { params: out, basis, assumed, basisText, usedPublished, converted, zDriver, notes };
}
