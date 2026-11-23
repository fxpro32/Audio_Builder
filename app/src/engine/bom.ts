// Bill of materials (B5_BOM, R42, 2026-11-23). Requirement R42 (verbatim): "Then I need it also to be all saved into a linkable
// spreadsheet and project that if all parts of the project are linked, a BOM at the end in a spreadsheet can be generated
// showing all bits required, including but not limited to speakers, amps, caps, cable, connectors etc... everything that would
// be needed for that specific project. Make sure you can also save the work as a project."
//
// bomForProject(doc, lookups, options) reads a project v2 document (docs/project_model_v2.md: items + typed links), the cable
// engine (docs/cable_engine.md: recommended sizes where no cable was chosen, fuse ratings of distribution outputs, big 3), the
// missing-part check (docs/diagram_engine.md: its issues become the "Missing / to decide" section, nothing is invented for
// them) and the board nesting (engine/nest.ts: the smallest MDF sheet that holds every panel, as the Boards tab). Every line
// says where it came from and how a derived quantity was worked out. Prices: the lowest AUD price known (driver priceAud lists,
// part prices_aud, the MDF sheet catalogue), with supplier, date and URL; blank when none is known. Pure functions, no DOM, no
// file access. Method and rules: docs/bom.md.
import type { Item, ItemLink, ProjectDoc } from "../ui/projectv2";
import { cableFor, graphOf, num, roleOf } from "./sysmodel";
import type { CableView, Role } from "./sysmodel";
import { checkSystem } from "./syscheck";
import type { SystemIssue } from "./syscheck";
import { normAwg } from "./cable";
import type { CableLookups, CableSystemResult, Material, RunResult } from "./cable";
import { driverPrices } from "./driver";
import { cheapestBuys, nestRepeat, pieceArea, smallestSheet } from "./nest";
import type { Piece, SheetSpec } from "./nest";
import { itemMaterial, materialInfo, matchThickness, MATERIALS, panelsWeight, sheetsOfMaterial, THICKNESS_TOL_MM, buyable } from "./boardmat"; // B7_PLYWOOD_BOARDS
import type { MaterialId } from "./boardmat";

// ------------------------------------------------------------------------------------------------------------ types
export type BomGroupId = "speakers" | "enclosure" | "amplifiers" | "dsp" | "power" | "cable" | "connectors" | "other" | "missing";
export const BOM_GROUPS: { id: BomGroupId; label: string }[] = [
  { id: "speakers", label: "Speakers and drivers" },
  { id: "enclosure", label: "Enclosures and materials" },
  { id: "amplifiers", label: "Amplifiers" },
  { id: "dsp", label: "DSP and head unit" },
  { id: "power", label: "Power: battery, fuses and holders, distribution, capacitors" },
  { id: "cable", label: "Cable" },
  { id: "connectors", label: "Connectors and terminals" },
  { id: "other", label: "Other items" },
  { id: "missing", label: "Missing / to decide (not in the totals)" },
];
export const groupLabel = (g: BomGroupId) => BOM_GROUPS.find((x) => x.id === g)?.label ?? g;

export interface BomPrice { supplier: string; priceAud: number; date?: string; url?: string; note?: string }
export interface BomLine {
  /** Stable key (overrides are stored by it). */
  key: string; group: BomGroupId;
  item: string; brand?: string; model?: string;
  /** Part / driver / sheet id (the Parts sheet row). */
  partId?: string; category?: string;
  /** Quantity (after override); undefined = not known (e.g. cable of unknown length). */
  qty?: number; unit: string;
  /** Unit price AUD (lowest known, or the override); undefined = no price known. */
  unitPrice?: number; supplier?: string; priceDate?: string; priceUrl?: string;
  /** Every known price of the part, lowest first; what one price buys (each, pack of 30 m, sheet). */
  prices: BomPrice[]; priceUnit?: string;
  /** qty x unitPrice (rounded to cents), undefined when either is missing. */
  total?: number;
  /** Project item ids and names the line came from. */
  from: string[]; fromNames: string[];
  /** How a derived quantity was worked out (empty for a part taken as it is). */
  derived?: string;
  notes: string;
  /** Spec source URL (maker page / listing). */
  source?: string; specs?: string;
  /** The quantity / price the BOM worked out before an override. */
  calcQty?: number; calcPrice?: number;
  overridden?: { qty?: boolean; price?: boolean };
}
export interface BomGroup { id: BomGroupId; label: string; lines: BomLine[]; subtotal: number; priced: number; count: number }
export interface BomPart { key: string; id: string; category: string; brand?: string; model?: string; name: string; specs?: string; prices: BomPrice[]; priceUnit: string; source?: string; lineKeys: string[] }
export interface Bom {
  project: string; title: string; date: string; sparePct: number;
  /** Groups in BOM_GROUPS order without "missing", empty groups left out. */
  groups: BomGroup[];
  /** "Missing / to decide": the missing-part check's issues and the BOM's own open points (not in the totals). */
  missing: BomLine[];
  total: number; priced: number; count: number;
  parts: BomPart[];
  cable?: CableSystemResult;
  issues: SystemIssue[];
  /** General notes (shown under the table and on the Info sheet). */
  notes: string[];
}
/** The panels of a box (or IB baffle) item as the Boards tab lays them out, and what the box is. */
export interface BoxSource {
  label: string;
  panels: (Piece & { t: number })[];
  error?: string;
  /** sealed, vented, pr, tl, bandpass... (what the panels are for). */
  kind?: string;
  port?: { shape?: string; count?: number; d?: number; lengthMm?: number };
  /** Passive radiators (topology pr): driver id (or "custom") and count. */
  prId?: string; prCount?: number;
  /** B7_PLYWOOD_BOARDS: board material of the item (engine/boardmat.ts; missing = MDF for a box, birch plywood for an IB baffle)
   * and the plywood grain lock (missing = on). */
  material?: string; grain?: boolean;
}
export interface BomSheet { supplier: string; product: string; item?: string; category?: string; lengthMm: number; widthMm: number; thicknessMm: number; priceAud?: number; priceDate?: string; url?: string; note?: string }
export interface BomLookups extends CableLookups {
  /** Panels and kind of a box / IB item (the app passes the Boards tab's source for it). */
  box?: (it: Item) => BoxSource | undefined;
  /** MDF sheet catalogue (data/boards/mdf_sheets_au.json sheets) and the saw settings (Boards tab defaults). */
  sheets?: BomSheet[]; kerfMm?: number; trimMm?: number;
  /** B7: plywood sheet catalogue (data/boards/plywood_sheets_au.json sheets); undefined = not loaded. */
  plySheets?: BomSheet[];
}
export interface BomOverride { qty?: number; priceAud?: number }
export type BomOverrides = Record<string, BomOverride>;
export interface BomOptions {
  /** Spare added to cable lengths (%), default doc.bomSparePct, else 10. */
  sparePct?: number;
  /** Per-line overrides, default doc.bomOverrides. */
  overrides?: BomOverrides;
  /** Missing-part issues (default: checkSystem of the project). */
  issues?: SystemIssue[];
  /** Date shown (YYYY-MM-DD), default today. */
  date?: string;
}
export const DEFAULT_SPARE_PCT = 10;

// ------------------------------------------------------------------------------------------------------------ helpers
const r2 = (x: number) => Math.round(x * 100) / 100;
const fx = (x: number, d = 1) => (+x.toFixed(d)).toString();
const matName = (m?: string) => (m === "cca" ? "CCA" : "copper");
const isHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u);
const sizeTxt = (s?: string) => (s ? `${s} AWG` : "size not chosen");

/** A part record's AUD prices, lowest first (Part.n.prices, else the raw prices_aud). */
export function partPrices(p: any): BomPrice[] {
  const raw: any[] = Array.isArray(p?.n?.prices) ? p.n.prices : Array.isArray(p?.prices_aud) ? p.prices_aud.map((x: any) => ({ supplier: x.supplier, priceAud: x.price_aud, url: x.url, date: x.read_date, note: x.note })) : [];
  return raw.filter((x) => num(x?.priceAud)).map((x) => ({ supplier: String(x.supplier ?? "").trim() || "unknown seller", priceAud: x.priceAud, date: x.date ?? undefined, url: x.url ?? undefined, ...(x.note ? { note: String(x.note) } : {}) }))
    .sort((a, b) => a.priceAud - b.priceAud || a.supplier.localeCompare(b.supplier));
}
/** A driver's AUD prices, lowest first (driver.ts driverPrices). */
export function driverBomPrices(d: any): BomPrice[] {
  return driverPrices(d).map((x) => ({ supplier: x.seller, priceAud: x.priceAud, date: x.date, url: x.url }));
}
/** Short key specs of a part record (for the Parts sheet). */
export function partSpecs(p: any): string {
  const n = p?.n ?? {}; const out: string[] = [];
  switch (p?.category) {
    case "amplifiers": case "dsp":
      if (n.cls) out.push(`class ${n.cls}`); if (n.channels) out.push(`${n.channels} ch`);
      if (n.rms) out.push(Object.entries(n.rms as Record<string, number>).sort((a, b) => +b[0] - +a[0]).map(([o, w]) => `${w} W @ ${o} ohm`).join(", "));
      if (n.minLoadOhm) out.push(`min ${n.minLoadOhm} ohm`); if (n.iMaxA) out.push(`max ${n.iMaxA} A`); if (n.fuseA) out.push(`fuse ${n.fuseA} A`);
      if (n.inputs) out.push(`${n.inputs} in`); if (n.outputs) out.push(`${n.outputs} out`);
      break;
    case "capacitors": if (n.farads) out.push(`${n.farads} F`); if (n.voltageV) out.push(`${n.voltageV} V`); break;
    case "batteries": if (n.chemistry) out.push(String(n.chemistry)); if (n.ah) out.push(`${n.ah} Ah`); if (n.cca) out.push(`${n.cca} CCA`); break;
    case "fuses": case "distribution": if (n.kind) out.push(String(n.kind)); if (n.fuseType) out.push(String(n.fuseType)); if (n.ratingA) out.push(`${n.ratingA} A`); if (n.ways) out.push(String(n.ways)); if (n.packQty) out.push(`pack of ${n.packQty}`); break;
    case "cable": case "wiring_kits": if (n.kind) out.push(String(n.kind)); if (n.awg) out.push(`${n.awg} AWG`); if (n.areaMm2) out.push(`${n.areaMm2} mm2${n.labelOnly ? " (label)" : ""}`); if (n.material) out.push(matName(n.material)); if (n.lengthM) out.push(`${n.lengthM} m`); break;
    case "interconnects": if (n.kind) out.push(String(n.kind)); if (n.lengthM) out.push(`${n.lengthM} m`); if (n.channels) out.push(`${n.channels} ch`); break;
    case "terminals": if (n.kind) out.push(String(n.kind)); if (n.awgs) out.push(`${n.awgs.join("/")} AWG`); if (n.studMm) out.push(`${n.studMm} mm stud`); if (n.packQty) out.push(`pack of ${n.packQty}`); break;
  }
  return out.join(", ");
}
function driverSpecs(d: any): string {
  const out: string[] = [];
  if (d?.sizeLabel) out.push(String(d.sizeLabel)); else if (d?.sizeIn) out.push(`${d.sizeIn} in`);
  if (d?.type) out.push(String(d.type).replace("_", " "));
  if (d?.coil) out.push(`${d.coil}${d.ohmsPerCoil ? ` ${d.ohmsPerCoil} ohm` : ""}`); else if (d?.params?.Znom) out.push(`${d.params.Znom} ohm`);
  if (d?.rmsW) out.push(`${d.rmsW} W RMS`);
  if (d?.params?.fs) out.push(`Fs ${fx(d.params.fs)} Hz`);
  return out.join(", ");
}
const driverSource = (d: any): string | undefined => (d?.sources ?? []).map((s: any) => s?.source).find(isHttp) ?? (isHttp(d?.rawRef) ? d.rawRef : undefined);
const partName = (p: any) => `${p.brand ?? ""} ${p.model || p.title || p.id}`.trim();

// ------------------------------------------------------------------------------------------------------------ builder
class Lines {
  list: BomLine[] = [];
  add(l: Omit<BomLine, "prices" | "notes"> & { prices?: BomPrice[]; notes?: string }, merge = false): BomLine {
    const ex = this.list.find((x) => x.key === l.key);
    if (ex && merge) {
      if (l.qty !== undefined) ex.qty = (ex.qty ?? 0) + l.qty;
      for (let i = 0; i < l.from.length; i++) if (!ex.from.includes(l.from[i])) { ex.from.push(l.from[i]); ex.fromNames.push(l.fromNames[i]); }
      return ex;
    }
    let key = l.key; for (let k = 2; this.list.some((x) => x.key === key); k++) key = `${l.key}#${k}`;
    const line: BomLine = { prices: [], notes: "", ...l, key };
    this.list.push(line); return line;
  }
}
/** Price fields of a line from a price list (lowest first). */
function priced(prices: BomPrice[]): Pick<BomLine, "prices" | "unitPrice" | "supplier" | "priceDate" | "priceUrl"> {
  const p = prices[0];
  return { prices, unitPrice: p?.priceAud, supplier: p?.supplier, priceDate: p?.date, priceUrl: p?.url };
}

/** How each end of a power / ground wire is terminated, by the role of the item it lands on (rule stated in docs/bom.md). */
function termination(role: Role, it: Item | undefined, lk: BomLookups): { type: "ring lug" | "ferrule"; stud?: string } | undefined {
  const p: any = it?.data?.partId && lk.part ? lk.part(it.data.partId, it.data.partCategory) : undefined;
  const stud = num(it?.data?.studMm) ? `${it!.data.studMm} mm stud` : num(p?.n?.studMm) ? `${p.n.studMm} mm stud` : num(p?.stud_mm) ? `${p.stud_mm} mm stud` : undefined;
  switch (role) {
    case "battery": return { type: "ring lug", stud: stud ?? "battery terminal stud" };
    case "fuse": return { type: "ring lug", stud: stud ?? "fuse holder stud" };
    case "capacitor": return { type: "ring lug", stud: stud ?? "capacitor stud" };
    case "ground": return { type: "ring lug", stud: stud ?? "chassis bolt" };
    case "alternator": return { type: "ring lug", stud: stud ?? "alternator stud" };
    case "distribution": case "amplifier": case "dsp": return { type: "ferrule" };
  }
  return undefined;
}
/** RCA pairs a signal link needs from its port name: "out 1-4" = 4 channels = 2 pairs, "out 7/8" = 1 pair, else 1 pair. */
export function rcaPairs(port?: string): number {
  const s = String(port ?? "");
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(s);
  if (m) { const n = Math.abs(+m[2] - +m[1]) + 1; return Math.max(1, Math.ceil(n / 2)); }
  return 1;
}
const highLevel = (l: ItemLink) => /high.?level|speaker.?level/i.test(`${l.fromPort ?? ""} ${l.toPort ?? ""} ${l.note ?? ""}`);

type WireUse = "power" | "ground" | "speaker" | "remote";
const USE_LABEL: Record<WireUse, string> = { power: "Power cable", ground: "Ground cable", speaker: "Speaker cable", remote: "Remote turn-on wire" };
interface Wire { use: WireUse; size?: string; sizeHow?: string; material: Material; materialAssumed?: boolean; lengthM?: number; lengthHow?: string; part?: any; partId?: string; from: Item[]; ends: [Item | undefined, Item | undefined][]; label: string }

/**
 * The bill of materials of a project (or of a single item wrapped as a one-item project).
 * Quantities: parts 1 each (an item is one part); drivers x their count; cable metres per use, gauge and material (+ spare %,
 * rounded up to whole metres; packs for cable products sold by length); lugs / ferrules per wire end; fuses per holder or
 * fused output; MDF sheets from the board nesting; generic enclosure lines by the rules in docs/bom.md.
 */
export function bomForProject(doc: ProjectDoc, lk: BomLookups = {}, opts: BomOptions = {}): Bom {
  const spare = num(opts.sparePct) || opts.sparePct === 0 ? opts.sparePct! : num(doc.bomSparePct) || doc.bomSparePct === 0 ? doc.bomSparePct : DEFAULT_SPARE_PCT;
  const ov: BomOverrides = opts.overrides ?? doc.bomOverrides ?? {};
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const items = doc.items; const byId = new Map(items.map((i) => [i.id, i]));
  const g = graphOf(doc);
  const cv: CableView = cableFor(doc, lk);
  const res = cv.result;
  const L = new Lines(); const notes: string[] = []; const missing = new Lines();
  const part = (it?: Item): any => (it?.data?.partId && lk.part ? lk.part(it.data.partId, it.data.partCategory) : undefined);
  const miss = (key: string, item: string, note: string, from: Item[] = []) => missing.add({ key: "miss:" + key, group: "missing", item, unit: "", from: from.map((i) => i.id), fromNames: from.map((i) => i.name), notes: note });

  // ---------------------------------------------------------------- speakers and drivers
  const driverLine = (did: string | undefined, qty: number, it: Item, what = "driver", keyPfx = "drv") => {
    if (!did) { miss(`${keyPfx}:${it.id}`, `${it.name}: no ${what} chosen`, `Choose the ${what} (Drivers tab or the item's own tab) so it is counted and priced.`, [it]); return; }
    if (did === "custom") { L.add({ key: `${keyPfx}:${it.id}`, group: "speakers", item: `Passive radiator (values typed in) for ${it.name}`, qty, unit: "each", from: [it.id], fromNames: [it.name], notes: "Values typed in on Design new: no product, no price." }); return; }
    const d: any = lk.driver?.(did);
    if (!d) { L.add({ key: `${keyPfx}:${it.id}`, group: "speakers", item: `${what === "driver" ? "Driver" : "Passive radiator"} ${did}`, partId: did, category: "driver", qty, unit: "each", from: [it.id], fromNames: [it.name], notes: "Driver not found in the driver list (deleted or not loaded): no details or price." }); return; }
    const prices = driverBomPrices(d);
    L.add({ key: `${keyPfx}:${it.id}`, group: "speakers", item: `${d.brand} ${d.model}`.trim(), brand: d.brand, model: d.model, partId: d.id, category: d.kind === "passive" ? "passive radiator" : "driver", qty, unit: "each", ...priced(prices), priceUnit: "each",
      from: [it.id], fromNames: [it.name], derived: qty > 1 ? `${qty} on ${it.name}` : undefined, source: driverSource(d), specs: driverSpecs(d),
      notes: prices.length ? "" : d.private ? "Your own driver entry: no price listed." : "No AUD price listed for this driver." });
  };
  // enclosure accumulators
  const allPanels: { t: number; piece: Piece; it: Item; mat: MaterialId; grain: boolean }[] = [];
  const boxes: { it: Item; src: BoxSource; drivers: number }[] = [];
  for (const it of items) {
    if (roleOf(it) !== "speaker") continue;
    const d = it.data ?? {};
    if (it.kind === "box") {
      const n = Math.max(1, Math.round(num(d.drivers) ? d.drivers : 1));
      driverLine(d.driverId, n, it);
      const src = lk.box?.(it) ?? defaultBoxSource(it);
      if (src.kind === "pr" && src.prId) driverLine(src.prId, Math.max(1, Math.round(src.prCount ?? 1)), it, "passive radiator", "pr");
      boxes.push({ it, src, drivers: n });
    } else if (it.kind === "door" || it.kind === "ib" || it.kind === "speaker" || it.kind === "home" || it.kind === "computer") {
      const n = Math.max(1, Math.round(num(d.count) ? d.count : num(d.drivers) ? d.drivers : 1));
      driverLine(d.driverId, n, it);
      if (it.kind === "ib") { const src = lk.box?.(it); if (src) boxes.push({ it, src, drivers: n }); else miss(`ib:${it.id}`, `${it.name}: baffle board not counted`, "Open the BOM in the app so the baffle board size is worked out (Infinite baffle tab).", [it]); }
    }
  }

  // ---------------------------------------------------------------- enclosures and materials
  const boxN = boxes.filter((b) => b.it.kind === "box"), ibN = boxes.filter((b) => b.it.kind === "ib");
  for (const b of boxes) {
    if (b.src.error && !b.src.panels.length) miss(`panels:${b.it.id}`, `${b.it.name}: panels not counted`, `${b.src.error}`, [b.it]);
    const mat = itemMaterial(b.it.kind, b.src.material); const grain = materialInfo(mat).grain && b.src.grain !== false;
    for (const p of b.src.panels) allPanels.push({ t: p.t, piece: { ...p, id: `${b.it.id}:${p.id}`, name: `${b.it.name}: ${p.name}`, ...(p.pairKey ? { pairKey: `${b.it.id}:${p.pairKey}` } : {}) }, it: b.it, mat, grain });
  }
  const kerf = lk.kerfMm ?? 3.2, trim = lk.trimMm ?? 5;
  // B7_PLYWOOD_BOARDS: one group per (material, thickness, grain lock); MDF lines keep their keys (mdf:<t>:<L>x<W>) for old overrides
  const groupsMT = [...new Map(allPanels.map((p) => [`${p.mat}|${p.t}|${p.grain ? 1 : 0}`, { mat: p.mat, t: p.t, grain: p.grain }])).values()]
    .sort((a, b) => MATERIALS.findIndex((m) => m.id === a.mat) - MATERIALS.findIndex((m) => m.id === b.mat) || a.t - b.t || Number(a.grain) - Number(b.grain));
  for (const { mat, t, grain } of groupsMT) {
    const mi = materialInfo(mat); const isMdf = mi.catalogue === "mdf";
    const kp = isMdf ? `mdf:${t}` : `ply:${mat}:${t}${grain ? "" : ":free"}`; const matTxt = isMdf ? "MDF" : mi.label;
    const ps = allPanels.filter((p) => p.mat === mat && p.t === t && p.grain === grain); const pieces = ps.map((p) => p.piece);
    const its = [...new Map(ps.map((p) => [p.it.id, p.it])).values()];
    const from = { from: its.map((i) => i.id), fromNames: its.map((i) => i.name) };
    const areaM2 = pieces.reduce((s, p) => s + pieceArea(p), 0) / 1e6;
    if (!isMdf && !lk.plySheets) { miss(kp, `${matTxt} ${t} mm: the plywood sheet list is not loaded`, `${pieces.length} panels (${fx(areaM2, 2)} m2). The app server serves the plywood sheets (data/boards/generic_sheets.json, or the local supplier catalogue) from this version on: restart it (scripts/restart_app.sh).`, its); continue; }
    const tm = matchThickness(sheetsOfMaterial(mat, lk.sheets ?? [], lk.plySheets ?? []), t);
    const cat = buyable(tm.sheets, (x) => x);  // PM: comparison-only sheets are not the BOM buy
    if (!cat.length) { miss(kp, `${matTxt} ${t} mm: no sheet of this thickness in the catalogue`, `${pieces.length} panels (${fx(areaM2, 2)} m2) need ${t} mm ${isMdf ? "board" : matTxt.toLowerCase()} (within ${THICKNESS_TOL_MM} mm): buy it where it is sold, or change the panel thickness or the material (Boards tab).`, its); continue; }
    const specs: SheetSpec[] = cat.map((s, i) => ({ key: String(i), L: s.lengthMm, W: s.widthMm, price: s.priceAud, group: s.supplier }));
    const o = { kerf, trim, pair: true, grain };
    const sheetPrices = (Lm: number, Wm: number) => cat.filter((s) => s.lengthMm === Lm && s.widthMm === Wm && num(s.priceAud))
      .map((s) => ({ supplier: s.supplier, priceAud: s.priceAud!, date: s.priceDate, url: s.url, note: [s.product, s.category === "moisture_resistant" ? "moisture resistant" : "", Math.abs(s.thicknessMm - t) > 1e-9 ? `listed ${s.thicknessMm} mm` : ""].filter(Boolean).join(", ") }))
      .sort((a, b) => a.priceAud - b.priceAud);
    const tolTxt = tm.off.length ? ` Sheets listed at ${tm.off.join(", ")} mm are counted as ${t} mm (within ${THICKNESS_TOL_MM} mm).` : "";
    const grainTxt = grain ? " Grain lock: every panel's long side along the sheet length (face grain)." : "";
    const wt = panelsWeight(pieces.map((p) => ({ ...p, t })), mat);
    const sheetLine = (Lm: number, Wm: number, qty: number, derived: string) => {
      const prices = sheetPrices(Lm, Wm);
      L.add({ key: `${kp}:${Lm}x${Wm}`, group: "enclosure", item: `${isMdf ? "MDF sheet" : `${matTxt} sheet`} ${t} mm, ${Lm} x ${Wm} mm`, partId: `${isMdf ? "mdf" : `ply-${mat}`}-${t}-${Lm}x${Wm}`, category: isMdf ? "MDF sheet" : "Plywood sheet", qty, unit: "sheet", ...priced(prices), priceUnit: "sheet", ...from, derived: derived + tolTxt + grainTxt,
        specs: `${t} mm ${matTxt}, ${Lm} x ${Wm} mm${wt.kg !== undefined ? `; panels about ${fx(wt.kg, 1)} kg at ${mi.density.label}` : ""}`, notes: prices.length ? `Prices: the local supplier catalogue (data/private/boards/${isMdf ? "mdf" : "plywood"}_sheets_au.json), read on the date shown; not live.` : "No price for this size in the catalogue (the public app lists generic sheet sizes without prices)." });
    };
    let sm: ReturnType<typeof smallestSheet>;
    try { sm = smallestSheet(pieces, specs, o); } catch { sm = undefined; }
    if (sm) { sheetLine(sm.sheet.L, sm.sheet.W, 1, `Smallest single sheet that holds all ${pieces.length} panels of ${t} mm (${fx(areaM2, 2)} m2, ${fx(sm.plan.sheets[0]?.pct ?? 0, 0)} % of the sheet used), Boards tab method: saw cut ${kerf} mm, ${trim} mm trimmed off each factory edge.`); continue; }
    let buys: ReturnType<typeof cheapestBuys> = [];
    try { buys = cheapestBuys(pieces, specs, o); } catch { buys = []; }
    if (buys.length) {
      const b = buys[0]; const by = new Map<string, number>();
      for (const s of b.sheets) by.set(`${s.L}x${s.W}`, (by.get(`${s.L}x${s.W}`) ?? 0) + 1);
      for (const [k, q] of by) { const [Lm, Wm] = k.split("x").map(Number); sheetLine(Lm, Wm, q, `No single sheet holds all ${pieces.length} panels of ${t} mm (${fx(areaM2, 2)} m2): cheapest way to buy = ${b.sheets.length} sheets from ${b.group} ($${b.cost.toFixed(2)}), Boards tab method (saw cut ${kerf} mm, trim ${trim} mm).`); }
      continue;
    }
    // P1_PUBLIC_DATA: no prices (generic sheet sizes), so no cheapest buy: count sheets of the largest size that holds every panel
    if (!specs.some((s) => num(s.price))) {
      const big = [...specs].sort((a, b) => b.L * b.W - a.L * a.W || b.L - a.L)[0];
      let rp: ReturnType<typeof nestRepeat> | undefined; try { rp = big ? nestRepeat(pieces, big.L, big.W, o) : undefined; } catch { rp = undefined; }
      if (big && rp && !rp.unplaced.length && rp.sheets.length) { sheetLine(big.L, big.W, rp.sheets.length, `No single sheet holds all ${pieces.length} panels of ${t} mm (${fx(areaM2, 2)} m2) and no prices are known: ${rp.sheets.length} sheets of the largest size listed, Boards tab method (saw cut ${kerf} mm, trim ${trim} mm).`); continue; }
    }
    miss(kp, `${matTxt} ${t} mm: the panels do not fit the sheets in the catalogue`, `${pieces.length} panels; at least one is bigger than every ${t} mm sheet (Boards tab shows which).`, its);
  }
  if (boxN.length) {
    const fromAll = { from: boxN.map((b) => b.it.id), fromNames: boxN.map((b) => b.it.name) };
    const all = [...boxN, ...ibN]; const fromAllIb = { from: all.map((b) => b.it.id), fromNames: all.map((b) => b.it.name) };
    L.add({ key: "enc:glue", group: "enclosure", item: "Wood glue (PVA), bottle", qty: all.length, unit: "bottle", ...fromAllIb, derived: "1 bottle per box or baffle (rule of thumb: check the coverage on the bottle)." });
    L.add({ key: "enc:sealant", group: "enclosure", item: "Sealant for the inside joints (silicone or acrylic), tube", qty: all.length, unit: "tube", ...fromAllIb, derived: "1 tube per box or baffle (every inside joint and the terminal and driver openings must be airtight)." });
    const jointMm = all.reduce((s, b) => s + b.src.panels.reduce((a, p) => a + 2 * (p.w + p.h), 0) / 2, 0);
    const maxT = Math.max(0, ...all.flatMap((b) => b.src.panels.map((p) => p.t)));
    if (jointMm > 0) L.add({ key: "enc:screws", group: "enclosure", item: "Wood screws for the panels", qty: Math.ceil(jointMm / 150), unit: "each", ...fromAllIb, derived: `1 screw per 150 mm of joint; joint length = half the sum of every panel's perimeter = ${fx(jointMm / 1000, 2)} m.${maxT ? ` Length about twice the panel thickness (${maxT} mm), pilot-drill MDF.` : ""}` });
    const nd = boxN.reduce((s, b) => s + b.drivers, 0) + ibN.reduce((s, b) => s + b.drivers, 0);
    L.add({ key: "enc:drvscrews", group: "enclosure", item: "Driver mounting screws", qty: nd * 8, unit: "each", ...fromAllIb, derived: `8 per driver x ${nd} driver${nd === 1 ? "" : "s"} (count the holes in the driver frame; some drivers come with screws).` });
    L.add({ key: "enc:terminal", group: "enclosure", item: "Terminal cup (speaker terminal plate)", qty: boxN.length, unit: "each", ...fromAll, derived: "1 per box (a dual-input cup for two separately wired coils or drivers)." });
    const filled = boxN.filter((b) => ["sealed", "pr", "tl"].includes(String(b.src.kind)));
    if (filled.length) L.add({ key: "enc:fill", group: "enclosure", item: "Fill / stuffing (polyester fibre), bag", qty: filled.length, unit: "bag", from: filled.map((b) => b.it.id), fromNames: filled.map((b) => b.it.name), derived: "1 bag per sealed, passive-radiator or transmission line box.", notes: "The amount is to taste: no verified figure (research_c part 2, 1.3 d); fill, then measure. Keep it away from ports." });
    for (const b of boxN) {
      const pt = b.src.port; if (b.src.kind !== "vented" || !pt) continue;
      if (pt.shape === "round") L.add({ key: `enc:port:${b.it.id}`, group: "enclosure", item: `Port tube ${pt.d ? `${pt.d} mm inside diameter` : "(diameter as designed)"}${pt.lengthMm ? `, ${Math.round(pt.lengthMm)} mm long` : ""}`, qty: Math.max(1, pt.count ?? 1), unit: "each", from: [b.it.id], fromNames: [b.it.name], derived: `${Math.max(1, pt.count ?? 1)} round port(s) as designed on ${b.it.name}.`, notes: "PVC pipe or a flared port tube; cut to the length shown on the design." });
      else L.add({ key: `enc:slot:${b.it.id}`, group: "enclosure", item: "Slot port walls (MDF)", qty: undefined, unit: "", from: [b.it.id], fromNames: [b.it.name], notes: "Slot port walls are not in the cut list yet: add the board for them (same thickness) to the sheet above." });
    }
    const carpetM2 = boxN.reduce((s, b) => s + b.src.panels.reduce((a, p) => a + pieceArea(p), 0), 0) / 1e6;
    if (carpetM2 > 0) {
      L.add({ key: "enc:carpet", group: "enclosure", item: "Box carpet (automotive)", qty: Math.ceil(carpetM2 * 1.15 * 10) / 10, unit: "m2", ...fromAll, derived: `Panel area ${fx(carpetM2, 2)} m2 + 15 % for wrapping the edges, rounded up to 0.1 m2.` , notes: "Optional finish." });
      L.add({ key: "enc:carpetglue", group: "enclosure", item: "Spray adhesive for the carpet, can", qty: 1, unit: "can", ...fromAll, derived: "1 can (check the coverage on the can against the carpet area).", notes: "Optional finish." });
    }
  } else if (ibN.length) {
    const f = { from: ibN.map((b) => b.it.id), fromNames: ibN.map((b) => b.it.name) };
    L.add({ key: "enc:glue", group: "enclosure", item: "Wood glue (PVA), bottle", qty: ibN.length, unit: "bottle", ...f, derived: "1 bottle per baffle (layers glued together)." });
    L.add({ key: "enc:sealant", group: "enclosure", item: "Sealant (baffle to the car body), tube", qty: ibN.length, unit: "tube", ...f, derived: "1 tube per baffle: an infinite baffle must be sealed airtight between the boot and the cabin." });
    const nd = ibN.reduce((s, b) => s + b.drivers, 0);
    L.add({ key: "enc:drvscrews", group: "enclosure", item: "Driver mounting screws", qty: nd * 8, unit: "each", ...f, derived: `8 per driver x ${nd} driver${nd === 1 ? "" : "s"} (count the holes in the driver frame).` });
  }

  // ---------------------------------------------------------------- electrical parts (amps, DSP, head unit, power, connectors, other)
  const groupFor = (r: Role): BomGroupId | undefined => ({ amplifier: "amplifiers", dsp: "dsp", headunit: "dsp", battery: "power", fuse: "power", distribution: "power", capacitor: "power", connector: "connectors", other: "other", alternator: "power" } as Partial<Record<Role, BomGroupId>>)[r];
  for (const it of items) {
    const r = roleOf(it); const grp = groupFor(r); if (!grp) continue;
    const p = part(it);
    if (r === "alternator" && !p) continue; // the car's own alternator: not bought (its rating is used by the cable calculator)
    if (r === "other" && !p && !it.data?.partId && /^(ground|chassis)$/i.test(String(it.data?.role ?? ""))) continue;
    if (p) {
      const prices = partPrices(p);
      const pack = num(p.n?.packQty) ? `pack of ${p.n.packQty}` : "each";
      L.add({ key: `item:${it.id}`, group: grp, item: partName(p), brand: p.brand, model: p.model || p.title, partId: p.id, category: p.category, qty: 1, unit: pack, ...priced(prices), priceUnit: pack, from: [it.id], fromNames: [it.name], source: isHttp(p.sourceUrl) ? p.sourceUrl : undefined, specs: partSpecs(p), notes: prices.length ? (p.check ? `Check: ${p.check}` : "") : "No AUD price listed for this part." });
    } else {
      const plainBattery = r === "battery";
      const what = r === "headunit" ? "Head unit" : it.name;
      L.add({ key: `item:${it.id}`, group: grp, item: it.kind === "other" && r === "other" ? `${it.name}${it.data?.role ? ` (${it.data.role})` : ""}` : what === it.name ? it.name : `${what}: ${it.name}`, qty: plainBattery ? 0 : 1, unit: "each", from: [it.id], fromNames: [it.name], specs: plainSpecs(it),
        notes: plainBattery ? "The car's own battery (no part chosen): quantity 0; set 1 if you buy one (or pick it on the Parts tab, Batteries)." : it.data?.partId ? `Part ${it.data.partId} not loaded or no longer in the database: no details or price.` : "No part chosen: pick the real one on the Parts tab (price unknown until then)." });
    }
    // fuse inserts for holders and fused distribution outputs (derived)
    if (it.kind === "fuseholder") {
      const included = num(p?.fuse_included_a) || it.data?.fuseIncluded === true;
      if (!included) {
        const run = res?.runs.find((x) => x.id === cv.runOfFuse.get(it.id));
        const rating = num(it.data?.ratingA) ? it.data.ratingA : num(p?.n?.ratingA) ? p.n.ratingA : run?.fuseA ?? run?.fuseRecommendedA;
        const type = String(it.data?.type ?? p?.n?.fuseType ?? "").trim();
        L.add({ key: `fuse:${type || "holder"}:${rating ?? "?"}`, group: "power", item: `Fuse ${type ? type + " " : ""}${rating ? rating + " A" : "(rating to choose)"}`, qty: 1, unit: "each", from: [it.id], fromNames: [it.name],
          derived: `1 fuse for each fuse holder that does not come with one${!num(it.data?.ratingA) && !num(p?.n?.ratingA) && rating ? " (rating from the cable calculator)" : ""}.`, notes: type ? "" : "Fuse type: the one the holder takes." }, true);
      }
    }
    if (r === "distribution" && (it.data?.fused ?? p?.n?.fused)) {
      const branches = res ? res.runs.filter((x) => cv.runJunctionOf.get(x.id) === it.id) : [];
      const type = String(it.data?.type ?? p?.n?.fuseType ?? "").trim();
      const ratings: (number | undefined)[] = branches.length ? branches.map((x) => (num(it.data?.fuseA) ? it.data.fuseA : x.fuseA ?? x.fuseRecommendedA)) : g.out(it.id, "power").map(() => (num(it.data?.fuseA) ? it.data.fuseA : undefined));
      for (const rt of ratings) L.add({ key: `fuse:${type || "block"}:${rt ?? "?"}`, group: "power", item: `Fuse ${type ? type + " " : ""}${rt ? rt + " A" : "(rating to choose)"}`, qty: 1, unit: "each", from: [it.id], fromNames: [it.name],
        derived: "1 fuse per used output of a fused distribution block (rating: the branch fuse entered, else the cable calculator's).", notes: type ? "" : "Fuse type: the one the block takes. Some blocks come with fuses: check." }, true);
    }
  }

  // ---------------------------------------------------------------- cable
  const wires: Wire[] = [];
  const runById = (id?: string): RunResult | undefined => (id && res ? res.runs.find((r) => r.id === id) : undefined);
  const runEndingAt = (id: string): RunResult | undefined => { for (const [rid, end] of cv.runEnd) if (end === id) return runById(rid); return undefined; };
  const runSize = (r: RunResult | undefined, mat: Material): { size?: string; how: string } => {
    if (!r) return { how: "" };
    if (r.chosen?.size) return { size: normAwg(r.chosen.size) ?? r.chosen.size, how: "the size chosen on that run" };
    const s = r.recommended.awg[mat]?.size; return s ? { size: s, how: `recommended by the cable calculator (${matName(mat)})` } : { how: "" };
  };
  const optMat: Material = (res?.options.material ?? "copper") as Material;
  const speakerRes = (amp: string, target: string) => res?.speakers.find((s) => s.id === `${amp}>${target}`);
  // 1) cable items
  for (const c of items.filter((i) => roleOf(i) === "cable")) {
    const p = part(c); const d = c.data ?? {};
    if (p?.category === "wiring_kits") {
      const prices = partPrices(p);
      L.add({ key: `item:${c.id}`, group: "cable", item: partName(p), brand: p.brand, model: p.model || p.title, partId: p.id, category: p.category, qty: 1, unit: "kit", ...priced(prices), priceUnit: "kit", from: [c.id], fromNames: [c.name], source: isHttp(p.sourceUrl) ? p.sourceUrl : undefined, specs: partSpecs(p), notes: "Wiring kit: check it holds the lengths and sizes below; cable lines below may then not be needed." });
      continue;
    }
    const used = g.links.filter((l) => l.cableItemId === c.id);
    const kinds = new Set(used.map((l) => l.kind));
    const use: WireUse = kinds.has("speaker") ? "speaker" : kinds.has("remote") ? "remote" : kinds.has("ground") && !kinds.has("power") ? "ground" : kinds.has("power") ? "power" : cableUseOf(c, p);
    if (kinds.size && [...kinds].every((k) => k === "signal")) { // a lead used on signal links (interconnect): one each
      const prices = p ? partPrices(p) : [];
      L.add({ key: `item:${c.id}`, group: "cable", item: p ? partName(p) : `Signal lead: ${c.name}`, brand: p?.brand, model: p ? p.model || p.title : undefined, partId: p?.id, category: p?.category, qty: 1, unit: "each", ...priced(prices), priceUnit: "each", from: [c.id], fromNames: [c.name], source: isHttp(p?.sourceUrl) ? p.sourceUrl : undefined, specs: p ? partSpecs(p) : undefined, notes: p ? "" : "No product chosen." });
      continue;
    }
    let mat: Material = (d.material ?? p?.n?.material) as Material; let matAssumed = false;
    let size = normAwg(d.size) ?? p?.n?.awg; let sizeHow = size ? (d.size ? "entered on the cable item" : "the product's size") : undefined;
    if (!size && (use === "power" || use === "ground")) {
      const run = runById(cv.runOfCable.get(c.id)) ?? (used[0] ? runEndingAt(used[0].from) ?? runEndingAt(used[0].to) : undefined);
      const rs = runSize(run, mat ?? run?.chosen?.material ?? optMat); size = rs.size; sizeHow = rs.how || undefined;
    }
    if (!size && use === "speaker" && used[0]) { const s = speakerRes(used[0].from, used[0].to); if (s?.recommendedAwg) { size = s.recommendedAwg; sizeHow = "recommended by the cable calculator (5 % rule)"; } }
    if (!mat) { mat = optMat; matAssumed = true; }
    const ends = used.map((l) => [byId.get(l.from), byId.get(l.to)] as [Item | undefined, Item | undefined]);
    wires.push({ use, size, sizeHow, material: mat, materialAssumed: matAssumed, lengthM: num(d.lengthM) ? d.lengthM : undefined, lengthHow: num(d.lengthM) ? "entered" : undefined, part: p, partId: p?.id, from: [c], ends, label: c.name });
    if (num(d.groundLengthM) && use === "power") {
      const amp = used.map((l) => byId.get(l.to)).find((x) => roleOf(x) === "amplifier" || roleOf(x) === "dsp");
      wires.push({ use: "ground", size, sizeHow: size ? "same size as its power cable" : undefined, material: mat, materialAssumed: matAssumed, lengthM: d.groundLengthM, lengthHow: "ground return entered on the power cable", from: [c], ends: amp ? [[amp, undefined]] : [], label: `${c.name} (ground return)` });
    }
  }
  // 2) links with no cable item (the wire is still needed)
  for (const l of g.links) {
    if (l.cableItemId && byId.has(l.cableItemId)) continue;
    const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) continue;
    const ra = roleOf(a), rb = roleOf(b);
    if (l.kind === "signal") continue;
    if (ra === "cable" || rb === "cable") continue; // a cable item used as a node: its own length is counted above
    if (l.kind === "power" || l.kind === "ground") {
      let run: RunResult | undefined; let len: number | undefined; let lenHow: string | undefined;
      if (l.kind === "power") {
        if (ra === "battery" && rb === "fuse") { run = runById(cv.runOfFuse.get(b.id)); if (num(b.data?.distanceMm)) { len = b.data.distanceMm / 1000; lenHow = "the fuse's distance from the battery"; } }
        run ??= runEndingAt(b.id) ?? runById(cv.runOfFuse.get(a.id)) ?? runById(cv.runOfFuse.get(b.id));
        if (!run && ra === "capacitor") run = runEndingAt(b.id);
      } else run = runEndingAt(a.id);
      const rs = runSize(run, run?.chosen?.material ?? optMat);
      // the same product as the run's own cable (e.g. the short piece from the battery to the main fuse): counted with it
      const same = l.kind === "power" && run && rs.size ? [...cv.runOfCable].filter(([, r]) => r === run!.id).map(([c]) => byId.get(c)).find((c) => c && part(c)?.category === "cable" && (normAwg(c.data?.size) ?? part(c)?.n?.awg) === rs.size) : undefined;
      const sp = same ? part(same) : undefined;
      wires.push({ use: l.kind, size: rs.size, part: sp, partId: sp?.id, sizeHow: rs.how ? `${rs.how}${l.kind === "ground" ? " (ground = same size as the power wire)" : ""}` : undefined, material: (run?.chosen?.material ?? optMat) as Material, materialAssumed: !run?.chosen, lengthM: len, lengthHow: lenHow, from: [a, b], ends: [[a, b]], label: `${a.name} to ${b.name}` });
    } else if (l.kind === "speaker") {
      const s = speakerRes(a.id, b.id);
      wires.push({ use: "speaker", size: s?.recommendedAwg, sizeHow: s?.recommendedAwg ? "recommended by the cable calculator (5 % rule)" : undefined, material: optMat, materialAssumed: true, from: [a, b], ends: [[a, b]], label: `${a.name} to ${b.name}` });
    } else if (l.kind === "remote") {
      wires.push({ use: "remote", material: optMat, materialAssumed: true, from: [a, b], ends: [[a, b]], label: `${a.name} to ${b.name}` });
    }
  }
  // 3) big 3 upgrade
  if (res?.big3?.runs.length) {
    const mat = (doc.cableBig3?.material ?? "copper") as Material;
    for (const r of res.big3.runs) wires.push({ use: "power", size: r.size ?? r.awg?.size, sizeHow: "big 3 sizing of the cable calculator", material: mat, lengthM: num(r.lengthM) ? r.lengthM : undefined, lengthHow: num(r.lengthM) ? "entered (big 3)" : undefined, from: [], ends: [], label: `Big 3: ${r.name}` });
  }
  // aggregate into lines: use, size, material, product
  const cableKeys = new Map<string, Wire[]>();
  for (const w of wires) { const k = `cable:${w.use}:${w.size ?? "?"}:${w.material}:${w.partId ?? "generic"}`; (cableKeys.get(k) ?? cableKeys.set(k, []).get(k)!).push(w); }
  for (const [key, ws] of cableKeys) {
    const w0 = ws[0]; const known = ws.filter((w) => num(w.lengthM)); const unknown = ws.length - known.length;
    const sum = known.reduce((s, w) => s + w.lengthM!, 0);
    const need = sum * (1 + spare / 100);
    const metres = known.length ? Math.ceil(need - 1e-9) : undefined;
    const fromItems = [...new Map(ws.flatMap((w) => w.from).map((i) => [i.id, i])).values()];
    const pieces = known.map((w) => `${fx(w.lengthM!, 2)} m (${w.label})`).join(" + ");
    const derivedLen = known.length ? `${known.length} piece${known.length > 1 ? "s" : ""}: ${pieces} = ${fx(sum, 2)} m, + ${spare} % spare = ${fx(need, 2)} m, rounded up to ${metres} m.` : "";
    const sizeNote = w0.size ? (w0.sizeHow ? ` Size: ${w0.sizeHow}.` : "") : " Size not chosen and no recommendation (no length or no load on the run): choose it in the cable calculator.";
    const matNote = w0.materialAssumed ? ` Material not chosen: ${matName(w0.material)} assumed (cable calculator default).` : "";
    const unkNote = unknown ? ` Plus ${unknown} wire${unknown > 1 ? "s" : ""} of unknown length (${ws.filter((w) => !num(w.lengthM)).map((w) => w.label).join("; ")}), not counted: enter the length on the cable item (System tab).` : "";
    const p = w0.part;
    if (p) {
      const prices = partPrices(p); const packM = num(p.n?.lengthM) ? p.n.lengthM : undefined;
      const qty = metres === undefined ? undefined : packM ? Math.ceil(metres / packM - 1e-9) : metres;
      const unit = packM ? `pack (${packM} m)` : "m";
      L.add({ key, group: "cable", item: `${USE_LABEL[w0.use]}: ${partName(p)}`, brand: p.brand, model: p.model || p.title, partId: p.id, category: p.category, qty, unit, ...priced(packM ? prices : prices.length && !packM && num(p.n?.pricePerMAud) ? [{ supplier: prices[0].supplier, priceAud: p.n.pricePerMAud, date: prices[0].date, url: prices[0].url, note: "price per metre" }] : prices), priceUnit: packM ? `pack of ${packM} m` : num(p.n?.pricePerMAud) ? "per m" : "each (length sold: check)",
        from: fromItems.map((i) => i.id), fromNames: fromItems.map((i) => i.name), derived: `${derivedLen}${packM && metres !== undefined ? ` Sold as ${packM} m: ${qty} pack${qty === 1 ? "" : "s"}.` : ""}`.trim(), source: isHttp(p.sourceUrl) ? p.sourceUrl : undefined, specs: partSpecs(p), notes: `${unkNote}${matNote}`.trim() });
    } else {
      const hint = cheapestCable(lk.cableRecords, w0.use, w0.size, w0.material);
      L.add({ key, group: "cable", item: `${USE_LABEL[w0.use]} ${sizeTxt(w0.size)}${w0.use === "remote" ? "" : " " + matName(w0.material)}`, qty: metres, unit: "m", from: fromItems.map((i) => i.id), fromNames: fromItems.map((i) => i.name),
        derived: derivedLen, notes: `No product chosen.${sizeNote}${matNote}${unkNote}${hint ? ` For comparison, the cheapest ${w0.size} AWG ${matName(w0.material)} cable per metre in the parts database: ${hint}.` : ""}`.trim() });
    }
  }
  // RCA interconnects for signal links with no interconnect item
  for (const l of g.links) {
    if (l.kind !== "signal" || highLevel(l)) continue;
    if (l.cableItemId && byId.has(l.cableItemId)) continue;
    const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) continue;
    const pairs = rcaPairs(l.fromPort ?? l.toPort);
    L.add({ key: "rca:generic", group: "cable", item: "RCA interconnect (pair), length to measure", qty: pairs, unit: "pair", from: [a.id, b.id], fromNames: [a.name, b.name], derived: "Pairs per signal link from its port name (out 1-4 = 4 channels = 2 pairs; one pair otherwise); high-level (speaker-level) inputs need none.", notes: "No interconnect item chosen: pick one on the Parts tab (Interconnects); the length is the run from the source to the amplifier." }, true);
  }

  // ---------------------------------------------------------------- connectors and terminals (derived from the wire ends)
  const lug = (type: string, size: string | undefined, stud: string | undefined, n: number, w: Wire, why: string) =>
    L.add({ key: `lug:${type}:${size ?? "?"}:${stud ?? ""}`, group: "connectors", item: `${type[0].toUpperCase()}${type.slice(1)} ${sizeTxt(size)}${stud ? `, ${stud}` : ""}`, qty: n, unit: "each", from: w.from.map((i) => i.id), fromNames: w.from.map((i) => i.name), derived: why, notes: `${size ? "" : "Size: the wire's, once chosen. "}${stud && /stud|bolt/.test(stud) && !/\d/.test(stud) ? "Stud size: check on the part (lug hole must match). " : ""}${type === "ferrule" ? "For set-screw terminals; use a ring lug where the part has a stud." : ""}`.trim() }, true);
  for (const w of wires) {
    if (w.use === "power" || w.use === "ground") {
      if (w.label.startsWith("Big 3")) { lug("ring lug", w.size, "stud or bolt at each end", 2, w, "Big 3 wire: a ring lug at each end."); continue; }
      for (const [a, b] of w.ends) for (const end of [a, b]) {
        if (!end) continue;
        const t = termination(roleOf(end), end, lk); if (!t) continue;
        lug(t.type, w.size, t.stud, 1, w, `1 per ${w.use} wire end, by what it lands on: battery, fuse holder, capacitor, chassis = ring lug; amplifier, DSP, distribution block (set-screw) = ferrule.`);
      }
    } else if (w.use === "speaker") {
      for (const [a, b] of w.ends) {
        if (a && (roleOf(a) === "amplifier" || roleOf(a) === "dsp")) lug("ferrule", w.size, undefined, 2, w, "2 per speaker wire at the amplifier end (+ and -).");
        if (b) lug("spade terminal", w.size, undefined, 2, w, "2 per speaker wire at the speaker end (+ and -); or bare wire into the terminal cup.");
      }
    }
  }
  const feeds = g.links.filter((l) => l.kind === "power" && roleOf(byId.get(l.from)) === "battery");
  if (feeds.length) L.add({ key: "grommet:firewall", group: "connectors", item: "Firewall grommet (rubber, for the power cable)", qty: feeds.length, unit: "each", from: feeds.map((l) => l.from), fromNames: feeds.map((l) => byId.get(l.from)?.name ?? l.from), derived: "1 per power run leaving the battery (assumes the battery is in the engine bay; set 0 if it is in the boot or cabin).", notes: "Size: to fit the power cable's outside diameter." }, true);

  // ---------------------------------------------------------------- missing / to decide
  let issues: SystemIssue[] = opts.issues ?? [];
  if (!opts.issues) { try { issues = checkSystem(doc, lk, res); } catch { issues = []; } }
  for (const is of issues) missing.add({ key: `issue:${is.id}`, group: "missing", item: is.message, unit: "", from: is.relatedItemIds, fromNames: is.relatedItemIds.map((id) => byId.get(id)?.name ?? id), notes: `${is.severity === "critical" ? "Critical" : "Warning"} (missing-part check, rule ${is.rule}): ${is.suggestion.label}` });
  if (!items.some((i) => roleOf(i) === "speaker") && !items.some((i) => roleOf(i) !== "speaker")) notes.push("The project has no items.");
  notes.push(`Prices: lowest AUD price known (inc. GST as listed) with the supplier and the date it was read; not live. Check every price and part before buying.`);
  notes.push(`Cable: metres per use, gauge and material from the cable items (lengths entered), + ${spare} % spare, rounded up to whole metres; sizes not chosen come from the cable calculator's recommendation.`);

  // ---------------------------------------------------------------- overrides, totals
  const apply = (l: BomLine) => {
    l.calcQty = l.qty; l.calcPrice = l.unitPrice;
    const o = ov[l.key];
    if (o) {
      if (typeof o.qty === "number" && isFinite(o.qty) && o.qty >= 0) { l.qty = o.qty; (l.overridden ??= {}).qty = true; }
      if (typeof o.priceAud === "number" && isFinite(o.priceAud) && o.priceAud >= 0) { l.unitPrice = o.priceAud; (l.overridden ??= {}).price = true; }
    }
    l.total = l.qty !== undefined && l.unitPrice !== undefined ? r2(l.qty * l.unitPrice) : undefined;
  };
  L.list.forEach(apply);
  const groups: BomGroup[] = [];
  for (const gdef of BOM_GROUPS) {
    if (gdef.id === "missing") continue;
    const lines = L.list.filter((l) => l.group === gdef.id); if (!lines.length) continue;
    groups.push({ id: gdef.id, label: gdef.label, lines, subtotal: r2(lines.reduce((s, l) => s + (l.total ?? 0), 0)), priced: lines.filter((l) => l.total !== undefined).length, count: lines.length });
  }
  const total = r2(groups.reduce((s, x) => s + x.subtotal, 0));
  // parts list (one row per distinct part / driver / sheet size)
  const parts = new Map<string, BomPart>();
  for (const l of L.list) {
    if (!l.partId) continue;
    const k = `${l.category ?? ""}:${l.partId}`;
    const ex = parts.get(k);
    if (ex) { ex.lineKeys.push(l.key); continue; }
    parts.set(k, { key: k, id: l.partId, category: l.category ?? "", brand: l.brand, model: l.model, name: l.item.replace(/^(Power|Ground|Speaker) cable: |^Remote turn-on wire: /, ""), specs: l.specs, prices: l.prices, priceUnit: l.priceUnit ?? l.unit, source: l.source, lineKeys: [l.key] });
  }
  return { project: doc.name, title: doc.title, date, sparePct: spare, groups, missing: missing.list, total, priced: groups.reduce((s, x) => s + x.priced, 0), count: groups.reduce((s, x) => s + x.count, 0), parts: [...parts.values()], cable: res, issues, notes };
}

/** What a cable item is for when no link uses it: data.use, else the product's kind, else its name. */
function cableUseOf(c: Item, p: any): WireUse {
  const u = String(c.data?.use ?? "");
  if (u === "speaker" || u === "remote" || u === "power" || u === "ground") return u;
  const k = String(p?.kind ?? p?.n?.kind ?? "");
  if (/speaker/.test(k) || /speaker/i.test(c.name)) return "speaker";
  if (/remote|primary/.test(k) || /remote|turn.?on/i.test(c.name)) return "remote";
  if (/ground/i.test(c.name)) return "ground";
  return "power";
}
/** Values of an item with no part, in a few words (Parts / Items sheets). */
function plainSpecs(it: Item): string {
  const d = it.data ?? {}; const out: string[] = [];
  for (const [k, u] of [["rmsW", "W"], ["class", ""], ["channels", "ch"], ["ratingA", "A"], ["fuseA", "A"], ["farads", "F"], ["type", ""], ["alternatorA", "A alternator"]] as const)
    if (d[k] !== undefined && d[k] !== "") out.push(`${d[k]}${u ? " " + u : ""}`);
  return out.join(", ");
}
/** Cheapest cable product per metre of a size and material (comparison hint for a cable line with no product). */
function cheapestCable(recs: any[] | undefined, use: WireUse, size?: string, mat?: Material): string | undefined {
  if (!recs?.length || !size) return undefined;
  const want = use === "speaker" ? /speaker/ : use === "remote" ? /remote|primary|automotive/ : /power|ground|battery|starter/;
  const ok = recs.filter((r) => r?.n?.awg === size && r.n.material === mat && num(r.n.pricePerMAud) && want.test(String(r.kind ?? r.n.kind ?? "")))
    .sort((a, b) => a.n.pricePerMAud - b.n.pricePerMAud);
  const r = ok[0]; if (!r) return undefined;
  const pr = partPrices(r)[0];
  return `${partName(r)}, $${r.n.pricePerMAud.toFixed(2)}/m${pr ? ` (${pr.supplier}, ${pr.date ?? "date not given"})` : ""}`;
}
/** Box source when the app gives none: no panels (they come from the app's cut list), kind and port from the item data. */
export function defaultBoxSource(it: Item): BoxSource {
  const d = it.data ?? {};
  return { label: it.name, panels: [], error: "Box panels come from the app's cut list: open the BOM in the app (Boards tab method).", kind: d.design?.topology ?? d.kind, port: d.port ? { shape: d.port.shape, count: d.port.count, d: d.port.d, lengthMm: d.port.length } : undefined };
}

// ------------------------------------------------------------------------------------------------------------ overrides
/** Set (or clear, with undefined) a line's quantity / price override on the project (doc.bomOverrides). Empty = removed. */
export function setBomOverride(doc: ProjectDoc, key: string, o: BomOverride): void {
  const all: BomOverrides = { ...(doc.bomOverrides ?? {}) };
  const cur: BomOverride = { ...(all[key] ?? {}), ...o };
  for (const k of Object.keys(cur) as (keyof BomOverride)[]) if (cur[k] === undefined || !(typeof cur[k] === "number" && isFinite(cur[k]!) && cur[k]! >= 0)) delete cur[k];
  if (Object.keys(cur).length) all[key] = cur; else delete all[key];
  if (Object.keys(all).length) doc.bomOverrides = all; else delete doc.bomOverrides;
}
