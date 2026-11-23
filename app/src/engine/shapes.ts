// Box shapes → closed triangle meshes (outside surface). Shape specs are stored in project JSON in mm; meshes are in metres.
// Frame: x = width (left −, right +, centred), y = height (floor 0, up +), z = depth (front face at z = 0, back towards −z).
import { add3, bbox, convexHull, earClip, fromPolygons, Mesh, mul3, norm3, offsetInward, orient, P2, planeBasis, polyArea2, sub3, Tri, V3, dot3 } from "./mesh";

export type PresetKind = "rect" | "wedge1" | "wedge2" | "trapezoid" | "corner" | "cylinder";
export interface PresetSpec {
  kind: PresetKind;
  W: number; H: number; D: number;   // width, front height, bottom depth
  Dtop: number;                       // wedge 1/2: depth at the top of the back
  Hb: number;                         // wedge 2: height at the back (top slopes from front height H to Hb)
  Wb: number;                         // trapezoid: width at the back (W = front width)
  A: number; B: number; angle: number; // corner prism: wall lengths A (left) and B (right) from the corner, angle between them (deg)
  dia: number; len: number; axis: "x" | "y" | "z"; // cylinder / tube
  fillet: number;                     // rounded edges radius (0 = sharp)
}
export interface ProfilePoint { d: number; h: number; arc: number } // depth from front, height, arc rise of the segment to the next point (0 = straight; + bulges out)
export interface ProfileSpec { width: number; pts: ProfilePoint[]; taper: boolean; pts2: ProfilePoint[]; fillet: number }
export interface PointsSpec { pts: V3[]; faces: string } // faces: one polygon per line, 1-based corner numbers; empty = convex hull
export interface ScanSpec { file: string; unit: "m" | "cm" | "mm" | "in"; axis: "none" | "x" | "y" | "z"; measuredMm: number; crop: boolean; cropMin: V3; cropMax: V3; upAxis: "y" | "z"; simplify: boolean }

export const defaultPreset = (): PresetSpec => ({ kind: "corner", W: 600, H: 380, D: 450, Dtop: 300, Hb: 300, Wb: 400, A: 700, B: 700, angle: 90, dia: 300, len: 600, axis: "x", fillet: 0 });
export const defaultProfile = (): ProfileSpec => ({
  width: 900, taper: false, fillet: 0,
  // a typical boot box: floor 500 deep, seat back sloping forward, rounded top edge
  pts: [{ d: 0, h: 0, arc: 0 }, { d: 500, h: 0, arc: 0 }, { d: 380, h: 420, arc: 0 }, { d: 0, h: 420, arc: 0 }],
  pts2: [{ d: 0, h: 0, arc: 0 }, { d: 450, h: 0, arc: 0 }, { d: 340, h: 380, arc: 0 }, { d: 0, h: 380, arc: 0 }],
});
export const defaultPoints = (): PointsSpec => ({ pts: [[-350, 0, 0], [350, 0, 0], [300, 0, -380], [-260, 0, -420], [-330, 360, 0], [330, 380, 0], [270, 300, -300], [-240, 320, -330]], faces: "" });

const mm = (x: number) => x / 1000;

// ---------- generic solids ----------
/** Closed solid between two polygon rings with the same number of points (prism, frustum, loft). Rings in metres. */
export function loft(a: V3[], b: V3[]): Mesh {
  const n = a.length; if (b.length !== n || n < 3) throw new Error("loft: rings must have the same number (≥ 3) of points");
  const v = [...a, ...b];
  const faces: number[][] = [];
  faces.push(Array.from({ length: n }, (_, i) => i));
  faces.push(Array.from({ length: n }, (_, i) => n + i));
  const t: Tri[] = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; t.push([i, j, n + j]); t.push([i, n + j, n + i]); }
  const caps = fromPolygons(v, faces);
  return orient({ v, t: [...t, ...caps.t] });
}
/** Polygon in a plane, extruded along a direction: ring at base, ring at base + dir. */
const extrude = (ring: V3[], dir: V3) => loft(ring, ring.map((p) => add3(p, dir)));

/** Discretise a side profile (mm) into polygon points (m), arcs split into pieces of ≤ 5°. segsPer gives a fixed piece count per arc (for lofts). */
export function profilePolygon(pts: ProfilePoint[], segsPer?: number[]): { poly: P2[]; segs: number[] } {
  const out: P2[] = []; const segs: number[] = [];
  const P = pts.map((p) => [mm(p.d), mm(p.h)] as P2);
  // orientation decides which side "outward" is for the arc rise
  const ccw = polyArea2(P) > 0;
  pts.forEach((p, i) => {
    const a = P[i], b = P[(i + 1) % P.length]; out.push(a);
    const s = mm(p.arc || 0);
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!s || chord < 1e-9) { segs.push(1); return; }
    // circular arc through a, b with sagitta s (outward = right of a→b for CCW polygons)
    const R = (chord * chord / 4 + s * s) / (2 * Math.abs(s));
    const half = Math.asin(Math.min(1, chord / 2 / R)); const big = Math.abs(s) > R; const theta = 2 * (big ? Math.PI - half : half);
    const nPieces = segsPer?.[i] ?? Math.max(2, Math.ceil((theta * 180 / Math.PI) / 5));
    segs.push(nPieces);
    const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dir: P2 = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
    const right: P2 = [dir[1], -dir[0]]; // right-hand normal of a→b
    const outSign = (ccw ? 1 : -1) * Math.sign(s);
    const apex: P2 = [mid[0] + right[0] * outSign * Math.abs(s), mid[1] + right[1] * outSign * Math.abs(s)];
    // centre is on the line through mid and apex, at distance R from apex towards mid
    const toMid: P2 = [mid[0] - apex[0], mid[1] - apex[1]]; const tl = Math.hypot(toMid[0], toMid[1]);
    const c: P2 = [apex[0] + toMid[0] / tl * R, apex[1] + toMid[1] / tl * R];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]); let a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    const am = Math.atan2(apex[1] - c[1], apex[0] - c[0]);
    // pick the sweep direction that passes through the apex
    let sweep = a1 - a0; const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const ccwSweep = norm(sweep); const passCcw = norm(am - a0) < ccwSweep;
    sweep = passCcw ? ccwSweep : ccwSweep - 2 * Math.PI; a1 = a0 + sweep;
    for (let k = 1; k < nPieces; k++) { const ang = a0 + (sweep * k) / nPieces; out.push([c[0] + R * Math.cos(ang), c[1] + R * Math.sin(ang)]); }
  });
  return { poly: out, segs };
}
/** Round the corners of a closed 2D polygon with radius r (corners whose legs are too short get the largest radius that fits). */
export function filletPolygon(poly: P2[], r: number, pieces = 8): P2[] {
  if (!(r > 0)) return poly;
  const n = poly.length; const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const u: P2 = [a[0] - p[0], a[1] - p[1]], w: P2 = [b[0] - p[0], b[1] - p[1]];
    const lu = Math.hypot(...u), lw = Math.hypot(...w);
    const cosT = (u[0] * w[0] + u[1] * w[1]) / (lu * lw); const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
    if (theta > Math.PI - 1e-3 || theta < 1e-3) { out.push(p); continue; }
    let rr = r; let dTan = rr / Math.tan(theta / 2);
    const maxTan = Math.min(lu, lw) / 2; if (dTan > maxTan) { dTan = maxTan; rr = dTan * Math.tan(theta / 2); }
    const ua: P2 = [u[0] / lu, u[1] / lu], wa: P2 = [w[0] / lw, w[1] / lw];
    const t1: P2 = [p[0] + ua[0] * dTan, p[1] + ua[1] * dTan], t2: P2 = [p[0] + wa[0] * dTan, p[1] + wa[1] * dTan];
    const bis: P2 = [ua[0] + wa[0], ua[1] + wa[1]]; const bl = Math.hypot(...bis);
    const cd = rr / Math.sin(theta / 2); const c: P2 = [p[0] + bis[0] / bl * cd, p[1] + bis[1] / bl * cd];
    const s0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]); const s1 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    let sw = s1 - s0; while (sw > Math.PI) sw -= 2 * Math.PI; while (sw < -Math.PI) sw += 2 * Math.PI;
    for (let k = 0; k <= pieces; k++) { const ang = s0 + (sw * k) / pieces; out.push([c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang)]); }
  }
  return out;
}
/** Minkowski rounding of a convex solid: shrink by r, then hull of a sphere of radius r around every shrunken corner.
 * Rounds every edge and corner (fillet radius r). Exact up to the sphere tessellation. */
export function roundConvex(m: Mesh, r: number, seg = 16): Mesh {
  if (!(r > 0)) return m;
  const inner = offsetInward(m, r);
  if (inner.flipped) throw new Error("Fillet radius is too large for this shape");
  const sph: V3[] = [];
  for (let i = 0; i <= seg / 2; i++) { const th = (Math.PI * i) / (seg / 2); for (let j = 0; j < seg; j++) { const ph = (2 * Math.PI * j) / seg; sph.push([r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]); if (i === 0 || i === seg / 2) break; } }
  const pts: V3[] = [];
  for (const p of inner.mesh.v) for (const s of sph) pts.push(add3(p, s));
  return convexHull(dedupe(pts));
}
function dedupe(pts: V3[]): V3[] { const seen = new Set<string>(); return pts.filter((p) => { const k = p.map((x) => x.toFixed(9)).join(","); if (seen.has(k)) return false; seen.add(k); return true; }); }

export function circle(r: number, n: number): P2[] { return Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as P2); }
/** UV sphere (tests, and rounded shells). */
export function sphere(r: number, nLon = 64, nLat = 32): Mesh {
  const v: V3[] = [[0, r, 0]]; const t: Tri[] = [];
  for (let i = 1; i < nLat; i++) { const th = (Math.PI * i) / nLat; for (let j = 0; j < nLon; j++) { const ph = (2 * Math.PI * j) / nLon; v.push([r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]); } }
  v.push([0, -r, 0]); const S = v.length - 1;
  const id = (i: number, j: number) => 1 + (i - 1) * nLon + (j % nLon);
  for (let j = 0; j < nLon; j++) t.push([0, id(1, j + 1), id(1, j)]);
  for (let i = 1; i < nLat - 1; i++) for (let j = 0; j < nLon; j++) { t.push([id(i, j), id(i, j + 1), id(i + 1, j + 1)]); t.push([id(i, j), id(i + 1, j + 1), id(i + 1, j)]); }
  for (let j = 0; j < nLon; j++) t.push([S, id(nLat - 1, j), id(nLat - 1, j + 1)]);
  return orient({ v, t });
}

// ---------- presets ----------
/** Side profile (depth d back from the front, height h) in metres → ring at x. */
const sideRing = (poly: P2[], x: number): V3[] => poly.map(([d, h]) => [x, h, -d]);
export function presetMesh(p: PresetSpec): Mesh {
  const W = mm(p.W), H = mm(p.H), D = mm(p.D);
  let m: Mesh;
  switch (p.kind) {
    case "rect": m = extrude(sideRing([[0, 0], [D, 0], [D, H], [0, H]], -W / 2), [W, 0, 0]); break;
    case "wedge1": m = extrude(sideRing([[0, 0], [D, 0], [mm(p.Dtop), H], [0, H]], -W / 2), [W, 0, 0]); break;
    case "wedge2": m = extrude(sideRing([[0, 0], [D, 0], [mm(p.Dtop), mm(p.Hb)], [0, H]], -W / 2), [W, 0, 0]); break;
    case "trapezoid": { const Wb = mm(p.Wb); m = extrude([[-W / 2, 0, 0], [W / 2, 0, 0], [Wb / 2, 0, -D], [-Wb / 2, 0, -D]], [0, H, 0]); break; }
    case "corner": {
      // corner at the back; walls A (to the left) and B (to the right) at `angle`; the front baffle joins their ends
      const A = mm(p.A), B = mm(p.B), th = (p.angle * Math.PI) / 180;
      const P1: P2 = [A, 0], P2_: P2 = [B * Math.cos(th), B * Math.sin(th)];
      // put the front edge P1→P2 on z = 0, centred on x, apex behind (z < 0)
      const fx = P2_[0] - P1[0], fy = P2_[1] - P1[1]; const fl = Math.hypot(fx, fy);
      const ux: P2 = [fx / fl, fy / fl]; const mid: P2 = [(P1[0] + P2_[0]) / 2, (P1[1] + P2_[1]) / 2];
      const toXZ = (q: P2): V3 => { const dx = q[0] - mid[0], dy = q[1] - mid[1]; const x = dx * ux[0] + dy * ux[1]; const n = -dx * ux[1] + dy * ux[0]; return [x, 0, n]; };
      let ring = [toXZ(P1), toXZ(P2_), toXZ([0, 0])];
      if (ring[2][2] > 0) ring = ring.map(([x, y, z]) => [x, y, -z] as V3); // apex must be behind
      m = extrude(ring, [0, H, 0]); break;
    }
    case "cylinder": {
      const r = mm(p.dia) / 2, L = mm(p.len); const c = circle(r, 96);
      if (p.axis === "y") m = extrude(c.map(([a, b]) => [a, 0, b - r] as V3), [0, L, 0]);
      else if (p.axis === "z") m = extrude(c.map(([a, b]) => [a, b + r, 0] as V3), [0, 0, -L]);
      else m = extrude(c.map(([a, b]) => [-L / 2, b + r, a - r] as V3), [L, 0, 0]);
      break;
    }
  }
  return p.fillet > 0 ? roundConvex(m, mm(p.fillet)) : m;
}
/** Side profile × width (optional second profile at the right side for a tapered loft). */
export function profileMesh(s: ProfileSpec): Mesh {
  if (s.pts.length < 3) throw new Error("A side profile needs at least 3 points");
  const W = mm(s.width);
  const a = profilePolygon(s.pts);
  let p1 = filletPolygon(a.poly, mm(s.fillet || 0));
  if (s.taper) {
    if (s.pts2.length !== s.pts.length) throw new Error("The second (right-side) profile must have the same number of points as the first");
    const b = profilePolygon(s.pts2.map((p, i) => ({ ...p, arc: s.pts[i].arc ? p.arc || s.pts[i].arc : p.arc })), a.segs);
    let p2 = filletPolygon(b.poly, mm(s.fillet || 0));
    if (p2.length !== p1.length) { p1 = a.poly; p2 = b.poly; }
    return loft(sideRing(p1, -W / 2), sideRing(p2, W / 2));
  }
  return extrude(sideRing(p1, -W / 2), [W, 0, 0]);
}
/** Corner points (mm). No faces = convex hull; faces = polygons by 1-based corner numbers (concave shapes). */
export function pointsMesh(s: PointsSpec): Mesh {
  const pts = s.pts.map((p) => p.map(mm) as V3);
  const lines = s.faces.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return convexHull(pts);
  const faces = lines.map((l) => l.split(/[\s,]+/).map((x) => parseInt(x, 10) - 1));
  for (const f of faces) for (const i of f) if (!(i >= 0 && i < pts.length)) throw new Error(`Face uses corner ${i + 1}, but there are ${pts.length} corners`);
  return fromPolygons(pts, faces);
}
/** Put a mesh on the floor (min y = 0), centred in x, front (max z) at z = 0. */
export function placeOnFloor(m: Mesh): Mesh {
  const b = bbox(m); const d: V3 = [-(b.min[0] + b.max[0]) / 2, -b.min[1], -b.max[2]];
  return { v: m.v.map((p) => add3(p, d)), t: m.t };
}
export { norm3, sub3, mul3, planeBasis, earClip, dot3 };
