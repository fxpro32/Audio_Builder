# Cable calculator engine (B4A_CABLE_ENGINE, R41, 2026-11-23)

Code: `app/src/engine/cable.ts` (pure functions, no DOM, no file access). Tests: `app/tests/cable.test.ts`.
Maths sources: ABYC E-11, NBS Handbook 100 and the makers' figures (see the README); reference implementation `scripts/parts/cable_calc.py`; constants `data/parts_raw/_reference/cable_constants.json` (copied into `cable.ts`; a test checks they still match the JSON).
Users: the cable calculator UI (B4) and the wiring diagram / missing part check (B6, R44).

## Two ways in

1. `calcProject(doc, lookups, options?)` = `calcCableSystem(buildCableSystem(doc, lookups, options))`: from a project v2 document (items + typed links, `docs/project_model_v2.md`).
2. `calcCableSystem(input)`: from a plain `CableSystemInput` object (the UI can also build one by hand, e.g. for a quick "one amp, 5 m" calculation).

`lookups` (`CableLookups`), supplied by the caller because the engine reads no files:
- `part(id, category?)`: a `data/parts_raw` record by its `id` (categories `amplifiers`, `dsp`, `capacitors`, `fuses`, `distribution`, `cable`, `batteries`).
- `driver(id)`: `{ ohmsPerCoil, coils, params?: { Znom } }` for door / IB items.
- `cableRecords`: optional array of `parts_raw` cable records for product suggestions.

## Item data the builder reads (project model v2)

Every item may hold `data.partId` (a `parts_raw` record id); values typed on the item override the record.

| Item kind | `data` fields read | From the record when not typed |
|---|---|---|
| `battery` (or `other` with `role: "battery"`) | `alternatorA`, `vehicleLoadA` (car's own load) | |
| `amplifier` | `class`, `rmsW` (total, all channels, at the load used), `loadOhm`, `iMaxA`, `iMusicA`, `fuseA`, `powerWireAwg`, `suggestedAlternatorA`, `rOutOhm`, `channelW` | `class`, `rms_ratings` at the load the amp sees (`rmsAtLoad`), `current_draw_max_sine_13v8_a` / `current_draw_max_sine_a` / `current_draw_max_a`, `current_draw_avg_music_13v8_a` / `current_draw_music_max_a`, `recommended_fuse_a` / `fuse_onboard_a`, `power_wire_awg_maker`, `suggested_alternator_a`. Kenwood-style `current_draw_a` ("consumption") is NOT used as a maximum (research C). |
| `dsp` | `iMaxA` or `currentA`, `fuseA` | `current_draw_a`, `fuse_a` |
| `capacitor` | `farads`, `voltageV`, `prechargeOhm` | `farads`, `voltage_v` |
| `fuse`, `fuseholder` | `ratingA`, `distanceMm` (from the battery, along the cable), `sheathed`, `fused` (only when it has several outputs) | `rating_a`, `fuse_included_a` |
| `distribution` | `fused` (true = one fuse per output), `fuseA` (branch fuse rating) | fused when the record's kind/title says "fuse" or it has `fuse_type` |
| `cable` | `lengthM`, `groundLengthM`, `size` (AWG text), `areaMm2` (real copper area), `material` (`copper` / `cca`), `location` (`outside` / `engine`), `bundled` (conductors in the bundle) | `awg`, real area (`productArea`), material (`productMaterial`) |
| `other` with `role: "ground"` or `"chassis"` | (a ground point) | |
| `box` | `power.impedance` (per driver, already the wired coil impedance), `drivers`; or `loadOhm` | final load = `coils.ts finalLoad(z, drivers, "parallel")` |
| `door`, `ib` | `loadOhm`, else the driver's nominal impedance (one driver per channel assumed) | |

Links read:
- `power` links from each battery are followed item by item. Fuse / fuse holder: the first one on a run is its fuse. Cable (as a `cableItemId` on a link, or as an item in the chain): adds its length. Capacitor: passed through and attached to the amp at the end of the run. `distribution`, or any fuse / cable / other item with more than one outgoing power link: a junction with one branch run per outgoing link. Amplifier / DSP: the end of the run.
- `ground` link from an amp, with a `cableItemId`: that cable's length is the ground return of the amp's run (else `groundLengthM` on the power cable).
- `speaker` links from an amp: one speaker cable each (`cableItemId` length and size; load from the target item).
- Project-level optional fields: `doc.cableOptions` (any `CableOptions`), `doc.cableBig3` (`{ altPosM, batNegM, engineGroundM, material }`).

Problems found while building go into `input.warnings` (codes: `no-battery`, `amp-no-speakers`, `cable-length-unknown`, `power-loop`, `second-fuse`, `unknown-in-chain`, `mixed-cable`, `run-no-load`). After calculating: `load-not-powered` for an amp no run reaches.

## CableSystemInput

```ts
{ options?: Partial<CableOptions>, loads: LoadInput[], feeds: RunInput[], capacitors?: CapInput[], speakers?: SpeakerInput[],
  alternator?: { ratingA?, vehicleLoadA? }, big3?: { altPosM?, batNegM?, engineGroundM?, material? }, warnings?: Warning[] }
RunInput = { id, name?, lengthM, groundLengthM?, material?, location?, bundled?, cable?: { size?, areaMm2?, material?, partId?, label?, areaBasis? },
  fuseA?, fused?, fuseDistanceMm?, fuseSheathed?, cableItemIds?, fuseItemId?, capacitorIds?,
  to: { load: id } | { junction: { id, name?, fused, branchFuseA?, branches: RunInput[] } } | { none: true } }
LoadInput = { id, name?, kind?, cls?, rmsTotalW?, loadOhm?, iMaxA?, iMaxLabel?, iMusicA?, fuseA?, powerWireAwgMaker?, suggestedAlternatorA?, v? }
```

`feeds` are the runs leaving the battery; each has its own main fuse. A run ending at a junction is the main run; its branches may branch again.

## CableOptions (defaults)

| Option | Default | Source |
|---|---|---|
| `supplyV` | 13.8 V | research B3 (engine running, Rockford's current convention); 12.6 / 14.4 are the other choices |
| `dropMode`, `dropPct` | `"pct"`, 3 % (0.414 V at 13.8 V) | ABYC E-11.16.1.2.7. `"0.5V"` = 0.5 V, labelled in the results as having no primary source |
| `mainShare` | 2/3 (2 % of 3 %) | share of the drop for a run ending at a distribution block (research B6, example E2) |
| `tempC` | 50 C | conductor temperature for power runs (research B2 assumption) |
| `speakerTempC` | 20 C | research E3 |
| `material`, `location`, `insulationC` | copper, outside engine space, 105 C | ABYC Table IV columns |
| `fuseMaxPct` | 100 % | fuse not above wire ampacity; ABYC allows up to 150 % (always an error above 150 %) |
| `ampROutOhm` | 0.02 ohm | research E3 assumption (damping factor) |
| `speakerFraction` | 0.05 | Roger Russell 5 % rule |
| `capHighV`, `capLowV`, `prechargeOhm` | 14.4 V, 12.6 V, 1000 ohm | capacitor usable-energy window (B4A choice, see below) and research B7 example resistor |

## CableSystemResult

- `loads[]` (`LoadCurrent`): `maxA`, `musicA`, `source` (`maker max` / `maker fuse` / `formula` / `none`), `how` (text), `eta`. Order: maker maximum, maker fuse, P / (eta V) with eta 0.50 class D / BD / AD and 0.45 class A/B (research B3; mixed classes take the lower). Music average = maker figure or half the maximum.
- `totalMaxA`, `totalMusicA`, `allowedV`.
- `runs[]` (`RunResult`), in walk order, with `depth` (0 = from the battery) and `parentId`:
  - `maxA`, `musicA` (sum of the loads below), `fused`, `fuseA` (chosen or recommended), `fuseRecommendedA` (next stocked rating at or above the current), `protectedByA` (unfused branch: the upstream fuse the wire must carry).
  - `recommended.awg.copper|cca` and `recommended.metric.copper|cca` (`SizeResult`: `size`, `areaMm2`, `ampacityA`, `loopOhm`, `dropV`, `totalDropV`, `allowedV`): the smallest size whose ampacity (x `fuseMaxPct`) carries the fuse and whose drop (plus the upstream drop for runs ending at a load) is within the limit.
  - `chosen` (`CableCheck`, when the run has a cable): its ampacity, drop, total drop, `ok`.
  - `used`: drop V and %, music drop, power loss W (max and music), total drop with upstream; for the chosen cable, else the recommended AWG in the run's material. Downstream branches add this run's drop.
  - `makerWireAwg` and `warnings` (`{ level: "error" | "warn" | "info", code, text }`).
- `capacitors[]` (`CapResult`): `energyJ` (0.5 C V^2 at supplyV), `usableJ` (between capHighV and capLowV), `holdupMs` (usable energy / amp input power at full draw), `tauS` (R C), `fullChargeS` (5 tau, about 99 %), `inrushA` (V/R), `resistorPeakW` (V^2/R), `ruleOfThumbF` (amp RMS / 1000, comparison only), `notes` (wiring advice and why "1 F per 1000 W" is not used).
- `speakers[]` (`SpeakerResult`): `recommendedAwg` (smallest size within 5 % of the load), `recommended` and `chosen` rows, `rows` (18 to 8 AWG: loop ohm, % of Z, loss dB, power lost %, damping factor), `currentA` (RMS at rated power) and warnings.
- `alternator`: `spareA` (rating minus vehicle load), `suggestedSumA` (sum of the makers' suggested alternators), warnings: music average above spare = warn; full sine above spare = info.
- `big3.runs[]`: each wire sized for the total system current in the engine-space column, and never thinner than the thickest feed (installer practice, no standard; said in a warning).
- `warnings`: system-level.

Warning codes on runs: `no-main-fuse`, `current-over-fuse-list`, `branch-unfused`, `no-size-fits`, `upstream-budget` (B7: a branch no size can fix because the upstream run(s) already use the whole drop budget or leave under 10 % of it, or the branch could be sized with no upstream drop; the text names the upstream run and its volts and advises a thicker or shorter upstream run instead of shortening the branch; the missing-part check shows it as one critical issue per branch, pointing at the upstream cable, and folds that branch's `chosen-drop` into it), `chosen-drop`, `fuse-below-load`, `fuse-over-ampacity`, `fuse-over-abyc-ceiling`, `chosen-too-thin`, `fuse-distance-unknown` / `-over-abyc` (over 175 mm) / `-sheathed` (up to 1830 mm in a sheath) / `-too-far` (over 457 mm, error), `ground-length-unknown`, `maker-wire-thinner`, `maker-wire-thicker`, `capacitor-wiring`.

## Other exports

`rPerM`, `ampacityAwg`, `ampacityMetric`, `ampacityForArea` (any real area: the ampacity of the largest table size not above it), `bundlingFactor`, `normAwg` ("0" = 1/0, "4 B&S" = 4), `awgInfo`, `auMmLabelToMm2` ("6 mm" = 4.59 mm2, never 6 mm2), `nextFuse`, `ampClass`, `loadCurrent`, `sizeRunAwg`, `sizeRunMetric`, `dropAwg`, `checkFuse`, `checkFuseDistance`, `capacitor`, `speakerRow`, `speakerMinAwg`, `speakerMaxLengthM` (reproduces Roger Russell's table), `speakerRun`, `rmsAtLoad`, `itemLoadOhm`, `productArea`, `productMaterial`, `matchCableProducts(records, need, limit)`, `needForRun(run, options)`; constants `AWG_TABLE`, `AWG_SIZES`, `ISO_105C`, `FUSE_RATINGS`, `ETA_DESIGN`, `CONDUCTORS`, `CCA_AMPACITY_FACTOR`, `ENGINE_SPACE_FACTOR`, `FUSE_DISTANCE`, `DEFAULT_OPTIONS`.

### Real products

`productArea(record)`: real copper area in this order: strand count (`actual_area_mm2_from_strands`, e.g. KnuKonceptz Kolossus "1/0" = 65.2 mm2), published `conductor_mm2` (Narva "6 mm" = 4.59 mm2), an AU "mm" label converted, and last the formula area of the AWG label (`labelOnly: true`, "real copper may be less", common with CCA). `productMaterial`: CCA / copper from the material text and title; unknown material is judged as CCA (safe). `matchCableProducts` keeps only products that meet the run's ampacity and drop (or the speaker 5 % rule) with their own area and material, sorted by AUD price per metre (records without an AUD price last), then by area.

## Assumptions and derived figures (shown to the user)

- CCA ampacity = copper x sqrt(rho_Cu / rho_CCA) = 0.79 (derived physics, research B4).
- ISO metric sizes in the engine space and 90 C insulation for metric sizes: factors 0.85 and 0.86 derived by B4A from the ratios of ABYC's own columns (not published for those cases). The 90 C engine-space AWG figure uses the same 0.85.
- Resistance uses the 2-decimal table area, like `cable_calc.py`; the research table's mOhm/m column was computed from the unrounded area (up to 0.4 % different, 18 AWG).
- Capacitor hold-up time and the 14.4 to 12.6 V window are B4A's illustration of E = 0.5 C V^2, not research figures.
- Speaker cable current against ABYC ampacity is an extra check by B4A (not in research B8).
- Fuse, holder and joint drops are not modelled (research B4): leave a margin.
- The music-average current assumes the Rockford convention (half the maximum) when the maker gives none.
