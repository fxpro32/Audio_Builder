// Geometry core (A1 item 1): every measure checked against exact solids to 0.1 %.
import { describe, expect, it } from "vitest";
import { area, bbox, centroid, closeHoles, convexHull, cropBox, fromPolygons, inside, longestChord, Mesh, offsetInward, planeCut, V3, volume, watertight, weld } from "../src/engine/mesh";
import { defaultPreset, loft, presetMesh, profileMesh, pointsMesh, sphere, roundConvex } from "../src/engine/shapes";

const rel = (a: number, b: number, tol = 0.001) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThanOrEqual(tol);
const P = (o: Partial<ReturnType<typeof defaultPreset>>) => ({ ...defaultPreset(), fillet: 0, ...o });

describe("mesh measures vs exact solids", () => {
  it("cube: volume, area, centroid, bbox, chord, watertight, offset", () => {
    const m = presetMesh(P({ kind: "rect", W: 500, H: 500, D: 500 }));
    expect(watertight(m).closed).toBe(true);
    rel(volume(m), 0.125); rel(area(m), 1.5);
    const c = centroid(m); expect(Math.abs(c[0])).toBeLessThan(1e-12); rel(c[1], 0.25); rel(c[2], -0.25);
    rel(bbox(m).size[2], 0.5);
    rel(longestChord(m).length, 0.5 * Math.sqrt(3));
    const inner = offsetInward(m, 0.018); expect(inner.flipped).toBe(0);
    rel(volume(inner.mesh), (0.5 - 0.036) ** 3);
  });
  it("wedge (sloped back): V = W·H·(D+Dtop)/2, inner wedge exact after the 18 mm offset", () => {
    const W = 0.6, H = 0.4, D = 0.5, Dt = 0.3, t = 0.018;
    const m = presetMesh(P({ kind: "wedge1", W: 600, H: 400, D: 500, Dtop: 300 }));
    expect(watertight(m).closed).toBe(true);
    rel(volume(m), W * H * (D + Dt) / 2);
    // inner: front at t, floor t, top H − t, back line moved in by t perpendicular to itself
    const cosA = H / Math.hypot(H, D - Dt);
    const dBack = (h: number) => D + (Dt - D) * h / H - t / cosA;
    const h0 = t, h1 = H - t; const areaIn = ((dBack(h0) - t) + (dBack(h1) - t)) / 2 * (h1 - h0);
    rel(volume(offsetInward(m, t).mesh), areaIn * (W - 2 * t));
  });
  it("triangle (corner) prism: V = ½·A·B·sin(angle)·H; chord = √(front² + H²)", () => {
    const m = presetMesh(P({ kind: "corner", A: 700, B: 500, angle: 75, H: 380 }));
    expect(watertight(m).closed).toBe(true);
    const th = 75 * Math.PI / 180;
    rel(volume(m), 0.5 * 0.7 * 0.5 * Math.sin(th) * 0.38);
    const front = Math.sqrt(0.49 + 0.25 - 2 * 0.7 * 0.5 * Math.cos(th));
    rel(longestChord(m).length, Math.hypot(Math.max(front, 0.7, 0.5), 0.38));
  });
  it("cylinder (96 sides) vs π r² L, and inner tube after 6 mm shell", () => {
    const m = presetMesh(P({ kind: "cylinder", dia: 300, len: 600, axis: "x" }));
    expect(watertight(m).closed).toBe(true);
    rel(volume(m), Math.PI * 0.15 ** 2 * 0.6);
    rel(area(m), 2 * Math.PI * 0.15 * 0.6 + 2 * Math.PI * 0.15 ** 2);
    rel(volume(offsetInward(m, 0.006).mesh), Math.PI * 0.144 ** 2 * 0.588);
  });
  it("sphere vs 4/3 π r³ (and 4π r²), offset shell", () => {
    const m = sphere(0.2, 192, 96);
    expect(watertight(m).closed).toBe(true);
    rel(volume(m), 4 / 3 * Math.PI * 0.008); rel(area(m), 4 * Math.PI * 0.04);
    rel(volume(offsetInward(m, 0.01).mesh), 4 / 3 * Math.PI * 0.19 ** 3);
    rel(longestChord(m, 400).length, 0.4, 0.002);
  });
  it("irregular polyhedron (no two sides alike): bipyramid over a scalene triangle, V = A·(h1+h2)/3", () => {
    const base: V3[] = [[0, 0, 0], [0.71, 0, 0.05], [0.23, 0, -0.52]];
    const top: V3 = [0.31, 0.43, -0.11], bot: V3 = [0.12, -0.27, -0.2];
    const pts = [...base, top, bot];
    const cr = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const e1: V3 = [0.71, 0, 0.05], e2: V3 = [0.23, 0, -0.52]; const A = Math.hypot(...cr(e1, e2)) / 2;
    const exact = A * (0.43 + 0.27) / 3;
    const hull = convexHull(pts); expect(watertight(hull).closed).toBe(true); rel(volume(hull), exact);
    const faces = fromPolygons(pts, [[0, 1, 3], [1, 2, 3], [2, 0, 3], [1, 0, 4], [2, 1, 4], [0, 2, 4]]); rel(volume(faces), exact);
  });
  it("concave solid (L-shaped profile × width): V = area(L) × W; hull would be wrong, faces keep it concave", () => {
    const m = profileMesh({ width: 800, taper: false, fillet: 0, pts2: [], pts: [{ d: 0, h: 0, arc: 0 }, { d: 600, h: 0, arc: 0 }, { d: 600, h: 200, arc: 0 }, { d: 250, h: 200, arc: 0 }, { d: 250, h: 450, arc: 0 }, { d: 0, h: 450, arc: 0 }] });
    expect(watertight(m).closed).toBe(true);
    const aL = 0.6 * 0.2 + 0.25 * 0.25; rel(volume(m), aL * 0.8);
    expect(inside(m, [0, 0.3, -0.5])).toBe(false); expect(inside(m, [0, 0.1, -0.5])).toBe(true);
    // the longest inside chord must not cut through the missing corner
    const ch = longestChord(m); expect(ch.length).toBeLessThan(Math.hypot(0.8, 0.6, 0.45));
  });
  it("arc segment: back wall bulging out as a half circle (arc rise = half the wall height)", () => {
    const m = profileMesh({ width: 500, taper: false, fillet: 0, pts2: [], pts: [{ d: 0, h: 0, arc: 0 }, { d: 300, h: 0, arc: 200 }, { d: 300, h: 400, arc: 0 }, { d: 0, h: 400, arc: 0 }] });
    expect(watertight(m).closed).toBe(true);
    rel(volume(m), (0.3 * 0.4 + Math.PI * 0.2 ** 2 / 2) * 0.5);
  });
  it("tapered loft: frustum of a square pyramid, V = h/3 (A1 + A2 + √(A1A2))", () => {
    const sq = (s: number, x: number): V3[] => [[x, -s / 2, -s / 2], [x, s / 2, -s / 2], [x, s / 2, s / 2], [x, -s / 2, s / 2]];
    const m = loft(sq(0.6, 0), sq(0.3, 0.5));
    rel(volume(m), 0.5 / 3 * (0.36 + 0.09 + Math.sqrt(0.36 * 0.09)));
  });
  it("rounded box (fillet on every edge) vs Steiner's formula", () => {
    const r = 0.04, W = 0.6, H = 0.4, D = 0.5;
    const a = W - 2 * r, b = H - 2 * r, c = D - 2 * r;
    const exact = a * b * c + 2 * (a * b + b * c + c * a) * r + Math.PI * (a + b + c) * r * r + 4 / 3 * Math.PI * r ** 3;
    const m = roundConvex(presetMesh(P({ kind: "rect", W: 600, H: 400, D: 500 })), r, 48);
    expect(watertight(m).closed).toBe(true);
    rel(volume(m), exact);
  });
  it("plane cut, crop box and hole closing keep the solid closed and exact", () => {
    const m = presetMesh(P({ kind: "rect", W: 400, H: 400, D: 400 }));
    const half = planeCut(m, [0, 0.1, 0], [0, 1, 0]); expect(watertight(half).closed).toBe(true); rel(volume(half), 0.4 * 0.4 * 0.1);
    const slant = planeCut(m, [0, 0.2, -0.2], [0, 1, 1]); expect(watertight(slant).closed).toBe(true); rel(volume(slant), 0.064 / 2);
    const c = cropBox(m, [-0.1, 0, -0.3], [0.2, 0.25, 0]); expect(watertight(c).closed).toBe(true); rel(volume(c), 0.3 * 0.25 * 0.3);
    // open the top (remove its two triangles), then close it again
    const topTris = m.t.filter((t) => t.every((i) => m.v[i][1] > 0.399));
    const open: Mesh = { v: m.v, t: m.t.filter((t) => !topTris.includes(t)) };
    expect(watertight(open).boundaryEdges).toBe(4);
    const shut = closeHoles(open); expect(shut.holes).toBe(1); expect(watertight(shut.mesh).closed).toBe(true); rel(volume(shut.mesh), 0.064);
  });
  it("weld turns a triangle soup into a closed mesh", () => {
    const m = presetMesh(P({ kind: "rect", W: 300, H: 200, D: 100 }));
    const soup: Mesh = { v: [], t: [] };
    for (const t of m.t) { const o = soup.v.length; soup.v.push(...t.map((i) => [...m.v[i]] as V3)); soup.t.push([o, o + 1, o + 2]); }
    expect(watertight(soup).closed).toBe(false);
    const w = weld(soup, 1e-7); expect(watertight(w).closed).toBe(true); rel(volume(w), 0.006);
  });
  it("corner points: convex hull of a box with one corner moved (no two sides alike)", () => {
    const m = pointsMesh({ pts: [[0, 0, 0], [500, 0, 0], [500, 0, -400], [0, 0, -400], [0, 300, 0], [500, 300, 0], [500, 300, -400], [0, 300, -400]], faces: "" });
    rel(volume(m), 0.5 * 0.3 * 0.4);
  });
});
