// BOM tab (B5_BOM, R42, 2026-11-23): the bill of materials of the open project (or single item), grouped, with totals,
// quantity and price overrides per line (saved in the project as doc.bomOverrides), the cable spare % (doc.bomSparePct),
// "Download spreadsheet (.xlsx)" (BOM, Parts, Cables, Items, Diagram, Info sheets; prices on the BOM linked to the Parts sheet),
// "Download CSV", and a copy of both saved with the project as exports/bom.xlsx and exports/bom.csv (existing exports route).
// Engine: engine/bom.ts; files: io/bomexport.ts; method: docs/bom.md.
import type { ProjectDoc } from "./projectv2";
import { bomForProject, DEFAULT_SPARE_PCT, groupLabel, setBomOverride } from "../engine/bom";
import type { Bom, BomLine, BomLookups } from "../engine/bom";
import { bomCsv, bomWorkbook } from "../io/bomexport";
import type { BomSourceNote } from "../io/bomexport";
import { $, esc, download } from "./dom";

export interface BomCtx {
  doc: () => ProjectDoc;
  /** Items opened in memory only (not saved): left out. */
  skip: () => Set<string>;
  lookups: () => BomLookups;
  /** Load what the BOM needs that may not be loaded yet (board catalogue, cable products); resolves when ready. */
  prepare: () => Promise<void>;
  /** Autosave the project (after an override or the spare % changed). */
  save: () => void;
  status: (msg: string, cls?: string) => void;
  /** "project" or "item" (a single item from My items). */
  mode: () => "project" | "item";
  /** Where exports/bom.xlsx goes (data/projects/<name>/exports/), undefined = download only. */
  exportName: () => string | undefined;
  putExport: (name: string, body: Uint8Array | string, type: string) => Promise<string>;
  appVersion: string;
  sources: (bom: Bom) => BomSourceNote[];
  openSystem?: () => void;
}

const money = (v?: number) => (v === undefined ? "–" : "$" + v.toFixed(2));
const today = () => new Date().toISOString().slice(0, 10);
const view = (doc: ProjectDoc, skip: Set<string>): ProjectDoc => (skip.size ? { ...doc, items: doc.items.filter((i) => !skip.has(i.id)) } : doc);
const link = (u?: string, t = "open") => (u && /^https?:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : "");

/** The BOM the tab shows (for the dry runs too). */
export function currentBom(ctx: BomCtx): Bom { return bomForProject(view(ctx.doc(), ctx.skip()), ctx.lookups(), { date: today() }); }

export async function renderBom(root: HTMLElement, ctx: BomCtx) {
  root.innerHTML = `<p class="muted">Working out the bill of materials…</p>`;
  try { await ctx.prepare(); } catch { /* shown below as missing prices / sheets */ }
  if (!root.isConnected) return;
  draw(root, ctx);
}

function draw(root: HTMLElement, ctx: BomCtx) {
  const doc = ctx.doc(); const b = currentBom(ctx);
  const spare = doc.bomSparePct ?? DEFAULT_SPARE_PCT;
  const nOv = Object.keys(doc.bomOverrides ?? {}).length;
  const exp = ctx.exportName();
  root.innerHTML = `<div class="bomPage" style="max-width:1400px">
    <fieldset id="bomHead"><legend>Bill of materials: ${esc(doc.title)}</legend>
      <div class="toolbar"><button class="primary" id="bomXlsx" title="BOM, Parts, Cables, Items, Diagram and Info sheets; prices on the BOM sheet are linked to the Parts sheet">Download spreadsheet (.xlsx)</button>
        <button id="bomCsv">Download CSV</button>
        <label for="bomSpare" class="hint">Spare on cable</label><input id="bomSpare" type="number" min="0" max="100" step="1" value="${spare}" style="width:5em"><span class="hint">%</span>
        ${nOv ? `<button id="bomReset" title="Remove every quantity and price you entered">Clear my ${nOv} change${nOv === 1 ? "" : "s"}</button>` : ""}
        ${ctx.openSystem ? `<button id="bomSys">System tab</button>` : ""}</div>
      <div class="hint">Everything the ${ctx.mode() === "item" ? "item" : "project"} needs, from its items and links (System tab): parts as chosen, cable in metres per gauge (+ spare), lugs and ferrules per wire end, fuses per holder or fused output, board sheets (MDF or plywood, the material chosen on the Boards tab) by the Boards tab method, and enclosure materials by the rules on each line. Prices: the lowest AUD price known (inc. GST as listed), with the supplier and the date it was read; not live, <b>check before buying</b>. Type a quantity or price to override a line (kept with the project). ${exp ? `Downloads are also saved as <code>data/projects/${esc(exp)}/exports/bom.xlsx</code> and <code>bom.csv</code>.` : "Save the item to My items to keep a copy of the files with it."} Help: BOM.</div>
      <div id="bomTotals" class="bomTotals"><b>Total ${money(b.total)}</b> <span class="hint">(${b.priced} of ${b.count} lines priced${b.missing.length ? `; ${b.missing.length} missing / to decide, not in the total` : ""})</span></div></fieldset>
    <table id="bomTable" class="bomTable"><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit price AUD</th><th class="num">Line total</th><th>Supplier, date</th><th>From</th><th>How worked out, notes</th></tr>
    ${b.groups.map((g) => `<tr class="bomGroup" data-group="${g.id}"><th colspan="8">${esc(g.label)}</th></tr>${g.lines.map(rowHtml).join("")}
      <tr class="bomSub" data-sub="${g.id}"><td><b>Subtotal</b></td><td></td><td></td><td></td><td class="num"><b>${money(g.subtotal)}</b></td><td colspan="3" class="hint">${g.priced} of ${g.count} lines priced</td></tr>`).join("")}
    <tr class="bomGrand"><td><b>Grand total</b></td><td></td><td></td><td></td><td class="num"><b id="bomGrand">${money(b.total)}</b></td><td colspan="3" class="hint">${b.priced} of ${b.count} lines priced</td></tr>
    </table>
    ${b.missing.length ? `<fieldset id="bomMissing"><legend>${esc(groupLabel("missing"))}</legend><ul class="steps">${b.missing.map((m) => `<li data-key="${esc(m.key)}">${esc(m.item)} <span class="hint">${esc(m.notes)}</span></li>`).join("")}</ul></fieldset>` : ""}
    <ul class="hint" id="bomNotes">${b.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`;
  bind(root, ctx, b);
}

function rowHtml(l: BomLine): string {
  const ovq = l.overridden?.qty, ovp = l.overridden?.price;
  const more = l.prices.length > 1 ? `<details><summary class="hint">${l.prices.length} prices</summary>${l.prices.map((p) => `<div class="hint">${esc(p.supplier)} $${p.priceAud.toFixed(2)}${p.date ? ` (${esc(p.date)})` : ""}${p.note ? `, ${esc(p.note)}` : ""} ${link(p.url)}</div>`).join("")}</details>` : "";
  const name = `${esc(l.item)}${l.partId ? `<div class="hint">${esc(l.partId)}${l.specs ? ` · ${esc(l.specs)}` : ""} ${link(l.source, "specs")}</div>` : l.specs ? `<div class="hint">${esc(l.specs)}</div>` : ""}`;
  return `<tr data-key="${esc(l.key)}" class="${ovq || ovp ? "bomOv" : ""}"><td>${name}</td>
    <td class="num"><input class="bomQty" type="number" min="0" step="any" value="${ovq ? l.qty : ""}" placeholder="${l.calcQty ?? "?"}" title="${ovq ? `You entered ${l.qty}; the BOM worked out ${l.calcQty ?? "none"}. Empty = the worked-out quantity.` : "Type a quantity to override"}" style="width:5.5em"></td>
    <td>${esc(l.unit)}</td>
    <td class="num"><input class="bomPrice" type="number" min="0" step="0.01" value="${ovp ? l.unitPrice : ""}" placeholder="${l.calcPrice !== undefined ? l.calcPrice.toFixed(2) : "no price"}" title="${ovp ? `You entered $${l.unitPrice?.toFixed(2)}; lowest known ${l.calcPrice !== undefined ? "$" + l.calcPrice.toFixed(2) : "none"}.` : "Type a price to override"}" style="width:7em"></td>
    <td class="num bomTotal">${money(l.total)}</td>
    <td>${ovp ? "your price" : l.supplier ? `${esc(l.supplier)}${l.priceDate ? `, ${esc(l.priceDate)}` : ""} ${link(l.priceUrl)}` : '<span class="muted">no price known</span>'}${more}</td>
    <td class="hint">${esc(l.fromNames.join(", "))}</td>
    <td class="hint">${esc(l.derived ?? "")}${l.derived && l.notes ? " " : ""}${esc(l.notes)}${ovq || ovp ? ` <button class="link bomUndo" title="Back to the worked-out quantity and the lowest known price">reset</button>` : ""}</td></tr>`;
}

function bind(root: HTMLElement, ctx: BomCtx, b: Bom) {
  const doc = ctx.doc();
  const changed = (msg: string) => { ctx.save(); draw(root, ctx); ctx.status(msg, "ok"); };
  root.querySelectorAll<HTMLTableRowElement>("#bomTable tr[data-key]").forEach((tr) => {
    const key = tr.dataset.key!;
    const val = (sel: string) => { const s = tr.querySelector<HTMLInputElement>(sel)!.value.trim(); if (!s) return undefined; const v = parseFloat(s); return isFinite(v) && v >= 0 ? v : undefined; };
    tr.querySelector<HTMLInputElement>(".bomQty")!.onchange = () => { setBomOverride(doc, key, { qty: val(".bomQty") }); changed("Quantity saved with the project"); };
    tr.querySelector<HTMLInputElement>(".bomPrice")!.onchange = () => { setBomOverride(doc, key, { priceAud: val(".bomPrice") }); changed("Price saved with the project"); };
    const u = tr.querySelector<HTMLButtonElement>(".bomUndo"); if (u) u.onclick = () => { setBomOverride(doc, key, { qty: undefined, priceAud: undefined }); changed("Line back to the worked-out values"); };
  });
  $("#bomSpare").onchange = () => {
    const v = parseFloat($<HTMLInputElement>("#bomSpare").value);
    if (isFinite(v) && v >= 0 && v <= 100) { if (v === DEFAULT_SPARE_PCT) delete doc.bomSparePct; else doc.bomSparePct = v; changed(`Cable spare ${v} % saved with the project`); }
    else ctx.status("Spare: 0 to 100 %", "bad");
  };
  const r = $("#bomReset"); if (r) r.onclick = () => { if (!confirm("Remove every quantity and price you entered on this BOM?")) return; delete doc.bomOverrides; changed("Your BOM changes were cleared"); };
  const s = $("#bomSys"); if (s && ctx.openSystem) s.onclick = () => ctx.openSystem!();
  const base = `${doc.name}_bom`;
  $("#bomXlsx").onclick = () => void (async () => {
    const bom = currentBom(ctx);
    const exp = ctx.exportName();
    const bytes = bomWorkbook(view(doc, ctx.skip()), bom, { appVersion: ctx.appVersion, sources: ctx.sources(bom), diagramFile: exp ? `data/projects/${exp}/exports/system.svg` : undefined, part: ctx.lookups().part });
    download(`${base}.xlsx`, new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) as any, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (exp) { try { const p1 = await ctx.putExport("bom.xlsx", bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); await ctx.putExport("bom.csv", bomCsv(bom), "text/csv"); ctx.status(`Downloaded; saved to ${p1} (and bom.csv)`, "ok"); } catch (e) { ctx.status("Downloaded; saving with the project failed: " + (e as Error).message, "bad"); } }
    else ctx.status("Downloaded", "ok");
  })();
  $("#bomCsv").onclick = () => void (async () => {
    const csv = bomCsv(currentBom(ctx));
    download(`${base}.csv`, csv, "text/csv");
    const exp = ctx.exportName();
    if (exp) { try { const p = await ctx.putExport("bom.csv", csv, "text/csv"); ctx.status(`Downloaded; saved to ${p}`, "ok"); } catch (e) { ctx.status("Downloaded; saving with the project failed: " + (e as Error).message, "bad"); } }
  })();
  void b;
}
