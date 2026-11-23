// Hook points (B1_SHELL, R44, 2026-11-23). onProjectSave runs once after every successful save of a project file (autosave
// included; not for single items in My items). Today nothing is registered: the later wiring-diagram / missing-part check job
// registers its handler here with addProjectSaveHook. A handler must not change the project it gets and must not throw (errors
// are caught and logged so a save never fails because of a hook).
import type { ProjectDoc } from "./projectv2";

export type ProjectSaveHook = (doc: ProjectDoc, info: { legacy: boolean }) => void;
const hooks: ProjectSaveHook[] = [];
export function addProjectSaveHook(h: ProjectSaveHook): () => void { hooks.push(h); return () => { const i = hooks.indexOf(h); if (i >= 0) hooks.splice(i, 1); }; }
export function onProjectSave(doc: ProjectDoc, info: { legacy: boolean }): void {
  for (const h of hooks) { try { h(doc, info); } catch (e) { console.warn("project save hook failed:", e); } }
}
