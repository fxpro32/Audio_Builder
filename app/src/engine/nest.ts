// Sheet nesting for box panels (A13_BOARDS, R33): lay every panel of a box out on standard MDF sheets with guillotine cuts
// (straight edge-to-edge cuts, the way a panel saw or a track saw breaks a sheet down), then find the smallest sheet that
// holds them all and the cheapest way to buy them. Units mm. MDF has no grain, so every panel may be turned 90°.
//
// Layout = 3-stage guillotine ("strip") packing with a 4th trim stage: stage 1 cuts the trimmed sheet into strips across its
// full length (rip-first) or full width (cross-first); stage 2 cuts each strip into segments; stage 3 splits a segment into
// stacked panels; stage 4 trims a panel narrower than its segment. Wedge sides (right trapezoids) may be paired head-to-tail
// into one rectangle and split by one sloped cut. Heuristic search: several piece orders, strip-height policies, both cut
// directions, with and without pairing; the best layout wins (all panels placed, fewest sheets, biggest single offcut).

export type P2 = [number, number];
export interface Piece {
  id: string; name: string;
  w: number; h: number;            // bounding size (mm) as cut
  poly?: P2[];                     // real outline in the w × h frame (origin bottom-left); none = rectangle
  trap?: { bottom: number; top: number }; // right trapezoid: square edge at x = 0, bottom length, top length, height h
  pairKey?: string;                // pieces with the same key (and same trapezoid) may be paired head-to-tail
}
/** grain (B7, plywood): keep each panel's long side along the sheet length (the face grain); a panel is never turned so that
 * its long side runs across the grain. Square panels may go either way. MDF: leave it off. */
export interface NestOpts { kerf: number; trim: number; pair?: boolean; grain?: boolean }
/** A rectangle that is packed: one piece, or a pair of trapezoids in one blank. Parts' outlines in the item frame. */
export interface Item { key: string; w: number; h: number; parts: { piece: Piece; poly: P2[] }[]; slope?: [P2, P2]; long?: "x" | "y" } // long: axis of the parts' long side (none = square)
export interface Rect { x: number; y: number; w: number; h: number }
export interface PlacedItem extends Rect { item: Item; rotated: boolean; parts: { piece: Piece; poly: P2[] }[]; slope?: [P2, P2] } // sheet coords
export interface Cut { n: number; stage: 1 | 2 | 3 | 4 | 5; kind: "rip" | "cross" | "slope"; line: [P2, P2]; len: number; size: number; frees: string[] }
export interface SheetLayout {
  L: number; W: number; kerf: number; trim: number; ripFirst: boolean;
  placed: PlacedItem[]; cuts: Cut[]; offcuts: Rect[]; partArea: number; pct: number; // pct = real panel area / whole sheet area × 100
}
export interface Plan { sheets: SheetLayout[]; unplaced: Piece[]; paired: boolean }

const EPS = 1e-6;
const area = (poly: P2[]) => { let a = 0; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
export const pieceArea = (p: Piece) => area(piecePoly(p));
export function piecePoly(p: Piece): P2[] {
  if (p.poly) return p.poly;
  if (p.trap) return [[0, 0], [p.trap.bottom, 0], [p.trap.top, p.h], [0, p.h]];
  return [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]];
}
/** Turn an item 90° (proper rotation, never a mirror): (x, y) → (h − y, x). */
function rotItem(it: Item): Item {
  const r = (q: P2): P2 => [it.h - q[1], q[0]];
  return { key: it.key, w: it.h, h: it.w, parts: it.parts.map((p) => ({ piece: p.piece, poly: p.poly.map(r) })), slope: it.slope ? [r(it.slope[0]), r(it.slope[1])] : undefined, long: it.long === "x" ? "y" : it.long === "y" ? "x" : undefined };
}
/** Items to pack: one per piece, or wedge pairs (two equal right trapezoids head-to-tail, the sloped cut kerf apart). */
const longOf = (p: Piece): Item["long"] => (Math.abs(p.w - p.h) < EPS ? undefined : p.w > p.h ? "x" : "y");
export function makeItems(pieces: Piece[], kerf: number, pair: boolean): Item[] {
  const out: Item[] = []; const waiting = new Map<string, Piece>();
  for (const p of pieces) {
    const k = p.trap && p.pairKey ? `${p.pairKey}|${p.trap.bottom}|${p.trap.top}|${p.h}` : "";
    if (pair && k) {
      const a = waiting.get(k);
      if (!a) { waiting.set(k, p); continue; }
      waiting.delete(k);
      const { bottom: B, top: T } = p.trap!; const H = p.h;
      const s = (kerf * Math.hypot(B - T, H)) / H; // horizontal shift that leaves `kerf` square to the slope
      const Wp = B + T + s;
      const second: P2[] = [[Wp, H], [Wp - B, H], [Wp - T, 0], [Wp, 0]]; // first piece turned 180°
      const mid: [P2, P2] = [[B + s / 2, 0], [T + s / 2, H]];
      out.push({ key: `${a.id}+${p.id}`, w: Wp, h: H, parts: [{ piece: a, poly: piecePoly(a) }, { piece: p, poly: second }], slope: mid, long: longOf(a) });
      continue;
    }
    out.push({ key: p.id, w: p.w, h: p.h, parts: [{ piece: p, poly: piecePoly(p) }], long: longOf(p) });
  }
  for (const p of waiting.values()) out.push({ key: p.id, w: p.w, h: p.h, parts: [{ piece: p, poly: piecePoly(p) }], long: longOf(p) });
  return out;
}

// ---------- one sheet, one variant (packing frame: x along the stage-1 cuts, length Lp; y across, width Wp) ----------
interface Slot { it: Item; x: number; y: number; rot: boolean }
interface Seg { x: number; w: number; usedH: number; stack: Slot[] }
interface Strip { y: number; h: number; usedX: number; segs: Seg[] }
type Order = (a: Item, b: Item) => number;
const ORDERS: Order[] = [
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h),
  (a, b) => b.w + b.h - (a.w + a.h),
];
function packStrips(items: Item[], Lp: number, Wp: number, kerf: number, tallStrips: boolean, need?: "x" | "y"): { strips: Strip[]; left: Item[] } {
  const strips: Strip[] = []; const left: Item[] = [];
  for (const it0 of items) {
    // need (grain lock): the packing axis that is the sheet length; an orientation whose long side lies across it is not tried
    const ors = [{ it: it0, rot: false }, ...(Math.abs(it0.w - it0.h) > EPS ? [{ it: rotItem(it0), rot: true }] : [])].filter((o) => !need || !o.it.long || o.it.long === need);
    let best: { waste: number; apply: () => void } | undefined;
    for (const st of strips) for (const o of ors) {
      const { w, h } = o.it; if (h > st.h + EPS) continue;
      for (const sg of st.segs) if (w <= sg.w + EPS && sg.usedH + kerf + h <= st.h + EPS) {
        const waste = (sg.w - w) * h;
        if (!best || waste < best.waste - EPS) best = { waste, apply: () => { sg.stack.push({ it: o.it, x: sg.x, y: st.y + sg.usedH + kerf, rot: o.rot }); sg.usedH += kerf + h; } };
      }
      const nx = st.usedX + (st.segs.length ? kerf : 0);
      if (nx + w <= Lp + EPS) {
        const waste = (st.h - h) * w;
        if (!best || waste < best.waste - EPS) best = { waste, apply: () => { st.segs.push({ x: nx, w, usedH: h, stack: [{ it: o.it, x: nx, y: st.y, rot: o.rot }] }); st.usedX = nx + w; } };
      }
    }
    if (best) { best.apply(); continue; }
    const ny = strips.length ? strips[strips.length - 1].y + strips[strips.length - 1].h + kerf : 0;
    const cand = ors.filter((o) => o.it.w <= Lp + EPS && ny + o.it.h <= Wp + EPS).sort((a, b) => (tallStrips ? b.it.h - a.it.h : a.it.h - b.it.h));
    if (!cand.length) { left.push(it0); continue; }
    const o = cand[0];
    strips.push({ y: ny, h: o.it.h, usedX: o.it.w, segs: [{ x: 0, w: o.it.w, usedH: o.it.h, stack: [{ it: o.it, x: 0, y: ny, rot: o.rot }] }] });
  }
  return { strips, left };
}
/** Cuts (in cutting order) and offcuts of a strip layout, in the packing frame. */
function cutsOf(strips: Strip[], Lp: number, Wp: number, kerf: number) {
  type C = Omit<Cut, "n" | "kind"> & { along: boolean }; // along = parallel to the packing x axis (stage-1 direction)
  const cuts: C[] = []; const off: Rect[] = [];
  const names = (sl: Slot[]) => sl.flatMap((s) => s.it.parts.map((p) => p.piece.name));
  strips.forEach((st) => { const end = st.y + st.h; if (end < Wp - EPS) cuts.push({ stage: 1, along: true, line: [[0, end + kerf / 2], [Lp, end + kerf / 2]], len: Lp, size: st.h, frees: names(st.segs.flatMap((g) => g.stack)) }); });
  for (const st of strips) {
    for (const sg of st.segs) { const end = sg.x + sg.w; if (end < Lp - EPS) cuts.push({ stage: 2, along: false, line: [[end + kerf / 2, st.y], [end + kerf / 2, st.y + st.h]], len: st.h, size: sg.w, frees: names(sg.stack) }); }
    for (const sg of st.segs) {
      for (const sl of sg.stack) { const end = sl.y + sl.it.h; if (end < st.y + st.h - EPS) cuts.push({ stage: 3, along: true, line: [[sg.x, end + kerf / 2], [sg.x + sg.w, end + kerf / 2]], len: sg.w, size: sl.it.h, frees: names([sl]) }); }
      for (const sl of sg.stack) if (sl.it.w < sg.w - EPS) cuts.push({ stage: 4, along: false, line: [[sl.x + sl.it.w + kerf / 2, sl.y], [sl.x + sl.it.w + kerf / 2, sl.y + sl.it.h]], len: sl.it.h, size: sl.it.w, frees: names([sl]) });
      for (const sl of sg.stack) if (sl.it.slope) { const [a, b] = sl.it.slope; cuts.push({ stage: 5, along: false, line: [[a[0] + sl.x, a[1] + sl.y], [b[0] + sl.x, b[1] + sl.y]], len: Math.hypot(b[0] - a[0], b[1] - a[1]), size: 0, frees: names([sl]) }); }
      // offcut above a stack inside its segment
      const top = st.y + sg.usedH + kerf; if (st.y + st.h - top > EPS) off.push({ x: sg.x, y: top, w: sg.w, h: st.y + st.h - top });
    }
    const ex = st.usedX + kerf; if (Lp - ex > EPS) off.push({ x: ex, y: st.y, w: Lp - ex, h: st.h });
  }
  const ly = strips.length ? strips[strips.length - 1].y + strips[strips.length - 1].h + kerf : 0;
  if (Wp - ly > EPS) off.push({ x: 0, y: ly, w: Lp, h: Wp - ly });
  return { cuts, off };
}
/** Lay out as many items as possible on one sheet L × W (best of all variants). */
export function packSheet(items: Item[], L: number, W: number, o: NestOpts): { layout: SheetLayout; left: Item[] } {
  const Lu = L - 2 * o.trim, Wu = W - 2 * o.trim; const kerf = o.kerf;
  let best: { layout: SheetLayout; left: Item[]; score: number[] } | undefined;
  for (const ripFirst of [true, false]) for (const order of ORDERS) for (const tall of [true, false]) {
    const Lp = ripFirst ? Lu : Wu, Wp = ripFirst ? Wu : Lu;
    if (Lp <= 0 || Wp <= 0) continue;
    const { strips, left } = packStrips([...items].sort(order), Lp, Wp, kerf, tall, o.grain ? (ripFirst ? "x" : "y") : undefined); // sheet length = packing x when rip-first, y when cross-first
    // packing frame → sheet: rip-first X = trim + px, Y = trim + py; cross-first a 90° turn: X = trim + py, Y = trim + Wu − px
    const T = (q: P2): P2 => (ripFirst ? [o.trim + q[0], o.trim + q[1]] : [o.trim + q[1], o.trim + Wu - q[0]]);
    const TR = (r: Rect): Rect => { const a = T([r.x, r.y]), b = T([r.x + r.w, r.y + r.h]); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }; };
    const placed: PlacedItem[] = strips.flatMap((st) => st.segs.flatMap((sg) => sg.stack.map((sl) => {
      const mv = (q: P2) => T([q[0] + sl.x, q[1] + sl.y]);
      return { ...TR({ x: sl.x, y: sl.y, w: sl.it.w, h: sl.it.h }), item: sl.it, rotated: sl.rot, parts: sl.it.parts.map((p) => ({ piece: p.piece, poly: p.poly.map(mv) })), slope: sl.it.slope ? [mv(sl.it.slope[0]), mv(sl.it.slope[1])] as [P2, P2] : undefined };
    })));
    const { cuts, off } = cutsOf(strips, Lp, Wp, kerf);
    const cutsS: Cut[] = cuts.map((c, i) => ({ n: i + 1, stage: c.stage, kind: c.stage === 5 ? "slope" : c.along === ripFirst ? "rip" : "cross", line: [T(c.line[0]), T(c.line[1])], len: c.len, size: c.size, frees: c.frees }));
    const offcuts = off.map(TR).filter((r) => r.w >= 1 && r.h >= 1);
    const partArea = placed.reduce((s, p) => s + p.parts.reduce((t, q) => t + area(q.poly), 0), 0);
    const layout: SheetLayout = { L, W, kerf, trim: o.trim, ripFirst, placed, cuts: cutsS, offcuts, partArea, pct: (partArea / (L * W)) * 100 };
    const bigOff = Math.max(0, ...offcuts.map((r) => r.w * r.h));
    const score = [left.length === 0 ? 1 : 0, partArea, bigOff, ripFirst ? 1 : 0, -cutsS.length];
    if (!best || cmp(score, best.score) > 0) best = { layout, left, score };
  }
  if (!best) return { layout: { L, W, kerf, trim: o.trim, ripFirst: true, placed: [], cuts: [], offcuts: [], partArea: 0, pct: 0 }, left: items };
  return { layout: best.layout, left: best.left };
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > 1e-6) return a[i] - b[i]; } return 0; };

/** Lay the pieces out on the given sheets in order (each sheet takes what it can). Best of paired / unpaired wedge sides. */
export function nest(pieces: Piece[], sheets: { L: number; W: number }[], o: NestOpts): Plan {
  const run = (paired: boolean): Plan => {
    let items = makeItems(pieces, o.kerf, paired); const out: SheetLayout[] = [];
    for (const s of sheets) { if (!items.length) break; const r = packSheet(items, s.L, s.W, o); if (!r.layout.placed.length) continue; out.push(r.layout); items = r.left; }
    return { sheets: out, unplaced: items.flatMap((it) => it.parts.map((p) => p.piece)), paired };
  };
  const plain = run(false);
  if (!o.pair || !pieces.some((p) => p.trap && p.pairKey)) return plain;
  const pr = run(true);
  const sc = (p: Plan) => [-p.unplaced.length, -p.sheets.length, Math.max(0, ...p.sheets.slice(-1).flatMap((s) => s.offcuts.map((r) => r.w * r.h))), p.paired ? 0 : 1];
  return cmp(sc(pr), sc(plain)) > 0 ? pr : plain;
}
/** As many sheets of one size as it takes (up to max); stops when a sheet takes nothing (a panel bigger than the sheet). */
export function nestRepeat(pieces: Piece[], L: number, W: number, o: NestOpts, max = 20): Plan {
  return nest(pieces, Array.from({ length: max }, () => ({ L, W })), o);
}
/** Does a piece fit on an L × W sheet at all (either way round, inside the trimmed edges)? */
export const pieceFits = (p: Piece, L: number, W: number, trim: number) => { const Lu = L - 2 * trim, Wu = W - 2 * trim; return (p.w <= Lu + EPS && p.h <= Wu + EPS) || (p.h <= Lu + EPS && p.w <= Wu + EPS); };

export interface SheetSpec { key: string; L: number; W: number; price?: number; group?: string }
/** (a) The smallest single sheet (by area, then by length) that holds every piece. */
export function smallestSheet(pieces: Piece[], sheets: SheetSpec[], o: NestOpts): { sheet: SheetSpec; plan: Plan } | undefined {
  const sorted = [...sheets].sort((a, b) => a.L * a.W - b.L * b.W || a.L - b.L || (a.price ?? Infinity) - (b.price ?? Infinity));
  const need = pieces.reduce((s, p) => s + pieceArea(p), 0);
  for (const s of sorted) {
    if ((s.L - 2 * o.trim) * (s.W - 2 * o.trim) < need || !pieces.every((p) => pieceFits(p, s.L, s.W, o.trim))) continue;
    const plan = nest(pieces, [s], o); if (!plan.unplaced.length) return { sheet: s, plan };
  }
  return undefined;
}
export interface Buy { group: string; sheets: SheetSpec[]; cost: number; plan: Plan }
/** (b) The cheapest way to buy: per group (supplier), any mix of its sheet sizes, up to maxSheets sheets; tried in order of
 * cost, the first combination that holds every piece wins. Returns the best buy of each group, cheapest first. */
export function cheapestBuys(pieces: Piece[], sheets: SheetSpec[], o: NestOpts, maxSheets = 6, maxTries = 400): Buy[] {
  const need = pieces.reduce((s, p) => s + pieceArea(p), 0);
  const groups = new Map<string, SheetSpec[]>();
  for (const s of sheets) { if (!(s.price! > 0)) continue; const g = s.group ?? ""; const list = groups.get(g) ?? groups.set(g, []).get(g)!; const same = list.findIndex((x) => x.L === s.L && x.W === s.W); if (same < 0) list.push(s); else if (s.price! < list[same].price!) list[same] = s; }
  const out: Buy[] = [];
  for (const [g, sizes] of groups) {
    if (!pieces.every((p) => sizes.some((s) => pieceFits(p, s.L, s.W, o.trim)))) continue;
    const combos: SheetSpec[][] = [];
    const rec = (start: number, cur: SheetSpec[]) => { if (cur.length) combos.push([...cur]); if (cur.length >= maxSheets) return; for (let i = start; i < sizes.length; i++) { cur.push(sizes[i]); rec(i, cur); cur.pop(); } };
    rec(0, []);
    const cost = (c: SheetSpec[]) => c.reduce((s, x) => s + x.price!, 0);
    const full = (c: SheetSpec[]) => c.reduce((s, x) => s + x.L * x.W, 0);
    const usable = (c: SheetSpec[]) => c.reduce((s, x) => s + (x.L - 2 * o.trim) * (x.W - 2 * o.trim), 0);
    const ok = combos.filter((c) => usable(c) >= need && pieces.every((p) => c.some((s) => pieceFits(p, s.L, s.W, o.trim))))
      .sort((a, b) => cost(a) - cost(b) || a.length - b.length || full(a) - full(b) || Math.max(...a.map((x) => x.L)) - Math.max(...b.map((x) => x.L)));
    let tries = 0;
    for (const c of ok) {
      if (++tries > maxTries) break;
      const order = [...c].sort((a, b) => b.L * b.W - a.L * a.W);
      const plan = nest(pieces, order, o);
      if (!plan.unplaced.length && plan.sheets.length === order.length) { out.push({ group: g, sheets: order, cost: cost(c), plan }); break; }
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}
/** Overlap check for tests and the dry run: every placed item inside the trimmed sheet and at least `kerf` from every other. */
export function checkLayout(s: SheetLayout): string[] {
  const errs: string[] = []; const t = s.trim, k = s.kerf;
  s.placed.forEach((p, i) => {
    if (p.x < t - 1e-3 || p.y < t - 1e-3 || p.x + p.w > s.L - t + 1e-3 || p.y + p.h > s.W - t + 1e-3) errs.push(`${p.item.key} outside the trimmed sheet`);
    s.placed.forEach((q, j) => {
      if (j <= i) return;
      const gx = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w)), gy = Math.max(q.y - (p.y + p.h), p.y - (q.y + q.h));
      if (Math.max(gx, gy) < k - 1e-3) errs.push(`${p.item.key} and ${q.item.key} closer than the kerf (${Math.max(gx, gy).toFixed(2)} mm)`);
    });
  });
  return errs;
}
/** Grain check for tests and the dry run (B7): every placed non-square panel has its long side along the sheet length (x). */
export function grainErrors(s: SheetLayout): string[] {
  const errs: string[] = [];
  for (const p of s.placed) for (const q of p.parts) {
    if (Math.abs(q.piece.w - q.piece.h) < EPS) continue;
    const xs = q.poly.map((v) => v[0]), ys = q.poly.map((v) => v[1]);
    const dx = Math.max(...xs) - Math.min(...xs), dy = Math.max(...ys) - Math.min(...ys);
    if (dx < dy - 1e-6) errs.push(`${q.piece.id} runs across the grain (${Math.round(dx)} along, ${Math.round(dy)} across the sheet)`);
  }
  return errs;
}
/** Pieces from cut-list rows (whole mm, as the builder cuts them). A row with `trap` is a right trapezoid (wedge side: a = the
 * bottom length, b = the height, square front edge); its copies may be paired head-to-tail. */
export function piecesFromRows(rows: { name: string; qty: number; a: number; b: number; trap?: { bottom: number; top: number } }[]): Piece[] {
  const out: Piece[] = [];
  for (const r of rows) for (let i = 0; i < r.qty; i++) {
    const name = r.qty > 1 ? `${r.name} ${i + 1}` : r.name; const id = `${r.name}#${i + 1}`;
    if (r.trap) { const bottom = Math.round(r.trap.bottom), top = Math.round(r.trap.top), h = Math.round(r.b); out.push({ id, name, w: Math.max(bottom, top), h, trap: { bottom, top }, pairKey: r.name }); }
    else out.push({ id, name, w: Math.round(r.a), h: Math.round(r.b) });
  }
  return out;
}
/** A free-form panel outline (any polygon, mm) turned to its smallest bounding rectangle (tried along every edge), whole mm. */
export function pieceFromOutline(id: string, name: string, pts: P2[]): Piece {
  let best: { a: number; ang: number } | undefined;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; const ang = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(-ang), s = Math.sin(-ang); const r = pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]); const a = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (!best || a < best.a - 1e-6) best = { a, ang };
  }
  const ang = best?.ang ?? 0; const c = Math.cos(-ang), s = Math.sin(-ang);
  let r = pts.map(([x, y]) => [x * c - y * s, x * s + y * c] as P2);
  const mx = Math.min(...r.map((q) => q[0])), my = Math.min(...r.map((q) => q[1])); r = r.map(([x, y]) => [x - mx, y - my] as P2);
  let w = Math.max(...r.map((q) => q[0])), h = Math.max(...r.map((q) => q[1]));
  if (h > w) { r = r.map(([x, y]) => [h - y, x] as P2); [w, h] = [h, w]; }
  return { id, name, w: Math.ceil(w - 1e-6), h: Math.ceil(h - 1e-6), poly: r };
}
