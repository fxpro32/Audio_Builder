// Shared UI helpers: DOM shortcuts, bound input fields, metric/imperial display.
export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const f1 = (v: number | undefined, d = 1) => (v === undefined || !isFinite(v) ? "–" : v.toFixed(d));
export const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// ---------- units (Term-PRO parity: English + metric). Stored values stay metric (mm, L, cm²); only the display changes. ----------
export const units = { imperial: store.get("units") === "imperial" };
export function setImperial(on: boolean) { units.imperial = on; store.set("units", on ? "imperial" : "metric"); }
const CONV: Record<string, [string, number, number]> = { mm: ["in", 25.4, 2], L: ["ft³", 28.316846592, 3], "cm²": ["in²", 6.4516, 2], "kg/m³": ["lb/ft³", 16.0185, 3] }; // [imperial unit, metric per imperial, decimals]
/** Display unit and factor: shown = stored / factor. */
export function dispUnit(unit: string): { unit: string; factor: number; dec?: number } {
  if (units.imperial && CONV[unit]) return { unit: CONV[unit][0], factor: CONV[unit][1], dec: CONV[unit][2] };
  return { unit, factor: 1 };
}
/** Format a stored metric value with its unit in the current system. */
export function fmtU(v: number | undefined, unit: string, dMetric = 0): string {
  if (v === undefined || !isFinite(v)) return "–";
  const u = dispUnit(unit); return `${(v / u.factor).toFixed(u.factor === 1 ? dMetric : u.dec ?? 2)} ${u.unit}`;
}
export const fmtMm = (mm: number, d = 0) => fmtU(mm, "mm", d);
export const fmtL = (L: number, d = 1) => fmtU(L, "L", d);

/** Bind a numeric/text/checkbox input to obj[key]. */
export function field(label: string, obj: any, key: string, unit = "", opts: { step?: number; min?: number; type?: string; title?: string } = {}) {
  const id = "f" + Math.random().toString(36).slice(2);
  const type = opts.type ?? (typeof obj[key] === "boolean" ? "checkbox" : typeof obj[key] === "number" ? "number" : "text");
  const u = type === "number" ? dispUnit(unit) : { unit, factor: 1 };
  const shown = type === "number" && u.factor !== 1 ? +(obj[key] / u.factor).toFixed(4) : obj[key];
  const val = type === "checkbox" ? (obj[key] ? "checked" : "") : `value="${esc(shown)}"`;
  return `<div class="row" ${opts.title ? `title="${esc(opts.title)}"` : ""}><label for="${id}">${label}</label><input id="${id}" data-key="${key}" data-conv="${u.factor}" type="${type}" ${val} ${opts.step && u.factor === 1 ? `step="${opts.step}"` : 'step="any"'} ${opts.min !== undefined ? `min="${opts.min}"` : ""}/><span class="u">${u.unit}</span></div>`;
}
/** Read a bound input back into stored units. */
export function readInput(inp: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): unknown {
  if (inp instanceof HTMLInputElement && inp.type === "checkbox") return inp.checked;
  if (inp instanceof HTMLInputElement && inp.type === "number") return (parseFloat(inp.value) || 0) * Number(inp.dataset.conv || 1);
  return inp.value;
}
export function bindFields(root: HTMLElement, obj: any, onChange: () => void) {
  root.querySelectorAll<HTMLInputElement>("input[data-key],select[data-key],textarea[data-key]").forEach((inp) => {
    inp.addEventListener("change", () => { obj[inp.dataset.key!] = readInput(inp); onChange(); });
  });
}
export function fixBind(sel: string, obj: any, key: string, onChange: () => void) {
  const el = document.querySelector<HTMLInputElement>(sel); if (!el) return;
  const clone = el.cloneNode(true) as HTMLInputElement; el.replaceWith(clone);
  if (clone.type === "checkbox") clone.checked = !!obj[key]; // cloneNode copies the attribute, not a changed live state
  clone.addEventListener("change", () => { obj[key] = readInput(clone); onChange(); });
}
export function select(key: string, value: string, options: [string, string][], label: string) {
  return `<div class="row"><label>${label}</label><select data-key="${key}">${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="u"></span></div>`;
}
export function download(name: string, data: BlobPart, type: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
