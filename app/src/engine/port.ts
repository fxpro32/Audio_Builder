// Port (Helmholtz) tuning, research_c §3. k = end correction factor × r (default 1.463: one flanged + one free end).
// Flared (aeroport-style) round ports: the air mass is ρ·∫dx/S(x) along the port (acoustic mass of a duct of varying section,
// plane-wave/low-frequency approximation), plus end corrections taken at the THROAT radius, not the mouth: mouth-radius end
// corrections overestimate the air mass of flared ports (Hari & Michael, Yorkville Sound, COMSOL conference paper, p. 3, citing
// Salvatti, Devantier & Button, "Maximizing performance from loudspeaker ports", JAES 50(1/2), 2002;
// https://comsol.fr/paper/download/1443022/exploring-asymmetric-vent-designs-in-loudspeaker-systems_a-combined-comsol-and-experimental-approach.pdf).
export interface PortGeom { shape: "round" | "slot"; count: number; d?: number; w?: number; h?: number; length: number; wall?: number; flare?: number }
export const portArea = (p: PortGeom) => (p.shape === "round" ? Math.PI * (p.d! / 2) ** 2 : p.w! * p.h!);
export const portRadiusEq = (p: PortGeom) => Math.sqrt(portArea(p) / Math.PI);
/** Flare radius actually used (round ports only; at most half the length). */
export const flareOf = (p: PortGeom) => (p.shape === "round" && p.flare && p.flare > 0 ? Math.min(p.flare, p.length / 2) : 0);
/** Radius of a flared port at distance s from the nearer mouth (quarter-circle flare of radius R). */
export function flaredRadius(r0: number, R: number, s: number): number { if (s >= R) return r0; const q = R - s; return r0 + R - Math.sqrt(Math.max(0, R * R - q * q)); }
/** ∫ dx / S(x) over the physical length (1/m). */
export function portInertance(p: PortGeom): number {
  const S0 = portArea(p); const R = flareOf(p);
  if (!R) return p.length / S0;
  const r0 = p.d! / 2; const n = 400; const h = R / n; let s = 0;
  for (let i = 0; i <= n; i++) { const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w / (Math.PI * flaredRadius(r0, R, i * h) ** 2); }
  return (p.length - 2 * R) / S0 + 2 * (s * h) / 3;
}
/** Effective length (equivalent straight length at the throat area) including end corrections. */
export const portLeff = (p: PortGeom, k = 1.463) => portArea(p) * portInertance(p) + k * portRadiusEq(p);
/** Tuning frequency for net volume Vb (m³) with `count` identical ports. */
export function portFb(p: PortGeom, Vb: number, cAir = 343.2, k = 1.463): number {
  const Sv = portArea(p) * p.count;
  return (cAir / (2 * Math.PI)) * Math.sqrt(Sv / (Vb * portLeff(p, k)));
}
/** Physical length per port for target fb (bisection for flared ports, closed form for straight ones). */
export function portLengthFor(p: PortGeom, Vb: number, fb: number, cAir = 343.2, k = 1.463): number {
  const Sv = portArea(p) * p.count;
  const Leff = (cAir * cAir * Sv) / (4 * Math.PI ** 2 * fb * fb * Vb);
  if (!(p.shape === "round" && p.flare && p.flare > 0)) return Leff - k * portRadiusEq(p);
  let lo = 0, hi = Math.max(1, Leff * 4);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (portLeff({ ...p, length: m }, k) < Leff) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/**
 * Volume the ports occupy inside the box: outer volume for round tubes (flares included); for slots, air + boards: the slots
 * run side by side along a wall, one board (panelT thick) as wide as all the slots together closes them, and a divider board
 * stands between neighbouring slots (A8 2026-11-22: before, a slot counted only an h × t board strip, about a third too little
 * for a wide slot). baffleT = the part of the length inside the front panel (already wood, not air): left out when given.
 */
export function portDisplacement(p: PortGeom, panelT: number, baffleT = 0): number {
  const L = Math.max(0, p.length - baffleT);
  if (p.shape === "round") {
    const wall = p.wall ?? 0.003; const R = flareOf(p); const r0 = p.d! / 2;
    if (!R) return p.count * Math.PI * (r0 + wall) ** 2 * L;
    const n = 200; const h = R / n; let s = 0;
    for (let i = 0; i <= n; i++) { const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * Math.PI * (flaredRadius(r0, R, i * h) + wall) ** 2; }
    return p.count * (Math.PI * (r0 + wall) ** 2 * (L - 2 * R) + 2 * (s * h) / 3);
  }
  const n = p.count, w = p.w!, h = p.h!;
  return L * (n * w * h + (n * w + (n - 1) * panelT) * panelT + (n - 1) * h * panelT);
}
