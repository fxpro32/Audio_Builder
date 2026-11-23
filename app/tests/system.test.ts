// B4_SYSTEM_UI (R41, R44): the System tab's logic (app/src/ui/syslogic.ts): groups, "Wire it for me" (proposal + apply), remove
// keeping the wire, "Add <part>?" for missing-part issues (main fuse inserted into the wire), Use this size, the alert gate (when
// the alert shows), the quick calculator against research_i E1, the alternator sync, calculator options kept out of v1 files;
// and the PM addition: driver AUD prices (retailer or supplier).
import { describe, expect, it } from "vitest";
import { fullSystem } from "./fixtures_system";
import { checkSystem } from "../src/engine/syscheck";
import { calcProject } from "../src/engine/cable";
import { cableFor } from "../src/engine/sysmodel";
import type { CableLookups } from "../src/engine/cable";
import type { ProjectDoc, Item } from "../src/ui/projectv2";
import { legacyCompatible, readProject, toDisk } from "../src/ui/projectv2";
import { alertDecision, applyIssue, applyProposal, cableUse, dismissAlert, groupItems, ItemMaker, plainItem, plainKindItem, proposeWiring, quickCalc, removeKeepChain, setCableSize, syncAlternator, useRecommendedForIssue } from "../src/ui/syslogic";
import { driverPriceFrom, driverPrices } from "../src/engine/driver";

const lk: CableLookups = { driver: (id) => (id === "door4" ? { ohmsPerCoil: 4, coils: 1 } : undefined) };
const clone = (d: ProjectDoc): ProjectDoc => JSON.parse(JSON.stringify(d));
const mk: ItemMaker = (kind, role, name) => (kind === "other" && (role === "ground" || role === "headunit") ? plainItem(role, [], name) : plainKindItem(kind, name, [], role ? { role } : {}));
const unwired = (): ProjectDoc => {
  const d = clone(fullSystem());
  for (const it of d.items) it.links = [];
  for (const id of ["c_s1", "c_s2"]) d.items.find((i) => i.id === id)!.data.use = "speaker";
  return d;
};
const links = (d: ProjectDoc) => d.items.flatMap((i) => (i.links ?? []).map((l) => `${i.id}>${l.to}:${l.kind}${l.cableItemId ? "@" + l.cableItemId : ""}`));

describe("groups", () => {
  it("puts every item of the full system in its group", () => {
    const g = groupItems(fullSystem());
    expect(g.power.map((i) => i.id)).toEqual(expect.arrayContaining(["bat", "anl", "db", "cap", "gnd", "c_main"]));
    expect(g.amps.map((i) => i.id)).toEqual(["amp1", "amp2"]);
    expect(g.signal.map((i) => i.id)).toEqual(["hu", "dsp"]);
    expect(g.speakers.map((i) => i.id)).toEqual(["box-1", "doors"]);
  });
  it("cable use from data.use, part kind, name", () => {
    expect(cableUse({ id: "a", section: "", kind: "cable", name: "x", data: { use: "speaker" } })).toBe("speaker");
    expect(cableUse({ id: "a", section: "", kind: "cable", name: "x", data: { partId: "p" } }, { part: () => ({ kind: "remote/primary" }) })).toBe("remote");
    expect(cableUse({ id: "a", section: "", kind: "cable", name: "Speaker wire 12", data: {} })).toBe("speaker");
    expect(cableUse({ id: "a", section: "", kind: "cable", name: "0 AWG power", data: {} })).toBe("power");
  });
});

describe("Wire it for me", () => {
  it("proposes the standard chain for the unwired full system; applied, it gives no missing-part issue", () => {
    const d = unwired();
    const p = proposeWiring(d, lk);
    expect(p.add).toEqual([]); // battery and ground point exist
    const L = p.links.map((l) => `${l.from}>${l.to}:${l.kind}${l.cableItemId ? "@" + l.cableItemId : ""}`);
    expect(L).toEqual(expect.arrayContaining([
      "bat>anl:power", "anl>db:power@c_main", "db>cap:power@c_b1", "cap>amp1:power", "db>amp2:power@c_b2", "db>dsp:power@c_b3",
      "amp1>gnd:ground@c_g1", "amp2>gnd:ground@c_g2", "dsp>gnd:ground", "hu>dsp:signal", "hu>dsp:remote", "dsp>amp1:signal", "dsp>amp2:signal",
      "dsp>amp1:remote", "dsp>amp2:remote", "amp1>box-1:speaker@c_s1", "amp2>doors:speaker@c_s2"]));
    expect(links(d)).toEqual([]); // nothing applied yet
    const r = applyProposal(d, p, new Set(), new Set(p.links.map((_, k) => k)));
    expect(r.errors).toEqual([]); expect(r.linked).toBe(p.links.length);
    expect(checkSystem(d, lk).map((i) => i.id)).toEqual([]);
    // a second proposal has nothing left to link
    expect(proposeWiring(d, lk).links).toEqual([]);
  });
  it("only ticked links are applied; a link that needs an unticked new item is skipped", () => {
    const d = unwired(); d.items = d.items.filter((i) => i.id !== "bat" && i.id !== "gnd");
    const p = proposeWiring(d, lk);
    expect(p.add.map((i) => i.data.role ?? i.kind)).toEqual(["battery", "ground"]);
    const groundId = p.add[1].id;
    const r = applyProposal(d, p, new Set([p.add[0].id]), new Set(p.links.map((_, k) => k)));
    expect(d.items.some((i) => i.id === groundId)).toBe(false);
    expect(r.errors.length).toBe(p.links.filter((l) => l.to === groundId).length);
  });
  it("box-only project: nothing to wire (no amplifier), says so", () => {
    const d = readProject({ name: "x", title: "X", driverId: "d", kind: "sealed" }).doc;
    const p = proposeWiring(d, lk);
    expect(p.links).toEqual([]); expect(p.notes.join(" ")).toMatch(/amplifier/i);
  });
});

describe("remove keeping the wire, Add a main fuse", () => {
  it("removing the main fuse bridges battery -> block with the main cable; Add puts a fuse back into that wire", () => {
    const d = clone(fullSystem());
    const r = removeKeepChain(d, "anl");
    expect(r.bridged).toBe(1);
    expect(links(d)).toContain("bat>db:power@c_main");
    const issues = checkSystem(d, lk);
    const nf = issues.find((i) => i.rule === "no-main-fuse")!;
    expect(nf.suggestion.label).toBe("Add a main fuse at the battery?");
    expect(issues[0].severity).toBe("critical");
    const a = applyIssue(d, nf, mk, cableFor(d, lk));
    expect(a.changed).toBe(true); expect(a.added[0].kind).toBe("fuseholder");
    const f = a.added[0].id;
    expect(links(d)).toEqual(expect.arrayContaining([`bat>${f}:power`, `${f}>db:power@c_main`]));
    expect(links(d)).not.toContain("bat>db:power@c_main");
    expect(checkSystem(d, lk).filter((i) => i.rule === "no-main-fuse")).toEqual([]);
  });
  it("Add a ground point links the amplifier to it; Add the speaker cables puts a cable item on each link", () => {
    let d = clone(fullSystem());
    d.items.find((i) => i.id === "amp1")!.links = d.items.find((i) => i.id === "amp1")!.links!.filter((l) => l.kind !== "ground");
    let is = checkSystem(d, lk).find((i) => i.rule === "amp-no-ground")!;
    const a = applyIssue(d, is, mk);
    expect(links(d)).toContain(`amp1>${a.added[0].id}:ground`);
    d = clone(fullSystem());
    for (const l of d.items.find((i) => i.id === "amp2")!.links!) delete l.cableItemId;
    d.items = d.items.filter((i) => i.id !== "c_s2" && i.id !== "c_g2");
    is = checkSystem(d, lk).find((i) => i.rule === "speaker-no-cable")!;
    const b = applyIssue(d, is, mk);
    expect(b.added.length).toBe(1);
    expect(d.items.find((i) => i.id === "amp2")!.links!.find((l) => l.kind === "speaker")!.cableItemId).toBe(b.added[0].id);
  });
  it("precharge: the capacitor gets 1000 ohm noted", () => {
    const d = clone(fullSystem()); delete d.items.find((i) => i.id === "cap")!.data.prechargeOhm;
    const is = checkSystem(d, lk).find((i) => i.rule === "cap-no-precharge")!;
    applyIssue(d, is, mk);
    expect(d.items.find((i) => i.id === "cap")!.data.prechargeOhm).toBe(1000);
    expect(checkSystem(d, lk).some((i) => i.rule === "cap-no-precharge")).toBe(false);
  });
});

describe("Use this size", () => {
  it("a too-thin main cable gets the recommended size; the issue goes", () => {
    const d = clone(fullSystem());
    const c = d.items.find((i) => i.id === "c_main")!; c.data.size = "8"; c.data.partId = "some-8awg"; c.data.partCategory = "cable";
    const cv = cableFor(d, lk);
    const is = checkSystem(d, lk, cv.result).find((i) => i.rule === "cable-error" || i.rule === "cable-warning")!;
    expect(is).toBeTruthy();
    const msg = useRecommendedForIssue(d, is, cv.result!, cv.input);
    expect(msg).toMatch(/Use this size/);
    expect(c.data.size).not.toBe("8"); expect(c.data.partId).toBeUndefined(); expect(c.data.replacedPartId).toBe("some-8awg");
    const after = checkSystem(d, lk).filter((i) => i.rule === "cable-error" && i.relatedItemIds.includes("c_main"));
    expect(after).toEqual([]);
  });
  it("setCableSize writes the AWG and its area", () => {
    const it: Item = { id: "c", section: "electrical", kind: "cable", name: "c", data: {} };
    setCableSize(it, "0", "copper");
    expect(it.data).toMatchObject({ size: "1/0", material: "copper" }); expect(it.data.areaMm2).toBeCloseTo(53.48, 1);
  });
});

describe("alert gate", () => {
  const I = (...ids: string[]) => ids.map((id) => ({ id, rule: id.split(":")[0], severity: "warning" as const, message: id, suggestion: { addKind: "", label: id }, relatedItemIds: [] }));
  it("empty list never shows", () => {
    for (const t of ["open", "explicit", "auto", "leave"] as const) expect(alertDecision({ last: ["a"] }, [], t).show).toBe(false);
  });
  it("open = baseline only; autosave with the same list = quiet (a lone box does not nag)", () => {
    let s = alertDecision({}, I("no-amplifier:project"), "open"); expect(s.show).toBe(false);
    for (let k = 0; k < 5; k++) { s = alertDecision(s.state, I("no-amplifier:project"), "auto"); expect(s.show).toBe(false); }
    expect(alertDecision(s.state, I("no-amplifier:project"), "explicit").show).toBe(true);
  });
  it("first autosave without a baseline is quiet; a new issue on autosave shows; a dropped one does not", () => {
    let s = alertDecision({}, I("a"), "auto"); expect(s.show).toBe(false);
    s = alertDecision(s.state, I("a", "b"), "auto"); expect(s.show).toBe(true);
    s = alertDecision(s.state, I("b"), "auto"); expect(s.show).toBe(false);
  });
  it("Not now: leaving and autosaves stay quiet for that list; Save still shows; a changed list shows again", () => {
    let st = alertDecision({}, I("a"), "open").state;
    st = dismissAlert(st, I("a"));
    expect(alertDecision(st, I("a"), "leave").show).toBe(false);
    expect(alertDecision(st, I("a"), "explicit").show).toBe(true);
    expect(alertDecision({}, I("a"), "leave").show).toBe(false); // warnings only: leaving is never stopped
    const C = (...ids: string[]) => I(...ids).map((x) => ({ ...x, severity: "critical" as const }));
    expect(alertDecision({}, C("a"), "leave").show).toBe(true);
    expect(alertDecision(dismissAlert({}, C("a")), C("a"), "leave").show).toBe(false);
  });
});

describe("quick calculator", () => {
  it("research_i E1: 200 A maker maximum, 5 m + 0.5 m copper -> 200 A fuse, 1/0 AWG copper, 3/0 CCA", () => {
    const q = quickCalc({ iMaxA: 200, lengthM: 5, groundLengthM: 0.5, material: "copper" });
    expect(q.load!.maxA).toBe(200);
    expect(q.run!.fuseA ?? q.run!.fuseRecommendedA).toBe(200);
    expect(q.run!.recommended.awg.copper!.size).toBe("1/0");
    expect(q.run!.recommended.awg.cca!.size).toBe("3/0");
    expect(q.run!.used!.dropV).toBeCloseTo(0.396, 2);
  });
  it("from power and class: 1000 W class D at 13.8 V = 145 A (research_i E2)", () => {
    const q = quickCalc({ rmsW: 1000, cls: "D", lengthM: 1 });
    expect(q.load!.maxA).toBeCloseTo(1000 / (0.5 * 13.8), 1);
  });
  it("same numbers as calcProject for the same one-amp project", () => {
    const d: ProjectDoc = { format: 2, name: "q", title: "q", section: "subwoofer", items: [
      { id: "b", section: "electrical", kind: "battery", name: "B", data: {}, links: [{ from: "b", to: "f", kind: "power" }] },
      { id: "f", section: "electrical", kind: "fuseholder", name: "F", data: { distanceMm: 150 }, links: [{ from: "f", to: "a", kind: "power", cableItemId: "c" }] },
      { id: "c", section: "electrical", kind: "cable", name: "C", data: { lengthM: 5, groundLengthM: 0.5 }, links: [] },
      { id: "a", section: "electrical", kind: "amplifier", name: "A", data: { iMaxA: 200 }, links: [] }] };
    const p = calcProject(d, {}).runs[0], q = quickCalc({ iMaxA: 200, lengthM: 5, groundLengthM: 0.5 }).run!;
    expect(q.recommended).toEqual(p.recommended); expect(q.maxA).toBe(p.maxA); expect(q.fuseRecommendedA).toBe(p.fuseRecommendedA);
  });
});

describe("project fields", () => {
  it("alternator item rating goes to the battery when the battery has none", () => {
    const d = clone(fullSystem()); delete d.items.find((i) => i.id === "bat")!.data.alternatorA;
    d.items.push({ ...plainItem("alternator", []), data: { ratingA: 120 } });
    expect(syncAlternator(d)).toBe(true);
    expect(d.items.find((i) => i.id === "bat")!.data.alternatorA).toBe(120);
    expect(syncAlternator(d)).toBe(false);
    const e = clone(fullSystem()); e.items.push({ ...plainItem("alternator", []), data: { ratingA: 120 } });
    expect(syncAlternator(e)).toBe(false); // the battery's own 150 A stays
  });
  it("calculator options on an old (v1) project make it write v2 (not lost)", () => {
    const r = readProject({ name: "old", title: "Old", driverId: "d", kind: "sealed" });
    expect(legacyCompatible(r.doc)).toBe(true);
    r.doc.cableOptions = { dropPct: 2 };
    expect(legacyCompatible(r.doc)).toBe(false);
    expect(toDisk(r.doc, true).format).toBe(2);
  });
});

describe("driver prices (PM addition)", () => {
  it("retailer or supplier, lowest first, no-price entries left out", () => {
    const d = { priceAud: [
      { retailer: "Shop A", price_aud: 120, compare_at_aud: 150, on_sale: true, url: "https://f/x", read_date: "2026-11-23", sku: "K1" },
      { supplier: "Shop B", price_aud: 100, url: "https://s/x", read_date: "2026-11-23" },
      { retailer: "Nobody", url: "https://n" } as any,
    ] };
    const p = driverPrices(d);
    expect(p.map((x) => x.seller)).toEqual(["Shop B", "Shop A"]);
    expect(p[1]).toMatchObject({ priceAud: 120, compareAtAud: 150, onSale: true, date: "2026-11-23", sku: "K1" });
    expect(driverPriceFrom(d)).toBe(100);
    expect(driverPrices({})).toEqual([]); expect(driverPriceFrom(undefined)).toBeUndefined();
  });
});

describe("cable issues never add a loose cable", () => {
  it("a run no size can fix: nothing added, the cable item is named to change", () => {
    const d = clone(fullSystem());
    d.items.find((i) => i.id === "c_main")!.data.lengthM = 40; // far too long for 3 % at this current
    const cv = cableFor(d, lk);
    const is = checkSystem(d, lk, cv.result).find((i) => i.rule === "cable-error" && /no-size-fits/.test(i.id));
    expect(is).toBeTruthy();
    const n = d.items.length;
    const r = applyIssue(d, is!, mk, cv);
    expect(r.added).toEqual([]); expect(d.items.length).toBe(n); expect(r.changed).toBe(false);
  });
});

// B7_PLYWOOD_BOARDS: missing-part check when the main run to the distribution block uses the whole drop budget.
describe("upstream run uses the drop budget: check and fix point at the upstream cable (B7)", () => {
  it("branches get one critical upstream-budget issue each, naming the main run; applying it changes nothing and focuses c_main", () => {
    const d = clone(fullSystem());
    d.items.find((i) => i.id === "c_main")!.data.lengthM = 9; // 1/0 over 9 m: about 0.63 V before the block
    const cv = cableFor(d, lk);
    const is = checkSystem(d, lk, cv.result);
    const up = is.filter((i) => /upstream-budget/.test(i.id));
    expect(up.length).toBe(3);
    for (const i of up) {
      expect(i.severity).toBe("critical"); expect(i.message).toMatch(/upstream run to Fused distribution already uses 0\.\d{3} V of the 0\.414 V/);
      expect(i.message).not.toMatch(/No standard size/); expect(i.suggestion.label).toBe("Use a thicker or shorter upstream power cable (to Fused distribution)?");
      expect(i.relatedItemIds[0]).toBe("c_main");
    }
    expect(is.some((i) => /feed1\.1\.\d:chosen-drop/.test(i.id))).toBe(false); // folded into the upstream-budget issue
    const n = d.items.length; const r = applyIssue(d, up[0], mk, cv);
    expect(r.changed).toBe(false); expect(r.added).toEqual([]); expect(d.items.length).toBe(n); expect(r.focus).toBe("c_main");
    expect(r.message).toContain("Change the upstream run's cable first");
  });
});
