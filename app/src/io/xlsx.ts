// Minimal .xlsx writer (B5_BOM, R42, 2026-11-23): no dependency. An .xlsx file is a ZIP of XML parts (ECMA-376 / ISO/IEC 29500
// SpreadsheetML): [Content_Types].xml, _rels/.rels, xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/styles.xml, docProps,
// one xl/worksheets/sheetN.xml per sheet. Strings are written inline (t="inlineStr"), so no shared-string table is needed.
// Formulas are written with their value worked out here (the cached value) and the workbook asks the spreadsheet to
// recalculate everything when it opens (calcPr fullCalcOnLoad), so LibreOffice Calc and Excel show the live results.
// The ZIP uses the STORE method (no compression; valid ZIP, every reader supports it) with CRC-32.

export type CellValue = string | number | boolean | null | undefined;
/** Styles (index into cellXfs of styles.xml). */
export type CellStyle = "text" | "bold" | "money" | "moneyBold" | "head" | "int" | "dec" | "title" | "wrap" | "link" | "note" | "group";
export interface Cell {
  /** Value, or the cached result of the formula. */
  v?: CellValue;
  /** Formula without the leading "=" (e.g. `SUM(I5:I9)`, `Parts!$F$3`). */
  f?: string;
  s?: CellStyle;
}
export interface Sheet {
  /** Sheet name (max 31 characters, none of []:*?/\). */
  name: string;
  rows: (Cell | CellValue)[][];
  /** Column widths in characters. */
  cols?: number[];
  /** Rows frozen at the top (header). */
  freezeRows?: number;
}
export interface WorkbookMeta { title?: string; creator?: string; created?: Date | string; description?: string }

const STYLE_INDEX: Record<CellStyle, number> = { text: 0, bold: 1, money: 2, moneyBold: 3, head: 4, int: 5, dec: 6, title: 7, wrap: 8, link: 9, note: 10, group: 11 };

/** Column letters of a 0-based column index (0 = A, 26 = AA). */
export function colName(c: number): string {
  let s = ""; let n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
/** A1 reference of a 0-based row and column. */
export const cellRef = (r: number, c: number) => `${colName(c)}${r + 1}`;
/** Formula string literal ("" doubled inside). */
export const fstr = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // characters not allowed in XML 1.0 (control characters other than tab, LF, CR)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
const isCell = (x: unknown): x is Cell => typeof x === "object" && x !== null;

function cellXml(ref: string, raw: Cell | CellValue): string {
  const c: Cell = isCell(raw) ? raw : { v: raw };
  const s = c.s ? ` s="${STYLE_INDEX[c.s]}"` : "";
  const v = c.v;
  if (c.f) {
    const f = `<f>${xmlEsc(c.f)}</f>`;
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${s}>${f}<v>${v}</v></c>`;
    if (typeof v === "boolean") return `<c r="${ref}"${s} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${s} t="str">${f}<v>${xmlEsc(String(v ?? ""))}</v></c>`;
  }
  if (v === undefined || v === null || v === "") return c.s ? `<c r="${ref}"${s}/>` : "";
  if (typeof v === "number") return isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  const str = String(v);
  const sp = /^\s|\s$|\n/.test(str) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t${sp}>${xmlEsc(str)}</t></is></c>`;
}

function sheetXml(sh: Sheet): string {
  const rows = sh.rows.map((row, r) => {
    const cells = row.map((x, c) => cellXml(cellRef(r, c), x)).join("");
    return cells ? `<row r="${r + 1}">${cells}</row>` : "";
  }).join("");
  const maxC = Math.max(1, ...sh.rows.map((r) => r.length));
  const dim = `A1:${cellRef(Math.max(0, sh.rows.length - 1), maxC - 1)}`;
  const fr = sh.freezeRows && sh.freezeRows > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freezeRows}" topLeftCell="A${sh.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRows + 1}" sqref="A${sh.freezeRows + 1}"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const cols = sh.cols?.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dim}"/>${fr}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData><pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** The .xlsx file of the sheets (bytes). */
export function xlsxBytes(sheets: Sheet[], meta: WorkbookMeta = {}): Uint8Array {
  const names = new Set<string>();
  for (const s of sheets) {
    if (!s.name || s.name.length > 31 || /[[\]:*?/\\]/.test(s.name)) throw new Error(`bad sheet name: ${s.name}`);
    if (names.has(s.name.toLowerCase())) throw new Error(`duplicate sheet name: ${s.name}`);
    names.add(s.name.toLowerCase());
  }
  const created = meta.created ? new Date(meta.created) : new Date();
  const iso = created.toISOString().replace(/\.\d{3}Z$/, "Z");
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(meta.title ?? "")}</dc:title><dc:creator>${xmlEsc(meta.creator ?? "Audio_Builder")}</dc:creator><dc:description>${xmlEsc(meta.description ?? "")}</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Audio_Builder</Application></Properties>`;
  const enc = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", data: enc.encode(ct) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "docProps/core.xml", data: enc.encode(core) },
    { name: "docProps/app.xml", data: enc.encode(app) },
    { name: "xl/workbook.xml", data: enc.encode(wb) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    { name: "xl/styles.xml", data: enc.encode(STYLES) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
  ];
  return zipStore(files, created);
}

// ------------------------------------------------------------------------------------------------------------ zip (STORE)
let CRC_TABLE: Uint32Array | undefined;
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** A ZIP archive of the files, stored (method 0), UTF-8 names, DOS time from `date`. */
export function zipStore(files: { name: string; data: Uint8Array }[], date: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31);
  const dosDate = (((Math.max(1980, date.getFullYear()) - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data); const size = f.data.length;
    const lh = new Uint8Array(30 + name.length); const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true); dv.setUint32(14, crc, true); dv.setUint32(18, size, true); dv.setUint32(22, size, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length); const dc = new DataView(ch.buffer);
    dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true); dc.setUint16(8, 0x0800, true); dc.setUint16(10, 0, true);
    dc.setUint16(12, dosTime, true); dc.setUint16(14, dosDate, true); dc.setUint32(16, crc, true); dc.setUint32(20, size, true); dc.setUint32(24, size, true);
    dc.setUint16(28, name.length, true); dc.setUint16(30, 0, true); dc.setUint16(32, 0, true); dc.setUint16(34, 0, true); dc.setUint16(36, 0, true); dc.setUint32(38, 0, true); dc.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, f.data); centrals.push(ch); offset += lh.length + size;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22); const de = new DataView(end.buffer);
  de.setUint32(0, 0x06054b50, true); de.setUint16(8, files.length, true); de.setUint16(10, files.length, true); de.setUint32(12, cdSize, true); de.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22); let p = 0;
  for (const a of [...locals, ...centrals, end]) { out.set(a, p); p += a.length; }
  return out;
}
