// 3D mesh files: read .stl (ASCII + binary), .obj, .ply (ASCII + binary little/big endian); write .stl (binary/ASCII), .obj; DXF (R12) for cut sheets.
import { Mesh, Tri, V3, weld } from "../engine/mesh";

const td = new TextDecoder();
/** Detect the format from the file name (and STL content) and parse. Units are whatever the file uses (scale later). */
export function parseMeshFile(name: string, buf: ArrayBuffer): Mesh {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "stl") return parseSTL(buf);
  if (ext === "obj") return parseOBJ(td.decode(buf));
  if (ext === "ply") return parsePLY(buf);
  throw new Error(`Unsupported file type .${ext}: use .stl, .obj or .ply`);
}

export function parseSTL(buf: ArrayBuffer): Mesh {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  // binary if the size matches 84 + 50·n (ASCII files can start with "solid" too, so check the size first)
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + 50 * n === buf.byteLength) {
      const v: V3[] = []; const t: Tri[] = [];
      for (let i = 0; i < n; i++) {
        const o = 84 + 50 * i + 12;
        for (let k = 0; k < 3; k++) v.push([dv.getFloat32(o + 12 * k, true), dv.getFloat32(o + 12 * k + 4, true), dv.getFloat32(o + 12 * k + 8, true)]);
        t.push([3 * i, 3 * i + 1, 3 * i + 2]);
      }
      return weldSoup({ v, t });
    }
  }
  const text = td.decode(u8);
  if (!/^\s*solid/i.test(text)) throw new Error("Not a valid STL file (neither binary nor ASCII)");
  const v: V3[] = []; const t: Tri[] = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) v.push([+m[1], +m[2], +m[3]]);
  if (v.length % 3) throw new Error("ASCII STL: vertex count is not a multiple of 3");
  for (let i = 0; i < v.length; i += 3) t.push([i, i + 1, i + 2]);
  return weldSoup({ v, t });
}
/** STL stores every triangle separately: merge shared corners (tolerance relative to the model size). */
function weldSoup(m: Mesh): Mesh {
  let s = 0; for (const p of m.v) s = Math.max(s, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  return weld(m, Math.max(1e-9, s * 1e-6));
}

export function parseOBJ(text: string): Mesh {
  const v: V3[] = []; const t: Tri[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === "#") continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "v") v.push([+parts[1], +parts[2], +parts[3]]);
    else if (parts[0] === "f") {
      const idx = parts.slice(1).map((p) => { const i = parseInt(p.split("/")[0], 10); return i < 0 ? v.length + i : i - 1; });
      for (let k = 1; k + 1 < idx.length; k++) t.push([idx[0], idx[k], idx[k + 1]]);
    }
  }
  if (!t.length) throw new Error("OBJ file has no faces");
  return weld({ v, t }, 1e-12);
}

export function parsePLY(buf: ArrayBuffer): Mesh {
  const u8 = new Uint8Array(buf);
  const headEnd = findHeaderEnd(u8); if (headEnd < 0) throw new Error("PLY: no end_header");
  const header = td.decode(u8.subarray(0, headEnd)).split(/\r?\n/);
  const fmt = (header.find((l) => l.startsWith("format")) ?? "").split(/\s+/)[1];
  type Prop = { name: string; type: string; list?: [string, string] };
  const elems: { name: string; count: number; props: Prop[] }[] = [];
  for (const l of header) {
    const p = l.trim().split(/\s+/);
    if (p[0] === "element") elems.push({ name: p[1], count: +p[2], props: [] });
    else if (p[0] === "property" && elems.length) elems[elems.length - 1].props.push(p[1] === "list" ? { name: p[4], type: "list", list: [p[2], p[3]] } : { name: p[2], type: p[1] });
  }
  const v: V3[] = []; const t: Tri[] = [];
  const addFace = (idx: number[]) => { for (let k = 1; k + 1 < idx.length; k++) t.push([idx[0], idx[k], idx[k + 1]]); };
  if (fmt === "ascii") {
    const lines = td.decode(u8.subarray(headEnd)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean); let li = 0;
    for (const e of elems) for (let i = 0; i < e.count; i++) {
      const nums = lines[li++].split(/\s+/).map(Number); let o = 0; const rec: Record<string, number | number[]> = {};
      for (const p of e.props) { if (p.list) { const n = nums[o++]; rec[p.name] = nums.slice(o, o + n); o += n; } else rec[p.name] = nums[o++]; }
      if (e.name === "vertex") v.push([rec.x as number, rec.y as number, rec.z as number]);
      else if (e.name === "face") addFace((rec.vertex_indices ?? rec.vertex_index) as number[]);
    }
  } else {
    const le = fmt === "binary_little_endian"; if (!le && fmt !== "binary_big_endian") throw new Error("PLY: unknown format " + fmt);
    const dv = new DataView(buf); let o = headEnd;
    const SZ: Record<string, number> = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
    const rd = (ty: string) => {
      let r: number;
      switch (ty) {
        case "char": case "int8": r = dv.getInt8(o); break; case "uchar": case "uint8": r = dv.getUint8(o); break;
        case "short": case "int16": r = dv.getInt16(o, le); break; case "ushort": case "uint16": r = dv.getUint16(o, le); break;
        case "int": case "int32": r = dv.getInt32(o, le); break; case "uint": case "uint32": r = dv.getUint32(o, le); break;
        case "float": case "float32": r = dv.getFloat32(o, le); break; case "double": case "float64": r = dv.getFloat64(o, le); break;
        default: throw new Error("PLY: unknown type " + ty);
      }
      o += SZ[ty]; return r;
    };
    for (const e of elems) for (let i = 0; i < e.count; i++) {
      const rec: Record<string, number | number[]> = {};
      for (const p of e.props) { if (p.list) { const n = rd(p.list[0]); const a: number[] = []; for (let k = 0; k < n; k++) a.push(rd(p.list[1])); rec[p.name] = a; } else rec[p.name] = rd(p.type); }
      if (e.name === "vertex") v.push([rec.x as number, rec.y as number, rec.z as number]);
      else if (e.name === "face") addFace((rec.vertex_indices ?? rec.vertex_index) as number[]);
    }
  }
  if (!t.length) throw new Error("PLY file has no faces (a point cloud): mesh it first, e.g. in the scanning app or MeshLab");
  return weld({ v, t }, 1e-12);
}
function findHeaderEnd(u8: Uint8Array): number {
  const key = "end_header";
  for (let i = 0; i < Math.min(u8.length, 65536); i++) {
    let ok = true; for (let k = 0; k < key.length; k++) if (u8[i + k] !== key.charCodeAt(k)) { ok = false; break; }
    if (ok) { let j = i + key.length; if (u8[j] === 13) j++; if (u8[j] === 10) j++; return j; }
  }
  return -1;
}

// ---------- writers ----------
export function writeSTLBinary(m: Mesh, name = "audio_builder"): ArrayBuffer {
  const buf = new ArrayBuffer(84 + 50 * m.t.length); const dv = new DataView(buf);
  const head = new TextEncoder().encode(name.slice(0, 79)); new Uint8Array(buf).set(head, 0);
  dv.setUint32(80, m.t.length, true);
  m.t.forEach(([a, b, c], i) => {
    const o = 84 + 50 * i; const A = m.v[a], B = m.v[b], C = m.v[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1;
    for (let k = 0; k < 3; k++) dv.setFloat32(o + 4 * k, n[k] / l, true);
    [A, B, C].forEach((P, j) => { for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + 12 * j + 4 * k, P[k], true); });
  });
  return buf;
}
export function writeSTLAscii(m: Mesh, name = "audio_builder"): string {
  const out = [`solid ${name}`];
  for (const [a, b, c] of m.t) { out.push(" facet normal 0 0 0", "  outer loop"); for (const i of [a, b, c]) out.push(`   vertex ${m.v[i][0]} ${m.v[i][1]} ${m.v[i][2]}`); out.push("  endloop", " endfacet"); }
  out.push(`endsolid ${name}`); return out.join("\n") + "\n";
}
export function writeOBJ(m: Mesh): string { return m.v.map((p) => `v ${p[0]} ${p[1]} ${p[2]}`).join("\n") + "\n" + m.t.map(([a, b, c]) => `f ${a + 1} ${b + 1} ${c + 1}`).join("\n") + "\n"; }
export function writePLYAscii(m: Mesh): string {
  return `ply\nformat ascii 1.0\nelement vertex ${m.v.length}\nproperty float x\nproperty float y\nproperty float z\nelement face ${m.t.length}\nproperty list uchar int vertex_indices\nend_header\n` +
    m.v.map((p) => p.join(" ")).join("\n") + "\n" + m.t.map((t) => "3 " + t.join(" ")).join("\n") + "\n";
}

// ---------- DXF (AutoCAD R12 ASCII, units mm) ----------
export interface DxfShape { kind: "poly"; pts: [number, number][]; layer: string } // closed polyline
export interface DxfCircle { kind: "circle"; c: [number, number]; r: number; layer: string }
export interface DxfText { kind: "text"; at: [number, number]; h: number; text: string; layer: string }
export type DxfEntity = DxfShape | DxfCircle | DxfText;
/** Minimal R12 DXF that LibreCAD, QCAD, Fusion 360, Inkscape and CNC CAM programs read. $INSUNITS 4 = millimetres. */
export function writeDXF(ents: DxfEntity[]): string {
  const L: string[] = [];
  const g = (code: number, val: string | number) => { L.push(String(code)); L.push(typeof val === "number" ? fmtN(val) : val); };
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$INSUNITS"); g(70, 4); g(0, "ENDSEC");
  const layers = [...new Set(ents.map((e) => e.layer))];
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length);
  layers.forEach((l, i) => { g(0, "LAYER"); g(2, l); g(70, 0); g(62, (i % 6) + 1); g(6, "CONTINUOUS"); });
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const e of ents) {
    if (e.kind === "poly") {
      g(0, "POLYLINE"); g(8, e.layer); g(66, 1); g(70, 1); g(10, 0); g(20, 0); g(30, 0);
      for (const [x, y] of e.pts) { g(0, "VERTEX"); g(8, e.layer); g(10, x); g(20, y); g(30, 0); }
      g(0, "SEQEND"); g(8, e.layer);
    } else if (e.kind === "circle") { g(0, "CIRCLE"); g(8, e.layer); g(10, e.c[0]); g(20, e.c[1]); g(30, 0); g(40, e.r); }
    else { g(0, "TEXT"); g(8, e.layer); g(10, e.at[0]); g(20, e.at[1]); g(30, 0); g(40, e.h); g(1, e.text.replace(/[\r\n]+/g, " ")); }
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return L.join("\n") + "\n";
}
const fmtN = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(4));
/** Read back the closed polylines of a DXF written by writeDXF (tests and the dry run). */
export function readDXFPolys(text: string): [number, number][][] {
  const L = text.split(/\r?\n/); const out: [number, number][][] = []; let cur: [number, number][] | null = null; let inVertex = false; let x = 0;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const code = L[i].trim(), val = L[i + 1].trim();
    if (code === "0") { if (val === "POLYLINE") cur = []; else if (val === "SEQEND" && cur) { out.push(cur); cur = null; } inVertex = val === "VERTEX"; }
    else if (inVertex && cur && code === "10") x = +val;
    else if (inVertex && cur && code === "20") cur.push([x, +val]);
  }
  return out;
}
