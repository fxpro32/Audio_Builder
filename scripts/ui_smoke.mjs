// One-page smoke test: does headless Chromium start and render the app? (global rule: first launch = one page)
// B1_SHELL 2026-11-23: ?skipWelcome=1 opens straight on the last place (the app now starts with a welcome page and a menu)
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", (e) => errs.push(String(e)));
await p.goto("http://127.0.0.1:8420/?skipWelcome=1", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[2] });
console.log("title:", await p.title(), "| status:", await p.textContent("#status"), "| errors:", JSON.stringify(errs));
await b.close();
