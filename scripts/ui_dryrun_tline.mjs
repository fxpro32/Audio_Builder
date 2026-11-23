// Headless dry run of A15_TLINE (R36): Design new → Transmission line: plots, comparison, 3D line inside the box, cut list,
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// Boards panels, save + reload, sample project, imperial units.
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node app/server/server.mjs  (never port 8420)
// Usage: node scripts/ui_dryrun_tline.mjs <outDir> [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
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
const setVal = async (sel, v) => { await p.$eval(sel, (i, v) => { i.value = String(v); i.dispatchEvent(new Event("change")); }, v); await wait(900); };
const choose = async (sel, v) => { await p.selectOption(sel, v); await wait(1200); };
const click = async (sel) => { await p.click(sel); await wait(900); };
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const tab = (k) => click(`nav button[data-tab=${k}]`);
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const paths = (sel) => p.$$eval(`${sel} svg path`, (ps) => ps.filter((x) => (x.getAttribute("d") || "").length > 40).length).catch(() => 0);
const bounds = () => p.evaluate(() => window.__abView?.bounds() ?? []);
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1200);
  ok("page loads without errors", !!(await p.$("#page")) && errs.length === 0, JSON.stringify(errs).slice(0, 200));
  if (smoke) { await shot("smoke"); throw "smoke-done"; }
  const before = await api("projects/existing_sub");
  ok("starts on Design new, project new_sub_box", (await p.$eval("#proj", (s) => s.value)) === "new_sub_box" && !!(await p.$("nav button.on[data-tab=design]")));
  const opts = await p.$$eval("#dsA select[data-key=topology] option", (o) => o.map((x) => x.value + "=" + x.textContent));
  ok("Box type offers Transmission line (default on, no extra clicks)", opts.some((o) => o.startsWith("tl=Transmission line")), opts.join(" | "));
  await choose("#dsA select[data-key=topology]", "tl"); await wait(800);
  ok("TL inputs shown (outside sizes, channels, taper, stuffing)", !!(await p.$("#dsT input[data-key=W]")) && !!(await p.$("#dsT input[data-key=channels]")) && !!(await p.$("#dsT input[data-key=stuffKgM3]")));
  const res = await txt("#tlOut");
  ok("result table: length, tuning, net volume, outside size", /Line length/.test(res) && /Hz/.test(await txt("#tlTune")) && /L/.test(await txt("#tlNet")) && /×/.test(await txt("#tlSize")), (await txt("#tlTune")) + " | " + (await txt("#tlSize")));
  ok("plain-words verdict for the Pioneer (poor TL candidate, Qts 0.65)", /Poor TL candidate: Qts 0.65/.test(await txt("#tlSuit")), (await txt("#tlSuit")).slice(0, 90));
  for (const [id, n] of [["#pSpl", 4], ["#pX", 1], ["#pV", 1], ["#pZ", 1], ["#pCmp", 6]]) ok(`plot ${id} renders ${n}+ curves`, (await paths(id)) >= n, String(await paths(id)));
  const cmpRows = await p.$$eval("#tlCmp tr", (r) => r.length);
  ok("comparison table: line, sealed 22.8 L, ported 34 L", cmpRows === 5 && /Sealed 22.8 L/.test(await txt("#tlCmp")) && /Ported 34.0 L/.test(await txt("#tlCmp")) && /In the car/.test(await txt("#tlCmp")), (await txt("#tlCmp")).replace(/\s+/g, " ").slice(0, 400));
  const tlv = await p.$eval("#dsT input[data-key=W]", (i) => Number(i.value)); const H0 = await p.$eval("#dsT input[data-key=H]", (i) => Number(i.value)); const D0 = await p.$eval("#dsT input[data-key=D]", (i) => Number(i.value));
  // 3D: dividers, path and terminus drawn, all inside the box
  let bb = await bounds(); const W = tlv / 1000, H = H0 / 1000, D = D0 / 1000;
  const divs = bb.filter((x) => x.name.startsWith("TL_Divider_")); const chans = await p.$eval("#dsT input[data-key=channels]", (i) => Number(i.value));
  const inside = (x, tol = 0.002) => x.min[0] >= -W / 2 - tol && x.max[0] <= W / 2 + tol && x.min[1] >= -tol && x.max[1] <= H + tol && x.min[2] >= -D / 2 - tol && x.max[2] <= D / 2 + tol;
  ok("3D: one divider per fold, inside the box", divs.length === chans - 1 && divs.every((x) => inside(x)), `${divs.length} dividers, channels ${chans}`);
  const pathObjs = bb.filter((x) => x.name.startsWith("TL_Path"));
  ok("3D: air path (stuffed + open part) drawn inside the box", pathObjs.length === 2 && pathObjs.every((x) => inside(x, 0.01)), pathObjs.map((x) => x.name).join(","));
  ok("3D: terminus opening drawn on the box", bb.some((x) => x.name === "TL_Terminus" && inside(x, 0.006)));
  ok("3D: driver on the front baffle", bb.some((x) => x.name === "Driver"));
  await shot("tl_design");
  await p.$eval("#v3d", (e) => e.scrollIntoView()); await wait(400); await p.screenshot({ path: `${out}/tl_3d.png`, clip: await p.$eval("#v3d", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; }) }).catch(() => {});
  // edit the height: the line is recomputed
  const len0 = (await txt("#tlOut")).match(/Line length \(centre line\)\s*([\d.,]+)/)?.[1];
  await setVal("#dsT input[data-key=H]", H0 + 100);
  const len1 = (await txt("#tlOut")).match(/Line length \(centre line\)\s*([\d.,]+)/)?.[1];
  ok("editing the height recomputes the line length", len0 && len1 && Number(len1) > Number(len0), `${len0} -> ${len1}`);
  await setVal("#dsT input[data-key=channels]", chans + 1);
  bb = await bounds();
  ok("editing channels redraws the dividers", bb.filter((x) => x.name.startsWith("TL_Divider_")).length === chans, String(bb.filter((x) => x.name.startsWith("TL_Divider_")).length));
  await setVal("#dsT input[data-key=channels]", chans); await setVal("#dsT input[data-key=H]", H0);
  // Suggest button restores a starting line
  await click("#tlSuggest");
  ok("Suggest a line restores the starting sizes", (await p.$eval("#dsT input[data-key=H]", (i) => Number(i.value))) === H0);
  // cut list
  await click("#cut");
  const cutRows = await p.$$eval("#tlCut tr", (r) => r.length - 1);
  ok("cut list: sides, top, bottom, baffle, back + dividers", cutRows === 5 + chans - 1 && /Divider 1/.test(await txt("#tlCut")), `${cutRows} rows`);
  // save + reload
  await wait(1200);
  const saved = await api("projects/new_sub_box");
  ok("saved in the project JSON (data copy): topology tl + line inputs", saved.design?.topology === "tl" && saved.design?.tl?.W === tlv && saved.design?.tl?.cmpSealedL === 22.83, JSON.stringify(saved.design?.tl));
  // Boards
  await tab("boards"); await wait(1500);
  const s = await p.evaluate(() => window.__abBoards());
  ok("Boards: the TL panels (incl. dividers) from Design new", s?.source === "design" && s.panels.length === 6 + chans - 1 && s.panels.some((x) => /Divider/.test(x.name)) && s.unplaced.length === 0, s ? `${s.panels.length} panels, best ${s.best?.supplier} ${s.best?.L}x${s.best?.W}` : "none");
  await shot("tl_boards");
  await p.reload({ waitUntil: "networkidle" }); await wait(1500);
  if (!(await p.$("nav button.on[data-tab=design]"))) await tab("design");
  ok("after reload: Design new shows the transmission line again", (await p.$eval("#dsA select[data-key=topology]", (s) => s.value)) === "tl" && !!(await p.$("#tlOut")));
  // imperial units
  await choose("#units", "imperial");
  const unitTxt = await p.$eval("#dsT", (e) => e.textContent);
  ok("imperial: stuffing in lb/ft³, sizes in inches", /lb\/ft³/.test(unitTxt) && /\bin\b/.test(unitTxt));
  const stuffShown = await p.$eval("#dsT input[data-key=stuffKgM3]", (i) => Number(i.value));
  ok("imperial: 8 kg/m³ shown as 0.5 lb/ft³", Math.abs(stuffShown - 8 / 16.0185) < 0.01, String(stuffShown));
  await choose("#units", "metric");
  // sample project
  await choose("#proj", "tl_pioneer"); await wait(800);
  if (!(await p.$("nav button.on[data-tab=design]"))) await tab("design");
  ok("sample project tl_pioneer opens on the transmission line", (await p.$eval("#dsA select[data-key=topology]", (s) => s.value)) === "tl" && /Poor TL candidate/.test(await txt("#tlSuit")));
  await shot("tl_pioneer");
  // other projects untouched
  const after = await api("projects/existing_sub");
  ok("existing_sub unchanged by the dry run", JSON.stringify(before) === JSON.stringify(after));
  ok("no page errors during the run", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") ok("run finished", false, String(e).slice(0, 300)); }
finally { await b.close(); }
fs.writeFileSync(`${out}/results${smoke ? "_smoke" : ""}.json`, JSON.stringify({ date: new Date().toISOString(), port: PORT, results }, null, 1));
const failed = results.filter((r) => !r.pass).length; console.log(`${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
