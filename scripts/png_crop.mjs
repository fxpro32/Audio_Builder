// Crop a PNG region: node png_crop.mjs in.png x y w h out.png [scale] (uses @napi-rs/canvas from /workspace/.pdftools)
import fs from "node:fs";
const { createCanvas, loadImage } = await import("/workspace/.pdftools/node_modules/@napi-rs/canvas/index.js");
const [inp, x, y, w, h, out, s = "1"] = process.argv.slice(2);
const img = await loadImage(fs.readFileSync(inp)); const k = Number(s);
const c = createCanvas(Math.round(+w * k), Math.round(+h * k)); const g = c.getContext("2d");
g.drawImage(img, +x, +y, +w, +h, 0, 0, c.width, c.height); fs.writeFileSync(out, c.toBuffer("image/png")); console.log("wrote", out, c.width, c.height);
