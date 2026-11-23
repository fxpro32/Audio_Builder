// Headless dry run of B7_PLYWOOD_BOARDS: the Boards material choice (MDF / plywood types), thickness tolerance, grain lock in the
// drawing, "about N kg of panels", the BOM sheet line following the material, and save + reload keeping it.
// Flow: new_sub_box on MDF (default) -> 18 mm -> marine plywood (grain lock on, drawn) -> grain lock off/on -> hoop pine 18 mm
// (18.5 mm sheets counted, said on screen) -> marine again -> BOM line ply:marine:18 -> Infinite baffle section: baffle on birch
// plywood by default -> BOM line ply:birch:18 -> reload: box marine, IB birch.
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node app/server/server.mjs  (never port 8420)
// Usage: node scripts/ui_dryrun_plywood.mjs <outDir> [dataCopyDir] [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
if (PORT === "8420") { console.log("REFUSED: port 8420 is the live server"); process.exit(2); }
const out = process.argv[2] || "."; fs.mkdirSync(out, { recursive: true });
const smoke = process.argv.includes("--smoke");
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + info : ""}`); };
const api = async (p, init) => { const r = await fetch(BASE + "/api/" + p, init); return r.ok ? (r.headers.get("content-type")?.includes("json") ? r.json() : r.text()) : { status: r.status }; };
const health = await api("health"); if (!health.ok || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on a data copy:", JSON.stringify(health)); process.exit(2); }

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 500) => p.waitForTimeout(ms);
const setVal = async (sel, v) => { await p.$eval(sel, (i, v) => { i.value = String(v); i.dispatchEvent(new Event("change")); }, v); await wait(700); };
const choose = async (sel, v) => { await p.selectOption(sel, v); await wait(800); };
const click = async (sel, ms = 700) => { await p.click(sel); await wait(ms); };
const B = () => p.evaluate(() => window.__abBoards());
const bom = () => p.evaluate(() => window.__abBom?.());
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const tab = (k, ms = 900) => click(`nav button[data-tab=${k}]`, ms);
const section = async (v) => { await p.selectOption("#section", v); await wait(1300); };
const grainOk = (s) => s.drawn.length > 0 && s.drawn.every((d) => d.grainErrors.length === 0 && d.errors.length === 0);
const allPlaced = (s) => JSON.stringify(s.drawn.flatMap((d) => d.placed.flatMap((x) => x.ids)).sort()) === JSON.stringify(s.panels.map((x) => x.id).sort()) && s.unplaced.length === 0;
const encLines = (bs) => bs?.groups.find((g) => g.id === "enclosure")?.lines ?? [];
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1000);
  ok("page loads on new_sub_box", (await p.$eval("#proj", (s) => s.value).catch(() => "")) === "new_sub_box" && errs.length === 0, JSON.stringify(errs).slice(0, 200));
  const ply = await api("boards/plywood");
  ok("server: /api/boards/plywood serves the plywood catalogue", Array.isArray(ply.sheets) && ply.sheets.length === 216, `${ply.sheets?.length} sheets`);
  ok("server: health lists the boards-plywood feature", (health.features ?? []).includes("boards-plywood"), JSON.stringify(health.features));
  await tab("boards"); let s = await B();
  if (smoke) { await shot("smoke"); ok("smoke: Boards drawn, material MDF", s?.material === "mdf" && s.drawn.length > 0); throw "smoke-done"; }
  // 1. box on MDF (default)
  ok("box default material MDF: select shows MDF, only MDF sheets, no grain option", s.material === "mdf" && (await p.$eval("#bdMat", (x) => x.value)) === "mdf" && s.sheetCategories.every((c) => /standard|moisture/.test(c)) && !(await p.$("#bdGrain")), JSON.stringify(s.sheetCategories));
  const w0 = await txt("#bdWeight");
  ok("MDF weight shown with Alpine 740 kg/m3", /About \d+(\.\d)? kg of panels/.test(w0) && /740/.test(w0) && Math.abs(Number(w0.match(/About ([\d.]+)/)[1]) - s.weightKg) < 0.06, w0);
  ok("MDF drawing: no grain lines, layout clean", (await p.$$eval("#bdDraw svg polygon.grain", (x) => x.length)) === 0 && s.drawn.every((d) => d.errors.length === 0) && allPlaced(s));
  await shot("01_box_mdf");
  // 18 mm box so the plywood thicknesses match
  await tab("design"); await setVal("#dsB input[data-key=t]", 18); await tab("boards"); s = await B();
  ok("box at 18 mm on MDF", s.t === 18 && s.material === "mdf" && !!s.best, JSON.stringify(s.best));
  const mdfKg = s.weightKg;
  // 2. marine plywood
  await choose("#bdMat", "marine"); s = await B();
  ok("marine: only marine plywood sheets, grain lock on by default", s.material === "marine" && s.sheetCategories.join() === "marine plywood" && s.grain === true && (await p.$eval("#bdGrain", (x) => x.checked)), JSON.stringify(s.sheetCategories));
  ok("marine: best fit and cheapest buy found", !!s.best && !!s.cheapest, JSON.stringify({ best: s.best, cheap: s.cheapest }));
  ok("marine: grain lock respected in the drawing (no panel across the grain), every panel once", grainOk(s) && allPlaced(s), JSON.stringify(s.drawn.map((d) => d.grainErrors)));
  const gl = await p.$$eval("#bdDraw svg polygon.grain", (x) => x.length);
  ok("marine: grain lines drawn on every panel, legend says grain lock", gl === s.panels.length && /grain lock: every panel's long side along it/.test(await txt("#bdDraw svg")), `${gl} grain polygons, ${s.panels.length} panels`);
  const w1 = await txt("#bdWeight");
  ok("marine weight: hoop pine marine 600 kg/m3, hardwood marine has no figure (said)", /About [\d.]+ kg/.test(w1) && /600/.test(w1) && /no maker figure/.test(w1) && s.weightKg < mdfKg, w1);
  await shot("02_box_marine_grain");
  // grain lock off then on
  await click("#bdGrain", 900); s = await B();
  ok("grain lock off: setting followed, grain lines still drawn (legend says off)", s.grain === false && /grain lock off/.test(await txt("#bdDraw svg")) && s.drawn.every((d) => d.errors.length === 0), "");
  await click("#bdGrain", 900); s = await B();
  ok("grain lock back on", s.grain === true && grainOk(s));
  // 3. hoop pine 18 mm: 18.5 mm sheets counted, said on screen
  await choose("#bdMat", "hoop"); s = await B();
  const tol = await txt("#bdTol");
  ok("hoop pine 18 mm: 18.5 mm sheets counted within the stated tolerance", s.material === "hoop" && s.tolOff.includes(18.5) && s.sheetThicknesses.includes(18.5) && /18\.5 mm/.test(tol) && /±0\.5 mm/.test(tol), tol.slice(0, 200));
  ok("hoop pine: layout clean with grain lock", grainOk(s) && allPlaced(s));
  await shot("03_box_hoop_tolerance");
  // 4. back to marine; saved on the box
  await choose("#bdMat", "marine"); await wait(1200);
  let nsb = await api("projects/new_sub_box"); const boxData = (nsb.items ? nsb.items.find((i) => i.kind === "box")?.data : nsb);
  ok("box material saved in the project file (marine, grain on)", boxData?.boardMaterial === "marine" && boxData?.boardGrain === true, JSON.stringify({ m: boxData?.boardMaterial, g: boxData?.boardGrain }));
  // 5. BOM follows the material
  await tab("bom", 1500); let bs = await bom();
  const ml = encLines(bs).find((l) => l.key.startsWith("ply:marine:18:"));
  ok("BOM: enclosure sheet line is marine plywood 18 mm (no MDF line)", !!ml && !encLines(bs).some((l) => l.key.startsWith("mdf:")) && /^Marine plywood sheet 18 mm/.test(ml.item), JSON.stringify(encLines(bs).map((l) => l.key)));
  ok("BOM page shows the marine line", /Marine plywood sheet 18 mm/.test(await txt("#page")));
  await shot("04_bom_box_marine");
  // 6. Infinite baffle: birch by default
  await section("ib"); await click("nav button[data-tab=ib]", 1300); await tab("boards", 1200); s = await B();
  ok("IB baffle: default material birch plywood, source = IB baffle, 18 mm", s.source === "ib" && s.material === "birch" && (await p.$eval("#bdMat", (x) => x.value)) === "birch" && s.t === 18 && s.sheetCategories.join() === "birch plywood", JSON.stringify({ src: s.source, m: s.material, t: s.t, c: s.sheetCategories }));
  ok("IB hint cites PS Sound / research_h", /PS Sound/.test(await txt("#bdMatNote")) && /research_h/.test(await txt("#bdMatNote")));
  ok("IB baffle on birch: drawn with grain lock, no panel across the grain", s.grain === true && grainOk(s) && allPlaced(s) && (await p.$$eval("#bdDraw svg polygon.grain", (x) => x.length)) === s.panels.length, JSON.stringify(s.drawn.map((d) => [d.L, d.W, d.grainErrors.length])));
  const w2 = await txt("#bdWeight");
  ok("IB weight: birch 680 kg/m3 (Metsa)", /About [\d.]+ kg/.test(w2) && /680/.test(w2) && /Metsa/.test(w2), w2);
  await shot("05_ib_birch");
  // the IB item is new (kept in memory until changed): pick birch explicitly so it is saved, then check the BOM
  await choose("#bdMat", "marine"); await choose("#bdMat", "birch"); await wait(1200);
  nsb = await api("projects/new_sub_box"); const ibIt = nsb.items?.find((i) => i.kind === "ib");
  ok("IB material saved on the IB item (birch)", ibIt?.data?.boardMaterial === "birch", JSON.stringify(ibIt?.data ?? {}).slice(0, 200));
  await tab("bom", 1500); bs = await bom();
  const bl = encLines(bs).find((l) => l.key.startsWith("ply:birch:18:"));
  ok("BOM: IB baffle line is birch plywood; the box line stays marine", !!bl && /^Birch plywood sheet 18 mm/.test(bl.item) && encLines(bs).some((l) => l.key.startsWith("ply:marine:18:")), JSON.stringify(encLines(bs).map((l) => l.key)));
  await shot("06_bom_ib_birch_box_marine");
  // 7. reload keeps both
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1200);
  await section("subwoofer"); await tab("boards", 1200); s = await B();
  ok("after reload: box still marine plywood (grain on)", s.material === "marine" && s.grain === true && grainOk(s), JSON.stringify({ m: s.material, g: s.grain }));
  await section("ib"); await tab("boards", 1200); s = await B();
  ok("after reload: IB baffle still birch plywood", s.source === "ib" && s.material === "birch", JSON.stringify({ src: s.source, m: s.material }));
  await shot("07_reload_ib_birch");
  await tab("help", 800);
  ok("Help: Boards section covers the material choice", /MDF and plywood/.test(await txt("#boardsHelp")) && /birch/.test(await txt("#page")));
  ok("no console errors", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") { ok("run finished without exception", false, String(e)); } else ok("smoke", errs.length === 0, JSON.stringify(errs)); }
finally { await b.close(); }
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), port: PORT, results }, null, 1));
const fails = results.filter((r) => !r.pass).length; console.log(`${results.length - fails}/${results.length} passed`); process.exit(fails ? 1 : 0);
