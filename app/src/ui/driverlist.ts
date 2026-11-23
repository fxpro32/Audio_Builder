// Drivers tab list helpers (A14_DRIVERLIST, 2026-11-23): nominal size, the "Subwoofers only" rule and paging maths.
// Pure functions (no DOM) so app/tests can check them.
import type { Driver, DriverType } from "../engine/driver";

/** Libraries whose every entry is a car subwoofer (kept by "Subwoofers only" whatever the size field says). */
export const CAR_SUB_LIBS = ["car-subs", "hp-car-subs", "buildbass"]; // B3: car-subs (all power levels) supersedes hp-car-subs
/** Smallest nominal size (inches) counted as a subwoofer. */
export const SUB_MIN_IN = 8;
/** Rows per page in the Drivers tab. */
export const PAGE_SIZE = 200;

/** Nominal size in inches: the published size, else the outer diameter rounded to whole inches. */
export const sizeOf = (d: Driver): number | undefined => d.sizeIn ?? (d.params.dia ? Math.round(d.params.dia / 0.0254) : undefined);

/** "Subwoofers only": 8 in and up, every car-sub library entry, your own drivers of 8 in and up or without a size; never passive radiators. */
export function isSubwoofer(d: Driver): boolean {
  if (d.kind === "passive") return false;
  if (d.type) return d.type === "subwoofer"; // B3: car-drivers library (tweeters, midbass, ...) are never subwoofers, whatever their size
  if (d.library && CAR_SUB_LIBS.includes(d.library)) return true;
  const s = sizeOf(d);
  if (s === undefined) return !d.library;
  return s >= SUB_MIN_IN;
}

export interface PageInfo { page: number; pages: number; start: number; end: number; }
/** Page `page` (1-based, clamped) of `total` rows: start index (inclusive) and end index (exclusive). */
export function pageInfo(total: number, page: number, size = PAGE_SIZE): PageInfo {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * size;
  return { page: p, pages, start, end: Math.min(total, start + size) };
}

const n = (x: number) => x.toLocaleString("en-AU");
/** Count line above the list, e.g. "Showing 1-200 of 2,894 drivers" or "Showing 1-200 of 412 matching (2,894 in all)". */
export function countLine(pi: PageInfo, shown: number, all: number, noun = "drivers"): string {
  const range = shown ? `${n(pi.start + 1)}-${n(pi.end)}` : "0";
  return shown === all ? `Showing ${range} of ${n(all)} ${noun}` : `Showing ${range} of ${n(shown)} matching (${n(all)} in all)`;
}

// ---------- B3_PARTS_DB: driver types (car libraries), old library ids, your own entry before a library copy ----------
export const DRIVER_TYPES: { id: DriverType; label: string }[] = [
  { id: "subwoofer", label: "Subwoofers" }, { id: "tweeter", label: "Tweeters" }, { id: "midrange", label: "Midrange" }, { id: "midbass", label: "Midbass" },
  { id: "coaxial", label: "Coaxial" }, { id: "component_set", label: "Component sets" }, { id: "fullrange", label: "Full range" },
];
export const typeLabel = (t?: string) => DRIVER_TYPES.find((x) => x.id === t)?.label ?? "";
/** Type of a driver: the car libraries' type; every car-sub library entry is a subwoofer; others: none. */
export const driverType = (d: Driver): DriverType | undefined => d.type ?? (d.library && CAR_SUB_LIBS.includes(d.library) ? "subwoofer" : undefined);
/** Door speakers (B3): car speakers of these types, 4 to 8 in. Tweeters come later (door section still to be decided). */
export const DOOR_TYPES: DriverType[] = ["midbass", "midrange", "coaxial", "component_set", "fullrange"];
/** Brand + first model word, letters and digits only ("pioneer|tsw3002d4"): the same product in two lists. */
export const modelKey = (d: Pick<Driver, "brand" | "model">) => `${String(d.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${String(d.model ?? "").split(/[\s(/]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "")}`;
/** Library entries that are the same product as one of your own (or private) drivers, e.g. the car-subs Pioneer TS-W3002D4
 * when your private pioneer-ts-w3002d4 exists: they are left out of lists (your entry is shown); still found by id. */
export function shadowedLibraryIds(list: Driver[]): Set<string> {
  const mine = new Set(list.filter((d) => !d.library).map(modelKey));
  return new Set(list.filter((d) => d.library && mine.has(modelKey(d))).map((d) => d.id));
}
/** Driver by id, also an id of an older library (aliases: old id -> new id, from the newer bundle). */
export function findDriver(list: Driver[], id: string | undefined, aliases: Record<string, string> = {}): Driver | undefined {
  if (!id) return undefined;
  return list.find((d) => d.id === id) ?? (aliases[id] ? list.find((d) => d.id === aliases[id]) : undefined);
}
