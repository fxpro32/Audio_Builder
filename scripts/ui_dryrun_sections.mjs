// Headless dry run of B2_SECTIONS (R37): Infinite baffle designer (trunk / true / free air, research_h worked cases on screen,
// leak, cabin pressure, baffle board on the Boards tab, imperial units), Home and Computer presets (no shallow boxes, baffle
// step / ratio / crossover notes, Best size upright), Door speaker (still no box; fit check, high-pass, PS Sound note), save and
// reload in a project and as a single item (My items -> project), no page errors.
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node <app>/server/server.mjs  (never port 8420)
// Usage: node scripts/ui_dryrun_sections.mjs <outDir> <dataCopyDir> [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { ensureSampleProjects } from "./dryrun_sample_projects.mjs";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
if (PORT === "8420") { console.log("REFUSED: port 8420 is the live server"); process.exit(2); }
const out = process.argv[2] || "."; const DATA = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const smoke = process.argv.includes("--smoke");
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info: String(info).slice(0, 300) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + String(info).slice(0, 220) : ""}`); };
const api = async (p, init) => { const r = await fetch(BASE + "/api/" + p, init); return r.ok ? (r.headers.get("content-type")?.includes("json") ? r.json() : r.text()) : { status: r.status }; };
const health = await api("health");
if (!health.ok || !DATA || path.resolve(health.data) !== path.resolve(DATA) || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on the data copy given:", JSON.stringify(health)); process.exit(2); }
ensureSampleProjects(DATA); // G1: sample one-box projects car_a, car_b in the data copy

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 500) => p.waitForTimeout(ms);
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const state = () => p.evaluate(() => window.__abState?.());
const tabs = () => p.$$eval("nav button", (bs) => bs.map((x) => x.dataset.tab));
const section = async (v) => { await p.selectOption("#section", v); await wait(1300); };
const click = async (sel, ms = 900) => { await p.click(sel); await wait(ms); };
const setF = async (sel, v, ms = 700) => { await p.fill(sel, String(v)); await p.press(sel, "Tab"); await wait(ms); }; // Tab = a real change event (as a user leaving the field)
const check = async (sel, on, ms = 700) => { if ((await p.$eval(sel, (e) => e.checked)) !== on) { await p.click(sel); await wait(ms); } };
const num = (s, re) => { const m = String(s).match(re); return m ? Number(m[1]) : NaN; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const sizes = async () => { const t = await txt("#dsSize"); const m = t.match(/([\d.]+) mm × ([\d.]+) mm × ([\d.]+) mm/); return m ? { W: +m[1], H: +m[2], D: +m[3] } : undefined; };
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "domcontentloaded" }); await wait(2500);
  ok("app opens (Continue: new_sub_box, Subwoofer)", (await state())?.project === "new_sub_box", JSON.stringify(await state()).slice(0, 120));
  if (smoke) { await shot("smoke"); throw "smoke-done"; }

  // ---------- Infinite baffle ----------
  await section("ib"); await click("nav button[data-tab=ib]", 1500); let st = await state();
  ok("IB section: tabs IB, Boards, Drivers, Project, Help", JSON.stringify(await tabs()) === JSON.stringify(["ib", "boards", "drivers", "parts", "system", "bom", "project", "help"] /* B3_PARTS_DB: Parts tab; B4_SYSTEM_UI: System tab; B5_BOM: BOM tab */), (await tabs()).join(","));
  ok("IB default driver: Acoustic Elegance IB15AU (PS Sound's), 2 drivers, trunk IB", (await p.$eval("#secDrv", (s) => s.value)) === "acoustic-elegance-ib15au-4ohm" && (await p.$eval("#secCount", (e) => e.value)) === "2" && (await p.$eval("#ibA select[data-key=mode]", (s) => s.value)) === "trunk");
  ok("IB: PS Sound verdict says the driver suits IB", /Suits IB by PS Sound's rules/.test(await txt("#ibVerdictText")), await txt("#ibVerdictText"));
  ok("IB: driver checks table with sources (PS Sound, MTX, Lucas)", (await p.$$eval("#ibRules tr", (r) => r.length)) >= 7 && /youtube\.com/.test(await txt("#ibRulesBox")), "");
  ok("IB: no box anywhere (no 3D view)", !(await p.$("#v3d")) && !(await p.$("canvas")));
  // research case: 2 x IB15AU in 500 L, boot only
  await check("#ibCar input[data-key=cabinLoad]", false); await setF("#ibCar input[data-key=leakCm2]", 0);
  let a = await txt("#ibAlpha"), fc = await txt("#ibFc");
  ok("2 x IB15AU, 500 L boot, no cabin load: alpha 1.548, fc 32.6, Qtc 0.990 (research_h 1.7)", near(num(a, /([\d.]+)/), 1.548, 0.001) && near(num(fc, /([\d.]+) Hz/), 32.6, 0.05) && near(num(fc, /Qtc ([\d.]+)/), 0.990, 0.001), a + " | " + fc);
  await shot("10_ib_trunk_500L");
  // true IB, 3,000 L cabin
  await p.selectOption("#ibA select[data-key=mode]", "true"); await wait(900);
  await check("#ibCar input[data-key=cabinLoad]", true);
  a = await txt("#ibAlpha"); fc = await txt("#ibFc");
  ok("true IB, 3,000 L cabin: alpha 0.258, fc 22.9, Qtc 0.695", near(num(a, /([\d.]+)/), 0.258, 0.001) && near(num(fc, /([\d.]+) Hz/), 22.9, 0.05) && near(num(fc, /Qtc ([\d.]+)/), 0.695, 0.001), a + " | " + fc);
  ok("cabin pressure at Xmax in 3,000 L: about 137 dB (peak)", near(num(await txt("#ibCabin"), /([\d.]+) dB/), 137.0, 0.1), await txt("#ibCabin"));
  ok("true IB: no boot or leak inputs", !(await p.$("#ibCar input[data-key=bootL]")) && !(await p.$("#ibCar input[data-key=leakCm2]")));
  ok("4 plots: loudness, cone travel, impedance, power drawn", (await p.$$eval(".plots svg", (s) => s.length)) === 4);
  ok("subsonic: picked and cone travel within Xmax", /Hz|none needed/.test(await txt("#ibHp")) && (await p.$eval("#ibX", (e) => e.className)).includes("ok"), (await txt("#ibHp")) + " | " + (await txt("#ibX")));
  ok("power drawn shown with PS Sound's low-power note", /W at 20 Hz/.test(await txt("#ibP")) && /hardly draw any power/.test(await txt("#ibRes")));
  await shot("11_ib_true_3000L");
  // leak case: trunk, boot 400 L, cabin 3,000 L, 100 cm2, 20 mm -> about 27 Hz
  await p.selectOption("#ibA select[data-key=mode]", "trunk"); await wait(900);
  await setF("#ibCar input[data-key=bootL]", 400); await setF("#ibCar input[data-key=leakCm2]", 100); await setF("#ibCar input[data-key=leakMm]", 20);
  const lk = await txt("#ibLeak");
  ok("leak 100 cm2 (boot 400 L, cabin 3,000 L, 20 mm): f_leak about 27 Hz, warning shown", near(num(lk, /f_leak ([\d.]+) Hz/), 27.1, 0.15) && (await p.$eval("#ibLeak", (e) => e.className)).includes("warn"), lk);
  ok("editing a volume makes the car preset 'Enter yours'", (await p.$eval("#ibCar select[data-key=preset]", (s) => s.value)) === "own");
  await setF("#ibCar input[data-key=leakCm2]", 20);
  ok("leak 20 cm2: about 16.5 Hz, ok", near(num(await txt("#ibLeak"), /f_leak ([\d.]+) Hz/), 16.5, 0.15) && (await p.$eval("#ibLeak", (e) => e.className)).includes("ok"), await txt("#ibLeak"));
  ok("baffle board drawn with 2 cut-outs, estimated sizes said", (await p.$$eval("#ibBaffleSvg circle", (c) => c.length)) === 4 && /estimated from the cone area/.test(await txt("#ibBaffleNote")), await txt("#ibBaffleNote"));
  await shot("12_ib_trunk_leak");
  await p.selectOption("#ibA select[data-key=mode]", "free"); await wait(900);
  ok("free air mode: alpha 0, fc = fs 20.4 Hz", near(num(await txt("#ibAlpha"), /([\d.]+)/), 0, 1e-6) && near(num(await txt("#ibFc"), /([\d.]+) Hz/), 20.4, 0.05), await txt("#ibFc"));
  await p.selectOption("#ibA select[data-key=mode]", "trunk"); await wait(900);
  // Boards
  await click("nav button[data-tab=boards]", 2500);
  ok("Boards tab: the IB baffle board is the source and is laid out", /Infinite baffle: the baffle board/.test(await p.$eval("#page", (e) => e.innerText)) && (await p.$$eval("#page svg", (s) => s.length)) > 0, (await p.$eval("#page", (e) => e.innerText)).slice(0, 200));
  await shot("13_ib_boards");
  // imperial
  await click("nav button[data-tab=ib]", 1200); await p.selectOption("#units", "imperial"); await wait(1200);
  ok("imperial units: boot volume in ft³, leak in in², board in inches", /ft³/.test(await txt("#ibCar")) && /in²/.test(await txt("#ibCar")) && /in/.test(await txt("#ibBaffleNote")), (await txt("#ibCar")).slice(0, 150));
  await shot("14_ib_imperial");
  await p.selectOption("#units", "metric"); await wait(900);
  await wait(1200);
  let nsb = await api("projects/new_sub_box"); let ibIt = nsb.items?.find((i) => i.kind === "ib");
  ok("IB item saved in the project (v2) with its inputs", nsb.format === 2 && ibIt?.data.mode === "trunk" && ibIt.data.bootL === 400 && ibIt.data.leakCm2 === 20 && ibIt.data.driverId === "acoustic-elegance-ib15au-4ohm", JSON.stringify(ibIt?.data ?? {}).slice(0, 200));
  await p.reload({ waitUntil: "domcontentloaded" }); await wait(2500);
  await section("ib"); await click("nav button[data-tab=ib]", 1300);
  ok("after reload the IB item shows the same inputs and results", (await p.$eval("#ibCar input[data-key=bootL]", (e) => e.value)) === "400" && near(num(await txt("#ibLeak"), /f_leak ([\d.]+) Hz/), 16.5, 0.15));

  // ---------- Home speakers ----------
  await section("home"); await click("nav button[data-tab=design]", 2200);
  for (const pr of ["bookshelf-sealed", "bookshelf-ported", "floor-ported"]) {
    await p.selectOption("#preset", pr); await click("#applyPreset", 2200);
    const s = await sizes();
    const why = await txt("#sizeMsg"); // a driver needing less volume than its smallest front allows is the one exception, and the Result says so
    ok(`Home preset ${pr}: not shallow (depth >= 0.8 x width, or the stated drivers' front exception), volume check ✓`, s && (s.D >= 0.8 * s.W - 0.6 || (/drivers need a front/.test(why) && s.D >= 0.7 * s.W)) && /✓/.test(await txt("#dsVolChk")), JSON.stringify(s) + " | " + (await txt("#sizeMsg")).slice(0, 160));
    if (pr === "floor-ported") { await shot("15_home_floor"); }
  }
  const hs = await sizes(); const step = num(await txt("#homeStep"), /about ([\d.]+) Hz/);
  ok("Home notes: baffle step = 115 / width, inside/outside %, crossover 2-3 kHz", near(step, 115 / (hs.W / 1000), 1.5) && /%/.test(await txt("#homeRatio")) && /2-3 kHz/.test(await txt("#homeXover")), `${step} Hz for ${hs.W} mm`);
  await check("#dsB input[data-lock=H]", false); await click("#bestSize", 2000);
  const bs = await sizes();
  ok("Home Best size: upright (taller than wide) and not shallow", bs && bs.H > bs.W && bs.D >= 0.8 * bs.W - 0.6 && /✓/.test(await txt("#dsVolChk")), JSON.stringify(bs) + " | " + (await txt("#sizeMsg")).slice(0, 160));
  await shot("16_home_bestsize");
  await click("nav button[data-tab=boards]", 2500);
  ok("Home: Boards lays out the box panels", (await p.$$eval("#page svg", (s) => s.length)) > 0);

  // ---------- Computer speakers ----------
  await section("computer"); await click("nav button[data-tab=design]", 2200);
  for (const pr of ["desktop-sealed", "desktop-ported"]) {
    await p.selectOption("#preset", pr); await click("#applyPreset", 2200);
    const s = await sizes(); const topo = await p.$eval("#dsA select[data-key=topology]", (x) => x.value);
    ok(`Computer preset ${pr}: not shallow, volume ✓, ${pr.endsWith("ported") ? "ported" : "sealed"}`, s && s.D >= 0.8 * s.W - 0.6 && /✓/.test(await txt("#dsVolChk")) && topo === (pr.endsWith("ported") ? "vented" : "sealed"), JSON.stringify(s) + " " + topo);
    await shot("17_" + pr);
  }
  await click("#bestSize", 2000); const cs = await sizes();
  ok("Computer Best size: not shallow", cs && cs.D >= 0.8 * cs.W - 0.6, JSON.stringify(cs));
  ok("Computer: sealed / ported / passive radiator only", JSON.stringify(await p.$$eval("#dsA select[data-key=topology] option", (o) => o.map((x) => x.value))) === JSON.stringify(["sealed", "vented", "pr"]));

  // ---------- Door speaker ----------
  await section("door"); await click("nav button[data-tab=door]", 1200);
  ok("Door: still no box (no 3D, no box inputs), Door mounting: to be decided", !(await p.$("#v3d")) && !(await p.$("canvas")) && !(await p.$("#dsB")) && /Door mounting: to be decided/.test(await txt("#doorMount legend")) && JSON.stringify(await tabs()) === JSON.stringify(["door", "drivers", "parts", "system", "bom", "project", "help"] /* B3_PARTS_DB: Parts tab; B4_SYSTEM_UI: System tab; B5_BOM: BOM tab */));
  const opts = await p.$$eval("#secDrv option", (o) => o.map((x) => x.value).filter(Boolean));
  let picked = "";
  for (const id of opts.slice(0, 40)) { await p.selectOption("#secDrv", id); await wait(700); if (await p.$("#doorRes")) { picked = id; break; } }
  ok("Door: a driver with T/S data shows its free-air response, high-pass and travel", !!picked && /Hz/.test(await txt("#doorHp")) && (await p.$$eval(".plots svg", (s) => s.length)) === 2, picked + " | " + (await txt("#doorHp")).slice(0, 120));
  await setF("#doorFitF input[data-key=holeMm]", 140); await setF("#doorFitF input[data-key=depthMm]", 60);
  ok("Door: fit check rows for cut-out and depth", (await p.$$eval("#doorFit tr", (r) => r.length)) === 2 && !/Enter the door/.test(await txt("#doorFit")), await txt("#doorFit"));
  ok("Door: PS Sound's view on midbass in doors, labelled as their view, with source", /their view/.test(await txt("#doorPS")) && /ZDzS8tuG62c/.test(await txt("#doorPS")));
  await shot("18_door");
  await wait(1000);
  nsb = await api("projects/new_sub_box"); const dIt = nsb.items?.find((i) => i.kind === "door");
  ok("door item saved in the project with the fit inputs", dIt?.data.holeMm === 140 && dIt.data.depthMm === 60 && dIt.data.driverId === picked, JSON.stringify(dIt?.data ?? {}).slice(0, 200));

  // ---------- Help ----------
  await click("nav button[data-tab=help]", 1200);
  ok("Help: Infinite baffle, Door speakers, Home and computer speakers sections with sources", !!(await p.$("#helpIB")) && !!(await p.$("#helpDoor")) && !!(await p.$("#helpHome")) && /pssound/.test(await p.$eval("#page", (e) => e.innerText)));

  // ---------- single IB item -> My items -> project ----------
  await click("#toMenu", 700); await click('#menu button[data-m="newitem"]', 600);
  await click('#mNewItem button[data-sec="ib"]', 1800); st = await state();
  ok("Build a single item (Infinite baffle): designer shown, not saved yet", st.mode === "item" && st.section === "ib" && !!(await p.$("#ibAlpha")), await txt("#itemTag"));
  await p.selectOption("#ibA select[data-key=mode]", "true"); await wait(900);
  await click("#saveItem", 1500); st = await state();
  const itF = path.join(DATA, "items", st.activeItem + ".json");
  const itJ = fs.existsSync(itF) ? JSON.parse(fs.readFileSync(itF, "utf8")) : {};
  ok("single IB item saved to My items with its mode", st.itemSaved && itJ.kind === "ib" && itJ.data?.mode === "true", JSON.stringify(itJ.data ?? {}).slice(0, 160));
  await click("nav button[data-tab=project]", 800); await p.selectOption("#itProj", "car_b"); await click("#itAddGo", 2500); st = await state();
  const vcm = await api("projects/car_b"); const vIb = vcm.items?.find((i) => i.kind === "ib");
  ok("added to car_b: opens there in Infinite baffle with the same inputs", st.project === "car_b" && st.section === "ib" && vIb?.data.mode === "true" && !!(await p.$("#ibAlpha")) && (await p.$eval("#ibA select[data-key=mode]", (s) => s.value)) === "true", JSON.stringify(vIb?.data ?? {}).slice(0, 160));
  await shot("19_ib_in_car_b");
  ok("no page errors", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") ok("dry run finished without an exception", false, String(e?.stack || e).slice(0, 300)); }
finally {
  await b.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), base: BASE, pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, results, errors: errs }, null, 2));
  console.log(`DONE ${results.filter((r) => r.pass).length} pass, ${results.filter((r) => !r.pass).length} fail`);
}
