// B6A_DIAGRAM_ENGINE (R44): wiring diagram SVG (diagram.ts), missing / critical part check (syscheck.ts) and the save hook
// (sysreport.ts). A full system must draw every item and link, parse as XML, be deterministic and give no issue; removing
// each critical part must give the right issue with the right "Add ...?" suggestion; an old single-box project must not crash.
// B6A_WRITE=1 also writes the example SVG to docs/progress/B6A_dryrun/.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { systemDiagramSvg } from "../src/engine/diagram";
import { checkSystem } from "../src/engine/syscheck";
import { lastSystemReport, registerSystemReport, systemReport } from "../src/engine/sysreport";
import { calcProject } from "../src/engine/cable";
import type { CableLookups } from "../src/engine/cable";
import { onProjectSave } from "../src/ui/hooks";
import { readProject } from "../src/ui/projectv2";
import type { ProjectDoc } from "../src/ui/projectv2";

const ROOT = path.resolve(__dirname, "..", "..");
const item = (id: string, kind: string, name: string, data: any = {}, links: any[] = [], section = "electrical") => ({ id, section, kind, name, data, links: links.map((l) => ({ from: id, ...l })) });
const lk: CableLookups = { driver: (id) => (id === "door4" ? { ohmsPerCoil: 4, coils: 1 } : undefined) };

/** Battery, 250 A ANL at the battery, 0 AWG main run, fused distribution block, capacitor, 2 amps, DSP, head unit, sub box,
 * door speakers, chassis ground. */
export function fullSystem(): ProjectDoc {
  return { format: 2, name: "b6a_full", title: "B6A full system", section: "subwoofer", saved: "2026-11-23T08:00:00.000Z", items: [
    item("bat", "battery", "Battery", { alternatorA: 150, vehicleLoadA: 40 }, [{ to: "anl", kind: "power" }]),
    item("anl", "fuseholder", "Main fuse ANL", { ratingA: 250, distanceMm: 150, type: "ANL" }, [{ to: "db", kind: "power", cableItemId: "c_main" }]),
    item("c_main", "cable", "0 AWG power", { lengthM: 3.5, size: "1/0", material: "copper" }),
    item("db", "distribution", "Fused distribution", { fused: true }, [{ to: "cap", kind: "power", cableItemId: "c_b1" }, { to: "amp2", kind: "power", cableItemId: "c_b2" }, { to: "dsp", kind: "power", cableItemId: "c_b3" }]),
    item("c_b1", "cable", "4 AWG to cap", { lengthM: 0.5, size: "4" }),
    item("c_b2", "cable", "8 AWG to amp 2", { lengthM: 0.6, size: "8" }),
    item("c_b3", "cable", "10 AWG to DSP", { lengthM: 0.6, size: "10" }),
    item("cap", "capacitor", "1 F capacitor", { farads: 1, prechargeOhm: 1000 }, [{ to: "amp1", kind: "power" }]),
    item("amp1", "amplifier", "Mono amp", { rmsW: 1000, class: "D", minLoadOhm: 1, channels: 1 }, [
      { to: "gnd", kind: "ground", cableItemId: "c_g1" }, { to: "box-1", kind: "speaker", cableItemId: "c_s1", fromPort: "SPK" }]),
    item("amp2", "amplifier", "4ch amp", { rmsW: 300, class: "AB", minLoadOhm: 2, channels: 4 }, [
      { to: "gnd", kind: "ground", cableItemId: "c_g2" }, { to: "doors", kind: "speaker", cableItemId: "c_s2", fromPort: "CH1" }]),
    item("c_g1", "cable", "4 AWG ground 1", { lengthM: 0.4, size: "4" }),
    item("c_g2", "cable", "8 AWG ground 2", { lengthM: 0.4, size: "8" }),
    item("c_s1", "cable", "12 AWG sub wire", { lengthM: 3, size: "12" }),
    item("c_s2", "cable", "14 AWG door wire", { lengthM: 2, size: "14" }),
    item("gnd", "other", "Chassis ground", { role: "ground" }),
    item("hu", "other", "Head unit", { role: "headunit" }, [{ to: "dsp", kind: "signal", fromPort: "RCA out" }, { to: "amp1", kind: "remote" }, { to: "amp2", kind: "remote" }, { to: "dsp", kind: "remote" }]),
    item("dsp", "dsp", "DSP 8ch", { iMaxA: 2 }, [{ to: "amp1", kind: "signal", fromPort: "out 7/8" }, { to: "amp2", kind: "signal", fromPort: "out 1-4" }, { to: "gnd", kind: "ground" }]),
    item("box-1", "box", "Sub box", { drivers: 1, power: { watts: 1000, impedance: 2 } }, [], "subwoofer"),
    item("doors", "door", "Front doors", { driverId: "door4", count: 2, loadOhm: 4 }, [], "door"),
  ] as any };
}
const without = (doc: ProjectDoc, id: string): ProjectDoc => ({ ...doc, items: doc.items.filter((i) => i.id !== id).map((i) => ({ ...i, links: (i.links ?? []).filter((l) => l.to !== id && l.cableItemId !== id) })) });
const unlink = (doc: ProjectDoc, from: string, kind: string, to?: string): ProjectDoc => ({ ...doc, items: doc.items.map((i) => (i.id === from ? { ...i, links: (i.links ?? []).filter((l) => !(l.kind === kind && (!to || l.to === to))) } : i)) });
/** Remove a cable item and leave its links in place (without their cable). */
const dropCable = (doc: ProjectDoc, id: string): ProjectDoc => ({ ...doc, items: doc.items.filter((i) => i.id !== id).map((i) => ({ ...i, links: (i.links ?? []).map((l) => (l.cableItemId === id ? { ...l, cableItemId: undefined } : l)) })) });
const setData = (doc: ProjectDoc, id: string, patch: any): ProjectDoc => ({ ...doc, items: doc.items.map((i) => (i.id === id ? { ...i, data: { ...i.data, ...patch } } : i)) });

/** Minimal XML well-formedness check: one root, tags nest and close, attributes quoted, only the 5 XML entities or numeric ones. */
function xmlOk(src: string): { ok: boolean; why?: string; elements: number } {
  let s = src.replace(/^<\?xml[^?]*\?>\s*/, ""), depth = 0, roots = 0, elements = 0;
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|([^<]+)/gy;
  while (re.lastIndex < s.length) {
    const m = re.exec(s);
    if (!m) return { ok: false, why: `bad markup at ${re.lastIndex}: ${s.slice(re.lastIndex, re.lastIndex + 60)}`, elements };
    if (m[5] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) return { ok: false, why: `bad entity in text ${m[5].slice(0, 40)}`, elements };
      if (!depth && m[5].trim()) return { ok: false, why: "text outside the root", elements };
      continue;
    }
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[3] ?? "")) return { ok: false, why: `bad entity in attributes of ${m[2]}`, elements };
    const names = [...(m[3] ?? "").matchAll(/([A-Za-z_][\w.:-]*)\s*=/g)].map((x) => x[1]);
    if (new Set(names).size !== names.length) return { ok: false, why: `duplicate attribute on ${m[2]}`, elements };
    if (m[1]) { if (stack.pop() !== m[2]) return { ok: false, why: `mismatched </${m[2]}>`, elements }; depth--; continue; }
    elements++;
    if (!depth) roots++;
    if (!m[4]) { stack.push(m[2]); depth++; }
  }
  return stack.length || roots !== 1 ? { ok: false, why: `unclosed ${stack.join(",")} / roots ${roots}`, elements } : { ok: true, elements };
}
const rules = (doc: ProjectDoc) => checkSystem(doc, lk).map((i) => i.rule);
const issue = (doc: ProjectDoc, rule: string) => checkSystem(doc, lk).find((i) => i.rule === rule);

describe("systemDiagramSvg", () => {
  const doc = fullSystem(), svg = systemDiagramSvg(doc, lk);
  it("is well-formed XML with an svg root, no external resources", () => {
    const r = xmlOk(svg); expect(r.why).toBeUndefined(); expect(r.ok).toBe(true); expect(r.elements).toBeGreaterThan(50);
    expect(svg).toMatch(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).not.toMatch(/<image|<link|@import|@font-face|href=|url\(/);
  });
  it("draws every item and every link", () => {
    const cablesInUse = new Set(doc.items.flatMap((i) => i.links ?? []).map((l) => l.cableItemId).filter(Boolean));
    for (const it of doc.items) {
      if (cablesInUse.has(it.id)) expect(svg, it.id).toContain(`data-cable="${it.id}"`);
      else { expect(svg, it.id).toContain(`data-item="${it.id}"`); expect(svg).toContain(it.name); }
    }
    const links = doc.items.flatMap((i) => (i.links ?? []).map((l) => `${i.id}/${l.to}/${l.kind}`));
    expect(links.length).toBe(17);
    for (const l of links) expect(svg, l).toContain(`data-link="${l}"`);
    for (const k of ["power", "ground", "signal", "speaker", "remote"]) expect(svg).toContain(`class="link link-${k}"`);
  });
  it("labels gauge, length, fuse, load, and has the header, legend, no Not connected area", () => {
    expect(svg).toContain("1/0 AWG"); expect(svg).toContain("3.5 m"); expect(svg).toContain("250 A"); expect(svg).toContain("2 ohm");
    expect(svg).toContain("B6A full system"); expect(svg).toContain("2026-11-23"); expect(svg).toContain("Legend");
    expect(svg).toContain("Ground (to chassis)"); expect(svg).not.toContain("Not connected");
    expect(svg).toMatch(/Design current 195\.2 A/);
  });
  it("is deterministic", () => {
    expect(systemDiagramSvg(fullSystem(), lk)).toBe(svg);
    expect(systemReport(fullSystem(), lk, { now: "2026-11-23T08:00:00Z" })).toEqual(systemReport(fullSystem(), lk, { now: "2026-11-23T08:00:00Z" }));
  });
  it("draws items without links in the Not connected area; escapes names", () => {
    const d = fullSystem(); d.items.push(item("spare", "fuse", "Spare <fuse> & \"co\"", { ratingA: 60 }) as any);
    const s = systemDiagramSvg(d, lk);
    expect(s).toContain("Not connected"); expect(s).toContain('data-item="spare"'); expect(s).toContain("Spare &lt;fuse&gt; &amp; &quot;co&quot;");
    expect(xmlOk(s).ok).toBe(true);
  });
  it("uses the cable engine's recommended size when no cable item is set", () => {
    const s = systemDiagramSvg(dropCable(fullSystem(), "c_main"), lk);
    expect(s).toMatch(/rec\. [0-9/]+ AWG/);
  });
  if (process.env.B6A_WRITE) it("writes the example (B6A_WRITE=1)", () => {
    const dir = path.join(ROOT, "docs/progress/B6A_dryrun"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "full_system.svg"), svg);
    fs.writeFileSync(path.join(dir, "full_system.json"), JSON.stringify(fullSystem(), null, 1));
    const missing = without(without(unlink(fullSystem(), "amp1", "ground"), "anl"), "hu");
    missing.items.find((i) => i.id === "bat")!.links!.push({ from: "bat", to: "db", kind: "power", cableItemId: "c_main" });
    fs.writeFileSync(path.join(dir, "missing_parts.svg"), systemDiagramSvg(missing, lk));
    fs.writeFileSync(path.join(dir, "missing_parts_issues.json"), JSON.stringify(checkSystem(missing, lk), null, 1));
  });
});

describe("checkSystem", () => {
  it("returns [] for the complete system (nothing shown)", () => { expect(checkSystem(fullSystem(), lk)).toEqual([]); });
  it("no battery", () => {
    const i = issue(without(fullSystem(), "bat"), "no-battery")!;
    expect(i).toMatchObject({ severity: "critical", suggestion: { addKind: "battery", label: "Add the battery?" } });
  });
  it("no main fuse at the battery", () => {
    const d = without(fullSystem(), "anl");
    d.items.find((i) => i.id === "bat")!.links!.push({ from: "bat", to: "db", kind: "power", cableItemId: "c_main" });
    const i = issue(d, "no-main-fuse")!;
    expect(i).toMatchObject({ severity: "critical", suggestion: { addKind: "fuseholder", label: "Add a main fuse at the battery?" } });
    expect(i.relatedItemIds).toEqual(["bat", "db"]);
    expect(rules(d).filter((r) => r === "cable-error")).toEqual([]); // the cable engine's own no-main-fuse is not doubled
  });
  it("main fuse further than 175 mm", () => {
    expect(issue(setData(fullSystem(), "anl", { distanceMm: 300 }), "fuse-too-far")).toMatchObject({ severity: "warning", suggestion: { label: "Move Main fuse ANL within 175 mm of the battery?" } });
    expect(issue(setData(fullSystem(), "anl", { distanceMm: 600 }), "fuse-too-far")!.severity).toBe("critical");
    expect(issue(setData(fullSystem(), "anl", { distanceMm: 600, sheathed: true }), "fuse-too-far")).toBeUndefined();
  });
  it("amplifier with no power wire / not back to the battery", () => {
    const d = unlink(fullSystem(), "db", "power", "amp2");
    expect(issue(d, "amp-no-power")).toMatchObject({ id: "amp-no-power:amp2", severity: "critical", suggestion: { addKind: "cable", label: "Add a power cable from the battery to 4ch amp?" } });
    const d2 = unlink(fullSystem(), "anl", "power");
    expect(checkSystem(d2, lk).filter((i) => i.rule === "amp-not-reached").map((i) => i.id)).toEqual(["amp-not-reached:amp1", "amp-not-reached:amp2"]);
  });
  it("amplifier with no ground", () => {
    expect(issue(unlink(fullSystem(), "amp1", "ground"), "amp-no-ground")).toMatchObject({ severity: "critical", relatedItemIds: ["amp1"], suggestion: { addKind: "other", role: "ground", label: "Add a ground point (chassis) for Mono amp?" } });
  });
  it("amplifier with no speakers, and the sub then has no amp", () => {
    const d = unlink(fullSystem(), "amp1", "speaker");
    expect(issue(d, "amp-no-speakers")).toMatchObject({ severity: "critical", suggestion: { addKind: "box", label: "Add a speaker or subwoofer for Mono amp?" } });
    expect(issue(d, "speaker-no-amp")).toMatchObject({ severity: "critical", relatedItemIds: ["box-1"], suggestion: { addKind: "amplifier", label: "Add an amplifier for Sub box?" } });
  });
  it("amplifier with no signal source", () => {
    expect(issue(unlink(fullSystem(), "dsp", "signal", "amp1"), "amp-no-signal")).toMatchObject({ severity: "critical", suggestion: { label: "Connect DSP 8ch (signal) to Mono amp?", linkFrom: ["dsp"] } });
    const noSrc = unlink(without(without(fullSystem(), "dsp"), "hu"), "amp1", "signal");
    expect(issue(noSrc, "amp-no-signal")).toMatchObject({ suggestion: { addKind: "other", role: "headunit", label: "Add a head unit (or DSP) to feed Mono amp?" } });
  });
  it("amplifier with no remote wire, unless auto turn-on is noted", () => {
    const d = unlink(fullSystem(), "hu", "remote", "amp1");
    expect(issue(d, "amp-no-remote")).toMatchObject({ severity: "warning", suggestion: { label: "Add a remote turn-on wire to Mono amp?", linkFrom: ["hu"] } });
    expect(issue(setData(d, "amp1", { autoOn: true }), "amp-no-remote")).toBeUndefined();
    const hl = unlink(fullSystem(), "hu", "remote", "amp1");
    hl.items.find((i) => i.id === "dsp")!.links!.find((l) => l.to === "amp1")!.toPort = "high level in";
    expect(issue(hl, "amp-no-remote")).toBeUndefined();
  });
  it("DSP with no source, no output", () => {
    const d = without(fullSystem(), "hu");
    expect(issue(d, "dsp-no-source")).toMatchObject({ severity: "critical", suggestion: { addKind: "other", role: "headunit", label: "Add a head unit (source) for DSP 8ch?" } });
    const d2 = unlink(fullSystem(), "dsp", "signal");
    expect(issue(d2, "dsp-no-output")).toMatchObject({ severity: "warning", suggestion: { addKind: "amplifier" } });
  });
  it("capacitor: no precharge note, not on an amp's power run", () => {
    expect(issue(setData(fullSystem(), "cap", { prechargeOhm: undefined }), "cap-no-precharge")).toMatchObject({ severity: "warning", suggestion: { role: "resistor", label: "Add a precharge resistor for 1 F capacitor?" } });
    const d = unlink(unlink(fullSystem(), "cap", "power"), "db", "power", "cap");
    expect(rules(d)).toEqual(expect.arrayContaining(["cap-not-on-run", "amp-no-power"]));
  });
  it("unfused distribution branch thinner than the upstream fuse protects", () => {
    const i = checkSystem(setData(fullSystem(), "db", { fused: false }), lk).filter((x) => x.rule === "branch-unfused-thin");
    expect(i.length).toBe(3);
    expect(i[0]).toMatchObject({ severity: "critical", suggestion: { addKind: "fuseholder", linkFrom: ["db"] } });
    expect(i[0].relatedItemIds).toEqual(expect.arrayContaining(["c_b1", "db", "amp1"]));
  });
  it("cable engine errors: fuse bigger than the wire, drop over the limit", () => {
    const thin = checkSystem(setData(fullSystem(), "c_main", { size: "4" }), lk).filter((x) => x.rule === "cable-error");
    expect(thin.map((x) => x.id)).toContain("cable-error:feed1.1:fuse-over-abyc-ceiling");
    expect(thin[0]).toMatchObject({ severity: "critical", suggestion: { addKind: "cable" } });
    const long = checkSystem(setData(fullSystem(), "c_main", { lengthM: 8 }), lk);
    expect(long.find((x) => x.id === "cable-warning:feed1.1:chosen-drop")).toMatchObject({ severity: "warning" });
  });
  it("load below the amplifier's minimum stable impedance (coils finalLoad)", () => {
    const d = setData(setData(fullSystem(), "amp1", { minLoadOhm: 2 }), "box-1", { drivers: 2, power: { watts: 1000, impedance: 2 } });
    expect(issue(d, "load-below-min")).toMatchObject({ severity: "critical", message: expect.stringContaining("1 ohm, below its minimum stable load of 2 ohm") });
    // two 4 ohm door pairs on separate channels of the 4ch amp: no issue; both on CH1: 2 ohm = its minimum, still fine
    expect(issue(fullSystem(), "load-below-min")).toBeUndefined();
  });
  it("alternator too small for the music average: big 3 suggestion", () => {
    expect(issue(setData(fullSystem(), "bat", { alternatorA: 100, vehicleLoadA: 60 }), "alternator")).toMatchObject({ severity: "warning", suggestion: { label: "Add the big 3 upgrade (and consider a higher-output alternator)?" } });
  });
  it("cables missing: power run, ground, speaker", () => {
    expect(issue(dropCable(fullSystem(), "c_main"), "run-no-cable")).toMatchObject({ severity: "warning", suggestion: { addKind: "cable" } });
    expect(issue(dropCable(fullSystem(), "c_g1"), "ground-no-cable")).toMatchObject({ id: "ground-no-cable:amp1" });
    expect(issue(dropCable(fullSystem(), "c_s2"), "speaker-no-cable")).toMatchObject({ id: "speaker-no-cable:amp2", suggestion: { label: "Add the speaker cable for 4ch amp?" } });
  });
  it("critical issues come first", () => {
    const sev = checkSystem(unlink(dropCable(fullSystem(), "c_s2"), "amp1", "ground"), lk).map((i) => i.severity);
    expect(sev[0]).toBe("critical"); expect(sev.indexOf("critical", sev.indexOf("warning"))).toBe(-1);
  });
  it("old single-box projects: no crash, only the 'no amplifier' suggestion", () => {
    for (const f of ["existing_sub.json", "new_sub_box.json"]) {
      const p = path.join(ROOT, "data/projects", f); if (!fs.existsSync(p)) continue;
      const { doc } = readProject({ ...JSON.parse(fs.readFileSync(p, "utf8")), name: f.replace(/\.json$/, "") });
      const iss = checkSystem(doc, lk);
      expect(iss.map((i) => i.rule)).toEqual(["no-amplifier"]);
      expect(iss[0]).toMatchObject({ severity: "warning", suggestion: { addKind: "amplifier", label: "Add an amplifier?" } });
      const s = systemDiagramSvg(doc, lk);
      expect(xmlOk(s).ok).toBe(true); expect(s).toContain("Not connected"); expect(s).toContain('data-item="box-1"');
    }
    const empty: ProjectDoc = { format: 2, name: "e", title: "e", section: "subwoofer", items: [] };
    expect(checkSystem(empty, lk)).toEqual([]); expect(xmlOk(systemDiagramSvg(empty, lk)).ok).toBe(true);
  });
});

describe("save hook (sysreport)", () => {
  it("registerSystemReport runs on save, keeps the last report, unregisters", () => {
    const seen: any[] = [];
    const off = registerSystemReport(() => lk, (rep, doc, info) => seen.push({ rep, name: doc.name, info }));
    const doc = fullSystem();
    onProjectSave(doc, { legacy: false });
    expect(seen.length).toBe(1);
    expect(seen[0].rep.issues).toEqual([]); expect(seen[0].rep.svg).toContain("<svg"); expect(seen[0].rep.project).toBe("b6a_full");
    expect(lastSystemReport("b6a_full")).toBe(seen[0].rep);
    expect(doc).toEqual(fullSystem()); // the project is not changed
    off(); onProjectSave(doc, { legacy: false }); expect(seen.length).toBe(1);
  });
  it("a hook error never breaks the save", () => {
    const off = registerSystemReport({}, () => { throw new Error("listener failed"); });
    expect(() => onProjectSave(fullSystem(), { legacy: false })).not.toThrow();
    off();
  });
});
