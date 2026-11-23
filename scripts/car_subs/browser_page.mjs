// R2B_SUBS_MORE (2026-11-23): read ONE page with headless Chromium (one page per launch, run under timeout -k 5 90).
// Usage: node browser_page.mjs URL OUT.txt [clickText]  -> saves body text + every link (href) + PDF links; optional: click the
// first element whose text equals clickText (e.g. a 'Specifications' tab) and wait 3 s before reading. No bot-check bypassing.
import fs from "node:fs";
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
const [url, out, click] = process.argv.slice(2);
const b = await chromium.launch();
try {
  const p = await b.newPage({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" });
  const r = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(5000);
  if (click) { try { await p.getByText(click, { exact: true }).first().click({ timeout: 5000 }); await p.waitForTimeout(3000); } catch (e) { console.log("click failed:", String(e).slice(0, 120)); } }
  const txt = await p.evaluate(() => document.body ? document.body.innerText : "");
  const links = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.href));
  fs.writeFileSync(out, `URL: ${url}\nHTTP: ${r ? r.status() : "?"}\nTITLE: ${await p.title()}\n\n${txt}\n\nLINKS:\n${[...new Set(links)].join("\n")}\n`);
  console.log("status", r ? r.status() : "?", "| title:", await p.title(), "| chars:", txt.length, "| links:", new Set(links).size);
} finally { await b.close(); }
