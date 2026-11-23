// System model helpers (B6A_DIAGRAM_ENGINE, R44, 2026-11-23): what role each project item plays in a car-audio system and
// small graph helpers over the typed links (project model v2, docs/project_model_v2.md). Shared by diagram.ts (wiring
// diagram SVG) and syscheck.ts (missing / critical part check). Pure functions, no DOM.
import type { Item, ItemLink, ProjectDoc } from "../ui/projectv2";
import { buildCableSystem, calcCableSystem } from "./cable";
import type { CableLookups, CableSystemInput, CableSystemResult, RunInput } from "./cable";

/** Role of an item in the drawing and the checks. */
export type Role =
  | "alternator" | "battery" | "fuse" | "distribution" | "capacitor" | "amplifier" | "dsp" | "headunit"
  | "speaker" | "ground" | "cable" | "connector" | "other";

const ROLE_ALIASES: Record<string, Role> = {
  battery: "battery", alternator: "alternator", ground: "ground", chassis: "ground",
  headunit: "headunit", "head-unit": "headunit", head_unit: "headunit", source: "headunit", radio: "headunit",
};
/** Role of an item: from its kind, or for kind "other" (and unknown kinds) from data.role. */
export function roleOf(it: Item | undefined): Role {
  if (!it) return "other";
  const k = String(it.kind ?? ""), r = String(it.data?.role ?? "").toLowerCase();
  switch (k) {
    case "battery": return "battery";
    case "alternator": return "alternator";
    case "fuse": case "fuseholder": return "fuse";
    case "distribution": return "distribution";
    case "capacitor": return "capacitor";
    case "amplifier": return "amplifier";
    case "dsp": return "dsp";
    case "headunit": case "head-unit": case "head_unit": return "headunit";
    case "box": case "door": case "ib": case "speaker": case "home": case "computer": return "speaker";
    case "ground": case "chassis": return "ground";
    case "cable": return "cable";
    case "connector": return "connector";
  }
  return ROLE_ALIASES[r] ?? "other";
}
export const ROLE_LABEL: Record<Role, string> = {
  alternator: "Alternator", battery: "Battery", fuse: "Fuse", distribution: "Distribution block", capacitor: "Capacitor",
  amplifier: "Amplifier", dsp: "DSP", headunit: "Head unit", speaker: "Speaker", ground: "Ground point", cable: "Cable",
  connector: "Connector", other: "Other",
};

/** Every link of the project with `from` set to its owner, in file order (deterministic). */
export function linksOf(doc: ProjectDoc): ItemLink[] {
  return doc.items.flatMap((i) => (i.links ?? []).map((l) => ({ ...l, from: i.id })));
}
export interface SysGraph {
  items: Map<string, Item>;
  order: Map<string, number>;
  links: ItemLink[];
  out: (id: string, kind?: ItemLink["kind"]) => ItemLink[];
  inc: (id: string, kind?: ItemLink["kind"]) => ItemLink[];
  touching: (id: string, kind?: ItemLink["kind"]) => ItemLink[];
  role: (id: string) => Role;
  /** Ids of cable items used as cableItemId on some link. */
  cablesInUse: Set<string>;
}
export function graphOf(doc: ProjectDoc): SysGraph {
  const items = new Map(doc.items.map((i) => [i.id, i]));
  const order = new Map(doc.items.map((i, k) => [i.id, k]));
  const links = linksOf(doc).filter((l) => items.has(l.from) && items.has(l.to));
  const out = (id: string, kind?: ItemLink["kind"]) => links.filter((l) => l.from === id && (!kind || l.kind === kind));
  const inc = (id: string, kind?: ItemLink["kind"]) => links.filter((l) => l.to === id && (!kind || l.kind === kind));
  const touching = (id: string, kind?: ItemLink["kind"]) => links.filter((l) => (l.from === id || l.to === id) && (!kind || l.kind === kind));
  const cablesInUse = new Set(links.map((l) => l.cableItemId).filter((x): x is string => !!x && items.has(x)));
  return { items, order, links, out, inc, touching, role: (id) => roleOf(items.get(id)), cablesInUse };
}

/** Ids reached from `start` by following outgoing links of `kind` (start excluded). */
export function reachable(g: SysGraph, start: string, kind: ItemLink["kind"]): Set<string> {
  const seen = new Set<string>([start]), stack = [start], outSet = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    for (const l of g.out(id, kind)) if (!seen.has(l.to)) { seen.add(l.to); outSet.add(l.to); stack.push(l.to); }
  }
  return outSet;
}
/** Ids from which `target` is reached by `kind` links (target excluded). */
export function upstream(g: SysGraph, target: string, kind: ItemLink["kind"]): Set<string> {
  const seen = new Set<string>([target]), stack = [target], res = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    for (const l of g.inc(id, kind)) if (!seen.has(l.from)) { seen.add(l.from); res.add(l.from); stack.push(l.from); }
  }
  return res;
}
/** True when the item has the turn-on handled without a remote wire (amp or DSP with high-level input auto turn-on noted). */
export function autoTurnOn(g: SysGraph, it: Item): boolean {
  const d = it.data ?? {};
  if (d.autoOn === true || d.autoTurnOn === true || /auto/i.test(String(d.turnOn ?? d.remote ?? ""))) return true;
  return g.inc(it.id, "signal").some((l) => /high.?level|speaker.?level|auto.?on|auto.?turn/i.test(`${l.toPort ?? ""} ${l.fromPort ?? ""} ${l.note ?? ""}`));
}
export const num = (x: any): x is number => typeof x === "number" && isFinite(x) && x > 0;

// ---------------------------------------------------------------------------------------------------------------- cable engine
/** The cable engine's input and result for a project (result as given by the caller, else calculated). Errors give undefined
 * so a broken item never stops the diagram or the check. runEnd maps a run id to the item it ends at (load or junction). */
export interface CableView {
  input?: CableSystemInput; result?: CableSystemResult;
  /** run id -> item id it ends at (amp / DSP or distribution block). */
  runEnd: Map<string, string>;
  /** branch run id -> the junction (distribution) item it leaves. */
  runJunctionOf: Map<string, string>;
  /** cable item id -> run id; fuse item id -> run id (the run it protects). */
  runOfCable: Map<string, string>; runOfFuse: Map<string, string>;
}
export function cableFor(doc: ProjectDoc, lk: CableLookups = {}, given?: CableSystemResult): CableView {
  const runEnd = new Map<string, string>(), runJunctionOf = new Map<string, string>(), runOfCable = new Map<string, string>(), runOfFuse = new Map<string, string>();
  let input: CableSystemInput | undefined, result = given;
  try {
    input = buildCableSystem(doc, lk);
    const walk = (r: RunInput, parentJunction?: string) => {
      if (parentJunction) runJunctionOf.set(r.id, parentJunction);
      for (const c of r.cableItemIds ?? []) if (!runOfCable.has(c)) runOfCable.set(c, r.id);
      if (r.fuseItemId && !runOfFuse.has(r.fuseItemId)) runOfFuse.set(r.fuseItemId, r.id);
      if ("load" in r.to) runEnd.set(r.id, r.to.load);
      else if ("junction" in r.to) { runEnd.set(r.id, r.to.junction.id); for (const b of r.to.junction.branches) walk(b, r.to.junction.id); }
    };
    input.feeds.forEach((f) => walk(f));
    if (!result) result = calcCableSystem(input);
  } catch { /* leave undefined */ }
  return { input, result, runEnd, runJunctionOf, runOfCable, runOfFuse };
}
