// Fixture for tests/bom.test.ts (B5_BOM): the full system of tests/fixtures_system.ts with a sized sealed box, drivers with AUD
// price lists (unsorted, to check lowest-first), an amplifier part, and an MDF sheet catalogue. P1_PUBLIC_DATA: the synthetic
// test catalogue tests/fixtures/board_catalogues.json (made-up suppliers and prices; the real supplier catalogue is private data).
import { readFileSync } from "node:fs";
import { fullSystem } from "./fixtures_system";
import { readProject } from "../src/ui/projectv2";
import type { ProjectDoc, Item } from "../src/ui/projectv2";
import { cutList } from "../src/ui/model";
import { piecesFromRows } from "../src/engine/nest";
import type { BomLookups, BoxSource } from "../src/engine/bom";

export const boardFixture = JSON.parse(readFileSync(new URL("./fixtures/board_catalogues.json", import.meta.url), "utf8"));
export const catalogue = boardFixture.mdf;
export const DRIVERS: Record<string, any> = {
  drvA: { id: "drvA", brand: "Test", model: "Sub12", sizeLabel: "12 in", type: "subwoofer", params: { fs: 30, Re: 3.5, Qms: 5, Qes: 0.5, Sd: 0.05, Znom: 4 },
    priceAud: [{ retailer: "Shop B", price_aud: 300, url: "https://example.com/b", read_date: "2026-11-20" }, { retailer: "Shop A", price_aud: 250, url: "https://example.com/a", read_date: "2026-11-21" }, { retailer: "Shop C", price_aud: 0 }] },
  door4: { id: "door4", brand: "Test", model: "Door6", sizeLabel: "6.5 in", params: { fs: 60, Re: 3.4, Qms: 4, Qes: 0.6, Sd: 0.013, Znom: 4 }, priceAud: [{ supplier: "Shop D", price_aud: 99.5, read_date: "2026-11-22" }] },
};
export const PARTS: Record<string, any> = {
  "amp-x": { id: "amp-x", brand: "AmpCo", model: "M1000", category: "amplifiers", sourceUrl: "https://example.com/amp-x", n: { cls: "D", channels: 1, rms: { "1": 1000 }, prices: [{ supplier: "S1", priceAud: 900, date: "2026-11-23", url: "https://example.com/s1" }, { supplier: "S2", priceAud: 850, date: "2026-11-22", url: "https://example.com/s2" }] } },
};
export function boxSource(it: Item): BoxSource | undefined {
  const p = it.data; if (!p?.geom) return undefined;
  const rows = cutList(p);
  return { label: it.name, panels: rows.flatMap((r) => piecesFromRows([r]).map((pc) => ({ ...pc, t: r.name === "Second baffle" ? p.geom.baffleExtra : p.geom.t }))), kind: p.kind, port: p.port ? { shape: p.port.shape, count: p.port.count, d: p.port.d, lengthMm: p.port.length } : undefined };
}
export const lookups = (): BomLookups => ({ driver: (id) => DRIVERS[id], part: (id) => PARTS[id], box: boxSource, sheets: catalogue.sheets, kerfMm: catalogue.kerfMmDefault, trimMm: catalogue.edgeTrimMmDefault });
export function bomSystem(): ProjectDoc {
  const doc = readProject(fullSystem()).doc;
  const box = doc.items.find((i) => i.id === "box-1")!;
  Object.assign(box.data, { driverId: "drvA", drivers: 1, kind: "sealed", geom: { ...box.data.geom, W: 405, H: 360, D: 255, wedge: false, Dtop: 255, t: 16, baffleExtra: 0 } });
  doc.items.find((i) => i.id === "amp1")!.data.partId = "amp-x";
  doc.items.find((i) => i.id === "amp1")!.data.partCategory = "amplifiers";
  return doc;
}
