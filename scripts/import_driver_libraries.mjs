// Builds the bundled driver libraries from openly licensed sources (R15/R16, 2026-11-21).
// Input (downloaded raw, gitignored): data/source_dbs/… and references/raw/qspeakers_driver_db.xml
// Output: data/drivers/library/<source>.json = { source, licence, attribution, url, imported, drivers: Driver[] }
// Only records with everything the model needs (fs, Re, Qms, Qes, Sd, and Vas or Cms or Mms) are kept; Qes or Qms may be derived
// from Qts (1/Qts = 1/Qes + 1/Qms) and Sd from the nominal diameter is NOT guessed (record skipped).
// Units out: SI (Vas m³, Sd m², Xmax m, Mms kg, Le H, dia m), as app/src/engine/driver.ts expects.
// Run: node scripts/import_driver_libraries.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "drivers", "library");
fs.mkdirSync(OUT, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

/** Fill Qes/Qms/Qts from the other two; return null if the model cannot run. Notes collect every derivation. */
function finish(rec, notes) {
  const p = rec.params;
  if (!p.Qes && p.Qts && p.Qms && p.Qms > p.Qts) { p.Qes = 1 / (1 / p.Qts - 1 / p.Qms); notes.push("Qes calculated from Qts and Qms"); }
  if (!p.Qms && p.Qts && p.Qes && p.Qes > p.Qts) { p.Qms = 1 / (1 / p.Qts - 1 / p.Qes); notes.push("Qms calculated from Qts and Qes"); }
  if (!(p.fs && p.Re && p.Qms && p.Qes && p.Sd && (p.Vas || p.Cms || p.Mms))) return null;
  // Reject physically impossible cone areas (e.g. a 12" listed with Sd 0.5 m² = 5000 cm², a units slip): Sd must fit inside the frame.
  if (p.Sd >= 0.5 || (p.dia && p.Sd > Math.PI * (p.dia / 2) ** 2 * 1.02)) { rejected.push(`${rec.brand} ${rec.model}: Sd ${p.Sd} m² larger than the driver`); return null; }
  // Vas vs Mms: both fix the suspension compliance (Cms = Vas/(rho c² Sd²) = 1/((2π fs)² Mms)); flag if they disagree by more than 25 %.
  if (p.Vas && p.Mms) { const cV = p.Vas / (1.204 * 343.2 ** 2 * p.Sd ** 2), cM = 1 / ((2 * Math.PI * p.fs) ** 2 * p.Mms); if (Math.abs(cV / cM - 1) > 0.25) notes.push(`CHECK: Vas and Mms disagree (${((cV / cM - 1) * 100).toFixed(0)} % in Cms); the model uses Vas`); }
  const qtsCalc = (p.Qes * p.Qms) / (p.Qes + p.Qms);
  if (p.Qts && Math.abs(qtsCalc - p.Qts) / p.Qts > 0.1) notes.push(`CHECK: printed Qts ${p.Qts} vs ${qtsCalc.toFixed(3)} from Qes/Qms`);
  if (!p.Qts) p.Qts = qtsCalc;
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  rec.notes = notes.join("; ");
  return rec;
}
function write(name, meta, drivers) {
  const seen = new Set();
  const uniq = drivers.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  uniq.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
  fs.writeFileSync(path.join(OUT, name + ".json"), JSON.stringify({ ...meta, imported: today, count: uniq.length, drivers: uniq }, null, 1));
  return uniq.length;
}
const report = [];
const rejected = [];

// 1. QSpeakers (GPL-3.0, same licence as this app). Units: vas L, xmax mm, sd m², dia m.
{
  const xml = fs.readFileSync(path.join(ROOT, "references", "raw", "qspeakers_driver_db.xml"), "utf8");
  const rows = [...xml.matchAll(/<speaker\s+([^>]*?)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
  const out = [];
  for (const r of rows) {
    const notes = [];
    const rec = { id: "lib-qspeakers-" + slug(r.vendor + "-" + r.model), brand: r.vendor, model: r.model, library: "qspeakers",
      params: { fs: num(r.fs), Re: num(r.re), Qms: num(r.qms), Qes: num(r.qes), Qts: num(r.qts), Vas: num(r.vas) && num(r.vas) / 1000, Sd: num(r.sd),
        Xmax: num(r.xmax) && num(r.xmax) / 1000, Pe: num(r.pe), Znom: num(r.z), sens1W: num(r.spl), dia: num(r.dia), Bl: num(r.bl), Le: num(r.le) && num(r.le) / 1000 },
      sources: [{ param: "*", source: "QSpeakers driver database (GPL-3.0), https://github.com/be1/qspeakers", where: "references/raw/qspeakers_driver_db.xml" }] };
    if (finish(rec, notes)) out.push(rec);
  }
  report.push(`qspeakers: ${rows.length} rows, ${write("qspeakers", { source: "QSpeakers driver database", licence: "GPL-3.0", url: "https://github.com/be1/qspeakers", attribution: "Driver data from QSpeakers (https://github.com/be1/qspeakers), GPL-3.0." }, out)} kept`);
}

// 2. driver-base (data CC BY 4.0). Units: vas L, sd cm², xmax mm, mms g, le mH, sizes mm.
{
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "source_dbs", "driver-base", "drivers.json"), "utf8")).drivers;
  const KEEP = new Set(["lf_woofer", "guitar_bass", "fullrange", "coax"]);
  const out = [];
  for (const r of all) {
    if (!KEEP.has(r.driver_kind)) continue;
    const notes = [];
    if (r.warn_flags?.length) notes.push("driver-base warnings: " + r.warn_flags.join(", "));
    if (r.driver_kind === "coax") notes.push("coaxial: values are the woofer section");
    const rec = { id: "lib-driverbase-" + slug(r.canonical_id), brand: r.manufacturer, model: r.model + (r.impedance_nominal_ohm ? ` (${r.impedance_nominal_ohm} Ω)` : ""), library: "driver-base",
      params: { fs: num(r.fs_hz), Re: num(r.re_ohm), Qms: num(r.qms), Qes: num(r.qes), Qts: num(r.qts), Vas: num(r.vas_liters) && num(r.vas_liters) / 1000,
        Sd: num(r.sd_cm2) && num(r.sd_cm2) / 1e4, Xmax: num(r.xmax_mm) && num(r.xmax_mm) / 1000, Mms: num(r.mms_g) && num(r.mms_g) / 1000, Bl: num(r.bl_tm),
        Le: num(r.le_mh) && num(r.le_mh) / 1000, Pe: num(r.power_aes_watts) ?? num(r.power_long_term_watts), Znom: num(r.impedance_nominal_ohm), sens1W: num(r.sensitivity_db_1w_1m),
        dia: num(r.overall_diameter_mm) && num(r.overall_diameter_mm) / 1000, depth: num(r.depth_mm) && num(r.depth_mm) / 1000 },
      sources: [{ param: "*", source: "driver-base (CC BY 4.0), https://github.com/JonathanDCohen/driver-base", where: (r.source_urls || []).join(" ") }] };
    if (finish(rec, notes)) out.push(rec);
  }
  report.push(`driver-base: ${all.length} records, ${write("driver-base", { source: "driver-base", licence: "CC BY 4.0", url: "https://github.com/JonathanDCohen/driver-base", attribution: "Data from driver-base (https://github.com/JonathanDCohen/driver-base), licensed under CC BY 4.0." }, out)} kept`);
}

// 3. BuildBass seed data (repo MIT). Car subwoofers, Brazilian brands, each with the maker's manual as source. Units: vas L, sd cm², xmax mm, mms g, le mH.
{
  const dir = path.join(ROOT, "data", "source_dbs", "buildbass", "repo", "api", "database", "seeders", "data", "drivers");
  const out = []; let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const r of d.drivers) {
      n++;
      const notes = [];
      const z = /([\d.]+)\s*Ω/.exec(r.variant || "");
      const rec = { id: "lib-buildbass-" + slug(d.brand + "-" + r.model + "-" + (r.variant || "")), brand: d.brand, model: `${r.model}${r.variant ? " " + r.variant : ""}`, library: "buildbass",
        params: { fs: num(r.fs_hz), Re: num(r.re_ohm), Qms: num(r.qms), Qes: num(r.qes), Qts: num(r.qts), Vas: num(r.vas_l) && num(r.vas_l) / 1000, Sd: num(r.sd_cm2) && num(r.sd_cm2) / 1e4,
          Xmax: num(r.xmax_mm) && num(r.xmax_mm) / 1000, Mms: num(r.mms_g) && num(r.mms_g) / 1000, Bl: num(r.bl_tm), Le: num(r.le_mh) && num(r.le_mh) / 1000, Pe: num(r.pe_w),
          Znom: z ? num(z[1]) : undefined, dia: num(r.diameter_in) && num(r.diameter_in) * 0.0254 },
        sources: [{ param: "*", source: "BuildBass driver catalogue (MIT), https://github.com/guilhermemcr1/BuildBass; original: " + (r.source || "?"), where: r.source_url || "" }] };
      if (finish(rec, notes)) out.push(rec);
    }
  }
  report.push(`buildbass: ${n} records, ${write("buildbass", { source: "BuildBass driver catalogue", licence: "MIT", url: "https://github.com/guilhermemcr1/BuildBass", attribution: "Car subwoofer data from BuildBass (https://github.com/guilhermemcr1/BuildBass), MIT licence; each entry cites the manufacturer's manual." }, out)} kept`);
}
console.log(report.join("\n"));
if (rejected.length) console.log("rejected as impossible:\n  " + rejected.join("\n  "));
