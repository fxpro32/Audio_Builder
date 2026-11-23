// Coil wiring panel for Design and Analyse/Fix (A4_HPDB): wiring choice for dual-coil drivers, T/S basis notice and
// override, impedance per driver and final load at the amplifier. Engine side: engine/coils.ts.
import { Driver } from "../engine/driver";
import { CoilWiring, WIRING_TEXT } from "../engine/measure";
import { finalLoad, hasCoilChoice, inferBasis, paramsForWiring, Wiring, WIRING_LABEL, wiredImpedance } from "../engine/coils";
import { Project } from "./model";
import { $, esc } from "./dom";

const ohm = (z: number) => `${+z.toFixed(3)} Ω`;

/** Current wiring state for the project's driver (created with defaults when the driver changed). */
export function coilState(p: Project, d?: Driver): { wiring: Wiring; basis?: CoilWiring } | undefined {
  if (!d || !hasCoilChoice(d)) return undefined;
  if (!p.coil || p.coil.driverId !== d.id) {
    const b = inferBasis(d).basis;
    p.coil = { driverId: d.id, wiring: b === "series" ? "series" : "parallel" }; // default: as published (or parallel)
  }
  return p.coil;
}
/** The driver with its parameters converted to the chosen wiring (other drivers unchanged). */
export function wiredDriver(p: Project, d?: Driver): Driver | undefined {
  const s = coilState(p, d); if (!d || !s) return d;
  return { ...d, params: paramsForWiring(d, s.wiring, s.basis).params };
}
/** Keep the amplifier impedance per driver equal to the wired impedance; true if it changed. */
export function syncImpedance(p: Project, d?: Driver): boolean {
  const s = coilState(p, d); if (!d || !s) return false;
  const z = wiredImpedance(d.ohmsPerCoil!, d.coils!, s.wiring);
  if (Math.abs(p.power.impedance - z) < 1e-9) return false;
  p.power.impedance = z; return true;
}
export function finalLoadText(zDriver: number, n: number): string {
  if (n <= 1) return `${ohm(zDriver)} (one driver)`;
  return `${n} drivers all in parallel: <b>${ohm(finalLoad(zDriver, n, "parallel"))}</b> · all in series: ${ohm(finalLoad(zDriver, n, "series"))}`;
}
/** Rows for the fieldset; replaces the plain "impedance per driver" field when the driver has two coils. */
export function coilRowsHtml(p: Project, d: Driver | undefined, nDrivers: number): string {
  const s = coilState(p, d);
  if (!d || !s) return "";
  const w = paramsForWiring(d, s.wiring, s.basis);
  const inf = inferBasis(d);
  const opts = (["series", "parallel", "one"] as Wiring[]).map((k) => `<option value="${k}" ${k === s.wiring ? "selected" : ""}>${WIRING_LABEL[k]}: ${ohm(wiredImpedance(d.ohmsPerCoil!, d.coils!, k))}</option>`).join("");
  const unknown = !d.tsBasis || d.tsBasis === "unknown";
  const bOpts = ([["", `as assumed (${WIRING_TEXT[inf.basis]})`], ["series", WIRING_TEXT.series], ["parallel", WIRING_TEXT.parallel], ["one", "one coil (per-coil values)"]] as [string, string][])
    .map(([v, t]) => `<option value="${v}" ${(s.basis ?? "") === v ? "selected" : ""}>${esc(t)}</option>`).join("");
  return `<div id="coilPanel">
    <div class="row"><label>Coil wiring (${esc(d.coil ?? "")} ${d.coils} × ${d.ohmsPerCoil} Ω)</label><select id="coilWiring">${opts}</select><span class="u"></span></div>
    ${unknown ? `<div class="warn" id="basisNote">The maker does not say which wiring its T/S values describe. ${s.basis ? `You set: ${esc(WIRING_TEXT[s.basis])}.` : `The app assumed ${esc(WIRING_TEXT[inf.basis])}: ${esc(inf.text)}.`} Change it if you know better:
      <select id="tsBasis">${bOpts}</select></div>` : ""}
    ${w.notes.length ? `<div class="hint" id="wiringNote">${w.notes.map(esc).join(" ")}</div>` : ""}
    <div class="row"><label>Impedance per driver (from the wiring)</label><b id="zDriver">${ohm(w.zDriver!)}</b><span class="u"></span></div>
    <div class="row"><label>Final load at the amplifier</label><span id="finalLoad">${finalLoadText(w.zDriver!, nDrivers)}</span><span class="u"></span></div>
  </div>`;
}
export function bindCoil(p: Project, d: Driver | undefined, onChange: () => void) {
  const s = coilState(p, d); if (!d || !s) return;
  const sel = $<HTMLSelectElement>("#coilWiring");
  if (sel) sel.onchange = () => { s.wiring = sel.value as Wiring; syncImpedance(p, d); onChange(); };
  const b = $<HTMLSelectElement>("#tsBasis");
  if (b) b.onchange = () => { s.basis = (b.value || undefined) as CoilWiring | undefined; onChange(); };
}
