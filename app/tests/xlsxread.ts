// Test helper (B5_BOM): reads back an .xlsx written by src/io/xlsx.ts (no LibreOffice in the container) and evaluates its
// formulas with a small evaluator for the functions the BOM uses (SUM, COUNT, COUNTA, IF, OR, HYPERLINK, & + - * / = <> < >).
// Not a general spreadsheet engine: an unknown function or syntax throws, so the test fails instead of passing silently.
import { inflateRawSync } from "node:zlib";

export interface RCell { v?: string; t?: string; f?: string; s?: string }
export interface Workbook { files: Map<string, Uint8Array>; sheets: Map<string, Map<string, RCell>>; order: string[] }

/** Entries of a ZIP (stored or deflated), read from the central directory. */
export function unzip(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip: no end of central directory");
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>(); const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad central directory entry");
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    if (dv.getUint32(off, true) !== 0x04034b50) throw new Error("bad local header " + name);
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true);
    const data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    const raw = method === 0 ? data : method === 8 ? new Uint8Array(inflateRawSync(data)) : (() => { throw new Error("method " + method); })();
    if (raw.length !== size) throw new Error("size mismatch " + name);
    out.set(name, raw); p += 46 + nl + xl + cl;
  }
  return out;
}
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function readXlsx(buf: Uint8Array): Workbook {
  const files = unzip(buf); const dec = new TextDecoder();
  const txt = (n: string) => { const f = files.get(n); if (!f) throw new Error("missing part " + n); return dec.decode(f); };
  const wb = txt("xl/workbook.xml"), rels = txt("xl/_rels/workbook.xml.rels");
  const relMap = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = new Map<string, Map<string, RCell>>(); const order: string[] = [];
  for (const m of wb.matchAll(/<sheet name="([^"]+)" sheetId="\d+" r:id="([^"]+)"\/>/g)) {
    const name = unesc(m[1]); const xml = txt("xl/" + relMap.get(m[2])!);
    const cells = new Map<string, RCell>();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2], body = c[3] ?? "";
      const t = /t="([^"]+)"/.exec(attrs)?.[1], s = /s="([^"]+)"/.exec(attrs)?.[1];
      const f = /<f>([\s\S]*?)<\/f>/.exec(body)?.[1];
      const v = t === "inlineStr" ? /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] : /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      cells.set(c[1], { t, s, f: f !== undefined ? unesc(f) : undefined, v: v !== undefined ? unesc(v) : undefined });
    }
    sheets.set(name, cells); order.push(name);
  }
  return { files, sheets, order };
}

// ------------------------------------------------------------------------------------------------ evaluator
export type Val = number | string | boolean | null; // null = empty cell
type Tok = { k: "num" | "str" | "ref" | "fn" | "op" | "(" | ")" | ","; s: string };
function lex(f: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (ch === " ") { i++; continue; }
    if (ch === '"') { let s = ""; i++; for (;;) { if (i >= f.length) throw new Error("unterminated string"); if (f[i] === '"') { if (f[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; } s += f[i++]; } out.push({ k: "str", s }); continue; }
    if (/[0-9.]/.test(ch)) { const m = /^[0-9.]+(E[+-]?\d+)?/i.exec(f.slice(i))!; out.push({ k: "num", s: m[0] }); i += m[0].length; continue; }
    const ref = /^(?:([A-Za-z_][A-Za-z0-9_]*)!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?/.exec(f.slice(i));
    const fn = /^([A-Z][A-Z0-9.]*)\(/.exec(f.slice(i));
    if (fn && !(ref && ref[0].length > fn[1].length)) { out.push({ k: "fn", s: fn[1] }); i += fn[1].length; continue; }
    if (ref) { out.push({ k: "ref", s: ref[0] }); i += ref[0].length; continue; }
    const op = /^(<=|>=|<>|[-+*/&=<>])/.exec(f.slice(i));
    if (op) { out.push({ k: "op", s: op[0] }); i += op[0].length; continue; }
    if (ch === "(" || ch === ")" || ch === ",") { out.push({ k: ch as any, s: ch }); i++; continue; }
    throw new Error(`cannot read formula at "${f.slice(i)}"`);
  }
  return out;
}
const colNum = (s: string) => s.split("").reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
const colStr = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export class Evaluator {
  private memo = new Map<string, Val>(); private busy = new Set<string>();
  constructor(public wb: Workbook) {}
  /** Value of a cell (formulas evaluated; cached values ignored). */
  value(sheet: string, ref: string): Val {
    const key = `${sheet}!${ref}`; if (this.memo.has(key)) return this.memo.get(key)!;
    if (this.busy.has(key)) throw new Error("circular " + key);
    const c = this.wb.sheets.get(sheet)?.get(ref);
    let v: Val = null;
    if (c?.f !== undefined) { this.busy.add(key); v = this.formula(sheet, c.f); this.busy.delete(key); }
    else if (c?.v !== undefined) v = c.t === "inlineStr" || c.t === "str" ? c.v : c.t === "b" ? c.v === "1" : Number(c.v);
    this.memo.set(key, v); return v;
  }
  formula(sheet: string, f: string): Val {
    const toks = lex(f); let p = 0;
    const peek = () => toks[p]; const next = () => toks[p++];
    const expect = (k: string) => { const t = next(); if (!t || t.k !== k) throw new Error(`expected ${k} in ${f}`); return t; };
    const num = (v: Val | Val[]): number => { if (Array.isArray(v)) throw new Error("range in arithmetic"); if (v === null) return 0; if (typeof v === "number") return v; if (typeof v === "boolean") return v ? 1 : 0; const n = Number(v); if (v === "" || !isFinite(n)) throw new Error(`#VALUE! (${JSON.stringify(v)}) in ${f}`); return n; };
    const str = (v: Val | Val[]): string => { if (Array.isArray(v)) throw new Error("range as text"); return v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v); };
    const one = (v: Val | Val[]): Val => { if (Array.isArray(v)) throw new Error("range as value in " + f); return v; };
    const refVals = (s: string): Val | Val[] => {
      const m = /^(?:([A-Za-z_][A-Za-z0-9_]*)!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(s)!;
      const sh = m[1] ?? sheet; if (!this.wb.sheets.has(sh)) throw new Error("#REF! sheet " + sh);
      if (!m[4]) return this.value(sh, `${m[2]}${m[3]}`);
      const out: Val[] = [];
      for (let r = +m[3]; r <= +m[5]; r++) for (let c = colNum(m[2]); c <= colNum(m[4]); c++) out.push(this.value(sh, `${colStr(c)}${r}`));
      return out;
    };
    const flat = (args: (Val | Val[])[]) => args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    const call = (name: string, args: (Val | Val[])[]): Val => {
      switch (name) {
        case "SUM": return flat(args).reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
        case "COUNT": return flat(args).filter((v) => typeof v === "number").length;
        case "COUNTA": return flat(args).filter((v) => v !== null).length;
        case "IF": { const c = one(args[0]); const t = typeof c === "boolean" ? c : num(c) !== 0; return t ? one(args[1] ?? true) : args.length > 2 ? one(args[2]) : false; }
        case "OR": return flat(args).some((v) => (typeof v === "boolean" ? v : num(v) !== 0));
        case "HYPERLINK": return args.length > 1 ? one(args[1]) : str(one(args[0]));
      }
      throw new Error("unknown function " + name);
    };
    const primary = (): Val | Val[] => {
      const t = next(); if (!t) throw new Error("unexpected end in " + f);
      if (t.k === "num") return Number(t.s);
      if (t.k === "str") return t.s;
      if (t.k === "ref") return refVals(t.s);
      if (t.k === "op" && t.s === "-") return -num(primary());
      if (t.k === "op" && t.s === "+") return num(primary());
      if (t.k === "(") { const v = cmp(); expect(")"); return v; }
      if (t.k === "fn") {
        expect("("); const args: (Val | Val[])[] = [];
        if (peek()?.k !== ")") { args.push(cmp()); while (peek()?.k === ",") { next(); args.push(cmp()); } }
        expect(")"); return call(t.s, args);
      }
      throw new Error(`unexpected ${t.s} in ${f}`);
    };
    const mul = (): Val | Val[] => { let v = primary(); while (peek()?.k === "op" && (peek().s === "*" || peek().s === "/")) { const o = next().s; const b = primary(); v = o === "*" ? num(v) * num(b) : num(v) / num(b); } return v; };
    const add = (): Val | Val[] => { let v = mul(); while (peek()?.k === "op" && (peek().s === "+" || peek().s === "-")) { const o = next().s; const b = mul(); v = o === "+" ? num(v) + num(b) : num(v) - num(b); } return v; };
    const cat = (): Val | Val[] => { let v = add(); while (peek()?.k === "op" && peek().s === "&") { next(); const b = add(); v = str(v) + str(b); } return v; };
    const cmp = (): Val | Val[] => {
      let v = cat();
      while (peek()?.k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().s)) {
        const o = next().s; const a = one(v), b = one(cat());
        const an = a === null ? (typeof b === "string" ? "" : 0) : a, bn = b === null ? (typeof a === "string" ? "" : 0) : b;
        const c = typeof an === "number" && typeof bn === "number" ? an - bn : String(an).localeCompare(String(bn));
        v = o === "=" ? c === 0 : o === "<>" ? c !== 0 : o === "<" ? c < 0 : o === ">" ? c > 0 : o === "<=" ? c <= 0 : c >= 0;
      }
      return v;
    };
    const v = cmp(); if (p !== toks.length) throw new Error("trailing tokens in " + f);
    return one(v);
  }
}
