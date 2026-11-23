// Headless dry run of B1_SHELL (R37, R42, R43): welcome page (3 s, auto-advance, click skips, logo slot), start menu, Section
// control and every section's screen (door = no box), single item -> My items -> add to a project, Build a project, Project tab
// (new item, link), Open a project (rename, duplicate, delete = move), old projects' files unchanged (md5), no page errors.
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node app/server/server.mjs  (never port 8420)
// Usage: node scripts/ui_dryrun_shell.mjs <outDir> <dataCopyDir> [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { ensureSampleProjects } from "./dryrun_sample_projects.mjs";
import crypto from "node:crypto";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
if (PORT === "8420") { console.log("REFUSED: port 8420 is the live server"); process.exit(2); }
const out = process.argv[2] || "."; const DATA = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const smoke = process.argv.includes("--smoke");
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info: String(info).slice(0, 300) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + String(info).slice(0, 200) : ""}`); };
const api = async (p, init) => { const r = await fetch(BASE + "/api/" + p, init); return r.ok ? (r.headers.get("content-type")?.includes("json") ? r.json() : r.text()) : { status: r.status }; };
const health = await api("health");
if (!health.ok || !DATA || path.resolve(health.data) !== path.resolve(DATA) || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on the data copy given:", JSON.stringify(health)); process.exit(2); }
ensureSampleProjects(DATA); // G1: sample one-box projects car_a, car_b in the data copy
const md5 = (f) => fs.existsSync(f) ? crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex") : "missing";
const PROJ = path.join(DATA, "projects");
const OLD = ["existing_sub", "new_sub_box", "tl_pioneer", "car_a", "car_b"];
const before = Object.fromEntries(OLD.map((n) => [n, md5(path.join(PROJ, n + ".json"))]));

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
const prompts = []; // answers for the next prompt() calls (confirm/alert are accepted)
p.on("dialog", (d) => { if (d.type() === "prompt") d.accept(prompts.length ? prompts.shift() : d.defaultValue()); else d.accept(); });
const wait = (ms = 500) => p.waitForTimeout(ms);
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const state = () => p.evaluate(() => window.__abState?.());
const tabs = () => p.$$eval("nav button", (bs) => bs.map((x) => x.dataset.tab));
const section = async (v) => { await p.selectOption("#section", v); await wait(1300); };
const click = async (sel, ms = 900) => { await p.click(sel); await wait(ms); };
const menu = async () => { await click("#toMenu", 700); };
try {
  // ---------- welcome ----------
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await wait(300);
  ok("welcome page shows first (text placeholder until the logo file is there)", !!(await p.$("#welcome")) && /Audio Builder/.test(await txt("#wText")), await txt("#welcome"));
  if (smoke) { await shot("smoke"); throw "smoke-done"; }
  await shot("01_welcome");
  await p.waitForSelector("#menu", { timeout: 8000 });
  const w = await p.evaluate(() => window.__abWelcome);
  ok("welcome goes to the menu by itself after about 3 s", w.how === "timer" && w.leftAt - w.shownAt >= 2900 && w.leftAt - w.shownAt < 3600, `${Math.round(w.leftAt - w.shownAt)} ms, ${w.how}`);
  const btns = await p.$$eval("#menu .mgrid button", (bs) => bs.map((x) => x.querySelector("b")?.textContent));
  ok("menu: What do you want to do? with the six choices, Continue first", /What do you want to do\?/.test(await txt("#menu h2")) && JSON.stringify(btns) === JSON.stringify(["Continue where I left off", "Build a project", "Build a single item", "Open a project", "My saved items", "System and wiring", "Browse the parts database"] /* B4_SYSTEM_UI: System and wiring */), btns.join(" | "));
  ok("Continue says what it opens (settings: new_sub_box)", /New Pioneer 12in sealed box/.test(await txt("#contWhat")), await txt("#contWhat"));
  await shot("02_menu");
  await p.reload({ waitUntil: "domcontentloaded" }); await wait(400); await p.click("#welcome"); await wait(300);
  const w2 = await p.evaluate(() => window.__abWelcome);
  ok("a click skips the welcome", !!(await p.$("#menu")) || w2.how === "click", `${w2.how} after ${Math.round(w2.leftAt - w2.shownAt)} ms`);
  await p.waitForSelector("#menu", { timeout: 8000 });
  await p.reload({ waitUntil: "domcontentloaded" }); await wait(400); await p.keyboard.press("Space"); await p.waitForSelector("#menu", { timeout: 8000 });
  ok("a key skips the welcome", (await p.evaluate(() => window.__abWelcome.how)) === "key");
  // logo slot: a test logo in the data copy is shown instead of the text
  fs.mkdirSync(path.join(DATA, "branding"), { recursive: true }); const logoF = path.join(DATA, "branding", "logo.svg");
  fs.writeFileSync(logoF, `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#222"/><text x="40" y="130" font-size="90" fill="#e8a33d" font-family="sans-serif">TEST LOGO</text></svg>`);
  await p.reload({ waitUntil: "domcontentloaded" }); await wait(1200);
  ok("logo file in data/branding is shown on the welcome page", await p.$eval("#wLogo", (i) => i.complete && i.naturalWidth > 0).catch(() => false));
  await shot("01b_welcome_with_test_logo");
  fs.copyFileSync(logoF, path.join(out, "test_logo_used.svg")); fs.rmSync(logoF); // PM: copy + remove (rename fails with EXDEV across filesystems); // the copy's branding folder is left as it was
  await p.waitForSelector("#menu", { timeout: 8000 });

  // ---------- Continue: R30 start-up project, Subwoofer section unchanged ----------
  await click('#menu button[data-m="continue"]', 2500);
  let st = await state();
  ok("Continue opens new_sub_box, Subwoofer, Design new (R30 settings)", st.project === "new_sub_box" && st.section === "subwoofer" && st.tab === "design" && st.mode === "project", JSON.stringify(st).slice(0, 200));
  ok("Section control at the top: 'Section:' + dropdown of the five sections + explanation", /Section:/.test(await txt("#secCtl")) && JSON.stringify(await p.$$eval("#section option", (o) => o.map((x) => x.textContent))) === JSON.stringify(["Subwoofer", "Door speaker", "Infinite baffle", "Home speakers", "Computer speakers"]) && /What is a section\?/.test(await txt("#secInfo")), await txt("#secInfo"));
  ok("Subwoofer tabs as before + Project", JSON.stringify(await tabs()) === JSON.stringify(["design", "fix", "boards", "drivers", "parts", "system", "bom", "project", "help"] /* B3_PARTS_DB: Parts tab; B4_SYSTEM_UI: System tab; B5_BOM: BOM tab */), (await tabs()).join(","));
  const subSize = await txt("#dsSize"); const subVol = await txt("#dsVolChk");
  const topoSub = await p.$$eval("#dsA select[data-key=topology] option", (o) => o.map((x) => x.value));
  ok("Subwoofer Design new: box, 3D, all box types (sealed, vented, pr, tl, bandpass)", !!(await p.$("#v3d canvas")) && !!(await p.$("#dsB")) && ["sealed", "vented", "pr", "tl", "bp4", "bp6"].every((k) => topoSub.includes(k)), topoSub.join(",") + " | " + subSize);
  await shot("03_subwoofer_design");

  // ---------- Door speaker: no box ----------
  await section("door"); st = await state();
  ok("Door speaker: door tab, no box anywhere (no 3D view, no box inputs)", st.section === "door" && st.tab === "door" && !(await p.$("#v3d")) && !(await p.$("canvas")) && !(await p.$("#dsB")) && !(await p.$("#fsBox")) && JSON.stringify(await tabs()) === JSON.stringify(["door", "drivers", "parts", "system", "bom", "project", "help"] /* B3_PARTS_DB: Parts tab; B4_SYSTEM_UI: System tab; B5_BOM: BOM tab */), (await tabs()).join(","));
  ok("Door mounting: to be decided panel (blank on purpose)", /Door mounting: to be decided/.test(await txt("#doorMount legend")), await txt("#doorMount"));
  const doorOpts = await p.$$eval("#secDrv option", (o) => o.length - 1);
  ok("door driver choice: 4 to 8 inch drivers", doorOpts > 50 && /4 to 8 in/.test(await txt("#doorA")), `${doorOpts} drivers`);
  await shot("04_door");
  await click("nav button[data-tab=drivers]", 1500);
  ok("Drivers tab in Door speaker: 'Sizes for Door speaker' filter on, Subwoofers only off", await p.$eval("#fSec", (c) => c.checked).catch(() => false) && !(await p.$eval("#fSub", (c) => c.checked)), await txt("#dActive"));
  await shot("04b_door_drivers");

  // ---------- Infinite baffle ----------
  await section("ib"); ok("switching section keeps the tab when the section has it (Drivers)", (await state()).tab === "drivers");
  await click("nav button[data-tab=ib]", 900); st = await state();
  ok("Infinite baffle: designer (B2) + driver picker, no box", !!(await p.$("#ibAlpha")) && !!(await p.$("#secDrv")) && !(await p.$("#v3d")), st.tab); // B2_SECTIONS: the placeholder became the IB designer
  await shot("05_ib");

  // ---------- Home and Computer speakers ----------
  await section("home"); await click("nav button[data-tab=design]", 2000); st = await state();
  const topoHome = await p.$$eval("#dsA select[data-key=topology] option", (o) => o.map((x) => x.value));
  const drvHome = await p.$eval("#dsA select[data-key=driverId]", (s) => s.value);
  ok("Home speakers: Design new with sealed / ported / passive radiator only", JSON.stringify(topoHome) === JSON.stringify(["sealed", "vented", "pr"]), topoHome.join(","));
  ok("Home default driver is not the Pioneer car sub (Dayton RS180-8)", drvHome === "lib-driverbase-dayton-rs180-8-8ohm", drvHome);
  ok("Home preset applied and Best size run: volume check matches, box shown", !!(await p.$("#presetRow")) && /✓/.test(await txt("#dsVolChk")) && !!(await p.$("#v3d canvas")), (await txt("#dsSize")) + " | " + (await txt("#dsVolChk")));
  ok("Home tabs: Design, Boards, Drivers, Project, Help", JSON.stringify(await tabs()) === JSON.stringify(["design", "boards", "drivers", "parts", "system", "bom", "project", "help"] /* B3_PARTS_DB: Parts tab; B4_SYSTEM_UI: System tab; B5_BOM: BOM tab */));
  await shot("06_home_design");
  await p.selectOption("#preset", "floor-ported"); await click("#applyPreset", 2000);
  ok("Home preset Floor-standing: ported; height kept unless the box would be shallower than 0.8 x its width (B2 depth rule, said in the Result)", (/1000\.0 mm/.test(await txt("#dsSize")) || /height .*went to/.test(await txt("#sizeMsg"))) && (await p.$eval("#dsA select[data-key=topology]", (s) => s.value)) === "vented", await txt("#dsSize")); // B2_SECTIONS: preset now 1000 mm tall (research_h 3.2)
  await shot("06b_home_floorstanding");
  await click("nav button[data-tab=boards]", 2000);
  ok("Home: Boards tab lays the panels out", (await p.$$eval("#page svg", (s) => s.length)) > 0, await txt("#page h2"));
  await section("computer"); await click("nav button[data-tab=design]", 2000);
  const drvPc = await p.$eval("#dsA select[data-key=driverId]", (s) => s.value);
  ok("Computer speakers: desktop preset, Dayton ND105-4, small box", drvPc === "lib-driverbase-dayton-nd105-4-4ohm" && /✓/.test(await txt("#dsVolChk")), drvPc + " | " + (await txt("#dsSize")));
  await shot("07_computer_design");
  await section("subwoofer"); await click("nav button[data-tab=design]", 2000);
  ok("back to Subwoofer: the same box as before (sizes, volume check)", (await txt("#dsSize")) === subSize && (await txt("#dsVolChk")) === subVol, await txt("#dsSize"));
  await wait(1200);
  // the home item was changed (preset applied) so new_sub_box now holds it (deliberate save); door/ib/computer were only looked at
  st = await state();
  ok("sections only looked at stay in memory (not saved)", st.items.filter((i) => i.pristine).map((i) => i.section).sort().join(",") === "computer,door,ib", JSON.stringify(st.items));
  const nsb = await api("projects/new_sub_box");
  ok("new_sub_box after a deliberate change in Home: v2 with its subwoofer box first + the home box; v1 file backed up", nsb.format === 2 && nsb.items.length === 2 && nsb.items[0].id === "box-1" && nsb.items[1].section === "home" && fs.readdirSync(path.join(DATA, "private", "deleted")).some((f) => /^new_sub_box\.bak-.*-pre-B1\.json$/.test(f)), JSON.stringify(nsb.items?.map((i) => i.section)));

  // ---------- single item -> My items -> add to a project ----------
  await menu(); await click('#menu button[data-m="newitem"]', 600);
  await click('#mNewItem button[data-sec="door"]', 1500); st = await state();
  ok("Build a single item (Door speaker): item mode, not saved yet", st.mode === "item" && st.section === "door" && /not saved yet/.test(await txt("#itemTag")), await txt("#itemTag"));
  const opt1 = await p.$eval("#secDrv", (s) => s.options[1].value); await p.selectOption("#secDrv", opt1); await wait(900);
  await click("#saveItem", 1500); st = await state();
  const items = await api("items");
  ok("Save to My items: the item is in data/items", st.itemSaved && Array.isArray(items) && items.some((x) => x.id === st.activeItem) && fs.existsSync(path.join(DATA, "items", st.activeItem + ".json")), JSON.stringify(items).slice(0, 200));
  const singleId = st.activeItem;
  await shot("08_single_item_saved");
  await click("nav button[data-tab=project]", 800);
  ok("Item tab (single item): add to a project", /Single item/.test(await txt("#itHead legend")) && !!(await p.$("#itProj")));
  await p.selectOption("#itProj", "car_a"); await click("#itAddGo", 2500); st = await state();
  const vc = await api("projects/car_a");
  ok("added to car_a: it opens there, in Door speaker, with 2 items", st.project === "car_a" && st.section === "door" && st.mode === "project" && vc.format === 2 && vc.items.length === 2 && vc.items[1].data.driverId === opt1 && vc.items[1].from?.item === singleId, JSON.stringify(vc.items?.map((i) => [i.section, i.kind])));
  ok("car_a's v1 file backed up before the first v2 write", fs.readdirSync(path.join(DATA, "private", "deleted")).some((f) => /^car_a\.bak-.*-pre-B1\.json$/.test(f)));
  await click("nav button[data-tab=project]", 900);
  ok("Project tab lists both items", (await p.$$eval("#pjTable tr[data-id]", (r) => r.length)) === 2, await txt("#pjTable"));
  await shot("09_project_tab_with_added_item");
  // My saved items in the menu -> add to car_b
  await menu(); await click('#menu button[data-m="items"]', 1200);
  ok("My saved items lists the item", (await p.$$eval("#itemList tr[data-id]", (r) => r.map((x) => x.dataset.id))).includes(singleId));
  await shot("10_my_items");
  await p.selectOption(`#itemList tr[data-id="${singleId}"] select[data-p]`, "car_b"); await click(`#itemList tr[data-id="${singleId}"] button[data-a=add]`, 2500);
  const vcm = await api("projects/car_b"); st = await state();
  ok("My items -> Add to car_b: the project holds it and opens", vcm.format === 2 && vcm.items.length === 2 && st.project === "car_b", JSON.stringify(vcm.items?.map((i) => i.section)));

  // ---------- Build a project, Project tab: new item + link ----------
  await menu(); await click('#menu button[data-m="newproject"]', 500);
  await p.fill("#npTitle", "Dryrun Home Speakers"); await p.selectOption("#npSec", "home"); await click("#npGo", 2500); st = await state();
  ok("Build a project (Home speakers): new v2 project opens in Home, Design new", st.project === "dryrun_home_speakers" && st.section === "home" && st.tab === "design" && (await api("projects/dryrun_home_speakers")).format === 2, JSON.stringify(st).slice(0, 150));
  await click("nav button[data-tab=project]", 800);
  await p.selectOption("#pjNewSec", "door"); await click("#pjNew", 1500);
  await click("nav button[data-tab=project]", 800);
  const ids = await p.$$eval("#pjTable tr[data-id]", (r) => r.map((x) => x.dataset.id));
  await p.selectOption("#lkFrom", ids[1]); await p.fill("#lkFromPort", "out L"); await p.selectOption("#lkKind", "signal"); await p.selectOption("#lkTo", ids[0]); await p.fill("#lkToPort", "in"); await click("#lkGo", 1500);
  const dh = await api("projects/dryrun_home_speakers");
  const lk = dh.items[1].links?.[0];
  ok("Project tab: new Door item added and linked to the home box with a typed link (R44), saved", dh.items.length === 2 && lk?.from === ids[1] && lk?.to === ids[0] && lk.kind === "signal" && lk.fromPort === "out L" && lk.toPort === "in", JSON.stringify(dh.items.map((i) => i.links)));
  await shot("11_project_links");
  // ---------- Open a project: rename, duplicate, delete ----------
  await menu(); await click('#menu button[data-m="open"]', 1200);
  ok("Open a project lists every project", (await p.$$eval("#projList tr[data-name]", (r) => r.length)) >= 6);
  await shot("12_open_project");
  prompts.push("Dryrun Home (renamed)"); await click('#projList tr[data-name="dryrun_home_speakers"] button[data-a=rename]', 1500);
  ok("rename changes the title, file name stays", (await api("projects/dryrun_home_speakers")).title === "Dryrun Home (renamed)");
  prompts.push("Dryrun copy"); await click('#projList tr[data-name="dryrun_home_speakers"] button[data-a=dup]', 1500);
  const cp = await api("projects/dryrun_copy");
  ok("duplicate makes a new project file with the same items", cp.format === 2 && cp.items?.length === 2 && cp.title === "Dryrun copy");
  await click('#projList tr[data-name="dryrun_copy"] button[data-a=del]', 1500);
  ok("delete moves the file to private/deleted (never a real delete)", !fs.existsSync(path.join(PROJ, "dryrun_copy.json")) && fs.readdirSync(path.join(DATA, "private", "deleted")).some((f) => /^project\.dryrun_copy\.\d+\.json$/.test(f)));
  // ---------- old projects unchanged ----------
  await wait(800);
  const after = Object.fromEntries(OLD.map((n) => [n, md5(path.join(PROJ, n + ".json"))]));
  const changed = OLD.filter((n) => before[n] !== after[n]);
  ok("project files not deliberately saved are unchanged (existing_sub, tl_pioneer)", ["existing_sub", "tl_pioneer"].every((n) => before[n] === after[n]), "changed on purpose: " + changed.join(", "));
  ok("no page errors", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") ok("dry run finished without an exception", false, String(e?.stack || e).slice(0, 300)); }
finally {
  await b.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), base: BASE, pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, results, errors: errs }, null, 2));
  console.log(`DONE ${results.filter((r) => r.pass).length} pass, ${results.filter((r) => !r.pass).length} fail`);
}
