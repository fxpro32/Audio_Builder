// Headless dry run of B3_PARTS_DB (R39, R40): Parts tab (categories, filters, sorting, detail with source links, prices and
// the CHECK warning), Add to project (amplifier, cable with length, fuse) and Save to My items, edit form of an electrical
// item in the Project tab and in My items, Drivers tab with the car subs and car speakers (type filter), the door picker's
// car speaker group, old projects still open with their driver (existing_sub, new_sub_box: Pioneer TS-W3002D4), no page errors.
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node <app>/server/server.mjs  (never port 8420)
// Usage: node scripts/ui_dryrun_parts.mjs <outDir> <dataCopyDir> [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
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
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 400) => p.waitForTimeout(ms);
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const state = () => p.evaluate(() => window.__abState?.());
const click = async (sel, ms = 600) => { await p.click(sel); await wait(ms); };
const setF = async (sel, v, ms = 400) => { await p.fill(sel, String(v)); await p.press(sel, "Tab"); await wait(ms); };
const rows = () => p.$$eval("#pl tr[data-id]", (trs) => trs.map((t) => ({ id: t.dataset.id, cells: [...t.children].map((c) => c.textContent.trim()) })));
const cat = async (c) => { await click(`#pcats2 button[data-pcat=${c}]`, 300); await p.waitForSelector("#pl", { timeout: 15000 }); await wait(300); };
const openProj = async (n) => { await p.selectOption("#proj", n); await wait(1500); };
const drvSel = () => p.$eval("select[data-key=driverId]", (s) => s.value).catch(() => "");
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "domcontentloaded" }); await wait(2500);
  let st = await state();
  ok("app opens on new_sub_box (Subwoofer)", st?.project === "new_sub_box", JSON.stringify(st).slice(0, 120));
  if (smoke) { await shot("smoke"); throw "smoke-done"; }
  // ---------- old projects keep their driver ----------
  await click("nav button[data-tab=design]", 900);
  ok("new_sub_box still uses the Pioneer TS-W3002D4 (private entry)", (await drvSel()) === "pioneer-ts-w3002d4", await drvSel());
  const pioOpts = await p.$$eval("select[data-key=driverId] option", (o) => o.filter((x) => /^Pioneer TS-W3002D4/.test(x.textContent.trim())).map((x) => x.value));
  ok("Pioneer TS-W3002D4 listed once in the driver picker (library copy hidden behind his own)", pioOpts.length === 1 && pioOpts[0] === "pioneer-ts-w3002d4", JSON.stringify(pioOpts));
  await openProj("existing_sub"); await click("nav button[data-tab=fix]", 1200);
  ok("existing_sub opens with its driver", (await drvSel()) === "pioneer-ts-w3002d4" && (await state()).project === "existing_sub", await drvSel());
  // ---------- Parts tab ----------
  await openProj("car_a");
  await click("nav button[data-tab=parts]", 600); await p.waitForSelector("#pcats2"); await cat("amplifiers");
  ok("Parts tab: 7 driver categories + 10 parts categories", (await p.$$("#pcats button[data-dtype]")).length === 7 && (await p.$$("#pcats2 button[data-pcat]")).length === 10, await txt("#pcats2"));
  ok("amplifiers listed with a count line and paging", /of 904 amplifiers/.test(await txt("#pCount")) && (await rows()).length === 100 && !!(await p.$("#pPager button[data-pg=next]")), await txt("#pCount"));
  await p.selectOption("#pfilters select[data-f=ch]", "1"); await wait(200); await p.selectOption("#pfilters select[data-f=load]", "1"); await wait(200); await setF("#pfilters input[data-f=rmsMin]", 1500);
  let r = await rows();
  ok("filters: 1 channel, RMS at 1 ohm >= 1500 W", r.length > 0 && r.every((x) => x.cells[3] === "1" && Number(x.cells[6]) >= 1500), `${r.length} rows; ${await txt("#pCount")}`);
  await click("#pl th[data-sort=rms1]", 300); await click("#pl th[data-sort=rms1]", 300);
  r = await rows(); const v = r.map((x) => Number(x.cells[6]));
  ok("sort by RMS 1 ohm, descending", v.every((x, i) => i === 0 || x <= v[i - 1]) && /▼/.test(await txt("#pl th[data-sort=rms1]")), v.slice(0, 5).join(","));
  await setF("#pq", "T1500-1bdCP", 300);
  ok("search finds the Rockford T1500-1bdCP among the filtered amps", (await rows()).some((x) => x.id === "rockford-t1500-1bdcp"), JSON.stringify((await rows()).map((x) => x.id)));
  await p.click(`#pl tr[data-id="rockford-t1500-1bdcp"]`); await wait(500);
  const srcHref = await p.$eval("#pSources a", (a) => a.href).catch(() => "");
  ok("detail: every value, maker source link, AUD price", /rockfordfosgate\.com/.test(srcHref) && /AUD 1065\.78/.test(await txt("#pPrices")) && /min load ohm/i.test(await txt("#pValues")), srcHref);
  await shot("01_parts_amp_detail");
  await click("#pAdd", 1500);
  // ---------- CHECK warning on an auto-parsed record ----------
  await click("#pClear", 300); await setF("#pq", "APHF-500.4D-H2", 300); await p.click("#pl tr[data-id]"); await wait(400);
  ok("auto-parsed record shows the CHECK warning in the detail", /CHECK/.test(await txt("#pCheck")) && !!(await p.$("#pCheck.warn")) && /1000/.test(await txt("#pValues")), (await txt("#pCheck")).slice(0, 120));
  // ---------- cable: real copper area, material; add with length ----------
  await cat("cable"); await setF("#pfilters input[data-f=areaMin]", 20, 200); await p.selectOption("#pfilters select[data-f=mat]", "copper"); await wait(300);
  r = await rows();
  ok("cable filter: real mm² >= 20, copper", r.length > 0 && r.every((x) => Number(x.cells[4].replace("~", "")) >= 20 && x.cells[5] === "copper"), `${r.length} rows`);
  await p.click("#pl tr[data-id]"); await wait(400); await p.fill("#pLen", "4.5"); await click("#pAdd", 1500);
  // ---------- fuse ANL ----------
  await cat("fuses"); await p.selectOption("#pfilters select[data-f=type]", "ANL"); await wait(300);
  r = await rows();
  ok("fuse filter: ANL", r.length > 0 && r.every((x) => x.cells[3] === "ANL"), `${r.length} rows`);
  const fuseRow = r.find((x) => Number(x.cells[4]) > 0) ?? r[0];
  await p.click(`#pl tr[data-id="${fuseRow.id}"]`); await wait(400); await click("#pAdd", 1500);
  await click("#pSave", 1200);
  await shot("02_parts_fuse_detail");
  const vc = await api("projects/car_a");
  const el = (vc.items ?? []).filter((i) => i.section === "electrical");
  const amp = el.find((i) => i.kind === "amplifier"), cab = el.find((i) => i.kind === "cable"), fu = el.find((i) => i.kind === "fuse" || i.kind === "fuseholder");
  ok("car_a now holds the amplifier, the cable (4.5 m) and the fuse with data.partId", amp?.data.partId === "rockford-t1500-1bdcp" && amp.data.minLoadOhm === 1 && amp.data.channels === 1 && cab?.data.lengthM === 4.5 && !!cab.data.partId && fu?.data.partId === fuseRow.id, JSON.stringify(el.map((i) => [i.kind, i.data])).slice(0, 280));
  const items = await api("items"); const mi = items.find((x) => x.kind === "fuse" || x.kind === "fuseholder");
  ok("fuse saved to My items", !!mi && mi.section === "electrical", JSON.stringify(items).slice(0, 200));
  // ---------- Project tab: edit form ----------
  await click("nav button[data-tab=project]", 800);
  await p.click(`#pjTable tr[data-id="${amp.id}"] button[data-a=edit]`); await wait(800);
  ok("Project tab: edit form of the amplifier, part values as placeholders", !!(await p.$("#itemForm")) && /Rockford/.test(await txt("#itemForm")) && (await p.$eval("#itemForm input[data-ifield=iMaxA]", (e) => e.placeholder)).startsWith("200"), await p.$eval("#itemForm input[data-ifield=iMaxA]", (e) => e.placeholder).catch(() => "none"));
  await setF("#itemForm input[data-ifield=minLoadOhm]", 2, 1200);
  const vc2 = await api("projects/car_a");
  ok("edit saved: minLoadOhm 2 on the amplifier item", vc2.items.find((i) => i.id === amp.id)?.data.minLoadOhm === 2 && /minimum load 2/.test(await txt(`#pjTable tr[data-id="${amp.id}"]`)), JSON.stringify(vc2.items.find((i) => i.id === amp.id)?.data));
  await shot("03_project_tab_edit");
  // ---------- Drivers tab: car subs and car speakers ----------
  await click("nav button[data-tab=parts]", 500); await click('#pcats button[data-dtype="midbass"]', 1200);
  st = await state();
  r = await p.$$eval("#dl tr[data-id]", (t) => t.map((x) => x.dataset.id));
  ok("Drivers tab opened on car midbass (type filter), car-drivers rows", st.tab === "drivers" && st.driverFilter.type === "midbass" && r.length > 0 && r.every((id) => id.startsWith("lib-cardrv-")) && /type Midbass/.test(await txt("#dActive")), `${r.length} rows; ${await txt("#dCount")}`);
  await shot("04_drivers_midbass");
  await click("#clearF", 500); await p.check("#fSub"); await wait(300); await p.fill("#q", "sundown"); await wait(500);
  r = await p.$$eval("#dl tr[data-id]", (t) => t.map((x) => x.dataset.id));
  ok("Drivers tab: car subs (car-subs library) listed, hp-car-subs not listed twice", r.some((id) => id.startsWith("lib-carsubs-")) && !r.some((id) => id.startsWith("lib-hpsubs-")), `${r.length} rows`);
  // ---------- door picker ----------
  await p.selectOption("#section", "door"); await wait(1000); await click("nav button[data-tab=door]", 1000);
  const og = await p.$$eval("#secDrv optgroup", (g) => g.map((x) => x.label));
  ok("door picker: car speakers group first (midbass, midrange, coaxial, sets)", /Car speakers/.test(og[0] ?? ""), JSON.stringify(og));
  // ---------- My items: edit form ----------
  await click("#toMenu", 600); if (await p.$("#saNotNow")) await click("#saNotNow", 800); // B4_SYSTEM_UI: leaving with critical missing parts shows the alert first; Not now (leave) goes on
  await click('#menu button[data-m="items"]', 1000);
  await p.click(`#itemList tr[data-id="${mi.id}"] button[data-a=edit]`); await wait(900);
  ok("My items: edit form of the saved fuse", !!(await p.$("#miEdit #itemForm")) && !!(await p.$("#itemForm input[data-ifield=ratingA]")), await txt("#miEdit legend"));
  await click('#menu button[data-m="parts"]', 1500);
  ok("menu: Browse the parts database opens the Parts tab", (await state()).tab === "parts" && !!(await p.$("#pcats2")));
  ok("no page errors", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") ok("dry run finished without an exception", false, String(e?.stack || e).slice(0, 300)); }
finally {
  await b.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), base: BASE, pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, results, errors: errs }, null, 2));
  console.log(`DONE ${results.filter((r) => r.pass).length} pass, ${results.filter((r) => !r.pass).length} fail`);
}
