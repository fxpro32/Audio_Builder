// Bundled driver libraries (data/drivers/library): every record must run in the model and have plausible values.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { complete } from "../src/engine/driver";
const LIB = path.resolve(__dirname, "..", "..", "data", "drivers", "library");
const bundles = fs.existsSync(LIB) ? fs.readdirSync(LIB).filter((f) => f.endsWith(".json")) : [];
describe("driver libraries", () => {
  it("has bundles with licence and attribution", () => {
    expect(bundles.length).toBeGreaterThanOrEqual(3);
    for (const f of bundles) { const b = JSON.parse(fs.readFileSync(path.join(LIB, f), "utf8")); expect(b.licence).toBeTruthy(); expect(b.attribution).toBeTruthy(); expect(b.drivers.length).toBe(b.count); }
  });
  for (const f of bundles) it(`${f}: every driver completes, ids unique, values plausible`, () => {
    const b = JSON.parse(fs.readFileSync(path.join(LIB, f), "utf8"));
    const ids = new Set<string>(); const bad: string[] = [];
    for (const d of b.drivers) {
      expect(ids.has(d.id)).toBe(false); ids.add(d.id); expect(d.id.startsWith("lib-")).toBe(true);
      if (d.incomplete) continue; // listed with its published values only (hp-car-subs); not simulated, checked in hpsubs.test.ts
      const p = complete(d.params);
      const reMin = d.library === "hp-car-subs" || d.library === "car-subs" ? 0.1 : 0.5; // high-power subs: dual 1 ohm coils in parallel have Re about 0.4 ohm
      if (!(p.fs > 5 && p.fs < 2000 && p.Qts > 0.05 && p.Qts < 3 && p.Vas > 0 && p.Sd > 1e-4 && p.Sd < 0.5 && p.Re > reMin && p.Re < 50)) bad.push(`${d.brand} ${d.model}`);
    }
    expect(bad).toEqual([]);
  });
});
