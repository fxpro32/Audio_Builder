// B5_BOM (R42): bill of materials engine, .xlsx writer (read back and formulas evaluated: no LibreOffice in the container) and CSV.
import { describe, expect, it } from "vitest";
import { bomForProject, partPrices, rcaPairs, setBomOverride, DEFAULT_SPARE_PCT } from "../src/engine/bom";
import type { Bom } from "../src/engine/bom";
import { bomCsv, bomWorkbook, BOM_COLS } from "../src/io/bomexport";
import { crc32, zipStore, colName } from "../src/io/xlsx";
import { legacyCompatible, readProject, toDisk } from "../src/ui/projectv2";
import { checkSystem } from "../src/engine/syscheck";
import { blankProject } from "../src/ui/model";
import { bomSystem, lookups, PARTS } from "./bomfixture";
import { Evaluator, readXlsx, unzip } from "./xlsxread";

const line = (b: Bom, key: string) => b.groups.flatMap((g) => g.lines).find((l) => l.key === key);
const DATE = "2026-11-23";

describe("BOM of a full system", () => {
  const b = bomForProject(bomSystem(), lookups(), { date: DATE });
  it("has the expected groups in order", () => {
    expect(b.groups.map((g) => g.id)).toEqual(["speakers", "enclosure", "amplifiers", "dsp", "power", "cable", "connectors"]);
    expect(b.sparePct).toBe(DEFAULT_SPARE_PCT);
  });
  it("drivers: count and lowest price first (unpriced entries left out)", () => {
    const s = line(b, "drv:box-1")!; expect(s.qty).toBe(1); expect(s.unitPrice).toBe(250); expect(s.supplier).toBe("Shop A"); expect(s.prices.map((p) => p.priceAud)).toEqual([250, 300]);
    const d = line(b, "drv:doors")!; expect(d.qty).toBe(2); expect(d.total).toBe(199);
  });
  it("parts: lowest price first", () => {
    const a = line(b, "item:amp1")!; expect(a.unitPrice).toBe(850); expect(a.supplier).toBe("S2"); expect(a.total).toBe(850);
    expect(partPrices(PARTS["amp-x"]).map((p) => p.supplier)).toEqual(["S2", "S1"]);
    expect(line(b, "item:amp2")!.unitPrice).toBeUndefined();
  });
  it("cable metres per gauge and material, + 10 % spare, rounded up", () => {
    const m = (k: string) => line(b, k)?.qty;
    expect(m("cable:power:1/0:copper:generic")).toBe(5); // 3.5 m + 0.15 m battery to fuse = 3.65 x 1.1 = 4.02 -> 5
    expect(m("cable:power:4:copper:generic")).toBe(1);
    expect(m("cable:power:8:copper:generic")).toBe(1);
    expect(m("cable:ground:4:copper:generic")).toBe(1);
    expect(m("cable:speaker:12:copper:generic")).toBe(4); // 3 x 1.1 = 3.3 -> 4
    expect(m("cable:speaker:14:copper:generic")).toBe(3);
    expect(line(b, "cable:power:4:copper:generic")!.notes).toMatch(/1 wire of unknown length/);
    expect(m("cable:remote:?:copper:generic")).toBeUndefined(); // 3 remote wires, no lengths
    expect(m("rca:generic")).toBe(4); // DSP out 1-4 = 2 pairs, out 7/8 = 1, head unit RCA out = 1
  });
  it("spare % changes the metres", () => {
    const b0 = bomForProject(bomSystem(), lookups(), { date: DATE, sparePct: 0 });
    expect(line(b0, "cable:power:1/0:copper:generic")!.qty).toBe(4); // 3.65 -> 4
    expect(line(b0, "cable:speaker:12:copper:generic")!.qty).toBe(3);
  });
  it("lugs and ferrules per wire end by gauge and stud, grommet", () => {
    const q = (k: string) => line(b, k)?.qty;
    expect(q("lug:ring lug:1/0:battery terminal stud")).toBe(1);
    expect(q("lug:ring lug:1/0:fuse holder stud")).toBe(2);
    expect(q("lug:ferrule:1/0:")).toBe(1);
    expect(q("lug:ferrule:4:")).toBe(3);
    expect(q("lug:ring lug:4:capacitor stud")).toBe(2);
    expect(q("lug:ring lug:4:chassis bolt")).toBe(1);
    expect(q("lug:ferrule:8:")).toBe(3);
    expect(q("lug:ferrule:10:")).toBe(3);
    expect(q("lug:ferrule:12:")).toBe(2); expect(q("lug:spade terminal:12:")).toBe(2);
    expect(q("grommet:firewall")).toBe(1);
  });
  it("fuses for the holder and each fused output", () => {
    expect(line(b, "fuse:ANL:250")!.qty).toBe(1);
    const outs = b.groups.find((g) => g.id === "power")!.lines.filter((l) => l.key.startsWith("fuse:block:"));
    expect(outs.reduce((s, l) => s + (l.qty ?? 0), 0)).toBe(3);
  });
  it("MDF sheet from the board nesting, enclosure materials", () => {
    const s = b.groups.find((g) => g.id === "enclosure")!.lines.find((l) => l.key.startsWith("mdf:16:"))!;
    expect(s.qty).toBe(1); expect(s.unitPrice).toBeGreaterThan(0); expect(s.derived).toMatch(/6 panels/);
    for (let i = 1; i < s.prices.length; i++) expect(s.prices[i].priceAud).toBeGreaterThanOrEqual(s.prices[i - 1].priceAud);
    expect(line(b, "enc:terminal")!.qty).toBe(1); expect(line(b, "enc:fill")!.qty).toBe(1); expect(line(b, "enc:drvscrews")!.qty).toBe(8);
  });
  it("plain battery counts 0, totals add up", () => {
    expect(line(b, "item:bat")!.qty).toBe(0);
    const all = b.groups.flatMap((g) => g.lines);
    expect(b.total).toBeCloseTo(all.reduce((s, l) => s + (l.total ?? 0), 0), 6);
    expect(b.priced).toBe(all.filter((l) => l.total !== undefined).length);
    expect(b.count).toBe(all.length);
    for (const g of b.groups) expect(g.subtotal).toBeCloseTo(g.lines.reduce((s, l) => s + (l.total ?? 0), 0), 6);
  });
  it("missing parts come from the check, nothing invented", () => {
    const doc = bomSystem(); doc.items = doc.items.filter((i) => i.id !== "anl"); for (const i of doc.items) i.links = (i.links ?? []).filter((l) => l.to !== "anl");
    const issues = checkSystem(doc, lookups());
    const bm = bomForProject(doc, lookups(), { date: DATE });
    expect(bm.missing.filter((m) => m.key.startsWith("issue:")).length).toBe(issues.length);
    expect(issues.length).toBeGreaterThan(0);
    expect(bm.groups.flatMap((g) => g.lines).some((l) => /fuse:ANL/.test(l.key))).toBe(false);
  });
  it("overrides: quantity and price, saved on the project, cleared again", () => {
    const doc = bomSystem();
    setBomOverride(doc, "cable:power:1/0:copper:generic", { qty: 7, priceAud: 12.5 });
    const bo = bomForProject(doc, lookups(), { date: DATE });
    const l = line(bo, "cable:power:1/0:copper:generic")!;
    expect(l.qty).toBe(7); expect(l.calcQty).toBe(5); expect(l.unitPrice).toBe(12.5); expect(l.total).toBe(87.5); expect(l.overridden).toEqual({ qty: true, price: true });
    expect(bo.total).toBeCloseTo(b.total + 87.5, 6);
    const back = readProject(JSON.parse(JSON.stringify(toDisk(doc, false)))).doc;
    expect(back.bomOverrides).toEqual({ "cable:power:1/0:copper:generic": { qty: 7, priceAud: 12.5 } });
    setBomOverride(doc, "cable:power:1/0:copper:generic", { qty: undefined, priceAud: undefined });
    expect(doc.bomOverrides).toBeUndefined();
  });
  it("rcaPairs", () => { expect(rcaPairs("out 1-4")).toBe(2); expect(rcaPairs("out 7/8")).toBe(1); expect(rcaPairs("RCA out")).toBe(1); expect(rcaPairs("out 1-6")).toBe(3); });
});

describe("box-only project and single item", () => {
  it("an old v1 box project gives a materials BOM", () => {
    const p = blankProject("old", "Old box", "drvA"); Object.assign(p, { kind: "sealed" });
    const r = readProject(JSON.parse(JSON.stringify(p))); expect(r.legacy).toBe(true);
    const b = bomForProject(r.doc, lookups(), { date: DATE });
    expect(b.groups.map((g) => g.id)).toEqual(["speakers", "enclosure"]);
    expect(b.groups[1].lines.some((l) => l.key.startsWith("mdf:"))).toBe(true);
    expect(b.missing.some((m) => /amplifier/i.test(m.item + m.notes))).toBe(true); // the check's "no amplifier" warning
    // a legacy project stays v1 until BOM overrides are saved on it
    expect(legacyCompatible(r.doc)).toBe(true);
    setBomOverride(r.doc, "enc:glue", { qty: 2 }); expect(legacyCompatible(r.doc)).toBe(false);
  });
  it("a box without the app's panels says so in Missing", () => {
    const p = blankProject("old", "Old box", "drvA");
    const b = bomForProject(readProject(p).doc, { ...lookups(), box: undefined }, { date: DATE });
    expect(b.missing.some((m) => m.key.startsWith("miss:panels:"))).toBe(true);
  });
});

describe("xlsx and CSV", () => {
  const doc = bomSystem();
  setBomOverride(doc, "item:amp2", { priceAud: 400 });
  const b = bomForProject(doc, lookups(), { date: DATE });
  const bytes = bomWorkbook(doc, b, { appVersion: "0.1.0", sources: [{ name: "Test", licence: "CC BY 4.0" }], part: (id) => PARTS[id] });
  it("zip: CRC-32 and STORE round trip", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const z = unzip(zipStore([{ name: "a.txt", data: new TextEncoder().encode("hello") }]));
    expect(new TextDecoder().decode(z.get("a.txt")!)).toBe("hello");
    expect(colName(0)).toBe("A"); expect(colName(25)).toBe("Z"); expect(colName(26)).toBe("AA");
  });
  const wb = readXlsx(bytes);
  it("valid package with the six sheets", () => {
    for (const f of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/styles.xml", "xl/_rels/workbook.xml.rels"]) expect(wb.files.has(f)).toBe(true);
    expect(wb.order).toEqual(["BOM", "Parts", "Cables", "Items", "Diagram", "Info"]);
    expect(new TextDecoder().decode(wb.files.get("xl/workbook.xml")!)).toMatch(/fullCalcOnLoad="1"/);
  });
  const ev = new Evaluator(wb);
  const bomCells = wb.sheets.get("BOM")!;
  it("formulas present and every formula's value matches the cached value", () => {
    const fs = [...bomCells.entries()].filter(([, c]) => c.f);
    expect(fs.some(([, c]) => /^SUM\(/.test(c.f!))).toBe(true);
    expect(fs.some(([, c]) => /Parts!\$F\$\d+/.test(c.f!))).toBe(true);
    expect(fs.some(([, c]) => /COUNT\(/.test(c.f!))).toBe(true);
    for (const sh of wb.order) for (const [ref, c] of wb.sheets.get(sh)!) if (c.f) {
      const v = ev.value(sh, ref); const cached = c.t === "str" ? (c.v ?? "") : c.t === "b" ? c.v === "1" : Number(c.v);
      if (typeof v === "number") expect(v).toBeCloseTo(cached as number, 6); else expect(v === null ? "" : v).toEqual(cached);
    }
  });
  const findRow = (text: string) => { for (const [ref, c] of bomCells) if (ref.startsWith("B") && c.v === text) return Number(ref.slice(1)); return -1; };
  it("grand total and n of m priced", () => {
    const r = findRow("Grand total (all groups)"); expect(r).toBeGreaterThan(0);
    expect(ev.value("BOM", `I${r}`)).toBeCloseTo(b.total, 6);
    expect(ev.value("BOM", `N${r}`)).toBe(`${b.priced} of ${b.count} lines priced`);
    expect(b.total).toBeCloseTo(250 + 199 + 850 + 400 + (line(b, b.groups[1].lines[0].key)!.total ?? 0), 6);
  });
  it("blank prices stay blank", () => {
    const r = findRow(line(b, "item:hu")!.item);
    expect(ev.value("BOM", `H${r}`)).toBe(null); expect(ev.value("BOM", `I${r}`)).toBe("");
  });
  it("Parts link: changing a price on the Parts sheet updates the BOM", () => {
    const parts = wb.sheets.get("Parts")!;
    let pr = -1; for (const [ref, c] of parts) if (ref.startsWith("A") && c.v === "amp-x") pr = Number(ref.slice(1));
    expect(pr).toBeGreaterThan(0); expect(Number(parts.get(`F${pr}`)!.v)).toBe(850);
    const r = findRow("AmpCo M1000");
    expect(bomCells.get(`H${r}`)!.f).toBe(`IF(Parts!$F$${pr}="","",Parts!$F$${pr})`);
    const gr = findRow("Grand total (all groups)");
    parts.set(`F${pr}`, { v: "1000" }); const ev2 = new Evaluator(wb);
    expect(ev2.value("BOM", `H${r}`)).toBe(1000); expect(ev2.value("BOM", `I${r}`)).toBe(1000);
    expect(ev2.value("BOM", `I${gr}`)).toBeCloseTo(b.total + 150, 6);
    expect(ev2.value("BOM", `J${r}`)).toBe("S2");
    parts.set(`F${pr}`, { v: "850" });
  });
  it("an overridden price is a value, not a link", () => {
    const r = findRow("4ch amp"); expect(bomCells.get(`H${r}`)!.f).toBeUndefined(); expect(Number(bomCells.get(`H${r}`)!.v)).toBe(400);
    expect(bomCells.get(`J${r}`)!.v).toBe("your price");
  });
  it("CSV matches the BOM sheet", () => {
    const csv = bomCsv(b); expect(csv.startsWith("﻿")).toBe(true);
    const rows = parseCsv(csv.slice(1));
    expect(rows[0]).toEqual([...BOM_COLS]);
    const ev3 = new Evaluator(wb);
    let header = -1; for (const [ref, c] of bomCells) if (ref.startsWith("A") && c.v === "Group" && c.s) header = Number(ref.slice(1));
    expect(header).toBe(4);
    let checked = 0;
    rows.forEach((row, i) => {
      const r = header + i;
      row.forEach((cell, c) => {
        if (c === 11 || c === 15) return; // link columns: the URL in the CSV, the link text in the sheet
        const v = ev3.value("BOM", `${colName(c)}${r}`); const sv = v === null ? "" : typeof v === "number" ? v : String(v);
        if (typeof sv === "number") expect(Number(cell)).toBeCloseTo(sv, 2); else expect(cell).toBe(sv);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(400);
  });
});

function parseCsv(s: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\r") { /* skip */ } else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else cur += ch;
  }
  return rows;
}
