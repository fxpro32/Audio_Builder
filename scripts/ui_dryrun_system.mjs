// Headless dry run of B4_SYSTEM_UI (R41 cable calculator, R44 diagram + missing-part alert): a project with two amplifiers,
// DSP, fused distribution block, ANL fuse holder, capacitor, power / speaker / remote cable from the Parts tab, battery, head unit
// and chassis ground; wired with "Wire it for me" (+ one manual Connect); cable numbers on screen = cable.ts for the same project;
// Save -> diagram shown + exports/system.svg written; remove the main fuse -> Save -> alert "Add a main fuse at the battery?" ->
// Add -> alert gone; complete system -> no alert element at all; old projects open and save with no page errors; quick calculator.
// Runs in phases (one browser launch each, under 90 s) on ONE server + ONE data copy:
//   node scripts/ui_dryrun_system.mjs <outDir> <dataCopyDir> --phase <smoke|parts|cables|wire|alert|old>   (PORT env, default 8421)
// Driver: scripts/b4_run_system.sh. Results: <outDir>/results_<phase>.json + screenshots.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { ensureSampleProjects } from "./dryrun_sample_projects.mjs";
const PORT = process.env.PORT || "8421"; const BASE = `http://127.0.0.1:${PORT}`;
if (PORT === "8420") { console.log("REFUSED: port 8420 is the live server"); process.exit(2); }
const out = process.argv[2] || "."; const DATA = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const phase = process.argv[process.argv.indexOf("--phase") + 1] || "smoke";
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass: !!pass, info: String(info).slice(0, 400) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? " | " + String(info).slice(0, 240) : ""}`); };
const api = async (p, init) => { const r = await fetch(BASE + "/api/" + p, init); return r.ok ? (r.headers.get("content-type")?.includes("json") ? r.json() : r.text()) : { status: r.status }; };
const health = await api("health");
if (!health.ok || !DATA || path.resolve(health.data) !== path.resolve(DATA) || !/scratchpad|tmp|copy/i.test(health.data)) { console.log("REFUSED: the server is not on the data copy given:", JSON.stringify(health)); process.exit(2); }
ensureSampleProjects(DATA); // G1: sample one-box projects car_a, car_b in the data copy
const PROJ = "b4_dry_run";

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
const wait = (ms = 400) => p.waitForTimeout(ms);
const shot = (name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
const txt = (sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
const state = () => p.evaluate(() => window.__abState?.());
const sys = () => p.evaluate(() => window.__abSystem?.());
const click = async (sel, ms = 600) => { await p.click(sel); await wait(ms); };
const setF = async (sel, v, ms = 400) => { await p.fill(sel, String(v)); await p.press(sel, "Tab"); await wait(ms); };
const tabTo = async (t, ms = 900) => { await click(`nav button[data-tab=${t}]`, ms); };
let compactSeen = 0;
const openProj = async (n) => { await p.selectOption("#proj", n); await wait(1500); if (await p.$("#saNotNow")) { await click("#saNotNow", 1500); } };
const items = async () => (await state()).items;
const alertIds = () => p.$$eval("#sysAlert li[data-issue]", (l) => l.map((x) => x.dataset.issue)).catch(() => []);
const ctrlS = async (ms = 1500) => { await p.keyboard.press("Control+s"); await wait(ms); };
/** Add a part from the Parts tab: category, search text, exact id; cable length (m) when given. */
async function addPart(cat, q, id, lengthM) {
  if ((await state()).tab !== "parts") await tabTo("parts", 800);
  await click(`#pcats2 button[data-pcat=${cat}]`, 300); await p.waitForSelector("#pl", { timeout: 20000 }); await wait(200);
  await setF("#pq", q, 300);
  await p.click(`#pl tr[data-id="${id}"]`); await wait(300);
  if (lengthM !== undefined) await setF("#pLen", lengthM, 100);
  if (await p.$("#sysAlert.compact")) { compactSeen++; await click("#saNotNow", 200); } // the one-line alert after an autosave found a new problem
  await p.selectOption("#pProj", PROJ); await click("#pAdd", 900);
  return /added/.test(await txt("#status"));
}
const goSystem = async () => { await tabTo("system", 1200); await p.waitForSelector("#sysItems"); };

try {
  await p.goto(BASE + "/?skipWelcome=1", { waitUntil: "domcontentloaded" }); await wait(2500);
  if (phase !== "smoke" && phase !== "parts" && phase !== "old") { await openProj(PROJ); }
  // ------------------------------------------------------------------------------------------------ smoke
  if (phase === "smoke") {
    const st = await state();
    ok("smoke: app opens, System tab listed", !!st && (await p.$$eval("nav button", (x) => x.map((y) => y.dataset.tab))).includes("system"), JSON.stringify(st).slice(0, 100));
    await goSystem(); await shot("smoke_system");
    ok("smoke: System tab renders on the start-up project (no alert element)", !!(await p.$("#sysDiagram svg")) && !(await p.$("#sysAlert")));
  }
  // ------------------------------------------------------------------------------------------------ parts
  if (phase === "parts") {
    await click("#toMenu", 900);
    await click("#menu button[data-m=newproject]", 400); await p.fill("#npTitle", "B4 dry run"); await p.selectOption("#npSec", "subwoofer"); await click("#npGo", 2000);
    let st = await state();
    ok("new project b4_dry_run (Subwoofer box item)", st.project === PROJ && st.items.some((i) => i.kind === "box"), JSON.stringify(st.items.map((i) => i.kind)));
    // door speakers with a driver
    await tabTo("project", 800); await p.selectOption("#pjNewSec", "door"); await click("#pjNew", 1200);
    const opt = await p.$$eval("#secDrv option", (o) => o.map((x) => x.value).filter(Boolean)); const pick = opt.find((v) => /car|lib/.test(v)) ?? opt[0];
    await p.selectOption("#secDrv", pick); await wait(900);
    st = await state(); ok("door speakers item with a driver", st.items.some((i) => i.kind === "door" && !i.pristine), pick);
    const adds = [["amplifiers", "T1500-1bdCP", "rockford-t1500-1bdcp"], ["amplifiers", "P400X4", "rockford-p400x4"], ["dsp", "DSP4.8BTM", "ds18-ds18-dsp4-8btm-4-channel-in-and-8-channel-out-digital-sound-processor-with-bluetooth"],
      ["distribution", "AP450", "aerpro-ap450"], ["fuses", "AAF105", "dna-aaf105"], ["capacitors", "ACAP-10000", "audiopipe-acap-10000-10-farad-power-capacitor"]];
    let n = 0; for (const [c, q, id] of adds) if (await addPart(c, q, id)) n++;
    st = await state();
    ok("autosave after adding parts: the alert shows as ONE small line (Show / Not now), not the full panel", compactSeen >= 1, `${compactSeen} times`);
    ok("Parts tab: 2 amps, DSP, fused block, ANL holder, capacitor added", n === 6 && ["amplifier", "dsp", "distribution", "fuseholder", "capacitor"].every((k) => st.items.some((i) => i.kind === k)), `${n} added; ${st.items.map((i) => i.kind).join(",")}`);
  }
  // ------------------------------------------------------------------------------------------------ cables
  if (phase === "cables") {
    const pw = "ds18-ds18-pw-ofc1-0ga-25gr-1-0-ga-ultra-flex-100-ofc-ground-power-cable-25-feet";
    const list = [[pw, 3], [pw, 0.5], [pw, 0.5], [pw, 0.5], [pw, 0.5], [pw, 0.5]];
    let n = 0; for (const [id, l] of list) if (await addPart("cable", "1/0-GA 100% OFC", id, l)) n++;
    for (const l of [3, 2]) if (await addPart("cable", "AP1406", "aerpro-ap1406", l)) n++;
    if (await addPart("cable", "Remote Wire", "ds18-16-ga-ultra-flex-remote-wire-primary-wire-500", 5)) n++;
    const st = await state();
    ok("Parts tab: 6 power cables (1 x 3 m, 5 x 0.5 m), 2 speaker cables, 1 remote wire added with lengths", n === 9 && st.items.filter((i) => i.kind === "cable").length === 9 && st.items.filter((i) => i.kind === "cable" && i.data?.lengthM === 0.5).length === 5, `${n}`);
  }
  // ------------------------------------------------------------------------------------------------ wire
  if (phase === "wire") {
    await goSystem();
    ok("System tab: groups Power, Amplifiers, Signal, Speakers", ["power", "amps", "signal", "speakers"].every((g) => true) && (await p.$$eval("h3.sysGroup", (h) => h.map((x) => x.dataset.group))).join(",") === "power,amps,signal,speakers", await p.$$eval("h3.sysGroup", (h) => h.map((x) => x.dataset.group).join(",")));
    await click("button[data-plain=battery]", 800); await click("button[data-plain=headunit]", 800);
    let st = await state();
    ok("plain items: battery and head unit added", st.items.some((i) => i.kind === "battery") && st.items.some((i) => i.data?.role === "headunit"));
    // DSP values (edit form): current 1 A, fuse 5 A
    const dsp = st.items.find((i) => i.kind === "dsp");
    await click(`.sysTable tr[data-id="${dsp.id}"] button[data-a=edit]`, 600);
    await setF('#itemForm [data-ifield="currentA"]', 1, 300); await setF('#itemForm [data-ifield="fuseA"]', 5, 600);
    st = await state(); ok("edit form on the System tab: DSP current 1 A, fuse 5 A", st.items.find((i) => i.kind === "dsp").data.currentA === 1);
    // manual Connect: head unit -> DSP signal
    const hu = st.items.find((i) => i.data?.role === "headunit");
    await goSystem();
    await click(`.sysTable tr[data-id="${hu.id}"] button[data-a=connect]`, 500);
    await p.selectOption("#cxKind", "signal"); await wait(150); await p.selectOption("#cxTo", dsp.id); await wait(150);
    const ports = [await p.inputValue("#cxFromPort"), await p.inputValue("#cxToPort")];
    await click("#cxGo", 900);
    let s = await sys();
    ok("manual Connect: head unit -> DSP (signal, default ports RCA out -> in)", s.doc.items.find((i) => i.id === hu.id).links.some((l) => l.to === dsp.id && l.kind === "signal") && ports.join("/") === "RCA out/in", ports.join("/"));
    // Wire it for me
    await click("#sysWireBtn", 700);
    const nLinks = (await p.$$("#wireTable input[data-wlink]")).length; const nAdd = (await p.$$("#wireProp input[data-wadd]")).length;
    s = await sys(); const before = s.doc.items.reduce((k, i) => k + i.links.length, 0);
    ok("Wire it for me: a proposal is shown and nothing changes before Apply", nLinks >= 12 && nAdd === 1 && before === 1, `${nLinks} links, ${nAdd} new items (ground point), links now ${before}`);
    await shot("wire_proposal");
    await click("#wireApply", 1500);
    s = await sys(); const L = s.doc.items.flatMap((i) => i.links.map((l) => `${i.kind}${i.data?.role ? "/" + i.data.role : ""}>${s.doc.items.find((x) => x.id === l.to)?.kind}:${l.kind}`));
    ok("Wire it for me applied: battery -> fuse -> block -> cap -> amp, block -> 4ch amp and DSP, grounds, signal, remote, speakers", ["battery>fuseholder:power", "fuseholder>distribution:power", "distribution>capacitor:power", "capacitor>amplifier:power", "distribution>amplifier:power", "distribution>dsp:power", "amplifier>other:ground", "dsp>amplifier:signal", "other/headunit>dsp:remote", "dsp>amplifier:remote", "amplifier>box:speaker", "amplifier>door:speaker"].every((x) => L.includes(x)), L.join(" "));
    // Use this size / bigger fuse through the alert's buttons until nothing is left (max 14 rounds)
    let rounds = 0, seen = [];
    await ctrlS(1500);
    while ((await p.$("#sysAlert")) && rounds < 14) {
      const ids = await alertIds(); seen.push(ids.join(","));
      await p.click("#sysAlert button[data-add]"); await wait(1500); rounds++;
    }
    s = await sys();
    ok("alert buttons fixed every issue (Use this size, larger fuse, precharge, ...): no issue left", s.issues.length === 0, `${rounds} rounds; left: ${JSON.stringify(s.issues)}; seen: ${seen.join(" | ").slice(0, 600)}`);
    await goSystem(); await ctrlS(1800);
    ok("complete system + Save: NO alert element at all", !(await p.$("#sysAlert")) && (await alertIds()).length === 0);
    // cable numbers on screen = cable.ts for the same project
    const res = s.result;
    const rows = await p.$$eval("#ccRuns tr[data-run]", (trs) => trs.map((t) => ({ id: t.dataset.run, maxA: t.querySelector("[data-v=maxA]").textContent, cu: t.querySelector("[data-v=cu]").textContent, cca: t.querySelector("[data-v=cca]").textContent, drop: t.querySelector("[data-v=drop]").textContent, total: t.querySelector("[data-v=total]").textContent })));
    const fx = (v, d) => String(+v.toFixed(d));
    const mism = res.runs.filter((r) => { const row = rows.find((x) => x.id === r.id); return !row || !row.maxA.startsWith(fx(r.maxA, 1) + " A") || !row.cu.startsWith((r.recommended.awg.copper?.size ?? "none")) || !row.cca.startsWith((r.recommended.awg.cca?.size ?? "none")) || !row.drop.startsWith(fx(r.used.dropV, 3) + " V") || !row.total.startsWith(fx(r.used.totalDropV, 3) + " V"); });
    ok("cable calculator rows match cable.ts (current, copper and CCA size, drop, total drop) for every run", rows.length === res.runs.length && res.runs.length >= 4 && !mism.length, `${rows.length} rows / ${res.runs.length} runs; ${JSON.stringify(rows.slice(0, 2))}`);
    ok("system design current shown = engine total", (await txt("#ccTotal")).startsWith(fx(res.totalMaxA, 1)), `${await txt("#ccTotal")} vs ${res.totalMaxA}`);
    ok("speaker cable table + capacitor table + products shown", (await p.$$("#ccSpk tr[data-spk]")).length === 2 && (await p.$$("#ccCaps tr[data-cap]")).length === 1 && (await p.$$(".ccProds tr")).length > 0, `${(await p.$$(".ccProds tr")).length} product rows`);
    // diagram + exports/system.svg
    const svgF = path.join(DATA, "projects", PROJ, "exports", "system.svg");
    const svg = fs.existsSync(svgF) ? fs.readFileSync(svgF, "utf8") : "";
    const nItem = (await p.$$("#sysSvg g[data-item]")).length;
    ok("Save: diagram shown in the System tab and exports/system.svg written (same item count: the 11 parts drawn as boxes; cable items label their links)", nItem === s.doc.items.filter((i) => i.kind !== "cable").length && /<svg/.test(svg) && (svg.match(/data-item="/g) ?? []).length === nItem, `${nItem} items drawn; file ${svg.length} bytes`);
    await click("#dzIn", 200); await click("#dzIn", 200);
    const w = await p.$eval("#sysSvg svg", (e) => e.style.width);
    ok("diagram zoom", /px/.test(w), w);
    await click("#dzFit", 300); await shot("system_complete");
    await p.click(`#sysSvg g[data-item]`); await wait(600);
    ok("diagram item clickable (opens the edit form or the speaker's section)", !!(await p.$("#itemForm")) || (await state()).tab !== "system");
    const dl = p.waitForEvent("download", { timeout: 5000 }).catch(() => undefined);
    if ((await state()).tab !== "system") await goSystem();
    await p.click("#dDown"); const d = await dl;
    ok("Download SVG", !!d && /system\.svg$/.test(d.suggestedFilename()), d?.suggestedFilename());
    await p.evaluate(() => document.querySelector("#sysCable")?.scrollIntoView()); await wait(300); await shot("cable_calculator");
  }
  // ------------------------------------------------------------------------------------------------ alert
  if (phase === "alert") {
    await goSystem();
    let s = await sys();
    ok("start of the alert phase: the complete system has no issue", s.issues.length === 0, JSON.stringify(s.issues));
    const fuse = s.doc.items.find((i) => i.kind === "fuseholder");
    await click(`.sysTable tr[data-id="${fuse.id}"] button[data-a=remove]`, 1200);
    s = await sys();
    ok("remove the main fuse: the wire is kept (battery -> block with the main cable)", !s.doc.items.some((i) => i.kind === "fuseholder") && s.doc.items.find((i) => i.kind === "battery").links.some((l) => l.kind === "power" && l.cableItemId), JSON.stringify(s.doc.items.find((i) => i.kind === "battery").links));
    await wait(800);
    ok("autosave after the removal: the alert shows (new critical issue)", !!(await p.$("#sysAlert")), JSON.stringify(await alertIds()));
    await click("#saNotNow", 500);
    ok("Not now closes it", !(await p.$("#sysAlert")));
    await click("#saveNow", 1600);
    const labels = await p.$$eval("#sysAlert li", (l) => l.map((x) => ({ cls: x.className, btn: x.querySelector("button")?.textContent })) ).catch(() => []);
    ok("Save button -> alert lists 'Add a main fuse at the battery?' as critical, first", labels[0]?.btn === "Add a main fuse at the battery?" && /critical/.test(labels[0]?.cls), JSON.stringify(labels));
    await shot("alert_main_fuse");
    await p.click("#sysAlert button[data-add]"); await wait(1800);
    s = await sys();
    const nf = s.doc.items.find((i) => i.kind === "fuseholder");
    ok("Add: a fuse holder is put into the wire battery -> fuse -> block (the main cable moved to its output)", !!nf && s.doc.items.find((i) => i.kind === "battery").links.some((l) => l.to === nf.id) && nf.links.some((l) => l.cableItemId), JSON.stringify(nf?.links));
    ok("alert gone after the save (nothing missing again)", !(await p.$("#sysAlert")) && s.issues.length === 0, JSON.stringify(s.issues));
    await ctrlS(1500);
    ok("Ctrl+S on the complete system: still no alert element", !(await p.$("#sysAlert")));
    // leaving with a missing part: alert with Not now (leave)
    const hu = s.doc.items.find((i) => i.data?.role === "headunit");
    await click(`.sysTable tr[data-id="${hu.id}"] button[data-a=remove]`, 1400); // the one-line alert may show; not put off here
    await click("#toMenu", 1200);
    ok("leaving (Menu) with a missing part: alert 'Before you leave' with Not now (leave)", /Before you leave/.test(await txt("#sysAlertTitle")) && /leave/.test(await txt("#saNotNow")), await txt("#sysAlertTitle"));
    await click("#saNotNow", 900);
    ok("Not now (leave) goes on to the menu", !!(await p.$("#menu")) && !(await p.$("#sysAlert")));
    // menu entries
    ok("menu: System and wiring entry", !!(await p.$("#menu button[data-m=system]")));
    await click("#menu button[data-m=newitem]", 400); await click("button[data-m2=quickcalc]", 900);
    await p.selectOption("#qcBy", "current"); await setF("#qcI", 200, 100); await setF("#qcL", 5, 100); await setF("#qcG", 0.5, 400);
    ok("quick calculator (Build a single item): 200 A, 5 m + 0.5 m copper -> 200 A fuse, 1/0 AWG (research_i E1)", /200 A/.test(await txt("#qcRes [data-v=fuse]")) && /^1\/0 AWG/.test((await txt("#qcRes [data-v=size]")).trim()) && /3\/0/.test(await txt("#qcRes [data-v=other]")), `${await txt("#qcRes [data-v=size]")} | ${await txt("#qcRes [data-v=other]")}`);
    await shot("quick_calc");
    await click("#qcSave", 900);
    const my = await api("items");
    ok("quick calculator: Save this cable to My items", Array.isArray(my) && my.some((x) => x.kind === "cable" && /1\/0 AWG copper/.test(x.name)), JSON.stringify(my).slice(0, 200));
  }
  // ------------------------------------------------------------------------------------------------ old projects
  if (phase === "old") {
    for (const n of ["existing_sub", "new_sub_box", "tl_pioneer", "car_a", "car_b"]) {
      if (!fs.existsSync(path.join(DATA, "projects", n + ".json"))) continue; // local projects only
      const before = fs.readFileSync(path.join(DATA, "projects", n + ".json"), "utf8");
      await openProj(n); await goSystem();
      const s = await sys();
      await click("#saveNow", 1500);
      const after = JSON.parse(fs.readFileSync(path.join(DATA, "projects", n + ".json"), "utf8"));
      const lone = s.doc.items.length === 1 && s.doc.items[0].kind === "box";
      const al = await alertIds();
      ok(`${n}: opens, System tab, Save writes the file (format kept: ${JSON.parse(before).format ?? 1})`, (after.format ?? 1) === (JSON.parse(before).format ?? 1) && !!(await p.$("#sysDiagram svg")), `${s.doc.items.length} items; issues ${s.issues.map((i) => i.id).join(",")}`);
      if (lone) ok(`${n}: lone box gets only the "no amplifier" suggestion on Save`, al.length === 1 && al[0] === "no-amplifier:project", al.join(","));
      if (await p.$("#saNotNow")) await click("#saNotNow", 300);
      if (lone) { // autosaves do not nag: change a value on Design new twice
        await tabTo("design", 1200);
        const sel = "#page input[type=number]";
        if (await p.$(sel)) { const v = await p.inputValue(sel); await p.fill(sel, String(Number(v) + 1)); await p.press(sel, "Tab"); await wait(1200); await p.fill(sel, v); await p.press(sel, "Tab"); await wait(1200); }
        ok(`${n}: autosaves after edits do not show the alert`, !(await p.$("#sysAlert")));
      }
      ok(`${n}: exports/system.svg written`, fs.existsSync(path.join(DATA, "projects", n, "exports", "system.svg")));
    }
    await shot("old_project_system");
  }
  ok("no page errors", errs.length === 0, errs.join(" | "));
} catch (e) { ok("run finished without an exception", false, String(e?.stack ?? e)); await shot("error_" + phase).catch(() => {}); }
finally { await b.close(); }
fs.writeFileSync(`${out}/results_${phase}.json`, JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.pass).length;
console.log(`DONE ${phase}: ${pass}/${results.length} passed`);
