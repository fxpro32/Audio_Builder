// A14_DRIVERLIST: "Subwoofers only" rule and paging maths of the Drivers tab.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { countLine, isSubwoofer, pageInfo, PAGE_SIZE, sizeOf } from "../src/ui/driverlist";
import type { Driver } from "../src/engine/driver";

const drv = (o: Partial<Driver> & { dia?: number }): Driver => ({ id: "x", brand: "B", model: "M", params: { fs: 30, Re: 3.5, Qms: 5, Qes: 0.5, Sd: 0.05, ...(o.dia ? { dia: o.dia } : {}) }, ...o });

describe("isSubwoofer", () => {
  it("keeps 8 in and up by sizeIn or outer diameter", () => {
    expect(isSubwoofer(drv({ library: "qspeakers", sizeIn: 8 }))).toBe(true);
    expect(isSubwoofer(drv({ library: "qspeakers", sizeIn: 6 }))).toBe(false);
    expect(isSubwoofer(drv({ library: "driver-base", dia: 0.3048 }))).toBe(true); // 12 in
    expect(isSubwoofer(drv({ library: "driver-base", dia: 0.165 }))).toBe(false); // 6.5 in
  });
  it("keeps every car-sub library entry, even without or below the size", () => {
    expect(isSubwoofer(drv({ library: "hp-car-subs" }))).toBe(true);
    expect(isSubwoofer(drv({ library: "buildbass", dia: 0.165 }))).toBe(true);
  });
  it("library drivers without a size are left out; your own drivers without a size are kept", () => {
    expect(isSubwoofer(drv({ library: "qspeakers" }))).toBe(false);
    expect(isSubwoofer(drv({}))).toBe(true);
    expect(isSubwoofer(drv({ sizeIn: 6 }))).toBe(false);
    expect(isSubwoofer(drv({ private: true, sizeIn: 12 }))).toBe(true);
  });
  it("passive radiators are never subwoofers here", () => {
    expect(isSubwoofer(drv({ kind: "passive", sizeIn: 12 }))).toBe(false);
    expect(isSubwoofer(drv({ kind: "passive", library: "hp-car-subs" }))).toBe(false);
  });
  it("sizeOf rounds the outer diameter to whole inches", () => {
    expect(sizeOf(drv({ dia: 0.3048 }))).toBe(12);
    expect(sizeOf(drv({ sizeIn: 15, dia: 0.3048 }))).toBe(15);
    expect(sizeOf(drv({}))).toBeUndefined();
  });
});

describe("pageInfo", () => {
  it("splits 2,894 rows into 15 pages of 200", () => {
    expect(pageInfo(2894, 1)).toEqual({ page: 1, pages: 15, start: 0, end: 200 });
    expect(pageInfo(2894, 15)).toEqual({ page: 15, pages: 15, start: 2800, end: 2894 });
  });
  it("clamps out-of-range pages and handles 0 rows", () => {
    expect(pageInfo(2894, 99).page).toBe(15);
    expect(pageInfo(2894, 0).page).toBe(1);
    expect(pageInfo(0, 3)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
    expect(pageInfo(200, 2)).toEqual({ page: 1, pages: 1, start: 0, end: 200 });
    expect(pageInfo(201, 2)).toEqual({ page: 2, pages: 2, start: 200, end: 201 });
  });
  it("every row lands on exactly one page", () => {
    for (const total of [1, 199, 200, 201, 2894]) {
      const { pages } = pageInfo(total, 1); let seen = 0;
      for (let p = 1; p <= pages; p++) { const pi = pageInfo(total, p); seen += pi.end - pi.start; expect(pi.end - pi.start).toBeLessThanOrEqual(PAGE_SIZE); }
      expect(seen).toBe(total);
    }
  });
});

describe("countLine", () => {
  it("says the range and the totals", () => {
    expect(countLine(pageInfo(2894, 1), 2894, 2894)).toBe("Showing 1-200 of 2,894 drivers");
    expect(countLine(pageInfo(412, 3), 412, 2894)).toBe("Showing 401-412 of 412 matching (2,894 in all)");
    expect(countLine(pageInfo(0, 1), 0, 2894)).toBe("Showing 0 of 0 matching (2,894 in all)");
  });
});

describe("bundled libraries", () => {
  it("every hp-car-subs and buildbass driver counts as a subwoofer", () => {
    const lib = path.join(__dirname, "..", "..", "data", "drivers", "library");
    for (const f of ["hp-car-subs", "buildbass"]) {
      const b = JSON.parse(fs.readFileSync(path.join(lib, f + ".json"), "utf8"));
      const ds = (b.drivers as Driver[]).map((d) => ({ ...d, library: d.library || b.source }));
      expect(ds.length).toBeGreaterThan(0);
      expect(ds.every(isSubwoofer)).toBe(true);
    }
  });
});
