// Flat panels of a free-form box (wood mode): coplanar triangles grouped into panels, true outlines, the angle between
// neighbouring panels and the table-saw blade tilt for a mitred joint; fibreglass mat/resin estimate.
import { add3, cross3, dot3, len3, Mesh, mul3, norm3, P2, planeBasis, polyArea2, sub3, triNormal, V3 } from "./mesh";

export interface PanelEdge { a: V3; b: V3; length: number; neighbour: number; interiorDeg: number; convex: boolean; bladeDeg: number }
export interface Panel {
  id: number; name: string; tris: number[]; normal: V3; origin: V3; u: V3; w: V3; area: number;
  loop: number[];        // vertex indices of the outline (outer mesh), in order
  outline: P2[];         // outline in the panel's own 2D frame (m), origin = panel centre
  centre: V3; edges: PanelEdge[]; size: [number, number]; // bounding size in its plane (m)
}

const ek = (a: number, b: number) => (a < b ? a + "_" + b : b + "_" + a);
/** Group coplanar, edge-connected triangles (normals within tolDeg) into panels. */
export function findPanels(m: Mesh, tolDeg = 0.5): Panel[] {
  const nrm = m.t.map((_, i) => norm3(triNormal(m, i)));
  const edgeTris = new Map<string, number[]>();
  m.t.forEach((t, i) => { for (let k = 0; k < 3; k++) { const key = ek(t[k], t[(k + 1) % 3]); (edgeTris.get(key) ?? edgeTris.set(key, []).get(key)!).push(i); } });
  const cosTol = Math.cos((tolDeg * Math.PI) / 180);
  const owner = new Int32Array(m.t.length).fill(-1);
  const groups: number[][] = [];
  for (let s = 0; s < m.t.length; s++) {
    if (owner[s] >= 0) continue;
    const g = groups.length; const list = [s]; owner[s] = g; const stack = [s];
    while (stack.length) {
      const i = stack.pop()!; const t = m.t[i];
      for (let k = 0; k < 3; k++) for (const j of edgeTris.get(ek(t[k], t[(k + 1) % 3])) ?? []) {
        if (owner[j] >= 0 || dot3(nrm[j], nrm[s]) < cosTol) continue;
        owner[j] = g; list.push(j); stack.push(j);
      }
    }
    groups.push(list);
  }
  const panels: Panel[] = groups.map((tris, id) => {
    let n: V3 = [0, 0, 0]; let A = 0;
    for (const i of tris) { const tn = triNormal(m, i); n = add3(n, tn); A += len3(tn) / 2; }
    const normal = norm3(n);
    // boundary loop
    const cnt = new Map<string, number>();
    for (const i of tris) { const t = m.t[i]; for (let k = 0; k < 3; k++) { const key = ek(t[k], t[(k + 1) % 3]); cnt.set(key, (cnt.get(key) ?? 0) + 1); } }
    const next = new Map<number, number>();
    for (const i of tris) { const t = m.t[i]; for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; if (cnt.get(ek(a, b)) === 1) next.set(a, b); } }
    let loop: number[] = []; const used = new Set<number>();
    for (const s of next.keys()) {
      if (used.has(s)) continue; const l: number[] = []; let c: number | undefined = s;
      while (c !== undefined && !used.has(c)) { used.add(c); l.push(c); c = next.get(c); }
      if (l.length > loop.length) loop = l;
    }
    // drop collinear points
    loop = loop.filter((vi, k) => {
      const a = m.v[loop[(k + loop.length - 1) % loop.length]], b = m.v[vi], c = m.v[loop[(k + 1) % loop.length]];
      return len3(cross3(norm3(sub3(b, a)), norm3(sub3(c, b)))) > 1e-6;
    });
    const centre = mul3(loop.reduce((acc, i) => add3(acc, m.v[i]), [0, 0, 0] as V3), 1 / Math.max(1, loop.length));
    // in-plane frame: u horizontal where possible (so "width" reads across), w = n × u
    let [u, w] = planeBasis(normal);
    const horiz = norm3(cross3([0, 1, 0], normal)); if (len3(cross3([0, 1, 0], normal)) > 1e-6) { u = horiz; w = cross3(normal, u); }
    const outline = loop.map((i) => { const d = sub3(m.v[i], centre); return [dot3(d, u), dot3(d, w)] as P2; });
    const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
    return { id, name: "", tris, normal, origin: centre, u, w, area: A, loop, outline, centre, edges: [], size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] };
  });
  // edges, neighbours, angles
  const triPanel = new Int32Array(m.t.length); panels.forEach((p) => p.tris.forEach((i) => (triPanel[i] = p.id)));
  for (const p of panels) {
    for (let k = 0; k < p.loop.length; k++) {
      const ia = p.loop[k], ib = p.loop[(k + 1) % p.loop.length];
      // neighbour across this (possibly merged) edge: find any triangle edge on the segment that belongs to another panel
      let nb = -1;
      for (const i of p.tris) { const t = m.t[i]; for (let q = 0; q < 3; q++) { const a = t[q], b = t[(q + 1) % 3]; if (onSegment(m.v[a], m.v[ia], m.v[ib]) && onSegment(m.v[b], m.v[ia], m.v[ib])) for (const j of edgeTris.get(ek(a, b)) ?? []) if (triPanel[j] !== p.id) nb = triPanel[j]; } }
      const a = m.v[ia], b = m.v[ib];
      let interior = 180, convex = true;
      if (nb >= 0) {
        const q = panels[nb]; const cosN = Math.max(-1, Math.min(1, dot3(p.normal, q.normal)));
        const bend = (Math.acos(cosN) * 180) / Math.PI;
        convex = dot3(p.normal, sub3(q.centre, p.centre)) < 1e-12;
        interior = convex ? 180 - bend : 180 + bend;
      }
      // mitre: each panel edge is cut at half the bend; tilt measured from square (0° = square cut)
      const blade = Math.abs(180 - interior) / 2;
      p.edges.push({ a, b, length: len3(sub3(b, a)), neighbour: nb, interiorDeg: interior, convex, bladeDeg: blade });
    }
  }
  namePanels(panels);
  return panels;
}
function onSegment(p: V3, a: V3, b: V3): boolean {
  const ab = sub3(b, a), ap = sub3(p, a); const L2 = dot3(ab, ab); if (L2 === 0) return false;
  const t = dot3(ap, ab) / L2; if (t < -1e-9 || t > 1 + 1e-9) return false;
  return len3(sub3(ap, mul3(ab, t))) < 1e-7 + 1e-6 * Math.sqrt(L2);
}
function namePanels(ps: Panel[]) {
  const counts: Record<string, number> = {};
  for (const p of ps) {
    const [x, y, z] = p.normal; const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let base = ay >= ax && ay >= az ? (y > 0 ? "Top" : "Bottom") : az >= ax ? (z > 0 ? "Front" : "Back") : x > 0 ? "Right" : "Left";
    const axisAligned = Math.max(ax, ay, az) > 0.9999;
    if (!axisAligned && ay < 0.01 && az > 0.2 && ax > 0.2) base = `${z > 0 ? "Front" : "Back"} ${x > 0 ? "right" : "left"} (angled wall)`; // upright wall at an angle (corner boxes)
    else if (!axisAligned) base = "Sloped " + base.toLowerCase();
    counts[base] = (counts[base] ?? 0) + 1;
    p.name = base;
  }
  const seen: Record<string, number> = {};
  for (const p of ps) if (counts[p.name] > 1) { seen[p.name] = (seen[p.name] ?? 0) + 1; p.name = `${p.name} ${seen[p.name]}`; }
}
/** Flat-panel test: a box is "wood-buildable" when it has few panels and none is a sliver of a curved surface. */
export function isFlatPanelled(ps: Panel[]): boolean { return ps.length <= 24 && ps.every((p) => p.loop.length >= 3); }

export const panelArea2D = (p: Panel) => Math.abs(polyArea2(p.outline));
/** Point (u, v in m, relative to the panel centre) inside the outline, at least `margin` from every edge. */
export function fitsOnPanel(p: Panel, c: P2, r: number, margin = 0): boolean {
  const poly = p.outline; let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > c[1]) !== (yj > c[1]) && c[0] < ((xj - xi) * (c[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]; const abx = b[0] - a[0], aby = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * abx + (c[1] - a[1]) * aby) / (abx * abx + aby * aby)));
    const d = Math.hypot(c[0] - a[0] - t * abx, c[1] - a[1] - t * aby); if (d < r + margin) return false;
  }
  return true;
}
/** 3D point on the panel from its 2D offset (m). */
export const panelPoint = (p: Panel, uv: P2): V3 => add3(p.centre, add3(mul3(p.u, uv[0]), mul3(p.w, uv[1])));

// ---------- fibreglass estimate ----------
export interface FibreInputs { shellMm: number; matGsm: number; mmPerLayer: number; resinPerGlass: number; wastePct: number }
/** ASSUMPTIONS (editable in the app; not taken from a datasheet): 450 g/m² chopped strand mat, about 1 mm of laminate per layer,
 * polyester resin about 2.3 kg per kg of mat, 15 % overlap and waste. Results are estimates for buying materials, not engineering values. */
export const defaultFibre = (): FibreInputs => ({ shellMm: 6, matGsm: 450, mmPerLayer: 1.0, resinPerGlass: 2.3, wastePct: 15 });
export function fibreEstimate(areaM2: number, f: FibreInputs) {
  const layers = Math.max(1, Math.ceil(f.shellMm / Math.max(0.1, f.mmPerLayer)));
  const matM2 = areaM2 * layers * (1 + f.wastePct / 100);
  const matKg = (matM2 * f.matGsm) / 1000;
  const resinKg = matKg * f.resinPerGlass;
  return { layers, matM2, matKg, resinKg, laminateKg: matKg + resinKg };
}
