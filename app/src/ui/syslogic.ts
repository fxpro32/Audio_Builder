// System screen logic (B4_SYSTEM_UI, R41 + R44, 2026-11-23): pure functions (no DOM, no fetch) behind the System tab, so the
// tests can check them. Groups of items, default port names, "Wire it for me" (the standard chain proposed for what the project
// holds, applied only after the user ticks and confirms it), "Add <part>?" for a missing-part issue (syscheck.ts), removing an
// item while keeping the wire through it, the alert gate (when the missing-part alert is shown), "Use this size" and the quick
// one-amplifier cable calculator. Engines: docs/cable_engine.md, docs/diagram_engine.md. Model: docs/project_model_v2.md.
import type { Item, ItemLink, LinkKind, ProjectDoc } from "./projectv2";
import { linkItems, newItemId, removeItem } from "./projectv2";
import { roleOf } from "../engine/sysmodel";
import type { Role } from "../engine/sysmodel";
import type { SystemIssue } from "../engine/syscheck";
import { awgInfo, calcCableSystem, normAwg } from "../engine/cable";
import type { CableLookups, CableOptions, CableSystemInput, CableSystemResult, LoadCurrent, Material, Location, RunResult } from "../engine/cable";

// ------------------------------------------------------------------------------------------------------------ groups
export type Group = "power" | "amps" | "signal" | "speakers" | "other";
export const GROUPS: { id: Group; label: string; explain: string }[] = [
  { id: "power", label: "Power", explain: "Battery, alternator, fuses and holders, distribution blocks, cable, capacitors, ground points" },
  { id: "amps", label: "Amplifiers", explain: "Amplifiers (and amplifier + DSP units)" },
  { id: "signal", label: "Signal", explain: "Head unit (source) and DSP" },
  { id: "speakers", label: "Speakers", explain: "Subwoofer boxes, door speakers, infinite baffle, home and computer speakers" },
  { id: "other", label: "Other", explain: "Connectors, wiring kits and anything else" },
];
const GROUP_OF: Record<Role, Group> = {
  alternator: "power", battery: "power", fuse: "power", distribution: "power", capacitor: "power", cable: "power", ground: "power",
  amplifier: "amps", dsp: "signal", headunit: "signal", speaker: "speakers", connector: "other", other: "other",
};
export const groupOf = (it: Item): Group => GROUP_OF[roleOf(it)];
/** Items of a project per group, in file order. `skip` = ids left out (items opened in memory only). */
export function groupItems(doc: ProjectDoc, skip: Set<string> = new Set()): Record<Group, Item[]> {
  const out: Record<Group, Item[]> = { power: [], amps: [], signal: [], speakers: [], other: [] };
  for (const it of doc.items) if (!skip.has(it.id)) out[groupOf(it)].push(it);
  return out;
}

// ------------------------------------------------------------------------------------------------------------ ports
/** Link kinds that make sense from an item of this role (the Connect control offers these first). */
export function kindsFrom(r: Role): LinkKind[] {
  switch (r) {
    case "battery": case "fuse": case "distribution": case "capacitor": case "cable": case "alternator": return ["power", "ground"];
    case "amplifier": return ["speaker", "ground", "remote", "signal"];
    case "dsp": return ["signal", "remote", "speaker", "ground"];
    case "headunit": return ["signal", "remote", "ground"];
    case "speaker": return ["speaker"];
    case "ground": return ["ground"];
    default: return ["power", "ground", "signal", "speaker", "remote"];
  }
}
/** Default port names for a new link (the diagram prints them; free text, editable). k = index among the same links. */
export function defaultPorts(kind: LinkKind, from: Item | undefined, to: Item | undefined, k = 0): { fromPort?: string; toPort?: string } {
  const rf = roleOf(from), rt = roleOf(to);
  if (kind === "ground") return { fromPort: "GND", toPort: rt === "ground" ? "chassis" : "GND" };
  if (kind === "remote") return { fromPort: rf === "headunit" ? "REM out" : "REM out", toPort: "REM" };
  if (kind === "signal") return { fromPort: rf === "headunit" ? "RCA out" : `out ${2 * k + 1}/${2 * k + 2}`, toPort: rt === "dsp" ? "in" : "RCA in" };
  if (kind === "speaker") return rf === "amplifier" && monoAmp(from) ? { fromPort: "SPK" } : { fromPort: `CH${2 * k + 1}/${2 * k + 2}` };
  if (kind === "power") return rt === "amplifier" || rt === "dsp" ? { toPort: "+12V" } : {};
  return {};
}

// ------------------------------------------------------------------------------------------------------------ plain items
/** Items that are not parts: battery, head unit, chassis ground point, alternator (kinds read by the engines: battery, other +
 * role headunit / ground, alternator). */
export type PlainKind = "battery" | "headunit" | "ground" | "alternator";
export const PLAIN_LABEL: Record<PlainKind, string> = { battery: "Battery", headunit: "Head unit", ground: "Chassis ground point", alternator: "Alternator" };
export const ELECTRICAL = "electrical";
export function plainItem(kind: PlainKind, taken: Iterable<string> = [], name?: string): Item {
  const id = newItemId(taken), created = new Date().toISOString();
  const base = { id, section: ELECTRICAL, name: name ?? PLAIN_LABEL[kind], links: [] as ItemLink[], created };
  if (kind === "battery") return { ...base, kind: "battery", data: {} };
  if (kind === "alternator") return { ...base, kind: "alternator", data: {} };
  return { ...base, kind: "other", data: { role: kind } };
}
/** An electrical item of a kind (amplifier, fuseholder, cable...) without a part: the user fills its values (Edit). */
export function plainKindItem(kind: string, name: string, taken: Iterable<string> = [], data: Record<string, any> = {}): Item {
  return { id: newItemId(taken), section: ELECTRICAL, kind, name, data, links: [], created: new Date().toISOString() };
}
/** Alternator items: their rating is copied to the battery (the cable engine reads data.alternatorA on the battery) when the
 * battery has none of its own. Returns true when something changed. */
export function syncAlternator(doc: ProjectDoc): boolean {
  const alt = doc.items.find((i) => i.kind === "alternator" && num(i.data?.ratingA));
  const bat = doc.items.find((i) => roleOf(i) === "battery");
  if (!alt || !bat) return false;
  bat.data ??= {};
  if (num(bat.data.alternatorA) && bat.data.alternatorFrom !== alt.id) return false;
  if (bat.data.alternatorA === alt.data.ratingA) return false;
  bat.data.alternatorA = alt.data.ratingA; bat.data.alternatorFrom = alt.id; return true;
}

// ------------------------------------------------------------------------------------------------------------ helpers
const num = (x: any): x is number => typeof x === "number" && isFinite(x) && x > 0;
const partOf = (it: Item | undefined, lk: CableLookups) => (it?.data?.partId && lk.part ? lk.part(it.data.partId, it.data.partCategory) : undefined);
/** Channels of an amplifier: typed, else the part record. */
export function ampChannels(it: Item | undefined, lk: CableLookups = {}): number | undefined {
  const p = partOf(it, lk);
  return [it?.data?.channels, p?.n?.channels, p?.channels].find(num);
}
function monoAmp(it: Item | undefined, lk: CableLookups = {}): boolean { return ampChannels(it, lk) === 1; }
/** Is a speaker item a subwoofer (box in the subwoofer section, infinite baffle)? */
export const isSubSpeaker = (it: Item): boolean => it.kind === "ib" || (it.kind === "box" && (it.section === "subwoofer" || !it.section));
/** What a cable item is for: data.use, else the part record's kind, else its name. */
export function cableUse(it: Item, lk: CableLookups = {}): "power" | "speaker" | "remote" | "signal" {
  const u = String(it.data?.use ?? "");
  if (u === "power" || u === "speaker" || u === "remote" || u === "signal") return u;
  const k = String(partOf(it, lk)?.kind ?? "");
  if (/speaker/.test(k)) return "speaker";
  if (/remote|primary/.test(k)) return "remote";
  if (/power|ground|battery|starter|automotive/.test(k)) return "power";
  if (/speaker/i.test(it.name)) return "speaker";
  if (/remote|turn.?on/i.test(it.name)) return "remote";
  if (/rca|signal|interconnect/i.test(it.name)) return "signal";
  return "power";
}
const hasLink = (doc: ProjectDoc, from: string, to: string, kind: LinkKind) => (doc.items.find((i) => i.id === from)?.links ?? []).some((l) => l.to === to && l.kind === kind);
const allLinksOf = (doc: ProjectDoc): ItemLink[] => doc.items.flatMap((i) => (i.links ?? []).map((l) => ({ ...l, from: i.id })));

// ------------------------------------------------------------------------------------------------------------ wire it for me
export interface ProposedLink { from: string; to: string; kind: LinkKind; fromPort?: string; toPort?: string; cableItemId?: string; why: string }
export interface WiringProposal { add: Item[]; links: ProposedLink[]; notes: string[] }
/**
 * The standard chain for what the project holds (proposed, never applied here): battery -> main fuse -> main run -> distribution
 * block (when more than one item draws power) -> capacitor -> amplifiers; DSP power from the distribution block; grounds to a
 * chassis ground point; head unit -> DSP -> amplifiers (signal and remote); amplifiers -> speakers (subwoofers to 1-channel
 * amps, the others to multi-channel amps). Free cable items (not used by any link) are put on the links by what they are for:
 * power cables to the main run, then the branches, then the grounds; speaker cables to the speaker links; a remote wire to the
 * first remote link. Items and links that exist are left as they are; a battery and a ground point are proposed when missing.
 */
export function proposeWiring(doc: ProjectDoc, lk: CableLookups = {}, skip: Set<string> = new Set()): WiringProposal {
  const items = doc.items.filter((i) => !skip.has(i.id));
  const by = (r: Role) => items.filter((i) => roleOf(i) === r);
  const links = allLinksOf(doc);
  const inc = (id: string, k: LinkKind) => links.filter((l) => l.to === id && l.kind === k);
  const out = (id: string, k: LinkKind) => links.filter((l) => l.from === id && l.kind === k);
  const touch = (id: string) => links.some((l) => l.from === id || l.to === id);
  const used = new Set(links.map((l) => l.cableItemId).filter(Boolean) as string[]);
  const taken = doc.items.map((i) => i.id);
  const res: WiringProposal = { add: [], links: [], notes: [] };
  const free = (use: string) => by("cable").filter((c) => !used.has(c.id) && !touch(c.id) && cableUse(c, lk) === use);
  const pools = { power: free("power"), speaker: free("speaker"), remote: free("remote") };
  const takeCable = (use: "power" | "speaker" | "remote") => { const c = pools[use].shift(); if (c) used.add(c.id); return c?.id; };
  const P = (l: ProposedLink) => { if (!hasLink(doc, l.from, l.to, l.kind) && !res.links.some((x) => x.from === l.from && x.to === l.to && x.kind === l.kind)) res.links.push(l); };
  const amps = by("amplifier"), dsps = by("dsp"), speakers = by("speaker"), heads = by("headunit");
  const loads = [...amps, ...dsps];
  if (!loads.length && !speakers.length) { res.notes.push("Nothing to wire: the project has no amplifier, DSP or speaker."); return res; }

  // battery and ground point (proposed when missing)
  let battery = by("battery")[0];
  if (!battery && loads.length) { battery = plainItem("battery", [...taken, ...res.add.map((i) => i.id)]); res.add.push(battery); }
  let ground = by("ground")[0];
  if (!ground && loads.some((a) => !out(a.id, "ground").length)) { ground = plainItem("ground", [...taken, ...res.add.map((i) => i.id)]); res.add.push(ground); }

  // power chain
  const needPower = loads.filter((a) => !inc(a.id, "power").length);
  const dist = by("distribution")[0];
  const fuse = by("fuse").find((f) => !inc(f.id, "power").length && !out(f.id, "power").length);
  const caps = by("capacitor").filter((c) => !touch(c.id));
  if (needPower.length && battery) {
    let cur = battery.id;
    if (fuse) { P({ from: battery.id, to: fuse.id, kind: "power", why: "main fuse at the battery (within 175 mm, ABYC E-11.12.1.2)" }); cur = fuse.id; }
    else if (!out(battery.id, "power").length) res.notes.push("No free fuse or fuse holder in the project: the main run starts at the battery without a fuse; the missing-part check will ask for one.");
    const viaDist = dist && (needPower.length > 1 || inc(dist.id, "power").length > 0);
    const capFor = amps.length ? (needPower.filter((a) => roleOf(a) === "amplifier")[0]) : undefined;
    const feed = (src: string, a: Item, main: boolean) => {
      const c = roleOf(a) === "amplifier" && a === capFor ? caps[0] : undefined;
      const cable = takeCable("power");
      if (c) {
        P({ from: src, to: c.id, kind: "power", cableItemId: cable, why: `${main ? "main run" : "branch"} to the capacitor next to ${a.name}` });
        P({ from: c.id, to: a.id, kind: "power", toPort: "+12V", why: "capacitor close to the amplifier's power terminal (research_i B7)" });
      } else P({ from: src, to: a.id, kind: "power", toPort: "+12V", cableItemId: cable, why: main ? `main run to ${a.name}` : `branch to ${a.name}` });
    };
    if (viaDist && dist) {
      if (!inc(dist.id, "power").length) P({ from: cur, to: dist.id, kind: "power", cableItemId: takeCable("power"), why: "main run to the distribution block (more than one item draws power)" });
      for (const a of needPower) feed(dist.id, a, false);
    } else {
      if (needPower.length > 1) res.notes.push("Several items draw power but the project has no distribution block: each gets its own run from the main fuse (consider a fused distribution block).");
      for (const a of needPower) feed(cur, a, true);
    }
  }
  // grounds
  for (const a of loads) if (!out(a.id, "ground").length && ground) P({ from: a.id, to: ground.id, kind: "ground", fromPort: "GND", toPort: "chassis", cableItemId: roleOf(a) === "amplifier" ? takeCable("power") : undefined, why: `${a.name} ground to bare chassis, short, same gauge as its power wire` });
  // signal and remote
  const head = heads[0], dsp = dsps[0];
  if (dsp && head && !inc(dsp.id, "signal").length) P({ from: head.id, to: dsp.id, kind: "signal", fromPort: "RCA out", toPort: "in", why: "head unit to the DSP input" });
  if (dsp && head && !links.some((l) => l.kind === "remote" && (l.to === dsp.id || l.from === dsp.id))) P({ from: head.id, to: dsp.id, kind: "remote", fromPort: "REM out", toPort: "REM", cableItemId: takeCable("remote"), why: "turn-on for the DSP" });
  const src = dsp ?? head;
  amps.forEach((a, k) => {
    if (src && !inc(a.id, "signal").length && !a.data?.source) P({ from: src.id, to: a.id, kind: "signal", fromPort: src === head ? "RCA out" : `out ${2 * k + 1}/${2 * k + 2}`, toPort: "RCA in", why: `${src.name} signal to ${a.name}` });
    if (src && !links.some((l) => l.kind === "remote" && (l.to === a.id || l.from === a.id)) && a.data?.autoOn !== true) P({ from: src.id, to: a.id, kind: "remote", fromPort: "REM out", toPort: "REM", cableItemId: takeCable("remote"), why: `turn-on for ${a.name}` });
  });
  if (!src && amps.length) res.notes.push("No head unit or DSP: add a head unit (button above) so the amplifiers get a signal and a turn-on wire.");
  // speakers
  const monos = amps.filter((a) => monoAmp(a, lk)), multis = amps.filter((a) => !monoAmp(a, lk));
  const nOut = new Map<string, number>(amps.map((a) => [a.id, out(a.id, "speaker").length]));
  let rs = 0, rm = 0;
  for (const s of speakers) {
    if (inc(s.id, "speaker").length || !amps.length) continue;
    const sub = isSubSpeaker(s);
    const pool = sub ? (monos.length ? monos : multis) : (multis.length ? multis : monos);
    const a = sub ? pool[rs++ % pool.length] : pool[rm++ % pool.length];
    const k = nOut.get(a.id) ?? 0; nOut.set(a.id, k + 1);
    const ports = monoAmp(a, lk) ? { fromPort: "SPK" } : { fromPort: `CH${2 * k + 1}/${2 * k + 2}` };
    P({ from: a.id, to: s.id, kind: "speaker", ...ports, cableItemId: takeCable("speaker"), why: `${a.name} drives ${s.name}${sub ? " (subwoofer)" : ""}` });
  }
  if (speakers.length && !amps.length) res.notes.push("No amplifier: add one (Parts tab) and press Wire it for me again.");
  const left = [...pools.power, ...pools.speaker, ...pools.remote];
  if (left.length) res.notes.push(`Cable items not used by this proposal: ${left.map((c) => c.name).join(", ")}.`);
  return res;
}
/** Apply the ticked part of a proposal (items by id, links by index). Links that need an item that was not ticked are skipped. */
export function applyProposal(doc: ProjectDoc, p: WiringProposal, items: Set<string>, links: Set<number>): { added: number; linked: number; errors: string[] } {
  let added = 0, linked = 0; const errors: string[] = [];
  for (const it of p.add) if (items.has(it.id) && !doc.items.some((x) => x.id === it.id)) { doc.items.push(it); added++; }
  p.links.forEach((l, k) => {
    if (!links.has(k)) return;
    const r = linkItems(doc, l.from, l.to, l.kind, { fromPort: l.fromPort, toPort: l.toPort, cableItemId: l.cableItemId });
    if (r.ok) linked++; else errors.push(`${l.kind} ${l.from} -> ${l.to}: ${r.error}`);
  });
  return { added, linked, errors };
}

// ------------------------------------------------------------------------------------------------------------ remove, keep chain
/** Remove an item; where it sat in a wire (power, ground, signal, speaker or remote passing through it), the item before it is
 * linked straight to the item after it (the cable of the outgoing link kept, else the incoming one), so removing a fuse leaves
 * battery -> cable -> block. Returns the removed item and the number of bridges made. */
export function removeKeepChain(doc: ProjectDoc, id: string): { removed?: Item; bridged: number } {
  const ins = allLinksOf(doc).filter((l) => l.to === id), outs = (doc.items.find((i) => i.id === id)?.links ?? []);
  const bridges: ItemLink[] = [];
  for (const a of ins) for (const b of outs) if (a.kind === b.kind && a.from !== b.to)
    bridges.push({ from: a.from, to: b.to, kind: a.kind, fromPort: a.fromPort, toPort: b.toPort, cableItemId: b.cableItemId ?? a.cableItemId });
  const removed = removeItem(doc, id);
  let bridged = 0;
  for (const l of bridges) if (linkItems(doc, l.from, l.to, l.kind, { fromPort: l.fromPort, toPort: l.toPort, cableItemId: l.cableItemId !== id ? l.cableItemId : undefined }).ok) bridged++;
  return { removed, bridged };
}

// ------------------------------------------------------------------------------------------------------------ issue -> action
/** Makes the item an "Add ...?" button asks for (the caller supplies boxes: a Subwoofer box needs the app's box defaults). */
export type ItemMaker = (kind: string, role: string | undefined, name: string) => Item;
export const KIND_NAME: Record<string, string> = { fuseholder: "Main fuse holder", fuse: "Fuse", amplifier: "Amplifier", battery: "Battery", cable: "Cable", distribution: "Distribution block", box: "Subwoofer box", dsp: "DSP", capacitor: "Capacitor" };
export function nameFor(kind: string, role?: string, issue?: SystemIssue): string {
  if (role === "ground") return "Chassis ground point";
  if (role === "headunit") return "Head unit";
  if (issue?.rule === "branch-unfused-thin") return "Branch fuse holder";
  if (issue?.rule === "alternator" && kind === "battery") return "Second battery";
  return KIND_NAME[kind] ?? (role ? role[0].toUpperCase() + role.slice(1) : kind);
}
export interface ApplyResult { changed: boolean; added: Item[]; message: string; focus?: string }
/**
 * What an "Add ...?" button does for one issue (syscheck.ts). The new item gets the links the suggestion names: with both ends
 * (linkFrom and linkTo, e.g. the main fuse) it is put INTO the existing wire (battery -> fuse -> block, the wire's cable moves to
 * the fuse's outgoing link); with one end it is linked to that end. Cable suggestions put a new cable item on the links that lack
 * one. Suggestions that add nothing link the two named items, or say what to change and name the item to open (focus).
 * `cable` = the cable engine result of the same project (for "Use a thicker cable?": the recommended size is set).
 */
export function applyIssue(doc: ProjectDoc, issue: SystemIssue, mk: ItemMaker, cable?: { result?: CableSystemResult; input?: CableSystemInput }): ApplyResult {
  const sg = issue.suggestion, kind = (sg.linkKind ?? "power") as LinkKind;
  const get = (id?: string) => doc.items.find((i) => i.id === id);
  const added: Item[] = [];
  const add = (k: string, role: string | undefined, name: string) => { const it = mk(k, role, name); doc.items.push(it); added.push(it); return it; };
  const rel = issue.relatedItemIds;
  // values on an item, no new item
  if (issue.rule === "cap-no-precharge") {
    const c = get(rel[0]); if (!c) return { changed: false, added, message: "The capacitor is gone." };
    c.data ??= {}; c.data.prechargeOhm = 1000;
    return { changed: true, added, message: `${c.name}: precharge resistor 1000 Ω noted (research_i B7 example; charge the capacitor through it before the final connection). Change it on the capacitor (Edit).`, focus: c.id };
  }
  if (issue.rule === "alternator" && sg.role === "big3") {
    (doc as any).cableBig3 ??= { material: "copper" };
    return { changed: true, added, message: "Big 3 upgrade added to the cable calculator (System tab, Alternator and big 3): enter the three wire lengths." };
  }
  if (issue.rule === "cable-error" || issue.rule === "cable-warning") { // never adds a loose cable item: sets the size, or says what to change
    if (issue.id.endsWith(":upstream-budget")) { // B7: the branch is not the cause; point at the upstream run's cable
      const focus = rel.find((id) => get(id)?.kind === "cable") ?? rel[0];
      return { changed: false, added, message: `${issue.message} Change the upstream run's cable first (thicker, or a shorter run), then this branch can be sized.`, focus };
    }
    const done = cable?.result ? useRecommendedForIssue(doc, issue, cable.result, cable.input) : undefined;
    if (done) return { changed: true, added, message: done };
    const focus = rel.find((id) => get(id)?.kind === "cable") ?? rel[0];
    return { changed: false, added, message: `No standard size can be set for this run (${issue.message}). Shorten the run, split the load over two fused runs, choose a smaller fuse, or change the drop limit (cable calculator options).`, focus };
  }
  if (issue.rule === "fuse-too-far") {
    const f = get(rel[0]);
    return { changed: false, added, message: `Move ${f?.name ?? "the fuse"} within 175 mm of the battery terminal and enter the new distance on it (Edit).`, focus: f?.id };
  }
  // cable items for existing links
  if (sg.addKind === "cable" && (issue.rule === "ground-no-cable" || issue.rule === "speaker-no-cable")) {
    const amp = get(rel[0]); if (!amp) return { changed: false, added, message: "The amplifier is gone." };
    const k: LinkKind = issue.rule === "ground-no-cable" ? "ground" : "speaker";
    for (const l of (amp.links ?? []).filter((x) => x.kind === k && !x.cableItemId)) {
      const c = add("cable", undefined, k === "ground" ? `Ground cable: ${amp.name}` : `Speaker cable: ${amp.name} to ${get(l.to)?.name ?? l.to}`);
      c.data = { use: k === "ground" ? "power" : "speaker" }; l.cableItemId = c.id;
    }
    return { changed: added.length > 0, added, message: `${added.length} cable item${added.length === 1 ? "" : "s"} added: enter the length${k === "ground" ? " (keep the ground short)" : ""} and size on ${added.length === 1 ? "it" : "each"} (Edit), or press Use this size in the cable calculator.`, focus: added[0]?.id };
  }
  if (sg.addKind === "cable" && issue.rule === "run-no-cable") {
    const end = sg.linkTo?.[0];
    const into = allLinksOf(doc).filter((l) => l.to === end && l.kind === "power" && !l.cableItemId);
    const c = add("cable", undefined, `Power cable to ${get(end)?.name ?? "the load"}`); c.data = { use: "power" };
    const own = into[0] && get(into[0].from)?.links?.find((l) => l.to === end && l.kind === "power" && !l.cableItemId);
    if (own) own.cableItemId = c.id;
    else doc.items.splice(doc.items.indexOf(c), 1), added.pop();
    if (!own) return { changed: false, added, message: "Could not find the power link of that run: add the cable on the Connect control instead.", focus: end };
    return { changed: true, added, message: `${c.name} added on the power link: enter its length and size (Edit) or press Use this size in the cable calculator.`, focus: c.id };
  }
  if (sg.addKind === "cable" && (issue.rule === "amp-no-power" || issue.rule === "dsp-no-power")) {
    const to = get(sg.linkTo?.[0]); if (!to) return { changed: false, added, message: "The item is gone." };
    const c = add("cable", undefined, `Power cable to ${to.name}`); c.data = { use: "power" };
    const bat = doc.items.find((i) => roleOf(i) === "battery");
    if (bat) linkItems(doc, bat.id, to.id, "power", { toPort: "+12V", cableItemId: c.id });
    else linkItems(doc, c.id, to.id, "power", { toPort: "+12V" });
    return { changed: true, added, message: `${c.name} added${bat ? ` from ${bat.name}` : ""}: enter its length (Edit). ${bat ? "A main fuse at the battery is still needed (the check asks next)." : "Add the battery too."}`, focus: c.id };
  }
  if (sg.addKind === "cable" && issue.rule === "amp-no-remote") {
    const to = get(sg.linkTo?.[0]), from = get(sg.linkFrom?.[0]);
    const c = add("cable", undefined, `Remote wire to ${to?.name ?? "the amplifier"}`); c.data = { use: "remote" };
    if (from && to) { linkItems(doc, from.id, to.id, "remote", { fromPort: "REM out", toPort: "REM", cableItemId: c.id }); return { changed: true, added, message: `Remote wire from ${from.name} to ${to.name} added.`, focus: c.id }; }
    return { changed: true, added, message: `${c.name} added; the project has no head unit to start it from: add one and link it (Connect, remote).`, focus: c.id };
  }
  // nothing to add: link the named items, or say what to change
  if (!sg.addKind) {
    if (sg.linkFrom?.length && sg.linkTo?.length) {
      let n = 0; for (const f of sg.linkFrom) for (const t of sg.linkTo) if (linkItems(doc, f, t, kind, defaultPorts(kind, get(f), get(t))).ok) n++;
      return { changed: n > 0, added, message: n ? `Linked (${kind}).` : "Already linked.", focus: sg.linkTo[0] };
    }
    return { changed: false, added, message: `Nothing to add: ${sg.label.replace(/\?$/, "")} (the item is shown in the System tab).`, focus: rel[0] };
  }
  // a new item
  const it = add(sg.addKind, sg.role, nameFor(sg.addKind, sg.role, issue));
  const from = (sg.linkFrom ?? []).filter((x) => get(x)), to = (sg.linkTo ?? []).filter((x) => get(x));
  let n = 0;
  if (from.length && to.length) {
    for (const f of from) for (const t of to) {
      const src = get(f)!; const old = (src.links ?? []).find((l) => l.to === t && l.kind === kind);
      if (old) src.links = src.links!.filter((l) => l !== old);
      if (linkItems(doc, f, it.id, kind, old ? { fromPort: old.fromPort } : defaultPorts(kind, src, it)).ok) n++;
      if (linkItems(doc, it.id, t, kind, old ? { toPort: old.toPort, cableItemId: old.cableItemId } : defaultPorts(kind, it, get(t))).ok) n++;
    }
  } else if (from.length) { for (const f of from) if (linkItems(doc, f, it.id, kind, defaultPorts(kind, get(f), it)).ok) n++; }
  else if (to.length) { for (const t of to) if (linkItems(doc, it.id, t, kind, defaultPorts(kind, it, get(t))).ok) n++; }
  const fill = ["fuseholder", "fuse", "amplifier", "dsp", "capacitor", "distribution", "battery"].includes(it.kind) ? " Enter its values (Edit) or pick the real part on the Parts tab." : "";
  return { changed: true, added, message: `${it.name} added${n ? ` and linked (${kind})` : ""}.${fill}`, focus: it.id };
}

// ------------------------------------------------------------------------------------------------------------ use this size
/** Set a cable item to a size (AWG text) and material: the size and its formula copper area are entered on the item; a part
 * the item came from no longer matches, so its id is kept as replacedPartId (shown in the edit form) and dropped. */
export function setCableSize(it: Item, size: string, material?: Material): string {
  const g = normAwg(size); const info = g ? awgInfo(g) : undefined;
  it.data ??= {};
  if (!g || !info) return `Unknown size ${size}`;
  it.data.size = g; it.data.areaMm2 = info.areaMm2; if (material) it.data.material = material;
  if (it.data.partId) { it.data.replacedPartId = it.data.partId; delete it.data.partId; delete it.data.partCategory; }
  return `${it.name}: ${g} AWG${material ? " " + (material === "cca" ? "CCA" : "copper") : ""} (${info.areaMm2} mm²)`;
}
/** Put a real cable product on a cable item (Use this product): part id, its size, real area (when known) and material. */
export function setCableProduct(it: Item, rec: any, area: { areaMm2?: number; labelOnly?: boolean }, material?: Material): void {
  it.data ??= {};
  it.data.partId = rec.id; it.data.partCategory = "cable"; delete it.data.replacedPartId;
  const g = normAwg(Array.isArray(rec.awg) ? rec.awg[0] : rec.awg); if (g) it.data.size = g; else delete it.data.size;
  if (area.areaMm2 && !area.labelOnly) it.data.areaMm2 = +area.areaMm2.toFixed(3); else delete it.data.areaMm2;
  if (material) it.data.material = material;
}
/** The recommended AWG of a calculated power run in a material (copper / CCA). */
export const recommendedAwg = (r: RunResult, mat: Material): string | undefined => r.recommended.awg[mat]?.size;
/** Cable item ids of a power run (from the engine input). */
export function runCableIds(input: CableSystemInput | undefined, runId: string): string[] {
  const find = (rs: any[]): any => { for (const r of rs ?? []) { if (r.id === runId) return r; const j = r.to?.junction; if (j) { const x = find(j.branches); if (x) return x; } } return undefined; };
  return find(input?.feeds ?? [])?.cableItemIds ?? [];
}
/** "Use a thicker cable?" for a cable-error / cable-warning issue: the run's (or speaker link's) cable items get the
 * recommended size in their own material. Returns the message, or undefined when nothing could be set. */
export function useRecommendedForIssue(doc: ProjectDoc, issue: SystemIssue, result: CableSystemResult, input?: CableSystemInput): string | undefined {
  const get = (id?: string) => doc.items.find((i) => i.id === id);
  for (const r of result.runs) if (r.warnings.some((w) => issue.id === `${issue.rule}:${r.id}:${w.code}`)) {
    const ids = runCableIds(input, r.id).map(get).filter(Boolean) as Item[];
    if (issue.id.endsWith(":fuse-below-load")) {
      const fid = findRunFuse(input, r.id); const f = get(fid);
      if (f && r.fuseRecommendedA) { f.data ??= {}; f.data.ratingA = r.fuseRecommendedA; return `${f.name}: ${r.fuseRecommendedA} A (the next stocked rating at or above the ${Math.round(r.maxA)} A the run draws).`; }
      return undefined;
    }
    if (!ids.length) return undefined;
    const msgs = ids.map((c) => { const mat = (c.data?.material ?? r.chosen?.material ?? result.options.material) as Material; const s = recommendedAwg(r, mat); return s ? setCableSize(c, s, mat) : undefined; }).filter(Boolean);
    return msgs.length ? `Use this size: ${msgs.join("; ")}.` : undefined;
  }
  for (const s of result.speakers) if (issue.id.startsWith(`cable-warning:${s.id}:`)) {
    const sp = input?.speakers?.find((x) => x.id === s.id); const c = get(sp?.cableItemId);
    if (c && s.recommendedAwg) return `Use this size: ${setCableSize(c, s.recommendedAwg, (c.data?.material ?? s.material) as Material)}.`;
  }
  return undefined;
}
function findRunFuse(input: CableSystemInput | undefined, runId: string): string | undefined {
  const find = (rs: any[]): any => { for (const r of rs ?? []) { if (r.id === runId) return r; const j = r.to?.junction; if (j) { const x = find(j.branches); if (x) return x; } } return undefined; };
  return find(input?.feeds ?? [])?.fuseItemId;
}

// ------------------------------------------------------------------------------------------------------------ alert gate
/** When the missing-part alert is shown (R44: help when someone forgets a critical part; never nag):
 * - "open": a project was opened; the list is only remembered (no alert).
 * - "explicit": Save button or Ctrl+S: shown whenever the list is not empty.
 * - "auto": an autosave: shown only when an issue appears that was not in the list at the last check, and the user has not
 *   pressed Not now on exactly this list.
 * - "leave": leaving the project (menu, another project): shown when the list holds a critical issue and was not put off
 *   with Not now (a box-only project, whose only issue is the "no amplifier" warning, is never stopped on the way out).
 * An empty list never shows anything (exception-only notice). */
export type Trigger = "open" | "explicit" | "auto" | "leave";
export interface GateState { last?: string[]; dismissed?: string }
export const issueSignature = (issues: SystemIssue[]): string => issues.map((i) => i.id).sort().join("|");
export function alertDecision(state: GateState, issues: SystemIssue[], trigger: Trigger): { show: boolean; state: GateState } {
  const ids = issues.map((i) => i.id), sig = issueSignature(issues), next: GateState = { ...state, last: ids };
  if (!issues.length) return { show: false, state: next };
  if (trigger === "open") return { show: false, state: next };
  if (trigger === "explicit") return { show: true, state: next };
  if (trigger === "leave") return { show: issues.some((i) => i.severity === "critical") && sig !== state.dismissed, state: next };
  if (!state.last) return { show: false, state: next }; // first check of this project in this session: baseline only
  const fresh = ids.some((id) => !state.last!.includes(id));
  return { show: fresh && sig !== state.dismissed, state: next };
}
export const dismissAlert = (state: GateState, issues: SystemIssue[]): GateState => ({ ...state, dismissed: issueSignature(issues) });

// ------------------------------------------------------------------------------------------------------------ quick calculator
/** "Build a single item": one amplifier, one power run from the battery (cable.ts calcCableSystem). Either the amp's RMS power
 * (all channels) and class, or the maker's maximum current. */
export interface QuickInput {
  rmsW?: number; cls?: string; iMaxA?: number; fuseA?: number;
  lengthM: number; groundLengthM?: number; material?: Material; location?: Location; bundled?: number;
  options?: Partial<CableOptions>;
}
export interface QuickResult { result: CableSystemResult; run?: RunResult; load?: LoadCurrent; input: CableSystemInput }
export function quickCalc(q: QuickInput): QuickResult {
  const input: CableSystemInput = {
    options: { ...(q.options ?? {}), ...(q.material ? { material: q.material } : {}), ...(q.location ? { location: q.location } : {}) },
    loads: [{ id: "amp", name: "Amplifier", kind: "amplifier", cls: q.cls, rmsTotalW: num(q.rmsW) ? q.rmsW : undefined, iMaxA: num(q.iMaxA) ? q.iMaxA : undefined, iMaxLabel: num(q.iMaxA) ? "entered" : undefined }],
    feeds: [{ id: "main", name: "Power cable", lengthM: q.lengthM, groundLengthM: num(q.groundLengthM) ? q.groundLengthM : undefined, material: q.material, location: q.location, bundled: num(q.bundled) ? q.bundled : undefined, fuseA: num(q.fuseA) ? q.fuseA : undefined, fuseDistanceMm: 150, to: { load: "amp" } }],
  };
  const result = calcCableSystem(input);
  return { result, run: result.runs[0], load: result.loads[0], input };
}
