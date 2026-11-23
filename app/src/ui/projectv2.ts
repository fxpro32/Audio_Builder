// Project model v2 (B1_SHELL, R42, 2026-11-23): a project holds many items (a subwoofer box, door speakers, later amplifiers,
// DSPs, capacitors, fuses, cable...), each {id, section, kind, name, data, links?} (typed links, R44). Schema: docs/project_model_v2.md.
// Pure functions (no DOM, no fetch) so app/tests can check them.
import { Project, upgradeProject } from "./model";
import { isSection, SectionId } from "./sections";
import type { CableOptions, Big3Input } from "../engine/cable";

/** Item kinds. "box" = a speaker box (data = the box project fields, the v1 format); "door" and "ib" = a driver choice with
 * notes; the rest are reserved for later jobs (B3 parts, B4 cable calculator, B5 BOM). */
export const ITEM_KINDS = ["box", "door", "ib", "amplifier", "dsp", "capacitor", "fuse", "fuseholder", "distribution", "cable", "connector", "battery", "alternator", "other"] as const; // B4: battery, alternator (System tab)
export type ItemKind = (typeof ITEM_KINDS)[number];
/** What a link carries (R44: the wiring diagram and the missing-part check read these). */
export const LINK_KINDS = ["power", "ground", "signal", "speaker", "remote"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
/** A typed connection between two items of the same project, stored on the `from` item (item.links). Ports are free names
 * such as "+12V", "GND", "REM", "CH1 L", "out 1" (the job that draws the diagram defines its port names); cableItemId points
 * at the cable item that makes the connection, when there is one. */
export interface ItemLink { from: string; fromPort?: string; to: string; toPort?: string; kind: LinkKind; cableItemId?: string; note?: string }
export const isLinkKind = (k: unknown): k is LinkKind => typeof k === "string" && (LINK_KINDS as readonly string[]).includes(k);
/** A stored link made whole: `from` is always the item that holds it; links without a known kind are dropped. */
function cleanLink(l: any, owner: string): ItemLink | undefined {
  if (!l || typeof l.to !== "string" || !isLinkKind(l.kind)) return undefined;
  const out: ItemLink = { from: owner, to: l.to, kind: l.kind };
  for (const k of ["fromPort", "toPort", "cableItemId", "note"] as const) if (typeof l[k] === "string" && l[k]) out[k] = l[k];
  return out;
}
export interface Item {
  id: string; section: SectionId | string; kind: ItemKind | string; name: string;
  data: any;
  links?: ItemLink[];
  created?: string; saved?: string;
  /** Where it came from when copied (My items <-> project). */
  from?: { item?: string; project?: string };
}
export interface ProjectDoc {
  format: 2; name: string; title: string;
  /** Section last shown for this project. */
  section: SectionId;
  /** Item last shown. */
  activeItem?: string;
  items: Item[];
  notes?: string; created?: string; saved?: string;
  /** B4_SYSTEM_UI: cable calculator options (docs/cable_engine.md CableOptions) and the big 3 upgrade, saved with the project. */
  cableOptions?: Partial<CableOptions>; cableBig3?: Big3Input;
  /** B5_BOM: per-line quantity / price overrides of the bill of materials (key = BOM line key) and the cable spare %. */
  bomOverrides?: Record<string, { qty?: number; priceAud?: number }>; bomSparePct?: number;
}
/** A standalone item in My items (data/items/<id>.json). */
export interface SavedItem extends Item { format: 2; type: "item" }

export const isV2 = (raw: any): boolean => !!raw && raw.format === 2 && Array.isArray(raw.items);
/** Id of the single box item a v1 project becomes. */
export const LEGACY_ITEM_ID = "box-1";
export const LEGACY_ITEM_NAME = "Subwoofer box";

/** New unique item id (safe for file names: letters, digits, _ and -). */
export function newItemId(taken: Iterable<string> = [], prefix = "it"): string {
  const t = new Set(taken);
  for (;;) { const id = `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; if (!t.has(id)) return id; }
}

/** Fill the fields a stored item may lack; box data goes through the v1 upgrade (missing fields filled, nothing changed). */
export function upgradeItem(it: any): Item {
  const kind = typeof it?.kind === "string" ? it.kind : "box";
  const section = isSection(it?.section) ? it.section : typeof it?.section === "string" ? it.section : "subwoofer";
  const data = kind === "box" ? upgradeProject({ name: "", title: "", ...(it?.data ?? {}) }) : { ...(it?.data ?? {}) };
  return { ...it, id: String(it?.id || newItemId()), section, kind, name: String(it?.name ?? ""), data, links: Array.isArray(it?.links) ? it.links.map((l: any) => cleanLink(l, String(it?.id))).filter(Boolean) as ItemLink[] : [] };
}

/** Read a stored project of either format. A v1 project becomes a project with one Subwoofer box item whose data is the v1
 * project itself (so it shows exactly what it showed before). legacy = true: it came from a v1 file. */
export function readProject(raw: any): { doc: ProjectDoc; legacy: boolean } {
  if (isV2(raw)) {
    const items = raw.items.map(upgradeItem);
    const section = isSection(raw.section) ? raw.section : (items[0]?.section as SectionId) ?? "subwoofer";
    return { doc: { ...raw, format: 2, name: String(raw.name), title: String(raw.title ?? raw.name), section: isSection(section) ? section : "subwoofer", items }, legacy: false };
  }
  const p = upgradeProject(raw);
  return { doc: { format: 2, name: p.name, title: p.title, section: "subwoofer", activeItem: LEGACY_ITEM_ID, items: [{ id: LEGACY_ITEM_ID, section: "subwoofer", kind: "box", name: LEGACY_ITEM_NAME, data: p, links: [] }] }, legacy: true };
}

/** Can this project still be written in the v1 format without losing anything? (one Subwoofer box item, default id and name,
 * no links). A v1 file stays v1 while this holds, so the older scripts and an older server keep working. */
export function legacyCompatible(doc: ProjectDoc): boolean {
  if (doc.items.length !== 1) return false;
  const it = doc.items[0];
  return it.kind === "box" && it.section === "subwoofer" && it.id === LEGACY_ITEM_ID && it.name === LEGACY_ITEM_NAME && !(it.links?.length) && !doc.notes && !doc.cableOptions && !doc.cableBig3 && !(doc.bomOverrides && Object.keys(doc.bomOverrides).length) && doc.bomSparePct === undefined; // B4: calculator options need v2; B5: BOM overrides and spare % too
}

/** What to write to data/projects/<name>.json: the v1 project for a legacy file that still fits v1, else the v2 document.
 * skip = ids of items made in memory only (a section opened but never changed): left out. */
export function toDisk(doc: ProjectDoc, legacy: boolean, skip: Set<string> = new Set()): any {
  const items = doc.items.filter((i) => !skip.has(i.id));
  const out: ProjectDoc = { ...doc, items: items.map(cleanItem), activeItem: items.some((i) => i.id === doc.activeItem) ? doc.activeItem : items[0]?.id };
  if (legacy && legacyCompatible(out)) return { name: doc.name, title: doc.title, ...out.items[0].data };
  return out;
}
/** An item as stored: box data keeps the v1 fields; the project name/title inside box data are not the item's (dropped). */
export function cleanItem(it: Item): Item {
  const out: Item = { ...it, links: it.links ?? [] };
  if (it.kind === "box" && it.data) { const { name: _n, title: _t, saved: _s, ...rest } = it.data; out.data = rest; }
  return out;
}

/** A new empty project (v2) with its first item. */
export function newProject(name: string, title: string, first: Item): ProjectDoc {
  return { format: 2, name, title, section: isSection(first.section) ? first.section : "subwoofer", activeItem: first.id, items: [first], created: new Date().toISOString() };
}
/** A new item. */
export function newItem(section: SectionId | string, kind: ItemKind | string, name: string, data: any, taken: Iterable<string> = []): Item {
  return { id: newItemId(taken), section, kind, name, data, links: [], created: new Date().toISOString() };
}
/** A deep copy of an item with a new id (links are dropped: they point at items of the other project). */
export function copyItem(it: Item, taken: Iterable<string> = [], from?: Item["from"]): Item {
  const c: Item = JSON.parse(JSON.stringify(it));
  c.id = newItemId(taken); c.links = []; c.created = new Date().toISOString(); delete c.saved; delete (c as any).format; delete (c as any).type;
  if (from) c.from = from;
  return c;
}
/** Add a copy of an item (e.g. from My items) to a project; returns the new item. */
export function addItemToProject(doc: ProjectDoc, it: Item, from?: Item["from"]): Item {
  const c = copyItem(it, doc.items.map((i) => i.id), from);
  doc.items.push(c); return c;
}
/** Remove an item; links from other items to it are removed too. Returns the removed item. */
export function removeItem(doc: ProjectDoc, id: string): Item | undefined {
  const i = doc.items.findIndex((x) => x.id === id); if (i < 0) return undefined;
  const [gone] = doc.items.splice(i, 1);
  for (const it of doc.items) if (it.links) it.links = it.links.filter((l) => l.to !== id).map((l) => { if (l.cableItemId !== id) return l; const { cableItemId: _c, ...r } = l; return r; });
  if (doc.activeItem === id) doc.activeItem = doc.items[0]?.id;
  return gone;
}
/** Duplicate an item inside the same project (links kept, they still point at items of this project). */
export function duplicateItem(doc: ProjectDoc, id: string, name?: string): Item | undefined {
  const it = doc.items.find((x) => x.id === id); if (!it) return undefined;
  const c = copyItem(it, doc.items.map((i) => i.id)); c.links = (it.links ?? []).map((l) => ({ ...l, from: c.id })); c.name = name ?? `${it.name} (copy)`;
  doc.items.push(c); return c;
}
/** Link item `from` to item `to` (R44 typed link: kind power / ground / signal / speaker / remote; optional ports and the cable
 * item). Refuses self links, unknown items, unknown kinds and an identical link. */
export function linkItems(doc: ProjectDoc, from: string, to: string, kind: string, opt: { fromPort?: string; toPort?: string; cableItemId?: string; note?: string } = {}): { ok: boolean; error?: string } {
  if (from === to) return { ok: false, error: "an item cannot link to itself" };
  const a = doc.items.find((x) => x.id === from), b = doc.items.find((x) => x.id === to);
  if (!a || !b) return { ok: false, error: "no such item" };
  if (!isLinkKind(kind)) return { ok: false, error: "a link needs a kind: " + LINK_KINDS.join(", ") };
  if (opt.cableItemId && !doc.items.some((x) => x.id === opt.cableItemId)) return { ok: false, error: "no such cable item" };
  const l = cleanLink({ ...opt, to, kind }, from)!;
  a.links ??= [];
  if (a.links.some((x) => x.to === to && x.kind === kind && (x.fromPort ?? "") === (l.fromPort ?? "") && (x.toPort ?? "") === (l.toPort ?? ""))) return { ok: false, error: "that link exists already" };
  a.links.push(l); return { ok: true };
}
/** Remove links from `from` to `to` (of one kind, or all). */
export function unlinkItems(doc: ProjectDoc, from: string, to: string, kind?: string): void {
  const a = doc.items.find((x) => x.id === from); if (!a?.links) return;
  a.links = a.links.filter((l) => !(l.to === to && (kind === undefined || l.kind === kind)));
}
/** Links that point at an item (incoming). */
export const linksTo = (doc: ProjectDoc, id: string): ItemLink[] => doc.items.flatMap((it) => (it.links ?? []).filter((l) => l.to === id));
/** Every link of the project (what the wiring diagram job reads). */
export const allLinks = (doc: ProjectDoc): ItemLink[] => doc.items.flatMap((it) => it.links ?? []);
/** A copy of a whole project under a new name and title (item ids and links kept). */
export function duplicateProject(doc: ProjectDoc, name: string, title: string): ProjectDoc {
  const c: ProjectDoc = JSON.parse(JSON.stringify(doc)); c.name = name; c.title = title; c.created = new Date().toISOString(); delete c.saved;
  return c;
}
/** A project item turned into a My items entry (new id; links dropped). */
export function toSavedItem(it: Item, project?: string): SavedItem {
  const c = copyItem(it, [], project ? { item: it.id, project } : it.from);
  const out = { ...cleanItem(c), format: 2 as const, type: "item" as const };
  return out;
}
/** Read a stored My items entry. */
export function readSavedItem(raw: any): SavedItem { return { ...upgradeItem(raw), format: 2, type: "item" }; }

/** The box project (v1 fields) of a box item, named for the place it is shown in (exports and measurements use this name). */
export function boxOf(it: Item, name: string, title: string): Project {
  const p = it.data as Project; p.name = name; p.title = title; return p;
}
