// Board materials for the Boards tab and the BOM (B7_PLYWOOD_BOARDS, 2026-11-23): MDF (data/boards/mdf_sheets_au.json, agent
// A12) and six plywood types (data/boards/plywood_sheets_au.json, agent R6; research references/research_l_plywood_sheets.md).
// Pure functions, no DOM. Units: mm, kg, kg/m3.
//
// - Which catalogue sheets belong to a material (plywood by the catalogue's category).
// - Thickness match within a stated tolerance, because some plywood is listed at non-round thicknesses (Bowens hoop pine 6.5,
//   9.5, 12.5, 18.5 mm): a sheet within THICKNESS_TOL_MM of the design thickness counts as that thickness, and the screen says so.
// - Density per material with its source (the same figures and URLs as the catalogues' densityKgM3 / research_l table), for
//   "about N kg of panels". Hardwood marine (BS 1088) and hardwood exterior plywood have no maker figure: no weight is given.
// - Grain: plywood has a face grain along the sheet length (stiffer that way: Metsa 18 mm MOE 10,048 vs 7,452 N/mm2); MDF none.
import { Piece, pieceArea } from "./nest";

export type MaterialId = "mdf" | "birch" | "marine" | "hoop" | "structural" | "nonstructural" | "exterior";
export interface Density { kgM3?: number; label: string; source: string }
export interface MaterialInfo {
  id: MaterialId; label: string; catalogue: "mdf" | "ply";
  /** Plywood catalogue categories that make up this material (MDF: every MDF sheet). */
  categories?: string[];
  /** Has a face grain (plywood). */
  grain: boolean;
  density: Density;
  /** Plain-words note from the research (bond, moisture, use). */
  note: string;
}
const METSA = "https://www.metsagroup.com/globalassets/metsa-wood/dop-documents/dop_metsa_wood_birch_plywood_muf_2019-12-2_en.pdf";
const PLYTECH = "https://harmenk.squarespace.com/s/Hoop-Pine-B_B-Data-Sheet.pdf";
const STRUCTAPLY = "https://borg.bynder.com/asset/b69e0712-31e2-469b-b28b-17f1eb78b40a/STRUCTAply-Technical-Statement.pdf";
const ALPINE = "https://media.bunnings.com.au/api/public/content/498eddb35e654b6ba662402e9906420e";
export const MATERIALS: MaterialInfo[] = [
  { id: "mdf", label: "MDF", catalogue: "mdf", grain: false, density: { kgM3: 740, label: "740 kg/m³ (Alpine MDF, 12 to 22 mm)", source: ALPINE },
    note: "No grain: any panel may be turned 90°. Alpine: standard MDF \"should not be exposed to water or high humidity\"." },
  { id: "birch", label: "Birch plywood", catalogue: "ply", categories: ["birch plywood"], grain: true, density: { kgM3: 680, label: "680 kg/m³ mean (Metsa Wood birch plywood; Hanson about 700, Nilam tested 716)", source: METSA },
    note: "Stiffest per mm in the research (bending MOE 18 mm: 10,048 along / 7,452 across the face grain, MDF 3,000). PS Sound builds infinite-baffle baffles from 18 mm ply and 1 in birch ply (references/research_h_ib_door_home_pc.md). Plyco premium birch: exterior only when all faces and edges are sealed, not marine rated." },
  { id: "marine", label: "Marine plywood", catalogue: "ply", categories: ["marine plywood"], grain: true, density: { kgM3: 600, label: "600 kg/m³ for hoop pine marine (Plytech); no maker figure was found for hardwood marine (BS 1088)", source: PLYTECH },
    note: "Marine bond (hoop pine AA to AS/NZS 2272, or hardwood / gaboon / Pacific maple to BS 1088). The choice for a true IB baffle exposed to road spray; seal it on all faces and edges (Bunnings)." },
  { id: "hoop", label: "Hoop pine plywood", catalogue: "ply", categories: ["hoop pine plywood"], grain: true, density: { kgM3: 600, label: "600 kg/m³ average (Plytech hoop pine data sheet)", source: PLYTECH },
    note: "Australian hoop pine, A-Bond, F14 to F17. Some sheets are listed at 6.5, 9.5, 12.5 and 18.5 mm." },
  { id: "structural", label: "Structural plywood", catalogue: "ply", categories: ["structural plywood"], grain: true, density: { kgM3: 550, label: "550 kg/m³ (radiata pine species average, Porta STRUCTAply)", source: STRUCTAPLY },
    note: "Radiata pine CD (F8 / F11), A-Bond, rougher C/D faces; the lightest. The 4 mm ply brace sheets are bracing, not box board." },
  { id: "nonstructural", label: "Non-structural plywood", catalogue: "ply", categories: ["non-structural plywood"], grain: true, density: { kgM3: 550, label: "550 kg/m³ (radiata pine species average, Porta STRUCTAply)", source: STRUCTAPLY },
    note: "Pine BC / CD. Check the bond: Plyco BC/D radiata is C-Bond (interior only); Plyco CD non-structural and Bowens pine are A-Bond." },
  { id: "exterior", label: "Exterior plywood", catalogue: "ply", categories: ["exterior plywood"], grain: true, density: { label: "no maker density figure for hardwood exterior plywood: weight not given", source: "" },
    note: "Hardwood B/C exterior, A-Bond / WBP; not marine rated." },
];
export const DEFAULT_BOX_MATERIAL: MaterialId = "mdf";
/** PS Sound build IB baffles from (birch) plywood: references/research_h_ib_door_home_pc.md lines 43 and 45. */
export const DEFAULT_IB_MATERIAL: MaterialId = "birch";
/** A sheet within this many mm of the design thickness counts as that thickness (18.5 mm hoop pine for an 18 mm design). */
export const THICKNESS_TOL_MM = 0.5;
/** PM 2026-11-23: catalogue sheets marked "comparison only" (e.g. Trademaster, Sydney, for a Melbourne user) stay in the
 * lists but are never the recommended buy (smallest sheet, cheapest buy, BOM price), unless they are all there is. */
export const isComparisonOnly = (s: { note?: string | null }): boolean => /comparison only/i.test(String(s.note ?? ""));
export function buyable<T>(rows: T[], sheetOf: (r: T) => { note?: string | null }): T[] {
  const b = rows.filter((r) => !isComparisonOnly(sheetOf(r)));
  return b.length ? b : rows;
}

export const isMaterial = (x: unknown): x is MaterialId => typeof x === "string" && MATERIALS.some((m) => m.id === x);
export const materialInfo = (id: unknown, fallback: MaterialId = DEFAULT_BOX_MATERIAL): MaterialInfo => MATERIALS.find((m) => m.id === id) ?? MATERIALS.find((m) => m.id === fallback)!;
/** The material an item uses: its saved choice, else MDF for a box and birch plywood for an infinite-baffle baffle. */
export const itemMaterial = (kind: string | undefined, saved: unknown): MaterialId => (isMaterial(saved) ? saved : kind === "ib" ? DEFAULT_IB_MATERIAL : DEFAULT_BOX_MATERIAL);

/** The catalogue sheets of a material (MDF: all MDF sheets; plywood: the plywood sheets of its categories). */
export function sheetsOfMaterial<S extends { category?: string }>(mat: MaterialId, mdf: S[], ply: S[]): S[] {
  const m = materialInfo(mat);
  return m.catalogue === "mdf" ? mdf : ply.filter((s) => m.categories!.includes(String(s.category)));
}
/** Sheets whose listed thickness is within tol of the design thickness t. `off` lists the listed thicknesses that differ
 * from t (shown on screen: "18.5 mm counted as 18 mm"). */
export function matchThickness<S extends { thicknessMm: number }>(sheets: S[], t: number, tol = THICKNESS_TOL_MM): { sheets: S[]; off: number[] } {
  const ok = sheets.filter((s) => Math.abs(s.thicknessMm - t) <= tol + 1e-9);
  return { sheets: ok, off: [...new Set(ok.map((s) => s.thicknessMm).filter((x) => Math.abs(x - t) > 1e-9))].sort((a, b) => a - b) };
}
/** Board area (m2) and weight (kg) of a panel set: each panel's real area × its own thickness × density. kg undefined when the
 * material has no sourced density. */
export function panelsWeight(panels: (Piece & { t: number })[], mat: MaterialId): { areaM2: number; volM3: number; kg?: number } {
  const areaM2 = panels.reduce((s, p) => s + pieceArea(p), 0) / 1e6;
  const volM3 = panels.reduce((s, p) => s + (pieceArea(p) / 1e6) * (p.t / 1000), 0);
  const d = materialInfo(mat).density.kgM3;
  return { areaM2, volM3, kg: d === undefined ? undefined : volM3 * d };
}
