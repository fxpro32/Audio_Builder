// Boards tab (A13_BOARDS, R33): standard MDF sheets sold in Australia (data/boards/mdf_sheets_au.json, agent A12), every panel
// of the current box nested on them with guillotine cuts, the smallest sheet and the cheapest way to buy, drawn to scale.
import { $, esc, f1, fmtMm, store, units, field, readInput, download } from "./dom";
import { checkLayout, cheapestBuys, nestRepeat, Piece, pieceArea, Plan, SheetLayout, SheetSpec, smallestSheet, Buy, P2, grainErrors } from "../engine/nest";
// B7_PLYWOOD_BOARDS: material choice (MDF or a plywood type, saved on the box / IB item), thickness tolerance, grain lock, weight
import { MATERIALS, MaterialId, MaterialInfo, materialInfo, matchThickness, panelsWeight, sheetsOfMaterial, THICKNESS_TOL_MM, buyable } from "../engine/boardmat";

export interface BoardSheet { supplier: string; product: string; item?: string; category: string; lengthMm: number; widthMm: number; thicknessMm: number; priceAud?: number; priceDate?: string; url?: string; note?: string }
export interface BoardCatalogue { description: string; kerfMmDefault: number; kerfNote: string; edgeTrimMmDefault: number; edgeTrimNote: string; bunningsCuttingService?: any; sources?: string[]; sheets: BoardSheet[]; grainNote?: string; densityKgM3?: any[] }
/** One panel to cut: a piece (whole mm) and its thickness. */
export type BoardPanel = Piece & { t: number; note?: string };
/** Where the panels come from: the Design new box, or the box saved in the project (Analyse / Fix). */
export interface BoardSource { key: string; label: string; panels: BoardPanel[]; error?: string; boxT: number; summary: string;
  /** B7: the item's board material (saved on the item; MDF for a box, birch plywood for an IB baffle by default) and grain lock. */
  material?: MaterialId; grain?: boolean; ib?: boolean }
export interface BoardsCtx {
  api: (path: string, init?: RequestInit) => Promise<any>; status: (msg: string, cls?: string) => void;
  sources: () => BoardSource[]; projectName: () => string; projectTitle: () => string;
  saveExport: (name: string, body: BlobPart) => void;
  /** B7: save the board material and the grain lock on the box / IB item shown (autosave). */
  setMaterial?: (m: MaterialId, grain: boolean) => void;
}

let catalogue: BoardCatalogue | undefined; let loadErr = "";
let plyCat: BoardCatalogue | undefined; let plyErr = "";
/** MDF sheets then plywood sheets: row keys "i<n>" index this list. */
let allSheets: BoardSheet[] = [];
interface BState { src?: string; kerf?: number; trim?: number; supplier: string; cat: string; thick?: number; pair: boolean; sort: string; dir: number; chosen?: string; forProject?: string }
const st: BState = (() => { try { return { supplier: "all", cat: "all", pair: true, sort: "area", dir: 1, ...JSON.parse(store.get("boards") || "{}") }; } catch { return { supplier: "all", cat: "all", pair: true, sort: "area", dir: 1 }; } })();
const saveSt = () => store.set("boards", JSON.stringify(st));
const MAIN_SUPPLIERS = ["Bunnings", "Bowens", "Plyco"];
const CAT_LABEL: Record<string, string> = { standard: "standard MDF", moisture_resistant: "moisture resistant MDF" };
const area2 = (s: { lengthMm: number; widthMm: number }) => (s.lengthMm * s.widthMm) / 1e6;
const sizeTxt = (L: number, W: number) => (units.imperial ? `${fmtMm(L)} × ${fmtMm(W)}` : `${L} × ${W} mm`);
/** mm with a decimal only when the value has one (16 mm, 3.2 mm). */
const mmT = (v: number) => fmtMm(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
const money = (v?: number | null) => (typeof v !== "number" || !isFinite(v) ? "–" : "$" + v.toFixed(2)); // P1: null = no price (generic sheets)
/** P1_PUBLIC_DATA: true when no sheet shown has a price (the public generic sheet list; supplier catalogues are local data only). */
const noPrices = (ss: BoardSheet[]) => !ss.some((s) => typeof s.priceAud === "number" && s.priceAud > 0);
const NO_PRICE_TXT = "Prices are not available: these are generic sheet sizes (the supplier catalogue with prices is local data, not part of the public app), so there is no cheapest way to buy. Check sizes and prices with your local supplier.";
const perArea = (s: BoardSheet) => (s.priceAud ? (units.imperial ? `${money(s.priceAud / (area2(s) * 10.7639))}/ft²` : `${money(s.priceAud / area2(s))}/m²`) : "–");

interface Row { i: number; s: BoardSheet; plan: Plan; fits: boolean; n: number; pct: number; off: number }
interface Computed { src: BoardSource; t: number; sheetT: number; nearest: boolean; panels: BoardPanel[]; other: BoardPanel[]; sheets: { s: BoardSheet; i: number }[]; rows: Row[]; best?: { row: Row }; buys: Buy[]; kerf: number; trim: number;
  mat: MaterialInfo; grain: boolean; tolOff: number[]; noCat?: string }
let last: Computed | undefined;

async function loadCatalogue(ctx: BoardsCtx) {
  if (!catalogue && !loadErr) { try { catalogue = await ctx.api("boards"); } catch (e) { loadErr = (e as Error).message; } }
  if (!plyCat && !plyErr) { try { plyCat = await ctx.api("boards/plywood"); } catch (e) { plyErr = (e as Error).message; } }
  allSheets = [...(catalogue?.sheets ?? []), ...(plyCat?.sheets ?? [])];
}
const specOf = (x: { s: BoardSheet; i: number }): SheetSpec => ({ key: "i" + x.i, L: x.s.lengthMm, W: x.s.widthMm, price: x.s.priceAud, group: x.s.supplier });

function compute(ctx: BoardsCtx): Computed | undefined {
  if (!catalogue) return undefined;
  const srcs = ctx.sources(); const src = srcs.find((s) => s.key === st.src) ?? srcs[0];
  if (!src) return undefined;
  const kerf = st.kerf ?? catalogue.kerfMmDefault, trim = st.trim ?? catalogue.edgeTrimMmDefault;
  const thicks = [...new Set(src.panels.map((p) => p.t))];
  const t = st.thick !== undefined && thicks.includes(st.thick) ? st.thick : thicks.includes(src.boxT) ? src.boxT : thicks[0] ?? src.boxT;
  const panels = src.panels.filter((p) => p.t === t), other = src.panels.filter((p) => p.t !== t);
  const mat = materialInfo(src.material ?? (src.ib ? "birch" : "mdf")); const grain = mat.grain && src.grain !== false;
  const noCat = mat.catalogue === "ply" && !plyCat ? plyErr || "not loaded" : undefined;
  const inFilter = (s: BoardSheet) => (st.supplier === "all" || (st.supplier === "others" ? !MAIN_SUPPLIERS.includes(s.supplier) : s.supplier === st.supplier)) && (mat.catalogue !== "mdf" || st.cat === "all" || s.category === st.cat);
  const indexed = allSheets.map((s, i) => ({ s, i, mdf: i < (catalogue?.sheets.length ?? 0) }));
  const ofMat = sheetsOfMaterial(mat.id, indexed.filter((x) => x.mdf).map((x) => ({ ...x, category: x.s.category })), indexed.filter((x) => !x.mdf).map((x) => ({ ...x, category: x.s.category })));
  const all = ofMat.map(({ s, i }) => ({ s, i })).filter((x) => inFilter(x.s));
  // thickness: sheets within THICKNESS_TOL_MM of the design thickness count as it (18.5 mm hoop pine for 18 mm); else the nearest
  let sheetT = t; let nearest = false;
  let m = matchThickness(all.map((x) => ({ ...x, thicknessMm: x.s.thicknessMm })), t);
  if (!m.sheets.length) {
    const ts = [...new Set(all.map((x) => x.s.thicknessMm))].sort((a, b) => Math.abs(a - t) - Math.abs(b - t) || b - a);
    if (ts.length) { sheetT = ts[0]; nearest = true; m = matchThickness(all.map((x) => ({ ...x, thicknessMm: x.s.thicknessMm })), sheetT, 0); }
  }
  const sheets = m.sheets.map(({ s, i }) => ({ s, i })); const tolOff = nearest ? [] : m.off;
  const o = { kerf, trim, pair: st.pair, grain };
  const cache = new Map<string, Plan>();
  const rows: Row[] = sheets.map(({ s, i }) => {
    const k = s.lengthMm + "x" + s.widthMm; const plan = cache.get(k) ?? cache.set(k, nestRepeat(panels, s.lengthMm, s.widthMm, o)).get(k)!;
    const fits = plan.unplaced.length === 0 && panels.length > 0; const n = plan.sheets.length;
    const pa = plan.sheets.reduce((a, x) => a + x.partArea, 0);
    return { i, s, plan, fits, n, pct: n ? (pa / (n * s.lengthMm * s.widthMm)) * 100 : 0, off: Math.max(0, ...(plan.sheets[n - 1]?.offcuts ?? []).map((r) => r.w * r.h)) };
  });
  let best: Computed["best"];
  if (panels.length) {
    const sm = smallestSheet(panels, buyable(sheets, (x) => x.s).map(specOf), o);  // PM: comparison-only sheets are not recommended
    if (sm) { const i = Number(sm.sheet.key.slice(1)); const r = rows.find((x) => x.i === i)!; best = { row: { ...r, plan: sm.plan, n: 1, fits: true, pct: sm.plan.sheets[0].pct } }; }
  }
  const buys = panels.length ? cheapestBuys(panels, buyable(sheets, (x) => x.s).map(specOf), o) : [];
  return { src, t, sheetT, nearest, panels, other, sheets, rows, best, buys, kerf, trim, mat, grain, tolOff, noCat };
}

export async function renderBoards(ctx: BoardsCtx) {
  const page = $("#page");
  page.innerHTML = `<p class="muted">Loading the board catalogue…</p>`;
  await loadCatalogue(ctx);
  if (!catalogue) { page.innerHTML = `<p class="bad">Board catalogue not available: ${esc(loadErr)}. Restart the app server (it serves data/boards/generic_sheets.json, or the local supplier catalogue in data/private/boards/, from this version on).</p>`; return; }
  if (st.forProject !== ctx.projectName()) { st.chosen = undefined; st.thick = undefined; st.forProject = ctx.projectName(); saveSt(); }
  const c = compute(ctx); last = c;
  const srcs = ctx.sources();
  if (!c) { page.innerHTML = `<p class="muted">No box to lay out: make one on Design new first.</p>`; return; }
  const cat = catalogue; const k = { kerf: c.kerf, trim: c.trim };
  const thicks = [...new Set(c.src.panels.map((p) => p.t))];
  const present = new Set(allSheets.map((x) => x.supplier)); // P1: only suppliers in the loaded catalogue (generic list: "Generic size")
  const sup = ["all", ...MAIN_SUPPLIERS.filter((x) => present.has(x)), ...([...present].some((x) => !MAIN_SUPPLIERS.includes(x)) ? ["others"] : [])];
  page.innerHTML = `<div class="cols"><div>
    ${materialHtml(c)}
    <fieldset id="bdSrc"><legend>Panels to cut</legend>
      ${srcs.length > 1 ? `<div class="row"><label>Box</label><select id="bdSource">${srcs.map((s) => `<option value="${esc(s.key)}" ${s.key === c.src.key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select><span class="u"></span></div>` : `<div class="hint">${esc(c.src.label)}</div>`}
      <div class="hint" id="bdSummary">${esc(c.src.summary)}</div>
      ${c.src.error ? `<p class="warn" id="bdSrcErr">${esc(c.src.error)}</p>` : ""}
      ${thicks.length > 1 ? `<div class="row"><label>Panel thickness to lay out</label><select id="bdThick">${thicks.map((t) => `<option value="${t}" ${t === c.t ? "selected" : ""}>${mmT(t)} (${c.src.panels.filter((p) => p.t === t).length} panels)</option>`).join("")}</select><span class="u"></span></div>` : ""}
      ${c.panels.length ? `<table id="bdPanels"><tr><th>Panel</th><th class="num">Size (whole ${units.imperial ? "mm, in" : "mm"})</th><th>Shape</th></tr>${c.panels.map((p) => `<tr data-id="${esc(p.id)}"><td>${esc(p.name)}</td><td class="num">${p.w} × ${p.h}${units.imperial ? ` <span class="muted">(${fmtMm(p.w)} × ${fmtMm(p.h)})</span>` : ""}</td><td>${p.trap ? `trapezoid: bottom ${p.trap.bottom}, top ${p.trap.top}` : p.poly ? `outline (${p.poly.length} corners) in a ${p.w} × ${p.h} blank` : "rectangle"}${p.note ? ` · ${esc(p.note)}` : ""}</td></tr>`).join("")}</table>
        <div class="hint">${c.panels.length} panels, ${mmT(c.t)} thick, ${f1(c.panels.reduce((a, p) => a + pieceArea(p), 0) / 1e6, 3)} m² of board in the panels. ${c.mat.grain ? (c.grain ? "Grain lock on: no panel is turned so its long side runs across the face grain." : "Grain lock off: panels may be turned 90° (the face grain may run across a panel's long side).") : "MDF has no grain: any panel may be turned 90°."}</div>${weightHtml(c)}` : ""}
      ${c.other.length ? `<p class="warn" id="bdOther">Not on this sheet (another thickness): ${c.other.map((p) => `${esc(p.name)} ${p.w} × ${p.h} (${p.t} mm)`).join(", ")}. Pick that thickness above to lay it out.</p>` : ""}
    </fieldset>
    <fieldset id="bdCutting"><legend>Saw and sheet edges</legend>
      ${field("Saw cut width (kerf)", k, "kerf", "mm", { step: 0.1, min: 0, title: cat.kerfNote })}<div class="hint">${esc(cat.kerfNote)}</div>
      ${field("Trim off each factory edge", k, "trim", "mm", { step: 1, min: 0, title: cat.edgeTrimNote })}<div class="hint">${esc(cat.edgeTrimNote)}</div>
      <div class="row"><label for="bdPair">Pair the wedge sides head-to-tail (one sloped cut) when that saves board</label><input type="checkbox" id="bdPair" ${st.pair ? "checked" : ""}><span class="u"></span></div>
    </fieldset>
    <fieldset id="bdFilter"><legend>Sheets to compare</legend>
      <div class="row"><label>Supplier</label><select id="bdSupplier">${sup.map((s) => `<option value="${s}" ${s === st.supplier ? "selected" : ""}>${s === "all" ? "All suppliers" : s === "others" ? "Others (" + ([...new Set((c.mat.catalogue === "mdf" ? cat.sheets : plyCat?.sheets ?? []).map((x) => x.supplier).filter((x) => !MAIN_SUPPLIERS.includes(x)))].join(", ") || "none") + ")" : s}</option>`).join("")}</select><span class="u"></span></div>
      ${c.mat.catalogue !== "mdf" ? "" : `<div class="row"><label>Type</label><select id="bdCat"><option value="all" ${st.cat === "all" ? "selected" : ""}>Standard and moisture resistant</option><option value="standard" ${st.cat === "standard" ? "selected" : ""}>Standard</option><option value="moisture_resistant" ${st.cat === "moisture_resistant" ? "selected" : ""}>Moisture resistant (MR)</option></select><span class="u"></span></div>`}
      ${supplierSizes(c)}
    </fieldset>
    ${cat.bunningsCuttingService ? `<div class="hint" id="bdBunCut"><b>Bunnings cutting service</b> (${esc(cat.bunningsCuttingService.available)}): ${esc(cat.bunningsCuttingService.rounding)}; pieces at least ${cat.bunningsCuttingService.minimumPieceMm} mm; ${esc(cat.bunningsCuttingService.costNote)}; ${esc(cat.bunningsCuttingService.offcuts)}. Useful to break a big sheet down so it fits in the car, not for the final panels. <a href="${esc(cat.bunningsCuttingService.url)}" target="_blank" rel="noopener">Bunnings page</a> (read ${esc(cat.bunningsCuttingService.read)}).</div>` : ""}
  </div><div>
    <div id="bdBest">${bestHtml(c)}</div>
    <div class="toolbar"><button id="bdSvg">Save picture (SVG)</button><button id="bdPrint">Print</button><span class="hint" id="bdShowing"></span></div>
    <div id="bdDraw" class="bdDraw"></div>
    <div id="bdCuts"></div>
  </div></div>
  <h2>All ${mmT(c.sheetT)}${c.tolOff.length ? ` (and ${c.tolOff.map(mmT).join(", ")})` : ""} ${esc(c.mat.label)} sheets${st.supplier !== "all" ? ` (${esc(st.supplier)})` : ""}</h2>
  <div class="hint" id="bdListHint">${noPrices(c.sheets.map((x) => x.s)) ? "No prices in this list (generic sizes)." : "Prices AUD inc. GST as read on each supplier's site on the date shown; not live."} Click a row to draw it; click a heading to sort.</div>
  <div id="bdList">${listHtml(c)}</div>`;
  bind(ctx, c);
  draw(ctx, c);
}

/** B7: the material choice (saved on the item) with its note, density source and, for plywood, the grain lock. */
function materialHtml(c: Computed): string {
  const m = c.mat; const ibHint = c.src.ib ? (m.id === "birch" ? " Default for an infinite-baffle baffle: birch plywood." : ` Default for an infinite-baffle baffle: birch plywood, as PS Sound build IB baffles from 18 mm ply and 1 in birch ply (references/research_h_ib_door_home_pc.md).`) : " Default for a box: MDF.";
  return `<fieldset id="bdMaterial"><legend>Material</legend>
    <div class="row"><label for="bdMat">Board</label><select id="bdMat">${MATERIALS.map((x) => `<option value="${x.id}" ${x.id === m.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select><span class="u"></span></div>
    <div class="hint" id="bdMatNote">${esc(m.note)}${ibHint} Saved with this ${c.src.ib ? "baffle" : "box"}.</div>
    ${m.grain ? `<div class="row"><label for="bdGrain">Keep the grain along the long side of each panel</label><input type="checkbox" id="bdGrain" ${c.grain ? "checked" : ""}><span class="u"></span></div>
    <div class="hint">${esc(plyCat?.grainNote ?? "Plywood is stiffer along the face grain.")} With this on, no panel is turned so that its long side runs across the face grain (the sheet's length); this can need more board. Assumes the face grain runs along the sheet's length, as listed.</div>` : ""}
  </fieldset>`;
}
/** B7: about N kg of panels (real panel area × thickness × the material's sourced density). */
function weightHtml(c: Computed): string {
  const w = panelsWeight(c.panels, c.mat.id); const d = c.mat.density;
  return `<div class="hint" id="bdWeight">${w.kg !== undefined ? `<b>About ${f1(w.kg, 1)} kg of panels</b> (${f1(w.volM3 * 1000, 1)} L of board × ${esc(d.label)}${d.source ? `, <a href="${esc(d.source)}" target="_blank" rel="noopener">source</a>` : ""}).` : `Weight not given: ${esc(d.label)}.`}</div>`;
}
function supplierSizes(c: Computed): string {
  const by = new Map<string, Set<string>>();
  for (const { s } of c.sheets) (by.get(s.supplier) ?? by.set(s.supplier, new Set()).get(s.supplier)!).add(s.lengthMm + "×" + s.widthMm);
  const bestA = c.best ? c.best.row.s.lengthMm * c.best.row.s.widthMm : undefined;
  const lines = [...by].map(([sup, set]) => {
    const sizes = [...set].sort((a, b) => eval0(a) - eval0(b));
    const minA = Math.min(...sizes.map(eval0));
    const big = bestA !== undefined && minA >= 2 * bestA;
    return `<li${big ? ' class="warn"' : ""} data-sup="${esc(sup)}">${esc(sup)}: ${sizes.join(", ")}${big ? ` · <b>${esc(sup)} sells ${mmT(c.sheetT)} only in big sheets</b> (smallest ${sizes[0]}, ${f1(minA / 1e6, 2)} m², against ${f1(bestA! / 1e6, 2)} m² that would do)` : ""}</li>`;
  });
  return lines.length ? `<div class="hint">${mmT(c.sheetT)} sizes (mm) by supplier:</div><ul class="steps hint" id="bdSupSizes">${lines.join("")}</ul>` : "";
}
const eval0 = (s: string) => { const [a, b] = s.split("×").map(Number); return a * b; };

function bestHtml(c: Computed): string {
  const out: string[] = [];
  if (c.src.error && !c.panels.length) return `<p class="warn">${esc(c.src.error)}</p>`;
  if (!c.panels.length) return `<p class="muted">No panels to lay out.</p>`;
  if (c.noCat) return `<p class="bad" id="bdNoPly">The plywood catalogue is not available (${esc(c.noCat)}). The app server serves it from this version on: restart it on the host (scripts/restart_app.sh), then reload this page. MDF works meanwhile.</p>`;
  if (!c.sheets.length) return `<p class="bad" id="bdNone">No ${esc(c.mat.label)} sheets in the catalogue for this filter. Choose All suppliers or another material.</p>`;
  if (c.tolOff.length) out.push(`<p class="warn" id="bdTol">Sheets listed at ${c.tolOff.map(mmT).join(", ")} are counted as ${mmT(c.t)} (within ±${mmT(THICKNESS_TOL_MM)} of the design thickness). Such a sheet is up to ${mmT(Math.max(...c.tolOff.map((x) => Math.abs(x - c.t))))} off the design thickness, so each inside size changes by up to twice that and the volume slightly: measure the sheet and set its thickness on the design if it matters.</p>`);
  if (c.nearest) out.push(`<p class="bad" id="bdNearest">No ${mmT(c.t)} ${esc(c.mat.label)} sheet (within ±${mmT(THICKNESS_TOL_MM)}) is sold by the suppliers chosen. Shown: the nearest thickness, ${mmT(c.sheetT)}. A different thickness changes the inside sizes and volume: set ${mmT(c.sheetT)} as the panel thickness on Design new to make the panels match.</p>`);
  const r = c.best?.row;
  if (r) out.push(`<div class="card info" id="bdSmallest"><b>Smallest sheet that holds every panel</b>${sizeTxt(r.s.lengthMm, r.s.widthMm)} × ${mmT(r.s.thicknessMm)} ${esc(CAT_LABEL[r.s.category] ?? r.s.category)}, ${esc(r.s.supplier)}${typeof r.s.priceAud === "number" ? " " + money(r.s.priceAud) : ""} · <b id="bdSmallPct">${f1(r.pct, 0)} % used</b> · biggest offcut ${offTxt(r.plan.sheets[0])}${sameSize(c, r)} ${noteHint([r.s])}<button class="link" data-show="best">draw</button></div>`);
  else {
    const big = c.panels.filter((p) => !c.sheets.some(({ s }) => fitsEither(p, s, c.trim)));
    out.push(`<p class="bad" id="bdNoSingle">No single ${mmT(c.sheetT)} sheet holds every panel${big.length ? `; ${big.map((p) => esc(p.name)).join(", ")} ${big.length > 1 ? "are" : "is"} bigger than every sheet` : ""}. ${c.buys.length ? "Split across sheets: see the cheapest way to buy." : noPrices(c.sheets.map((x) => x.s)) && !big.length ? "Split the panels across several sheets (see the list: Holds every panel)." : "Try another supplier, All suppliers, or a smaller box."}</p>`);
  }
  const b = c.buys[0];
  if (b) {
    const det = b.sheets.map((s, j) => { const x = sheetOf(s.key); return `${sizeTxt(s.L, s.W)} ${money(s.price)} (${f1(b.plan.sheets[j]?.pct, 0)} % used${x?.category === "moisture_resistant" ? ", MR" : ""})`; }).join(" + ");
    out.push(`<div class="card info" id="bdCheapest"><b>Cheapest way to buy</b>${esc(b.group)}: ${b.sheets.length > 1 ? `${b.sheets.length} sheets, ` : ""}${det} = <b>${money(b.cost)}</b>${c.buys.length > 1 ? `<div class="hint">Next: ${c.buys.slice(1, 4).map((x) => `${esc(x.group)} ${x.sheets.map((s) => `${s.L}×${s.W}`).join(" + ")} ${money(x.cost)}`).join(" · ")}</div>` : ""}${noteHint(b.sheets.map((x) => sheetOf(x.key)))} <button class="link" data-show="buy">draw</button></div>`);
  }
  const date = [...new Set(c.sheets.map(({ s }) => s.priceDate).filter(Boolean))].join(", ");
  out.push(`<div class="hint" id="bdPriceNote">${noPrices(c.sheets.map((x) => x.s)) ? esc(NO_PRICE_TXT) : `Prices read ${esc(date)} from the suppliers' sites, not live: check the current price with the link in the list.`} Kerf ${mmT(c.kerf)}, edge trim ${mmT(c.trim)} per factory edge.${c.grain ? " Grain lock: every panel's long side along the sheet length (the face grain)." : ""}</div>`);
  return out.join("");
}
/** The supplier's own caveats for a sheet (e.g. "Sydney supplier, comparison only", "Special Order"). */
const noteHint = (ss: (BoardSheet | undefined)[]) => { const n = [...new Set(ss.map((x) => x?.note).filter(Boolean))]; return n.length ? `<div class="hint">Note: ${n.map(esc).join(" · ")}</div>` : ""; };
const fitsEither = (p: Piece, s: BoardSheet, trim: number) => { const L = s.lengthMm - 2 * trim, W = s.widthMm - 2 * trim; return (p.w <= L && p.h <= W) || (p.h <= L && p.w <= W); };
const sheetOf = (key: string) => allSheets[Number(key.slice(1))];
function sameSize(c: Computed, r: Row): string {
  const others = c.rows.filter((x) => x.s.lengthMm === r.s.lengthMm && x.s.widthMm === r.s.widthMm && x.i !== r.i);
  return others.length ? `<div class="hint">Same size also at: ${others.map((x) => `${esc(x.s.supplier)} ${money(x.s.priceAud)}${x.s.category === "moisture_resistant" ? " (MR)" : ""}`).join(", ")}</div>` : "";
}
const offTxt = (s?: SheetLayout) => { if (!s || !s.offcuts.length) return "none"; const o = [...s.offcuts].sort((a, b) => b.w * b.h - a.w * a.h)[0]; return `${fmtMm(Math.floor(Math.max(o.w, o.h)))} × ${fmtMm(Math.floor(Math.min(o.w, o.h)))}`; };

const COLS: [string, string, (r: Row) => number | string][] = [
  ["area", "Size (L × W)", (r) => r.s.lengthMm * r.s.widthMm + r.s.lengthMm / 1e5],
  ["supplier", "Supplier", (r) => r.s.supplier], ["cat", "Type", (r) => r.s.category], ["product", "Product", (r) => r.s.product],
  ["price", "Price", (r) => r.s.priceAud ?? Infinity], ["ppm", units.imperial ? "$/ft²" : "$/m²", (r) => (r.s.priceAud ?? Infinity) / area2(r.s)],
  ["fits", "Holds every panel", (r) => (r.fits ? r.n : 99)], ["pct", "% used", (r) => -r.pct], ["off", "Biggest offcut", (r) => -r.off],
];
function listHtml(c: Computed): string {
  const col = COLS.find((x) => x[0] === st.sort) ?? COLS[0];
  const rows = [...c.rows].sort((a, b) => { const x = col[2](a), y = col[2](b); return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * st.dir || a.s.lengthMm * a.s.widthMm - b.s.lengthMm * b.s.widthMm; });
  return `<table id="bdTable"><tr>${COLS.map(([k, l]) => `<th data-sort="${k}" class="sortable">${l}${st.sort === k ? (st.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}<th>Price read</th><th>Link</th></tr>
    ${rows.map((r) => `<tr data-pick="i${r.i}" class="${st.chosen === "i" + r.i ? "sel" : ""}"><td class="num">${sizeTxt(r.s.lengthMm, r.s.widthMm)}</td><td>${esc(r.s.supplier)}</td><td>${esc(CAT_LABEL[r.s.category] ?? r.s.category)}</td><td title="${esc(r.s.note ?? "")}">${esc(r.s.product)}</td><td class="num">${money(r.s.priceAud)}</td><td class="num">${perArea(r.s)}</td>
      <td class="${r.fits ? (r.n === 1 ? "ok" : "warn") : "bad"}">${!c.panels.length ? "–" : r.fits ? (r.n === 1 ? "yes" : `needs ${r.n} sheets`) : "no (a panel is bigger)"}</td><td class="num">${r.fits ? f1(r.pct, 0) + " %" : "–"}</td><td class="num">${r.fits ? offTxt(r.plan.sheets[r.n - 1]) : "–"}</td>
      <td>${esc(r.s.priceDate ?? "")}</td><td>${r.s.url ? `<a href="${esc(r.s.url)}" target="_blank" rel="noopener">check the current price</a>` : ""}</td></tr>`).join("")}</table>`;
}

/** What is drawn now: a catalogue row (one or more sheets of that size), the smallest sheet, or the cheapest buy. */
function chosenPlan(c: Computed): { plan: Plan; title: string; sheets: (BoardSheet | undefined)[] } | undefined {
  const pick = st.chosen ?? (c.best ? "best" : c.buys.length ? "buy" : undefined);
  if (pick === "best" && c.best) return { plan: c.best.row.plan, title: `Smallest sheet: ${c.best.row.s.supplier} ${c.best.row.s.product}`, sheets: [c.best.row.s] };
  if (pick === "buy" && c.buys[0]) { const b = c.buys[0]; return { plan: b.plan, title: `Cheapest buy: ${b.group}, ${money(b.cost)}`, sheets: b.sheets.map((s) => sheetOf(s.key)) }; }
  const r = c.rows.find((x) => "i" + x.i === pick);
  if (r) return { plan: r.plan, title: `${r.s.supplier} ${r.s.product}`, sheets: r.plan.sheets.map(() => r.s) };
  if (c.best) return { plan: c.best.row.plan, title: `Smallest sheet: ${c.best.row.s.supplier} ${c.best.row.s.product}`, sheets: [c.best.row.s] };
  return undefined;
}

function draw(ctx: BoardsCtx, c: Computed) {
  const ch = chosenPlan(c);
  if (!ch || !ch.plan.sheets.length) { $("#bdDraw").innerHTML = c.panels.length ? `<p class="muted">Nothing to draw: no sheet in this list holds the panels.</p>` : ""; $("#bdCuts").innerHTML = ""; return; }
  $("#bdShowing").textContent = "Showing: " + ch.title;
  $("#bdDraw").innerHTML = ch.plan.sheets.map((s, j) => sheetSvg(s, `${ctx.projectTitle()}: sheet ${j + 1} of ${ch.plan.sheets.length}, ${s.L} × ${s.W} × ${ch.sheets[j]?.thicknessMm ?? c.sheetT} mm ${c.mat.label}${ch.sheets[j] ? ` (${ch.sheets[j]!.supplier})` : ""}`, undefined, c.mat.grain ? (c.grain ? "locked" : "free") : undefined)).join("");
  $("#bdCuts").innerHTML = cutsHtml(ch.plan, c);
}
function cutsHtml(plan: Plan, c: Computed): string {
  return plan.sheets.map((s, j) => `<h2>Cut order${plan.sheets.length > 1 ? `, sheet ${j + 1}` : ""} (${sizeTxt(s.L, s.W)}, ${f1(s.pct, 0)} % used)</h2><ol class="steps bdCutList" start="0">
    ${s.trim > 0 ? `<li>Trim ${mmT(s.trim)} off each factory edge (hatched) so every edge is clean and square.</li>` : ""}
    ${s.cuts.map((k) => `<li value="${k.n}">${cutText(k, s)}</li>`).join("")}</ol>
    ${s.offcuts.length ? `<div class="hint">Offcuts (grey): ${[...s.offcuts].sort((a, b) => b.w * b.h - a.w * a.h).filter((o) => o.w >= 50 && o.h >= 50).slice(0, 4).map((o) => `${fmtMm(Math.floor(Math.max(o.w, o.h)))} × ${fmtMm(Math.floor(Math.min(o.w, o.h)))}`).join(", ") || "only thin strips"}. Each saw cut removes ${mmT(c.kerf)}.</div>` : ""}`).join("") + (plan.unplaced.length ? `<p class="bad">Not placed: ${plan.unplaced.map((p) => esc(p.name)).join(", ")}</p>` : "");
}
function cutText(k: SheetLayout["cuts"][number], s: SheetLayout): string {
  const fr = [...new Set(k.frees)].join(", ");
  const dir = k.kind === "rip" ? "Rip (along the sheet)" : k.kind === "cross" ? "Cross cut (across the sheet)" : "Sloped cut";
  if (k.stage === 1) return `${dir}: cut off a strip ${mmT(k.size)} wide, the full ${fmtMm(k.len)} (for ${esc(fr)}).`;
  if (k.stage === 2) return `${dir}: cut ${mmT(k.size)} off that strip (for ${esc(fr)}).`;
  if (k.stage === 3) return `${dir}: split off ${mmT(k.size)} (${esc(fr)}).`;
  if (k.stage === 4) return `${dir}: trim to ${mmT(k.size)} (${esc(fr)}).`;
  void s; return `Sloped cut, ${fmtMm(k.len)} long, corner to corner between the two wedge sides (${esc(fr)}): the blade's edge follows the drawn line.`;
}

/** The sheet drawn to scale (SVG, mm), y up so a wedge side looks the way it stands in the box. */
export function sheetSvg(s: SheetLayout, title: string, pxPerMm = 0.42, grain?: "locked" | "free"): string {
  const pad = 20; const fs = Math.max(14, Math.min(s.L, s.W) / 28);
  const sub = `${s.L} × ${s.W} mm, ${f1(s.pct, 0)} % used · hatched: ${s.trim} mm trim · grey: offcut · red: straight cuts in order · purple: sloped cut · gaps: ${s.kerf} mm kerf${grain ? ` · thin lines: face grain along the sheet length${grain === "locked" ? " (grain lock: every panel's long side along it)" : " (grain lock off)"}` : ""} · to scale`;
  const fit = (txt: string, base: number) => Math.min(base, (s.L + pad) / (txt.length * 0.56)); // font size so the line fits the sheet width
  const f1s = fit(title, fs * 1.1), f2s = fit(sub, fs * 0.85);
  const top = f1s * 1.4 + f2s * 1.4 + fs * 0.9; // room for the two title lines and the cut-number circles on the top edge
  const Y = (y: number) => s.W - y; const pt = (q: P2) => `${f1(q[0], 1)},${f1(Y(q[1]), 1)}`;
  const vbW = s.L + 2 * pad, vbH = s.W + top + pad;
  let body = `<defs><pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#fff"/><line x1="0" y1="0" x2="0" y2="12" stroke="#999" stroke-width="4"/></pattern>${grain ? `<pattern id="grainPat" width="60" height="22" patternUnits="userSpaceOnUse"><line x1="0" y1="11" x2="60" y2="11" stroke="#a5814a" stroke-width="1.2" stroke-opacity="0.55"/></pattern>` : ""}</defs>`;
  body += `<rect x="0" y="0" width="${s.L}" height="${s.W}" fill="url(#hatch)" stroke="#333" stroke-width="2"/>`;
  body += `<rect x="${s.trim}" y="${s.trim}" width="${s.L - 2 * s.trim}" height="${s.W - 2 * s.trim}" fill="#fbf7ee" stroke="none"/>`;
  for (const o of s.offcuts) {
    body += `<rect class="offcut" x="${f1(o.x, 1)}" y="${f1(Y(o.y + o.h), 1)}" width="${f1(o.w, 1)}" height="${f1(o.h, 1)}" fill="#d6d6d6" stroke="#aaa" stroke-dasharray="6 4"/>`;
    if (o.w > 6 * fs && o.h > 1.6 * fs) body += `<text x="${f1(o.x + o.w / 2, 1)}" y="${f1(Y(o.y + o.h / 2) + fs / 3, 1)}" font-size="${f1(fs * 0.8, 1)}" text-anchor="middle" fill="#666">offcut ${Math.floor(o.w)} × ${Math.floor(o.h)}</text>`;
  }
  for (const p of s.placed) for (const q of p.parts) {
    body += `<polygon class="panel" data-id="${esc(q.piece.id)}" points="${q.poly.map(pt).join(" ")}" fill="#f3e3c3" stroke="#333" stroke-width="1.5"/>`;
    if (grain) body += `<polygon class="grain" points="${q.poly.map(pt).join(" ")}" fill="url(#grainPat)" stroke="none"/>`; // B7: face grain lines (along x = sheet length)
    const xs = q.poly.map((v) => v[0]), ys = q.poly.map((v) => v[1]);
    const cx = q.poly.reduce((a, v) => a + v[0], 0) / q.poly.length, cy = q.poly.reduce((a, v) => a + v[1], 0) / q.poly.length;
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys); const f = Math.max(8, Math.min(fs, bw / 7, bh / 3));
    body += `<text x="${f1(cx, 1)}" y="${f1(Y(cy) - f * 0.2, 1)}" font-size="${f1(f, 1)}" text-anchor="middle" fill="#222">${esc(q.piece.name)}</text><text x="${f1(cx, 1)}" y="${f1(Y(cy) + f, 1)}" font-size="${f1(f * 0.85, 1)}" text-anchor="middle" fill="#444">${q.piece.w} × ${q.piece.h}</text>`;
  }
  for (const k of s.cuts) {
    const [a, b] = k.line; const col = k.kind === "slope" ? "#8e44ad" : "#c0392b";
    body += `<line class="cut" x1="${f1(a[0], 1)}" y1="${f1(Y(a[1]), 1)}" x2="${f1(b[0], 1)}" y2="${f1(Y(b[1]), 1)}" stroke="${col}" stroke-width="${f1(Math.max(1.5, fs / 8), 1)}" stroke-dasharray="${k.stage === 1 ? "none" : "10 6"}"/>`;
    const m: P2 = k.stage === 1 ? [a[0] + (b[0] - a[0]) * 0.03 + (a[0] === b[0] ? 0 : fs), a[1] + (b[1] - a[1]) * 0.03 + (a[1] === b[1] ? 0 : fs)] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    body += `<circle cx="${f1(m[0], 1)}" cy="${f1(Y(m[1]), 1)}" r="${f1(fs * 0.7, 1)}" fill="${col}"/><text x="${f1(m[0], 1)}" y="${f1(Y(m[1]) + fs * 0.3, 1)}" font-size="${f1(fs * 0.8, 1)}" text-anchor="middle" fill="#fff" font-weight="700">${k.n}</text>`;
  }
  const head = `<text x="0" y="${f1(-top + f1s * 1.2, 1)}" font-size="${f1(f1s, 1)}" fill="#111" font-weight="600">${esc(title)}</text><text x="0" y="${f1(-top + f1s * 1.4 + f2s * 1.3, 1)}" font-size="${f1(f2s, 1)}" fill="#444">${sub}</text>`;
  return `<svg class="bdSheet" xmlns="http://www.w3.org/2000/svg" width="${Math.round(vbW * pxPerMm)}" height="${Math.round(vbH * pxPerMm)}" viewBox="${-pad} ${-top} ${vbW} ${vbH}" font-family="sans-serif" style="background:#fff;width:100%;max-width:${Math.max(700, Math.round(vbW * pxPerMm))}px;height:auto">${head}${body}</svg>`;
}

function bind(ctx: BoardsCtx, c: Computed) {
  const rerender = () => { saveSt(); renderBoards(ctx); };
  $("#bdSource")?.addEventListener("change", (e) => { st.src = (e.target as HTMLSelectElement).value; st.thick = undefined; st.chosen = undefined; rerender(); });
  $("#bdThick")?.addEventListener("change", (e) => { st.thick = Number((e.target as HTMLSelectElement).value); st.chosen = undefined; rerender(); });
  $("#bdSupplier").addEventListener("change", (e) => { st.supplier = (e.target as HTMLSelectElement).value; st.chosen = undefined; rerender(); });
  $("#bdCat")?.addEventListener("change", (e) => { st.cat = (e.target as HTMLSelectElement).value; st.chosen = undefined; rerender(); });
  $("#bdPair").addEventListener("change", (e) => { st.pair = (e.target as HTMLInputElement).checked; rerender(); });
  $("#bdMat")?.addEventListener("change", (e) => { const m = (e.target as HTMLSelectElement).value as MaterialId; st.chosen = undefined; st.cat = "all"; ctx.setMaterial?.(m, c.src.grain !== false); rerender(); });
  $("#bdGrain")?.addEventListener("change", (e) => { ctx.setMaterial?.(c.mat.id, (e.target as HTMLInputElement).checked); st.chosen = undefined; rerender(); });
  $("#bdCutting").querySelectorAll<HTMLInputElement>("input[data-key]").forEach((inp) => inp.addEventListener("change", () => {
    const v = Math.max(0, Number(readInput(inp)) || 0); if (inp.dataset.key === "kerf") st.kerf = v; else st.trim = v; rerender();
  }));
  document.querySelectorAll<HTMLElement>("#bdBest [data-show]").forEach((b) => b.addEventListener("click", () => { st.chosen = b.dataset.show; saveSt(); draw(ctx, c); markRows(); }));
  bindRows(ctx, c);
  $("#bdSvg").onclick = () => { const svg = currentSvg(); if (!svg) return; const name = `${ctx.projectName()}_boards.svg`; download(name, svg, "image/svg+xml"); ctx.saveExport(name, svg); };
  $("#bdPrint").onclick = () => printLayout(ctx, c);
}
function bindRows(ctx: BoardsCtx, c: Computed) {
  document.querySelectorAll<HTMLElement>("#bdTable tr[data-pick]").forEach((tr) => tr.addEventListener("click", (e) => { if ((e.target as HTMLElement).tagName === "A") return; st.chosen = tr.dataset.pick; saveSt(); draw(ctx, c); markRows(); }));
  document.querySelectorAll<HTMLElement>("#bdTable th[data-sort]").forEach((th) => { th.onclick = () => { const k = th.dataset.sort!; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = 1; } saveSt(); $("#bdList").innerHTML = listHtml(c); bindRows(ctx, c); }; });
}
const markRows = () => document.querySelectorAll<HTMLElement>("#bdTable tr[data-pick]").forEach((tr) => tr.classList.toggle("sel", tr.dataset.pick === st.chosen));
/** All drawn sheets as one SVG file (stacked). */
function currentSvg(): string | undefined {
  const svgs = [...document.querySelectorAll<SVGSVGElement>("#bdDraw svg.bdSheet")]; if (!svgs.length) return undefined;
  if (svgs.length === 1) return svgs[0].outerHTML;
  let y = 0; const parts: string[] = []; let w = 0;
  for (const s of svgs) { const W = Number(s.getAttribute("width")), H = Number(s.getAttribute("height")); parts.push(s.outerHTML.replace("<svg ", `<svg x="0" y="${y}" `)); y += H + 20; w = Math.max(w, W); }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${y}" viewBox="0 0 ${w} ${y}">${parts.join("")}</svg>`;
}
/** A clean print page: the drawn sheet(s), the panel list and the cut order; everything else is hidden while printing. */
function printLayout(ctx: BoardsCtx, c: Computed) {
  const ch = chosenPlan(c); if (!ch) return;
  let el = document.getElementById("boardsPrint"); if (!el) { el = document.createElement("div"); el.id = "boardsPrint"; document.body.appendChild(el); }
  const info = ch.sheets.map((s, j) => s ? `<li>Sheet ${j + 1}: ${esc(s.supplier)} ${esc(s.product)} ${s.lengthMm} × ${s.widthMm} × ${s.thicknessMm} mm, ${typeof s.priceAud === "number" ? `${money(s.priceAud)} (price read ${esc(s.priceDate ?? "")}, check the current price: ${esc(s.url ?? "")})` : "no price (generic size)"}</li>` : "").join("");
  el.innerHTML = `<h1>${esc(ctx.projectTitle())}: board layout</h1><p>${esc(c.mat.label)} · ${esc(ch.title)} · kerf ${c.kerf} mm · edge trim ${c.trim} mm${c.grain ? " · grain lock on (long sides along the sheet length)" : ""}</p><ul>${info}</ul>
    ${$("#bdDraw").innerHTML}
    <h2>Panels (${c.panels.length}, ${c.t} mm)</h2><table><tr><th>Panel</th><th>Size (mm)</th><th>Shape</th></tr>${c.panels.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.w} × ${p.h}</td><td>${p.trap ? `trapezoid: bottom ${p.trap.bottom}, top ${p.trap.top}` : p.poly ? "outline as drawn" : "rectangle"}</td></tr>`).join("")}</table>
    ${cutsHtml(ch.plan, c)}`;
  document.body.classList.add("printBoards");
  const done = () => { document.body.classList.remove("printBoards"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 1000);
}
/** Read-only hook for the headless dry run: what the Boards tab computed and drew. */
(window as any).__abBoards = () => {
  const c = last; if (!c) return undefined; const ch = chosenPlan(c);
  return {
    material: c.mat.id, grain: c.grain, tolOff: c.tolOff, weightKg: panelsWeight(c.panels, c.mat.id).kg, noCat: c.noCat ?? null,
    source: c.src.key, t: c.t, sheetT: c.sheetT, kerf: c.kerf, trim: c.trim, panels: c.panels.map((p) => ({ id: p.id, name: p.name, w: p.w, h: p.h, trap: p.trap })),
    best: c.best ? { supplier: c.best.row.s.supplier, L: c.best.row.s.lengthMm, W: c.best.row.s.widthMm, price: c.best.row.s.priceAud, pct: c.best.row.pct, product: c.best.row.s.product } : undefined,
    cheapest: c.buys[0] ? { group: c.buys[0].group, cost: c.buys[0].cost, sheets: c.buys[0].sheets.map((s) => [s.L, s.W, s.price]) } : undefined,
    rows: c.rows.length, suppliers: [...new Set(c.rows.map((r) => r.s.supplier))],
    drawn: ch ? ch.plan.sheets.map((s, j) => ({ L: s.L, W: s.W, thick: ch.sheets[j]?.thicknessMm, category: ch.sheets[j]?.category, placed: s.placed.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, ids: p.parts.map((q) => q.piece.id) })), cuts: s.cuts.length, errors: checkLayout(s), grainErrors: grainErrors(s), pct: s.pct })) : [],
    sheetCategories: [...new Set(c.sheets.map((x) => x.s.category))], sheetThicknesses: [...new Set(c.sheets.map((x) => x.s.thicknessMm))],
    unplaced: ch ? ch.plan.unplaced.map((p) => p.id) : [],
  };
};
