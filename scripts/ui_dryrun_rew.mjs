// A5_REW dry run as the user (headless Chromium, ONE browser): REW import, overlay, box fit, "use fitted box", and driver T/S
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// from a free-air + added-mass sweep pair. The sweep files are made HERE with an independent plain-JS lumped model (not the
// app's code), in REW's text-export format, so the true box and driver values are known.
// Run (server must already run on PORT with AB_DATA_DIR = a COPY of data/, so real projects are never touched):
//   source /workspace/.playwright/env.sh && timeout -k 5 120 node /workspace/scripts/ui_dryrun_rew.mjs <port> <dataDir> <outDir>
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
const [port = "8422", dataDir, out] = process.argv.slice(2);
if (!dataDir || !out) { console.error("usage: node ui_dryrun_rew.mjs <port> <dataDir> <outDir>"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const results = { started: new Date().toISOString(), checks: [], errors: [] };
const check = (name, got, want, tolRel) => { const ok = Math.abs(got - want) <= Math.abs(want) * tolRel; results.checks.push({ name, got, want, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got} want ${want} (±${tolRel * 100} %)`); return ok; };
const flag = (name, ok, info = "") => { results.checks.push({ name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${info}`); };

// ---------- independent lumped model (Small's definitions: QL, QP at the box tuning) ----------
const RHO = 1.204, C = 343.2, RC2 = RHO * C * C; // the app's default air (20 °C)
const cx = (re, im = 0) => ({ re, im }), add = (a, b) => cx(a.re + b.re, a.im + b.im), mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const dv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); }, inv = (a) => dv(cx(1), a);
// Pioneer TS-W3003D4 entry as stored in data/private/drivers (coils in series)
const DRV = { fs: 35, Re: 5.8, Qms: 11.5, Qes: 0.622, Vas: 0.0346, Sd: 0.0552, Le: 0.00599 };
function zCurve(d, box, F) {
  const ws = 2 * Math.PI * d.fs, Cms = d.Vas / (RC2 * d.Sd ** 2), Mms = 1 / (ws * ws * Cms), Rms = ws * Mms / d.Qms, Bl = Math.sqrt(ws * Mms * d.Re / d.Qes);
  const Mtot = Mms + (d.addKg ?? 0);
  return F.map((f) => {
    const w = 2 * Math.PI * f, jw = cx(0, w);
    let Zm = add(add(mul(jw, cx(Mtot)), cx(Rms)), inv(mul(jw, cx(Cms))));
    if (box) {
      const CAB = box.Vb / RC2, wb = 2 * Math.PI * box.fb, MAP = 1 / (wb * wb * CAB), RAL = box.QL / (wb * CAB), RAP = 1 / (box.QP * wb * CAB);
      const Zab = inv(add(add(mul(jw, cx(CAB)), cx(1 / RAL)), inv(add(mul(jw, cx(MAP)), cx(RAP)))));
      Zm = add(Zm, mul(Zab, cx(d.Sd ** 2)));
    }
    const Z = add(add(cx(d.Re), mul(jw, cx(d.Le))), dv(cx(Bl * Bl), Zm));
    return { mag: Math.hypot(Z.re, Z.im), ph: Math.atan2(Z.im, Z.re) * 180 / Math.PI };
  });
}
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const F = []; for (let f = 2.5; f <= 20000; f *= 2 ** (1 / 96)) F.push(f);
function rewFile(name, note, z, noise = 0.005) {
  const lines = ["* Measurement data saved by REW V5.40 (synthetic, Audio_Builder dry run)", "* Source: synthetic", "* Format: 512k Log Swept Sine, 2 sweeps at -12.0 dBFS", "* Dated: 22-Nov-2026 10:00:00",
    "* Sense Resistor: 100.0", "* Lead resistance: 0.000", `* Note: ${note}`, `* Measurement: ${name}`, "*", "* Freq(Hz) Z(Ohms) Phase(degrees)"];
  for (let i = 0; i < F.length; i++) lines.push(`${F[i].toFixed(3)} ${(z[i].mag * (1 + noise * gauss())).toFixed(3)} ${(z[i].ph + noise * 40 * gauss()).toFixed(3)}`);
  const file = path.join(out, name + ".txt"); fs.writeFileSync(file, lines.join("\n") + "\n"); return file;
}
const TRUE_BOX = { Vb: 0.050, fb: 32, QL: 8, QP: 60 }; // one driver
const fBox = rewFile("pioneer_in_box", "port open, coils series", zCurve(DRV, TRUE_BOX, F));
const fFree = rewFile("pioneer_free_air", "free air, coils series", zCurve(DRV, null, F));
const ADD = 0.125; const fMass = rewFile("pioneer_added_mass", "125 g on the cone", zCurve({ ...DRV, addKg: ADD }, null, F));
results.truth = { box: TRUE_BOX, driver: DRV, addedKg: ADD };

// ---------- project for the dry run (in the COPY of data/) ----------
const PROJ = "rew_dry_run";
const proj = { name: PROJ, title: "REW dry run", driverId: "pioneer-ts-w3003d4", drivers: 1, kind: "vented",
  geom: { W: 600, H: 400, D: 500, wedge: false, Dtop: 350, t: 18, baffleExtra: 0, bracesL: 0, otherL: 0, insertsL: 0, fillPct: 0 },
  port: { shape: "round", count: 1, d: 100, w: 300, h: 50, length: 200, wall: 3 }, power: { watts: 300, impedance: 8 },
  cabin: { enabled: false, longestMm: 2500, slope: 12, leakHz: 15 }, lowpassHz: 80, symptoms: "", notes: "" };
const put = await fetch(`${base}/api/projects/${PROJ}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proj) });
flag("dry-run project created via API", put.ok);
// server safety checks for the new routes
flag("measurement route rejects a bad id", (await fetch(`${base}/api/projects/${PROJ}/measurements/..%2Fx`, { method: "PUT", body: "{}" })).status === 400);
flag("measurement route rejects bad data", (await fetch(`${base}/api/projects/${PROJ}/measurements/x1`, { method: "PUT", body: JSON.stringify({ kind: "impedance", f: [1, 2], mag: [1] }) })).status === 400);

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  p.on("console", (m) => { if (m.type() === "error") results.errors.push(m.text()); }); p.on("pageerror", (e) => results.errors.push(String(e)));
  const dialogs = []; p.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await p.addInitScript(() => { try { localStorage.setItem("project", "rew_dry_run"); localStorage.setItem("tab", "fix"); localStorage.setItem("units", "metric"); localStorage.setItem("air", "0"); } catch { /* */ } });
  const settle = () => p.waitForTimeout(300);
  const set = async (sel, v) => { await p.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event("change")); }, v); await settle(); };
  const nums = (s) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  await p.goto(base + "/?skipWelcome=1", { waitUntil: "networkidle" }); await p.waitForSelector("#results h2", { timeout: 20000 });
  const before = await p.textContent("#results .muted");
  console.log("diagnosis before:", before);
  const vbBefore = nums(before.match(/net ([\d.]+) L/)[0])[0], fbBefore = nums(before.match(/port ([\d.]+) Hz/)[0])[0];
  // 1. import the in-box sweep
  await p.selectOption("#mWhat", "driver_in_box"); await p.selectOption("#mWiring", "series"); await settle();
  await p.setInputFiles("#mFile", fBox); await p.waitForSelector("#mlist tr[data-mid]", { timeout: 10000 }); await settle();
  flag("import report says impedance", /impedance/.test(await p.textContent("#mRep")), (await p.textContent("#mRep")).slice(0, 160));
  flag("overlay on the impedance plot (legend)", /Measured/.test(await p.textContent("#pZ .plegend")));
  const nPaths0 = await p.$$eval("#pZ svg path", (a) => a.length);
  await p.screenshot({ path: out + "/1_overlay.png", fullPage: true });
  // toggle off / on
  await p.$eval("#mlist .mshow", (el) => { el.checked = false; el.dispatchEvent(new Event("change")); }); await settle();
  flag("toggle off removes the overlay", !/Measured/.test(await p.textContent("#pZ .plegend")) && (await p.$$eval("#pZ svg path", (a) => a.length)) === nPaths0 - 1);
  await p.$eval("#mlist .mshow", (el) => { el.checked = true; el.dispatchEvent(new Event("change")); }); await settle();
  // 2. fit
  await p.selectOption("#fDW", "same"); await settle();
  await p.click("#fRun"); await p.waitForSelector("#fOut table", { timeout: 30000 });
  const fitTxt = await p.textContent("#fOut table");
  console.log("fit:", fitTxt.replace(/\s+/g, " "));
  const fitRow = fitTxt.match(/Fitted.*?L per driver, ([\d.]+) Hz/s); const vbFit = nums(fitTxt.match(/\(vented\)\s*([\d.]+) L/)[1])[0];
  check("fitted net volume per driver (L)", vbFit, TRUE_BOX.Vb * 1000, 0.03);
  check("fitted tuning (Hz)", Number(fitRow[1]), TRUE_BOX.fb, 0.02);
  const rms = nums(fitTxt.match(/Match.*?Hz\)\s*([\d.]+) %/s)[1])[0]; flag("fit rms error under 2 %", rms < 2, rms + " %");
  flag("fitted model curve drawn", /Fitted model/.test(await p.textContent("#pZ .plegend")));
  // 3. use it
  await p.click("#fUse"); await p.waitForSelector("#results h2", { timeout: 20000 }); await p.waitForTimeout(800);
  flag("confirm shown with old and new values", dialogs.some((m) => /now:/.test(m) && /fitted:/.test(m)), dialogs.at(-1)?.replace(/\n/g, " | "));
  const after = await p.textContent("#results .muted"); console.log("diagnosis after:", after);
  check("diagnosis uses fitted volume (L)", nums(after.match(/net ([\d.]+) L/)[0])[0], vbFit, 0.002);
  check("diagnosis uses fitted tuning (Hz)", nums(after.match(/port ([\d.]+) Hz/)[0])[0], Number(fitRow[1]), 0.002);
  flag("diagnosis changed from the measured-size box", Math.abs(vbBefore - vbFit) > 1 || Math.abs(fbBefore - Number(fitRow[1])) > 0.5, `before ${vbBefore} L ${fbBefore} Hz`);
  flag("fitted-box notice shown", /fitted to your impedance sweep/.test(after) && /now uses the fitted box/.test(await p.textContent("#mfit")));
  const saved = await (await fetch(`${base}/api/projects/${PROJ}`)).json();
  flag("project stores measuredBox", saved.measuredBox && Math.abs(saved.measuredBox.VbPerL - vbFit) < 0.1);
  await p.screenshot({ path: out + "/2_fitted.png", fullPage: true });
  // undo and redo
  await p.click("#fUndo"); await p.waitForSelector("#results h2"); await p.waitForTimeout(500);
  check("undo restores the measured-size volume (L)", nums((await p.textContent("#results .muted")).match(/net ([\d.]+) L/)[0])[0], vbBefore, 0.002);
  await p.click("#fUndo"); await p.waitForSelector("#results h2"); await p.waitForTimeout(500);
  check("undo again re-applies the fit (L)", nums((await p.textContent("#results .muted")).match(/net ([\d.]+) L/)[0])[0], vbFit, 0.002);
  // 4. Design tab overlay
  await p.click("nav button[data-tab=design]"); await p.waitForTimeout(1200);
  flag("Design tab: impedance plot with the measured overlay", /Measured/.test((await p.textContent("#pZ .plegend")) ?? ""));
  // 5. Drivers tab: T/S from free air + added mass
  await p.click("nav button[data-tab=drivers]"); await settle();
  await p.fill("#q", "TS-W3003"); await p.dispatchEvent("#q", "input"); await settle();
  await p.click("#dl tr[data-id='pioneer-ts-w3003d4']"); await p.waitForSelector("#tsm");
  await p.setInputFiles("#tsFree", fFree); await p.waitForTimeout(500);
  await p.selectOption("#tsMethod", "mass"); await p.waitForTimeout(400);
  await set("#tsMass", ADD * 1000); await p.setInputFiles("#tsSecond", fMass); await p.waitForTimeout(500);
  await set("#tsRe", DRV.Re); await p.selectOption("#tsW", "series"); await p.dispatchEvent("#tsW", "change"); await p.selectOption("#tsT", "series"); await p.dispatchEvent("#tsT", "change"); await settle();
  await p.click("#tsCalc"); await p.waitForSelector("#tsOut table", { timeout: 15000 });
  const tsRows = await p.$$eval("#tsOut table tr", (trs) => trs.slice(1).map((tr) => [tr.children[0].textContent, parseFloat(tr.children[1].textContent)]));
  const ts = Object.fromEntries(tsRows); console.log("T/S:", JSON.stringify(ts));
  check("measured fs (Hz)", ts.fs, DRV.fs, 0.01); check("measured Qms", ts.Qms, DRV.Qms, 0.04); check("measured Qes", ts.Qes, DRV.Qes, 0.03);
  check("measured Vas (L)", ts.Vas, DRV.Vas * 1000, 0.04); check("measured Le (mH)", ts.Le, DRV.Le * 1000, 0.08);
  await p.screenshot({ path: out + "/3_ts.png", fullPage: true });
  await p.click("#tsSave"); await p.waitForTimeout(1500);
  flag("save status reports success", /Saved .*private/.test(await p.textContent("#status")), await p.textContent("#status"));
  const all = await (await fetch(`${base}/api/drivers`)).json();
  const md = all.find((d) => /measured 2026/.test(d.model) && d.brand === "Pioneer");
  flag("measured driver saved as a new private entry", md && md.private && md.id !== "pioneer-ts-w3003d4", md?.id);
  if (md) { check("saved fs", md.params.fs, DRV.fs, 0.01); check("saved Vas (m³)", md.params.Vas, DRV.Vas, 0.04); flag("saved sources name the measurement", /REW impedance sweeps/.test(JSON.stringify(md.sources))); }
  const orig = all.find((d) => d.id === "pioneer-ts-w3003d4");
  flag("original driver unchanged", orig && orig.params.fs === 35 && orig.params.Vas === 0.0346 && !/measured/.test(orig.model));
  const meas = await (await fetch(`${base}/api/projects/${PROJ}/measurements`)).json();
  flag("measurements stored (in-box + free air + added mass)", meas.length === 3, meas.map((m) => `${m.what}/${m.kind}/${m.wiring}`).join(", "));
  flag("stored metadata (date, notes, wiring, added mass)", meas.some((m) => m.what === "driver_added_mass" && m.addedMassG === ADD * 1000 && m.wiring === "series" && m.date));
  flag("files on disk under data/projects/<project>/measurements/", fs.readdirSync(path.join(dataDir, "projects", PROJ, "measurements")).length === 3);
  // 6. Help tab
  await p.click("nav button[data-tab=help]"); await settle();
  flag("Help tab has the REW guide", /Measuring with REW/.test(await p.textContent("#page")));
  // 7. garbage file → clear message
  await p.click("nav button[data-tab=fix]"); await p.waitForSelector("#mFile");
  const junk = path.join(out, "junk.txt"); fs.writeFileSync(junk, "this is not a measurement\nhello\n");
  await p.setInputFiles("#mFile", junk); await p.waitForTimeout(600);
  flag("garbage file rejected with a clear message", /No data lines/.test(await p.textContent("#mRep")), (await p.textContent("#mRep")).slice(0, 120));
} finally { await b.close(); }
flag("no console errors", results.errors.length === 0, JSON.stringify(results.errors).slice(0, 400));
results.finished = new Date().toISOString();
results.pass = results.checks.filter((c) => c.ok).length; results.fail = results.checks.filter((c) => !c.ok).length;
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`DONE pass ${results.pass} fail ${results.fail}`);
