// Headless dry run of A13_BOARDS (R33): the Boards tab (MDF sheets, nesting, best fit, drawing, filters, units, 2 drivers).
// B7_PLYWOOD_BOARDS 2026-11-23: Help heading is now "Boards (MDF and plywood sheets)"; the box stays on MDF (default material).
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node app/server/server.mjs  (never port 8420)
// Usage: node scripts/ui_dryrun_boards.mjs <outDir> [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
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
const p = await b.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 500) => p.waitForTimeout(ms);
const setVal = async (sel, v) => { await p.$eval(sel, (i, v) => { i.value = String(v); i.dispatchEvent(new Event("change")); }, v); await wait(700); };
const choose = async (sel, v) => { await p.selectOption(sel, v); await wait(700); };
const click = async (sel) => { await p.click(sel); await wait(700); };
const B = () => p.evaluate(() => window.__abBoards());
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const tab = (k) => click(`nav button[data-tab=${k}]`);
/** Every panel drawn exactly once, layout free of overlaps (checked by engine checkLayout in the page), nothing unplaced. */
const allPlaced = (s) => { const drawn = s.drawn.flatMap((d) => d.placed.flatMap((x) => x.ids)).sort(); const want = s.panels.map((x) => x.id).sort(); return JSON.stringify(drawn) === JSON.stringify(want) && s.unplaced.length === 0; };
const noErr = (s) => s.drawn.every((d) => d.errors.length === 0);
const inside = (s) => s.drawn.every((d) => d.placed.every((x) => x.x >= s.trim - 1e-6 && x.y >= s.trim - 1e-6 && x.x + x.w <= d.L - s.trim + 1e-6 && x.y + x.h <= d.W - s.trim + 1e-6));
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1000);
  ok("page loads", !!(await p.$("nav button[data-tab=boards]")) && errs.length === 0, JSON.stringify(errs).slice(0, 200));
  ok("tab order: Design new, Analyse, Boards, Drivers, Parts (B3), System (B4), Project (B1), Help", (await p.$$eval("nav button", (bs) => bs.map((x) => x.dataset.tab).join(","))) === "design,fix,boards,drivers,parts,system,bom,project,help"); // B3_PARTS_DB: Parts tab after Drivers; B4_SYSTEM_UI: System tab; B5_BOM: BOM tab (expectation updated by B7)
  if (smoke) { await tab("boards"); await shot("smoke"); throw "smoke-done"; }
  ok("project is new_sub_box", (await p.$eval("#proj", (s) => s.value)) === "new_sub_box");
  await tab("boards"); await wait(500);
  let s = await B();
  ok("Boards: source = Design new box", s?.source === "design", s?.source);
  const sizes = await p.$$eval("#bdPanels tr[data-id] td:nth-child(2)", (tds) => tds.map((t) => t.textContent.trim()));
  ok("panels listed with whole-mm sizes", sizes.length === 6 && sizes.every((x) => /^\d+ × \d+$/.test(x)), sizes.join(" | "));
  ok("panels = 2 trapezoid sides + 4 rectangles, 16 mm", s.t === 16 && s.panels.filter((x) => x.trap).length === 2 && s.panels.length === 6, JSON.stringify(s.panels.map((x) => `${x.name} ${x.w}x${x.h}`)));
  ok("best-fit sheet found with % used", !!s.best && s.best.pct > 0 && s.best.pct < 100 && /% used/.test(await p.$eval("#bdSmallest", (e) => e.textContent)), JSON.stringify(s.best));
  ok("cheapest buy found", !!s.cheapest, JSON.stringify(s.cheapest));
  ok("drawing: every panel once, no overlaps, inside the trimmed sheet", allPlaced(s) && noErr(s) && inside(s), JSON.stringify(s.drawn.map((d) => d.errors)));
  ok("drawing has one polygon per panel and numbered cuts", (await p.$$eval("#bdDraw svg polygon.panel", (x) => x.length)) === 6 && (await p.$$eval("#bdDraw svg line.cut", (x) => x.length)) === s.drawn[0].cuts && s.drawn[0].cuts > 0);
  ok("cut order listed", (await p.$$eval(".bdCutList li", (x) => x.length)) >= s.drawn[0].cuts);
  ok("Bunnings cutting-service hint shown", /100 mm/.test(await p.$eval("#bdBunCut", (e) => e.textContent)));
  ok("prices dated, not live; product links", /not live/.test(await p.$eval("#bdBest", (e) => e.textContent)) && (await p.$$eval("#bdTable a", (a) => a.filter((x) => /^https:\/\//.test(x.href)).length)) > 0);
  const best0 = s.best; await shot("01_boards_new_sub_box");
  // kerf and trim change the layout
  const before = JSON.stringify(s.drawn[0].placed);
  await setVal("#bdCutting input[data-key=kerf]", 12); s = await B();
  ok("kerf 12 mm: layout updates, still no overlaps", s.kerf === 12 && JSON.stringify(s.drawn[0].placed) !== before && noErr(s) && allPlaced(s), `kerf ${s.kerf}`);
  await setVal("#bdCutting input[data-key=trim]", 25); s = await B();
  ok("trim 25 mm: every panel at least 25 mm from the sheet edge", s.trim === 25 && inside(s) && noErr(s), `trim ${s.trim}`);
  await shot("02_kerf12_trim25");
  await setVal("#bdCutting input[data-key=kerf]", 3.2); await setVal("#bdCutting input[data-key=trim]", 5); s = await B();
  ok("back to 3.2 / 5: same best sheet", s.best?.L === best0.L && s.best?.W === best0.W && s.best?.supplier === best0.supplier, JSON.stringify(s.best));
  // supplier filter
  await choose("#bdSupplier", "Bunnings"); s = await B();
  ok("supplier filter Bunnings: only Bunnings sheets", s.suppliers.length === 1 && s.suppliers[0] === "Bunnings" && s.best?.supplier === "Bunnings", JSON.stringify({ sup: s.suppliers, best: s.best }));
  await choose("#bdSupplier", "Plyco"); s = await B();
  ok("supplier filter Plyco: best is a Plyco sheet", s.suppliers.join() === "Plyco" && s.best?.supplier === "Plyco", JSON.stringify(s.best));
  await choose("#bdSupplier", "others"); s = await B();
  ok("supplier filter others: no Bunnings/Bowens/Plyco", s.suppliers.every((x) => !["Bunnings", "Bowens", "Plyco"].includes(x)) && s.rows > 0, s.suppliers.join());
  await choose("#bdSupplier", "all"); await choose("#bdCat", "moisture_resistant"); s = await B();
  ok("type filter MR: best is moisture resistant", /MR|Moisture/i.test(s.best?.product ?? ""), s.best?.product);
  await choose("#bdCat", "all");
  // sort and pick a row
  await click("#bdTable th[data-sort=price]");
  const prices = await p.$$eval("#bdTable tr[data-pick] td:nth-child(5)", (t) => t.map((x) => parseFloat(x.textContent.replace(/[^0-9.]/g, "")) || Infinity));
  ok("sort by price", prices.every((v, i) => i === 0 || v >= prices[i - 1]), prices.slice(0, 6).join(","));
  const pick = await p.$$eval("#bdTable tr[data-pick]", (trs) => { const tr = trs.find((x) => /2[,.]?400/.test(x.children[0].textContent) && /1[,.]?200/.test(x.children[0].textContent)); return tr?.dataset.pick; });
  await click(`#bdTable tr[data-pick=${pick}]`); s = await B();
  ok("click a 2400 × 1200 row: it is drawn", s.drawn[0]?.L === 2400 && s.drawn[0]?.W === 1200 && noErr(s) && allPlaced(s), JSON.stringify(s.drawn.map((d) => [d.L, d.W])));
  await shot("03_row_2400x1200");
  // save picture and print
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }).catch(() => null), p.click("#bdSvg")]); await wait(800);
  const saved = await api("projects/new_sub_box/exports/new_sub_box_boards.svg");
  ok("Save picture (SVG): download + saved in the project exports (data copy)", !!dl && typeof saved === "string" && /<svg/.test(saved), dl ? dl.suggestedFilename() : "no download");
  await p.evaluate(() => { window.print = () => { window.__printed = document.body.classList.contains("printBoards"); }; });
  await click("#bdPrint");
  ok("Print: print layout built (sheet drawing + panel list + cut order)", await p.evaluate(() => window.__printed === true && !!document.querySelector("#boardsPrint svg") && /Cut order/.test(document.querySelector("#boardsPrint").textContent)));
  await p.emulateMedia({ media: "print" }); await p.evaluate(() => document.body.classList.add("printBoards")); await p.screenshot({ path: `${out}/04_print_layout.png`, fullPage: true });
  await p.evaluate(() => document.body.classList.remove("printBoards")); await p.emulateMedia({ media: "screen" });
  // imperial
  await choose("#units", "imperial"); s = await B();
  ok("imperial: still whole-mm cut sizes, inches shown, drawing kept", /in/.test(await p.$eval("#bdPanels", (e) => e.textContent)) && (await p.$$eval("#bdDraw svg", (x) => x.length)) > 0 && noErr(s), (await p.$eval("#bdSmallest", (e) => e.textContent)).slice(0, 120));
  await shot("05_imperial");
  await choose("#units", "metric");
  // the saved project box (Analyse / Fix)
  await choose("#bdSource", "fix"); s = await B();
  ok("source Analyse/Fix: saved box 405 x 360 x 255 panels", s.source === "fix" && s.panels.some((x) => x.name === "Bottom" && x.w === 373 && x.h === 255) && allPlaced(s) && noErr(s), JSON.stringify(s.panels.map((x) => `${x.name} ${x.w}x${x.h}`)));
  await choose("#bdSource", "design");
  // 18 mm: Bunnings sells only 3600 x 1200
  await tab("design"); await setVal("#dsB input[data-key=t]", 18); await tab("boards"); s = await B();
  const bun = await p.$eval("#bdSupSizes li[data-sup=Bunnings]", (e) => ({ cls: e.className, t: e.textContent })).catch(() => ({ cls: "", t: "missing" }));
  ok("18 mm: Bunnings flagged as big sheets only (3600 × 1200)", s.t === 18 && /warn/.test(bun.cls) && /3600×1200/.test(bun.t) && /only in big sheets/.test(bun.t), bun.t);
  ok("18 mm: a smaller sheet elsewhere still found", !!s.best && s.best.L * s.best.W < 3600 * 1200, JSON.stringify(s.best));
  await shot("06_18mm");
  await tab("design"); await setVal("#dsB input[data-key=t]", 16);
  // two drivers
  await setVal("#dsA input[data-key=drivers]", 2); await click("#bestSize"); await tab("boards"); s = await B();
  ok("2-driver box: panels follow the bigger box, best fit found, no overlaps", s.panels.length === 6 && !!s.best && allPlaced(s) && noErr(s), `${JSON.stringify(s.panels.map((x) => `${x.name} ${x.w}x${x.h}`))} best ${JSON.stringify(s.best)}`);
  await shot("07_two_drivers");
  await tab("design"); await setVal("#dsA input[data-key=drivers]", 1); await tab("boards");
  // Help
  await tab("help"); ok("Help has a Boards section", /Boards \(MDF and plywood sheets\)/.test(await p.$eval("#boardsHelp", (e) => e.textContent).catch(() => "")));
  ok("no console errors", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") { ok("run finished without exception", false, String(e)); } else ok("smoke", errs.length === 0, JSON.stringify(errs)); }
finally { await b.close(); }
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), port: PORT, results, best: results.length }, null, 1));
const fails = results.filter((r) => !r.pass).length; console.log(`${results.length - fails}/${results.length} passed`); process.exit(fails ? 1 : 0);
