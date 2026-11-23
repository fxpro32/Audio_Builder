// Extract text from a PDF, page by page (pdfjs-dist in /workspace/.pdftools). Usage: node pdf_text.mjs file.pdf [out.txt]
import fs from "node:fs";
const pdfjs = await import("/workspace/.pdftools/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const [file, out] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
let text = `Source file: ${file}\nPages: ${doc.numPages}\n`;
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i); const c = await page.getTextContent();
  let line = "", lastY = null; const lines = [];
  for (const it of c.items) { const y = Math.round(it.transform[5]); if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ""; } line += it.str + (it.hasEOL ? "" : " "); lastY = y; }
  lines.push(line);
  text += `\n=== page ${i} ===\n` + lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + "\n";
}
if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
