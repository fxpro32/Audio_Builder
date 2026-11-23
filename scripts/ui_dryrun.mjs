// End-to-end UI dry run as the user: import, fix an existing box, choose a fix, export .glb, design a new box.
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// Run: source /workspace/.playwright/env.sh && timeout -k 5 90 node /workspace/scripts/ui_dryrun.mjs <outdir>
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", (e) => errs.push(String(e)));
p.on("dialog", (d) => d.accept());
const step = (s) => console.log("STEP", s);
await p.goto("http://127.0.0.1:8420/?skipWelcome=1", { waitUntil: "networkidle" });
// 1. Drivers: import a .wdr and a CSV
step("drivers import");
await p.click("nav button[data-tab=drivers]");
const csv = out + "/sample.csv"; fs.writeFileSync(csv, "Brand,Model,Fs (Hz),Re (ohm),Qms,Qes,Vas (L),Sd (cm2),Xmax (mm)\nTestCo,Sub12 test,30,3.4,4,0.7,100,507,10\n");
await p.setInputFiles("#imp", ["/workspace/references/raw/openisd_sample_ACI_SV10.wdr", csv]);
await p.waitForSelector("#impRep p"); console.log("import report:", (await p.textContent("#impRep")).slice(0, 300));
await p.fill("#q", "aci"); await p.click("#dl tr[data-id]"); await p.waitForSelector("#xc table");
await p.screenshot({ path: out + "/1_drivers.png", fullPage: true });
// 2. Fix: Example A in a 120 L-ish ported box
step("fix");
await p.click("nav button[data-tab=fix]");
await p.selectOption("#fsProj select[data-key=driverId]", "example-a-high-qts-12in");
const set = async (sel, v) => { await p.fill(sel, String(v)); await p.dispatchEvent(sel, "change"); };
await set("#fsBox input[data-key=W]", 700); await set("#fsBox input[data-key=H]", 450); await set("#fsBox input[data-key=D]", 480);
await set("#fsPort input[data-key=length]", 300);
await p.click("#run"); await p.waitForSelector("#opts tr[data-id]");
console.log("findings:", (await p.$$eval(".card b", (e) => e.map((x) => x.textContent))).join(" | "));
console.log("options:", (await p.$$eval("#opts tr[data-id]", (rows) => rows.map((r) => r.innerText.replace(/\s+/g, " ").slice(0, 160)))).join("\n  "));
await p.screenshot({ path: out + "/2_fix.png", fullPage: true });
const blk = await p.$("#opts tr[data-id=sealed707]") ?? await p.$("#opts tr[data-id=block]");
await blk.click(); await p.waitForTimeout(500);
await p.check("#xray"); await p.waitForTimeout(300);
await p.locator("#v3d").screenshot({ path: out + "/3_fix_option_3d.png" });
// 3. Export glb (download + server copy)
step("export");
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#glb")]);
await dl.saveAs(out + "/box.glb"); await p.waitForTimeout(500);
console.log("glb bytes:", fs.statSync(out + "/box.glb").size, "| status:", await p.textContent("#status"));
await p.click("#cut"); await p.waitForSelector("#cutbox table");
// 4. Design new
step("design");
await p.click("nav button[data-tab=design]");
await p.waitForSelector("#dsOut");
// 2026-11-21: Design "Type" became "Box type" (topology) with bandpass/isobaric options
await p.selectOption("#dsA select[data-key=topology]", "vented"); await p.waitForTimeout(300);
console.log("design:", (await p.textContent("#dsOut")).replace(/\s+/g, " ").slice(0, 400));
await p.screenshot({ path: out + "/4_design.png", fullPage: true });
await p.click("nav button[data-tab=help]"); await p.screenshot({ path: out + "/5_help.png" });
console.log("ERRORS:", JSON.stringify(errs));
await b.close();
