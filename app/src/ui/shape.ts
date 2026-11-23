// "Shape" panel shared by the Design and Fix tabs: classic W×H×D, presets, side profile × width, corner points, 3D scan;
// wood or fibreglass; driver/port placement on any panel. Also computes (and caches) the free-form analysis of a project.
import { Driver } from "../engine/driver";
import { analyse, FreeformResult, outerMesh, ShapeState, upgradeShape } from "../engine/freeform";
import { Mesh, V3 } from "../engine/mesh";
import { processScan, ScanReport, guessUnit } from "../engine/scan";
import { PresetKind, profilePolygon } from "../engine/shapes";
import { parseMeshFile, writeSTLBinary } from "../io/meshio";
import { $, bindFields, esc, f1, field, fmtL, fmtMm, select } from "./dom";
import { Project, toPort } from "./model";
import { FreeModel } from "./view3d";

export interface ShapeCtx { api: (path: string, init?: RequestInit) => Promise<any>; status: (msg: string, cls?: string) => void; projectName: () => string }

// ---------- scan files (kept on the server under data/projects/<project>/exports/scan_*) ----------
const scanRaw = new Map<string, Mesh>();
const scanLoading = new Set<string>();
export async function uploadScan(file: File, ctx: ShapeCtx, s: ShapeState): Promise<string> {
  const buf = await file.arrayBuffer();
  const raw = parseMeshFile(file.name, buf);
  const ext = file.name.toLowerCase().split(".").pop();
  const name = ("scan_" + file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_")).slice(0, 80) + "." + ext;
  await ctx.api(`projects/${ctx.projectName()}/exports/${name}`, { method: "PUT", body: new Blob([buf]) });
  scanRaw.set(ctx.projectName() + "/" + name, raw);
  s.scan.file = name; s.scan.unit = guessUnit(raw);
  return `${file.name}: ${raw.t.length} triangles, ${raw.v.length} points; unit guessed as ${s.scan.unit} (check it).`;
}
async function fetchScan(key: string, ctx: ShapeCtx, rerender: () => void) {
  if (scanLoading.has(key)) return; scanLoading.add(key);
  try {
    const r = await fetch("/api/projects/" + key.replace("/", "/exports/"));
    if (!r.ok) throw new Error(String(r.status));
    scanRaw.set(key, parseMeshFile(key, await r.arrayBuffer())); rerender();
  } catch (e) { ctx.status("Could not load the scan file " + key + ": " + (e as Error).message, "bad"); }
}

// ---------- analysis (cached) ----------
let cache: { key: string; res?: FreeformResult; err?: string; scan?: ScanReport } = { key: "" };
export function driverSizes(d?: Driver) {
  const sd = d?.params.Sd ?? 0.05;
  const outer = d?.params.dia ?? Math.sqrt(sd / Math.PI) * 2 * 1.25;
  return { outer, cutout: d?.params.cutout ?? outer * 0.9, depth: d?.params.depth ?? outer * 0.5, disp: d?.params.displacement ?? 0 };
}
/** Free-form analysis of the project (undefined for classic shapes). err/scan report via lastShapeInfo(). */
export function computeFF(p: Project, d: Driver | undefined, ctx?: ShapeCtx, rerender?: () => void, kind = p.kind): FreeformResult | undefined {
  const s = (p.shape ??= upgradeShape(undefined));
  if (s.mode === "classic") { cache = { key: "" }; return undefined; }
  const scanKey = p.name + "/" + s.scan.file;
  const key = JSON.stringify([s, p.drivers, kind, p.port, p.geom.bracesL, p.geom.otherL, p.geom.insertsL, p.geom.fillPct, d?.id, s.mode === "scan" ? scanRaw.has(scanKey) : 0]);
  if (cache.key === key) return cache.res;
  cache = { key };
  try {
    let scanMesh: Mesh | undefined;
    if (s.mode === "scan") {
      if (!s.scan.file) throw new Error("Choose a scan file (.stl, .obj or .ply).");
      const raw = scanRaw.get(scanKey);
      if (!raw) { if (ctx && rerender) fetchScan(scanKey, ctx, rerender); throw new Error("Loading the scan file…"); }
      const r = processScan(raw, s.scan); scanMesh = r.mesh; cache.scan = r.report;
    }
    const z = driverSizes(d);
    cache.res = analyse(s, outerMesh(s, scanMesh), { drivers: p.drivers, driverCutout: z.cutout, driverOuter: z.outer, driverDepth: z.depth, driverDisp: z.disp,
      port: kind === "vented" ? toPort(p) : undefined, bracesM3: p.geom.bracesL / 1000, otherM3: p.geom.otherL / 1000, insertsM3: p.geom.insertsL / 1000, fillPct: p.geom.fillPct });
  } catch (e) { cache.err = (e as Error).message; }
  return cache.res;
}
export const lastShapeInfo = () => ({ err: cache.err, scan: cache.scan });
export function freeModel(p: Project, ff: FreeformResult, d: Driver | undefined, kind = p.kind): FreeModel {
  const z = driverSizes(d); const port = kind === "vented" ? toPort(p) : undefined;
  return { outer: ff.outer, inner: ff.inner, material: p.shape!.material, ring: p.shape!.material === "fibreglass" ? p.shape!.ringOuterMm / 1000 : 0,
    drivers: { centres: ff.driver!.centres, normal: ff.driver!.normal, outer: z.outer, cutout: z.cutout, depth: z.depth },
    ports: port && ff.portAt ? { centres: ff.portAt.centres, normal: ff.portAt.normal, shape: port.shape, d: port.d, w: port.w, h: port.h, length: port.length, fits: ff.portFit ? ff.portFit.ok : undefined } : undefined,
    chord: [ff.chord.a, ff.chord.b] };
}

// ---------- panel HTML ----------
const MODES: [string, string][] = [["classic", "Rectangle / wedge from W × H × D (classic)"], ["preset", "Shape presets: triangle, trapezoid, wedges, tube, rounded"], ["profile", "Side profile × width (boot, under-seat)"], ["points", "Corner points (any solid, no two sides alike)"], ["scan", "3D scan of the space (.stl / .obj / .ply)"]];
const PRESETS: [PresetKind, string][] = [["rect", "Rectangle"], ["wedge1", "Wedge 1 (sloped back)"], ["wedge2", "Wedge 2 (sloped back + sloped top)"], ["trapezoid", "Trapezoid (narrower at the back)"], ["corner", "Triangle / corner prism"], ["cylinder", "Cylinder / tube"]];

export function shapePanelHtml(p: Project): string {
  const s = (p.shape ??= upgradeShape(undefined));
  let h = `<fieldset id="fsShape"><legend>Shape</legend><div id="shTop">${select("mode", s.mode, MODES, "How to give the shape")}`;
  if (s.mode === "classic") return h + `</div><div class="hint">Classic box: enter the outside width, height and depth below. Pick another way above for triangles, curves, boot profiles, any corner points or a 3D scan.</div></fieldset>`;
  h += select("material", s.material, [["wood", "Wood (flat panels)"], ["fibreglass", "Fibreglass (moulded shell)"]], "Material") + `</div>`;
  if (s.mode === "preset") {
    const q = s.preset; const k = q.kind;
    h += `<div id="shPreset">${select("kind", k, PRESETS, "Preset")}`;
    if (k === "rect") h += field("Width", q, "W", "mm") + field("Height", q, "H", "mm") + field("Depth", q, "D", "mm");
    if (k === "wedge1") h += field("Width", q, "W", "mm") + field("Height", q, "H", "mm") + field("Depth at the bottom", q, "D", "mm") + field("Depth at the top", q, "Dtop", "mm");
    if (k === "wedge2") h += field("Width", q, "W", "mm") + field("Height at the front", q, "H", "mm") + field("Height at the back", q, "Hb", "mm") + field("Depth at the bottom", q, "D", "mm") + field("Depth at the back's top edge", q, "Dtop", "mm");
    if (k === "trapezoid") h += field("Width at the front", q, "W", "mm") + field("Width at the back", q, "Wb", "mm") + field("Height", q, "H", "mm") + field("Depth", q, "D", "mm");
    if (k === "corner") h += field("Wall A (left, from the corner)", q, "A", "mm") + field("Wall B (right, from the corner)", q, "B", "mm") + field("Angle between the walls", q, "angle", "°") + field("Height", q, "H", "mm");
    if (k === "cylinder") h += field("Diameter", q, "dia", "mm") + field("Length", q, "len", "mm") + select("axis", q.axis, [["x", "Lying across (left-right)"], ["z", "Lying front-to-back"], ["y", "Standing up"]], "Direction");
    h += field("Rounded edges: radius", q, "fillet", "mm", { title: "Rounds every edge and corner (Minkowski rounding). 0 = sharp." }) + `</div>`;
  }
  if (s.mode === "profile") {
    const q = s.profile;
    h += `<div id="shProfile">${field("Width (left to right)", q, "width", "mm")}${field("Round the profile corners: radius", q, "fillet", "mm")}${field("Different profile at the right side (taper)", q, "taper")}</div>
      <div class="hint">Side view: depth back from the front face, height up from the floor, one row per corner, in order around the outline. "Arc" = how far a segment bows out (0 = straight; negative bows in). Click the grid to add a corner.</div>
      ${ptsTable("pts", q.pts, q.taper ? "Left side" : "Profile")}${q.taper ? ptsTable("pts2", q.pts2, "Right side") : ""}<div id="profSvg">${profileSvg(q.pts, q.taper ? q.pts2 : undefined)}</div>`;
  }
  if (s.mode === "points") {
    const q = s.points;
    h += `<div class="hint">Every corner as x (left-right), y (up), z (front 0, back negative), in mm. With no faces the app wraps the corners in the smallest convex solid. For dents or L-shapes, list each face's corners (numbers from the table, in order around the face), one face per line.</div>
      <table class="pts" id="ptsXYZ"><tr><th>#</th><th>x</th><th>y</th><th>z</th><th></th></tr>${q.pts.map((r, i) => `<tr><td>${i + 1}</td>${r.map((v, j) => `<td><input type="number" step="any" data-r="${i}" data-c="${j}" value="${v}"></td>`).join("")}<td><button data-del="${i}">−</button></td></tr>`).join("")}</table>
      <div class="toolbar"><button id="ptAdd">+ corner</button></div>
      <div class="row"><label>Faces (optional)</label></div><textarea id="ptFaces" rows="3" style="width:100%" placeholder="e.g. 1 2 3 4">${esc(q.faces)}</textarea>`;
  }
  if (s.mode === "scan") {
    const q = s.scan; const info = lastShapeInfo().scan;
    h += `<div class="toolbar"><label>Scan file <input type="file" id="scanFile" accept=".stl,.obj,.ply"></label> <span class="muted">${esc(q.file || "none loaded")}</span></div>
      <div id="shScan">${select("unit", q.unit, [["mm", "millimetres"], ["cm", "centimetres"], ["m", "metres"], ["in", "inches"]], "Units in the file")}${select("upAxis", q.upAxis, [["y", "Y is up"], ["z", "Z is up (most scanners, Blender)"]], "Up direction")}
      ${select("axis", q.axis, [["none", "no check"], ["x", "width (X)"], ["y", "height (Y)"], ["z", "depth (Z)"]], "Scale check: I measured the")}${q.axis !== "none" ? field("with a tape measure as", q, "measuredMm", "mm") : ""}
      ${field("Simplify big scans (over 40,000 triangles)", q, "simplify")}${field("Crop to a box", q, "crop")}</div>
      ${q.crop ? `<div id="shCrop">${["x", "y", "z"].map((a, k) => `<div class="row"><label>Keep ${a} from / to</label><input type="number" step="any" data-crop="min" data-k="${k}" value="${q.cropMin[k]}"> <input type="number" step="any" data-crop="max" data-k="${k}" value="${q.cropMax[k]}"><span class="u">mm</span></div>`).join("")}</div>` : ""}
      ${info ? `<div class="hint">Scan: ${info.trianglesIn} triangles in, ${info.trianglesOut} used; size ${info.sizeMm.map((x) => fmtMm(x)).join(" × ")}; ${info.closed ? "closed solid" : "NOT closed"}. ${info.notes.map(esc).join(" ")}</div>` : ""}
      <div class="hint">The scan is the shape of the space (outside of the box). The inside volume is worked out after the shell/panel thickness. Phone LiDAR scale can be off by several percent: always do the scale check.</div>`;
  }
  if (s.material === "wood") {
    h += `<div id="shWood">${field("Panel thickness", s, "woodT", "mm")}</div><div class="hint">Different thickness on one panel (e.g. a double baffle): set it in the panel list below the volume table.</div>`;
  } else {
    const f = s.fibre;
    h += `<div id="shFibre">${field("Shell thickness", f, "shellMm", "mm")}${field("Mat weight", f, "matGsm", "g/m²", { title: "Chopped strand mat; 450 g/m² is common" })}${field("Laminate per mat layer", f, "mmPerLayer", "mm", { title: "Assumption: about 1 mm per 450 g/m² layer; check your materials" })}${field("Resin per kg of mat", f, "resinPerGlass", "kg", { title: "Assumption: about 2.3 kg polyester resin per kg of mat; check the resin maker's data" })}${field("Overlap and waste", f, "wastePct", "%")}</div>
      <div id="shRing">${field("MDF ring outside diameter (0 = none)", s, "ringOuterMm", "mm")}${field("MDF ring thickness", s, "ringThickMm", "mm")}</div>`;
  }
  const res = cache.res; const names = res ? res.panels.map((x) => x.name) : [];
  const opt = (v: string) => [["", "Automatic (front or largest)"], ...names.map((n) => [n, n])] as [string, string][];
  h += `<div id="shPlace">${select("driverPanel", s.driverPanel, opt(s.driverPanel), "Driver on panel")}${field("Driver: across (from panel centre)", s, "driverU", "mm")}${field("Driver: up (from panel centre)", s, "driverV", "mm")}
    ${select("portPanel", s.portPanel, opt(s.portPanel), "Port on panel")}${field("Port: across", s, "portU", "mm")}${field("Port: up", s, "portV", "mm")}</div>`;
  const err = lastShapeInfo().err;
  return h + (err ? `<p class="bad">${esc(err)}</p>` : "") + `</fieldset>`;
}
function ptsTable(key: string, pts: { d: number; h: number; arc: number }[], title: string) {
  return `<table class="pts" data-pts="${key}"><tr><th colspan="5">${title}</th></tr><tr><th>#</th><th>depth</th><th>height</th><th>arc to next</th><th></th></tr>${pts.map((r, i) => `<tr><td>${i + 1}</td>${(["d", "h", "arc"] as const).map((c) => `<td><input type="number" step="any" data-r="${i}" data-c="${c}" value="${r[c]}"></td>`).join("")}<td><button data-del="${i}">−</button></td></tr>`).join("")}</table><div class="toolbar"><button data-add="${key}">+ corner</button></div>`;
}
function profileSvg(a: { d: number; h: number; arc: number }[], b?: { d: number; h: number; arc: number }[]) {
  const W = 360, H = 220, pad = 20;
  const all = [...a, ...(b ?? [])]; const maxD = Math.max(600, ...all.map((p) => p.d)) * 1.1, maxH = Math.max(400, ...all.map((p) => p.h)) * 1.1;
  const k = Math.min((W - 2 * pad) / maxD, (H - 2 * pad) / maxH);
  const X = (d: number) => W - pad - d * k, Y = (h: number) => H - pad - h * k; // front on the right, like looking at the car's left side
  let grid = ""; for (let d = 0; d <= maxD; d += 100) grid += `<line x1="${X(d)}" y1="${Y(0)}" x2="${X(d)}" y2="${Y(maxH)}" stroke="#444"/>`; for (let hh = 0; hh <= maxH; hh += 100) grid += `<line x1="${X(0)}" y1="${Y(hh)}" x2="${X(maxD)}" y2="${Y(hh)}" stroke="#444"/>`;
  const poly = (pts: typeof a, col: string) => { if (pts.length < 2) return ""; try { const P = profilePolygon(pts).poly; return `<polygon points="${P.map(([d, h]) => `${X(d * 1000)},${Y(h * 1000)}`).join(" ")}" fill="${col}33" stroke="${col}"/>` + pts.map((p, i) => `<text x="${X(p.d) + 3}" y="${Y(p.h) - 3}" font-size="10" fill="${col}">${i + 1}</text>`).join(""); } catch { return ""; } };
  return `<svg id="profGrid" width="${W}" height="${H}" data-k="${k}" data-w="${W}" data-h="${H}" data-pad="${pad}" style="background:#2a2a2a;cursor:crosshair">${grid}${poly(a, "#f7b731")}${b ? poly(b, "#45aaf2") : ""}<text x="${W - pad}" y="${H - 4}" font-size="10" fill="#aaa" text-anchor="end">front →  (grid 100 mm)</text></svg>`;
}

/** Wire the panel's inputs. onChange re-renders the page. */
export function bindShapePanel(p: Project, ctx: ShapeCtx, onChange: () => void) {
  const s = p.shape!; const root = $("#fsShape"); if (!root) return;
  const b = (sel: string, obj: any) => { const el = $(sel, root); if (el) bindFields(el, obj, onChange); };
  b("#shTop", s); b("#shPreset", s.preset); b("#shProfile", s.profile); b("#shScan", s.scan); b("#shWood", s); b("#shFibre", s.fibre); b("#shRing", s); b("#shPlace", s);
  root.querySelectorAll<HTMLTableElement>("table[data-pts]").forEach((tb) => {
    const list = (s.profile as any)[tb.dataset.pts!] as { d: number; h: number; arc: number }[];
    tb.querySelectorAll<HTMLInputElement>("input[data-r]").forEach((i) => i.onchange = () => { (list[+i.dataset.r!] as any)[i.dataset.c!] = (parseFloat(i.value) || 0); onChange(); });
    tb.querySelectorAll<HTMLButtonElement>("button[data-del]").forEach((bt) => bt.onclick = () => { if (list.length > 3) { list.splice(+bt.dataset.del!, 1); onChange(); } });
  });
  root.querySelectorAll<HTMLButtonElement>("button[data-add]").forEach((bt) => bt.onclick = () => { const list = (s.profile as any)[bt.dataset.add!] as any[]; const last = list[list.length - 1]; list.push({ d: last.d, h: last.h + 50, arc: 0 }); onChange(); });
  const svg = $("#profGrid", root);
  if (svg) svg.onclick = (e) => {
    const r = svg.getBoundingClientRect(); const k = +svg.dataset.k!, W = +svg.dataset.w!, H = +svg.dataset.h!, pad = +svg.dataset.pad!;
    const d = Math.round(((W - pad) - (e.clientX - r.left)) / k / 10) * 10, h = Math.round(((H - pad) - (e.clientY - r.top)) / k / 10) * 10;
    s.profile.pts.push({ d: Math.max(0, d), h: Math.max(0, h), arc: 0 }); if (s.profile.taper) s.profile.pts2.push({ d: Math.max(0, d), h: Math.max(0, h), arc: 0 }); onChange();
  };
  const xyz = $("#ptsXYZ", root);
  if (xyz) {
    xyz.querySelectorAll<HTMLInputElement>("input[data-r]").forEach((i) => i.onchange = () => { s.points.pts[+i.dataset.r!][+i.dataset.c!] = parseFloat(i.value) || 0; onChange(); });
    xyz.querySelectorAll<HTMLButtonElement>("button[data-del]").forEach((bt) => bt.onclick = () => { if (s.points.pts.length > 4) { s.points.pts.splice(+bt.dataset.del!, 1); onChange(); } });
    $("#ptAdd", root).onclick = () => { const l = s.points.pts[s.points.pts.length - 1]; s.points.pts.push([l[0], l[1] + 50, l[2]] as V3); onChange(); };
    $<HTMLTextAreaElement>("#ptFaces", root).onchange = (e) => { s.points.faces = (e.target as HTMLTextAreaElement).value; onChange(); };
  }
  root.querySelectorAll<HTMLInputElement>("input[data-crop]").forEach((i) => i.onchange = () => { (i.dataset.crop === "min" ? s.scan.cropMin : s.scan.cropMax)[+i.dataset.k!] = parseFloat(i.value) || 0; onChange(); });
  const sf = $<HTMLInputElement>("#scanFile", root);
  if (sf) sf.onchange = async () => { const f = sf.files?.[0]; if (!f) return; try { ctx.status(await uploadScan(f, ctx, s), "ok"); onChange(); } catch (e) { ctx.status("Scan not loaded: " + (e as Error).message, "bad"); } };
}

/** Volume table and checks for a free-form box (HTML). */
export function freeformVolumeHtml(p: Project, ff: FreeformResult, fbTxt: string, cAir: number): string {
  const s = p.shape!; const fib = s.material === "fibreglass"; const D = ff.deductions;
  const fm = cAir / (2 * ff.chord.length);
  let h = `<h2>Volume (${fib ? "fibreglass" : "wood"}, ${esc(s.mode)})</h2><table class="kv">
    <tr><td>Outside size (bounding box)</td><td class="num">${ff.sizeOuter.map((x) => fmtMm(x * 1000)).join(" × ")} (W × H × D)</td></tr>
    <tr><td>Volume inside the outside surface</td><td class="num">${fmtL(ff.grossOuter * 1000)}</td></tr>
    <tr><td>Inside (air) volume after ${fib ? `the ${fmtMm(s.fibre.shellMm, 1)} shell` : `the ${fmtMm(s.woodT)} panels`}</td><td class="num" id="ffGross">${fmtL(ff.grossInner * 1000, 2)}</td></tr>
    <tr><td>− driver(s) ${D.driver ? "" : '<span class="warn">(driver displacement not entered)</span>'}</td><td class="num">${fmtL(D.driver * 1000, 2)}</td></tr>
    <tr><td>− port, braces, inserts, other${fib ? ", MDF ring" : ""}</td><td class="num">${fmtL((D.port + D.braces + D.inserts + D.other + D.ring) * 1000, 2)}</td></tr>
    <tr><td><b>Net volume</b> (acoustic with fill)</td><td class="num" id="ffNet"><b>${fmtL(ff.net * 1000, 2)}</b> (${fmtL(ff.acoustic * 1000, 2)})</td></tr>${fbTxt}
    <tr><td>Longest straight line inside${ff.chord.sampled ? " (sampled)" : ""}</td><td class="num">${fmtMm(ff.chord.length * 1000)} → first standing wave ≈ ${f1(fm, 0)} Hz</td></tr>
    <tr><td>Outside surface area</td><td class="num">${f1(ff.areaOuter, 3)} m²</td></tr>
    <tr><td>Driver on</td><td class="num">${esc(ff.driver?.panel)} · ${ff.driver?.fits ? '<span class="ok">fits</span>' : '<span class="bad">does not fit</span>'} · room behind ${fmtMm((ff.driver?.roomM ?? 0) * 1000)}</td></tr>
    ${ff.portFit ? `<tr><td>Port on ${esc(ff.portAt?.panel)}</td><td class="num">needs ${fmtMm(ff.portFit.needM * 1000)} (incl. ${fmtMm(ff.portFit.clearanceM * 1000)} end clearance), room ${fmtMm(ff.portFit.roomM * 1000)} · ${ff.portFit.ok ? '<span class="ok">fits</span>' : '<span class="bad">does not fit</span>'}</td></tr>` : ""}`;
  if (ff.fibre) h += `<tr><td>Fibreglass estimate (assumptions above; an estimate, not a datasheet value)</td><td class="num">${ff.fibre.layers} layers · ${f1(ff.fibre.matM2, 1)} m² of mat (${f1(ff.fibre.matKg, 1)} kg) · resin ≈ ${f1(ff.fibre.resinKg, 1)} kg</td></tr>`;
  h += `</table>${ff.notes.map((n) => `<div class="warn">${esc(n)}</div>`).join("")}`;
  if (!fib && ff.flat) {
    h += `<h2>Panels (${ff.panels.length})</h2><table id="panelTable"><tr><th>Panel</th><th>Size (outside face)</th><th>Thickness</th><th>Joints: angle → blade tilt (mitre)</th><th>First mode</th></tr>${ff.panels.map((q) => {
      const m = ff.panelModes.find((x) => x.name === q.name);
      const joints = q.edges.filter((e) => e.neighbour >= 0).map((e) => `${f1(e.interiorDeg, 1)}°→<b class="${e.bladeDeg > 45 ? "warn" : ""}">${f1(e.bladeDeg, 1)}°</b>`).join(", ");
      return `<tr><td>${esc(q.name)}</td><td class="num">${fmtMm(q.size[0] * 1000)} × ${fmtMm(q.size[1] * 1000)}</td><td><input type="number" step="any" data-pt="${esc(q.name)}" value="${s.panelT[q.name] ?? ""}" placeholder="${s.woodT}" style="width:5em"> mm</td><td>${joints}</td><td class="num ${m && m.hz < 200 ? "warn" : ""}">${m ? f1(m.hz, 0) + " Hz" : "–"}</td></tr>`;
    }).join("")}</table><div class="hint">Blade tilt is from square (0° = straight cut), for mitred joints where both panels are bevelled equally. Over 45° (marked) is beyond most table saws: use a jig, a router, or a butt joint with a filler strip. First mode: simply supported MDF over the rectangle around the panel (a low estimate; unverified material data).</div>`;
  }
  return h;
}
export function bindPanelThickness(p: Project, onChange: () => void) {
  document.querySelectorAll<HTMLInputElement>("#panelTable input[data-pt]").forEach((i) => i.onchange = () => {
    const v = parseFloat(i.value); if (isFinite(v) && v > 0) p.shape!.panelT[i.dataset.pt!] = v; else delete p.shape!.panelT[i.dataset.pt!]; onChange();
  });
}
export const innerSTL = (ff: FreeformResult) => writeSTLBinary(ff.inner, "inside_air");
export const outerSTL = (ff: FreeformResult) => writeSTLBinary(ff.outer, "mould_outer_surface");
