// Builds the car speaker library (B3_PARTS_DB, 2026-11-23, R39): tweeters, midrange, midbass, coaxials, component sets and
// full-range drivers from the research records of R4_CAR_DRIVERS (data/car_drivers_raw/<type>/<brand>.json).
// Output: data/drivers/library/car-drivers.json, the library bundle shape { source, title, licence, url, attribution, method,
// corrections, imported, count, drivers, listed_without_specs }.
// Each driver: the app Driver fields (scripts/lib_driver_record.mjs: params in SI, sources, CHECK notes, incomplete when the
// published T/S are not enough to simulate) plus: type (tweeter | midrange | midbass | coaxial | component_set | fullrange),
// sizeLabel, params.depth (mounting depth, m) and params.cutout (cut-out diameter, m) when published, frameMm, freqRangeHz,
// sensitivityDb + sensitivityBasis, magnet, coneMaterial, recommendedCrossover, passiveCrossover, setParts, partOfSets,
// tweeterPart (the tweeter of a coaxial or component set, as printed), priceAud.
// Component sets: the T/S are those of the set's woofer (as the research recorded them).
// R4 may still be adding files: the importer reads whatever is there and can be run again at any time (deterministic).
// Run: node scripts/import_car_drivers.mjs [dataDir]
// P1_PUBLIC_DATA (2026-11-23): two outputs. Public data/drivers/library/car-drivers.json has no prices. When the private price
// join exists (data/private/prices_au/join_car_drivers.json, key '<type>/<brand file>.json#<model>', built by
// scripts/prices_au/join_prices.py), the full bundle with priceAud goes to data/private/drivers/library/car-drivers.json
// (the server serves it instead of the public one). The raw files no longer carry price_au (scripts/public_data/split.py).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDriverRecord, latestRead, shortBrand, num } from "./lib_driver_record.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.resolve(process.argv[2] || path.join(ROOT, "data"));
const RAW = path.join(DATA, "car_drivers_raw");
const OUT_PUBLIC = path.join(DATA, "drivers", "library", "car-drivers.json");
const JOIN = path.join(DATA, "private", "prices_au", "join_car_drivers.json");
export const TYPES = ["tweeter", "midrange", "midbass", "coaxial", "component_set", "fullrange"];

build(undefined, OUT_PUBLIC);
if (fs.existsSync(JOIN)) build(JSON.parse(fs.readFileSync(JOIN, "utf8")).records || {}, path.join(DATA, "private", "drivers", "library", "car-drivers.json"));

function build(prices, OUT) {
const drivers = []; const listed = []; const reads = []; const perType = {}; const skipped = [];
for (const type of TYPES) {
  const dir = path.join(RAW, type); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    let bf; try { bf = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { skipped.push(`${type}/${f}: ${e.message} (file being written? run again later)`); continue; }
    const rel = `${type}/${f}`;
    for (const raw of bf.drivers || []) {
      if (!raw?.model) continue;
      reads.push(...(raw.sources || []));
      const t = TYPES.includes(raw.type) ? raw.type : type;
      const rec = buildDriverRecord(raw, rel, bf, { idPrefix: "lib-cardrv-", library: "car-drivers", type: t });
      const extra = {
        frameMm: num(raw.frame_mm), freqRangeHz: Array.isArray(raw.freq_range_hz) ? raw.freq_range_hz : undefined,
        sensitivityDb: num(raw.sensitivity_db), sensitivityBasis: raw.sensitivity_db ? raw.sensitivity_basis ?? "unknown" : undefined,
        magnet: raw.magnet ?? undefined, coneMaterial: raw.cone_material ?? undefined,
        recommendedCrossover: raw.recommended_crossover ?? undefined, passiveCrossover: raw.passive_crossover ?? undefined,
        setParts: raw.set_parts ?? undefined, partOfSets: raw.part_of_sets ?? undefined, tweeterPart: raw.tweeter_part ?? undefined,
        priceAud: prices && Array.isArray(prices[`${rel}#${raw.model}`]) && prices[`${rel}#${raw.model}`].length ? prices[`${rel}#${raw.model}`] : undefined,
      };
      for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) rec[k] = v;
      drivers.push(rec);
      perType[t] = (perType[t] ?? 0) + 1;
    }
    for (const x of bf.no_specs_published || []) if (x?.model) listed.push({ brand: shortBrand(bf.brand), model: x.model, type: TYPES.includes(x.type) ? x.type : type, rms: x.rms_w ?? null, url: x.url ?? null, note: x.note ?? "", rawRef: rel });
  }
}
// ids unique: same brand + model in two type folders (e.g. a woofer listed as midbass and midrange) or two spellings
const seen = {};
for (const d of drivers) { if (seen[d.id]) { seen[d.id]++; d.id = `${d.id}-${d.type.replace(/_/g, "-")}${seen[d.id] > 2 ? "-" + seen[d.id] : ""}`; } else seen[d.id] = 1; }
const seen2 = {}; for (const d of drivers) { if (seen2[d.id]) d.id = `${d.id}-${++seen2[d.id]}`; else seen2[d.id] = 1; }
drivers.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model) || a.id.localeCompare(b.id));
listed.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model) || String(a.url).localeCompare(String(b.url)));
const bundle = {
  source: "car-drivers", title: "Audio_Builder car speaker database (tweeters, midrange, midbass, coaxials, component sets)", licence: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Audio_Builder car speaker database (CC BY 4.0); every value credited to its manufacturer source in each entry",
  method: "Car tweeters, midrange, midbass, coaxial, component-set and full-range drivers (R39), read from the makers' own product pages, technical sheets and catalogues (numbers only). T/S of a component set are those of its woofer. Research: agent R4_CAR_DRIVERS, docs/progress/R4_CAR_DRIVERS_PROGRESS.md (2026-11-23).",
  corrections: "Corrections go in data/car_drivers_raw/<type>/<brand>.json (with the source URL and date read); then run node scripts/import_car_drivers.mjs.",
  imported: latestRead(reads) || "unknown", count: drivers.length, types: TYPES, drivers, listed_without_specs: listed,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle));
const sim = drivers.filter((d) => !d.incomplete).length;
console.log(`car-drivers: ${drivers.length} records (${sim} simulatable, ${drivers.length - sim} without enough T/S), ${listed.length} listed without specs -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
console.log("per type: " + TYPES.map((t) => `${t} ${perType[t] ?? 0}`).join(", "));
if (skipped.length) console.log("skipped: " + skipped.join("; "));
}
