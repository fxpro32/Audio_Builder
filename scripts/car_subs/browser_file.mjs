// R2B_SUBS_MORE (2026-11-23): open ONE product page in headless Chromium, then download ONE linked document (as a user clicking
// its link) with the same browser session. Usage: node browser_file.mjs PAGE_URL FILE_URL OUT_FILE. Run under timeout -k 5 90.
import fs from "node:fs";
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
const [page, file, out] = process.argv.slice(2);
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" });
  const p = await ctx.newPage();
  const r = await p.goto(page, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(4000);
  const f = await ctx.request.get(file, { headers: { Referer: page }, timeout: 45000 });
  const body = await f.body();
  fs.writeFileSync(out, body);
  console.log("page", r ? r.status() : "?", "| file", f.status(), f.headers()["content-type"], body.length, "bytes");
} finally { await b.close(); }
