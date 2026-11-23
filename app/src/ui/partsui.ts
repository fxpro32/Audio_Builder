// Parts tab (B3_PARTS_DB, R40, 2026-11-23): browse the parts database per category (lazy-loaded bundles from
// /api/parts/<category>), search, filters, sortable columns, paging (Drivers tab style), a detail panel (every value,
// source links, AUD price list, the research `check` warning), "Add to project" and "Save to My items".
// Also: the parts store (partById for the cable / diagram engines' CableLookups.part) and the edit form of electrical items
// (Project tab, My items). Driver categories (subwoofers, tweeters, ...) open the Drivers tab with that type.
import { ITEM_FIELDS, isPartCategory, Part, PART_CATEGORIES, PartCategory, partName, partToItem, setItemField } from "../engine/parts";
import { DRIVER_TYPES } from "./driverlist";
import { countLine, pageInfo } from "./driverlist";
import { FilterValues, PART_COLUMNS, PART_FILTERS, partMatches, sortParts } from "./partslist";
import { $, esc, store } from "./dom";

// ---------------------------------------------------------------------------------------------------- parts store
const cache = new Map<PartCategory, Part[]>();
const loading = new Map<PartCategory, Promise<Part[]>>();
let index: { category: string; label: string; count: number; bytes: number }[] | undefined;
/** Load one category bundle (once). */
export function loadParts(cat: PartCategory): Promise<Part[]> {
  if (cache.has(cat)) return Promise.resolve(cache.get(cat)!);
  if (!loading.has(cat)) loading.set(cat, fetch("/api/parts/" + cat).then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); const b = await r.json(); cache.set(cat, b.records ?? []); return cache.get(cat)!; }).finally(() => loading.delete(cat)));
  return loading.get(cat)!;
}
export async function loadIndex() { if (!index) { try { const r = await fetch("/api/parts"); index = r.ok ? (await r.json()).categories : []; } catch { index = []; } } return index!; }
/** A loaded part by id: the hinted category first, then every loaded category (CableLookups.part). */
export function partById(id: string, cat?: string): Part | undefined {
  if (isPartCategory(cat)) { const p = cache.get(cat)?.find((x) => x.id === id); if (p) return p; }
  for (const list of cache.values()) { const p = list.find((x) => x.id === id); if (p) return p; }
  return undefined;
}
/** Load every bundle the items of a project refer to (data.partCategory), so partById finds them. */
export async function ensurePartsFor(items: { data?: any }[]): Promise<void> {
  const cats = [...new Set(items.map((i) => i.data?.partCategory).filter(isPartCategory))] as PartCategory[];
  await Promise.all(cats.map((c) => loadParts(c).catch(() => [])));
}

// ---------------------------------------------------------------------------------------------------- Parts tab
export interface PartsCtx {
  status: (msg: string, cls?: string) => void;
  /** Projects to add to; current = the open project (undefined in single-item mode). */
  projects: () => { name: string; title: string }[]; current: () => string | undefined;
  addToProject: (item: ReturnType<typeof partToItem>, projName: string) => Promise<string | undefined>;
  saveToMyItems: (item: ReturnType<typeof partToItem>) => Promise<boolean>;
  openDrivers: (type: string) => void;
  driverCount: (type: string) => number;
}
const st = { cat: (store.get("partsCat") || "amplifiers") as string, f: {} as Record<string, FilterValues>, sort: {} as Record<string, { key: string; dir: 1 | -1 }>, page: 1, sel: undefined as string | undefined };
const PAGE = 100;
const fmt = (v: unknown) => (v === undefined || v === null || v === "" ? "–" : typeof v === "number" ? String(+v.toFixed(2)) : String(v));
const link = (u?: string, t?: string) => (u && /^https?:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t ?? u)}</a>` : esc(t ?? u ?? ""));

export function renderParts(root: HTMLElement, ctx: PartsCtx) {
  if (!isPartCategory(st.cat)) st.cat = "amplifiers";
  const cat = st.cat as PartCategory;
  const counts = new Map((index ?? []).map((c) => [c.category, c.count]));
  root.innerHTML = `<div class="split parts"><div>
    <div class="toolbar" id="pcats"><b>Drivers:</b> ${DRIVER_TYPES.map((t) => `<button data-dtype="${t.id}" title="Opens the Drivers tab with this type">${esc(t.label)} <span class="muted">${ctx.driverCount(t.id).toLocaleString("en-AU")}</span></button>`).join("")}</div>
    <div class="toolbar" id="pcats2"><b>Parts:</b> ${PART_CATEGORIES.map((c) => `<button data-pcat="${c.id}" class="${c.id === cat ? "on" : ""}">${esc(c.label)}${counts.has(c.id) ? ` <span class="muted">${counts.get(c.id)!.toLocaleString("en-AU")}</span>` : ""}</button>`).join("")}</div>
    <div id="pBody"><p class="muted">Loading ${esc(cat)}…</p></div></div><div id="pDetail"></div></div>`;
  root.querySelectorAll<HTMLButtonElement>("#pcats button[data-dtype]").forEach((b) => b.onclick = () => ctx.openDrivers(b.dataset.dtype!));
  root.querySelectorAll<HTMLButtonElement>("#pcats2 button[data-pcat]").forEach((b) => b.onclick = () => { st.cat = b.dataset.pcat!; store.set("partsCat", st.cat); st.page = 1; st.sel = undefined; renderParts(root, ctx); });
  if (!index) void loadIndex().then(() => { if (index?.length && $("#pcats2")) renderParts(root, ctx); });
  loadParts(cat).then((parts) => { if (st.cat === cat && $("#pBody")) body(parts, cat, ctx); })
    .catch((e) => { const b = $("#pBody"); if (b) b.innerHTML = `<p class="bad">Could not load the ${esc(cat)} bundle: ${esc((e as Error).message)}. The parts database needs the updated app server (run scripts/restart_app.sh on the host) and data/parts (node scripts/import_parts.mjs).</p>`; });
}

function body(parts: Part[], cat: PartCategory, ctx: PartsCtx) {
  const f = (st.f[cat] ??= {}); const srt = (st.sort[cat] ??= { key: "brand", dir: 1 });
  const brands = [...new Set(parts.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
  const opt = (v: string, t: string, cur?: string) => `<option value="${esc(v)}" ${v === (cur ?? "") ? "selected" : ""}>${esc(t)}</option>`;
  const filt = PART_FILTERS[cat].map((x) => x.type === "select"
    ? `<label title="${esc(x.title ?? "")}">${esc(x.label)} <select data-f="${x.key}">${opt("", "any", f[x.key])}${x.options!(parts).map(([v, t]) => opt(v, t, f[x.key])).join("")}</select></label>`
    : `<label title="${esc(x.title ?? "")}">${esc(x.label)} <input data-f="${x.key}" type="number" min="0" step="any" style="width:6em" value="${esc(f[x.key] ?? "")}"></label>`).join("");
  $("#pBody").innerHTML = `<div class="toolbar"><input data-f="q" id="pq" placeholder="Search brand, model or title…" style="flex:1" value="${esc(f.q ?? "")}">
      <select data-f="brand" id="pBrand">${opt("", "All brands", f.brand)}${brands.map((b) => opt(b, b, f.brand)).join("")}</select></div>
    <div class="toolbar" id="pfilters">${filt}<label>AUD ≤ <input data-f="priceMax" type="number" min="0" step="any" style="width:6em" value="${esc(f.priceMax ?? "")}"></label>
      <label title="Only parts with an Australian price listed"><input type="checkbox" data-f="audOnly" ${f.audOnly === "1" ? "checked" : ""}> with an AUD price</label> <button class="link" id="pClear">Clear filters</button></div>
    <div class="hint">Numbers from the maker pages and store data (sources in each part's detail); AUD prices only where your own local price data is present (not included in the public data). Parts marked <span class="warn">CHECK</span> were read automatically or have a data problem: check the maker's manual before relying on a value.</div>
    <div id="pCount" class="dcount"></div><div id="pPager" class="pager"></div><div class="list" id="plWrap"><table id="pl"></table></div><div id="pPager2" class="pager"></div>`;
  const cols = PART_COLUMNS[cat];
  const list = () => {
    const rows = sortParts(parts.filter((p) => partMatches(p, cat, f)), cat, srt.key, srt.dir);
    const pi = pageInfo(rows.length, st.page, PAGE); st.page = pi.page;
    $("#pCount").innerHTML = `<b>${countLine(pi, rows.length, parts.length, PART_CATEGORIES.find((c) => c.id === cat)!.noun)}</b>`;
    const pager = rows.length > PAGE ? `<button data-pg="first" ${pi.page <= 1 ? "disabled" : ""}>« First</button><button data-pg="prev" ${pi.page <= 1 ? "disabled" : ""}>‹ Previous</button><span class="pgno">Page ${pi.page} of ${pi.pages}</span><button data-pg="next" ${pi.page >= pi.pages ? "disabled" : ""}>Next ›</button><button data-pg="last" ${pi.page >= pi.pages ? "disabled" : ""}>Last »</button>` : "";
    $("#pPager").innerHTML = pager; $("#pPager2").innerHTML = pager;
    $("#pl").innerHTML = `<tr>${cols.map((c) => `<th data-sort="${c.key}" class="sortable ${c.num ? "num" : ""}" title="${esc(c.title ?? "Sort")}">${esc(c.label)}${srt.key === c.key ? (srt.dir === 1 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>` +
      rows.slice(pi.start, pi.end).map((p) => `<tr data-id="${esc(p.id)}" class="${p.id === st.sel ? "sel" : ""}">${cols.map((c, i) => {
        const v = c.get(p); const approx = c.key === "area" && p.n?.labelOnly ? "~" : "";
        return `<td class="${c.num ? "num" : ""}">${i === 1 ? `${esc(fmt(v))}${p.bundle ? ' <span class="muted">(bundle)</span>' : ""}${p.quality_issues?.length || p.n?.warnings?.length || /auto-parsed|not clean|verify/i.test(p.check ?? "") ? ' <span class="warn" title="' + esc(p.check ?? "") + '">CHECK</span>' : ""}` : approx + esc(fmt(v))}</td>`;
      }).join("")}</tr>`).join("") + (rows.length ? "" : `<tr><td colspan="${cols.length}" class="muted">No part matches these filters.</td></tr>`);
    document.querySelectorAll<HTMLTableRowElement>("#pl tr[data-id]").forEach((tr) => tr.onclick = () => { st.sel = tr.dataset.id; list(); detail(parts.find((p) => p.id === st.sel), ctx); });
    document.querySelectorAll<HTMLElement>("#pl th[data-sort]").forEach((th) => th.onclick = () => { const k = th.dataset.sort!; st.sort[cat] = { key: k, dir: srt.key === k ? (srt.dir === 1 ? -1 : 1) : 1 }; Object.assign(srt, st.sort[cat]); list(); });
    document.querySelectorAll<HTMLButtonElement>("#pPager button[data-pg], #pPager2 button[data-pg]").forEach((b) => b.onclick = () => { const k = b.dataset.pg; st.page = k === "first" ? 1 : k === "prev" ? pi.page - 1 : k === "next" ? pi.page + 1 : pi.pages; list(); $("#plWrap").scrollTop = 0; });
  };
  const read = () => { document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#pBody [data-f]").forEach((el) => { f[el.dataset.f!] = el instanceof HTMLInputElement && el.type === "checkbox" ? (el.checked ? "1" : "") : el.value; }); st.page = 1; list(); };
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#pBody [data-f]").forEach((el) => { el.addEventListener(el instanceof HTMLInputElement && el.type !== "checkbox" ? "input" : "change", read); });
  $("#pClear").onclick = () => { st.f[cat] = {}; st.page = 1; body(parts, cat, ctx); };
  list(); detail(parts.find((p) => p.id === st.sel), ctx);
}

const SKIP = new Set(["id", "n", "sources", "prices_aud", "prices_other", "check", "notes", "quality_issues", "brand", "category", "sourceUrl", "readDate", "rawRef", "title", "model"]);
/** Every value of a part as table rows (research field names in plain words where simple). */
function valuesHtml(p: Part): string {
  const rows = Object.entries(p).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
  const show = (v: unknown): string => {
    if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? Object.entries(x).filter(([, y]) => y !== null && y !== undefined).map(([a, b]) => `${a} ${typeof b === "object" ? JSON.stringify(b) : b}`).join(", ") : String(x))).join("<br>");
    if (v && typeof v === "object") return esc(Object.entries(v).map(([a, b]) => `${a}: ${Array.isArray(b) ? b.join(" x ") : b}`).join(", "));
    return esc(String(v));
  };
  return `<table class="kv" id="pValues">${rows.map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td>${Array.isArray(v) ? show(v.map((x) => (typeof x === "object" ? x : x))) : show(v)}</td></tr>`).join("")}</table>`;
}
function detail(p: Part | undefined, ctx: PartsCtx) {
  const box = $("#pDetail"); if (!box) return;
  if (!p) { box.innerHTML = `<p class="muted">Pick a part on the left to see every value, its sources and prices, and to add it to a project.</p>`; return; }
  const it = partToItem(p);
  const projs = ctx.projects(); const cur = ctx.current();
  const isCable = it.kind === "cable";
  const warn = p.check && (p.quality_issues?.length || /auto-parsed|not clean|verify|unverified|retailer/i.test(p.check));
  box.innerHTML = `<fieldset id="pDet"><legend>${esc(partName(p))}</legend>
    ${p.title ? `<div class="hint">${esc(p.title)}</div>` : ""}
    ${p.check ? `<div class="card ${warn ? "warn" : ""}" id="pCheck"><b>${warn ? "CHECK" : "How these values were read"}:</b> ${esc(p.check)}${p.quality_issues?.length ? `<br>Data problems found: ${esc(p.quality_issues.join(", "))}` : ""}</div>` : ""}
    ${p.n.warnings?.length ? `<div class="card warn" id="pWarn"><b>CHECK:</b> ${p.n.warnings.map(esc).join("<br>")}</div>` : ""}
    ${p.notes ? `<div class="hint warn" id="pNotes">Notes: ${esc(p.notes)}</div>` : ""}
    <h2>Values</h2>${valuesHtml(p)}
    <h2>Sources</h2><table id="pSources"><tr><th>Values</th><th>Source</th><th>Read</th></tr>${(p.sources ?? []).map((s: any) => `<tr><td>${esc((s.fields ?? ["all"]).join(", "))}</td><td>${link(s.url)}${s.doc && s.doc !== s.url ? `<div class="hint">${esc(s.doc)}</div>` : ""}</td><td class="hint">${esc(s.read_date ?? "")} ${esc(s.tier ?? "")}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">no source listed</td></tr>'}</table>
    <h2>Prices</h2><table id="pPrices"><tr><th>Supplier</th><th>Price</th><th>Date</th></tr>${p.n.prices.map((x) => `<tr><td>${link(x.url, x.supplier)}</td><td class="num">AUD ${x.priceAud.toFixed(2)}${x.note ? ` <span class="hint">${esc(x.note)}</span>` : ""}</td><td>${esc(x.date ?? "")}</td></tr>`).join("")}
      ${(p.prices_other ?? []).map((x: any) => `<tr><td>${link(x.url, x.supplier)}</td><td class="num">${esc(x.currency)} ${esc((Array.isArray(x.price) ? x.price : [x.price]).join(" / "))} <span class="hint">(not converted)</span></td><td>${esc(x.read_date ?? "")}</td></tr>`).join("")}
      ${p.n.prices.length || p.prices_other?.length ? "" : '<tr><td colspan="3" class="muted">no price listed</td></tr>'}</table>
    <h2>Use it</h2><div class="hint">Becomes a project item of kind <b>${esc(it.kind)}</b> (data.partId ${esc(p.id)}); its values can be changed on the item (Project tab, Edit).</div>
    ${isCable ? `<div class="row"><label>Cable length</label><input id="pLen" type="number" min="0" step="0.1" value="5" style="width:6em"> <span class="u">m</span></div>` : ""}
    <div class="toolbar"><select id="pProj">${projs.map((x) => `<option value="${esc(x.name)}" ${x.name === cur ? "selected" : ""}>${esc(x.title || x.name)}${x.name === cur ? " (open)" : ""}</option>`).join("")}</select>
      <button class="primary" id="pAdd" ${projs.length ? "" : "disabled"}>Add to project</button><button id="pSave">Save to My items</button></div></fieldset>`;
  const item = () => partToItem(p, { lengthM: isCable ? parseFloat($<HTMLInputElement>("#pLen").value) || undefined : undefined });
  $("#pAdd").onclick = async () => { const pn = $<HTMLSelectElement>("#pProj").value; if (!pn) return; const id = await ctx.addToProject(item(), pn); if (id) ctx.status(`${partName(p)} added to "${projs.find((x) => x.name === pn)?.title ?? pn}" (Project tab)`, "ok"); };
  $("#pSave").onclick = async () => { if (await ctx.saveToMyItems(item())) ctx.status(`${partName(p)} saved to My items`, "ok"); };
}
/** For tests and the dry run: the parts tab state. */
export const partsState = () => ({ cat: st.cat, sel: st.sel, page: st.page, loaded: [...cache.keys()] });
export function setPartsCategory(cat: string) { if (isPartCategory(cat)) { st.cat = cat; st.page = 1; st.sel = undefined; store.set("partsCat", cat); } }

// ---------------------------------------------------------------------------------------------------- item edit form
/** Edit form of an electrical item (amplifier, dsp, capacitor, battery, fuse, fuse holder, distribution, cable, connector,
 * other): the fields the cable and diagram engines read; empty = the part record's value (shown greyed as the placeholder). */
export function itemFormHtml(it: { id: string; kind: string; name: string; data: any }, p?: Part): string {
  const fields = ITEM_FIELDS[it.kind] ?? ITEM_FIELDS.other;
  const d = it.data ?? {};
  const ph = (v: unknown) => (v === undefined || v === null || v === "" ? "" : `placeholder="${esc(fmt(v))} (part)"`);
  return `<fieldset id="itemForm" data-item="${esc(it.id)}"><legend>Edit: ${esc(it.name)} (${esc(it.kind)})</legend>
    ${p ? `<div class="hint">From the parts database: <b>${esc(partName(p))}</b> ${p.sourceUrl ? link(p.sourceUrl, "maker / source page") : ""}. Empty fields use the part's value (shown grey).</div>${p.check && (p.quality_issues?.length || /auto-parsed|not clean|verify/i.test(p.check)) ? `<div class="hint warn">CHECK: ${esc(p.check)}</div>` : ""}` : d.partId ? `<div class="hint">Part ${esc(d.partId)} (${esc(d.partCategory ?? "")}): loading or not in the database.</div>` : ""}
    <div class="row"><label>Name</label><input data-name value="${esc(it.name)}"></div>
    ${fields.map((f) => {
      const from = p && f.from ? f.from(p) : undefined; const v = d[f.key];
      if (f.type === "check") return `<div class="row"><label>${esc(f.label)}</label><input type="checkbox" data-ifield="${f.key}" ${v === true || (v === undefined && from === true) ? "checked" : ""}></div>`;
      if (f.type === "select") return `<div class="row"><label>${esc(f.label)}</label><select data-ifield="${f.key}">${f.options!.map(([o, t]) => `<option value="${esc(o)}" ${String(v ?? "") === o ? "selected" : ""}>${esc(o === "" && from !== undefined ? `${t} (part: ${fmt(from)})` : t)}</option>`).join("")}</select></div>`;
      return `<div class="row" ${f.hint ? `title="${esc(f.hint)}"` : ""}><label>${esc(f.label)}</label><input data-ifield="${f.key}" type="${f.type === "number" ? "number" : "text"}" step="any" value="${esc(v ?? "")}" ${ph(from)} style="width:9em"> <span class="u">${esc(f.unit ?? "")}</span></div>`;
    }).join("")}</fieldset>`;
}
/** Bind the form: every change writes item.data (and the name) and calls onChange. */
export function bindItemForm(root: HTMLElement, it: { kind: string; name: string; data: any }, onChange: () => void) {
  const fields = ITEM_FIELDS[it.kind] ?? ITEM_FIELDS.other;
  it.data ??= {};
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#itemForm [data-ifield]").forEach((el) => el.addEventListener("change", () => {
    const f = fields.find((x) => x.key === el.dataset.ifield); if (!f) return;
    setItemField(it.data, f, el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value); onChange();
  }));
  const nm = root.querySelector<HTMLInputElement>("#itemForm [data-name]"); if (nm) nm.addEventListener("change", () => { if (nm.value.trim()) { it.name = nm.value.trim(); onChange(); } });
}
