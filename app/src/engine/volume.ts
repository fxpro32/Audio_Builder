// Box geometry and net volume (research_c part2 §3). Units m, m³.
import { PortGeom, portDisplacement } from "./port";
export interface BoxGeom {
  W: number; H: number; D: number;   // external width, height, depth (D = depth at bottom)
  Dtop?: number;                     // external depth at top for a wedge (sloped back); undefined = rectangular
  t: number;                         // panel thickness
  baffleExtra?: number;              // extra thickness of a double front baffle
  braces?: number;                   // m³
  inserts?: number;                  // m³ of solid blocks added (FIX mode)
  other?: number;                    // m³ crossover, terminal cup etc.
  fillFactor?: number;               // 0..0.4 apparent volume increase from fill (UNVERIFIED practical values; measure)
  // Free-form shapes (engine/freeform.ts): the inside (air) mesh replaces the W×H×D maths
  gross?: number;                    // m³ inside volume of the mesh after wall/shell thickness
  chord?: number;                    // m longest straight line inside (first standing wave c/2L)
  panels?: { name: string; a: number; b: number; t: number }[]; // flat wood panels (bounding sizes); [] = none (fibreglass/curved)
  portRoom?: number;                 // m straight room behind the port opening
}
export function internalDims(b: BoxGeom) {
  const Wi = b.W - 2 * b.t, Hi = b.H - 2 * b.t;
  const Di = b.D - 2 * b.t - (b.baffleExtra ?? 0);
  const DiTop = (b.Dtop ?? b.D) - 2 * b.t - (b.baffleExtra ?? 0);
  return { Wi, Hi, Di, DiTop };
}
export function grossVolume(b: BoxGeom): number {
  const { Wi, Hi, Di, DiTop } = internalDims(b);
  return Wi * Hi * (Di + DiTop) / 2; // trapezoidal prism (exact for one sloped face)
}
export interface VolumeBreakdown { gross: number; driver: number; port: number; braces: number; inserts: number; other: number; net: number; acoustic: number }
export function netVolume(b: BoxGeom, driverDisp: number, drivers: number, port?: PortGeom): VolumeBreakdown {
  const gross = b.gross ?? grossVolume(b);
  const driver = driverDisp * drivers;
  const pv = port ? portDisplacement(port, b.t, b.gross === undefined ? b.t + (b.baffleExtra ?? 0) : 0) : 0; // classic box: the part inside the front panel is not air
  const braces = b.braces ?? 0, inserts = b.inserts ?? 0, other = b.other ?? 0;
  const net = gross - driver - pv - braces - inserts - other;
  return { gross, driver, port: pv, braces, inserts, other, net, acoustic: net * (1 + (b.fillFactor ?? 0)) };
}
/** Axial standing-wave frequencies (first mode) per internal dimension: c/(2L). */
export function axialModes(b: BoxGeom, cAir = 343.2) {
  const { Wi, Hi, Di, DiTop } = internalDims(b);
  return { W: cAir / (2 * Wi), H: cAir / (2 * Hi), D: cAir / (2 * Math.max(Di, DiTop)) };
}
/** First panel mode, simply supported plate (research_c part2 §1.2). Material defaults MDF (UNVERIFIED values). */
export function panelMode(a: number, b: number, t: number, E = 3.5e9, nu = 0.25, rho = 750): number {
  const D = (E * t ** 3) / (12 * (1 - nu * nu));
  return (Math.PI / 2) * Math.sqrt(D / (rho * t)) * (1 / (a * a) + 1 / (b * b));
}
