// A1 free-form dry run as the user (headless Chromium, ONE browser): triangle corner box (wood), profile-extruded boot box (wood,
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// ported, analysis), fibreglass box from a sample scan of a KNOWN solid; checks every volume against an independent calculation
// and every export (.glb, inside-air .stl, mould .stl, .dxf). Also: old project migration + the Fix-tab wedge checkbox, units
// toggle, bandpass designer.
// Run (server must already run on PORT with AB_DATA_DIR = a COPY of data/, so real projects are never touched):
//   source /workspace/.playwright/env.sh && timeout -k 5 90 node /workspace/scripts/ui_dryrun_freeform.mjs <port> <dataDir> <outDir>
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
const [port = "8421", dataDir, out] = process.argv.slice(2);
if (!dataDir || !out) { console.error("usage: node ui_dryrun_freeform.mjs <port> <dataDir> <outDir>"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const results = { started: new Date().toISOString(), checks: [], errors: [] };
const check = (name, got, want, tolRel, tolAbs = 0) => {
  const ok = Math.abs(got - want) <= Math.max(tolAbs, Math.abs(want) * tolRel);
  results.checks.push({ name, got, want, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got} want ${want}`); return ok;
};
const flag = (name, ok, info = "") => { results.checks.push({ name, ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${info}`); };

// ---------- independent geometry (plain JS, not the app's code) ----------
const stlVolume = (buf) => { const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); const n = dv.getUint32(80, true); let s = 0;
  for (let i = 0; i < n; i++) { const o = 84 + 50 * i + 12; const P = [0, 1, 2].map((k) => [0, 1, 2].map((j) => dv.getFloat32(o + 12 * k + 4 * j, true)));
    const [a, b, c] = P; s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); } return s / 6; };
const polyArea = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return s / 2; };
/** Convex polygon (CCW) moved inward by d on every edge: intersect the offset lines. */
function offsetConvex(p, d) {
  const n = p.length; const lines = [];
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy); const nx = -dy / L, ny = dx / L; // left normal = inward for CCW
    lines.push({ a: [a[0] + nx * d, a[1] + ny * d], dx, dy }); }
  return lines.map((l1, i) => { const l0 = lines[(i + n - 1) % n]; const det = l0.dx * l1.dy - l0.dy * l1.dx; const t = ((l1.a[0] - l0.a[0]) * l1.dy - (l1.a[1] - l0.a[1]) * l1.dx) / det; return [l0.a[0] + l0.dx * t, l0.a[1] + l0.dy * t]; });
}
// expected inner volumes (litres)
const triPts = [[0, 0], [700, 0], [0, 700]]; // right-angled corner, legs 700 (plan view), height 380
const expTri = Math.abs(polyArea(offsetConvex(triPts, 18))) * (380 - 36) / 1e6;
const bootPts = [[0, 0], [500, 0], [380, 420], [0, 420]]; // the app's default boot profile (depth, height), width 900
const expBoot = Math.abs(polyArea(offsetConvex(bootPts, 18))) * (900 - 36) / 1e6;
// sample scan: regular 128-gon cylinder Ø 400 × 700 mm (true size), written Z-up in mm at 0.97 scale with one end left open
const N = 128, R = 200, Lc = 700, sc = 0.97;
const ring = (x) => Array.from({ length: N }, (_, i) => [x, R * Math.cos(2 * Math.PI * i / N), R * Math.sin(2 * Math.PI * i / N)]);
const A = ring(-Lc / 2), B = ring(Lc / 2); const tris = [];
for (let i = 0; i < N; i++) { const j = (i + 1) % N; tris.push([A[i], B[i], B[j]], [A[i], B[j], A[j]]); }
for (let i = 1; i + 1 < N; i++) tris.push([B[0], B[i + 1], B[i]]); // closed end at +x; the -x end is left open (unseen by the scanner)
const toZup = ([x, y, z]) => [x * sc, -z * sc, y * sc];
const stlBuf = Buffer.alloc(84 + 50 * tris.length); stlBuf.writeUInt32LE(tris.length, 80);
tris.forEach((t, i) => t.forEach((p, k) => toZup(p).forEach((v, j) => stlBuf.writeFloatLE(v, 84 + 50 * i + 12 + 12 * k + 4 * j))));
const scanFile = path.join(out, "sample_scan_cylinder.stl"); fs.writeFileSync(scanFile, stlBuf);
const apo = R * Math.cos(Math.PI / N); const polyA = (r) => N / 2 * r * r * Math.sin(2 * Math.PI / N);
const expScanOuter = polyA(R) * Lc / 1e6; const Rin = (apo - 6) / Math.cos(Math.PI / N); const expScanInner = polyA(Rin) * (Lc - 12) / 1e6;
results.expected = { triangleInnerL: expTri, bootInnerL: expBoot, scanOuterL: expScanOuter, scanInnerL: expScanInner };

// ---------- browser ----------
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  p.on("console", (m) => { if (m.type() === "error") results.errors.push(m.text()); }); p.on("pageerror", (e) => results.errors.push(String(e)));
  let dialogAnswer = "";
  p.on("dialog", (d) => d.accept(dialogAnswer));
  const step = (s) => console.log("STEP", s);
  const settle = () => p.waitForTimeout(250);
  const set = async (sel, v) => { await p.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event("change")); }, v); await settle(); };
  const tick = async (sel, on) => { await p.$eval(sel, (el, on) => { el.checked = on; el.dispatchEvent(new Event("change")); }, on); await settle(); };
  const choose = async (sel, v) => { await p.selectOption(sel, v); await settle(); };
  const num = async (sel) => parseFloat((await p.textContent(sel)).replace(/[^\d.\-]/g, " ").trim().split(/\s+/)[0]);
  const newProject = async (title) => { dialogAnswer = title; await p.selectOption("#proj", "__new"); await p.waitForTimeout(600); };
  const pickDriver = async (sel) => { const v = await p.$eval(sel, (s) => { const o = [...s.options].find((x) => /hinor/i.test(x.text)) ?? [...s.options].find((x) => x.value); return o.value; }); await choose(sel, v); return v; };
  const saveExport = async (btn) => { await p.click(btn); await p.waitForTimeout(800); return await p.textContent("#status"); };

  await p.goto(`http://127.0.0.1:${port}/?skipWelcome=1`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  // 0. migration + reported checkbox
  step("old project migration and the wedge checkbox");
  await p.click("nav button[data-tab=fix]"); await settle();
  await choose("#proj", "existing_sub"); await settle();
  const json = JSON.parse(fs.readFileSync(path.join(dataDir, "projects", "existing_sub.json"), "utf8"));
  flag("existing_sub loads as classic shape", (await p.$eval("#fsShape select[data-key=mode]", (s) => s.value)) === "classic");
  const wedgeShown = await p.$eval("#fsBox input[data-key=wedge]", (i) => i.checked);
  flag("Fix tab wedge checkbox matches the saved project", wedgeShown === !!json.geom.wedge, `(json wedge=${json.geom.wedge}, shown=${wedgeShown}, Dtop field shown=${!!(await p.$("#fsBox input[data-key=Dtop]"))})`);
  await p.screenshot({ path: out + "/0_existing_sub.png", fullPage: true });

  // 1. triangle corner box, wood
  step("triangle corner box");
  await newProject("FF dry run triangle"); await p.click("nav button[data-tab=fix]"); await settle();
  await pickDriver("#fsProj select[data-key=driverId]");
  await choose("#fsBox select[data-key=kind]", "sealed");
  await choose("#fsShape select[data-key=mode]", "preset");
  await choose("#shPreset select[data-key=kind]", "corner");
  await set("#shPreset input[data-key=A]", 700); await set("#shPreset input[data-key=B]", 700); await set("#shPreset input[data-key=angle]", 90); await set("#shPreset input[data-key=H]", 380);
  await set("#shWood input[data-key=woodT]", 18);
  check("triangle: inside volume (L) vs offset-triangle maths", await num("#ffGross"), expTri, 0.001, 0.006);
  flag("triangle: 5 panels listed", (await p.$$("#panelTable tr")).length === 6);
  const blades = await p.$$eval("#panelTable b", (e) => e.map((x) => parseFloat(x.textContent)));
  flag("triangle: blade tilts include 67.5° (45° front corners, marked over 45°)", blades.some((x) => Math.abs(x - 67.5) < 0.05), JSON.stringify([...new Set(blades)]));
  await p.click("#run"); await p.waitForSelector("#opts tr[data-id]", { timeout: 20000 });
  const cards = await p.$$eval(".card", (e) => e.map((x) => x.textContent));
  flag("triangle: analysis uses the shape's chord for standing waves", cards.some((c) => c.includes("Longest straight line inside")));
  results.triangleNetText = await p.textContent("#ffNet");
  await saveExport("#glb"); await saveExport("#airstl"); await p.click("#cut"); await p.waitForSelector("#cutdxf"); await saveExport("#cutdxf"); await saveExport("#png");
  await p.screenshot({ path: out + "/1_triangle.png", fullPage: true });

  // 2. profile-extruded boot box, ported
  step("profile boot box");
  await newProject("FF dry run boot"); await p.click("nav button[data-tab=fix]"); await settle();
  await pickDriver("#fsProj select[data-key=driverId]");
  await choose("#fsBox select[data-key=kind]", "vented");
  await choose("#fsShape select[data-key=mode]", "profile");
  check("boot: inside volume (L) vs offset-profile maths", await num("#ffGross"), expBoot, 0.001, 0.006);
  const fbTxt = await p.textContent("#ffFb"); flag("boot: port tuning shown", /Hz/.test(fbTxt), fbTxt);
  flag("boot: port fit checked", /room/.test(await p.textContent("#volbox")));
  await p.click("#run"); await p.waitForSelector("#opts tr[data-id]", { timeout: 30000 });
  results.bootOptions = await p.$$eval("#opts tr[data-id]", (r) => r.map((x) => x.dataset.id));
  const netBoot = await num("#ffNet");
  const vbShown = await p.$eval("#results .muted", (e) => e.textContent);
  flag("boot: diagnosis uses the shape's net volume", vbShown.includes(`net ${(netBoot / 1).toFixed(1)} L`) || vbShown.includes(`net ${(netBoot).toFixed(1)}`), vbShown.slice(0, 160));
  await saveExport("#glb"); await saveExport("#airstl"); await p.click("#cut"); await p.waitForSelector("#cutdxf"); await saveExport("#cutdxf");
  await p.screenshot({ path: out + "/2_boot.png", fullPage: true });

  // 3. fibreglass from a sample scan of a known solid
  step("fibreglass scan box");
  await newProject("FF dry run scan"); await p.click("nav button[data-tab=fix]"); await settle();
  await pickDriver("#fsProj select[data-key=driverId]");
  await choose("#fsBox select[data-key=kind]", "sealed");
  await choose("#fsShape select[data-key=mode]", "scan");
  await choose("#fsShape select[data-key=material]", "fibreglass");
  await p.setInputFiles("#scanFile", scanFile); await p.waitForTimeout(1500);
  await choose("#shScan select[data-key=upAxis]", "z");
  await choose("#shScan select[data-key=unit]", "mm");
  await choose("#shScan select[data-key=axis]", "x"); await set("#shScan input[data-key=measuredMm]", 700);
  await set("#shFibre input[data-key=shellMm]", 6); await set("#shRing input[data-key=ringOuterMm]", 0);
  await p.waitForSelector("#ffGross", { timeout: 15000 });
  const vt = await p.textContent("#volbox");
  const outerL = parseFloat(vt.match(/Volume inside the outside surface\s*([\d.]+)/)?.[1] ?? "NaN");
  check("scan: outside volume after scale check (L) vs exact 128-gon cylinder", outerL, expScanOuter, 0.001, 0.06);
  check("scan: inside volume after 6 mm shell (L)", await num("#ffGross"), expScanInner, 0.001, 0.006);
  flag("scan: fibreglass mat/resin estimate shown", /layers/.test(vt));
  await saveExport("#glb"); await saveExport("#airstl"); await saveExport("#mould");
  await p.screenshot({ path: out + "/3_scan_fibreglass.png", fullPage: true });

  // 4. units toggle and the bandpass designer
  step("units + bandpass");
  await choose("#units", "imperial"); flag("imperial units shown", /ft³/.test(await p.textContent("#volbox")));
  await choose("#units", "metric");
  await p.click("nav button[data-tab=design]"); await settle();
  await choose("#dsA select[data-key=topology]", "bp4"); await p.waitForSelector("#advOut", { timeout: 15000 });
  flag("4th-order bandpass designed", /Front port/.test(await p.textContent("#advOut")));
  await choose("#dsA select[data-key=topology]", "bp6"); await p.waitForSelector("#advOut"); flag("6th-order bandpass designed", /Rear port/.test(await p.textContent("#advOut")));
  await choose("#dsA select[data-key=topology]", "bp3"); await p.waitForSelector("#advOut"); flag("3-chamber bandpass designed", /Third/.test(await p.textContent("#advOut")));
  await choose("#dsA select[data-key=topology]", "sealed"); await tick("#dsA input[data-key=isobaric]", true); await p.waitForSelector("#advOut"); flag("isobaric designed", /isobaric/i.test(await p.textContent("#dsOut h2")));
  await p.screenshot({ path: out + "/4_design_isobaric.png", fullPage: true });
  await tick("#dsA input[data-key=isobaric]", false);
} finally { await b.close(); }

// ---------- exports, checked outside the app ----------
const ex = (proj, f) => path.join(dataDir, "projects", proj, "exports", f);
for (const [proj, want] of [["ff_dry_run_triangle", expTri], ["ff_dry_run_boot", expBoot], ["ff_dry_run_scan", expScanInner]]) {
  const f = ex(proj, `${proj}_inside_air.stl`);
  if (fs.existsSync(f)) check(`${proj}: exported inside-air .stl volume (L), own STL reader`, stlVolume(fs.readFileSync(f)) * 1000, want, 0.001, 0.006); else flag(`${proj}: inside-air .stl exported`, false);
  flag(`${proj}: .glb exported`, fs.existsSync(ex(proj, `${proj}_box.glb`)), fs.existsSync(ex(proj, `${proj}_box.glb`)) ? fs.statSync(ex(proj, `${proj}_box.glb`)).size + " bytes" : "");
}
const mould = ex("ff_dry_run_scan", "ff_dry_run_scan_mould.stl");
if (fs.existsSync(mould)) check("scan: exported mould .stl volume (L)", stlVolume(fs.readFileSync(mould)) * 1000, expScanOuter, 0.001, 0.006);
for (const [proj, n] of [["ff_dry_run_triangle", 5], ["ff_dry_run_boot", 6]]) {
  const f = ex(proj, `${proj}_panels.dxf`);
  const polys = fs.existsSync(f) ? (fs.readFileSync(f, "utf8").match(/\nPOLYLINE\n/g) ?? []).length : -1;
  flag(`${proj}: DXF has ${n} panel outlines`, polys === n, `found ${polys}`);
}
flag("no console errors", results.errors.length === 0, JSON.stringify(results.errors).slice(0, 400));
results.finished = new Date().toISOString();
results.pass = results.checks.filter((c) => c.ok).length; results.fail = results.checks.filter((c) => !c.ok).length;
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`DONE pass ${results.pass} fail ${results.fail}`);
