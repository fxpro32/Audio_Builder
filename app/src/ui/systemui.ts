// System tab (B4_SYSTEM_UI, R41 + R44, 2026-11-23): the project's whole electrical system in one screen. Items grouped (power,
// amplifiers, signal, speakers), Connect controls (typed links with ports and an optional cable item + length), "Wire it for me"
// (the standard chain proposed by syslogic.ts, applied only after the user confirms), plain items (battery, head unit, chassis
// ground, alternator), the wiring diagram (diagram.ts; zoom, Download SVG, Print, click an item to edit / open it), the cable
// calculator (cable.ts over the project: runs, fuses, sizes, drop, loss, products, speakers, capacitors, alternator, big 3;
// options saved as doc.cableOptions), the quick one-amplifier calculator (Build a single item) and the missing-part alert panel
// (one panel, "Add <part>?" + "Not now"; never shown when nothing is missing). Logic: syslogic.ts (tested).
import type { Item, LinkKind, ProjectDoc } from "./projectv2";
import { LINK_KINDS, linkItems, unlinkItems } from "./projectv2";
import { roleOf, ROLE_LABEL } from "../engine/sysmodel";
import type { SystemIssue } from "../engine/syscheck";
import { allowedDropV, matchCableProducts, needForRun, productArea, productMaterial, withDefaults } from "../engine/cable";
import type { CableLookups, CableOptions, CableSystemInput, CableSystemResult, Material, RunResult, Warning } from "../engine/cable";
import { cableFor } from "../engine/sysmodel";
import { systemDiagramSvg } from "../engine/diagram";
import { applyProposal, cableUse, defaultPorts, GROUPS, groupItems, kindsFrom, PLAIN_LABEL, plainItem, PlainKind, proposeWiring, quickCalc, QuickInput, recommendedAwg, removeKeepChain, runCableIds, setCableProduct, setCableSize, syncAlternator, WiringProposal, plainKindItem } from "./syslogic";
import { $, esc, download } from "./dom";

export interface SysCtx {
  doc: () => ProjectDoc;
  /** Items opened in memory only (not saved yet): left out of the System screen. */
  skip: () => Set<string>;
  lookups: () => CableLookups;
  /** Autosave soon (after a change). */
  save: () => void;
  /** Save now and show the missing-part alert (explicit save). */
  saveNow: () => Promise<boolean>;
  status: (msg: string, cls?: string) => void;
  /** Open an item in its own section (boxes, door, IB). */
  openItem: (id: string) => void;
  openParts: (cat?: string) => void;
  /** Summary text of an item (Project tab style) and the kind label. */
  summary: (it: Item) => string;
  kindLabel: (k: string) => string;
  /** The item edit form (partsui itemFormHtml + bind), rendered into the box. */
  editForm: (box: HTMLElement, it: Item, onChange: () => void) => void;
  /** Remove an item (trash copy kept by the caller); returns false when cancelled. */
  removeItem: (it: Item) => Promise<boolean>;
  /** Load the cable bundle (products) and call back when ready. */
  cableRecords: () => any[] | undefined;
  loadCableRecords: () => Promise<void>;
  saveToMyItems: (it: { section: string; kind: string; name: string; data: any }) => Promise<boolean>;
  rerender: () => void;
  /** B5_BOM: open the BOM tab. */
  openBom?: () => void;
}

const fx = (v: number | undefined, d = 1) => (v === undefined || !isFinite(v) ? "–" : (+v.toFixed(d)).toString());
const matName = (m?: string) => (m === "cca" ? "CCA" : m === "copper" ? "copper" : "–");
const lvlCls = (w: Warning) => (w.level === "error" ? "bad" : w.level === "warn" ? "warn" : "muted");
const warnList = (ws: Warning[]) => ws.length ? `<ul class="sysWarn">${ws.map((w) => `<li class="${lvlCls(w)}" data-code="${esc(w.code)}">${w.level === "error" ? "Error: " : w.level === "warn" ? "Warning: " : ""}${esc(w.text)}</li>`).join("")}</ul>` : "";
const ext = (u?: string, t?: string) => (u && /^https?:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t ?? u)}</a>` : esc(t ?? ""));

let zoom = 1;
let connectFor: string | undefined;
let editFor: string | undefined;
let proposal: WiringProposal | undefined;
/** Show this item's edit form at the next System tab render (an alert button that adds nothing). */
export function setSystemFocus(id: string) { editFor = id; connectFor = undefined; }

// ------------------------------------------------------------------------------------------------------------ System tab
export function renderSystem(root: HTMLElement, ctx: SysCtx) {
  const doc = ctx.doc(), skip = ctx.skip();
  if (syncAlternator(doc)) ctx.save();
  const lk = ctx.lookups();
  const cv = cableFor(doc, lk);
  const groups = groupItems(doc, skip);
  const count = doc.items.filter((i) => !skip.has(i.id)).length;
  root.innerHTML = `<div class="sysPage">
    <fieldset id="sysHead"><legend>System: ${esc(doc.title)} (${count} item${count === 1 ? "" : "s"})</legend>
      <div class="toolbar"><button class="primary" id="sysSave" title="Save the project now (Ctrl+S); the wiring diagram is drawn and the missing-part check runs">Save (Ctrl+S)</button>
        <button id="sysWireBtn" title="Propose the standard chain for what the project holds; you tick what to apply">Wire it for me…</button>
        <span class="hint">Add:</span>${(Object.keys(PLAIN_LABEL) as PlainKind[]).map((k) => `<button data-plain="${k}">${esc(PLAIN_LABEL[k])}</button>`).join("")}
        <button id="sysParts" title="Amplifiers, DSPs, capacitors, batteries, fuses, distribution blocks, cable (Parts tab)">From the parts database…</button>${ctx.openBom ? '<button id="sysBom" title="Bill of materials of the whole project: spreadsheet (.xlsx) and CSV">Bill of materials (BOM)…</button>' : ""}</div>
      <div class="hint">Everything electrical in this project and how it is wired. Add parts (Parts tab) or plain items, then press <b>Wire it for me</b> or use <b>Connect</b> on each item. The diagram and the missing-part check are made on every save (Help: System).</div>
      <div id="sysWire"></div></fieldset>
    <fieldset id="sysDiagram"><legend>Wiring diagram</legend>
      <div class="toolbar"><button id="dzOut" title="Zoom out">−</button><button id="dzIn" title="Zoom in">+</button><button id="dzFit">Fit</button><button id="dz1">100 %</button>
        <button id="dDown">Download SVG</button><button id="dPrint">Print</button><span class="hint" id="dInfo">Click an item in the drawing to edit or open it. Saved with the project as exports/system.svg on every save.</span></div>
      <div id="sysSvg" class="sysSvg"></div></fieldset>
    <fieldset id="sysItems"><legend>Items</legend>${GROUPS.map((g) => groups[g.id].length ? `<h3 class="sysGroup" data-group="${g.id}">${esc(g.label)} <span class="hint">${esc(g.explain)}</span></h3>
      <table class="sysTable" data-group="${g.id}"><tr><th>Item</th><th>What</th><th>Connections</th><th></th></tr>${groups[g.id].map((it) => itemRow(doc, it, ctx)).join("")}</table>` : "").join("")}
      ${count ? "" : '<p class="muted">No items yet.</p>'}</fieldset>
    <div id="sysEdit"></div>
    <fieldset id="sysCable"><legend>Cable calculator</legend><div id="sysCableBody"></div></fieldset>
    <details id="sysQuickWrap"><summary>Quick calculator: one amplifier, one power cable (no project needed)</summary><div id="sysQuick"></div></details>
  </div>`;
  // toolbar
  $("#sysSave").onclick = () => void ctx.saveNow();
  $("#sysParts").onclick = () => ctx.openParts();
  if (ctx.openBom && $("#sysBom")) $("#sysBom").onclick = () => ctx.openBom!();
  root.querySelectorAll<HTMLButtonElement>("button[data-plain]").forEach((b) => b.onclick = () => {
    const it = plainItem(b.dataset.plain as PlainKind, doc.items.map((i) => i.id)); doc.items.push(it); editFor = it.id; ctx.save(); ctx.status(`${it.name} added`, "ok"); renderSystem(root, ctx);
  });
  $("#sysWireBtn").onclick = () => { proposal = proposeWiring(doc, lk, skip); showProposal(root, ctx); };
  if (proposal) showProposal(root, ctx);
  // diagram
  drawDiagram(doc, lk, cv.result, ctx);
  $("#dzIn").onclick = () => setZoom(zoom * 1.25); $("#dzOut").onclick = () => setZoom(zoom / 1.25); $("#dz1").onclick = () => setZoom(1);
  $("#dzFit").onclick = () => { const svg = document.querySelector<SVGSVGElement>("#sysSvg svg"); const w = Number(svg?.getAttribute("width")) || 1; setZoom(Math.max(0.2, ($("#sysSvg").clientWidth - 8) / w)); };
  $("#dDown").onclick = () => download(`${doc.name}_system.svg`, currentSvg(doc, lk, cv.result), "image/svg+xml");
  $("#dPrint").onclick = () => printSvg(currentSvg(doc, lk, cv.result), doc.title);
  // items
  bindItems(root, ctx);
  if (editFor) showEdit(root, ctx, editFor);
  // cable calculator
  renderCable($("#sysCableBody"), ctx, cv.result, cv.input);
  if (!ctx.cableRecords()) void ctx.loadCableRecords().then(() => { const b = $("#sysCableBody"); if (b && ctx.cableRecords()) renderCable(b, ctx, cableFor(ctx.doc(), ctx.lookups()).result, cableFor(ctx.doc(), ctx.lookups()).input); });
  const q = $("#sysQuickWrap") as HTMLDetailsElement; q.ontoggle = () => { if (q.open && !$("#qcGo")) renderQuickCalc($("#sysQuick"), ctx); };
}
/** Redraw only the diagram (after a save while the System tab is shown). */
export function refreshSystemDiagram(ctx: SysCtx, svg?: string) {
  if (!$("#sysSvg")) return;
  const doc = ctx.doc(); const lk = ctx.lookups();
  drawDiagram(doc, lk, undefined, ctx, svg);
}

function currentSvg(doc: ProjectDoc, lk: CableLookups, res?: CableSystemResult): string {
  return systemDiagramSvg(doc, lk, res, { date: doc.saved ? String(doc.saved).slice(0, 10) : new Date().toISOString().slice(0, 10) });
}
function drawDiagram(doc: ProjectDoc, lk: CableLookups, res: CableSystemResult | undefined, ctx: SysCtx, svg?: string) {
  const box = $("#sysSvg"); if (!box) return;
  const s = svg ?? currentSvg(doc, lk, res);
  box.innerHTML = s.replace(/^<\?xml[^>]*\?>\s*/, "");
  setZoom(zoom);
  box.querySelectorAll<SVGGElement>("g[data-item]").forEach((g) => {
    g.style.cursor = "pointer";
    g.addEventListener("click", () => {
      const it = doc.items.find((i) => i.id === g.dataset.item); if (!it) return;
      if (roleOf(it) === "speaker") ctx.openItem(it.id);
      else { editFor = it.id; const root = $("#page"); if (root) showEdit(root, ctx, it.id); $("#sysEdit")?.scrollIntoView({ block: "nearest" }); }
    });
  });
}
function setZoom(z: number) {
  zoom = Math.min(4, Math.max(0.2, z));
  const svg = document.querySelector<SVGSVGElement>("#sysSvg svg"); if (!svg) return;
  const w = Number(svg.getAttribute("width")) || 800, h = Number(svg.getAttribute("height")) || 600;
  svg.style.width = `${w * zoom}px`; svg.style.height = `${h * zoom}px`;
  const info = $("#dzOut")?.parentElement?.querySelector("#dzPct") as HTMLElement | null;
  if (info) info.textContent = `${Math.round(zoom * 100)} %`; else $("#dz1")?.insertAdjacentHTML("afterend", `<span class="hint" id="dzPct">${Math.round(zoom * 100)} %</span>`);
}
function printSvg(svg: string, title: string) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${esc(title)}: wiring diagram</title><style>body{margin:0}svg{max-width:100%;height:auto}@page{size:landscape;margin:10mm}</style></head><body>${svg.replace(/^<\?xml[^>]*\?>\s*/, "")}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

// ------------------------------------------------------------------------------------------------------------ items
function itemRow(doc: ProjectDoc, it: Item, ctx: SysCtx): string {
  const name = (id: string) => doc.items.find((i) => i.id === id)?.name ?? id;
  const outs = (it.links ?? []).map((l) => `<span class="lnk lnk-${l.kind}">${l.fromPort ? esc(l.fromPort) + " " : ""}→ ${esc(name(l.to))}${l.toPort ? " " + esc(l.toPort) : ""} <i>(${l.kind}${l.cableItemId ? ", via " + esc(name(l.cableItemId)) : ""})</i> <button class="link" data-unlink="${esc(l.to)}" data-kind="${l.kind}" title="Remove this link">✕</button></span>`);
  const ins = doc.items.flatMap((x) => (x.links ?? []).filter((l) => l.to === it.id).map((l) => `<span class="lnk lnk-${l.kind} muted">← ${esc(x.name)} <i>(${l.kind})</i></span>`));
  const usedBy = doc.items.flatMap((x) => (x.links ?? []).filter((l) => l.cableItemId === it.id).map((l) => `${x.name} → ${name(l.to)} (${l.kind})`));
  const r = roleOf(it), isSpk = r === "speaker";
  return `<tr data-id="${esc(it.id)}"><td><b>${esc(it.name)}</b><div class="hint">${esc(ROLE_LABEL[r])}${it.kind !== r ? ` (${esc(ctx.kindLabel(it.kind))})` : ""}</div></td><td>${ctx.summary(it) || '<span class="muted">–</span>'}${r === "cable" ? `<div class="hint">${usedBy.length ? "cable of: " + esc(usedBy.join("; ")) : "not used on a link yet"} · cable type: ${cableUse(it, {})}</div>` : ""}</td>
    <td>${[...outs, ...ins].join("<br>") || '<span class="muted">none</span>'}</td>
    <td class="acts">${isSpk ? '<button data-a="open">Open</button>' : '<button data-a="edit">Edit</button>'}${r === "cable" ? "" : '<button data-a="connect" class="primary">Connect…</button>'}<button data-a="remove">Remove</button></td></tr>
    ${connectFor === it.id ? `<tr class="connectRow" data-for="${esc(it.id)}"><td colspan="4">${connectHtml(doc, it)}</td></tr>` : ""}`;
}
function connectHtml(doc: ProjectDoc, it: Item): string {
  const kinds = kindsFrom(roleOf(it)); const all = [...kinds, ...LINK_KINDS.filter((k) => !kinds.includes(k))];
  const others = doc.items.filter((i) => i.id !== it.id && roleOf(i) !== "cable");
  const cables = doc.items.filter((i) => roleOf(i) === "cable");
  return `<div class="toolbar connect" id="cx"><b>Connect ${esc(it.name)}</b>
    <label>what <select id="cxKind">${all.map((k) => `<option value="${k}">${k}</option>`).join("")}</select></label>
    <label>port <input id="cxFromPort" style="width:7em"></label>
    <label>to <select id="cxTo">${others.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} (${esc(ROLE_LABEL[roleOf(o)].toLowerCase())})</option>`).join("")}</select></label>
    <label>port <input id="cxToPort" style="width:7em"></label>
    <label>cable <select id="cxCable"><option value="">no cable item</option>${cables.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}<option value="__new">+ new cable item…</option></select></label>
    <label id="cxLenL" style="display:none">length <input id="cxLen" type="number" min="0" step="0.1" style="width:5em"> m</label>
    <button class="primary" id="cxGo">Link</button><button id="cxCancel">Cancel</button></div>
    <div class="hint">Port names are free text (shown on the diagram); the defaults follow the link kind. The cable item gives the gauge and length for the cable calculator and the parts list.</div>`;
}
function bindItems(root: HTMLElement, ctx: SysCtx) {
  const doc = ctx.doc();
  root.querySelectorAll<HTMLButtonElement>(".sysTable button[data-unlink]").forEach((b) => b.onclick = () => { unlinkItems(doc, b.closest("tr")!.dataset.id!, b.dataset.unlink!, b.dataset.kind); ctx.save(); renderSystem(root, ctx); });
  root.querySelectorAll<HTMLButtonElement>(".sysTable button[data-a]").forEach((b) => b.onclick = async () => {
    const id = b.closest("tr")!.dataset.id!; const it = doc.items.find((i) => i.id === id); if (!it) return;
    const a = b.dataset.a;
    if (a === "open") return ctx.openItem(id);
    if (a === "edit") { editFor = id; showEdit(root, ctx, id); $("#sysEdit")?.scrollIntoView({ block: "nearest" }); return; }
    if (a === "connect") { connectFor = connectFor === id ? undefined : id; renderSystem(root, ctx); return; }
    if (a === "remove") {
      if (doc.items.length <= 1) { ctx.status("A project keeps at least one item", "bad"); return; }
      if (!confirm(`Remove "${it.name}" from the project? Where it sat in a wire, the item before it is linked straight to the item after it. A copy is kept in data/private/deleted.`)) return;
      if (!(await ctx.removeItem(it))) return;
      const r = removeKeepChain(doc, id);
      if (editFor === id) editFor = undefined; if (connectFor === id) connectFor = undefined;
      ctx.save(); ctx.status(`Removed "${it.name}"${r.bridged ? ` (${r.bridged} wire${r.bridged > 1 ? "s" : ""} kept through it)` : ""}`, "ok"); renderSystem(root, ctx);
    }
  });
  const cx = $("#cx"); if (!cx || !connectFor) return;
  const from = doc.items.find((i) => i.id === connectFor)!;
  const fill = () => {
    const kind = $<HTMLSelectElement>("#cxKind").value as LinkKind, to = doc.items.find((i) => i.id === $<HTMLSelectElement>("#cxTo").value);
    const k = (from.links ?? []).filter((l) => l.kind === kind).length;
    const p = defaultPorts(kind, from, to, k);
    $<HTMLInputElement>("#cxFromPort").value = p.fromPort ?? ""; $<HTMLInputElement>("#cxToPort").value = p.toPort ?? "";
  };
  // a sensible first target for the first kind (e.g. amplifier: speaker -> the first speaker item)
  const pick = () => {
    const kind = $<HTMLSelectElement>("#cxKind").value as LinkKind;
    const want = kind === "speaker" ? ["speaker"] : kind === "ground" ? ["ground"] : kind === "signal" || kind === "remote" ? ["amplifier", "dsp"] : ["fuse", "distribution", "capacitor", "amplifier", "dsp"];
    const t = doc.items.find((i) => i.id !== from.id && want.includes(roleOf(i)) && !(from.links ?? []).some((l) => l.to === i.id && l.kind === kind));
    if (t) $<HTMLSelectElement>("#cxTo").value = t.id;
    fill();
  };
  pick();
  $<HTMLSelectElement>("#cxKind").onchange = pick; $<HTMLSelectElement>("#cxTo").onchange = fill;
  $<HTMLSelectElement>("#cxCable").onchange = () => { ($("#cxLenL") as HTMLElement).style.display = $<HTMLSelectElement>("#cxCable").value === "__new" ? "" : "none"; };
  $("#cxCancel").onclick = () => { connectFor = undefined; renderSystem(root, ctx); };
  $("#cxGo").onclick = () => {
    const kind = $<HTMLSelectElement>("#cxKind").value, to = $<HTMLSelectElement>("#cxTo").value;
    let cable = $<HTMLSelectElement>("#cxCable").value;
    if (cable === "__new") {
      const len = parseFloat($<HTMLInputElement>("#cxLen").value);
      const c = plainKindItem("cable", `${kind === "speaker" ? "Speaker" : kind === "remote" ? "Remote" : kind === "signal" ? "Signal" : kind === "ground" ? "Ground" : "Power"} cable: ${from.name} to ${doc.items.find((i) => i.id === to)?.name ?? to}`, doc.items.map((i) => i.id), { use: kind === "ground" ? "power" : kind, ...(len > 0 ? { lengthM: len } : {}) });
      doc.items.push(c); cable = c.id;
    }
    const r = linkItems(doc, from.id, to, kind, { fromPort: $<HTMLInputElement>("#cxFromPort").value.trim(), toPort: $<HTMLInputElement>("#cxToPort").value.trim(), cableItemId: cable || undefined });
    if (!r.ok) { ctx.status("Not linked: " + r.error, "bad"); return; }
    connectFor = undefined; ctx.save(); ctx.status("Linked", "ok"); renderSystem(root, ctx);
  };
}
function showEdit(root: HTMLElement, ctx: SysCtx, id: string) {
  const box = root.querySelector<HTMLElement>("#sysEdit"); const it = ctx.doc().items.find((i) => i.id === id); if (!box || !it) return;
  if (roleOf(it) === "speaker") { box.innerHTML = ""; return; }
  ctx.editForm(box, it, () => { syncAlternator(ctx.doc()); ctx.save(); });
  box.insertAdjacentHTML("afterbegin", `<div class="toolbar"><button id="sysEditClose">Close</button>${it.data?.replacedPartId ? `<span class="hint warn">The size was set by Use this size: the product ${esc(it.data.replacedPartId)} no longer matches and was taken off this item (pick a product of this size in the calculator).</span>` : ""}</div>`);
  $("#sysEditClose").onclick = () => { editFor = undefined; box.innerHTML = ""; renderSystem(root, ctx); };
}

// ------------------------------------------------------------------------------------------------------------ wire it for me
function showProposal(root: HTMLElement, ctx: SysCtx) {
  const box = root.querySelector<HTMLElement>("#sysWire"); const p = proposal; if (!box || !p) return;
  const doc = ctx.doc(); const name = (id?: string) => doc.items.find((i) => i.id === id)?.name ?? p.add.find((i) => i.id === id)?.name ?? id ?? "";
  if (!p.add.length && !p.links.length) { box.innerHTML = `<div class="card info" id="wireNone"><b>Nothing to propose</b>${p.notes.map(esc).join("<br>") || "Every item is wired already."} <button id="wireClose">Close</button></div>`; $("#wireClose").onclick = () => { proposal = undefined; box.innerHTML = ""; }; return; }
  box.innerHTML = `<div class="card info" id="wireProp"><b>Wire it for me: proposed (nothing is changed until you press Apply)</b>
    ${p.add.length ? `<div>New items:</div><ul class="plain">${p.add.map((it) => `<li><label><input type="checkbox" data-wadd="${esc(it.id)}" checked> ${esc(it.name)}</label></li>`).join("")}</ul>` : ""}
    <div>Links:</div><table id="wireTable"><tr><th></th><th>From</th><th>What</th><th>To</th><th>Cable</th><th>Why</th></tr>${p.links.map((l, k) => `<tr><td><input type="checkbox" data-wlink="${k}" checked></td><td>${esc(name(l.from))}${l.fromPort ? ` <span class="hint">${esc(l.fromPort)}</span>` : ""}</td><td class="lnk-${l.kind}">${l.kind}</td><td>${esc(name(l.to))}${l.toPort ? ` <span class="hint">${esc(l.toPort)}</span>` : ""}</td><td>${l.cableItemId ? esc(name(l.cableItemId)) : '<span class="muted">none</span>'}</td><td class="hint">${esc(l.why)}</td></tr>`).join("")}</table>
    ${p.notes.length ? `<ul class="hint">${p.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <div class="toolbar"><button class="primary" id="wireApply">Apply the ticked items and links</button><button id="wireCancel">Cancel</button></div></div>`;
  $("#wireCancel").onclick = () => { proposal = undefined; box.innerHTML = ""; };
  $("#wireApply").onclick = () => {
    const items = new Set([...box.querySelectorAll<HTMLInputElement>("input[data-wadd]")].filter((x) => x.checked).map((x) => x.dataset.wadd!));
    const links = new Set([...box.querySelectorAll<HTMLInputElement>("input[data-wlink]")].filter((x) => x.checked).map((x) => Number(x.dataset.wlink)));
    const r = applyProposal(doc, p, items, links); proposal = undefined;
    ctx.save(); ctx.status(`Wired: ${r.linked} link${r.linked === 1 ? "" : "s"}${r.added ? `, ${r.added} item${r.added === 1 ? "" : "s"} added` : ""}${r.errors.length ? ` (${r.errors.length} skipped)` : ""}`, r.errors.length ? "warn" : "ok");
    renderSystem(root, ctx);
  };
}

// ------------------------------------------------------------------------------------------------------------ cable calculator
const OPT_DOC = (doc: ProjectDoc): Partial<CableOptions> => (doc.cableOptions ??= {});
function optionsHtml(o: CableOptions, sel: Partial<CableOptions>): string {
  const opt = (v: string, t: string, cur: string) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`;
  const drop = o.dropMode === "0.5V" ? "0.5V" : o.dropPct === 3 ? "3" : "custom";
  return `<div class="toolbar" id="ccOpts">
    <label title="Voltage at the amplifiers: 13.8 V engine running (Rockford's current convention), 12.6 V engine off, 14.4 V charging">Supply <select data-o="supplyV">${["12.6", "13.8", "14.4"].map((v) => opt(v, v + " V", String(o.supplyV))).join("")}</select></label>
    <label title="Allowed total voltage drop (power run + ground return). 3 % = ABYC E-11.16.1.2.7 (default). 0.5 V is a common installer target with no primary source.">Drop limit <select data-o="drop">${opt("3", "3 % (ABYC, default)", drop)}${opt("custom", "other %", drop)}${opt("0.5V", "0.5 V (installer target, no primary source)", drop)}</select></label>
    <label id="ccPctL" style="${drop === "custom" ? "" : "display:none"}"><input data-o="dropPct" type="number" min="0.5" max="10" step="0.5" style="width:4em" value="${o.dropPct}"> %</label>
    <label title="Conductor temperature for the drop (research B2 default 50 C: warm boot / cabin)">Temperature <input data-o="tempC" type="number" min="-20" max="105" step="5" style="width:4em" value="${o.tempC}"> °C</label>
    <label title="Default material of runs whose cable item does not say">Material <select data-o="material">${opt("copper", "copper (OFC)", o.material)}${opt("cca", "CCA", o.material)}</select></label>
    <label title="Runs inside the engine space: ABYC engine-space column (50 C ambient), about 0.85 of the outside rating">Where <select data-o="location">${opt("outside", "outside the engine space", o.location)}${opt("engine", "in the engine space", o.location)}</select></label>
    <label title="Insulation temperature rating of the cable">Insulation <select data-o="insulationC">${opt("105", "105 °C", String(o.insulationC))}${opt("90", "90 °C", String(o.insulationC))}</select></label>
    <label title="Fuse allowed up to this share of the wire's ampacity (ABYC E-11.12.1.4 allows up to 150 %)">Fuse ≤ <select data-o="fuseMaxPct">${opt("100", "100 % of ampacity", String(o.fuseMaxPct))}${opt("150", "150 % (ABYC ceiling)", String(o.fuseMaxPct))}</select></label>
    ${Object.keys(sel).length ? '<button class="link" id="ccReset">Back to the defaults</button>' : ""}</div>
    <div class="hint">Bundling (more than two conductors run together over 610 mm lowers the rating: ABYC Table VII) is set per cable, in each run's row below or on the cable item. Options are saved with the project.</div>`;
}
function bindOptions(box: HTMLElement, ctx: SysCtx) {
  const doc = ctx.doc();
  box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#ccOpts [data-o]").forEach((el) => el.onchange = () => {
    const o = OPT_DOC(doc), k = el.dataset.o!;
    if (k === "drop") { if (el.value === "0.5V") o.dropMode = "0.5V"; else { o.dropMode = "pct"; o.dropPct = el.value === "3" ? 3 : (o.dropPct && o.dropPct !== 3 ? o.dropPct : 2); } }
    else if (k === "material" || k === "location") (o as any)[k] = el.value;
    else { const v = parseFloat(el.value); if (isFinite(v)) (o as any)[k] = v; }
    ctx.save(); const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input); refreshSystemDiagram(ctx);
  });
  const rs = box.querySelector<HTMLButtonElement>("#ccReset"); if (rs) rs.onclick = () => { delete doc.cableOptions; ctx.save(); const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input); refreshSystemDiagram(ctx); };
}
function sizeCell(s?: { size: string; areaMm2: number; dropV: number; totalDropV: number }) { return s ? `<b>${esc(s.size)}${/mm2/.test(s.size) ? "" : " AWG"}</b> <span class="hint">${fx(s.areaMm2, 2)} mm²</span>` : '<span class="bad">none fits</span>'; }
export function renderCable(box: HTMLElement, ctx: SysCtx, res?: CableSystemResult, input?: CableSystemInput) {
  const doc = ctx.doc(); const o = withDefaults(doc.cableOptions);
  if (!res) { box.innerHTML = optionsHtml(o, doc.cableOptions ?? {}) + `<p class="muted">The calculator could not run on this project.</p>`; bindOptions(box, ctx); return; }
  const recs = ctx.cableRecords();
  const runs = res.runs.map((r) => runRow(doc, r, res, input, recs)).join("");
  box.innerHTML = `${optionsHtml(o, doc.cableOptions ?? {})}
    <div class="hint" id="ccAllowed">Allowed drop ${fx(res.allowedV, 3)} V (${o.dropMode === "0.5V" ? "0.5 V option, no primary source" : `${o.dropPct} % of ${o.supplyV} V`}); a run that ends at a distribution block gets ${Math.round(o.mainShare * 100)} % of it, each branch the rest after the main run's drop. Design current of the system: <b id="ccTotal">${fx(res.totalMaxA)} A</b> at full sine output, about <b>${fx(res.totalMusicA)} A</b> on music.</div>
    ${res.loads.length ? `<h3>Current drawn</h3><table id="ccLoads"><tr><th>Load</th><th>Maximum</th><th>Music average</th><th>From</th></tr>${res.loads.map((l) => `<tr data-load="${esc(l.id)}"><td>${esc(l.name ?? l.id)}</td><td class="num" data-v="maxA">${fx(l.maxA)} A</td><td class="num" data-v="musicA">${fx(l.musicA)} A</td><td class="hint">${esc(l.source)}: ${esc(l.how)}${l.notes.length ? "<br>" + l.notes.map(esc).join("<br>") : ""}</td></tr>`).join("")}</table>` : '<p class="muted" id="ccNoLoads">No amplifier or DSP in the project: nothing draws power yet.</p>'}
    ${res.runs.length ? `<h3>Power runs (battery to amplifiers)</h3><div class="ccScroll"><table id="ccRuns"><tr><th>Run</th><th>Current max (music)</th><th>Fuse</th><th>Recommended copper</th><th>Recommended CCA</th><th>Metric copper</th><th>Cable used</th><th>Drop</th><th>Power lost max (music)</th><th>Drop incl. upstream</th><th>Maker says</th><th></th></tr>${runs}</table></div>` : res.loads.length ? '<p class="warn" id="ccNoRuns">No power run: link the battery to the amplifiers (power links), or press Wire it for me.</p>' : ""}
    ${res.speakers.length ? `<h3>Speaker cable (5 % rule)</h3><table id="ccSpk"><tr><th>Link</th><th>Length</th><th>Load</th><th>Recommended</th><th>Cable used</th><th>Current at rated power</th><th></th></tr>${res.speakers.map((s) => speakerRow(doc, s, input)).join("")}</table>
      <div class="hint">Roger Russell (McIntosh) rule: the wire's loop resistance at most 5 % of the load the amplifier sees (http://www.roger-russell.com/wire/wire.htm). Open a row's table for every size: loss in dB, power lost and damping factor.</div>` : ""}
    ${res.capacitors.length ? `<h3>Capacitors</h3><table id="ccCaps"><tr><th>Capacitor</th><th>Energy at ${o.supplyV} V</th><th>Usable ${o.capHighV} to ${o.capLowV} V</th><th>Hold-up at full draw</th><th>Precharge τ / full (5 τ)</th><th>Inrush / resistor peak</th><th>"1 F per 1000 W"</th></tr>${res.capacitors.map((c) => `<tr data-cap="${esc(c.id)}"><td>${esc(c.name ?? c.id)}${c.farads ? ` <span class="hint">${c.farads} F</span>` : ""}</td><td class="num">${fx(c.energyJ)} J</td><td class="num">${fx(c.usableJ)} J</td><td class="num">${fx(c.holdupMs)} ms</td><td class="num">${fx(c.tauS, 0)} s / ${fx(c.fullChargeS, 0)} s</td><td class="num">${fx(c.inrushA, 3)} A / ${fx(c.resistorPeakW, 2)} W</td><td class="num">${fx(c.ruleOfThumbF, 2)} F <span class="hint">(comparison only)</span></td></tr>
      <tr><td colspan="7">${c.notes.length ? `<ul class="hint">${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}${warnList(c.warnings)}</td></tr>`).join("")}</table>` : ""}
    <h3>Alternator and big 3</h3>${altHtml(doc, res)}
    ${res.warnings.length ? `<h3>Notes on the whole system</h3>${warnList(res.warnings)}` : ""}
    <div class="hint">Sources: ABYC E-11 (2003) ampacity Table IV, bundling Table VII, 3 % drop, fuse placement and 150 % ceiling (https://law.resource.org/pub/us/cfr/ibr/inc/ansi/abyc.e-11.2003.pdf); copper NBS Handbook 100; CCA ASTM B566 via maker datasheets; amplifier current: maker figure, else maker fuse, else P / (η V) with η 0.50 class D, 0.45 class A/B (research_i B3). Fuse, holder and joint drops are not counted: leave a margin. Help: Cable calculator.</div>`;
  bindOptions(box, ctx);
  // use this size / product / bundling
  box.querySelectorAll<HTMLButtonElement>("button[data-use]").forEach((b) => b.onclick = () => {
    const it = doc.items.find((i) => i.id === b.dataset.cable); if (!it) return;
    const msg = setCableSize(it, b.dataset.use!, b.dataset.mat as Material); ctx.save(); ctx.status(`Use this size: ${msg}`, "ok");
    const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input); refreshSystemDiagram(ctx);
  });
  box.querySelectorAll<HTMLButtonElement>("button[data-prod]").forEach((b) => b.onclick = () => {
    const it = doc.items.find((i) => i.id === b.dataset.cable); const rec = (recs ?? []).find((r) => r.id === b.dataset.prod); if (!it || !rec) return;
    setCableProduct(it, rec, productArea(rec), productMaterial(rec)); ctx.save(); ctx.status(`${it.name}: ${rec.title ?? rec.id}`, "ok");
    const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input); refreshSystemDiagram(ctx);
  });
  box.querySelectorAll<HTMLSelectElement>("select[data-bundle]").forEach((s) => s.onchange = () => {
    const it = doc.items.find((i) => i.id === s.dataset.bundle); if (!it) return; it.data ??= {};
    const v = Number(s.value); if (v > 2) it.data.bundled = v; else delete it.data.bundled;
    ctx.save(); const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input);
  });
  box.querySelectorAll<HTMLInputElement>("#ccAlt [data-bat]").forEach((el) => el.onchange = () => {
    const bat = doc.items.find((i) => roleOf(i) === "battery"); if (!bat) return; bat.data ??= {};
    const v = parseFloat(el.value); if (v > 0) bat.data[el.dataset.bat!] = v; else delete bat.data[el.dataset.bat!];
    if (el.dataset.bat === "alternatorA") delete bat.data.alternatorFrom;
    ctx.save(); const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input);
  });
  const b3 = box.querySelector<HTMLInputElement>("#ccBig3"); if (b3) b3.onchange = () => { if (b3.checked) doc.cableBig3 ??= { material: "copper" }; else delete doc.cableBig3; ctx.save(); const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input); };
  box.querySelectorAll<HTMLInputElement>("#ccAlt [data-b3]").forEach((el) => el.onchange = () => {
    const b = (doc.cableBig3 ??= {}) as any; const k = el.dataset.b3!;
    if (k === "material") b.material = el.value; else { const v = parseFloat(el.value); if (v > 0) b[k] = v; else delete b[k]; }
    ctx.save(); const cv = cableFor(doc, ctx.lookups()); renderCable(box, ctx, cv.result, cv.input);
  });
}
function runRow(doc: ProjectDoc, r: RunResult, res: CableSystemResult, input: CableSystemInput | undefined, recs?: any[]): string {
  const o = res.options;
  const cables = runCableIds(input, r.id).map((id) => doc.items.find((i) => i.id === id)).filter(Boolean) as Item[];
  const mat = (r.chosen?.material ?? r.used?.material ?? o.material) as Material;
  const rec = recommendedAwg(r, mat);
  const fuse = r.fused ? (r.fuseA ? `${r.fuseA} A${r.fuseRecommendedA && r.fuseRecommendedA !== r.fuseA ? ` <span class="hint">(rec. ${r.fuseRecommendedA} A)</span>` : ""}` : "–") : `<span class="hint">no fuse of its own${r.protectedByA ? `; upstream ${r.protectedByA} A` : ""}</span>`;
  const u = r.used;
  const maker = r.makerWireAwg ? `${esc(r.makerWireAwg)} AWG <span class="hint">vs calculated ${esc(rec ?? "–")} AWG ${matName(mat)}</span>` : '<span class="muted">–</span>';
  const inp = runInput(input, r.id);
  const bundled = cables[0]?.data?.bundled ?? inp?.bundled ?? 2;
  const needs = !r.chosen || !r.chosen.ok; // offered when no size is chosen or the chosen one is too thin (never to downsize)
  const acts = cables.length ? cables.map((c) => needs && rec && normSize(c.data?.size) !== rec ? `<button data-use="${esc(rec)}" data-mat="${mat}" data-cable="${esc(c.id)}" title="Set ${esc(c.name)} to ${esc(rec)} AWG ${matName(mat)}">Use this size (${esc(rec)} AWG)</button>` : "").join("") +
    `<label class="hint" title="Conductors run together over 610 mm (ABYC Table VII)">bundle <select data-bundle="${esc(cables[0].id)}">${[[2, "≤ 2"], [3, "3"], [4, "4-6"], [7, "7+"]].map(([v, t]) => `<option value="${v}" ${Number(bundled) === v || (v === 4 && bundled > 3 && bundled < 7) || (v === 7 && bundled >= 7) ? "selected" : ""}>${t}</option>`).join("")}</select></label>` : '<span class="hint warn">no cable item</span>';
  const prods = recs?.length ? matchCableProducts(recs, { ...needForRun(r, o), location: inp?.location ?? o.location, bundled: inp?.bundled }, 4) : [];
  const prodHtml = recs ? (prods.length ? `<details class="prods"><summary>Real products that fit (${prods.length}, cheapest per metre first, judged by real copper area)</summary><table class="ccProds">${prods.map((p) => `<tr><td>${ext(p.url, p.title ?? p.id)}</td><td class="num">${fx(p.areaMm2, 2)} mm² <span class="hint">${p.labelOnly ? "label size, real copper may be less" : esc(p.areaBasis)}</span></td><td>${matName(p.material)}${p.materialAssumed ? ' <span class="hint">(not stated: judged as CCA)</span>' : ""}</td><td class="num">${p.pricePerMAud ? `AUD ${p.pricePerMAud.toFixed(2)}/m` : '<span class="muted">no AUD price</span>'}</td><td>${cables[0] ? `<button data-prod="${esc(p.id)}" data-cable="${esc(cables[0].id)}">Use this product</button>` : ""}</td></tr>`).join("")}</table></details>` : '<div class="hint">No product in the cable bundle meets this run with its real copper area.</div>') : '<div class="hint">Loading the cable products…</div>';
  return `<tr data-run="${esc(r.id)}" class="${r.warnings.some((w) => w.level === "error") ? "runErr" : ""}"><td style="padding-left:${6 + r.depth * 16}px">${r.depth ? "↳ " : ""}${esc(r.name ?? r.id)}${cables.length ? `<div class="hint">${cables.map((c) => esc(c.name)).join(", ")}, ${fx(r.lengthM)} m + ${fx(r.groundLengthM)} m ground</div>` : `<div class="hint">${fx(r.lengthM)} m + ${fx(r.groundLengthM)} m ground</div>`}</td>
    <td class="num" data-v="maxA">${fx(r.maxA)} A <span class="hint">(${fx(r.musicA)})</span></td><td data-v="fuse">${fuse}</td>
    <td data-v="cu">${sizeCell(r.recommended.awg.copper)}</td><td data-v="cca">${sizeCell(r.recommended.awg.cca)}</td><td data-v="metric">${sizeCell(r.recommended.metric.copper)}</td>
    <td data-v="used">${u ? `${esc(u.size ?? fx(u.areaMm2, 2) + " mm²")}${u.size ? " AWG" : ""} ${matName(u.material)}${r.chosen ? (r.chosen.ok ? ' <span class="ok">ok</span>' : ' <span class="bad">too thin</span>') : ' <span class="hint">(recommended, no size chosen)</span>'}` : "–"}</td>
    <td class="num" data-v="drop">${u ? `${fx(u.dropV, 3)} V (${fx(u.dropPct, 2)} %)` : "–"}</td><td class="num" data-v="loss">${u ? `${fx(u.lossW)} W (${fx(u.lossMusicW)})` : "–"}</td>
    <td class="num" data-v="total">${u ? `${fx(u.totalDropV, 3)} V (${fx(u.totalDropPct, 2)} %)` : "–"}${r.upstreamDropV ? `<div class="hint">upstream ${fx(r.upstreamDropV, 3)} V</div>` : ""}</td>
    <td>${maker}</td><td class="acts">${acts}</td></tr>
    <tr class="runMore" data-for="${esc(r.id)}"><td colspan="12">${warnList(r.warnings)}${prodHtml}</td></tr>`;
}
const normSize = (s?: string) => (s ? String(s).replace(/\s*awg$/i, "").replace(/^0$/, "1/0").replace(/^00$/, "2/0").trim() : undefined);
function runInput(input: CableSystemInput | undefined, id: string): any {
  const find = (rs: any[]): any => { for (const r of rs ?? []) { if (r.id === id) return r; const j = r.to?.junction; if (j) { const x = find(j.branches); if (x) return x; } } return undefined; };
  return find(input?.feeds ?? []);
}
function speakerRow(doc: ProjectDoc, s: CableSystemResult["speakers"][number], input?: CableSystemInput): string {
  const sp = input?.speakers?.find((x) => x.id === s.id); const c = doc.items.find((i) => i.id === sp?.cableItemId);
  const use = c && s.recommendedAwg && normSize(c.data?.size) !== s.recommendedAwg && (!s.chosen || s.chosen.pctOfZ > 5) ? `<button data-use="${esc(s.recommendedAwg)}" data-mat="${s.material}" data-cable="${esc(c.id)}">Use this size (${esc(s.recommendedAwg)} AWG)</button>` : c ? "" : '<span class="hint warn">no cable item</span>';
  return `<tr data-spk="${esc(s.id)}"><td>${esc(s.name ?? s.id)}${c ? `<div class="hint">${esc(c.name)}</div>` : ""}</td><td class="num">${fx(s.lengthM)} m</td><td class="num">${s.loadOhm ? fx(s.loadOhm, 2) + " Ω" : "–"}</td>
    <td data-v="rec">${s.recommendedAwg ? `<b>${esc(s.recommendedAwg)} AWG</b> <span class="hint">${s.recommended ? fx(s.recommended.pctOfZ, 1) + " % of Z" : ""}</span>` : '<span class="bad">none</span>'}</td>
    <td data-v="chosen">${s.chosen ? `${esc(s.chosen.size)} AWG: ${fx(s.chosen.pctOfZ, 1)} % of Z, ${fx(s.chosen.lossDb, 2)} dB` : '<span class="hint">no size chosen</span>'}</td><td class="num">${s.currentA ? fx(s.currentA) + " A" : "–"}</td><td class="acts">${use}</td></tr>
    <tr><td colspan="7">${warnList(s.warnings)}<details><summary>Every size for this link</summary><table class="ccRule"><tr><th>AWG</th><th>Loop Ω</th><th>% of Z</th><th>Loss</th><th>Power lost</th><th>Damping factor</th></tr>${s.rows.map((r) => `<tr class="${r.pctOfZ <= 5 ? "" : "muted"}"><td>${esc(r.size)}</td><td class="num">${fx(r.loopOhm, 3)}</td><td class="num">${fx(r.pctOfZ, 1)} %</td><td class="num">${fx(r.lossDb, 2)} dB</td><td class="num">${fx(r.powerLostPct, 1)} %</td><td class="num">${fx(r.dampingFactor, 0)}</td></tr>`).join("")}</table></details></td></tr>`;
}
function altHtml(doc: ProjectDoc, res: CableSystemResult): string {
  const bat = doc.items.find((i) => roleOf(i) === "battery"); const b3 = doc.cableBig3 as any;
  const a = res.alternator;
  return `<div id="ccAlt">${bat ? `<div class="toolbar"><label>Alternator rating <input data-bat="alternatorA" type="number" min="0" step="5" style="width:5em" value="${bat.data?.alternatorA ?? ""}"> A</label>
      <label title="Lights, fan, ignition and the rest of the car while driving">Car's own load <input data-bat="vehicleLoadA" type="number" min="0" step="5" style="width:5em" value="${bat.data?.vehicleLoadA ?? ""}"> A</label><span class="hint">(kept on ${esc(bat.name)})</span></div>` : '<p class="hint">Add a battery to enter the alternator rating.</p>'}
    ${a ? `<table class="kv" id="ccAltRes"><tr><td>Alternator</td><td>${a.ratingA ? a.ratingA + " A" : "–"}</td></tr><tr><td>Spare for the system</td><td>${a.spareA !== undefined ? fx(a.spareA) + " A" : "–"}</td></tr><tr><td>System draw</td><td>${fx(res.totalMaxA)} A full sine, ${fx(res.totalMusicA)} A music</td></tr><tr><td>Makers' suggested alternator (sum)</td><td>${a.suggestedSumA ? a.suggestedSumA + " A" : "–"}</td></tr></table>${warnList(a.warnings)}` : ""}
    <div class="toolbar"><label title="Alternator + to battery +, battery - to chassis, engine block to chassis; sized for the whole system current (installer practice, no standard)"><input type="checkbox" id="ccBig3" ${b3 ? "checked" : ""}> Big 3 upgrade</label>
      ${b3 ? `<label>alternator + <input data-b3="altPosM" type="number" min="0" step="0.1" style="width:4em" value="${b3.altPosM ?? ""}"> m</label><label>battery − <input data-b3="batNegM" type="number" min="0" step="0.1" style="width:4em" value="${b3.batNegM ?? ""}"> m</label><label>engine ground <input data-b3="engineGroundM" type="number" min="0" step="0.1" style="width:4em" value="${b3.engineGroundM ?? ""}"> m</label>
      <label><select data-b3="material"><option value="copper" ${b3.material !== "cca" ? "selected" : ""}>copper</option><option value="cca" ${b3.material === "cca" ? "selected" : ""}>CCA</option></select></label>` : ""}</div>
    ${res.big3 ? `<table id="ccBig3Res"><tr><th>Wire</th><th>Length</th><th>Size</th></tr>${res.big3.runs.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${fx(r.lengthM)} m</td><td>${esc(r.size ?? r.awg?.size ?? "–")} AWG</td></tr>`).join("")}</table>${warnList(res.big3.warnings)}` : ""}</div>`;
}

// ------------------------------------------------------------------------------------------------------------ quick calculator
const qs: QuickInput & { by: "power" | "current" } = { by: "power", rmsW: 1000, cls: "D", lengthM: 5, groundLengthM: 0.5, material: "copper", location: "outside" };
export function renderQuickCalc(box: HTMLElement, ctx: Pick<SysCtx, "status" | "saveToMyItems" | "cableRecords" | "loadCableRecords">) {
  const opt = (v: string, t: string, cur?: string) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`;
  box.innerHTML = `<div id="qc"><div class="cols2">
    <div><div class="row"><label>Amplifier figures</label><select id="qcBy">${opt("power", "RMS power and class", qs.by)}${opt("current", "maker's maximum current", qs.by)}</select></div>
      <div class="row qcP"><label>RMS power, all channels, at the load used</label><input id="qcW" type="number" min="0" step="50" value="${qs.rmsW ?? ""}"><span class="u">W</span></div>
      <div class="row qcP"><label>Class</label><select id="qcCls">${["D", "BD", "AD", "AB"].map((c) => opt(c, c === "AB" ? "A/B" : c, qs.cls)).join("")}</select><span class="u"></span></div>
      <div class="row qcI"><label>Maximum current (maker)</label><input id="qcI" type="number" min="0" step="5" value="${qs.iMaxA ?? ""}"><span class="u">A</span></div>
      <div class="row"><label>Power cable length (battery to amp)</label><input id="qcL" type="number" min="0" step="0.1" value="${qs.lengthM}"><span class="u">m</span></div>
      <div class="row"><label>Ground cable length</label><input id="qcG" type="number" min="0" step="0.1" value="${qs.groundLengthM ?? ""}"><span class="u">m</span></div>
      <div class="row"><label>Material</label><select id="qcM">${opt("copper", "copper (OFC)", qs.material)}${opt("cca", "CCA", qs.material)}</select><span class="u"></span></div>
      <div class="row"><label>Where it runs</label><select id="qcLoc">${opt("outside", "outside the engine space", qs.location)}${opt("engine", "in the engine space", qs.location)}</select><span class="u"></span></div>
      <div class="row"><label>Supply / drop limit</label><select id="qcV">${["12.6", "13.8", "14.4"].map((v) => opt(v, v + " V", String(qs.options?.supplyV ?? 13.8))).join("")}</select><select id="qcD">${opt("pct", "3 % (ABYC)", qs.options?.dropMode ?? "pct")}${opt("0.5V", "0.5 V (no primary source)", qs.options?.dropMode)}</select></div>
      <div class="toolbar"><button class="primary" id="qcGo">Calculate</button></div></div>
    <div id="qcOut"></div></div></div>`;
  const show = () => {
    (["qcP", "qcI"] as const).forEach((c) => box.querySelectorAll<HTMLElement>("." + c).forEach((e) => e.style.display = (c === "qcP") === (qs.by === "power") ? "" : "none"));
  };
  const read = () => {
    const n = (id: string) => { const v = parseFloat(($(id) as HTMLInputElement).value); return isFinite(v) && v > 0 ? v : undefined; };
    qs.by = $<HTMLSelectElement>("#qcBy").value as any; qs.rmsW = n("#qcW"); qs.cls = $<HTMLSelectElement>("#qcCls").value; qs.iMaxA = n("#qcI");
    qs.lengthM = n("#qcL") ?? 0; qs.groundLengthM = n("#qcG"); qs.material = $<HTMLSelectElement>("#qcM").value as Material; qs.location = $<HTMLSelectElement>("#qcLoc").value as any;
    qs.options = { supplyV: Number($<HTMLSelectElement>("#qcV").value), dropMode: $<HTMLSelectElement>("#qcD").value as any };
  };
  const calc = () => {
    read(); show();
    const q = quickCalc({ ...qs, rmsW: qs.by === "power" ? qs.rmsW : undefined, iMaxA: qs.by === "current" ? qs.iMaxA : undefined });
    const r = q.run, l = q.load, o = q.result.options;
    if (!r || !l || !l.maxA) { $("#qcOut").innerHTML = `<p class="warn" id="qcNone">Enter the amplifier's RMS power (or its maximum current) and the cable length.</p>`; return; }
    const mat = qs.material ?? "copper"; const rec = r.recommended.awg[mat];
    const recs = ctx.cableRecords();
    const prods = recs ? matchCableProducts(recs, { ...needForRun(r, o), location: qs.location }, 4) : [];
    $("#qcOut").innerHTML = `<table class="kv" id="qcRes"><tr><td>Current</td><td data-v="maxA"><b>${fx(l.maxA)} A</b> maximum, ${fx(l.musicA)} A music <span class="hint">(${esc(l.source)}: ${esc(l.how)})</span></td></tr>
      <tr><td>Fuse at the battery</td><td data-v="fuse"><b>${r.fuseA ?? r.fuseRecommendedA ?? "–"} A</b> <span class="hint">within 175 mm of the battery (ABYC E-11.12.1.2)</span></td></tr>
      <tr><td>Cable, ${matName(mat)}</td><td data-v="size"><b>${rec ? `${esc(rec.size)} AWG` : "none fits"}</b>${rec ? ` <span class="hint">${fx(rec.areaMm2, 2)} mm², ${fx(rec.ampacityA, 0)} A ampacity</span>` : ""}</td></tr>
      <tr><td>Other material</td><td data-v="other">${sizeCell(r.recommended.awg[mat === "copper" ? "cca" : "copper"])} ${matName(mat === "copper" ? "cca" : "copper")}</td></tr>
      <tr><td>Metric (ISO) copper</td><td>${sizeCell(r.recommended.metric.copper)}</td></tr>
      <tr><td>Drop</td><td data-v="drop">${r.used ? `${fx(r.used.dropV, 3)} V (${fx(r.used.dropPct, 2)} %) of ${fx(allowedDropV(o), 3)} V allowed; ${fx(r.used.lossW)} W lost at full draw` : "–"}</td></tr></table>
      ${warnList(r.warnings.filter((w) => w.code !== "fuse-distance-unknown"))}
      ${prods.length ? `<details open><summary>Real products that fit</summary><table class="ccProds">${prods.map((p) => `<tr><td>${ext(p.url, p.title ?? p.id)}</td><td class="num">${fx(p.areaMm2, 2)} mm²</td><td>${matName(p.material)}${p.materialAssumed ? " (assumed)" : ""}</td><td class="num">${p.pricePerMAud ? `AUD ${p.pricePerMAud.toFixed(2)}/m` : "–"}</td></tr>`).join("")}</table></details>` : ""}
      <div class="toolbar"><button id="qcSave" ${rec ? "" : "disabled"}>Save this cable to My items</button><span class="hint">Saved as a cable item (size, material, length, the fuse and the inputs in its notes); add it to any project from My saved items.</span></div>`;
    const sv = $("#qcSave") as HTMLButtonElement | null;
    if (sv && rec) sv.onclick = async () => {
      const name = `Power cable ${rec.size} AWG ${matName(mat)}, ${fx(qs.lengthM)} m (${qs.by === "power" ? `${qs.rmsW} W class ${qs.cls}` : `${qs.iMaxA} A`} amplifier)`;
      const ok = await ctx.saveToMyItems({ section: "electrical", kind: "cable", name, data: { use: "power", lengthM: qs.lengthM, ...(qs.groundLengthM ? { groundLengthM: qs.groundLengthM } : {}), size: rec.size, areaMm2: rec.areaMm2, material: mat, location: qs.location, note: `Quick calculator ${new Date().toISOString().slice(0, 10)}: fuse ${r.fuseA ?? r.fuseRecommendedA} A at the battery; ${fx(l.maxA)} A (${l.source})`, calc: { ...qs } } });
      if (ok) ctx.status(`"${name}" saved to My items`, "ok");
    };
  };
  box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => el.addEventListener("change", calc));
  $("#qcGo").onclick = calc;
  calc();
  if (!ctx.cableRecords()) void ctx.loadCableRecords().then(() => { if ($("#qcOut")) calc(); });
}

// ------------------------------------------------------------------------------------------------------------ alert panel
export interface AlertHandlers { onAdd: (issue: SystemIssue) => void; onNotNow: () => void; onOpenSystem?: () => void; leaving?: boolean;
  /** Compact (one line with Show / Not now): used when an autosave finds a new problem, so the panel does not cover the page
   * while the user is still building; Save / Ctrl+S and leaving show the full list. */
  compact?: boolean }
let alertHandlers: AlertHandlers | undefined;
export const alertOpen = () => !!document.getElementById("sysAlert");
export function closeAlert() { document.getElementById("sysAlert")?.remove(); alertHandlers = undefined; }
/** Show (or refresh) the ONE missing-part alert. An empty list removes it: nothing is shown when nothing is missing. */
export function showAlert(issues: SystemIssue[], h?: AlertHandlers) {
  if (h) alertHandlers = h;
  if (!issues.length) { closeAlert(); return; }
  const hd = alertHandlers; if (!hd) return;
  const crit = issues.filter((i) => i.severity === "critical"), warn = issues.filter((i) => i.severity !== "critical");
  const li = (i: SystemIssue) => `<li class="issue ${i.severity}" data-issue="${esc(i.id)}"><span class="sev">${i.severity === "critical" ? "Critical" : "Warning"}</span> ${esc(i.message)}<div><button class="${i.severity === "critical" ? "primary" : ""}" data-add="${esc(i.id)}">${esc(i.suggestion.label)}</button></div></li>`;
  let el = document.getElementById("sysAlert");
  if (hd.compact) {
    if (!el) { el = document.createElement("div"); el.id = "sysAlert"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-labelledby", "sysAlertTitle"); document.body.appendChild(el); }
    el.className = "sysAlert compact";
    el.innerHTML = `<b id="sysAlertTitle">Something may be missing (${issues.length}${crit.length ? `, ${crit.length} critical` : ""})</b> <button class="primary" id="saShow">Show</button><button id="saNotNow">Not now</button>`;
    el.querySelector<HTMLButtonElement>("#saShow")!.onclick = () => { if (alertHandlers) alertHandlers.compact = false; showAlert(issues); };
    el.querySelector<HTMLButtonElement>("#saNotNow")!.onclick = () => { const f = alertHandlers?.onNotNow; closeAlert(); f?.(); };
    return;
  }
  if (!el) { el = document.createElement("div"); el.id = "sysAlert"; el.className = "sysAlert"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-labelledby", "sysAlertTitle"); document.body.appendChild(el); }
  el.className = "sysAlert";
  el.innerHTML = `<div class="saHead"><b id="sysAlertTitle">${hd.leaving ? "Before you leave: " : ""}something may be missing in this system (${issues.length})</b></div>
    ${crit.length ? `<div class="saSub crit">Critical (${crit.length})</div><ul class="saList" id="saCrit">${crit.map(li).join("")}</ul>` : ""}
    ${warn.length ? `<div class="saSub">Warnings (${warn.length})</div><ul class="saList" id="saWarn">${warn.map(li).join("")}</ul>` : ""}
    <div class="toolbar"><button id="saNotNow">${hd.leaving ? "Not now (leave)" : "Not now"}</button>${hd.onOpenSystem ? '<button id="saSystem">Open the System tab</button>' : ""}<span class="hint">Shown on Save / Ctrl+S, when you leave the project, and when a new problem appears (Help: System).</span></div>`;
  el.querySelectorAll<HTMLButtonElement>("button[data-add]").forEach((b) => b.onclick = () => { const is = issues.find((i) => i.id === b.dataset.add); if (is) alertHandlers?.onAdd(is); });
  el.querySelector<HTMLButtonElement>("#saNotNow")!.onclick = () => { const f = alertHandlers?.onNotNow; closeAlert(); f?.(); };
  const so = el.querySelector<HTMLButtonElement>("#saSystem"); if (so) so.onclick = () => { const f = alertHandlers?.onOpenSystem; f?.(); };
}
