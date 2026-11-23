// Headless dry run of A11_AUTOSIZE (R32): Best size, Keep the volume, locks, several drivers, passive radiators, imperial units.
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// Needs a server on a COPY of data/:  PORT=8421 AB_DATA_DIR=<copy> node app/server/server.mjs
// Usage: node scripts/ui_dryrun_autosize.mjs <outDir> [--smoke]   (PORT env, default 8421). Writes results.json + screenshots.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
const out = process.argv[2] || "."; fs.mkdirSync(out, { recursive: true });
const smoke = process.argv.includes("--smoke");
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + info : ""}`); };
const api = async (p, init) => { const r = await fetch(BASE + "/api/" + p, init); return r.ok ? r.json() : { status: r.status }; };
const health = await api("health"); if (!health.ok || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on a data copy:", JSON.stringify(health)); process.exit(2); }

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 500) => p.waitForTimeout(ms);
const val = (k) => p.$eval(`#dsB input[data-key=${k}]`, (i) => parseFloat(i.value));
const sizes = async () => ({ W: await val("maxW"), H: await val("maxH"), D: await val("maxD") });
const setVal = async (sel, v) => { await p.$eval(sel, (i, v) => { i.value = String(v); i.dispatchEvent(new Event("change")); }, v); await wait(600); };
const setSide = (k, v) => setVal(`#dsB input[data-key=${k}]`, v);
const click = async (sel) => { await p.click(sel); await wait(600); };
const grossTxt = () => p.$eval("#dsGross b", (e) => e.textContent);
const num = (t) => parseFloat(String(t).replace(/[^0-9.\-]/g, ""));
const grossL = async () => num(await grossTxt());
const objs = async () => p.evaluate(() => window.__abView.bounds().map((o) => o.name));
const count = (arr, n) => arr.filter((x) => x === n).length;
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1000);
  ok("page loads on Design new", !!(await p.$("#dsB")) && errs.length === 0, JSON.stringify(errs).slice(0, 200));
  if (smoke) { await shot("smoke"); throw "smoke-done"; }
  ok("project is new_sub_box", (await p.$eval("#proj", (s) => s.value)) === "new_sub_box");
  ok("fieldset renamed to the box's outside sizes", /Box \(outside sizes\)/.test(await p.$eval("#dsB legend", (e) => e.textContent)) && /Width \(outside\)/.test(await p.$eval("#dsB", (e) => e.textContent)));
  const s0 = await sizes();
  // B1 fix of the expectations: the real new_sub_box.json now holds the sizes the owner's browser autosaved (sizing 2, 405 x 360.3 x
  // 255.2 on 2026-11-23); the check is that the box opens with the sizes stored in the file, whatever they are.
  const file0 = await api("projects/new_sub_box"); const fd = file0.design;
  ok(`design opens with its stored sizes (${fd.maxW} x ${fd.maxH} x ${fd.maxD})`, fd.sizing === 2 && s0.W === fd.maxW && s0.H === fd.maxH && s0.D === fd.maxD && Math.abs(s0.W - 405) < 1 && Math.abs(s0.H - 360) < 1 && Math.abs(s0.D - 255) < 1, JSON.stringify(s0));
  ok("keep the volume ticked by default", await p.$eval("#dsB input[data-key=keepVolume]", (i) => i.checked));
  ok("first render: gross 22.6 L +-0.1", Math.abs((await grossL()) - 22.6) <= 0.1, await grossTxt());
  await wait(1200); const stored0 = await api("projects/new_sub_box"); ok("first render does not save or change the project", JSON.stringify(stored0) === JSON.stringify(file0), `stored maxD ${stored0.design.maxD}`);
  await shot("01_open");
  // The owner's example on the opened box: width 405 -> 410 with keep the volume
  const a = await sizes();
  await setSide("maxW", 410); const c = await sizes(); const gc = await grossL();
  ok("width 405 -> 410: height and depth change", a.W === 405 && c.W === 410 && c.H !== a.H && c.D !== a.D, `${JSON.stringify(a)} -> ${JSON.stringify(c)}`);
  ok("width 405 -> 410: gross stays 22.6 L +-0.1", Math.abs(gc - 22.6) <= 0.1, String(gc));
  ok("height and depth scaled by the same factor", Math.abs(c.H / c.D - a.H / a.D) < 0.005, `${(a.H / a.D).toFixed(4)} -> ${(c.H / c.D).toFixed(4)}`);
  await shot("02_width_410");
  // lock height, change width: only depth moves
  await click("#dsB input[data-lock=H]"); await setSide("maxW", 420); const d = await sizes(); const gd = await grossL();
  ok("height locked, width 420: only depth moves", d.W === 420 && d.H === c.H && d.D !== c.D && Math.abs(gd - 22.6) <= 0.1, `${JSON.stringify(d)} gross ${gd}`);
  // lock depth too: refused
  await click("#dsB input[data-lock=D]"); await setSide("maxW", 430); const e = await sizes(); const msg = await p.$eval("#sizeMsg", (x) => x.textContent).catch(() => "");
  ok("height + depth locked, width 430: refused", e.W === 420 && e.H === d.H && e.D === d.D && /Height and depth are locked: unlock one so the volume can be kept/.test(msg), `${JSON.stringify(e)} | ${msg}`);
  await shot("03_locked_refused");
  // Best size (locks off)
  await click("#dsB input[data-lock=H]"); await click("#dsB input[data-lock=D]");
  await click("#bestSize"); const sb = await sizes(); const gb = await grossL();
  ok("Best size: gross 22.6 L +-0.1", Math.abs(gb - 22.6) <= 0.1, `${JSON.stringify(sb)} gross ${gb}`);
  ok("Best size: driver fits (no red baffle line)", !/less than the/.test(await p.$eval("#dsOut", (x) => x.textContent)), await p.$eval("#dsFront", (x) => x.textContent));
  ok("Best size message", /Best size/.test(await p.$eval("#sizeMsg", (x) => x.textContent).catch(() => "")), await p.$eval("#sizeMsg", (x) => x.textContent).catch(() => "none"));
  await shot("04_best_size");
  // untick keep the volume: only width changes, volume changes
  await click("#dsB input[data-key=keepVolume]"); await setSide("maxW", 450); const f = await sizes(); const gf = await grossL();
  ok("unticked: only width changes, volume follows the sizes", f.W === 450 && f.H === sb.H && f.D === sb.D && gf > 23, `${JSON.stringify(f)} gross ${gf}`);
  ok("unticked: volume check shows the difference", /\+/.test(await p.$eval("#dsVolChk", (x) => x.textContent)), await p.$eval("#dsVolChk", (x) => x.textContent));
  await shot("05_unticked");
  await click("#dsB input[data-key=keepVolume]"); await click("#bestSize");
  // two drivers: box doubles, both drawn
  await setVal("#dsA input[data-key=drivers]", 2); const g2 = await grossL(); const o2 = await objs();
  ok("2 drivers: gross 45.2 L +-0.1 (box follows)", Math.abs(g2 - 45.2) <= 0.1, String(g2));
  ok("2 drivers: both drawn in 3D", count(o2, "Driver") === 2, `Driver x${count(o2, "Driver")}`);
  await click("#bestSize"); const g2b = await grossL(); const front2 = await p.$eval("#dsFront", (x) => x.textContent);
  ok("2 drivers, Best size: volume met and both fit", Math.abs(g2b - 45.2) <= 0.1 && !/less than the/.test(await p.$eval("#dsOut", (x) => x.textContent)), `${g2b} | ${front2}`);
  await click("#cut"); ok("cut list names 2 driver cut-outs", /2 × driver cut-out/.test(await p.$eval("#cutbox", (x) => x.textContent)));
  await shot("06_two_drivers");
  await setVal("#dsA input[data-key=drivers]", 1);
  // passive radiators: a test PR (dry-run values, not a real product) created in the data copy via the API
  await fetch(BASE + "/api/drivers/dryrun-test-pr-12", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "dryrun-test-pr-12", brand: "Dry-run", model: "test PR 12in (not a real product)", kind: "passive", private: true, params: { fs: 0, Re: 0, Qes: 0, Qms: 8, Sd: 0.048, Mms: 0.15, Cms: 3e-4, Xmax: 0.025, dia: 0.31, cutout: 0.28, depth: 0.08, displacement: 0.0015 }, sources: [{ param: "*", source: "dry-run test values", where: "scripts/ui_dryrun_autosize.mjs" }] }) });
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "networkidle" }); await wait(1000);
  await p.selectOption("#dsA select[data-key=topology]", "pr"); await wait(800);
  ok("PR fieldset shown with the test PR", (await p.$eval("#dsP select[data-key=prId]", (s) => s.value)) === "dryrun-test-pr-12");
  // three 12 in cones on the front need a bigger box than 17.48 L net: own volume 50 L net, 30 Hz
  await setVal("#dsP input[data-key=prCount]", 2); await setVal("#dsA input[data-key=customVbL]", 50); await setVal("#dsA input[data-key=customFb]", 30); await click("#bestSize");
  const prTxt = await p.$eval("#dsPR", (x) => x.textContent).catch(() => "");
  ok("PR result: added mass, fb, travel", /added mass/.test(prTxt) && /fb/.test(prTxt), prTxt);
  const legend = await p.$eval("#pX", (x) => x.textContent);
  ok("travel plot shows the passive radiator and its Xmax", /Passive radiator travel/.test(legend) && /PR Xmax/.test(legend));
  const o3 = await objs(); ok("3D shows 2 passive radiators and the driver", count(o3, "Passive_Radiator") === 2 && count(o3, "Driver") === 1, `PR x${count(o3, "Passive_Radiator")}`);
  ok("PR box: volume check passes", /✓/.test(await p.$eval("#dsVolChk", (x) => x.textContent)), await p.$eval("#dsVolChk", (x) => x.textContent));
  await shot("07_passive_radiators");
  // drivers tab: the PR is tagged and its editor shows the passive kind and check
  await click("nav button[data-tab=drivers]"); await p.fill("#q", "dry-run"); await wait(400);
  if (await p.$eval("#fSub", (c) => c.checked)) { await p.click("#fSub"); await wait(500); } // A14: "Subwoofers only" (on by default) hides passive radiators
  ok("Drivers tab: PR tag", /PR/.test(await p.$eval('#dl tr[data-id="dryrun-test-pr-12"]', (x) => x.textContent)));
  await click('#dl tr[data-id="dryrun-test-pr-12"]');
  ok("PR editor: kind passive + check table", (await p.$eval("#dkind", (s) => s.value)) === "passive" && !!(await p.$("#prCheck table, table#prCheck")), await p.$eval("#xc", (x) => x.textContent.slice(0, 120)));
  await shot("08_pr_editor");
  // help
  await click("nav button[data-tab=help]");
  ok("Help: Best size, Keep the volume, several drivers, passive radiators", !!(await p.$("#helpBestSize")) && !!(await p.$("#helpKeepVolume")) && !!(await p.$("#helpMulti")) && !!(await p.$("#helpPR")));
  // imperial units: back to sealed
  await click("nav button[data-tab=design]"); await p.selectOption("#dsA select[data-key=topology]", "sealed"); await wait(800);
  await setVal("#dsA input[data-key=customVbL]", 17.48); await click("#bestSize");
  await p.selectOption("#units", "imperial"); await wait(800);
  const wIn = await val("maxW"); const dIn = await val("maxD"); const gi = await grossTxt();
  ok("imperial: sizes in inches, volume in ft³", /in/.test(await p.$eval("#dsB .u", (x) => x.textContent)) && /ft³/.test(gi), `W ${wIn} in, gross ${gi}`);
  await setSide("maxD", Math.round((dIn + 0.5) * 100) / 100); const gi2 = num(await grossTxt()); const si = await sizes();
  ok("imperial: depth +0.5 in keeps 22.6 L (0.798 ft³ +-0.004), another side follows", Math.abs(gi2 - 22.6 / 28.316846592) <= 0.004 && (si.W !== wIn), `${gi2} ft³, W ${wIn} -> ${si.W} in`);
  await shot("09_imperial");
  await p.selectOption("#units", "metric"); await wait(400);
  ok("no console errors", errs.length === 0, JSON.stringify(errs).slice(0, 300));
} catch (e) { if (e !== "smoke-done") ok("run without exceptions", false, String(e).slice(0, 300)); }
await b.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), base: BASE, results }, null, 1));
const failed = results.filter((r) => !r.pass).length; console.log(`${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
