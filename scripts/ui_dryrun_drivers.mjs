// Headless dry run of the Drivers tab list (A14_DRIVERLIST, 2026-11-23): count line, paging to the last page,
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
// last driver alphabetically reachable, search resets to page 1, "Subwoofers only" on by default and off shows every driver,
// Filters on line + Clear filters, Pioneer TS-W3002D4 findable, selected row stays highlighted, 0 console errors.
// Run against a TEST server (never the owner's port 8420 or data):
//   PORT=8421 AB_DATA_DIR=<copy of /workspace/data> node app/server/server.mjs &
//   source /workspace/.playwright/env.sh && timeout -k 5 90 node /workspace/scripts/ui_dryrun_drivers.mjs <outdir> [baseUrl]
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const base = process.argv[3] ?? "http://127.0.0.1:8421/";
if (/:8420\b/.test(base)) { console.error("refusing to run against port 8420"); process.exit(2); }
const allRaw = await (await fetch(base + "api/drivers")).json();
// PM 2026-11-23 (B3): library copies of your own drivers are hidden in lists (app/src/ui/driverlist.ts shadowedLibraryIds)
const modelKey = (d) => `${String(d.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${String(d.model ?? "").split(/[\s(/]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "")}`;
const mine = new Set(allRaw.filter((d) => !d.library).map(modelKey));
const all = allRaw.filter((d) => !(d.library && mine.has(modelKey(d))));
// independent copy of the "Subwoofers only" rule (app/src/ui/driverlist.ts) to cross-check the UI count
const sizeOf = (d) => d.sizeIn ?? (d.params?.dia ? Math.round(d.params.dia / 0.0254) : undefined);
// PM 2026-11-23 (B3 rule): a driver with a type is a sub only if type === "subwoofer"; car-subs supersedes hp-car-subs
const isSub = (d) => d.kind !== "passive" && (d.type ? d.type === "subwoofer" : (["car-subs", "hp-car-subs", "buildbass"].includes(d.library) || (sizeOf(d) === undefined ? !d.library : sizeOf(d) >= 8)));
const subs = all.filter(isSub);
const key = (d) => d.brand + d.model;
const lastAll = [...all].sort((a, b) => key(a).localeCompare(key(b))).at(-1);
const lastSub = [...subs].sort((a, b) => key(a).localeCompare(key(b))).at(-1);
const fmt = (n) => n.toLocaleString("en-AU");
console.log(`API: ${all.length} drivers, ${subs.length} subwoofers by the rule; last A-Z: ${lastAll.brand} ${lastAll.model}; last sub: ${lastSub.brand} ${lastSub.model}`);

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", (e) => errs.push(String(e)));
const fails = []; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails.push(what); };
const txt = async (sel) => ((await p.textContent(sel)) ?? "").replace(/\s+/g, " ").trim();
const rowIds = () => p.$$eval("#dl tr[data-id]", (rs) => rs.map((r) => r.dataset.id));
const pageNo = async () => { const e = await p.$("#dPager .pgno"); return e ? ((await e.textContent()) ?? "").trim() : ""; };
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
try {
  await p.goto(base.replace(/\/?$/, "/?skipWelcome=1"), { waitUntil: "networkidle" });
  await p.click("nav button[data-tab=drivers]");
  await p.waitForSelector("#dCount");
  // 1. default: Subwoofers only on
  const c1 = await txt("#dCount");
  console.log("count line:", c1, "| filters:", await txt("#dActive"));
  check(await p.isChecked("#fSub"), "Subwoofers only ticked by default");
  check(c1.includes(`Showing 1-200 of ${fmt(subs.length)} matching (${fmt(all.length)} in all)`), `count line says 1-200 of ${fmt(subs.length)} matching (${fmt(all.length)} in all)`);
  check(c1.includes("Subwoofers only is on"), "count line says Subwoofers only is on");
  check((await txt("#dActive")).startsWith("Filters on: Subwoofers only"), "Filters on line names Subwoofers only");
  check((await rowIds()).length === 200, "200 rows on page 1");
  check((await pageNo()) === `Page 1 of ${Math.ceil(subs.length / 200)}`, "page number shown");
  await shot("01_default_subs_on");
  // 2. page through with Next to the last page
  const pagesSub = Math.ceil(subs.length / 200); let seen = new Set(await rowIds());
  for (let i = 2; i <= pagesSub; i++) { await p.click("#dPager button[data-pg=next]"); (await rowIds()).forEach((id) => seen.add(id)); }
  check((await pageNo()) === `Page ${pagesSub} of ${pagesSub}`, "Next reaches the last page");
  check(seen.size === subs.length, `every subwoofer seen once across pages (${seen.size}/${subs.length})`);
  check((await rowIds()).at(-1) === lastSub.id, "last subwoofer A-Z on the last page");
  check(await p.isDisabled("#dPager button[data-pg=next]") && await p.isDisabled("#dPager button[data-pg=last]"), "Next/Last disabled on last page");
  await p.click("#dPager button[data-pg=prev]");
  check((await pageNo()) === `Page ${pagesSub - 1} of ${pagesSub}`, "Previous goes back one page");
  await p.click("#dPager2 button[data-pg=first]");
  check((await pageNo()) === `Page 1 of ${pagesSub}`, "First (bottom pager) goes to page 1");
  // 3. Subwoofers only off: every driver
  await p.uncheck("#fSub");
  const c2 = await txt("#dCount");
  check(c2 === `Showing 1-200 of ${fmt(all.length)} drivers`, `off: "${c2}" = all ${fmt(all.length)} from GET /api/drivers`);
  check((await txt("#dActive")) === "", "no Filters on line when nothing is on");
  await p.click("#dPager button[data-pg=last]");
  const pagesAll = Math.ceil(all.length / 200);
  check((await pageNo()) === `Page ${pagesAll} of ${pagesAll}`, "Last goes to the last page");
  check((await txt("#dCount")).startsWith(`Showing ${fmt((pagesAll - 1) * 200 + 1)}-${fmt(all.length)} of`), "count line range on the last page");
  check((await rowIds()).at(-1) === lastAll.id, `last driver A-Z reachable (${lastAll.brand} ${lastAll.model})`);
  await shot("02_all_last_page");
  // 4. search resets to page 1; Pioneer TS-W3002D4 findable; selection highlighted
  await p.fill("#q", "ts-w3002");
  check((await pageNo()) === "" || (await pageNo()).startsWith("Page 1"), "search goes back to page 1");
  check((await txt("#dCount")).startsWith("Showing 1-"), "count line starts at 1 after search");
  const pio = await p.$$eval("#dl tr[data-id]", (rs) => rs.map((r) => r.dataset.id + " | " + r.textContent));
  console.log("search ts-w3002:", JSON.stringify(pio));
  check(pio.some((r) => r.startsWith("pioneer-ts-w3002d4 ")), "Pioneer TS-W3002D4 findable");
  await p.click('#dl tr[data-id="pioneer-ts-w3002d4"]');
  check(await p.$eval('#dl tr[data-id="pioneer-ts-w3002d4"]', (r) => r.classList.contains("sel")), "clicked row highlighted");
  check((await txt("#edit")).length > 0 && !!(await p.$("#edit input, #edit table")), "editor opened");
  check((await txt("#dActive")).includes('search "ts-w3002"'), "Filters on line names the search");
  await shot("03_pioneer_found");
  // also with Subwoofers only back on
  await p.check("#fSub");
  check(!!(await p.$('#dl tr[data-id="pioneer-ts-w3002d4"]')), "Pioneer kept by Subwoofers only");
  // 5. a page change keeps the selected row highlighted
  await p.fill("#q", "");
  await p.click("#dPager button[data-pg=next]"); const ids = await rowIds();
  await p.click(`#dl tr[data-id="${ids[5]}"]`);
  check((await pageNo()).startsWith("Page 2"), "clicking a row stays on the same page");
  check(await p.$eval(`#dl tr[data-id="${ids[5]}"]`, (r) => r.classList.contains("sel")), "selected row on page 2 highlighted");
  // 6. Clear filters resets everything
  await p.selectOption("#fCoil", "DVC"); await p.fill("#fRms", "1000"); await p.dispatchEvent("#fRms", "input");
  const fa = await txt("#dActive"); console.log("filters:", fa);
  check(fa.includes("coil DVC") && fa.includes("RMS ≥ 1000 W"), "Filters on lists coil and RMS");
  check((await pageNo()) === "" || (await pageNo()).startsWith("Page 1"), "filter change goes back to page 1");
  await shot("04_filters_on");
  await p.click("#clearF");
  check((await txt("#dCount")) === `Showing 1-200 of ${fmt(all.length)} drivers`, "Clear filters shows every driver");
  check(!(await p.isChecked("#fSub")) && (await p.inputValue("#fRms")) === "" && (await p.inputValue("#fCoil")) === "", "Clear filters resets the controls");
  await shot("05_cleared");
  // 7. Listed without published T/S (paged only above 200)
  const lws = await txt("#lwsDetails summary"); console.log("lws:", lws);
  const lwsN = Number(/: (\d+) of/.exec(lws)?.[1]);
  check(lwsN <= 200 ? !(await p.$("#lwsPager")) : !!(await p.$("#lwsPager")), `listed-without-T/S pager present only above 200 (${lwsN})`);
} catch (e) { check(false, "exception: " + e); }
check(errs.length === 0, `0 console errors (${JSON.stringify(errs)})`);
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ all: all.length, subs: subs.length, fails, errs }, null, 2));
await b.close();
console.log(fails.length ? `FAILED ${fails.length}` : "ALL PASS");
process.exit(fails.length ? 1 : 0);
