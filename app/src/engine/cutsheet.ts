// Cut sheets for free-form wood boxes: one true outline per panel (outside face, mitred joints), the blade tilt for every edge,
// driver/port holes; as SVG (to print) and DXF R12 (for CNC). Units mm.
import { DxfEntity, writeDXF } from "../io/meshio";
import { P2 } from "./mesh";
import { Panel } from "./panels";

export interface Hole { panel: string; uv: P2; r: number; label: string } // m
interface Laid { p: Panel; pts: P2[]; ox: number; oy: number; w: number; h: number; minx: number; miny: number }
function layout(panels: Panel[], gap = 60, maxRow = 2400): Laid[] {
  let x = 0, y = 0, rowH = 0; const out: Laid[] = [];
  for (const p of panels) {
    const pts = p.outline.map(([u, v]) => [u * 1000, v * 1000] as P2);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const minx = Math.min(...xs), miny = Math.min(...ys), w = Math.max(...xs) - minx, h = Math.max(...ys) - miny;
    if (x > 0 && x + w > maxRow) { x = 0; y += rowH + gap + 40; rowH = 0; }
    out.push({ p, pts, ox: x - minx, oy: y - miny, w, h, minx, miny }); x += w + gap; rowH = Math.max(rowH, h);
  }
  return out;
}
const edgeNote = (p: Panel, i: number) => { const e = p.edges[i]; return Math.abs(e.interiorDeg - 180) < 0.05 ? "" : `${e.bladeDeg.toFixed(1)}°${e.convex ? "" : " (inside)"}`; };

export function panelDxf(panels: Panel[], o: { title: string; thickness: (name: string) => number; holes?: Hole[] }): string {
  const ents: DxfEntity[] = [];
  for (const L of layout(panels)) {
    const pts = L.pts.map(([x, y]) => [x + L.ox, y + L.oy] as P2);
    ents.push({ kind: "poly", layer: "CUT", pts });
    ents.push({ kind: "text", layer: "TEXT", at: [L.ox + L.minx, L.oy + L.miny - 25], h: 14, text: `${L.p.name} ${o.thickness(L.p.name)} mm` });
    pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; const n = edgeNote(L.p, i); if (n) ents.push({ kind: "text", layer: "BEVEL", at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h: 9, text: n }); });
    for (const h of o.holes ?? []) if (h.panel === L.p.name) ents.push({ kind: "circle", layer: "HOLES", c: [h.uv[0] * 1000 + L.ox, h.uv[1] * 1000 + L.oy], r: h.r * 1000 });
  }
  return writeDXF(ents);
}
export function panelSvg(panels: Panel[], o: { title: string; thickness: (name: string) => number; holes?: Hole[] }): string {
  const lay = layout(panels); const s = 0.4;
  const W = Math.max(400, ...lay.map((l) => l.ox + l.minx + l.w)) * s + 40, H = Math.max(...lay.map((l) => l.oy + l.miny + l.h)) * s + 80;
  let body = "";
  for (const L of lay) {
    // SVG y goes down: flip each panel so "up" in the panel frame is up on paper
    const tx = (q: P2): P2 => [20 + (q[0] + L.ox) * s, H - 20 - (q[1] + L.oy) * s];
    const pts = L.pts.map(tx);
    body += `<polygon points="${pts.map((q) => q.join(",")).join(" ")}" fill="#f3e3c3" stroke="#333"/>`;
    const c = tx([L.minx + L.w / 2, L.miny + L.h / 2]);
    body += `<text x="${c[0]}" y="${c[1]}" font-size="13" text-anchor="middle">${L.p.name} (${o.thickness(L.p.name)} mm)</text>`;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]; const len = (L.p.edges[i]?.length ?? 0) * 1000; const n = edgeNote(L.p, i);
      body += `<text x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2}" font-size="10" fill="#7a2" text-anchor="middle">${len.toFixed(0)}${n ? " · " + n : ""}</text>`;
    });
    for (const h of o.holes ?? []) if (h.panel === L.p.name) { const q = tx([h.uv[0] * 1000, h.uv[1] * 1000]); body += `<circle cx="${q[0]}" cy="${q[1]}" r="${h.r * 1000 * s}" fill="none" stroke="#c33"/><text x="${q[0]}" y="${q[1] + 4}" font-size="10" text-anchor="middle" fill="#c33">${h.label}</text>`; }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><text x="10" y="18" font-size="14">${o.title}: panels (outside face, mm). Green: edge length · table-saw blade tilt for a mitre (0° = square cut). Red: holes.</text>${body}</svg>`;
}
