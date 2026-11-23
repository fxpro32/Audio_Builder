// Design new: transmission line (A15_TLINE, R36). Inputs, simulation, comparison with a sealed and a ported box, panels.
// Engine: engine/tline.ts (line model) and engine/tlfold.ts (folded box, starting design). Method and sources: docs/tline_help.md.
import { Air } from "../engine/air";
import { sealedVbForQtc } from "../engine/alignments";
import { FullParams } from "../engine/driver";
import { Cabin } from "../engine/filters";
import { freqs, simulate } from "../engine/model";
import { portLeff, portLengthFor } from "../engine/port";
import { maxSplCurve, simulateTL, TLResult } from "../engine/tline";
import { DriverDims, foldLine, suggestTL, TLGeom, TLSuggestion } from "../engine/tlfold";
import { esc, f1, field, fmtL, fmtMm, fmtU } from "./dom";
import { TLDesign } from "./model";

export const TL_ID = "tl";
export const TL_NAME = "Transmission line (quarter-wave)";
/** The reference boxes for the Pioneer TS-W3002D4 (R35/R36): the sealed box after 1,845 mm of 90×45 wood (30.3 − 7.47 = 22.83 L
 * gross) and Pioneer's recommended ported box (manual p.2: 34.0 L gross incl. the driver, 76 mm round port 89 mm long). */
const PIONEER = "pioneer-ts-w3002d4";

/** A complete TL design for this driver (suggested line + comparison boxes). */
export function tlDefaults(fp: FullParams, dims: DriverDims, n: number, tMm: number, driverId: string | undefined, air: Air): { tl: TLDesign; sug: TLSuggestion } {
  const sug = suggestTL(fp, dims, { count: n, t: tMm, air });
  const b = sug.box; const dispL = dims.disp * 1000 * n;
  const sealedGross = Math.round((sealedVbForQtc(fp.Qts, fp.Vas, 0.707) > 0 ? sealedVbForQtc(fp.Qts, fp.Vas, 0.707) * 1000 * n : fp.Vas * 1000 * n) * 10 + dispL * 10) / 10;
  const tl: TLDesign = { W: b.W, H: b.H, D: b.D, channels: b.channels, taper: b.taper, driverY: 0, stuffKgM3: b.stuffKgM3, stuffPct: b.stuffPct, subHz: 0,
    cmpSealedL: sealedGross, cmpPortedL: Math.round((sug.VbL + dispL) * 10) / 10, cmpPortD: 100, cmpPortLen: 0 };
  if (driverId === PIONEER && n === 1) Object.assign(tl, { cmpSealedL: 22.83, cmpPortedL: 34.0, cmpPortD: 76, cmpPortLen: 89 });
  return { tl, sug };
}

export function tlFieldsHtml(tl: TLDesign, thicknessField: string): string {
  return `<fieldset id="dsT"><legend>Transmission line (folded inside a box)</legend>
    ${field("Width (outside)", tl, "W", "mm")}${field("Height (outside)", tl, "H", "mm")}${field("Depth (outside)", tl, "D", "mm")}
    ${thicknessField}
    ${field("Channels (folds + 1)", tl, "channels", "", { step: 1, min: 1, title: "Upright channels side by side from the front to the back; the line runs up, over a divider, down, under the next, and so on" })}
    ${field("Taper: last channel ÷ first", tl, "taper", "", { step: 0.05, min: 0.05, title: "Taper ratio S_L/S_0: under 1 = the line gets narrower towards the open end (King 2021: tapered lines give the smoothest response)" })}
    ${field("Driver height (centre above inside bottom, 0 = auto)", tl, "driverY", "mm", { title: "Where the driver sits along the first channel, from the closed end. Auto: about a fifth of the line length (an offset damps the 3/4-wave ripple)" })}
    ${field("Stuffing density (polyester fibre)", tl, "stuffKgM3", "kg/m³", { title: "King's model is for polyester fibre (Dacron Hollofil II). 8 kg/m³ = 0.5 lb/ft³" })}
    ${field("Stuffed part of the line, from the closed end", tl, "stuffPct", "%")}
    ${field("Subsonic filter (4th order, 0 = off)", tl, "subHz", "Hz")}
    <div class="toolbar"><button id="tlSuggest" title="Replace the sizes above with a starting line worked out for this driver (King 2021 method)">Suggest a line for this driver</button></div>
  </fieldset>
  <fieldset id="dsTc"><legend>Compare with (same driver, same amp power, in the car)</legend>
    ${field("Sealed box: gross inside volume (incl. driver)", tl, "cmpSealedL", "L")}
    ${field("Ported box: gross inside volume (incl. driver and port)", tl, "cmpPortedL", "L")}
    ${field("Ported box: round port diameter", tl, "cmpPortD", "mm")}${field("Ported box: port length (0 = tuned like the alignment)", tl, "cmpPortLen", "mm")}
  </fieldset>`;
}

export interface CmpCurve { name: string; f: number[]; spl: number[]; max: number[]; color: string; info: string }
export interface TLRun { g: TLGeom; free: TLResult; car: TLResult; cmp: CmpCurve[]; carOn: boolean; xmaxMm: number; Vrms: number; Vpe: number }
/** Simulate the line (free field and in the car) and the comparison boxes. */
export function runTL(fp: FullParams & { displacement?: number }, dims: DriverDims, tl: TLDesign, tMm: number, n: number, watts: number, imp: number, cabin: Cabin | undefined, air: Air, palette: string[]): TLRun {
  const g = foldLine({ ...tl, t: tMm, count: n }, dims);
  const F = freqs(10, 300, 48); const Vrms = Math.sqrt(watts * imp); const Vpe = Math.sqrt((fp.Pe || 0) * imp);
  const hp = tl.subHz > 0 ? { hpHz: tl.subHz, hpOrder: 4 } : {};
  const free = simulateTL(fp, g.spec, { Vrms, count: n, ...hp }, air, F);
  const carOn = !!cabin?.enabled;
  const car = simulateTL(fp, g.spec, { Vrms, count: n, cabin, ...hp }, air, F);
  const xm = (fp.Xmax || 0) * 1000;
  const cmp: CmpCurve[] = [];
  const mx = (r: { spl: number[]; xmm: number[] }) => maxSplCurve(r.spl, r.xmm, Vrms, xm, Vpe).spl;
  cmp.push({ name: "Transmission line", f: car.f, spl: car.spl, max: mx(car), color: palette[2], info: `${fmtL(g.netL)} net, ${fmtL(g.outerL, 0)} outside` });
  const disp = (fp.displacement ?? 0) * n;
  const sNet = tl.cmpSealedL / 1000 - disp;
  if (sNet > 0) { const r = simulate(fp, { kind: "sealed", Vb: sNet / n, QL: 100 }, { Vrms, count: n, cabin, ...hp }, air, F); cmp.push({ name: `Sealed ${f1(tl.cmpSealedL, 1)} L`, f: r.f, spl: r.spl, max: mx(r), color: palette[1], info: `${fmtL(sNet * 1000)} net` }); }
  const pr = tl.cmpPortD / 2000; const Sv = Math.PI * pr * pr;
  let pNet = tl.cmpPortedL / 1000 - disp; let len = tl.cmpPortLen / 1000;
  if (!(len > 0)) len = Math.max(0.02, portLengthFor({ shape: "round", count: 1, d: 2 * pr, length: 0.1 }, Math.max(1e-4, pNet), tl.cmpPortedL > 0 ? suggestFb(fp) : 30, air.c));
  pNet -= Math.PI * (pr + 0.003) ** 2 * len;
  if (pNet > 0 && Sv > 0) {
    const Leff = portLeff({ shape: "round", count: 1, d: 2 * pr, length: len }); const fb = (air.c / (2 * Math.PI)) * Math.sqrt(Sv / (pNet * Leff));
    const r = simulate(fp, { kind: "vented", Vb: pNet / n, port: { Sv: Sv / n, Leff }, QL: 7 }, { Vrms, count: n, cabin, ...hp }, air, F);
    const vmax = Math.max(...r.vport.filter((_, i) => r.f[i] <= 120));
    cmp.push({ name: `Ported ${f1(tl.cmpPortedL, 1)} L`, f: r.f, spl: r.spl, max: mx(r), color: palette[5], info: `${fmtL(pNet * 1000)} net, port Ø ${fmtMm(tl.cmpPortD)} × ${fmtMm(Math.round(len * 1000))} tuned to ${f1(fb)} Hz, peak port air speed ${f1(vmax)} m/s` });
  }
  return { g, free, car, cmp, carOn, xmaxMm: xm, Vrms, Vpe };
}
const suggestFb = (fp: FullParams) => fp.fs; // SBB4/BB4 tune at fs (h = 1); QB3 a little higher: the comparison only needs a sensible default

export const CMP_FREQS = [20, 25, 30, 40, 50, 63, 80];
const at = (f: number[], y: number[], a: number) => { let k = 0; for (let i = 0; i < f.length; i++) if (Math.abs(f[i] - a) < Math.abs(f[k] - a)) k = i; return y[k]; };
export function cmpTableHtml(r: TLRun): string {
  const head = `<tr><th>${r.carOn ? "In the car" : "Free field (cabin gain is off in this project)"}</th>${CMP_FREQS.map((f) => `<th>${f} Hz</th>`).join("")}</tr>`;
  const rows = r.cmp.map((c) => `<tr><td><b>${esc(c.name)}</b><br><span class="muted">${esc(c.info)}</span></td>${CMP_FREQS.map((f) => `<td class="num">${f1(at(c.f, c.spl, f), 1)}<br><span class="muted">max ${f1(at(c.f, c.max, f), 1)}</span></td>`).join("")}</tr>`).join("");
  return `<h2>Compared</h2><table id="tlCmp"><tr><td colspan="${CMP_FREQS.length + 1}" class="muted">dB SPL at 1 m with ${f1(r.Vrms, 1)} V (the amp power above); "max" = the most before the cone reaches Xmax or the rated power (${f1(r.Vpe, 1)} V), whichever comes first.</td></tr>${head}${rows}</table>`;
}

export function tlResultHtml(r: TLRun, sug: TLSuggestion | undefined, fp: FullParams, dims: DriverDims, n: number, tMm: number, tl: TLDesign): string {
  const g = r.g; const dispL = dims.disp * 1000 * n; const tune = r.free.tuningHz;
  const vt = Math.max(...r.free.vterm.filter((_, i) => r.free.f[i] <= 150));
  const xmax = Math.max(...r.free.xmm.filter((_, i) => r.free.f[i] <= 150));
  const xHz = r.free.f[r.free.xmm.indexOf(xmax)];
  const depths = g.depths.map((d) => fmtMm(Math.round(d * 1000))).join(", ");
  const suit = sug?.suit;
  return `<h2>Result: transmission line</h2><table class="kv" id="tlOut">
    ${suit ? `<tr><td colspan="2" class="${suit.level === "poor" ? "bad" : suit.level === "fair" ? "warn" : "ok"}" id="tlSuit">${esc(suit.text)}</td></tr>` : ""}
    <tr><td>Line length (centre line)</td><td class="num"><b>${fmtMm(Math.round(g.length * 1000))}</b> in ${tl.channels} channel${tl.channels > 1 ? "s" : ""} (${tl.channels - 1} fold${tl.channels === 2 ? "" : "s"})</td></tr>
    <tr><td>Line tuning (where the cone stops moving)</td><td class="num" id="tlTune"><b>${tune ? f1(tune) + " Hz" : "no clear dip"}</b>${sug ? ` · alignment target ${f1(sug.fb)} Hz` : ""}</td></tr>
    <tr><td>Channel depths, front to back</td><td class="num">${depths} (taper ${f1(tl.taper, 2)})</td></tr>
    <tr><td>Line area: closed end → open end</td><td class="num">${fmtU(g.Wi * g.depths[0] * 1e4, "cm²")} (${f1((g.Wi * g.depths[0]) / fp.Sd / n, 2)} × Sd) → ${fmtU(g.terminus.areaM2 * 1e4, "cm²")} (${f1(g.terminus.areaM2 / fp.Sd / n, 2)} × Sd)</td></tr>
    <tr><td>Net air inside</td><td class="num" id="tlNet"><b>${fmtL(g.netL)}</b> = gross ${fmtL(g.grossL)} − dividers ${fmtL(g.grossL - g.netL - dispL, 2)} − driver${n > 1 ? "s" : ""} ${fmtL(dispL, 2)}${dispL ? "" : ' <span class="warn">(driver displacement not entered)</span>'}</td></tr>
    <tr><td>Outside size</td><td class="num" id="tlSize"><b>${fmtMm(tl.W)} × ${fmtMm(tl.H)} × ${fmtMm(tl.D)}</b> (W × H × D) = ${fmtL(g.outerL, 1)} outside, ${fmtMm(tMm, 1)} panels</td></tr>
    <tr><td>Driver</td><td class="num">${n} on the front baffle over channel 1, centre ${fmtMm(Math.round((g.driverY + tMm / 1000) * 1000))} above the outside bottom${g.driverAuto ? " (auto)" : ""}</td></tr>
    <tr><td>Open end (terminus)</td><td class="num">${fmtMm(Math.round(g.terminus.w * 1000))} × ${fmtMm(Math.round(g.terminus.h * 1000))} in the ${g.terminus.where === "top" ? "top panel, at the back" : "back panel, at the bottom"} · peak air speed <span class="${vt > 17 ? "warn" : "ok"}">${f1(vt)} m/s</span></td></tr>
    <tr><td>Max cone travel (to 150 Hz)</td><td class="num ${r.xmaxMm && xmax > r.xmaxMm ? "bad" : ""}">${f1(xmax)} mm at ${f1(xHz, 0)} Hz${r.xmaxMm ? ` / Xmax ${f1(r.xmaxMm)}` : ""}${r.xmaxMm && xmax > r.xmaxMm && xHz < (tune ?? 30) ? " (below the tuning the line stops holding the cone: use the subsonic filter)" : ""}</td></tr>
    ${sug ? `<tr><td>Starting design (King 2021)</td><td class="num">${esc(sug.alignment)}: ${fmtL(sug.VbL)} at ${f1(sug.fb)} Hz → line ${fmtMm(Math.round(sug.Lm * 1000))}, taper ${f1(sug.TRbuilt, 2)}</td></tr>` : ""}
    ${[...(sug?.notes ?? [])].map((x) => `<tr><td colspan="2" class="muted">${esc(x)}</td></tr>`).join("")}
    ${g.notes.map((x) => `<tr><td colspan="2" class="warn">${esc(x)}</td></tr>`).join("")}
    ${g.bad.map((x) => `<tr><td colspan="2" class="bad">${esc(x)}</td></tr>`).join("")}
  </table>
  <div class="hint">Simulated as a 1-D acoustic line (engine/tline.ts): short duct elements chained from the closed end to the open end along the folded centre line, stuffing as King's viscous damping (polyester fibre), the open end as a piston in a baffle. Not modelled: the bends' own effects, sound leaking through the dividers, the box walls flexing. The driver's outer size, cut-out and mounting depth come from its data or are estimated from Sd (Drivers tab).</div>`;
}

/** 3D model fields for view3d (metres). */
export function tl3D(g: TLGeom, dims: DriverDims, n: number, tMm: number) {
  const t = tMm / 1000;
  return { items: g.driverXs.map((x) => ({ x, y: g.driverY + t, pr: false })), drivers: { count: n, outer: dims.outer, cutout: dims.cutout, depth: dims.depth },
    tl: { dividers: g.dividers, terminus: { where: g.terminus.where, w: g.terminus.w, h: g.terminus.h, z0: g.terminus.z0 }, path: g.path, stuffLen: g.stuffLen } };
}

export function tlHelpHtml(): string {
  return `<h2 id="helpTL">Transmission line (quarter-wave)</h2>
  <p>Design new → Box type <b>${TL_NAME}</b>. The driver's back fires into a long folded channel (the line) that is closed at the driver end and open at the far end. Near the line's quarter-wave frequency the air in it resonates: the cone almost stops moving and the open end does the work, like a port. Below that the cone and the open end work against each other and the output falls fast, as in a ported box.</p>
  <ul><li>Choosing the type fills in a starting line for your driver (button <b>Suggest a line for this driver</b> does it again): volume and tuning from the ported alignment for the driver's Qts, length from the tuning and the taper (King 2021), laid out in upright channels behind the front baffle.</li>
  <li>Edit the outside width, height and depth, the number of channels, the taper, the stuffing and the driver height: the line is worked out again from them (channel depths from the depth, line length from the height and the folds) and the curves follow. Keep the volume (Design new, sealed/ported) does not apply here: the tuning comes from the line's length, not only its volume.</li>
  <li>The verdict at the top says, in plain words, whether the driver suits a line (Qts and EBP = fs/Qes). A transmission line behaves much like a ported box of the same volume and tuning (King 2021): it does not make bass out of nothing. Its strengths: lower cone travel near the tuning and a much slower air speed at the open end than in a port.</li>
  <li><b>Compared</b> table and plot: the line, a sealed box and a ported box with the same driver and amp power, in the car (the project's cabin gain) with the most each can play before Xmax or the rated power. For the Pioneer TS-W3002D4 the defaults are your current sealed box (22.83 L gross after the wood) and Pioneer's recommended ported box (34.0 L, 76 mm port 89 mm long).</li>
  <li>3D: the right-hand side panel is see-through; the orange line is the air path, yellow where it is stuffed. The open end is the dark opening. The panels (sides, top, bottom, baffle, back and the dividers) go to the Cut list and the <b>Boards</b> tab.</li>
  <li>Stuffing: King's model is for polyester fibre (Dacron Hollofil II), 0 to about 16 kg/m³ (1 lb/ft³). More stuffing smooths the ripple above the tuning but takes away deep bass.</li></ul>
  <p>Method, formulas, sources and the checks against published results: docs/tline_help.md; research: references/research_g_transmission_line.md.</p>`;
}
