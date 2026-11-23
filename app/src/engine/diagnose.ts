// FIX/TWEAK: diagnose an existing box with a (new) driver and simulate fix options (research_c part2 §1).
import { Air, AIR_20C } from "./air";
import { FullParams } from "./driver";
import { Cabin } from "./filters";
import { BoxSpec, Drive, freqs, simulate, SimResult, summarise, Summary } from "./model";
import { PortGeom, portArea, portFb, portLeff, portLengthFor } from "./port";
import { axialModes, BoxGeom, internalDims, netVolume, panelMode, VolumeBreakdown } from "./volume";
import { qb3, sbb4, sealed, sealedVbForQtc } from "./alignments";

export interface ExistingBox { geom: BoxGeom; kind: "sealed" | "vented"; port?: PortGeom; drivers: number; QL?: number; fitted?: FittedBoxSpec }
/** Box values fitted to a measured impedance sweep (engine/boxfit.ts); when present they replace the volume/tuning worked out from the measurements. */
export interface FittedBoxSpec { VbPer: number; fb?: number; QL: number; QA?: number; QP?: number }
export interface Power { wattsPerDriver: number; impedance?: number; Rs?: number; cabin?: Cabin; lowpassHz?: number }
export interface Finding { level: "bad" | "warn" | "info"; title: string; detail: string }
export interface FixOption {
  id: string; title: string; steps: string[];
  box: BoxSpec; drive: Drive; summary: Summary; sim: SimResult; simCabin?: SimResult;
  subsonicHz?: number; notes: string[];
}
export interface Diagnosis { volume: VolumeBreakdown; Vb: number; fb?: number; alpha: number; h?: number; Qtc?: number; fc?: number; findings: Finding[]; options: FixOption[]; air: Air; Vrms: number }

const L = (m3: number) => (m3 * 1000).toFixed(1) + " L";
const cm = (m: number) => (m * 100).toFixed(1) + " cm";
const F = freqs(10, 300, 48);

export function boxSpecFor(ex: ExistingBox, d: FullParams, air: Air): { spec: BoxSpec; vol: VolumeBreakdown; fb?: number } {
  const vol = netVolume(ex.geom, (d as any).displacement ?? 0, ex.drivers, ex.kind === "vented" ? ex.port : undefined);
  const VbPer = vol.acoustic / ex.drivers;
  const ft = ex.fitted;
  if (ft && ex.kind === "vented" && ex.port && ft.fb) {
    const Sv = (portArea(ex.port) * ex.port.count) / ex.drivers;
    const Leff = (air.c ** 2 * Sv) / (4 * Math.PI ** 2 * ft.fb * ft.fb * ft.VbPer);
    return { spec: { kind: "vented", Vb: ft.VbPer, port: { Sv, Leff }, QL: ft.QL, QA: ft.QA, QP: ft.QP }, vol, fb: ft.fb };
  }
  if (ft && ex.kind === "sealed") return { spec: { kind: "sealed", Vb: ft.VbPer, QL: ft.QL, QA: ft.QA }, vol };
  if (ex.kind === "vented" && ex.port) {
    const fb = portFb(ex.port, vol.acoustic, air.c);
    const Sv = (portArea(ex.port) * ex.port.count) / ex.drivers;
    return { spec: { kind: "vented", Vb: VbPer, port: { Sv, Leff: portLeff(ex.port) }, QL: ex.QL ?? 7 }, vol, fb };
  }
  return { spec: { kind: "sealed", Vb: VbPer, QL: ex.QL ?? 100 }, vol };
}

/** Lowest-order-4 subsonic corner that keeps excursion ≤ Xmax up to the bass range (bisection). undefined if not needed; NaN if impossible ≤ 60 Hz. */
export function subsonicFor(d: FullParams, box: BoxSpec, drive: Drive, air: Air): number | undefined {
  if (!(d.Xmax > 0)) return undefined;
  const xm = d.Xmax * 1000;
  const maxX = (hp?: number) => Math.max(...simulate(d, box, { ...drive, hpHz: hp, hpOrder: 4, cabin: undefined }, air, F).xmm);
  if (maxX() <= xm) return undefined;
  if (maxX(60) > xm) return NaN;
  let lo = 5, hi = 60;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (maxX(m) > xm) lo = m; else hi = m; }
  return Math.ceil(hi);
}

export function diagnose(d: FullParams & { displacement?: number }, ex: ExistingBox, pw: Power, air: Air = AIR_20C): Diagnosis {
  const Z = pw.impedance ?? d.Znom;
  const Vrms = Math.sqrt(pw.wattsPerDriver * Z);
  const drive: Drive = { Vrms, Rs: pw.Rs, count: ex.drivers };
  const { spec, vol, fb } = boxSpecFor(ex, d, air);
  const findings: Finding[] = [];
  const options: FixOption[] = [];
  const alpha = d.Vas / spec.Vb;
  const make = (id: string, title: string, steps: string[], box: BoxSpec, notes: string[] = [], autoSub = true): FixOption => {
    let sub = autoSub ? subsonicFor(d, box, drive, air) : undefined;
    const dr: Drive = { ...drive, hpHz: sub && isFinite(sub) ? sub : undefined, hpOrder: 4 };
    const sim = simulate(d, box, dr, air, F);
    const simCabin = pw.cabin?.enabled ? simulate(d, box, { ...dr, cabin: pw.cabin }, air, F) : undefined;
    const n = notes.slice();
    if (sub !== undefined && isNaN(sub)) n.push(`Even a 60 Hz subsonic filter does not keep excursion under Xmax at ${pw.wattsPerDriver} W: reduce power.`);
    else if (sub) steps = [...steps, `Set a subsonic (high-pass) filter at about ${sub} Hz, 24 dB/octave, on the amplifier or DSP.`];
    return { id, title, steps, box, drive: dr, summary: summarise(sim, d), sim, simCabin, subsonicHz: sub && isFinite(sub) ? sub : undefined, notes: n };
  };

  // ---- As found (no filter) ----
  const asFoundSim = simulate(d, spec, drive, air, F);
  const s0 = summarise(asFoundSim, d);
  options.push({ id: "asfound", title: "As it is now", steps: ["Nothing changed."], box: spec, drive, summary: s0, sim: asFoundSim,
    simCabin: pw.cabin?.enabled ? simulate(d, spec, { ...drive, cabin: pw.cabin }, air, F) : undefined, notes: [] });

  let h: number | undefined, Qtc: number | undefined, fc: number | undefined;
  if (spec.kind === "vented" && fb) h = fb / d.fs;
  if (spec.kind === "sealed") { const r = sealed(d.fs, d.Qts, d.Vas, spec.Vb); Qtc = r.Qtc; fc = r.fc; }

  // ---- Findings ----
  if (d.Xmax > 0 && s0.maxXmm > d.Xmax * 1000) {
    findings.push({ level: "bad", title: "Cone over-excursion (rattle / clack)",
      detail: `At ${pw.wattsPerDriver} W per driver the cone moves up to ${s0.maxXmm.toFixed(1)} mm at ${s0.maxXHz.toFixed(0)} Hz; Xmax is ${(d.Xmax * 1000).toFixed(1)} mm. It exceeds Xmax at and below about ${s0.xOverBelow?.toFixed(0)} Hz.` +
        (spec.kind === "vented" && fb ? ` Below the port tuning (${fb.toFixed(1)} Hz) the box stops holding the cone back ("unloading"), so music content there makes it hit its limits.` : "") });
  }
  if (spec.kind === "vented" && s0.maxVport > 17) findings.push({ level: "warn", title: "Port air speed high (port noise / chuffing)",
    detail: `Peak port air speed ${s0.maxVport.toFixed(1)} m/s at ${s0.maxVportHz.toFixed(0)} Hz. A common rule of thumb keeps it under about 17 m/s (rule of thumb; source unverified, research_c §3).` });
  if (s0.peakDb > 1.5) findings.push({ level: "warn", title: "Response peak (boomy / one-note bass)",
    detail: `The response rises ${s0.peakDb.toFixed(1)} dB above the flat level at ${s0.peakHz.toFixed(0)} Hz. That is under-damped: bass "hangs on" and sounds smeared.` });
  if (Qtc && Qtc > 0.9) findings.push({ level: "warn", title: "Sealed box Q too high", detail: `Qtc = ${Qtc.toFixed(2)} (0.707 is flat; above about 0.9 sounds boomy). The box is too small for this driver.` });
  if (Qtc && Qtc < 0.55) findings.push({ level: "info", title: "Sealed box Q low", detail: `Qtc = ${Qtc.toFixed(2)}: tight and well damped, but rolls off early (fc ${fc!.toFixed(0)} Hz). In a car, cabin gain often makes up for this.` });
  if (h !== undefined && h < 0.7) findings.push({ level: "warn", title: "Port tuned far below the driver's resonance",
    detail: `fb ${fb!.toFixed(1)} Hz is ${(h * 100).toFixed(0)} % of fs ${d.fs.toFixed(1)} Hz. With a stiff driver this gives early roll-off and large excursion below fb (research_c part2 §1.3b).` });
  const cycles = (s0.gdAtLowMs / 1000) * s0.f3;
  if (cycles > 1.5) findings.push({ level: "info", title: "Long group delay near the low end",
    detail: `About ${(s0.gdAtLowMs).toFixed(0)} ms (${cycles.toFixed(1)} cycles) at ${s0.f3.toFixed(0)} Hz. Above ~1-1.5 cycles is commonly called audible (threshold unverified).` });
  // box size vs what the driver wants
  const wantVented = d.Qts < 0.383 ? qb3(d.Qts, 7) : sbb4(d.Qts, 7);
  const VbVented = d.Vas / wantVented.alpha;
  const VbSealed = d.Qts < 0.707 ? sealedVbForQtc(d.Qts, d.Vas, 0.707) : NaN;
  findings.push({ level: "info", title: "What this driver wants",
    detail: `Qts ${d.Qts.toFixed(3)}, fs ${d.fs.toFixed(1)} Hz, Vas ${L(d.Vas)}, EBP ${d.EBP.toFixed(0)} (above ~100 suits ported, under ~50 sealed). ` +
      `Ported ${d.Qts < 0.383 ? "QB3" : "SBB4"}: ${L(VbVented)} per driver at ${(wantVented.h * d.fs).toFixed(1)} Hz. ` +
      (isFinite(VbSealed) ? `Sealed Qtc 0.707: ${L(VbSealed)} per driver. ` : "Sealed Qtc 0.707: not reachable (Qts too high). ") +
      `This box gives ${L(spec.Vb)} per driver (${(spec.Vb / VbVented).toFixed(1)}× the ported target).` });
  if (d.Pe > 0 && pw.wattsPerDriver > d.Pe) findings.push({ level: "warn", title: "Power above the driver's rating", detail: `${pw.wattsPerDriver} W per driver vs Pe ${d.Pe} W.` });
  // standing waves & panels
  const lp = pw.lowpassHz ?? 80;
  if (ex.geom.chord) {
    const fm = air.c / (2 * ex.geom.chord);
    findings.push({ level: fm < 2 * lp ? "warn" : "info", title: "Internal standing waves",
      detail: `Longest straight line inside this shape: ${(ex.geom.chord * 1000).toFixed(0)} mm, so the first standing wave is about ${fm.toFixed(0)} Hz (c/2L). With a ${lp} Hz low-pass ` +
        (fm < 2 * lp ? "it is close to the passband: line the walls with 25 mm of fibre (keep it clear of the port)." : "it is well above the bass band.") });
  } else {
    const modes = axialModes(ex.geom, air.c);
    const lowMode = Math.min(modes.W, modes.H, modes.D);
    findings.push({ level: lowMode < 2 * lp ? "warn" : "info", title: "Internal standing waves",
      detail: `First internal modes: width ${modes.W.toFixed(0)} Hz, height ${modes.H.toFixed(0)} Hz, depth ${modes.D.toFixed(0)} Hz. With a ${lp} Hz low-pass ` +
        (lowMode < 2 * lp ? "the lowest one is close to the passband: line the walls with 25 mm of fibre (keep it clear of the port)." : "they are well above the bass band.") });
  }
  if (ex.geom.panels && ex.geom.panels.length === 0) {
    findings.push({ level: "info", title: "Panel resonance", detail: "Not calculated: this box has no flat wood panels (fibreglass or curved shell). Curved fibreglass is stiff; flat fibreglass areas can flex, so add thickness or ribs there." });
  } else {
    const { Wi, Hi, Di } = internalDims(ex.geom);
    const list = ex.geom.panels ?? [{ name: "", a: Wi, b: Hi, t: ex.geom.t }, { name: "", a: Wi, b: Di, t: ex.geom.t }, { name: "", a: Hi, b: Di, t: ex.geom.t }];
    const modesP = list.map((q) => ({ name: q.name, hz: panelMode(q.a, q.b, q.t) }));
    const worst = modesP.reduce((a, b) => (b.hz < a.hz ? b : a));
    const pmin = worst.hz;
    findings.push({ level: pmin < 200 ? "warn" : "info", title: "Panel resonance",
      detail: `Largest unbraced panel's${worst.name ? ` (${worst.name})` : ""} first mode ≈ ${pmin.toFixed(0)} Hz (MDF values assumed, simply supported${ex.geom.panels ? ", rectangle around the panel" : ""}; unverified material data). ` +
        (pmin < 200 ? "Add a brace across the middle of the largest panels; a rattle that stays at one note is often a panel or loose part." : "") });
  }
  findings.push({ level: "info", title: "Mechanical checks (do these first, they cost nothing)",
    detail: "Driver screws tight and gasket sealed; terminal cup and port sealed; no wires touching the cone or basket; no loose items or fill touching the cone; listen for hissing leaks with a low tone." });

  // ---- Options ----
  options.push(make("subsonic", "Keep everything, add a subsonic filter", ["Box unchanged."], spec, [], true));
  if (spec.kind === "vented" && ex.port) {
    // re-tune: scan fb, choose lowest f3 with peak ≤ 1 dB
    // figure of merit: lowest f3 AFTER the subsonic filter each tuning needs to stay within Xmax, peak ≤ 1 dB
    let best: { fb: number; s: Summary } | undefined;
    for (let f = Math.max(15, 0.6 * d.fs); f <= 2 * d.fs; f += 1) {
      const Sv = spec.port!.Sv, Leff = (air.c ** 2 * Sv) / (4 * Math.PI ** 2 * f * f * spec.Vb);
      const box = { ...spec, port: { Sv, Leff } };
      const sub = subsonicFor(d, box, drive, air);
      if (sub !== undefined && isNaN(sub)) continue;
      const s = summarise(simulate(d, box, { ...drive, hpHz: sub, hpOrder: 4 }, air, F), d);
      if (s.peakDb <= 1.0 && (!best || s.f3 < best.s.f3 - 0.05)) best = { fb: f, s };
    }
    if (best) {
      const newL = portLengthFor(ex.port, spec.Vb * ex.drivers, best.fb, air.c);
      const depth = ex.geom.portRoom ?? internalDims(ex.geom).Di;
      const Sv = spec.port!.Sv, Leff = (air.c ** 2 * Sv) / (4 * Math.PI ** 2 * best.fb * best.fb * spec.Vb);
      const notes: string[] = [];
      if (newL < 0.02) notes.push("The needed port is shorter than 2 cm: use a smaller port area instead.");
      if (newL > depth - 0.05) notes.push(`The port (${cm(newL)}) is longer than fits straight in the box (${cm(depth)} deep): use an elbow, a slot along a wall, or a smaller area.`);
      options.push(make("retune", `Re-tune the port to ${best.fb.toFixed(1)} Hz (same box)`,
        [`Change each port's physical length from ${cm(ex.port.length)} to ${cm(newL)} (same diameter/size). Shorter raises the tuning; longer lowers it.`],
        { ...spec, port: { Sv, Leff } }, notes));
    }
    const sealedSpec: BoxSpec = { kind: "sealed", Vb: spec.Vb, QL: 100 };
    const sr = sealed(d.fs, d.Qts, d.Vas, spec.Vb);
    options.push(make("block", "Block the port (box becomes sealed)",
      [`Plug every port airtight and rigid (wood plug, glued and sealed).`, `Result: Qtc ${sr.Qtc.toFixed(2)}, fc ${sr.fc.toFixed(1)} Hz.`],
      sealedSpec, sr.Qtc < 0.6 ? ["Low Qtc: very controlled; in a car, cabin gain fills in the low end."] : []));
  }
  if (isFinite(VbSealed) && VbSealed < spec.Vb) {
    const ins = (spec.Vb - VbSealed) * ex.drivers;
    options.push(make("sealed707", "Sealed, reduced to Qtc 0.707 with inserts",
      [...(spec.kind === "vented" ? ["Plug the port airtight."] : []), `Add ${L(ins)} of solid inserts (sealed wood blocks / sealed sub-box; foam or fibre does NOT count) so the net volume is ${L(VbSealed * ex.drivers)}.`],
      { kind: "sealed", Vb: VbSealed, QL: 100 }));
  }
  if (VbVented < spec.Vb && ex.port) {
    const fbT = wantVented.h * d.fs;
    const newL = portLengthFor(ex.port, VbVented * ex.drivers, fbT, air.c);
    const Sv = (portArea(ex.port) * ex.port.count) / ex.drivers;
    const Leff = (air.c ** 2 * Sv) / (4 * Math.PI ** 2 * fbT * fbT * VbVented);
    options.push(make("ventedTarget", `Ported ${d.Qts < 0.383 ? "QB3" : "SBB4"}, reduced with inserts`,
      [`Add ${L((spec.Vb - VbVented) * ex.drivers)} of solid inserts so the net volume is ${L(VbVented * ex.drivers)}.`, `Set port length to ${cm(newL)} for ${fbT.toFixed(1)} Hz.`],
      { kind: "vented", Vb: VbVented, port: { Sv, Leff }, QL: 7 }, newL < 0.02 ? ["Port would be under 2 cm: use a smaller port area."] : []));
  }
  return { volume: vol, Vb: spec.Vb, fb, alpha, h, Qtc, fc, findings, options, air, Vrms };
}
