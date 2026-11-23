// Parts tab list logic (B3_PARTS_DB, R40, 2026-11-23): columns, filters, sorting per category. Pure (no DOM) so app/tests
// can check them; the DOM is in ui/partsui.ts.
import { FUSE_FAMILIES, Part, PartCategory } from "../engine/parts";

export interface PartColumn { key: string; label: string; num?: boolean; get: (p: Part) => string | number | undefined; title?: string }
const r = (x?: number, d = 0) => (x === undefined ? undefined : +x.toFixed(d));
const brand: PartColumn = { key: "brand", label: "Brand", get: (p) => p.brand };
const model: PartColumn = { key: "model", label: "Model", get: (p) => p.model || p.title || p.id };
const kind: PartColumn = { key: "kind", label: "Kind", get: (p) => p.n?.kind ?? p.kind };
const aud: PartColumn = { key: "aud", label: "AUD from", num: true, get: (p) => p.n?.priceAud, title: "Lowest Australian price listed (inc. GST as listed), with the supplier and date in the detail" };
const rmsAt = (o: string): PartColumn => ({ key: "rms" + o, label: `RMS ${o} Ω`, num: true, get: (p) => p.n?.rms?.[o], title: `Total RMS of all channels at ${o} ohm, not bridged (W)` });
export const PART_COLUMNS: Record<PartCategory, PartColumn[]> = {
  amplifiers: [brand, model, { key: "cls", label: "Class", get: (p) => p.n?.cls }, { key: "ch", label: "Ch", num: true, get: (p) => p.n?.channels }, rmsAt("4"), rmsAt("2"), rmsAt("1"),
    { key: "br", label: "Bridged W", num: true, get: (p) => p.n?.bridgedW }, { key: "min", label: "Min Ω", num: true, get: (p) => p.n?.minLoadOhm }, { key: "imax", label: "Max A", num: true, get: (p) => p.n?.iMaxA, title: "Maker maximum current draw" }, { key: "fuse", label: "Fuse A", num: true, get: (p) => p.n?.fuseA }, aud],
  dsp: [brand, model, kind, { key: "in", label: "In", num: true, get: (p) => p.n?.inputs }, { key: "out", label: "Out", num: true, get: (p) => p.n?.outputs }, { key: "eq", label: "EQ bands", num: true, get: (p) => p.n?.eqBands }, { key: "amp", label: "Amp W", num: true, get: (p) => p.n?.maxW, title: "amp + DSP units: largest total rating" }, aud],
  capacitors: [brand, model, kind, { key: "f", label: "Farads", num: true, get: (p) => p.n?.farads }, { key: "v", label: "Volts", num: true, get: (p) => p.n?.voltageV }, aud],
  batteries: [brand, model, { key: "chem", label: "Chemistry", get: (p) => p.n?.chemistry }, { key: "ah", label: "Ah", num: true, get: (p) => p.n?.ah }, { key: "cca", label: "CCA", num: true, get: (p) => p.n?.cca }, { key: "v", label: "Volts", num: true, get: (p) => p.n?.voltageV }, aud],
  fuses: [brand, model, kind, { key: "type", label: "Type", get: (p) => p.n?.fuseType }, { key: "a", label: "Rating A", num: true, get: (p) => p.n?.ratingA }, aud],
  distribution: [brand, model, kind, { key: "fused", label: "Fused", get: (p) => (p.n?.fused ? "yes" : "no") }, { key: "ways", label: "Ports", get: (p) => p.n?.ways }, aud],
  cable: [brand, model, kind, { key: "awg", label: "Label", get: (p) => (p.size_label ?? (p.n?.awg ? p.n.awg + " AWG" : undefined)), title: "Size as sold" }, { key: "area", label: "Real mm²", num: true, get: (p) => r(p.n?.areaMm2, 2), title: "Real copper area (strand count, published area or converted AU label); a gauge label alone is marked ~" },
    { key: "mat", label: "Material", get: (p) => (p.n?.material === "cca" ? "CCA" : p.n?.material === "copper" ? "copper" : "not stated") }, { key: "len", label: "Length m", num: true, get: (p) => r(p.n?.lengthM, 1) }, { key: "perm", label: "AUD/m", num: true, get: (p) => p.n?.pricePerMAud }, aud],
  interconnects: [brand, model, kind, { key: "len", label: "Length m", num: true, get: (p) => r(p.n?.lengthM, 2) }, { key: "pack", label: "Pack", num: true, get: (p) => p.n?.packQty }, aud],
  terminals: [brand, model, kind, { key: "awg", label: "AWG", get: (p) => p.n?.awgs?.join(", ") }, { key: "mm2", label: "mm²", num: true, get: (p) => p.n?.cableMm2 }, { key: "stud", label: "Stud mm", num: true, get: (p) => p.n?.studMm }, aud],
  wiring_kits: [brand, model, kind, { key: "awg", label: "AWG", get: (p) => p.n?.awg }, { key: "mat", label: "Material", get: (p) => (p.n?.material === "cca" ? "CCA" : p.n?.material === "copper" ? "copper" : "not stated") }, { key: "area", label: "Real mm²", num: true, get: (p) => r(p.n?.areaMm2, 2) }, aud],
};

export interface PartFilter { key: string; label: string; type: "select" | "min" | "max"; options?: (parts: Part[]) => [string, string][]; title?: string }
const uniq = (xs: (string | number | undefined)[]) => [...new Set(xs.filter((x) => x !== undefined && x !== null && x !== "").map(String))].sort((a, b) => (isFinite(+a) && isFinite(+b) ? +a - +b : a.localeCompare(b)));
const kindF: PartFilter = { key: "kind", label: "Kind", type: "select", options: (ps) => uniq(ps.map((p) => p.n?.kind)).map((k) => [k, k]) };
/** Filters per category (besides search, brand, maximum price and "AUD price only", which every category has). */
export const PART_FILTERS: Record<PartCategory, PartFilter[]> = {
  amplifiers: [
    { key: "ch", label: "Channels", type: "select", options: (ps) => uniq(ps.map((p) => p.n?.channels)).map((c) => [c, c]) },
    { key: "cls", label: "Class", type: "select", options: (ps) => uniq(ps.map((p) => p.n?.cls)).map((c) => [c, c]) },
    { key: "load", label: "RMS at", type: "select", options: () => [["4", "4 Ω"], ["2", "2 Ω"], ["1", "1 Ω"], ["0.5", "0.5 Ω"], ["bridged", "bridged"]], title: "The load the RMS ≥ filter looks at" },
    { key: "rmsMin", label: "RMS ≥ (W)", type: "min", title: "Total RMS of all channels at the load chosen (any load when none is chosen)" },
    { key: "minLoad", label: "Stable to (Ω) or lower", type: "select", options: () => [["2", "2 Ω"], ["1", "1 Ω"], ["0.5", "0.5 Ω"]], title: "Maker minimum load at or below this" },
  ],
  dsp: [kindF],
  capacitors: [{ key: "fMin", label: "Farads ≥", type: "min" }],
  batteries: [{ key: "chem", label: "Chemistry", type: "select", options: (ps) => uniq(ps.map((p) => p.n?.chemistry)).map((c) => [c, c]) }, { key: "ahMin", label: "Ah ≥", type: "min" }],
  fuses: [
    { key: "type", label: "Type", type: "select", options: (ps) => FUSE_FAMILIES.filter((f) => ps.some((p) => p.n?.fuseType === f)).map((f) => [f, f]) },
    kindF, { key: "aMin", label: "Rating ≥ (A)", type: "min" }, { key: "aMax", label: "Rating ≤ (A)", type: "max" },
  ],
  distribution: [kindF, { key: "fused", label: "Fused", type: "select", options: () => [["yes", "fused"], ["no", "not fused"]] }],
  cable: [kindF, { key: "mat", label: "Material", type: "select", options: () => [["copper", "copper (OFC)"], ["cca", "CCA"], ["unknown", "not stated"]] },
    { key: "areaMin", label: "Real mm² ≥", type: "min", title: "Real copper area, not the gauge label" }, { key: "areaMax", label: "Real mm² ≤", type: "max" }],
  interconnects: [kindF],
  terminals: [kindF],
  wiring_kits: [kindF, { key: "mat", label: "Material", type: "select", options: () => [["copper", "copper (OFC)"], ["cca", "CCA"], ["unknown", "not stated"]] }],
};
export type FilterValues = Record<string, string>;

const amp = (p: Part, load: string): number | undefined => (load === "bridged" ? p.n?.bridgedW : load ? p.n?.rms?.[load] : p.n?.maxW);
/** Does a part match the filters (common: q, brand, priceMax, audOnly; then the category's)? */
export function partMatches(p: Part, cat: PartCategory, f: FilterValues): boolean {
  const n = p.n ?? { prices: [] }, v = (k: string) => (f[k] ?? "").trim(), x = (k: string) => parseFloat(v(k));
  if (v("q")) { const hay = `${p.brand} ${p.model ?? ""} ${p.title ?? ""} ${p.id}`.toLowerCase(); if (!v("q").toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false; }
  if (v("brand") && p.brand !== v("brand")) return false;
  if (v("audOnly") === "1" && !n.priceAud) return false;
  if (x("priceMax") > 0 && !(n.priceAud !== undefined && n.priceAud <= x("priceMax"))) return false;
  if (v("kind") && n.kind !== v("kind")) return false;
  switch (cat) {
    case "amplifiers":
      if (v("ch") && String(n.channels) !== v("ch")) return false;
      if (v("cls") && n.cls !== v("cls")) return false;
      if (x("rmsMin") > 0 && !((amp(p, v("load")) ?? 0) >= x("rmsMin"))) return false;
      if (!(x("rmsMin") > 0) && v("load") && amp(p, v("load")) === undefined) return false;
      if (x("minLoad") > 0 && !(n.minLoadOhm !== undefined && n.minLoadOhm <= x("minLoad") + 1e-9)) return false;
      break;
    case "capacitors": if (x("fMin") > 0 && !((n.farads ?? 0) >= x("fMin"))) return false; break;
    case "batteries": if (v("chem") && n.chemistry !== v("chem")) return false; if (x("ahMin") > 0 && !((n.ah ?? 0) >= x("ahMin"))) return false; break;
    case "fuses":
      if (v("type") && n.fuseType !== v("type")) return false;
      if (x("aMin") > 0 && !((n.ratingA ?? 0) >= x("aMin"))) return false;
      if (x("aMax") > 0 && !(n.ratingA !== undefined && n.ratingA <= x("aMax"))) return false;
      break;
    case "distribution": if (v("fused") && (v("fused") === "yes") !== !!n.fused) return false; break;
    case "cable": case "wiring_kits":
      if (v("mat") && (v("mat") === "unknown" ? n.material !== undefined : n.material !== v("mat"))) return false;
      if (x("areaMin") > 0 && !((n.areaMm2 ?? 0) >= x("areaMin"))) return false;
      if (x("areaMax") > 0 && !(n.areaMm2 !== undefined && n.areaMm2 <= x("areaMax"))) return false;
      break;
  }
  return true;
}
/** Sort by a column (numbers numerically, empty values last whatever the direction), then brand, model, id. */
export function sortParts(list: Part[], cat: PartCategory, key: string, dir: 1 | -1 = 1): Part[] {
  const col = PART_COLUMNS[cat].find((c) => c.key === key) ?? PART_COLUMNS[cat][0];
  const base = (a: Part, b: Part) => a.brand.localeCompare(b.brand) || String(a.model ?? "").localeCompare(String(b.model ?? "")) || a.id.localeCompare(b.id);
  return [...list].sort((a, b) => {
    const va = col.get(a), vb = col.get(b);
    const ea = va === undefined || va === "", eb = vb === undefined || vb === "";
    if (ea || eb) return ea === eb ? base(a, b) : ea ? 1 : -1;
    const c = col.num ? (Number(va) - Number(vb)) : String(va).localeCompare(String(vb));
    return c ? c * dir : base(a, b);
  });
}
