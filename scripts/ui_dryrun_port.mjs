// A8 dry run (R28, "plank poking out the rear"): the owner's Design new settings, sealed -> ported -> sealed, then wedge, round,
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// two slots, imperial units, the Fix tab with a too-long port, and a free-form shape. After every step it reads the three.js
// scene (window.__abView.bounds()) and asserts that no port object lies outside the box (outer bounds, and in front of the
// back panel's inside face for wedges). ONE headless browser, one page.
// Run (server on PORT with AB_DATA_DIR = a COPY of data/; copy docs/progress/A8_shots/existing_sub_design_fixture.json over the copy's
// projects/existing_sub.json first = the owner's Design settings of 2026-11-22; never the real data/):
//   source /workspace/.playwright/env.sh && timeout -k 5 90 node /workspace/scripts/ui_dryrun_port.mjs <port> <outDir>
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [port = "8421", out] = process.argv.slice(2);
if (!out) { console.error("usage: node ui_dryrun_port.mjs <port> <outDir>"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const res = { started: new Date().toISOString(), checks: [], notes: [] };
const flag = (name, ok, info = "") => { res.checks.push({ name, ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${info}`); };
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
p.on("dialog", (d) => d.accept());
// fill + Tab = the browser's own change event, as a user typing (fill + a synthetic change event fires change twice: once more on blur)
const set = async (sel, v) => { await p.fill(sel, String(v)); await p.press(sel, "Tab"); await p.waitForTimeout(400); };
const pick = async (sel, v) => { await p.selectOption(sel, v); await p.waitForTimeout(500); };
const tick = async (sel, on) => { const el = p.locator(sel); if ((await el.isChecked()) !== on) await el.click(); await p.waitForTimeout(500); };
const text = async (sel) => ((await p.textContent(sel)) ?? "").replace(/\s+/g, " ").trim();
const scene = () => p.evaluate(() => { const v = window.__abView; const m = v.model; const lay = v.portLayout;
  return { b: v.bounds(), m: { W: m.W, H: m.H, D: m.D, Dtop: m.Dtop, t: m.t }, lay: lay ? { mode: lay.mode, fits: lay.fits, L1: lay.L1, L2: lay.L2, need: lay.need, straightMax: lay.straightMax, foldMax: lay.foldMax } : null, free: !!v.free }; });
const isPort = (n) => /^Port/.test(n);
/** Port objects inside the outer box and in front of the back panel's inside face (wedge-aware); 1 mm tolerance. */
async function checkScene(tag, { expectPort }) {
  const s = await scene(); const { W, H, D, t } = s.m; const Dt = s.m.Dtop ?? D; const front = D / 2; const tol = 0.001;
  const ports = s.b.filter((o) => isPort(o.name));
  if (expectPort === false) flag(`${tag}: no port objects`, ports.length === 0, ports.map((o) => o.name).join(","));
  if (expectPort === true) flag(`${tag}: port drawn`, ports.length > 0, `layout ${JSON.stringify(s.lay)}`);
  if (s.free) return s;
  const backInner = (y) => D - t + (Dt - D) * Math.min(1, Math.max(0, (y - t) / (H - 2 * t)));
  const outside = [];
  for (const o of s.b) {
    const [x0, y0, z0] = o.min, [x1, y1, z1] = o.max;
    const fwd = o.name === "Driver" ? 0.03 : tol; // the driver's frame and surround sit on the front face
    if (x0 < -W / 2 - tol || x1 > W / 2 + tol || y0 < -tol || y1 > H + tol || z1 > front + fwd || z0 < front - D - tol) outside.push(`${o.name} [${o.min.map((v) => v.toFixed(3))}]..[${o.max.map((v) => v.toFixed(3))}]`);
    if (isPort(o.name) && front - z0 > backInner(Math.min(y1, H - t)) + tol) outside.push(`${o.name} behind the back panel's inside face`);
  }
  // the driver, and the front panel when the driver's cut-out is bigger than the panel, may only be outside with a red warning
  const drvLike = (x) => x.startsWith("Driver") || x.startsWith("Front_Baffle");
  const drvOut = outside.filter(drvLike); const other = outside.filter((x) => !drvLike(x));
  flag(`${tag}: no port/panel object outside the box`, other.length === 0, other.join(" | ") + (other.length ? ` model ${JSON.stringify(s.m)}` : ""));
  if (drvOut.length) { const red = await p.$$eval("#dsOut td.bad", (e) => e.map((x) => x.textContent)).catch(() => []);
    flag(`${tag}: driver past the box edge is flagged in red`, red.some((x) => /driver/i.test(x)), drvOut.join(" | ")); }
  return s;
}
const shots = async (prefix) => { await p.locator("#v3d").screenshot({ path: `${out}/${prefix}_default.png` });
  for (const [k, n] of [["9", "back"], ["3", "right"], ["7", "top"]]) { await p.click("#v3d"); await p.keyboard.press(k); await p.waitForTimeout(500); await p.locator("#v3d").screenshot({ path: `${out}/${prefix}_${n}.png` }); }
  await p.click("#v3d"); await p.keyboard.press("5"); };

await p.goto(`http://127.0.0.1:${port}/?skipWelcome=1`, { waitUntil: "networkidle" });
await p.click("nav button[data-tab=design]"); await p.waitForSelector("#dsOut h2"); await p.waitForTimeout(600);
// 1. The owner's settings: sealed -> ported -> sealed
await pick("#dsA select[data-key=topology]", "sealed"); await checkScene("1a sealed", { expectPort: false });
await pick("#dsA select[data-key=topology]", "vented"); await p.waitForTimeout(500);
const r1 = await text("#dsOut"); res.notes.push({ step: "1b owner's ported result", text: r1 }); console.log("RESULT 1b:", r1);
const s1 = await checkScene("1b ported (owner's settings)", { expectPort: true });
flag("1b port fits (straight or folded)", s1.lay?.fits === true, JSON.stringify(s1.lay));
flag("1b port length = centre-line legs", !s1.lay || s1.lay.mode !== "folded" || Math.abs(s1.lay.L1 + s1.lay.L2 - s1.lay.need) < 0.002);
const vol1 = await text("#volbox"); res.notes.push({ step: "1b volume", text: vol1 });
await shots("after");
await p.check("#xray"); await p.waitForTimeout(400); await p.click("#v3d"); await p.keyboard.press("3"); await p.waitForTimeout(400); await p.locator("#v3d").screenshot({ path: `${out}/after_xray_right.png` });
await p.keyboard.press("5"); await p.waitForTimeout(400); await p.locator("#v3d").screenshot({ path: `${out}/after_xray_default.png` }); await p.uncheck("#xray"); await p.waitForTimeout(300);
await pick("#dsA select[data-key=topology]", "sealed"); await checkScene("1c back to sealed", { expectPort: false });
await pick("#dsA select[data-key=topology]", "vented");
// 2. wedge
await tick("#dsB input[data-key=wedge]", true); res.notes.push({ step: "2 wedge", text: await text("#dsOut") });
await checkScene("2 wedge + slot", { expectPort: true }); await p.locator("#v3d").screenshot({ path: `${out}/after_wedge_slot.png` });
// 3. round port in the wedge
await pick("#dsC select[data-key=portShape]", "round"); res.notes.push({ step: "3 wedge round", text: await text("#dsOut") });
await checkScene("3 wedge + round", { expectPort: true }); await p.locator("#v3d").screenshot({ path: `${out}/after_wedge_round.png` });
await tick("#dsB input[data-key=wedge]", false);
// 4. two slot ports
await pick("#dsC select[data-key=portShape]", "slot"); await set("#dsC input[data-key=portCount]", 2);
res.notes.push({ step: "4 two slots", text: await text("#dsOut") }); await checkScene("4 two slots", { expectPort: true });
await set("#dsC input[data-key=portCount]", 1);
// 5. imperial units: display only, same scene
await pick("#units", "imperial"); await p.click("nav button[data-tab=design]"); await p.waitForSelector("#dsOut h2"); await p.waitForTimeout(500);
const r5 = await text("#dsOut"); res.notes.push({ step: "5 imperial", text: r5 }); flag("5 imperial result shows inches", /\bin\b/.test(r5));
await checkScene("5 imperial", { expectPort: true }); await pick("#units", "metric");
// 6. a space too small for this tuning: red warning, no port drawn
await p.click("nav button[data-tab=design]"); await p.waitForSelector("#dsOut h2");
await pick("#dsA select[data-key=target]", "custom"); await set("#dsA input[data-key=customFb]", 18); await set("#dsA input[data-key=customVbL]", 20);
await set("#dsB input[data-key=maxH]", 250); await set("#dsB input[data-key=maxW]", 400);
const r6 = await text("#dsOut"); res.notes.push({ step: "6 impossible", text: r6 });
const s6 = await scene();
if (s6.lay && !s6.lay.fits) { flag("6 impossible port: red warning", /does not fit/.test(await p.$$eval("#dsOut td.bad", (e) => e.map((x) => x.textContent).join(" ")))); await checkScene("6 impossible port", { expectPort: false }); }
else { flag("6 small space: port still fits (resized/folded)", true, JSON.stringify(s6.lay)); await checkScene("6 small space", { expectPort: true }); }
await p.locator("#v3d").screenshot({ path: `${out}/after_small_space.png` });
await set("#dsB input[data-key=maxH]", 380); await set("#dsB input[data-key=maxW]", 800); await pick("#dsA select[data-key=target]", "qb3");
// 7. Fix tab: a ported box whose port is entered longer than the box
await p.click("nav button[data-tab=fix]"); await p.waitForSelector("#volbox h2");
await pick("#fsBox select[data-key=kind]", "vented"); await p.waitForTimeout(500);
await set("#fsPort input[data-key=length]", 280); const v7 = await text("#volbox"); res.notes.push({ step: "7a fix 280 mm port (box 330 deep)", text: v7 });
await checkScene("7a fix long port", { expectPort: true }); await p.locator("#v3d").screenshot({ path: `${out}/after_fix_280.png` });
await set("#fsPort input[data-key=length]", 3000); const v7b = await text("#volbox"); res.notes.push({ step: "7b fix 3000 mm port", text: v7b });
flag("7b fix: impossible port flagged", /does not fit/.test(v7b)); await checkScene("7b fix 3000 mm port", { expectPort: false });
await set("#fsPort input[data-key=length]", 200); await pick("#fsBox select[data-key=kind]", "sealed");
// 8. free-form shape (preset rectangle) on the Design tab with a port too long for it: red row + no tube
await p.click("nav button[data-tab=design]"); await p.waitForSelector("#dsOut h2");
try {
  await pick("#fsShape select[data-key=mode]", "preset"); await p.waitForTimeout(800);
  await pick("#dsA select[data-key=target]", "custom"); await set("#dsA input[data-key=customFb]", 20);
  const r8 = await text("#dsOut"); res.notes.push({ step: "8 free-form", text: r8 });
  const s8 = await scene(); const marker = s8.b.some((o) => o.name === "Port_Does_Not_Fit"); const tube = s8.b.some((o) => o.name === "Port");
  if (/does not fit straight/.test(r8)) flag("8 free-form: too-long port flagged red, no tube drawn", marker && !tube, JSON.stringify(s8.b.map((o) => o.name)));
  else flag("8 free-form: port fits, tube drawn", tube);
  await p.locator("#v3d").screenshot({ path: `${out}/after_freeform.png` });
  await pick("#fsShape select[data-key=mode]", "classic"); await pick("#dsA select[data-key=target]", "qb3");
} catch (e) { flag("8 free-form step ran", false, String(e)); }
flag("no page errors", errs.length === 0, JSON.stringify(errs));
res.errors = errs; res.finished = new Date().toISOString();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(res, null, 2));
const fails = res.checks.filter((c) => !c.ok).length; console.log(`DONE ${res.checks.length - fails}/${res.checks.length} passed`);
await b.close();
