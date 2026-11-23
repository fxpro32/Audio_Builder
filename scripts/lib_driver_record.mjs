// Shared record builder for the car driver importers (B3_PARTS_DB, 2026-11-23): scripts/import_car_subs.mjs and
// scripts/import_car_drivers.mjs. Same rules as scripts/import_hp_subs.mjs (A4_HPDB, signed off docs/signoff_A4_hpdb.md),
// which is left unchanged:
// - values are the maker's, converted to SI only; a value is derived only by a standard identity and then listed in
//   `calculated` and in the notes:  1/Qts = 1/Qes + 1/Qms;  Cms = Vas/(rho c^2 Sd^2) = 1/((2 pi fs)^2 Mms);  Qes = 2 pi fs Mms Re / Bl^2.
//   rho 1.204 kg/m^3, c 343.2 m/s. Sd is never taken from the nominal size.
// - a record without fs, Re, Qms, Qes, Sd and one of Vas/Mms is kept with incomplete: true and the list of missing values.
// - maker data problems: raw notes copied, prefixed "CHECK: " when flagged; the same sanity checks as the research scripts.
// - B3 addition: a record whose completed values fall outside the plausibility ranges of app/tests/library.test.ts
//   (fs 5-2000 Hz, Qts 0.05-3, Sd 1-5000 cm2, Re 0.1-50 ohm) is kept with incomplete: true (values shown, not simulated).
export const RHO = 1.204, C = 343.2, RC2 = RHO * C * C;
export const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
export const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
export const r4 = (x) => +x.toPrecision(4);
export const shortBrand = (b) => String(b).replace(/\s*\(.*\)\s*$/, "").trim();
const TIER = { 1: "manufacturer", 2: "manufacturer's authorised distributor", 3: "independent measurement" };
const PMAP = { fs_hz: ["fs", 1], re_ohm: ["Re", 1], qms: ["Qms", 1], qes: ["Qes", 1], qts: ["Qts", 1], vas_l: ["Vas", 1e-3], sd_cm2: ["Sd", 1e-4],
  xmax_mm: ["Xmax", 1e-3], mms_g: ["Mms", 1e-3], bl_tm: ["Bl", 1], le_mh: ["Le", 1e-3], spl_db_1w1m: ["sens1W", 1] };
export const toSI = (raw) => { const p = {}; for (const [k, [K, f]] of Object.entries(PMAP)) { const v = num(raw?.[k]); if (v !== undefined) p[K] = v * f; } return p; };
const coilWord = (r) => r.coil ?? (r.coils === 1 ? "SVC" : r.coils === 2 ? "DVC" : r.coils === 4 ? "QVC" : undefined);
const coilCount = (r) => r.coils ?? (r.coil === "SVC" ? 1 : r.coil === "DVC" ? 2 : r.coil === "QVC" ? 4 : undefined);
/** Latest read_date in a list of source rows (deterministic "imported" date). */
export const latestRead = (rows) => rows.reduce((m, s) => (typeof s?.read_date === "string" && s.read_date > m ? s.read_date : m), "");

/**
 * One raw record (data/hp_subs_raw, data/car_subs_raw or data/car_drivers_raw format) -> app Driver record.
 * opts: { idPrefix, library, type, unreliable?: string (PM reason), sdRecalc?: boolean, ohmsKey?: "ohms_per_coil" | "impedance_ohm" }
 */
export function buildDriverRecord(raw, file, brandFile, opts) {
  const brand = shortBrand(brandFile.brand);
  const p = toSI(raw.params);
  const calculated = [], calc = [], checks = [], printed = {};
  if (num(raw.rms_w)) p.Pe = raw.rms_w;
  if (num(raw.mounting_depth_mm)) p.depth = raw.mounting_depth_mm / 1000;
  if (num(raw.cutout_mm)) p.cutout = raw.cutout_mm / 1000;
  if (num(raw.displacement_l)) p.displacement = raw.displacement_l / 1000;
  if (num(raw.frame_mm)) p.dia = raw.frame_mm / 1000;
  else if (num(raw.size_in)) { p.dia = raw.size_in * 0.0254; calculated.push("dia"); calc.push(`dia calculated: nominal size ${raw.size_in} in x 25.4 mm (not a measured outer diameter; used for the 3D view only)`); }
  const n = coilCount(raw);
  const opc = num(raw.ohms_per_coil) ?? num(raw.impedance_ohm);
  if (opc && n) {
    if (raw.ohms_per_coil === undefined && n === 1) p.Znom = opc; // car drivers: the maker's nominal impedance, published
    else {
      const z = raw.ts_basis === "series" ? opc * n : raw.ts_basis === "parallel" ? opc / n : raw.ts_basis === "per_coil" || n === 1 ? opc : undefined;
      if (z) { p.Znom = z; calculated.push("Znom"); calc.push(`Znom calculated: ${opc} ohm per coil, ${n} coil(s), T/S basis ${raw.ts_basis}`); }
    }
  }
  if (p.Qts && p.Qes && p.Qms) { const q = (p.Qes * p.Qms) / (p.Qes + p.Qms); if (Math.abs(q / p.Qts - 1) > 0.1) checks.push(`CHECK: printed Qts ${p.Qts} vs ${r4(q)} from the printed Qes and Qms`); }
  if (p.fs && p.Vas && p.Mms && p.Sd) {
    const cms = p.Vas / (RC2 * p.Sd ** 2), fsc = 1 / (2 * Math.PI * Math.sqrt(p.Mms * cms));
    if (Math.abs(fsc / p.fs - 1) > 0.2) checks.push(`CHECK: printed fs ${p.fs} Hz vs ${r4(fsc)} Hz from the printed Vas, Mms and Sd (one of them is off by ${Math.round(Math.abs(fsc / p.fs - 1) * 100)} %)`);
  }
  if (opts.sdRecalc && p.Sd && p.fs && p.Mms && p.Vas) {
    printed.Sd = p.Sd;
    const cms = 1 / ((2 * Math.PI * p.fs) ** 2 * p.Mms);
    p.Sd = Math.sqrt(p.Vas / (RC2 * cms));
    calculated.push("Sd");
    calc.push(`Sd calculated from fs, Mms and Vas (Cms = 1/((2 pi fs)^2 Mms), Sd = sqrt(Vas/(rho c^2 Cms)), rho 1.204, c 343.2): ${r4(p.Sd * 1e4)} cm2 used for simulation; printed Sd ${r4(printed.Sd * 1e4)} cm2 contradicts the maker's own fs, Mms and Vas (PM decision 2026-11-22)`);
  }
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
  const missing = ["fs", "Re", "Qms", "Qes", "Sd"].filter((k) => !p[k]);
  if (!p.Vas && !p.Mms) missing.push("Vas or Mms");
  // plausibility (B3): the ranges app/tests/library.test.ts checks for every simulatable library record
  let implausible;
  if (!missing.length) {
    const w = 2 * Math.PI * p.fs; const cms = p.Vas ? p.Vas / (RC2 * p.Sd ** 2) : 1 / (w * w * p.Mms); const vas = RC2 * p.Sd ** 2 * cms; const qts = (p.Qes * p.Qms) / (p.Qes + p.Qms);
    const bad = [];
    if (!(p.fs > 5 && p.fs < 2000)) bad.push(`fs ${r4(p.fs)} Hz`);
    if (!(qts > 0.05 && qts < 3)) bad.push(`Qts ${r4(qts)}`);
    if (!(p.Sd > 1e-4 && p.Sd < 0.5)) bad.push(`Sd ${r4(p.Sd * 1e4)} cm2`);
    if (!(p.Re > 0.1 && p.Re < 50)) bad.push(`Re ${r4(p.Re)} ohm`);
    if (!(vas > 0)) bad.push("Vas");
    if (bad.length) implausible = `values a simulation can trust (out of the plausible range: ${bad.join(", ")})`;
  }
  const unreliable = opts.unreliable ?? implausible;
  const wset = {};
  for (const [rk, w] of [["params_series", "series"], ["params_parallel", "parallel"]]) if (raw[rk]) { const s = toSI(raw[rk]); if (Object.keys(s).length) wset[w] = s; }
  const rawNotes = String(raw.notes || "").trim();
  const flagged = /DATA PROBLEM|CHECK|UNVERIFIED|inconsisten|implausible|out of line|placeholder/i.test(rawNotes) || checks.length > 0;
  const noteParts = [];
  if (rawNotes) noteParts.push((flagged && !/^CHECK/.test(rawNotes) ? "CHECK: " : "") + rawNotes);
  noteParts.push(...checks, ...calc);
  if (missing.length) noteParts.push(`Not enough published data to simulate: missing ${missing.join(", ")} (not guessed).`);
  if (!missing.length && unreliable) noteParts.push(`Not enough published data to simulate: the maker's values need ${unreliable} (${opts.unreliable ? "PM decision 2026-11-22" : "B3 plausibility check"}, not guessed).`);
  const sources = (raw.sources || []).map((s) => ({ param: (s.fields || ["*"]).join(", "), source: s.url, where: [s.doc, s.page != null ? `p. ${s.page}` : "", `read ${s.read_date}`, `tier ${s.tier} (${TIER[s.tier] ?? "?"})`].filter(Boolean).join(", "), tier: s.tier, read: s.read_date }));
  const incomplete = missing.length > 0 || !!unreliable;
  const rec = {
    id: opts.idPrefix + slug(brand + "-" + raw.model), brand, model: stripBrandPrefix(raw.model, brand), library: opts.library, type: opts.type ?? raw.type,
    maker: brandFile.brand, country: brandFile.country, sizeIn: num(raw.size_in), sizeLabel: raw.size_label ?? undefined,
    coil: coilWord(raw), coils: n, ohmsPerCoil: opc, rmsW: num(raw.rms_w), peakW: num(raw.peak_w), rmsRange: raw.rms_range_w ?? undefined,
    finalLoads: raw.final_loads_ohm ?? (opts.type === "subwoofer" ? [] : undefined), tsBasis: raw.ts_basis || "unknown", status: raw.status || "unknown",
    params: p, paramsSeries: wset.series, paramsParallel: wset.parallel,
    sens2v83: num(raw.params?.spl_db_2v83), recommendedBoxes: raw.recommended_boxes ?? (opts.type === "subwoofer" ? [] : undefined),
    calculated: [...new Set(calculated)], printed: Object.keys(printed).length ? printed : undefined,
    checks: [...(flagged && rawNotes ? ["CHECK: maker data problem noted by the research (see notes)"] : []), ...checks],
    incomplete: incomplete ? true : undefined,
    missing: incomplete ? [...missing, ...(!missing.length && unreliable ? [unreliable] : [])] : undefined,
    sources, rawRef: `${file}#${raw.model}`, notes: noteParts.join(" | "),
  };
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
  return rec;
}
export const valueCount = (r) => Object.keys(r.params).length + Object.keys(r.paramsSeries ?? {}).length + Object.keys(r.paramsParallel ?? {}).length;

/** PM 2026-11-23: some makers repeat the brand in the model name ("Alpine BRVS40", "GLADEN GS08-Slim"); the brand is shown
 * in its own column, so the display model drops it. The id still uses the raw model, so ids do not change. */
export function stripBrandPrefix(model, brand) {
  const m = String(model ?? ""), b = String(brand ?? "").trim();
  if (!b) return m;
  const re = new RegExp("^" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i");
  const out = m.replace(re, "");
  return out.trim() ? out : m;
}
