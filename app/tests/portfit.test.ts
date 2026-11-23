// A8 2026-11-22: ports must fit inside the box (straight, folded, resized, or flagged), and their volume is subtracted.
import { describe, it, expect } from "vitest";
import { portLayout, fitPort, backInner, PortBox } from "../src/engine/portfit";
import { portDisplacement, portLengthFor, portFb, PortGeom } from "../src/engine/port";
import { netVolume } from "../src/engine/volume";

// The sample Design new settings (R28): 800 × 380 outside, 18 mm panels, slot 50 mm high across the inside width
const box: PortBox = { W: 0.8, H: 0.38, D: 0.475, t: 0.018 };
const Wi = box.W - 2 * box.t;
const slot = (length: number, w = Wi): PortGeom => ({ shape: "slot", count: 1, w, h: 0.05, length });

/** Every port point stays inside the inner box: s in [0, back], y in [t, H - t]. */
function inside(b: PortBox, L: ReturnType<typeof portLayout>, p: PortGeom) {
  const t = b.t;
  if (L.mode === "straight") {
    const top = p.shape === "round" ? L.yc + L.rx : t + p.h! + t;
    expect(p.length).toBeLessThanOrEqual(backInner(b, top) - L.clearance + 1e-3);
  } else if (L.mode === "folded") {
    const half = p.shape === "round" ? L.rx : p.h! / 2;
    const back = L.sBend + half + (p.shape === "slot" && L.rearBoard ? t : 0);
    expect(back).toBeLessThanOrEqual(backInner(b, Math.min(L.yEnd + L.clearance, b.H - t)) + 1e-9);
    expect(L.yEnd).toBeLessThanOrEqual(b.H - t - L.clearance + 1e-9);
    expect(L.L1 + L.L2).toBeCloseTo(p.length, 3);
    expect(L.L1).toBeGreaterThan(0); expect(L.L2).toBeGreaterThan(0);
  }
  for (const x of L.xs) { expect(x - L.rx).toBeGreaterThanOrEqual(-Wi / 2 - 1e-9); expect(x + L.rx).toBeLessThanOrEqual(b.W / 2 - t + 1e-9); }
}

describe("port layout (A8)", () => {
  it("a short port runs straight", () => {
    const p = slot(0.3); const L = portLayout(box, p);
    expect(L.mode).toBe("straight"); inside(box, L, p);
  });
  it("a port longer than the box is deep is folded, inside the box, centre line = length", () => {
    const p = slot(0.6); const L = portLayout(box, p);
    expect(p.length).toBeGreaterThan(L.straightMax);
    expect(L.mode).toBe("folded"); inside(box, L, p);
  });
  it("just past the straight room: short upright leg, bend moved forward with a rear board", () => {
    const p0 = slot(0.3); const s = portLayout(box, p0).straightMax;
    const p = slot(s + 0.01); const L = portLayout(box, p);
    expect(L.mode).toBe("folded"); expect(L.rearBoard).toBe(true); inside(box, L, p);
  });
  it("the sample 1458 mm full-width slot does not fit even folded (the 2 m plank) and is flagged", () => {
    const p = slot(1.458); const L = portLayout(box, p);
    expect(L.fits).toBe(false); expect(L.mode).toBe("none"); expect(L.reason).toMatch(/needs 1458 mm/);
  });
  it("fitPort narrows the slot so the SBB4 57.5 L / 35 Hz port fits folded, and the tuning is kept", () => {
    const Vb = 0.0575, fb = 35;
    const f = fitPort(box, slot(0.1), Vb, fb);
    expect(f.layout.fits).toBe(true); expect(f.resized).toBe(true);
    expect(f.port.w!).toBeLessThan(Wi); expect(f.port.w!).toBeGreaterThanOrEqual(0.05);
    expect(portFb(f.port, Vb)).toBeCloseTo(fb, 6);
    inside(box, f.layout, f.port);
    // the widest that fits: 2 mm wider does not fit
    const wider = { ...f.port, w: f.port.w! + 0.002 }; wider.length = portLengthFor(wider, Vb, fb);
    expect(portLayout(box, wider).fits).toBe(false);
  });
  it("fitPort reports no fit when even a slot as narrow as it is high is too long", () => {
    const tiny: PortBox = { W: 0.4, H: 0.2, D: 0.2, t: 0.018 };
    const f = fitPort(tiny, { shape: "slot", count: 1, w: 0.364, h: 0.05, length: 0.1 }, 0.01, 15);
    expect(f.layout.fits).toBe(false);
  });
  it("round port: too long straight → folded with an elbow; diameter shrinks only when needed", () => {
    const p: PortGeom = { shape: "round", count: 1, d: 0.1, length: 0.55, wall: 0.003 };
    const L = portLayout(box, p); expect(L.mode).toBe("folded"); inside(box, L, p);
    const f = fitPort(box, { ...p, length: 0.1 }, 0.0575, 35);
    expect(f.layout.fits).toBe(true); inside(box, f.layout, f.port);
  });
  it("wedge (sloped back): the folded leg stays under the slope", () => {
    const w: PortBox = { W: 0.8, H: 0.38, D: 0.475, Dtop: 0.33, t: 0.018 };
    const p = slot(0.5); const L = portLayout(w, p);
    expect(L.mode).toBe("folded"); expect(L.rearBoard).toBe(true); inside(w, L, p);
    const r: PortGeom = { shape: "round", count: 2, d: 0.08, length: 0.45, wall: 0.003 };
    const Lr = portLayout(w, r); expect(Lr.fits).toBe(true); inside(w, Lr, r);
  });
  it("several slots share the inside width (dividers between them)", () => {
    const p: PortGeom = { shape: "slot", count: 2, w: Wi, h: 0.05, length: 0.3 };
    const L = portLayout(box, p);
    expect(L.w).toBeCloseTo((Wi - 0.018) / 2, 9); inside(box, L, p);
  });
});

describe("port displacement (A8)", () => {
  const t = 0.018;
  it("full-width slot: air + one board as wide as the slot, along the length inside the front panel", () => {
    const p = slot(0.4);
    expect(portDisplacement(p, t, t)).toBeCloseTo((0.4 - t) * (Wi * 0.05 + Wi * t), 12);
  });
  it("narrowed slot adds its closing side board; a folded slot with a rear board adds that board", () => {
    const p = slot(0.3, 0.3); const L = portLayout(box, p);
    expect(L.displacement).toBeCloseTo(portDisplacement(p, t, t) + 0.05 * t * (0.3 - t), 12);
    const q = slot(portLayout(box, slot(0.3)).straightMax + 0.01, 0.3); const F = portLayout(box, q);
    expect(F.rearBoard).toBe(true);
    expect(F.displacement).toBeGreaterThan(portDisplacement(q, t, t) + 0.05 * t * (q.length - t));
  });
  it("net volume subtracts the port inside the box only (not the part through the front panel)", () => {
    const g = { W: 0.8, H: 0.38, D: 0.475, t };
    const p = slot(0.3);
    const v = netVolume(g, 0, 1, p);
    expect(v.port).toBeCloseTo((0.3 - t) * Wi * (0.05 + t), 12);
    expect(v.net).toBeCloseTo(v.gross - v.port, 12);
  });
  it("round tubes keep their formula when no front-panel thickness is given", () => {
    const p: PortGeom = { shape: "round", count: 1, d: 0.1, length: 0.3, wall: 0.003 };
    expect(portDisplacement(p, t)).toBeCloseTo(Math.PI * 0.053 ** 2 * 0.3, 12);
  });
});
