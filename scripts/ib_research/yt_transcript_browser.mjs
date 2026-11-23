// R1_IB: read one YouTube video's transcript panel in headless Chromium (one page per launch).
// Usage: node yt_transcript_browser.mjs <videoId> <outdir>. Writes <outdir>/yt_<id>_transcript.txt (or reports none).
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [vid, out] = process.argv.slice(2);
const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, locale: "en-GB" });
  await p.goto(`https://www.youtube.com/watch?v=${vid}&hl=en`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(4000);
  for (const t of ["Accept all", "Reject all"]) { const c = p.getByRole("button", { name: t }); if (await c.count()) { await c.first().click().catch(() => {}); await p.waitForTimeout(2500); break; } }
  await p.locator("#description-inline-expander #expand, tp-yt-paper-button#expand").first().click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const btn = p.locator("ytd-video-description-transcript-section-renderer button, button[aria-label='Show transcript']");
  let ok = false;
  if (await btn.count()) { await btn.first().click({ timeout: 8000 }).catch(() => {}); ok = true; }
  let lines = [];
  if (ok) {
    await p.waitForSelector("ytd-transcript-segment-renderer, transcript-segment-view-model", { timeout: 20000 }).catch(() => {});
    lines = await p.$$eval("ytd-transcript-segment-renderer, transcript-segment-view-model", (els) => els.map((e) => {
      const ts = (e.querySelector(".segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp") || {}).textContent || "";
      const tx = (e.querySelector(".segment-text, span.yt-core-attributed-string") || e).textContent || "";
      let t2 = tx.replace(/\s+/g, " ").trim(); const t1 = ts.trim(); if (t2.startsWith(t1)) t2 = t2.slice(t1.length); t2 = t2.replace(/^(\d+ (hours?|minutes?|seconds?),? ?)+/, ""); return `[${t1}] ${t2}`;
    }));
  }
  const f = `${out}/yt_${vid}_transcript.txt`;
  fs.writeFileSync(f, `transcript of https://www.youtube.com/watch?v=${vid} read via the YouTube transcript panel (auto-generated captions unless stated), fetched ${new Date().toISOString().slice(0, 10)}\n` + (lines.length ? lines.join("\n") : "NO TRANSCRIPT PANEL FOUND") + "\n");
  console.log(vid, "segments:", lines.length);
} finally { await b.close(); }
