// Audio Builder web UI: welcome page, start menu, sections (B1_SHELL, R37/R42/R43); per section: Design new,
// Analyse/Fix/Tweak, Boards, Door speakers, Infinite baffle, Drivers, Project / Item, Help.
import "./style.css";
import { AIR_PRESETS, Air } from "../engine/air";
import { complete, crossCheck, Driver, FullParams, driverPrices, driverPriceFrom } from "../engine/driver";
import { diagnose, Diagnosis, FixOption, subsonicFor } from "../engine/diagnose";
import { simulate, summarise, freqs, BoxSpec } from "../engine/model";
import { qb3, sbb4, sealed, sealedVbForQtc } from "../engine/alignments";
import { portArea, portLeff, portLengthFor, portDisplacement, portFb, PortGeom } from "../engine/port";
import { fitPort, PortFit, portLayout } from "../engine/portfit";
import { netVolume, internalDims, grossVolume } from "../engine/volume";
import { parseWdr, writeWdr, slug } from "../io/wdr";
import { parseCsv, rowsToDrivers } from "../io/csv";
import { plot, PALETTE, Series } from "./plot";
import { View3D } from "./view3d";
import { blankProject, cutList, DEFAULT_PROJECTS, Project, to3D, toExisting, toGeom, toPort, toPower, DesignInputs, upgradeProject, toGeomFF } from "./model";
import { $, esc, f1, store, field, bindFields, select, fixBind, download, units, setImperial, fmtMm, fmtL, readInput } from "./dom";
import { bindPanelThickness, bindShapePanel, computeFF, freeformVolumeHtml, freeModel, innerSTL, outerSTL, shapePanelHtml, ShapeCtx, driverSizes } from "./shape";
import { FreeformResult, scaleShape, solveScale, analyse, outerMesh } from "../engine/freeform";
import { panelDxf, panelSvg, Hole } from "../engine/cutsheet";
import { writeDXF } from "../io/meshio";
import { advancedDesign, seedAdvanced, topologyOptions, TOPOLOGY_INFO } from "./design2";
import { loadMeasurements, MeasCtx, overlaySeries, renderMeasPanel, setReference } from "./measure";
import { bindTsTool, tsToolHtml } from "./tsmeasure";
import { rewHelpHtml } from "./rewhelp";
import { bindCoil, coilRowsHtml, syncImpedance, wiredDriver } from "./coilui";
import { hasCoilChoice } from "../engine/coils";
import { bestSize, BaffleItem, BestResult, chooseLayout, grossL, holdVolume, HoldResult, Layout, layouts, Locks, minSizes, placeItems, Side, SIDES, Sizes, SizeSpec } from "../engine/autosize";
import { completePR, PRParams, prBranch, prMassFor, prTuning, prVdRatio } from "../engine/passive";
import { Topology } from "../engine/network";
import { BoardPanel, BoardSource, renderBoards } from "./boards";
import { itemMaterial, MaterialId } from "../engine/boardmat"; // B7_PLYWOOD_BOARDS
import { pieceFromOutline, piecesFromRows } from "../engine/nest";
import { countLine, isSubwoofer, pageInfo, PAGE_SIZE, sizeOf, SUB_MIN_IN, DRIVER_TYPES, driverType, findDriver, shadowedLibraryIds, typeLabel } from "./driverlist";
import { bindItemForm, ensurePartsFor, itemFormHtml, loadParts, partById, partsState, renderParts, setPartsCategory, PartsCtx } from "./partsui"; // B3_PARTS_DB
import { ITEM_FIELDS, PART_SECTION, partName } from "../engine/parts";
import { cmpTableHtml, runTL, tl3D, tlDefaults, tlFieldsHtml, tlHelpHtml, tlResultHtml, TL_ID, TL_NAME } from "./tlui"; // A15_TLINE
import { foldLine, suggestTL, TLSuggestion } from "../engine/tlfold";
import { driverFitsSection, isSection, PRESETS, Preset, SECTION_DEFAULT_DRIVER, SECTION_HELP, SECTIONS, sectionInfo, SectionId, sectionTopologies } from "./sections"; // B1_SHELL
import * as pv2 from "./projectv2"; // B1_SHELL: project model v2 (docs/project_model_v2.md)
import { onProjectSave } from "./hooks";
import { registerSystemReport, systemReport } from "../engine/sysreport"; // B4_SYSTEM_UI (R44)
import type { SystemReport } from "../engine/sysreport";
import type { SystemIssue } from "../engine/syscheck";
import { cableFor } from "../engine/sysmodel";
import type { CableLookups } from "../engine/cable";
import { alertDecision, applyIssue, dismissAlert, GateState, ItemMaker, plainItem, plainKindItem, Trigger } from "./syslogic"; // B4_SYSTEM_UI
import { alertOpen, closeAlert, refreshSystemDiagram, renderQuickCalc, renderSystem, setSystemFocus, showAlert, SysCtx } from "./systemui"; // B4_SYSTEM_UI
import { renderBom, currentBom, BomCtx } from "./bomui"; // B5_BOM (R42)
import type { BoxSource, BomLookups } from "../engine/bom";
import type { BomSourceNote } from "../io/bomexport";
import { PART_CATEGORIES } from "../engine/parts";
import { baffleOf, doorDefaults, ibBoardRows, ibDefaults, renderDoorPage, renderIBPage, SecCtx } from "./ibui"; // B2_SECTIONS
import { baffleStepHz, homeFacts, keepDepth, MIN_DEPTH_RATIO, RATIO_UPRIGHT, WHARFEDALE_RATIO, XOVER_2WAY_HZ } from "../engine/homebox"; // B2_SECTIONS // R44: the one place a later job (wiring diagram, missing parts) plugs into project saves

// ---------- helpers ----------
const api = async (path: string, init?: RequestInit) => { const r = await fetch("/api/" + path, init); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.headers.get("content-type")?.includes("json") ? r.json() : r.text(); };
const putJson = (path: string, body: unknown) => api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function status(msg: string, cls = "") { const s = $("#status"); if (!s) return; s.textContent = msg; s.className = "status " + cls; }

// ---------- state ----------
let drivers: Driver[] = [];
/** B3_PARTS_DB: old library ids -> new (car-subs supersedes hp-car-subs) and library copies of your own drivers (hidden in lists). */
let driverAliases: Record<string, string> = {};
let shadow = new Set<string>();
const refreshDriverMeta = () => { driverAliases = Object.assign({}, ...libraries.map((l: any) => l.aliases ?? {})); shadow = shadowedLibraryIds(drivers); };
let libraries: { source: string; title?: string; licence: string; url?: string; attribution: string; count: number; imported: string; method?: string; corrections?: string; listed_without_specs?: { brand: string; model: string; rms: number | null; url: string | null; note: string }[] }[] = [];
let projects: { name: string; title: string; format?: number; section?: string; items?: number; saved?: string }[] = [];
/** The box (v1 fields) shown by Design new, Analyse/Fix and Boards: the data of the active box item (B1: item.data itself). */
let project: Project = DEFAULT_PROJECTS[0];
// ---------- B1_SHELL: project model v2, sections, single items ----------
/** Server features (GET /api/health); an older server has none: items and v2 writes over v1 files then wait for a restart. */
let features: string[] = [];
const hasF = (f: string) => features.includes(f);
/** The open project (or, in item mode, a one-item wrapper around the single item). */
let doc: pv2.ProjectDoc = pv2.readProject(DEFAULT_PROJECTS[0]).doc;
/** The open project came from a v1 file: it is written back as v1 while it still fits (pv2.toDisk). */
let docLegacy = false;
/** "project" = a project file; "item" = a single item (My items). */
let mode: "project" | "item" = "project";
/** Item mode: has it been saved to My items (then it autosaves)? */
let itemSaved = false;
let section: SectionId = "subwoofer";
let activeItem: pv2.Item = doc.items[0];
/** Items made in memory when a section was opened, not changed yet: not written (so opening a section changes no file). */
const pristine = new Set<string>();
let startSection: string | undefined;
let air: Air = AIR_PRESETS[Number(store.get("air") ?? 0)] ?? AIR_PRESETS[0];
// A10 (R30): the app opens on Design new; the start-up tab and project come from the per-user settings at every fresh page load (loadAll).
const TABS = ["design", "fix", "boards", "door", "ib", "drivers", "parts", "system", "bom", "project", "help"]; // B5: bom // B4: system // B3: parts // A13: Boards after Analyse; B1: door, ib, project (which ones show: sections.ts)
let tab = "design";
let view: View3D | undefined;
let lastDiag: Diagnosis | undefined;
let chosen = "asfound";
const driverById = (id?: string) => findDriver(drivers, id, driverAliases); // B3: also an old library id
// ---------- default driver (A9_DEFAULTDRV): per user, data/private/settings.json via /api/settings ----------
// Fallback when the server has no /api/settings route yet (older server still running): this browser's storage.
let defaultDriverId: string | undefined;
let settingsRoute = true;
// A10_NEWBOX_DEFAULT: start-up project and tab (settings defaultProject / defaultTab); without them, this browser's last ones.
let startProject: string | undefined, startTab: string | undefined;
async function loadSettings() {
  const str = (v: unknown) => typeof v === "string" && v ? v : undefined;
  try { const s: any = await api("settings"); settingsRoute = true; defaultDriverId = str(s?.defaultDriverId); startProject = str(s?.defaultProject); startTab = str(s?.defaultTab); startSection = str(s?.defaultSection); }
  catch { settingsRoute = false; defaultDriverId = store.get("defaultDriverId") || undefined; startProject = store.get("defaultProject") || undefined; startTab = store.get("defaultTab") || undefined; startSection = store.get("defaultSection") || undefined; }
}
/** Make the current project and tab the ones the app opens on (server settings; older server: this browser). */
async function setStartHere() {
  // B1: "Continue where I left off" opens this project, section and tab (the section needs the B1 server; an older one keeps the tab only)
  const patch: Record<string, string> = { defaultProject: doc.name, defaultTab: tab, ...(hasF("projects-v2") ? { defaultSection: section } : {}) };
  const where = `"${doc.title}", ${sectionInfo(section).label}, ${tabLabel(tab)}`;
  if (settingsRoute) {
    try { await putJson("settings", patch); startProject = doc.name; startTab = tab; startSection = patch.defaultSection; status(`"Continue where I left off" now opens on ${where}`, "ok"); return; }
    catch (e) { if (!/^40[04] [^]*unknown (api|setting)/.test((e as Error).message)) { status("Could not save the start-up page: " + (e as Error).message, "bad"); return; } settingsRoute = false; }
  }
  store.set("defaultProject", doc.name); store.set("defaultTab", tab); store.set("defaultSection", section); startProject = doc.name; startTab = tab; startSection = section;
  status(`"Continue where I left off" now opens on ${where} (kept in this browser only: restart the app server to store it in data/private/settings.json)`, "ok");
}
/** The default driver, only if it exists and can be simulated. */
const defaultDriver = () => { const d = driverById(defaultDriverId); return d && !d.incomplete ? d : undefined; };
/** A project with no driver chosen gets the default driver (in memory; saved with the next change). A chosen driver is never replaced. */
function applyDefaultDriver(p: Project): Project { if (!p.driverId) { const d = defaultDriver(); if (d) p.driverId = d.id; } return p; }
async function setDefaultDriver(d: Driver) {
  if (settingsRoute) {
    try { await putJson("settings", { defaultDriverId: d.id }); defaultDriverId = d.id; status(`${d.brand} ${d.model} is now your default driver`, "ok"); return; }
    catch (e) { if (!/^404 [^]*unknown api/.test((e as Error).message)) { status("Could not save the default: " + (e as Error).message, "bad"); return; } settingsRoute = false; }
  }
  store.set("defaultDriverId", d.id); defaultDriverId = d.id;
  status(`${d.brand} ${d.model} is now your default driver (kept in this browser only: restart the app server to store it in data/private/settings.json)`, "ok");
}
/** Model parameters of the project's driver, converted to the project's coil wiring for dual-coil library drivers. */
function full(d: Driver): FullParams & { displacement?: number } { if (d.incomplete) throw new Error(`Not enough published data to simulate ${d.brand} ${d.model}: missing ${(d.missing ?? []).join(", ")}`); const f = complete((wiredDriver(project, d) ?? d).params, air) as FullParams & { displacement?: number }; f.displacement = d.params.displacement ?? 0; return f; }

/** Drivers, libraries, settings, server features and the project list. B1: no project is opened here (welcome and menu come
 * first); continueLast() opens the R30 start-up project as loadAll did before. */
async function loadAll(): Promise<boolean> {
  try {
    try { const h: any = await api("health"); features = Array.isArray(h?.features) ? h.features : []; } catch { features = []; }
    drivers = (await api("drivers")) as Driver[];
    try { libraries = await api("drivers/_libraries"); } catch { libraries = []; }
    refreshDriverMeta();
    await loadSettings();
    await refreshProjects();
    // first run only (B1: a project deleted on purpose is not made again)
    if (!projects.length) for (const p of DEFAULT_PROJECTS) { await putJson("projects/" + p.name, p); projects.push({ name: p.name, title: p.title }); }
    status(`Loaded ${drivers.length} drivers, ${projects.length} projects`);
    return true;
  } catch (e) { loadError = "Server not reachable: " + (e as Error).message; status(loadError, "bad"); return false; }
}
let loadError: string | undefined;
async function refreshProjects() { projects = ((await api("projects")) as typeof projects).sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name))); }
const upgrade = (p: any): Project => upgradeProject(p);
void upgrade;
// ---------- B1_SHELL: open projects, sections and single items ----------
const ITEM_NAME: Record<SectionId, string> = { subwoofer: "Subwoofer box", door: "Door speakers", ib: "Infinite baffle", home: "Home speaker box", computer: "Computer speaker box" };
/** Item whose Design new runs Best size once at its next render (after a preset was applied). */
let pendingBest: string | undefined;
/** Section whose driver sizes the Drivers tab filters are set for. */
let filterSection: SectionId = "subwoofer";
/** A suitable simulatable driver for a home / computer box: the section default (sections.ts), else the first library driver of a fitting size. */
function sectionDefaultDriver(s: SectionId): string | undefined {
  const want = driverById(SECTION_DEFAULT_DRIVER[s]); if (want && simulatable(want)) return want.id;
  return drivers.find((d) => driverFitsSection(d, s) && !!d.library && simulatable(d))?.id;
}
/** Apply a home / computer preset to a box (sizes, type, power; height locked) and run Best size at the next Design render. */
function applyPreset(box: Project, pr: Preset) {
  box.design = { ...defaultDesign(), ...(box.design ?? {}), ...pr.design, sizing: 2, keepVolume: true, preset: pr.id, lockW: false, lockD: false };
  box.kind = box.design.kind; box.power.watts = pr.watts; box.cabin.enabled = false; box.drivers = pr.drivers ?? 1;
  const z = driverById(box.driverId)?.params.Znom; if (z) box.power.impedance = z; // e.g. 8 ohm home drivers (not the car default 4)
}
/** A new item for a section: a box (Subwoofer: your default driver; Home / Computer: the section's driver and first preset) or,
 * for Door speaker and Infinite baffle, a driver choice with notes (no box). */
function makeItem(s: SectionId, taken: string[]): pv2.Item {
  const si = sectionInfo(s);
  if (si.kind !== "box") { // B2: IB gets its section's driver (PS Sound's AE IB15AU) and the IB inputs; door: no default driver
    const did = s === "ib" ? sectionDefaultDriver(s) ?? "" : "";
    const data: any = { driverId: did, count: 2, notes: "" };
    if (s === "ib") ibDefaults(data, driverById(did)); else doorDefaults(data, driverById(did));
    return pv2.newItem(s, si.kind, ITEM_NAME[s], data, taken);
  }
  const box = blankProject("", "", s === "subwoofer" ? defaultDriver()?.id : sectionDefaultDriver(s));
  if (s !== "subwoofer") box.cabin.enabled = false;
  const pr = PRESETS[s]?.[0]; if (pr) applyPreset(box, pr);
  const it = pv2.newItem(s, "box", ITEM_NAME[s], box, taken);
  if (pr) pendingBest = it.id;
  return it;
}
/** Make an item the one shown; a box item's data becomes `project` (named after the project, or the item in item mode). */
function setActive(it: pv2.Item) {
  activeItem = it; doc.activeItem = it.id;
  if (it.data?.driverId && !drivers.some((d) => d.id === it.data.driverId) && driverAliases[it.data.driverId]) it.data.driverId = driverAliases[it.data.driverId]; // B3: hp-car-subs id -> car-subs id
  if (it.kind === "box") {
    project = pv2.boxOf(it, mode === "item" ? it.id : doc.name, mode === "item" ? it.name : doc.title);
    if (it.section === "subwoofer") applyDefaultDriver(project);
  }
  lastDiag = undefined; chosen = "asfound";
}
/** Show a section of the open project: its last item, else its first, else a new item kept in memory until it is changed. */
function enterSection(s: SectionId, itemId?: string) {
  section = s; doc.section = s; store.set("section", s);
  if (mode === "project") store.set("section:" + doc.name, s);
  let it = (itemId ? doc.items.find((i) => i.id === itemId && i.section === s) : undefined) ?? doc.items.find((i) => i.id === doc.activeItem && i.section === s) ?? doc.items.find((i) => i.section === s);
  if (!it) { it = makeItem(s, doc.items.map((i) => i.id)); doc.items.push(it); pristine.add(it.id); }
  setActive(it);
  if (s !== filterSection) { dFilter.sub = s === "subwoofer"; dFilter.sec = s === "subwoofer" ? "" : s; dPage = 1; filterSection = s; } // Drivers tab: the section's sizes
}
/** The tab to show: the one asked for if this section has it, else the section's first tab. */
function pickTab(t?: string | null): string { const tabs = sectionInfo(section).tabs; const out = t && tabs.includes(t) ? t : tabs[0]; store.set("tab", out); return out; }
/** A section that has this tab, preferring one the project already has items in. */
function sectionForTab(t: string, fallback: SectionId): SectionId {
  const withItems = SECTIONS.filter((x) => x.tabs.includes(t) && doc.items.some((i) => i.section === x.id));
  return (withItems[0] ?? SECTIONS.find((x) => x.tabs.includes(t)) ?? sectionInfo(fallback)).id;
}
/** Open a project file (v1 or v2). Section: the one asked for, else the one last used in this browser, else the project's own. */
async function openProject(name: string, opts: { section?: string; tab?: string | null; itemId?: string } = {}) {
  clearTimeout(saveTimer);
  const r = pv2.readProject(await api("projects/" + name));
  doc = r.doc; docLegacy = r.legacy; mode = "project"; itemSaved = false; pristine.clear();
  store.set("mode", "project"); store.set("project", doc.name);
  let sec = ([opts.section, store.get("section:" + doc.name), doc.section].find(isSection) ?? "subwoofer") as SectionId;
  if (opts.tab && !opts.section && !sectionInfo(sec).tabs.includes(opts.tab)) sec = sectionForTab(opts.tab, sec);
  enterSection(sec, opts.itemId);
  tab = pickTab(opts.tab);
  await loadMeasurements(measCtx, true);
  await ensurePartsFor(doc.items); primeGate(); // B4: part values for the engines; the alert's baseline list (no alert on open)
}
/** Work on one item on its own (Build a single item, My saved items). saved = it is in My items already (then it autosaves). */
function startItem(s: SectionId, it?: pv2.Item, saved = false) {
  clearTimeout(saveTimer);
  const item = it ?? makeItem(s, []);
  mode = "item"; itemSaved = saved; docLegacy = false; pristine.clear(); if (!it) pristine.add(item.id);
  doc = { format: 2, name: item.id, title: item.name, section: isSection(item.section) ? item.section : "subwoofer", activeItem: item.id, items: [item] };
  store.set("mode", "item"); if (saved) store.set("item", item.id);
  enterSection(doc.section); tab = pickTab(undefined);
}
async function openSavedItem(id: string) {
  const it = pv2.readSavedItem(await api("items/" + id));
  if (!isSection(it.section)) throw new Error(`"${it.name}" is a part (${it.kind}): edit it in My saved items or add it to a project`); // B3
  startItem(isSection(it.section) ? it.section : "subwoofer", it, true);
  await loadMeasurements(measCtx, true);
}
/** What "Continue where I left off" opens: the R30 start-up project/tab (+ section) from data/private/settings.json, else this
 * browser's last project (or single item), tab and section. */
function continueTarget(): { kind: "project"; name: string; section?: string; tab?: string } | { kind: "item"; id: string } | undefined {
  const has = (n?: string | null) => !!n && projects.some((p) => p.name === n);
  if (!has(startProject) && store.get("mode") === "item" && store.get("item")) return { kind: "item", id: store.get("item")! };
  const name = [startProject, store.get("project"), "existing_sub", projects[0]?.name].find(has);
  if (!name) return undefined;
  const tab0 = [startTab, store.get("tab")].find((x) => !!x && TABS.includes(x)) ?? undefined;
  return { kind: "project", name, section: name === startProject ? startSection : undefined, tab: tab0 };
}
async function continueLast() {
  const t = continueTarget();
  try {
    if (t?.kind === "item") { try { await openSavedItem(t.id); return; } catch { store.set("mode", "project"); return continueLast(); } }
    if (t) await openProject(t.name, { section: t.section, tab: t.tab });
  } catch (e) { status("Could not open: " + (e as Error).message, "bad"); }
}
/** A new project (v2) holding one new item of the section; name made from the title (never overwrites a project). */
async function createProject(title: string, s: SectionId) {
  await refreshProjects();
  const base = slug(title).replace(/-/g, "_").replace(/^[^a-z0-9]+/i, "") || "project"; let name = base, k = 2;
  while (projects.some((p) => p.name === name)) name = `${base}_${k++}`;
  const first = makeItem(s, []); const d = pv2.newProject(name, title, first);
  await putJson("projects/" + name, pv2.toDisk(d, false)); await refreshProjects();
  await openProject(name, { section: s, tab: sectionInfo(s).tabs[0] });
  if (PRESETS[s]) pendingBest = activeItem.id; // the preset's Best size runs at the first Design render (saved then)
}
/** Add a copy of an item to a project (the open one in memory, or a project file). Returns the new item id. */
async function addItemTo(projName: string, it: pv2.Item, from?: pv2.Item["from"]): Promise<string | undefined> {
  if (mode === "project" && projName === doc.name) { const c = pv2.addItemToProject(doc, it, from); await persist(); return c.id; }
  const r = pv2.readProject(await api("projects/" + projName));
  if (r.legacy && !hasF("projects-v2")) { status("Adding an item to this project needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return undefined; }
  const c = pv2.addItemToProject(r.doc, it, from);
  await putJson("projects/" + projName, pv2.toDisk(r.doc, r.legacy));
  return c.id;
}
const shapeCtx: ShapeCtx = { api, status, projectName: () => project.name };
// ---------- measurements (REW) ----------
const measCtx: MeasCtx = {
  api, status, project: () => project, driver: () => wiredDriver(project, driverById(project.driverId)), air: () => air,
  redraw: () => {
    if (tab === "fix") { const d = driverById(project.driverId); if (lastDiag && d) drawPlots(lastDiag.options, full(d)); }
    else if (tab === "design") renderDesign();
  },
  applyFit: (m) => {
    const old = lastDiag ? `now: ${f1(lastDiag.Vb * 1000)} L per driver${lastDiag.fb ? `, ${f1(lastDiag.fb)} Hz` : ""}` : "now: from the measured sizes";
    if (!confirm(`Use the fitted box for the analysis of "${project.title}"?\n\n${old}\nfitted: ${f1(m.VbPerL)} L per driver${m.fb ? `, ${f1(m.fb)} Hz` : ""}, QL ${f1(m.QL)}${m.QP ? `, QP ${f1(m.QP)}` : ""}\n\nThe outside sizes you entered are kept; Undo puts back the previous values.`)) return;
    project.measuredBoxPrev = project.measuredBox ?? null; project.measuredBox = m; saveProjectSoon(); lastDiag = undefined; chosen = "asfound"; renderFix();
    status("Analysis now uses the fitted box", "ok");
  },
  undoFit: () => { const cur = project.measuredBox ?? null; project.measuredBox = project.measuredBoxPrev ?? null; project.measuredBoxPrev = cur; saveProjectSoon(); lastDiag = undefined; renderFix(); status("Undone", "ok"); },
  clearFit: () => { project.measuredBoxPrev = project.measuredBox ?? null; project.measuredBox = null; saveProjectSoon(); lastDiag = undefined; renderFix(); status("Analysis uses the measured sizes again", "ok"); },
};
/** Free-form analysis of the current project (undefined = classic W×H×D box). */
const currentFF = (kind = project.kind) => computeFF(project, driverById(project.driverId), shapeCtx, () => render(), kind);
let saveTimer: number | undefined;
/** Autosave (0.5 s after a change). B1: the active item counts as changed (it is written from now on). */
function saveProjectSoon() { if (activeItem) pristine.delete(activeItem.id); clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { void persist(); }, 500); }
/** Write the open project (v1 while it still fits v1, else v2: the server backs the v1 file up first) or the single item. */
async function persist(): Promise<boolean> {
  clearTimeout(saveTimer);
  try {
    if (mode === "item") {
      if (!itemSaved) { status("Not saved yet: press Save to My items to keep this item", "warn"); return false; }
      if (!hasF("items")) { status("Saving to My items needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return false; }
      const r: any = await putJson("items/" + activeItem.id, pv2.cleanItem(activeItem)); store.set("item", activeItem.id);
      status("Saved to My items " + new Date(r.saved).toLocaleTimeString()); return true;
    }
    const body = pv2.toDisk(doc, docLegacy, pristine);
    if (pv2.isV2(body) && docLegacy && !hasF("projects-v2")) { status(`"${doc.title}" now holds more than its one subwoofer box: run scripts/restart_app.sh on the host so it can be saved (the old file is backed up first)`, "bad"); return false; }
    const r: any = await putJson("projects/" + doc.name, body);
    if (pv2.isV2(body)) docLegacy = false;
    if (r.saved) doc.saved = r.saved; // B4: the diagram header date
    status("Saved " + new Date(r.saved).toLocaleTimeString());
    onProjectSave(viewDoc(), { legacy: docLegacy }); // R44 hook point (B4: registerSystemReport; items opened in memory only are left out)
    return true;
  } catch (e) { status("Save failed: " + (e as Error).message, "bad"); return false; }
}

// ---------- layout ----------
function shell() {
  const si = sectionInfo(section);
  const same = doc.items.filter((i) => i.section === section);
  const isStart = mode === "project" && startProject === doc.name && startTab === tab && (startSection ?? "subwoofer") === section;
  $("#app").innerHTML = `
  <header>
    <button id="toMenu" class="menubtn" title="Back to the start menu (What do you want to do?)">☰ Menu</button>
    <h1 title="Audio Builder">Audio Builder</h1>
    <div class="secCtl" id="secCtl" title="${esc(SECTION_HELP)}"><label for="section">Section:</label> <select id="section">${SECTIONS.map((x) => `<option value="${x.id}" ${x.id === section ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
      <div class="secInfo" id="secInfo"><b>What is a section?</b> The kind of speaker you are working on; it decides the screens, drivers and boxes shown. ${esc(si.label)}: ${esc(si.explain)}</div></div>
    <nav>${si.tabs.map((k) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${tabLabel(k)}</button>`).join("")}</nav>
    ${mode === "project" ? `<label class="muted">Project <select id="proj">${projects.map((p) => `<option value="${esc(p.name)}" ${p.name === doc.name ? "selected" : ""}>${esc(p.title || p.name)}</option>`).join("")}<option value="__new">+ New project…</option></select></label>
      ${same.length > 1 ? `<label class="muted" title="This project has several ${esc(si.label)} items">Item <select id="itemSel">${same.map((i) => `<option value="${esc(i.id)}" ${i.id === activeItem.id ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></label>` : ""}
      <button id="saveNow" class="primary" title="Save the project now (Ctrl+S): the wiring diagram is drawn and the missing-part check runs (System tab). Changes are also saved automatically.">Save</button>
      ${isStart ? `<span class="tag-default" id="isStart" title="Continue where I left off (start menu) opens this project, section and tab">★ Start page</span>` : `<button id="startHere" title="Make Continue where I left off (start menu) open this project, section and tab">Open here at start</button>`}`
    : `<span class="itemTag" id="itemTag">Single item: <b>${esc(activeItem.name)}</b> ${itemSaved ? '<span class="ok">(in My items, saved automatically)</span>' : '<span class="warn">(not saved yet)</span>'}</span>${itemSaved ? "" : '<button id="saveItem" class="primary">Save to My items</button>'}`}
    <label class="muted" title="Show lengths and volumes in metric or imperial units (values are stored in mm and litres)">Units <select id="units"><option value="metric" ${units.imperial ? "" : "selected"}>mm, litres</option><option value="imperial" ${units.imperial ? "selected" : ""}>inches, ft³</option></select></label>
    <label class="muted" title="Air density and speed of sound used by every calculation">Air <select id="air">${AIR_PRESETS.map((a, i) => `<option value="${i}" ${a === air ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select></label>
    <span id="status" class="status"></span>
  </header>
  <main id="page"></main>`;
  document.querySelectorAll<HTMLButtonElement>("nav button").forEach((b) => b.onclick = () => { tab = b.dataset.tab!; store.set("tab", tab); shell(); render(); });
  $("#toMenu").onclick = () => { void (async () => { if (saveTimer) await persist(); if (!(await leaveCheck(() => showMenu()))) return; showMenu(); })(); };
  if ($("#saveNow")) $("#saveNow").onclick = () => void explicitSave();
  $("#section").onchange = (e) => switchSection((e.target as HTMLSelectElement).value as SectionId);
  if ($("#proj")) $("#proj").onchange = async (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (saveTimer) await persist();
    if (!(await leaveCheck(() => { const sel = $<HTMLSelectElement>("#proj"); if (sel) { sel.value = v; sel.dispatchEvent(new Event("change")); } }))) { const sel = $<HTMLSelectElement>("#proj"); if (sel) sel.value = doc.name; return; }
    if (v === "__new") {
      const title = prompt(`Name of the new project (e.g. 'Kitchen speakers'). It starts with a ${sectionInfo(section).label} item; add more on its Project tab.`); if (!title) { shell(); return; }
      try { await createProject(title, section); } catch (e2) { status("Could not create the project: " + (e2 as Error).message, "bad"); }
    } else { try { await openProject(v, { tab }); } catch (e2) { status("Could not open: " + (e2 as Error).message, "bad"); } }
    shell(); render();
  };
  if ($("#itemSel")) $("#itemSel").onchange = (e) => { const it = doc.items.find((i) => i.id === (e.target as HTMLSelectElement).value); if (it) { setActive(it); void loadMeasurements(measCtx, true); } shell(); render(); };
  if ($("#saveItem")) $("#saveItem").onclick = () => void saveItemToMyItems();
  if ($("#startHere")) $("#startHere").onclick = async () => { await setStartHere(); const st = $("#status")?.textContent ?? ""; const cls = $("#status")?.className ?? ""; shell(); render(); const el = $("#status"); if (el) { el.textContent = st; el.className = cls; } };
  $("#units").onchange = (e) => { setImperial((e.target as HTMLSelectElement).value === "imperial"); shell(); render(); };
  $("#air").onchange = (e) => { air = AIR_PRESETS[Number((e.target as HTMLSelectElement).value)]; store.set("air", String(AIR_PRESETS.indexOf(air))); render(); };
}
/** The Section control changed. Project: show (or start, in memory) that section's item. Single item: start a new single item. */
function switchSection(v: SectionId) {
  if (!isSection(v) || v === section) return;
  if (mode === "item") {
    if (!itemSaved && !pristine.has(activeItem.id) && !confirm(`Start a new single item in "${sectionInfo(v).label}"? The current item "${activeItem.name}" is not saved to My items and will be lost.`)) { shell(); return; }
    if (saveTimer) void persist();
    startItem(v); shell(); render(); return;
  }
  if (saveTimer) void persist();
  const keep = tab; enterSection(v); tab = pickTab(keep);
  void loadMeasurements(measCtx, true);
  shell(); render();
}
async function saveItemToMyItems() {
  if (!hasF("items")) { status("Saving to My items needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return; }
  itemSaved = true; pristine.delete(activeItem.id);
  if (await persist()) { shell(); render(); status(`"${activeItem.name}" is in My items (start menu); it now saves automatically`, "ok"); }
  else itemSaved = false;
}
const TAB_LABEL: Record<string, string> = { design: "Design new", fix: "Analyse / Fix / Tweak", boards: "Boards", door: "Door speakers", ib: "Infinite baffle", drivers: "Drivers", parts: "Parts", system: "System", bom: "BOM", project: "Project", help: "Help" };
const tabLabel = (t: string) => (t === "project" && mode === "item" ? "Item" : TAB_LABEL[t] ?? t);
function render() {
  view?.dispose(); view = undefined;
  if (tab === "fix") renderFix(); else if (tab === "design") renderDesign(); else if (tab === "boards") renderBoards(boardsCtx);
  else if (tab === "door") renderDoor(); else if (tab === "ib") renderIB(); else if (tab === "drivers") renderDrivers(); else if (tab === "parts") renderParts($("#page"), partsCtx);
  else if (tab === "project") { if (mode === "item") renderItemTab(); else renderProjectTab(); }
  else if (tab === "system") { if (mode === "item") renderItemSystem(); else renderSystem($("#page"), sysCtx); }
  else if (tab === "bom") void renderBom($("#page"), bomCtx); else renderHelp();
}
// read-only hook for the headless dry runs: where the app is
(window as any).__abState = () => ({ mode, section, tab, project: doc.name, title: doc.title, legacy: docLegacy, activeItem: activeItem?.id, kind: activeItem?.kind, items: doc.items.map((i) => ({ id: i.id, section: i.section, kind: i.kind, name: i.name, pristine: pristine.has(i.id), data: i.section === PART_SECTION ? i.data : undefined })), itemSaved, features, parts: partsState(), driverFilter: { ...dFilter } });

// ---------- Analyse / Fix / Tweak ----------
function driverSelect(sel?: string) {
  // drivers without enough published data to simulate (incomplete library records) are not offered
  // PM 2026-11-22: a maker data problem must be visible where the driver is used, not only in the Drivers tab
  const cur = driverById(sel); if (cur) sel = cur.id;
  const warn = cur?.checks?.length ? `<div class="hint warn" id="drvCheck">CHECK: this driver's published values contradict each other (${esc(cur.checks.length + " note" + (cur.checks.length > 1 ? "s" : ""))}); results may be off. Details: Drivers tab, ${esc(cur.brand)} ${esc(cur.model)}.</div>` : "";
  return warn + `<div class="row"><label>Driver</label><select data-key="driverId"><option value="">– choose –</option>${drivers.filter((d) => (!d.incomplete && d.kind !== "passive" && driverFitsSection(d, section) && !shadow.has(d.id)) || d.id === sel).map((d) => `<option value="${esc(d.id)}" ${d.id === sel ? "selected" : ""}>${esc(d.brand)} ${esc(d.model)}${d.private ? " (private)" : ""}${d.library ? ` [${esc(d.library)}]` : ""}${d.incomplete ? " (not enough data to simulate)" : ""}${d.id === defaultDriverId ? " ★ default" : ""}</option>`).join("")}</select><span class="u"></span></div>`;
}
function renderFix() {
  const p = project; const ff = currentFF(); const classic = p.shape!.mode === "classic";
  const dSel = driverById(p.driverId); if (syncImpedance(p, dSel)) saveProjectSoon();
  $("#page").innerHTML = `
  <div class="cols">
    <div>
      <fieldset id="fsProj"><legend>${esc(p.title)}</legend>
        ${driverSelect(p.driverId)}
        ${field("Number of drivers in the box", p, "drivers", "", { step: 1, min: 1 })}
        <div class="row"><label>What you hear (notes)</label></div><textarea data-key="symptoms" rows="2" style="width:100%">${esc(p.symptoms)}</textarea>
      </fieldset>
      ${shapePanelHtml(p)}
      <fieldset id="fsBox"><legend>Box${classic ? " (outside measurements)" : ""}</legend>
        ${select("kind", p.kind, [["vented", "Ported (vented)"], ["sealed", "Sealed"]], "Type")}
        ${classic ? `${field("Width", p.geom, "W", "mm")}${field("Height", p.geom, "H", "mm")}${field("Depth (at bottom)", p.geom, "D", "mm")}
        ${field("Sloped back (wedge)", p.geom, "wedge")}${p.geom.wedge ? field("Depth at top", p.geom, "Dtop", "mm") : ""}
        ${field("Panel thickness", p.geom, "t", "mm")}${field("Extra front baffle layer", p.geom, "baffleExtra", "mm")}` : ""}
        ${field("Braces volume", p.geom, "bracesL", "L")}${field("Other inside (terminal cup…)", p.geom, "otherL", "L")}
        ${field("Solid inserts already added", p.geom, "insertsL", "L")}
        ${field("Fill: assumed volume gain", p.geom, "fillPct", "%", { title: "Fibre fill makes the box act bigger, up to a theoretical 40 %. Practical figures are unverified: measure if you can." })}
      </fieldset>
      ${p.kind === "vented" ? `<fieldset id="fsPort"><legend>Port</legend>
        ${select("shape", p.port.shape, [["round", "Round tube"], ["slot", "Slot (rectangular)"]], "Shape")}
        ${field("Number of ports", p.port, "count", "", { step: 1, min: 1 })}
        ${p.port.shape === "round" ? field("Inside diameter", p.port, "d", "mm") + field("Tube wall", p.port, "wall", "mm") + field("Flared ends (aeroport): flare radius", p.port, "flare", "mm", { title: "0 = straight tube. Flared ends: air mass from ∫dx/S(x) with end corrections at the throat (Hari & Michael, COMSOL paper; Salvatti et al. JAES 2002)." }) : field("Slot width", p.port, "w", "mm") + field("Slot height", p.port, "h", "mm")}
        ${field("Physical length", p.port, "length", "mm")}
      </fieldset>` : ""}
      <fieldset id="fsPow"><legend>Amplifier and car</legend>
        ${field("Amp power per driver", p.power, "watts", "W")}${hasCoilChoice(dSel) ? coilRowsHtml(p, dSel, p.drivers) : field("Impedance the amp sees per driver", p.power, "impedance", "Ω")}
        ${field("Low-pass (crossover) frequency", p, "lowpassHz", "Hz")}
        ${field("Show in-car response (cabin gain)", p.cabin, "enabled")}
        ${p.cabin.enabled ? field("Longest inside dimension of cabin", p.cabin, "longestMm", "mm") + field("Cabin gain slope", p.cabin, "slope", "dB/oct") + field("Gain stops rising below", p.cabin, "leakHz", "Hz") : ""}
      </fieldset>
      <div class="toolbar"><button class="primary" id="run">Analyse and find fixes</button></div>
    </div>
    <div>
      <div class="view3d" id="v3d"></div>
      <div class="toolbar">
        <label><input type="checkbox" id="xray"> X-ray</label>
        <label>Explode <input type="range" id="explode" min="0" max="1" step="0.05" value="0"></label>
        <label title="Blender style: middle-drag orbits, Shift+middle-drag pans, wheel zooms. Left-drag also orbits.">Blender mouse <input type="checkbox" id="bmouse" checked></label>
        <button id="glb">Export .glb (Blender)</button><button id="stl">Export .stl</button><button id="png">Save picture</button><button id="cut">Cut list</button>
      </div>
      <div class="hint">Keys (click the view first): 1 front · 3 right side · 7 top · Ctrl+number = opposite side · 5 or Home = reset · X = x-ray. Drag to orbit, right-drag to pan, wheel to zoom.</div>
      <div id="volbox"></div>
      <div id="cutbox"></div>
    </div>
  </div>
  <div id="results"></div><div id="measbox"></div>`;
  const onChange = () => { saveProjectSoon(); lastDiag = undefined; chosen = "asfound"; renderFix(); };
  for (const [id, obj] of [["#fsProj", p], ["#fsBox", p.geom], ["#fsPort", p.port], ["#fsPow", p.power]] as const) { const el = $(id); if (el) bindFields(el, obj, onChange); }
  // fields owned by other objects inside the same fieldsets
  fixBind("#fsBox select[data-key=kind]", p, "kind", onChange);
  fixBind("#fsPow input[data-key=lowpassHz]", p, "lowpassHz", onChange);
  for (const k of ["enabled", "longestMm", "slope", "leakHz"]) fixBind(`#fsPow input[data-key=${k}]`, p.cabin, k, onChange);
  if (p.port.flare === undefined) p.port.flare = 0;
  bindShapePanel(p, shapeCtx, onChange);
  bindCoil(p, dSel, onChange);
  void ff;
  setup3D();
  showVolume();
  $("#run").onclick = runDiagnosis;
  renderMeasPanel($("#measbox"), measCtx, true);
  if (lastDiag) showDiagnosis(lastDiag); else if (driverById(p.driverId)) runDiagnosis();
  else $("#results").innerHTML = `<p class="muted">Choose a driver (or add one on the Drivers tab), enter the box, then press <b>Analyse and find fixes</b>.</p>`;
}
function setup3D(insertM3 = 0, kind = project.kind) {
  const host = $("#v3d"); if (!host) return;
  if (!view || view.hostEl !== host) { view?.dispose(); host.innerHTML = ""; view = new View3D(host); }
  (window as any).__abView = view; // read-only hook for the headless dry runs (scene bounds, port layout)
  const d = driverById(project.driverId); const ff = currentFF(kind);
  const proj = project, ext = extra3D; // the model shown now (Design shows a draft, not the saved project)
  const draw = () => { if (ff) view!.buildFree(freeModel(proj, ff, d, kind)); else view!.build({ ...to3D(proj, d, insertM3, kind), ...ext }); };
  draw();
  const v = view;
  $<HTMLInputElement>("#xray").onchange = (e) => { v.xray = (e.target as HTMLInputElement).checked; draw(); };
  $<HTMLInputElement>("#explode").oninput = (e) => { v.explode = parseFloat((e.target as HTMLInputElement).value); draw(); };
  $<HTMLInputElement>("#bmouse").onchange = (e) => v.setBlenderMouse((e.target as HTMLInputElement).checked);
  $("#glb").onclick = async () => { const buf = await v.exportGLB(); const name = `${project.name}_box.glb`; download(name, buf, "model/gltf-binary"); saveExport(name, buf); };
  $("#stl").onclick = () => { const s = v.exportSTL(); const name = `${project.name}_box.stl`; download(name, s, "model/stl"); saveExport(name, s); };
  $("#png").onclick = async () => { const url = v.screenshot(); const blob = await (await fetch(url)).blob(); const name = `${project.name}_view.png`; download(name, blob, "image/png"); saveExport(name, blob); };
  $("#cut").onclick = () => showCutList();
  const tb = $("#png")?.parentElement;
  if (tb && ff && !$("#airstl")) {
    tb.insertAdjacentHTML("beforeend", `<button id="airstl" title="Closed mesh of the air inside (after wall/shell thickness): check the volume in Blender or MeshLab">Export inside air .stl</button>${project.shape!.material === "fibreglass" ? '<button id="mould" title="Outside surface = the mould / plug shape">Export mould .stl</button>' : ""}`);
    $("#airstl").onclick = () => { const b = innerSTL(ff); const name = `${project.name}_inside_air.stl`; download(name, b, "model/stl"); saveExport(name, b); };
    if ($("#mould")) $("#mould").onclick = () => { const b = outerSTL(ff); const name = `${project.name}_mould.stl`; download(name, b, "model/stl"); saveExport(name, b); };
  }
}
let extra3D: Partial<ReturnType<typeof to3D>> = {};
async function saveExport(name: string, body: BlobPart) {
  try { const r: any = await api(`projects/${project.name}/exports/${name}`, { method: "PUT", body: new Blob([body]) }); status("Saved to " + r.path.replace(/^.*\/data\//, "data/"), "ok"); } catch (e) { status("Export save failed: " + (e as Error).message, "bad"); }
}
function showVolume() {
  const d = driverById(project.driverId);
  const ff = currentFF();
  if (ff) {
    const g = toGeomFF(project, ff);
    const vol = netVolume(g, d?.params.displacement ?? 0, project.drivers, project.kind === "vented" ? toPort(project) : undefined);
    const fbTxt = project.kind === "vented" ? `<tr><td>Port tuning (calculated)</td><td class="num"><b id="ffFb">${f1(portFb(toPort(project), vol.acoustic, air.c))} Hz</b></td></tr>` : "";
    $("#volbox").innerHTML = freeformVolumeHtml(project, ff, fbTxt, air.c);
    bindPanelThickness(project, () => { saveProjectSoon(); lastDiag = undefined; render(); });
    return;
  }
  const vol = netVolume(toGeom(project), (d?.params.displacement ?? 0), project.drivers, project.kind === "vented" ? toPort(project) : undefined);
  const { Wi, Hi, Di, DiTop } = internalDims(toGeom(project));
  let fbTxt = "";
  if (project.kind === "vented") {
    const fb = portFb(toPort(project), vol.acoustic, air.c); fbTxt = `<tr><td>Port tuning (calculated)</td><td class="num"><b>${f1(fb)} Hz</b></td></tr>`;
    const g = toGeom(project); const lay = portLayout(g, toPort(project)); // A8: the same layout the 3D view draws
    fbTxt += lay.fits ? (lay.mode === "folded" ? `<tr><td>Port fit</td><td class="num warn" id="portFit">too long to run straight (room ${fmtMm(lay.straightMax * 1000)}): drawn folded, ${fmtMm(lay.L1 * 1000)} along the bottom + ${fmtMm(lay.L2 * 1000)} up the back (centre line)</td></tr>` : "")
      : `<tr><td>Port fit</td><td class="num bad" id="portFit">does not fit: ${esc(lay.reason ?? "")}. Not drawn. Check the port length and size you entered.</td></tr>`;
  }
  $("#volbox").innerHTML = `<h2>Volume</h2><table class="kv">
    <tr><td>Inside dimensions</td><td class="num">${fmtMm(Wi * 1000)} × ${fmtMm(Hi * 1000)} × ${fmtMm(Di * 1000)}${project.geom.wedge ? " → " + fmtMm(DiTop * 1000) : ""}</td></tr>
    <tr><td>Gross inside volume</td><td class="num">${fmtL(vol.gross * 1000)}</td></tr>
    <tr><td>− driver(s) ${d?.params.displacement ? "" : '<span class="warn">(driver displacement not entered)</span>'}</td><td class="num">${fmtL(vol.driver * 1000, 2)}</td></tr>
    <tr><td>− port, braces, inserts, other</td><td class="num">${fmtL((vol.port + vol.braces + vol.inserts + vol.other) * 1000, 2)}</td></tr>
    <tr><td><b>Net volume</b> (acoustic with fill)</td><td class="num"><b>${fmtL(vol.net * 1000)}</b> (${fmtL(vol.acoustic * 1000)})</td></tr>${fbTxt}</table>`;
}
function showCutList(holes?: string) {
  const ff = currentFF();
  if (ff) { showFreeCutSheet(ff); return; }
  if (!holes) { // A11: say how many driver holes and their size (Analyse/Fix)
    const z = driverSizes(driverById(project.driverId)); const pt = project.port;
    holes = `${project.drivers} × driver cut-out Ø ${Math.round(z.cutout * 1000)} mm${project.kind === "vented" ? `, ${pt.count} × port ${pt.shape === "round" ? `Ø ${pt.d} mm` : `${pt.w} × ${pt.h} mm`}` : ""}`;
  }
  const rows = cutList(project, holes);
  const svg = cutSheetSvg(rows);
  $("#cutbox").innerHTML = `<h2>Cut list (${project.geom.t} mm sheet)</h2><table><tr><th>Panel</th><th>Qty</th><th>Size (mm)</th><th>Note</th></tr>${rows.map((r) => `<tr><td>${r.name}</td><td class="num">${r.qty}</td><td class="num">${Math.round(r.a)} × ${Math.round(r.b)}</td><td>${esc(r.note)}</td></tr>`).join("")}</table>
    <div class="toolbar"><button id="cutsvg">Download cut sheet (.svg)</button></div><div style="background:#fff;border-radius:4px;margin-top:6px">${svg}</div>`;
  $("#cutsvg").onclick = () => { const name = `${project.name}_cutsheet.svg`; download(name, svg, "image/svg+xml"); saveExport(name, svg); };
}
function showFreeCutSheet(ff: FreeformResult) {
  const s = project.shape!; const d = driverById(project.driverId); const z = driverSizes(d);
  if (s.material === "fibreglass") {
    const ring = s.ringOuterMm > 0 ? writeDXF([{ kind: "circle", layer: "CUT", c: [0, 0], r: s.ringOuterMm / 2 }, { kind: "circle", layer: "CUT", c: [0, 0], r: z.cutout * 500 }, { kind: "text", layer: "TEXT", at: [-s.ringOuterMm / 2, -s.ringOuterMm / 2 - 20], h: 12, text: `MDF ring ${s.ringThickMm} mm, ${project.drivers} needed` }]) : "";
    $("#cutbox").innerHTML = `<h2>Fibreglass build sheet</h2><p>Mould: export the outside surface (Export mould .stl) and build the plug or tape the car's trim to it. Shell ${fmtMm(s.fibre.shellMm, 1)} ≈ ${ff.fibre!.layers} layers of ${s.fibre.matGsm} g/m² mat; ${f1(ff.fibre!.matM2, 1)} m² of mat, about ${f1(ff.fibre!.resinKg, 1)} kg of resin (estimates from the assumptions you can edit above).</p>
      ${ring ? `<p>MDF ring: outside ${fmtMm(s.ringOuterMm)}, cut-out ${fmtMm(z.cutout * 1000)}, ${fmtMm(s.ringThickMm)} thick, × ${project.drivers}.</p><div class="toolbar"><button id="ringdxf">Download ring .dxf</button></div>` : ""}`;
    if (ring) $("#ringdxf").onclick = () => { const name = `${project.name}_ring.dxf`; download(name, ring, "application/dxf"); saveExport(name, ring); };
    return;
  }
  if (!ff.flat) { $("#cutbox").innerHTML = `<p class="warn">This shape is curved: there are no flat panels to cut. Use fibreglass (Material) or build it from bent plywood.</p>`; return; }
  const holes: Hole[] = [];
  ff.driver?.uv.forEach((uv) => holes.push({ panel: ff.driver!.panel, uv, r: z.cutout / 2, label: "driver" }));
  if (project.kind === "vented" && ff.portAt) { const pt = toPort(project); ff.portAt.uv.forEach((uv) => holes.push({ panel: ff.portAt!.panel, uv, r: pt.shape === "round" ? pt.d! / 2 : Math.max(pt.w!, pt.h!) / 2, label: "port" })); }
  const o = { title: esc(project.title), thickness: (n: string) => s.panelT[n] ?? s.woodT, holes };
  const svg = panelSvg(ff.panels, o); const dxf = panelDxf(ff.panels, o);
  $("#cutbox").innerHTML = `<h2>Cut sheet: ${ff.panels.length} panels</h2><div class="toolbar"><button id="cutsvg">Download cut sheet (.svg)</button><button id="cutdxf">Download for CNC (.dxf)</button></div><div style="background:#fff;border-radius:4px;margin-top:6px;overflow:auto">${svg}</div>`;
  $("#cutsvg").onclick = () => { const name = `${project.name}_cutsheet.svg`; download(name, svg, "image/svg+xml"); saveExport(name, svg); };
  $("#cutdxf").onclick = () => { const name = `${project.name}_panels.dxf`; download(name, dxf, "application/dxf"); saveExport(name, dxf); };
}
function cutSheetSvg(rows: ReturnType<typeof cutList>): string {
  const pieces = rows.flatMap((r) => Array.from({ length: r.qty }, () => r));
  const scale = 0.4; let x = 10, y = 30, rowH = 0; const maxW = 1100; let out = "";
  for (const r of pieces) {
    const w = r.a * scale, h = r.b * scale;
    if (x + w > maxW) { x = 10; y += rowH + 40; rowH = 0; }
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3e3c3" stroke="#333"/><text x="${x + w / 2}" y="${y + h / 2}" font-size="13" text-anchor="middle">${r.name}</text><text x="${x + w / 2}" y="${y + h / 2 + 16}" font-size="12" text-anchor="middle">${Math.round(r.a)} × ${Math.round(r.b)} mm</text>`;
    x += w + 20; rowH = Math.max(rowH, h);
  }
  const H = y + rowH + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW + 20}" height="${H}" viewBox="0 0 ${maxW + 20} ${H}" font-family="sans-serif"><text x="10" y="18" font-size="14">${esc(project.title)}: cut sheet, ${project.geom.t} mm panels (drawing scale 1:${(1 / scale / 1000 * 1000).toFixed(1)} px/mm)</text>${out}</svg>`;
}
function runDiagnosis() {
  const d = driverById(project.driverId);
  if (!d) { $("#results").innerHTML = `<p class="bad">Choose a driver first.</p>`; return; }
  try {
    lastDiag = diagnose(full(d), toExisting(project, currentFF()), toPower(project, air.c), air);
    showDiagnosis(lastDiag);
  } catch (e) { $("#results").innerHTML = `<p class="bad">Could not calculate: ${esc((e as Error).message)}</p>`; }
}
function showDiagnosis(dg: Diagnosis) {
  const d = driverById(project.driverId)!; const fp = full(d);
  const xm = fp.Xmax * 1000;
  const optRow = (o: FixOption, i: number) => {
    const s = o.summary;
    const xCls = xm > 0 ? (s.maxXmm > xm ? "bad" : "ok") : "";
    const vCls = o.box.kind === "vented" ? (s.maxVport > 17 ? "warn" : "ok") : "";
    return `<tr data-id="${o.id}" class="${o.id === chosen ? "sel" : ""}"><td><input type="radio" name="opt" ${o.id === chosen ? "checked" : ""}> <span style="color:${PALETTE[i % PALETTE.length]}">■</span> <b>${esc(o.title)}</b>
      <ol class="steps">${o.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>${o.notes.map((n) => `<div class="warn">${esc(n)}</div>`).join("")}</td>
      <td class="num">${f1(s.f3)}</td><td class="num">${s.peakDb > 0.05 ? "+" + f1(s.peakDb) : "flat"}</td>
      <td class="num ${xCls}">${f1(s.maxXmm)}${xm ? ` / ${f1(xm)}` : ""}</td><td class="num ${vCls}">${o.box.kind === "vented" ? f1(s.maxVport) : "–"}</td>
      <td class="num">${o.subsonicHz ? o.subsonicHz + " Hz" : "–"}</td></tr>`;
  };
  $("#results").innerHTML = `
    <h2>What the calculation shows</h2>
    <div class="muted">Driver ${esc(d.brand)} ${esc(d.model)} · ${dg.Vrms.toFixed(1)} V rms (${project.power.watts} W into ${project.power.impedance} Ω) per driver · net ${f1(dg.Vb * 1000)} L per driver${project.measuredBox && project.measuredBox.kind === project.kind ? " <b>(fitted to your impedance sweep)</b>" : ""} · ${dg.fb ? `port ${f1(dg.fb)} Hz` : `sealed Qtc ${f1(dg.Qtc, 2)}, fc ${f1(dg.fc)} Hz`} · air ${esc(air.label)}</div>
    <div class="cards">${dg.findings.map((f) => `<div class="card ${f.level}"><b>${esc(f.title)}</b>${esc(f.detail)}</div>`).join("")}</div>
    <h2>Fix options (each one simulated)</h2>
    <table id="opts"><tr><th>Option and what to do</th><th>f3 (Hz)</th><th>Peak (dB)</th><th>Max cone travel (mm) / Xmax</th><th>Port air speed (m/s)</th><th>Subsonic filter</th></tr>
    ${dg.options.map(optRow).join("")}</table>
    <div class="hint">f3 = where the bass is 3 dB down (free field, before cabin gain). Peak = how far the response rises above flat (boomy above ~1.5 dB). Port speed under ~17 m/s avoids port noise (rule of thumb). Click an option to see it in 3D and highlight it in the plots.</div>
    <h2>Plots</h2><div class="toolbar"><button id="svgplots">Save plots (.svg)</button></div>
    <div class="plots"><div class="plotbox" id="pSpl"></div>${dg.options[0].simCabin ? '<div class="plotbox" id="pCab"></div>' : ""}<div class="plotbox" id="pX"></div><div class="plotbox" id="pV"></div><div class="plotbox" id="pZ"></div><div class="plotbox" id="pGd"></div></div>`;
  document.querySelectorAll<HTMLTableRowElement>("#opts tr[data-id]").forEach((tr) => tr.onclick = () => { chosen = tr.dataset.id!; showDiagnosis(dg); applyOption3D(dg); });
  drawPlots(dg.options, fp);
  $("#svgplots").onclick = () => document.querySelectorAll(".plots svg").forEach((s, i) => { const name = `${project.name}_plot${i + 1}.svg`; const txt = new XMLSerializer().serializeToString(s); download(name, txt, "image/svg+xml"); saveExport(name, txt); });
}
function applyOption3D(dg: Diagnosis) {
  const o = dg.options.find((x) => x.id === chosen); if (!o) return;
  const insert = o.box.Vb < dg.Vb - 1e-6 ? (dg.Vb - o.box.Vb) * project.drivers : 0;
  setup3D(insert, o.box.kind === "vented" ? "vented" : "sealed");
}
function drawPlots(options: FixOption[], fp: FullParams) {
  const sel = (o: FixOption, i: number, y: number[]): Series => ({ name: o.title.length > 34 ? o.title.slice(0, 32) + "…" : o.title, x: o.sim.f, y, color: PALETTE[i % PALETTE.length], width: o.id === chosen ? 3.5 : 1.6, dash: o.id === "asfound" ? "" : undefined });
  const ref = options.find((o) => o.id === chosen) ?? options[0]; setReference(ref.sim.f, (ref.simCabin ?? ref.sim).spl);
  plot($("#pSpl"), [...options.map((o, i) => sel(o, i, o.sim.spl)), ...overlaySeries("response")], { title: "Loudness, free field (half space, 1 m)", yLabel: "dB SPL" });
  if (options[0].simCabin) plot($("#pCab"), [...options.map((o, i) => sel(o, i, o.simCabin!.spl)), ...overlaySeries("response")], { title: "Loudness in the car (cabin gain model)", yLabel: "dB SPL" });
  plot($("#pX"), options.map((o, i) => sel(o, i, o.sim.xmm)), { title: "Cone travel (peak)", yLabel: "mm", yMin: 0, hLines: fp.Xmax ? [{ y: fp.Xmax * 1000, label: "Xmax", color: "#ff6b6b" }] : [] });
  const vent = options.filter((o) => o.box.kind === "vented");
  plot($("#pV"), vent.map((o) => sel(o, options.indexOf(o), o.sim.vport)), { title: "Port air speed (peak)", yLabel: "m/s", yMin: 0, hLines: [{ y: 17, label: "~17 m/s", color: "#f7b731" }] });
  plot($("#pZ"), [...options.map((o, i) => sel(o, i, o.sim.zmag)), ...overlaySeries("impedance")], { title: "Impedance (one driver)", yLabel: "Ω", yMin: 0 });
  plot($("#pGd"), options.map((o, i) => sel(o, i, o.sim.gdMs)), { title: "Group delay", yLabel: "ms", yMin: 0 });
}

// ---------- Design new ----------
const defaultDesign = (): DesignInputs => ({ kind: "sealed", target: "qtc", qtc: 0.707, customVbL: 40, customFb: 35, maxW: 800, maxH: 380, maxD: 450, t: 18, wedge: false, topDepthPct: 70, portShape: "slot", portD: 100, portW: 300, portH: 50, portCount: 1, bracesL: 1 });
/** A11: message about the last size change (refused edit, side stopped at its minimum, Best size note), shown in the Result. */
let sizeMsg: { text: string; cls: string } | undefined;
/** A11: required gross volume at the last render, to see whether a change moved it (keep the volume then resizes the box). */
let lastReqL: number | undefined;
const SIZE_KEY: Record<Side, "maxW" | "maxH" | "maxD"> = { W: "maxW", H: "maxH", D: "maxD" };
const LOCK_KEY: Record<Side, "lockW" | "lockH" | "lockD"> = { W: "lockW", H: "lockH", D: "lockD" };
const SIDE_NAME: Record<Side, string> = { W: "width", H: "height", D: "depth" };
const capFirst = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const locksOf = (ds: DesignInputs): Locks => ({ W: !!ds.lockW, H: !!ds.lockH, D: !!ds.lockD });
const sizesOf = (ds: DesignInputs): Sizes => ({ W: ds.maxW, H: ds.maxH, D: ds.maxD });
function setSizes(ds: DesignInputs, s: Sizes) { ds.maxW = s.W; ds.maxH = s.H; ds.maxD = s.D; }
const prDrivers = () => drivers.filter((d) => d.kind === "passive");
/** Passive radiator values in the UI (prCustom, UI units) → SI, same multipliers as the driver editor. */
const PR_CUSTOM: [string, string, string, number][] = [["Sd", "Sd (cone area)", "cm²", 1e-4], ["Mms", "Mms / Mmd (moving mass, without added mass)", "g", 0.001], ["Cms", "Cms (compliance)", "mm/N", 0.001], ["fs", "Fs (resonance, without added mass)", "Hz", 1], ["Vas", "Vas", "L", 0.001], ["Qms", "Qms", "", 1], ["Rms", "Rms", "kg/s", 1], ["Xmax", "Xmax (one way)", "mm", 0.001], ["dia", "Outer diameter", "mm", 0.001], ["cutout", "Cut-out diameter", "mm", 0.001], ["depth", "Mounting depth", "mm", 0.001], ["displacement", "Displacement (inside box)", "L", 0.001]];
/** The passive radiator of a design: from a driver of kind "passive" or the values typed in. */
function prInfo(ds: DesignInputs): { pr?: PRParams; name: string; err?: string; estimated: boolean } {
  let params: any; let name: string;
  if (ds.prId && ds.prId !== "custom") { const d = driverById(ds.prId); if (!d) return { name: ds.prId, err: "not found in the driver list", estimated: false }; params = d.params; name = `${d.brand} ${d.model}`; }
  else { params = Object.fromEntries(PR_CUSTOM.map(([k, , , m]) => [k, (ds.prCustom?.[k] ?? 0) * m])); name = "your values"; }
  try { const pr = completePR(params, air); return { pr, name, estimated: !(pr.dia && pr.depth) }; } catch (e) { return { name, err: (e as Error).message, estimated: false }; }
}
/** Sizes of a passive radiator on the baffle (m); diameter estimated from Sd like a driver's when not given (labelled). */
function prSizes(pr: PRParams) { const outer = pr.dia ?? Math.sqrt(pr.Sd / Math.PI) * 2 * 1.25; return { outer, cutout: pr.cutout ?? outer * 0.9, depth: pr.depth ?? outer * 0.35 }; }
interface SizingCtx {
  fp: FullParams & { displacement?: number }; tg: ReturnType<typeof alignmentTarget>; k: SizeSpec; items: BaffleItem[]; ls: Layout[]; bottomZone: number; pr?: ReturnType<typeof prInfo>;
  needs: (s: Sizes) => { grossL: number; netL: number; driverL: number; prL: number; portL: number; fit?: PortFit };
  req: (s: Sizes) => number; mins: (s: Sizes) => Sizes; layoutAt: (s: Sizes) => Layout | undefined;
  minsKeep: (start: Sizes) => (s: Sizes) => Sizes; // minimum sizes with the layout of the box before the change (stays fixed while solving)
}
/** Everything the size solvers need for the current classic design (undefined without a usable driver). */
function sizingCtx(): SizingCtx | undefined {
  const p = project; const ds = p.design; if (!ds) return undefined;
  const d = driverById(p.driverId); if (!d) return undefined;
  let fp: ReturnType<typeof full>; try { fp = full(d); } catch { return undefined; }
  const n = p.drivers; const isPR = ds.topology === "pr"; const t = ds.t;
  const tg = alignmentTarget(fp, ds, n); const k: SizeSpec = { t, top: ds.wedge ? ds.topDepthPct / 100 : 1 };
  const z = driverSizes(d); const pr = isPR ? prInfo(ds) : undefined;
  const items: BaffleItem[] = Array.from({ length: Math.max(1, n) }, () => ({ kind: "driver" as const, outer: z.outer * 1000, cutout: z.cutout * 1000, depth: z.depth * 1000 }));
  if (pr?.pr) { const q = prSizes(pr.pr); for (let i = 0; i < Math.max(1, ds.prCount ?? 1); i++) items.push({ kind: "pr", outer: q.outer * 1000, cutout: q.cutout * 1000, depth: q.depth * 1000 }); }
  const bottomZone = ds.kind === "vented" && ds.portShape === "slot" ? t + ds.portH : 0;
  const ls = layouts(items, { t, bottomZone });
  const VbTotal = tg.VbPer * n;
  const needs = (s: Sizes) => {
    const driverL = (fp.displacement ?? 0) * n * 1000; const prL = pr?.pr ? (pr.pr.displacement ?? 0) * Math.max(1, ds.prCount ?? 1) * 1000 : 0;
    let portL = 0, fit: PortFit | undefined;
    if (ds.kind === "vented" && tg.fb) { fit = fitPort(boxAtMm(s, ds), askedPort(s, ds), VbTotal, tg.fb, air.c); portL = fit.layout.fits ? fit.layout.displacement * 1000 : 0; }
    return { grossL: VbTotal * 1000 + driverL + prL + ds.bracesL + portL, netL: VbTotal * 1000, driverL, prL, portL, fit };
  };
  const layoutAt = (s: Sizes) => chooseLayout(ls, items, k, s);
  const mins = (s: Sizes) => { const l = layoutAt(s); return l ? minSizes(l, items, k, s.H, { t, bottomZone }) : { W: 0, H: 0, D: 0 }; };
  const minsKeep = (start: Sizes) => { const l = layoutAt(start); return (s: Sizes) => (l ? minSizes(l, items, k, s.H, { t, bottomZone }) : { W: 0, H: 0, D: 0 }); };
  return { fp, tg, k, items, ls, bottomZone, pr, needs, req: (s) => needs(s).grossL, mins, layoutAt, minsKeep };
}
const boxAtMm = (s: Sizes, ds: DesignInputs) => ({ W: s.W / 1000, H: s.H / 1000, D: s.D / 1000, Dtop: ds.wedge ? (s.D * ds.topDepthPct) / 100 / 1000 : undefined, t: ds.t / 1000, baffleExtra: 0 });
/** The port as asked: slots side by side across the inside width (divider boards between), or round tubes. */
function askedPort(s: Sizes, ds: DesignInputs): PortGeom {
  const nP = Math.max(1, ds.portCount); const t = ds.t; const slotWmax = (s.W - 2 * t - (nP - 1) * t) / nP;
  return { shape: ds.portShape, count: nP, d: ds.portD / 1000, w: slotWmax / 1000, h: ds.portH / 1000, length: 0.1, wall: 0.003, flare: ds.portShape === "round" ? (ds.portFlare ?? 0) / 1000 : 0 };
}
function holdMsg(r: HoldResult): { text: string; cls: string } | undefined {
  if (r.refused) return { text: r.msg!, cls: "bad" };
  const names = capFirst(r.clamped.map((x) => SIDE_NAME[x]).join(" and "));
  if (r.clamped.length) return { text: `${names} stopped at the minimum the drivers need (front size or magnet depth)${r.ok ? "; the other side took up the change" : `: the volume could not be kept (${fmtL(r.grossL, 2)}, needs ${fmtL(r.reqL, 2)})`}`, cls: r.ok ? "warn" : "bad" };
  if (!r.ok) return { text: `The volume could not be kept (${fmtL(r.grossL, 2)}, needs ${fmtL(r.reqL, 2)})`, cls: "bad" };
  return undefined;
}
function bestMsg(r: BestResult, items: BaffleItem[], ds: DesignInputs): { text: string; cls: string } {
  const nPr = items.filter((i) => i.kind === "pr").length, nD = items.length - nPr;
  if (SIDES.every((x) => locksOf(ds)[x])) return { text: "All three sides are locked: unlock at least one for Best size", cls: "bad" };
  if (!r.ok && r.grossL > r.reqL && r.layout) return { text: `What goes on the front (${nD} driver${nD > 1 ? "s" : ""}${nPr ? ` and ${nPr} passive radiator${nPr > 1 ? "s" : ""}` : ""}) needs at least ${fmtMm(Math.ceil(r.layout.Wmin))} × ${fmtMm(Math.ceil(r.layout.Hmin))} outside and room for the magnets, so the smallest box is ${fmtL(r.grossL, 2)}, more than the ${fmtL(r.reqL, 2)} needed. Use fewer or smaller drivers or passive radiators, or fill the extra with solid inserts.`, cls: "bad" };
  if (!r.ok) return { text: `The needed ${fmtL(r.reqL, 2)} cannot be reached with the locked sides and the drivers' minimum sizes (${fmtL(r.grossL, 2)})`, cls: "bad" };
  const lay = r.layout && items.length > 1 ? ` Front: ${r.layout.rows === 1 ? (items.length > 1 ? "in a row" : "") : r.layout.cols === 1 ? "in a column" : `${r.layout.cols} across × ${r.layout.rows} rows`}.` : "";
  return { text: `Best size: ${fmtMm(r.sizes.W)} × ${fmtMm(r.sizes.H)} × ${fmtMm(r.sizes.D, 1)} for ${fmtL(r.grossL, 2)} gross, inside proportions ${r.clamped.length ? "as close to" : "close to"} 1 : 1.28 : 1.54 (depth : height : width)${r.clamped.length ? " as the drivers allow" : ""}.${lay}${r.clamped.length ? ` ${capFirst(r.clamped.map((x) => SIDE_NAME[x]).join(" and "))} set by what the drivers need.` : ""}`, cls: r.clamped.length ? "warn" : "ok" };
}
// read-only hook for the headless dry runs: what the size solvers see for the current design
(window as any).__abSizing = () => { const c = sizingCtx(); const ds = project.design; return c && ds ? { k: c.k, items: c.items, bottomZone: c.bottomZone, req: c.req(sizesOf(ds)), locks: locksOf(ds), sizes: sizesOf(ds), mins: c.mins(sizesOf(ds)) } : undefined; };
/** Old designs (before A11) stored the space available and had the depth solved for the volume: open them with the depth the
 * app showed then, so their sizes do not change (in memory; saved with the next change). */
function migrateSizing(ds: DesignInputs) {
  const ctx = sizingCtx(); if (!ctx) return;
  const r = holdVolume(sizesOf(ds), null, ctx.k, ctx.req, { W: true, H: true });
  ds.maxD = Math.round(r.sizes.D); ds.sizing = 2;
}
/** Keep the volume: a side (or the wedge top %, or the panel thickness: edited = null) was changed. */
function onSizeEdit(key: string, value: unknown) {
  const p = project; const ds = p.design!; sizeMsg = undefined;
  const side = (Object.keys(SIZE_KEY) as Side[]).find((x) => SIZE_KEY[x] === key);
  const before = sizesOf(ds); const prev = (ds as any)[key];
  (ds as any)[key] = value;
  const ctx = ds.keepVolume ? sizingCtx() : undefined;
  if (ctx) {
    const r = holdVolume(sizesOf(ds), side ?? null, ctx.k, ctx.req, locksOf(ds), ctx.minsKeep(before));
    if (r.refused) {
      if (side) { (ds as any)[key] = prev; setSizes(ds, before); } // the edit is not applied
      sizeMsg = { text: side ? r.msg! : `${r.msg!} (your change was applied; the volume now differs)`, cls: "bad" }; status(sizeMsg.text, "bad");
    } else { setSizes(ds, r.sizes); sizeMsg = holdMsg(r); }
  }
  saveProjectSoon(); renderDesign();
}
/** After any other change: if the required volume moved (driver, count, target, braces, port, passive radiators) and keep the
 * volume is ticked, the unlocked sides follow. The first render of a project never resizes. */
function followVolume() {
  const ds = project.design; if (!ds?.keepVolume || ds.sizing !== 2 || lastReqL === undefined) return;
  const ctx = sizingCtx(); if (!ctx) return;
  const R = ctx.req(sizesOf(ds)); if (Math.abs(R - lastReqL) < 0.01) return;
  const r = holdVolume(sizesOf(ds), null, ctx.k, ctx.req, locksOf(ds), ctx.minsKeep(sizesOf(ds)));
  if (r.refused) sizeMsg = { text: `${r.msg!}: the box now differs from the volume needed`, cls: "bad" };
  else { setSizes(ds, r.sizes); sizeMsg = holdMsg(r) ?? { text: `The box followed the new volume (${fmtL(R, 2)} gross)`, cls: "ok" }; }
}
/** B2_SECTIONS: home and computer speaker boxes (upright proportions, depth rule, baffle step and crossover notes). */
const isHomeLike = () => section === "home" || section === "computer";
function homeNotesHtml(g: Project["geom"], ds: DesignInputs): string {
  const hf = homeFacts({ W: g.W, H: g.H, D: g.D }, { t: g.t, top: g.wedge ? g.Dtop / g.D : 1 });
  const pr = PRESETS[section]?.find((x) => x.id === ds.preset);
  const shallow = g.D < MIN_DEPTH_RATIO * g.W - 0.5;
  return `<h2>Home and desk speaker notes</h2><table class="kv" id="homeNotes">
    <tr><td title="f3 = 115 / baffle width (m), after John Murphy (True Audio), based on Olson 1969; R. Elliott, ESP: https://www.sound-au.com/bafflestep.htm">Baffle step</td><td class="num" id="homeStep">about <b>${f1(hf.stepHz, 0)} Hz</b> for a ${esc(fmtMm(g.W))} wide front: above it the speaker sends its sound forward (+6 dB), below it all round, so on a stand away from walls the bass sounds up to 6 dB weaker than the treble. Near a wall or on a desk less correction is needed. Wider front = lower step.</td></tr>
    <tr><td title="Wharfedale Diamond 12.1 / 12.2 / 12.3 / 12.4 cabinet volume vs outside size (research_h 3.1)">Inside / outside volume</td><td class="num" id="homeRatio">${esc(fmtL(hf.insideL, 2))} inside of ${esc(fmtL(hf.outsideL, 2))} outside = <b>${f1(hf.ratio * 100, 0)} %</b> (Wharfedale Diamond 12 series: ${WHARFEDALE_RATIO.min * 100}-${WHARFEDALE_RATIO.max * 100} %)</td></tr>
    <tr><td>Crossover (2-way)</td><td class="num" id="homeXover">${XOVER_2WAY_HZ[0] / 1000}-${XOVER_2WAY_HZ[1] / 1000} kHz in every product checked (Genelec 8010A 3.0 kHz, KEF LS50 Meta 2.1, Wharfedale Diamond 12 series 2.0-2.6 kHz). Pick it inside the woofer's clean range and well above the tweeter's resonance; the crossover itself is not designed here.</td></tr>
    <tr><td>Proportions</td><td class="num ${shallow ? "warn" : "ok"}" id="homeDepth">depth ${f1(g.D / g.W, 2)} × the width${shallow ? `: shallower than the ${MIN_DEPTH_RATIO} × of the shallowest reference product (JBL 104); press Best size` : ` (at least ${MIN_DEPTH_RATIO} ×, as the reference products)`}</td></tr>
    ${pr?.like ? `<tr><td>Preset "${esc(pr.label)}"</td><td class="num">like ${esc(pr.like)}; typical bass ${esc(pr.bass ?? "")}. The real box comes from your driver's T/S values: the preset is only a starting shape.</td></tr>` : ""}</table>
    <div class="hint">Sources: references/research_h_ib_door_home_pc.md section 3 (maker pages of Genelec, JBL, KEF, Wharfedale; Wikipedia LS3/5A; ESP and Purifi on the baffle step), Help tab.</div>`;
}
function renderDesign() {
  lastReqL = undefined; // set again below by a classic design
  const p = project; p.design = { ...defaultDesign(), ...(p.design ?? {}) }; const ds = p.design;
  ds.topology ??= ds.kind; ds.isobaric ??= false; ds.portFlare ??= 0;
  ds.keepVolume ??= true; ds.prCount ??= 2; ds.prAuto ??= true; ds.prMassG ??= 0; ds.prCustom ??= {};
  const allowedTopo = sectionTopologies(section); // B1: Home / Computer speakers: sealed, ported, passive radiator
  if (allowedTopo && (!allowedTopo.includes(String(ds.topology)) || ds.isobaric)) { ds.topology = allowedTopo.includes(ds.kind) ? ds.kind : "sealed"; ds.isobaric = false; }
  for (const [k] of PR_CUSTOM) ds.prCustom[k] ??= 0;
  const isPR = ds.topology === "pr";
  if (ds.topology === "sealed" || ds.topology === "vented") ds.kind = ds.topology;
  if (isPR) { ds.kind = "sealed"; if (!ds.prId || (ds.prId !== "custom" && !driverById(ds.prId))) ds.prId = prDrivers()[0]?.id ?? "custom"; }
  const ventLike = ds.kind === "vented" || isPR;
  if (ventLike && ds.target === "qtc") ds.target = "qb3";
  if (!ventLike && (ds.target === "qb3" || ds.target === "sbb4")) ds.target = "qtc";
  const d = driverById(p.driverId); if (syncImpedance(p, d)) saveProjectSoon();
  const isTL = ds.topology === TL_ID; // A15_TLINE
  const advanced = !isTL && (ds.isobaric || !(ds.topology === "sealed" || ds.topology === "vented" || isPR));
  if (advanced && d) { try { seedAdvanced(ds, full(d), p.drivers); } catch { /* incomplete driver */ } }
  const free = !advanced && !isTL && p.shape!.mode !== "classic";
  const classicSizing = !advanced && !free && !isTL;
  if (classicSizing && ds.sizing !== 2) migrateSizing(ds);
  if (classicSizing && pendingBest === activeItem.id) { // B1: a preset was applied: scale it to the volume needed, proportions kept
    pendingBest = undefined; const ctx = sizingCtx();
    if (ctx) {
      const r = holdVolume(sizesOf(ds), null, ctx.k, ctx.req, locksOf(ds), ctx.minsKeep(sizesOf(ds)));
      if (!r.refused) setSizes(ds, r.sizes);
      const pn = PRESETS[section]?.find((x) => x.id === ds.preset)?.label ?? "Preset";
      sizeMsg = holdMsg(r) ?? { text: `${pn}: scaled to the ${fmtL(r.grossL, 2)} gross this driver needs, ${ds.lockH ? "height kept" : "proportions kept"}`, cls: "ok" };
      const dk = isHomeLike() && !r.refused ? keepDepth(sizesOf(ds), ctx.k, ctx.req, locksOf(ds), ctx.mins) : undefined; // B2: no shallow home boxes
      if (dk?.changed) { setSizes(ds, dk.sizes); if (ds.lockH) ds.lockH = false; sizeMsg = { text: `${pn}: ${dk.msg}`, cls: dk.hold?.ok === false ? "bad" : "warn" }; }
      if (!pristine.has(activeItem.id)) saveProjectSoon();
    }
  }
  const ti = TOPOLOGY_INFO[(ds.topology === "pr" || isTL ? "sealed" : ds.topology) as Topology];
  if (isTL && d && !ds.tl) { try { const z = driverSizes(d); ds.tl = tlDefaults(full(d), { outer: z.outer, cutout: z.cutout, depth: z.depth, disp: z.disp }, Math.max(1, p.drivers), ds.t, d.id, air).tl; saveProjectSoon(); } catch { /* incomplete driver: shown below */ } }
  const chamberFields = () => {
    const c = ti.chambers; let h = `<div class="hint">${esc(ti.text)} Starting values come from the 4th-order bandpass cookbook (research_c §4) or the alignment tables; change them and watch the curves.${ds.isobaric ? " Isobaric: two identical drivers face to face or in a tunnel, moving together; acts like one driver with half the Vas (needs half the box), same fs and Qts; parallel wiring halves the impedance." : ""}</div>`;
    h += field(`${c[0]}: net volume (total)`, ds, "V1", "L");
    if (ds.topology === "vented" || ds.topology === "bp6" || ds.topology === "bp3dual") h += field(`${c[0]}: port tuning`, ds, "fb1", "Hz") + field(`${c[0]}: port area (total)`, ds, "pa1", "cm²");
    if (c[1]) h += field(`${c[1]}: net volume (total)`, ds, "V2", "L") + field(`${c[1]}: port tuning`, ds, "fb2", "Hz") + field(`${c[1]}: port area (total)`, ds, "pa2", "cm²");
    if (c[2]) h += field(`${c[2]}: net volume (total)`, ds, "V3", "L") + field(`${c[2]}: port tuning`, ds, "fb3", "Hz") + field(`${c[2]}: port area (total)`, ds, "pa3", "cm²");
    return h + field("Round ports per chamber", ds, "portCount", "", { step: 1, min: 1 });
  };
  const topoAll = topologyOptions(); topoAll.splice(2, 0, ["pr", "Sealed with passive radiators"], [TL_ID, TL_NAME]);
  const topo = allowedTopo ? topoAll.filter(([k]) => allowedTopo.includes(k)) : topoAll;
  const presets = PRESETS[section];
  const presetRow = presets ? `<div class="row" id="presetRow"><label title="Starting shape for this kind of speaker: applying it scales the box to the volume the driver needs (proportions kept; floor-standing keeps its height)">Preset</label><select id="preset">${presets.map((x) => `<option value="${x.id}" ${x.id === ds.preset ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select><button id="applyPreset">Apply</button></div><div class="hint" id="presetNote">${esc(presets.find((x) => x.id === ds.preset)?.note ?? presets[0].note)}. Scaled to the volume the driver needs.</div>` : "";
  const lockBox = (x: Side) => `<label class="lock" title="Locked: this side never changes automatically"><input type="checkbox" data-lock="${x}" ${ds[LOCK_KEY[x]] ? "checked" : ""}> lock</label>`;
  const sizeRow = (label: string, x: Side) => field(label, ds, SIZE_KEY[x], "mm").replace(/<\/div>$/, lockBox(x) + "</div>");
  const boxFieldset = classicSizing ? `<fieldset id="dsB"><legend>Box (outside sizes)</legend>
      ${sizeRow("Width (outside)", "W")}${sizeRow("Height (outside)", "H")}${sizeRow(ds.wedge ? "Depth at the bottom (outside)" : "Depth (outside)", "D")}
      ${field("Panel thickness", ds, "t", "mm")}${field("Sloped back (wedge, e.g. behind a seat)", ds, "wedge")}${ds.wedge ? field("Top depth as % of bottom", ds, "topDepthPct", "%") : ""}${field("Braces", ds, "bracesL", "L")}
      ${field("Keep the volume (change one side: the other unlocked sides follow)", ds, "keepVolume", "", { title: "Ticked: editing a size recalculates the other unlocked sides so the box keeps the volume this driver needs. Unticked: only the side you edit changes, and the volume and results follow the sizes." })}
      <div class="toolbar"><button id="bestSize" title="Outside sizes for the volume needed: good proportions, every driver on the front, room for the magnets; locked sides are kept">Best size</button></div></fieldset>`
    : `<fieldset id="dsB"><legend>Space available (outside)</legend>${field("Max width", ds, "maxW", "mm")}${field("Max height", ds, "maxH", "mm")}${field("Max depth", ds, "maxD", "mm")}
      ${field("Panel thickness", ds, "t", "mm")}${field("Braces", ds, "bracesL", "L")}</fieldset>`;
  const prSel = ds.prId ?? "custom";
  const prFieldset = isPR && !advanced ? `<fieldset id="dsP"><legend>Passive radiators</legend>
      ${select("prId", prSel, [...prDrivers().map((x) => [x.id, `${x.brand} ${x.model}`] as [string, string]), ["custom", "Enter its values below"]], "Passive radiator")}
      ${field("Number of passive radiators", ds, "prCount", "", { step: 1, min: 1 })}
      ${field("Pick the added mass for the tuning", ds, "prAuto")}${ds.prAuto ? "" : field("Added mass per passive radiator", ds, "prMassG", "g")}
      <div class="hint">A passive radiator is a cone with a surround and spider but no voice coil or magnet: the air pressure in the box moves it, like the air in a port. Its weight (plus added mass) sets the tuning. Add passive radiators on the Drivers tab (Kind: passive radiator) or enter the values here.</div></fieldset>
      ${prSel === "custom" ? `<fieldset id="dsPc"><legend>Passive radiator values (from its spec sheet)</legend>${PR_CUSTOM.map(([k, l, u]) => field(l, ds.prCustom, k, u, { type: "number" })).join("")}<div class="hint">Needed: Sd, the moving mass (or Fs with Cms or Vas), the compliance (Cms or Vas, or Fs with the mass) and Qms or Rms. Xmax for the travel check. Leave a value at 0 if the sheet does not give it: nothing is guessed.</div></fieldset>` : ""}` : "";
  $("#page").innerHTML = `<div class="cols"><div>
    <fieldset id="dsA"><legend>Driver and box type</legend>${driverSelect(p.driverId)}${field(ds.isobaric ? "Number of isobaric pairs" : "Number of drivers", p, "drivers", "", { step: 1, min: 1 })}
      ${presetRow}${select("topology", ds.topology!, topo, "Box type")}${isTL || allowedTopo ? "" : field("Isobaric (two drivers per position, compound)", ds, "isobaric")}
      ${ds.isobaric ? select("isoWiring", ds.isoWiring ?? "parallel", [["parallel", "Coils of the pair in parallel"], ["series", "Coils of the pair in series"]], "Pair wiring") + field("Air between the pair (tunnel/clamshell)", ds, "isoGapL", "L") : ""}
      ${isTL ? "" : !advanced ? (!ventLike ? select("target", ds.target === "custom" ? "custom" : "qtc", [["qtc", "Target Qtc"], ["custom", "My own volume"]], "Size by") + (ds.target === "custom" ? field("Net volume (total)", ds, "customVbL", "L") : field("Target Qtc", ds, "qtc", "", { step: 0.01 }))
        : select("target", ds.target === "qtc" ? "qb3" : ds.target, [["qb3", "QB3 (low Qts drivers)"], ["sbb4", "SBB4 (higher Qts)"], ["custom", "My own volume and tuning"]], isPR ? "Alignment (tuned like a ported box)" : "Alignment") + (ds.target === "custom" ? field("Net volume (total)", ds, "customVbL", "L") + field("Tuning", ds, "customFb", "Hz") : "")) : chamberFields()}
      ${field("Amp power per driver", p.power, "watts", "W")}${hasCoilChoice(d) ? coilRowsHtml(p, d, p.drivers * (ds.isobaric ? 2 : 1)) : field("Impedance per driver", p.power, "impedance", "Ω")}
    </fieldset>
    ${prFieldset}
    ${isTL ? (ds.tl ? tlFieldsHtml(ds.tl, field("Panel thickness", ds, "t", "mm")) : "") : free ? shapePanelHtml(p) : `${!advanced ? shapePanelHtml(p) : ""}${boxFieldset}`}
    ${!advanced && !isTL && ds.kind === "vented" ? `<fieldset id="dsC"><legend>Port</legend>${select("portShape", ds.portShape, [["slot", free ? "Slot" : "Slot along the bottom"], ["round", "Round tube"]], "Shape")}${field("Number", ds, "portCount", "", { step: 1, min: 1 })}
      ${ds.portShape === "round" ? field("Diameter", ds, "portD", "mm") + field("Flared ends: flare radius", ds, "portFlare", "mm", { title: "Aeroport-style flares; 0 = straight" }) : (free ? field("Slot width", ds, "portW", "mm") : "") + field("Slot height", ds, "portH", "mm")}</fieldset>` : ""}
    </div><div><div class="view3d" id="v3d"></div>
      <div class="toolbar"><label><input type="checkbox" id="xray"> X-ray</label><label>Explode <input type="range" id="explode" min="0" max="1" step="0.05" value="0"></label><label>Blender mouse <input type="checkbox" id="bmouse" checked></label>
      <button id="glb">Export .glb (Blender)</button><button id="stl">Export .stl</button><button id="png">Save picture</button><button id="cut">Cut list</button></div>
      <div class="toolbar"><button class="primary" id="use">Use this design for project "${esc(p.title)}"</button></div>
      <div id="dsOut"></div><div id="volbox"></div><div id="cutbox"></div></div></div>
    <div class="plots"><div class="plotbox" id="pSpl"></div><div class="plotbox" id="pX"></div>${advanced || isTL ? '<div class="plotbox" id="pV"></div>' : ""}<div class="plotbox" id="pZ"></div>${isTL ? '<div class="plotbox" id="pCmp"></div>' : ""}</div>${isTL ? '<div id="tlCmpBox"></div>' : ""}<div id="measbox"></div>`;
  renderMeasPanel($("#measbox"), measCtx, false);
  const onChange = (note?: string) => {
    sizeMsg = undefined; if (classicSizing) followVolume();
    const m = sizeMsg as { text: string; cls: string } | undefined; // set by followVolume
    if (typeof note === "string") sizeMsg = { text: note + (m ? " " + m.text : ""), cls: m?.cls ?? "ok" };
    saveProjectSoon(); renderDesign();
  };
  if ($("#dsT") && ds.tl) { // A15_TLINE: line inputs; panel thickness lives on the design
    $("#dsT").querySelectorAll<HTMLInputElement>("input[data-key]").forEach((inp) => inp.addEventListener("change", () => { const k = inp.dataset.key!; if (k === "t") ds.t = Number(readInput(inp)); else (ds.tl as any)[k] = readInput(inp); onChange(); }));
    bindFields($("#dsTc"), ds.tl, onChange);
    $("#tlSuggest").onclick = () => { if (!d) { status("Choose a driver first", "bad"); return; } const z = driverSizes(d); const keep = ds.tl!; const nd = tlDefaults(full(d), { outer: z.outer, cutout: z.cutout, depth: z.depth, disp: z.disp }, Math.max(1, p.drivers), ds.t, d.id, air).tl;
      ds.tl = { ...nd, cmpSealedL: keep.cmpSealedL, cmpPortedL: keep.cmpPortedL, cmpPortD: keep.cmpPortD, cmpPortLen: keep.cmpPortLen }; status("Suggested line for " + d.brand + " " + d.model, "ok"); onChange(); };
  }
  bindFields($("#dsA"), ds, onChange); if ($("#dsC")) bindFields($("#dsC"), ds, onChange); if ($("#dsP")) bindFields($("#dsP"), ds, onChange); if ($("#dsPc")) bindFields($("#dsPc"), ds.prCustom, onChange);
  if ($("#dsB")) {
    if (!classicSizing) bindFields($("#dsB"), ds, onChange);
    else {
      $("#dsB").querySelectorAll<HTMLInputElement>("input[data-key]").forEach((inp) => inp.addEventListener("change", () => {
        const key = inp.dataset.key!; const v = readInput(inp);
        if (["maxW", "maxH", "maxD", "topDepthPct", "t", "wedge"].includes(key)) onSizeEdit(key, v); else { (ds as any)[key] = v; onChange(); }
      }));
      $("#dsB").querySelectorAll<HTMLInputElement>("input[data-lock]").forEach((inp) => inp.addEventListener("change", () => { ds[LOCK_KEY[inp.dataset.lock as Side]] = inp.checked; saveProjectSoon(); renderDesign(); }));
      $("#bestSize").onclick = () => {
        const ctx = sizingCtx(); if (!ctx) { status("Choose a driver first", "bad"); return; }
        const home = isHomeLike(); // B2: home / computer boxes stand upright (width smallest) and are never shallow
        const r = bestSize(sizesOf(ds), ctx.k, ctx.req, locksOf(ds), ctx.items, { t: ds.t, bottomZone: ctx.bottomZone }, home ? RATIO_UPRIGHT : undefined);
        sizeMsg = bestMsg(r, ctx.items, ds);
        if (home) sizeMsg.text = sizeMsg.text.replace("1 : 1.28 : 1.54 (depth : height : width)", "1 : 1.28 : 1.54 (width : depth : height, upright)");
        if (!SIDES.every((x) => locksOf(ds)[x])) setSizes(ds, r.sizes);
        if (home && !SIDES.every((x) => locksOf(ds)[x])) { const dk = keepDepth(sizesOf(ds), ctx.k, ctx.req, locksOf(ds), ctx.mins); if (dk.changed) { setSizes(ds, dk.sizes); if (ds.lockH) ds.lockH = false; sizeMsg = { text: `${sizeMsg.text} ${dk.msg}`, cls: "warn" }; } }
        status(sizeMsg.text, sizeMsg.cls === "bad" ? "bad" : "ok"); saveProjectSoon(); renderDesign();
      };
    }
  }
  fixBind("#dsA select[data-key=driverId]", p, "driverId", onChange);
  if ($("#applyPreset")) $("#applyPreset").onclick = () => { const pr = presets?.find((x) => x.id === $<HTMLSelectElement>("#preset").value); if (!pr) return; applyPreset(p, pr); pendingBest = activeItem.id; pristine.delete(activeItem.id); status(`Preset "${pr.label}" applied`, "ok"); saveProjectSoon(); renderDesign(); };
  if ($("#preset")) $("#preset").onchange = () => { const pr = presets?.find((x) => x.id === $<HTMLSelectElement>("#preset").value); if (pr && $("#presetNote")) $("#presetNote").textContent = pr.note + ". Scaled to the volume the driver needs."; };
  { // number of drivers: "My own volume" is a total, so it scales with the count (the volume needed per driver stays)
    const el = document.querySelector<HTMLInputElement>("#dsA input[data-key=drivers]");
    if (el) { const c = el.cloneNode(true) as HTMLInputElement; el.replaceWith(c); c.addEventListener("change", () => {
      const nOld = Math.max(1, p.drivers), nNew = Math.max(1, Math.round(Number(readInput(c)) || 1)); p.drivers = nNew;
      if (!advanced && ds.target === "custom" && nNew !== nOld) { const was = ds.customVbL; ds.customVbL = Math.round((ds.customVbL * nNew) / nOld * 100) / 100; onChange(`Your own net volume was scaled from ${fmtL(was, 2)} to ${fmtL(ds.customVbL, 2)} for ${nNew} driver${nNew > 1 ? "s" : ""}.`); }
      else onChange();
    }); }
  }
  fixBind("#dsA input[data-key=watts]", p.power, "watts", onChange); fixBind("#dsA input[data-key=impedance]", p.power, "impedance", onChange);
  if ($("#fsShape")) bindShapePanel(p, shapeCtx, onChange);
  bindCoil(p, d, onChange);
  if (!d) { $("#dsOut").innerHTML = `<p class="muted">Choose a driver.</p>`; return; }
  let fp: ReturnType<typeof full>; try { fp = full(d); } catch (e) { $("#dsOut").innerHTML = `<p class="bad">${esc((e as Error).message)}</p>`; return; }
  if (isTL) { designTL(fp, ds); return; }
  if (advanced) { designAdvanced(fp, ds); return; }
  if (free) { designFree(fp, ds); return; }
  const res = designBox(fp, ds, p.drivers);
  lastReqL = res.reqL;
  const draft: Project = { ...p, kind: ds.kind, geom: { ...res.geom, otherL: res.prL }, port: res.port, shape: { ...p.shape!, mode: "classic" } };
  const saved = project; project = draft; extra3D = { items: res.items3d, prs: res.prs3d }; setup3D(); extra3D = {}; showVolume(); project = saved;
  $("#cut").onclick = () => { const s = project; project = draft; showCutList(res.holes); project = s; };
  const xm = (fp.Xmax ?? 0) * 1000; const pr = res.prRes;
  const volDiff = res.grossL - res.reqL; const volOk = Math.abs(volDiff) <= 0.1;
  $("#dsOut").innerHTML = `<h2>Result</h2><table class="kv">
    <tr><td>Net volume needed</td><td class="num"><b>${fmtL(res.VbTotal * 1000)}</b>${res.fb ? ` tuned to <b>${f1(res.fb)} Hz</b>` : ""}${res.Qtc ? ` · Qtc ${f1(res.Qtc, 2)}` : ""}</td></tr>
    <tr><td title="Gross inside volume this design needs (net + driver(s) + passive radiators + braces + port) against the gross inside volume of the sizes entered">Volume check</td><td class="num ${volOk ? "ok" : "warn"}" id="dsVolChk">needs ${fmtL(res.reqL, 2)} gross · this box ${fmtL(res.grossL, 2)}${volOk ? " ✓" : ` (${volDiff > 0 ? "+" : ""}${fmtL(volDiff, 2)}): press <b>Best size</b>${ds.keepVolume ? "" : " or tick Keep the volume"} to match`}</td></tr>
    <tr><td title="Air inside the box before anything is taken out: the figure makers quote when their volumes include the driver">Inside volume (gross)</td><td class="num" id="dsGross"><b>${fmtL(res.grossL, 2)}</b> = net ${fmtL(res.netBuiltL, 2)} + driver${p.drivers > 1 ? "s" : ""} ${fmtL(res.driverL, 2)}${res.prL ? ` + passive radiators ${fmtL(res.prL, 2)}` : ""}${res.bracesL ? ` + braces ${fmtL(res.bracesL, 2)}` : ""}${res.portL ? ` + port ${fmtL(res.portL, 2)}` : ""}</td></tr>
    <tr><td>Outside size</td><td class="num" id="dsSize"><b>${fmtMm(res.geom.W, 1)} × ${fmtMm(res.geom.H, 1)} × ${fmtMm(res.geom.D, 1)}${res.geom.wedge ? " → " + fmtMm(res.geom.Dtop, 1) : ""}</b> (W × H × D)</td></tr>
    <tr><td>Front baffle</td><td class="num" id="dsFront">${esc(res.frontText)}</td></tr>
    ${res.fb && !pr ? `<tr><td>Port</td><td class="num">${res.port.count} × ${res.port.shape === "round" ? fmtMm(res.port.d) + " round" + (res.port.flare ? `, flared (r ${fmtMm(res.port.flare)})` : "") : fmtMm(res.port.w) + " × " + fmtMm(res.port.h) + " slot"}, length <b>${fmtMm(res.port.length)}</b> · peak air speed <span class="${res.summary.maxVport > 17 ? "warn" : "ok"}">${f1(res.summary.maxVport)} m/s</span></td></tr>` : ""}
    ${pr ? `<tr><td>Passive radiators</td><td class="num" id="dsPR">${pr.m} × ${esc(pr.name)}, added mass <b>${f1(pr.addKg * 1000, 0)} g</b> each${ds.prAuto ? " (picked for the tuning)" : ""} · box tuning fb <b>${f1(pr.fb)} Hz</b> · notch at fp ${f1(pr.fp)} Hz · travel <span class="${pr.xmax && pr.maxX > pr.xmax ? "bad" : "ok"}">${f1(pr.maxX)} mm${pr.xmax ? ` / Xmax ${f1(pr.xmax)}` : ""}</span>${pr.vd !== undefined ? ` · displacement ${f1(pr.vd, 1)} × the driver${p.drivers > 1 ? "s'" : "'s"}` : ""}</td></tr>` : ""}
    <tr><td>f3 · peak · max cone travel</td><td class="num">${f1(res.summary.f3)} Hz · ${res.summary.peakDb > 0.05 ? "+" + f1(res.summary.peakDb) : "flat"} dB · ${f1(res.summary.maxXmm)} mm${xm ? ` / Xmax ${f1(xm)}` : ""}${res.sub ? ` (with ${res.sub} Hz subsonic)` : ""}</td></tr>
    ${sizeMsg ? `<tr><td colspan="2" class="${sizeMsg.cls}" id="sizeMsg">${esc(sizeMsg.text)}</td></tr>` : ""}
    ${res.bad.map((x) => `<tr><td colspan="2" class="bad">${esc(x)}</td></tr>`).join("")}${res.problems.map((x) => `<tr><td colspan="2" class="warn">${esc(x)}</td></tr>`).join("")}</table>${isHomeLike() ? homeNotesHtml(res.geom, ds) : ""}`;
  setReference(res.sim.f, res.sim.spl);
  plot($("#pSpl"), [{ name: "Free field", x: res.sim.f, y: res.sim.spl, color: PALETTE[1] }, ...overlaySeries("response")], { title: "Loudness (half space, 1 m)", yLabel: "dB SPL" });
  plot($("#pZ"), [{ name: "Impedance", x: res.sim.f, y: res.sim.zmag, color: PALETTE[3] }, ...overlaySeries("impedance")], { title: "Impedance (one driver)", yLabel: "Ω", yMin: 0 });
  const hl = [...(xm ? [{ y: xm, label: "Xmax", color: "#ff6b6b" }] : []), ...(pr?.xmax ? [{ y: pr.xmax, label: "PR Xmax", color: "#f7b731" }] : [])];
  plot($("#pX"), [{ name: pr ? "Driver cone travel" : "Cone travel", x: res.sim.f, y: res.sim.xmm, color: PALETTE[2] }, ...(res.sim.xpr ? [{ name: "Passive radiator travel", x: res.sim.f, y: res.sim.xpr, color: PALETTE[4] }] : [])], { title: pr ? "Cone travel (peak): driver and passive radiator" : "Cone travel (peak)", yLabel: "mm", yMin: 0, hLines: hl });
  $("#use").onclick = () => {
    if (isPR) { alert("Saved: a passive-radiator design stays in this project's design settings (saved automatically). The Analyse/Fix tab works with sealed and ported boxes."); saveProjectSoon(); return; }
    if (!confirm(`Replace the box in project "${p.title}" with this design?`)) return; p.kind = ds.kind; p.geom = res.geom; p.port = res.port; p.shape!.mode = "classic"; lastDiag = undefined; saveUsedDesign();
  };
}
/** Alignment target (net volume per driver and tuning) shared by the classic and free-form designers. A passive-radiator box
 * is sized and tuned like a ported box (Small 1974: the PR box is a close relative of the vented box). */
function alignmentTarget(fp: FullParams, ds: DesignInputs, n: number) {
  const problems: string[] = []; let VbPer: number, fb: number | undefined, Qtc: number | undefined;
  const ventLike = ds.kind === "vented" || ds.topology === "pr";
  if (!ventLike) {
    if (ds.target === "custom") VbPer = ds.customVbL / 1000 / n;
    else { VbPer = sealedVbForQtc(fp.Qts, fp.Vas, ds.qtc); if (!(VbPer > 0)) { problems.push(`Qtc ${ds.qtc} is impossible with Qts ${fp.Qts.toFixed(2)}: pick a higher target.`); VbPer = fp.Vas; } }
    Qtc = sealed(fp.fs, fp.Qts, fp.Vas, VbPer).Qtc;
  } else if (ds.target === "custom") { VbPer = ds.customVbL / 1000 / n; fb = ds.customFb; }
  else { const a = ds.target === "sbb4" || fp.Qts >= 0.383 ? sbb4(fp.Qts) : qb3(fp.Qts); if (ds.target === "qb3" && fp.Qts >= 0.383) problems.push("QB3 needs Qts under about 0.38; SBB4 used instead."); VbPer = fp.Vas / a.alpha; fb = a.h * fp.fs; }
  return { VbPer, fb, Qtc, problems };
}
/** Design inside a free-form shape: the shape's real net volume feeds the model; optional scaling to the target. */
function designFree(fp: FullParams & { displacement?: number }, ds: DesignInputs) {
  const p = project; const n = p.drivers;
  const tg = alignmentTarget(fp, ds, n); const VbTarget = tg.VbPer * n;
  const port = { shape: ds.portShape, count: ds.portCount, d: ds.portD, w: ds.portW, h: ds.portH, length: 200, wall: 3, flare: ds.portShape === "round" ? ds.portFlare ?? 0 : 0 };
  const draft: Project = { ...p, kind: ds.kind, port, geom: { ...p.geom, bracesL: ds.bracesL } };
  let ff: FreeformResult | undefined;
  // A8: the port length and the net volume depend on each other; stop when the length settles, or when the port cannot fit
  // (a port that does not fit eats more volume each round and the loop ran away). The result below always uses the analysis
  // of the final length, the same one the 3D view and the Volume table show.
  for (let it = 0; it < 8; it++) {
    ff = computeFF(draft, driverById(p.driverId), shapeCtx, () => render(), ds.kind);
    if (!ff || ds.kind !== "vented" || !tg.fb) break;
    if (it > 0 && ff.portFit && !ff.portFit.ok) break;
    const L = portLengthFor(toPort(draft), ff.acoustic, tg.fb, air.c); const Lmm = Math.max(10, Math.round(L * 1000));
    if (Math.abs(Lmm - draft.port.length) <= 1) break; draft.port = { ...draft.port, length: Lmm };
  }
  ff = computeFF(draft, driverById(p.driverId), shapeCtx, () => render(), ds.kind);
  const saved = project; project = draft; extra3D = {}; setup3D(0, ds.kind); showVolume(); project = saved;
  $("#cut").onclick = () => { const s = project; project = draft; showCutList(); project = s; };
  if (!ff) { $("#dsOut").innerHTML = `<p class="muted">Shape not ready.</p>`; return; }
  const VbPer = ff.acoustic / n; const pg = toPort(draft);
  const box: BoxSpec = ds.kind === "vented" && tg.fb ? { kind: "vented", Vb: VbPer, port: { Sv: portArea(pg) * pg.count / n, Leff: portLeff(pg) }, QL: 7 } : { kind: "sealed", Vb: VbPer, QL: 100 };
  const drive = { Vrms: Math.sqrt(p.power.watts * p.power.impedance), count: n };
  const sub = subsonicFor(fp, box, drive, air);
  const sim = simulate(fp, box, { ...drive, hpHz: sub && isFinite(sub) ? sub : undefined, hpOrder: 4 }, air, freqs(10, 300, 48)); const sm = summarise(sim, fp);
  const fbAct = ds.kind === "vented" ? portFb(pg, ff.acoustic, air.c) : undefined;
  const diff = (ff.net - VbTarget) / VbTarget * 100;
  $("#dsOut").innerHTML = `<h2>Result (your shape)</h2><table class="kv">
    <tr><td>Target net volume</td><td class="num">${fmtL(VbTarget * 1000)}${tg.fb ? ` tuned to ${f1(tg.fb)} Hz` : ""}</td></tr>
    <tr><td>This shape gives</td><td class="num" id="dsNet"><b>${fmtL(ff.net * 1000, 2)}</b> net (${diff >= 0 ? "+" : ""}${f1(diff)} %)</td></tr>
    ${fbAct ? `<tr><td>Port</td><td class="num">${pg.count} × ${ds.portShape === "round" ? fmtMm(ds.portD) + " round" + (ds.portFlare ? " flared" : "") : fmtMm(ds.portW) + " × " + fmtMm(ds.portH) + " slot"}, length <b>${fmtMm(draft.port.length)}</b> → ${f1(fbAct)} Hz · peak air speed ${f1(sm.maxVport)} m/s</td></tr>` : ""}
    <tr><td>f3 · peak · max cone travel (simulated with this shape's volume)</td><td class="num">${f1(sm.f3)} Hz · ${sm.peakDb > 0.05 ? "+" + f1(sm.peakDb) : "flat"} dB · ${f1(sm.maxXmm)} mm${sub && isFinite(sub) ? ` (with ${sub} Hz subsonic)` : ""}</td></tr>
    ${ds.kind === "vented" && ff.portFit && !ff.portFit.ok ? `<tr><td colspan="2" class="bad" id="ffPortBad">The port does not fit straight in this shape: it needs ${fmtMm(ff.portFit.needM * 1000)} (incl. ${fmtMm(ff.portFit.clearanceM * 1000)} clear at its end), there is ${fmtMm(ff.portFit.roomM * 1000)} from the ${esc(ff.portAt?.panel)} panel. It is not drawn (red mark on the panel). Use a smaller port area, a higher tuning, another panel, or "Scale the shape".</td></tr>` : ""}
    ${tg.problems.map((x) => `<tr><td colspan="2" class="warn">${esc(x)}</td></tr>`).join("")}</table>
    <div class="toolbar"><button id="scaleIt" ${p.shape!.mode === "scan" ? "disabled title=\"A scan is the car's space: it cannot be scaled\"" : ""}>Scale the shape to the target volume</button></div>`;
  setReference(sim.f, sim.spl);
  plot($("#pSpl"), [{ name: "Free field", x: sim.f, y: sim.spl, color: PALETTE[1] }, ...overlaySeries("response")], { title: "Loudness (half space, 1 m)", yLabel: "dB SPL" });
  plot($("#pZ"), [{ name: "Impedance", x: sim.f, y: sim.zmag, color: PALETTE[3] }, ...overlaySeries("impedance")], { title: "Impedance (one driver)", yLabel: "Ω", yMin: 0 });
  plot($("#pX"), [{ name: "Cone travel", x: sim.f, y: sim.xmm, color: PALETTE[2] }], { title: "Cone travel (peak)", yLabel: "mm", yMin: 0, hLines: fp.Xmax ? [{ y: fp.Xmax * 1000, label: "Xmax", color: "#ff6b6b" }] : [] });
  $("#scaleIt").onclick = () => {
    const z = driverSizes(driverById(p.driverId));
    const inp = { drivers: n, driverCutout: z.cutout, driverOuter: z.outer, driverDepth: z.depth, driverDisp: z.disp, port: ds.kind === "vented" ? pg : undefined, bracesM3: ds.bracesL / 1000, otherM3: p.geom.otherL / 1000, insertsM3: p.geom.insertsL / 1000, fillPct: p.geom.fillPct };
    const netAt = (k: number) => { try { const sc = scaleShape(p.shape!, k); return analyse(sc, outerMesh(sc), inp).net; } catch { return -1; } };
    const k = solveScale(netAt, VbTarget); p.shape = scaleShape(p.shape!, k); status(`Shape scaled by ${k.toFixed(3)} to reach ${fmtL(VbTarget * 1000)} net`, "ok"); onChangeDesign();
  };
  $("#use").onclick = () => { if (!confirm(`Use this shape, type and port in project "${p.title}"?`)) return; p.kind = ds.kind; p.port = draft.port; p.geom.bracesL = ds.bracesL; lastDiag = undefined; saveUsedDesign(); };
}
const onChangeDesign = () => { saveProjectSoon(); renderDesign(); };
/** A10 (R30): "Use this design" saves the box into the project and stays in Design new (it used to jump to Analyse/Fix). */
async function saveUsedDesign() {
  pristine.delete(activeItem.id);
  if (await persist()) status(`Saved ${new Date().toLocaleTimeString()}: this design is now the box of "${project.title}"${sectionInfo(section).tabs.includes("fix") ? " (Analyse / Fix / Tweak shows it)" : ""}`, "ok");
}
/** Bandpass and isobaric designs (network model). */
function designAdvanced(fp: FullParams & { displacement?: number }, ds: DesignInputs) {
  const p = project; const Vrms = Math.sqrt(p.power.watts * p.power.impedance);
  const r = advancedDesign(fp, ds, p.drivers, Vrms, air, driverSizes(driverById(p.driverId)).depth);
  const d = driverById(p.driverId);
  const geom = { ...p.geom, W: ds.maxW, H: ds.maxH, D: Math.round(r.model.D * 1000), wedge: false, t: ds.t, baffleExtra: 0 };
  const draft: Project = { ...p, kind: r.ti.topology === "sealed" || r.ti.topology === "bp4" ? "sealed" : "vented", geom, shape: { ...p.shape!, mode: "classic" },
    port: { ...p.port, shape: "round", count: ds.portCount, d: Math.round(r.ports[r.ports.length - 1]?.dMm ?? 100), length: Math.max(10, Math.round(r.ports[r.ports.length - 1]?.lengthMm ?? 100)) } };
  const saved = project; project = draft; extra3D = { dividers: r.model.dividers, driverWall: r.model.driverWall, drivers: { ...to3D(draft, d).drivers, count: p.drivers * (ds.isobaric ? 2 : 1) } }; setup3D(0, r.ports.length ? "vented" : "sealed"); extra3D = {}; project = saved;
  const xm = fp.Xmax * 1000;
  $("#dsOut").innerHTML = `<h2>Result: ${esc(TOPOLOGY_INFO[r.ti.topology].name)}${ds.isobaric ? ", isobaric" : ""}</h2><table class="kv" id="advOut">
    <tr><td>Chamber net volumes</td><td class="num">${TOPOLOGY_INFO[r.ti.topology].chambers.map((c, i) => `${esc(c)} ${fmtL([r.ti.V1, r.ti.V2, r.ti.V3][i])}`).join(" · ")} (total ${fmtL(r.grossL)})</td></tr>
    ${r.ports.map((q) => `<tr><td>${esc(q.name)}</td><td class="num">${ds.portCount} × ${fmtMm(q.dMm)} round, length <b>${fmtMm(q.lengthMm)}</b> · peak air speed <span class="${q.vmax > 17 ? "warn" : "ok"}">${f1(q.vmax)} m/s</span></td></tr>`).join("")}
    <tr><td>Outside size (chambers one behind the other)</td><td class="num">${fmtMm(ds.maxW)} × ${fmtMm(ds.maxH)} × ${fmtMm(r.model.D * 1000)}</td></tr>
    <tr><td>Max cone travel</td><td class="num ${xm && r.xmaxMm > xm ? "bad" : ""}">${f1(r.xmaxMm)} mm${xm ? " / Xmax " + f1(xm) : ""}</td></tr>
    ${r.problems.map((x) => `<tr><td colspan="2" class="warn">${esc(x)}</td></tr>`).join("")}</table>
    <div class="hint">Simulated with the general chamber/port network (engine/network.ts), the same lumped model as the sealed and ported boxes. Leakage Q 7 in ported chambers, 100 in sealed ones. The Analyse/Fix tab handles sealed and ported boxes; a bandpass design is kept in this project's design settings.</div>`;
  const F = r.net.f;
  setReference(F, r.net.spl);
  plot($("#pSpl"), [{ name: "Free field", x: F, y: r.net.spl, color: PALETTE[1] }, ...overlaySeries("response")], { title: "Loudness (half space, 1 m)", yLabel: "dB SPL" });
  plot($("#pX"), r.net.xmm.map((x, i) => ({ name: `Driver ${i + 1}`, x: F, y: x, color: PALETTE[2 + i] })), { title: "Cone travel (peak)", yLabel: "mm", yMin: 0, hLines: xm ? [{ y: xm, label: "Xmax", color: "#ff6b6b" }] : [] });
  plot($("#pV"), r.net.vport.map((v, i) => ({ name: r.ports[i].name, x: F, y: v, color: PALETTE[i % PALETTE.length] })), { title: "Port air speed (peak)", yLabel: "m/s", yMin: 0, hLines: [{ y: 17, label: "~17 m/s", color: "#f7b731" }] });
  plot($("#pZ"), [{ name: "Impedance", x: F, y: r.net.zmag, color: PALETTE[3] }, ...overlaySeries("impedance")], { title: "Impedance (amplifier load per position)", yLabel: "Ω", yMin: 0 });
  $("#use").onclick = () => { alert("Saved: bandpass and isobaric designs stay in this project's design settings (they are saved automatically). The Analyse/Fix tab works with sealed and ported boxes."); saveProjectSoon(); };
}
/** A15_TLINE (R36): transmission line design: folded line in a box, 1-D line model, comparison with a sealed and a ported box. */
function designTL(fp: FullParams & { displacement?: number }, ds: DesignInputs) {
  const p = project; const d = driverById(p.driverId)!; const z = driverSizes(d); const n = Math.max(1, p.drivers);
  const dims = { outer: z.outer, cutout: z.cutout, depth: z.depth, disp: z.disp };
  if (!ds.tl) { $("#dsOut").innerHTML = `<p class="bad">Could not make a starting line for this driver.</p>`; return; }
  const tl = ds.tl;
  let sug: TLSuggestion | undefined; try { sug = suggestTL(fp, dims, { count: n, t: ds.t, air }); } catch { sug = undefined; }
  const pw = toPower(p, air.c);
  const r = runTL(fp, dims, tl, ds.t, n, p.power.watts, p.power.impedance, pw.cabin, air, PALETTE);
  const g = r.g;
  const geom = { ...p.geom, W: tl.W, H: tl.H, D: tl.D, wedge: false, Dtop: tl.D, t: ds.t, baffleExtra: 0 };
  const draft: Project = { ...p, kind: "sealed", geom, shape: { ...p.shape!, mode: "classic" } };
  const saved = project; project = draft; extra3D = tl3D(g, dims, n, ds.t); setup3D(0, "sealed"); extra3D = {}; project = saved;
  if (!$("#v3dNote")) $("#v3d")?.insertAdjacentHTML("afterend", `<div class="hint" id="v3dNote">The right-hand side panel is see-through: orange = the air path of the line (yellow where stuffed), dark = the open end.</div>`);
  $("#cut").onclick = () => showRowsCutList(g.rows, ds.t, "transmission line");
  $("#dsOut").innerHTML = tlResultHtml(r, sug, fp, dims, n, ds.t, tl) + (p.shape!.mode !== "classic" ? `<p class="muted">The free-form shape of this project is not used by the transmission line (always a rectangular box).</p>` : "");
  $("#tlCmpBox").innerHTML = cmpTableHtml(r);
  const F = r.free.f; const xm = r.xmaxMm;
  setReference(F, r.free.spl);
  plot($("#pSpl"), [{ name: "Total (free field)", x: F, y: r.free.spl, color: PALETTE[1] }, { name: "Driver only", x: F, y: r.free.splDriver, color: PALETTE[2], dash: "5 4", width: 1.5 }, { name: "Open end only", x: F, y: r.free.splTerminus, color: PALETTE[4], dash: "5 4", width: 1.5 }, ...(r.carOn ? [{ name: "Total in the car", x: F, y: r.car.spl, color: PALETTE[3] }] : []), ...overlaySeries("response")], { title: "Loudness (half space, 1 m): line and driver", yLabel: "dB SPL" });
  plot($("#pX"), [{ name: "Cone travel", x: F, y: r.free.xmm, color: PALETTE[2] }], { title: "Cone travel (peak)", yLabel: "mm", yMin: 0, hLines: xm ? [{ y: xm, label: "Xmax", color: "#ff6b6b" }] : [] });
  plot($("#pV"), [{ name: "Open end", x: F, y: r.free.vterm, color: PALETTE[4] }], { title: "Air speed at the open end (peak)", yLabel: "m/s", yMin: 0, hLines: [{ y: 17, label: "~17 m/s", color: "#f7b731" }] });
  plot($("#pZ"), [{ name: "Impedance", x: F, y: r.free.zmag, color: PALETTE[3] }, ...overlaySeries("impedance")], { title: "Impedance (one driver)", yLabel: "Ω", yMin: 0 });
  plot($("#pCmp"), r.cmp.flatMap((c) => [{ name: c.name, x: c.f, y: c.spl, color: c.color }, { name: c.name + ": max", x: c.f, y: c.max, color: c.color, dash: "3 4", width: 1.5 }]),
    { title: `Compared ${r.carOn ? "in the car" : "(free field)"}: solid = amp power, dotted = max`, yLabel: "dB SPL", height: 320 });
  $("#use").onclick = () => { alert("Saved: a transmission line design stays in this project's design settings (saved automatically). The Analyse/Fix tab works with sealed and ported boxes; the Boards tab lays out these panels."); saveProjectSoon(); };
}
/** Cut list from rows (TL boxes: no wedge, inner dividers). */
function showRowsCutList(rows: { name: string; qty: number; a: number; b: number; note: string }[], t: number, what: string) {
  const s0 = project; project = { ...project, geom: { ...project.geom, t } }; const svg = cutSheetSvg(rows); project = s0;
  $("#cutbox").innerHTML = `<h2>Cut list: ${esc(what)} (${t} mm sheet)</h2><table id="tlCut"><tr><th>Panel</th><th>Qty</th><th>Size (mm)</th><th>Note</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.qty}</td><td class="num">${Math.round(r.a)} × ${Math.round(r.b)}</td><td>${esc(r.note)}</td></tr>`).join("")}</table>
    <div class="toolbar"><button id="cutsvg">Download cut sheet (.svg)</button></div><div style="background:#fff;border-radius:4px;margin-top:6px">${svg}</div>`;
  $("#cutsvg").onclick = () => { const name = `${project.name}_cutsheet.svg`; download(name, svg, "image/svg+xml"); saveExport(name, svg); };
}
/** Classic rectangle / wedge design (A11): the box is the outside sizes entered (or set by Best size / Keep the volume); the
 * model uses the net volume this box really holds, with the port tuned for it. */
function designBox(fp: FullParams & { displacement?: number }, ds: DesignInputs, n: number) {
  const ctx = sizingCtx()!; const tg = ctx.tg; const fb = tg.fb; const isPR = ds.topology === "pr";
  const problems: string[] = [...tg.problems]; const bad: string[] = []; const info: string[] = [];
  const VbTotal = tg.VbPer * n; const t = ds.t; const top = ctx.k.top;
  const s = sizesOf(ds); const nd = ctx.needs(s);
  // gross inside volume as built: the wedge's top depth is cut to a whole mm (as before A11; at most about 0.03 L from the exact top %)
  const gross = ds.wedge ? grossVolume({ W: s.W / 1000, H: s.H / 1000, D: s.D / 1000, Dtop: Math.round(s.D * top) / 1000, t: t / 1000, baffleExtra: 0 }) * 1000 : grossL(s, ctx.k);
  // A8 2026-11-22: the port is sized and laid out by engine/portfit.ts so it always fits inside the box: straight if it can,
  // else folded (along the bottom, then up the back); if even folded it is too long, a slot gets narrower (keeps its height)
  // or a round port gets a smaller diameter; if nothing fits, a red warning and no port is drawn. A11: tuned for the net volume
  // this box really holds (equal to the target when the volume check passes).
  const asked = askedPort(s, ds); const nP = asked.count; const slotWmax = asked.w! * 1000;
  const others = nd.driverL + nd.prL + ds.bracesL;
  let netL = gross - others - nd.portL; let fit = nd.fit;
  if (ds.kind === "vented" && fb) for (let it = 0; it < 6; it++) {
    fit = fitPort(boxAtMm(s, ds), asked, Math.max(netL, 0.1) / 1000, fb, air.c);
    const n2 = gross - others - (fit.layout.fits ? fit.layout.displacement * 1000 : 0); if (Math.abs(n2 - netL) < 1e-4) { netL = n2; break; } netL = n2;
  }
  if (netL <= 0.1) { bad.push(`The box is too small: nothing is left for air after the driver${n > 1 ? "s" : ""}, port and braces. Press Best size.`); netL = 0.1; }
  const geom = { W: s.W, H: s.H, D: s.D, wedge: ds.wedge, Dtop: Math.round(s.D * top), t, baffleExtra: 0, bracesL: ds.bracesL, otherL: 0, insertsL: 0, fillPct: 0 };
  const fp2 = fit?.port;
  const port = { shape: ds.portShape, count: nP, d: fp2 && ds.portShape === "round" ? Math.round(fp2.d! * 1000) : ds.portD, w: ds.portShape === "slot" ? Math.floor((fp2?.w ?? slotWmax / 1000) * 1000) : 0, h: ds.portH, length: fp2 ? Math.round(fp2.length * 1000) : 0, wall: 3, flare: ds.portShape === "round" ? ds.portFlare ?? 0 : 0 };
  const lay = ds.kind === "vented" ? fit?.layout : undefined;
  if (ds.kind === "vented" && fit && lay) {
    if (port.length < 20) problems.push("Port would be shorter than 20 mm: use a smaller port.");
    if (!lay.fits) bad.push(`The port does not fit: it needs ${fmtMm(port.length)}, the box only holds ${fmtMm(Math.round(Math.max(lay.straightMax, lay.foldMax) * 1000))} even folded${ds.portShape === "slot" ? ` (slot narrowed down to its height, ${ds.portH} mm, still too long)` : ` (diameter down to half, ${Math.round(ds.portD / 2)} mm, still too long)`}. Use ${ds.portShape === "slot" ? "a round port" : "a slot port (it folds)"}, a higher tuning, a bigger box, or choose sealed. The port is not drawn.`);
    else {
      if (fit.resized) info.push(ds.portShape === "slot" ? `Slot narrowed from ${fmtMm(Math.round(fit.from * 1000))} to ${fmtMm(port.w)} so the port fits inside the box (a full-width ${fmtMm(ds.portH)} slot would need ${fmtMm(Math.round(fitPort(boxAtMm(s, ds), { ...asked, w: fit.from }, netL / 1000, fb!, air.c).port.length * 1000))}). A closing side board stands at its right-hand edge.` : `Port diameter reduced from ${fmtMm(ds.portD)} to ${fmtMm(port.d)} so the port fits inside the box.`);
      if (lay.mode === "folded") info.push(`Port folded (L shape, measured along its centre line): ${fmtMm(Math.round(lay.L1 * 1000))} along the bottom from the front face, then ${fmtMm(Math.round(lay.L2 * 1000))} up ${lay.rearBoard ? "between two boards" : "the back wall"}; open end ${fmtMm(Math.round((s.H / 1000 - t / 1000 - lay.yEnd) * 1000))} below the top panel.`);
    }
  }
  // front baffle: every driver and passive radiator, laid out by engine/autosize.ts; minimum sizes for them and the magnets
  const dz = driverSizes(driverById(project.driverId)); const dDepth = driverById(project.driverId)?.params.depth;
  const bl = ctx.layoutAt(s); const mn = ctx.mins(s);
  const nPr = ctx.items.filter((x) => x.kind === "pr").length;
  const what = `${n} driver${n > 1 ? "s" : ""}${nPr ? ` + ${nPr} passive radiator${nPr > 1 ? "s" : ""}` : ""}`;
  const frontText = bl ? `${what}${ctx.items.length > 1 ? (bl.rows === 1 ? ", in a row" : bl.cols === 1 ? ", in a column" : `, ${bl.cols} across × ${bl.rows} rows`) : ""} · needs at least ${fmtMm(mn.W, 1)} × ${fmtMm(mn.H, 1)} (W × H) and ${fmtMm(mn.D)} depth for the magnet${n > 1 ? "s" : ""}` : what;
  const est = (dDepth ? "" : "estimated ");
  if (s.W < mn.W - 0.05) bad.push(`Width ${fmtMm(s.W, 1)} is less than the ${fmtMm(Math.ceil(mn.W))} the front needs for ${what} (frames 20 mm apart, cut-outs 20 mm clear of the inside walls).`);
  if (s.H < mn.H - 0.05) bad.push(`Height ${fmtMm(s.H, 1)} is less than the ${fmtMm(Math.ceil(mn.H))} the front needs for ${what}${ctx.bottomZone ? ` above the ${ds.portH} mm slot` : ""}.`);
  if (s.D < mn.D - 0.05) bad.push(`Depth ${fmtMm(s.D, 1)} is less than the ${fmtMm(mn.D)} the magnet needs (${est}mounting depth ${fmtMm(Math.round(dz.depth * 1000))} + 10 mm${ds.wedge ? ", measured where the sloped back is closest to the magnet" : ""}): check the mounting depth.`);
  if (!dDepth) info.push(`The driver's mounting depth is not in its data: estimated as ${fmtMm(Math.round(dz.depth * 1000))} (half its estimated outer diameter). Enter it on the Drivers tab.`);
  const depthNeeded = dz.depth;
  if (lay?.fits && lay.mode === "folded" && lay.legFront < depthNeeded + 0.01) bad.push(`The folded port's upright part (front face ${fmtMm(Math.round(lay.legFront * 1000))} from the front) is within the driver's ${est}mounting depth (${fmtMm(Math.round(depthNeeded * 1000))}): the magnet would hit it. Use a deeper box, a smaller port area or a round port.`);
  problems.push(...info);
  const VbPer = netL / 1000 / n;
  const sv = ds.kind === "vented" && fb ? (() => { const pg = { shape: port.shape, count: port.count, d: port.d / 1000, w: port.w / 1000, h: port.h / 1000, length: port.length / 1000, flare: port.flare / 1000 }; return { Sv: portArea(pg) * port.count / n, Leff: portLeff(pg) }; })() : undefined;
  let box: BoxSpec = ds.kind === "vented" ? { kind: "vented", Vb: VbPer, port: sv, QL: 7 } : { kind: "sealed", Vb: VbPer, QL: 100 };
  // passive radiators (Small 1974, engine/passive.ts): leakage QL 7 as for ported boxes
  let prRes: { m: number; name: string; addKg: number; fb: number; fp: number; vd?: number; xmax: number; maxX: number; pr: PRParams } | undefined;
  if (isPR) {
    const pi = ctx.pr!;
    if (!pi.pr) bad.push(`Passive radiator (${pi.name}): ${pi.err}. Simulated as a plain sealed box until it is complete.`);
    else {
      const m = Math.max(1, ds.prCount ?? 1); let addKg = ds.prAuto && fb ? prMassFor(pi.pr, m, n, netL / 1000, fb, air) : (ds.prMassG ?? 0) / 1000;
      if (addKg < 0) { problems.push(`The bare passive radiator${m > 1 ? "s" : ""} already tune${m > 1 ? "" : "s"} this box to ${f1(prTuning(pi.pr, 0, m, n, netL / 1000, air).fb)} Hz, below the ${f1(fb)} Hz target: use lighter or stiffer passive radiators, more of them, or a smaller box.`); addKg = 0; }
      const tun = prTuning(pi.pr, addKg, m, n, netL / 1000, air);
      box = { kind: "passive", Vb: VbPer, pr: prBranch(pi.pr, addKg, m, n), QL: 7 };
      const vd = prVdRatio(pi.pr, m, fp.Sd, fp.Xmax, n);
      if (vd === undefined) problems.push("Xmax of the passive radiator or of the driver is missing: the displacement check (passive radiators at least 2 × the driver's Sd × Xmax) cannot be done.");
      else if (vd < 2) problems.push(`The passive radiators displace only ${vd.toFixed(1)} × what the driver${n > 1 ? "s do" : " does"} (Sd × Xmax × count). Small (1974) recommends at least 2 ×, or they run out of travel first: use more or bigger passive radiators.`);
      if (pi.estimated) info.push("Passive radiator size or depth not in its data: the front layout uses an estimate from Sd.");
      prRes = { m, name: pi.name, addKg, fb: tun.fb, fp: tun.fp, vd, xmax: pi.pr.Xmax * 1000, maxX: 0, pr: pi.pr };
    }
  }
  const drive = { Vrms: Math.sqrt(project.power.watts * project.power.impedance), count: n };
  const sub = subsonicFor(fp, box, drive, air);
  const sim = simulate(fp, box, { ...drive, hpHz: sub && isFinite(sub) ? sub : undefined, hpOrder: 4 }, air, freqs(10, 300, 48));
  if (sub !== undefined && isNaN(sub)) problems.push("Even a 60 Hz subsonic filter cannot keep the cone within Xmax at this power: reduce power.");
  const summary = summarise(sim, fp);
  if (prRes && sim.xpr) { prRes.maxX = Math.max(...sim.xpr.filter((_, i) => sim.f[i] <= 200)); if (prRes.xmax && prRes.maxX > prRes.xmax) bad.push(`The passive radiators travel ${f1(prRes.maxX)} mm, over their Xmax ${f1(prRes.xmax)} mm at this power: use more or bigger ones, or less power.`); }
  if ((ds.kind === "vented" || isPR) && ds.target !== "custom" && summary.peakDb > 1.5) problems.push(`This alignment gives a +${summary.peakDb.toFixed(1)} dB peak (boomy above about 1.5 dB) with this driver's Qts ${fp.Qts.toFixed(2)}: the flat ported alignments need a low Qts (Butterworth B4 is Qts 0.38; research_c §3), and SBB4 does not stay flat this high. Compare a sealed box (Box type: Sealed, Qtc 0.707) or set "My own volume and tuning".`);
  if (Math.abs(netL - VbTotal * 1000) > 0.1) info.push(`Simulated with the net volume this box holds, ${fmtL(netL, 2)} (target ${fmtL(VbTotal * 1000, 2)})${ds.kind === "vented" && fb ? `; the port is cut for ${f1(fb)} Hz in it` : ""}.`);
  const Qtc = ds.kind === "sealed" && !isPR ? sealed(fp.fs, fp.Qts, fp.Vas, VbPer).Qtc : undefined;
  // 3D and cut list: positions on the front face (m, x from the centre, y from the bottom)
  const pos = bl ? placeItems(bl, s, ctx.items.length) : [];
  const items3d = pos.map((q, i) => ({ x: q.x / 1000, y: q.y / 1000, pr: ctx.items[i].kind === "pr" }));
  const prIt = ctx.items.find((x) => x.kind === "pr");
  const prs3d = prIt ? { outer: prIt.outer / 1000, cutout: prIt.cutout / 1000, depth: prIt.depth / 1000 } : undefined;
  const holes = `${n} × driver cut-out Ø ${Math.round(dz.cutout * 1000)} mm${prIt ? `, ${nPr} × passive radiator cut-out Ø ${Math.round(prIt.cutout)} mm` : ""}${ds.kind === "vented" && lay?.fits ? `, ${port.count} × port ${port.shape === "round" ? `Ø ${port.d} mm` : `${port.w} × ${port.h} mm`}` : ""}`;
  const portL = lay?.fits ? lay.displacement * 1000 : 0;
  return { VbTotal, fb: prRes ? prRes.fb : fb, Qtc, geom, port, sim, summary, sub: sub && isFinite(sub) ? sub : undefined, problems, bad, layout: lay, grossL: gross, netBuiltL: netL, driverL: nd.driverL, prL: nd.prL, bracesL: ds.bracesL, portL, reqL: nd.grossL, items3d, prs3d, holes, frontText, prRes };
}

// ---------- Boards (A13_BOARDS, R33) ----------
/** Panels of a classic box from the same cut list the Cut list button shows (whole mm; wedge sides as trapezoids). */
function classicPanels(p: Project): BoardPanel[] {
  const rows = cutList(p);
  return rows.flatMap((r) => piecesFromRows([r]).map((pc) => ({ ...pc, t: r.name === "Second baffle" ? p.geom.baffleExtra : p.geom.t, note: r.trap ? "" : r.note })));
}
/** Panels of a free-form wood box: each flat panel's real outline (outside face), in its own thickness. */
function freePanels(p: Project, ff: FreeformResult): { panels: BoardPanel[]; error?: string } {
  const s = p.shape!;
  if (s.material === "fibreglass") return { panels: [], error: "Fibreglass shell: no MDF panels to cut (only the driver ring, see the Cut list)." };
  if (!ff.flat) return { panels: [], error: "This shape is curved: there are no flat panels to lay out on a sheet." };
  return { panels: ff.panels.map((q, i) => ({ ...pieceFromOutline(`${q.name}#${i}`, q.name, q.outline.map(([u, v]) => [u * 1000, v * 1000] as [number, number])), t: s.panelT[q.name] ?? s.woodT })) };
}
const boxSummary = (g: Project["geom"]) => `${fmtMm(g.W, 1)} × ${fmtMm(g.H, 1)} × ${fmtMm(g.D, 1)}${g.wedge ? " → " + fmtMm(g.Dtop, 1) : ""} outside (W × H × D), ${fmtMm(g.t, 1)} panels`;
/** The boxes the Boards tab can lay out: the Design new box (what that tab shows now) and the box saved in the project. */
function boardSources(): BoardSource[] { return boardSourcesFor(project, activeItem, true); }
/** B5_BOM: the same sources for any box / IB item of the project. active = the item shown now (its data is used as it is, as the
 * Boards tab does); other items are worked on a copy, so the BOM never changes an item it only reads. */
function boardSourcesFor(p0: Project, item: pv2.Item | undefined, active: boolean): BoardSource[] {
  const p = active ? p0 : (structuredClone(p0) as Project); const out: BoardSource[] = [];
  if (item?.kind === "ib") { // B2_SECTIONS: the IB baffle board
    const idata = active ? item.data : structuredClone(item.data);
    const d = driverById(idata.driverId); const data = ibDefaults(idata, d); const b = baffleOf(data, d); const rows = ibBoardRows(data, d);
    return [{ key: "ib", label: `Infinite baffle: the baffle board of "${item.name}"`, panels: piecesFromRows(rows).map((pc) => ({ ...pc, t: data.baffleT, note: rows[0].note })), boxT: data.baffleT, summary: `${fmtMm(b.W)} × ${fmtMm(b.H)}, ${b.layers} layer${b.layers > 1 ? "s" : ""} of ${fmtMm(b.t)}, ${b.n} cut-out${b.n > 1 ? "s" : ""}`,
      material: itemMaterial("ib", item.data?.boardMaterial), grain: item.data?.boardGrain !== false, ib: true }];
  }
  if (p.shape && p.shape.mode !== "classic") {
    if (!active) return [{ key: "free", label: "Free-form shape", panels: [], error: "Free-form box: open it (Design new) to see its flat panels on the Boards tab; they are not counted here.", boxT: p.shape.woodT, summary: "" }];
    const ff = currentFF();
    const r = ff ? freePanels(p, ff) : { panels: [], error: "Shape not ready." };
    out.push({ key: "free", label: "Free-form shape of this project (Design new and Analyse / Fix)", panels: r.panels, error: r.error, boxT: p.shape!.woodT, summary: `${r.panels.length} flat panels from the free-form shape`, material: itemMaterial("box", p0.boardMaterial), grain: p0.boardGrain !== false });
    return out;
  }
  if (p.design) {
    p.design = { ...defaultDesign(), ...p.design }; const ds = p.design; // as Design new does on every render (in memory)
    const advanced = ds.isobaric || !(ds.topology === undefined || ds.topology === "sealed" || ds.topology === "vented" || ds.topology === "pr");
    const d = driverById(p.driverId);
    if (ds.topology === TL_ID) { // A15_TLINE: the folded line's panels (dividers included)
      if (!ds.tl || !d) out.push({ key: "design", label: "Design new (transmission line)", panels: [], error: "Open Design new once with a driver chosen so the line is worked out.", boxT: ds.t, summary: "" });
      else { const z = driverSizes(d); const g = foldLine({ ...ds.tl, t: ds.t, count: Math.max(1, p.drivers) }, { outer: z.outer, cutout: z.cutout, depth: z.depth, disp: z.disp });
        out.push({ key: "design", label: "Design new: the transmission line on that tab now", panels: piecesFromRows(g.rows).map((pc) => ({ ...pc, t: ds.t, note: g.rows.find((r) => pc.id.startsWith(r.name + "#"))?.note ?? "" })), boxT: ds.t, summary: `${fmtMm(ds.tl.W, 1)} × ${fmtMm(ds.tl.H, 1)} × ${fmtMm(ds.tl.D, 1)} outside (W × H × D), ${ds.tl.channels} channels, ${fmtMm(ds.t, 1)} panels` }); }
    }
    else if (advanced) out.push({ key: "design", label: "Design new (bandpass / isobaric)", panels: [], error: "Bandpass and isobaric boxes have no cut list yet (inner walls and chambers): choose the Analyse / Fix box, or a sealed, ported or passive-radiator design.", boxT: ds.t, summary: "" });
    else {
      if (ds.sizing !== 2) migrateSizing(ds); // the sizes Design new shows (in memory, as that tab does)
      const geom = { ...p.geom, W: ds.maxW, H: ds.maxH, D: ds.maxD, wedge: ds.wedge, Dtop: Math.round((ds.maxD * ds.topDepthPct) / 100), t: ds.t, baffleExtra: 0 };
      out.push({ key: "design", label: "Design new: the box on that tab now", panels: classicPanels({ ...p, geom }), boxT: ds.t, summary: boxSummary(geom) });
    }
  }
  out.push({ key: "fix", label: "Analyse / Fix: the box saved in this project", panels: classicPanels(p), boxT: p.geom.t, summary: boxSummary(p.geom) });
  // B7_PLYWOOD_BOARDS: one material per box item (saved on the box: boardMaterial, boardGrain), MDF by default
  const mat = itemMaterial("box", p0.boardMaterial), grain = p0.boardGrain !== false;
  return out.map((x) => ({ ...x, material: mat, grain }));
}
const boardsCtx = { api, status, sources: boardSources, projectName: () => project.name, projectTitle: () => (activeItem?.kind === "ib" ? activeItem.name : project.title), saveExport: (n: string, b: BlobPart) => { saveExport(n, b); },
  // B7_PLYWOOD_BOARDS: the board material and grain lock are saved on the box / IB item shown (autosave)
  setMaterial: (m: MaterialId, grain: boolean) => { const d: any = activeItem?.kind === "ib" ? (activeItem.data ??= {}) : project; d.boardMaterial = m; d.boardGrain = grain; saveProjectSoon(); } };

// ---------- Drivers ----------
let editing: Driver | undefined;
/** Fields a passive radiator has (A11): no voice coil, so no Re, Qes, Qts, Le, Bl, power or sensitivity. */
const PR_FIELDS = ["fs", "Qms", "Vas", "Sd", "Xmax", "Mms", "Cms", "Rms", "displacement", "dia", "cutout", "depth"];
const PFIELDS: [string, string, string, number][] = [
  // key, label, unit, multiplier UI→SI
  ["fs", "Fs (resonance)", "Hz", 1], ["Re", "Re (DC resistance)", "Ω", 1], ["Qms", "Qms", "", 1], ["Qes", "Qes", "", 1], ["Qts", "Qts", "", 1],
  ["Vas", "Vas", "L", 0.001], ["Sd", "Sd (cone area)", "cm²", 1e-4], ["Xmax", "Xmax (one way)", "mm", 0.001], ["Le", "Le", "mH", 0.001], ["Pe", "Pe (RMS power)", "W", 1],
  ["Mms", "Mms", "g", 0.001], ["Cms", "Cms", "mm/N", 0.001], ["Rms", "Rms", "kg/s", 1], ["Bl", "Bl", "T·m", 1], ["Znom", "Nominal impedance", "Ω", 1], ["sens1W", "Sensitivity 1 W/1 m", "dB", 1],
  ["displacement", "Driver displacement (inside box)", "L", 0.001], ["dia", "Outer diameter", "mm", 0.001], ["cutout", "Cut-out diameter", "mm", 0.001], ["depth", "Mounting depth", "mm", 0.001],
];
/** Drivers-tab filters (kept while the app is open). */
const NO_FILTERS = { q: "", lib: "", brand: "", rms: 0, load: "", coil: "", size: "", sim: false, sub: false, sec: "", type: "" }; // B3: type (car libraries) // sec (B1): a section id = that section's driver sizes
/** "Subwoofers only" starts ON (the app is mostly used for car subwoofer boxes; A14, 2026-11-23). */
const dFilter = { ...NO_FILTERS, sub: true };
/** Current page of the driver list and of "Listed without published T/S" (1-based). */
let dPage = 1, lwsPage = 1;
const rmsOf = (d: Driver) => d.rmsW ?? d.params.Pe;
const STD_LOADS = [2, 1, 0.5];
function simulatable(d: Driver): boolean { if (d.incomplete) return false; try { complete(d.params, air); return true; } catch { return false; } }
function driverMatches(d: Driver): boolean {
  const f = dFilter;
  if (f.lib && (f.lib === "mine" ? !!d.library : d.library !== f.lib)) return false;
  if (f.brand && d.brand !== f.brand) return false;
  if (f.q && !(d.brand + " " + d.model).toLowerCase().includes(f.q)) return false;
  if (f.rms > 0 && !((rmsOf(d) ?? 0) >= f.rms)) return false;
  if (f.load) {
    const L = d.finalLoads; if (!L || (!L.length && !d.coil)) return false;
    if (f.load === "other" ? L.some((x) => STD_LOADS.includes(x)) : !L.includes(Number(f.load))) return false;
  }
  if (f.coil && d.coil !== f.coil) return false;
  if (f.size && String(sizeOf(d)) !== f.size) return false;
  if (f.sim && !simulatable(d)) return false;
  if (f.sub && !isSubwoofer(d)) return false;
  if (f.sec && isSection(f.sec) && !driverFitsSection(d, f.sec)) return false;
  if (f.type && driverType(d) !== f.type) return false;
  if (shadow.has(d.id)) return false; // B3: your own entry of the same product is listed instead
  return true;
}
/** Plain words for every Drivers-tab filter that is on (so a remembered filter never hides drivers silently). */
function activeFilters(): string[] {
  const f = dFilter, out: string[] = [];
  if (f.sub) out.push(`Subwoofers only`);
  if (f.sec && isSection(f.sec)) { const si = sectionInfo(f.sec); out.push(`sizes for ${si.label} (${si.sizeIn?.[0]} to ${si.sizeIn?.[1]} in)`); }
  if (f.q) out.push(`search "${f.q}"`);
  if (f.lib) out.push(f.lib === "mine" ? "Mine only" : `library ${f.lib}`);
  if (f.brand) out.push(`brand ${f.brand}`);
  if (f.rms > 0) out.push(`RMS ≥ ${f.rms} W`);
  if (f.load) out.push(f.load === "other" ? "final load other" : `final load ${f.load} Ω`);
  if (f.coil) out.push(`coil ${f.coil}`);
  if (f.size) out.push(`size ${f.size} in`);
  if (f.sim) out.push("simulatable only");
  if (f.type) out.push(`type ${typeLabel(f.type)}`);
  return out;
}
/** First / Previous / page number / Next / Last. */
function pagerHtml(pi: { page: number; pages: number }): string {
  const b = (pg: string, t: string, off: boolean) => `<button data-pg="${pg}" ${off ? "disabled" : ""}>${t}</button>`;
  return `${b("first", "« First", pi.page <= 1)}${b("prev", "‹ Previous", pi.page <= 1)}<span class="pgno">Page ${pi.page} of ${pi.pages}</span>${b("next", "Next ›", pi.page >= pi.pages)}${b("last", "Last »", pi.page >= pi.pages)}`;
}
function bindPager(sel: string, pi: { page: number; pages: number }, go: (page: number) => void) {
  document.querySelectorAll<HTMLButtonElement>(sel.split(",").map((x) => x.trim() + " button[data-pg]").join(",")).forEach((btn) => btn.onclick = () => {
    const k = btn.dataset.pg; go(k === "first" ? 1 : k === "prev" ? pi.page - 1 : k === "next" ? pi.page + 1 : pi.pages);
  });
}
const coilText = (d: Driver) => d.coil ? `${d.coil}${d.ohmsPerCoil ? ` ${d.coils && d.coils > 1 ? d.coils + "×" : ""}${d.ohmsPerCoil} Ω` : ""}` : "";
function renderDrivers() {
  const libs = [...new Set(drivers.map((d) => d.library).filter(Boolean))].sort() as string[];
  const brands = [...new Set(drivers.map((d) => d.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sizes = [...new Set(drivers.map(sizeOf).filter((x): x is number => !!x && x >= 4 && x <= 40))].sort((a, b) => a - b);
  const opt = (v: string, t: string, cur: string) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`;
  const f = dFilter;
  $("#page").innerHTML = `<div class="split"><div>
    <div class="toolbar"><input id="q" placeholder="Search brand or model…" style="flex:1" value="${esc(f.q)}"><select id="libf" title="Which drivers to list">${opt("", "All drivers", f.lib)}${opt("mine", "Mine only", f.lib)}${libs.map((l) => opt(l, "Library: " + l, f.lib)).join("")}</select><button id="new">+ New driver</button>
      <label class="muted">Import <input type="file" id="imp" multiple accept=".wdr,.csv,.tsv,.txt"></label></div>
    <div class="toolbar" id="dfilters">
      <select id="fBrand" title="Brand">${opt("", "All brands", f.brand)}${brands.map((b) => opt(b, b, f.brand)).join("")}</select>
      <label title="RMS power rating of the driver (Pe for drivers without a separate RMS figure)">RMS ≥ <input id="fRms" type="number" min="0" step="100" style="width:6em" value="${f.rms || ""}"> W</label>
      <label title="Load ONE driver can present to the amplifier with its coils in series or in parallel (high-power library)">Final load <select id="fLoad">${opt("", "any", f.load)}${opt("2", "2 Ω", f.load)}${opt("1", "1 Ω", f.load)}${opt("0.5", "0.5 Ω", f.load)}${opt("other", "other", f.load)}</select></label>
      <label title="Car libraries: what the driver is for">Type <select id="fType">${opt("", "any", f.type)}${DRIVER_TYPES.map((t) => opt(t.id, t.label, f.type)).join("")}</select></label>
      <label>Coil <select id="fCoil">${opt("", "any", f.coil)}${opt("SVC", "single (SVC)", f.coil)}${opt("DVC", "dual (DVC)", f.coil)}${opt("QVC", "quad (QVC)", f.coil)}</select></label>
      <label>Size <select id="fSize">${opt("", "any", f.size)}${sizes.map((z) => opt(String(z), z + " in", f.size)).join("")}</select></label>
      <label title="Hide drivers whose published values are not enough to simulate"><input type="checkbox" id="fSim" ${f.sim ? "checked" : ""}> simulatable only</label>
      <label title="Drivers of ${SUB_MIN_IN} in and up, every car-sub library entry (hp-car-subs, buildbass) and your own drivers of ${SUB_MIN_IN} in and up or with no size; passive radiators are left out"><input type="checkbox" id="fSub" ${f.sub ? "checked" : ""}> Subwoofers only</label>
      ${sectionInfo(section).sizeIn ? `<label title="Only drivers whose size suits the section chosen at the top (your own drivers without a size are kept)"><input type="checkbox" id="fSec" ${f.sec ? "checked" : ""}> Sizes for ${esc(sectionInfo(section).label)} (${sectionInfo(section).sizeIn![0]} to ${sectionInfo(section).sizeIn![1]} in)</label>` : ""}
    </div>
    <div class="hint">${drivers.filter((d) => d.library).length} drivers come from the bundled open libraries (marked [name]; read-only: change a value and Save to keep your own copy). Import WinISD <b>.wdr</b> files (several at once) or a <b>CSV</b> saved from a spreadsheet (first row = column names such as Brand, Model, Fs, Re, Qms, Qes, Qts, Vas (L), Sd (cm2), Xmax (mm)). Imported spreadsheet rows are stored as <b>private</b> (data/private, never shipped).</div>
    <div id="dCount" class="dcount"></div><div id="dActive" class="hint"></div><div id="dPager" class="pager"></div><div class="list" id="dlWrap"><table id="dl"></table></div><div id="dPager2" class="pager"></div><div id="lws"></div><div id="impRep"></div></div>
    <div id="edit"></div></div>`;
  const list = () => {
    f.q = $<HTMLInputElement>("#q").value.toLowerCase(); f.lib = $<HTMLSelectElement>("#libf").value; f.brand = $<HTMLSelectElement>("#fBrand").value;
    f.rms = parseFloat($<HTMLInputElement>("#fRms").value) || 0; f.load = $<HTMLSelectElement>("#fLoad").value; f.coil = $<HTMLSelectElement>("#fCoil").value;
    f.size = $<HTMLSelectElement>("#fSize").value; f.sim = $<HTMLInputElement>("#fSim").checked; f.sub = $<HTMLInputElement>("#fSub").checked;
    f.sec = $<HTMLInputElement>("#fSec")?.checked ? section : ""; f.type = $<HTMLSelectElement>("#fType").value;
    const rows = drivers.filter(driverMatches).sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
    const pi = pageInfo(rows.length, dPage); dPage = pi.page;
    $("#dCount").innerHTML = `<b>${countLine(pi, rows.length, drivers.length - shadow.size)}</b>${f.sub ? ` <span class="muted">· Subwoofers only is on (${SUB_MIN_IN} in and up)</span>` : ""}`;
    const active = activeFilters();
    $("#dActive").innerHTML = active.length ? `Filters on: ${active.map(esc).join(", ")} <button class="link" id="clearF">Clear filters</button>` : "";
    for (const id of ["#dPager", "#dPager2"]) $(id).innerHTML = rows.length > PAGE_SIZE ? pagerHtml(pi) : "";
    $("#dl").innerHTML = `<tr><th>Brand</th><th>Model</th><th>Fs</th><th>Qts</th><th>Vas L</th><th>Xmax mm</th><th>RMS W</th><th>Coil</th><th>Final loads Ω</th><th>Type</th><th title="Lowest Australian retailer price listed (inc. GST as listed, read on the date shown in the detail); car libraries only">AUD from</th></tr>` + rows.slice(pi.start, pi.end).map((d) => {
      let qts = d.params.Qts !== undefined ? d.params.Qts.toFixed(2) : "–"; try { if (!d.incomplete) qts = complete(d.params, air).Qts.toFixed(2); } catch { /* incomplete */ }
      return `<tr data-id="${esc(d.id)}" class="${editing?.id === d.id ? "sel" : ""}"><td>${esc(d.brand)}${d.private ? ' <span class="muted">(private)</span>' : ""}</td><td>${esc(d.model)}${d.library ? ` <span class="muted">[${esc(d.library)}]</span>` : ""}${d.kind === "passive" ? ' <span class="tag-pr" title="Passive radiator: no voice coil; used in Design new, Box type: Sealed with passive radiators">PR</span>' : ""}${d.incomplete ? ' <span class="warn" title="Not enough published data to simulate">(no sim)</span>' : ""}${d.checks?.length ? ' <span class="warn" title="Maker data problem: see the notes">CHECK</span>' : ""}${d.id === defaultDriverId ? ' <span class="tag-default" title="Your default driver: new projects and projects without a driver use it">★ Default</span>' : ""}</td><td class="num">${f1(d.params.fs)}</td><td class="num">${qts}</td><td class="num">${f1((d.params.Vas ?? NaN) * 1000)}</td><td class="num">${f1((d.params.Xmax ?? NaN) * 1000)}</td><td class="num">${rmsOf(d) ?? "–"}</td><td>${esc(coilText(d))}</td><td class="num">${(d.finalLoads ?? []).join(", ")}</td><td>${esc(typeLabel(driverType(d)))}</td><td class="num">${(() => { const v = driverPriceFrom(d); return v ? v.toFixed(2) : "–"; })()}</td></tr>`;
    }).join("") + (rows.length ? "" : `<tr><td colspan="11" class="muted">No driver matches these filters.</td></tr>`);
    document.querySelectorAll<HTMLTableRowElement>("#dl tr[data-id]").forEach((tr) => tr.onclick = () => { editing = structuredClone(driverById(tr.dataset.id)); list(); edit(); });
    bindPager("#dPager, #dPager2", pi, (pg) => { dPage = pg; list(); $("#dlWrap").scrollTop = 0; });
    if ($("#clearF")) $("#clearF").onclick = () => { Object.assign(f, NO_FILTERS); dPage = 1; lwsPage = 1; renderDrivers(); };
    // models that meet the power rule but whose makers publish no usable T/S: listed with their source links only
    const lws = libraries.flatMap((l) => (l.listed_without_specs ?? []).map((x) => ({ ...x, library: l.source })))
      .filter((x) => (!f.lib || f.lib === x.library) && (!f.brand || f.brand === x.brand) && (!f.q || (x.brand + " " + x.model).toLowerCase().includes(f.q)) && (!(f.rms > 0) || (x.rms ?? 0) >= f.rms));
    const total = libraries.reduce((n, l) => n + (l.listed_without_specs?.length ?? 0), 0);
    const open = ($("#lwsDetails") as HTMLDetailsElement | null)?.open;
    const lpi = pageInfo(lws.length, lwsPage); lwsPage = lpi.page;
    $("#lws").innerHTML = total ? `<details id="lwsDetails" ${open ? "open" : ""}><summary>Listed without published T/S: ${lws.length} of ${total} models (cannot be simulated; source links)</summary>
      ${lws.length > PAGE_SIZE ? `<div class="dcount">${countLine(lpi, lws.length, total, "models")}</div><div id="lwsPager" class="pager">${pagerHtml(lpi)}</div>` : ""}
      <table id="lwsTable"><tr><th>Brand</th><th>Model</th><th>RMS W</th><th>Note</th><th>Source</th></tr>${lws.slice(lpi.start, lpi.end).map((x) => `<tr><td>${esc(x.brand)}</td><td>${esc(x.model)}</td><td class="num">${x.rms ?? "–"}</td><td class="hint">${esc(x.note)}</td><td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">maker page</a>` : "–"}</td></tr>`).join("")}</table></details>` : "";
    if ($("#lwsPager")) bindPager("#lwsPager", lpi, (pg) => { lwsPage = pg; list(); });
  };
  const refilter = () => { dPage = 1; lwsPage = 1; list(); };
  for (const id of ["#q", "#fRms"]) $(id).oninput = refilter;
  for (const id of ["#libf", "#fBrand", "#fLoad", "#fCoil", "#fSize", "#fSim", "#fSub", "#fSec", "#fType"]) if ($(id)) $(id).onchange = refilter;
  $("#new").onclick = () => { editing = { id: "", brand: "", model: "", params: { fs: 0, Re: 0, Qms: 0, Qes: 0, Sd: 0 }, sources: [{ param: "*", source: "", where: "" }] }; edit(); };
  $<HTMLInputElement>("#imp").onchange = async (e) => importFiles((e.target as HTMLInputElement).files!, list);
  list(); edit();
}
const PNAME: Record<string, string> = Object.fromEntries([["dia", "outer diameter"], ["Znom", "nominal impedance"]]);
/** Coil, rating, per-value sources and CHECK notes of a library driver (high-power library fields). */
function libInfoHtml(d: Driver): string {
  if (!d.library) return "";
  const rows: [string, string][] = [];
  if (d.maker) rows.push(["Maker", `${esc(d.maker)}${d.country ? ` (${esc(d.country)})` : ""}`]);
  if (d.coil) rows.push(["Voice coils", `${esc(coilText(d))}; T/S values published for: <b>${esc(d.tsBasis === "per_coil" ? "one coil" : d.tsBasis === "series" ? "coils in series" : d.tsBasis === "parallel" ? "coils in parallel" : "unknown (not stated by the maker)")}</b>`]);
  if (d.rmsW) rows.push(["Power", `${d.rmsW} W RMS${d.peakW ? `, ${d.peakW} W peak` : ""}${d.rmsRange ? ` (maker range ${d.rmsRange.join(" to ")} W)` : ""}`]);
  if (d.finalLoads) rows.push(["Final loads (one driver)", d.finalLoads.length ? d.finalLoads.map((x) => x + " Ω").join(", ") : "not published"]);
  if (d.status) rows.push(["Status", esc(d.status)]);
  if (d.paramsSeries || d.paramsParallel) rows.push(["Per-wiring values", `the maker also publishes ${[d.paramsSeries ? "series" : "", d.paramsParallel ? "parallel" : ""].filter(Boolean).join(" and ")} values (used directly when you pick that wiring)`]);
  if (d.recommendedBoxes?.length) rows.push(["Maker's recommended boxes", d.recommendedBoxes.map((b) => `${esc(b.type)}${b.volume_l ? ` ${f1(b.volume_l)} L` : ""}${b.tuning_hz ? ` at ${f1(b.tuning_hz)} Hz` : ""}${b.note ? ` <span class="muted">(${esc(b.note)})</span>` : ""}`).join("<br>")]);
  if (d.printed && Object.keys(d.printed).length) rows.push(["Printed, not used", Object.entries(d.printed).map(([k, v]) => k === "Sd" ? `Sd ${f1((v as number) * 1e4)} cm²` : `${k} ${v}`).join(", ")]);
  if (d.calculated?.length) rows.push(["Calculated (not published)", d.calculated.map((k) => PNAME[k] ?? k).join(", ") + " (how: see the notes)"]);
  if (d.alsoIn) rows.push(["Also in", esc(d.alsoIn)]);
  const prices = driverPrices(d); // PM addition (B4): AUD prices of the car libraries, lowest first
  const notes = (d.notes ?? "").split(" | ").filter(Boolean);
  return `${d.incomplete ? `<div class="card bad" id="incompleteNote"><b>Not enough published data to simulate</b> Missing: ${esc((d.missing ?? []).join(", "))}. The published values and their sources are shown below; this driver is not offered in Design or Analyse/Fix (values are never guessed).</div>` : ""}
    ${rows.length ? `<table class="kv" id="libInfo">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>` : ""}
    ${prices.length ? `<h2>Prices (AUD)</h2><table id="drvPrices"><tr><th>Retailer</th><th>Price</th><th>Read</th></tr>${prices.map((x) => `<tr><td>${x.url && /^https?:\/\//.test(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.seller)}</a>` : esc(x.seller)}</td><td class="num">AUD ${x.priceAud.toFixed(2)}${x.onSale && x.compareAtAud ? ` <span class="hint">(on sale, was ${x.compareAtAud.toFixed(2)})</span>` : ""}</td><td>${esc(x.date ?? "")}</td></tr>`).join("")}</table><div class="hint">Australian retailer listings as read on the date shown (inc. GST as listed), not live: check the current price with the link.</div>` : ""}
    ${d.sources?.length ? `<h2>Sources</h2><table id="srcTable"><tr><th>Values</th><th>Source</th><th>Where</th></tr>${d.sources.map((s) => `<tr><td>${esc(s.param === "*" ? "all" : s.param)}</td><td>${/^https?:\/\//.test(s.source) ? `<a href="${esc(s.source)}" target="_blank" rel="noopener noreferrer">${esc(s.source)}</a>` : esc(s.source)}</td><td class="hint">${esc(s.where ?? "")}</td></tr>`).join("")}</table>` : ""}
    ${notes.length && (d.library === "hp-car-subs" || d.library === "car-subs" || d.library === "car-drivers") ? `<h2>Notes</h2><ul id="libNotes">${notes.map((n) => `<li class="${/^CHECK/.test(n) ? "warn" : ""}">${esc(n)}</li>`).join("")}</ul>` : ""}`;
}
function edit() {
  const box = $("#edit"); if (!box) return;
  if (!editing) { box.innerHTML = `<p class="muted">Pick a driver on the left, or add a new one.</p>`; return; }
  const d = editing; d.sources ??= [{ param: "*", source: "", where: "" }];
  const src = d.sources[0];
  const pv = (k: string, m: number) => { const v = (d.params as any)[k]; return v === undefined || v === 0 ? "" : +(v / m).toPrecision(6); };
  const isPRd = d.kind === "passive";
  box.innerHTML = `<fieldset><legend>${d.id ? "Edit driver" : "New driver"}</legend>${d.library ? `<div class="hint">From the <b>${esc(d.library)}</b> library (${esc(d.licence ?? "")}), read-only. ${["hp-car-subs", "car-subs", "car-drivers"].includes(d.library) ? "" : esc(d.notes ?? "")} Save stores your own copy under its brand and model.</div>${libInfoHtml(d)}` : ""}
    <div class="row"><label>Brand</label><input id="brand" value="${esc(d.brand)}"></div><div class="row"><label>Model</label><input id="model" value="${esc(d.model)}"></div>
    <div class="row"><label>Private (own spreadsheet / old app data: never shipped)</label><input type="checkbox" id="priv" ${d.private ? "checked" : ""}></div>
    <div class="row"><label>Source of these values (spec sheet name or URL)</label><input id="src" value="${esc(src.source)}" style="width:55%"></div>
    <div class="row"><label>Where in the source (page, table, date)</label><input id="where" value="${esc(src.where ?? "")}" style="width:55%"></div>
    <div class="row"><label>Kind</label><select id="dkind"><option value="driver" ${isPRd ? "" : "selected"}>Driver (with a voice coil)</option><option value="passive" ${isPRd ? "selected" : ""}>Passive radiator (no voice coil)</option></select></div>
    <table class="kv">${PFIELDS.filter(([k]) => !isPRd || PR_FIELDS.includes(k)).map(([k, l, u, m]) => `<tr><td>${isPRd && k === "Mms" ? "Mms / Mmd (moving mass, without added mass)" : isPRd && k === "fs" ? "Fs (resonance, without added mass)" : l}</td><td><input type="number" step="any" data-p="${k}" data-m="${m}" value="${pv(k, m)}"> <span class="muted">${u}</span></td></tr>`).join("")}</table>
    <div class="row"><label>Notes</label></div><textarea id="notes" rows="2" style="width:100%">${esc(d.notes ?? "")}</textarea>
    <div class="toolbar"><button class="primary" id="save">Save</button><button id="wdr">Export .wdr</button>${d.id && !d.library ? '<button id="del">Delete</button>' : ""}<button id="useit" ${d.incomplete ? 'disabled title="Not enough published data to simulate"' : ""}>Use in current project</button>${d.id && !d.incomplete ? (d.id === defaultDriverId ? '<span class="tag-default" id="isDefault" title="New projects and projects without a driver use it">★ Your default driver</span>' : '<button id="mkdef" title="New projects, and projects with no driver chosen, will use this driver. Projects that already have a driver keep it.">Make this my default driver</button>') : ""}</div>
    <div class="hint">${isPRd ? "Passive radiator minimum: Sd, the moving mass Mms (or Fs with Cms or Vas), the compliance Cms or Vas (or Fs with Mms) and Qms or Rms. Xmax for the travel check; diameter, cut-out, depth and displacement for the box. Nothing is guessed: missing values are reported." : "Minimum: Fs, Re, Sd, Vas (or Cms/Mms) and two of Qms/Qes/Qts. Xmax is needed for the excursion checks; displacement and sizes improve the volume and 3D."}</div></fieldset>
    <div id="xc"></div>${d.id ? tsToolHtml(d) : ""}`;
  if (d.id) bindTsTool(d, { ...measCtx, saveDriver: async (nd) => { await putJson("drivers/" + nd.id, nd); drivers = (await api("drivers")) as Driver[]; editing = structuredClone(driverById(nd.id)); renderDrivers(); } }, () => edit());
  const read = () => {
    d.brand = $<HTMLInputElement>("#brand").value.trim(); d.model = $<HTMLInputElement>("#model").value.trim(); d.private = $<HTMLInputElement>("#priv").checked;
    src.source = $<HTMLInputElement>("#src").value.trim(); src.where = $<HTMLInputElement>("#where").value.trim(); d.notes = $<HTMLTextAreaElement>("#notes").value;
    box.querySelectorAll<HTMLInputElement>("input[data-p]").forEach((i) => { const v = parseFloat(i.value); (d.params as any)[i.dataset.p!] = isFinite(v) && v !== 0 ? v * Number(i.dataset.m) : undefined; });
    for (const k of ["fs", "Re", "Qms", "Qes", "Sd"]) (d.params as any)[k] ??= 0;
    if (d.kind === "passive") for (const k of Object.keys(d.params)) if (!PR_FIELDS.includes(k) && !["Re", "Qes"].includes(k)) delete (d.params as any)[k];
  };
  $<HTMLSelectElement>("#dkind").onchange = (e) => { read(); const v = (e.target as HTMLSelectElement).value; if (v === "passive") d.kind = "passive"; else delete d.kind; edit(); };
  box.querySelectorAll("input,textarea").forEach((i) => i.addEventListener("change", () => { read(); showCheck(d); }));
  showCheck(d);
  $("#save").onclick = async () => {
    read(); if (!d.brand || !d.model) { alert("Brand and model are needed."); return; }
    try { if (d.kind === "passive") completePR(d.params, air); else complete(d.params, air); } catch (e) { if (!confirm("Parameters are incomplete (" + (e as Error).message + "). Save anyway?")) return; }
    const newId = slug(d.brand + "-" + d.model); if (d.library) { delete d.library; delete d.licence; } else if (d.id && d.id !== newId) await api("drivers/" + d.id, { method: "DELETE" }); d.id = newId;
    await putJson("drivers/" + d.id, d); drivers = (await api("drivers")) as Driver[]; refreshDriverMeta(); status("Driver saved", "ok"); renderDrivers();
  };
  $("#wdr").onclick = () => { read(); download(`${d.brand} ${d.model}.wdr`, writeWdr(d), "text/plain"); };
  if ($("#del")) $("#del").onclick = async () => { if (!confirm(`Delete ${d.brand} ${d.model}? (kept in data/private/deleted)`)) return; await api("drivers/" + d.id, { method: "DELETE" }); drivers = (await api("drivers")) as Driver[]; editing = undefined; renderDrivers(); };
  if ($("#mkdef")) $("#mkdef").onclick = async () => { await setDefaultDriver(d); renderDrivers(); };
  $("#useit").onclick = () => { if (!d.id) { alert("Save the driver first."); return; }
    if (d.kind === "passive") { project.design = { ...defaultDesign(), ...(project.design ?? {}), topology: "pr", prId: d.id }; saveProjectSoon(); status(`${d.brand} ${d.model} is now the passive radiator of "${project.title}" (Design new, Box type: Sealed with passive radiators)`, "ok"); return; }
    project.driverId = d.id; saveProjectSoon(); lastDiag = undefined; status(`${d.brand} ${d.model} is now the driver of "${project.title}"`, "ok"); };
}
function showCheck(d: Driver) {
  const out = $("#xc"); if (!out) return;
  if (d.kind === "passive") {
    try { const q = completePR(d.params, air);
      out.innerHTML = `<h2>Passive radiator check</h2><table class="kv" id="prCheck"><tr><td>Fs (no added mass)</td><td>${q.fs.toFixed(1)} Hz</td></tr><tr><td>Mms</td><td>${(q.Mms * 1000).toFixed(1)} g</td></tr><tr><td>Cms</td><td>${(q.Cms * 1000).toFixed(3)} mm/N</td></tr><tr><td>Vas</td><td>${(q.Vas * 1000).toFixed(1)} L</td></tr><tr><td>Qms · Rms</td><td>${q.Qms.toFixed(2)} · ${q.Rms.toFixed(2)} kg/s</td></tr><tr><td>Vd (Sd × Xmax)</td><td>${q.Xmax ? (q.Sd * q.Xmax * 1e6).toFixed(0) + " cm³" : "Xmax not entered"}</td></tr></table>`;
    } catch (e) { out.innerHTML = `<p class="warn" id="prCheck">Not enough values to use this passive radiator: ${esc((e as Error).message)}.</p>`; }
    return;
  }
  try {
    const f = complete(d.params, air); const rows = crossCheck(d.params, air);
    out.innerHTML = `<h2>Spec-sheet check</h2><table><tr><th>Value</th><th>Sheet</th><th>Worked out</th><th>Diff</th><th>From</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.printed.toPrecision(4)}</td><td class="num">${r.computed.toPrecision(4)}</td><td class="num ${r.level}">${r.devPct.toFixed(1)} %</td><td class="muted">${esc(r.note)}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Enter more of the sheet values (Mms, Cms, Bl, Rms, Qts) to cross-check them.</td></tr>'}</table>
      <div class="hint">Over 3 % = check the sheet for a typo or a different measuring method; over 6 % = likely an error. The air setting alone moves Vas/Cms by up to 2 %.</div>
      <table class="kv"><tr><td>Qts</td><td>${f.Qts.toFixed(3)}</td></tr><tr><td>Bl</td><td>${f.Bl.toFixed(2)} T·m</td></tr><tr><td>Mms</td><td>${(f.Mms * 1000).toFixed(1)} g</td></tr><tr><td>η0 / sensitivity</td><td>${(f.eta0 * 100).toFixed(3)} % / ${f.sens1W.toFixed(1)} dB 1 W/1 m</td></tr><tr><td>EBP</td><td>${f.EBP.toFixed(0)} (≥100 suits ported, ≤50 sealed)</td></tr><tr><td>Vd</td><td>${(f.Vd * 1e6).toFixed(0)} cm³</td></tr></table>`;
  } catch (e) { out.innerHTML = `<p class="muted">${esc((e as Error).message)}</p>`; }
}
async function importFiles(files: FileList, refresh: () => void) {
  const rep: string[] = []; let saved = 0;
  for (const file of Array.from(files)) {
    const text = await file.text();
    try {
      if (/\.wdr$/i.test(file.name)) { const d = parseWdr(text, file.name); d.private = true; await putJson("drivers/" + d.id, d); saved++; }
      else {
        const r = rowsToDrivers(parseCsv(text), file.name);
        rep.push(`<b>${esc(file.name)}</b>: columns used: ${r.mapping.map((m) => `${esc(m.header)}→${m.key}${m.mult !== 1 ? "×" + m.mult : ""}`).join(", ")}; ${r.drivers.length} drivers, ${r.skipped} rows skipped (missing Fs/Re/Sd/Vas/Q).`);
        for (const d of r.drivers) { await putJson("drivers/" + d.id, d); saved++; }
      }
    } catch (e) { rep.push(`<span class="bad">${esc(file.name)}: ${esc((e as Error).message)}</span>`); }
  }
  drivers = (await api("drivers")) as Driver[];
  $("#impRep").innerHTML = `<p>${saved} drivers imported.</p>` + rep.map((r) => `<p class="hint">${r}</p>`).join("");
  refresh();
}

// ---------- Help ----------
function renderHelp() {
  $("#page").innerHTML = `<div style="max-width:900px">
  <h2 id="helpStart">Start-up, menu, sections, projects and items</h2><ul class="steps">
  <li><b>Welcome page</b>: every time the app loads it shows the logo for 3 seconds, then the start menu by itself (a click or any key skips it). The logo file goes in <code>data/branding/</code> (logo.svg or logo.png; see the README there); until it is there the name Audio Builder is shown in text.</li>
  <li><b>Start menu</b> ("What do you want to do?"): <b>Continue where I left off</b>, <b>Build a project</b>, <b>Build a single item</b>, <b>Open a project</b>, <b>My saved items</b>, <b>Browse the parts database</b> (the Parts tab). <b>☰ Menu</b> at the top left brings it back.</li>
  <li><b>Continue where I left off</b> opens the project, section and tab marked with <b>Open here at start</b> (★ Start page), stored in data/private/settings.json; without one, the last project, section and tab used in this browser. Before the welcome page and menu existed (until 2026-11-23) the app opened straight on that page: the welcome page and the menu now come first, and Continue takes you there in one click.</li>
  <li><b>Section</b> (the box at the top): the kind of speaker you are working on. It decides which screens, drivers and boxes are shown:
    <ul><li><b>Subwoofer</b>: the full box designer as before (sealed, ported, passive radiators, transmission line, bandpass, isobaric, free-form, Best size, Analyse / Fix / Tweak, REW measurements, Boards).</li>
    <li><b>Door speaker</b>: no box (a door is not a box). A driver choice of 4 to 8 inch drivers, a blank <i>Door mounting: to be decided</i> panel, and what can be worked out without a box: fit check, cone travel and high-pass, displacement limit (see <a href="#helpDoor">Door speakers</a>). Car midbass/midrange/coaxial data comes later; until then the bundled libraries are filtered by size.</li>
    <li><b>Infinite baffle</b>: the IB designer (trunk IB, true IB, free air) as used and taught by PS Sound, UK: response, leak, cone travel and subsonic filter, cabin pressure, power drawn, driver checks, baffle board for Boards (see <a href="#helpIB">Infinite baffle</a>).</li>
    <li><b>Home speakers</b> (drivers about 4 to 12 inch) and <b>Computer speakers</b> (about 2 to 5 inch): the box designer with sealed, ported and passive radiator boxes, presets (bookshelf, floor-standing, desktop) and Boards. A preset sets the box type, power and starting shape, then scales the box to the volume the driver needs, keeping the preset's proportions (the floor-standing preset keeps its height and has 2 drivers) and never shallower than 0.8 × the width (see <a href="#helpHome">Home and computer speakers</a>). New items start with a Dayton Audio RS180-8 (home) or ND105-4 (computer) from the bundled driver-base library; pick any other driver.</li></ul></li>
  <li><b>Projects and items</b>: a project holds several items (a subwoofer box, door speakers, a home speaker box; later amplifiers, DSPs, capacitors, fuses, cable). Switching the section shows that section's item of the project; one is made when you first change something there (just looking changes no file). The <b>Project</b> tab lists the items: open, rename, duplicate, save a copy to My items, remove (a copy goes to data/private/deleted), add new ones or ones from My items, and link items (typed connections: power, ground, signal, speaker or remote, with optional ports and the cable item) for the later wiring diagram, cable calculator and parts list.</li>
  <li><b>Build a single item</b> works on one item on its own. <b>Save to My items</b> keeps it (data/items/); after that it saves automatically, and <b>Add to a project</b> (Item tab, or My saved items in the menu) puts a copy in any project.</li>
  <li>Rename changes the name shown (the file name stays). Delete never really deletes: the file moves to data/private/deleted. Projects made before sections keep their file format until they get a second item; the first save in the new format keeps a backup of the old file in data/private/deleted (<code>&lt;name&gt;.bak-&lt;date&gt;-pre-B1.json</code>). Format: docs/project_model_v2.md.</li></ul>
  <p id="helpDefault"><b>Default driver</b>: on the Drivers tab pick your driver and press <b>Make this my default driver</b> (marked ★ Default in the list). New projects, and projects with no driver chosen, start with it; projects that already have a driver keep theirs. It is stored in data/private/settings.json (never shipped).</p>
  <h2>How to fix an existing box</h2><ol>
  <li><b>Drivers</b> tab: add the new subwoofer from its spec sheet (or import a .wdr / CSV). Put in Xmax and the driver displacement if the sheet has them. Check the spec-sheet table for red rows.</li>
  <li><b>Analyse / Fix / Tweak</b>: choose the driver, then measure the box outside (width, height, depth, panel thickness) and the port (inside diameter or slot size, and physical length). Enter the amp's power and impedance per driver.</li>
  <li>Press <b>Analyse and find fixes</b>. Red cards are the likely cause of what you hear. The options table shows each fix with its result; click one to see it in 3D (blue block = solid inserts).</li>
  <li>Best check: an impedance sweep of the box with the driver in it (REW + a simple jig, or a DATS unit) gives the true tuning; import it in <b>Measurements (REW)</b> under the results and press <b>Fit the box to this sweep</b> to match the model to the real box (guide below).</li></ol>
  ${rewHelpHtml()}
  <h2>Any box shape: triangles, curves, boot profiles, scans, fibreglass</h2><ol>
  <li>In the <b>Shape</b> panel (Design and Analyse/Fix tabs) pick how to give the shape: <b>presets</b> (rectangle, two wedges, trapezoid, triangle/corner prism, tube, all with optional rounded edges), a <b>side profile × width</b> (type each corner of the side view, curved segments with "arc"; tick taper for a different right side), <b>corner points</b> (x, y, z of every corner; faces optional for dented shapes) or a <b>3D scan</b> (.stl/.obj/.ply from a phone LiDAR app, photogrammetry or a scanner).</li>
  <li>For a scan, always do the <b>scale check</b>: measure one size of the space with a tape and enter it. Crop away what is not the box; holes are closed automatically.</li>
  <li><b>Wood</b>: every flat panel gets its true outline, the angle to each neighbour and the <b>table-saw blade tilt</b> for a mitred joint; download the cut sheet (.svg) or the <b>.dxf</b> for a CNC router. A thicker panel (double baffle) is set in the panel list.</li>
  <li><b>Fibreglass</b>: set the shell thickness and the MDF ring; the inside volume is worked out after the shell, and the mat/resin quantities are estimated from the surface area (assumptions shown and editable). <b>Export mould .stl</b> gives the plug shape.</li>
  <li>Driver and port holes can go on any panel; the app checks the hole fits, the driver's mounting depth, and that the port fits straight inside the shape with room at its end. Standing waves use the longest straight line inside the shape.</li>
  <li><b>Export inside air .stl</b>: a closed mesh of the air inside: open it in Blender or MeshLab to check the volume independently. The .glb also carries it (object "Inside_Air").</li></ol>
  <h2 id="helpBestSize">Best size</h2><p>In <b>Design new</b> (rectangle or wedge box) the <b>Box (outside sizes)</b> panel holds the box's outside width, height and depth. <b>Best size</b> works out all three for the gross inside volume the design needs: the net volume from the alignment (Qtc, QB3/SBB4 or your own volume) plus what sits inside the box: the driver displacement × the number of drivers, the passive radiators' displacement, braces and the port with its boards. It keeps the inside proportions close to <b>1 : 1.28 : 1.54</b> (depth : height : width) so no two inside sizes are alike and the standing waves inside do not pile up on one note. That ratio is Sepmeyer's ratio B for rooms (L.W. Sepmeyer, JASA 37(3), 1965), inside Bolt's favourable range (R.H. Bolt, JASA 18(1), 1946), as tabulated in Everest and Pohlmann, <i>Master Handbook of Acoustics</i>, 5th ed., Table 13-5, p. 247. Using a room ratio for a box is a rule of thumb. It also makes sure that:</p><ul>
  <li>every driver and passive radiator fits on the front: frames 20 mm apart, each cut-out at least panel thickness + 20 mm from the outside edge (20 mm clear of the inside wall), frames at least 5 mm from the edge; it tries one row, a grid and one column and keeps the layout with the best proportions;</li>
  <li>the magnet has room: inside depth at least the driver's mounting depth + 10 mm where the magnet sits (on a wedge, where the sloped back comes closest). Without a mounting depth in the driver data it is estimated (half the estimated frame diameter) and the Result says so;</li>
  <li>a box wider than tall is preferred (car boxes usually sit low), so two drivers go side by side when the proportions allow;</li>
  <li>locked sides are kept. Width and height come out in whole millimetres; the last free side is worked out to 0.1 mm so the volume is exact.</li></ul>
  <h2 id="helpKeepVolume">Keep the volume and the locks</h2><p><b>Keep the volume</b> (ticked by default): change one side and the other unlocked sides change with it so the box keeps the volume the driver needs. With two free sides both are scaled by the same factor (their ratio stays). A <b>lock</b> next to a side means it never changes by itself: with one free side left, that side alone takes up the change; with none left, your edit is not applied and the Result says which sides to unlock. A side that would get smaller than the drivers need (front size, magnet depth) stops at that minimum and the Result says so. Changing the panel thickness or the wedge's top % also keeps the volume. Changing what the box needs (driver, number of drivers, target, braces, port, passive radiators) resizes the free sides too. <b>Unticked</b>: only the side you edit changes; the volume, the tuning of the port and every result follow the sizes, and the <b>Volume check</b> line shows how far the box is from the volume needed. Projects saved before this feature open with the sizes they had (their depth is the one the app showed); if their volume does not match, the Volume check says so and Best size fixes it.</p>
  <h2 id="helpMulti">Several subwoofers in one box</h2><p>Set <b>Number of drivers</b>. The volume needed is the net volume per driver × the number of drivers, plus each driver's displacement; the drivers share the box and the port. The front baffle layout, the 3D view, the cut list (number and size of the cut-outs) and the simulation follow the count. The loudness plot shows all drivers together; the impedance plot shows one driver (wire them as the coil panel shows).</p>
  <h2 id="helpPR">Passive radiators (often called "drones"; not diffusers)</h2><p>A <b>passive radiator</b> looks like a subwoofer but has no voice coil and no magnet: the air pressure inside the box moves it, the way the air in a port moves. (A <i>diffuser</i> is something else: a panel that scatters sound in a room.) It does what a port does without port noise and without a long tube, which helps in small boxes. Its moving mass, plus any mass you add (most come with bolt-on weights), sets the tuning.</p><ul>
  <li>Design new → Box type <b>Sealed with passive radiators</b>. Pick one from the Drivers tab (add it there with <b>Kind: passive radiator</b>, from its spec sheet) or type its values in. Needed: Sd, the moving mass (or Fs with Cms or Vas), the compliance (Cms or Vas) and Qms or Rms; Xmax for the travel check. Nothing is guessed.</li>
  <li>The box is sized and tuned like a ported box (QB3/SBB4 or your own volume and tuning). With <b>Pick the added mass for the tuning</b> ticked the app works out the added mass per passive radiator; untick it to enter your own.</li>
  <li>The maths (Small, "Passive-Radiator Loudspeaker Systems", JAES 22, 1974): the passive radiator is a mass with its own suspension. Box tuning fb = fp × √(1 + Vap/Vb), where fp is the passive radiator's own resonance with the added mass and Vap its Vas; at fp the response has a notch, so below fb it falls faster than a ported box.</li>
  <li>Rule of thumb (Small 1974, Part 1): the passive radiators together should displace at least <b>2 ×</b> what the driver does (Sd × Xmax × count), or they run out of travel first. The Result warns if not, and the travel plot shows the passive radiator's travel against its Xmax next to the driver's.</li>
  <li>In 3D the passive radiators are the grey diaphragms without a magnet, on the front with the drivers. The Analyse/Fix tab handles sealed and ported boxes only.</li></ul>
  <p class="hint">Units: every size and volume field follows the Units setting at the top (inches and ft³ work too); the app stores mm and litres.</p>
  ${tlHelpHtml()}
  <h2>Bandpass and isobaric</h2><p>Design tab → Box type: 4th-order, 6th-order (dual reflex) and 3-chamber bandpass (single or dual reflex), and the Isobaric box (two drivers per position). They are simulated with the same lumped model, extended to several chambers. The 3-chamber layout is our definition (no standard published one was found): rear chamber behind the driver, front chamber ported into a third chamber, which ports to the outside.</p>
  <h2>Flared ports</h2><p>A flared (aeroport-style) round port is set by its flare radius. Its air mass is worked out along the flare, and the end corrections use the throat radius, as Hari and Michael (Yorkville Sound, COMSOL conference paper) recommend after Salvatti, Devantier and Button (JAES 50, 2002): mouth-radius corrections overestimate the air mass.</p>
  <h2>Ports that are too long for the box</h2><p>A port is drawn and counted inside the box only. If it is too long to run straight (its inner end must stay one port diameter, or one slot height, from the back: a rule of thumb), it is folded once: along the bottom, then up the back (an L). Its length is measured along the centre line, through the bend, as builders usually do; the tuning maths treats it as a straight port of that length and area. Its air and boards are taken off the net volume. In <b>Design new</b>, if even the folded port is too long, a slot is made narrower (it keeps its height) or a round port gets a smaller diameter, and the Result says so; if nothing fits, a red line says what is needed and no port is drawn. Narrower ports mean faster port air: watch the air speed.</p>
  <h2>Mouse and keys in the 3D view</h2><p>Drag (or middle-drag, like Blender) to orbit, right-drag or Shift+middle-drag to pan, wheel to zoom. Click the view, then 1 = front, 3 = right, 7 = top, Ctrl+number = opposite, 5/Home = reset, X = x-ray. <b>Export .glb</b> opens directly in Blender (File → Import → glTF 2.0); units are metres. Exports are also saved in <code>data/projects/&lt;project&gt;/exports/</code>.</p>
  <h2>What the numbers rest on</h2><p>One lumped-circuit model (Thiele/Small, Small 1972-73) gives every curve; it is checked against published alignment tables and calculator results in the test suite (references/research_c_design_maths.md §7). Air: <b>${esc(air.label)}</b>. Values marked "rule of thumb" (17 m/s port speed, fill gain, group-delay audibility) have no verified primary source.</p>
  <h2>Data</h2><p>Drivers live in <code>data/drivers</code> (may be shared) and <code>data/private/drivers</code> (your spreadsheets and old-app data, never shipped). Each driver records where its values came from.</p>
  <h2>Bundled driver libraries</h2><p>${libraries.map((l) => `<b>${esc(l.source)}</b> (${l.count} drivers, ${esc(l.licence)}, imported ${esc(l.imported)}): ${esc(l.attribution)}`).join("<br>") || "none loaded"}. Rebuilt by <code>scripts/import_driver_libraries.mjs</code> (and <code>scripts/import_hp_subs.mjs</code> for hp-car-subs). Library values are as published by those projects; check the spec sheet before cutting wood.</p>
  ${sectionsHelpHtml()}
  ${systemHelpHtml()}
  ${bomHelpHtml()}
  ${hpHelpHtml()}
  <h2 id="boardsHelp">Boards (MDF and plywood sheets)</h2><ul class="steps">
  <li><b>Material</b> (B7_PLYWOOD_BOARDS): MDF (the default for a box) or plywood: birch (the default for an infinite-baffle baffle, as PS Sound build IB baffles from 18 mm ply and 1 in birch ply), marine, hoop pine, structural, non-structural or exterior. The choice is saved with the box or baffle and is used by the BOM. Plywood sheets: the generic list (data/boards/generic_sheets.json) or the local supplier catalogue (data/private/boards/plywood_sheets_au.json) when present. A sheet within ±0.5 mm of the design thickness is counted as that thickness (for example 18.5 mm hoop pine for an 18 mm design) and the screen says so. <b>Weight</b>: about N kg of panels = the panels' board volume × the material's density (MDF 740 kg/m³ Alpine; birch 680 Metsa; hoop pine 600 Plytech; radiata structural / non-structural 550 STRUCTAply); hardwood marine and hardwood exterior plywood have no maker density, so no weight is given. <b>Grain</b>: plywood is stiffer along its face grain (the sheet's length); with "keep the grain along the long side of each panel" (on by default for plywood) no panel is turned so its long side runs across the grain; the drawing shows the grain as thin lines. MDF has no grain.</li>
  <li>The <b>Boards</b> tab lays every panel of the box out on standard sheet sizes. The public app has a generic list of common Australian MDF and plywood sizes and thicknesses without prices or suppliers (data/boards/generic_sheets.json). When a local supplier catalogue with prices is present (data/private/boards/mdf_sheets_au.json and plywood_sheets_au.json, not part of the public repository), it is used instead: sizes and prices as read on the date shown, not live, so check the current price with the link.</li>
  <li>Panels come from the same cut list as the <b>Cut list</b> button: the Design new box (as that tab shows it now) or the box saved in the project (Analyse / Fix), sizes in whole mm. Wedge sides are trapezoids; free-form wood panels use their real outline.</li>
  <li>The layout uses straight cuts from edge to edge (guillotine cuts, the way a panel saw or a track saw breaks a sheet down): first the strips, then each strip cut into pieces. MDF has no grain, so panels may be turned. Two wedge sides can share one blank, head to tail, split by one sloped cut. The numbered lines are the cut order.</li>
  <li>The saw cut width (kerf, default 3.2 mm, a typical panel or table saw blade; a track saw is about 2.2 mm) and the trim off each factory edge (default 5 mm) are editable.</li>
  <li>It finds the <b>smallest sheet</b> that holds every panel (by area, then by length) and the <b>cheapest way to buy</b> (one supplier, one or several sheets, sizes may be mixed), with the % of each sheet used and the offcuts. When the box's thickness is only sold in big sheets at a supplier (Bunnings sells 18 mm only as 3600 × 1200) it says so. Save picture (SVG) and Print give the drawing with the panel list and the cut order.</li>
  <li>The Bunnings in-store cutting service cuts in 100 mm steps (no precision cuts, pieces at least 600 mm, $1 per cut at some stores): good for breaking a big sheet down to fit the car, not for the final panels. Not included: slot-port walls and braces (not in the cut list yet).</li></ul></div>`;
}

/** B5_BOM (R42): Help for the bill of materials (method: docs/bom.md). */
function bomHelpHtml(): string {
  return `<h2 id="helpBom">BOM (bill of materials) and the linked spreadsheet</h2><ul class="steps">
  <li>The <b>BOM</b> tab (also <b>Bill of materials</b> on the Project, System and Item tabs) lists everything the project needs, grouped: speakers and drivers; enclosures and materials; amplifiers; DSP and head unit; power (battery, fuses and holders, distribution, capacitors); cable; connectors and terminals; other items. It works for a whole project and for a single item (one box gives its drivers and materials).</li>
  <li><b>What is counted and how</b>: every part item once (drivers times their count). <b>Cable</b>: metres per use (power, ground, speaker, remote), gauge and material, from the lengths on the cable items, plus the spare % (default 10 %), rounded up to whole metres (cable products sold by length: whole packs). Where no size was chosen the cable calculator's recommendation is used; wires with no length are listed but not counted. <b>Lugs and ferrules</b>: one per power or ground wire end, by what it lands on (battery, fuse holder, capacitor, chassis: ring lug; amplifier, DSP, distribution block: ferrule for set-screw terminals); speaker wires: 2 ferrules at the amplifier, 2 spade terminals at the speaker. <b>Fuses</b>: one per fuse holder that does not come with one, and one per used output of a fused distribution block (rating from the cable calculator when none is entered). <b>Firewall grommet</b>: one per power run leaving the battery. <b>RCA leads</b>: one pair per signal link (out 1-4 = 2 pairs). <b>MDF</b>: the smallest sheet that holds all panels of a thickness, as on the Boards tab (or the cheapest set of sheets when none does). <b>Box materials</b>: glue and sealant 1 per box, screws 1 per 150 mm of joint, 8 driver screws per driver, terminal cup 1 per box, fill 1 bag per sealed / passive-radiator / transmission line box (the amount is to taste), round port tubes as designed, carpet = panel area + 15 %. Every line says how it was worked out.</li>
  <li>A plain battery (no part chosen) counts 0: it is taken to be the car's own. Items with no part chosen are listed without a price.</li>
  <li><b>Missing / to decide</b>: the missing-part check's problems (System tab) and anything the BOM could not count; nothing is invented for them, and they are not in the totals.</li>
  <li><b>Prices</b>: the lowest AUD price known (inc. GST as listed) with the supplier, the date it was read and a link; all known prices are in the line's price list. They are not live: <b>check every price and part before buying</b>. Totals say how many lines are priced ("n of m lines priced").</li>
  <li><b>Your changes</b>: type a quantity or a unit price on a line to override it (reset puts it back); the spare % too. They are saved with the project.</li>
  <li><b>Download spreadsheet (.xlsx)</b>: sheets BOM, Parts, Cables, Items, Diagram, Info. On the BOM sheet the line total is qty x unit price, the subtotals and the grand total are SUM formulas, and the unit price, supplier, date and link of every part line are read from the Parts sheet: change a price on the Parts sheet and the BOM updates. Cables holds the cable calculator's runs; Items every item and link; Diagram names the wiring diagram file (exports/system.svg); Info the date, app version, data sources and licences. <b>Download CSV</b> gives the BOM sheet's values. Both are also saved with the project as <code>data/projects/&lt;project&gt;/exports/bom.xlsx</code> and <code>bom.csv</code>.</li></ul>`;
}
/** B4_SYSTEM_UI: Help for the System tab, the cable calculator, the wiring diagram and the missing-part check (R41, R44;
 * sources: references/research_i_car_electronics.md section B, docs/cable_engine.md, docs/diagram_engine.md). */
function systemHelpHtml(): string {
  const a = (u: string, t?: string) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t ?? u}</a>`;
  return `<h2 id="helpSystem">System (the whole electrical system of a project)</h2><ul class="steps">
  <li>The <b>System</b> tab (in every section, and <b>System and wiring</b> on the start menu) shows every item of the open project in groups: <b>Power</b> (battery, alternator, fuses and holders, distribution blocks, cable, capacitors, ground points), <b>Amplifiers</b>, <b>Signal</b> (head unit, DSP) and <b>Speakers</b> (subwoofer boxes, door speakers, infinite baffle, home and computer speakers).</li>
  <li><b>Add</b>: Battery, Head unit, Chassis ground point and Alternator are plain items (the parts database has batteries too: <b>From the parts database</b>, Batteries; it has no head units yet). Amplifiers, DSPs, capacitors, fuses, distribution blocks and cable come from the <b>Parts</b> tab (Add to project). Edit shows the values the calculator reads; an empty field uses the part's value.</li>
  <li><b>Connect…</b> on an item makes a link: what it carries (<b>power</b>, <b>ground</b>, <b>signal</b>, <b>speaker</b>, <b>remote</b> turn-on), to which item, port names (filled in for the kind, free text) and the cable item that makes it (or a new one with its length). ✕ removes a link.</li>
  <li><b>Wire it for me…</b> proposes the usual chain for what the project holds: battery, main fuse at the battery, main run, a distribution block when more than one item draws power, the capacitor next to the amplifier, each amplifier; grounds to a chassis ground point; head unit to DSP to amplifiers (signal and remote); amplifiers to speakers (subwoofers to 1-channel amplifiers, the others to multi-channel ones). Free cable items go on the links by what they are for (power: main run, then branches, then grounds; speaker cable; remote wire). It changes nothing until you tick what you want and press <b>Apply</b>; existing links are left as they are. A missing battery and ground point are proposed as new items; a missing fuse is not invented (the check asks for it, so you choose the real one).</li>
  <li><b>Remove</b> keeps the wire through the item: removing a fuse leaves battery → cable → block, so the check then asks for the fuse again. A copy of the item goes to data/private/deleted.</li></ul>
  <h2 id="helpCable">Cable calculator (R41)</h2><ul class="steps">
  <li>Runs over the project's power links (battery → fuse → cable → block → capacitor → amplifier). Per power run: current at full sine output and on music, the fuse (yours, else the next stocked rating at or above the current), the recommended <b>copper</b> and <b>CCA</b> AWG size and the ISO metric size (mm²), the drop in volts and %, the power lost in the wire, the drop including the run before it (main run + branch), and the maker's own wire size next to the calculated one.</li>
  <li><b>Order of the checks</b> (research_i B1): current, fuse, ampacity (the wire must carry the fuse rating), voltage drop over the loop (power run + ground return); the larger wire wins. Several amplifiers through a distribution block: the main run carries the sum and gets two thirds of the drop; each branch the rest.</li>
  <li><b>Current</b>: the maker's maximum current, else the maker's fuse, else power ÷ (efficiency × voltage) with 0.50 for class D / BD and 0.45 for class A/B (these reproduce the makers' own maximum figures, research_i B3); music about half the maximum (Rockford Fosgate's convention). Kenwood-style "current consumption" is not a maximum and is not used as one.</li>
  <li><b>Options</b> (saved with the project): supply 13.8 V (engine running; 12.6 V engine off, 14.4 V charging), drop limit 3 % (ABYC E-11.16.1.2.7; 0.5 V is offered but has no primary source), conductor temperature 50 °C, default material, engine space (ABYC engine-space column, about 0.85), insulation 105 / 90 °C, fuse up to 100 % of the wire's ampacity (ABYC allows 150 %). Bundling (more than two conductors together over 610 mm: × 0.70 for 3, × 0.60 for 4 to 6, × 0.50 for 7 or more, ABYC Table VII) is set per cable in the run's row.</li>
  <li><b>Use this size</b> enters the recommended size (and its copper area) on the run's cable item in its material; a product it came from no longer matches, so it is taken off the item (shown on Edit). <b>Real products that fit</b> lists cable from the parts database that meets the run with its <b>real</b> copper area (strand count or published area; Australian "6 mm" auto cable is 4.59 mm², not 6), cheapest AUD per metre first, with links; <b>Use this product</b> puts it on the cable item. Unknown material is judged as CCA (safe).</li>
  <li><b>Speaker cable</b>: the 5 % rule (loop resistance at most 5 % of the load the amplifier sees; Roger Russell, ${a("http://www.roger-russell.com/wire/wire.htm")}), with every size's loss in dB, power lost and damping factor (amplifier output 0.02 Ω assumed).</li>
  <li><b>Capacitors</b>: energy ½ C V², the usable energy between 14.4 and 12.6 V and how long it feeds the amplifier at full draw (an illustration, not a research figure), the precharge resistor's time constant (R × C, 5 τ to about 99 %), inrush and resistor power. "1 farad per 1000 W" is shown for comparison only (no test basis found).</li>
  <li><b>Alternator and big 3</b>: alternator rating and the car's own load (on the battery item) against the music and full-power draw; the big 3 wires (alternator +, battery −, engine to chassis) sized for the whole system current in the engine space and never thinner than the thickest feed (installer practice, no standard).</li>
  <li>Not counted: drops across fuses, holders and joints (leave a margin). Fuse placement: within 175 mm of the battery (ABYC E-11.12.1.2), up to 1.83 m if the cable is sheathed all the way; makers allow up to 457 mm (MTX), 305 mm (AudioControl).</li>
  <li><b>Quick calculator</b> (Build a single item → Cable calculator, or the System tab): one amplifier and one power cable, from its RMS power and class or the maker's maximum current; gives the cable size and fuse, and saves the cable to My items.</li>
  <li>Sources (research_i section D): ABYC E-11 (2003) ${a("https://law.resource.org/pub/us/cfr/ibr/inc/ansi/abyc.e-11.2003.pdf")}; NBS Handbook 100 copper wire tables ${a("https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf")}; CCA resistivity (ASTM B566 class 10A) via ${a("https://mwswire.com/wp-content/uploads/2024/03/MWS-copper-clad-aluminum-other-clad-metals.pdf", "MWS Wire")} and ${a("https://www.ulbrich.com/uploads/data-sheets/Ulbrich-Lite-Weight-Copper-Clad-Aluminum-Data-Sheet.pdf", "Ulbrich")}; Rockford Fosgate amplifier pages (current, efficiency, fuse, wire, alternator) ${a("https://rockfordfosgate.com/products/selector/car-amplifiers/")}; JBL fuse tips ${a("https://in.jbl.com/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw3b2c9149/pdfs/JBL%20Car%20Audio%20Installation%20tips%20Fuses.pdf", "JBL installation tips: fuses")}; MTX ${a("https://international.mtx.com/library-car-amplifier-install")}; Crutchfield ${a("https://www.crutchfield.com/learn/learningcenter/car/amplifier_installation_guide.html")}; Narva cable data ${a("https://www.narva.com.au/attachments/ProductAttachmentGroup/8/Automotive%20Cabling.pdf")}; AU mm labels ${a("https://www.solar4rvs.com.au/buying/buyer-guides/cable-size-conversion-tables-mm-mm2-b_s-awg")}. Full list and the standards rejected (AS/NZS 3008 and others): references/research_i_car_electronics.md.</li></ul>
  <h2 id="helpDiagram">Wiring diagram (R44)</h2><ul class="steps">
  <li>Drawn on every save of a project and shown on the System tab: battery and alternator on the left, the power chain (fuses, cable, blocks, capacitors) by distance from the battery, amplifiers, then speakers; head unit and DSP along the top (signal and remote), ground points along the bottom. Power red solid, ground black long dash, signal blue dotted, speaker green dash-dot, remote orange dash (readable in black and white). Cable sizes and lengths, fuse ratings, loads in ohm and port names are written on the lines; items with no link are in a "Not connected" box.</li>
  <li>Zoom with − / + / Fit / 100 %; click an item to edit it (speakers open in their section). <b>Download SVG</b> and <b>Print</b>. It is also saved as <code>data/projects/&lt;project&gt;/exports/system.svg</code> whenever it changes.</li>
  <li>Limits: lines can cross in busy systems; bridged outputs are not modelled (name the port, for example "CH1+2 bridged").</li></ul>
  <h2 id="helpChecks">Missing-part check and when the alert shows</h2><ul class="steps">
  <li>On every save the project is checked for missing or critical parts: no battery, an amplifier with no power wire, no fuse at the battery, a fuse too far from the battery, no ground, no speakers, no signal or turn-on, a speaker with no amplifier, a DSP with no source, a load below the amplifier's minimum, a branch wire thinner than the fuse upstream, wires too thin or with too much drop, missing cable items, a capacitor not on the amplifier's wire or without a precharge resistor, parts not connected, an alternator too small for the music draw. Each comes with one button: <b>Add …?</b> adds the part and links it where it belongs (a main fuse goes into the wire between the battery and the next item, its cable moves to the fuse's output), <b>Use a thicker cable?</b> sets the recommended size, and checks that add nothing open the item to change.</li>
  <li>Critical problems are listed first (red), warnings after (amber), in ONE panel at the bottom right. When nothing is missing there is no panel at all (no "all good" message).</li>
  <li><b>When it shows</b>: when you press <b>Save</b> (top bar or System tab) or <b>Ctrl+S</b>; when you leave the project (☰ Menu or another project) while a <b>critical</b> problem is open (<b>Not now (leave)</b> goes on); and on an autosave only when a problem appears that was not there at the previous check (then as one small line, <b>Show</b> / <b>Not now</b>, so it does not cover the page while you are still adding parts). It never shows just because something was autosaved, and not when a project is opened. <b>Not now</b> puts this list off: autosaves and leaving stay quiet until the list changes; Save / Ctrl+S always show it. An open panel follows every save (problems fixed drop off; it closes when the list is empty). So a box-only project (older projects) shows its one "Add an amplifier?" warning on Save, not while you work.</li></ul>`;
}
/** B2_SECTIONS: Help for the Infinite baffle, Door speaker, Home and Computer sections (sources: research_h). */
function sectionsHelpHtml(): string {
  return `<h2 id="helpIB">Infinite baffle (as used and taught by PS Sound, UK)</h2><ul class="steps">
  <li><b>What it is.</b> The subwoofers sit on a rigid, sealed baffle instead of in a box. <b>Trunk IB</b>: the baffle is a wall between the boot and the cabin; the boot air behind the drivers works as the box, the closed cabin in front as a second load. <b>True IB</b>: the drivers are mounted through the floor or spare-wheel well and breathe to the outside under the car; the cabin is the only air the cones work into. <b>Free air</b>: no load at all (shown for comparison). PS Sound (Pssound Ltd, founded 2016 by Peter, https://www.pssound.co.uk/our-story ) teach both forms in their YouTube videos; they did not invent IB.</li>
  <li><b>The maths</b> is the closed box with a big volume (references/research_h_ib_door_home_pc.md 1.7): alpha = N·Vas / V<sub>boot</sub> + N·Vas / V<sub>cabin</sub> (the cabin term can be switched off), fc = fs·√(1 + alpha), Qtc = Qts·√(1 + alpha). N drivers on one baffle act as one driver with N times the Vas and cone area. PS Sound modelled a trunk IB as a box the size of the boot (about 500 L) and a true IB as a box the size of the cabin (about 3,000 L) in WinISD; for 2 × AE IB15AU in 3,000 L this gives Qtc 0.695, their "ideal point 0.7".</li>
  <li><b>Leak</b> between boot and cabin: a gap of area A and length t is a port between the two air volumes; it tunes at f = c/2π·√(A / (V<sub>eff</sub>·L<sub>eff</sub>)), L<sub>eff</sub> = t + 1.7·√(A/π), 1/V<sub>eff</sub> = 1/V<sub>boot</sub> + 1/V<sub>cabin</sub>. Below that the front and back waves meet through the gap and the bass falls away. Example (boot 400 L, cabin 3,000 L, 20 mm): 5, 20, 100, 500 cm² tune at about 10, 16, 27, 42 Hz. This puts numbers on PS Sound's "it's about the ratio of the cone and the leakage". Simple lumped model: approximate (a leak loss of Q 5 is assumed).</li>
  <li><b>Cabin pressure</b> below the first cabin mode: p = ρc²·N·Sd·x / V<sub>cabin</sub>. At Xmax this is the most the cones can do in that cabin (2 × IB15AU in 3,000 L: 137 dB from the peak pressure, 134 dB as a steady sine; PS Sound measured 135.5-139.9 dB at 19-35 Hz). The red dashed line on the loudness plot is the free-field limit at Xmax; the green line is the pressure-field cabin level (valid only below the first cabin mode); the orange one adds the app's empirical cabin gain to the free field.</li>
  <li><b>Subsonic filter</b>: the app picks the lowest 24 dB/octave high-pass that keeps the cone within Xmax at the power set. PS Sound's own settings were not found; they turn up slowly at the lowest note wanted (15-20 Hz) and stop when the spider is heard stretching. Kicker: a subsonic filter is "recommended, and sometimes required".</li>
  <li><b>Power</b>: near the low resonance the impedance rises steeply, so an IB sub "can hardly draw any power" there (PS Sound measured 67 W at 20 Hz for 138.7 dB with 2 × IB15AU). The power plot shows V²·Re(1/Z).</li>
  <li><b>Drivers</b>, PS Sound's rules: Fs as low as possible ("to 20 if not below"), Qts "anything above 0.5" up to about 0.7, soft suspension, sensitivity and low inductance, and "cone area is king". Other guides: MTX, Qts above 0.6 and Vas below the volume available; Lucas (Eminence), Qts 0.7 or above for free air / IB. They are shown as notes, not hard rules. The default driver is the Acoustic Elegance IB15AU PS Sound use and sell (values from their shop page, https://pssound.squarespace.com/shop/p/ib15au ).</li>
  <li><b>Baffle board</b>: sized for the drivers in a row (60 mm edges, 40 mm between frames) or your own size, in layers; it goes to the <b>Boards</b> tab. When the driver sheet gives no frame or cut-out size they are estimated from the cone area and the screen says so.</li>
  <li>Sources: PS Sound videos (YouTube channel "Pssound", auto-generated transcripts, so words can be misheard), Kicker (https://www.kicker.com/app/misc/support/tech/tech_papers/docs/InfiniteBaffleGuidelines.pdf), MTX (https://help.mtx.com/knowledge-base/mobile-audio-subwoofer-enclosure-design), Lucas (https://www.premierguitar.com/more-speaker-parameters-explained); full list in references/research_h_ib_door_home_pc.md section 6.</li></ul>
  <h2 id="helpDoor">Door speakers</h2><ul class="steps">
  <li><b>Door mounting: to be decided.</b> No box is shown or calculated: a door is not a box, and its "box" behaviour, panel buzz and cancellation through the access holes depend on each door and need measuring (REW).</li>
  <li>What is shown: the driver's own data; a <b>fit check</b> from your measurements (hole diameter, room behind the mounting face to the window glass with the window down, spacer thickness; Crutchfield, https://www.crutchfield.com/learn/car-speakers-installation.html ); the response of the driver without a box (its own Fs and Qts), the cone travel at the power set and the lowest 24 dB/octave high-pass that keeps it within Xmax; and the displacement-limited loudness.</li>
  <li><b>PS Sound's view</b> (their view, not a rule): "Why We Hate Midbass In a Door" (https://www.youtube.com/watch?v=ZDzS8tuG62c ): even a fully treated door buzzes and "the whole door is playing the wave"; they put midbass in kick panels, true-IB floor mounts or small sealed enclosures.</li></ul>
  <h2 id="helpHome">Home and computer speakers</h2><ul class="steps">
  <li><b>Presets</b> (starting shapes, not a standard), from maker pages read 2026-11-23 (references/research_h_ib_door_home_pc.md 3.1-3.2): small bookshelf sealed like the BBC LS3/5A; bookshelf ported like the Wharfedale Diamond 12.2 and KEF LS50 Meta; floor-standing like the Wharfedale Diamond 12.3 / 12.4; desktop like the Genelec 8010A / 8020D and JBL 104. The box is then scaled to the volume your driver needs.</li>
  <li><b>Proportions</b>: Best size in these sections stands the box upright, inside width : depth : height = 1 : 1.28 : 1.54 (Sepmeyer's ratio, as in the subwoofer section, turned upright). A home or desk box is kept at least 0.8 × as deep as it is wide (the shallowest reference product, the JBL 104, is 0.81 ×); when a preset or Best size would make it shallower, the depth is set to 0.8 × the width and the height gives way (even the floor-standing preset's locked height), and the Result says so.</li>
  <li><b>Baffle step</b>: f3 = 115 / front width in metres (John Murphy, True Audio, after Olson 1969; R. Elliott, ESP, https://www.sound-au.com/bafflestep.htm ): above it the speaker radiates forward (+6 dB), below it all round, so a speaker on a stand sounds up to 6 dB lighter in the bass. Near a wall less correction is needed (Purifi, https://purifi-audio.com/blog/tech-notes-1/what-is-the-baffle-step-20 ).</li>
  <li><b>Inside / outside volume</b>: Wharfedale's published cabinet volumes are 50-62 % of their outside sizes; the Design tab shows yours.</li>
  <li><b>Crossover</b>: 2.0 to 3.0 kHz in every 2-way product checked. The crossover itself is not designed here.</li></ul>`;
}
/** Help section for the high-power car subwoofer database (attribution, licence, sourcing, wiring, corrections). */
function hpHelpHtml(): string {
  const l = libraries.find((x) => x.source === "hp-car-subs"); if (!l) return "";
  const hp = drivers.filter((d) => d.library === "hp-car-subs"); const sim = hp.filter((d) => !d.incomplete).length;
  return `<h2 id="hpHelp">High-power car subwoofer database (hp-car-subs)</h2>
  <p><b>${esc(l.attribution)}.</b> Licence: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 (CC BY 4.0)</a> for our compilation; the numbers themselves are the makers' published facts. If you reuse the data, credit "Audio_Builder high-power car subwoofer database" and keep each entry's source.</p>
  <p>${hp.length} subwoofers (${sim} with enough published values to simulate, ${hp.length - sim} listed with their published values only) and ${l.listed_without_specs?.length ?? 0} more models listed without T/S, imported ${esc(l.imported)}. Scope: 2000 W RMS or more, with coils that give a final load of 2, 1 or 0.5 Ω (a few with other coil impedances are kept with their real loads).</p>
  <p><b>How the values were sourced:</b> the maker first: its own spec sheets, manuals and product pages (tier 1); only when the maker gives nothing, its authorised distributor (tier 2) or a named independent measurement (tier 3); never forums or other databases. Every entry lists each source with its URL, document, page and the date it was read (Drivers tab, pick a driver). Values the app worked out by a standard identity (for example Qes from Qts and Qms, or Sd from fs, Mms and Vas) are marked "calculated" in the notes; nothing is guessed. Where a maker's own values contradict each other the entry carries a <span class="warn">CHECK</span> note (for example Sundown Audio prints the nominal circle area as Sd; the app simulates with Sd calculated from Sundown's own fs, Mms and Vas and keeps the printed value in the notes).</p>
  <p><b>Dual voice coils:</b> pick the coil wiring (series, parallel or one coil) in Design or Analyse/Fix. The app converts the published values to that wiring (series: Re ×2, Bl ×2; parallel: Re ÷2, Bl unchanged; Qes the same for both), or uses the maker's own per-wiring values where published, and shows the impedance per driver and the final load at the amplifier. When the maker does not say which wiring its T/S values describe, the app says what it assumed (from Re against the coil impedance) and lets you change it.</p>
  <p><b>Report a correction:</b> corrections go in <code>data/hp_subs_raw/&lt;us|world&gt;/&lt;brand&gt;.json</code> (the value, its source URL, document, page and date read), then rerun <code>node scripts/import_hp_subs.mjs</code> and reload the app. Research reports: <code>references/research_e_hp_subs_us.md</code>, <code>references/research_e_hp_subs_world.md</code>.</p>`;
}

// ---------- B1_SHELL (R43): welcome page and start menu ----------
/** Welcome: the logo (data/branding, served by /api/branding) or a text placeholder, 3 s, then on by itself;
 * a click or any key skips it. */
async function showWelcome(): Promise<void> {
  let logo: string | null = null;
  try { const b: any = await Promise.race([api("branding"), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 800))]); logo = typeof b?.logo === "string" ? b.logo : null; } catch { logo = null; }
  const text = `<div id="wText" class="wtext">Audio Builder</div>`;
  $("#app").innerHTML = `<div id="welcome" class="welcome" title="Click or press any key to skip">
    ${logo ? `<img id="wLogo" src="/api/branding/${esc(logo)}" alt="Logo">` : text}
    <div class="wsub">Speaker boxes and car audio</div><div class="hint">Click or press any key to skip</div></div>`;
  const img = $<HTMLImageElement>("#wLogo"); if (img) img.onerror = () => { img.outerHTML = text; };
  const w = (window as any).__abWelcome = { shownAt: performance.now(), leftAt: 0, logo, how: "" };
  await new Promise<void>((done) => {
    let over = false;
    const go = (how: string) => { if (over) return; over = true; clearTimeout(t); removeEventListener("keydown", onKey); w.leftAt = performance.now(); w.how = how; done(); };
    const onKey = () => go("key");
    const t = window.setTimeout(() => go("timer"), 3000);
    $("#welcome").onclick = () => go("click"); addEventListener("keydown", onKey);
  });
}
const sectionOptions = (cur?: string) => SECTIONS.map((x) => `<option value="${x.id}" ${x.id === cur ? "selected" : ""}>${esc(x.label)}</option>`).join("");
const when = (iso?: string) => { if (!iso) return "–"; const d = new Date(iso); return isNaN(+d) ? "–" : d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); };
/** Start menu: "What do you want to do?". sub = which list is open under the buttons. */
function showMenu(sub?: "newproject" | "newitem" | "open" | "items") {
  view?.dispose(); view = undefined;
  const t = continueTarget();
  if (loadError) setTimeout(() => status(loadError!, "bad"), 0);
  const tp = t?.kind === "project" ? projects.find((p) => p.name === t.name) : undefined;
  const contTxt = t?.kind === "item" ? "your last single item" : tp ? `${esc(tp.title || tp.name)}` : "nothing yet";
  $("#app").innerHTML = `<div class="menu" id="menu">
    <div class="mhead"><div class="wtext small">Audio Builder</div><span id="status" class="status"></span></div>
    <h2 class="mq">What do you want to do?</h2>
    <div class="mgrid">
      <button data-m="continue" class="primary" ${t ? "" : "disabled"}><b>Continue where I left off</b><span id="contWhat">Opens ${contTxt}</span></button>
      <button data-m="newproject"><b>Build a project</b><span>A whole system (for example a car): subwoofer box, door speakers and more, saved together</span></button>
      <button data-m="newitem"><b>Build a single item</b><span>One box or one set of speakers on its own; save it to My items and add it to any project later</span></button>
      <button data-m="open"><b>Open a project</b><span>${projects.length} saved: open, rename, duplicate or delete</span></button>
      <button data-m="items"><b>My saved items</b><span>Items saved on their own: open, add to a project, rename, duplicate or delete</span></button>
      <button data-m="system"><b>System and wiring</b><span>The open project's whole electrical system: wire it, cable sizes and fuses, the wiring diagram and the missing-part check</span></button>
      <button data-m="parts"><b>Browse the parts database</b><span>Drivers (${drivers.length.toLocaleString("en-AU")}: subwoofers, tweeters, midrange, midbass, coaxials, component sets), amplifiers, DSPs, capacitors, batteries, fuses and holders, distribution, cable, interconnects, terminals, wiring kits</span></button>
    </div><div id="msub"></div></div>`;
  document.querySelectorAll<HTMLButtonElement>("#menu .mgrid button").forEach((b) => b.onclick = () => void menuAction(b.dataset.m!));
  if (sub) void menuAction(sub);
}
async function enterApp() { shell(); render(); }
async function menuAction(m: string) {
  const box = $("#msub"); if (!box) return;
  document.querySelectorAll<HTMLButtonElement>("#menu .mgrid button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  if (m === "continue") { await continueLast(); return enterApp(); }
  if (m === "parts") { await continueLast(); tab = "parts"; store.set("tab", tab); return enterApp(); }
  if (m === "system") { const t = continueTarget(); if (t?.kind === "item") store.set("mode", "project"); await continueLast(); tab = "system"; store.set("tab", tab); return enterApp(); } // B4
  if (m === "quickcalc") return showQuickCalcPage(); // B4
  if (m === "newproject") {
    box.innerHTML = `<fieldset id="mNewProj"><legend>Build a project</legend>
      <div class="row"><label>Project name</label><input id="npTitle" placeholder="e.g. Car audio system" style="flex:2"></div>
      <div class="row"><label>Start with</label><select id="npSec">${sectionOptions(section)}</select></div>
      <div class="hint">The project starts with one item of that section. Add more items (door speakers, another box, items from My items) on its <b>Project</b> tab, or switch the Section at the top.</div>
      <div class="toolbar"><button class="primary" id="npGo">Create and open</button></div></fieldset>`;
    $<HTMLInputElement>("#npTitle").focus();
    $("#npGo").onclick = async () => {
      const title = $<HTMLInputElement>("#npTitle").value.trim(); if (!title) { status("Give the project a name", "bad"); return; }
      try { await createProject(title, $<HTMLSelectElement>("#npSec").value as SectionId); enterApp(); } catch (e) { status("Could not create the project: " + (e as Error).message, "bad"); }
    };
    return;
  }
  if (m === "newitem") {
    box.innerHTML = `<fieldset id="mNewItem"><legend>Build a single item: which kind?</legend><div class="mgrid small">${SECTIONS.map((x) => `<button data-sec="${x.id}"><b>${esc(x.label)}</b><span>${esc(x.explain)}</span></button>`).join("")}</div>
      <div class="mgrid small" style="margin-top:8px"><button data-m2="quickcalc"><b>Cable calculator</b><span>One amplifier, one power cable: cable size and fuse from the amp's power or current, length and material; save the cable to My items</span></button></div>
      <div class="hint">Press <b>Save to My items</b> (top bar) to keep it; it then saves automatically and can be added to any project from My saved items.</div></fieldset>`;
    box.querySelectorAll<HTMLButtonElement>("button[data-m2]").forEach((b) => b.onclick = () => void menuAction(b.dataset.m2!));
    box.querySelectorAll<HTMLButtonElement>("button[data-sec]").forEach((b) => b.onclick = () => { startItem(b.dataset.sec as SectionId); void loadMeasurements(measCtx, true); enterApp(); });
    return;
  }
  if (m === "open") {
    try { await refreshProjects(); } catch { /* keep the old list */ }
    box.innerHTML = `<fieldset id="mOpen"><legend>Open a project</legend><table id="projList"><tr><th>Project</th><th>Sections</th><th>Items</th><th>Saved</th><th></th></tr>
      ${projects.map((p) => `<tr data-name="${esc(p.name)}"><td><b>${esc(p.title || p.name)}</b> <span class="muted">(${esc(p.name)})</span></td><td>${esc(sectionInfo(p.section).label)}</td><td class="num">${p.items ?? 1}</td><td>${when(p.saved)}</td>
        <td class="acts"><button data-a="open" class="primary">Open</button><button data-a="rename">Rename</button><button data-a="dup">Duplicate</button><button data-a="del">Delete</button></td></tr>`).join("")}</table>
      <div class="hint">Delete moves the project file and its folder (measurements, exports) to data/private/deleted; nothing is really deleted. Duplicate copies the project file only (not its measurements or exports). Rename changes the name shown; the file name stays.</div></fieldset>`;
    box.querySelectorAll<HTMLButtonElement>("#projList button[data-a]").forEach((b) => b.onclick = () => void projectAction(b.closest("tr")!.dataset.name!, b.dataset.a!));
    return;
  }
  if (m === "items") {
    let list: { id: string; name: string; section: string; kind: string; saved?: string }[] = [];
    if (!hasF("items")) { box.innerHTML = `<fieldset id="mItems"><legend>My saved items</legend><p class="warn">My items needs the updated app server: run <code>scripts/restart_app.sh</code> on the host, then reload.</p></fieldset>`; return; }
    try { list = await api("items"); } catch (e) { status("Could not list My items: " + (e as Error).message, "bad"); }
    try { await refreshProjects(); } catch { /* keep */ }
    const projOpts = projects.map((p) => `<option value="${esc(p.name)}">${esc(p.title || p.name)}</option>`).join("");
    box.innerHTML = `<fieldset id="mItems"><legend>My saved items</legend>${list.length ? `<table id="itemList"><tr><th>Item</th><th>Section</th><th>Saved</th><th></th><th>Add to project</th></tr>
      ${list.map((x) => `<tr data-id="${esc(x.id)}"><td><b>${esc(x.name)}</b></td><td>${esc(secLabel(x.section))}</td><td>${when(x.saved)}</td>
        <td class="acts"><button data-a="${x.section === PART_SECTION ? "edit" : "open"}" class="primary">${x.section === PART_SECTION ? "Edit" : "Open"}</button><button data-a="rename">Rename</button><button data-a="dup">Duplicate</button><button data-a="del">Delete</button></td>
        <td class="acts"><select data-p>${projOpts}</select><button data-a="add">Add</button></td></tr>`).join("")}</table>` : `<p class="muted">No saved items yet. Build a single item and press Save to My items, or save an item from a project's Project tab.</p>`}
      <div class="hint">Adding puts a copy of the item in the project (the item stays in My items). Delete moves the item file to data/private/deleted. Parts (amplifiers, cable, fuses...) are edited here and used in a project.</div></fieldset><div id="miEdit"></div>`;
    box.querySelectorAll<HTMLButtonElement>("#itemList button[data-a]").forEach((b) => b.onclick = () => { const tr = b.closest("tr")!; void savedItemAction(tr.dataset.id!, b.dataset.a!, tr.querySelector<HTMLSelectElement>("select[data-p]")?.value); });
  }
}
/** Open / rename / duplicate / delete a project; inMenu = called from the start menu list (redraws it), else from the Project tab. */
async function projectAction(name: string, a: string, inMenu = true) {
  const p = projects.find((x) => x.name === name); const title = p?.title || name;
  try {
    if (a === "open") { await openProject(name, {}); return enterApp(); }
    if (a === "rename") {
      const t = prompt(`New name for "${title}"`, title)?.trim(); if (!t || t === title) return;
      if (mode === "project" && doc.name === name) { doc.title = t; if (activeItem.kind === "box") project.title = t; await persist(); }
      else { const r = pv2.readProject(await api("projects/" + name)); r.doc.title = t; await putJson("projects/" + name, pv2.toDisk(r.doc, r.legacy)); }
      status(`Renamed to "${t}"`, "ok");
    }
    if (a === "dup") {
      const t = prompt(`Name of the copy of "${title}"`, `${title} (copy)`)?.trim(); if (!t) return;
      if (mode === "project" && doc.name === name && saveTimer) await persist();
      const r = pv2.readProject(await api("projects/" + name));
      const base = slug(t).replace(/-/g, "_").replace(/^[^a-z0-9]+/i, "") || "project"; let n = base, k = 2; while (projects.some((x) => x.name === n)) n = `${base}_${k++}`;
      await putJson("projects/" + n, pv2.toDisk(pv2.duplicateProject(r.doc, n, t), r.legacy));
      status(`Copied to "${t}" (${n})`, "ok");
    }
    if (a === "del") {
      if (!hasF("project-delete")) { status("Deleting needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return; }
      if (!confirm(`Delete "${title}"? The file and its measurements/exports move to data/private/deleted (not really deleted).`)) return;
      if (mode === "project" && doc.name === name) clearTimeout(saveTimer), saveTimer = undefined;
      await api("projects/" + name, { method: "DELETE" });
      if (startProject === name && settingsRoute) { try { await putJson("settings", { defaultProject: "", defaultTab: "", ...(hasF("projects-v2") ? { defaultSection: "" } : {}) }); startProject = startTab = startSection = undefined; } catch { /* keep */ } }
      if (store.get("project") === name) store.set("project", "");
      status(`"${title}" moved to data/private/deleted`, "ok");
    }
  } catch (e) { status("Failed: " + (e as Error).message, "bad"); return; }
  await refreshProjects();
  if (inMenu || a === "del") { const st = $("#status")?.textContent ?? ""; const cls = $("#status")?.className ?? ""; showMenu("open"); setTimeout(() => { const el = $("#status"); if (el && st) { el.textContent = st; el.className = cls; } }, 50); }
  else { const st = $("#status")?.textContent ?? ""; shell(); render(); status(st, "ok"); }
}
async function savedItemAction(id: string, a: string, projName?: string) {
  try {
    if (a === "open") { await openSavedItem(id); return enterApp(); }
    const it = pv2.readSavedItem(await api("items/" + id));
    if (a === "edit") { // B3: an electrical item (part) of My items: edit form here, saved on every change
      await ensurePartsFor([it]); const box = $("#miEdit"); if (!box) return;
      box.innerHTML = itemFormHtml(it, it.data?.partId ? partById(it.data.partId, it.data.partCategory) : undefined);
      bindItemForm(box, it, () => { void putJson("items/" + id, pv2.cleanItem(it)).then(() => status(`"${it.name}" saved`, "ok")).catch((e) => status("Save failed: " + (e as Error).message, "bad")); });
      return;
    }
    if (a === "rename") { const t = prompt(`New name for "${it.name}"`, it.name)?.trim(); if (!t) return; it.name = t; await putJson("items/" + id, pv2.cleanItem(it)); status(`Renamed to "${t}"`, "ok"); }
    if (a === "dup") { const c = pv2.copyItem(it, [], { item: id }); c.name = `${it.name} (copy)`; await putJson("items/" + c.id, pv2.cleanItem(c)); status(`Copied: "${c.name}"`, "ok"); }
    if (a === "del") { if (!confirm(`Delete "${it.name}" from My items? The file moves to data/private/deleted.`)) return; await api("items/" + id, { method: "DELETE" }); status(`"${it.name}" moved to data/private/deleted`, "ok"); }
    if (a === "add") {
      if (!projName) { status("Choose a project", "bad"); return; }
      const nid = await addItemTo(projName, it, { item: id }); if (!nid) return;
      const pt = projects.find((x) => x.name === projName)?.title ?? projName;
      status(`"${it.name}" added to "${pt}"`, "ok");
      if (confirm(`"${it.name}" was added to "${pt}". Open that project now?`)) { await openProject(projName, { section: isSection(it.section) ? it.section : undefined, itemId: nid }); return enterApp(); }
    }
  } catch (e) { status("Failed: " + (e as Error).message, "bad"); return; }
  const st = $("#status")?.textContent ?? ""; const cls = $("#status")?.className ?? "";
  showMenu("items"); setTimeout(() => { const el = $("#status"); if (el && st) { el.textContent = st; el.className = cls; } }, 50);
}

// ---------- B1_SHELL (R42): Project tab (items, links) and Item tab ----------
/** B3: section label, also for parts items (section "electrical"). */
const secLabel = (s?: string) => (isSection(s) ? sectionInfo(s).label : s === PART_SECTION ? "Electrical (parts)" : String(s ?? ""));
/** B3: the item whose edit form the Project tab shows. */
let editItemId: string | undefined;
const KIND_LABEL: Record<string, string> = { alternator: "alternator", headunit: "head unit", battery: "battery", box: "box", door: "door speakers", ib: "infinite baffle", amplifier: "amplifier", dsp: "DSP", capacitor: "capacitor", fuse: "fuse", fuseholder: "fuse holder", distribution: "distribution block", cable: "cable", connector: "connector", other: "other" };
function itemSummaryText(it: pv2.Item): string {
  const d = driverById(it.data?.driverId);
  const dn = d ? `${d.brand} ${d.model}` : "no driver chosen";
  if (it.kind === "box") { const ds = it.data?.design; return `${dn} × ${it.data?.drivers ?? 1}${ds ? `, Design new: ${esc(String(ds.topology ?? ds.kind))} ${Math.round(ds.maxW)} × ${Math.round(ds.maxH)} × ${Math.round(ds.maxD)} mm` : ""}`; }
  if (it.kind === "ib") return `${dn} × ${it.data?.count ?? 1}${it.data?.mode ? `, ${it.data.mode === "trunk" ? "trunk IB" : it.data.mode === "true" ? "true IB" : "free air"}` : ""}`;
  if (it.kind === "door") return `${dn} × ${it.data?.count ?? 1}`;
  // B3: parts items: the part and the values typed on the item
  const p = it.data?.partId ? partById(it.data.partId, it.data.partCategory) : undefined;
  const typed = (ITEM_FIELDS[it.kind] ?? []).filter((f) => it.data?.[f.key] !== undefined && it.data?.[f.key] !== "").map((f) => `${f.label.toLowerCase()} ${it.data[f.key] === true ? "yes" : it.data[f.key] === false ? "no" : it.data[f.key]}${f.unit ? " " + f.unit : ""}`);
  return esc([p ? partName(p) : it.data?.partId ? `part ${it.data.partId}` : "", ...typed].filter(Boolean).join(", "));
}
function renderProjectTab() {
  const name = (id: string) => doc.items.find((i) => i.id === id)?.name ?? id;
  const opts = (sel?: string) => doc.items.map((i) => `<option value="${esc(i.id)}" ${i.id === sel ? "selected" : ""}>${esc(i.name)} (${esc(sectionInfo(i.section).label)})</option>`).join("");
  $("#page").innerHTML = `<div style="max-width:1100px">
    <fieldset id="pjHead"><legend>Project: ${esc(doc.title)}</legend>
      <div class="toolbar"><button id="pjRename">Rename project</button><button id="pjDup">Duplicate project</button><button id="pjDel">Delete project</button><button id="pjBom" title="Bill of materials of the whole project: spreadsheet (.xlsx) and CSV">Bill of materials (BOM)…</button>
      <span class="hint">File data/projects/${esc(doc.name)}.json · ${docLegacy ? "older format (one subwoofer box), kept until the project needs more" : "format 2 (items)"}</span></div></fieldset>
    <fieldset id="pjItems"><legend>Items in this project (${doc.items.filter((i) => !pristine.has(i.id)).length})</legend>
      <table id="pjTable"><tr><th>Item</th><th>Section</th><th>What</th><th>Links</th><th></th></tr>
      ${doc.items.map((i) => `<tr data-id="${esc(i.id)}" class="${i.id === activeItem.id ? "sel" : ""}"><td><b>${esc(i.name)}</b>${pristine.has(i.id) ? ' <span class="muted">(opened, not changed yet: not saved)</span>' : ""}</td><td>${esc(secLabel(i.section))}</td><td>${esc(KIND_LABEL[i.kind] ?? i.kind)}: ${itemSummaryText(i)}</td>
        <td>${(i.links ?? []).map((l) => `<span class="link">${l.fromPort ? esc(l.fromPort) + " " : ""}→ ${esc(name(l.to))}${l.toPort ? " " + esc(l.toPort) : ""} <i>(${esc(l.kind)}${l.cableItemId ? ", via " + esc(name(l.cableItemId)) : ""})</i> <button class="link" data-unlink="${esc(l.to)}" data-kind="${esc(l.kind)}" title="Remove this link">✕</button></span>`).join("<br>") || '<span class="muted">none</span>'}</td>
        <td class="acts">${i.section === PART_SECTION ? '<button data-a="edit" class="primary">Edit</button>' : '<button data-a="open" class="primary">Open</button>'}<button data-a="rename">Rename</button><button data-a="dup">Duplicate</button><button data-a="save" title="Save a copy to My items, to add to other projects">Save to My items</button><button data-a="remove">Remove</button></td></tr>`).join("")}</table>
      <div class="hint">Open shows the item in its section; Edit (parts: amplifiers, cable, fuses...) shows its values below. Remove takes it out of this project and keeps a copy in data/private/deleted. A project keeps at least one item.</div></fieldset><div id="pjEdit"></div>
    <fieldset id="pjAdd"><legend>Add an item</legend>
      <div class="row"><label>New item in section</label><select id="pjNewSec">${sectionOptions(section)}</select><button id="pjNew">Add new item</button></div>
      <div class="row"><label>From the parts database</label><button id="pjParts">Browse parts (amplifiers, DSP, capacitors, fuses, cable...)</button></div>
      <div class="row"><label>From My items</label><select id="pjFromItems"><option value="">${hasF("items") ? "loading…" : "needs the updated app server"}</option></select><button id="pjFrom" ${hasF("items") ? "" : "disabled"}>Add a copy</button></div></fieldset>
    <fieldset id="pjLinks"><legend>Link items</legend>
      <div class="toolbar"><select id="lkFrom">${opts(activeItem.id)}</select><input id="lkFromPort" placeholder="port (optional)" style="width:9em"><select id="lkKind">${pv2.LINK_KINDS.map((k) => `<option value="${k}" ${k === "speaker" ? "selected" : ""}>${k}</option>`).join("")}</select>
        <select id="lkTo">${opts(doc.items.find((i) => i.id !== activeItem.id)?.id)}</select><input id="lkToPort" placeholder="port (optional)" style="width:9em"><select id="lkCable"><option value="">no cable item</option>${opts()}</select><button id="lkGo">Link</button></div>
      <div class="hint">A link is a connection from one item to another: <b>power</b>, <b>ground</b>, <b>signal</b>, <b>speaker</b> or <b>remote</b> (turn-on), with optional port names (e.g. +12V, CH1 L) and the cable item that makes it. The <b>System</b> tab shows them as a wiring diagram, sizes the cables (cable calculator) and checks for missing parts; it also has <b>Wire it for me</b> and a Connect control per item.</div></fieldset></div>`;
  $("#pjRename").onclick = () => void projectAction(doc.name, "rename", false);
  $("#pjParts").onclick = () => { tab = "parts"; store.set("tab", tab); shell(); render(); };
  showItemForm();
  $("#pjDup").onclick = () => void projectAction(doc.name, "dup", false);
  $("#pjDel").onclick = () => void projectAction(doc.name, "del", false);
  $("#pjBom").onclick = () => { tab = "bom"; store.set("tab", tab); shell(); render(); };
  document.querySelectorAll<HTMLButtonElement>("#pjTable button[data-a]").forEach((b) => b.onclick = () => void projectItemAction(b.closest("tr")!.dataset.id!, b.dataset.a!));
  document.querySelectorAll<HTMLButtonElement>("#pjTable button[data-unlink]").forEach((b) => b.onclick = () => { pv2.unlinkItems(doc, b.closest("tr")!.dataset.id!, b.dataset.unlink!, b.dataset.kind); void persist(); renderProjectTab(); });
  $("#pjNew").onclick = () => { const s = $<HTMLSelectElement>("#pjNewSec").value as SectionId; const it = makeItem(s, doc.items.map((i) => i.id)); doc.items.push(it); void persist(); enterSection(s, it.id); tab = pickTab(undefined); shell(); render(); status(`Added "${it.name}" (${sectionInfo(s).label})`, "ok"); };
  $("#lkGo").onclick = () => { const v = (sel: string) => $<HTMLInputElement>(sel).value.trim(); const r = pv2.linkItems(doc, v("#lkFrom"), v("#lkTo"), v("#lkKind"), { fromPort: v("#lkFromPort"), toPort: v("#lkToPort"), cableItemId: v("#lkCable") }); if (!r.ok) { status("Not linked: " + r.error, "bad"); return; } for (const i of doc.items) pristine.delete(i.id); void persist(); renderProjectTab(); status("Linked", "ok"); };
  if (hasF("items")) void api("items").then((list: any[]) => {
    const sel = $<HTMLSelectElement>("#pjFromItems"); if (!sel) return;
    sel.innerHTML = list.length ? list.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} (${esc(secLabel(x.section))})</option>`).join("") : `<option value="">My items is empty</option>`; // B3: parts items say Electrical
    $("#pjFrom").onclick = async () => { if (!sel.value) return; try { const it = pv2.readSavedItem(await api("items/" + sel.value)); const c = pv2.addItemToProject(doc, it, { item: sel.value }); await persist(); renderProjectTab(); status(`Added a copy of "${c.name}"`, "ok"); } catch (e) { status("Failed: " + (e as Error).message, "bad"); } };
  }).catch(() => { /* listed as unavailable */ });
}
/** B3: the edit form of the electrical item chosen with Edit (Project tab); the part bundle is loaded first. */
function showItemForm() {
  const box = $("#pjEdit"); const it = doc.items.find((i) => i.id === editItemId);
  if (!box || !it) return;
  const p = it.data?.partId ? partById(it.data.partId, it.data.partCategory) : undefined;
  box.innerHTML = itemFormHtml(it, p);
  bindItemForm(box, it, () => { pristine.delete(it.id); saveProjectSoon(); const tr = document.querySelector(`#pjTable tr[data-id="${CSS.escape(it.id)}"]`); if (tr) { tr.children[0].innerHTML = `<b>${esc(it.name)}</b>`; tr.children[2].innerHTML = `${esc(KIND_LABEL[it.kind] ?? it.kind)}: ${itemSummaryText(it)}`; } });
  if (it.data?.partId && !p) void ensurePartsFor([it]).then(() => { if (partById(it.data.partId, it.data.partCategory) && editItemId === it.id && tab === "project") showItemForm(); });
}
async function projectItemAction(id: string, a: string) {
  const it = doc.items.find((i) => i.id === id); if (!it) return;
  if (a === "edit") { editItemId = id; showItemForm(); $("#pjEdit")?.scrollIntoView({ block: "nearest" }); return; }
  if (a === "open") { if (saveTimer) await persist(); enterSection(isSection(it.section) ? it.section : "subwoofer", it.id); tab = pickTab(tab === "project" ? undefined : tab); void loadMeasurements(measCtx, true); shell(); render(); return; }
  if (a === "rename") { const t = prompt(`New name for the item "${it.name}"`, it.name)?.trim(); if (!t) return; it.name = t; pristine.delete(it.id); await persist(); shell(); render(); return; }
  if (a === "dup") { const c = pv2.duplicateItem(doc, id); if (c) { await persist(); renderProjectTab(); status(`Copied: "${c.name}"`, "ok"); } return; }
  if (a === "save") {
    if (!hasF("items")) { status("Saving to My items needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return; }
    const s = pv2.toSavedItem(it, doc.name); s.name = it.name;
    try { await putJson("items/" + s.id, s); status(`A copy of "${it.name}" is in My items`, "ok"); } catch (e) { status("Failed: " + (e as Error).message, "bad"); }
    return;
  }
  if (a === "remove") {
    if (doc.items.length <= 1) { status("A project keeps at least one item", "bad"); return; }
    if (!confirm(`Remove "${it.name}" from "${doc.title}"? A copy is kept in data/private/deleted.`)) return;
    if (!pristine.has(id)) {
      if (!hasF("trash")) { status("Removing items needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return; }
      try { await putJson(`trash/${doc.name}.item.${id}`, pv2.cleanItem(it)); } catch (e) { status("Failed: " + (e as Error).message, "bad"); return; }
    }
    pv2.removeItem(doc, id); pristine.delete(id);
    if (activeItem.id === id) enterSection(section);
    await persist(); shell(); render(); status(`Removed "${it.name}"`, "ok");
  }
}
function renderItemTab() {
  const it = activeItem;
  $("#page").innerHTML = `<div style="max-width:900px"><fieldset id="itHead"><legend>Single item: ${esc(it.name)}</legend>
    <table class="kv"><tr><td>Section</td><td>${esc(sectionInfo(it.section).label)}</td></tr><tr><td>What</td><td>${esc(KIND_LABEL[it.kind] ?? it.kind)}: ${itemSummaryText(it)}</td></tr>
    <tr><td>Saved</td><td>${itemSaved ? `in My items (data/items/${esc(it.id)}.json), saved automatically` : '<span class="warn">not yet: press Save to My items</span>'}</td></tr></table>
    <div class="toolbar"><button id="itRename">Rename</button><button id="itBom" title="What this item needs (materials, parts) as a spreadsheet">Bill of materials (BOM)…</button>${itemSaved ? "" : '<button class="primary" id="itSave">Save to My items</button>'}</div></fieldset>
    <fieldset id="itAdd"><legend>Add to a project</legend><div class="row"><label>Project</label><select id="itProj">${projects.map((p) => `<option value="${esc(p.name)}">${esc(p.title || p.name)}</option>`).join("")}</select><button id="itAddGo">Add a copy</button></div>
      <div class="hint">The project gets a copy; this item stays as it is (and in My items once saved).</div></fieldset></div>`;
  $("#itRename").onclick = async () => { const t = prompt(`New name for "${it.name}"`, it.name)?.trim(); if (!t) return; it.name = t; doc.title = t; if (it.kind === "box") project.title = t; pristine.delete(it.id); if (itemSaved) await persist(); shell(); render(); };
  if ($("#itSave")) $("#itSave").onclick = () => void saveItemToMyItems();
  $("#itBom").onclick = () => { tab = "bom"; store.set("tab", tab); shell(); render(); };
  $("#itAddGo").onclick = async () => {
    const pn = $<HTMLSelectElement>("#itProj").value; if (!pn) return;
    try {
      if (itemSaved && saveTimer) await persist();
      const nid = await addItemTo(pn, it, itemSaved ? { item: it.id } : undefined); if (!nid) return;
      const pt = projects.find((x) => x.name === pn)?.title ?? pn;
      status(`"${it.name}" added to "${pt}"`, "ok");
      if (confirm(`"${it.name}" was added to "${pt}". Open that project now?${itemSaved ? "" : "\n\n(This single item is not saved to My items.)"}`)) { await openProject(pn, { section: isSection(it.section) ? it.section : undefined, itemId: nid }); shell(); render(); }
    } catch (e) { status("Failed: " + (e as Error).message, "bad"); }
  };
}

// ---------- B1_SHELL (R37): Door speaker and Infinite baffle sections (no box) ----------
/** Driver choice for a section without a box: every driver of a fitting size (data not needed for a simulation here). */
function sectionDriverSelect(sel: string | undefined, s: SectionId) {
  const cur = driverById(sel); if (cur) sel = cur.id;
  const list = drivers.filter((d) => (driverFitsSection(d, s) && !shadow.has(d.id)) || d.id === sel).sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
  const r = sectionInfo(s).sizeIn!;
  // B3_PARTS_DB: car speakers (car-drivers library) in their own group first in the door section; simulatable ones first
  const car = s === "door" ? list.filter((d) => d.library === "car-drivers").sort((a, b) => Number(!!a.incomplete) - Number(!!b.incomplete) || (a.brand + a.model).localeCompare(b.brand + b.model)) : [];
  const rest = list.filter((d) => !car.includes(d));
  const o = (d: Driver) => `<option value="${esc(d.id)}" ${d.id === sel ? "selected" : ""}>${esc(d.brand)} ${esc(d.model)}${d.type ? ` (${esc(typeLabel(d.type).toLowerCase())}${d.sizeIn ? ", " + d.sizeIn + " in" : ""})` : ""}${d.private ? " (private)" : ""}${d.library ? ` [${esc(d.library)}]` : ""}${d.incomplete ? " (no T/S)" : ""}</option>`;
  return `<div class="row"><label>Driver (${r[0]} to ${r[1]} in, ${list.length})</label><select data-key="driverId" id="secDrv"><option value="">– choose –</option>${car.length ? `<optgroup label="Car speakers: midbass, midrange, coaxial, component sets (${car.length})">${car.map(o).join("")}</optgroup><optgroup label="Other drivers (${rest.length})">${rest.map(o).join("")}</optgroup>` : rest.map(o).join("")}</select></div>`;
}
function driverFactsHtml(d?: Driver): string {
  if (!d) return `<p class="muted">Choose a driver to see its published values.</p>`;
  const p = d.params; const mm = (v?: number) => (v ? `${f1(v * 1000, 0)} mm` : "–");
  const rows: [string, string][] = [["Size", sizeOf(d) ? `${sizeOf(d)} in` : "–"], ["Fs", p.fs ? `${f1(p.fs)} Hz` : "–"], ["Qts", p.Qts !== undefined ? f1(p.Qts, 2) : "–"], ["Vas", p.Vas ? `${f1(p.Vas * 1000, 1)} L` : "–"],
    ["Xmax", p.Xmax ? `${f1(p.Xmax * 1000, 1)} mm` : "–"], ["Sensitivity 1 W / 1 m", p.sens1W ? `${f1(p.sens1W)} dB` : "–"], ["Power (RMS)", (d.rmsW ?? p.Pe) ? `${d.rmsW ?? p.Pe} W` : "–"], ["Impedance", p.Znom ? `${p.Znom} Ω` : "–"],
    ["Outer diameter", mm(p.dia)], ["Cut-out", mm(p.cutout)], ["Mounting depth", mm(p.depth)]];
  return `<table class="kv" id="drvFacts">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${esc(v)}</td></tr>`).join("")}</table><div class="hint">Published values from ${d.library ? `the ${esc(d.library)} library` : "your driver entry"} (Drivers tab: ${esc(d.brand)} ${esc(d.model)}). A dash = not published.</div>`;
}
function bindNoBoxItem() {
  const it = activeItem; const data = it.data;
  const sel = $<HTMLSelectElement>("#secDrv"); if (sel) sel.onchange = () => { data.driverId = sel.value; saveProjectSoon(); render(); };
  const cnt = $<HTMLInputElement>("#secCount"); if (cnt) cnt.onchange = () => { data.count = Math.max(1, Math.round(Number(cnt.value) || 1)); saveProjectSoon(); };
  const nt = $<HTMLTextAreaElement>("#secNotes"); if (nt) nt.onchange = () => { data.notes = nt.value; saveProjectSoon(); };
}
/** B2_SECTIONS: context for the Door and Infinite baffle screens (app/src/ui/ibui.ts). */
const secCtx = (sec: SectionId): SecCtx => ({ driverById, air: () => air, save: saveProjectSoon, rerender: () => render(), status, driverSelect: (sel) => sectionDriverSelect(sel, sec), facts: driverFactsHtml });
function renderDoor() { renderDoorPage($("#page"), activeItem, secCtx("door")); }
// ---------- B3_PARTS_DB (R40): Parts tab context ----------
const partsCtx: PartsCtx = {
  status,
  projects: () => projects.map((p) => ({ name: p.name, title: p.title || p.name })),
  current: () => (mode === "project" ? doc.name : undefined),
  addToProject: async (x, pn) => {
    try {
      const it = pv2.newItem(x.section, x.kind, x.name, x.data, mode === "project" && pn === doc.name ? doc.items.map((i) => i.id) : []);
      if (mode === "project" && pn === doc.name) {
        if (docLegacy && !hasF("projects-v2")) { status("Adding a part to this project needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return undefined; }
        doc.items.push(it); editItemId = it.id; if (!(await persist())) { doc.items.pop(); return undefined; } return it.id;
      }
      return await addItemTo(pn, it);
    } catch (e) { status("Could not add: " + (e as Error).message, "bad"); return undefined; }
  },
  saveToMyItems: async (x) => {
    if (!hasF("items")) { status("Saving to My items needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return false; }
    const it = pv2.newItem(x.section, x.kind, x.name, x.data);
    try { await putJson("items/" + it.id, { ...pv2.cleanItem(it), format: 2, type: "item" }); return true; } catch (e) { status("Could not save: " + (e as Error).message, "bad"); return false; }
  },
  openDrivers: (type) => { Object.assign(dFilter, NO_FILTERS, { type, sub: type === "subwoofer" }); dPage = 1; tab = "drivers"; store.set("tab", tab); shell(); render(); },
  driverCount: (type) => drivers.filter((d) => driverType(d) === type && !shadow.has(d.id)).length,
};
void setPartsCategory;
function renderIB() { renderIBPage($("#page"), activeItem, secCtx("ib")); }

// ---------- B4_SYSTEM_UI (R41, R44): System tab, cable calculator, wiring diagram + missing-part alert on save ----------
let cableRecs: any[] | undefined;
/** Lookups for the cable / diagram engines: parts records (loaded bundles), drivers, cable products. */
const sysLookups = (): CableLookups => ({ part: (id, cat) => partById(id, cat), driver: (id) => driverById(id), cableRecords: cableRecs });
/** The project as the engines see it: items opened in memory only (a section just looked at) are left out. */
const viewDoc = (): pv2.ProjectDoc => (pristine.size ? { ...doc, items: doc.items.filter((i) => !pristine.has(i.id)) } : doc);
const gates = new Map<string, GateState>();
let saveTrigger: Trigger = "auto";
const lastSvg = new Map<string, string>();
let lastIssues: SystemIssue[] = [];
/** Save without marking the shown section item as changed (System tab edits). */
function sysSave() { if (activeItem && !doc.items.includes(activeItem)) enterSection(section); clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { void persist(); }, 500); }
async function explicitSave(): Promise<boolean> {
  if (mode === "item") return persist();
  saveTrigger = "explicit"; const ok = await persist(); saveTrigger = "auto"; return ok;
}
/** The R44 listener: every project save. Writes exports/system.svg (when it changed), shows / refreshes / removes the alert. */
function onReport(rep: SystemReport, d: pv2.ProjectDoc) {
  if (mode !== "project" || d.name !== doc.name) return;
  if (lastSvg.get(d.name) !== rep.svg) {
    lastSvg.set(d.name, rep.svg);
    void api(`projects/${d.name}/exports/system.svg`, { method: "PUT", body: new Blob([rep.svg], { type: "image/svg+xml" }) }).catch((e) => { lastSvg.delete(d.name); console.warn("system.svg not saved:", e); });
  }
  const trig = saveTrigger; saveTrigger = "auto";
  const r = alertDecision(gates.get(d.name) ?? {}, rep.issues, trig); gates.set(d.name, r.state); lastIssues = rep.issues;
  if (alertOpen()) { if (trig === "explicit") openAlert(rep.issues, false); else showAlert(rep.issues); }
  else if (r.show) openAlert(rep.issues, false, undefined, trig === "auto");
  if (tab === "system") refreshSystemDiagram(sysCtx, rep.svg);
}
registerSystemReport(() => sysLookups(), (rep, d) => onReport(rep, d));
/** The alert's baseline when a project is opened (no alert then). */
function primeGate() {
  closeAlert();
  if (mode !== "project") return;
  try { const rep = systemReport(viewDoc(), sysLookups()); lastIssues = rep.issues; gates.set(doc.name, alertDecision(gates.get(doc.name) ?? {}, rep.issues, "open").state); } catch (e) { console.warn("system check failed:", e); }
}
const itemMaker: ItemMaker = (kind, role, name) => {
  const taken = doc.items.map((i) => i.id);
  if (kind === "box") { const it = makeItem("subwoofer", taken); it.name = name; return it; }
  if (kind === "battery") return plainItem("battery", taken, name);
  if (kind === "other" && (role === "headunit" || role === "ground")) return plainItem(role, taken, name);
  return plainKindItem(kind, name, taken, role ? { role } : {});
};
let leaveContinue: (() => void) | undefined;
function openAlert(issues: SystemIssue[], leaving: boolean, cont?: () => void, compact = false) {
  leaveContinue = leaving ? cont : undefined;
  showAlert(issues, {
    leaving, compact,
    onAdd: (issue) => void (async () => {
      leaveContinue = undefined;
      const cv = cableFor(viewDoc(), sysLookups());
      const r = applyIssue(doc, issue, itemMaker, cv);
      for (const it of r.added) pristine.delete(it.id);
      if (r.changed) { await persist(); if (mode === "project") { const rep = systemReport(viewDoc(), sysLookups()); lastIssues = rep.issues; showAlert(rep.issues); } }
      if (!r.changed && r.focus) { setSystemFocus(r.focus); tab = "system"; store.set("tab", tab); }
      shell(); render(); status(r.message, r.changed ? "ok" : "warn");
    })(),
    onNotNow: () => { gates.set(doc.name, dismissAlert(gates.get(doc.name) ?? {}, lastIssues)); const c = leaveContinue; leaveContinue = undefined; c?.(); },
    onOpenSystem: () => { if (mode !== "project") return; tab = "system"; store.set("tab", tab); shell(); render(); },
  });
  lastIssues = issues;
}
/** Leaving the project (menu, another project): the alert when something is missing and it was not put off with Not now.
 * Returns true to go on now; false = the alert is shown (Not now goes on with cont). */
async function leaveCheck(cont: () => void): Promise<boolean> {
  if (mode !== "project") return true;
  try {
    const rep = systemReport(viewDoc(), sysLookups());
    const r = alertDecision(gates.get(doc.name) ?? {}, rep.issues, "leave"); gates.set(doc.name, r.state);
    if (!r.show) { closeAlert(); return true; }
    openAlert(rep.issues, true, cont); return false;
  } catch { return true; }
}
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); if ($("#page")) void explicitSave(); } });
const sysCtx: SysCtx = {
  doc: () => doc, skip: () => pristine, lookups: sysLookups, save: sysSave, saveNow: explicitSave, status,
  openItem: (id) => void (async () => { const it = doc.items.find((i) => i.id === id); if (!it || !isSection(it.section)) return; if (saveTimer) await persist(); enterSection(it.section, it.id); tab = pickTab(undefined); void loadMeasurements(measCtx, true); shell(); render(); })(),
  openParts: (cat) => { if (cat) setPartsCategory(cat); tab = "parts"; store.set("tab", tab); shell(); render(); },
  summary: (it) => itemSummaryText(it), kindLabel: (k) => KIND_LABEL[k] ?? k,
  editForm: (box, it, onChange) => {
    const p = it.data?.partId ? partById(it.data.partId, it.data.partCategory) : undefined;
    box.innerHTML = itemFormHtml(it, p); bindItemForm(box, it, () => { pristine.delete(it.id); onChange(); });
    if (it.data?.partId && !p) void ensurePartsFor([it]).then(() => { if (partById(it.data.partId, it.data.partCategory) && box.isConnected) sysCtx.editForm(box, it, onChange); });
  },
  removeItem: async (it) => {
    if (pristine.has(it.id)) return true;
    if (!hasF("trash")) { status("Removing items needs the updated app server: run scripts/restart_app.sh on the host", "bad"); return false; }
    try { await putJson(`trash/${doc.name}.item.${it.id}`, pv2.cleanItem(it)); return true; } catch (e) { status("Failed: " + (e as Error).message, "bad"); return false; }
  },
  cableRecords: () => cableRecs,
  loadCableRecords: async () => { try { cableRecs = await loadParts("cable"); } catch { /* products not shown */ } },
  saveToMyItems: (x) => partsCtx.saveToMyItems(x as any),
  rerender: () => render(),
  openBom: () => { tab = "bom"; store.set("tab", tab); shell(); render(); },
};
/** System tab of a single item (no project): the quick calculator. */
function renderItemSystem() {
  $("#page").innerHTML = `<div style="max-width:1100px"><fieldset id="sysItemOnly"><legend>System</legend><p class="hint">A single item has no system to wire: open a project for the wiring, the diagram and the missing-part check. The quick cable calculator works on its own:</p><div id="sysQuick"></div></fieldset></div>`;
  renderQuickCalc($("#sysQuick"), sysCtx);
}
/** Build a single item > Cable calculator: the quick calculator on its own page. */
function showQuickCalcPage() {
  view?.dispose(); view = undefined; closeAlert();
  $("#app").innerHTML = `<div class="menu" id="qcPage"><div class="mhead"><button id="toMenu" class="menubtn">☰ Menu</button><div class="wtext small">Audio Builder</div><span id="status" class="status"></span></div>
    <h2 class="mq">Cable calculator: one amplifier, one power cable</h2><fieldset><legend>Quick calculator</legend><div id="sysQuick"></div></fieldset>
    <div class="hint">Same maths as the System tab's cable calculator (Help: Cable calculator). For several amplifiers, a distribution block, capacitors and speaker cable, build a project and use its System tab.</div></div>`;
  $("#toMenu").onclick = () => showMenu();
  renderQuickCalc($("#sysQuick"), sysCtx);
}
// ---------- B5_BOM (R42): bill of materials, linked spreadsheet ----------
/** app/package.json "version" (shown on the spreadsheet's Info sheet). */
const APP_VERSION = "0.1.0";
let boardCat: { sheets: any[]; kerfMmDefault: number; edgeTrimMmDefault: number; sources?: string[] } | undefined;
let plyBoardCat: { sheets: any[]; sources?: string[] } | undefined; // B7: plywood sheet catalogue (/api/boards/plywood)
/** Panels and kind of a box / IB item, from the same source the Boards tab shows first (Design new box, else the saved box). */
function bomBox(it: pv2.Item): BoxSource | undefined {
  if (it.kind !== "box" && it.kind !== "ib") return undefined;
  const active = it.id === activeItem?.id;
  let srcs: BoardSource[];
  try { srcs = boardSourcesFor((it.kind === "box" ? it.data : project) as Project, it, active); } catch (e) { return { label: it.name, panels: [], error: "Panels could not be worked out: " + (e as Error).message }; }
  const s = srcs[0]; if (!s) return undefined;
  const d = it.data ?? {};
  if (it.kind === "ib") return { label: s.label, panels: s.panels, error: s.error, kind: "ib", material: s.material, grain: s.grain };
  const ds = s.key === "design" ? { ...defaultDesign(), ...d.design } : undefined;
  const kind = ds ? (ds.topology === "pr" ? "pr" : ds.topology === TL_ID ? "tl" : ds.isobaric ? "isobaric" : ds.topology && ds.topology !== "sealed" && ds.topology !== "vented" ? String(ds.topology) : ds.kind) : d.kind;
  const port = ds ? { shape: ds.portShape, count: ds.portCount, d: ds.portShape === "round" ? ds.portD : undefined } : d.port ? { shape: d.port.shape, count: d.port.count, d: d.port.shape === "round" ? d.port.d : undefined, lengthMm: d.port.length } : undefined;
  return { label: s.label, panels: s.panels, error: s.error, kind, port, prId: ds?.topology === "pr" ? ds.prId : undefined, prCount: ds?.topology === "pr" ? ds.prCount : undefined, material: s.material, grain: s.grain };
}
const bomLookups = (): BomLookups => ({ ...sysLookups(), box: bomBox, sheets: boardCat?.sheets ?? [], plySheets: plyBoardCat?.sheets, kerfMm: boardCat?.kerfMmDefault, trimMm: boardCat?.edgeTrimMmDefault });
function bomSources(b: ReturnType<typeof currentBom>): BomSourceNote[] {
  const out: BomSourceNote[] = [];
  const libs = new Set<string>(); let own = false;
  for (const l of b.groups.flatMap((g) => g.lines)) if (l.category === "driver" || l.category === "passive radiator") { const d = driverById(l.partId); if (d?.library) libs.add(d.library); else if (d) own = true; }
  for (const id of libs) { const L = libraries.find((x) => x.source === id); out.push({ name: `Driver library: ${L?.title ?? id}`, licence: L?.licence, attribution: L?.attribution, url: L?.url }); }
  if (own) out.push({ name: "Your own driver entries", attribution: "data/drivers and data/private/drivers (values with the sources entered on each driver)" });
  const cats = new Set(b.parts.map((p) => p.category).filter((c) => PART_CATEGORIES.some((x) => x.id === c)));
  for (const c of cats) { const lab = PART_CATEGORIES.find((x) => x.id === c)!.label; out.push({ name: `Parts: ${lab}`, licence: "CC BY 4.0", attribution: `Audio_Builder car audio parts database, ${lab} (CC BY 4.0); values (numbers only) credited to the maker page or retailer listing in each record's sources`, url: "https://creativecommons.org/licenses/by/4.0/" }); }
  if (b.parts.some((p) => p.category === "MDF sheet")) out.push({ name: "MDF sheet catalogue", attribution: `${(boardCat as any)?.generic ? "data/boards/generic_sheets.json (generic sizes, no prices)" : "local supplier catalogue data/private/boards/mdf_sheets_au.json (sizes and prices read on each supplier's site on the date shown)"}${boardCat?.sources?.length ? "; sources: " + boardCat.sources.join(", ") : ""}` });
  if (b.parts.some((p) => p.category === "Plywood sheet")) out.push({ name: "Plywood sheet catalogue", attribution: `${(plyBoardCat as any)?.generic ? "data/boards/generic_sheets.json (generic sizes, no prices)" : "local supplier catalogue data/private/boards/plywood_sheets_au.json (sizes and prices read on each supplier's site on the date shown)"}${plyBoardCat?.sources?.length ? "; sources: " + plyBoardCat.sources.join(", ") : ""}` });
  return out;
}
const bomCtx: BomCtx = {
  doc: () => doc, skip: () => pristine, lookups: bomLookups,
  prepare: async () => {
    const jobs: Promise<unknown>[] = [ensurePartsFor(doc.items)];
    if (!boardCat) jobs.push(api("boards").then((c: any) => { boardCat = c; }).catch(() => { /* no sheets: the BOM says so */ }));
    if (!plyBoardCat) jobs.push(api("boards/plywood").then((c: any) => { plyBoardCat = c; }).catch(() => { /* older server: the BOM says the plywood sheets are not loaded */ }));
    if (!cableRecs) jobs.push(sysCtx.loadCableRecords());
    await Promise.all(jobs);
  },
  save: () => { if (mode === "item" && !itemSaved) { status("Kept for now; press Save to My items to keep this item and its BOM changes", "warn"); return; } sysSave(); },
  status, mode: () => mode,
  exportName: () => (mode === "project" ? doc.name : itemSaved ? project.name : undefined),
  putExport: async (name, body, type) => { const base = mode === "project" ? doc.name : project.name; const r: any = await api(`projects/${base}/exports/${name}`, { method: "PUT", body: new Blob([body as BlobPart], { type }) }); return String(r.path ?? name).replace(/^.*\/data\//, "data/"); },
  appVersion: APP_VERSION, sources: bomSources,
  openSystem: () => { if (mode !== "project") return; tab = "system"; store.set("tab", tab); shell(); render(); },
};
(window as any).__abBom = () => { const b = currentBom(bomCtx); return JSON.parse(JSON.stringify({ total: b.total, priced: b.priced, count: b.count, groups: b.groups.map((g) => ({ id: g.id, subtotal: g.subtotal, lines: g.lines.map((l) => ({ key: l.key, item: l.item, qty: l.qty, calcQty: l.calcQty, unitPrice: l.unitPrice, total: l.total, overridden: l.overridden })) })), missing: b.missing.map((m) => m.key), sparePct: b.sparePct, overrides: doc.bomOverrides ?? null })); };

// read-only hook for the headless dry runs: the engines' view of the open project
(window as any).__abSystem = () => { const v = viewDoc(); const cv = cableFor(v, sysLookups()); return { result: cv.result, issues: systemReport(v, sysLookups()).issues.map((i) => ({ id: i.id, severity: i.severity, label: i.suggestion.label })), gate: gates.get(doc.name), alert: alertOpen(), doc: JSON.parse(JSON.stringify(v)) }; };

// ---------- boot (B1_SHELL, R43: welcome 3 s, then the start menu; ?skipWelcome=1 opens straight on the last place, as before
// B1, for the headless dry runs; ?skipWelcome=menu skips only the welcome) ----------
(async () => {
  const skip = new URLSearchParams(location.search).get("skipWelcome");
  if (skip === "1") { shell(); if (await loadAll()) await continueLast(); shell(); render(); return; }
  const loading = loadAll();
  if (skip !== "menu") await showWelcome();
  await loading; showMenu();
})();
export { };
