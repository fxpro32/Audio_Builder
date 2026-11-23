// Render one PDF page to PNG (pdfjs-dist + @napi-rs/canvas from /workspace/.pdftools). Usage: node pdf_render.mjs file.pdf page scale out.png
import fs from "node:fs";
const pdfjs = await import("/workspace/.pdftools/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await import("/workspace/.pdftools/node_modules/@napi-rs/canvas/index.js");
const [file, pageNo, scale, out] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, wasmUrl: "/workspace/.pdftools/node_modules/pdfjs-dist/wasm/" }).promise;
const page = await doc.getPage(Number(pageNo)); const vp = page.getViewport({ scale: Number(scale) });
const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)); const ctx = canvas.getContext("2d");
ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
fs.writeFileSync(out, canvas.toBuffer("image/png")); console.log(`pages ${doc.numPages}, wrote ${out} ${canvas.width}x${canvas.height}`);
