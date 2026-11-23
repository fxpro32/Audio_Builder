// R2B_SUBS_MORE (2026-11-23): render one PDF page and save a crop as PNG, for reading image-only spec tables by eye.
// Usage: node pdf_crop.mjs file.pdf page scale x0 y0 x1 y1 out.png   (x/y = fractions 0..1 of the page width/height)
import fs from "node:fs";
const pdfjs = await import("/workspace/.pdftools/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await import("/workspace/.pdftools/node_modules/@napi-rs/canvas/index.js");
const [file, pageNo, scale, x0, y0, x1, y1, out] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, wasmUrl: "/workspace/.pdftools/node_modules/pdfjs-dist/wasm/" }).promise;
const page = await doc.getPage(Number(pageNo)); const vp = page.getViewport({ scale: Number(scale) });
const full = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)); const ctx = full.getContext("2d");
ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, full.width, full.height);
await page.render({ canvasContext: ctx, viewport: vp, canvas: full }).promise;
const X0 = Math.round(x0 * full.width), Y0 = Math.round(y0 * full.height), W = Math.round((x1 - x0) * full.width), H = Math.round((y1 - y0) * full.height);
const c = createCanvas(W, H); c.getContext("2d").drawImage(full, X0, Y0, W, H, 0, 0, W, H);
fs.writeFileSync(out, c.toBuffer("image/png")); console.log(`pages ${doc.numPages}, page ${pageNo} ${full.width}x${full.height}, crop ${W}x${H} -> ${out}`);
