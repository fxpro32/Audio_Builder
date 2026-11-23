// Box auto-sizing (A11_AUTOSIZE, R32): best outside sizes for a required gross volume, "keep the volume" when one side is
// edited, per-side locks, and the front-baffle layout of drivers and passive radiators. Units: mm and litres.
//
// Proportions: the target inside ratio depth : height : width = 1 : 1.28 : 1.54 is Sepmeyer's ratio "B" for rectangular rooms
// (L.W. Sepmeyer, "Computed Frequency and Angular Distribution of the Normal Modes of Vibration in Rectangular Rooms",
// JASA 37:3, pp. 413-423, 1965), which lies inside Bolt's favourable range (R.H. Bolt, "Note on Normal Frequency Statistics
// for Rectangular Rooms", JASA 18:1, pp. 130-133, 1946); both as tabulated in Everest & Pohlmann, Master Handbook of
// Acoustics, 5th ed., Table 13-5, p. 247. The aim is the same as in a room: no two inside dimensions alike (no cube), so the
// standing waves inside the box do not pile up on one frequency. Applying a room ratio to a box is a rule of thumb.
// Which side gets which number is our choice: depth smallest (car boxes are shallow), width largest; Best size also prefers
// a box wider than tall (a small score penalty otherwise).
//
// Baffle margins (our rule, stated in the Help tab): each cut-out stays at least (panel thickness + 20 mm) from the outside
// edge, i.e. 20 mm clear of the inside wall; each frame stays at least 5 mm from the outside edge; frames are 20 mm apart.
// The magnet needs the driver's mounting depth + 10 mm of inside depth at its height (for a wedge, measured at the height of
// the driver's centre plus a quarter of its cut-out, where the sloped back is closest).

export type Side = "W" | "H" | "D";
export const SIDES: Side[] = ["W", "H", "D"];
export interface Sizes { W: number; H: number; D: number }
/** t = panel thickness; top = top depth / bottom depth (1 = rectangular box); bx = extra baffle layer. */
export interface SizeSpec { t: number; top: number; bx?: number }
export const RATIO_SEPMEYER_B = { D: 1, H: 1.28, W: 1.54 };

/** Gross inside volume (L) of a rectangular or wedge box (top depth = top x D outside; same formula as volume.ts). */
export function grossL(s: Sizes, k: SizeSpec): number {
  const bx = k.bx ?? 0;
  const Wi = s.W - 2 * k.t, Hi = s.H - 2 * k.t, Di = s.D - 2 * k.t - bx, Dt = s.D * k.top - 2 * k.t - bx;
  if (Wi <= 0 || Hi <= 0 || Di + Dt <= 0) return 0;
  return (Wi * Hi * (Di + Dt)) / 2 / 1e6;
}
/** Inside sizes (mm); D = average inside depth. */
export function insideOf(s: Sizes, k: SizeSpec): Sizes {
  const bx = k.bx ?? 0;
  return { W: s.W - 2 * k.t, H: s.H - 2 * k.t, D: (s.D * (1 + k.top)) / 2 - 2 * k.t - bx };
}
/** Outside size of one side from its inside size (D: average inside depth). */
export function outsideOf(side: Side, inside: number, k: SizeSpec): number {
  return side === "D" ? ((inside + 2 * k.t + (k.bx ?? 0)) * 2) / (1 + k.top) : inside + 2 * k.t;
}

// ---------- baffle ----------
export interface BaffleItem { kind: "driver" | "pr"; outer: number; cutout: number; depth: number }
export interface BaffleOpts { t: number; gap?: number; frameEdge?: number; clear?: number; bottomZone?: number; magnetClear?: number }
export interface Layout { cols: number; rows: number; cell: number; edge: number; gap: number; bottomZone: number; Wmin: number; Hmin: number }
const GAP = 20, FRAME_EDGE = 5, CLEAR = 20, MAGNET_CLEAR = 10;

/** Every grid layout (1 row, 2 rows, ... 1 column) of the items, with the minimum outside width and height it needs. */
export function layouts(items: BaffleItem[], o: BaffleOpts): Layout[] {
  const n = items.length; if (!n) return [];
  const gap = o.gap ?? GAP; const cell = Math.max(...items.map((i) => i.outer));
  const edge = Math.max(...items.map((i) => Math.max(o.frameEdge ?? FRAME_EDGE, o.t + (o.clear ?? CLEAR) - (i.outer - i.cutout) / 2)));
  const bz = o.bottomZone ?? 0; const out: Layout[] = [];
  for (let cols = n; cols >= 1; cols--) {
    const rows = Math.ceil(n / cols);
    if (out.some((l) => l.rows === rows)) continue; // same rows with more columns only widens the box
    out.push({ cols, rows, cell, edge, gap, bottomZone: bz, Wmin: cols * cell + (cols - 1) * gap + 2 * edge, Hmin: bz + rows * cell + (rows - 1) * gap + 2 * edge });
  }
  return out;
}
/** Centres of the items on the outside front face: x from the box centre, y from the outside bottom (mm). Row 0 is the top row. */
export function placeItems(l: Layout, s: Sizes, n: number): { x: number; y: number }[] {
  const cw = (s.W - 2 * l.edge - (l.cols - 1) * l.gap) / l.cols;
  const ch = (s.H - l.bottomZone - 2 * l.edge - (l.rows - 1) * l.gap) / l.rows;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / l.cols), inRow = Math.min(l.cols, n - r * l.cols), j = i - r * l.cols;
    const rowW = inRow * cw + (inRow - 1) * l.gap; // a short last row is centred
    out.push({ x: -rowW / 2 + cw / 2 + j * (cw + l.gap), y: s.H - l.edge - ch / 2 - r * (ch + l.gap) });
  }
  return out;
}
/** Inside depth (mm) at height y (from the outside bottom) of a rectangular or wedge box. */
export function insideDepthAt(s: Sizes, k: SizeSpec, y: number): number {
  const Hi = s.H - 2 * k.t; const f = Math.min(1, Math.max(0, (y - k.t) / Hi));
  return s.D * (1 - (1 - k.top) * f) - 2 * k.t - (k.bx ?? 0);
}
/** Minimum outside sizes for this layout at height H (the depth minimum depends on where the magnets sit on a wedge). */
export function minSizes(l: Layout, items: BaffleItem[], k: SizeSpec, H: number, o: BaffleOpts = { t: k.t }): Sizes {
  const s = { W: l.Wmin, H: Math.max(H, l.Hmin), D: 1 };
  const pos = placeItems(l, s, items.length); let D = 0;
  items.forEach((it, i) => {
    const y = pos[i].y + it.cutout / 4; const Hi = s.H - 2 * k.t; const f = Math.min(1, Math.max(0, (y - k.t) / Hi));
    D = Math.max(D, (it.depth + (o.magnetClear ?? MAGNET_CLEAR) + 2 * k.t + (k.bx ?? 0)) / (1 - (1 - k.top) * f));
  });
  return { W: l.Wmin, H: l.Hmin, D: Math.ceil(D) };
}
/** Does a box of these sizes hold the layout (baffle width and height, magnet depth)? */
export function fitsLayout(l: Layout, items: BaffleItem[], k: SizeSpec, s: Sizes): boolean {
  const m = minSizes(l, items, k, s.H); return s.W >= m.W - 1e-6 && s.H >= m.H - 1e-6 && s.D >= m.D - 1e-6;
}
/** The layout used for a box of given sizes: among the layouts that fit, the one whose own width/height shape is closest to
 * the box's; if none fits, the one that needs the least extra size. */
export function chooseLayout(ls: Layout[], items: BaffleItem[], k: SizeSpec, s: Sizes): Layout | undefined {
  if (!ls.length) return undefined;
  const fit = ls.filter((l) => fitsLayout(l, items, k, s));
  if (fit.length) return fit.reduce((a, b) => (Math.abs(Math.log(a.Wmin / a.Hmin / (s.W / s.H))) <= Math.abs(Math.log(b.Wmin / b.Hmin / (s.W / s.H))) ? a : b));
  const short = (l: Layout) => Math.max(0, l.Wmin - s.W) + Math.max(0, l.Hmin - s.H);
  return ls.reduce((a, b) => (short(a) <= short(b) ? a : b));
}

// ---------- solvers ----------
export type Locks = Partial<Record<Side, boolean>>;
export type Req = number | ((s: Sizes) => number);
const reqOf = (r: Req, s: Sizes) => (typeof r === "number" ? r : r(s));
const r01 = (v: number) => Math.round(v * 10) / 10;

/** Scale the `free` sides of `base` by one common factor so the gross volume is reqL; sides that would fall below their
 * minimum stop there and the others take up the rest. */
function scaleFree(base: Sizes, free: Side[], k: SizeSpec, reqL: number, mins: (s: Sizes) => Sizes, make: (x: Side, f: number) => number = (x, f) => base[x] * f) {
  const fixed: Partial<Sizes> = {}; let s = { ...base };
  for (let it = 0; it < 4; it++) {
    const sc = free.filter((x) => fixed[x] === undefined);
    const apply = (f: number) => { const o = { ...base, ...fixed } as Sizes; for (const x of sc) o[x] = make(x, f); return o; };
    if (!sc.length) { s = apply(1); break; }
    let lo = 1e-3, hi = 1e3;
    if (grossL(apply(hi), k) < reqL) { s = apply(hi); break; }
    for (let i = 0; i < 100; i++) { const m = Math.sqrt(lo * hi); if (grossL(apply(m), k) < reqL) lo = m; else hi = m; }
    s = apply(hi);
    const m = mins(s); const low = sc.filter((x) => s[x] < m[x] - 1e-6);
    if (!low.length) break;
    // stop one side at a time (the one furthest below its minimum): the others grow once it is fixed, and may then clear theirs
    const worst = low.reduce((a, b) => (s[a] / m[a] <= s[b] / m[b] ? a : b)); fixed[worst] = m[worst];
    if (it === 3) s = { ...s, ...fixed };
  }
  return { s, clamped: free.filter((x) => fixed[x] !== undefined) };
}

export interface HoldResult { sizes: Sizes; ok: boolean; refused?: boolean; clamped: Side[]; grossL: number; reqL: number; msg?: string }
const NAME: Record<Side, string> = { W: "width", H: "height", D: "depth" };
const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);
/** "Keep the volume": after `edited` changed (null = the required volume changed), the other unlocked sides scale together
 * (same factor, so their ratio stays) to hold the required gross volume. No free side left = refused (the edit is not applied). */
export function holdVolume(cur: Sizes, edited: Side | null, k: SizeSpec, req: Req, locks: Locks, mins: (s: Sizes) => Sizes = () => ({ W: 0, H: 0, D: 0 })): HoldResult {
  const free = SIDES.filter((x) => x !== edited && !locks[x]);
  if (!free.length) {
    const others = SIDES.filter((x) => x !== edited);
    const msg = edited ? `${cap(others.map((x) => NAME[x]).join(" and "))} are locked: unlock one so the volume can be kept` : "All three sides are locked: unlock one so the box can follow the volume";
    return { sizes: cur, ok: false, refused: true, clamped: [], grossL: grossL(cur, k), reqL: reqOf(req, cur), msg };
  }
  let s = { ...cur }; let clamped: Side[] = []; let R = reqOf(req, s);
  for (let it = 0; it < 4; it++) {
    const r = scaleFree(cur, free, k, R, mins); s = r.s; clamped = r.clamped;
    const R2 = reqOf(req, s); if (Math.abs(R2 - R) < 1e-4) break; R = R2;
  }
  for (const x of free) s[x] = r01(s[x]);
  const g = grossL(s, k); const ok = Math.abs(g - R) <= 0.1;
  const msg = clamped.length ? `${cap(clamped.map((x) => NAME[x]).join(" and "))} stopped at the minimum the drivers need${ok ? "" : `: the volume could not be kept (${g.toFixed(2)} L, needs ${R.toFixed(2)} L)`}` : ok ? undefined : `The volume could not be kept (${g.toFixed(2)} L, needs ${R.toFixed(2)} L)`;
  return { sizes: s, ok, clamped, grossL: g, reqL: R, msg };
}

export interface BestResult { sizes: Sizes; layout?: Layout; ok: boolean; clamped: Side[]; grossL: number; reqL: number; score: number; msg?: string }
/** Spread of the inside proportions from the target ratio (0 = exact). */
export function ratioScore(s: Sizes, k: SizeSpec, ratio = RATIO_SEPMEYER_B): number {
  const i = insideOf(s, k); const v = SIDES.map((x) => Math.log(Math.max(1e-6, i[x]) / ratio[x])); const m = (v[0] + v[1] + v[2]) / 3;
  return v.reduce((a, b) => a + (b - m) ** 2, 0);
}
/** "Best size": outside sizes for the required gross volume with inside proportions close to the target ratio, every driver
 * and passive radiator on the front baffle (best of the row / grid / column layouts), enough depth for the magnets, locked
 * sides kept. Whole millimetres for width and height; the last free side is solved to 0.1 mm so the volume is exact. */
export function bestSize(cur: Sizes, k: SizeSpec, req: Req, locks: Locks, items: BaffleItem[], o: BaffleOpts = { t: k.t }, ratio = RATIO_SEPMEYER_B): BestResult {
  const free = SIDES.filter((x) => !locks[x]);
  const ls: (Layout | undefined)[] = items.length ? layouts(items, o) : [undefined];
  let best: BestResult | undefined;
  for (const l of ls) {
    const mins = (s: Sizes) => (l ? minSizes(l, items, k, s.H, o) : { W: 0, H: 0, D: 0 });
    let R = reqOf(req, cur); let s = { ...cur }; let clamped: Side[] = [];
    for (let it = 0; it < 4; it++) {
      // ideal start: inside sizes in the target ratio at the required volume (locked sides keep theirs)
      const r = scaleFree({ ...cur }, free, k, R, mins, (x, f) => outsideOf(x, ratio[x] * 100 * f, k)); s = r.s; clamped = r.clamped;
      const R2 = reqOf(req, s); if (Math.abs(R2 - R) < 1e-4) break; R = R2;
    }
    // round: whole mm for all free sides but the last, which is solved again to 0.1 mm
    const order = (["D", "H", "W"] as Side[]).filter((x) => free.includes(x) && !clamped.includes(x));
    const last = order[0];
    for (const x of free) if (x !== last) s[x] = clamped.includes(x) ? Math.ceil(s[x] - 1e-9) : Math.round(s[x]);
    if (last) { const r = holdVolume(s, null, k, R, Object.fromEntries(SIDES.filter((x) => x !== last).map((x) => [x, true])) as Locks, mins); s = r.sizes; }
    const g = grossL(s, k); const ok = Math.abs(g - R) <= 0.1;
    // a box taller than wide costs a little: car boxes usually sit low (boot floor, behind a seat), so 2 drivers go in a row
    const score = ratioScore(s, k, ratio) + (s.H > s.W ? 0.1 : 0) + (ok ? 0 : 100 + (10 * Math.abs(g - R)) / R) + (l && !fitsLayout(l, items, k, s) ? 50 : 0);
    if (!best || score < best.score - 1e-9) best = { sizes: s, layout: l, ok, clamped, grossL: g, reqL: R, score };
  }
  const b = best!;
  if (!free.length) b.msg = "All three sides are locked: unlock at least one for Best size";
  else if (!b.ok && b.grossL > b.reqL && b.layout) b.msg = `What goes on the front (${items.length} cone${items.length > 1 ? "s" : ""}) needs at least ${Math.ceil(b.layout.Wmin)} x ${Math.ceil(b.layout.Hmin)} mm outside and room for the magnets, so the smallest box is ${b.grossL.toFixed(2)} L, more than the ${b.reqL.toFixed(2)} L needed: use fewer or smaller drivers or passive radiators, a bigger target volume, or fill the extra with solid inserts`;
  else if (!b.ok) b.msg = `The required ${b.reqL.toFixed(2)} L cannot be reached with the locked sides and the drivers' minimum sizes (${b.grossL.toFixed(2)} L)`;
  else if (b.clamped.length) b.msg = `${cap(b.clamped.map((x) => NAME[x]).join(" and "))} set by what the drivers need (baffle size or magnet depth)`;
  return b;
}
