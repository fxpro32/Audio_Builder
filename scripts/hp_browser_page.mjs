// Agent A3 (2026-11-22): read ONE page with headless Chromium (for JS-rendered pages or when plain fetch is refused).
// Usage: node hp_browser_page.mjs URL OUT.txt   (prints title + first lines; saves body text). One page per launch.
import fs from "node:fs";
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch();
try {
  const p = await b.newPage({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" });
  const r = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(4000);
  const txt = await p.evaluate(() => document.body ? document.body.innerText : "");
  const links = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.href).filter(h => /\.pdf/i.test(h)));
  fs.writeFileSync(out, `URL: ${url}\nHTTP: ${r ? r.status() : "?"}\nTITLE: ${await p.title()}\n\n${txt}\n\nPDF_LINKS:\n${[...new Set(links)].join("\n")}\n`);
  console.log("status", r ? r.status() : "?", "| title:", await p.title(), "| chars:", txt.length);
} finally { await b.close(); }
