// Cable calculator engine (B4A_CABLE_ENGINE, R41, 2026-11-23): power chain (battery, main fuse, main run, distribution block,
// branch runs, capacitors, amplifiers, ground returns), speaker cable, capacitor, alternator and "big 3" checks.
// THE maths source: references/research_i_car_electronics.md section B (signed off in docs/signoff_R3_electronics.md);
// reference implementation scripts/parts/cable_calc.py; constants data/parts_raw/_reference/cable_constants.json (copied
// below with their sources, because the engine runs in the browser and cannot read files). API: docs/cable_engine.md.
// Pure functions, no DOM, no fetch. Units: A, V, ohm, m (lengths), mm (fuse distance), mm2 (areas), W, J, s, deg C.
import { finalLoad } from "./coils";
import type { Item, ItemLink, ProjectDoc } from "../ui/projectv2";

// ---------------------------------------------------------------------------------------------------------------- constants
export type Material = "copper" | "cca";
export type Location = "outside" | "engine";
export type Insulation = 105 | 90;

/** Conductor resistivity at 20 C (ohm mm2/m) and temperature coefficient (1/C). Research B2. */
export const CONDUCTORS: Record<Material, { rho20: number; alpha: number; source: string }> = {
  copper: { rho20: 0.017241, alpha: 0.00393, source: "100 % IACS annealed copper, NBS Handbook 100 (https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf)" },
  cca: { rho20: 0.02743, alpha: 0.004, source: "10 % copper-clad aluminium, ASTM B566 class 10A maximum (MWS Wire, Ulbrich datasheets); alpha 0.0040 is an assumption (aluminium dominated)" },
};
/** CCA ampacity = copper ampacity x sqrt(rho_Cu / rho_CCA) (same I^2 R heating). DERIVED physics, no standard gives CCA ampacity (research B4). */
export const CCA_AMPACITY_FACTOR = Math.sqrt(CONDUCTORS.copper.rho20 / CONDUCTORS.cca.rho20);

export interface AwgRow { size: string; dMm: number; areaMm2: number; saeMinMm2?: number; out105?: number; eng105?: number; out90?: number }
/** AWG / B&S table (research B2; ABYC E-11 2003 Table IV ampacity at 105 C and 90 C insulation, Table XII SAE minimum areas).
 * eng105 = "inside engine spaces" (50 C ambient). 5 and 3 AWG have no ABYC ampacity, so they are never recommended. */
export const AWG_TABLE: AwgRow[] = [
  { size: "18", dMm: 1.024, areaMm2: 0.82, saeMinMm2: 0.78, out105: 20, eng105: 17.0, out90: 20 },
  { size: "16", dMm: 1.291, areaMm2: 1.31, saeMinMm2: 1.18, out105: 25, eng105: 21.3, out90: 25 },
  { size: "14", dMm: 1.628, areaMm2: 2.08, saeMinMm2: 1.88, out105: 35, eng105: 29.8, out90: 30 },
  { size: "12", dMm: 2.053, areaMm2: 3.31, saeMinMm2: 2.96, out105: 45, eng105: 38.3, out90: 40 },
  { size: "10", dMm: 2.588, areaMm2: 5.26, saeMinMm2: 4.73, out105: 60, eng105: 51.0, out90: 55 },
  { size: "8", dMm: 3.264, areaMm2: 8.37, saeMinMm2: 7.5, out105: 80, eng105: 68.0, out90: 70 },
  { size: "6", dMm: 4.115, areaMm2: 13.3, saeMinMm2: 12.43, out105: 120, eng105: 102, out90: 100 },
  { size: "5", dMm: 4.621, areaMm2: 16.77 },
  { size: "4", dMm: 5.189, areaMm2: 21.15, saeMinMm2: 18.93, out105: 160, eng105: 136, out90: 135 },
  { size: "3", dMm: 5.827, areaMm2: 26.67 },
  { size: "2", dMm: 6.544, areaMm2: 33.63, saeMinMm2: 31.64, out105: 210, eng105: 178, out90: 180 },
  { size: "1", dMm: 7.348, areaMm2: 42.41, saeMinMm2: 39.42, out105: 245, eng105: 208, out90: 210 },
  { size: "1/0", dMm: 8.251, areaMm2: 53.48, saeMinMm2: 50.15, out105: 285, eng105: 242, out90: 245 },
  { size: "2/0", dMm: 9.266, areaMm2: 67.43, saeMinMm2: 63.39, out105: 330, eng105: 280, out90: 285 },
  { size: "3/0", dMm: 10.405, areaMm2: 85.03, saeMinMm2: 80.36, out105: 385, eng105: 327, out90: 330 },
  { size: "4/0", dMm: 11.684, areaMm2: 107.22, saeMinMm2: 104.13, out105: 445, eng105: 378, out90: 385 },
];
/** Sizes the calculator recommends from (thin to thick), as cable_calc.py SIZES. */
export const AWG_SIZES = AWG_TABLE.filter((r) => r.out105 !== undefined).map((r) => r.size);
const AWG = new Map(AWG_TABLE.map((r) => [r.size, r]));
/** Metric (ISO) sizes, 105 C insulation, ISO/FDIS 10133 as quoted in ABYC E-11 AP Table 2 (research B2): mm2 -> A. */
export const ISO_105C: [number, number][] = [[0.75, 16], [1.0, 20], [1.5, 25], [2.5, 35], [4, 45], [6, 60], [10, 90], [16, 130], [25, 170], [35, 210], [50, 270], [70, 330], [95, 390], [120, 450]];
/** Engine-space factor applied to the ISO and 90 C figures: 0.85 = the ratio of ABYC's inside / outside engine columns at
 * 105 C (17/20, 136/160, 102/120). DERIVED by B4A, not a published figure for those columns. */
export const ENGINE_SPACE_FACTOR = 0.85;
/** Stocked fuse ratings (A) the calculator rounds up to (research B5, cable_calc.py ANL list). */
export const FUSE_RATINGS = [35, 40, 50, 60, 80, 100, 125, 150, 175, 200, 225, 250, 300, 325, 350, 400, 500];
/** Design efficiency for P/(eta V) by amplifier class (research B3: reproduces Rockford's own maximum current figures). */
export const ETA_DESIGN: Record<string, number> = { D: 0.5, BD: 0.5, AD: 0.5, AB: 0.45 };
/** Australian "mm" auto cable labels are overall size, not conductor area (research B2, retailer table). */
export const AU_MM_LABEL_TO_MM2: Record<string, number> = { "3": 1.13, "4": 1.84, "5": 2.9, "6": 4.59 };
/** Fuse placement (research B5): ABYC E-11.12.1.2 175 mm; 1830 mm when sheathed from the battery; loosest maker figure MTX 457 mm, AudioControl 305 mm. */
export const FUSE_DISTANCE = { abycMm: 175, sheathedMaxMm: 1830, makerMaxMm: 457, audiocontrolMm: 305 };
/** Roger Russell (McIntosh) speaker wire rule: wire loop resistance <= 5 % of the rated load impedance. */
export const SPEAKER_WIRE_FRACTION = 0.05;

// ---------------------------------------------------------------------------------------------------------------- options
export interface CableOptions {
  /** Supply voltage at the amplifiers (research B3: 13.8 V engine running; 12.6 / 14.4 are the other choices). */
  supplyV: number;
  /** Allowed total drop: "pct" = dropPct % of supplyV (ABYC E-11.16.1.2.7, default 3 %); "0.5V" = 0.5 V (installer target, NO primary source). */
  dropMode: "pct" | "0.5V";
  dropPct: number;
  /** Share of the total allowed drop given to a run that ends at a distribution block (2/3 = 2 % of 3 %, research B6 / E2). */
  mainShare: number;
  /** Conductor temperature for power-run drop (C). Research B2 default 50 C (assumption: warm cabin / boot). */
  tempC: number;
  /** Conductor temperature for speaker cable (C), 20 C as in research E3. */
  speakerTempC: number;
  material: Material;
  location: Location;
  insulationC: Insulation;
  /** Fuse rating allowed as a percentage of the wire ampacity: 100 (default) up to ABYC's 150 % ceiling (E-11.12.1.4). */
  fuseMaxPct: number;
  /** Amplifier output resistance used for the damping factor when none is given (research E3 assumption: 0.02 ohm). */
  ampROutOhm: number;
  /** Speaker wire loop resistance limit as a fraction of the load (Roger Russell 5 %). */
  speakerFraction: number;
  /** Capacitor usable-energy window: charged at capHighV, discharged to capLowV (14.4 V charging, 12.6 V rested battery). */
  capHighV: number;
  capLowV: number;
  /** Precharge resistor when none is given (ohm); research B7 example 1 kohm. */
  prechargeOhm: number;
}
export const DEFAULT_OPTIONS: CableOptions = {
  supplyV: 13.8, dropMode: "pct", dropPct: 3, mainShare: 2 / 3, tempC: 50, speakerTempC: 20, material: "copper", location: "outside",
  insulationC: 105, fuseMaxPct: 100, ampROutOhm: 0.02, speakerFraction: SPEAKER_WIRE_FRACTION, capHighV: 14.4, capLowV: 12.6, prechargeOhm: 1000,
};
export const withDefaults = (o?: Partial<CableOptions>): CableOptions => ({ ...DEFAULT_OPTIONS, ...(o ?? {}) });
/** Allowed total loop drop in volts for the options. */
export const allowedDropV = (o: CableOptions): number => (o.dropMode === "0.5V" ? 0.5 : (o.supplyV * o.dropPct) / 100);

// ---------------------------------------------------------------------------------------------------------------- basic rules
/** Resistance per metre (ohm/m) of one conductor: rho20 (1 + alpha (T - 20)) / A. */
export function rPerM(areaMm2: number, mat: Material = "copper", tC = 50): number {
  const c = CONDUCTORS[mat];
  return (c.rho20 * (1 + c.alpha * (tC - 20))) / areaMm2;
}
/** ABYC Table VII ratios when more than two conductors are bundled over 610 mm: 3 x 0.70, 4-6 x 0.60, 7-24 x 0.50. */
export const bundlingFactor = (n = 2): number => (n <= 2 ? 1 : n === 3 ? 0.7 : n <= 6 ? 0.6 : 0.5);
export interface AmpacityOpts { location?: Location; material?: Material; bundled?: number; insulationC?: Insulation }
/** Ampacity of a standard AWG size (A), or undefined for sizes ABYC does not list (5, 3). */
export function ampacityAwg(size: string, o: AmpacityOpts = {}): number | undefined {
  const r = AWG.get(normAwg(size) ?? ""); if (!r || r.out105 === undefined) return undefined;
  const ins = o.insulationC ?? 105, loc = o.location ?? "outside";
  let a = ins === 105 ? (loc === "outside" ? r.out105 : r.eng105!) : loc === "outside" ? r.out90! : r.out90! * ENGINE_SPACE_FACTOR;
  a *= bundlingFactor(o.bundled ?? 2);
  if ((o.material ?? "copper") === "cca") a *= CCA_AMPACITY_FACTOR;
  return a;
}
/** Ampacity of a metric (ISO) size (A), 105 C basis; the engine column and 90 C insulation use DERIVED factors. */
export function ampacityMetric(mm2: number, o: AmpacityOpts = {}): number | undefined {
  const row = ISO_105C.find(([a]) => Math.abs(a - mm2) < 1e-9); if (!row) return undefined;
  let a = row[1];
  if ((o.location ?? "outside") === "engine") a *= ENGINE_SPACE_FACTOR;
  if ((o.insulationC ?? 105) === 90) a *= 0.86; // DERIVED: average ABYC 90 C / 105 C outside ratio (135/160, 245/285, 70/80, 100/120)
  a *= bundlingFactor(o.bundled ?? 2);
  if ((o.material ?? "copper") === "cca") a *= CCA_AMPACITY_FACTOR;
  return a;
}
/** Ampacity of any conductor area (a real product): that of the largest standard AWG whose area is not above it (a safe step down). */
export function ampacityForArea(areaMm2: number, o: AmpacityOpts = {}): { ampacityA: number; basisAwg: string } | undefined {
  let best: AwgRow | undefined;
  for (const r of AWG_TABLE) if (r.out105 !== undefined && r.areaMm2 <= areaMm2 + 1e-9) best = r;
  if (!best) return undefined;
  return { ampacityA: ampacityAwg(best.size, o)!, basisAwg: best.size };
}
/** "1/0", "0", "0 AWG", "1/0 AWG", "4 B&S", "2/0" -> canonical AWG size string, or undefined. */
export function normAwg(s: string | number | undefined | null): string | undefined {
  if (s === undefined || s === null) return undefined;
  let t = String(s).trim().toUpperCase().replace(/\s*(AWG|GAUGE|GA|B&S|B ?& ?S)\s*$/, "").trim();
  if (/^0+$/.test(t)) t = String(t.length) + "/0"; // "0" = 1/0, "00" = 2/0
  const m = /^(\d)\/0$/.exec(t); if (m) return `${m[1]}/0`;
  if (/^\d{1,2}$/.test(t) && AWG.has(String(+t))) return String(+t);
  return undefined;
}
export const awgInfo = (size: string): AwgRow | undefined => AWG.get(normAwg(size) ?? "");
/** Australian auto cable "6 mm" label -> conductor mm2 (overall-size label, research B2). undefined when not in the table. */
export function auMmLabelToMm2(label: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*mm\s*$/i.exec(label); if (!m) return undefined;
  return AU_MM_LABEL_TO_MM2[String(+m[1])];
}
/** Thickness order of an AWG size (larger = thicker). */
const awgRank = (s: string) => AWG_TABLE.findIndex((r) => r.size === normAwg(s));
/** Smallest stocked fuse rating at or above i. */
export function nextFuse(i: number, ratings = FUSE_RATINGS): number | undefined { return ratings.find((f) => f >= i - 1e-9); }

// ---------------------------------------------------------------------------------------------------------------- amplifier current
export interface LoadInput {
  id: string; name?: string;
  /** "amplifier" (default) or "dsp" (a processor's own draw). */
  kind?: "amplifier" | "dsp";
  /** Class as the maker writes it ("D", "Class BD", "Class A/B"...). Unknown = D (0.50). */
  cls?: string;
  /** Total rated RMS power of all channels at the load the amp actually sees (W). */
  rmsTotalW?: number;
  /** Load the amp sees (ohm), for the record. */
  loadOhm?: number;
  /** Maker maximum current draw (A) and its label (e.g. "Max. Current Draw (13.8 V sinewave)"). */
  iMaxA?: number; iMaxLabel?: string;
  /** Maker average music current (A). */
  iMusicA?: number;
  /** Maker fuse rating (fuse on the amp or recommended fuse) (A). */
  fuseA?: number;
  /** Maker power wire gauge (AWG) and suggested alternator (A), shown next to the calculated values. */
  powerWireAwgMaker?: string; suggestedAlternatorA?: number;
  /** Supply voltage for the formula (default options.supplyV). */
  v?: number;
  notes?: string[];
}
export interface LoadCurrent { id: string; name?: string; maxA: number; musicA: number; source: "maker max" | "maker fuse" | "formula" | "none"; how: string; eta?: number; notes: string[] }
/** Normalise a maker class text to D / BD / AD / AB; mixed classes take the lowest eta (safe). */
export function ampClass(cls?: string): { cls: string; eta: number; known: boolean } {
  const t = (cls ?? "").toUpperCase().replace(/CLASS|[-\s()]/g, "");
  const found: string[] = [];
  if (/A\/?B/.test(t)) found.push("AB");
  if (/BD/.test(t)) found.push("BD");
  if (/A\/?D/.test(t)) found.push("AD");
  if (!found.length && /D/.test(t)) found.push("D");
  if (!found.length) return { cls: "D", eta: ETA_DESIGN.D, known: false };
  const c = found.sort((a, b) => ETA_DESIGN[a] - ETA_DESIGN[b])[0];
  return { cls: c, eta: ETA_DESIGN[c], known: true };
}
/** Design (maximum) and music-average current of one load. Order (research B3): maker maximum, maker fuse, P/(eta V). Music = maker figure or half the maximum. */
export function loadCurrent(l: LoadInput, o: Partial<CableOptions> = {}): LoadCurrent {
  const opt = withDefaults(o), v = l.v ?? opt.supplyV, notes = [...(l.notes ?? [])];
  let maxA = 0, source: LoadCurrent["source"] = "none", how = "no current, fuse or power given", eta: number | undefined;
  if (l.iMaxA && l.iMaxA > 0) { maxA = l.iMaxA; source = "maker max"; how = `maker maximum current draw${l.iMaxLabel ? ` (${l.iMaxLabel})` : ""}`; }
  else if (l.fuseA && l.fuseA > 0) { maxA = l.fuseA; source = "maker fuse"; how = "maker fuse rating (an upper bound on the draw the maker expects)"; }
  else if (l.rmsTotalW && l.rmsTotalW > 0) {
    const c = ampClass(l.cls); eta = c.eta; maxA = l.rmsTotalW / (eta * v); source = "formula";
    how = `P / (eta x V) = ${l.rmsTotalW} W / (${eta} x ${v} V), class ${c.cls}${c.known ? "" : " assumed (class not given)"}`;
  }
  const musicA = l.iMusicA && l.iMusicA > 0 ? l.iMusicA : maxA / 2;
  if (!(l.iMusicA && l.iMusicA > 0) && maxA > 0) notes.push("Music average taken as half the maximum (Rockford convention, research B3).");
  if (source === "none") notes.push(`${l.name ?? l.id}: no current draw, fuse rating or power known; it adds 0 A.`);
  return { id: l.id, name: l.name, maxA, musicA, source, how, eta, notes };
}

// ---------------------------------------------------------------------------------------------------------------- run sizing
export interface SizeParams {
  iA: number; fuseA: number; lengthM: number; groundLengthM?: number; allowedV: number; extraDropV?: number;
  material?: Material; location?: Location; bundled?: number; tempC?: number; insulationC?: Insulation; fuseMaxPct?: number;
}
export interface SizeResult { system: "awg" | "metric"; size: string; areaMm2: number; ampacityA: number; loopOhm: number; dropV: number; totalDropV: number; allowedV: number; material: Material }
function sizeFrom(system: "awg" | "metric", list: { size: string; areaMm2: number; amp: (o: AmpacityOpts) => number | undefined }[], p: SizeParams): SizeResult | undefined {
  const mat = p.material ?? "copper", t = p.tempC ?? 50, len = p.lengthM + (p.groundLengthM ?? 0), pct = (p.fuseMaxPct ?? 100) / 100;
  for (const s of list) {
    const amp = s.amp({ location: p.location, material: mat, bundled: p.bundled, insulationC: p.insulationC }); if (amp === undefined) continue;
    const R = rPerM(s.areaMm2, mat, t) * len, d = p.iA * R, total = d + (p.extraDropV ?? 0);
    if (amp * pct >= p.fuseA - 1e-9 && total <= p.allowedV + 1e-12) return { system, size: s.size, areaMm2: s.areaMm2, ampacityA: amp, loopOhm: R, dropV: d, totalDropV: total, allowedV: p.allowedV, material: mat };
  }
  return undefined;
}
/** Smallest standard AWG with ampacity >= fuse (x fuseMaxPct) and I x R(power + ground) + extra <= allowed (cable_calc.py size_power_run). */
export const sizeRunAwg = (p: SizeParams) => sizeFrom("awg", AWG_SIZES.map((s) => ({ size: s, areaMm2: AWG.get(s)!.areaMm2, amp: (o: AmpacityOpts) => ampacityAwg(s, o) })), p);
/** Same for metric (ISO) sizes. */
export const sizeRunMetric = (p: SizeParams) => sizeFrom("metric", ISO_105C.map(([a]) => ({ size: `${a} mm2`, areaMm2: a, amp: (o: AmpacityOpts) => ampacityMetric(a, o) })), p);
/** Drop of a given AWG at a current over a loop length (V). */
export const dropAwg = (size: string, iA: number, loopM: number, mat: Material = "copper", tC = 50) => iA * rPerM(awgInfo(size)!.areaMm2, mat, tC) * loopM;

export interface FuseCheck { level: Level; code: string; text: string }
export type Level = "error" | "warn" | "info";
export interface Warning { level: Level; code: string; text: string }
/** Fuse rule (research B5): rating >= load current, <= wire ampacity (x fuseMaxPct), never above ABYC's 150 % ceiling. */
export function checkFuse(fuseA: number, loadA: number, ampacityA: number, fuseMaxPct = 100): Warning[] {
  const w: Warning[] = [];
  if (fuseA < loadA - 1e-9) w.push({ level: "warn", code: "fuse-below-load", text: `Fuse ${fuseA} A is below the ${r1(loadA)} A design current: it may blow at full power.` });
  if (fuseA > ampacityA * 1.5 + 1e-9) w.push({ level: "error", code: "fuse-over-abyc-ceiling", text: `Fuse ${fuseA} A is above 150 % of the wire ampacity (${r1(ampacityA)} A): the fuse does not protect this wire (ABYC E-11.12.1.4).` });
  else if (fuseA > ampacityA * (fuseMaxPct / 100) + 1e-9) w.push({ level: "warn", code: "fuse-over-ampacity", text: `Fuse ${fuseA} A is above the wire ampacity ${r1(ampacityA)} A${fuseMaxPct > 100 ? ` x ${fuseMaxPct} %` : ""}: use a thicker wire or a smaller fuse.` });
  return w;
}
/** Main fuse distance from the battery (research B5). */
export function checkFuseDistance(mm: number | undefined, sheathed = false): Warning[] {
  if (mm === undefined || !(mm >= 0)) return [{ level: "info", code: "fuse-distance-unknown", text: `Fit the main fuse within ${FUSE_DISTANCE.abycMm} mm of the battery terminal, measured along the cable (ABYC E-11.12.1.2).` }];
  if (mm <= FUSE_DISTANCE.abycMm) return [];
  if (sheathed && mm <= FUSE_DISTANCE.sheathedMaxMm) return [{ level: "info", code: "fuse-distance-sheathed", text: `Fuse ${mm} mm from the battery: allowed by ABYC only because the cable is in a sheath or conduit all the way from the battery (up to ${FUSE_DISTANCE.sheathedMaxMm} mm).` }];
  if (mm <= FUSE_DISTANCE.makerMaxMm) return [{ level: "warn", code: "fuse-distance-over-abyc", text: `Fuse ${mm} mm from the battery: ABYC asks for ${FUSE_DISTANCE.abycMm} mm or less; makers allow ${FUSE_DISTANCE.audiocontrolMm} mm (AudioControl) to ${FUSE_DISTANCE.makerMaxMm} mm (MTX). Move it closer.` }];
  return [{ level: "error", code: "fuse-distance-too-far", text: `Fuse ${mm} mm from the battery: beyond every maker figure (${FUSE_DISTANCE.makerMaxMm} mm, MTX) and ABYC's ${FUSE_DISTANCE.abycMm} mm. The cable before the fuse is unprotected.` }];
}

// ---------------------------------------------------------------------------------------------------------------- system input
/** A cable the user chose (or the cable item holds): checked instead of only recommended. */
export interface CableChoice { size?: string; areaMm2?: number; material?: Material; partId?: string; label?: string; areaBasis?: string }
export interface RunInput {
  id: string; name?: string;
  /** Positive run length (m) and ground return length for this run (m). */
  lengthM: number; groundLengthM?: number;
  material?: Material; location?: Location; bundled?: number;
  /** Cable already chosen, to check. */
  cable?: CableChoice;
  /** Fuse at the start of this run (A). For a run from the battery: the main fuse. undefined = recommended. */
  fuseA?: number;
  /** false = no fuse at the start of this run (only meaningful for branches of an unfused distribution block). */
  fused?: boolean;
  /** Distance of the main fuse from the battery (mm), sheathed cable exception (only for runs from the battery). */
  fuseDistanceMm?: number; fuseSheathed?: boolean;
  /** Item ids for the UI / diagram. */
  cableItemIds?: string[]; fuseItemId?: string;
  /** Capacitors at the load end of this run (ids of CapInput). */
  capacitorIds?: string[];
  to: { load: string } | { junction: JunctionInput } | { none: true };
}
export interface JunctionInput { id: string; name?: string; fused: boolean; branchFuseA?: number; branches: RunInput[] }
export interface CapInput { id: string; name?: string; farads?: number; ratedV?: number; prechargeOhm?: number; loadId?: string }
export interface SpeakerInput { id: string; name?: string; loadId?: string; lengthM: number; loadOhm?: number; material?: Material; rOutOhm?: number; size?: string; powerW?: number; cableItemId?: string; targetItemId?: string }
export interface Big3Input { altPosM?: number; batNegM?: number; engineGroundM?: number; material?: Material }
export interface CableSystemInput {
  options?: Partial<CableOptions>;
  loads: LoadInput[];
  /** Runs leaving the battery (each with its own main fuse). */
  feeds: RunInput[];
  capacitors?: CapInput[];
  speakers?: SpeakerInput[];
  alternator?: { ratingA?: number; vehicleLoadA?: number };
  big3?: Big3Input;
  /** Problems found while building the input from a project (shown with the results). */
  warnings?: Warning[];
}

// ---------------------------------------------------------------------------------------------------------------- system result
export interface CableCheck { size?: string; areaMm2: number; material: Material; ampacityA?: number; ampacityBasis: string; loopOhm: number; dropV: number; totalDropV: number; ok: boolean; label?: string; partId?: string; areaBasis?: string }
export interface RunResult {
  id: string; name?: string; depth: number; parentId?: string;
  endsAt: "load" | "junction" | "none"; loadIds: string[];
  lengthM: number; groundLengthM: number;
  maxA: number; musicA: number;
  /** Fuse at the start of this run: rating used for the wire (chosen or recommended), recommended, or the upstream fuse protecting an unfused branch. */
  fused: boolean; fuseA?: number; fuseRecommendedA?: number; protectedByA?: number;
  allowedV: number; upstreamDropV: number;
  recommended: { awg: { copper?: SizeResult; cca?: SizeResult }; metric: { copper?: SizeResult; cca?: SizeResult } };
  /** The chosen cable, checked (when one is given). */
  chosen?: CableCheck;
  /** Figures for the cable used downstream (chosen, else recommended AWG in the run material). */
  used?: { size?: string; areaMm2: number; material: Material; dropV: number; dropPct: number; dropMusicV: number; lossW: number; lossMusicW: number; totalDropV: number; totalDropPct: number };
  makerWireAwg?: string;
  warnings: Warning[];
}
export interface CapResult { id: string; name?: string; farads?: number; energyJ?: number; usableJ?: number; holdupMs?: number; tauS?: number; fullChargeS?: number; inrushA?: number; resistorPeakW?: number; ruleOfThumbF?: number; notes: string[]; warnings: Warning[] }
export interface SpeakerRow { size: string; loopOhm: number; pctOfZ: number; lossDb: number; powerLostPct: number; dampingFactor?: number }
export interface SpeakerResult { id: string; name?: string; loadId?: string; lengthM: number; loadOhm?: number; material: Material; recommendedAwg?: string; recommended?: SpeakerRow; chosen?: SpeakerRow; currentA?: number; rows: SpeakerRow[]; warnings: Warning[] }
export interface CableSystemResult {
  options: CableOptions; allowedV: number;
  loads: LoadCurrent[]; totalMaxA: number; totalMusicA: number;
  runs: RunResult[]; capacitors: CapResult[]; speakers: SpeakerResult[];
  alternator?: { ratingA?: number; spareA?: number; suggestedSumA?: number; warnings: Warning[] };
  big3?: { runs: { name: string; lengthM: number; awg?: SizeResult; size?: string }[]; warnings: Warning[] };
  warnings: Warning[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const fmtV = (x: number) => x.toFixed(3);

function loadsBelow(run: RunInput): string[] {
  if ("load" in run.to) return [run.to.load];
  if ("junction" in run.to) return run.to.junction.branches.flatMap(loadsBelow);
  return [];
}

/** B7: is the upstream drop the cause when a branch cannot be sized? leftV = total budget minus the upstream drop; cause = the
 * upstream drop leaves under 10 % of the budget, or the branch could be sized if the upstream run dropped nothing (aloneOk). */
export function upstreamBudget(upstreamDropV: number, allowedV: number, aloneAllowedV: number, base: Parameters<typeof sizeRunAwg>[0]): { leftV: number; aloneOk: boolean; cause: boolean } {
  const leftV = allowedV - upstreamDropV;
  const aloneOk = !!sizeRunAwg({ ...base, allowedV: aloneAllowedV, extraDropV: 0 });
  return { leftV, aloneOk, cause: upstreamDropV > 0 && (leftV < 0.1 * allowedV || aloneOk) };
}

/** The whole calculation over a power chain (research B1 order: current, fuse, ampacity, drop, branches, speakers). */
export function calcCableSystem(input: CableSystemInput): CableSystemResult {
  const o = withDefaults(input.options), allowed = allowedDropV(o);
  const loads = input.loads.map((l) => loadCurrent(l, o));
  const byId = new Map(loads.map((l) => [l.id, l]));
  const loadIn = new Map(input.loads.map((l) => [l.id, l]));
  const runs: RunResult[] = [];
  const warnings: Warning[] = [...(input.warnings ?? [])];
  if (o.dropMode === "0.5V") warnings.push({ level: "info", code: "drop-0.5v", text: "Drop limit 0.5 V: a common installer target with no primary source found (research B4). ABYC E-11 asks for 3 %." });

  const walk = (run: RunInput, depth: number, upstreamDropV: number, upstreamFuseA: number | undefined, parentId: string | undefined, fromBattery: boolean, junctionFused: boolean | undefined, parentName?: string) => {
    const ids = loadsBelow(run);
    const maxA = ids.reduce((s, id) => s + (byId.get(id)?.maxA ?? 0), 0);
    const musicA = ids.reduce((s, id) => s + (byId.get(id)?.musicA ?? 0), 0);
    const w: Warning[] = [];
    const endsAt: RunResult["endsAt"] = "load" in run.to ? "load" : "junction" in run.to ? "junction" : "none";
    const mat = run.material ?? run.cable?.material ?? o.material, loc = run.location ?? o.location;
    const ground = run.groundLengthM ?? 0;
    // Fuse at the start of this run.
    let fused = run.fused ?? (fromBattery ? true : junctionFused ?? true);
    if (fromBattery && run.fused === false) w.push({ level: "error", code: "no-main-fuse", text: "No fuse at the battery: every positive run from the battery needs one (ABYC E-11.12.1.2)." });
    const fuseRecommendedA = maxA > 0 ? nextFuse(maxA) : undefined;
    if (maxA > 0 && fuseRecommendedA === undefined) w.push({ level: "error", code: "current-over-fuse-list", text: `Design current ${r1(maxA)} A is above the largest stocked fuse (${FUSE_RATINGS[FUSE_RATINGS.length - 1]} A): split the system into several fused runs.` });
    const fuseA = fused ? run.fuseA ?? fuseRecommendedA : undefined;
    const protectA = fused ? fuseA : upstreamFuseA; // the fuse the wire must be able to carry
    if (!fused && !fromBattery) w.push({ level: "info", code: "branch-unfused", text: `This branch has no fuse of its own, so its wire must carry the upstream fuse (${protectA ?? "?"} A). A fused distribution block lets the branch wire be sized for its own fuse (ABYC E-11.12.1.5).` });
    const runAllowed = endsAt === "junction" ? Math.min(allowed * o.mainShare, allowed - upstreamDropV) : allowed;
    const extra = endsAt === "junction" ? 0 : upstreamDropV;
    const base = { iA: maxA, fuseA: protectA ?? maxA, lengthM: run.lengthM, groundLengthM: ground, allowedV: endsAt === "junction" ? runAllowed : allowed, extraDropV: extra, location: loc, bundled: run.bundled, tempC: o.tempC, insulationC: o.insulationC, fuseMaxPct: o.fuseMaxPct };
    const recommended = {
      awg: { copper: sizeRunAwg({ ...base, material: "copper" }), cca: sizeRunAwg({ ...base, material: "cca" }) },
      metric: { copper: sizeRunMetric({ ...base, material: "copper" }), cca: sizeRunMetric({ ...base, material: "cca" }) },
    };
    // B7: the upstream run(s) may already use (nearly) the whole drop budget; then no branch size can help, and the message
    // names the upstream run as the cause instead of telling the user to shorten this branch.
    const upName = parentName ?? parentId ?? "before this one";
    const upBudget = upstreamDropV > 0 ? upstreamBudget(upstreamDropV, allowed, endsAt === "junction" ? allowed * o.mainShare : allowed, { ...base, material: mat }) : undefined;
    if (maxA > 0 && !recommended.awg[mat] && upBudget?.cause) w.push({ level: "error", code: "upstream-budget", text: `The upstream run ${upName}${depth > 1 ? " (with the runs before it)" : ""} already uses ${fmtV(upstreamDropV)} V of the ${fmtV(allowed)} V drop allowed${upBudget.leftV <= 0 ? ", the whole budget" : `, leaving ${fmtV(upBudget.leftV)} V for this branch`}, so no cable size on this branch can meet the limit. Use a thicker or shorter upstream run (${upName}), or move the distribution block nearer the amplifiers.${upBudget.aloneOk ? "" : ` Even with no upstream drop, no size up to 4/0 AWG in ${mat === "cca" ? "CCA" : "copper"} meets this branch's ${protectA ?? "?"} A fuse and drop: shorten this branch too.`}` });
    else if (maxA > 0 && !recommended.awg[mat]) w.push({ level: "error", code: "no-size-fits", text: `No standard size up to 4/0 AWG in ${mat === "cca" ? "CCA" : "copper"} meets both the ${protectA ?? "?"} A fuse and the ${fmtV(base.allowedV)} V drop: shorten the run, use copper, or split it into parallel runs.` });
    // The chosen cable.
    let chosen: CableCheck | undefined;
    if (run.cable && (run.cable.size || run.cable.areaMm2)) {
      const cm = run.cable.material ?? mat, size = normAwg(run.cable.size);
      const area = run.cable.areaMm2 ?? (size ? awgInfo(size)!.areaMm2 : 0);
      if (area > 0) {
        const aw = size && run.cable.areaMm2 === undefined ? { ampacityA: ampacityAwg(size, { location: loc, material: cm, bundled: run.bundled, insulationC: o.insulationC }), basisAwg: size } : ampacityForArea(area, { location: loc, material: cm, bundled: run.bundled, insulationC: o.insulationC });
        const R = rPerM(area, cm, o.tempC) * (run.lengthM + ground), d = maxA * R, total = d + extra;
        const lim = endsAt === "junction" ? runAllowed : allowed;
        const ampOk = aw?.ampacityA !== undefined && protectA !== undefined ? aw.ampacityA * (o.fuseMaxPct / 100) >= protectA - 1e-9 : true;
        chosen = { size, areaMm2: area, material: cm, ampacityA: aw?.ampacityA, ampacityBasis: aw ? `ABYC E-11 Table IV for ${aw.basisAwg} AWG${cm === "cca" ? " x CCA factor (derived)" : ""}` : "below the smallest table size", loopOhm: R, dropV: d, totalDropV: total, ok: ampOk && total <= lim + 1e-12, label: run.cable.label, partId: run.cable.partId, areaBasis: run.cable.areaBasis };
        if (total > lim + 1e-12) w.push({ level: "warn", code: "chosen-drop", text: `The chosen cable drops ${fmtV(total)} V${extra ? ` (including ${fmtV(extra)} V on the upstream run ${upName})` : ""} at ${r1(maxA)} A, over the ${fmtV(lim)} V allowed.${extra && upBudget?.cause ? ` The upstream run ${upName} already uses ${upBudget.leftV <= 0 ? "the whole" : "nearly all the"} budget: use a thicker or shorter upstream run first.` : ""}` });
        if (protectA !== undefined && aw?.ampacityA !== undefined) w.push(...checkFuse(protectA, fused ? maxA : 0, aw.ampacityA, o.fuseMaxPct).filter((x) => x.code !== "fuse-below-load"));
        if (!aw) w.push({ level: "error", code: "chosen-too-thin", text: `The chosen cable (${r1(area)} mm2) is thinner than 18 AWG: no ampacity figure.` });
      }
    }
    if (fused && fuseA !== undefined && maxA > 0 && fuseA < maxA - 1e-9) w.push(...checkFuse(fuseA, maxA, Infinity));
    // Figures for the cable used downstream.
    const rec = recommended.awg[mat];
    let used: RunResult["used"];
    const pick = chosen ? { size: chosen.size, areaMm2: chosen.areaMm2, material: chosen.material } : rec ? { size: rec.size, areaMm2: rec.areaMm2, material: rec.material } : undefined;
    if (pick) {
      const R = rPerM(pick.areaMm2, pick.material, o.tempC) * (run.lengthM + ground), d = maxA * R, dm = musicA * R;
      used = { ...pick, dropV: d, dropPct: (100 * d) / o.supplyV, dropMusicV: dm, lossW: maxA * maxA * R, lossMusicW: musicA * musicA * R, totalDropV: d + upstreamDropV, totalDropPct: (100 * (d + upstreamDropV)) / o.supplyV };
    }
    if (fromBattery && fused) w.push(...checkFuseDistance(run.fuseDistanceMm, run.fuseSheathed));
    if (endsAt === "load" && ground === 0) w.push({ level: "warn", code: "ground-length-unknown", text: "No ground return length: the drop check covers the positive run only. Enter the ground cable length (keep it short, to bare chassis, same gauge as the power wire)." });
    let makerWireAwg: string | undefined;
    if (endsAt === "load") {
      const L = loadIn.get(ids[0]); makerWireAwg = normAwg(L?.powerWireAwgMaker);
      const usedSize = used?.size;
      if (makerWireAwg && usedSize && awgRank(usedSize) > awgRank(makerWireAwg)) w.push({ level: "info", code: "maker-wire-thinner", text: `The maker suggests ${makerWireAwg} AWG; this run needs ${usedSize} AWG for its length, fuse and the ${o.dropMode === "0.5V" ? "0.5 V" : `${o.dropPct} %`} drop limit. The maker figure suits short runs and music use.` });
      if (makerWireAwg && usedSize && awgRank(usedSize) < awgRank(makerWireAwg)) w.push({ level: "info", code: "maker-wire-thicker", text: `The maker suggests ${makerWireAwg} AWG, thicker than the calculated ${usedSize} AWG: the maker's size is the safe choice.` });
      for (const cid of run.capacitorIds ?? []) w.push({ level: "info", code: "capacitor-wiring", text: `Capacitor ${input.capacitors?.find((c) => c.id === cid)?.name ?? cid}: wire it with the same gauge as this run, as close as possible to the amplifier's power terminal, after the main fuse (research B7).` });
    }
    const res: RunResult = { id: run.id, name: run.name, depth, parentId, endsAt, loadIds: ids, lengthM: run.lengthM, groundLengthM: ground, maxA, musicA, fused, fuseA, fuseRecommendedA, protectedByA: fused ? undefined : upstreamFuseA, allowedV: endsAt === "junction" ? runAllowed : allowed, upstreamDropV, recommended, chosen, used, makerWireAwg, warnings: w };
    runs.push(res);
    if ("junction" in run.to) {
      const j = run.to.junction, down = upstreamDropV + (used?.dropV ?? 0);
      for (const b of j.branches) walk({ ...b, fuseA: b.fuseA ?? j.branchFuseA }, depth + 1, down, protectA, run.id, false, j.fused, run.name ?? run.id);
    }
  };
  for (const f of input.feeds) walk(f, 0, 0, undefined, undefined, true, undefined);

  const reached = new Set(runs.flatMap((r) => r.loadIds));
  for (const l of loads) if (!reached.has(l.id)) warnings.push({ level: "warn", code: "load-not-powered", text: `${l.name ?? l.id} is not reached by any power run from the battery: link battery -> fuse -> cable -> amplifier.` });
  const totalMaxA = loads.reduce((s, l) => s + l.maxA, 0), totalMusicA = loads.reduce((s, l) => s + l.musicA, 0);

  // Capacitors.
  const capacitors = (input.capacitors ?? []).map((c) => capacitor(c.farads, { ...o, prechargeOhm: c.prechargeOhm ?? o.prechargeOhm, ratedV: c.ratedV, ampMaxA: c.loadId ? byId.get(c.loadId)?.maxA : undefined, ampRmsW: c.loadId ? loadIn.get(c.loadId)?.rmsTotalW : undefined, id: c.id, name: c.name }));

  // Speakers.
  const speakers = (input.speakers ?? []).map((s) => speakerRun(s, o));

  // Alternator.
  let alternator: CableSystemResult["alternator"];
  const sugg = input.loads.filter((l) => l.suggestedAlternatorA).reduce((s, l) => s + l.suggestedAlternatorA!, 0) || undefined;
  if (input.alternator?.ratingA || sugg) {
    const aw: Warning[] = [], rating = input.alternator?.ratingA, base = input.alternator?.vehicleLoadA;
    const spare = rating !== undefined ? rating - (base ?? 0) : undefined;
    if (rating !== undefined && base === undefined) aw.push({ level: "info", code: "vehicle-load-unknown", text: "The car's own load (lights, fan, ignition) is not entered, so the whole alternator rating was counted as spare; the real spare is smaller." });
    if (spare !== undefined && totalMusicA > spare) aw.push({ level: "warn", code: "alternator-music", text: `Music-average draw ${r1(totalMusicA)} A is above the alternator's spare ${r1(spare)} A: the battery will run down while playing loud. Consider a higher-output alternator, an extra battery, and the big 3 upgrade.` });
    else if (spare !== undefined && totalMaxA > spare) aw.push({ level: "info", code: "alternator-peak", text: `At full sine power the system draws ${r1(totalMaxA)} A, above the alternator's spare ${r1(spare)} A; on music (about ${r1(totalMusicA)} A) it is within it. The battery covers the peaks.` });
    if (sugg !== undefined && rating !== undefined && rating < sugg) aw.push({ level: "info", code: "alternator-maker", text: `The amplifier makers suggest ${sugg} A of alternator in total (sum of their figures); this alternator is ${rating} A.` });
    alternator = { ratingA: rating, spareA: spare, suggestedSumA: sugg, warnings: aw };
  }

  // Big 3.
  let big3: CableSystemResult["big3"];
  if (input.big3) {
    const bw: Warning[] = [{ level: "info", code: "big3-practice", text: "Big 3 sizing (each wire at least the main power wire size, carrying the total system current) is common installer practice; no standard was found (research B7)." }];
    const thickestFeed = runs.filter((r) => r.depth === 0 && r.used?.size).map((r) => r.used!.size!).sort((a, b) => awgRank(b) - awgRank(a))[0];
    const m = input.big3.material ?? o.material;
    const list = ([["Alternator + to battery +", input.big3.altPosM], ["Battery - to chassis", input.big3.batNegM], ["Engine block to chassis", input.big3.engineGroundM]] as [string, number | undefined][]).filter(([, l]) => l !== undefined && l > 0);
    big3 = {
      runs: list.map(([name, l]) => {
        const awg = sizeRunAwg({ iA: totalMaxA, fuseA: totalMaxA, lengthM: l!, allowedV: allowed, material: m, location: "engine", tempC: o.tempC, insulationC: o.insulationC });
        const size = awg && thickestFeed && awgRank(thickestFeed) > awgRank(awg.size) ? thickestFeed : awg?.size;
        if (!awg) bw.push({ level: "warn", code: "big3-no-size", text: `${name}: no size up to 4/0 carries ${r1(totalMaxA)} A within the drop limit; use two runs in parallel.` });
        return { name, lengthM: l!, awg, size };
      }),
      warnings: bw,
    };
  }
  return { options: o, allowedV: allowed, loads, totalMaxA, totalMusicA, runs, capacitors, speakers, alternator, big3, warnings };
}

// ---------------------------------------------------------------------------------------------------------------- capacitor
/** Capacitor figures (research B7): energy 0.5 C V^2, usable energy between capHighV and capLowV, hold-up time at the amp's input
 * power (DERIVED by B4A to show the size of the effect), precharge time constant tau = R C (5 tau to about 99 %), inrush V/R and
 * resistor peak power V^2/R; and the "1 F per 1000 W" rule, shown only to say why it is not used. */
export function capacitor(farads: number | undefined, o: Partial<CableOptions> & { ratedV?: number; ampMaxA?: number; ampRmsW?: number; id?: string; name?: string } = {}): CapResult {
  const opt = withDefaults(o), notes: string[] = [], w: Warning[] = [];
  const out: CapResult = { id: o.id ?? "cap", name: o.name, farads, notes, warnings: w };
  notes.push("Wire the capacitor with the same gauge as the amplifier power wire, as close as possible to the amplifier, after the main fuse. Charge it through the resistor before the final connection, until its voltage matches the battery, then remove the resistor (Stinger SPC505 manual).");
  notes.push("\"1 farad per 1000 W RMS\" is a marketing rule of thumb: no maker test basis was found (research B7, B10), so it is shown only for comparison, not used as a rule.");
  if (!(farads && farads > 0)) { w.push({ level: "info", code: "cap-farads-unknown", text: "Capacitance not known: enter the farads to see the figures." }); return out; }
  const V = opt.supplyV, R = opt.prechargeOhm;
  out.energyJ = 0.5 * farads * V * V;
  out.usableJ = 0.5 * farads * (opt.capHighV ** 2 - opt.capLowV ** 2);
  out.tauS = R * farads; out.fullChargeS = 5 * out.tauS; out.inrushA = V / R; out.resistorPeakW = (V * V) / R;
  if (o.ampMaxA && o.ampMaxA > 0) {
    out.holdupMs = (1000 * out.usableJ) / (o.ampMaxA * V);
    notes.push(`From ${opt.capHighV} V down to ${opt.capLowV} V the capacitor gives ${out.usableJ.toFixed(1)} J, which feeds the amplifier at full draw (${r1(o.ampMaxA)} A x ${V} V) for about ${out.holdupMs.toFixed(1)} ms (DERIVED by B4A from E = 0.5 C V^2). It smooths short peaks; it cannot replace alternator or battery capacity.`);
  }
  if (o.ampRmsW && o.ampRmsW > 0) out.ruleOfThumbF = o.ampRmsW / 1000;
  if (o.ratedV !== undefined && o.ratedV < opt.capHighV) w.push({ level: "warn", code: "cap-voltage", text: `Capacitor rated ${o.ratedV} V, below the ${opt.capHighV} V charging voltage.` });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- speaker cable
/** One speaker cable row (research B8): loop R = 2 L R/m, level loss 20 log10(Z/(Z+Rw)), power lost Rw/(Z+Rw), damping Z/(Rout+Rw). */
export function speakerRow(size: string, lengthM: number, zOhm: number, rOut = 0, mat: Material = "copper", tC = 20): SpeakerRow {
  const R = 2 * lengthM * rPerM(awgInfo(size)!.areaMm2, mat, tC);
  return { size: normAwg(size)!, loopOhm: R, pctOfZ: (100 * R) / zOhm, lossDb: 20 * Math.log10(zOhm / (zOhm + R)), powerLostPct: (100 * R) / (zOhm + R), dampingFactor: rOut + R > 0 ? zOhm / (rOut + R) : undefined };
}
/** Smallest AWG whose loop resistance is within frac x Z (Roger Russell 5 %). */
export function speakerMinAwg(lengthM: number, zOhm: number, frac = SPEAKER_WIRE_FRACTION, mat: Material = "copper", tC = 20): string | undefined {
  return AWG_SIZES.find((s) => 2 * lengthM * rPerM(awgInfo(s)!.areaMm2, mat, tC) <= frac * zOhm + 1e-12);
}
/** Longest cable (m, one way) for a size within frac x Z: reproduces Roger Russell's table from the formula. */
export const speakerMaxLengthM = (size: string, zOhm: number, frac = SPEAKER_WIRE_FRACTION, mat: Material = "copper", tC = 20) => (frac * zOhm) / (2 * rPerM(awgInfo(size)!.areaMm2, mat, tC));
const SPEAKER_TABLE_SIZES = ["18", "16", "14", "12", "10", "8"];
export function speakerRun(s: SpeakerInput, o: Partial<CableOptions> = {}): SpeakerResult {
  const opt = withDefaults(o), mat = s.material ?? opt.material, w: Warning[] = [], z = s.loadOhm, rOut = s.rOutOhm ?? opt.ampROutOhm;
  const out: SpeakerResult = { id: s.id, name: s.name, loadId: s.loadId, lengthM: s.lengthM, loadOhm: z, material: mat, rows: [], warnings: w };
  if (s.rOutOhm === undefined) w.push({ level: "info", code: "rout-assumed", text: `Amplifier output resistance ${opt.ampROutOhm} ohm assumed for the damping factor (research E3).` });
  if (!(z && z > 0)) { w.push({ level: "warn", code: "speaker-load-unknown", text: "Load impedance not known: link the speaker item or enter its impedance." }); return out; }
  if (!(s.lengthM > 0)) { w.push({ level: "warn", code: "speaker-length-unknown", text: "Cable length not given." }); return out; }
  out.rows = SPEAKER_TABLE_SIZES.map((g) => speakerRow(g, s.lengthM, z, rOut, mat, opt.speakerTempC));
  const g = speakerMinAwg(s.lengthM, z, opt.speakerFraction, mat, opt.speakerTempC);
  out.recommendedAwg = g;
  if (g) out.recommended = speakerRow(g, s.lengthM, z, rOut, mat, opt.speakerTempC);
  else w.push({ level: "warn", code: "speaker-no-size", text: "No size up to 4/0 keeps the cable within the limit: shorten the run." });
  const chosen = normAwg(s.size);
  if (chosen) {
    out.chosen = speakerRow(chosen, s.lengthM, z, rOut, mat, opt.speakerTempC);
    if (out.chosen.pctOfZ > 100 * opt.speakerFraction + 1e-9) w.push({ level: "warn", code: "speaker-chosen-thin", text: `${chosen} AWG over ${s.lengthM} m is ${out.chosen.pctOfZ.toFixed(1)} % of the ${z} ohm load (limit ${100 * opt.speakerFraction} %): ${out.chosen.lossDb.toFixed(2)} dB lost${g ? `; use ${g} AWG or thicker` : ""}.` });
  }
  if (s.powerW && s.powerW > 0) {
    // Extra check by B4A (not in research B8): the RMS current at rated power against the ABYC ampacity of the size used.
    const i = Math.sqrt(s.powerW / z); out.currentA = i;
    const size = chosen ?? g;
    const amp = size ? ampacityAwg(size, { material: mat }) : undefined;
    if (size && amp !== undefined && i > amp) w.push({ level: "warn", code: "speaker-current", text: `${r1(i)} A RMS at ${s.powerW} W into ${z} ohm is above the ${r1(amp)} A ampacity of ${size} AWG (ABYC Table IV): use a thicker cable.` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- products
/** Real conductor area of a parts_raw cable record: strand count > published conductor mm2 (e.g. Narva "6 mm" = 4.59 mm2) > the
 * formula area of the AWG label (labelOnly: real copper may be less, common with CCA). */
export function productArea(rec: any): { areaMm2?: number; basis: string; labelOnly: boolean } {
  if (num(rec?.actual_area_mm2_from_strands)) return { areaMm2: rec.actual_area_mm2_from_strands, basis: "maker strand count", labelOnly: false };
  if (num(rec?.conductor_mm2)) return { areaMm2: rec.conductor_mm2, basis: rec.conductor_mm2_basis || "published conductor area", labelOnly: false };
  if (typeof rec?.size_label === "string") { const a = auMmLabelToMm2(rec.size_label); if (a) return { areaMm2: a, basis: "AU 'mm' label converted (overall size, not area)", labelOnly: false }; }
  const g = normAwg(rec?.awg);
  if (g) return { areaMm2: awgInfo(g)!.areaMm2, basis: `formula area of the ${g} AWG label (no strand count: real copper may be less)`, labelOnly: true };
  if (num(rec?.awg_nominal_mm2)) return { areaMm2: rec.awg_nominal_mm2, basis: "formula area of the gauge label", labelOnly: true };
  return { basis: "no size", labelOnly: true };
}
/** Material of a parts_raw cable record: "cca", "copper" (OFC, tinned OFC, copper) or undefined (not stated). */
export function productMaterial(rec: any): Material | undefined {
  const t = `${rec?.material ?? ""} ${rec?.title ?? ""}`.toUpperCase();
  if (/\bCCA\b|COPPER[ -]CLAD|CLAD ALUMIN/.test(t)) return "cca";
  if (/OFC|OXYGEN[ -]FREE|COPPER/.test(t)) return "copper";
  return undefined;
}
export interface ProductNeed { purpose: "power" | "speaker"; iA: number; fuseA?: number; lengthM: number; groundLengthM?: number; allowedV: number; extraDropV?: number; location?: Location; bundled?: number; tempC?: number; insulationC?: Insulation; fuseMaxPct?: number; zOhm?: number; frac?: number }
export interface ProductMatch { id: string; title?: string; brand?: string; areaMm2: number; areaBasis: string; labelOnly: boolean; material: Material; materialAssumed: boolean; ampacityA?: number; dropV?: number; pctOfZ?: number; pricePerMAud?: number; sizeLabel?: string; url?: string }
/** Real products (parts_raw cable records) that meet a run, judged by their real conductor area, cheapest AUD per metre first
 * (records without an AUD price after those with one), then the smallest area. Unknown material is judged as CCA (safe). */
export function matchCableProducts(records: any[], need: ProductNeed, limit = 5): ProductMatch[] {
  const out: ProductMatch[] = [];
  for (const rec of records ?? []) {
    const kind = String(rec?.kind ?? "");
    const kindOk = need.purpose === "speaker" ? kind === "speaker" : /power|ground|battery|starter|automotive/.test(kind);
    if (!kindOk) continue;
    const pa = productArea(rec); if (!pa.areaMm2) continue;
    const m0 = productMaterial(rec), mat: Material = m0 ?? "cca";
    const len = need.lengthM + (need.groundLengthM ?? 0);
    const m: ProductMatch = { id: rec.id, title: rec.title, brand: typeof rec.id === "string" ? rec.id.split("-")[0] : undefined, areaMm2: pa.areaMm2, areaBasis: pa.basis, labelOnly: pa.labelOnly, material: mat, materialAssumed: !m0, pricePerMAud: num(rec.price_per_m_aud) ? rec.price_per_m_aud : undefined, sizeLabel: rec.size_label ?? (rec.awg ? `${rec.awg} AWG` : undefined), url: rec.sources?.[0]?.url };
    if (need.purpose === "speaker") {
      const R = 2 * need.lengthM * rPerM(pa.areaMm2, mat, need.tempC ?? 20);
      m.pctOfZ = need.zOhm ? (100 * R) / need.zOhm : undefined;
      if (!need.zOhm || R > (need.frac ?? SPEAKER_WIRE_FRACTION) * need.zOhm + 1e-12) continue;
    } else {
      const amp = ampacityForArea(pa.areaMm2, { location: need.location, material: mat, bundled: need.bundled, insulationC: need.insulationC }); if (!amp) continue;
      m.ampacityA = amp.ampacityA;
      const d = need.iA * rPerM(pa.areaMm2, mat, need.tempC ?? 50) * len; m.dropV = d;
      if (amp.ampacityA * ((need.fuseMaxPct ?? 100) / 100) < (need.fuseA ?? need.iA) - 1e-9 || d + (need.extraDropV ?? 0) > need.allowedV + 1e-12) continue;
    }
    out.push(m);
  }
  out.sort((a, b) => (a.pricePerMAud === undefined ? 1 : 0) - (b.pricePerMAud === undefined ? 1 : 0) || (a.pricePerMAud ?? 0) - (b.pricePerMAud ?? 0) || a.areaMm2 - b.areaMm2);
  return out.slice(0, limit);
}
/** The product need of a calculated run (for matchCableProducts). */
export function needForRun(r: RunResult, o: CableOptions): ProductNeed {
  return { purpose: "power", iA: r.maxA, fuseA: r.fuseA ?? r.protectedByA, lengthM: r.lengthM, groundLengthM: r.groundLengthM, allowedV: r.allowedV, extraDropV: r.endsAt === "junction" ? 0 : r.upstreamDropV, tempC: o.tempC, insulationC: o.insulationC, fuseMaxPct: o.fuseMaxPct };
}
const num = (x: any): x is number => typeof x === "number" && isFinite(x) && x > 0;

// ---------------------------------------------------------------------------------------------------------------- from a project
/** Lookups the caller supplies (the engine reads no files): a parts_raw record by id (category given when known), and a
 * driver (for door / IB items: nominal impedance per coil and coil count). */
export interface CableLookups {
  part?: (id: string, category?: string) => any | undefined;
  driver?: (id: string) => { ohmsPerCoil?: number; coils?: number; params?: { Znom?: number } } | undefined;
  /** Parts_raw cable records, for product suggestions (optional). */
  cableRecords?: any[];
}
const PASS = new Set(["fuse", "fuseholder", "capacitor", "cable", "connector", "other"]);
const isBattery = (it?: Item) => !!it && (it.kind === "battery" || (it.kind === "other" && it.data?.role === "battery"));
const isGround = (it?: Item) => !!it && ((it.kind === "other" && /^(ground|chassis)$/.test(String(it.data?.role ?? ""))) || it.kind === "ground");
const isLoad = (it?: Item) => !!it && (it.kind === "amplifier" || it.kind === "dsp");
const isJunction = (it?: Item) => !!it && it.kind === "distribution";
const numOr = (...xs: any[]): number | undefined => xs.find((x) => typeof x === "number" && isFinite(x) && x > 0);

/** RMS power of an amp record at a load (W, all channels): ratings at exactly that load, largest total; else the lowest-load rating
 * (with a note) when the load is below every rating; else the largest total. */
export function rmsAtLoad(rec: any, loadOhm?: number): { w?: number; perChW?: number; note?: string } {
  const rs: any[] = Array.isArray(rec?.rms_ratings) ? rec.rms_ratings.filter((r: any) => num(r?.w_per_ch)) : [];
  const tot = (r: any) => r.w_per_ch * (num(r.channels) ? r.channels : 1);
  if (!rs.length) return num(rec?.total_power_w) ? { w: rec.total_power_w, note: "maker total power (load not stated)" } : {};
  if (loadOhm && loadOhm > 0) {
    const at = rs.filter((r) => num(r.ohm) && Math.abs(r.ohm - loadOhm) < 1e-6);
    if (at.length) { const b = at.reduce((a, r) => (tot(r) > tot(a) ? r : a)); return { w: tot(b), perChW: b.w_per_ch }; }
    const minOhm = Math.min(...rs.filter((r) => num(r.ohm)).map((r) => r.ohm));
    if (loadOhm < minOhm) { const b = rs.filter((r) => r.ohm === minOhm).reduce((a, r) => (tot(r) > tot(a) ? r : a)); return { w: tot(b), perChW: b.w_per_ch, note: `the ${loadOhm} ohm load is below the amp's lowest rated load (${minOhm} ohm)` }; }
  }
  const b = rs.reduce((a, r) => (tot(r) > tot(a) ? r : a));
  return { w: tot(b), perChW: b.w_per_ch, note: loadOhm ? `no rating at ${loadOhm} ohm; the largest rating was used (safe)` : "load not known; the largest rating was used (safe)" };
}

/** Load the amplifier sees from a speaker item: box = per-driver impedance (already the wired coil impedance) and drivers in
 * parallel (coils.ts finalLoad); door / IB = data.loadOhm, else the driver's nominal impedance (one driver per channel). */
export function itemLoadOhm(it: Item, lk: CableLookups = {}): { ohm?: number; how: string } {
  const d = it.data ?? {};
  if (num(d.loadOhm)) return { ohm: d.loadOhm, how: "entered on the item" };
  if (it.kind === "box") {
    const z = d.power?.impedance, n = num(d.drivers) ? d.drivers : 1;
    if (num(z)) return { ohm: finalLoad(z, n, "parallel"), how: n > 1 ? `${n} drivers of ${z} ohm in parallel` : `one driver, ${z} ohm` };
  }
  const drv = d.driverId && lk.driver ? lk.driver(d.driverId) : undefined;
  const z = drv?.params?.Znom ?? (num(drv?.ohmsPerCoil) ? (drv!.coils ?? 1) > 1 ? drv!.ohmsPerCoil! * drv!.coils! : drv!.ohmsPerCoil : undefined);
  if (num(z)) return { ohm: z, how: drv?.params?.Znom ? "driver nominal impedance" : (drv!.coils ?? 1) > 1 ? "driver coils in series (assumed)" : "driver nominal impedance" };
  return { how: "unknown" };
}

/** Build the calculator input from a project (model v2 items + typed links). Item data conventions: docs/cable_engine.md. */
export function buildCableSystem(doc: ProjectDoc, lk: CableLookups = {}, options?: Partial<CableOptions>): CableSystemInput {
  const items = new Map(doc.items.map((i) => [i.id, i]));
  const links = doc.items.flatMap((i) => (i.links ?? []).map((l) => ({ ...l, from: i.id })));
  const out = (id: string, kind: ItemLink["kind"]) => links.filter((l) => l.from === id && l.kind === kind);
  const warnings: Warning[] = [];
  const part = (it: Item, cat: string) => (it.data?.partId && lk.part ? lk.part(it.data.partId, cat) : undefined);
  const opt = { ...((doc as any).cableOptions ?? {}), ...(options ?? {}) } as Partial<CableOptions>;

  // Loads (amplifiers, DSPs) and their speaker runs.
  const loads: LoadInput[] = [], speakers: SpeakerInput[] = [];
  for (const it of doc.items.filter(isLoad)) {
    const d = it.data ?? {}, rec = part(it, it.kind === "dsp" ? "dsp" : "amplifiers") ?? {};
    const spk = out(it.id, "speaker"), notes: string[] = [];
    const loadsOhm = spk.map((l) => { const t = items.get(l.to); return t ? itemLoadOhm(t, lk) : { how: "missing item" }; });
    const known = loadsOhm.map((x) => x.ohm).filter(num);
    const loadOhm = numOr(d.loadOhm) ?? (known.length ? Math.min(...known) : undefined);
    if (it.kind === "dsp") {
      loads.push({ id: it.id, name: it.name, kind: "dsp", iMaxA: numOr(d.iMaxA, d.currentA, rec.current_draw_a), iMaxLabel: rec.current_draw_a ? "maker current draw" : undefined, fuseA: numOr(d.fuseA, rec.fuse_a) });
      continue;
    }
    const iMax = numOr(d.iMaxA, rec.current_draw_max_sine_13v8_a, rec.current_draw_max_sine_a, rec.current_draw_max_a);
    const iMaxLabel = d.iMaxA ? "entered" : rec.current_draw_max_sine_13v8_a ? "Max. Current Draw (13.8 V sinewave)" : rec.current_draw_basis ?? (iMax ? "maker maximum" : undefined);
    if (!iMax && num(rec.current_draw_a)) notes.push(`Maker "current consumption" ${rec.current_draw_a} A is not a maximum draw (research C, Kenwood), so it is not used.`);
    let rms = numOr(d.rmsW);
    if (!rms && rec) { const r = rmsAtLoad(rec, loadOhm); rms = r.w; if (r.note && r.w) notes.push(`RMS ${r.w} W: ${r.note}.`); }
    loads.push({ id: it.id, name: it.name, kind: "amplifier", cls: d.class ?? rec.class, rmsTotalW: rms, loadOhm, iMaxA: iMax, iMaxLabel, iMusicA: numOr(d.iMusicA, rec.current_draw_avg_music_13v8_a, rec.current_draw_music_max_a), fuseA: numOr(d.fuseA, rec.recommended_fuse_a, rec.fuse_onboard_a), powerWireAwgMaker: d.powerWireAwg ?? rec.power_wire_awg_maker ?? undefined, suggestedAlternatorA: numOr(d.suggestedAlternatorA, rec.suggested_alternator_a), notes });
    spk.forEach((l, k) => {
      const t = items.get(l.to), c = l.cableItemId ? items.get(l.cableItemId) : undefined, cd = c?.data ?? {}, crec = c ? part(c, "cable") : undefined;
      const z = loadsOhm[k].ohm, perCh = rec ? rmsAtLoad(rec, z).perChW : undefined;
      speakers.push({ id: `${it.id}>${l.to}`, name: `${it.name} -> ${t?.name ?? l.to}`, loadId: it.id, targetItemId: l.to, cableItemId: l.cableItemId, lengthM: numOr(cd.lengthM) ?? 0, loadOhm: z, material: cd.material ?? (crec ? productMaterial(crec) : undefined), size: cd.size ?? crec?.awg ?? undefined, rOutOhm: numOr(d.rOutOhm), powerW: numOr(d.channelW, perCh) });
    });
    if (!spk.length) warnings.push({ level: "info", code: "amp-no-speakers", text: `${it.name}: no speaker link, so the amp's load is not known.` });
  }

  // Ground return length of each load: its ground link's cable, else groundLengthM on its power cable.
  const groundLen = (loadId: string): number | undefined => {
    for (const l of out(loadId, "ground")) { const c = l.cableItemId ? items.get(l.cableItemId) : undefined; if (num(c?.data?.lengthM)) return c!.data.lengthM; }
    return undefined;
  };

  // Power runs from each battery.
  const feeds: RunInput[] = [], capacitors: CapInput[] = [];
  const seenCap = new Set<string>();
  let alternator: CableSystemInput["alternator"];
  const walkRun = (first: ItemLink, id: string, visited: Set<string>): RunInput => {
    const run: RunInput = { id, lengthM: 0, cableItemIds: [], capacitorIds: [], to: { none: true } };
    let link: ItemLink | undefined = first, cableGround: number | undefined, sizes = new Set<string>();
    const addCable = (c: Item | undefined) => {
      if (!c || c.kind !== "cable") return;
      const cd = c.data ?? {}, crec = part(c, "cable");
      run.lengthM += numOr(cd.lengthM) ?? 0; run.cableItemIds!.push(c.id);
      if (num(cd.groundLengthM)) cableGround = cd.groundLengthM;
      const pa = crec ? productArea(crec) : undefined;
      const size = normAwg(cd.size ?? crec?.awg);
      const area = numOr(cd.areaMm2, pa && !pa.labelOnly ? pa.areaMm2 : undefined);
      if (size || area) {
        sizes.add(`${size ?? ""}/${area ?? ""}`);
        if (!run.cable) run.cable = { size, areaMm2: area, material: cd.material ?? (crec ? productMaterial(crec) : undefined), partId: cd.partId, label: crec?.title ?? c.name, areaBasis: area ? (cd.areaMm2 ? "entered" : pa?.basis) : pa?.basis };
      }
      if (cd.location) run.location = cd.location; if (num(cd.bundled)) run.bundled = cd.bundled; if (cd.material) run.material = cd.material;
      if (!num(cd.lengthM)) warnings.push({ level: "warn", code: "cable-length-unknown", text: `${c.name}: no length (data.lengthM), counted as 0 m.` });
    };
    while (link) {
      if (link.cableItemId) addCable(items.get(link.cableItemId));
      const node = items.get(link.to);
      if (!node || visited.has(node.id)) { if (node) warnings.push({ level: "warn", code: "power-loop", text: `Power links form a loop at ${node.name}.` }); break; }
      visited.add(node.id);
      const nexts = out(node.id, "power");
      if (isLoad(node)) { run.to = { load: node.id }; run.name = run.name ?? `to ${node.name}`; break; }
      if (node.kind === "fuse" || node.kind === "fuseholder") {
        const rec = part(node, "fuses") ?? {};
        const rating = numOr(node.data?.ratingA, rec.rating_a, rec.fuse_included_a);
        if (run.fuseItemId === undefined) { run.fuseItemId = node.id; if (rating) run.fuseA = rating; if (num(node.data?.distanceMm)) run.fuseDistanceMm = node.data.distanceMm; if (node.data?.sheathed) run.fuseSheathed = true; }
        else warnings.push({ level: "info", code: "second-fuse", text: `${node.name}: a second fuse on the same run; the first one (${items.get(run.fuseItemId)?.name}) sets the wire size.` });
      }
      if (node.kind === "capacitor") {
        const rec = part(node, "capacitors") ?? {};
        if (!seenCap.has(node.id)) { seenCap.add(node.id); capacitors.push({ id: node.id, name: node.name, farads: numOr(node.data?.farads, rec.farads), ratedV: numOr(node.data?.voltageV, rec.voltage_v), prechargeOhm: numOr(node.data?.prechargeOhm) }); }
        run.capacitorIds!.push(node.id);
      }
      if (node.kind === "cable") addCable(node);
      if (isJunction(node) || (PASS.has(node.kind) && nexts.length > 1)) {
        const rec = part(node, isJunction(node) ? "distribution" : "fuses") ?? {};
        // distribution block: fused when the record says so; a fuse / holder with several outputs: one fuse feeding several
        // wires (branches unfused, protected by it) unless it is a fuse block / fused distribution (one fuse per output)
        const fused = node.data?.fused ?? (isJunction(node) ? /fuse/i.test(`${rec.kind ?? ""} ${rec.title ?? ""}`) || !!rec.fuse_type : /block|distribution/i.test(`${rec.kind ?? ""} ${rec.title ?? ""}`));
        run.to = { junction: { id: node.id, name: node.name, fused, branchFuseA: numOr(node.data?.fuseA), branches: nexts.map((l, k) => walkRun(l, `${id}.${k + 1}`, visited)) } };
        run.name = run.name ?? `to ${node.name}`;
        break;
      }
      if (!PASS.has(node.kind) && !isBattery(node)) warnings.push({ level: "info", code: "unknown-in-chain", text: `${node.name} (${node.kind}) in the power chain is passed through.` });
      if (nexts.length === 0) { run.name = run.name ?? `to ${node.name}`; break; }
      link = nexts[0];
    }
    if (sizes.size > 1) warnings.push({ level: "warn", code: "mixed-cable", text: `Run ${run.name ?? id} uses cables of different sizes; the first one is checked.` });
    if ("load" in run.to) {
      const loadId = run.to.load, g = groundLen(loadId) ?? cableGround;
      if (g !== undefined) run.groundLengthM = g;
      for (const c of run.capacitorIds!) { const ci = capacitors.find((x) => x.id === c); if (ci) ci.loadId = loadId; }
    } else if (cableGround !== undefined) run.groundLengthM = cableGround;
    if ("none" in run.to) warnings.push({ level: "warn", code: "run-no-load", text: `Power run ${run.name ?? id} ends without reaching an amplifier.` });
    return run;
  };
  const batteries = doc.items.filter(isBattery);
  if (!batteries.length && loads.length) warnings.push({ level: "warn", code: "no-battery", text: "No battery item: add the battery and link it (power) to the main fuse." });
  batteries.forEach((b, bi) => {
    const d = b.data ?? {};
    if (num(d.alternatorA) || num(d.vehicleLoadA)) alternator = { ratingA: numOr(d.alternatorA), vehicleLoadA: numOr(d.vehicleLoadA) };
    out(b.id, "power").forEach((l, k) => {
      const r = walkRun(l, `feed${bi + 1}.${k + 1}`, new Set([b.id]));
      if (!r.fuseItemId) { r.fused = false; }
      feeds.push(r);
    });
  });
  // Caps linked straight to an amp (cap -> amp or amp -> cap power link) but not in a run.
  for (const it of doc.items.filter((i) => i.kind === "capacitor" && !seenCap.has(i.id))) {
    const rec = part(it, "capacitors") ?? {};
    const amp = links.find((l) => l.kind === "power" && ((l.from === it.id && isLoad(items.get(l.to))) || (l.to === it.id && isLoad(items.get(l.from)))));
    capacitors.push({ id: it.id, name: it.name, farads: numOr(it.data?.farads, rec.farads), ratedV: numOr(it.data?.voltageV, rec.voltage_v), prechargeOhm: numOr(it.data?.prechargeOhm), loadId: amp ? (amp.from === it.id ? amp.to : amp.from) : undefined });
  }
  const big3 = (doc as any).cableBig3 as Big3Input | undefined;
  return { options: opt, loads, feeds, capacitors, speakers, alternator, big3, warnings };
}

/** Convenience: build from a project and calculate. */
export const calcProject = (doc: ProjectDoc, lk: CableLookups = {}, options?: Partial<CableOptions>) => calcCableSystem(buildCableSystem(doc, lk, options));
