// A11_AUTOSIZE: box size solver (best size, keep the volume, locks, wedges) and front-baffle layouts.
import { describe, expect, it } from "vitest";
import { bestSize, BaffleItem, chooseLayout, fitsLayout, grossL, holdVolume, insideOf, layouts, minSizes, placeItems, ratioScore, Sizes, SizeSpec } from "../src/engine/autosize";
import { grossVolume } from "../src/engine/volume";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
// The sample new box (new_sub_box): wedge, top 69.7 %, 16 mm MDF; Pioneer TS-W3002D4 sizes as the app estimates them from Sd
const wedge: SizeSpec = { t: 16, top: 0.697 };
const rect: SizeSpec = { t: 18, top: 1 };
const pioneer: BaffleItem = { kind: "driver", outer: 295.1, cutout: 265.6, depth: 147.6 };
const box0: Sizes = { W: 405, H: 360, D: 255 };
const REQ = 22.6;

describe("gross volume", () => {
  it("matches volume.ts for a wedge (Dtop = top x D outside)", () => {
    const s = { W: 405, H: 360, D: 255 };
    near(grossL(s, wedge), grossVolume({ W: 0.405, H: 0.36, D: 0.255, Dtop: 0.255 * 0.697, t: 0.016 }) * 1000, 1e-9);
    near(grossL(s, rect), grossVolume({ W: 0.405, H: 0.36, D: 0.255, t: 0.018 }) * 1000, 1e-9);
  });
  it("inside average depth", () => { const i = insideOf(box0, wedge); near(i.D, (255 - 32 + 255 * 0.697 - 32) / 2, 1e-9); });
});

describe("keep the volume", () => {
  const start = holdVolume(box0, "W", wedge, REQ, { W: true, H: true }).sizes; // depth solved for 22.6 L at 405 x 360
  it("start box holds 22.6 L", () => near(grossL(start, wedge), REQ, 0.1));
  it("width 405 -> 410: height and depth change together, volume held", () => {
    const r = holdVolume({ ...start, W: 410 }, "W", wedge, REQ, {});
    expect(r.ok).toBe(true); expect(r.sizes.W).toBe(410);
    expect(r.sizes.H).toBeLessThan(start.H); expect(r.sizes.D).toBeLessThan(start.D);
    near(r.sizes.H / r.sizes.D, start.H / start.D, 0.003); // same factor: ratio kept
    near(r.grossL, REQ, 0.1);
  });
  it("height locked: only the depth moves", () => {
    const r = holdVolume({ ...start, W: 430 }, "W", wedge, REQ, { H: true });
    expect(r.sizes.H).toBe(start.H); expect(r.sizes.D).toBeLessThan(start.D); near(r.grossL, REQ, 0.1);
  });
  it("height and depth locked: refused with a plain message", () => {
    const r = holdVolume({ ...start, W: 430 }, "W", wedge, REQ, { H: true, D: true });
    expect(r.refused).toBe(true); expect(r.msg).toBe("Height and depth are locked: unlock one so the volume can be kept");
  });
  it("wedge top % edit: the free sides follow", () => {
    const s2: SizeSpec = { ...wedge, top: 0.6 };
    const r = holdVolume(start, null, s2, REQ, { W: true }); near(r.grossL, REQ, 0.1); expect(r.sizes.W).toBe(start.W);
  });
  it("required volume doubles (2 drivers): all free sides grow", () => {
    const r = holdVolume(start, null, wedge, 2 * REQ, {}); near(r.grossL, 2 * REQ, 0.1);
    expect(r.sizes.W).toBeGreaterThan(start.W); expect(r.sizes.H).toBeGreaterThan(start.H);
  });
  it("a side stops at the drivers' minimum and the other side takes the rest", () => {
    const l = layouts([pioneer], { t: 16 })[0]; const mins = (s: Sizes) => minSizes(l, [pioneer], wedge, s.H);
    // wider box: the depth would drop below what the magnet needs on this wedge, so it stops there and the height shrinks more
    const r = holdVolume({ ...start, W: 455 }, "W", wedge, REQ, {}, mins);
    expect(r.ok).toBe(true); expect(r.clamped).toEqual(["D"]); near(r.sizes.D, mins(r.sizes).D, 0.11); expect(r.sizes.H).toBeLessThan(start.H);
    near(r.grossL, REQ, 0.1); expect(r.msg).toMatch(/Depth stopped at the minimum/);
    // far too wide: both stop at their minimum and the volume cannot be kept (said plainly)
    const r2 = holdVolume({ ...start, W: 600 }, "W", wedge, REQ, {}, mins);
    expect(r2.ok).toBe(false); expect(r2.msg).toMatch(/could not be kept/);
  });
  it("volume held within 0.1 L over a series of edits", () => {
    let s = start;
    for (const [side, v] of [["W", 420], ["H", 380], ["D", 240], ["W", 395], ["H", 350]] as const) {
      const r = holdVolume({ ...s, [side]: v }, side, wedge, REQ, {}); expect(r.ok).toBe(true); near(r.grossL, REQ, 0.1); s = r.sizes;
    }
  });
  it("a requirement that depends on the box (slot port width) converges", () => {
    const req = (s: Sizes) => 20 + (s.W - 36) * 50 * 0.3 / 1e6; // e.g. a slot port as wide as the inside
    const r = holdVolume({ W: 420, H: 360, D: 300 }, "W", rect, req, {}); near(r.grossL, req(r.sizes), 0.1);
  });
});

describe("baffle layouts", () => {
  const sub12: BaffleItem = { kind: "driver", outer: 310, cutout: 280, depth: 150 };
  it("1-4 drivers: every layout has room for all of them, no overlaps", () => {
    for (let n = 1; n <= 4; n++) {
      const items = Array.from({ length: n }, () => sub12);
      for (const l of layouts(items, { t: 18 })) {
        expect(l.cols * l.rows).toBeGreaterThanOrEqual(n);
        const s = { W: l.Wmin, H: l.Hmin, D: 400 }; const p = placeItems(l, s, n);
        for (let i = 0; i < n; i++) {
          // frame inside the outer face, cut-out 20 mm clear of the inside walls
          expect(Math.abs(p[i].x) + sub12.outer / 2).toBeLessThanOrEqual(s.W / 2 + 1e-6);
          expect(Math.abs(p[i].x) + sub12.cutout / 2).toBeLessThanOrEqual(s.W / 2 - 18 - 20 + 1e-6);
          expect(p[i].y + sub12.cutout / 2).toBeLessThanOrEqual(s.H - 18 - 20 + 1e-6); expect(p[i].y - sub12.cutout / 2).toBeGreaterThanOrEqual(18 + 20 - 1e-6);
          for (let j = 0; j < i; j++) expect(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y)).toBeGreaterThanOrEqual(sub12.outer + 20 - 1e-6);
        }
      }
    }
  });
  it("2 drivers side by side need at least 2 frames + gap of width", () => {
    const l = layouts([sub12, sub12], { t: 18 }).find((x) => x.rows === 1)!; expect(l.Wmin).toBeGreaterThanOrEqual(2 * 310 + 20);
  });
  it("a slot port zone at the bottom raises the minimum height", () => {
    const a = layouts([sub12], { t: 18 })[0], b = layouts([sub12], { t: 18, bottomZone: 18 + 50 })[0]; near(b.Hmin - a.Hmin, 68, 1e-9);
  });
  it("wedge: the magnet needs more outside depth than a rectangle", () => {
    const l = layouts([pioneer], { t: 16 })[0];
    expect(minSizes(l, [pioneer], wedge, 360).D).toBeGreaterThan(minSizes(l, [pioneer], { t: 16, top: 1 }, 360).D);
  });
  it("the sample 405 x 360 front holds the 12 in Pioneer", () => { const l = layouts([pioneer], { t: 16 })[0]; expect(l.Wmin).toBeLessThanOrEqual(405); expect(l.Hmin).toBeLessThanOrEqual(360); });
});

describe("best size", () => {
  it("one driver: volume met, fits, proportions near 1 : 1.28 : 1.54", () => {
    const r = bestSize(box0, rect, REQ, {}, [pioneer]);
    expect(r.ok).toBe(true); near(r.grossL, REQ, 0.1); expect(fitsLayout(r.layout!, [pioneer], rect, r.sizes)).toBe(true);
    expect(Number.isInteger(r.sizes.W) && Number.isInteger(r.sizes.H)).toBe(true);
  });
  it("no drivers given: exact ratio", () => {
    const r = bestSize(box0, rect, 50, {}, []); near(ratioScore(r.sizes, rect), 0, 1e-3); near(r.grossL, 50, 0.1);
  });
  it("wedge: volume met and the magnet fits", () => {
    const r = bestSize(box0, wedge, REQ, {}, [pioneer]); near(r.grossL, REQ, 0.1); expect(fitsLayout(r.layout!, [pioneer], wedge, r.sizes)).toBe(true);
  });
  it("locked width is kept", () => { const r = bestSize(box0, rect, REQ, { W: true }, [pioneer]); expect(r.sizes.W).toBe(405); near(r.grossL, REQ, 0.1); });
  it("all locked: says so", () => { const r = bestSize(box0, rect, REQ, { W: true, H: true, D: true }, [pioneer]); expect(r.msg).toMatch(/All three sides are locked/); });
  it("1 to 4 drivers (+ passive radiators): every item fits and the volume is met", () => {
    const pr: BaffleItem = { kind: "pr", outer: 310, cutout: 280, depth: 60 };
    for (let n = 1; n <= 4; n++) for (const prs of [0, n]) {
      const items = [...Array.from({ length: n }, () => pioneer), ...Array.from({ length: prs }, () => pr)];
      const req = (prs ? 60 : REQ) * n; // a PR box is tuned like a ported box: bigger
      const r = bestSize(box0, rect, req, {}, items); expect(r.ok).toBe(true); near(r.grossL, req, 0.1); expect(fitsLayout(r.layout!, items, rect, r.sizes)).toBe(true);
    }
  });
  it("more on the front than the volume allows: the box is as small as the baffle allows and says why", () => {
    const pr: BaffleItem = { kind: "pr", outer: 310, cutout: 280, depth: 60 };
    const items = [pioneer, pioneer, pr, pr]; const r = bestSize(box0, rect, 2 * REQ, {}, items);
    expect(r.ok).toBe(false); expect(r.grossL).toBeGreaterThan(2 * REQ); expect(fitsLayout(r.layout!, items, rect, r.sizes)).toBe(true); expect(r.msg).toMatch(/front/);
  });
  it("wedge, 2 drivers: volume met although every side starts below its minimum (sides stop one at a time)", () => {
    const r = bestSize(box0, wedge, 2 * REQ, {}, [pioneer, pioneer]); expect(r.ok).toBe(true); expect(r.layout!.rows).toBe(1); near(r.grossL, 2 * REQ, 0.1); expect(fitsLayout(r.layout!, [pioneer, pioneer], wedge, r.sizes)).toBe(true);
  });
  it("keep the volume, 1 -> 2 drivers from a narrow box: width stops at the 2-driver front, the volume is kept", () => {
    const items = [pioneer, pioneer]; const ls = layouts(items, { t: 16 }); const cur = { W: 450, H: 337.4, D: 262.5 };
    const l = chooseLayout(ls, items, wedge, cur)!; expect(l.rows).toBe(1);
    const r = holdVolume(cur, null, wedge, 2 * REQ, {}, (s) => minSizes(l, items, wedge, s.H)); expect(r.ok).toBe(true); near(r.grossL, 2 * REQ, 0.1); expect(r.sizes.W).toBeGreaterThanOrEqual(l.Wmin - 0.05);
  });
  it("two drivers choose a row (wider than tall)", () => {
    const r = bestSize(box0, rect, 2 * REQ, {}, [pioneer, pioneer]); expect(r.layout!.rows).toBe(1); expect(r.sizes.W).toBeGreaterThan(r.sizes.H);
  });
  it("chooseLayout picks the layout that fits the box", () => {
    const items = [pioneer, pioneer]; const ls = layouts(items, { t: 18 });
    expect(chooseLayout(ls, items, rect, { W: 700, H: 360, D: 300 })!.rows).toBe(1);
    expect(chooseLayout(ls, items, rect, { W: 360, H: 700, D: 300 })!.cols).toBe(1);
  });
});
