// Drivers tab: work out a driver's T/S values from REW impedance sweeps (free air + added mass or known sealed box) and save
// them as a NEW private driver "<model> (measured <date>)"; the original entry is never changed. A5_REW.
import { Air } from "../engine/air";
import { complete, Driver } from "../engine/driver";
import { simulate, freqs } from "../engine/model";
import { CoilWiring, Curve, extractTS, TSResult, WIRING_TEXT } from "../engine/measure";
import { parseMeasurement } from "../io/rew";
import { slug } from "../io/wdr";
import { $, esc, f1 } from "./dom";
import { importOne, MeasCtx } from "./measure";
import { plot, PALETTE } from "./plot";

const st = { method: "mass" as "none" | "mass" | "box", massG: 0, boxL: 0, ReDC: 0, SdCm2: 0, wiring: "single" as CoilWiring, target: "single" as CoilWiring, date: new Date().toISOString().slice(0, 10), keep: true };
let free: { c: Curve; name: string; text: string } | undefined, second: { c: Curve; name: string; text: string } | undefined, last: TSResult | undefined, lastFor = "";

export function tsToolHtml(d: Driver) {
  if (lastFor !== d.id) { last = undefined; free = undefined; second = undefined; lastFor = d.id; st.SdCm2 = d.params.Sd ? +(d.params.Sd * 1e4).toFixed(1) : 0; }
  return `<fieldset id="tsm"><legend>Measure this driver's T/S values (REW impedance sweeps)</legend>
  <div class="hint">Sweep the driver in free air (held still, cone vertical, away from walls), then either with a known added mass on the cone or mounted in a known airtight sealed box. Export each sweep from REW as text. Formulas: Small's impedance method, added-mass and closed-box methods (sources in the Help tab). The result is saved as a <b>new private driver</b>; this entry is not changed.</div>
  <div class="row"><label>Free-air sweep (impedance)</label><input type="file" id="tsFree" accept=".txt,.zma,.dat,.csv"><span class="u">${free ? esc(free.name) : ""}</span></div>
  <div class="row"><label>Second sweep for Vas</label><select id="tsMethod"><option value="mass" ${st.method === "mass" ? "selected" : ""}>Added mass on the cone</option><option value="box" ${st.method === "box" ? "selected" : ""}>Known sealed box</option><option value="none" ${st.method === "none" ? "selected" : ""}>None (keep the sheet's Vas)</option></select><span class="u"></span></div>
  ${st.method === "mass" ? `<div class="row" title="Weigh it on a good scale (0.1 g). About half the expected Mms (REW help)."><label>Added mass</label><input type="number" step="any" id="tsMass" value="${st.massG || ""}"><span class="u">g</span></div>` : ""}
  ${st.method === "box" ? `<div class="row" title="Net air volume of the test box with the driver in it (a little less than the expected Vas, REW help)"><label>Test box net volume</label><input type="number" step="any" id="tsBox" value="${st.boxL || ""}"><span class="u">L</span></div>` : ""}
  ${st.method !== "none" ? `<div class="row"><label>${st.method === "mass" ? "Added-mass sweep" : "Sealed-box sweep"}</label><input type="file" id="tsSecond" accept=".txt,.zma,.dat,.csv"><span class="u">${second ? esc(second.name) : ""}</span></div>` : ""}
  <div class="row" title="Measure the coil's DC resistance with a meter (same wiring as the sweep), minus the meter leads' own reading. Leave empty to estimate it from the curve (marked as estimated)."><label>DC resistance Re (meter)</label><input type="number" step="any" id="tsRe" value="${st.ReDC || ""}" placeholder="estimate from curve"><span class="u">Ω</span></div>
  <div class="row" title="Effective cone area: cone plus about 1/3 to 1/2 of the surround width (REW help)"><label>Sd (cone area)</label><input type="number" step="any" id="tsSd" value="${st.SdCm2 || ""}"><span class="u">cm²</span></div>
  <div class="row"><label>Voice coils during the sweeps</label><select id="tsW">${Object.entries(WIRING_TEXT).map(([k, t]) => `<option value="${k}" ${k === st.wiring ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="u"></span></div>
  <div class="row" title="Dual voice coil: which wiring the saved values describe (two identical coils assumed)"><label>Save the values for</label><select id="tsT">${Object.entries(WIRING_TEXT).map(([k, t]) => `<option value="${k}" ${k === st.target ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="u"></span></div>
  <div class="row"><label>Date measured</label><input type="date" id="tsDate" value="${esc(st.date)}"><span class="u"></span></div>
  <div class="row"><label>Also keep the sweeps in the current project's measurements</label><input type="checkbox" id="tsKeep" ${st.keep ? "checked" : ""}><span class="u"></span></div>
  <div class="toolbar"><button class="primary" id="tsCalc">Work out T/S</button></div>
  <div id="tsOut"></div><div class="plotbox" id="tsPlot"></div></fieldset>`;
}

export function bindTsTool(d: Driver, ctx: MeasCtx & { air: () => Air; saveDriver: (nd: Driver) => Promise<void> }, rerender: () => void) {
  if (!$("#tsm")) return;
  const num = (id: string) => parseFloat($<HTMLInputElement>(id)?.value ?? "") || 0;
  const read = () => {
    st.method = $<HTMLSelectElement>("#tsMethod").value as any; st.massG = num("#tsMass") || st.massG; st.boxL = num("#tsBox") || st.boxL; st.ReDC = num("#tsRe"); st.SdCm2 = num("#tsSd");
    st.wiring = $<HTMLSelectElement>("#tsW").value as CoilWiring; st.target = $<HTMLSelectElement>("#tsT").value as CoilWiring; st.date = $<HTMLInputElement>("#tsDate").value; st.keep = $<HTMLInputElement>("#tsKeep").checked;
  };
  $<HTMLSelectElement>("#tsMethod").onchange = () => { read(); second = undefined; last = undefined; rerender(); };
  $("#tsm").querySelectorAll("input:not([type=file]),select:not(#tsMethod)").forEach((el) => el.addEventListener("change", read));
  const loadFile = async (inp: HTMLInputElement | null, set: (v: { c: Curve; name: string; text: string }) => void) => {
    if (!inp) return;
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      try { const text = await file.text(); const m = parseMeasurement(text, file.name, "impedance"); set({ c: { f: m.f, mag: m.mag, phase: m.phase }, name: file.name, text }); read(); rerender(); }
      catch (e) { $("#tsOut").innerHTML = `<p class="bad">${esc(file.name)}: ${esc((e as Error).message)}</p>`; }
    };
  };
  loadFile($<HTMLInputElement>("#tsFree"), (v) => (free = v));
  loadFile($<HTMLInputElement>("#tsSecond"), (v) => (second = v));
  if (last) show(d, ctx);
  $("#tsCalc").onclick = () => {
    read();
    if (!free) { $("#tsOut").innerHTML = '<p class="bad">Choose the free-air sweep file.</p>'; return; }
    if (!(st.SdCm2 > 0)) { $("#tsOut").innerHTML = '<p class="bad">Enter Sd (cone area).</p>'; return; }
    if (st.method !== "none" && !second) { $("#tsOut").innerHTML = `<p class="bad">Choose the ${st.method === "mass" ? "added-mass" : "sealed-box"} sweep, or pick "None".</p>`; return; }
    if (st.method === "mass" && !(st.massG > 0)) { $("#tsOut").innerHTML = '<p class="bad">Enter the added mass in grams.</p>'; return; }
    if (st.method === "box" && !(st.boxL > 0)) { $("#tsOut").innerHTML = '<p class="bad">Enter the test box net volume in litres.</p>'; return; }
    try {
      last = extractTS({ free: free.c, ReDC: st.ReDC || undefined, Sd: st.SdCm2 * 1e-4, wiring: st.wiring, target: st.target, air: ctx.air(),
        addedMass: st.method === "mass" ? { kg: st.massG / 1000, curve: second!.c } : undefined, closedBox: st.method === "box" ? { Vb: st.boxL / 1000, curve: second!.c } : undefined });
      show(d, ctx);
    } catch (e) { last = undefined; $("#tsOut").innerHTML = `<p class="bad">${esc((e as Error).message)}</p>`; }
  };
}

function show(d: Driver, ctx: MeasCtx & { air: () => Air; saveDriver: (nd: Driver) => Promise<void> }) {
  const r = last!; const P = d.params as any;
  const U: Record<string, [string, number, number]> = { Re: ["Ω", 1, 2], fs: ["Hz", 1, 2], Qms: ["", 1, 2], Qes: ["", 1, 3], Qts: ["", 1, 3], Le: ["mH", 1000, 2], Vas: ["L", 1000, 1], Mms: ["g", 1000, 1], Cms: ["mm/N", 1000, 3], Bl: ["T·m", 1, 2], Rms: ["kg/s", 1, 2] };
  let sheetQts = NaN; try { sheetQts = complete(d.params, ctx.air()).Qts; } catch { /* incomplete */ }
  const sheet = (k: string) => (k === "Qts" ? sheetQts : P[k]);
  $("#tsOut").innerHTML = `<h3>Measured T/S (saved as: ${esc(WIRING_TEXT[st.target])})</h3><table><tr><th>Value</th><th>Measured</th><th>This entry</th><th>Diff</th><th>How</th></tr>
    ${r.rows.map((row) => { const [u, m, dp] = U[row.key] ?? ["", 1, 3]; const s = sheet(row.key); const diff = s > 0 ? ((row.value - s) / s) * 100 : NaN;
      return `<tr><td>${row.key}</td><td class="num"><b>${(row.value * m).toFixed(dp)}</b> ${u}</td><td class="num">${s > 0 ? (s * m).toFixed(dp) + " " + u : "–"}</td><td class="num ${Math.abs(diff) > 10 ? "warn" : ""}">${isFinite(diff) ? (diff > 0 ? "+" : "") + diff.toFixed(0) + " %" : ""}</td><td class="muted">${esc(row.how)}</td></tr>`; }).join("")}</table>
    ${r.notes.map((n) => `<div class="hint">${esc(n)}</div>`).join("")}
    <div class="toolbar"><button class="primary" id="tsSave">Save as new private driver "${esc(d.model)} (measured ${esc(st.date)})"</button></div>`;
  // plot: measured sweeps + the model with the measured values
  const series = [{ name: "Free air (measured)", x: free!.c.f, y: free!.c.mag, color: "#ff4fd8", dash: "2 3" }];
  if (second) series.push({ name: (st.method === "mass" ? "Added mass" : "Sealed box") + " (measured)", x: second.c.f, y: second.c.mag, color: "#00e5ff", dash: "2 3" });
  try {
    const fp = complete({ fs: r.fs, Re: r.Re, Qms: r.Qms, Qes: r.Qes, Sd: st.SdCm2 * 1e-4, Vas: r.Vas ?? d.params.Vas ?? 0.05, Le: r.Le }, ctx.air());
    const F = freqs(Math.max(5, free!.c.f[0]), Math.min(1000, free!.c.f[free!.c.f.length - 1]), 48);
    if (st.wiring === st.target || st.wiring === "single") series.push({ name: "Model with the measured values", x: F, y: simulate(fp, { kind: "infinite", Vb: 0 }, { Vrms: 1 }, ctx.air(), F).zmag, color: PALETTE[0], dash: "" });
  } catch { /* incomplete */ }
  plot($("#tsPlot"), series as any, { title: "Driver impedance", yLabel: "Ω", yMin: 0, xMax: 1000 });
  $("#tsSave").onclick = async () => {
    const model = `${d.model} (measured ${st.date})`;
    const id = slug(`${d.brand}-${model}`);
    const params: any = { ...d.params, fs: r.fs, Re: r.Re, Qms: r.Qms, Qes: r.Qes, Qts: r.Qts };
    if (r.Le) params.Le = r.Le;
    if (r.Vas) Object.assign(params, { Vas: r.Vas, Mms: r.Mms, Cms: r.Cms, Bl: r.Bl, Rms: r.Rms });
    else { delete params.Mms; delete params.Cms; delete params.Bl; delete params.Rms; } // sheet values no longer consistent with the new fs/Qes
    params.Sd = st.SdCm2 * 1e-4;
    const measured = r.rows.map((x) => x.key).join(", ");
    const src = [{ param: measured, source: `Measured by the owner with REW impedance sweeps, ${st.date}: free air "${free!.name}"${second ? `, ${st.method === "mass" ? `added mass ${st.massG} g` : `sealed box ${st.boxL} L`} "${second.name}"` : ""}`, where: `Coils during the sweeps: ${WIRING_TEXT[st.wiring]}; values saved for: ${WIRING_TEXT[st.target]}. Re: ${r.ReHow}. ${r.usedReal ? "Real part of Z used (phase in file)." : "|Z| only (no phase)."} ${r.vasHow ?? "Vas kept from the original entry."}` },
      { param: "Sd", source: "entered when measuring", where: `${st.SdCm2} cm²` },
      ...(d.sources ?? []).map((s) => ({ ...s, where: `${s.where ?? ""} [from the original entry "${d.brand} ${d.model}"; values listed above as measured replace it]`.trim() }))];
    const nd: Driver = { id, brand: d.brand, model, params, private: true, sources: src, notes: `Copy of "${d.brand} ${d.model}" with measured T/S values (${st.date}). ${r.notes.join(" ")}`.trim() };
    if (!confirm(`Save a NEW private driver "${d.brand} ${model}"? The original "${d.brand} ${d.model}" stays as it is.`)) return;
    const fr = free!, sc = second, method = st.method, massG = st.massG, boxL = st.boxL, wiring = st.wiring, date = st.date, keep = st.keep; // saving re-renders the editor and resets the tool
    try {
      await ctx.saveDriver(nd);
      if (keep) {
        await importOne(ctx, fr.text, fr.name, "impedance", { what: "driver_free_air", wiring, date, notes: `${d.model} free air` });
        if (sc) await importOne(ctx, sc.text, sc.name, "impedance", { what: method === "mass" ? "driver_added_mass" : "driver_closed_box", wiring, date, notes: `${d.model} ${method === "mass" ? `+${massG} g` : `in ${boxL} L box`}`, addedMassG: method === "mass" ? massG : undefined, boxL: method === "box" ? boxL : undefined });
      }
      ctx.status(`Saved "${d.brand} ${model}" (private)`, "ok");
    } catch (e) { ctx.status("Save failed: " + (e as Error).message, "bad"); }
  };
}
