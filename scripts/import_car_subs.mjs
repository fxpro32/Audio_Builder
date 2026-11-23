// Builds the car subwoofer library (B3_PARTS_DB, 2026-11-23, R39) from the research records of R2_SUBS_ALL / R2B
// (data/car_subs_raw/<us|world|au>/*.json, which also carry every data/hp_subs_raw record unchanged, source "hp_subs_raw").
// Output: data/drivers/library/car-subs.json, same bundle shape as hp-car-subs.json plus
//   supersedes: ["hp-car-subs"]  (the app server then lists car-subs instead of hp-car-subs; hp-car-subs.json stays on disk)
//   aliases: { "<old lib-hpsubs- id>": "<new lib-carsubs- id>" }  (old projects and settings keep finding their driver)
// Record rules: scripts/lib_driver_record.mjs (same as scripts/import_hp_subs.mjs + the B3 plausibility flag).
// Deterministic: same input files give the same output (sorted; "imported" = the latest read_date in the sources).
// Re-runnable: node scripts/import_car_subs.mjs [dataDir]   (dataDir default: /workspace/data)
// P1_PUBLIC_DATA (2026-11-23): two outputs. Public data/drivers/library/car-subs.json = data/car_subs_raw only, no prices,
// aliases from the public hp-car-subs.json. When private inputs exist (data/private/car_subs_raw overlay, e.g. VIBE, read past
// a bot block; data/private/prices_au/join_car_subs.json), the full bundle goes to data/private/drivers/library/car-subs.json,
// built from the public raw files overlaid by the private ones, the price join, and the private hp-car-subs.json when present.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDriverRecord, latestRead, shortBrand, slug, valueCount } from "./lib_driver_record.mjs";
import { overlayFiles, privateOf } from "./lib_overlay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.resolve(process.argv[2] || path.join(ROOT, "data"));
const RAW = path.join(DATA, "car_subs_raw");
const LIB = path.join(DATA, "drivers", "library");
const PRIV = privateOf(DATA);
const PRAW = path.join(PRIV, "car_subs_raw");
const PLIB = path.join(PRIV, "drivers", "library");
const JOIN = path.join(PRIV, "prices_au", "join_car_subs.json");
// same PM decision as scripts/import_hp_subs.mjs (docs/signoff_A4_hpdb.md)
const PM_UNRELIABLE = {
  "us/sundown-audio.json#X v.4 18 (Xv4-18) D2": "a consistent Vas (maker prints 17.58 L; the D1 of the same sub prints 93.67 L, and with this Vas the calculated Sd is only 28 % of an 18 in cone)",
  "us/sundown-audio.json#M 12 (M12) D1": "a consistent Vas (maker prints 39.31 L; the D2 of the same sub prints 15.06 L, and with this Vas the calculated Sd equals the nominal circle area)",
};
const SD_RECALC = (brand, model) => /^Sundown/i.test(brand) || (/^Audio System/i.test(brand) && /^H\s*33 EVO$/i.test(model));
const keyOf = (r) => slug(r.brand) + "|" + slug(r.model) + "|" + (r.coil ?? "") + (r.ohmsPerCoil ?? "");

build("public", undefined, {}, path.join(LIB, "hp-car-subs.json"), path.join(LIB, "car-subs.json"));
if (fs.existsSync(PRAW) || fs.existsSync(JOIN))
  build("private", fs.existsSync(PRAW) ? PRAW : undefined, fs.existsSync(JOIN) ? JSON.parse(fs.readFileSync(JOIN, "utf8")).records || {} : {},
    fs.existsSync(path.join(PLIB, "hp-car-subs.json")) ? path.join(PLIB, "hp-car-subs.json") : path.join(LIB, "hp-car-subs.json"), path.join(PLIB, "car-subs.json"));

function build(tag, privRaw, PRICE_JOIN, HP, OUT) {
const byKey = new Map(); const listed = []; const merged = []; const reads = [];
for (const region of ["us", "world", "au"]) {
  for (const { name: f, file } of overlayFiles(path.join(RAW, region), privRaw && path.join(privRaw, region))) {
    const bf = JSON.parse(fs.readFileSync(file, "utf8"));
    const rel = `${region}/${f}`;
    for (const raw of bf.drivers || []) {
      reads.push(...(raw.sources || []));
      const rec = buildDriverRecord(raw, rel, bf, { idPrefix: "lib-carsubs-", library: "car-subs", type: "subwoofer", sdRecalc: SD_RECALC(bf.brand, raw.model), unreliable: PM_UNRELIABLE[`${rel}#${raw.model}`] });
      { const pj = PRICE_JOIN[`${rel}#${raw.model}`]; if (Array.isArray(pj) && pj.length) rec.priceAud = pj; }  // PM 2026-11-23: AU retailer prices from data/prices_au/join_car_subs.json (R4B)
      if (raw.source) rec.collectedBy = raw.source;
      const key = keyOf(rec);
      const old = byKey.get(key);
      if (!old) { byKey.set(key, rec); continue; }
      const [keep, drop] = valueCount(rec) > valueCount(old) ? [rec, old] : [old, rec];
      keep.sources.push(...drop.sources.filter((s) => !keep.sources.some((k) => k.source === s.source && k.param === s.param)));
      keep.notes += ` | Also recorded in ${drop.rawRef}; the record with more values is kept, sources merged.`;
      byKey.set(key, keep); merged.push(`${keep.brand} ${keep.model}: kept ${keep.rawRef}, merged ${drop.rawRef}`);
    }
    for (const x of bf.no_ts_published || []) listed.push({ brand: shortBrand(bf.brand), model: x.model, rms: x.rms_w ?? null, url: x.url ?? null, note: x.note ?? "", sizeIn: x.size_in ?? null, rawRef: rel });
  }
}
const drivers = [...byKey.values()];
const idCount = {}; for (const d of drivers) idCount[d.id] = (idCount[d.id] || 0) + 1;
for (const d of drivers) if (idCount[d.id] > 1) d.id = `${d.id}-${d.coil ?? ""}${d.ohmsPerCoil ?? ""}`.toLowerCase().replace(/\./g, "-");
// still not unique (same brand, model, coil and ohms in two spellings): number them in file order
const seen = {}; for (const d of drivers) { if (seen[d.id]) d.id = `${d.id}-${++seen[d.id]}`; else seen[d.id] = 1; }

// old hp-car-subs ids -> new ids (same brand, model, coil, ohms); an old record with no new match is carried over with its old id
const aliases = {}; const carried = [];
if (fs.existsSync(HP)) {
  const hp = JSON.parse(fs.readFileSync(HP, "utf8"));
  const byK = new Map(drivers.map((d) => [keyOf(d), d]));
  for (const h of hp.drivers) {
    const n = byK.get(keyOf(h));
    if (n) aliases[h.id] = n.id;
    else { const c = { ...h, library: "car-subs", type: "subwoofer", notes: `${h.notes ?? ""} | Carried over from the hp-car-subs library (no matching record in data/car_subs_raw); id kept.` }; drivers.push(c); carried.push(h.id); }
  }
}
drivers.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model) || a.id.localeCompare(b.id));
listed.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model) || String(a.url).localeCompare(String(b.url)));
const bundle = {
  source: "car-subs", title: "Audio_Builder car subwoofer database (all power levels)", licence: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Audio_Builder car subwoofer database (CC BY 4.0); every value credited to its manufacturer source in each entry",
  method: "Car subwoofer drivers of every power level (R39). Values read from the maker's own spec sheets, manuals, product pages and store data first (tier 1), then the maker's authorised distributor (tier 2) or a named independent measurement (tier 3); numbers only. Research: references/research_j_car_subs_all.md (R2_SUBS_ALL, R2B, 2026-11-23), which carries the high-power research (references/research_e_hp_subs_us.md, research_e_hp_subs_world.md) unchanged.",
  corrections: "Corrections go in data/car_subs_raw/<us|world>/<brand>.json (with the source URL, document, page and date read); then run node scripts/import_car_subs.mjs.",
  imported: latestRead(reads) || "unknown", count: drivers.length, supersedes: ["hp-car-subs"], aliases, drivers, listed_without_specs: listed,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle));
const sim = drivers.filter((d) => !d.incomplete).length;
console.log(`[${tag}] car-subs: ${drivers.length} records (${sim} simulatable, ${drivers.length - sim} incomplete), ${listed.length} listed without specs, ${Object.keys(aliases).length} hp-car-subs ids mapped, ${carried.length} carried over -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
if (merged.length) console.log(`merged duplicates: ${merged.length}`);
if (carried.length) console.log("carried over (old id kept): " + carried.join(", "));
}
