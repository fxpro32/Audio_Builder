// Parts database (B3_PARTS_DB, R40, 2026-11-23): the normalised app schema of data/parts/<category>.json, the part -> project
// item mapping (field names of docs/cable_engine.md and docs/diagram_engine.md) and the edit-form fields per item kind.
// Pure functions, no DOM, no file access. Used by scripts/import_parts.mjs (bundled with rolldown), the Parts tab
// (ui/partsui.ts) and the tests (tests/parts.test.ts).
//
// A bundle record = the research record of data/parts_raw/<category>/<brand>.json (every field kept as it is, so the cable
// and diagram engines can read it through CableLookups.part) + `brand`, `category`, `sourceUrl`, `readDate`, and `n` (the
// normalised values the browser filters and sorts on). Nothing is guessed: a value the record does not give stays undefined.
import { normAwg, productArea, productMaterial } from "./cable";

export type PartCategory = "amplifiers" | "dsp" | "capacitors" | "batteries" | "fuses" | "distribution" | "cable" | "interconnects" | "terminals" | "wiring_kits";
export const PART_CATEGORIES: { id: PartCategory; label: string; noun: string }[] = [
  { id: "amplifiers", label: "Amplifiers", noun: "amplifiers" },
  { id: "dsp", label: "DSP", noun: "processors" },
  { id: "capacitors", label: "Capacitors", noun: "capacitors" },
  { id: "batteries", label: "Batteries", noun: "batteries" },
  { id: "fuses", label: "Fuses and holders", noun: "fuses and holders" },
  { id: "distribution", label: "Distribution", noun: "blocks" },
  { id: "cable", label: "Cable", noun: "cables" },
  { id: "interconnects", label: "Interconnects", noun: "interconnects" },
  { id: "terminals", label: "Terminals", noun: "terminals" },
  { id: "wiring_kits", label: "Wiring kits", noun: "kits" },
];
export const isPartCategory = (c: unknown): c is PartCategory => typeof c === "string" && PART_CATEGORIES.some((x) => x.id === c);

export interface PartPrice { supplier: string; priceAud: number; url?: string; date?: string; note?: string | null }
export interface PartN {
  priceAud?: number;                        // lowest AUD price listed (inc. GST as listed)
  prices: PartPrice[];
  kind?: string;
  // amplifiers (and amp+DSP units)
  cls?: string; channels?: number; minLoadOhm?: number;
  rms?: { [ohm: string]: number };         // total W of all channels, unbridged, at that load ("4", "2", "1", "0.5")
  rmsPerCh?: { [ohm: string]: number };    // W per channel, unbridged
  bridgedW?: number;                       // largest total bridged rating (W)
  bridged?: { w: number; ch: number; ohm: number }[];
  maxW?: number;                           // largest total rating of any line (W)
  iMaxA?: number; fuseA?: number; powerWireAwg?: string; cta2006?: boolean;
  // dsp
  inputs?: number; outputs?: number; eqBands?: number; bluetooth?: boolean; hasAmp?: boolean;
  // capacitors / batteries
  farads?: number; voltageV?: number; chemistry?: string; ah?: number; cca?: number;
  // fuses / distribution
  fuseType?: string; ratingA?: number; ratingsA?: number[]; holder?: boolean; fused?: boolean; ways?: string;
  // cable / kits / interconnects / terminals
  awg?: string; areaMm2?: number; areaBasis?: string; labelOnly?: boolean; material?: "copper" | "cca"; lengthM?: number; pricePerMAud?: number;
  awgs?: string[]; cableMm2?: number; studMm?: number; packQty?: number;
  warnings?: string[];                     // B3 sanity checks on the research values (shown as CHECK)
}
export interface Part { id: string; model?: string | null; title?: string; brand: string; category: PartCategory; sourceUrl?: string; readDate?: string; check?: string; notes?: string; quality_issues?: string[]; n: PartN; [k: string]: any }

const num = (x: any): x is number => typeof x === "number" && isFinite(x) && x > 0;
const first = <T>(...xs: (T | undefined | null)[]): T | undefined => xs.find((x) => x !== undefined && x !== null) ?? undefined;

/** Amplifier class as a short code: "D", "AB", "BD", "AD", "A", "H", "G", "BR"; mixed classes joined with "+" ("AB+BD"). */
export function normClass(c: unknown): string | undefined {
  if (typeof c !== "string" || !c.trim()) return undefined;
  const parts = c.split(/\s*\+\s*/).map((s) => s.replace(/\(.*?\)/g, "").replace(/class/ig, "").replace(/sub/ig, "").replace(/[\s-]+/g, "").replace("/", "").toUpperCase()).filter(Boolean);
  const out = [...new Set(parts.map((p) => (p === "AB" || p === "A/B" ? "AB" : p)))];
  return out.length ? out.join("+") : undefined;
}
/** Fuse family from the research type text (research_i A3): ANL, MANL (mini ANL / AFS), MIDI, MEGA, AGU, MAXI, blade,
 * mini blade, micro blade, ANG, MRBF, battery terminal fuse, breaker, MCB, glass. */
export function fuseFamily(t: unknown): string | undefined {
  if (typeof t !== "string" || !t.trim()) return undefined;
  const s = t.toLowerCase();
  if (/mini anl|afs|manl/.test(s)) return "MANL/AFS";
  if (/\banl\b/.test(s)) return "ANL";
  if (/midi|\bans\b|\bami\b/.test(s)) return "MIDI";
  if (/mega|\banm\b/.test(s)) return "MEGA";
  if (/\bagu\b/.test(s)) return "AGU";
  if (/maxi/.test(s)) return "MAXI";
  if (/micro/.test(s)) return "micro blade";
  if (/mini blade/.test(s)) return "mini blade";
  if (/blade|ato|atc/.test(s)) return "blade";
  if (/\bang\b/.test(s)) return "ANG";
  if (/mrbf|battery terminal/.test(s)) return "battery terminal";
  if (/mcb|din/.test(s)) return "MCB";
  if (/breaker/.test(s)) return "breaker";
  if (/3ag|glass/.test(s)) return "glass";
  return t;
}
export const FUSE_FAMILIES = ["ANL", "MANL/AFS", "MIDI", "MEGA", "AGU", "MAXI", "blade", "mini blade", "micro blade", "ANG", "battery terminal", "breaker", "MCB", "glass"];
const ohmKey = (o: number) => String(+o.toFixed(2));

function ampN(r: any, ratings: any[], n: PartN) {
  n.cls = normClass(r.class); n.channels = num(r.channels) ? r.channels : num(r.channels_title) ? r.channels_title : undefined;
  n.minLoadOhm = num(r.min_load_ohm) ? r.min_load_ohm : undefined;
  const rms: Record<string, number> = {}, per: Record<string, number> = {}, br: { w: number; ch: number; ohm: number }[] = [];
  let maxW = 0;
  for (const x of Array.isArray(ratings) ? ratings : []) {
    if (!num(x?.w_per_ch)) continue;
    const ch = num(x.channels) ? x.channels : 1, tot = x.w_per_ch * ch; maxW = Math.max(maxW, tot);
    if (x.bridged === true || x.bridged === "strapped") { if (num(x.ohm)) br.push({ w: x.w_per_ch, ch, ohm: x.ohm }); continue; }
    if (!num(x.ohm) || x.group) continue; // grouped lines (e.g. "sub channel" of a 5-channel amp) are not the whole amp
    const k = ohmKey(x.ohm);
    if (!(rms[k] >= tot)) { rms[k] = tot; per[k] = x.w_per_ch; }
  }
  // 5/6-channel amps publish per group only: total at a load = sum of the groups' lines at that load
  if (!Object.keys(rms).length) for (const x of ratings ?? []) {
    if (!num(x?.w_per_ch) || !num(x.ohm) || x.bridged === true || x.bridged === "strapped") continue;
    const k = ohmKey(x.ohm); rms[k] = (rms[k] ?? 0) + x.w_per_ch * (num(x.channels) ? x.channels : 1);
  }
  if (Object.keys(rms).length) { n.rms = rms; if (Object.keys(per).length) n.rmsPerCh = per; }
  if (br.length) { n.bridged = br; n.bridgedW = Math.max(...br.map((b) => b.w * b.ch)); }
  if (maxW) n.maxW = maxW; else if (num(r.total_power_w)) n.maxW = r.total_power_w;
  n.iMaxA = first(...[r.current_draw_max_sine_13v8_a, r.current_draw_max_sine_a, r.current_draw_max_a].filter(num));
  n.fuseA = first(...[r.recommended_fuse_a, r.fuse_onboard_a, r.fuse_a].filter(num));
  if (r.power_wire_awg_maker) n.powerWireAwg = normAwg(r.power_wire_awg_maker) ?? String(r.power_wire_awg_maker);
  if (r.cta2006 === true) n.cta2006 = true;
}

/** One research record -> bundle record (raw fields kept + brand, category, sourceUrl, readDate, n). */
export function normalisePart(raw: any, category: PartCategory, brandFile: { brand?: string; read_date?: string } = {}): Part {
  const prices: PartPrice[] = (Array.isArray(raw.prices_aud) ? raw.prices_aud : []).filter((p: any) => num(p?.price_aud))
    .map((p: any) => ({ supplier: String(p.supplier ?? ""), priceAud: p.price_aud, url: p.url ?? undefined, date: p.read_date ?? undefined, note: p.note ?? null }));
  const n: PartN = { prices };
  if (prices.length) n.priceAud = Math.min(...prices.map((p) => p.priceAud));
  if (typeof raw.kind === "string") n.kind = raw.kind;
  // B3 sanity check: a fuse rating that is only the SKU's digits (e.g. Aerpro AP462A "462 A", a holder whose title states no
  // rating) is a parse error of the research; the bundle keeps it as rating_a_as_parsed and leaves rating_a empty
  const fixes: Record<string, any> = {}; const warn: string[] = [];
  if (category === "fuses") for (const k of ["rating_a", "fuse_included_a"]) {
    const v = raw[k];
    if (num(v) && String(raw.model ?? "").replace(/\D+/g, " ").trim().split(" ").includes(String(v)) && !new RegExp(`\\b${v}\\s*(a|amps?)\\b`, "i").test(String(raw.title ?? ""))) {
      fixes[k] = null; fixes[k + "_as_parsed"] = v; warn.push(`${k.replace(/_/g, " ")} ${v} was read from the model code, not from a stated rating: left empty (enter the rating on the item)`);
    }
  }
  const r = { ...raw, ...fixes };
  if (warn.length) n.warnings = warn;
  switch (category) {
    case "amplifiers": ampN(r, r.rms_ratings, n); break;
    case "dsp": {
      n.inputs = first(...[r.inputs, r.preamp_inputs, r.speaker_level_inputs_ch].filter(num)); n.outputs = first(...[r.outputs, r.preamp_outputs, r.channels_title].filter(num));
      if (num(r.eq_bands)) n.eqBands = r.eq_bands; if (typeof r.bluetooth === "boolean") n.bluetooth = r.bluetooth;
      if (Array.isArray(r.amp_rms_ratings) && r.amp_rms_ratings.length) { n.hasAmp = true; ampN({ ...r, channels: r.channels_title }, r.amp_rms_ratings, n); }
      else if (num(r.fuse_a)) n.fuseA = r.fuse_a;
      break;
    }
    case "capacitors": if (num(r.farads)) n.farads = r.farads; n.voltageV = first(...[r.voltage_v, r.voltage_max_v].filter(num)); break;
    case "batteries": if (r.chemistry) n.chemistry = r.chemistry; if (num(r.capacity_ah)) n.ah = r.capacity_ah; if (num(r.cca_a)) n.cca = r.cca_a; if (num(r.voltage_v)) n.voltageV = r.voltage_v; break;
    case "fuses": {
      n.fuseType = fuseFamily(r.fuse_type);
      n.ratingA = first(...[r.rating_a, r.fuse_included_a].filter(num));
      if (Array.isArray(r.ratings_a) && r.ratings_a.length) n.ratingsA = r.ratings_a.filter(num);
      n.holder = /holder|block/.test(String(r.kind ?? ""));
      if (num(r.pack_qty)) n.packQty = r.pack_qty; if (num(r.stud_mm)) n.studMm = r.stud_mm;
      break;
    }
    case "distribution": {
      n.fused = /fuse/i.test(String(r.kind ?? "")) || !!r.fuse_type;
      n.fuseType = fuseFamily(r.fuse_type);
      const ps: any[] = Array.isArray(r.ports) ? r.ports : [];
      const io = (dir: string) => ps.filter((p) => p.dir === dir).map((p) => `${p.count} x ${p.awg} AWG`).join(" + ");
      if (ps.length) n.ways = [io("in") && `in ${io("in")}`, io("out") && `out ${io("out")}`, ps.filter((p) => !p.dir).map((p) => `${p.count} x ${p.awg} AWG`).join(" + ")].filter(Boolean).join(", ");
      else if (num(r.ways)) n.ways = `${r.ways} ways`;
      if (num(r.rating_a)) n.ratingA = r.rating_a;
      break;
    }
    case "cable": case "wiring_kits": {
      const g = normAwg(Array.isArray(r.awg) ? r.awg[0] : r.awg); if (g) n.awg = g;
      const pa = productArea(r); if (pa.areaMm2) { n.areaMm2 = +pa.areaMm2.toFixed(3); n.areaBasis = pa.basis; n.labelOnly = pa.labelOnly; }
      n.material = productMaterial(r);
      if (num(r.length_m)) n.lengthM = r.length_m; if (num(r.price_per_m_aud)) n.pricePerMAud = r.price_per_m_aud;
      break;
    }
    case "interconnects": if (num(r.length_m)) n.lengthM = r.length_m; if (num(r.pack_qty)) n.packQty = r.pack_qty; if (num(r.channels)) n.channels = r.channels; break;
    case "terminals": {
      const a: string[] = (Array.isArray(r.awg) ? r.awg : r.awg ? [r.awg] : []).map((x: any) => normAwg(x) ?? String(x));
      if (a.length) n.awgs = a; if (num(r.cable_mm2)) n.cableMm2 = r.cable_mm2; if (num(r.stud_mm)) n.studMm = r.stud_mm; if (num(r.pack_qty)) n.packQty = r.pack_qty;
      break;
    }
  }
  for (const k of Object.keys(n) as (keyof PartN)[]) if (n[k] === undefined) delete n[k];
  const src = Array.isArray(raw.sources) ? raw.sources : [];
  return { ...r, brand: String(brandFile.brand ?? ""), category, sourceUrl: src[0]?.url ?? prices[0]?.url, readDate: src[0]?.read_date ?? brandFile.read_date, n };
}

/** Display name of a part: brand + model (title when there is no model). */
export const partName = (p: Part): string => `${p.brand} ${p.model || p.title || p.id}`.trim();

// ------------------------------------------------------------------------------------------------- part -> project item
/** Item kind a part becomes (docs/project_model_v2.md kinds + battery, read by the cable and diagram engines). */
export function itemKindFor(p: { category: PartCategory; kind?: unknown }): string {
  switch (p.category) {
    case "amplifiers": return "amplifier";
    case "dsp": return "dsp";
    case "capacitors": return "capacitor";
    case "batteries": return "battery";
    case "fuses": { const k = String(p.kind ?? ""); if (/block/.test(k)) return "distribution"; if (/holder/.test(k)) return "fuseholder"; if (/kit|link|other/.test(k)) return "other"; return "fuse"; }
    case "distribution": return "distribution";
    case "cable": case "wiring_kits": return "cable";
    case "interconnects": case "terminals": return "connector";
  }
  return "other";
}
export const PART_SECTION = "electrical";
/**
 * The data of a new project item made from a part: data.partId (+ partCategory, so the app loads that bundle again), and the
 * overrides a person edits most, pre-filled from the record (only values the record gives; the engines read the rest from
 * the record through CableLookups.part). opts.lengthM: cable length (m) asked when adding.
 */
export function partToItemData(p: Part, opts: { lengthM?: number } = {}): Record<string, any> {
  const kind = itemKindFor(p), n = p.n ?? { prices: [] }, d: Record<string, any> = { partId: p.id, partCategory: p.category };
  if (kind === "amplifier" || (kind === "dsp" && n.hasAmp)) {
    if (n.cls) d.class = n.cls; if (n.channels) d.channels = n.channels; if (n.minLoadOhm) d.minLoadOhm = n.minLoadOhm;
  }
  if (kind === "capacitor") { if (n.farads) d.farads = n.farads; if (n.voltageV) d.voltageV = n.voltageV; }
  if (kind === "fuse" || kind === "fuseholder") { if (n.ratingA) d.ratingA = n.ratingA; }
  if (kind === "distribution") { d.fused = !!n.fused; if (n.ratingA && n.fused) d.fuseA = n.ratingA; }
  if (kind === "cable") {
    if (num(opts.lengthM)) d.lengthM = opts.lengthM;
    if (n.awg) d.size = n.awg; if (n.areaMm2 && !n.labelOnly) d.areaMm2 = n.areaMm2; if (n.material) d.material = n.material;
  }
  if (kind === "connector") d.role = p.category === "interconnects" ? "interconnect" : "terminal";
  if (kind === "other") d.role = "kit";
  return d;
}
/** A project item (docs/project_model_v2.md) for a part; id given by the caller (pv2.newItem makes one). */
export function partToItem(p: Part, opts: { lengthM?: number } = {}): { section: string; kind: string; name: string; data: Record<string, any> } {
  return { section: PART_SECTION, kind: itemKindFor(p), name: partName(p), data: partToItemData(p, opts) };
}

// ------------------------------------------------------------------------------------------------- edit form per kind
export interface ItemField { key: string; label: string; type: "number" | "text" | "select" | "check"; unit?: string; options?: [string, string][]; hint?: string; from?: (p: Part) => unknown }
const awgOpts: [string, string][] = [["", "–"], ...["18", "16", "14", "12", "10", "8", "6", "4", "2", "1", "1/0", "2/0", "3/0", "4/0"].map((g) => [g, g + " AWG"] as [string, string])];
/** Fields of the Project tab edit form for an electrical item kind: exactly the item data the cable engine
 * (docs/cable_engine.md) and the diagram / missing-part check (docs/diagram_engine.md) read. `from` = the record's value
 * shown as the placeholder when the field is empty. */
export const ITEM_FIELDS: Record<string, ItemField[]> = {
  amplifier: [
    { key: "class", label: "Class", type: "text", hint: "D, AB, BD...", from: (p) => p.n?.cls },
    { key: "channels", label: "Channels", type: "number", from: (p) => p.n?.channels },
    { key: "minLoadOhm", label: "Minimum load", type: "number", unit: "Ω", from: (p) => p.n?.minLoadOhm },
    { key: "loadOhm", label: "Load it sees", type: "number", unit: "Ω", hint: "empty = from the speaker links" },
    { key: "rmsW", label: "RMS power, all channels, at that load", type: "number", unit: "W", from: (p) => p.n?.maxW },
    { key: "iMaxA", label: "Maximum current (maker)", type: "number", unit: "A", from: (p) => p.n?.iMaxA },
    { key: "iMusicA", label: "Average music current (maker)", type: "number", unit: "A", from: (p) => p.current_draw_avg_music_13v8_a ?? p.current_draw_music_max_a },
    { key: "fuseA", label: "Fuse (maker)", type: "number", unit: "A", from: (p) => p.n?.fuseA },
    { key: "powerWireAwg", label: "Power wire (maker)", type: "select", options: awgOpts, from: (p) => p.n?.powerWireAwg },
    { key: "suggestedAlternatorA", label: "Suggested alternator (maker)", type: "number", unit: "A", from: (p) => p.suggested_alternator_a },
    { key: "autoOn", label: "Auto turn-on (no remote wire needed)", type: "check" },
    { key: "source", label: "Signal source (if not linked)", type: "text", hint: "e.g. bluetooth" },
  ],
  dsp: [
    { key: "currentA", label: "Current draw", type: "number", unit: "A", from: (p) => p.current_draw_a },
    { key: "fuseA", label: "Fuse", type: "number", unit: "A", from: (p) => p.fuse_a },
    { key: "source", label: "Signal source (if not linked)", type: "text" },
    { key: "poweredBy", label: "Powered by (if not linked)", type: "text" },
    { key: "channels", label: "Amplifier channels (amp + DSP units)", type: "number", from: (p) => p.n?.channels },
    { key: "minLoadOhm", label: "Minimum load (amp + DSP units)", type: "number", unit: "Ω", from: (p) => p.n?.minLoadOhm },
  ],
  capacitor: [
    { key: "farads", label: "Capacitance", type: "number", unit: "F", from: (p) => p.n?.farads },
    { key: "voltageV", label: "Rated voltage", type: "number", unit: "V", from: (p) => p.n?.voltageV },
    { key: "prechargeOhm", label: "Precharge resistor", type: "number", unit: "Ω", hint: "e.g. 1000" },
  ],
  battery: [
    { key: "alternatorA", label: "Alternator rating", type: "number", unit: "A" },
    { key: "vehicleLoadA", label: "Car's own load", type: "number", unit: "A" },
  ],
  fuse: [
    { key: "ratingA", label: "Fuse rating", type: "number", unit: "A", from: (p) => p.n?.ratingA },
    { key: "distanceMm", label: "Distance from the battery (along the cable)", type: "number", unit: "mm" },
    { key: "sheathed", label: "Cable to it in a sheath", type: "check" },
  ],
  fuseholder: [
    { key: "ratingA", label: "Fuse rating", type: "number", unit: "A", from: (p) => p.n?.ratingA },
    { key: "distanceMm", label: "Distance from the battery (along the cable)", type: "number", unit: "mm" },
    { key: "sheathed", label: "Cable to it in a sheath", type: "check" },
    { key: "fused", label: "One fuse per output (several outputs)", type: "check" },
  ],
  distribution: [
    { key: "fused", label: "Fused (one fuse per output)", type: "check", from: (p) => p.n?.fused },
    { key: "fuseA", label: "Branch fuse rating", type: "number", unit: "A" },
  ],
  cable: [
    { key: "lengthM", label: "Length", type: "number", unit: "m" },
    { key: "groundLengthM", label: "Ground return length (power cable)", type: "number", unit: "m" },
    { key: "size", label: "Size", type: "select", options: awgOpts, from: (p) => p.n?.awg },
    { key: "areaMm2", label: "Real copper area", type: "number", unit: "mm²", from: (p) => p.n?.areaMm2 },
    { key: "material", label: "Material", type: "select", options: [["", "–"], ["copper", "copper (OFC)"], ["cca", "CCA"]], from: (p) => p.n?.material },
    { key: "location", label: "Where it runs", type: "select", options: [["", "–"], ["outside", "outside the engine space"], ["engine", "in the engine space"]] },
    { key: "bundled", label: "Conductors in the bundle", type: "number" },
  ],
  alternator: [ // B4_SYSTEM_UI: copied to the battery's alternatorA (the cable engine reads it there) when the battery has none
    { key: "ratingA", label: "Alternator rating", type: "number", unit: "A" },
  ],
  connector: [{ key: "note", label: "Note", type: "text" }],
  other: [{ key: "role", label: "Role (battery, ground, headunit...)", type: "text" }, { key: "note", label: "Note", type: "text" }],
};
/** Read a form value into item data: numbers > 0 (empty = removed, the record's value is used), checks true/false, text. */
export function setItemField(data: Record<string, any>, f: ItemField, value: string | boolean): void {
  if (f.type === "check") { data[f.key] = !!value; return; } // explicit false: the record's value is not used then
  const s = String(value ?? "").trim();
  if (!s) { delete data[f.key]; return; }
  if (f.type === "number") { const v = parseFloat(s); if (isFinite(v) && v > 0) data[f.key] = v; else delete data[f.key]; return; }
  data[f.key] = s;
}
