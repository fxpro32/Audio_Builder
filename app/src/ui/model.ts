// Project data (UI units: mm, L, W) and conversion to engine SI types.
import { Driver } from "../engine/driver";
import { ExistingBox, Power } from "../engine/diagnose";
import { PortGeom } from "../engine/port";
import { BoxGeom } from "../engine/volume";
import { Model3D } from "./view3d";
import { FreeformResult, ShapeState, upgradeShape } from "../engine/freeform";
import { Topology } from "../engine/network";
import { Wiring } from "../engine/coils";
import { CoilWiring } from "../engine/measure";

export interface Project {
  name: string; title: string; driverId?: string; drivers: number; kind: "sealed" | "vented";
  geom: { W: number; H: number; D: number; wedge: boolean; Dtop: number; t: number; baffleExtra: number; bracesL: number; otherL: number; insertsL: number; fillPct: number };
  port: { shape: "round" | "slot"; count: number; d: number; w: number; h: number; length: number; wall: number; flare?: number };
  power: { watts: number; impedance: number };
  cabin: { enabled: boolean; longestMm: number; slope: number; leakHz: number };
  lowpassHz: number; symptoms: string; notes: string;
  design?: DesignInputs;
  shape?: ShapeState;    // free-form shape; missing in old projects = "classic" W×H×D (migrated on load, unchanged)
  measuredBox?: MeasuredBox | null;     // box values fitted to a measured impedance sweep, in use for the analysis (A5_REW)
  measuredBoxPrev?: MeasuredBox | null; // the value before the last change, for Undo
  boardMaterial?: string; boardGrain?: boolean; // B7_PLYWOOD_BOARDS: board material on the Boards tab / BOM (engine/boardmat.ts; missing = MDF) and the plywood grain lock (missing = on)
  coil?: { driverId: string; wiring: Wiring; basis?: CoilWiring }; // coil wiring of a dual-coil driver (A4_HPDB); basis = user override of the published T/S basis
}
/** Fitted box (engine/boxfit.ts) as stored in a project. Vb per driver in litres. */
export interface MeasuredBox { kind: "sealed" | "vented"; VbPerL: number; fb?: number; QL: number; QA?: number; QP?: number; dRe: number; rmsPct: number; measurementId: string; fitted: string }
export interface DesignInputs {
  kind: "sealed" | "vented"; target: "qtc" | "qb3" | "sbb4" | "custom"; qtc: number; customVbL: number; customFb: number;
  maxW: number; maxH: number; maxD: number; t: number; wedge: boolean; topDepthPct: number;
  portShape: "round" | "slot"; portD: number; portW: number; portH: number; portCount: number; bracesL: number;
  portFlare?: number;    // mm flare radius of round ports (aeroport); 0 = straight
  topology?: Topology | "pr" | "tl"; // sealed/vented (= kind), "pr" = sealed box with passive radiators (A11), a bandpass type, or "tl" = transmission line (A15)
  isobaric?: boolean; isoWiring?: "parallel" | "series"; isoGapL?: number;
  V1?: number; V2?: number; V3?: number; fb1?: number; fb2?: number; fb3?: number; pa1?: number; pa2?: number; pa3?: number; // L, Hz, cm²
  // A11_AUTOSIZE (R32): maxW/maxH/maxD are the box's OUTSIDE sizes (sizing 2); older designs stored the space available and
  // had the depth solved: they are migrated on load to the depth the app showed (renderDesign).
  sizing?: 2; keepVolume?: boolean; lockW?: boolean; lockH?: boolean; lockD?: boolean;
  // passive radiators (topology "pr"): a driver of kind "passive" or values typed in (UI units: Sd cm², Mms g, Cms mm/N, Vas L, Xmax mm, dia mm, displacement L)
  prId?: string; prCount?: number; prAuto?: boolean; prMassG?: number; prCustom?: Record<string, number>;
  preset?: string; // B1_SHELL: last preset applied (home / computer sections, app/src/ui/sections.ts)
  tl?: TLDesign; // A15_TLINE (R36): transmission line; missing in older projects (filled with a suggested line when TL is chosen)
}
/** Transmission line design (UI units: mm, kg/m³, %, L, Hz). Panel thickness is DesignInputs.t, drivers Project.drivers. */
export interface TLDesign {
  W: number; H: number; D: number; channels: number; taper: number; driverY: number; stuffKgM3: number; stuffPct: number; subHz: number;
  cmpSealedL: number; cmpPortedL: number; cmpPortD: number; cmpPortLen: number; // comparison boxes: gross litres incl. the driver; port mm (length 0 = tuned to the alignment)
}

/** driverId: the user's default driver (data/private/settings.json) for a new project; omitted = none chosen. */
export const blankProject = (name: string, title: string, driverId?: string): Project => ({
  name, title, ...(driverId ? { driverId } : {}), drivers: 1, kind: "vented",
  geom: { W: 600, H: 400, D: 500, wedge: false, Dtop: 350, t: 18, baffleExtra: 0, bracesL: 0, otherL: 0, insertsL: 0, fillPct: 0 },
  port: { shape: "round", count: 1, d: 100, w: 300, h: 50, length: 200, wall: 3 },
  power: { watts: 300, impedance: 4 },
  cabin: { enabled: false, longestMm: 2500, slope: 12, leakHz: 15 },
  lowpassHz: 80, symptoms: "", notes: "", shape: upgradeShape(undefined),
});
/** Migrate a stored project: fill every field added since it was saved (old projects keep their classic box unchanged). */
export function upgradeProject(p: any): Project {
  const b = blankProject(p.name, p.title);
  return { ...b, ...p, geom: { ...b.geom, ...p.geom }, port: { ...b.port, ...p.port }, power: { ...b.power, ...p.power }, cabin: { ...b.cabin, ...p.cabin }, shape: upgradeShape(p.shape) };
}

export const DEFAULT_PROJECTS: Project[] = [
  { ...blankProject("existing_sub", "Existing subwoofer (fix the box)"), symptoms: "New sub in a box built for a different one: sounds like waves bouncing around, rattles. Box probably too large." },
  blankProject("car_system", "Car system"),
];

const mm = (v: number) => v / 1000;
export function toGeom(p: Project): BoxGeom {
  const g = p.geom;
  return { W: mm(g.W), H: mm(g.H), D: mm(g.D), Dtop: g.wedge ? mm(g.Dtop) : undefined, t: mm(g.t), baffleExtra: mm(g.baffleExtra),
    braces: g.bracesL / 1000, other: g.otherL / 1000, inserts: g.insertsL / 1000, fillFactor: g.fillPct / 100 };
}
export function toPort(p: Project): PortGeom {
  const q = p.port;
  return { shape: q.shape, count: q.count, d: mm(q.d), w: mm(q.w), h: mm(q.h), length: mm(q.length), wall: mm(q.wall), flare: q.shape === "round" && q.flare ? mm(q.flare) : undefined };
}
/** Box geometry for the engine; a free-form analysis (if given) replaces the W×H×D volume, modes, panels and port room. */
export function toGeomFF(p: Project, ff?: FreeformResult): BoxGeom {
  const g = toGeom(p);
  if (!ff) return g;
  const fib = p.shape?.material === "fibreglass";
  return { ...g, t: fib ? (p.shape!.fibre.shellMm / 1000) : p.shape!.woodT / 1000, baffleExtra: 0, Dtop: undefined, gross: ff.grossInner, chord: ff.chord.length, other: g.other! + ff.deductions.ring,
    panels: ff.panelModes.map((q) => ({ name: q.name, a: q.a, b: q.b, t: q.t })), portRoom: ff.portFit?.roomM };
}
export function toExisting(p: Project, ff?: FreeformResult): ExistingBox {
  const m = p.measuredBox && p.measuredBox.kind === p.kind ? p.measuredBox : undefined;
  return { geom: toGeomFF(p, ff), kind: p.kind, port: p.kind === "vented" ? toPort(p) : undefined, drivers: p.drivers,
    fitted: m ? { VbPer: m.VbPerL / 1000, fb: m.fb, QL: m.QL, QA: m.QA, QP: m.QP } : undefined };
}
export function toPower(p: Project, cAir: number): Power {
  return { wattsPerDriver: p.power.watts, impedance: p.power.impedance, lowpassHz: p.lowpassHz,
    cabin: p.cabin.enabled ? { enabled: true, cornerHz: cAir / (2 * mm(p.cabin.longestMm)), slopeDbPerOct: p.cabin.slope, leakHz: p.cabin.leakHz } : undefined };
}
export function to3D(p: Project, d: Driver | undefined, insertM3 = 0, kind = p.kind): Model3D {
  const g = toGeom(p);
  const sd = d?.params.Sd ?? 0.05;
  const dia = d?.params.dia ?? Math.sqrt(sd / Math.PI) * 2 * 1.25;
  const cut = d?.params.cutout ?? dia * 0.9;
  return { W: g.W, H: g.H, D: g.D, Dtop: g.Dtop, t: g.t, baffleExtra: g.baffleExtra,
    drivers: { count: p.drivers, outer: dia, cutout: cut, depth: d?.params.depth ?? dia * 0.5 },
    port: kind === "vented" ? toPort(p) as any : undefined, insertVolume: insertM3 };
}

/** Panel cut list (butt joints: sides full size; top/bottom between sides; baffle and back between top and bottom). mm. */
export function cutList(p: Project, holes = "driver + port cut-outs"): { name: string; qty: number; a: number; b: number; note: string; trap?: { bottom: number; top: number } }[] {
  const g = p.geom; const Wi = g.W - 2 * g.t, Hi = g.H - 2 * g.t; const Dt = g.wedge ? g.Dtop : g.D;
  const out: { name: string; qty: number; a: number; b: number; note: string; trap?: { bottom: number; top: number } }[] = [
    { name: "Side", qty: 2, a: g.D, b: g.H, note: g.wedge ? `trapezoid: bottom ${g.D}, top ${Dt}` : "", ...(g.wedge && Math.abs(g.D - Dt) > 0.5 ? { trap: { bottom: g.D, top: Dt } } : {}) }, // A13: real outline for the Boards tab
    { name: "Bottom", qty: 1, a: Wi, b: g.D, note: "" },
    { name: "Top", qty: 1, a: Wi, b: Dt, note: "" },
    { name: "Front baffle", qty: 1, a: Wi, b: Hi, note: holes },
    { name: "Back", qty: 1, a: Wi, b: Math.round(Math.hypot(Hi, g.D - Dt)), note: g.wedge ? "bevel top and bottom edges" : "" },
  ];
  if (g.baffleExtra > 0) out.push({ name: "Second baffle", qty: 1, a: Wi, b: Hi, note: `${g.baffleExtra} mm, glued to the front baffle` });
  return out;
}
