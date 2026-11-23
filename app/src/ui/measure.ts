// Measurements panel (REW imports): import, list, show/hide on the plots, response offset, and the box fit (Fix tab). A5_REW.
import { Air } from "../engine/air";
import { complete, Driver, FullParams } from "../engine/driver";
import { fitBox, BoxFit } from "../engine/boxfit";
import { CoilWiring, convertWiring, interpLog, WIRING_TEXT } from "../engine/measure";
import { portArea } from "../engine/port";
import { MeasKind, parseMeasurement } from "../io/rew";
import { $, esc, f1 } from "./dom";
import { MeasuredBox, Project, toPort } from "./model";
import { Series } from "./plot";

export type MeasWhat = "driver_free_air" | "driver_added_mass" | "driver_closed_box" | "driver_in_box" | "car_seat" | "nearfield_cone" | "nearfield_port" | "other";
export const WHAT_TEXT: Record<MeasWhat, string> = {
  driver_free_air: "Driver in free air", driver_added_mass: "Driver in free air with added mass", driver_closed_box: "Driver in a known sealed test box",
  driver_in_box: "Driver in its box (impedance)", car_seat: "Box in the car, mic at the seat", nearfield_cone: "Near-field, mic at the cone", nearfield_port: "Near-field, mic at the port mouth", other: "Other",
};
export interface Measurement {
  id: string; kind: MeasKind; what: MeasWhat; date: string; notes: string; jig: string; wiring: CoilWiring; drivers: number; driversWired?: "parallel" | "series";
  f: number[]; mag: number[]; phase?: number[]; fileName: string; format: string; header: Record<string, string>;
  show: boolean; offsetDb: number; addedMassG?: number; boxL?: number; created?: string;
}
export interface MeasCtx {
  api: (path: string, init?: RequestInit) => Promise<any>; status: (msg: string, cls?: string) => void;
  project: () => Project; driver: () => Driver | undefined; air: () => Air;
  redraw: () => void;                              // redraw the plots of the current tab
  applyFit?: (m: MeasuredBox) => void; undoFit?: () => void; clearFit?: () => void; // Fix tab only
}

let list: Measurement[] = []; let loadedFor = ""; let fitShown: { id: string; fit: BoxFit } | undefined;
let refSpl: { f: number[]; y: number[] } | undefined; // model curve the "Align" button matches to
const OVERLAY = ["#ff4fd8", "#00e5ff", "#c6ff00", "#ffab40", "#b388ff", "#69f0ae"];
const fitOpts = { meas: "", driverWiring: "same" as CoilWiring | "same", QL: true, QA: false, QP: true, Re: true };

export const measurements = () => list;
export async function loadMeasurements(ctx: MeasCtx, force = false) {
  const name = ctx.project().name;
  if (!force && loadedFor === name) return;
  try { list = (await ctx.api(`projects/${name}/measurements`)) as Measurement[]; } catch { list = []; }
  loadedFor = name; if (fitShown && !list.some((m) => m.id === fitShown!.id)) fitShown = undefined;
}
export function setReference(f: number[], y: number[]) { refSpl = { f, y }; }

/** Measured curves to draw on a plot: impedance → the impedance plot; response → the loudness plots (with each one's offset). */
export function overlaySeries(kind: MeasKind): Series[] {
  const out: Series[] = [];
  list.filter((m) => m.kind === kind && m.show).forEach((m, i) => out.push({ name: `Measured: ${m.notes || WHAT_TEXT[m.what]}${kind === "response" && m.offsetDb ? ` (${m.offsetDb > 0 ? "+" : ""}${m.offsetDb.toFixed(1)} dB)` : ""}`, x: m.f, y: kind === "response" ? m.mag.map((v) => v + (m.offsetDb || 0)) : m.mag, color: OVERLAY[i % OVERLAY.length], dash: "2 3", width: 2 }));
  if (kind === "impedance" && fitShown && list.some((m) => m.id === fitShown!.id && m.show)) out.push({ name: `Fitted model (${f1(fitShown.fit.rmsPct, 1)} % rms)`, x: fitShown.fit.model.f, y: fitShown.fit.model.zmag, color: "#ffffff", dash: "8 3", width: 1.5 });
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);
const imp = { kind: "auto", what: "driver_in_box" as MeasWhat, wiring: "single" as CoilWiring, date: today(), notes: "", jig: "", drivers: 1, driversWired: "parallel" as "parallel" | "series" };

/** Render the measurements panel into `host`. `withFit` = Fix tab (box fitting). */
export function renderMeasPanel(host: HTMLElement | null, ctx: MeasCtx, withFit: boolean) {
  if (!host) return;
  const p = ctx.project();
  const row = (m: Measurement) => `<tr data-mid="${esc(m.id)}"><td><input type="checkbox" class="mshow" ${m.show ? "checked" : ""} title="Show on the plots"></td>
    <td>${m.kind === "impedance" ? "Impedance" : "Response"}</td><td><select class="mwhat">${Object.entries(WHAT_TEXT).map(([k, t]) => `<option value="${k}" ${k === m.what ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></td>
    <td>${esc(m.date)}</td><td><input class="mnotes" value="${esc(m.notes)}" placeholder="notes" style="width:11em"></td>
    <td class="muted" title="${esc(m.jig)}">${esc(WIRING_TEXT[m.wiring] ?? "")}${m.drivers > 1 ? `, ${m.drivers} drivers` : ""}<br>${esc(m.fileName)} · ${m.f.length} pts ${f1(m.f[0])}-${f1(m.f[m.f.length - 1], 0)} Hz${m.phase ? "" : " · no phase"}</td>
    <td>${m.kind === "response" ? `<input type="number" step="0.5" class="moff" value="${m.offsetDb || 0}" style="width:5em" title="Shift this curve up/down (dB). REW SPL is uncalibrated unless you calibrated it."> dB <button class="malign" title="Shift so it matches the model's level between 40 and 100 Hz">Align</button>` : ""}</td>
    <td><button class="mdel" title="Remove (kept in data/private/deleted)">Delete</button></td></tr>`;
  const imps = list.filter((m) => m.kind === "impedance");
  if (!fitOpts.meas || !imps.some((m) => m.id === fitOpts.meas)) fitOpts.meas = (imps.find((m) => m.what === "driver_in_box") ?? imps[0])?.id ?? "";
  const mb = p.measuredBox;
  host.innerHTML = `<h2>Measurements (REW)</h2>
  <div class="hint">Import sweeps exported from Room EQ Wizard (File → Export → Export measurement as text) or .frd / .zma files. Measured curves are drawn dotted on the impedance and loudness plots. Step-by-step guide: Help tab, "Measuring with REW".</div>
  ${list.length ? `<table id="mlist"><tr><th>Show</th><th>Kind</th><th>What was measured</th><th>Date</th><th>Notes</th><th>Wiring · file</th><th>Level</th><th></th></tr>${list.map(row).join("")}</table>` : '<p class="muted">No measurements in this project yet.</p>'}
  <fieldset id="mimp"><legend>Import a measurement</legend>
    <div class="row"><label>What was measured</label><select id="mWhat">${Object.entries(WHAT_TEXT).map(([k, t]) => `<option value="${k}" ${k === imp.what ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="u"></span></div>
    <div class="row"><label>Kind</label><select id="mKind"><option value="auto" ${imp.kind === "auto" ? "selected" : ""}>Detect from the file</option><option value="impedance" ${imp.kind === "impedance" ? "selected" : ""}>Impedance (ohms)</option><option value="response" ${imp.kind === "response" ? "selected" : ""}>Frequency response (dB)</option></select><span class="u"></span></div>
    <div class="row" title="Dual voice coil drivers: how the coils were connected during this sweep"><label>Voice coils during the sweep</label><select id="mWiring">${Object.entries(WIRING_TEXT).map(([k, t]) => `<option value="${k}" ${k === imp.wiring ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="u"></span></div>
    <div class="row" title="Drivers connected to the jig during an in-box sweep (1 = one driver measured on its own)"><label>Drivers connected during the sweep</label><input type="number" id="mDrivers" min="1" step="1" value="${imp.drivers}"><span class="u"></span></div>
    <div class="row" title="Only matters when more than one driver was connected"><label>If several: wired to each other in</label><select id="mDW"><option value="parallel" ${imp.driversWired === "parallel" ? "selected" : ""}>parallel</option><option value="series" ${imp.driversWired === "series" ? "selected" : ""}>series</option></select><span class="u"></span></div>
    <div class="row"><label>Date measured</label><input type="date" id="mDate" value="${esc(imp.date)}"><span class="u"></span></div>
    <div class="row"><label>Notes</label><input id="mNotes" value="${esc(imp.notes)}" placeholder="e.g. port open, 1 m from the box"><span class="u"></span></div>
    <div class="row"><label>Mic / jig notes</label><input id="mJig" value="${esc(imp.jig)}" placeholder="e.g. UMIK-1, 100 Ω sense resistor, open+short cal"><span class="u"></span></div>
    <div class="row"><label>File(s)</label><input type="file" id="mFile" multiple accept=".txt,.frd,.zma,.dat,.csv"><span class="u"></span></div>
    <div id="mRep"></div></fieldset>
  ${withFit ? fitPanelHtml(p, imps, mb) : ""}`;
  // list events
  host.querySelectorAll<HTMLTableRowElement>("#mlist tr[data-mid]").forEach((tr) => {
    const m = list.find((x) => x.id === tr.dataset.mid)!;
    const save = async () => { try { await ctx.api(`projects/${p.name}/measurements/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }); } catch (e) { ctx.status("Saving the measurement failed: " + (e as Error).message, "bad"); } };
    tr.querySelector<HTMLInputElement>(".mshow")!.onchange = (e) => { m.show = (e.target as HTMLInputElement).checked; save(); ctx.redraw(); };
    tr.querySelector<HTMLSelectElement>(".mwhat")!.onchange = (e) => { m.what = (e.target as HTMLSelectElement).value as MeasWhat; save(); renderMeasPanel(host, ctx, withFit); };
    tr.querySelector<HTMLInputElement>(".mnotes")!.onchange = (e) => { m.notes = (e.target as HTMLInputElement).value; save(); ctx.redraw(); };
    const off = tr.querySelector<HTMLInputElement>(".moff"); if (off) off.onchange = () => { m.offsetDb = parseFloat(off.value) || 0; save(); ctx.redraw(); };
    const al = tr.querySelector<HTMLButtonElement>(".malign"); if (al) al.onclick = () => {
      if (!refSpl) { ctx.status("No model curve to align to: analyse first.", "warn"); return; }
      let s = 0, n = 0; for (let i = 0; i < m.f.length; i++) { const f = m.f[i]; if (f < 40 || f > 100) continue; const r = interpLog(refSpl.f, refSpl.y, f); if (isFinite(r)) { s += r - m.mag[i]; n++; } }
      if (!n) { ctx.status("The measurement has no points between 40 and 100 Hz.", "warn"); return; }
      m.offsetDb = Math.round((s / n) * 10) / 10; save(); renderMeasPanel(host, ctx, withFit); ctx.redraw();
    };
    tr.querySelector<HTMLButtonElement>(".mdel")!.onclick = async () => {
      if (!confirm(`Delete measurement "${m.notes || WHAT_TEXT[m.what]}" (${m.fileName})? It is kept in data/private/deleted.`)) return;
      await ctx.api(`projects/${p.name}/measurements/${m.id}`, { method: "DELETE" }); list = list.filter((x) => x !== m); renderMeasPanel(host, ctx, withFit); ctx.redraw();
    };
  });
  // import
  const keep = () => { imp.what = $<HTMLSelectElement>("#mWhat").value as MeasWhat; imp.kind = $<HTMLSelectElement>("#mKind").value; imp.wiring = $<HTMLSelectElement>("#mWiring").value as CoilWiring; imp.date = $<HTMLInputElement>("#mDate").value || today(); imp.notes = $<HTMLInputElement>("#mNotes").value; imp.jig = $<HTMLInputElement>("#mJig").value; imp.drivers = Math.max(1, Math.round(parseFloat($<HTMLInputElement>("#mDrivers").value) || 1)); imp.driversWired = $<HTMLSelectElement>("#mDW").value as "parallel" | "series"; };
  host.querySelectorAll("#mimp select, #mimp input:not([type=file])").forEach((el) => el.addEventListener("change", keep));
  $<HTMLInputElement>("#mFile").onchange = async (e) => {
    keep(); const files = Array.from((e.target as HTMLInputElement).files ?? []); const rep: string[] = [];
    for (const file of files) {
      try {
        const m = await importOne(ctx, await file.text(), file.name, imp.kind === "auto" ? undefined : (imp.kind as MeasKind), { what: imp.what, wiring: imp.wiring, date: imp.date, notes: imp.notes || file.name.replace(/\.[^.]+$/, ""), jig: imp.jig, drivers: imp.drivers, driversWired: imp.driversWired });
        rep.push(`<div class="ok">${esc(file.name)}: ${m.parsed.kind} (${esc(m.parsed.detectedBy)}), ${m.parsed.f.length} points, ${esc(m.parsed.format)}${m.parsed.phase ? ", with phase" : ", no phase"}.</div>` + m.parsed.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join(""));
      } catch (err) { rep.push(`<div class="bad">${esc(file.name)}: ${esc((err as Error).message)}</div>`); }
    }
    const html = rep.join("");
    renderMeasPanel(host, ctx, withFit); $("#mRep").innerHTML = html; ctx.redraw();
  };
  if (withFit) bindFit(host, ctx);
}

/** Parse and store one file (also used by the T/S tool on the Drivers tab). */
export async function importOne(ctx: MeasCtx, text: string, fileName: string, kind: MeasKind | undefined, meta: Partial<Measurement>) {
  const parsed = parseMeasurement(text, fileName, kind);
  if (parsed.kind === "unknown") throw new Error(parsed.detectedBy + " (choose Impedance or Frequency response in Kind, then pick the file again).");
  const id = `${meta.what ?? "m"}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.replace(/_/g, "-");
  const m: Measurement = { id, kind: parsed.kind, what: meta.what ?? "other", date: meta.date ?? today(), notes: meta.notes ?? "", jig: meta.jig ?? "", wiring: meta.wiring ?? "single", drivers: meta.drivers ?? 1, driversWired: meta.driversWired,
    f: parsed.f, mag: parsed.mag, phase: parsed.phase, fileName, format: parsed.format, header: parsed.header, show: true, offsetDb: 0, addedMassG: meta.addedMassG, boxL: meta.boxL };
  await ctx.api(`projects/${ctx.project().name}/measurements/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) });
  list.push(m);
  return { m, parsed };
}

// ---------- box fit (Fix tab) ----------
function fitPanelHtml(p: Project, imps: Measurement[], mb: MeasuredBox | null | undefined) {
  const using = mb && mb.kind === p.kind;
  return `<fieldset id="mfit"><legend>Match the model to the real box (impedance fit)</legend>
    <div class="hint">Uses a sweep of the driver <b>in this box</b>. Finds the impedance peaks (ported: tuning = the dip between the two peaks; sealed: fc and Qtc), then adjusts the net volume, tuning and box losses until the model's impedance matches the measurement, with the driver's T/S values held fixed. If the match is poor, the driver's published T/S values are the likely problem: measure the driver in free air (Drivers tab).</div>
    ${imps.length ? `<div class="row"><label>Sweep</label><select id="fMeas">${imps.map((m) => `<option value="${esc(m.id)}" ${m.id === fitOpts.meas ? "selected" : ""}>${esc(WHAT_TEXT[m.what])}: ${esc(m.notes || m.fileName)} (${esc(m.date)})</option>`).join("")}</select><span class="u"></span></div>
    <div class="row" title="Dual voice coil: which wiring the driver's T/S values describe. The app converts the driver to the wiring used in the sweep (two identical coils assumed)."><label>Driver's T/S values are for</label><select id="fDW"><option value="same" ${fitOpts.driverWiring === "same" ? "selected" : ""}>the same wiring as the sweep</option>${(["series", "parallel", "one"] as const).map((k) => `<option value="${k}" ${fitOpts.driverWiring === k ? "selected" : ""}>${esc(WIRING_TEXT[k])}</option>`).join("")}</select><span class="u"></span></div>
    <div class="row"><label>Fit these losses</label><span><label><input type="checkbox" id="fQL" ${fitOpts.QL ? "checked" : ""}> leakage QL</label> <label><input type="checkbox" id="fQA" ${fitOpts.QA ? "checked" : ""}> absorption QA</label> ${p.kind === "vented" ? `<label><input type="checkbox" id="fQP" ${fitOpts.QP ? "checked" : ""}> port QP</label>` : ""} <label title="Coil temperature, lead resistance"><input type="checkbox" id="fRe" ${fitOpts.Re ? "checked" : ""}> Re offset</label></span><span class="u"></span></div>
    <div class="toolbar"><button class="primary" id="fRun">Fit the box to this sweep</button>${using ? '<button id="fClear">Stop using the fitted box</button>' : ""}${p.measuredBoxPrev !== undefined ? '<button id="fUndo">Undo last change</button>' : ""}</div>` : '<p class="muted">Import an impedance sweep of the driver in this box first.</p>'}
    ${using ? `<div class="warn">The analysis now uses the fitted box: ${f1(mb!.VbPerL)} L per driver${mb!.fb ? `, tuned to ${f1(mb!.fb)} Hz` : ""}, QL ${f1(mb!.QL)}${mb!.QA ? `, QA ${f1(mb!.QA)}` : ""}${mb!.QP ? `, QP ${f1(mb!.QP)}` : ""} (fitted ${esc(mb!.fitted.slice(0, 10))}, ${f1(mb!.rmsPct, 1)} % rms). The measured outside sizes are kept but not used for volume and tuning.</div>` : ""}
    <div id="fOut"></div></fieldset>`;
}
function driverForWiring(d: Driver, air: Air, from: CoilWiring | "same", to: CoilWiring): { fp: FullParams; note: string } {
  if (from === "same" || from === to || to === "single") return { fp: complete(d.params, air), note: "" };
  const fp0 = complete(d.params, air);
  const cv = convertWiring({ Re: fp0.Re, Bl: fp0.Bl, Le: fp0.Le, Qes: fp0.Qes }, from, to);
  const P = d.params; // keep the mechanical side (Vas, or Mms/Cms when there is no Vas); Bl follows from the new Re and Qes
  return { fp: complete({ ...P, Re: cv.Re, Qes: cv.Qes, Qts: undefined, Le: cv.Le, Bl: undefined, Mms: P.Vas ? undefined : P.Mms, Cms: P.Vas ? undefined : P.Cms }, air), note: `Driver converted from "${WIRING_TEXT[from]}" to the sweep's "${WIRING_TEXT[to]}": Re ${fp0.Re.toFixed(2)} → ${cv.Re.toFixed(2)} Ω, Qes ${fp0.Qes.toFixed(3)} → ${cv.Qes.toFixed(3)}.` };
}
function bindFit(host: HTMLElement, ctx: MeasCtx) {
  const run = $<HTMLButtonElement>("#fRun"); if (!run) return;
  const read = () => { fitOpts.meas = $<HTMLSelectElement>("#fMeas").value; fitOpts.driverWiring = $<HTMLSelectElement>("#fDW").value as any; fitOpts.QL = $<HTMLInputElement>("#fQL").checked; fitOpts.QA = $<HTMLInputElement>("#fQA").checked; fitOpts.QP = $<HTMLInputElement>("#fQP")?.checked ?? false; fitOpts.Re = $<HTMLInputElement>("#fRe").checked; };
  host.querySelectorAll("#mfit select, #mfit input").forEach((el) => el.addEventListener("change", read));
  if ($("#fClear")) $("#fClear").onclick = () => ctx.clearFit?.();
  if ($("#fUndo")) $("#fUndo").onclick = () => ctx.undoFit?.();
  if (fitShown && fitShown.id === fitOpts.meas) showFit(ctx, fitShown.fit, host);
  run.onclick = () => {
    read(); const p = ctx.project(); const d = ctx.driver(); const m = list.find((x) => x.id === fitOpts.meas);
    if (!d) { $("#fOut").innerHTML = '<p class="bad">Choose the driver first.</p>'; return; }
    if (!m) return;
    try {
      const { fp, note } = driverForWiring(d, ctx.air(), fitOpts.driverWiring, m.wiring);
      // several drivers on the jig at once (identical, all in this box): convert to one driver's impedance
      const n = Math.max(1, m.drivers || 1); const conn = m.driversWired ?? "parallel";
      const mag = n > 1 ? m.mag.map((z) => (conn.startsWith("s") ? z / n : z * n)) : m.mag;
      const pt = p.kind === "vented" ? toPort(p) : undefined;
      const Sv = pt ? (portArea(pt) * pt.count) / p.drivers : undefined;
      const fit = fitBox(fp, p.kind, { f: m.f, mag, phase: m.phase }, Sv, { fitQL: fitOpts.QL, fitQA: fitOpts.QA, fitQP: fitOpts.QP, fitRe: fitOpts.Re }, ctx.air());
      if (note) fit.notes.unshift(note);
      if (n > 1) fit.notes.unshift(`${n} drivers in ${conn.startsWith("s") ? "series" : "parallel"}: the measured impedance was converted to one driver (${conn.startsWith("s") ? "÷" : "×"}${n}).`);
      fitShown = { id: m.id, fit }; showFit(ctx, fit, host); ctx.redraw();
    } catch (e) { $("#fOut").innerHTML = `<p class="bad">${esc((e as Error).message)}</p>`; }
  };
}
function showFit(ctx: MeasCtx, fit: BoxFit, host: HTMLElement) {
  const p = ctx.project(); const pk = fit.peaks;
  const out = host.querySelector<HTMLElement>("#fOut"); if (!out) return;
  out.innerHTML = `<h3>Fit result</h3><table class="kv">
    <tr><td>Peaks found</td><td class="num">${pk.peaks.map((q) => `${f1(q.f)} Hz (${f1(q.z)} Ω)`).join(", ") || "none"}${pk.fb ? ` · dip ${f1(pk.fb)} Hz` : ""}${pk.Qtc ? ` · Qtc ${f1(pk.Qtc, 2)}` : ""}</td></tr>
    <tr><td>Read-out from the peaks (no fit)</td><td class="num">${pk.Vb ? f1(pk.Vb * 1000) + " L per driver" : "–"}${pk.fb ? `, ${f1(pk.fb)} Hz` : ""}${pk.fc ? `, fc ${f1(pk.fc)} Hz` : ""}</td></tr>
    <tr><td><b>Fitted</b> (${fit.kind})</td><td class="num"><b>${f1(fit.VbPer * 1000)} L per driver${fit.fb ? `, ${f1(fit.fb)} Hz` : ""}</b>, QL ${f1(fit.QL)}${fit.QA ? `, QA ${f1(fit.QA)}` : ""}${fit.QP ? `, QP ${f1(fit.QP)}` : ""}${Math.abs(fit.dRe) >= 0.005 ? `, Re ${fit.dRe >= 0 ? "+" : ""}${fit.dRe.toFixed(2)} Ω` : ""}</td></tr>
    <tr><td>Match (rms error of |Z|, ${f1(fit.band[0])}-${f1(fit.band[1], 0)} Hz)</td><td class="num ${fit.rmsPct > 10 ? "bad" : fit.rmsPct > 4 ? "warn" : "ok"}">${f1(fit.rmsPct, 1)} %</td></tr></table>
    ${fit.notes.map((n) => `<div class="hint">${esc(n)}</div>`).join("")}
    ${fit.kind === p.kind ? '<div class="toolbar"><button class="primary" id="fUse">Use the fitted box for the analysis…</button></div>' : ""}`;
  const use = out.querySelector<HTMLButtonElement>("#fUse");
  if (use) use.onclick = () => ctx.applyFit?.({ kind: fit.kind, VbPerL: fit.VbPer * 1000, fb: fit.fb, QL: fit.QL, QA: fit.QA, QP: fit.QP, dRe: fit.dRe, rmsPct: fit.rmsPct, measurementId: fitShown?.id ?? "", fitted: new Date().toISOString() });
}
