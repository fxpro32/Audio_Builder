// Headless dry run of the high-power subwoofer library as the user (A4_HPDB, 2026-11-22):
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// filter >= 2000 W at 1 ohm final load, pick a dual-coil sub, change the coil wiring, design a ported box, check the load
// and that the results follow the wiring; open an incomplete record (not offered for design); Help attribution; 0 console errors.
// Run against a TEST server (never the owner's data):
//   PORT=8424 AB_DATA_DIR=<copy of /workspace/data> node app/server/server.mjs &
//   source /workspace/.playwright/env.sh && timeout -k 5 90 node /workspace/scripts/ui_dryrun_hpdb.mjs <outdir> [baseUrl]
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const base = process.argv[3] ?? "http://127.0.0.1:8424/";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", (e) => errs.push(String(e)));
p.on("dialog", (d) => d.accept());
const fails = []; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails.push(what); };
const step = (s) => console.log("STEP", s);
const txt = async (sel) => ((await p.textContent(sel)) ?? "").replace(/\s+/g, " ").trim();
await p.goto(base.replace(/\/?$/, "/?skipWelcome=1"), { waitUntil: "networkidle" });

// 1. Drivers tab: RMS >= 2000 W, final load 1 ohm
step("filter");
await p.click("nav button[data-tab=drivers]");
await p.selectOption("#libf", "hp-car-subs");
await p.fill("#fRms", "2000"); await p.dispatchEvent("#fRms", "input");
await p.selectOption("#fLoad", "1");
const rows = await p.$$eval("#dl tr[data-id]", (rs) => rs.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent.trim())));
console.log(`rows at >= 2000 W, 1 ohm: ${rows.length}`);
check(rows.length > 20, "filter gives a list");
check(rows.every((r) => Number(r[6]) >= 2000 && r[8].split(", ").map(Number).includes(1)), "every row has RMS >= 2000 and 1 ohm among its final loads");
await p.selectOption("#fBrand", "Sundown Audio");
await p.fill("#q", "Xv4-12"); await p.dispatchEvent("#q", "input");
const pick = await p.$$eval("#dl tr[data-id]", (rs) => rs.map((r) => [r.dataset.id, r.innerText.replace(/\s+/g, " ")]));
console.log("Sundown Xv4-12 rows:", JSON.stringify(pick));
check(pick.length === 1 && /D2/.test(pick[0][1]), "only the D2 (2+2 ohm, gives 1 ohm) remains");
await p.click("#dl tr[data-id]"); await p.waitForSelector("#srcTable");
const src = await txt("#srcTable"); check(/sundownaudio\.com/.test(src) && /tier 1 \(manufacturer\)/.test(src), "editor shows the maker source and tier");
const notes = await txt("#libNotes"); check(/^CHECK/.test(notes) && /printed Sd/.test(notes), "editor shows CHECK notes and the printed Sd");
await p.screenshot({ path: out + "/1_drivers_filter.png", fullPage: true });
await p.click("#useit");

// 2. Design a ported box, change the wiring
step("design");
await p.click("nav button[data-tab=design]"); await p.waitForSelector("#dsOut");
await p.selectOption("#dsA select[data-key=topology]", "vented"); await p.waitForTimeout(300);
await p.fill("#dsA input[data-key=drivers]", "1"); await p.dispatchEvent("#dsA input[data-key=drivers]", "change"); await p.waitForTimeout(200);
await p.fill("#dsA input[data-key=watts]", "2000"); await p.dispatchEvent("#dsA input[data-key=watts]", "change"); await p.waitForTimeout(200);
check(!!(await p.$("#coilPanel")), "coil wiring panel shown for a DVC sub");
check(/assumed/.test(await txt("#basisNote")), "unknown T/S basis notice says what was assumed: " + (await txt("#basisNote")).slice(0, 160));
const res = {};
for (const w of ["parallel", "series", "one"]) {
  await p.selectOption("#coilWiring", w); await p.waitForTimeout(400);
  res[w] = { z: await txt("#zDriver"), load: await txt("#finalLoad"), out: await txt("#dsOut"), note: (await p.$("#wiringNote")) ? await txt("#wiringNote") : "" };
  console.log(`wiring ${w}: z ${res[w].z} | load ${res[w].load} | ${res[w].out.slice(0, 260)} | ${res[w].note.slice(0, 200)}`);
  await p.screenshot({ path: `${out}/2_design_${w}.png`, fullPage: true });
}
check(res.parallel.z === "1 Ω" && res.series.z === "4 Ω" && res.one.z === "2 Ω", "impedance per driver follows the wiring (2+2 ohm: 1 / 4 / 2)");
const num = (s, re) => Number((re.exec(s) ?? [])[1]);
const f3 = (w) => num(res[w].out, /f3 · peak · max cone travel\s*([\d.]+) Hz/);
const vb = (w) => num(res[w].out, /Net volume needed\s*([\d.]+)/);
check(Math.abs(f3("parallel") - f3("series")) < 0.15 && vb("parallel") === vb("series"), `series and parallel at the same power give the same box and f3 (${f3("series")} / ${f3("parallel")} Hz)`);
check(isFinite(vb("one")) && isFinite(vb("series")) && (vb("one") !== vb("series") || Math.abs(f3("one") - f3("series")) > 0.3), `one coil changes Qes so the design differs (${vb("one")} L vs ${vb("series")} L)`);
await p.selectOption("#coilWiring", "parallel"); await p.waitForTimeout(300);
await p.fill("#dsA input[data-key=drivers]", "2"); await p.dispatchEvent("#dsA input[data-key=drivers]", "change"); await p.waitForTimeout(400);
const load2 = await txt("#finalLoad"); console.log("2 drivers:", load2);
check(/all in parallel: 0\.5 Ω/.test(load2) && /all in series: 2 Ω/.test(load2), "final load for 2 drivers (parallel 0.5 ohm, series 2 ohm)");
// override the T/S basis
await p.selectOption("#tsBasis", "parallel"); await p.waitForTimeout(400);
check(/You set/.test(await txt("#basisNote")), "the user can override the assumed T/S basis");
await p.selectOption("#tsBasis", ""); await p.waitForTimeout(300);

// 3. Analyse/Fix shows the same wiring and the load the amp sees
step("fix");
await p.click("nav button[data-tab=fix]"); await p.waitForSelector("#coilPanel");
await p.click("#run"); await p.waitForSelector("#results .muted");
const fixLine = await txt("#results .muted"); console.log("fix:", fixLine.slice(0, 200));
check(/into 1 Ω/.test(fixLine), "Analyse uses the wired impedance (1 ohm per driver)");
await p.screenshot({ path: out + "/3_fix.png", fullPage: true });

// 4. Incomplete record: listed, not offered for design
step("incomplete");
await p.click("nav button[data-tab=drivers]");
await p.selectOption("#fBrand", ""); await p.selectOption("#fLoad", ""); await p.fill("#fRms", ""); await p.dispatchEvent("#fRms", "input");
await p.fill("#q", "DB-3012R"); await p.dispatchEvent("#q", "input");
const inc = await p.$$eval("#dl tr[data-id]", (rs) => rs.map((r) => [r.dataset.id, r.innerText.replace(/\s+/g, " ")]));
console.log("DB-3012R rows:", JSON.stringify(inc));
check(inc.length > 0 && inc.every((r) => /no sim/.test(r[1])), "Deaf Bonce DB-3012R listed and marked not simulatable");
await p.click("#dl tr[data-id]"); await p.waitForSelector("#incompleteNote");
check(/Missing: .*Sd/.test(await txt("#incompleteNote")), "editor says which values are missing");
check(await p.$eval("#useit", (e) => e.disabled), "Use in current project is disabled");
await p.screenshot({ path: out + "/4_incomplete.png", fullPage: true });
await p.check("#fSim"); await p.waitForTimeout(200);
check((await p.$$("#dl tr[data-id]")).length === 0, "simulatable-only hides it");
const incId = inc[0][0];
await p.click("nav button[data-tab=design]"); await p.waitForSelector("#dsA select[data-key=driverId]");
const offered = await p.$$eval("#dsA select[data-key=driverId] option", (os) => os.map((o) => o.value));
check(!offered.includes(incId) && offered.length > 1000, `incomplete record not offered in Design (${offered.length} drivers offered)`);
await p.click("nav button[data-tab=fix]"); await p.waitForSelector("#fsProj select[data-key=driverId]");
const offeredFix = await p.$$eval("#fsProj select[data-key=driverId] option", (os) => os.map((o) => o.value));
check(!offeredFix.includes(incId), "incomplete record not offered in Analyse/Fix");

// 5. Listed without specs
step("listed without specs");
await p.click("nav button[data-tab=drivers]"); await p.uncheck("#fSim"); await p.fill("#q", ""); await p.dispatchEvent("#q", "input");
await p.click("#lwsDetails summary"); await p.waitForTimeout(200);
const lws = await p.$$eval("#lwsTable tr", (rs) => rs.length - 1);
const lwsLinks = await p.$$eval("#lwsTable a", (as) => as.filter((a) => /^https?:/.test(a.href)).length);
check(lws >= 100 && lwsLinks > 50, `listed-without-specs list: ${lws} models, ${lwsLinks} source links`);
await p.screenshot({ path: out + "/5_listed.png", fullPage: true });

// 6. Help
step("help");
await p.click("nav button[data-tab=help]"); await p.waitForSelector("#hpHelp");
const help = await p.textContent("#page");
check(help.includes("Audio_Builder high-power car subwoofer database (CC BY 4.0); every value credited to its manufacturer source in each entry") && /data\/hp_subs_raw\/<us\|world>\/<brand>\.json/.test(help), "Help shows the attribution, licence and how to report a correction");
await p.screenshot({ path: out + "/6_help.png", fullPage: true });
check(errs.length === 0, "0 console errors " + JSON.stringify(errs));
console.log(fails.length ? `DRY RUN: ${fails.length} FAILED` : "DRY RUN: ALL PASSED");
await b.close();
