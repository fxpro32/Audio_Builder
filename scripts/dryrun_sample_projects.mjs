// G1_GENERIC (2026-11-23): two plain one-box (v1) sample projects for the headless dry runs, "car_a" and "car_b".
// Written into the DATA COPY given to the dry run, only when absent, so the dry runs do not depend on anyone's own projects.
// Same content as blankProject() in app/src/ui/model.ts (a 600 x 400 x 500 mm vented box, no driver chosen).
import fs from "node:fs";
import path from "node:path";

export const CAR_A = "car_a";
export const CAR_B = "car_b";

const blank = (name, title) => ({
  name, title, drivers: 1, kind: "vented",
  geom: { W: 600, H: 400, D: 500, wedge: false, Dtop: 350, t: 18, baffleExtra: 0, bracesL: 0, otherL: 0, insertsL: 0, fillPct: 0 },
  port: { shape: "round", count: 1, d: 100, w: 300, h: 50, length: 200, wall: 3 },
  power: { watts: 300, impedance: 4 },
  cabin: { enabled: false, longestMm: 2500, slope: 12, leakHz: 15 },
  lowpassHz: 80, symptoms: "", notes: "",
});

/** dataDir must be a COPY of data/ (the dry runs check this before calling). */
export function ensureSampleProjects(dataDir) {
  const dir = path.join(dataDir, "projects"); fs.mkdirSync(dir, { recursive: true });
  for (const [n, t] of [[CAR_A, "Car A"], [CAR_B, "Car B"]]) {
    const f = path.join(dir, n + ".json");
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(blank(n, t), null, 2) + "\n");
  }
}
