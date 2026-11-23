// R2B_SUBS_MORE (2026-11-23): navigate headless Chromium to ONE document URL (as a user opening the link) and save the download.
// Usage: node browser_download.mjs FILE_URL OUT_FILE. Run under timeout -k 5 90. No bot-check bypassing: if a challenge page shows, it is saved and reported.
import fs from "node:fs";
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
const [file, out] = process.argv.slice(2);
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ acceptDownloads: true, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" });
  const p = await ctx.newPage();
  const dl = p.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  let status = "?";
  try { const r = await p.goto(file, { waitUntil: "domcontentloaded", timeout: 45000 }); status = r ? r.status() : "?"; } catch (e) { status = "nav:" + String(e).slice(0, 60); }
  const d = await dl;
  if (d) { await d.saveAs(out); console.log("download saved", fs.statSync(out).size, "bytes; nav", status); }
  else { await p.waitForTimeout(6000); fs.writeFileSync(out + ".html", await p.content()); console.log("no download; nav", status, "| title:", await p.title()); }
} finally { await b.close(); }
