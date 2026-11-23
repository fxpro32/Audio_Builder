// High-power car subwoofer library (A4_HPDB): bundle shape, simulatable records, no invented values, final loads,
// dedupe, and dual-voice-coil wiring conversion (engine/coils.ts reusing measure.ts convertWiring).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { complete, Driver } from "../src/engine/driver";
import { finalLoad, finalLoadsFor, hasCoilChoice, inferBasis, paramsForWiring, wiredImpedance } from "../src/engine/coils";
import { simulate, freqs } from "../src/engine/model";

const ROOT = path.resolve(__dirname, "..", "..");
const FILE = path.join(ROOT, "data", "drivers", "library", "hp-car-subs.json");
const bundle = JSON.parse(fs.readFileSync(FILE, "utf8"));
const drivers: Driver[] = bundle.drivers;
const rawCache = new Map<string, any>();
const rawOf = (d: Driver) => {
  const [file, model] = [d.rawRef!.slice(0, d.rawRef!.indexOf("#")), d.rawRef!.slice(d.rawRef!.indexOf("#") + 1)];
  if (!rawCache.has(file)) rawCache.set(file, JSON.parse(fs.readFileSync(path.join(ROOT, "data", "hp_subs_raw", file), "utf8")));
  return rawCache.get(file).drivers.find((r: any) => r.model === model);
};
// independent copy of the unit mapping (raw key, factor to SI)
const MAP: Record<string, [string, number]> = { fs: ["fs_hz", 1], Re: ["re_ohm", 1], Qms: ["qms", 1], Qes: ["qes", 1], Qts: ["qts", 1], Vas: ["vas_l", 1e-3], Sd: ["sd_cm2", 1e-4],
  Xmax: ["xmax_mm", 1e-3], Mms: ["mms_g", 1e-3], Bl: ["bl_tm", 1], Le: ["le_mh", 1e-3], sens1W: ["spl_db_1w1m", 1] };
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

describe("hp-car-subs bundle", () => {
  it("has the library bundle shape, licence and attribution", () => {
    expect(bundle.source).toBe("hp-car-subs");
    expect(bundle.licence).toBe("CC BY 4.0");
    expect(bundle.attribution).toBe("Audio_Builder high-power car subwoofer database (CC BY 4.0); every value credited to its manufacturer source in each entry");
    expect(bundle.url).toMatch(/^https:\/\//);
    expect(bundle.imported).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(bundle.count).toBe(drivers.length);
    expect(Array.isArray(bundle.listed_without_specs)).toBe(true);
    expect(bundle.listed_without_specs.length).toBeGreaterThan(0);
    for (const x of bundle.listed_without_specs) { expect(x.brand).toBeTruthy(); expect(x.model).toBeTruthy(); expect("rms" in x && "url" in x && "note" in x).toBe(true); }
  });
  it("every entry has id, library, coil metadata and at least one maker source", () => {
    const ids = new Set<string>();
    for (const d of drivers) {
      expect(d.id.startsWith("lib-hpsubs-")).toBe(true); expect(ids.has(d.id)).toBe(false); ids.add(d.id);
      expect(d.library).toBe("hp-car-subs");
      expect(["current", "discontinued", "unknown"]).toContain(d.status);
      expect(["per_coil", "series", "parallel", "unknown"]).toContain(d.tsBasis);
      expect(Array.isArray(d.finalLoads)).toBe(true);
      expect(d.sources!.length).toBeGreaterThan(0);
      for (const s of d.sources!) { expect(s.source).toMatch(/^https?:\/\//); expect(s.where).toMatch(/read \d{4}-\d\d-\d\d, tier [123]/); }
      expect(rawOf(d)).toBeTruthy();
    }
  });
  it("every simulatable record completes in the model with plausible values; incomplete ones list what is missing", () => {
    const bad: string[] = [];
    for (const d of drivers) {
      if (d.incomplete) { expect(d.missing!.length).toBeGreaterThan(0); expect(d.notes).toContain("Not enough published data to simulate"); continue; }
      const p = complete(d.params);
      if (!(p.fs > 10 && p.fs < 200 && p.Qts > 0.05 && p.Qts < 3 && p.Vas > 0 && p.Sd > 50e-4 && p.Sd < 0.5 && p.Re > 0.1 && p.Re < 20 && p.Mms > 0.01 && p.Mms < 3)) bad.push(`${d.brand} ${d.model}`);
    }
    expect(bad).toEqual([]);
    expect(drivers.filter((d) => !d.incomplete).length).toBeGreaterThan(250);
  });
  it("no invented values: every value is the raw record's (converted to SI) or is listed and explained as calculated", () => {
    const bad: string[] = [];
    for (const d of drivers) {
      const r = rawOf(d);
      const extra: Record<string, number | undefined> = { Pe: r.rms_w, depth: r.mounting_depth_mm && r.mounting_depth_mm / 1000, cutout: r.cutout_mm && r.cutout_mm / 1000, displacement: r.displacement_l && r.displacement_l / 1000 };
      for (const [k, v] of Object.entries(d.params)) {
        if (v === undefined) continue;
        if (d.calculated?.includes(k)) {
          if (!d.notes!.includes(`${k} calculated`)) bad.push(`${d.model}: ${k} calculated but not explained`);
          const rawV = MAP[k] ? r.params[MAP[k][0]] : undefined;
          // a published value may be replaced only under the PM's Sd rule, and the printed one is then kept
          if (rawV > 0 && !(k === "Sd" && d.printed?.Sd !== undefined && close(d.printed.Sd, rawV * 1e-4))) bad.push(`${d.model}: published ${k} replaced`);
          continue;
        }
        const want = MAP[k] ? r.params[MAP[k][0]] * MAP[k][1] : extra[k];
        if (!(typeof want === "number" && close(v as number, want))) bad.push(`${d.model}: ${k}=${v} not in raw (${want})`);
      }
      for (const [set, rk] of [["paramsSeries", "params_series"], ["paramsParallel", "params_parallel"]] as const) {
        for (const [k, v] of Object.entries(d[set] ?? {})) { const want = r[rk][MAP[k][0]] * MAP[k][1]; if (!close(v as number, want)) bad.push(`${d.model}: ${set}.${k}`); }
      }
      if ((d.rmsW ?? null) !== (r.rms_w || null) || (d.ohmsPerCoil ?? null) !== (r.ohms_per_coil ?? null) || d.tsBasis !== r.ts_basis) bad.push(`${d.model}: metadata`);
      // nothing missing was filled in: every missing key is really absent
      for (const m of d.missing ?? []) for (const k of m.split(" or ")) if ((d.params as any)[k] !== undefined) bad.push(`${d.model}: ${k} listed missing but present`);
    }
    expect(bad).toEqual([]);
  });
  it("Sundown Sd (PM decision): calculated from the maker's fs, Mms and Vas, printed value kept", () => {
    const sd = drivers.filter((d) => d.brand === "Sundown Audio" && d.printed?.Sd);
    expect(sd.length).toBeGreaterThan(20);
    for (const d of sd) {
      const p = d.params; const cms = 1 / ((2 * Math.PI * p.fs) ** 2 * p.Mms!);
      expect(p.Sd).toBeCloseTo(Math.sqrt(p.Vas! / (1.204 * 343.2 ** 2 * cms)), 10);
      expect(d.notes).toContain("printed Sd");
      expect(complete(d.params).fs).toBeCloseTo(p.fs, 6); // consistent with the maker's own fs now
    }
  });
  it("final loads follow the coil wiring maths (SVC R; DVC R/2 and 2R; QVC R/4, R and 4R)", () => {
    const bad: string[] = [];
    for (const d of drivers) {
      if (!d.coils || !d.ohmsPerCoil) { expect(d.finalLoads).toEqual([]); continue; }
      const want = finalLoadsFor(d.coils, d.ohmsPerCoil);
      const got = [...d.finalLoads!].sort((a, b) => a - b);
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${d.brand} ${d.model}: ${got} vs ${want}`);
    }
    expect(bad).toEqual([]);
    expect(finalLoadsFor(2, 1)).toEqual([0.5, 2]);
    expect(finalLoadsFor(2, 2)).toEqual([1, 4]);
    expect(finalLoadsFor(1, 2)).toEqual([2]);
    expect(finalLoadsFor(4, 0.7)).toEqual([0.175, 0.7, 2.8]);
  });
  it("dedupe: one record per brand + model + coil, all raw records accounted for, BuildBass cross-references exist", () => {
    const keys = new Set<string>();
    for (const d of drivers) { const k = `${d.brand}|${d.model}|${d.coil}|${d.ohmsPerCoil}`.toLowerCase(); expect(keys.has(k)).toBe(false); keys.add(k); }
    let raw = 0; for (const reg of ["us", "world"]) for (const f of fs.readdirSync(path.join(ROOT, "data", "hp_subs_raw", reg))) raw += JSON.parse(fs.readFileSync(path.join(ROOT, "data", "hp_subs_raw", reg, f), "utf8")).drivers.length;
    const mergedNotes = drivers.filter((d) => /Also recorded in/.test(d.notes ?? "")).length;
    expect(drivers.length + mergedNotes).toBe(raw);
    const bb = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "drivers", "library", "buildbass.json"), "utf8")).drivers.map((d: Driver) => d.id));
    for (const d of drivers) if (d.alsoIn) expect(bb.has(d.alsoIn)).toBe(true);
  });
});

describe("dual voice coil wiring", () => {
  const dvc = (over: Partial<Driver> = {}): Driver => ({ id: "t", brand: "T", model: "DVC 1", coil: "DVC", coils: 2, ohmsPerCoil: 1, tsBasis: "series",
    params: { fs: 30, Re: 1.8, Qms: 5, Qes: 0.5, Qts: 0.4545, Vas: 0.05, Sd: 0.05, Bl: 20, Le: 0.002, Xmax: 0.025 }, ...over });
  it("impedance per driver and final load", () => {
    expect(wiredImpedance(1, 2, "series")).toBe(2); expect(wiredImpedance(1, 2, "parallel")).toBe(0.5); expect(wiredImpedance(1, 2, "one")).toBe(1);
    expect(wiredImpedance(4, 1, "parallel")).toBe(4);
    expect(finalLoad(0.5, 2, "parallel")).toBe(0.25); expect(finalLoad(1, 2, "series")).toBe(2); expect(finalLoad(2, 4, "parallel")).toBe(0.5);
  });
  it("series to parallel: Re ÷4, Bl ÷2, Qes and the mechanical values unchanged; one coil: Qes ×2", () => {
    const d = dvc();
    const par = paramsForWiring(d, "parallel");
    expect(par.params.Re).toBeCloseTo(0.45, 12); expect(par.params.Bl).toBeCloseTo(10, 12); expect(par.params.Qes).toBeCloseTo(0.5, 12);
    expect(par.params.Le).toBeCloseTo(0.0005, 12); expect(par.params.fs).toBe(30); expect(par.params.Vas).toBe(0.05); expect(par.params.Znom).toBe(0.5);
    const one = paramsForWiring(d, "one");
    expect(one.params.Re).toBeCloseTo(0.9, 12); expect(one.params.Qes).toBeCloseTo(1, 12); expect(one.params.Bl).toBeCloseTo(10, 12);
    expect(paramsForWiring(d, "series").params.Re).toBe(1.8);
    // Qts follows the converted Qes in the model
    expect(complete(one.params).Qts).toBeCloseTo((1 * 5) / 6, 9);
  });
  it("same power into the wired impedance: series and parallel give the same SPL; impedance scales 4×; one coil differs", () => {
    const d = dvc(); const box = { kind: "sealed" as const, Vb: 0.04, QL: 100 }; const F = freqs(15, 200, 12); const W = 1000;
    const run = (w: "series" | "parallel" | "one") => { const wp = paramsForWiring(d, w); return simulate(complete(wp.params), box, { Vrms: Math.sqrt(W * wp.zDriver!) }, undefined, F); };
    const s = run("series"), p = run("parallel"), o = run("one");
    for (let i = 0; i < F.length; i++) { expect(s.spl[i]).toBeCloseTo(p.spl[i], 6); expect(s.zmag[i] / p.zmag[i]).toBeCloseTo(4, 6); }
    expect(Math.max(...F.map((_, i) => Math.abs(o.spl[i] - s.spl[i])))).toBeGreaterThan(0.5);
  });
  it("unknown basis: assumed from Re against the coil impedance, and the user can override it", () => {
    const d = dvc({ tsBasis: "unknown" });
    expect(inferBasis(d)).toMatchObject({ basis: "series", assumed: true });
    expect(inferBasis(dvc({ tsBasis: "unknown", params: { ...dvc().params, Re: 0.45 } })).basis).toBe("parallel");
    expect(inferBasis(dvc({ tsBasis: "unknown", params: { ...dvc().params, Re: 0.9 } })).basis).toBe("one");
    const ov = paramsForWiring(d, "parallel", "parallel");
    expect(ov.params.Re).toBe(1.8); expect(ov.assumed).toBe(false);
    expect(hasCoilChoice(dvc({ coils: 1, coil: "SVC" }))).toBe(false);
  });
  it("a maker-published set for the chosen wiring is used directly", () => {
    const d = drivers.find((x) => x.model === "H122XR")!; // Massive Audio: Individual (per coil), Parallel and Series columns
    const s = paramsForWiring(d, "series");
    expect(s.usedPublished).toBe(true); expect(s.params.Re).toBe(4); expect(s.params.Bl).toBe(33.02); expect(s.params.Qes).toBe(0.374);
    const one = paramsForWiring(d, "one"); expect(one.params.Re).toBe(2); expect(one.converted).toBe(false);
  });
  it("conversion agrees with maker sheets that publish both wirings (Re ×4 within 8 % as printed values are rounded, Bl ×2, Qes about equal)", () => {
    const both = drivers.filter((d) => d.paramsSeries && d.paramsParallel);
    expect(both.length).toBeGreaterThanOrEqual(15);
    const flagged = new Set(["HIPPOXL152", "HIPPOXL152R"]); // research_e_hp_subs_us.md: Qts/Bl problems on these sheets
    const bad: string[] = [];
    for (const d of both) {
      const pp = { ...d.params, ...d.paramsParallel } as Driver["params"];
      const conv = paramsForWiring({ ...d, tsBasis: "parallel", params: pp, paramsSeries: undefined }, "series");
      const s = d.paramsSeries!;
      const dev = (a: number, b: number) => Math.abs(a / b - 1);
      if (dev(conv.params.Re, s.Re!) > 0.08) bad.push(`${d.model} Re`);
      if (!flagged.has(d.model) && (dev(conv.params.Bl!, s.Bl!) > 0.12 || dev(conv.params.Qes, s.Qes!) > 0.25)) bad.push(`${d.model} Bl/Qes`);
    }
    expect(bad).toEqual([]);
  });
});
