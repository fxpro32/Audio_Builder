// A2/A3 hp-subs: render pages in headless Chromium (for sites that block curl or render with JS), save HTML + text.
// Usage: node browse_text.mjs OUTDIR delaySec URL [URL...]   (max 10 URLs per run; one browser; human pace between pages)
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [outdir, delay, ...urls] = process.argv.slice(2);
if (urls.length > 10) { console.error("max 10 pages per batch"); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", viewport: { width: 1300, height: 900 } });
try {
  for (const [i, u] of urls.entries()) {
    if (i) await new Promise((r) => setTimeout(r, Number(delay) * 1000));
    const p = await ctx.newPage();
    try {
      const resp = await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForTimeout(4000);
      const name = u.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.-]+/g, "_").slice(0, 150);
      fs.writeFileSync(`${outdir}/${name}.html`, await p.content());
      const txt = await p.evaluate(() => document.body ? document.body.innerText : "");
      fs.writeFileSync(`${outdir}/${name}.txt`, txt);
      console.log(`OK ${resp && resp.status()} ${u} -> ${name}.txt (${txt.length} chars)`);
    } catch (e) { console.log(`FAIL ${u}: ${e.message.split("\n")[0]}`); }
    await p.close();
  }
} finally { await b.close(); }
