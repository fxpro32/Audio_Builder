// 3D-scan import pipeline (research_d §3 2d): units → up axis → optional simplify → scale check against one measured distance →
// place on the floor → crop → close holes → oriented, closed mesh of the space (outside surface of the box). Units out: metres.
import { bbox, closeHoles, compact, cropBox, Mesh, orient, Tri, V3, volume, watertight, weld } from "./mesh";
import { placeOnFloor, ScanSpec } from "./shapes";

export const UNIT_M: Record<ScanSpec["unit"], number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254 };
export const defaultScan = (): ScanSpec => ({ file: "", unit: "mm", axis: "none", measuredMm: 0, crop: false, cropMin: [-2000, 0, -2000], cropMax: [2000, 2000, 0], upAxis: "y", simplify: true });

export interface ScanReport { trianglesIn: number; trianglesOut: number; simplified: boolean; scale: number; holesClosed: number; closed: boolean; volumeM3: number; sizeMm: V3; notes: string[] }

/** Guess the unit from the overall size (a car-boot space is 0.2-3 m). */
export function guessUnit(m: Mesh): ScanSpec["unit"] {
  const s = Math.max(...bbox(m).size);
  if (s > 100) return "mm"; if (s > 10) return "cm"; return "m";
}
/** Vertex clustering on a grid (cell in metres): fast, keeps the overall volume close; reported to the user. */
export function simplify(m: Mesh, cell: number): Mesh {
  const map = new Map<string, number>(); const sum: V3[] = []; const cnt: number[] = []; const remap: number[] = [];
  m.v.forEach((p, i) => {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
    let j = map.get(k); if (j === undefined) { j = sum.length; map.set(k, j); sum.push([0, 0, 0]); cnt.push(0); }
    sum[j][0] += p[0]; sum[j][1] += p[1]; sum[j][2] += p[2]; cnt[j]++; remap[i] = j;
  });
  const v = sum.map((s, j) => [s[0] / cnt[j], s[1] / cnt[j], s[2] / cnt[j]] as V3);
  const seen = new Set<string>(); const t: Tri[] = [];
  for (const [a, b, c] of m.t) {
    const A = remap[a], B = remap[b], C = remap[c]; if (A === B || B === C || A === C) continue;
    const key = [A, B, C].sort((x, y) => x - y).join(","); if (seen.has(key)) continue; seen.add(key); t.push([A, B, C]);
  }
  return compact({ v, t });
}

export function processScan(raw: Mesh, s: ScanSpec, maxTris = 40000): { mesh: Mesh; report: ScanReport } {
  const notes: string[] = [];
  const u = UNIT_M[s.unit] ?? 1;
  let m: Mesh = { v: raw.v.map((p) => (s.upAxis === "z" ? [p[0] * u, p[2] * u, -p[1] * u] : [p[0] * u, p[1] * u, p[2] * u]) as V3), t: raw.t };
  const trianglesIn = m.t.length; let simplified = false;
  if (s.simplify && m.t.length > maxTris) {
    const b = bbox(m); const diag = Math.hypot(...b.size);
    let cell = diag / 400; let r = simplify(m, cell);
    while (r.t.length > maxTris && cell < diag / 20) { cell *= 1.4; r = simplify(m, cell); }
    m = weld(r, cell * 1e-3); simplified = true;
    notes.push(`Simplified from ${trianglesIn} to ${m.t.length} triangles (grid ${(cell * 1000).toFixed(1)} mm) so the checks run quickly.`);
  }
  let scale = 1;
  if (s.axis !== "none" && s.measuredMm > 0) {
    const k = { x: 0, y: 1, z: 2 }[s.axis]; const ext = bbox(m).size[k];
    if (ext > 0) { scale = s.measuredMm / 1000 / ext; m = { v: m.v.map((p) => [p[0] * scale, p[1] * scale, p[2] * scale] as V3), t: m.t }; }
    notes.push(`Scale check: the scan's ${s.axis.toUpperCase()} size was ${(ext * 1000).toFixed(1)} mm; your tape measure says ${s.measuredMm} mm, so the scan was scaled by ${scale.toFixed(4)}.` + (Math.abs(scale - 1) > 0.05 ? " That is more than 5 %: check the unit setting or the measurement." : ""));
  }
  m = placeOnFloor(m);
  if (s.crop) m = cropBox(m, s.cropMin.map((x) => x / 1000) as V3, s.cropMax.map((x) => x / 1000) as V3);
  m = orient(m);
  const h = closeHoles(m); m = orient(h.mesh);
  const w = watertight(m);
  if (!w.closed) notes.push(`The mesh is still not closed (${w.boundaryEdges} open edges, ${w.nonManifoldEdges} edges shared by more than two triangles): the volume is approximate. Repair it in the scan app or MeshLab, or crop away the messy part.`);
  if (h.holes) notes.push(`${h.holes} hole(s) closed with flat fans (scans are usually open where the phone could not see).`);
  const b = bbox(m);
  return { mesh: m, report: { trianglesIn, trianglesOut: m.t.length, simplified, scale, holesClosed: h.holes, closed: w.closed, volumeM3: volume(m), sizeMm: b.size.map((x) => x * 1000) as V3, notes } };
}
