// Geometry core for free-form boxes: a closed triangle mesh (research_d §3). Units: metres.
// Every box shape (presets, side profiles, corner points, 3D scans) becomes one of these, so volume, 3D, export and checks are shared.
export type V3 = [number, number, number];
export type Tri = [number, number, number];
export interface Mesh { v: V3[]; t: Tri[] }

// ---------- vector helpers ----------
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dist3 = (a: V3, b: V3) => len3(sub3(a, b));

/** Unnormalised normal (length = 2 × triangle area). */
export function triNormal(m: Mesh, i: number): V3 { const [a, b, c] = m.t[i]; return cross3(sub3(m.v[b], m.v[a]), sub3(m.v[c], m.v[a])); }

// ---------- measures ----------
/** Enclosed volume by signed tetrahedra (divergence theorem): Σ v1·(v2×v3)/6. Exact for any closed, consistently oriented polyhedron. */
export function volume(m: Mesh): number {
  let s = 0;
  for (const [a, b, c] of m.t) s += dot3(m.v[a], cross3(m.v[b], m.v[c]));
  return s / 6;
}
export function area(m: Mesh): number { let s = 0; for (let i = 0; i < m.t.length; i++) s += len3(triNormal(m, i)) / 2; return s; }
/** Volume centroid (tetrahedra from the origin weighted by signed volume). */
export function centroid(m: Mesh): V3 {
  let V = 0; const c: V3 = [0, 0, 0];
  for (const [a, b, d] of m.t) {
    const vol = dot3(m.v[a], cross3(m.v[b], m.v[d])) / 6; V += vol;
    for (let k = 0; k < 3; k++) c[k] += vol * (m.v[a][k] + m.v[b][k] + m.v[d][k]) / 4;
  }
  return V ? [c[0] / V, c[1] / V, c[2] / V] : [0, 0, 0];
}
export function bbox(m: Mesh | V3[]): { min: V3; max: V3; size: V3 } {
  const pts = Array.isArray(m) ? m : m.v;
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

// ---------- topology ----------
const ek = (a: number, b: number) => (a < b ? a + "_" + b : b + "_" + a);
export interface Watertight { closed: boolean; boundaryEdges: number; nonManifoldEdges: number; flippedEdges: number; degenerate: number }
/** Closed = every edge used by exactly two triangles, in opposite directions. */
export function watertight(m: Mesh): Watertight {
  const dir = new Map<string, number>(); // directed edge count
  const und = new Map<string, number>();
  let degenerate = 0;
  m.t.forEach((t, i) => {
    if (len3(triNormal(m, i)) < 1e-18) degenerate++;
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      dir.set(a + ">" + b, (dir.get(a + ">" + b) ?? 0) + 1);
      und.set(ek(a, b), (und.get(ek(a, b)) ?? 0) + 1);
    }
  });
  let boundaryEdges = 0, nonManifoldEdges = 0, flippedEdges = 0;
  for (const [k, n] of und) {
    if (n === 1) boundaryEdges++; else if (n > 2) nonManifoldEdges++;
    else { const [a, b] = k.split("_"); if ((dir.get(a + ">" + b) ?? 0) !== 1) flippedEdges++; }
  }
  return { closed: boundaryEdges === 0 && nonManifoldEdges === 0 && flippedEdges === 0, boundaryEdges, nonManifoldEdges, flippedEdges, degenerate };
}
/** Make triangle winding consistent (flood fill over shared edges) and outward (positive volume). Returns a new mesh. */
export function orient(m: Mesh): Mesh {
  const t = m.t.map((x) => x.slice() as Tri);
  const edgeTris = new Map<string, number[]>();
  t.forEach((tri, i) => { for (let k = 0; k < 3; k++) { const key = ek(tri[k], tri[(k + 1) % 3]); (edgeTris.get(key) ?? edgeTris.set(key, []).get(key)!).push(i); } });
  const seen = new Uint8Array(t.length);
  const hasDir = (tri: Tri, a: number, b: number) => (tri[0] === a && tri[1] === b) || (tri[1] === a && tri[2] === b) || (tri[2] === a && tri[0] === b);
  for (let s = 0; s < t.length; s++) {
    if (seen[s]) continue;
    seen[s] = 1; const stack = [s]; const comp = [s];
    while (stack.length) {
      const i = stack.pop()!; const tri = t[i];
      for (let k = 0; k < 3; k++) {
        const a = tri[k], b = tri[(k + 1) % 3];
        for (const j of edgeTris.get(ek(a, b)) ?? []) {
          if (seen[j]) continue;
          if (hasDir(t[j], a, b)) t[j] = [t[j][0], t[j][2], t[j][1]]; // neighbour must run b→a
          seen[j] = 1; stack.push(j); comp.push(j);
        }
      }
    }
    // per connected component: outward
    const sub: Mesh = { v: m.v, t: comp.map((i) => t[i]) };
    if (volume(sub) < 0) for (const i of comp) t[i] = [t[i][0], t[i][2], t[i][1]];
  }
  return { v: m.v, t };
}
/** Merge vertices closer than tol (grid hash) and drop degenerate triangles. Use on STL triangle soup. */
export function weld(m: Mesh, tol = 1e-6): Mesh {
  const map = new Map<string, number>(); const v: V3[] = []; const remap: number[] = [];
  const key = (p: V3, dx = 0, dy = 0, dz = 0) => `${Math.round(p[0] / tol) + dx},${Math.round(p[1] / tol) + dy},${Math.round(p[2] / tol) + dz}`;
  m.v.forEach((p, i) => {
    let found: number | undefined;
    outer: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const j = map.get(key(p, dx, dy, dz)); if (j !== undefined && dist3(v[j], p) <= tol) { found = j; break outer; }
    }
    if (found === undefined) { found = v.length; v.push(p); map.set(key(p), found); }
    remap[i] = found;
  });
  const t: Tri[] = [];
  for (const [a, b, c] of m.t) { const A = remap[a], B = remap[b], C = remap[c]; if (A !== B && B !== C && A !== C) t.push([A, B, C]); }
  return { v, t };
}
export function transform(m: Mesh, f: (p: V3) => V3): Mesh { return { v: m.v.map(f), t: m.t.map((x) => x.slice() as Tri) }; }
export const scaleMesh = (m: Mesh, s: number | V3) => transform(m, (p) => (typeof s === "number" ? mul3(p, s) : [p[0] * s[0], p[1] * s[1], p[2] * s[2]]));
export const translateMesh = (m: Mesh, d: V3) => transform(m, (p) => add3(p, d));
export function merge(...ms: Mesh[]): Mesh {
  const v: V3[] = [], t: Tri[] = [];
  for (const m of ms) { const o = v.length; v.push(...m.v); for (const [a, b, c] of m.t) t.push([a + o, b + o, c + o]); }
  return { v, t };
}

// ---------- ray queries ----------
/** Ray/triangle intersection (Möller-Trumbore). Returns t ≥ 0 along dir, or -1. */
export function rayTri(o: V3, d: V3, a: V3, b: V3, c: V3): number {
  const e1 = sub3(b, a), e2 = sub3(c, a); const p = cross3(d, e2); const det = dot3(e1, p);
  if (Math.abs(det) < 1e-15) return -1;
  const inv = 1 / det; const s = sub3(o, a); const u = dot3(s, p) * inv; if (u < -1e-12 || u > 1 + 1e-12) return -1;
  const q = cross3(s, e1); const w = dot3(d, q) * inv; if (w < -1e-12 || u + w > 1 + 1e-12) return -1;
  const tt = dot3(e2, q) * inv; return tt >= 0 ? tt : -1;
}
/** All hit distances of a ray with the mesh (sorted). */
export function rayHits(m: Mesh, o: V3, d: V3): number[] {
  const out: number[] = [];
  for (const [a, b, c] of m.t) { const h = rayTri(o, d, m.v[a], m.v[b], m.v[c]); if (h >= 0) out.push(h); }
  out.sort((x, y) => x - y);
  // a ray through a shared edge or vertex hits several triangles at the same distance: count that crossing once
  return out.filter((x, i) => i === 0 || x - out[i - 1] > 1e-9);
}
/** First wall hit in direction d (unit) from o, or Infinity. */
export function rayFirst(m: Mesh, o: V3, d: V3, minT = 1e-9): number { const h = rayHits(m, o, d).find((x) => x > minT); return h ?? Infinity; }
const RAYS: V3[] = [norm3([0.5773, 0.5774, 0.5775]), norm3([-0.31, 0.83, 0.47]), norm3([0.71, -0.13, -0.69])];
/** Point-in-solid by ray parity, majority vote over three skew directions (robust to hits on edges). */
export function inside(m: Mesh, p: V3): boolean {
  let votes = 0;
  for (const d of RAYS) {
    const h = rayHits(m, p, d); let n = 0; let last = -1;
    for (const x of h) { if (x - last > 1e-12) n++; last = x; }
    if (n % 2 === 1) votes++;
  }
  return votes >= 2;
}

// ---------- longest inside chord (standing waves) ----------
/** Longest straight line between two surface points that stays inside the solid. For a convex shape this is the diameter.
 * Large meshes are sub-sampled to at most maxPts candidate vertices (result is then a lower bound, stated in the UI). */
export function longestChord(m: Mesh, maxPts = 300): { length: number; a: V3; b: V3; sampled: boolean } {
  let idx = m.v.map((_, i) => i);
  const sampled = idx.length > maxPts;
  if (sampled) { const step = idx.length / maxPts; idx = Array.from({ length: maxPts }, (_, i) => Math.floor(i * step)); }
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) pairs.push([dist3(m.v[idx[i]], m.v[idx[j]]), idx[i], idx[j]]);
  pairs.sort((x, y) => y[0] - x[0]);
  for (const [L, i, j] of pairs.slice(0, 5000)) {
    const a = m.v[i], b = m.v[j]; const d = norm3(sub3(b, a));
    // no wall crossing strictly between the ends, and the middle is inside
    const hits = rayHits(m, a, d).filter((h) => h > L * 1e-6 && h < L * (1 - 1e-6));
    if (hits.length === 0 && inside(m, mul3(add3(a, b), 0.5))) return { length: L, a, b, sampled };
  }
  const bb = bbox(m); return { length: Math.max(...bb.size), a: bb.min, b: bb.max, sampled: true };
}

// ---------- inward offset (wall / shell thickness) ----------
/** Move every vertex inward so that each face plane moves in by its thickness (exact for flat-faced solids where three planes meet
 * at a vertex; least-squares elsewhere, e.g. smooth scans). thick(faceIndex) gives the wall thickness of that triangle's panel.
 * Returns the inner mesh (same topology) and whether any face flipped (wall too thick for the shape). */
export function offsetInward(m: Mesh, thick: number | ((tri: number) => number)): { mesh: Mesh; flipped: number } {
  const th = typeof thick === "number" ? () => thick : thick;
  const nrm = m.t.map((_, i) => norm3(triNormal(m, i)));
  const planes: { n: V3; t: number }[][] = m.v.map(() => []);
  m.t.forEach((tri, i) => {
    const n = nrm[i]; const t = th(i);
    for (const vi of tri) {
      const list = planes[vi];
      if (!list.some((p) => dot3(p.n, n) > 1 - 1e-9 && Math.abs(p.t - t) < 1e-12)) list.push({ n, t });
    }
  });
  const v: V3[] = m.v.map((p, vi) => {
    const list = planes[vi]; if (!list.length) return p;
    // (Σ n nᵀ + λI) d = Σ n (−t)
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; const b = [0, 0, 0]; const lam = 1e-9;
    for (const { n, t } of list) { for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) A[r][c] += n[r] * n[c]; b[r] -= n[r] * t; } }
    for (let r = 0; r < 3; r++) A[r][r] += lam;
    const d = solve3(A, b);
    // guard: smooth surfaces with nearly parallel planes can give huge moves; cap at 3× the largest thickness
    const maxT = Math.max(...list.map((x) => x.t)); const L = len3(d as V3);
    const dd = L > 3 * maxT ? mul3(d as V3, (3 * maxT) / L) : (d as V3);
    return add3(p, dd);
  });
  const mesh = { v, t: m.t.map((x) => x.slice() as Tri) };
  let flipped = 0;
  mesh.t.forEach((_, i) => { if (dot3(triNormal(mesh, i), nrm[i]) <= 0) flipped++; });
  return { mesh, flipped };
}
function solve3(A: number[][], b: number[]): number[] {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) continue;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return [0, 1, 2].map((i) => (Math.abs(M[i][i]) < 1e-300 ? 0 : M[i][3] / M[i][i]));
}

// ---------- 2D polygon triangulation (ear clipping) ----------
export type P2 = [number, number];
export const polyArea2 = (p: P2[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
/** Triangulate a simple polygon (no holes). Returns index triples, counter-clockwise if the input is CCW. */
export function earClip(poly: P2[]): Tri[] {
  const n = poly.length; if (n < 3) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  if (polyArea2(poly) < 0) idx.reverse();
  const out: Tri[] = [];
  const cr = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p: P2, a: P2, b: P2, c: P2) => cr(a, b, p) >= -1e-14 && cr(b, c, p) >= -1e-14 && cr(c, a, p) >= -1e-14;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10 * n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cr(a, b, c) <= 1e-18) continue; // reflex or flat
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inTri(poly[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) { // degenerate (collinear points): drop the flattest vertex
      let best = 0, bv = Infinity;
      for (let i = 0; i < idx.length; i++) { const v = Math.abs(cr(poly[idx[(i + idx.length - 1) % idx.length]], poly[idx[i]], poly[idx[(i + 1) % idx.length]])); if (v < bv) { bv = v; best = i; } }
      idx.splice(best, 1);
    }
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
/** Orthonormal basis (u, w) for a plane with normal n. */
export function planeBasis(n: V3): [V3, V3] {
  const a: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm3(cross3(a, n)); const w = cross3(n, u); return [u, w];
}

// ---------- plane cut (crop) ----------
/** Keep the part of the solid where (p − point)·n ≤ 0 and close the cut with a flat cap (handles vertices lying on the plane). */
export function planeCut(m: Mesh, point: V3, n: V3): Mesh {
  n = norm3(n);
  const bb = bbox(m); const eps = 1e-9 * (Math.max(...bb.size) || 1);
  const sd = m.v.map((p) => { const d = dot3(sub3(p, point), n); return Math.abs(d) <= eps ? 0 : d; });
  const v: V3[] = m.v.slice(); const t: Tri[] = [];
  const edgeVert = new Map<string, number>();
  const cutAt = (a: number, b: number) => {
    const key = ek(a, b); const got = edgeVert.get(key); if (got !== undefined) return got;
    const s = sd[a] / (sd[a] - sd[b]); const p = add3(m.v[a], mul3(sub3(m.v[b], m.v[a]), s));
    v.push(p); sd.push(0); edgeVert.set(key, v.length - 1); return v.length - 1;
  };
  for (const tri of m.t) {
    if (tri.every((i) => sd[i] <= 0)) { t.push(tri.slice() as Tri); continue; }
    if (tri.every((i) => sd[i] >= 0)) continue;
    // Sutherland-Hodgman on one triangle
    const poly: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      if (sd[a] <= 0) poly.push(a);
      if ((sd[a] < 0 && sd[b] > 0) || (sd[a] > 0 && sd[b] < 0)) poly.push(cutAt(a, b));
    }
    for (let k = 1; k + 1 < poly.length; k++) t.push([poly[0], poly[k], poly[k + 1]]);
  }
  const kept = t.filter(([a, b, c]) => a !== b && b !== c && a !== c);
  // cap: boundary half-edges lying on the plane; the cap runs the other way
  const cnt = new Map<string, number>();
  for (const tri of kept) for (let k = 0; k < 3; k++) { const key = ek(tri[k], tri[(k + 1) % 3]); cnt.set(key, (cnt.get(key) ?? 0) + 1); }
  const next = new Map<number, number>();
  for (const tri of kept) for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; if (cnt.get(ek(a, b)) === 1 && sd[a] === 0 && sd[b] === 0) next.set(b, a); }
  const used = new Set<number>();
  const [u, w] = planeBasis(n);
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: number[] = []; let cur: number | undefined = start;
    while (cur !== undefined && !used.has(cur)) { used.add(cur); loop.push(cur); cur = next.get(cur); }
    if (loop.length < 3) continue;
    const p2: P2[] = loop.map((i) => [dot3(v[i], u), dot3(v[i], w)]);
    for (const [a, b, c] of earClip(p2)) {
      const tri: Tri = [loop[a], loop[b], loop[c]];
      const nn = cross3(sub3(v[tri[1]], v[tri[0]]), sub3(v[tri[2]], v[tri[0]]));
      kept.push(dot3(nn, n) >= 0 ? tri : [tri[0], tri[2], tri[1]]);
    }
  }
  return compact({ v, t: kept });
}
/** Remove unused vertices. */
export function compact(m: Mesh): Mesh {
  const map = new Map<number, number>(); const v: V3[] = [];
  const t = m.t.map((tri) => tri.map((i) => { let j = map.get(i); if (j === undefined) { j = v.length; v.push(m.v[i]); map.set(i, j); } return j; }) as Tri);
  return { v, t };
}
/** Axis-aligned crop box: six plane cuts. */
export function cropBox(m: Mesh, min: V3, max: V3): Mesh {
  let r = m;
  for (let k = 0; k < 3; k++) {
    const nP: V3 = [0, 0, 0]; nP[k] = 1; const nN: V3 = [0, 0, 0]; nN[k] = -1;
    const bb = bbox(r);
    if (max[k] < bb.max[k]) r = planeCut(r, [max[k], max[k], max[k]], nP);
    if (min[k] > bb.min[k]) r = planeCut(r, [min[k], min[k], min[k]], nN);
  }
  return r;
}

// ---------- hole closing (scans) ----------
/** Close every open boundary loop with a fan around its centre point. Returns the mesh and how many holes were closed. */
export function closeHoles(m: Mesh): { mesh: Mesh; holes: number } {
  const dirCount = new Map<string, number>();
  for (const tri of m.t) for (let k = 0; k < 3; k++) { const key = ek(tri[k], tri[(k + 1) % 3]); dirCount.set(key, (dirCount.get(key) ?? 0) + 1); }
  // boundary half-edges a→b (in a triangle); the cap must run b→a
  const next = new Map<number, number>();
  for (const tri of m.t) for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; if (dirCount.get(ek(a, b)) === 1) next.set(b, a); }
  const v = m.v.slice(); const t = m.t.map((x) => x.slice() as Tri); const used = new Set<number>(); let holes = 0;
  for (const s of next.keys()) {
    if (used.has(s)) continue;
    const loop: number[] = []; let cur: number | undefined = s;
    while (cur !== undefined && !used.has(cur)) { used.add(cur); loop.push(cur); cur = next.get(cur); }
    if (loop.length < 3) continue;
    holes++;
    if (loop.length === 3) { t.push([loop[0], loop[1], loop[2]]); continue; }
    const c = mul3(loop.reduce((acc, i) => add3(acc, v[i]), [0, 0, 0] as V3), 1 / loop.length);
    v.push(c); const ci = v.length - 1;
    for (let i = 0; i < loop.length; i++) t.push([loop[i], loop[(i + 1) % loop.length], ci]);
  }
  return { mesh: { v, t }, holes };
}

// ---------- convex hull (corner points) ----------
/** 3D convex hull, incremental. Returns an outward-oriented closed mesh over the input points (unused points dropped). */
export function convexHull(pts: V3[]): Mesh {
  const n = pts.length; if (n < 4) throw new Error("Need at least 4 corner points that are not all on one plane");
  const bb = bbox(pts); const scale = Math.max(...bb.size) || 1; const eps = 1e-10 * scale;
  // initial tetrahedron
  let i0 = 0, i1 = -1, i2 = -1, i3 = -1;
  let best = 0; for (let i = 1; i < n; i++) { const d = dist3(pts[i], pts[i0]); if (d > best) { best = d; i1 = i; } }
  best = 0; for (let i = 0; i < n; i++) { const d = len3(cross3(sub3(pts[i1], pts[i0]), sub3(pts[i], pts[i0]))); if (d > best) { best = d; i2 = i; } }
  const nrm0 = cross3(sub3(pts[i1], pts[i0]), sub3(pts[i2], pts[i0]));
  best = 0; for (let i = 0; i < n; i++) { const d = Math.abs(dot3(nrm0, sub3(pts[i], pts[i0]))) / (len3(nrm0) || 1); if (d > best) { best = d; i3 = i; } }
  if (i1 < 0 || i2 < 0 || i3 < 0 || best < eps) throw new Error("Corner points are all on one plane (or a line): no solid");
  type F = { a: number; b: number; c: number; n: V3; d: number; alive: boolean };
  const faces: F[] = [];
  const mk = (a: number, b: number, c: number): F => { const nn = norm3(cross3(sub3(pts[b], pts[a]), sub3(pts[c], pts[a]))); return { a, b, c, n: nn, d: dot3(nn, pts[a]), alive: true }; };
  const cen = mul3(add3(add3(pts[i0], pts[i1]), add3(pts[i2], pts[i3])), 0.25);
  for (const [a, b, c] of [[i0, i1, i2], [i0, i1, i3], [i0, i2, i3], [i1, i2, i3]]) {
    let f = mk(a, b, c); if (dot3(f.n, cen) - f.d > 0) f = mk(a, c, b); faces.push(f);
  }
  for (let p = 0; p < n; p++) {
    if (p === i0 || p === i1 || p === i2 || p === i3) continue;
    const P = pts[p];
    const vis = faces.filter((f) => f.alive && dot3(f.n, P) - f.d > eps);
    if (!vis.length) continue;
    const edges = new Map<string, [number, number]>();
    for (const f of vis) {
      f.alive = false;
      for (const [a, b] of [[f.a, f.b], [f.b, f.c], [f.c, f.a]]) { const rk = b + ">" + a; if (edges.has(rk)) edges.delete(rk); else edges.set(a + ">" + b, [a, b]); }
    }
    for (const [a, b] of edges.values()) faces.push(mk(a, b, p));
  }
  return compact({ v: pts, t: faces.filter((f) => f.alive).map((f) => [f.a, f.b, f.c] as Tri) });
}

// ---------- polygon faces → triangles (editable faces for concave solids) ----------
/** Build a mesh from polygon faces (index lists, any winding); triangulated in each face's plane, then oriented outward. */
export function fromPolygons(pts: V3[], faces: number[][]): Mesh {
  const t: Tri[] = [];
  for (const f of faces) {
    if (f.length < 3) continue;
    let nn: V3 = [0, 0, 0];
    for (let i = 0; i < f.length; i++) { const a = pts[f[i]], b = pts[f[(i + 1) % f.length]]; nn = add3(nn, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); } // Newell normal
    const [u, w] = planeBasis(norm3(nn));
    const p2: P2[] = f.map((i) => [dot3(pts[i], u), dot3(pts[i], w)]);
    for (const [a, b, c] of earClip(p2)) t.push([f[a], f[b], f[c]]);
  }
  return orient({ v: pts, t });
}
