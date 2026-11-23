// P1_PUBLIC_DATA (2026-11-23): headless dry run of the PUBLIC data copy (no prices, generic board sheets): Boards tab (smallest
// sheet, no cheapest buy, the no-price note, supplier menu, drawing, plywood), BOM tab (sheet line without a price).
// Needs a server on a COPY of the public data: PORT=8421 AB_DATA_DIR=<copy> node app/server/server.mjs (never port 8420).
// Usage: node scripts/public_data/ui_dryrun_public.mjs <outDir>   (PORT env, default 8421). Writes results.json + screenshots.
import fs from "node:fs";
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
if (PORT === "8420") { console.log("REFUSED: port 8420 is the live server"); process.exit(2); }
const out = process.argv[2] || "."; fs.mkdirSync(out, { recursive: true });
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + info : ""}`); };
const api = async (p) => { const r = await fetch(BASE + "/api/" + p); return r.ok ? r.json() : { status: r.status }; };
const health = await api("health"); if (!health.ok || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on a data copy:", JSON.stringify(health)); process.exit(2); }
const boards = await api("boards"); const ply = await api("boards/plywood");
ok("API: generic boards, no prices", boards.generic === true && boards.sheets.every((s) => s.priceAud === null && s.supplier === "Generic size") && ply.sheets.length > 0 && ply.sheets.every((s) => s.priceAud === null), `${boards.sheets?.length} MDF, ${ply.sheets?.length} plywood`);
const idx = await api("parts"); ok("API: parts index has no AUD prices", idx.categories.every((c) => c.withAudPrice === 0), JSON.stringify(idx.categories.map((c) => c.count)));

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 600) => p.waitForTimeout(ms);
const click = async (sel) => { await p.click(sel); await wait(800); };
const text = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => null);
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1000);
  ok("page loads without errors", !!(await p.$("nav button[data-tab=boards]")) && errs.length === 0, JSON.stringify(errs).slice(0, 200));
  await click("nav button[data-tab=boards]"); await wait(800);
  const s = await p.evaluate(() => window.__abBoards?.());
  ok("Boards: smallest sheet found on a generic size", !!s?.best && s.best.supplier === "Generic size" && !!(await p.$("#bdSmallest")), JSON.stringify(s?.best));
  ok("Boards: no cheapest-buy card without prices", !(await p.$("#bdCheapest")) && !s?.cheapest);
  ok("Boards: the note says prices are not available", /Prices are not available/.test((await text("#bdPriceNote")) ?? ""), (await text("#bdPriceNote"))?.slice(0, 120));
  ok("Boards: list hint says no prices", /No prices/.test((await text("#bdListHint")) ?? ""));
  const opts = await p.$$eval("#bdSupplier option", (o) => o.map((x) => x.value));
  ok("Boards: supplier menu lists only All and Others (Generic size)", JSON.stringify(opts) === JSON.stringify(["all", "others"]), JSON.stringify(opts));
  ok("Boards: no supplier links in the list", (await p.$$eval("#bdTable a", (a) => a.length)) === 0);
  ok("Boards: drawing has the 6 panels", (await p.$$eval("#bdDraw svg polygon.panel", (x) => x.length)) === 6);
  await p.screenshot({ path: `${out}/boards_public.png`, fullPage: true });
  await p.selectOption("#bdMat", "birch"); await wait(1200);
  const s2 = await p.evaluate(() => window.__abBoards?.());
  ok("Boards: birch plywood works on generic sizes (smallest sheet, no errors)", !!s2?.best && errs.length === 0, JSON.stringify(s2?.best));
  await p.selectOption("#bdMat", "mdf"); await wait(1000);
  await click("nav button[data-tab=bom]"); await wait(1500);
  const bomTxt = (await text("#page")) ?? "";
  ok("BOM: an MDF sheet line is listed", /MDF sheet 16 mm, \d+ x \d+ mm/.test(bomTxt), (bomTxt.match(/MDF sheet 16 mm, \d+ x \d+ mm/) || [""])[0]);
  ok("BOM: lines without a price say so", /no price known/.test(bomTxt));
  await p.screenshot({ path: `${out}/bom_public.png`, fullPage: true });
  ok("no page errors at the end", errs.length === 0, JSON.stringify(errs).slice(0, 200));
} catch (e) { ok("run finished without exception", false, String(e).slice(0, 300)); }
await b.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
