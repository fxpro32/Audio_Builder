// System wiring diagram (B6A_DIAGRAM_ENGINE, R44, 2026-11-23): one self-contained SVG of the whole car-audio system of a
// project (model v2 items + typed links, docs/project_model_v2.md): battery (and alternator), fuses, power cable runs with
// gauge and length (cable engine, cable.ts), distribution blocks, capacitors, amplifiers, head unit / DSP (signal and remote
// along the top), speakers / boxes / IB / door speakers (speaker links with their load), ground returns (ground symbol).
// Items with no link are drawn in a "Not connected" area. Deterministic: the same project gives the same SVG (no clock, no
// random). No external fonts or images. API: docs/diagram_engine.md.
import type { Item, ItemLink, ProjectDoc } from "../ui/projectv2";
import { itemLoadOhm } from "./cable";
import type { CableLookups, CableSystemResult } from "./cable";
import { cableFor, graphOf, num, Role, roleOf, ROLE_LABEL, SysGraph } from "./sysmodel";
import type { CableView } from "./sysmodel";

export interface DiagramOptions {
  /** Date text for the header (e.g. "2026-11-23"); default: the date part of doc.saved, else none. */
  date?: string;
  /** Title text; default doc.title (or doc.name). */
  title?: string;
  /** Do not run the cable engine when no result is given (labels then show only what the cable items hold). */
  noCableEngine?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------- style
export const LINK_STYLE: Record<ItemLink["kind"], { color: string; width: number; dash?: string; label: string }> = {
  power: { color: "#d0202a", width: 3.2, label: "Power (+12 V)" },
  ground: { color: "#111111", width: 2.6, dash: "10 4", label: "Ground (to chassis)" },
  signal: { color: "#1f5fd6", width: 2.2, dash: "2 4", label: "Signal (RCA / high level)" },
  speaker: { color: "#178a35", width: 2.6, dash: "12 3 3 3", label: "Speaker" },
  remote: { color: "#e07b00", width: 1.8, dash: "6 4", label: "Remote turn-on" },
};
const ROLE_FILL: Record<Role, string> = {
  alternator: "#fde2e2", battery: "#fde2e2", fuse: "#fff1c2", distribution: "#ffe6c7", capacitor: "#ece4ff", amplifier: "#dde8ff",
  dsp: "#d8f1ff", headunit: "#e3f6ea", speaker: "#dcf3dc", ground: "#ffffff", cable: "#eeeeee", connector: "#f2f2f2", other: "#f2f2f2",
};
const NODE_W = 176, NODE_H = 62, COL_W = 262, ROW_H = 92, MARGIN = 28, HEADER_H = 78, GROUND_W = 112, GROUND_H = 58;
const PORT_Y: Record<ItemLink["kind"], number> = { signal: 12, remote: 22, power: 34, speaker: 34, ground: 52 };
const KIND_ORDER: ItemLink["kind"][] = ["power", "ground", "signal", "speaker", "remote"];

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const f1 = (x: number) => (Math.round(x * 10) / 10).toString();
const px = (x: number) => (Math.round(x * 10) / 10).toString();

interface Box { id: string; x: number; y: number; w: number; h: number; band: "grid" | "signal" | "ground" | "loose"; col: number }

// ---------------------------------------------------------------------------------------------------------------- labels
function cableText(c: Item | undefined): { size?: string; len?: string } {
  if (!c) return {};
  const d = c.data ?? {};
  const size = d.size ? `${d.size} AWG` : num(d.areaMm2) ? `${f1(d.areaMm2)} mm2` : undefined;
  return { size, len: num(d.lengthM) ? `${f1(d.lengthM)} m` : undefined };
}
function nodeDetail(it: Item, lk: CableLookups, cr?: CableSystemResult, cv?: CableView): string {
  const d = it.data ?? {}, r = roleOf(it), rec = d.partId && lk.part ? lk.part(d.partId) : undefined;
  const bits: string[] = [];
  switch (r) {
    case "battery": if (num(d.alternatorA)) bits.push(`alternator ${d.alternatorA} A`); if (num(d.ah ?? rec?.ah)) bits.push(`${d.ah ?? rec?.ah} Ah`); break;
    case "alternator": if (num(d.ratingA ?? d.alternatorA)) bits.push(`${d.ratingA ?? d.alternatorA} A`); break;
    case "fuse": {
      const a = d.ratingA ?? rec?.rating_a ?? rec?.fuse_included_a;
      const run = cv?.runOfFuse.get(it.id) ? cr?.runs.find((x) => x.id === cv.runOfFuse.get(it.id)) : undefined;
      if (num(a)) bits.push(`${a} A`); else if (run?.fuseA) bits.push(`rec. ${run.fuseA} A`); else bits.push("rating not set");
      if (d.type ?? rec?.fuse_type) bits.push(String(d.type ?? rec?.fuse_type));
      if (num(d.distanceMm)) bits.push(`${d.distanceMm} mm from battery`);
      break;
    }
    case "distribution": bits.push(d.fused === true ? "fused" : d.fused === false ? "unfused" : "block"); if (num(d.fuseA)) bits.push(`${d.fuseA} A per branch`); break;
    case "capacitor": if (num(d.farads ?? rec?.farads)) bits.push(`${d.farads ?? rec?.farads} F`); break;
    case "amplifier": {
      const l = cr?.loads.find((x) => x.id === it.id);
      const w = num(d.rmsW) ? d.rmsW : undefined;
      if (w) bits.push(`${w} W`);
      if (d.class ?? rec?.class) bits.push(`class ${String(d.class ?? rec?.class).replace(/^class\s*/i, "")}`);
      if (l && l.maxA > 0) bits.push(`max ${f1(l.maxA)} A`);
      break;
    }
    case "speaker": {
      const z = itemLoadOhm(it, lk).ohm;
      const n = it.kind === "box" ? (num(d.drivers) ? d.drivers : 1) : num(d.count) ? d.count : undefined;
      if (n) bits.push(`${n} driver${n > 1 ? "s" : ""}`);
      if (z) bits.push(`${f1(z)} ohm`);
      break;
    }
    case "cable": { const t = cableText(it); if (t.size) bits.push(t.size); if (t.len) bits.push(t.len); break; }
  }
  if (!bits.length && rec?.title) bits.push(String(rec.title));
  return bits.join(", ");
}
function kindTag(it: Item): string {
  const r = roleOf(it);
  if (r === "speaker") return it.kind === "box" ? "SUBWOOFER BOX" : it.kind === "door" ? "DOOR SPEAKERS" : it.kind === "ib" ? "INFINITE BAFFLE" : "SPEAKER";
  if (r === "fuse") return it.kind === "fuseholder" ? "FUSE HOLDER" : "FUSE";
  return ROLE_LABEL[r].toUpperCase();
}

// ---------------------------------------------------------------------------------------------------------------- layout
function powerRank(g: SysGraph, batteries: string[]): Map<string, number> {
  // longest power path from a battery (loops cut), for the chain items
  const rank = new Map<string, number>();
  const visit = (id: string, r: number, path: Set<string>) => {
    if ((rank.get(id) ?? -1) >= r && r > 0) return;
    if (r > 0) rank.set(id, Math.max(rank.get(id) ?? 0, r));
    if (r > 40) return;
    for (const l of g.out(id, "power")) if (!path.has(l.to)) { path.add(l.to); visit(l.to, r + 1, path); path.delete(l.to); }
  };
  for (const b of batteries) visit(b, 0, new Set([b]));
  return rank;
}
const DEFAULT_COL: Partial<Record<Role, number>> = { fuse: 1, cable: 1, connector: 1, other: 1, distribution: 2, capacitor: 3 };

/** The SVG of the whole system. lookups: parts / driver lookups (as for the cable engine); cableResult: a cable engine result
 * for this project (calculated here when not given, unless options.noCableEngine). */
export function systemDiagramSvg(doc: ProjectDoc, lookups: CableLookups = {}, cableResult?: CableSystemResult, options: DiagramOptions = {}): string {
  const g = graphOf(doc);
  const cable: CableView = options.noCableEngine && !cableResult ? { result: undefined, runEnd: new Map(), runJunctionOf: new Map(), runOfCable: new Map(), runOfFuse: new Map() } : cableFor(doc, lookups, cableResult);
  const cr = cable.result;
  const linked = new Set(g.links.flatMap((l) => [l.from, l.to]));
  const nodes = doc.items.filter((it) => linked.has(it.id));
  const loose = doc.items.filter((it) => !linked.has(it.id) && !(roleOf(it) === "cable" && g.cablesInUse.has(it.id)));
  const signalItems = nodes.filter((it) => { const r = roleOf(it); return r === "headunit" || r === "dsp"; })
    .sort((a, b) => (roleOf(a) === roleOf(b) ? g.order.get(a.id)! - g.order.get(b.id)! : roleOf(a) === "headunit" ? -1 : 1));
  const groundItems = nodes.filter((it) => roleOf(it) === "ground");
  const gridItems = nodes.filter((it) => !signalItems.includes(it) && !groundItems.includes(it));

  // Columns.
  const batteries = gridItems.filter((it) => roleOf(it) === "battery").map((it) => it.id);
  const rank = powerRank(g, batteries);
  const col = new Map<string, number>();
  let chainMax = 0;
  for (const it of gridItems) {
    const r = roleOf(it);
    if (r === "battery" || r === "alternator") col.set(it.id, 0);
    else if (r !== "amplifier" && r !== "speaker") { const c = rank.get(it.id) ?? DEFAULT_COL[r] ?? 1; col.set(it.id, c); chainMax = Math.max(chainMax, c); }
  }
  const ampCol = Math.max(chainMax + 1, signalItems.length, 1);
  for (const it of gridItems) { const r = roleOf(it); if (r === "amplifier") col.set(it.id, ampCol); if (r === "speaker") col.set(it.id, ampCol + 1); }
  // A chain item placed at or after the amp column (e.g. a fuse after an amp) stays where its rank puts it; columns are compacted below.
  const maxCol = Math.max(0, ...[...col.values()]);

  // Rows per column: barycentre of the predecessors already placed, then file order.
  const rowOf = new Map<string, number>();
  const columns: Item[][] = [];
  for (let c = 0; c <= maxCol; c++) {
    const here = gridItems.filter((it) => col.get(it.id) === c);
    const key = (it: Item) => {
      if (c === 0) return roleOf(it) === "alternator" ? -1 : 0;
      const preds = g.inc(it.id).filter((l) => l.kind !== "ground" && rowOf.has(l.from) && (col.get(l.from) ?? 99) < c).map((l) => rowOf.get(l.from)!);
      return preds.length ? preds.reduce((s, x) => s + x, 0) / preds.length : 1e6;
    };
    const keyed = here.map((it) => ({ it, k: key(it) })).sort((a, b) => a.k - b.k || g.order.get(a.it.id)! - g.order.get(b.it.id)!);
    keyed.forEach((x, k) => rowOf.set(x.it.id, k));
    columns.push(keyed.map((x) => x.it));
  }
  const maxRows = Math.max(1, ...columns.map((c) => c.length));

  // Positions.
  const boxes = new Map<string, Box>();
  const colX = (c: number) => MARGIN + c * COL_W;
  const signalTop = HEADER_H;
  const gridTop = signalItems.length ? signalTop + ROW_H + 24 : HEADER_H;
  signalItems.forEach((it, i) => { const c = ampCol - signalItems.length + i; boxes.set(it.id, { id: it.id, x: colX(c), y: signalTop, w: NODE_W, h: NODE_H, band: "signal", col: c }); });
  columns.forEach((list, c) => {
    const off = ((maxRows - list.length) * ROW_H) / 2;
    list.forEach((it, k) => boxes.set(it.id, { id: it.id, x: colX(c), y: gridTop + off + k * ROW_H, w: NODE_W, h: NODE_H, band: "grid", col: c }));
  });
  const gridBottom = gridItems.length ? gridTop + maxRows * ROW_H : gridTop;
  // Ground points: under the column of the first item that links to them.
  const groundTop = gridBottom + 50;
  const usedSlots = new Map<number, number>();
  for (const it of groundItems) {
    const src = g.inc(it.id).concat(g.out(it.id)).map((l) => (l.to === it.id ? l.from : l.to)).map((id) => boxes.get(id)).find((b) => b && b.band !== "ground");
    const c = src ? src.col : 0;
    const slot = usedSlots.get(c) ?? 0; usedSlots.set(c, slot + 1);
    const perCol = 2, rowK = Math.floor(slot / perCol), inCol = slot % perCol;
    boxes.set(it.id, { id: it.id, x: colX(c) + inCol * (GROUND_W + 14) + 20, y: groundTop + rowK * (GROUND_H + 16), w: GROUND_W, h: GROUND_H, band: "ground", col: c });
  }
  const groundRows = groundItems.length ? Math.max(...[...usedSlots.values()].map((n) => Math.ceil(n / 2))) : 0;
  let y = groundItems.length ? groundTop + groundRows * (GROUND_H + 16) + 8 : gridBottom + 8;
  const width = Math.max(MARGIN * 2 + (Math.max(maxCol, ampCol + (signalItems.length ? 0 : 0), 3) + 1) * COL_W - (COL_W - NODE_W), 760);
  // Not connected area.
  let looseTop = 0, looseH = 0;
  if (loose.length) {
    looseTop = y + 18;
    const perRow = Math.max(1, Math.floor((width - 2 * MARGIN - 20) / (NODE_W + 16)));
    loose.forEach((it, k) => boxes.set(it.id, { id: it.id, x: MARGIN + 10 + (k % perRow) * (NODE_W + 16), y: looseTop + 30 + Math.floor(k / perRow) * (NODE_H + 14), w: NODE_W, h: NODE_H, band: "loose", col: -1 }));
    looseH = 30 + Math.ceil(loose.length / perRow) * (NODE_H + 14) + 4;
    y = looseTop + looseH;
  }
  const legendTop = y + 20;
  const height = legendTop + 74;

  // ---------------------------------------------------------------------------------------------------------- draw
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${px(height)}" viewBox="0 0 ${width} ${px(height)}" font-family="Arial, Helvetica, sans-serif" data-project="${esc(doc.name)}">`);
  out.push(`<title>${esc(`${options.title ?? doc.title ?? doc.name}: system wiring diagram`)}</title>`);
  out.push(`<rect x="0" y="0" width="${width}" height="${px(height)}" fill="#ffffff"/>`);
  // Header.
  const date = options.date ?? (doc.saved ? String(doc.saved).slice(0, 10) : "");
  out.push(`<text x="${MARGIN}" y="32" font-size="20" font-weight="bold" fill="#111">${esc(cut(options.title ?? doc.title ?? doc.name, 70))}</text>`);
  out.push(`<text x="${MARGIN}" y="54" font-size="13" fill="#333">System wiring diagram${date ? ` · ${esc(date)}` : ""} · ${doc.items.length} item${doc.items.length === 1 ? "" : "s"}, ${g.links.length} link${g.links.length === 1 ? "" : "s"}</text>`);
  if (cr && cr.totalMaxA > 0) out.push(`<text x="${width - MARGIN}" y="54" font-size="12" fill="#333" text-anchor="end">Design current ${f1(cr.totalMaxA)} A (music about ${f1(cr.totalMusicA)} A) at ${cr.options.supplyV} V</text>`);
  if (!nodes.length) out.push(`<text x="${MARGIN}" y="${HEADER_H + 20}" font-size="13" fill="#555">No links yet: link the items (power, ground, signal, speaker, remote) to draw the system.</text>`);

  // Links first (under the boxes).
  const laneCount = new Map<string, number>();
  const lane = (key: string) => { const n = laneCount.get(key) ?? 0; laneCount.set(key, n + 1); return n; };
  const linkSvg: string[] = [], localSymbols: string[] = [];
  g.links.forEach((l) => {
    const a = boxes.get(l.from), b = boxes.get(l.to);
    if (!a || !b) return;
    const st = LINK_STYLE[l.kind], ko = KIND_ORDER.indexOf(l.kind);
    let pts: [number, number][];
    let labelMode: "horizontal" | "lastVertical" = "horizontal";
    const localGround = (b.band === "ground" && a.band === "signal") || (a.band === "ground" && b.band === "signal");
    if (localGround) {
      // a head unit / DSP grounds locally: short stub to a ground symbol beside it (named after the ground item)
      const s = b.band === "ground" ? a : b, gnd = b.band === "ground" ? b : a;
      const gx = s.x + s.w + 16, gy = s.y + s.h + 4;
      pts = [[s.x + s.w, s.y + s.h - 8], [gx, s.y + s.h - 8], [gx, gy]];
      localSymbols.push(`<g class="local-ground" data-ground="${esc(gnd.id)}"><path d="M${px(gx - 9)} ${px(gy)} L${px(gx + 9)} ${px(gy)} M${px(gx - 5.5)} ${px(gy + 4)} L${px(gx + 5.5)} ${px(gy + 4)} M${px(gx - 2)} ${px(gy + 8)} L${px(gx + 2)} ${px(gy + 8)}" stroke="#111" stroke-width="1.8" fill="none"/><text x="${px(gx + 12)}" y="${px(gy + 8)}" font-size="9" fill="#333">${esc(cut(g.items.get(gnd.id)!.name, 18))}</text></g>`);
    } else if (b.band === "ground" || a.band === "ground") {
      // ground return: out of the right side low, down the gutter, along a lane above the ground band, down to the symbol
      const [s, gnd] = b.band === "ground" ? [a, b] : [b, a];
      const n = lane(`g${s.col}`), lx = s.x + s.w + 10 + ko * 5 + n * 4, ly = groundTop - 10 - (n % 3) * 16;
      const sy = s.band === "signal" ? s.y + s.h - 6 : s.y + PORT_Y.ground;
      pts = [[s.x + s.w, sy], [lx, sy], [lx, ly], [gnd.x + gnd.w / 2, ly], [gnd.x + gnd.w / 2, gnd.y + 6]];
    } else if (a.band === "signal" && b.band !== "signal") {
      const n = lane(`s${b.id}`), lx = b.x - 14 - ko * 6 - n * 4, ly = gridTop - 10 - ko * 6 - (lane("sigband") % 3) * 2;
      const sx = a.x + a.w / 2 + (l.kind === "remote" ? 24 : l.kind === "power" ? -24 : 0);
      pts = [[sx, a.y + a.h], [sx, ly], [lx, ly], [lx, b.y + PORT_Y[l.kind]], [b.x, b.y + PORT_Y[l.kind]]];
      if (l.kind === "signal" || l.kind === "remote") labelMode = "lastVertical";
    } else {
      const sy = a.y + (l.kind === "speaker" || l.kind === "power" ? PORT_Y.power : PORT_Y[l.kind]), ey = b.y + PORT_Y[l.kind];
      const n = lane(`in${b.id}`);
      const lx = b.x - 18 - ko * 6 - n * 5;
      if (b.col - a.col > 1 && Math.abs(sy - ey) > 1) {
        // skip columns between rows, not through boxes
        const gy = Math.min(a.y, b.y) - (ROW_H - NODE_H) / 2 - (n % 3) * 4, sx2 = a.x + a.w + 14 + ko * 5;
        pts = [[a.x + a.w, sy], [sx2, sy], [sx2, gy], [lx, gy], [lx, ey], [b.x, ey]];
      } else if (b.col <= a.col && b.band === a.band) {
        // backwards (or same column): loop below the source
        const gy = Math.max(a.y + a.h, b.y + b.h) + 10 + (n % 3) * 4, sx2 = a.x + a.w + 14 + ko * 5;
        pts = [[a.x + a.w, sy], [sx2, sy], [sx2, gy], [lx, gy], [lx, ey], [b.x, ey]];
      } else pts = [[a.x + a.w, sy], [lx, sy], [lx, ey], [b.x, ey]];
    }
    pts = simplify(pts);
    const d = pts.map((p, k) => `${k ? "L" : "M"}${px(p[0])} ${px(p[1])}`).join(" ");
    // Label.
    const label = linkLabel(l, g, lookups, cr, cable);
    const cab = l.cableItemId ? g.items.get(l.cableItemId) : undefined;
    const tip = `${g.items.get(l.from)!.name}${l.fromPort ? ` (${l.fromPort})` : ""} -> ${g.items.get(l.to)!.name}${l.toPort ? ` (${l.toPort})` : ""}: ${l.kind}${cab ? `, cable ${cab.name}` : ""}${l.note ? `, ${l.note}` : ""}`;
    linkSvg.push(`<g class="link link-${l.kind}" data-link="${esc(`${l.from}/${l.to}/${l.kind}`)}"${cab ? ` data-cable="${esc(cab.id)}"` : ""}><title>${esc(tip)}</title>`);
    linkSvg.push(`<path d="${d}" fill="none" stroke="${st.color}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""} stroke-linejoin="round" stroke-linecap="${l.kind === "signal" ? "round" : "butt"}"/>`);
    if (label.length) {
      // where: the longest segment (ground: the longest horizontal one of at least 40 px, along its lane); signal / remote from the top band:
      // the last vertical segment, text to its left (clear of the target box)
      const segs = pts.slice(1).map((p, k) => ({ k: k + 1, L: Math.abs(p[0] - pts[k][0]) + Math.abs(p[1] - pts[k][1]), horiz: Math.abs(p[1] - pts[k][1]) < 0.5 }));
      let seg = labelMode === "lastVertical" ? [...segs].reverse().find((x) => !x.horiz && x.L >= 12) : undefined;
      const anchorEnd = !!seg;
      if (!seg) { const hs = l.kind === "ground" ? segs.filter((x) => x.horiz && x.L >= 40) : []; seg = (hs.length ? hs : segs).reduce((a2, b2) => (b2.L > a2.L + 0.5 ? b2 : a2)); }
      const [p0, p1] = [pts[seg.k - 1], pts[seg.k]], horiz = seg.horiz;
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      label.forEach((t, k) => {
        const tx = horiz ? mx : anchorEnd ? mx - 4 : mx + 5, ty = horiz ? my - 5 - (label.length - 1 - k) * 11 : my - ((label.length - 1) * 11) / 2 + k * 11 + 4;
        linkSvg.push(`<text x="${px(tx)}" y="${px(ty)}" font-size="10" fill="${st.color === "#111111" ? "#111" : st.color}" text-anchor="${horiz ? "middle" : anchorEnd ? "end" : "start"}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(t)}</text>`);
      });
    }
    linkSvg.push(`</g>`);
  });

  // Not connected frame.
  if (loose.length) {
    out.push(`<g class="not-connected"><rect x="${MARGIN}" y="${px(looseTop)}" width="${width - 2 * MARGIN}" height="${px(looseH)}" fill="#fafafa" stroke="#999" stroke-dasharray="5 4" rx="6"/>`);
    out.push(`<text x="${MARGIN + 10}" y="${px(looseTop + 19)}" font-size="12" font-weight="bold" fill="#555">Not connected (in the project, no links yet)</text></g>`);
  }
  if (signalItems.length) out.push(`<text x="${MARGIN}" y="${signalTop - 6}" font-size="10" fill="#777">SIGNAL PATH</text>`);
  out.push(...linkSvg, ...localSymbols);

  // Boxes.
  for (const it of doc.items) {
    const b = boxes.get(it.id); if (!b) continue;
    const r = roleOf(it), detail = nodeDetail(it, lookups, cr, cable);
    out.push(`<g class="item item-${esc(r)}" data-item="${esc(it.id)}" data-kind="${esc(it.kind)}"><title>${esc(`${it.name} (${it.kind})${detail ? `: ${detail}` : ""}`)}</title>`);
    if (r === "ground" && b.band === "ground") {
      const cx = b.x + b.w / 2, top = b.y + 6;
      out.push(`<path d="M${px(cx)} ${px(top)} L${px(cx)} ${px(top + 12)} M${px(cx - 16)} ${px(top + 12)} L${px(cx + 16)} ${px(top + 12)} M${px(cx - 10)} ${px(top + 18)} L${px(cx + 10)} ${px(top + 18)} M${px(cx - 4)} ${px(top + 24)} L${px(cx + 4)} ${px(top + 24)}" stroke="#111" stroke-width="2" fill="none"/>`);
      out.push(`<text x="${px(cx)}" y="${px(top + 40)}" font-size="11" text-anchor="middle" fill="#111">${esc(cut(it.name, 20))}</text>`);
      out.push(`<text x="${px(cx)}" y="${px(top + 52)}" font-size="9" text-anchor="middle" fill="#555">GROUND (chassis)</text>`);
    } else {
      out.push(`<rect x="${px(b.x)}" y="${px(b.y)}" width="${b.w}" height="${b.h}" rx="6" fill="${ROLE_FILL[r]}" stroke="#333" stroke-width="1.3"${b.band === "loose" ? ` stroke-dasharray="4 3"` : ""}/>`);
      if (r === "battery") out.push(`<text x="${px(b.x + b.w - 8)}" y="${px(b.y + 14)}" font-size="12" font-weight="bold" text-anchor="end" fill="#b00">+ −</text>`);
      if (r === "fuse") out.push(`<path d="M${px(b.x + b.w - 34)} ${px(b.y + 10)} h6 m18 0 h6 M${px(b.x + b.w - 28)} ${px(b.y + 10)} q4 -6 9 0 q5 6 9 0" stroke="#333" stroke-width="1.4" fill="none"/>`);
      out.push(`<text x="${px(b.x + 8)}" y="${px(b.y + 14)}" font-size="9" fill="#555" letter-spacing="0.4">${esc(kindTag(it))}</text>`);
      out.push(`<text x="${px(b.x + 8)}" y="${px(b.y + 32)}" font-size="12.5" font-weight="bold" fill="#111">${esc(cut(it.name, 24))}</text>`);
      if (detail) out.push(`<text x="${px(b.x + 8)}" y="${px(b.y + 50)}" font-size="10.5" fill="#333">${esc(cut(detail, 32))}</text>`);
    }
    out.push(`</g>`);
  }

  // Legend.
  out.push(`<g class="legend"><text x="${MARGIN}" y="${px(legendTop + 4)}" font-size="11" font-weight="bold" fill="#333">Legend</text>`);
  KIND_ORDER.forEach((k, i) => {
    const st = LINK_STYLE[k], lx = MARGIN + (i % 3) * 250, ly = legendTop + 22 + Math.floor(i / 3) * 20;
    out.push(`<path d="M${lx} ${px(ly)} h46" stroke="${st.color}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""} fill="none"/><text x="${lx + 54}" y="${px(ly + 4)}" font-size="11" fill="#222">${esc(st.label)}</text>`);
  });
  out.push(`<text x="${MARGIN + 500}" y="${px(legendTop + 46)}" font-size="9.5" fill="#666">Cable labels: size, length; "rec." = size the cable calculator recommends (no cable chosen).</text></g>`);
  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

/** Drop repeated points and points in the middle of a straight line. */
function simplify(pts: [number, number][]): [number, number][] {
  const q = pts.filter((p, k) => k === 0 || Math.abs(p[0] - pts[k - 1][0]) > 0.01 || Math.abs(p[1] - pts[k - 1][1]) > 0.01);
  return q.filter((p, k) => {
    if (k === 0 || k === q.length - 1) return true;
    const a = q[k - 1], b = q[k + 1];
    return !((Math.abs(a[0] - p[0]) < 0.01 && Math.abs(b[0] - p[0]) < 0.01) || (Math.abs(a[1] - p[1]) < 0.01 && Math.abs(b[1] - p[1]) < 0.01));
  });
}
function linkLabel(l: ItemLink, g: SysGraph, lk: CableLookups, cr: CableSystemResult | undefined, cv: CableView): string[] {
  const cab = l.cableItemId ? g.items.get(l.cableItemId) : undefined, t = cableText(cab), lines: string[] = [];
  const ports = [l.fromPort, l.toPort].filter(Boolean).join(" \u2192 ");
  if (l.kind === "power") {
    let size = t.size;
    if (!size && cr) {
      // the run this link belongs to: by its cable item, else the run that ends at the link's target
      const runId = (l.cableItemId && cv.runOfCable.get(l.cableItemId)) || [...cv.runEnd].find(([, end]) => end === l.to)?.[0];
      const run = runId ? cr.runs.find((r) => r.id === runId) : undefined;
      if (run?.used?.size) size = run.chosen ? `${run.used.size} AWG` : `rec. ${run.used.size} AWG`;
    }
    if (size) lines.push(size);
    if (t.len) lines.push(t.len);
  } else if (l.kind === "speaker") {
    const tgt = g.items.get(l.to);
    const z = tgt ? itemLoadOhm(tgt, lk).ohm : undefined;
    const sp = cr?.speakers.find((s) => s.id === `${l.from}>${l.to}`);
    const size = t.size ?? (sp?.recommendedAwg ? `rec. ${sp.recommendedAwg} AWG` : undefined);
    const first = [z ? `${f1(z)} ohm` : "", ports].filter(Boolean).join(", "); if (first) lines.push(first);
    const c = [size, t.len].filter(Boolean).join(", "); if (c) lines.push(c);
  } else if (l.kind === "ground") {
    const c = [t.size, t.len].filter(Boolean).join(", "); if (c) lines.push(c);
  } else if (ports) lines.push(ports);
  return lines;
}
