# Wiring diagram and missing-part check engine (B6A_DIAGRAM_ENGINE, R44, 2026-11-23)

Requirement R44 (verbatim): "make sure when a person saves a project, that a basic .svg or similar type image is drawn of the whole system that shows speaker to amp to cap to battery wiring etc... or whatever they've selected and if there is something missing, put an alert that asks them if they want to add such and such to the system, that way it will help if somehow someone forgets to add a bit that is critical."

Engine only (no UI). Pure functions, no DOM, no file access. Reads project model v2 (`docs/project_model_v2.md`: items + typed links) and reuses the cable engine (`docs/cable_engine.md`, `app/src/engine/cable.ts`) for gauges, fuses, drops and the alternator.

| File | What |
|---|---|
| `app/src/engine/sysmodel.ts` | Item roles (`roleOf`), link graph helpers, `cableFor` (cable engine input + result + run maps) |
| `app/src/engine/diagram.ts` | `systemDiagramSvg`: the SVG |
| `app/src/engine/syscheck.ts` | `checkSystem`: the issue list |
| `app/src/engine/sysreport.ts` | `systemReport` (both in one call) and `registerSystemReport` (the save hook) |
| `app/tests/diagram.test.ts` | Tests (26; 27 with `B6A_WRITE=1`, which also writes the examples) |
| `docs/progress/B6A_dryrun/` | Example: `full_system.svg/.png/.json`, `missing_parts.svg/.png`, `missing_parts_issues.json` |
| `scripts/b6a_svg_to_png.mjs` | Renders SVG files to PNG with headless Chromium (one browser) |

## For the UI job: one call

```ts
import { registerSystemReport, lastSystemReport } from "../engine/sysreport";
// once at start-up; lookups = the same CableLookups the cable calculator uses (object or function, as parts load later)
registerSystemReport(() => lookups, (report, doc, info) => {
  // report.issues: [] = show nothing (exception-only notice rule); else an alert with one "Add ...?" button per issue
  // report.svg: show it / offer it for download / PUT it to data/projects/<doc.name>/exports/system.svg
});
```

Why the report is not written into the project file: `ui/hooks.ts` runs the save hooks after the project file is written and says a handler must not change the project. A `doc.systemDiagram` field set there would not be on disk until the next save, and would change the project inside a save. So `registerSystemReport` keeps the last report per project name in memory (`lastSystemReport(name)`) and hands it to the listener; the UI decides where to show and store it (suggested: the project's `exports/` folder, like the .glb and .svg exports). The hook also runs for old v1 projects (`info.legacy` true); a lone box gives only the "no amplifier" warning.

## API

### `systemDiagramSvg(doc, lookups?, cableResult?, options?) -> string`
- `lookups`: `CableLookups` (`part(id, category?)`, `driver(id)`), as for the cable engine.
- `cableResult`: a `calcProject` result for this project; calculated inside when not given (`options.noCableEngine` skips that).
- `options`: `date` (header date; default the date part of `doc.saved`), `title` (default `doc.title`).
- Returns a complete SVG document (XML declaration, `xmlns`, `viewBox`, white background). Self-contained: no external fonts, images, links or CSS (generic font family `Arial, Helvetica, sans-serif`).
- Deterministic: the same project, lookups and options give the same string (no clock, no random; order = file order).

Layout (left to right):
- Column 0: battery (alternator above it). Then the power chain items (fuses, fuse holders, cable items used as nodes, distribution blocks, capacitors) in the column of their longest power-link distance from a battery; items no battery reaches take a default column by role (fuse 1, distribution 2, capacitor 3). Then all amplifiers in one column, then speakers (box, door, ib, speaker) in the next.
- Rows: each column is sorted by the mean row of the items feeding it, then file order, and centred vertically.
- Top band ("SIGNAL PATH"): head units then DSPs, placed just left of the amplifier column. Signal and remote links drop from it to the amplifiers.
- Bottom band: ground points (ground symbol) under the column of the first item that links to them; ground links run down the gutter to a lane above the band. A head unit / DSP grounded to a ground point gets a short stub to a small local ground symbol named after that point.
- "Not connected" frame: items with no link at all (cable items used as a link's `cableItemId` are not "items without links": they label their link).
- Legend at the bottom; header with title, date, item and link counts and the design current from the cable engine.

Links: orthogonal lines; colour and line style per kind so they also read in black and white print:

| Kind | Colour | Line |
|---|---|---|
| power | red `#d0202a` | solid, 3.2 |
| ground | black | long dash `10 4` |
| signal | blue `#1f5fd6` | dotted `2 4` |
| speaker | green `#178a35` | dash-dot `12 3 3 3` |
| remote | orange `#e07b00` | dash `6 4` |

Labels: power and ground links show the cable item's `size` ("1/0 AWG") or `areaMm2`, and `lengthM`; with no size, the size of the cable engine run that link belongs to (`rec. 4 AWG` when no cable was chosen). Speaker links show the load the amp sees (`itemLoadOhm`, boxes via `coils.ts finalLoad`), the port, and the cable size / length (or `rec.` size from the cable engine's speaker check). Signal / remote links show their port names. Boxes show a kind tag, the name and one detail line (fuse rating, type and distance from the battery; capacitor farads; amp power, class and the cable engine's maximum current; speaker drivers and load).

Hooks for the UI and tests: every item is a `<g class="item item-<role>" data-item="<id>" data-kind="<kind>">` with a `<title>` (hover text); every link is `<g class="link link-<kind>" data-link="<from>/<to>/<kind>" [data-cable="<cable item id>"]>` with a `<title>` naming both ends, ports, cable and note.

Port names (free text, from the link): the diagram prints them as they are (e.g. `RCA out`, `out 7/8`, `CH1`, `SPK`). Port names it reads: a speaker link `fromPort` groups loads on one amp output for the impedance check (`CH1 +` and `CH1 -` are the same output); a signal link `toPort` / `fromPort` / `note` containing "high level", "speaker level" or "auto on" counts as auto turn-on.

### `checkSystem(doc, lookups?, cableResult?, options?) -> SystemIssue[]`

```ts
interface SystemIssue { id: string; rule: string; severity: "critical" | "warning"; message: string;
  suggestion: { addKind: string; role?: string; label: string; linkTo?: string[]; linkFrom?: string[]; linkKind?: LinkKind };
  relatedItemIds: string[] }
```
- `id` = `<rule>:<item or run id>` (stable between saves). Critical issues first, then by rule (order below), then as found.
- `suggestion.label` is the button text ("Add a main fuse at the battery?"). `addKind` is the item kind to add (`other` + `role` for `ground`, `headunit`, `resistor`, `big3`); `""` means nothing to add, change something instead (the label says what). `linkFrom` / `linkTo` / `linkKind` tell the UI how to link the new item.
- `[]` when nothing is missing: the UI then shows nothing (exception-only notice).
- `options.noCableEngine` skips the cable engine rules.

Item roles read (`sysmodel.roleOf`): `battery`, `alternator`, `fuse` / `fuseholder`, `distribution`, `capacitor`, `amplifier`, `dsp`, `headunit` (kind `headunit` or `other` with `data.role: "headunit"` / `"source"`), speakers (`box`, `door`, `ib`, `speaker`), ground point (kind `ground` or `other` with `data.role: "ground"` / `"chassis"`), `cable`, `connector`; `other` with `data.role: "battery"` is a battery (as in the cable engine).

Item data read besides the cable engine's (`docs/cable_engine.md`): amplifier `minLoadOhm` (else the record's `min_load_ohm`), `channels` (else the record's), `autoOn: true` or `turnOn: "auto"` (auto turn-on), `source` (a noted source other than a link, e.g. "bluetooth"); DSP `source`, `poweredBy`; capacitor `prechargeOhm` / `precharge` / `prechargeNote`; fuse `distanceMm`, `sheathed`.

### Rules

| Rule | Severity | When | Suggestion |
|---|---|---|---|
| `no-battery` | critical | amps, DSPs, caps, fuses or blocks but no battery | Add the battery? |
| `amp-no-power` | critical | amp with no incoming power link | Add a power cable from the battery to X? |
| `amp-not-reached` | critical | amp has power links but none leads back to a battery | Link the power wire of X back to the battery? |
| `no-main-fuse` | critical | a power link leaves the battery and reaches a load or block (through cable / connector items only) before any fuse | Add a main fuse at the battery? |
| `fuse-too-far` | warning (critical over 457 mm) | first fuse `distanceMm` over 175 mm (ABYC E-11.12.1.2), unless `sheathed` and at most 1830 mm | Move X within 175 mm of the battery? |
| `amp-no-ground` | critical | amp with no ground link | Add a ground point (chassis) for X? |
| `amp-no-speakers` | critical | amp with no speaker link | Add a speaker or subwoofer for X? |
| `amp-no-signal` | critical | amp with no incoming signal link and no `data.source` | Connect <DSP / head unit> (signal) to X? or Add a head unit (or DSP) to feed X? |
| `speaker-no-amp` | critical | amps exist, but this speaker item has no speaker link from an amp (or DSP / passive part) | Add an amplifier for X? |
| `no-amplifier` | warning | speakers but no amplifier at all (a box-only design project, e.g. an old v1 project) | Add an amplifier? |
| `dsp-no-source` | critical | DSP with no incoming signal link and no `data.source` | Add a head unit (source) for X? |
| `dsp-no-output` | warning | DSP with no signal or speaker link out | Add an amplifier after X? |
| `dsp-no-power` | warning | DSP with no power link and no `data.poweredBy` | Add a fused power wire for X? |
| `load-below-min` | critical | the load on one amp output (speaker links grouped by `fromPort`; a 1-channel amp without ports = all in parallel; equal loads via `coils.ts finalLoad`, unequal 1 / sum(1/Z)) is below the amp's minimum stable load | Rewire the speaker coils (series) or choose another amplifier for X? |
| `branch-unfused-thin` | critical | cable engine: a branch with no fuse of its own whose chosen wire ampacity is below the upstream fuse (ABYC E-11.12.1.5) | Add a fuse for this branch (or use a fused distribution block)? |
| `cable-error` | critical | cable engine run warnings `fuse-over-ampacity`, `fuse-over-abyc-ceiling`, `no-size-fits`, `chosen-too-thin`, `current-over-fuse-list`, and any other error level | Use a thicker power cable (or a smaller fuse)? etc. |
| `cable-warning` | warning | cable engine `chosen-drop`, `fuse-below-load`; speaker `speaker-chosen-thin`, `speaker-current`, `speaker-no-size` | Use a thicker or shorter power cable? / Use a thicker speaker cable? |
| `amp-no-remote` | warning | amp with no remote link and no auto turn-on noted | Add a remote turn-on wire to X? |
| `run-no-cable` | warning | a power run (cable engine) with no cable item | Add the power cable to X? |
| `ground-no-cable` | warning | amp ground link without a cable item | Add the ground cable for X? |
| `speaker-no-cable` | warning | amp speaker links without a cable item | Add the speaker cable(s) for X? |
| `cap-not-on-run` | warning | capacitor with no amp downstream or directly linked, or not on a wire from the battery | Link X into the amplifier's power wire, close to the amplifier? |
| `cap-no-precharge` | warning | capacitor without a precharge resistor noted (research_i B7, Stinger SPC505 manual) | Add a precharge resistor for X? |
| `item-not-connected` | warning | fuse, block, head unit, connector, battery (when there is electrical gear) or unused cable item with no link, in a project that has links | Link X into the system? |
| `alternator` | warning | cable engine `alternator-music` (music average above the alternator's spare) | Add the big 3 upgrade (and consider a higher-output alternator)? or, with `doc.cableBig3` set, Add a second battery (or a higher-output alternator)? |

Cable engine codes not turned into issues (shown by the cable calculator itself): `no-main-fuse` and `fuse-distance-*` (covered by the rules above), `branch-unfused` (info; only a problem when the wire is too thin, rule `branch-unfused-thin`), `capacitor-wiring`, `ground-length-unknown`, `maker-wire-*`, `rout-assumed`, `alternator-peak`, and other info-level notes.

### `systemReport(doc, lookups?, options?) -> SystemReport`
`{ project, svg, issues, cable?, checkedAt }`: one cable engine run shared by the diagram and the check. `options` = diagram options plus `now` (fixes `checkedAt`, for tests).

### `registerSystemReport(lookups | () => lookups, listener?) -> unregister`
Adds the save hook (`ui/hooks.ts addProjectSaveHook`). On every project save: makes the report, keeps it (`lastSystemReport(doc.name)`), calls `listener(report, doc, info)`. Errors are caught by `onProjectSave`, so a save never fails because of it. The project is not changed.

## Limits
- One layout for every project; very large systems (many amps, many grounds) get wide or tall but stay readable; lines can cross (no crossing minimisation beyond the row ordering).
- Power runs that skip columns are routed through the gaps between rows; a link that goes backwards loops under its source.
- The amp's minimum load check needs `minLoadOhm` (or a parts record with `min_load_ohm`); bridged outputs are not modelled (name the port e.g. `CH1+2 bridged` so they group as one output and enter `minLoadOhm` for bridged use).
- Remote and signal rules cannot know a DSP-with-amp product drives speakers itself unless it has speaker links.
