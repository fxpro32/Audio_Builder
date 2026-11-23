// Missing / critical part check (B6A_DIAGRAM_ENGINE, R44, 2026-11-23). Requirement: "if there is something missing, put an alert
// that asks them if they want to add such and such to the system". checkSystem lists each problem with a plain-words message
// and an "Add ...?" suggestion; it returns [] when the system is complete, so the UI shows nothing then (exception-only notice).
// Reads project model v2 items + typed links (docs/project_model_v2.md) and reuses the cable engine (cable.ts) for the wire,
// fuse and alternator checks. Rules and sources: docs/diagram_engine.md. Pure functions, no DOM.
import type { Item, ProjectDoc } from "../ui/projectv2";
import { itemLoadOhm } from "./cable";
import type { CableLookups, CableSystemResult, Warning } from "./cable";
import { FUSE_DISTANCE } from "./cable";
import { finalLoad } from "./coils";
import { autoTurnOn, cableFor, graphOf, num, reachable, roleOf, upstream } from "./sysmodel";

export type Severity = "critical" | "warning";
export interface Suggestion {
  /** Item kind to add (project model v2 kind; "other" with `role` for battery / ground / head unit / resistor...). "" = nothing to
   * add, change an existing item instead. */
  addKind: string;
  role?: string;
  /** Button text, a question, e.g. "Add a main fuse at the battery?". */
  label: string;
  /** Link the new item to these items with this link kind (hint for the UI). */
  linkTo?: string[]; linkFrom?: string[]; linkKind?: "power" | "ground" | "signal" | "speaker" | "remote";
}
export interface SystemIssue {
  /** Stable id: `<rule>:<item id or run id>`. */
  id: string;
  rule: string;
  severity: Severity;
  message: string;
  suggestion: Suggestion;
  relatedItemIds: string[];
}
export interface CheckOptions {
  /** Skip the checks that need the cable engine (wire, fuse rating, alternator). */
  noCableEngine?: boolean;
}

const RULE_ORDER = [
  "no-battery", "amp-no-power", "amp-not-reached", "no-main-fuse", "fuse-too-far", "amp-no-ground", "amp-no-speakers", "amp-no-signal",
  "speaker-no-amp", "no-amplifier", "dsp-no-source", "dsp-no-output", "dsp-no-power", "load-below-min", "branch-unfused-thin",
  "cable-error", "cable-warning", "amp-no-remote", "run-no-cable", "ground-no-cable", "speaker-no-cable", "cap-not-on-run",
  "cap-no-precharge", "item-not-connected", "alternator",
];

/** The list of missing / critical issues of a project. [] = nothing to show. */
export function checkSystem(doc: ProjectDoc, lookups: CableLookups = {}, cableResult?: CableSystemResult, options: CheckOptions = {}): SystemIssue[] {
  const g = graphOf(doc), issues: SystemIssue[] = [];
  const add = (rule: string, key: string, severity: Severity, message: string, suggestion: Suggestion, related: string[]) => {
    const id = `${rule}:${key}`;
    if (!issues.some((i) => i.id === id)) issues.push({ id, rule, severity, message, suggestion, relatedItemIds: [...new Set(related)] });
  };
  const by = (r: string) => doc.items.filter((it) => roleOf(it) === r);
  const amps = by("amplifier"), dsps = by("dsp"), speakers = by("speaker"), batteries = by("battery"), caps = by("capacitor");
  const fuses = by("fuse"), dists = by("distribution"), heads = by("headunit");
  const electrical = amps.length + dsps.length + caps.length + fuses.length + dists.length > 0;
  const name = (id: string) => g.items.get(id)?.name ?? id;

  // ------------------------------------------------------------------ speakers and amplifiers
  const speakerFeeders = (s: Item) => g.inc(s.id, "speaker").filter((l) => { const r = g.role(l.from); return r === "amplifier" || r === "dsp" || r === "other" || r === "connector"; });
  if (speakers.length && !amps.length && !dsps.some((d) => g.out(d.id, "speaker").length)) {
    add("no-amplifier", "project", "warning", `No amplifier in the project: ${speakers.map((s) => s.name).join(", ")} ${speakers.length > 1 ? "have" : "has"} nothing to drive ${speakers.length > 1 ? "them" : "it"}.`,
      { addKind: "amplifier", label: "Add an amplifier?", linkTo: speakers.map((s) => s.id), linkKind: "speaker" }, speakers.map((s) => s.id));
  } else {
    for (const s of speakers) if (!speakerFeeders(s).length)
      add("speaker-no-amp", s.id, "critical", `${s.name} is not connected to an amplifier.`, { addKind: "amplifier", label: `Add an amplifier for ${s.name}?`, linkTo: [s.id], linkKind: "speaker" }, [s.id]);
  }

  if (electrical && !batteries.length) {
    add("no-battery", "project", "critical", "The project has no battery: the amplifiers and the power wiring start at the battery.", { addKind: "battery", label: "Add the battery?", linkTo: [], linkKind: "power" }, [...amps, ...dsps].map((a) => a.id));
  }

  const batteryIds = new Set(batteries.map((b) => b.id));
  for (const a of amps) {
    const inPower = g.inc(a.id, "power").concat(g.out(a.id, "power").filter((l) => g.role(l.to) === "capacitor"));
    if (!inPower.length) add("amp-no-power", a.id, "critical", `${a.name} has no power wire.`, { addKind: "cable", label: `Add a power cable from the battery to ${a.name}?`, linkTo: [a.id], linkKind: "power" }, [a.id]);
    else if (batteries.length && ![...upstream(g, a.id, "power")].some((id) => batteryIds.has(id)))
      add("amp-not-reached", a.id, "critical", `${a.name}'s power wire does not lead back to the battery.`, { addKind: "", label: `Link the power wire of ${a.name} back to the battery?`, linkTo: [a.id], linkKind: "power" }, [a.id]);
    const grounded = g.touching(a.id, "ground").length > 0;
    if (!grounded) add("amp-no-ground", a.id, "critical", `${a.name} has no ground wire to the car's chassis.`, { addKind: "other", role: "ground", label: `Add a ground point (chassis) for ${a.name}?`, linkFrom: [a.id], linkKind: "ground" }, [a.id]);
    if (!g.out(a.id, "speaker").length) add("amp-no-speakers", a.id, "critical", `${a.name} has no speakers connected.`, { addKind: "box", label: `Add a speaker or subwoofer for ${a.name}?`, linkFrom: [a.id], linkKind: "speaker" }, [a.id]);
    if (!g.inc(a.id, "signal").length && !a.data?.source) {
      // a DSP or head unit already in the project: connect it; else add a head unit
      const src = dsps[0] ?? heads[0];
      add("amp-no-signal", a.id, "critical", `${a.name} has no signal source (head unit or DSP).`, src ? { addKind: "", label: `Connect ${src.name} (signal) to ${a.name}?`, linkFrom: [src.id], linkTo: [a.id], linkKind: "signal" } : { addKind: "other", role: "headunit", label: `Add a head unit (or DSP) to feed ${a.name}?`, linkTo: [a.id], linkKind: "signal" }, [a.id]);
    }
    if (!g.touching(a.id, "remote").length && !autoTurnOn(g, a)) add("amp-no-remote", a.id, "warning", `${a.name} has no remote (turn-on) wire and no auto turn-on noted, so it may not switch on.`, { addKind: "cable", label: `Add a remote turn-on wire to ${a.name}?`, linkFrom: heads[0] ? [heads[0].id] : undefined, linkTo: [a.id], linkKind: "remote" }, [a.id]);
  }

  // ------------------------------------------------------------------ main fuse at the battery
  for (const b of batteries) for (const l of g.out(b.id, "power")) {
    // walk forward from the battery until a fuse, a junction or a load
    let id = l.to, fuse: Item | undefined; const seen = new Set<string>([b.id]);
    while (id && !seen.has(id)) {
      seen.add(id);
      const it = g.items.get(id), r = roleOf(it);
      if (r === "fuse") { fuse = it; break; }
      if (r !== "cable" && r !== "connector" && r !== "other") break;
      const nx = g.out(id, "power"); if (nx.length !== 1) break; id = nx[0].to;
    }
    if (!fuse) add("no-main-fuse", `${b.id}>${l.to}`, "critical", `No fuse at the battery on the power wire to ${name(l.to)}: a short anywhere along it can start a fire.`, { addKind: "fuseholder", label: "Add a main fuse at the battery?", linkFrom: [b.id], linkTo: [l.to], linkKind: "power" }, [b.id, l.to]);
    else {
      const mm = fuse.data?.distanceMm;
      if (num(mm) && mm > FUSE_DISTANCE.abycMm && !(fuse.data?.sheathed && mm <= FUSE_DISTANCE.sheathedMaxMm))
        add("fuse-too-far", fuse.id, mm > FUSE_DISTANCE.makerMaxMm ? "critical" : "warning", `${fuse.name} is ${mm} mm from the battery: fit it within ${FUSE_DISTANCE.abycMm} mm of the battery terminal (ABYC E-11.12.1.2)${mm > FUSE_DISTANCE.makerMaxMm ? `; beyond ${FUSE_DISTANCE.makerMaxMm} mm the cable before the fuse is unprotected` : ""}.`, { addKind: "", label: `Move ${fuse.name} within ${FUSE_DISTANCE.abycMm} mm of the battery?` }, [fuse.id, b.id]);
    }
  }

  // ------------------------------------------------------------------ DSP
  for (const d of dsps) {
    if (!g.inc(d.id, "signal").length && !d.data?.source) add("dsp-no-source", d.id, "critical", `${d.name} has no signal source (head unit).`, { addKind: "other", role: "headunit", label: `Add a head unit (source) for ${d.name}?`, linkTo: [d.id], linkKind: "signal" }, [d.id]);
    if (!g.out(d.id, "signal").length && !g.out(d.id, "speaker").length) add("dsp-no-output", d.id, "warning", `${d.name} does not feed any amplifier.`, { addKind: "amplifier", label: `Add an amplifier after ${d.name}?`, linkFrom: [d.id], linkKind: "signal" }, [d.id]);
    if (!g.inc(d.id, "power").length && !d.data?.poweredBy) add("dsp-no-power", d.id, "warning", `${d.name} has no power wire.`, { addKind: "cable", label: `Add a fused power wire for ${d.name}?`, linkTo: [d.id], linkKind: "power" }, [d.id]);
  }

  // ------------------------------------------------------------------ load below the amp's minimum impedance
  for (const a of amps) {
    const rec = a.data?.partId && lookups.part ? lookups.part(a.data.partId, "amplifiers") : undefined;
    const minZ = num(a.data?.minLoadOhm) ? a.data.minLoadOhm : num(rec?.min_load_ohm) ? rec.min_load_ohm : undefined;
    if (!minZ) continue;
    const channels = num(a.data?.channels) ? a.data.channels : num(rec?.channels) ? rec.channels : undefined;
    // group the speaker links by output port; a mono amp without ports = all in parallel on its one channel
    const groups = new Map<string, number[]>();
    g.out(a.id, "speaker").forEach((l, k) => {
      const t = g.items.get(l.to), z = t ? itemLoadOhm(t, lookups).ohm : undefined; if (!z) return;
      const key = l.fromPort ? l.fromPort.toUpperCase().replace(/\s*[+-]\s*$/, "") : channels === 1 ? "mono" : `link${k}`;
      groups.set(key, [...(groups.get(key) ?? []), z]);
    });
    for (const [key, zs] of groups) {
      // equal loads: coils.ts finalLoad (parallel); unequal: 1 / sum(1/z)
      const z = zs.every((x) => x === zs[0]) ? finalLoad(zs[0], zs.length, "parallel") : 1 / zs.reduce((s, x) => s + 1 / x, 0);
      if (z < minZ - 1e-9) add("load-below-min", `${a.id}:${key}`, "critical", `${a.name} sees ${(Math.round(z * 100) / 100)} ohm${groups.size > 1 ? ` on ${key}` : ""}, below its minimum stable load of ${minZ} ohm: it may overheat or shut down.`, { addKind: "", label: `Rewire the speaker coils (series) or choose another amplifier for ${a.name}?` }, [a.id, ...g.out(a.id, "speaker").map((l) => l.to)]);
    }
  }

  // ------------------------------------------------------------------ cable engine
  if (!options.noCableEngine && (amps.length || dsps.length)) {
    const cv = cableFor(doc, lookups, cableResult), cr = cv.result;
    if (cr) {
      const runItems = (runId: string) => {
        const ids: string[] = [];
        const inp = findRun(cv.input?.feeds ?? [], runId);
        if (inp) { ids.push(...(inp.cableItemIds ?? [])); if (inp.fuseItemId) ids.push(inp.fuseItemId); }
        const end = cv.runEnd.get(runId); if (end) ids.push(end);
        const j = cv.runJunctionOf.get(runId); if (j) ids.push(j);
        return ids;
      };
      const SKIP = new Set(["no-main-fuse", "fuse-distance-unknown", "fuse-distance-over-abyc", "fuse-distance-sheathed", "fuse-distance-too-far", "branch-unfused", "capacitor-wiring", "ground-length-unknown", "maker-wire-thinner", "maker-wire-thicker"]);
      const CRIT = new Set(["fuse-over-ampacity", "fuse-over-abyc-ceiling", "no-size-fits", "upstream-budget", "chosen-too-thin", "current-over-fuse-list"]);
      const WARN = new Set(["chosen-drop", "fuse-below-load"]);
      const upName = (pid?: string) => { const n = cr.runs.find((x) => x.id === pid)?.name; return n ? ` (${n})` : ""; };
      for (const r of cr.runs) {
        const where = r.name ? ` (power run ${r.name.replace(/^to /, "to ")})` : "";
        // unfused branch whose chosen wire cannot carry the upstream fuse
        if (!r.fused && r.depth > 0 && r.chosen?.ampacityA !== undefined && r.protectedByA !== undefined && r.chosen.ampacityA * (cr.options.fuseMaxPct / 100) < r.protectedByA - 1e-9) {
          const j = cv.runJunctionOf.get(r.id);
          add("branch-unfused-thin", r.id, "critical", `The branch wire${where} (${r.chosen.size ?? `${Math.round(r.chosen.areaMm2 * 10) / 10} mm2`}, ${Math.round(r.chosen.ampacityA)} A) is thinner than the ${r.protectedByA} A upstream fuse protects, and has no fuse of its own.`,
            { addKind: "fuseholder", label: `Add a fuse for this branch (or use a fused distribution block)?`, linkFrom: j ? [j] : undefined, linkKind: "power" }, runItems(r.id));
          continue;
        }
        for (const w of r.warnings) {
          if (SKIP.has(w.code)) continue;
          if (w.code === "chosen-drop" && r.warnings.some((x) => x.code === "upstream-budget")) continue; // B7: the upstream-budget issue says it
          if (w.code === "upstream-budget") { add("cable-error", `${r.id}:${w.code}`, "critical", `${w.text}${where}`, { addKind: "cable", label: `Use a thicker or shorter upstream power cable${upName(r.parentId)}?` }, [...new Set([...(r.parentId ? runItems(r.parentId) : []), ...runItems(r.id)])]); continue; } // B7: the upstream run is the cause
          if (CRIT.has(w.code)) add("cable-error", `${r.id}:${w.code}`, "critical", `${w.text}${where}`, cableSuggestion(w), runItems(r.id));
          else if (WARN.has(w.code) || w.level === "error") add(w.level === "error" ? "cable-error" : "cable-warning", `${r.id}:${w.code}`, w.level === "error" ? "critical" : "warning", `${w.text}${where}`, cableSuggestion(w), runItems(r.id));
        }
      }
      for (const s of cr.speakers) for (const w of s.warnings) if (w.code === "speaker-chosen-thin" || w.code === "speaker-current" || w.code === "speaker-no-size")
        add("cable-warning", `${s.id}:${w.code}`, "warning", `${s.name ?? s.id}: ${w.text}`, { addKind: "cable", label: "Use a thicker speaker cable?" }, [s.loadId ?? "", ...(s.id.split(">").slice(1))].filter(Boolean));
      // alternator
      for (const w of cr.alternator?.warnings ?? []) if (w.code === "alternator-music") {
        const big3 = !!(doc as any).cableBig3;
        add("alternator", "music", "warning", w.text, big3 ? { addKind: "battery", label: "Add a second battery (or a higher-output alternator)?" } : { addKind: "other", role: "big3", label: "Add the big 3 upgrade (and consider a higher-output alternator)?" }, batteries.map((b) => b.id));
      }
      // power runs with no cable item (the BOM and the wire check need one)
      for (const f of allRuns(cv.input?.feeds ?? [])) if (!(f.cableItemIds ?? []).length) {
        const end = cv.runEnd.get(f.id);
        add("run-no-cable", f.id, "warning", `The power run ${f.name ?? f.id} has no cable item, so its gauge and length are not set.`, { addKind: "cable", label: `Add the power cable ${f.name ?? ""}?`.replace(/\s+\?/, "?"), linkTo: end ? [end] : undefined, linkKind: "power" }, runItems(f.id));
      }
    }
  }

  // ------------------------------------------------------------------ cables for ground and speakers (BOM, drop check)
  for (const a of amps) {
    const gl = g.out(a.id, "ground");
    if (gl.length && !gl.some((l) => l.cableItemId)) add("ground-no-cable", a.id, "warning", `${a.name}'s ground link has no cable item (length and gauge unknown).`, { addKind: "cable", label: `Add the ground cable for ${a.name}?`, linkKind: "ground" }, [a.id, ...gl.map((l) => l.to)]);
    const sl = g.out(a.id, "speaker").filter((l) => !l.cableItemId);
    if (sl.length) add("speaker-no-cable", a.id, "warning", `${a.name}: no speaker cable item to ${sl.map((l) => name(l.to)).join(", ")}.`, { addKind: "cable", label: `Add the speaker cable${sl.length > 1 ? "s" : ""} for ${a.name}?`, linkKind: "speaker" }, [a.id, ...sl.map((l) => l.to)]);
  }

  // ------------------------------------------------------------------ capacitors
  for (const c of caps) {
    const down = reachable(g, c.id, "power"), up = upstream(g, c.id, "power");
    const onAmpRun = [...down].some((id) => g.role(id) === "amplifier") || g.touching(c.id, "power").some((l) => g.role(l.from === c.id ? l.to : l.from) === "amplifier");
    if (!onAmpRun) add("cap-not-on-run", c.id, "warning", `${c.name} is not on an amplifier's power wire.`, { addKind: "", label: `Link ${c.name} into the amplifier's power wire, close to the amplifier?`, linkFrom: [c.id], linkKind: "power" }, [c.id]);
    else if (batteries.length && ![...up].some((id) => batteryIds.has(id)) && !g.touching(c.id, "power").some((l) => g.role(l.from === c.id ? l.to : l.from) === "amplifier" && [...upstream(g, l.from === c.id ? l.to : l.from, "power")].some((x) => batteryIds.has(x))))
      add("cap-not-on-run", c.id, "warning", `${c.name} is not on a power wire that comes from the battery.`, { addKind: "", label: `Link ${c.name} after the main fuse?`, linkKind: "power" }, [c.id]);
    const pre = c.data?.prechargeOhm ?? c.data?.precharge ?? c.data?.prechargeNote;
    if (!pre) add("cap-no-precharge", c.id, "warning", `${c.name}: no precharge resistor noted. An empty capacitor connected straight to the battery draws a very large current; charge it through a resistor first (Stinger SPC505 manual, research B7).`, { addKind: "other", role: "resistor", label: `Add a precharge resistor for ${c.name}?` }, [c.id]);
  }

  // ------------------------------------------------------------------ parts with no link at all (when the system has links)
  if (g.links.length) for (const it of doc.items) {
    const r = roleOf(it);
    if (!["fuse", "distribution", "headunit", "connector", "battery"].includes(r) && !(r === "cable" && !g.cablesInUse.has(it.id))) continue;
    if (r === "battery" && !electrical) continue;
    if (g.touching(it.id).length || g.cablesInUse.has(it.id)) continue;
    add("item-not-connected", it.id, "warning", `${it.name} is in the project but not connected to anything.`, { addKind: "", label: `Link ${it.name} into the system?` }, [it.id]);
  }

  const rank = (i: SystemIssue) => (i.severity === "critical" ? 0 : 1) * 1000 + RULE_ORDER.indexOf(i.rule);
  return issues.map((x, k) => ({ x, k })).sort((p, q) => rank(p.x) - rank(q.x) || p.k - q.k).map((p) => p.x);
}

function cableSuggestion(w: Warning): Suggestion {
  if (w.code === "fuse-over-ampacity" || w.code === "fuse-over-abyc-ceiling") return { addKind: "cable", label: "Use a thicker power cable (or a smaller fuse)?" };
  if (w.code === "chosen-drop" || w.code === "chosen-too-thin" || w.code === "no-size-fits") return { addKind: "cable", label: "Use a thicker or shorter power cable?" };
  if (w.code === "fuse-below-load") return { addKind: "fuse", label: "Use a larger fuse (within the wire's rating)?" };
  if (w.code === "current-over-fuse-list") return { addKind: "distribution", label: "Split the system into several fused runs?" };
  return { addKind: "", label: "Check this power run?" };
}
type RunIn = NonNullable<ReturnType<typeof cableFor>["input"]>["feeds"][number];
function allRuns(feeds: RunIn[]): RunIn[] {
  const out: RunIn[] = [];
  const walk = (r: RunIn) => { out.push(r); if ("junction" in r.to) r.to.junction.branches.forEach(walk); };
  feeds.forEach(walk);
  return out;
}
const findRun = (feeds: RunIn[], id: string) => allRuns(feeds).find((r) => r.id === id);
