// CSV / TSV spreadsheet import with header → parameter mapping and unit detection.
// XLSX: save the sheet as CSV first (v0.1); native XLSX import is planned for v0.2.
import { Driver, DriverParams } from "../engine/driver";
import { slug } from "./wdr";

export function parseCsv(text: string): string[][] {
  const sep = detectSep(text);
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
function detectSep(t: string): string {
  const first = t.split(/\r?\n/)[0] ?? "";
  const counts = [",", ";", "\t"].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

/** Parameter key → [SI multiplier for each recognised unit]. Default unit is the first. */
const FIELDS: Record<string, { names: RegExp; units: [RegExp, number][] }> = {
  brand: { names: /^(brand|manufacturer|make|vendor)$/i, units: [] },
  model: { names: /^(model|name|part|driver)$/i, units: [] },
  fs: { names: /^f\s*s\b|^fs$|resonan/i, units: [[/hz|/i, 1]] },
  Re: { names: /^r\s*e\b|^re$|^rdc|dc resist/i, units: [[/ohm|Ω|/i, 1]] },
  Qms: { names: /^q\s*ms$/i, units: [[/./, 1]] },
  Qes: { names: /^q\s*es$/i, units: [[/./, 1]] },
  Qts: { names: /^q\s*ts$/i, units: [[/./, 1]] },
  Vas: { names: /^v\s*as\b/i, units: [[/\bm(3|³)/i, 1], [/cu\.?\s*ft|ft(3|³)/i, 0.0283168], [/l|lit|/i, 0.001]] },
  Sd: { names: /^s\s*d\b/i, units: [[/\bm(2|²)/i, 1], [/in(2|²)|sq\.?\s*in/i, 0.00064516], [/cm|/i, 1e-4]] },
  Xmax: { names: /^x\s*max\b/i, units: [[/\bm\b/i, 1], [/in/i, 0.0254], [/mm|/i, 0.001]] },
  Le: { names: /^l\s*e\b|^le$/i, units: [[/\bh\b/i, 1], [/mh|/i, 0.001]] },
  Pe: { names: /^p\s*e\b|rms power|power.*rms|^power/i, units: [[/w|/i, 1]] },
  Mms: { names: /^m\s*ms\b/i, units: [[/kg/i, 1], [/g|/i, 0.001]] },
  Cms: { names: /^c\s*ms\b/i, units: [[/m\/n/i, 1], [/µm|um/i, 1e-6], [/mm|/i, 0.001]] },
  Rms: { names: /^r\s*ms\b/i, units: [[/./, 1]] },
  Bl: { names: /^bl\b|^b·l|^b\*l/i, units: [[/./, 1]] },
  Znom: { names: /^z\s*nom|^nominal imp|^impedance$|^z$/i, units: [[/./, 1]] },
  sens1W: { names: /^spl|sensitiv/i, units: [[/./, 1]] },
};

export interface CsvMapping { col: number; key: string; mult: number; header: string }
export function mapHeaders(header: string[]): CsvMapping[] {
  const out: CsvMapping[] = [];
  header.forEach((h, col) => {
    const m = h.match(/^\s*([^(\[]*?)\s*(?:[(\[]\s*([^)\]]*)\s*[)\]])?\s*$/);
    const name = (m?.[1] ?? h).trim(), unit = (m?.[2] ?? "").trim();
    for (const [key, f] of Object.entries(FIELDS)) {
      if (f.names.test(name) && !out.some((o) => o.key === key)) {
        let mult = 1;
        for (const [re, k] of f.units) if (re.test(unit)) { mult = k; break; }
        out.push({ col, key, mult, header: h });
        break;
      }
    }
  });
  return out;
}

export function rowsToDrivers(rows: string[][], sourceName: string): { drivers: Driver[]; mapping: CsvMapping[]; skipped: number } {
  const [header, ...body] = rows;
  const mapping = mapHeaders(header);
  const drivers: Driver[] = []; let skipped = 0;
  body.forEach((r, i) => {
    const p: any = {}; let brand = "", model = "";
    for (const m of mapping) {
      const raw = (r[m.col] ?? "").trim();
      if (m.key === "brand") brand = raw; else if (m.key === "model") model = raw;
      else { const v = parseFloat(raw.replace(",", ".")); if (isFinite(v)) p[m.key] = v * m.mult; }
    }
    if (!(p.fs > 0 && p.Re > 0 && p.Sd > 0 && (p.Vas > 0 || p.Cms > 0) && (p.Qes > 0 || p.Qts > 0))) { skipped++; return; }
    if (!(p.Qms > 0)) p.Qms = p.Qts && p.Qes ? (p.Qts * p.Qes) / (p.Qes - p.Qts) : 0;
    if (!(p.Qes > 0)) p.Qes = 0;
    model ||= `row ${i + 2}`;
    drivers.push({ id: slug(`${brand}-${model}`), brand: brand || "Unknown", model, params: p as DriverParams,
      sources: [{ param: "*", source: sourceName, where: `row ${i + 2}` }], private: true });
  });
  return { drivers, mapping, skipped };
}
