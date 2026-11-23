// BOM spreadsheet and CSV (B5_BOM, R42, 2026-11-23). The "linkable" spreadsheet: one .xlsx with the sheets BOM, Parts, Cables,
// Items, Diagram and Info. On the BOM sheet: line total = qty x unit price (formula), group subtotals and the grand total are
// SUM formulas, blank prices stay blank (the totals say "n of m lines priced"), and the unit price, supplier, date and link of
// every line that is a part are formulas that read the Parts sheet, so a price changed on the Parts sheet updates the BOM.
// A price overridden in the app is written as a value (the line says so). CSV = the BOM sheet's values. Writer: io/xlsx.ts.
import type { Bom, BomLine, BomPart } from "../engine/bom";
import type { ProjectDoc } from "../ui/projectv2";
import { roleOf } from "../engine/sysmodel";
import { partSpecs } from "../engine/bom";
import type { Cell, CellValue, Sheet } from "./xlsx";
import { cellRef, colName, fstr, xlsxBytes } from "./xlsx";

export interface BomSourceNote { name: string; licence?: string; attribution?: string; url?: string }
export interface BomExportInfo {
  appVersion: string;
  /** Data sources used (driver libraries, parts bundles, board catalogue) with licence and attribution text. */
  sources?: BomSourceNote[];
  /** File name of the wiring diagram saved with the project (exports/system.svg). */
  diagramFile?: string;
  /** Lookups for the Items sheet (part specs). */
  part?: (id: string, cat?: string) => any;
}

export const BOM_COLS = ["Group", "Item", "Brand", "Model", "Part ID", "Qty", "Unit", "Unit price AUD", "Line total AUD", "Supplier", "Price date", "Price link", "From project item(s)", "How the quantity was worked out", "Notes", "Spec source"] as const;
const C = { group: 0, item: 1, brand: 2, model: 3, part: 4, qty: 5, unit: 6, price: 7, total: 8, supplier: 9, date: 10, link: 11, from: 12, derived: 13, notes: 14, source: 15 };
const PARTS_COLS = ["Part ID", "Category", "Brand", "Model / name", "Key specs", "Lowest price AUD", "Price unit", "Supplier", "Price date", "Price URL", "Other prices (AUD, lowest first)", "Spec source", "BOM lines"];
const P = { id: 0, cat: 1, brand: 2, model: 3, specs: 4, price: 5, unit: 6, supplier: 7, date: 8, url: 9, other: 10, source: 11, lines: 12 };
const PARTS_FIRST = 3; // 0-based row of the first part on the Parts sheet

const abs = (r: number, c: number) => `$${colName(c)}$${r + 1}`;
const pref = (r: number, c: number) => `Parts!${abs(r, c)}`;
const money = (x?: number) => (x === undefined ? "" : x.toFixed(2));

/** Rows of the BOM sheet (cells with formulas and cached values) and the matching CSV rows (values). */
export function bomSheetRows(bom: Bom): { rows: (Cell | CellValue)[][]; csv: CellValue[][]; partRow: Map<string, number>; headerRow: number } {
  const partRow = new Map<string, number>(); bom.parts.forEach((p, i) => partRow.set(p.key, PARTS_FIRST + i));
  const rows: (Cell | CellValue)[][] = []; const csv: CellValue[][] = [];
  const push = (r: (Cell | CellValue)[], c?: CellValue[]) => { rows.push(r); if (c) csv.push(c); };
  push([{ v: `Bill of materials: ${bom.title}`, s: "title" }]);
  push([{ v: `Made ${bom.date} by Audio_Builder from project "${bom.title}" (${bom.project}). Prices AUD inc. GST as listed on the date shown; not live: check before buying. Cable: + ${bom.sparePct} % spare, rounded up.`, s: "note" }]);
  push([]);
  const headerRow = rows.length;
  push(BOM_COLS.map((h) => ({ v: h, s: "head" as const })), [...BOM_COLS]);
  const subtotalCells: string[] = []; const ranges: [number, number][] = [];
  let priced = 0, count = 0, total = 0;
  for (const g of bom.groups) {
    push([{ v: g.label, s: "group" }], [g.label]);
    const a = rows.length;
    for (const l of g.lines) { const { cells, values } = lineRow(l, rows.length, partRow); push(cells, values); }
    const b = rows.length - 1; ranges.push([a, b]);
    const rng = (c: number) => `${cellRef(a, c)}:${cellRef(b, c)}`;
    const cnt = `${g.priced} of ${g.count} lines priced`;
    subtotalCells.push(cellRef(rows.length, C.total));
    const st: (Cell | CellValue)[] = []; st[C.item] = { v: `Subtotal: ${g.label}`, s: "bold" }; st[C.total] = { f: `SUM(${rng(C.total)})`, v: g.subtotal, s: "moneyBold" };
    st[C.derived] = { f: `COUNT(${rng(C.total)})&" of "&COUNTA(${rng(C.item)})&" lines priced"`, v: cnt, s: "bold" };
    const sc: CellValue[] = []; sc[C.item] = `Subtotal: ${g.label}`; sc[C.total] = money(g.subtotal); sc[C.derived] = cnt;
    push(st, sc); push([], []);
    priced += g.priced; count += g.count; total += g.subtotal;
  }
  const gt: (Cell | CellValue)[] = []; const gc: CellValue[] = [];
  const cntTxt = `${priced} of ${count} lines priced`;
  gt[C.item] = { v: "Grand total (all groups)", s: "bold" }; gc[C.item] = "Grand total (all groups)";
  gt[C.total] = { f: subtotalCells.length ? `SUM(${subtotalCells.join(",")})` : "0", v: Math.round(total * 100) / 100, s: "moneyBold" }; gc[C.total] = money(Math.round(total * 100) / 100);
  gt[C.derived] = { f: ranges.length ? `(${ranges.map(([a, b]) => `COUNT(${cellRef(a, C.total)}:${cellRef(b, C.total)})`).join("+")})&" of "&(${ranges.map(([a, b]) => `COUNTA(${cellRef(a, C.item)}:${cellRef(b, C.item)})`).join("+")})&" lines priced"` : fstr(cntTxt), v: cntTxt, s: "bold" }; gc[C.derived] = cntTxt;
  push(gt, gc);
  if (bom.missing.length) {
    push([], []); push([{ v: "Missing / to decide (not in the totals)", s: "group" }], ["Missing / to decide (not in the totals)"]);
    for (const m of bom.missing) {
      const r: (Cell | CellValue)[] = []; const c: CellValue[] = [];
      r[C.group] = c[C.group] = "Missing / to decide"; r[C.item] = { v: m.item, s: "wrap" }; c[C.item] = m.item; r[C.from] = c[C.from] = m.fromNames.join(", "); r[C.notes] = { v: m.notes, s: "wrap" }; c[C.notes] = m.notes;
      push(r, c);
    }
  }
  push([]); for (const n of bom.notes) push([{ v: n, s: "note" }]);
  return { rows, csv, partRow, headerRow };
}

function lineRow(l: BomLine, r: number, partRow: Map<string, number>): { cells: (Cell | CellValue)[]; values: CellValue[] } {
  const cells: (Cell | CellValue)[] = []; const v: CellValue[] = [];
  const pr = l.partId ? partRow.get(`${l.category ?? ""}:${l.partId}`) : undefined;
  const set = (c: number, cell: Cell | CellValue, val: CellValue) => { cells[c] = cell; v[c] = val; };
  set(C.group, l.group === "missing" ? "Missing / to decide" : groupName(l), groupName(l));
  set(C.item, { v: l.item, s: "wrap" }, l.item);
  set(C.brand, l.brand ?? "", l.brand ?? ""); set(C.model, l.model ?? "", l.model ?? ""); set(C.part, l.partId ?? "", l.partId ?? "");
  set(C.qty, l.qty === undefined ? "" : { v: l.qty, s: Number.isInteger(l.qty) ? "int" : "dec" }, l.qty ?? "");
  set(C.unit, l.unit, l.unit);
  const qref = cellRef(r, C.qty), pref0 = cellRef(r, C.price);
  if (pr !== undefined && !l.overridden?.price) {
    set(C.price, { f: `IF(${pref(pr, P.price)}="","",${pref(pr, P.price)})`, v: l.unitPrice ?? "", s: "money" }, money(l.unitPrice));
    set(C.supplier, { f: `IF(${pref(pr, P.supplier)}="","",${pref(pr, P.supplier)})`, v: l.supplier ?? "" }, l.supplier ?? "");
    set(C.date, { f: `IF(${pref(pr, P.date)}="","",${pref(pr, P.date)})`, v: l.priceDate ?? "" }, l.priceDate ?? "");
    set(C.link, { f: `IF(${pref(pr, P.url)}="","",HYPERLINK(${pref(pr, P.url)},"open"))`, v: l.priceUrl ? "open" : "", s: "link" }, l.priceUrl ?? "");
  } else {
    set(C.price, l.unitPrice === undefined ? "" : { v: l.unitPrice, s: "money" }, money(l.unitPrice));
    set(C.supplier, l.overridden?.price ? "your price" : l.supplier ?? "", l.overridden?.price ? "your price" : l.supplier ?? "");
    set(C.date, l.overridden?.price ? "" : l.priceDate ?? "", l.overridden?.price ? "" : l.priceDate ?? "");
    set(C.link, l.priceUrl && !l.overridden?.price ? { f: `HYPERLINK(${fstr(l.priceUrl)},"open")`, v: "open", s: "link" } : "", l.priceUrl && !l.overridden?.price ? l.priceUrl : "");
  }
  set(C.total, { f: `IF(OR(${qref}="",${pref0}=""),"",${qref}*${pref0})`, v: l.total ?? "", s: "money" }, money(l.total));
  set(C.from, { v: l.fromNames.join(", "), s: "wrap" }, l.fromNames.join(", "));
  set(C.derived, { v: l.derived ?? "", s: "wrap" }, l.derived ?? "");
  const notes = [l.notes, l.overridden?.qty ? `Quantity entered by you (the BOM worked out ${l.calcQty ?? "none"}).` : "", l.overridden?.price ? `Price entered by you (lowest known: ${l.calcPrice === undefined ? "none" : "$" + l.calcPrice.toFixed(2)}).` : ""].filter(Boolean).join(" ");
  set(C.notes, { v: notes, s: "wrap" }, notes);
  set(C.source, l.source ? { f: `HYPERLINK(${fstr(l.source)},${fstr(shortUrl(l.source))})`, v: shortUrl(l.source), s: "link" } : "", l.source ?? "");
  return { cells, values: v };
}
const groupName = (l: BomLine) => ({ speakers: "Speakers and drivers", enclosure: "Enclosures and materials", amplifiers: "Amplifiers", dsp: "DSP and head unit", power: "Power", cable: "Cable", connectors: "Connectors and terminals", other: "Other items", missing: "Missing / to decide" } as Record<string, string>)[l.group] ?? l.group;
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").slice(0, 60);

function partsRows(bom: Bom): (Cell | CellValue)[][] {
  const rows: (Cell | CellValue)[][] = [
    [{ v: "Parts (one row per distinct part, driver or sheet size)", s: "title" }],
    [{ v: "The BOM sheet reads the price, supplier, date and link of each part from this sheet: change a price here (column F) and the BOM updates.", s: "note" }],
    PARTS_COLS.map((h) => ({ v: h, s: "head" as const })),
  ];
  for (const p of bom.parts) rows.push(partRow(p));
  return rows;
}
function partRow(p: BomPart): (Cell | CellValue)[] {
  const r: (Cell | CellValue)[] = [];
  const lo = p.prices[0];
  r[P.id] = p.id; r[P.cat] = p.category; r[P.brand] = p.brand ?? ""; r[P.model] = { v: p.model ? p.model : p.name, s: "wrap" }; r[P.specs] = { v: p.specs ?? "", s: "wrap" };
  r[P.price] = lo ? { v: lo.priceAud, s: "money" } : ""; r[P.unit] = p.priceUnit; r[P.supplier] = lo?.supplier ?? ""; r[P.date] = lo?.date ?? ""; r[P.url] = lo?.url ?? "";
  r[P.other] = { v: p.prices.slice(1).map((x) => `${x.supplier} $${x.priceAud.toFixed(2)}${x.date ? ` (${x.date})` : ""}${x.note ? `, ${x.note}` : ""}${x.url ? ` ${x.url}` : ""}`).join("; "), s: "wrap" };
  r[P.source] = p.source ? { f: `HYPERLINK(${fstr(p.source)},${fstr(shortUrl(p.source))})`, v: shortUrl(p.source), s: "link" } : "";
  r[P.lines] = p.lineKeys.length;
  return r;
}

function cablesRows(bom: Bom): (Cell | CellValue)[][] {
  const rows: (Cell | CellValue)[][] = [[{ v: "Cables (cable calculator, docs/cable_engine.md)", s: "title" }]];
  const res = bom.cable;
  if (!res) { rows.push(["The cable calculator could not run for this project (no electrical items, or an item it cannot read)."]); return rows; }
  rows.push([{ v: `Supply ${res.options.supplyV} V; drop limit ${res.allowedV.toFixed(3)} V; conductor ${res.options.tempC} C; default material ${res.options.material}. Total maximum current ${res.totalMaxA.toFixed(1)} A, music average ${res.totalMusicA.toFixed(1)} A.`, s: "note" }]);
  rows.push([]);
  rows.push([{ v: "Power runs", s: "group" }]);
  rows.push(["Run", "Level (0 = from the battery)", "Ends at", "Length m", "Ground m", "Max current A", "Music current A", "Fuse A", "Fuse recommended A", "Cable chosen", "Chosen cable OK", "Recommended copper AWG", "Recommended CCA AWG", "Recommended copper mm2 (ISO)", "Drop V", "Drop %", "Total drop % (with upstream)", "Warnings"].map((h) => ({ v: h, s: "head" as const })));
  for (const r of res.runs) rows.push([r.name ?? r.id, r.depth, r.endsAt, r.lengthM, r.groundLengthM, round(r.maxA, 1), round(r.musicA, 1), r.fuseA ?? "", r.fuseRecommendedA ?? "", r.chosen ? `${r.chosen.size ?? r.chosen.areaMm2 + " mm2"} ${r.chosen.material}` : "", r.chosen ? (r.chosen.ok ? "yes" : "no") : "", r.recommended.awg.copper?.size ?? "", r.recommended.awg.cca?.size ?? "", r.recommended.metric.copper?.size ?? "", r.used ? round(r.used.dropV, 3) : "", r.used ? round(r.used.dropPct, 2) : "", r.used ? round(r.used.totalDropPct, 2) : "", { v: r.warnings.map((w) => `${w.level}: ${w.text}`).join(" | "), s: "wrap" }]);
  if (res.speakers.length) {
    rows.push([]); rows.push([{ v: "Speaker cable", s: "group" }]);
    rows.push(["Speaker run", "Load ohm", "Length m", "Material", "Chosen size", "Chosen % of load", "Recommended AWG (5 % rule)", "Current A", "Warnings"].map((h) => ({ v: h, s: "head" as const })));
    for (const s of res.speakers) rows.push([s.name ?? s.id, s.loadOhm ?? "", s.lengthM, s.material, s.chosen?.size ?? "", s.chosen ? round(s.chosen.pctOfZ, 2) : "", s.recommendedAwg ?? "", s.currentA !== undefined ? round(s.currentA, 1) : "", { v: s.warnings.map((w) => `${w.level}: ${w.text}`).join(" | "), s: "wrap" }]);
  }
  if (res.capacitors.length) {
    rows.push([]); rows.push([{ v: "Capacitors", s: "group" }]);
    rows.push(["Capacitor", "Farads", "Energy J", "Usable J (14.4 to 12.6 V)", "Hold-up ms at full draw", "Precharge time s (5 tau)"].map((h) => ({ v: h, s: "head" as const })));
    for (const c of res.capacitors) rows.push([c.name ?? c.id, c.farads ?? "", c.energyJ !== undefined ? round(c.energyJ, 1) : "", c.usableJ !== undefined ? round(c.usableJ, 1) : "", c.holdupMs !== undefined ? round(c.holdupMs, 1) : "", c.fullChargeS !== undefined ? round(c.fullChargeS, 1) : ""]);
  }
  if (res.big3?.runs.length) {
    rows.push([]); rows.push([{ v: "Big 3 upgrade", s: "group" }]);
    rows.push(["Wire", "Length m", "Size AWG"].map((h) => ({ v: h, s: "head" as const })));
    for (const b of res.big3.runs) rows.push([b.name, b.lengthM, b.size ?? b.awg?.size ?? ""]);
  }
  if (res.alternator) { rows.push([]); rows.push([`Alternator: rating ${res.alternator.ratingA ?? "not entered"} A, spare ${res.alternator.spareA !== undefined ? round(res.alternator.spareA, 0) + " A" : "unknown"}.`]); }
  return rows;
}
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

function itemsRows(doc: ProjectDoc, bom: Bom, info: BomExportInfo): (Cell | CellValue)[][] {
  const rows: (Cell | CellValue)[][] = [[{ v: `Items of the project "${doc.title}" and their links`, s: "title" }], ["ID", "Name", "Kind", "Section", "Part ID", "Values", "Links out (kind: to, ports, cable)", "BOM lines"].map((h) => ({ v: h, s: "head" as const }))];
  const name = (id: string) => doc.items.find((i) => i.id === id)?.name ?? id;
  const allLines = [...bom.groups.flatMap((g) => g.lines), ...bom.missing];
  for (const it of doc.items) {
    const p = it.data?.partId && info.part ? info.part(it.data.partId, it.data.partCategory) : undefined;
    const d = it.data ?? {};
    const values = p ? partSpecs(p) : it.kind === "box" ? [d.driverId ? `driver ${d.driverId} x ${d.drivers ?? 1}` : "", d.kind ?? "", d.geom ? `${d.geom.W} x ${d.geom.H} x ${d.geom.D} mm, ${d.geom.t} mm board` : ""].filter(Boolean).join(", ") : roleOf(it) === "speaker" ? [d.driverId ? `driver ${d.driverId}` : "", d.count ? `x ${d.count}` : ""].filter(Boolean).join(" ") : Object.entries(d).filter(([k, v]) => !["partId", "partCategory"].includes(k) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")).map(([k, v]) => `${k} ${v}`).join(", ");
    const links = (it.links ?? []).map((l) => `${l.kind}: ${name(l.to)}${l.fromPort || l.toPort ? ` (${[l.fromPort, l.toPort].filter(Boolean).join(" -> ")})` : ""}${l.cableItemId ? ` via ${name(l.cableItemId)}` : ""}`).join("; ");
    const used = allLines.filter((l) => l.from.includes(it.id)).map((l) => l.item);
    rows.push([it.id, it.name, it.kind, it.section, d.partId ?? "", { v: values, s: "wrap" }, { v: links, s: "wrap" }, { v: used.join("; "), s: "wrap" }]);
  }
  return rows;
}

/** The .xlsx workbook of a BOM (bytes). */
export function bomWorkbook(doc: ProjectDoc, bom: Bom, info: BomExportInfo): Uint8Array {
  const { rows } = bomSheetRows(bom);
  const diagram = info.diagramFile ?? `data/projects/${doc.name}/exports/system.svg`;
  const sheets: Sheet[] = [
    { name: "BOM", rows, cols: [16, 44, 14, 18, 22, 7, 10, 13, 14, 26, 11, 8, 30, 50, 50, 30], freezeRows: 4 },
    { name: "Parts", rows: partsRows(bom), cols: [26, 14, 14, 36, 44, 14, 14, 30, 11, 50, 60, 30, 8], freezeRows: 3 },
    { name: "Cables", rows: cablesRows(bom), cols: [34, 10, 10, 10, 10, 12, 12, 10, 12, 16, 10, 12, 12, 14, 10, 10, 12, 60] },
    { name: "Items", rows: itemsRows(doc, bom, info), cols: [18, 30, 12, 12, 24, 50, 60, 50], freezeRows: 2 },
    { name: "Diagram", rows: [
      [{ v: "Wiring diagram", s: "title" }],
      [{ v: `The system wiring diagram (SVG) is drawn on every save of the project and kept as ${diagram}. Open it in a web browser or Inkscape, or use Download SVG / Print on the System tab.`, s: "wrap" }],
      [`File: ${diagram.split("/").pop()}`],
      [{ v: "It shows the battery and fuses, the power chain, amplifiers, speakers, the head unit / DSP (signal and remote) and the grounds, with the cable sizes and lengths. Every link drawn is listed on the Items sheet.", s: "wrap" }],
    ], cols: [120] },
    { name: "Info", rows: infoRows(doc, bom, info), cols: [28, 110] },
  ];
  return xlsxBytes(sheets, { title: `Bill of materials: ${bom.title}`, creator: "Audio_Builder", created: `${bom.date}T00:00:00Z`, description: "Bill of materials made by Audio_Builder" });
}
function infoRows(doc: ProjectDoc, bom: Bom, info: BomExportInfo): (Cell | CellValue)[][] {
  const rows: (Cell | CellValue)[][] = [[{ v: "About this file", s: "title" }],
    ["Project", `${bom.title} (data/projects/${doc.name}.json)`], ["Made", bom.date], ["App", `Audio_Builder ${info.appVersion} (GPL-3.0-or-later)`],
    ["Cable spare", `${bom.sparePct} %`], ["Lines", `${bom.count} (${bom.priced} priced), ${bom.missing.length} missing / to decide`],
    ["Check before buying", { v: "Prices are the lowest AUD prices known to the app (inc. GST as listed), read from each supplier's site on the date shown; they are not live. Quantities of derived lines (cable, lugs, fuses, enclosure materials) follow the rules written on each line. Check every part, size and price before buying.", s: "wrap" }],
    [], [{ v: "Data sources and licences", s: "group" }]];
  for (const s of info.sources ?? []) rows.push([s.name, { v: [s.licence, s.attribution, s.url].filter(Boolean).join(". "), s: "wrap" }]);
  rows.push([]); for (const n of bom.notes) rows.push(["Note", { v: n, s: "wrap" }]);
  return rows;
}

/** CSV (RFC 4180, UTF-8 with BOM so Excel reads the characters right) of the BOM sheet's values, from the header row down. */
export function bomCsv(bom: Bom): string {
  const { csv } = bomSheetRows(bom);
  const q = (v: CellValue) => { const s = v === undefined || v === null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const width = BOM_COLS.length;
  return "﻿" + csv.map((r) => Array.from({ length: width }, (_, i) => q(r[i])).join(",")).join("\r\n") + "\r\n";
}
