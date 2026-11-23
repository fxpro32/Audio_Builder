// Builds the parts database bundles (B3_PARTS_DB, R40, 2026-11-23) from the research records of R3_ELECTRONICS / R3B
// (data/parts_raw/<category>/<brand>.json, signed off: references/research_i_car_electronics.md).
// Output: data/parts/<category>.json = { schema: "parts/1", category, title, licence, url, attribution, method, corrections,
//   imported, count, brands: [{ brand, maker_site, terms_note, count }], records: [...] } and data/parts/index.json (counts,
//   sizes). Each record = the research record unchanged (so the cable and diagram engines read it) + brand, category,
//   sourceUrl, readDate and the normalised values `n` (app/src/engine/parts.ts normalisePart: lowest AUD price, class,
//   RMS per load, bridged, fuse family, real copper area, material...). The `check` text and `quality_issues` stay as written
//   by the research and are shown to users. Numbers only; source URLs kept on every record.
// Deterministic (sorted by brand then model then id; "imported" = the latest read_date in the files). Re-runnable:
//   node scripts/import_parts.mjs [dataDir]
// It bundles app/src/engine/parts.ts with the app's rolldown into a temporary file first (same pattern as a10_make_project.sh).
// P1_PUBLIC_DATA (2026-11-23): two outputs. Public data/parts/ = maker-tier records only (tier maker / maker-store), no price
// fields. Private data/private/parts/ (only when data/private/parts_raw exists) = data/parts_raw overlaid by data/private/parts_raw
// (retailer-listing records and the full maker files with prices), i.e. the full bundle as before the split. The server serves
// data/private/parts/<file> when it exists (scripts/lib_overlay.mjs, scripts/public_data/split.py).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { overlayFiles, stripPrices, fromRetailer, privateOf } from "./lib_overlay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.resolve(process.argv[2] || path.join(ROOT, "data"));
const RAW = path.join(DATA, "parts_raw");
const OUT = path.join(DATA, "parts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "import_parts_"));
const bundleJs = path.join(tmp, "parts_bundle.mjs");
execFileSync(path.join(ROOT, "app", "node_modules", ".bin", "rolldown"), [path.join(ROOT, "app", "src", "engine", "parts.ts"), "--file", bundleJs, "--format", "esm", "--platform", "node"], { cwd: path.join(ROOT, "app"), stdio: ["ignore", "ignore", "inherit"] });
const { normalisePart, PART_CATEGORIES } = await import(pathToFileURL(bundleJs).href);
fs.rmSync(tmp, { recursive: true, force: true });

const PRAW = path.join(privateOf(DATA), "parts_raw");
build(RAW, undefined, OUT, true);
if (fs.existsSync(PRAW)) build(RAW, PRAW, path.join(privateOf(DATA), "parts"), false);

function build(pubRaw, privRaw, out, isPublic) {
const tag = isPublic ? "public" : "private";
fs.mkdirSync(out, { recursive: true });
const index = { schema: "parts-index/1", categories: [] };
for (const { id: cat, label } of PART_CATEGORIES) {
  const files = overlayFiles(path.join(pubRaw, cat), privRaw && path.join(privRaw, cat)); if (!files.length) continue;
  const records = [], brands = []; let latest = "";
  for (const { name: f, file } of files) {
    let bf = JSON.parse(fs.readFileSync(file, "utf8"));
    if (isPublic) { bf = stripPrices(bf); bf.records = (bf.records || []).filter((r) => !fromRetailer(r)); if (!bf.records.length) continue; }
    if (typeof bf.read_date === "string" && bf.read_date > latest) latest = bf.read_date;
    for (const r of bf.records || []) records.push({ ...normalisePart(r, cat, bf), rawRef: `${cat}/${f}#${r.id}` });
    brands.push({ brand: bf.brand, maker_site: bf.maker_site ?? null, terms_note: bf.terms_note ?? "", count: (bf.records || []).length });
  }
  if (isPublic) for (const r of records) { delete r.n.priceAud; delete r.n.pricePerMAud; r.n.prices = []; }
  records.sort((a, b) => a.brand.localeCompare(b.brand) || String(a.model ?? "").localeCompare(String(b.model ?? "")) || a.id.localeCompare(b.id));
  const b = {
    schema: "parts/1", category: cat, title: `Audio_Builder car audio parts: ${label}`, licence: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/",
    attribution: isPublic ? `Audio_Builder car audio parts database, ${label} (CC BY 4.0); values (numbers only) credited to the maker page in each record's sources`
      : `Audio_Builder car audio parts database, ${label} (CC BY 4.0); values (numbers only) credited to the maker page or retailer listing in each record's sources`,
    method: isPublic ? "Maker product pages, maker store data and manuals (tier maker / maker-store); numbers only. Prices and records built from retailer listings are not in the public copy. Research: references/research_i_car_electronics.md (R3_ELECTRONICS, R3B_PARTS_CLEAN, 2026-11-23). Records marked auto-parsed in `check` are unverified until checked against the maker manual."
      : "Maker product pages, maker store data and manuals (tier maker / maker-store), AU prices from retailer listings (inc. GST as listed). Research: references/research_i_car_electronics.md (R3_ELECTRONICS, R3B_PARTS_CLEAN, 2026-11-23). Records marked auto-parsed in `check` are unverified until checked against the maker manual.",
    corrections: `Corrections go in data/parts_raw/${cat}/<brand>.json (with the source URL and date); then run node scripts/import_parts.mjs.`,
    imported: latest || "unknown", count: records.length, brands, records,
  };
  const file = path.join(out, cat + ".json");
  fs.writeFileSync(file, JSON.stringify(b));
  const size = fs.statSync(file).size;
  index.categories.push({ category: cat, label, count: records.length, brands: brands.length, bytes: size, withAudPrice: records.filter((r) => r.n.priceAud).length, flagged: records.filter((r) => r.quality_issues?.length).length });
  console.log(`[${tag}] ${cat}: ${records.length} records, ${brands.length} brands, ${records.filter((r) => r.n.priceAud).length} with an AUD price -> ${path.relative(DATA, file)} (${(size / 1e3).toFixed(0)} kB)`);
}
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 1));
console.log(`[${tag}] total: ${index.categories.reduce((n, c) => n + c.count, 0)} records, ${(index.categories.reduce((n, c) => n + c.bytes, 0) / 1e6).toFixed(2)} MB`);
}
