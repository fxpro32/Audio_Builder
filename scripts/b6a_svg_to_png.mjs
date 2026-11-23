// B6A_DIAGRAM_ENGINE: render SVG files to PNG with headless Chromium, one browser, pages one after another (no server).
// Usage: node scripts/b6a_svg_to_png.mjs a.svg [b.svg ...]  -> a.png next to each file. Source /workspace/.playwright/env.sh first.
import { chromium } from "/workspace/.playwright/node_modules/playwright/index.mjs";
import fs from "node:fs";
const b = await chromium.launch();
try {
  for (const f of process.argv.slice(2)) {
    const svg = fs.readFileSync(f, "utf8");
    const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = Math.ceil(+m[1]), h = Math.ceil(+m[2]);
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(`<!doctype html><html><body style="margin:0">${svg.replace(/^<\?xml[^>]*>\s*/, "")}</body></html>`);
    await p.screenshot({ path: f.replace(/\.svg$/, ".png"), fullPage: true });
    await p.close();
    console.log("rendered", f, w, "x", h);
  }
} finally { await b.close(); }
