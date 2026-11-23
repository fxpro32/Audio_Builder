// Headless dry run of B5_BOM (R42): BOM tab of a full system project (written through the API into the data COPY: battery, ANL
// holder, fused block, capacitor, 2 amplifiers, DSP, head unit, ground point, power / speaker cable products and plain cable,
// Pioneer sub box (Design new box), door speakers with a priced car driver), opened from the Project tab and the System tab;
// groups and totals = the engine (window.__abBom); quantity / price overrides and the spare % persist after save + reload;
// Download spreadsheet (.xlsx) and CSV (files checked: zip, sheets, formulas, CSV header); exports/bom.xlsx + bom.csv written;
// an old box-only project gives a materials BOM and its file is unchanged; no page errors.
// Usage: node scripts/ui_dryrun_bom.mjs <outDir> <dataCopyDir> --phase <smoke|main|old>   (PORT env, default 8421; never 8420)
// Driver: scripts/b5_run_bom.sh (fresh data copy + test server). Results: <outDir>/results_<phase>.json, screenshots, downloads.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
if (PORT === "8420") { console.log("REFUSED: port 8420 is the live server"); process.exit(2); }
const out = process.argv[2] || "."; const DATA = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const phase = process.argv[process.argv.indexOf("--phase") + 1] || "smoke";
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info: String(info).slice(0, 400) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + String(info).slice(0, 240) : ""}`); };
const api = async (p, init) => { const r = await fetch(BASE + "/api/" + p, init); return r.ok ? (r.headers.get("content-type")?.includes("json") ? r.json() : r.text()) : { status: r.status }; };
const health = await api("health");
if (!health.ok || !DATA || path.resolve(health.data) !== path.resolve(DATA) || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on the data copy given:", JSON.stringify(health)); process.exit(2); }
const PROJ = "bom_dry_run";
const md5 = (f) => fs.existsSync(f) ? crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex") : "missing";

// ------------------------------------------------------------------------------------------------ the full system project
const it = (id, kind, name, data = {}, links = [], section = "electrical") => ({ id, section, kind, name, data, links: links.map((l) => ({ from: id, ...l })) });
const newBox = JSON.parse(fs.readFileSync(path.join(DATA, "projects", "new_sub_box.json"), "utf8"));
const { name: _n, title: _t, saved: _s, ...boxData } = newBox;
const DOOR = "lib-cardrv-alpine-alpine-brvs40-4-bassrev-coaxial-speakers";
const PW = "ds18-ds18-pw-ofc1-0ga-25gr-1-0-ga-ultra-flex-100-ofc-ground-power-cable-25-feet";
const fullProject = () => ({ format: 2, name: PROJ, title: "BOM dry run", section: "subwoofer", activeItem: "box-1", items: [
  it("bat", "battery", "Battery", { alternatorA: 150, vehicleLoadA: 40 }, [{ to: "anl", kind: "power" }]),
  it("anl", "fuseholder", "Main fuse holder", { partId: "dna-aaf105", partCategory: "fuses", ratingA: 150, distanceMm: 150 }, [{ to: "db", kind: "power", cableItemId: "c_main" }]),
  it("c_main", "cable", "1/0 power", { partId: PW, partCategory: "cable", lengthM: 4.5, size: "1/0", material: "copper" }),
  it("db", "distribution", "Fused block", { partId: "aerpro-ap450", partCategory: "distribution", fused: true }, [{ to: "cap", kind: "power", cableItemId: "c_b1" }, { to: "amp2", kind: "power", cableItemId: "c_b2" }, { to: "dsp", kind: "power", cableItemId: "c_b3" }]),
  it("c_b1", "cable", "4 AWG to cap", { lengthM: 0.5, size: "4", material: "copper" }),
  it("c_b2", "cable", "8 AWG to amp 2", { lengthM: 0.6, size: "8", material: "copper" }),
  it("c_b3", "cable", "10 AWG to DSP", { lengthM: 0.6, size: "10", material: "copper" }),
  it("cap", "capacitor", "Capacitor", { partId: "audiopipe-acap-10000-10-farad-power-capacitor", partCategory: "capacitors", prechargeOhm: 1000 }, [{ to: "amp1", kind: "power" }]),
  it("amp1", "amplifier", "Mono amp", { partId: "rockford-t1500-1bdcp", partCategory: "amplifiers", channels: 1, minLoadOhm: 1 }, [{ to: "gnd", kind: "ground", cableItemId: "c_g1" }, { to: "box-1", kind: "speaker", cableItemId: "c_s1", fromPort: "SPK" }]),
  it("amp2", "amplifier", "4ch amp", { partId: "rockford-p400x4", partCategory: "amplifiers", channels: 4, minLoadOhm: 2 }, [{ to: "gnd", kind: "ground", cableItemId: "c_g2" }, { to: "doors", kind: "speaker", cableItemId: "c_s2", fromPort: "CH1" }]),
  it("c_g1", "cable", "4 AWG ground 1", { lengthM: 0.4, size: "4", material: "copper" }),
  it("c_g2", "cable", "8 AWG ground 2", { lengthM: 0.4, size: "8", material: "copper" }),
  it("c_s1", "cable", "Sub speaker cable", { partId: "aerpro-ap1406", partCategory: "cable", lengthM: 3 }),
  it("c_s2", "cable", "Door speaker cable", { partId: "aerpro-ap1406", partCategory: "cable", lengthM: 2 }),
  it("gnd", "other", "Chassis ground", { role: "ground" }),
  it("hu", "other", "Head unit", { role: "headunit" }, [{ to: "dsp", kind: "signal", fromPort: "RCA out" }, { to: "amp1", kind: "remote" }, { to: "amp2", kind: "remote" }, { to: "dsp", kind: "remote" }]),
  it("dsp", "dsp", "DSP", { partId: "ds18-ds18-dsp4-8btm-4-channel-in-and-8-channel-out-digital-sound-processor-with-bluetooth", partCategory: "dsp", currentA: 1, fuseA: 5 }, [{ to: "amp1", kind: "signal", fromPort: "out 7/8" }, { to: "amp2", kind: "signal", fromPort: "out 1-4" }, { to: "gnd", kind: "ground" }]),
  it("box-1", "box", "Subwoofer box", boxData, [], "subwoofer"),
  it("doors", "door", "Front doors", { driverId: DOOR, count: 2, notes: "" }, [], "door"),
] });

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1100 } });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 400) => p.waitForTimeout(ms);
const shot = (name, full = false) => p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const state = () => p.evaluate(() => window.__abState?.());
const bomState = () => p.evaluate(() => window.__abBom?.());
const click = async (sel, ms = 600) => { await p.click(sel); await wait(ms); };
const tabTo = async (t, ms = 900) => { await click(`nav button[data-tab=${t}]`, ms); };
const openProj = async (n) => { await p.selectOption("#proj", n); await wait(1800); if (await p.$("#saNotNow")) await click("#saNotNow", 600); };
const waitBom = async () => { await p.waitForSelector("#bomTable", { timeout: 20000 }); await wait(300); };
const unzipList = (f) => execFileSync("unzip", ["-Z1", f], { encoding: "utf8" }).split("\n").filter(Boolean);
const unzipCat = (f, e) => execFileSync("unzip", ["-p", f, e], { encoding: "utf8", maxBuffer: 50e6 });

try {
  if (phase === "main") {
    const put = await api("projects/" + PROJ, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fullProject()) });
    ok("full system project written to the data copy through the API", put.ok === true, JSON.stringify(put));
  }
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "domcontentloaded" }); await wait(2500);
  if (phase === "smoke") {
    const tabs = await p.$$eval("nav button", (x) => x.map((y) => y.dataset.tab));
    ok("smoke: app opens, BOM tab listed", tabs.includes("bom"), tabs.join(","));
    await tabTo("bom", 500); await waitBom(); await shot("smoke_bom");
    ok("smoke: BOM tab renders on the start-up project", !!(await p.$("#bomTable tr[data-key]")), await txt("#bomTotals"));
  }
  if (phase === "main") {
    await openProj(PROJ);
    await tabTo("project", 800);
    await click("#pjBom", 500); await waitBom();
    ok("Project tab: Bill of materials button opens the BOM tab", (await state()).tab === "bom");
    let bs = await bomState();
    const groups = await p.$$eval("#bomTable tr.bomGroup", (t) => t.map((x) => x.dataset.group));
    ok("groups shown = engine groups (speakers, enclosure, amplifiers, DSP and head unit, power, cable, connectors)", groups.join(",") === bs.groups.map((g) => g.id).join(",") && groups.join(",") === "speakers,enclosure,amplifiers,dsp,power,cable,connectors", groups.join(","));
    ok("grand total on screen = engine total", (await txt("#bomGrand")) === "$" + bs.total.toFixed(2), `${await txt("#bomGrand")} vs ${bs.total}`);
    const L = (k) => bs.groups.flatMap((g) => g.lines).find((l) => l.key === k);
    ok("amplifier part priced at the lowest known price (Rockford T1500-1bdCP AUD 1065.78)", L("item:amp1")?.unitPrice === 1065.78, JSON.stringify(L("item:amp1")));
    ok("door speakers: 2 x the car driver, priced", L("drv:doors")?.qty === 2 && L("drv:doors")?.unitPrice > 0, JSON.stringify(L("drv:doors")));
    const spk = L(`cable:speaker:14:cca:aerpro-ap1406`) ?? bs.groups.flatMap((g) => g.lines).find((l) => /aerpro-ap1406/.test(l.key));
    ok("speaker cable product: 5 m + 10 % = 5.5 m -> 6 m = 1 pack of 6 m", spk?.qty === 1 && spk?.unitPrice === 26.99, JSON.stringify(spk));
    const mdf = bs.groups.find((g) => g.id === "enclosure")?.lines.find((l) => l.key.startsWith("mdf:16:"));
    ok("MDF sheet line for the 16 mm sub box (Boards tab method), priced", !!mdf && mdf.qty >= 1 && mdf.unitPrice > 0, JSON.stringify(mdf));
    ok("no page errors so far", errs.length === 0, errs.join(" | "));
    await shot("bom_full", true);
    // overrides
    const qKey = "cable:power:4:copper:generic";
    await p.fill(`#bomTable tr[data-key="${qKey}"] .bomQty`, "3"); await p.press(`#bomTable tr[data-key="${qKey}"] .bomQty`, "Tab"); await wait(900);
    await p.fill(`#bomTable tr[data-key="item:hu"] .bomPrice`, "499"); await p.press(`#bomTable tr[data-key="item:hu"] .bomPrice`, "Tab"); await wait(900);
    await p.fill("#bomSpare", "20"); await p.press("#bomSpare", "Tab"); await wait(1500);
    bs = await bomState();
    ok("overrides applied: qty 3 on the 4 AWG power cable, head unit $499, spare 20 %", L("item:hu") !== undefined && bs.groups.flatMap((g) => g.lines).find((l) => l.key === "item:hu")?.total === 499 && bs.groups.flatMap((g) => g.lines).find((l) => l.key === qKey)?.qty === 3 && bs.sparePct === 20, JSON.stringify(bs.overrides));
    const file = JSON.parse(fs.readFileSync(path.join(DATA, "projects", PROJ + ".json"), "utf8"));
    ok("overrides and spare % saved in the project file (bomOverrides, bomSparePct)", file.bomOverrides?.[qKey]?.qty === 3 && file.bomOverrides?.["item:hu"]?.priceAud === 499 && file.bomSparePct === 20, JSON.stringify(file.bomOverrides) + " " + file.bomSparePct);
    await p.reload({ waitUntil: "domcontentloaded" }); await wait(2500);
    if ((await state()).project !== PROJ) await openProj(PROJ);
    if ((await state()).tab !== "bom") await tabTo("bom", 500);
    await waitBom();
    const vq = await p.inputValue(`#bomTable tr[data-key="${qKey}"] .bomQty`), vp = await p.inputValue(`#bomTable tr[data-key="item:hu"] .bomPrice`), vs = await p.inputValue("#bomSpare");
    ok("after reload: the overrides and spare % are still there", vq === "3" && vp === "499" && vs === "20", `${vq} ${vp} ${vs}`);
    bs = await bomState();
    const p0 = bs.groups.flatMap((g) => g.lines).find((l) => l.key === "cable:power:1/0:copper:" + PW);
    ok("spare 20 %: 1/0 power 4.5 m + 0.15 m = 4.65 m x 1.2 = 5.58 -> 6 m -> 1 pack of 7.62 m", p0?.qty === 1, JSON.stringify(p0));
    // downloads
    let dl = p.waitForEvent("download", { timeout: 15000 });
    await click("#bomXlsx", 2000); let d = await dl; const xf = path.join(out, "bom_dry_run_bom.xlsx"); await d.saveAs(xf);
    const ents = unzipList(xf); const wb = unzipCat(xf, "xl/workbook.xml"); const s1 = unzipCat(xf, "xl/worksheets/sheet1.xml");
    const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    ok("Download spreadsheet: a valid zip with the six sheets", d.suggestedFilename() === `${PROJ}_bom.xlsx` && ents.includes("[Content_Types].xml") && names.join(",") === "BOM,Parts,Cables,Items,Diagram,Info", `${d.suggestedFilename()} ${names.join(",")}`);
    ok("BOM sheet has formulas (SUM, line totals, links to the Parts sheet)", /<f>SUM\(/.test(s1) && /<f>IF\(OR\(/.test(s1) && /Parts!\$F\$\d+/.test(s1), `${(s1.match(/<f>/g) ?? []).length} formulas`);
    await wait(1200);
    const ex = path.join(DATA, "projects", PROJ, "exports");
    ok("exports/bom.xlsx and bom.csv saved with the project (server exports route)", fs.existsSync(path.join(ex, "bom.xlsx")) && fs.existsSync(path.join(ex, "bom.csv")) && md5(path.join(ex, "bom.xlsx")) === md5(xf), await txt("#status"));
    dl = p.waitForEvent("download", { timeout: 15000 });
    await click("#bomCsv", 1500); d = await dl; const cf = path.join(out, "bom_dry_run_bom.csv"); await d.saveAs(cf);
    const csv = fs.readFileSync(cf, "utf8");
    ok("Download CSV: header row and the grand total", csv.startsWith("﻿Group,Item,Brand,Model,Part ID,Qty,Unit,Unit price AUD,Line total AUD") && csv.includes(`Grand total (all groups)`) && csv.includes(bs.total.toFixed(2)), csv.slice(0, 120));
    // System tab button
    await tabTo("system", 1200); await click("#sysBom", 500); await waitBom();
    ok("System tab: Bill of materials button opens the BOM tab", (await state()).tab === "bom");
    // reset a line
    await click(`#bomTable tr[data-key="item:hu"] .bomUndo`, 1200);
    bs = await bomState();
    ok("reset puts a line back (head unit unpriced again)", bs.groups.flatMap((g) => g.lines).find((l) => l.key === "item:hu")?.unitPrice === undefined && !bs.overrides?.["item:hu"], JSON.stringify(bs.overrides));
    await shot("bom_after_overrides");
    ok("no page errors (main)", errs.length === 0, errs.join(" | "));
  }
  if (phase === "old") {
    const f = path.join(DATA, "projects", "existing_sub.json"); const before = md5(f);
    await openProj("existing_sub");
    await tabTo("bom", 500); await waitBom();
    const bs = await bomState();
    const enc = bs.groups.find((g) => g.id === "enclosure");
    ok("old box-only project (existing_sub, v1 file): materials BOM (driver + MDF sheet + box materials)", bs.groups.map((g) => g.id).join(",") === "speakers,enclosure" && enc.lines.some((l) => l.key.startsWith("mdf:")) && enc.lines.some((l) => l.key === "enc:glue"), bs.groups.map((g) => g.id + ":" + g.lines.length).join(","));
    ok("old project: 'Add an amplifier?' warning listed under Missing / to decide", bs.missing.some((k) => /no-amplifier/.test(k)), bs.missing.join(","));
    await wait(800);
    ok("old project file unchanged by viewing its BOM", md5(f) === before);
    await shot("bom_old_project", true);
    ok("no page errors (old)", errs.length === 0, errs.join(" | "));
  }
} catch (e) { if (e !== "smoke-done") ok("dry run threw", false, String(e?.stack ?? e)); }
finally {
  await b.close();
  fs.writeFileSync(path.join(out, `results_${phase}.json`), JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass).length;
  console.log(`DONE ${phase}: ${results.length - f}/${results.length} passed`);
}
