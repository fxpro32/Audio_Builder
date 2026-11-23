// Thiele/Small parameters: completion from a minimal set and spec-sheet cross-check (research_c §1).
import { Air, AIR_20C } from "./air";

/** All values SI: m, m², m³, kg, H, N/m etc. Optional = may be missing on a sheet. */
export interface DriverParams {
  fs: number; Re: number; Qms: number; Qes: number; Qts?: number;
  Vas?: number; Sd: number; Xmax?: number; Le?: number; Pe?: number;
  Mms?: number; Cms?: number; Rms?: number; Bl?: number;
  Znom?: number; sens1W?: number; displacement?: number; // m³ (driver volume displaced inside box)
  dia?: number; cutout?: number; depth?: number; // m, for 3D + baffle
}
export interface Driver {
  id: string; brand: string; model: string; params: DriverParams; sources?: SourceRef[]; notes?: string; private?: boolean; library?: string; licence?: string;
  kind?: "driver" | "passive";           // "passive" = passive radiator: cone + suspension, no voice coil (engine/passive.ts); missing = driver
  // Coil and rating metadata (high-power library, scripts/import_hp_subs.mjs; optional for every other driver)
  coil?: "SVC" | "DVC" | "QVC"; coils?: number; ohmsPerCoil?: number; rmsW?: number; peakW?: number; rmsRange?: number[];
  finalLoads?: number[];                 // possible amplifier loads of ONE driver (Ω) from its coil wiring options
  tsBasis?: "per_coil" | "series" | "parallel" | "unknown"; // which wiring the published T/S values describe
  paramsSeries?: Partial<DriverParams>; paramsParallel?: Partial<DriverParams>; // per-wiring sets where the maker publishes them
  status?: string; country?: string; maker?: string; sizeIn?: number; sens2v83?: number;
  recommendedBoxes?: { type: string; volume_l?: number | null; tuning_hz?: number | null; source?: string; note?: string; [k: string]: unknown }[];
  calculated?: string[]; printed?: Partial<DriverParams>; checks?: string[]; incomplete?: boolean; missing?: string[]; alsoIn?: string; rawRef?: string;
  // B3_PARTS_DB: car driver libraries (car-subs, car-drivers; scripts/import_car_*.mjs)
  type?: DriverType; sizeLabel?: string; frameMm?: number; freqRangeHz?: number[]; sensitivityDb?: number; sensitivityBasis?: string; magnet?: string; coneMaterial?: string;
  recommendedCrossover?: unknown; passiveCrossover?: unknown; setParts?: { role?: string; model?: string; in_dataset?: boolean }[]; partOfSets?: string[]; tweeterPart?: Record<string, unknown>;
  priceAud?: DriverPriceRaw[]; collectedBy?: string;
}
/** An AUD price of a library driver as stored: car-subs use {retailer, price_aud, compare_at_aud, on_sale, url, read_date, sku,
 * title}, car-drivers may use {supplier, price_aud, url, read_date}. The seller is `retailer ?? supplier` (driverPrices). */
export interface DriverPriceRaw { retailer?: string; supplier?: string; price_aud?: number; compare_at_aud?: number | null; on_sale?: boolean; url?: string; read_date?: string; sku?: string; title?: string; [k: string]: unknown }
/** A driver's AUD prices, one shape (seller = retailer ?? supplier), lowest first; entries without a price are left out.
 * Used by the Drivers tab and kept for the parts list (BOM) job. */
export interface DriverPrice { seller: string; priceAud: number; compareAtAud?: number; onSale: boolean; url?: string; date?: string; sku?: string; title?: string }
export function driverPrices(d: { priceAud?: DriverPriceRaw[] } | undefined): DriverPrice[] {
  const out: DriverPrice[] = [];
  for (const x of Array.isArray(d?.priceAud) ? d!.priceAud! : []) {
    const v = typeof x?.price_aud === "number" ? x.price_aud : NaN; if (!(isFinite(v) && v > 0)) continue;
    out.push({ seller: String(x.retailer ?? x.supplier ?? "").trim() || "unknown seller", priceAud: v, compareAtAud: typeof x.compare_at_aud === "number" && x.compare_at_aud > 0 ? x.compare_at_aud : undefined, onSale: x.on_sale === true, url: typeof x.url === "string" ? x.url : undefined, date: typeof x.read_date === "string" ? x.read_date : undefined, sku: typeof x.sku === "string" ? x.sku : undefined, title: typeof x.title === "string" ? x.title : undefined });
  }
  return out.sort((a, b) => a.priceAud - b.priceAud);
}
/** Lowest AUD price of a driver (undefined = none listed). */
export const driverPriceFrom = (d: { priceAud?: DriverPriceRaw[] } | undefined): number | undefined => driverPrices(d)[0]?.priceAud;
/** What a driver is for (car libraries; other drivers have no type). */
export type DriverType = "subwoofer" | "tweeter" | "midrange" | "midbass" | "coaxial" | "component_set" | "fullrange";
export interface SourceRef { param: string; source: string; where?: string; tier?: number; read?: string }

/** Fully derived parameter set used by the model. */
export interface FullParams extends Required<Pick<DriverParams, "fs" | "Re" | "Qms" | "Qes" | "Sd">> {
  Qts: number; Vas: number; Mms: number; Cms: number; Rms: number; Bl: number;
  Le: number; Xmax: number; Pe: number; Znom: number; eta0: number; sens1W: number; Vd: number; EBP: number;
}

export function complete(p: DriverParams, air: Air = AIR_20C): FullParams {
  const { fs, Re, Sd } = p;
  const w = 2 * Math.PI * fs;
  const rc2 = air.rho * air.c * air.c;
  let Qms = p.Qms, Qes = p.Qes;
  if (!(Qes > 0) && p.Qts && Qms) Qes = (p.Qts * Qms) / (Qms - p.Qts);
  if (!(Qms > 0) && p.Qts && Qes) Qms = (p.Qts * Qes) / (Qes - p.Qts);
  let Cms: number;
  if (p.Vas && p.Vas > 0) Cms = p.Vas / (rc2 * Sd * Sd);
  else if (p.Cms) Cms = p.Cms;
  else if (p.Mms) Cms = 1 / (w * w * p.Mms);
  else throw new Error("Need Vas, Cms or Mms");
  const Vas = rc2 * Sd * Sd * Cms;
  const Mms = 1 / (w * w * Cms);
  if (!(Qes > 0) && p.Bl) Qes = (w * Mms * Re) / (p.Bl * p.Bl);
  if (!(Qes > 0) || !(Qms > 0)) throw new Error("Need Qes and Qms (or Qts with one of them, or Bl)");
  const Rms = (w * Mms) / Qms;
  const Bl = Math.sqrt((w * Mms * Re) / Qes);
  const Qts = (Qes * Qms) / (Qes + Qms);
  const eta0 = (4 * Math.PI ** 2 * fs ** 3 * Vas) / (air.c ** 3 * Qes);
  const Xmax = p.Xmax ?? 0;
  return {
    fs, Re, Sd, Qms, Qes, Qts, Vas, Mms, Cms, Rms, Bl,
    Le: p.Le ?? 0, Xmax, Pe: p.Pe ?? 0, Znom: p.Znom ?? nominalZ(Re),
    eta0, sens1W: 112.02 + 10 * Math.log10(eta0), Vd: Sd * Xmax, EBP: fs / Qes,
  };
}

export function nominalZ(Re: number): number {
  for (const z of [1, 2, 4, 6, 8, 16]) if (Re <= z * 0.95) return z;
  return Math.round(Re);
}

export interface CheckRow { name: string; printed: number; computed: number; devPct: number; level: "ok" | "warn" | "bad"; note: string }

/** Compare printed sheet values with values derived from the minimal set {fs, Qes, Qms, Re, Vas, Sd}. Warn >3 %, bad >6 %. */
export function crossCheck(p: DriverParams, air: Air = AIR_20C): CheckRow[] {
  const f = complete(p, air);
  const rows: CheckRow[] = [];
  const push = (name: string, printed: number | undefined, computed: number, note: string) => {
    if (printed === undefined || !(printed > 0) || !isFinite(computed)) return;
    const devPct = ((computed - printed) / printed) * 100;
    const a = Math.abs(devPct);
    rows.push({ name, printed, computed, devPct, level: a <= 3 ? "ok" : a <= 6 ? "warn" : "bad", note });
  };
  const w = 2 * Math.PI * p.fs;
  push("Qts", p.Qts, f.Qts, "Qes·Qms/(Qes+Qms)");
  push("Mms", p.Mms, f.Mms, "1/((2πfs)²·Cms), Cms from Vas");
  push("Cms", p.Cms, f.Cms, "Vas/(ρc²Sd²)");
  push("Rms", p.Rms, f.Rms, "2πfs·Mms/Qms");
  push("Bl", p.Bl, f.Bl, "√(2πfs·Mms·Re/Qes)");
  if (p.Mms && p.Cms) push("fs", p.fs, 1 / (2 * Math.PI * Math.sqrt(p.Mms * p.Cms)), "1/(2π√(Mms·Cms)) from printed Mms, Cms");
  if (p.Cms) push("Vas", p.Vas, air.rho * air.c ** 2 * p.Sd ** 2 * p.Cms, "ρc²Sd²·Cms from printed Cms");
  if (p.Bl && p.Mms) {
    const eta2 = (air.rho * p.Bl ** 2 * p.Sd ** 2) / (2 * Math.PI * air.c * p.Mms ** 2 * p.Re);
    push("η0 (Bl form vs Small form)", f.eta0, eta2, "ρBl²Sd²/(2πc·Mms²·Re)");
  }
  if (p.sens1W) push("SPL 1W/1m (dB)", p.sens1W, f.sens1W, "112.02+10·log10(η0); a 2.83 V figure differs by 10·log10(8/Re)");
  void w;
  return rows;
}
