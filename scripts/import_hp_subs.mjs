// Builds the high-power car subwoofer library (agent A4_HPDB, 2026-11-22) from the research records of agents A2 and A3.
// Input:  data/hp_subs_raw/us/*.json and data/hp_subs_raw/world/*.json (one file per brand; never edited here).
// Output: data/drivers/library/hp-car-subs.json, same bundle shape as scripts/import_driver_libraries.mjs
//         { source, licence, url, attribution, imported, count, drivers, listed_without_specs }.
// Rules (task brief A4 + PM sign-offs docs/signoff_A2_hpsubs_us.md, docs/signoff_A3_hpsubs_world.md):
// - Values are the maker's, converted to SI only. A value is derived only by a standard identity and then listed in
//   `calculated` and in the notes ("<key> calculated ..."):
//     1/Qts = 1/Qes + 1/Qms;  Cms = Vas/(rho c^2 Sd^2) = 1/((2 pi fs)^2 Mms);  Qes = 2 pi fs Mms Re / Bl^2.
//   rho 1.204 kg/m^3, c 343.2 m/s (PM). Sd is never taken from the nominal size.
// - A record without fs, Re, Qms, Qes, Sd and one of Vas/Mms (after those identities) is kept with incomplete: true
//   and the list of missing values; the app lists it but does not simulate it.
// - Sundown Audio (all records) and Audio System H33 EVO: the printed Sd contradicts the maker's own fs, Mms and Vas
//   (research_e us/world); Sd for simulation is calculated from fs, Mms, Vas; the printed Sd is kept in `printed` and notes.
// - Maker data problems: raw notes copied verbatim, prefixed "CHECK: " when the research flagged the record
//   (raw note says DATA PROBLEM / CHECK / UNVERIFIED, or the same sanity checks as the research scripts fail).
// - ts_basis kept as published ("unknown" where unknown); research inferences stay in the notes.
// - The same brand+model in both folders is merged (record with more values kept, sources merged).
// Run: node scripts/import_hp_subs.mjs [dataDir]   (dataDir default: the repository's data/)
// P1_PUBLIC_DATA (2026-11-23): two outputs. Public data/drivers/library/hp-car-subs.json = data/hp_subs_raw only. When
// data/private/hp_subs_raw exists (e.g. VIBE, read past a bot block), the full bundle (public raw files overlaid by the private
// ones) goes to data/private/drivers/library/hp-car-subs.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { overlayFiles } from "./lib_overlay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// PM decision 2026-11-22 (docs/signoff_A4_hpdb.md): records whose maker values contradict each other so badly that a
// simulation would mislead are kept and shown with their sources, but not offered for simulation.
const PM_UNRELIABLE = {
  "us/sundown-audio.json#X v.4 18 (Xv4-18) D2": "a consistent Vas (maker prints 17.58 L; the D1 of the same sub prints 93.67 L, and with this Vas the calculated Sd is only 28 % of an 18 in cone)",
  "us/sundown-audio.json#M 12 (M12) D1": "a consistent Vas (maker prints 39.31 L; the D2 of the same sub prints 15.06 L, and with this Vas the calculated Sd equals the nominal circle area)",
};
const DATA = path.resolve(process.argv[2] || path.join(ROOT, "data"));
const RAW = path.join(DATA, "hp_subs_raw");
const PRAW = path.join(DATA, "private", "hp_subs_raw");
const RHO = 1.204, C = 343.2, RC2 = RHO * C * C;
const today = new Date().toISOString().slice(0, 10);
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
const r4 = (x) => +x.toPrecision(4);
const shortBrand = (b) => b.replace(/\s*\(.*\)\s*$/, "").trim();
const TIER = { 1: "manufacturer", 2: "manufacturer's authorised distributor", 3: "independent measurement" };

// raw key -> [SI key, factor]
const PMAP = { fs_hz: ["fs", 1], re_ohm: ["Re", 1], qms: ["Qms", 1], qes: ["Qes", 1], qts: ["Qts", 1], vas_l: ["Vas", 1e-3], sd_cm2: ["Sd", 1e-4],
  xmax_mm: ["Xmax", 1e-3], mms_g: ["Mms", 1e-3], bl_tm: ["Bl", 1], le_mh: ["Le", 1e-3], spl_db_1w1m: ["sens1W", 1] };
const toSI = (raw) => { const p = {}; for (const [k, [K, f]] of Object.entries(PMAP)) { const v = num(raw?.[k]); if (v !== undefined) p[K] = v * f; } return p; };
const SD_RECALC = (brand, model) => /^Sundown/i.test(brand) || (/^Audio System/i.test(brand) && /^H\s*33 EVO$/i.test(model));
const coilWord = (r) => r.coil ?? (r.coils === 1 ? "SVC" : r.coils === 2 ? "DVC" : r.coils === 4 ? "QVC" : undefined);

function build(raw, file, brandFile) {
  const brand = shortBrand(brandFile.brand);
  const p = toSI(raw.params);
  const calculated = [], calc = [], checks = [], printed = {};
  // extra params (SI)
  if (num(raw.rms_w)) p.Pe = raw.rms_w;
  if (num(raw.mounting_depth_mm)) p.depth = raw.mounting_depth_mm / 1000;
  if (num(raw.cutout_mm)) p.cutout = raw.cutout_mm / 1000;
  if (num(raw.displacement_l)) p.displacement = raw.displacement_l / 1000;
  if (num(raw.size_in)) { p.dia = raw.size_in * 0.0254; calculated.push("dia"); calc.push(`dia calculated: nominal size ${raw.size_in} in x 25.4 mm (not a measured outer diameter; used for the 3D view only)`); }
  // nominal impedance of the published T/S basis
  const opc = num(raw.ohms_per_coil), n = raw.coils;
  if (opc && n) {
    const z = raw.ts_basis === "series" ? opc * n : raw.ts_basis === "parallel" ? opc / n : raw.ts_basis === "per_coil" || n === 1 ? opc : undefined;
    if (z) { p.Znom = z; calculated.push("Znom"); calc.push(`Znom calculated: ${opc} ohm per coil, ${n} coil(s), T/S basis ${raw.ts_basis}`); }
  }
  // research sanity checks on the printed values (same tests as scripts/hp_subs/sanity_us.py and scripts/hp_world_sanity.py)
  if (p.Qts && p.Qes && p.Qms) { const q = (p.Qes * p.Qms) / (p.Qes + p.Qms); if (Math.abs(q / p.Qts - 1) > 0.1) checks.push(`CHECK: printed Qts ${p.Qts} vs ${r4(q)} from the printed Qes and Qms`); }
  if (p.fs && p.Vas && p.Mms && p.Sd) {
    const cms = p.Vas / (RC2 * p.Sd ** 2), fsc = 1 / (2 * Math.PI * Math.sqrt(p.Mms * cms));
    if (Math.abs(fsc / p.fs - 1) > 0.2) checks.push(`CHECK: printed fs ${p.fs} Hz vs ${r4(fsc)} Hz from the printed Vas, Mms and Sd (one of them is off by ${Math.round(Math.abs(fsc / p.fs - 1) * 100)} %)`);
  }
  // PM decision: Sd recalculated from fs, Mms and Vas
  if (SD_RECALC(brandFile.brand, raw.model) && p.Sd && p.fs && p.Mms && p.Vas) {
    printed.Sd = p.Sd;
    const cms = 1 / ((2 * Math.PI * p.fs) ** 2 * p.Mms);
    p.Sd = Math.sqrt(p.Vas / (RC2 * cms));
    calculated.push("Sd");
    calc.push(`Sd calculated from fs, Mms and Vas (Cms = 1/((2 pi fs)^2 Mms), Sd = sqrt(Vas/(rho c^2 Cms)), rho 1.204, c 343.2): ${r4(p.Sd * 1e4)} cm2 used for simulation; printed Sd ${r4(printed.Sd * 1e4)} cm2 contradicts the maker's own fs, Mms and Vas (PM decision 2026-11-22)`);
  }
  // completion by identities only
  for (let it = 0; it < 3; it++) {
    if (!p.Qes && p.Qts && p.Qms && p.Qms > p.Qts) { p.Qes = 1 / (1 / p.Qts - 1 / p.Qms); calculated.push("Qes"); calc.push(`Qes calculated from Qts and Qms (1/Qts = 1/Qes + 1/Qms): ${r4(p.Qes)}`); }
    if (!p.Qms && p.Qts && p.Qes && p.Qes > p.Qts) { p.Qms = 1 / (1 / p.Qts - 1 / p.Qes); calculated.push("Qms"); calc.push(`Qms calculated from Qts and Qes (1/Qts = 1/Qes + 1/Qms): ${r4(p.Qms)}`); }
    if (!p.Sd && p.fs && p.Mms && p.Vas) { const cms = 1 / ((2 * Math.PI * p.fs) ** 2 * p.Mms); p.Sd = Math.sqrt(p.Vas / (RC2 * cms)); calculated.push("Sd"); calc.push(`Sd calculated from fs, Mms and Vas (not published): ${r4(p.Sd * 1e4)} cm2`); }
    const mms = p.Mms ?? (p.fs && p.Vas && p.Sd ? 1 / ((2 * Math.PI * p.fs) ** 2 * (p.Vas / (RC2 * p.Sd ** 2))) : undefined);
    const mmsWhy = p.Mms ? "Mms" : "Mms from Vas, Sd and fs";
    if (!p.Re && p.Qes && p.Bl && p.fs && mms) { p.Re = (p.Qes * p.Bl ** 2) / (2 * Math.PI * p.fs * mms); calculated.push("Re"); calc.push(`Re calculated from Qes, Bl, fs and ${mmsWhy} (Re = Qes Bl^2 / (2 pi fs Mms)): ${r4(p.Re)} ohm`); }
    if (!p.Qes && p.Re && p.Bl && p.fs && mms) { p.Qes = (2 * Math.PI * p.fs * mms * p.Re) / p.Bl ** 2; calculated.push("Qes"); calc.push(`Qes calculated from Re, Bl, fs and ${mmsWhy} (Qes = 2 pi fs Mms Re / Bl^2): ${r4(p.Qes)}`); }
  }
  if (p.Sd && num(raw.size_in)) {
    const circle = Math.PI * (raw.size_in * 0.0254 / 2) ** 2;
    if (p.Sd < 0.45 * circle || p.Sd > circle) checks.push(`CHECK: Sd ${r4(p.Sd * 1e4)} cm2${calculated.includes("Sd") ? " (calculated)" : ""} is ${Math.round(p.Sd / circle * 100)} % of the area of a ${raw.size_in} in circle (${r4(circle * 1e4)} cm2): one of the maker's values is probably wrong; treat a simulation of this record as unreliable`);
  }
  const need = { fs: "fs", Re: "Re", Qms: "Qms", Qes: "Qes", Sd: "Sd" };
  const missing = Object.keys(need).filter((k) => !p[k]);
  if (!p.Vas && !p.Mms) missing.push("Vas or Mms");
  // published per-wiring sets (Massive Audio, American Bass, ...)
  const wset = {};
  for (const [rk, w] of [["params_series", "series"], ["params_parallel", "parallel"]]) if (raw[rk]) { const s = toSI(raw[rk]); if (Object.keys(s).length) wset[w] = s; }
  // notes
  const rawNotes = (raw.notes || "").trim();
  const flagged = /DATA PROBLEM|CHECK|UNVERIFIED|inconsisten|implausible|out of line|placeholder/i.test(rawNotes) || checks.length > 0;
  const noteParts = [];
  if (rawNotes) noteParts.push((flagged && !/^CHECK/.test(rawNotes) ? "CHECK: " : "") + rawNotes);
  noteParts.push(...checks, ...calc);
  if (missing.length) noteParts.push(`Not enough published data to simulate: missing ${missing.join(", ")} (not guessed).`);
  if (PM_UNRELIABLE[`${file}#${raw.model}`]) noteParts.push(`Not enough published data to simulate: the maker's own values contradict each other; needs ${PM_UNRELIABLE[`${file}#${raw.model}`]} (PM decision 2026-11-22, not guessed).`);
  const sources = (raw.sources || []).map((s) => ({ param: (s.fields || ["*"]).join(", "), source: s.url, where: [s.doc, s.page != null ? `p. ${s.page}` : "", `read ${s.read_date}`, `tier ${s.tier} (${TIER[s.tier] ?? "?"})`].filter(Boolean).join(", "), tier: s.tier, read: s.read_date }));
  const rec = {
    id: "lib-hpsubs-" + slug(brand + "-" + raw.model), brand, model: raw.model, library: "hp-car-subs",
    maker: brandFile.brand, country: brandFile.country, sizeIn: num(raw.size_in),
    coil: coilWord(raw), coils: raw.coils ?? undefined, ohmsPerCoil: opc, rmsW: num(raw.rms_w), peakW: num(raw.peak_w), rmsRange: raw.rms_range_w ?? undefined,
    finalLoads: raw.final_loads_ohm ?? [], tsBasis: raw.ts_basis || "unknown", status: raw.status || "unknown",
    params: p, paramsSeries: wset.series, paramsParallel: wset.parallel,
    sens2v83: num(raw.params?.spl_db_2v83), recommendedBoxes: raw.recommended_boxes ?? [],
    calculated: [...new Set(calculated)], printed: Object.keys(printed).length ? printed : undefined,
    checks: [...(flagged && rawNotes ? ["CHECK: maker data problem noted by the research (see notes)"] : []), ...checks],
    incomplete: missing.length || PM_UNRELIABLE[`${file}#${raw.model}`] ? true : undefined,
    missing: missing.length || PM_UNRELIABLE[`${file}#${raw.model}`] ? [...missing, ...(PM_UNRELIABLE[`${file}#${raw.model}`] ? [PM_UNRELIABLE[`${file}#${raw.model}`]] : [])] : undefined,
    sources, rawRef: `${file}#${raw.model}`, notes: noteParts.join(" | "),
  };
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
  return rec;
}

buildBundle(undefined, path.join(DATA, "drivers", "library", "hp-car-subs.json"));
if (fs.existsSync(PRAW)) buildBundle(PRAW, path.join(DATA, "private", "drivers", "library", "hp-car-subs.json"));

function buildBundle(privRaw, OUT) {
const valueCount = (r) => Object.keys(r.params).length + Object.keys(r.paramsSeries ?? {}).length + Object.keys(r.paramsParallel ?? {}).length;
const byKey = new Map(); const listed = []; const merged = []; const perBrand = {};
for (const region of ["us", "world"]) {
  for (const { name: f, file } of overlayFiles(path.join(RAW, region), privRaw && path.join(privRaw, region))) {
    const bf = JSON.parse(fs.readFileSync(file, "utf8"));
    const rel = `${region}/${f}`;
    for (const raw of bf.drivers || []) {
      const rec = build(raw, rel, bf);
      const key = slug(rec.brand) + "|" + slug(rec.model) + "|" + (rec.coil ?? "") + (rec.ohmsPerCoil ?? "");
      const old = byKey.get(key);
      if (!old) { byKey.set(key, rec); continue; }
      const [keep, drop] = valueCount(rec) > valueCount(old) ? [rec, old] : [old, rec];
      keep.sources.push(...drop.sources.filter((s) => !keep.sources.some((k) => k.source === s.source && k.param === s.param)));
      keep.notes += ` | Also recorded in ${drop.rawRef}; the record with more values is kept, sources merged.`;
      byKey.set(key, keep); merged.push(`${keep.brand} ${keep.model}: kept ${keep.rawRef}, merged ${drop.rawRef}`);
    }
    for (const x of bf.no_ts_published || []) listed.push({ brand: shortBrand(bf.brand), model: x.model, rms: x.rms_w ?? null, url: x.url ?? null, note: x.note ?? "", rawRef: rel });
  }
}
// ids must be unique: add the coil impedance if two records slug the same
const drivers = [...byKey.values()];
const idCount = {}; for (const d of drivers) idCount[d.id] = (idCount[d.id] || 0) + 1;
for (const d of drivers) if (idCount[d.id] > 1) d.id = `${d.id}-${d.coil ?? ""}${d.ohmsPerCoil ?? ""}`.toLowerCase().replace(/\./g, "-");
// cross-reference the BuildBass bundle (Bomber, Triton, Eros): kept in both bundles, nothing deleted there
const bbFile = path.join(DATA, "drivers", "library", "buildbass.json");
const alsoIn = [];
if (fs.existsSync(bbFile)) {
  const bb = JSON.parse(fs.readFileSync(bbFile, "utf8")).drivers;
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9.]+/g, " ");
  for (const d of drivers) {
    const toks = norm(d.model.replace(/\(.*?\)/g, "")).split(" ").filter((t) => t && !/^(woofer|subwoofer|ohms?|version|\d{1,2})$/.test(t));
    const size = d.sizeIn ? String(d.sizeIn) : "";
    const first = (x) => norm(x).trim().split(" ")[0];
    const ohm = d.coils === 2 ? `${d.ohmsPerCoil}+${d.ohmsPerCoil} ` : `${d.ohmsPerCoil} `;
    const hit = bb.filter((b) => first(b.brand) === first(d.brand) && toks.length && toks.every((t) => norm(b.model).split(" ").includes(t)) && (!size || norm(b.model).includes(size)) && (b.model.replace(/\s+/g, " ") + " ").includes(ohm.replace("+", "+")) );
    if (hit.length === 1) { d.alsoIn = hit[0].id; d.notes += ` | The same model is also in the BuildBass library (${hit[0].id}); both kept.`; alsoIn.push(`${d.brand} ${d.model} = ${hit[0].id}`); }
  }
}
drivers.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
listed.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
const bundle = {
  source: "hp-car-subs", title: "Audio_Builder high-power car subwoofer database", licence: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Audio_Builder high-power car subwoofer database (CC BY 4.0); every value credited to its manufacturer source in each entry",
  method: "Subwoofers rated 2000 W RMS or more whose coils give a final load of 2, 1 or 0.5 ohm (a few with other coil impedances kept with their real loads). Values read from the maker's own spec sheets, manuals and product pages first (tier 1), then the maker's authorised distributor (tier 2) or a named independent measurement (tier 3); never forums or other databases. Research: references/research_e_hp_subs_us.md and references/research_e_hp_subs_world.md (2026-11-21/22).",
  corrections: "Corrections go in data/hp_subs_raw/<us|world>/<brand>.json (with the source URL, document, page and date read); then run node scripts/import_hp_subs.mjs.",
  imported: today, count: drivers.length, drivers, listed_without_specs: listed,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 1));
for (const d of drivers) { const b = (perBrand[d.brand] ??= { total: 0, sim: 0, incomplete: 0, listed: 0 }); b.total++; d.incomplete ? b.incomplete++ : b.sim++; }
for (const x of listed) (perBrand[x.brand] ??= { total: 0, sim: 0, incomplete: 0, listed: 0 }).listed++;
const sim = drivers.filter((d) => !d.incomplete).length;
console.log(`hp-car-subs: ${drivers.length} records (${sim} simulatable, ${drivers.length - sim} incomplete), ${listed.length} listed without specs -> ${path.relative(ROOT, OUT)}`);
console.log("per brand (records / simulatable / incomplete / listed without specs):");
for (const [b, c] of Object.entries(perBrand).sort()) console.log(`  ${b}: ${c.total} / ${c.sim} / ${c.incomplete} / ${c.listed}`);
console.log(`Sd recalculated (PM rule): ${drivers.filter((d) => d.printed?.Sd).map((d) => d.brand + " " + d.model).join("; ")}`);
if (merged.length) console.log("merged duplicates:\n  " + merged.join("\n  "));
console.log(`also in BuildBass (${alsoIn.length}):\n  ` + alsoIn.join("\n  "));
}
