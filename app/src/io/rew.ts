// Room EQ Wizard (REW) text exports and the common FRD / ZMA formats: parse, detect impedance vs response, write.
// Format sources (fetched 2026-11-22, copies in references/raw/rew_help/):
// - REW help, File menu, "Export measurement as text": "Comment lines start with *, data lines begin with the frequency,
//   then the SPL in dB and finally the phase in degrees (0.0 if the measurement does not have phase information)".
//   The delimiter is selectable and "Use computer's number format" may give a decimal comma.
//   https://www.roomeqwizard.com/help/help_en-GB/html/file.html
// - REW help, "Importing Measurement Data": comma, TAB, space or semicolon delimited; freq, magnitude (SPL or impedance),
//   optional phase in degrees; only lines that begin with a number are data; each line a higher frequency than the one before;
//   at least 5 data lines; ".zma" is always impedance; the impedance sample header shows "* Freq(Hz) Z(Ohms) Phase(degrees)"
//   and "* Sense Resistor: ...". https://www.roomeqwizard.com/help/help_en-GB/html/dataimport.html

export type MeasKind = "impedance" | "response";
export interface ParsedMeasurement {
  kind: MeasKind | "unknown";      // best guess; "unknown" = the user must say
  detectedBy: string;              // why this kind was chosen (shown to the user)
  f: number[]; mag: number[]; phase?: number[]; // Hz; ohms or dB; degrees
  unit: "ohm" | "dB" | "";
  header: Record<string, string>;  // "Measurement", "Dated", "Sense Resistor", "Note", "Source", ...
  comments: string[];
  warnings: string[];
  format: "REW text" | "FRD" | "ZMA" | "generic text";
}

export class MeasurementParseError extends Error {}
const fail = (msg: string): never => { throw new MeasurementParseError(msg); };

const NUM = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/;

/** Parse one file. `kindHint` (from the user or the import button) overrides detection. */
export function parseMeasurement(text: string, fileName = "", kindHint?: MeasKind): ParsedMeasurement {
  if (typeof text !== "string" || !text.trim()) fail("The file is empty.");
  // binary check: NUL or many control characters means this is not a text export (e.g. an .mdat or a .wav)
  const sample = text.slice(0, 4000);
  const ctrl = (sample.match(/[\x00-\x08\x0e-\x1f]/g) ?? []).length;
  if (sample.includes("\x00") || ctrl > sample.length * 0.01) fail("This is not a text file (it looks binary). In REW use File → Export → Export measurement as text (.txt), not the .mdat file.");
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const header: Record<string, string> = {}; const comments: string[] = []; const warnings: string[] = [];
  const rows: string[][] = []; let decimalComma = false; let sawStar = false;
  // Decimal comma ("Use computer's number format" in a comma locale): no dots anywhere in the data and digits joined by a comma.
  // REW's own rule makes this safe: a comma used as a separator must be followed by at least one space.
  const dataLines = lines.filter((l) => /^\s*[-+]?[\d.,]/.test(l));
  decimalComma = dataLines.length > 0 && !dataLines.some((l) => l.includes(".")) && dataLines.some((l) => /\d,\d/.test(l));
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[*#%;!]|^\/\//.test(line)) {
      if (line.startsWith("*")) sawStar = true;
      const body = line.replace(/^[*#%;!/]+\s*/, "");
      comments.push(body);
      const m = body.match(/^([A-Za-z][A-Za-z ()/]*?)\s*:\s*(.*)$/);
      if (m && !(m[1] in header)) header[m[1].trim()] = m[2].trim();
      continue;
    }
    if (!/^[-+]?[\d.,]/.test(line)) { comments.push(line); const m = line.match(/^([A-Za-z][A-Za-z ()/]*?)\s*:\s*(.*)$/); if (m && !(m[1] in header)) header[m[1].trim()] = m[2].trim(); continue; }
    const toks = (decimalComma ? line.replace(/(\d),(\d)/g, "$1.$2") : line).split(/[\t;]+|,\s*|\s+/);
    const nums: string[] = [];
    for (const t of toks) { if (!t) continue; if (NUM.test(t)) nums.push(t); else break; } // text after the values = a comment (REW allows it)
    rows.push(nums);
  }
  if (!rows.length) fail("No data lines found: a measurement file needs lines that start with a frequency, e.g. \"20.000 85.3 -12.1\".");
  const cols = Math.min(...rows.map((r) => r.length));
  if (cols < 2) fail("Each data line needs at least two numbers (frequency and value). Found a line with only one: is this an impulse response or a single-column file? Export the frequency response or impedance as text instead.");
  const f: number[] = [], mag: number[] = [], ph: number[] = [];
  for (const r of rows) { f.push(parseFloat(r[0])); mag.push(parseFloat(r[1])); if (cols >= 3) ph.push(parseFloat(r[2])); }
  if (f.length < 5) fail(`Only ${f.length} data lines: REW needs at least 5 and a useful sweep has hundreds.`);
  if (f.some((x) => !isFinite(x)) || mag.some((x) => !isFinite(x))) fail("Some values are not numbers.");
  if (f.some((x) => x <= 0)) fail("Frequencies must be above 0 Hz. Is the first column really frequency?");
  for (let i = 1; i < f.length; i++) if (!(f[i] > f[i - 1])) fail(`Frequencies must increase line by line (REW's rule); line ${i + 1} has ${f[i]} Hz after ${f[i - 1]} Hz. Is this file sorted, or are the columns in a different order?`);
  let phase: number[] | undefined = cols >= 3 ? ph : undefined;
  if (phase && phase.some((x) => !isFinite(x))) phase = undefined;
  if (phase && phase.some((x) => Math.abs(x) > 3600)) { warnings.push("The third column is not a phase in degrees (values beyond ±3600): ignored."); phase = undefined; }
  if (phase && phase.every((x) => x === 0)) { phase = undefined; warnings.push("The phase column is all 0.0 (REW writes that when the measurement has no phase): phase ignored."); }

  // ---- what is it? ----
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const htext = comments.join("\n");
  let kind: MeasKind | "unknown" = "unknown"; let detectedBy = "";
  const pos = mag.every((v) => v > 0);
  if (kindHint) { kind = kindHint; detectedBy = "chosen by you"; }
  else if (ext === "zma") { kind = "impedance"; detectedBy = ".zma file (always impedance, as in REW)"; }
  else if (/Z\s*\(\s*ohms?\s*\)|impedance|sense resistor|\bohms?\b|Ω/i.test(htext)) { kind = "impedance"; detectedBy = "header mentions impedance / ohms"; }
  else if (/\bSPL\b|dB\s*(SPL|FS|V|u)?\b|\bdB\b/i.test(htext)) { kind = "response"; detectedBy = "header mentions SPL / dB"; }
  else if (ext === "frd") { kind = "response"; detectedBy = ".frd file (frequency response)"; }
  else {
    // value range: speaker impedance is positive with a sharp peak several times its minimum; SPL is often 40-130 dB or negative (relative)
    const s = mag.slice().sort((a, b) => a - b); const med = s[s.length >> 1]; const min = s[0], max = s[s.length - 1];
    if (!pos) { kind = "response"; detectedBy = "values below 0 (dB), so a response"; }
    else if (med > 40 && max - min < 80) { kind = "response"; detectedBy = `values ${min.toFixed(1)}..${max.toFixed(1)} look like dB SPL`; }
    else if (min > 0.5 && med < 40 && max / min > 1.8) { kind = "impedance"; detectedBy = `values ${min.toFixed(2)}..${max.toFixed(1)} with a peak ${(max / min).toFixed(1)}× the minimum look like ohms`; }
    else detectedBy = "could not tell impedance from response: please choose";
  }
  if (kind === "impedance") {
    if (!pos) fail("Impedance values must be above 0 Ω. This file has 0 or negative values: is it a frequency response (dB)? Import it as a response.");
    const max = Math.max(...mag), min = Math.min(...mag);
    if (min > 300) warnings.push(`Lowest impedance is ${min.toFixed(0)} Ω: a speaker is usually 1-16 Ω. Were the REW input channels swapped, or the leads open?`);
    if (max > 2000) warnings.push(`Highest impedance ${max.toFixed(0)} Ω is very high for a speaker: check the jig (open lead?).`);
  }
  if (kind === "response" && pos && Math.max(...mag) < 20 && Math.min(...mag) > 0.5 && !kindHint) warnings.push("These values look more like ohms than dB: if this is an impedance sweep, import it as impedance.");
  const format: ParsedMeasurement["format"] = ext === "zma" ? "ZMA" : ext === "frd" ? "FRD" : sawStar && /REW/i.test(htext) ? "REW text" : "generic text";
  return { kind, detectedBy, f, mag, phase, unit: kind === "impedance" ? "ohm" : kind === "response" ? "dB" : "", header, comments, warnings, format };
}

const fmtN = (v: number, d = 3) => v.toFixed(d);
/** REW-style text export (as in REW's help sample): "*" header, then freq, value, phase. */
export function writeRewText(kind: MeasKind, f: number[], mag: number[], phase?: number[], meta: { measurement?: string; note?: string; senseR?: number; dated?: string } = {}): string {
  const h = [`* Measurement data saved by REW-compatible writer (Audio_Builder synthetic file)`, `* Dated: ${meta.dated ?? "22-Nov-2026 00:00:00"}`];
  if (kind === "impedance") h.push(`* Sense Resistor: ${(meta.senseR ?? 100).toFixed(1)}`);
  if (meta.note) h.push(`* Note: ${meta.note}`);
  h.push(`* Measurement: ${meta.measurement ?? "synthetic"}`, "*", kind === "impedance" ? "* Freq(Hz) Z(Ohms) Phase(degrees)" : "* Freq(Hz) SPL(dB) Phase(degrees)");
  return h.join("\n") + "\n" + f.map((x, i) => `${fmtN(x)} ${fmtN(mag[i])} ${fmtN(phase?.[i] ?? 0)}`).join("\n") + "\n";
}
/** FRD (freq dB phase) or ZMA (freq ohms phase): plain three-column text with an optional "*" comment line. */
export function writeFrdZma(kind: MeasKind, f: number[], mag: number[], phase?: number[]): string {
  return `* ${kind === "impedance" ? "ZMA: Freq(Hz) Z(Ohms) Phase(deg)" : "FRD: Freq(Hz) SPL(dB) Phase(deg)"}\n` + f.map((x, i) => `${fmtN(x, 4)}\t${fmtN(mag[i], 4)}\t${fmtN(phase?.[i] ?? 0, 3)}`).join("\n") + "\n";
}
