// System report on save (B6A_DIAGRAM_ENGINE, R44, 2026-11-23): the wiring diagram SVG (diagram.ts) and the missing / critical
// part check (syscheck.ts) of a project, computed once per save through the project save hook (ui/hooks.ts).
// Save flow (ui/main.ts save(), ui/hooks.ts): the project file is written first, then onProjectSave(doc) runs the handlers;
// a handler must not change the project (and a change would not be on disk anyway, the write is done). So the report is NOT
// written into the project: it is kept in memory (lastSystemReport) and handed to the listener the UI passes, which shows the
// alert ("Add ...?" buttons, nothing when issues is empty) and may save the SVG (e.g. data/projects/<name>/exports/system.svg).
// The UI job only calls registerSystemReport(...) once at start-up. API: docs/diagram_engine.md.
import type { ProjectDoc } from "../ui/projectv2";
import { addProjectSaveHook } from "../ui/hooks";
import type { CableLookups, CableSystemResult } from "./cable";
import { systemDiagramSvg } from "./diagram";
import type { DiagramOptions } from "./diagram";
import { checkSystem } from "./syscheck";
import type { SystemIssue } from "./syscheck";
import { cableFor } from "./sysmodel";

export interface SystemReport {
  project: string;
  /** Self-contained SVG of the whole system. */
  svg: string;
  /** Missing / critical issues; [] = complete (show nothing). */
  issues: SystemIssue[];
  /** Cable engine result used for both (undefined if it could not run). */
  cable?: CableSystemResult;
  /** ISO time the report was made (from the `now` passed in, else the clock). */
  checkedAt: string;
}

/** Diagram + check of a project in one call (one cable engine run shared by both). Deterministic when `now` is given. */
export function systemReport(doc: ProjectDoc, lookups: CableLookups = {}, opts: DiagramOptions & { now?: Date | string } = {}): SystemReport {
  const checkedAt = opts.now ? new Date(opts.now).toISOString() : new Date().toISOString();
  const cable = cableFor(doc, lookups).result;
  const svg = systemDiagramSvg(doc, lookups, cable, { ...opts, date: opts.date ?? (doc.saved ? String(doc.saved).slice(0, 10) : checkedAt.slice(0, 10)) });
  const issues = checkSystem(doc, lookups, cable);
  return { project: doc.name, svg, issues, cable, checkedAt };
}

const last = new Map<string, SystemReport>();
/** The report made at the last save of this project (this browser session), if any. */
export const lastSystemReport = (project: string): SystemReport | undefined => last.get(project);

export type SystemReportListener = (report: SystemReport, doc: ProjectDoc, info: { legacy: boolean }) => void;
/** Register the R44 save hook. `lookups`: the parts / driver lookups (an object, or a function returning the current one, as
 * parts may load later). `listener`: called after every project save with the report. Returns the unregister function.
 * A legacy single-box project (v1 file) is reported too; with no electrical parts it gives only the "no amplifier" warning. */
export function registerSystemReport(lookups: CableLookups | (() => CableLookups) = {}, listener?: SystemReportListener): () => void {
  return addProjectSaveHook((doc, info) => {
    const lk = typeof lookups === "function" ? lookups() : lookups;
    const rep = systemReport(doc, lk);
    last.set(doc.name, rep);
    listener?.(rep, doc, info);
  });
}
