// Free-form box analysis: outer mesh → inner (air) mesh after wall/shell thickness → net volume, standing waves, panels,
// driver and port placement checks, fibreglass quantities. Lengths in the spec are mm (as stored in project JSON); results in SI.
import { area, bbox, longestChord, Mesh, offsetInward, P2, rayHits, scaleMesh, V3, volume, watertight, mul3 } from "./mesh";
import { defaultPoints, defaultPreset, defaultProfile, PointsSpec, presetMesh, PresetSpec, profileMesh, ProfileSpec, pointsMesh, ScanSpec } from "./shapes";
import { defaultFibre, FibreInputs, fibreEstimate, findPanels, fitsOnPanel, isFlatPanelled, Panel, panelPoint } from "./panels";
import { PortGeom, portDisplacement, portRadiusEq } from "./port";
import { panelMode } from "./volume";
import { defaultScan } from "./scan";

export type ShapeMode = "classic" | "preset" | "profile" | "points" | "scan";
export interface ShapeState {
  mode: ShapeMode; material: "wood" | "fibreglass";
  woodT: number; panelT: Record<string, number>; // mm; per-panel override by panel name
  fibre: FibreInputs; ringOuterMm: number; ringThickMm: number;
  preset: PresetSpec; profile: ProfileSpec; points: PointsSpec; scan: ScanSpec;
  driverPanel: string; driverU: number; driverV: number; portPanel: string; portU: number; portV: number; // mm from the panel centre
}
export const defaultShape = (): ShapeState => ({
  mode: "classic", material: "wood", woodT: 18, panelT: {}, fibre: defaultFibre(), ringOuterMm: 0, ringThickMm: 18,
  preset: defaultPreset(), profile: defaultProfile(), points: defaultPoints(), scan: defaultScan(),
  driverPanel: "", driverU: 0, driverV: 0, portPanel: "", portU: 0, portV: -120,
});
/** Fill in missing fields of a stored shape (old projects have none: they stay "classic", unchanged). */
export function upgradeShape(s: any): ShapeState {
  const d = defaultShape(); if (!s) return d;
  return { ...d, ...s, fibre: { ...d.fibre, ...(s.fibre ?? {}) }, preset: { ...d.preset, ...(s.preset ?? {}) }, profile: { ...d.profile, ...(s.profile ?? {}) },
    points: { ...d.points, ...(s.points ?? {}) }, scan: { ...d.scan, ...(s.scan ?? {}) }, panelT: { ...(s.panelT ?? {}) } };
}

/** Outer mesh for the non-classic modes (scan meshes are produced by scan.ts and passed in). */
export function outerMesh(s: ShapeState, scanMesh?: Mesh): Mesh {
  switch (s.mode) {
    case "preset": return presetMesh(s.preset);
    case "profile": return profileMesh(s.profile);
    case "points": return pointsMesh(s.points);
    case "scan": if (!scanMesh) throw new Error("Load the scan file first"); return scanMesh;
    default: throw new Error("classic shape has no mesh");
  }
}
/** Every length of the shape multiplied by k (thicknesses unchanged). Used by Design to hit a target volume. */
export function scaleShape(s: ShapeState, k: number): ShapeState {
  const r = structuredClone(s) as ShapeState; const p = r.preset;
  for (const key of ["W", "H", "D", "Dtop", "Hb", "Wb", "A", "B", "dia", "len"] as const) p[key] = Math.round(p[key] * k);
  r.profile.width = Math.round(r.profile.width * k);
  for (const list of [r.profile.pts, r.profile.pts2]) for (const q of list) { q.d = Math.round(q.d * k); q.h = Math.round(q.h * k); q.arc = Math.round(q.arc * k); }
  r.points.pts = r.points.pts.map((q) => q.map((x) => Math.round(x * k)) as V3);
  return r;
}

export interface Placement { panel: string; centres: V3[]; normal: V3; fits: boolean; roomM: number; uv: P2[] }
export interface FreeformInputs {
  drivers: number; driverCutout: number; driverOuter: number; driverDepth: number; driverDisp: number; // m, m³
  port?: PortGeom; bracesM3: number; otherM3: number; insertsM3: number; fillPct: number;
}
export interface FreeformResult {
  outer: Mesh; inner: Mesh; closed: boolean; flipped: number;
  grossOuter: number; grossInner: number; areaOuter: number; areaInner: number;
  chord: { length: number; a: V3; b: V3; sampled: boolean }; sizeOuter: V3;
  panels: Panel[]; flat: boolean; panelT: (name: string) => number;
  panelModes: { name: string; a: number; b: number; t: number; hz: number }[];
  deductions: { driver: number; port: number; ring: number; braces: number; other: number; inserts: number };
  net: number; acoustic: number;
  driver?: Placement; portAt?: Placement; portFit?: { needM: number; roomM: number; ok: boolean; clearanceM: number };
  fibre?: ReturnType<typeof fibreEstimate>; notes: string[];
}

export function analyse(s: ShapeState, outer: Mesh, inp: FreeformInputs): FreeformResult {
  const notes: string[] = [];
  const w = watertight(outer);
  if (!w.closed) notes.push(`The shape is not a closed solid (${w.boundaryEdges} open edges): volumes are approximate.`);
  const panels = findPanels(outer);
  const flat = isFlatPanelled(panels);
  const fib = s.material === "fibreglass";
  const panelTmm = (name: string) => (fib ? s.fibre.shellMm : s.panelT[name] ?? s.woodT);
  const triPanel: string[] = []; for (const p of panels) for (const i of p.tris) triPanel[i] = p.name;
  const off = offsetInward(outer, (i) => panelTmm(triPanel[i]) / 1000);
  if (off.flipped) notes.push(`The wall/shell is too thick for part of this shape (${off.flipped} faces turned inside out): reduce the thickness or enlarge the shape.`);
  const inner = off.mesh;
  const grossInner = volume(inner);
  const chord = longestChord(inner);
  // placements
  const findPanel = (name: string) => panels.find((p) => p.name === name) ?? panels.find((p) => p.name === "Front") ?? [...panels].sort((a, b) => b.area - a.area)[0];
  const place = (name: string, u: number, v: number, n: number, r: number, spacing: number): Placement => {
    const p = findPanel(name);
    const uv: P2[] = Array.from({ length: n }, (_, i) => [u / 1000 + (i - (n - 1) / 2) * spacing, v / 1000] as P2);
    const centres = uv.map((q) => panelPoint(p, q));
    const fits = uv.every((q) => fitsOnPanel(p, q, r, 0.005));
    const into = mul3(p.normal, -1);
    let room = Infinity;
    for (const c of centres) { const h = rayHits(inner, c, into); room = Math.min(room, h.length >= 2 ? h[1] - h[0] : h.length === 1 ? h[0] : 0); }
    return { panel: p.name, centres, normal: p.normal, fits, roomM: room, uv };
  };
  const nDr = Math.max(1, inp.drivers);
  const driver = place(s.driverPanel, s.driverU, s.driverV, nDr, inp.driverOuter / 2, inp.driverOuter + 0.02);
  if (!driver.fits) notes.push(`The driver${nDr > 1 ? "s do" : " does"} not fit on the ${driver.panel} panel at that position (outer diameter ${(inp.driverOuter * 1000).toFixed(0)} mm): move it or pick another panel.`);
  if (inp.driverDepth > 0 && driver.roomM < inp.driverDepth + 0.01) notes.push(`Mounting depth ${(inp.driverDepth * 1000).toFixed(0)} mm, but only ${(driver.roomM * 1000).toFixed(0)} mm of room behind the ${driver.panel} panel there.`);
  let portAt: Placement | undefined, portFit: FreeformResult["portFit"];
  const p = inp.port;
  if (p) {
    const r = p.shape === "round" ? p.d! / 2 + (p.flare ?? 0) : Math.max(p.w!, p.h!) / 2;
    portAt = place(s.portPanel || driver.panel, s.portU, s.portV, p.count, r, 2 * r + 0.02);
    const tWall = panelTmm(portAt.panel) / 1000;
    const clearance = p.shape === "round" ? p.d! : p.h!; // rule of thumb: one port diameter (slot: its height) to the wall; UNVERIFIED
    const need = Math.max(0, p.length - tWall) + clearance;
    portFit = { needM: need, roomM: portAt.roomM, ok: need <= portAt.roomM && portAt.fits, clearanceM: clearance };
    if (!portAt.fits) notes.push(`The port opening does not fit on the ${portAt.panel} panel at that position.`);
    if (portAt.panel === driver.panel && portAt.uv.some((a) => driver.uv.some((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < r + inp.driverOuter / 2 + 0.01)))
      notes.push(`The port opening overlaps the driver on the ${driver.panel} panel: move the port (Port: across / up) or put it on another panel.`);
    if (need > portAt.roomM) notes.push(`Port does not fit straight: it needs ${(need * 1000).toFixed(0)} mm (length inside + ${(clearance * 1000).toFixed(0)} mm clear at the end, rule of thumb) but there is ${(portAt.roomM * 1000).toFixed(0)} mm from the ${portAt.panel} panel to the opposite wall. Use an elbow, a slot along a wall, or a smaller port.`);
    void portRadiusEq;
  }
  // deductions
  const tAvg = fib ? s.fibre.shellMm / 1000 : s.woodT / 1000;
  const ringAnn = fib && s.ringOuterMm > 0 ? Math.PI * ((s.ringOuterMm / 2000) ** 2 - (inp.driverCutout / 2) ** 2) : 0;
  const ring = Math.max(0, ringAnn * Math.max(0, s.ringThickMm / 1000 - tAvg)) * nDr;
  const ded = { driver: inp.driverDisp * nDr, port: p ? portDisplacement(p, tAvg) : 0, ring, braces: inp.bracesM3, other: inp.otherM3, inserts: inp.insertsM3 };
  const net = grossInner - Object.values(ded).reduce((a, b) => a + b, 0);
  // panel resonance: flat wood panels only (bounding rectangle in the panel plane: conservative, larger than the real panel)
  const panelModes = !fib && flat ? panels.map((q) => { const t = panelTmm(q.name) / 1000; return { name: q.name, a: q.size[0], b: q.size[1], t, hz: panelMode(q.size[0], q.size[1], t) }; }) : [];
  if (!fib && !flat) notes.push("This shape has curved or many small faces: it cannot be built from flat wood panels as drawn. Use fibreglass, bent plywood or kerfed MDF; the panel cut sheet and panel-resonance check are skipped.");
  const res: FreeformResult = {
    outer, inner, closed: w.closed, flipped: off.flipped, grossOuter: volume(outer), grossInner, areaOuter: area(outer), areaInner: area(inner),
    chord, sizeOuter: bbox(outer).size, panels, flat, panelT: (n) => panelTmm(n) / 1000, panelModes,
    deductions: ded, net, acoustic: net * (1 + inp.fillPct / 100), driver, portAt, portFit, notes,
  };
  if (fib) res.fibre = fibreEstimate(res.areaOuter, s.fibre);
  return res;
}
/** Scale factor (bisection) that makes the net volume equal target (m³). netAt(k) must grow with k. */
export function solveScale(netAt: (k: number) => number, target: number): number {
  let lo = 0.2, hi = 5;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (netAt(m) < target) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}
export { scaleMesh };
