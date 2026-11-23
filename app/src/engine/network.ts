// General acoustic network for multi-chamber boxes (research_c §4 and §6: "Every bandpass is fully covered by the general circuit";
// "Bandpass and PR: add the branches in the same way"). Chambers are acoustic compliances (with leakage), ports are mass +
// resistance branches between two chambers or a chamber and the outside, drivers sit between two nodes (front / back).
// Solved per frequency as a complex linear system: chamber pressures, cone velocities, coil currents.
// Covers: sealed, vented, 4th-order bandpass, 6th-order (dual-reflex) bandpass, 3-chamber bandpass, isobaric (compound) pairs.
import { Air, AIR_20C, P_REF } from "./air";
import { C, abs, add, arg, c, div, inv, mul, scale, sub } from "./complex";
import { FullParams } from "./driver";
import { butterHP, Cabin, cabinGainDb } from "./filters";
import { freqs } from "./model";

export const OUT = -1; // the outside (radiates into the listening space)
export interface Chamber { name: string; V: number; QL?: number }               // net acoustic volume m³; leakage Q (default 7 if ported, 100 if sealed)
export interface PortBranch { name: string; from: number; to: number; Sv: number; Leff: number; QP?: number } // total area of the branch m², effective length m
export interface DriverEl { p: FullParams; front: number; back: number; reversed?: boolean } // cone moves from back node towards front node
export interface Network { chambers: Chamber[]; ports: PortBranch[]; drivers: DriverEl[]; wiring: "parallel" | "series" }
export interface NetResult { f: number[]; spl: number[]; xmm: number[][]; vport: number[][]; zmag: number[]; zph: number[]; gdMs: number[]; pChamber: number[][] }

/** Gaussian elimination with partial pivoting on complex numbers. */
export function solveC(A: C[][], b: C[]): C[] {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let p = col; for (let r = col + 1; r < n; r++) if (abs(M[r][col]) > abs(M[p][col])) p = r;
    [M[col], M[p]] = [M[p], M[col]];
    const piv = M[col][col]; if (abs(piv) === 0) throw new Error("singular network");
    for (let r = 0; r < n; r++) {
      if (r === col) continue; const f = div(M[r][col], piv); if (f.re === 0 && f.im === 0) continue;
      for (let k = col; k <= n; k++) M[r][k] = sub(M[r][k], mul(f, M[col][k]));
    }
  }
  return M.map((r, i) => div(r[n], r[i]));
}

/** Reference angular frequency of a chamber for the leakage-Q definition: Helmholtz frequency of an attached port, else the
 * sealed resonance of the driver on it (matches model.ts for sealed and vented boxes). */
function chamberRef(net: Network, i: number, air: Air): number {
  const rc2 = air.rho * air.c * air.c; const Ci = net.chambers[i].V / rc2;
  const port = net.ports.find((p) => p.from === i || p.to === i);
  if (port) return 1 / Math.sqrt(((air.rho * port.Leff) / port.Sv) * Ci);
  const d = net.drivers.find((x) => x.front === i || x.back === i);
  if (d) return 2 * Math.PI * d.p.fs * Math.sqrt(1 + d.p.Vas / net.chambers[i].V);
  return 2 * Math.PI * 30;
}

export function simulateNet(net: Network, Vrms: number, air: Air = AIR_20C, fs = freqs(10, 300, 48), hp?: { hz: number; order: number }, cabin?: Cabin): NetResult {
  const rc2 = air.rho * air.c * air.c;
  const Cn = net.chambers.length, K = net.drivers.length;
  const series = net.wiring === "series";
  const nI = series ? 1 : K;
  const N = Cn + K + nI;
  const Cc = net.chambers.map((ch) => ch.V / rc2);
  const RL = net.chambers.map((ch, i) => {
    const ported = net.ports.some((p) => p.from === i || p.to === i);
    const QL = ch.QL ?? (ported ? 7 : 100); return QL / (chamberRef(net, i, air) * Cc[i]);
  });
  const MAP = net.ports.map((p) => (air.rho * p.Leff) / p.Sv);
  const RAP = net.ports.map((p, j) => { const ci = p.from >= 0 ? Cc[p.from] : Cc[p.to]; const wp = 1 / Math.sqrt(MAP[j] * ci); return (wp * MAP[j]) / (p.QP ?? 100); });
  const out: NetResult = { f: fs, spl: [], xmm: net.drivers.map(() => []), vport: net.ports.map(() => []), zmag: [], zph: [], gdMs: [], pChamber: net.chambers.map(() => []) };
  const phases: number[] = [];
  for (const f of fs) {
    const w = 2 * Math.PI * f; const jw = c(0, w);
    const A: C[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => c(0)));
    const b: C[] = Array.from({ length: N }, () => c(0));
    const P = (i: number) => i, U = (k: number) => Cn + k, I = (k: number) => Cn + K + (series ? 0 : k);
    const Zp = net.ports.map((_, j) => add(mul(jw, c(MAP[j])), c(RAP[j])));
    // chamber continuity: (jωC + 1/RL) p_i + Σ_ports (p_i − p_other)/Zp − Σ_drivers (±Sd u) = 0
    for (let i = 0; i < Cn; i++) {
      A[P(i)][P(i)] = add(A[P(i)][P(i)], add(mul(jw, c(Cc[i])), c(1 / RL[i])));
      net.ports.forEach((p, j) => {
        const y = inv(Zp[j]);
        if (p.from === i || p.to === i) {
          A[P(i)][P(i)] = add(A[P(i)][P(i)], y);
          const other = p.from === i ? p.to : p.from; if (other >= 0) A[P(i)][P(other)] = sub(A[P(i)][P(other)], y);
        }
      });
      net.drivers.forEach((d, k) => {
        if (d.front === i) A[P(i)][U(k)] = sub(A[P(i)][U(k)], c(d.p.Sd)); // cone pushes air into the front chamber
        if (d.back === i) A[P(i)][U(k)] = add(A[P(i)][U(k)], c(d.p.Sd));
      });
    }
    // mechanics: Zm u + Sd (p_front − p_back) − Bl i = 0
    net.drivers.forEach((d, k) => {
      const Zm = add(add(mul(jw, c(d.p.Mms)), c(d.p.Rms)), inv(mul(jw, c(d.p.Cms))));
      const sgn = d.reversed ? -1 : 1; // reversed polarity (e.g. a clamshell isobaric pair wired out of phase)
      A[U(k)][U(k)] = Zm;
      if (d.front >= 0) A[U(k)][P(d.front)] = add(A[U(k)][P(d.front)], c(d.p.Sd));
      if (d.back >= 0) A[U(k)][P(d.back)] = sub(A[U(k)][P(d.back)], c(d.p.Sd));
      A[U(k)][I(k)] = add(A[U(k)][I(k)], c(-d.p.Bl * sgn));
    });
    // electrical: parallel: Ze_k i_k + Bl u_k = V ; series: Σ (Ze_k i + Bl u_k) = V
    const hpG = hp ? butterHP(f, hp.hz, hp.order) : c(1);
    const V = scale(hpG, Vrms);
    net.drivers.forEach((d, k) => {
      const Ze = add(c(d.p.Re), mul(jw, c(d.p.Le))); const sgn = d.reversed ? -1 : 1;
      const row = I(k);
      A[row][I(k)] = add(A[row][I(k)], Ze);
      A[row][U(k)] = add(A[row][U(k)], c(d.p.Bl * sgn));
      if (!series || k === 0) b[row] = V;
    });
    const x = solveC(A, b);
    // radiated volume velocity
    let Uo = c(0);
    for (let i = 0; i < Cn; i++) Uo = add(Uo, scale(x[P(i)], 1 / RL[i]));
    net.ports.forEach((p, j) => {
      const pf = p.from >= 0 ? x[P(p.from)] : c(0), pt = p.to >= 0 ? x[P(p.to)] : c(0);
      const q = div(sub(pf, pt), Zp[j]); // flow from → to
      if (p.to === OUT) Uo = add(Uo, q); if (p.from === OUT) Uo = sub(Uo, q);
      out.vport[j].push((Math.SQRT2 * abs(q)) / p.Sv);
    });
    net.drivers.forEach((d, k) => {
      const Ucone = scale(x[U(k)], d.p.Sd);
      if (d.front === OUT) Uo = add(Uo, Ucone); if (d.back === OUT) Uo = sub(Uo, Ucone);
      out.xmm[k].push((Math.SQRT2 * abs(div(x[U(k)], jw))) * 1000);
    });
    const p = scale(mul(jw, Uo), air.rho / (2 * Math.PI));
    out.spl.push(20 * Math.log10(abs(p) / P_REF + 1e-30) + cabinGainDb(f, cabin));
    let Itot = c(0); if (series) Itot = x[I(0)]; else for (let k = 0; k < K; k++) Itot = add(Itot, x[I(k)]);
    const Zin = div(V, Itot); out.zmag.push(abs(Zin)); out.zph.push((arg(Zin) * 180) / Math.PI);
    for (let i = 0; i < Cn; i++) out.pChamber[i].push(abs(x[P(i)]));
    phases.push(arg(p));
  }
  const ph = phases.slice(); for (let i = 1; i < ph.length; i++) { let d = ph[i] - ph[i - 1]; while (d > Math.PI) { ph[i] -= 2 * Math.PI; d -= 2 * Math.PI; } while (d < -Math.PI) { ph[i] += 2 * Math.PI; d += 2 * Math.PI; } }
  for (let k = 0; k < fs.length; k++) { const a = Math.max(0, k - 1), bb = Math.min(fs.length - 1, k + 1); out.gdMs.push((-(ph[bb] - ph[a]) / (2 * Math.PI * (fs[bb] - fs[a]))) * 1000); }
  return out;
}

// ---------- topologies ----------
export type Topology = "sealed" | "vented" | "bp4" | "bp6" | "bp3" | "bp3dual";
export interface TopologyInputs {
  topology: Topology; isobaric: boolean; isoWiring: "parallel" | "series"; isoGapL: number; // isobaric coupling chamber, L
  drivers: number;                                       // driver positions (each one driver, or one isobaric pair)
  V1: number; V2: number; V3: number;                    // L: rear (or only) chamber, front chamber, third chamber
  fb1: number; fb2: number; fb3: number;                 // Hz: port of chamber 1 (vented / bp6 rear / bp3dual rear), chamber 2, chamber 3
  portAreaCm2: [number, number, number];                 // total port area per chamber, cm²
}
/** Chamber/port layout and its plain-words description. Port 1 = from chamber 1, etc. */
export const TOPOLOGY_INFO: Record<Topology, { name: string; chambers: string[]; text: string }> = {
  sealed: { name: "Sealed", chambers: ["Box"], text: "Driver on the box; the box is airtight." },
  vented: { name: "Ported (vented)", chambers: ["Box"], text: "Driver on the box; one port from the box to the outside." },
  bp4: { name: "4th-order bandpass", chambers: ["Rear (sealed)", "Front (ported)"], text: "Driver on the wall between a sealed rear chamber and a front chamber; only the front chamber's port reaches the outside." },
  bp6: { name: "6th-order bandpass (dual reflex)", chambers: ["Rear (ported)", "Front (ported)"], text: "Driver between two chambers; each chamber has its own port to the outside (two tunings)." },
  bp3: { name: "3-chamber bandpass (single reflex)", chambers: ["Rear (sealed)", "Front", "Third"], text: "Driver between a sealed rear chamber and a front chamber; the front chamber ports into a third chamber, which ports to the outside. Our definition: no standard published one was found (search 2026-11-21)." },
  bp3dual: { name: "3-chamber bandpass (dual reflex)", chambers: ["Rear (ported)", "Front", "Third"], text: "As the single-reflex 3-chamber, plus a port from the rear chamber to the outside. Our definition (see above)." },
};
const MIN_FB = 5;
/** Port branch with the effective length that tunes `S` against chamber volume V to fb (Helmholtz, same formula as port.ts). */
function tunedPort(name: string, from: number, to: number, Scm2: number, VL: number, fb: number, cAir: number): PortBranch {
  const Sv = Scm2 * 1e-4; const Vb = VL / 1000;
  const Leff = (cAir * cAir * Sv) / (4 * Math.PI ** 2 * Math.max(MIN_FB, fb) ** 2 * Vb);
  return { name, from, to, Sv, Leff };
}
/** Build the network for one driver position (volumes per position = totals / drivers). */
export function buildNetwork(d: FullParams, ti: TopologyInputs, air: Air = AIR_20C): Network {
  const n = Math.max(1, ti.drivers);
  const per = (L: number) => L / n;
  const ch: Chamber[] = []; const ports: PortBranch[] = [];
  const S = ti.portAreaCm2.map((a) => a / n);
  let front = OUT, back = 0;
  switch (ti.topology) {
    case "sealed": ch.push({ name: "Box", V: per(ti.V1) / 1000 }); break;
    case "vented": ch.push({ name: "Box", V: per(ti.V1) / 1000 }); ports.push(tunedPort("Port", 0, OUT, S[0], per(ti.V1), ti.fb1, air.c)); break;
    case "bp4": ch.push({ name: "Rear", V: per(ti.V1) / 1000 }, { name: "Front", V: per(ti.V2) / 1000 }); front = 1; ports.push(tunedPort("Front port", 1, OUT, S[1], per(ti.V2), ti.fb2, air.c)); break;
    case "bp6": ch.push({ name: "Rear", V: per(ti.V1) / 1000 }, { name: "Front", V: per(ti.V2) / 1000 }); front = 1;
      ports.push(tunedPort("Rear port", 0, OUT, S[0], per(ti.V1), ti.fb1, air.c), tunedPort("Front port", 1, OUT, S[1], per(ti.V2), ti.fb2, air.c)); break;
    case "bp3": case "bp3dual":
      ch.push({ name: "Rear", V: per(ti.V1) / 1000 }, { name: "Front", V: per(ti.V2) / 1000 }, { name: "Third", V: per(ti.V3) / 1000 }); front = 1;
      ports.push(tunedPort("Front→third port", 1, 2, S[1], per(ti.V2), ti.fb2, air.c), tunedPort("Third→outside port", 2, OUT, S[2], per(ti.V3), ti.fb3, air.c));
      if (ti.topology === "bp3dual") ports.push(tunedPort("Rear port", 0, OUT, S[0], per(ti.V1), ti.fb1, air.c));
      break;
  }
  const drivers: DriverEl[] = [];
  let wiring: Network["wiring"] = "parallel";
  if (ti.isobaric) {
    // compound (tunnel) pair: outer driver faces the original front node, its back into a small coupling chamber; inner driver
    // faces the coupling chamber, its back into the original back chamber. Same polarity, both move together.
    ch.push({ name: "Isobaric coupling", V: Math.max(1e-5, ti.isoGapL / 1000), QL: 100 });
    const g = ch.length - 1;
    drivers.push({ p: d, front, back: g }, { p: d, front: g, back });
    wiring = ti.isoWiring;
  } else drivers.push({ p: d, front, back });
  return { chambers: ch, ports, drivers, wiring };
}
/** Physical port length per port for a branch: Leff − end corrections (k = 1.463, research_c §3), for `count` round ports of the branch area. */
export function branchLength(p: PortBranch, count: number, drivers: number, k = 1.463): { dMm: number; lengthMm: number } {
  const Sper = (p.Sv * drivers) / Math.max(1, count); const r = Math.sqrt(Sper / Math.PI);
  return { dMm: 2 * r * 1000, lengthMm: (p.Leff - k * r) * 1000 };
}
