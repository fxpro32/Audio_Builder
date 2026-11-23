// Free-form pipeline (A1 items 2-4, 6): file formats, scan import, wood panels and blade angles, fibreglass, net volume, placement.
import { describe, expect, it } from "vitest";
import { Mesh, V3, volume, watertight, area, bbox } from "../src/engine/mesh";
import { defaultPreset, presetMesh, sphere } from "../src/engine/shapes";
import { parseMeshFile, parseOBJ, parsePLY, parseSTL, readDXFPolys, writeDXF, writeOBJ, writePLYAscii, writeSTLAscii, writeSTLBinary } from "../src/io/meshio";
import { processScan, defaultScan, simplify } from "../src/engine/scan";
import { findPanels, fibreEstimate, defaultFibre } from "../src/engine/panels";
import { analyse, defaultShape, outerMesh, scaleShape, solveScale, upgradeShape } from "../src/engine/freeform";
import { grossVolume, netVolume } from "../src/engine/volume";
import { panelDxf } from "../src/engine/cutsheet";

const rel = (a: number, b: number, tol = 0.001) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThanOrEqual(tol);
const P = (o: Partial<ReturnType<typeof defaultPreset>>) => ({ ...defaultPreset(), fillet: 0, ...o });
const ab = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const noDriver = { drivers: 1, driverCutout: 0.28, driverOuter: 0.31, driverDepth: 0.15, driverDisp: 0, bracesM3: 0, otherM3: 0, insertsM3: 0, fillPct: 0 };

describe("mesh files", () => {
  const cube = presetMesh(P({ kind: "rect", W: 400, H: 300, D: 200 }));
  it("STL binary and ASCII round trip (welded, closed, same volume)", () => {
    for (const m of [parseSTL(writeSTLBinary(cube)), parseSTL(ab(writeSTLAscii(cube)))]) { expect(watertight(m).closed).toBe(true); rel(volume(m), 0.024, 1e-6); }
  });
  it("OBJ (with quads and negative indices) and PLY ASCII + binary", () => {
    const obj = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf -8 -4 -1 -5\n";
    const m = parseOBJ(obj); expect(watertight(m).closed).toBe(true); rel(Math.abs(volume(m)), 1, 1e-9);
    rel(volume(parseOBJ(writeOBJ(cube))), 0.024, 1e-9);
    rel(volume(parsePLY(ab(writePLYAscii(cube)))), 0.024, 1e-6);
    // binary little-endian PLY written by hand
    const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${cube.v.length}\nproperty float x\nproperty float y\nproperty float z\nelement face ${cube.t.length}\nproperty list uchar int vertex_indices\nend_header\n`;
    const hb = new TextEncoder().encode(head); const buf = new ArrayBuffer(hb.length + cube.v.length * 12 + cube.t.length * 13); new Uint8Array(buf).set(hb);
    const dv = new DataView(buf); let o = hb.length;
    for (const p of cube.v) for (const x of p) { dv.setFloat32(o, x, true); o += 4; }
    for (const t of cube.t) { dv.setUint8(o, 3); o++; for (const i of t) { dv.setInt32(o, i, true); o += 4; } }
    rel(volume(parseMeshFile("scan.ply", buf)), 0.024, 1e-6);
  });
  it("DXF: closed polylines read back", () => {
    const txt = writeDXF([{ kind: "poly", layer: "CUT", pts: [[0, 0], [100, 0], [100, 50]] }, { kind: "circle", layer: "HOLES", c: [10, 10], r: 5 }, { kind: "text", layer: "TEXT", at: [0, -10], h: 5, text: "Panel" }]);
    expect(txt.startsWith("0\nSECTION")).toBe(true); expect(txt.trim().endsWith("EOF")).toBe(true);
    expect(readDXFPolys(txt)).toEqual([[[0, 0], [100, 0], [100, 50]]]);
  });
});

describe("scan import", () => {
  it("sample scan from a known solid: Z-up, millimetres, open bottom, 2 % scale error → exact volume after scale check and hole closing", () => {
    // known solid: cylinder Ø 300 mm × 600 mm lying across (as a scanner would see a tube), written in mm with Z up and scaled 0.98
    const truth = presetMesh(P({ kind: "cylinder", dia: 300, len: 600, axis: "x" }));
    const raw: Mesh = { v: truth.v.map(([x, y, z]) => [x * 980, -z * 980, y * 980] as V3), t: truth.t };
    // remove one end cap (the scanner could not see it)
    const capTris = raw.t.filter((t) => t.every((i) => raw.v[i][0] < -290));
    const open: Mesh = { v: raw.v, t: raw.t.filter((t) => !capTris.includes(t)) };
    expect(watertight(open).closed).toBe(false);
    const r = processScan(open, { ...defaultScan(), unit: "mm", upAxis: "z", axis: "x", measuredMm: 600 });
    expect(r.report.closed).toBe(true); expect(r.report.holesClosed).toBe(1);
    rel(r.report.scale, 1 / 0.98, 1e-9);
    rel(r.report.volumeM3, volume(truth), 1e-6);
    const b = bbox(r.mesh); expect(b.min[1]).toBeCloseTo(0, 9); expect(b.max[2]).toBeCloseTo(0, 9);
  });
  it("crop box removes part of the scan and closes the cut", () => {
    const truth = presetMesh(P({ kind: "rect", W: 1000, H: 400, D: 500 }));
    const r = processScan({ v: truth.v.map((p) => p.map((x) => x * 1000) as V3), t: truth.t }, { ...defaultScan(), unit: "mm", crop: true, cropMin: [-300, 0, -500], cropMax: [500, 400, 0] });
    expect(r.report.closed).toBe(true); rel(r.report.volumeM3, 0.8 * 0.4 * 0.5);
  });
  it("simplify a 130k-triangle sphere to under 40k triangles within 1 % volume", () => {
    const s = sphere(0.3, 512, 128); expect(s.t.length).toBeGreaterThan(100000);
    const r = processScan(s, { ...defaultScan(), unit: "m" });
    expect(r.report.simplified).toBe(true); expect(r.report.trianglesOut).toBeLessThanOrEqual(40000);
    rel(r.report.volumeM3, 4 / 3 * Math.PI * 0.027, 0.01);
    void simplify;
  });
});

describe("wood panels, blade angles, cut sheets", () => {
  it("rectangular box: 6 named panels, every joint 90°, mitre blade tilt 45°", () => {
    const ps = findPanels(presetMesh(P({ kind: "rect", W: 600, H: 400, D: 500 })));
    expect(ps.map((p) => p.name).sort()).toEqual(["Back", "Bottom", "Front", "Left", "Right", "Top"]);
    for (const p of ps) for (const e of p.edges) { expect(e.interiorDeg).toBeCloseTo(90, 6); expect(e.bladeDeg).toBeCloseTo(45, 6); }
    const front = ps.find((p) => p.name === "Front")!; expect(front.size[0]).toBeCloseTo(0.6, 9); expect(front.size[1]).toBeCloseTo(0.4, 9);
  });
  it("wedge: sloped back meets the floor at atan(H/(D−Dtop)) = 63.43°, blade 58.28°; top joint 116.57°, blade 31.72°", () => {
    const ps = findPanels(presetMesh(P({ kind: "wedge1", W: 600, H: 400, D: 500, Dtop: 300 })));
    const back = ps.find((p) => p.name === "Sloped back")!;
    const toBottom = back.edges.find((e) => ps[e.neighbour].name === "Bottom")!, toTop = back.edges.find((e) => ps[e.neighbour].name === "Top")!;
    expect(toBottom.interiorDeg).toBeCloseTo(63.435, 2); expect(toBottom.bladeDeg).toBeCloseTo(58.28, 1);
    expect(toTop.interiorDeg).toBeCloseTo(116.565, 2); expect(toTop.bladeDeg).toBeCloseTo(31.72, 1);
  });
  it("corner prism: 3 side panels + top + bottom; front corners 45°", () => {
    const ps = findPanels(presetMesh(P({ kind: "corner", A: 700, B: 700, angle: 90, H: 380 })));
    expect(ps.length).toBe(5);
    const front = ps.find((p) => p.name === "Front")!;
    const sideJoints = front.edges.filter((e) => !["Top", "Bottom"].includes(ps[e.neighbour].name));
    for (const e of sideJoints) expect(e.interiorDeg).toBeCloseTo(45, 6);
  });
  it("DXF cut sheet: one closed outline per panel, areas add up to the outside area", () => {
    const m = presetMesh(P({ kind: "wedge2", W: 600, H: 400, D: 500, Dtop: 350, Hb: 300 }));
    const ps = findPanels(m);
    const polys = readDXFPolys(panelDxf(ps, { title: "test", thickness: () => 18 }));
    expect(polys.length).toBe(ps.length);
    const a = polys.reduce((s, p) => { let x = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; x += p[i][0] * q[1] - q[0] * p[i][1]; } return s + Math.abs(x) / 2; }, 0);
    rel(a / 1e6, area(m), 1e-6);
  });
});

describe("free-form analysis and net volume", () => {
  it("rectangle preset = the classic rectangular maths exactly (18 mm walls)", () => {
    const s = { ...defaultShape(), mode: "preset" as const, preset: P({ kind: "rect", W: 600, H: 400, D: 500 }) };
    const r = analyse(s, outerMesh(s), noDriver);
    rel(r.grossInner, grossVolume({ W: 0.6, H: 0.4, D: 0.5, t: 0.018 }), 1e-9);
    // the engine's netVolume takes the mesh gross unchanged
    rel(netVolume({ W: 0.6, H: 0.4, D: 0.5, t: 0.018, gross: r.grossInner }, 0.004, 1).net, r.grossInner - 0.004, 1e-12);
  });
  it("per-panel thickness: a 36 mm double front baffle", () => {
    const s = { ...defaultShape(), mode: "preset" as const, preset: P({ kind: "rect", W: 600, H: 400, D: 500 }), panelT: { Front: 36 } };
    rel(analyse(s, outerMesh(s), noDriver).grossInner, 0.564 * 0.364 * (0.5 - 0.018 - 0.036), 1e-9);
  });
  it("deductions: driver, port, braces; standing-wave chord; port fit inside the mesh", () => {
    const s = { ...defaultShape(), mode: "preset" as const, preset: P({ kind: "rect", W: 600, H: 400, D: 500 }), driverPanel: "Front", driverV: 40, portPanel: "Front", portU: 200, portV: -120 };
    const port = { shape: "round" as const, count: 1, d: 0.075, length: 0.3, wall: 0.003 };
    const r = analyse(s, outerMesh(s), { ...noDriver, driverDisp: 0.003, port, bracesM3: 0.001 });
    rel(r.net, r.grossInner - 0.003 - Math.PI * (0.0375 + 0.003) ** 2 * 0.3 - 0.001, 1e-9);
    rel(r.chord.length, Math.hypot(0.564, 0.364, 0.464), 1e-6);
    expect(r.driver!.panel).toBe("Front"); expect(r.driver!.fits).toBe(true); rel(r.driver!.roomM, 0.464, 1e-6);
    expect(r.portFit!.ok).toBe(true); rel(r.portFit!.needM, 0.3 - 0.018 + 0.075, 1e-9);
    const long = analyse(s, outerMesh(s), { ...noDriver, port: { ...port, length: 0.45 } }); expect(long.portFit!.ok).toBe(false);
  });
  it("fibreglass: shell offset, ring, mat and resin estimate from area (assumptions stated)", () => {
    const s = { ...defaultShape(), mode: "preset" as const, material: "fibreglass" as const, preset: P({ kind: "cylinder", dia: 400, len: 700, axis: "x" }), ringOuterMm: 360, ringThickMm: 18 };
    const r = analyse(s, outerMesh(s), { ...noDriver, driverCutout: 0.28 });
    rel(r.grossInner, Math.PI * 0.194 ** 2 * 0.688, 0.001);
    rel(r.deductions.ring, Math.PI * (0.18 ** 2 - 0.14 ** 2) * 0.012, 1e-9);
    const f = fibreEstimate(r.areaOuter, defaultFibre()); expect(f.layers).toBe(6);
    rel(f.matKg, r.areaOuter * 6 * 1.15 * 0.45, 1e-9); expect(r.panelModes).toEqual([]);
  });
  it("Design: scale the shape until the net volume hits a target", () => {
    const s = { ...defaultShape(), mode: "preset" as const, preset: P({ kind: "corner", A: 700, B: 700, angle: 90, H: 380 }) };
    const netAt = (k: number) => analyse(scaleShape(s, k), outerMesh(scaleShape(s, k)), noDriver).net;
    const k = solveScale(netAt, 0.05); rel(netAt(k), 0.05, 0.01);
  });
  it("old project JSON (no shape) migrates to classic, unchanged", () => {
    const s = upgradeShape(undefined); expect(s.mode).toBe("classic");
    const kept = upgradeShape({ mode: "preset", preset: { kind: "wedge1", W: 1 } }); expect(kept.preset.kind).toBe("wedge1"); expect(kept.preset.H).toBe(defaultPreset().H);
  });
});
describe("placement on a fan-closed scan end", () => {
  it("room behind a driver placed exactly on a fan centre is the full inside length", () => {
    const truth = presetMesh({ ...defaultPreset(), fillet: 0, kind: "cylinder", dia: 400, len: 700, axis: "x" });
    const open: Mesh = { v: truth.v, t: truth.t.filter((t) => !t.every((i) => truth.v[i][0] < -0.349)) };
    const r = processScan({ v: open.v.map((p) => p.map((x) => x * 1000) as V3), t: open.t }, { ...defaultScan(), unit: "mm" });
    const s = { ...defaultShape(), mode: "scan" as const, material: "fibreglass" as const };
    const a = analyse(s, r.mesh, noDriver);
    expect(a.driver!.panel).toMatch(/Left|Right/); expect(a.driver!.roomM).toBeCloseTo(0.688, 3);
  });
});
