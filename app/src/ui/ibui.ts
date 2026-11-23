// Infinite baffle designer and Door speaker tools (B2_SECTIONS, R37). Source: references/research_h_ib_door_home_pc.md
// (sections 1, 2.2, 4). Maths: app/src/engine/ib.ts. Both sections design no box: the IB item has a baffle board (it goes to
// the Boards tab); the door item stays "Door mounting: to be decided" (decision of 2026-11-23) and only shows what can be worked
// out for a driver without a box.
import { Air } from "../engine/air";
import { complete, Driver, FullParams } from "../engine/driver";
import { cabinPressure, ibAlignment, ibRules, ibSubsonic, ibVerdict, IBConfig, IBMode, leakTuning, leakWords, simulateIB, xmaxSplFree, SRC_PS_Y6 } from "../engine/ib";
import { freqs } from "../engine/model";
import { $, esc, f1, field, bindFields, select, fmtMm, fmtL, fmtU, units } from "./dom";
import { plot, PALETTE } from "./plot";
import { driverSizes } from "./shape";

export interface SecCtx {
  driverById: (id?: string) => Driver | undefined; air: () => Air;
  save: () => void; rerender: () => void; status: (msg: string, cls?: string) => void;
  driverSelect: (sel: string | undefined) => string; facts: (d?: Driver) => string;
}
const F = freqs(10, 300, 48);

// ---------- Infinite baffle ----------
export const IB_PRESETS: { id: string; label: string; bootL?: number; cabinL?: number; note: string }[] = [
  { id: "pssound-c63", label: "PS Sound's example: Mercedes C63 (boot about 500 L, cabin about 3,000 L)", bootL: 500, cabinL: 3000,
    note: "The volumes PS Sound used in WinISD for a trunk IB in a Mercedes C63 (boot about 500 L) and a true IB (cabin about 3,000 L): \"How Much Power IB Subwoofer Need/Draw\", 4:56 and 27:52, https://www.youtube.com/watch?v=HIFdf4eQxQw . Rough figures, not measured for your car." },
  { id: "own", label: "Enter yours", note: "Enter your car's boot air volume (boot minus what is in it) and cabin air volume. No sourced table of car volumes was found, so there are no other presets: measure or estimate yours." },
];
export interface IBData {
  driverId: string; count: number; notes: string; mode: IBMode; preset: string; bootL: number; cabinL: number; cabinLoad: boolean;
  leakCm2: number; leakMm: number; watts: number; impedance: number; hpAuto: boolean; hpHz: number;
  showGain: boolean; longestMm: number; baffleAuto: boolean; baffleW: number; baffleH: number; baffleT: number; baffleLayers: number;
}
/** Fill every field an IB item needs (older B1 items have only driverId, count, notes). */
export function ibDefaults(data: any, d?: Driver): IBData {
  data.driverId ??= ""; data.count ??= 2; data.notes ??= ""; data.mode ??= "trunk"; data.preset ??= "pssound-c63";
  data.bootL ??= 500; data.cabinL ??= 3000; data.cabinLoad ??= true; data.leakCm2 ??= 20; data.leakMm ??= 20;
  data.watts ??= 500; data.impedance ??= d?.params.Znom ?? 4; data.hpAuto ??= true; data.hpHz ??= 20;
  data.showGain ??= true; data.longestMm ??= 2500; data.baffleAuto ??= true; data.baffleW ??= 1000; data.baffleH ??= 500; data.baffleT ??= 18; data.baffleLayers ??= 2;
  return data as IBData;
}
const EDGE = 60, GAP = 40;
/** Baffle sizes (mm): auto = the drivers in a row with 60 mm edges and 40 mm between frames. */
export function baffleOf(data: IBData, d?: Driver) {
  const z = driverSizes(d); const outer = z.outer * 1000, cut = z.cutout * 1000; const n = Math.max(1, Math.round(data.count));
  const estimated = !d?.params.dia || !d?.params.cutout;
  if (data.baffleAuto) { data.baffleW = Math.ceil(n * outer + (n - 1) * GAP + 2 * EDGE); data.baffleH = Math.ceil(outer + 2 * EDGE); }
  const fits = data.baffleW >= n * outer + (n - 1) * 10 && data.baffleH >= outer;
  return { W: data.baffleW, H: data.baffleH, t: data.baffleT, layers: Math.max(1, Math.round(data.baffleLayers)), n, outer, cut, estimated, fits };
}
/** Cut list rows of the baffle for the Boards tab. */
export function ibBoardRows(data: IBData, d?: Driver) {
  const b = baffleOf(data, d);
  return [{ name: "IB baffle", qty: b.layers, a: b.W, b: b.H, note: `${b.n} × ${Math.round(b.cut)} mm cut-out${b.n > 1 ? "s" : ""}${b.estimated ? " (cut-out estimated from the cone area: check the driver's sheet)" : ""}` }];
}
function baffleSvg(b: ReturnType<typeof baffleOf>): string {
  const s = 420 / Math.max(b.W, b.H * 1.6); const W = b.W * s, H = b.H * s; const pitch = b.n > 1 ? (b.W - 2 * EDGE - b.outer) / (b.n - 1) : 0;
  const circles = Array.from({ length: b.n }, (_, i) => { const cx = (b.n > 1 ? EDGE + b.outer / 2 + i * pitch : b.W / 2) * s, cy = H / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${(b.outer / 2) * s}" fill="none" stroke="#888" stroke-dasharray="4 3"/><circle cx="${cx}" cy="${cy}" r="${(b.cut / 2) * s}" fill="#111" stroke="#ff9f43"/>`; }).join("");
  return `<svg id="ibBaffleSvg" viewBox="-10 -10 ${W + 20} ${H + 34}" style="width:100%;max-width:${W + 20}px;height:auto"><rect x="0" y="0" width="${W}" height="${H}" fill="#8a6a43" stroke="#e8e8e8"/>${circles}
    <text x="0" y="${H + 18}" fill="#ccc" font-size="12">${esc(fmtMm(b.W))} × ${esc(fmtMm(b.H))}, ${b.layers} × ${esc(fmtMm(b.t))}; orange = cut-out, dashed = driver frame</text></svg>`;
}
const SRC_KICKER = "Kicker, InfiniteBaffleGuidelines.pdf: https://www.kicker.com/app/misc/support/tech/tech_papers/docs/InfiniteBaffleGuidelines.pdf";

export function renderIBPage(host: HTMLElement, it: { name: string; data: any }, ctx: SecCtx) {
  const d0 = ctx.driverById(it.data.driverId); const data = ibDefaults(it.data, d0); const d = d0; const air = ctx.air();
  const pre = IB_PRESETS.find((x) => x.id === data.preset) ?? IB_PRESETS[1];
  const trunk = data.mode === "trunk", free = data.mode === "free";
  host.innerHTML = `<div class="cols"><div>
    <fieldset id="ibA"><legend>Infinite baffle: ${esc(it.name)}</legend>${ctx.driverSelect(data.driverId)}
      <div class="row"><label>Number of drivers</label><input type="number" id="secCount" min="1" step="1" value="${esc(data.count)}"></div>
      ${select("mode", data.mode, [["trunk", "Trunk IB: baffle between boot and cabin"], ["true", "True IB: through the floor, breathing outside"], ["free", "Free air / rear deck (no box, no cabin load)"]], "Kind of IB")}
      <div class="hint" id="ibModeHint">${trunk ? "A rigid, sealed baffle wall between boot and cabin carries the drivers; the boot air behind them works as the box and the closed cabin in front as a second load." : data.mode === "true" ? "The drivers are mounted through the car floor or spare-wheel well and breathe to the outside under the car; the cabin is the only air the cones work into." : "No air load behind or in front: the driver's own Fs / Qts roll-off (a very leaky car, a rear deck with the boot open to the outside). Shown for comparison."}</div></fieldset>
    <fieldset id="ibCar"><legend>The car</legend>
      ${select("preset", data.preset, IB_PRESETS.map((x) => [x.id, x.label] as [string, string]), "Volumes")}<div class="hint">${esc(pre.note)}</div>
      ${trunk ? field("Boot air volume (behind the baffle)", data, "bootL", "L") : ""}${!free ? field("Cabin air volume", data, "cabinL", "L") : ""}
      ${!free ? field("Count the closed cabin as a front load", data, "cabinLoad", "", { title: "The cones also compress the closed cabin: its air stiffness adds to the boot's (research_h 1.7 item 4)" }) : ""}
      ${trunk ? field("Leak area between boot and cabin (all gaps)", data, "leakCm2", "cm²") + field("Leak length (baffle / seal thickness)", data, "leakMm", "mm") + `<div class="hint">Add up the gaps you cannot seal: around the baffle edges, the parcel shelf, ski hatch, seat-back gaps. A 1 cm wide gap 20 cm long is 20 cm². PS Sound: "it's about the ratio of the cone and the leakage" (\"How to Seal IB\" 20:40, https://www.youtube.com/watch?v=DboPhOQmQqs ).</div>` : ""}</fieldset>
    <fieldset id="ibAmp"><legend>Amplifier and filter</legend>
      ${field("Amp power per driver", data, "watts", "W")}${field("Impedance per driver", data, "impedance", "Ω")}
      ${field("Pick the subsonic filter for me (keeps the cone within Xmax)", data, "hpAuto")}${data.hpAuto ? "" : field("Subsonic filter (24 dB/octave)", data, "hpHz", "Hz")}
      ${field("Also show the in-car curve from the app's cabin gain (empirical)", data, "showGain")}${data.showGain ? field("Longest inside length of the car", data, "longestMm", "mm") : ""}</fieldset>
    <fieldset id="ibBaffle"><legend>Baffle board</legend>
      ${field("Size it for the drivers (in a row)", data, "baffleAuto")}${data.baffleAuto ? "" : field("Width", data, "baffleW", "mm") + field("Height", data, "baffleH", "mm")}
      ${field("Board thickness", data, "baffleT", "mm")}${field("Layers (glued together)", data, "baffleLayers", "", { step: 1, min: 1 })}
      <div class="hint">PS Sound: make the mounting "as rigid as possible", e.g. double 18 mm ply with a brace, or an aluminium frame with 18 mm ply; bolt it to the car body, not the back of the seat (\"How to Seal IB\" 1:31-3:03, 19:27). The board goes to the Boards tab for cutting.</div><div id="ibBaffleView"></div></fieldset>
    <div class="row"><label>Notes</label></div><textarea id="secNotes" rows="3" style="width:100%">${esc(data.notes)}</textarea>
  </div><div>
    <div id="ibVerdict"></div><div id="ibOut"></div>
    <div class="plots"><div class="plotbox" id="pIbSpl"></div><div class="plotbox" id="pIbX"></div><div class="plotbox" id="pIbZ"></div><div class="plotbox" id="pIbP"></div></div>
    <div id="ibRulesBox"></div>
    <h2>Building it (as PS Sound and others describe it)</h2><ul class="hint" id="ibBuild">
      <li>Rigid baffle bolted to the car body (factory tie-down points, rivnuts), not to the seat back: seat hinges rattle (PS Sound, \"How to Seal IB\" 1:31-3:03, 19:27-19:58).</li>
      <li>Seal the baffle edges and the parcel shelf (one layer of 2-3 mm deadening on the shelf in most cars); you do not have to "go absolutely crazy" (same video 4:01, 20:09). Kicker: any unsealed area "will decrease the amount of bass" (${esc(SRC_KICKER)}).</li>
      <li>True IB: mount on 1 in birch ply or 8 mm steel bolted to the chassis; one or two layers of rain-guard foam under the grille against water and dirt (PS Sound, Mercedes CLK true IB, https://www.youtube.com/watch?v=BV-gjYYj-34 ; IB protection, https://www.youtube.com/watch?v=TBVXcp0aWiU ).</li>
      <li>Keep a small cabin pressure vent (grommet + rain guard): with every vent sealed "the aircon is screwed ... you get condensation" (PS Sound, Amarok IB 3:14, https://www.youtube.com/watch?v=218r--zbLTk ).</li>
      <li>A ski hatch or folded seat lets the sub breathe into the cabin: PS Sound measured about +7.5 dB at 25-27 Hz folding a third of the rear seat (https://www.youtube.com/watch?v=vsgHsSppA7w ).</li>
      <li>Power: PS Sound turns up slowly at the lowest note wanted (15-20 Hz) and stops when the spider is heard stretching; the limit is excursion, not heat (\"How Much Power\" 26:16). Their exact subsonic settings were not found.</li></ul>
  </div></div>`;
  const ch = () => { ctx.save(); ctx.rerender(); };
  // one change handler: a preset fills the volumes; editing a volume afterwards makes the preset "Enter yours"
  const before = { preset: data.preset, bootL: data.bootL, cabinL: data.cabinL };
  const onField = () => {
    const p = IB_PRESETS.find((x) => x.id === data.preset);
    if (data.preset !== before.preset) { if (p?.bootL) { data.bootL = p.bootL; data.cabinL = p.cabinL!; } }
    else if (p?.bootL && (data.bootL !== before.bootL || data.cabinL !== before.cabinL)) data.preset = "own";
    ch();
  };
  for (const sel of ["#ibA", "#ibCar", "#ibAmp", "#ibBaffle"]) bindFields($(sel), data, onField);
  const sel = $<HTMLSelectElement>("#secDrv"); if (sel) sel.onchange = () => { data.driverId = sel.value; const nd = ctx.driverById(sel.value); if (nd?.params.Znom) data.impedance = nd.params.Znom; ch(); };
  const cnt = $<HTMLInputElement>("#secCount"); cnt.onchange = () => { data.count = Math.max(1, Math.round(Number(cnt.value) || 1)); ch(); };
  const nt = $<HTMLTextAreaElement>("#secNotes"); nt.onchange = () => { data.notes = nt.value; ctx.save(); };
  const b = baffleOf(data, d);
  $("#ibBaffleView").innerHTML = `${baffleSvg(b)}<div class="hint ${b.fits ? "" : "bad"}" id="ibBaffleNote">${b.n} cut-out${b.n > 1 ? "s" : ""} of ${esc(fmtMm(b.cut))}${b.estimated ? " (driver frame and cut-out estimated from the cone area: the sheet does not give them; check before cutting)" : ""}.${b.fits ? "" : " The board is smaller than the drivers in a row: make it bigger."}</div>`;
  if (!d) { $("#ibOut").innerHTML = `<p class="muted">Choose a driver.</p>`; return; }
  $("#ibVerdict").innerHTML = (() => { const v = ibVerdict(d.params, data.count); return `<p class="${v.level}" id="ibVerdictText"><b>PS Sound's rules:</b> ${esc(v.text)}</p>`; })();
  const rules = ibRules(d.params, data.count, trunk ? data.bootL / 1000 : undefined);
  $("#ibRulesBox").innerHTML = `<h2>Driver checks (cited guides, not hard rules)</h2><table class="kv" id="ibRules"><tr><th>Who</th><th>Rule</th><th>This driver</th><th></th></tr>${rules.map((r) => `<tr><td>${esc(r.who)}</td><td>${esc(r.rule)}</td><td class="num">${esc(r.value)}</td><td class="${r.verdict === "pass" ? "ok" : r.verdict === "fail" ? "bad" : "muted"}">${r.verdict === "pass" ? "yes" : r.verdict === "fail" ? "no" : r.verdict === "unknown" ? "not published" : "see value"}</td></tr>`).join("")}</table>
    <div class="hint">Sources: ${[...new Set(rules.map((r) => r.source))].map(esc).join(" · ")}</div>`;
  let fp: FullParams; try { if (d.incomplete) throw new Error(`missing ${(d.missing ?? []).join(", ")}`); fp = complete(d.params, air); } catch (e) { $("#ibOut").innerHTML = `<p class="bad">Not enough published data to simulate ${esc(d.brand)} ${esc(d.model)}: ${esc((e as Error).message)}</p>`; return; }
  const n = Math.max(1, Math.round(data.count));
  const Vrear = trunk ? data.bootL / 1000 : Infinity, Vcab = !free && data.cabinLoad ? data.cabinL / 1000 : Infinity;
  const cfg: IBConfig = { mode: data.mode, n, Vrear: trunk ? Vrear : undefined, Vcabin: !free ? data.cabinL / 1000 : undefined, cabinLoad: !free && data.cabinLoad, leakA: trunk ? data.leakCm2 * 1e-4 : 0, leakT: data.leakMm / 1000 };
  const Vrms = Math.sqrt(Math.max(0, data.watts) * Math.max(0.1, data.impedance));
  const hpSug = ibSubsonic(fp, cfg, { Vrms }, air);
  const hp = data.hpAuto ? (isFinite(hpSug) ? hpSug : 80) : data.hpHz;
  const cabinGain = data.showGain && !free ? { enabled: true, cornerHz: air.c / (2 * data.longestMm / 1000), slopeDbPerOct: 12 } : undefined;
  const sim = simulateIB(fp, cfg, { Vrms, hpHz: hp || undefined, hpOrder: 4, cabin: cabinGain }, air, F);
  const raw = simulateIB(fp, cfg, { Vrms }, air, F);
  // closed-box line from the published fs / Qts / Vas (as PS Sound and research_h did); the curves use the full parameter set
  const al = ibAlignment(d.params.fs, d.params.Qts ?? fp.Qts, d.params.Vas ?? fp.Vas, n, Vrear, Vcab);
  const lk = trunk && data.leakCm2 > 0 ? leakTuning(data.leakCm2 * 1e-4, data.leakMm / 1000, Vrear, data.cabinLoad ? data.cabinL / 1000 : Infinity, air.c) : undefined;
  const lw = trunk ? leakWords(lk?.fLeak ?? 0, data.leakCm2 * 1e-4, n * fp.Sd) : undefined;
  const xm = fp.Xmax * 1000; const maxX = Math.max(...sim.xmm); const maxXraw = Math.max(...raw.xmm);
  const cp = !free ? cabinPressure(n * fp.Sd, fp.Xmax, data.cabinL / 1000, air) : undefined;
  const zPk = Math.max(...raw.zmag.slice(0, F.findIndex((f) => f > 120))); const kPk = raw.zmag.indexOf(zPk); const fPk = F[kPk];
  const pAt = (f: number) => sim.powerW[Math.max(0, F.findIndex((x) => x >= f))];
  const k60 = F.findIndex((f) => f >= 60);
  const hpTxt = data.hpAuto ? (hpSug === 0 ? "none needed at this power (the cone stays within Xmax from 10 Hz up)" : isFinite(hpSug) ? `<b>${hpSug} Hz</b>, 24 dB/octave (lowest that keeps the cone within Xmax at ${data.watts} W)` : `even 80 Hz does not keep the cone within Xmax at ${data.watts} W: reduce the power`) : `${data.hpHz} Hz, 24 dB/octave (yours)${isFinite(hpSug) && hpSug > data.hpHz ? `; at least ${hpSug} Hz keeps the cone within Xmax` : ""}`;
  $("#ibOut").innerHTML = `<h2>Result</h2><table class="kv" id="ibRes">
    <tr><td title="alpha = N*Vas / V_rear + N*Vas / V_cabin (research_h 1.7)">Air stiffness ratio alpha</td><td class="num" id="ibAlpha"><b>${f1(al.alpha, 3)}</b>${trunk ? ` = boot ${f1(al.alphaRear, 3)}` : ""}${al.alphaCabin ? ` ${trunk ? "+" : "="} cabin ${f1(al.alphaCabin, 3)}` : ""} (N·Vas ${esc(fmtL(n * fp.Vas * 1000, 0))})</td></tr>
    <tr><td>System resonance fc · Qtc · f3</td><td class="num" id="ibFc"><b>${f1(al.fc)} Hz</b> · Qtc <b>${f1(al.Qtc, 3)}</b> · f3 ${f1(al.f3)} Hz <span class="muted">(closed-box maths from the published Fs, Qts and Vas, free field)</span></td></tr>
    ${lk && lw ? `<tr><td>Leak boot to cabin</td><td class="num ${lw.level}" id="ibLeak">f_leak <b>${f1(lk.fLeak)} Hz</b>: ${esc(lw.text)} <span class="muted">(simple lumped model, approximate; leak loss Q 5 assumed)</span></td></tr>` : trunk ? `<tr><td>Leak boot to cabin</td><td class="num ok" id="ibLeak">${esc(lw!.text)}</td></tr>` : ""}
    <tr><td>Subsonic filter</td><td class="num" id="ibHp">${hpTxt}</td></tr>
    <tr><td>Max cone travel</td><td class="num ${maxX > xm * 1.001 ? "bad" : "ok"}" id="ibX">${f1(maxX)} mm with the filter / Xmax ${f1(xm)} mm (without a filter: ${f1(maxXraw)} mm)</td></tr>
    ${cp ? `<tr><td title="p = rho*c^2*N*Sd*Xmax / V_cabin, below the first cabin mode (research_h 1.7 item 4)">Cabin pressure at Xmax (displacement limit)</td><td class="num" id="ibCabin"><b>${f1(cp.dbPeak)} dB</b> from the peak pressure (${f1(cp.dbRms)} dB as a steady sine, rms) in ${esc(fmtL(data.cabinL, 0))}; PS Sound measured 135.5-139.9 dB at 19-35 Hz with 2 × IB15AU \"close to excursion limits\"</td></tr>` : ""}
    <tr><td>Impedance (one driver)</td><td class="num" id="ibZ">peak ${f1(zPk)} Ω at ${f1(fPk)} Hz, ${f1(raw.zmag[k60])} Ω at 60 Hz; ${n} driver${n > 1 ? "s" : ""}: wire to suit the amplifier</td></tr>
    <tr><td>Power drawn (all drivers, with the filter)</td><td class="num" id="ibP">${f1(pAt(20), 0)} W at 20 Hz · ${f1(sim.powerW[kPk] ?? 0, 0)} W at the impedance peak · ${f1(pAt(60), 0)} W at 60 Hz (amp set for ${n * data.watts} W into the nominal load)</td></tr>
    <tr><td colspan="2" class="hint">Low power draw: near its low resonance an IB sub's impedance rises steeply, so it "can hardly draw any power" there. PS Sound measured 2 × IB15AU drawing 67 W at 20 Hz for 138.7 dB, and 350 W at 35 Hz for 135.5 dB (\"How Much Power IB Subwoofer Need/Draw\" 10:56-14:56, https://www.youtube.com/watch?v=HIFdf4eQxQw ). The limit is excursion, not heat.</td></tr></table>`;
  const series = [{ name: "Free field (half space, 1 m)", x: F, y: sim.free, color: PALETTE[1] }];
  if (cabinGain) series.push({ name: "In car: free field + cabin gain (empirical)", x: F, y: sim.inCar, color: PALETTE[2] });
  if (sim.cabinDb.length) series.push({ name: "Cabin pressure (pressure field, valid below the first cabin mode)", x: F, y: sim.cabinDb, color: PALETTE[3] });
  series.push({ name: "Limit at Xmax, free field", x: F, y: F.map((f) => xmaxSplFree(fp, n, f, air)), color: "#ff6b6b", dash: "5 4" } as any);
  plot($("#pIbSpl"), series, { title: `Loudness at ${data.watts} W per driver${hp ? `, ${hp} Hz subsonic` : ""}`, yLabel: "dB SPL" });
  plot($("#pIbX"), [{ name: "Cone travel with the filter", x: F, y: sim.xmm, color: PALETTE[2] }, { name: "without a filter", x: F, y: raw.xmm, color: PALETTE[5], dash: "4 3" } as any], { title: "Cone travel (peak)", yLabel: "mm", yMin: 0, hLines: xm ? [{ y: xm, label: "Xmax", color: "#ff6b6b" }] : [] });
  plot($("#pIbZ"), [{ name: "Impedance", x: F, y: raw.zmag, color: PALETTE[3] }], { title: "Impedance (one driver)", yLabel: "Ω", yMin: 0 });
  plot($("#pIbP"), [{ name: "Power drawn", x: F, y: sim.powerW, color: PALETTE[4] }], { title: `Power drawn, ${n} driver${n > 1 ? "s" : ""}`, yLabel: "W", yMin: 0 });
}

// ---------- Door speaker (no box) ----------
export interface DoorData { driverId: string; count: number; notes: string; watts: number; impedance: number; holeMm: number; depthMm: number; spacerMm: number; hpAuto: boolean; hpHz: number }
export function doorDefaults(data: any, d?: Driver): DoorData {
  data.driverId ??= ""; data.count ??= 2; data.notes ??= ""; data.watts ??= 50; data.impedance ??= d?.params.Znom ?? 4;
  data.holeMm ??= 0; data.depthMm ??= 0; data.spacerMm ??= 0; data.hpAuto ??= true; data.hpHz ??= 80;
  return data as DoorData;
}
/** Fit check of a door speaker (research_h 2.2 item 4): driver cut-out vs the hole, mounting depth vs room to the window glass. */
export function doorFit(d: Driver | undefined, data: DoorData): { item: string; text: string; level: "ok" | "warn" | "bad" | "muted" }[] {
  const p = d?.params ?? ({} as any); const out: { item: string; text: string; level: "ok" | "warn" | "bad" | "muted" }[] = [];
  const cut = p.cutout ? p.cutout * 1000 : undefined, depth = p.depth ? p.depth * 1000 : undefined;
  if (!data.holeMm) out.push({ item: "Cut-out", text: "Enter the door's hole diameter to check it.", level: "muted" });
  else if (!cut) out.push({ item: "Cut-out", text: "The driver's cut-out is not published: check its sheet.", level: "muted" });
  else out.push({ item: "Cut-out", text: cut <= data.holeMm + 0.5 ? `Driver needs ${f1(cut, 0)} mm, the hole is ${f1(data.holeMm, 0)} mm: fits${data.holeMm - cut > 10 ? " (use an adapter ring to close the gap)" : ""}.` : `Driver needs ${f1(cut, 0)} mm, the hole is only ${f1(data.holeMm, 0)} mm: enlarge it or use an adapter / spacer ring.`, level: cut <= data.holeMm + 0.5 ? "ok" : "bad" });
  if (!data.depthMm) out.push({ item: "Mounting depth", text: "Measure the room behind the mounting face to the window glass with the window DOWN (and the door-check strap) and enter it.", level: "muted" });
  else if (!depth) out.push({ item: "Mounting depth", text: "The driver's mounting depth is not published: check its sheet.", level: "muted" });
  else { const room = data.depthMm + data.spacerMm; out.push({ item: "Mounting depth", text: `Driver ${f1(depth, 0)} mm, room ${f1(room, 0)} mm (${f1(data.depthMm, 0)} + spacer ${f1(data.spacerMm, 0)}): ${depth <= room - 3 ? "fits" : depth <= room ? "very tight (under 3 mm to spare)" : `${f1(depth - room, 0)} mm too deep: a thicker spacer or a shallower driver`}.`, level: depth <= room - 3 ? "ok" : depth <= room ? "warn" : "bad" }); }
  return out;
}
export function renderDoorPage(host: HTMLElement, it: { name: string; data: any }, ctx: SecCtx) {
  const d = ctx.driverById(it.data.driverId); const data = doorDefaults(it.data, d); const air = ctx.air();
  host.innerHTML = `<div class="cols"><div>
    <fieldset id="doorA"><legend>Door speakers: ${esc(it.name)}</legend>${ctx.driverSelect(data.driverId)}
      <div class="row"><label>Number of speakers</label><input type="number" id="secCount" min="1" step="1" value="${esc(data.count)}"></div>
      <div class="row"><label>Notes</label></div><textarea id="secNotes" rows="3" style="width:100%">${esc(data.notes)}</textarea></fieldset>
    <fieldset id="doorFitF"><legend>Fit check (your measurements)</legend>
      ${field("Hole in the door (diameter)", data, "holeMm", "mm")}${field("Room behind the mounting face, window down", data, "depthMm", "mm")}${field("Spacer / adapter thickness", data, "spacerMm", "mm")}
      <div class="hint">Crutchfield: check window clearance with the window down and the door-check strap; brackets or adapters fit other sizes; top-mount "tends to be easier and requires less mounting depth" (https://www.crutchfield.com/learn/car-speakers-installation.html).</div><div id="doorFitOut"></div></fieldset>
    <fieldset id="doorAmp"><legend>Power and high-pass</legend>${field("Amp power per speaker", data, "watts", "W")}${field("Impedance per speaker", data, "impedance", "Ω")}
      ${field("Pick the high-pass for me (keeps the cone within Xmax)", data, "hpAuto")}${data.hpAuto ? "" : field("High-pass (24 dB/octave)", data, "hpHz", "Hz")}</fieldset>
    <div class="hint">Car midbass, midrange and coaxial speaker data is being gathered (a later job adds it). Until then this list is the bundled driver libraries filtered by size (4 to 8 inch).</div>
  </div><div>
    <fieldset id="doorMount" class="placeholder"><legend>Door mounting: to be decided</legend>
      <p>Left blank on purpose. A car door is not a box, so no box is shown or calculated here. What goes in its place (baffle, sealing, deadening, enclosure in the door) will be added once it is decided.</p></fieldset>
    <div id="doorOut"></div><div class="plots"><div class="plotbox" id="pDoorSpl"></div><div class="plotbox" id="pDoorX"></div></div>
    <fieldset id="doorPS"><legend>PS Sound's view on midbass in doors (their view)</legend>
      <p>PS Sound (UK) say "why we hate midbass in a door": even with the outer skin fully deadened and the inner skin and door card treated, their test door still buzzed with an 80 Hz high-pass and at 130-150 Hz; "it's not just the driver that's playing the wave it's the whole door". They move midbass to kick-panel enclosures, true-IB floor mounts or small sealed enclosures (for example Focal Flex 6.5 in in about 8.5-10 L, crossed at 50-80 Hz). Source: Pssound, "Why We Hate Midbass In a Door", 2023-11-18, 9:49-21:54, https://www.youtube.com/watch?v=ZDzS8tuG62c (auto-generated transcript). This is their view, not a measured rule; other installers treat the door and keep the midbass there.</p></fieldset>
    <h2>Driver</h2>${ctx.facts(d)}
  </div></div>`;
  const ch = () => { ctx.save(); ctx.rerender(); };
  bindFields($("#doorFitF"), data, ch); bindFields($("#doorAmp"), data, ch);
  const sel = $<HTMLSelectElement>("#secDrv"); if (sel) sel.onchange = () => { data.driverId = sel.value; const nd = ctx.driverById(sel.value); if (nd?.params.Znom) data.impedance = nd.params.Znom; ch(); };
  const cnt = $<HTMLInputElement>("#secCount"); cnt.onchange = () => { data.count = Math.max(1, Math.round(Number(cnt.value) || 1)); ctx.save(); };
  const nt = $<HTMLTextAreaElement>("#secNotes"); nt.onchange = () => { data.notes = nt.value; ctx.save(); };
  $("#doorFitOut").innerHTML = `<table class="kv" id="doorFit">${doorFit(d, data).map((r) => `<tr><td>${esc(r.item)}</td><td class="${r.level}">${esc(r.text)}</td></tr>`).join("")}</table>`;
  if (!d) { $("#doorOut").innerHTML = `<p class="muted">Choose a driver to see its response, cone travel and high-pass.</p>`; return; }
  let fp: FullParams; try { if (d.incomplete) throw new Error(`missing ${(d.missing ?? []).join(", ")}`); fp = complete(d.params, air); } catch (e) { $("#doorOut").innerHTML = `<p class="warn">Not enough published data to work out the response of ${esc(d.brand)} ${esc(d.model)}: ${esc((e as Error).message)}</p>`; return; }
  const cfg: IBConfig = { mode: "free", n: 1, cabinLoad: false };
  const Vrms = Math.sqrt(Math.max(0, data.watts) * Math.max(0.1, data.impedance));
  const sug = ibSubsonic(fp, cfg, { Vrms }, air, 250);
  const hp = data.hpAuto ? (isFinite(sug) ? sug : 250) : data.hpHz;
  const Fd = freqs(20, 1000, 48);
  const sim = simulateIB(fp, cfg, { Vrms, hpHz: hp || undefined, hpOrder: 4 }, air, Fd); const raw = simulateIB(fp, cfg, { Vrms }, air, Fd);
  const xm = fp.Xmax * 1000; const maxX = Math.max(...sim.xmm);
  const lim = Fd.map((f) => xmaxSplFree(fp, 1, f, air));
  const at = (arr: number[], f: number) => arr[Math.max(0, Fd.findIndex((x) => x >= f))];
  $("#doorOut").innerHTML = `<h2>Without a box (driver in free air)</h2><table class="kv" id="doorRes">
    <tr><td>Roll-off (no box: the driver's own Fs and Qts)</td><td class="num">Fs ${f1(fp.fs)} Hz, Qts ${f1(fp.Qts, 2)}${fp.Qts < 0.5 ? ": a low-Qts driver gives a thin bass in a door (Lucas/Eminence: 0.7 or above suits free air)" : ""}</td></tr>
    <tr><td>Suggested high-pass</td><td class="num" id="doorHp">${xm ? (data.hpAuto ? (sug === 0 ? "none needed for Xmax at this power" : isFinite(sug) ? `<b>${sug} Hz</b>, 24 dB/octave (lowest that keeps the cone within Xmax at ${data.watts} W)` : `even 250 Hz does not keep the cone within Xmax at ${data.watts} W: reduce the power`) : `${data.hpHz} Hz (yours)${isFinite(sug) && sug > data.hpHz ? `; at least ${sug} Hz keeps the cone within Xmax` : ""}`) : "Xmax not published: cannot pick it"}. PS Sound used 80 Hz in their test door and it still buzzed.</td></tr>
    <tr><td>Max cone travel</td><td class="num ${xm && maxX > xm * 1.001 ? "bad" : "ok"}" id="doorX">${f1(maxX, 2)} mm with the high-pass${xm ? ` / Xmax ${f1(xm, 1)} mm` : ""}</td></tr>
    <tr><td>Displacement-limited SPL (one speaker, free field 1 m)</td><td class="num" id="doorLim">${xm ? `${f1(at(lim, 50), 0)} dB at 50 Hz · ${f1(at(lim, 80), 0)} dB at 80 Hz · ${f1(at(lim, 100), 0)} dB at 100 Hz` : "Xmax not published"}</td></tr>
    <tr><td colspan="2" class="hint">Not worked out on purpose: a door "box" response, door panel vibration and cancellation through the access holes depend on each door and need measuring (REW, Help tab). Source: research_h 2.2.</td></tr></table>`;
  plot($("#pDoorSpl"), [{ name: "Free field with the high-pass", x: Fd, y: sim.free, color: PALETTE[1] }, { name: "without a high-pass", x: Fd, y: raw.free, color: PALETTE[5], dash: "4 3" } as any, ...(xm ? [{ name: "Limit at Xmax", x: Fd, y: lim, color: "#ff6b6b", dash: "5 4" } as any] : [])], { title: `Loudness, one speaker at ${data.watts} W (half space, 1 m)`, yLabel: "dB SPL", xMin: 20, xMax: 1000 });
  plot($("#pDoorX"), [{ name: "Cone travel with the high-pass", x: Fd, y: sim.xmm, color: PALETTE[2] }, { name: "without", x: Fd, y: raw.xmm, color: PALETTE[5], dash: "4 3" } as any], { title: "Cone travel (peak)", yLabel: "mm", yMin: 0, xMin: 20, xMax: 1000, hLines: xm ? [{ y: xm, label: "Xmax", color: "#ff6b6b" }] : [] });
  void units; void fmtU; void SRC_PS_Y6;
}
