// Design tab, multi-chamber and isobaric boxes (Term-PRO parity): 4th/6th-order bandpass, 3-chamber bandpass, isobaric pairs.
// Simulated with the general network (engine/network.ts); starting values from the bandpass cookbook where one exists.
import { Air } from "../engine/air";
import { bandpass4, qb3, sbb4, sealedVbForQtc } from "../engine/alignments";
import { FullParams } from "../engine/driver";
import { branchLength, buildNetwork, NetResult, simulateNet, Topology, TopologyInputs, TOPOLOGY_INFO } from "../engine/network";
import { freqs } from "../engine/model";
import { portDisplacement } from "../engine/port";
import { DesignInputs } from "./model";
import { Model3D } from "./view3d";

/** Fill missing chamber inputs with starting values (stated as such in the UI). */
export function seedAdvanced(ds: DesignInputs, fp: FullParams, n: number) {
  const topo = ds.topology ?? ds.kind;
  const iso = !!ds.isobaric; const Vas = iso ? fp.Vas / 2 : fp.Vas; // compound pair: Vas halves, fs and Qts unchanged
  const L = (m3: number) => Math.round(m3 * 1000 * n * 10) / 10;
  const sdCm2 = fp.Sd * 1e4;
  const key = `${topo}|${iso}`;
  if ((ds as any)._seed === key) return;
  (ds as any)._seed = key;
  const pa = Math.round(Math.max(40, sdCm2 * 0.3) * n);
  ds.pa1 = pa; ds.pa2 = pa; ds.pa3 = pa; ds.isoWiring ??= "parallel"; ds.isoGapL ??= 1;
  if (topo === "sealed") { const v = sealedVbForQtc(fp.Qts, Vas, 0.707); ds.V1 = L(v > 0 ? v : Vas); }
  else if (topo === "vented") { const a = fp.Qts < 0.383 ? qb3(fp.Qts) : sbb4(fp.Qts); ds.V1 = L(Vas / a.alpha); ds.fb1 = Math.round(a.h * fp.fs * 10) / 10; }
  else {
    const S = 0.7 as const; const r = bandpass4(fp.fs, fp.Qts, Vas, S);
    ds.V1 = L(r.Vr); ds.V2 = L(r.Vf); ds.fb2 = Math.round(r.fb * 10) / 10;
    ds.fb1 = Math.round(0.8 * fp.fs * 10) / 10; ds.V3 = Math.round(ds.V2 * 0.6 * 10) / 10; ds.fb3 = Math.round(r.fb * 1.4 * 10) / 10;
  }
}

export interface AdvancedResult { net: NetResult; ti: TopologyInputs; ports: { name: string; area: number; dMm: number; lengthMm: number; vmax: number }[]; xmaxMm: number; model: Partial<Model3D> & { W: number; H: number; D: number }; problems: string[]; grossL: number }
export function advancedDesign(fp: FullParams & { displacement?: number }, ds: DesignInputs, n: number, Vrms: number, air: Air, driverDepthM = 0): AdvancedResult {
  const topo = (ds.topology ?? ds.kind) as Topology;
  const ti: TopologyInputs = { topology: topo, isobaric: !!ds.isobaric, isoWiring: ds.isoWiring ?? "parallel", isoGapL: ds.isoGapL ?? 1, drivers: n,
    V1: ds.V1 ?? 50, V2: ds.V2 ?? 40, V3: ds.V3 ?? 20, fb1: ds.fb1 ?? 30, fb2: ds.fb2 ?? 50, fb3: ds.fb3 ?? 60, portAreaCm2: [ds.pa1 ?? 80, ds.pa2 ?? 80, ds.pa3 ?? 80] };
  const netw = buildNetwork(fp, ti, air);
  const F = freqs(10, 300, 48);
  const net = simulateNet(netw, Vrms, air, F);
  const problems: string[] = [];
  const count = Math.max(1, ds.portCount);
  const ports = netw.ports.map((p, j) => { const b = branchLength(p, count, n); const vmax = Math.max(...net.vport[j]); return { name: p.name, area: p.Sv * n * 1e4, dMm: b.dMm, lengthMm: b.lengthMm, vmax }; });
  for (const p of ports) {
    if (p.lengthMm < 20) problems.push(`${p.name}: shorter than 20 mm; use a smaller port area.`);
    if (p.vmax > 17) problems.push(`${p.name}: peak air speed ${p.vmax.toFixed(1)} m/s (over ~17 m/s, rule of thumb): use more port area.`);
  }
  const xmaxMm = Math.max(...net.xmm.map((x) => Math.max(...x)));
  if (fp.Xmax > 0 && xmaxMm > fp.Xmax * 1000) problems.push(`Cone travel up to ${xmaxMm.toFixed(1)} mm (Xmax ${(fp.Xmax * 1000).toFixed(1)} mm) at this power: lower the power or add a subsonic filter.`);
  // rectangular build: chambers one behind the other inside the max W × H (outside), panel t
  const t = ds.t / 1000; const Wi = ds.maxW / 1000 - 2 * t, Hi = ds.maxH / 1000 - 2 * t;
  const pdisp = ports.reduce((s, p) => s + portDisplacement({ shape: "round", count, d: p.dMm / 1000, length: Math.max(0, p.lengthMm) / 1000 }, t), 0);
  const vols = TOPOLOGY_INFO[topo].chambers.map((_, i) => [ti.V1, ti.V2, ti.V3][i] / 1000);
  const disp = (fp.displacement ?? 0) * n * (ti.isobaric ? 2 : 1) + ds.bracesL / 1000;
  // from the front: third chamber (if any), front chamber, rear chamber
  const order = vols.length === 3 ? [2, 1, 0] : vols.length === 2 ? [1, 0] : [0];
  const depths = order.map((i) => (vols[i] + (i === order[0] ? pdisp : 0) + (i === 0 ? disp : 0)) / (Wi * Hi));
  const DiTot = depths.reduce((a, b) => a + b, 0) + t * (depths.length - 1);
  const dividers: number[] = []; let acc = 0;
  for (let k = 0; k < depths.length - 1; k++) { acc += depths[k] + (k ? t : 0); dividers.push((acc + t / 2) / DiTot); }
  const D = DiTot + 2 * t;
  if (D * 1000 > ds.maxD) problems.push(`Needs ${Math.round(D * 1000)} mm depth at ${ds.maxW} × ${ds.maxH} mm (max ${ds.maxD}). Raise the width/height or lower the volumes.`);
  const needDepth = driverDepthM * (ti.isobaric ? 2 : 1) + (ti.isobaric ? 0.01 : 0);
  const room = ti.topology.startsWith("bp") ? D - 2 * t : DiTot; // bandpass: the driver sits on an inner wall, check against the whole inside depth
  if (needDepth > 0 && room < needDepth) problems.push(`The box is only ${Math.round(room * 1000)} mm deep inside, but the driver${ti.isobaric ? " pair" : ""} needs about ${Math.round(needDepth * 1000)} mm: reduce the width or height so the box gets deeper.`);
  const grossL = vols.reduce((a, b) => a + b, 0) * 1000;
  const model = { W: ds.maxW / 1000, H: ds.maxH / 1000, D, t, dividers, driverWall: dividers.length ? dividers.length - 1 : undefined };
  return { net, ti, ports, xmaxMm, model, problems, grossL };
}
export const topologyOptions = (): [string, string][] => (Object.keys(TOPOLOGY_INFO) as Topology[]).map((k) => [k, TOPOLOGY_INFO[k].name]);
export { TOPOLOGY_INFO };
