// Small SVG line plot with log-frequency x axis, legend and hover read-out.
export interface Series { name: string; x: number[]; y: number[]; color: string; dash?: string; width?: number }
export interface PlotOpts { title: string; yLabel: string; xMin?: number; xMax?: number; yMin?: number; yMax?: number; hLines?: { y: number; label: string; color: string }[]; height?: number }
const NS = "http://www.w3.org/2000/svg";
export const PALETTE = ["#e8e8e8", "#4ea1ff", "#ff9f43", "#2ed573", "#ff6b81", "#a29bfe", "#feca57", "#48dbfb"];

export function plot(host: HTMLElement, series: Series[], o: PlotOpts) {
  host.innerHTML = "";
  const W = Math.max(320, host.clientWidth || 600), H = o.height ?? 260, L = 52, R = 12, T = 26, B = 34;
  const xMin = o.xMin ?? 10, xMax = o.xMax ?? 300;
  const ys = series.flatMap((s) => s.y.filter((v, i) => s.x[i] >= xMin && s.x[i] <= xMax && isFinite(v)));
  for (const h of o.hLines ?? []) ys.push(h.y);
  let yMin = o.yMin ?? Math.min(...ys), yMax = o.yMax ?? Math.max(...ys);
  if (!isFinite(yMin) || !isFinite(yMax)) { yMin = 0; yMax = 1; }
  if (yMax - yMin < 1e-9) { yMax += 1; yMin -= 1; }
  const step = niceStep((yMax - yMin) / 6); yMin = Math.floor(yMin / step) * step; yMax = Math.ceil(yMax / step) * step;
  const X = (f: number) => L + ((Math.log10(f) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "plot" });
  svg.appendChild(el("text", { x: L, y: 16, class: "ptitle" }, o.title));
  svg.appendChild(el("text", { x: 12, y: T + (H - T - B) / 2, class: "plabel", transform: `rotate(-90 12 ${T + (H - T - B) / 2})` }, o.yLabel));
  for (const f of [10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 500, 1000]) if (f >= xMin && f <= xMax) {
    svg.appendChild(el("line", { x1: X(f), x2: X(f), y1: T, y2: H - B, class: "grid" }));
    svg.appendChild(el("text", { x: X(f), y: H - B + 14, class: "tick", "text-anchor": "middle" }, String(f)));
  }
  svg.appendChild(el("text", { x: W - R, y: H - 4, class: "tick", "text-anchor": "end" }, "Hz"));
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    svg.appendChild(el("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: "grid" }));
    svg.appendChild(el("text", { x: L - 6, y: Y(v) + 4, class: "tick", "text-anchor": "end" }, fmt(v)));
  }
  for (const h of o.hLines ?? []) {
    svg.appendChild(el("line", { x1: L, x2: W - R, y1: Y(h.y), y2: Y(h.y), stroke: h.color, "stroke-dasharray": "6 4", "stroke-width": 1.5 }));
    svg.appendChild(el("text", { x: W - R - 4, y: Y(h.y) - 4, class: "tick", "text-anchor": "end", fill: h.color }, h.label));
  }
  const clipId = "c" + Math.random().toString(36).slice(2);
  const defs = el("defs", {}); const cp = el("clipPath", { id: clipId }); cp.appendChild(el("rect", { x: L, y: T, width: W - L - R, height: H - T - B })); defs.appendChild(cp); svg.appendChild(defs);
  series.forEach((s) => {
    let d = ""; s.x.forEach((f, i) => { if (f < xMin * 0.98 || f > xMax * 1.02 || !isFinite(s.y[i])) return; d += (d ? "L" : "M") + X(f).toFixed(1) + "," + Y(s.y[i]).toFixed(1); });
    svg.appendChild(el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width ?? 2, "stroke-dasharray": s.dash ?? "", "clip-path": `url(#${clipId})` }));
  });
  // hover
  const cursor = el("line", { y1: T, y2: H - B, class: "cursor", visibility: "hidden" }); svg.appendChild(cursor);
  const tip = document.createElement("div"); tip.className = "tip"; tip.style.display = "none";
  svg.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect(); const px = e.clientX - r.left;
    if (px < L || px > W - R) { tip.style.display = "none"; cursor.setAttribute("visibility", "hidden"); return; }
    const f = 10 ** (Math.log10(xMin) + ((px - L) / (W - L - R)) * (Math.log10(xMax) - Math.log10(xMin)));
    cursor.setAttribute("x1", String(px)); cursor.setAttribute("x2", String(px)); cursor.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${f.toFixed(1)} Hz</b>` + series.map((s) => { const i = nearest(s.x, f); return `<div><span style="color:${s.color}">■</span> ${esc(s.name)}: ${fmt(s.y[i])}</div>`; }).join("");
    tip.style.display = "block"; tip.style.left = Math.min(px + 12, W - 180) + "px"; tip.style.top = "30px";
  });
  svg.addEventListener("mouseleave", () => { tip.style.display = "none"; cursor.setAttribute("visibility", "hidden"); });
  host.style.position = "relative"; host.appendChild(svg); host.appendChild(tip);
  const leg = document.createElement("div"); leg.className = "plegend";
  leg.innerHTML = series.map((s) => `<span><i style="border-top:3px ${s.dash ? "dashed" : "solid"} ${s.color}"></i>${esc(s.name)}</span>`).join("");
  host.appendChild(leg);
  return svg;
}
function nearest(xs: number[], f: number) { let b = 0; for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - f) < Math.abs(xs[b] - f)) b = i; return b; }
function niceStep(r: number) { const p = 10 ** Math.floor(Math.log10(r)); const m = r / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
function el(tag: string, attrs: Record<string, any>, text?: string) {
  const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; return e;
}
