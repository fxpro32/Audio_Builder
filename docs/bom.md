# Bill of materials and the linked spreadsheet (B5_BOM, R42, 2026-11-23)

Requirement R42 (verbatim): "Then I need it also to be all saved into a linkable spreadsheet and project that if all parts of the project are linked, a BOM at the end in a spreadsheet can be generated showing all bits required, including but not limited to speakers, amps, caps, cable, connectors etc... everything that would be needed for that specific project. Make sure you can also save the work as a project."

| File | What |
|---|---|
| `app/src/engine/bom.ts` | `bomForProject(doc, lookups, options)`: the BOM (pure, no DOM); `setBomOverride`, `partPrices`, `rcaPairs` |
| `app/src/io/xlsx.ts` | Minimal .xlsx writer, no dependency: STORE-only ZIP with CRC-32, SpreadsheetML parts, inline strings, formulas with cached values, `fullCalcOnLoad` |
| `app/src/io/bomexport.ts` | `bomWorkbook` (sheets BOM, Parts, Cables, Items, Diagram, Info) and `bomCsv` |
| `app/src/ui/bomui.ts` | BOM tab |
| `app/tests/bom.test.ts`, `bomfixture.ts`, `xlsxread.ts` | Tests; the .xlsx is read back (own unzip) and every formula evaluated (own small evaluator) |
| `scripts/ui_dryrun_bom.mjs`, `scripts/b5_run_bom.sh` | Headless dry run (port 8421, fresh data copy) |

## Inputs
- The project (docs/project_model_v2.md): items and typed links. Items opened in memory only are left out.
- `lookups`: `part(id, cat)` (parts bundles), `driver(id)` (driver list, `priceAud`), `cableRecords` (cable products, for a price hint only), `box(item)` (the panels of a box or IB baffle as the Boards tab's first source shows them: the Design new box when the item has one, else the saved box; free-form boxes only when shown), `sheets`, `kerfMm`, `trimMm` (data/boards/mdf_sheets_au.json).
- The cable engine (docs/cable_engine.md) for sizes not chosen, fuse ratings of fused outputs and the big 3; the missing-part check (docs/diagram_engine.md) for "Missing / to decide".
- `doc.bomOverrides` (`{ [lineKey]: { qty?, priceAud? } }`) and `doc.bomSparePct` (default 10). Either one makes an old v1 file be written as v2 (`legacyCompatible`), so they are not lost.

## Groups and rules
| Group | Lines | Quantity rule |
|---|---|---|
| Speakers and drivers | the driver of each box (x drivers), door / IB / speaker items (x count), passive radiators of a pr design (x prCount) | as entered |
| Enclosures and materials | MDF sheets | per thickness, all box and baffle panels of the project together: the smallest single sheet that holds them (engine/nest.ts `smallestSheet`, kerf and trim as the Boards tab); none: the cheapest buy (`cheapestBuys`); neither: Missing |
| | wood glue, sealant | 1 per box or baffle |
| | wood screws | 1 per 150 mm of joint; joint = half the sum of the panel perimeters |
| | driver mounting screws | 8 per driver (count the frame holes) |
| | terminal cup | 1 per box |
| | fill | 1 bag per sealed, pr or TL box; amount to taste (no verified figure, research_c part 2, 1.3 d) |
| | port tubes | round ports of a vented design, as many as designed; slot port walls: noted (not in the cut list) |
| | carpet, spray adhesive | panel area + 15 %, rounded up to 0.1 m2; 1 can (optional) |
| Amplifiers, DSP and head unit, Power, Connectors, Other | one line per item: the part (brand, model, specs, prices) or the item's name ("no part chosen") | 1 (packs as sold); a plain battery 0 (the car's own); a plain alternator and chassis ground points are not lines |
| Power (derived) | fuse inserts | 1 per fuse holder that does not come with one (rating entered, else the part's, else the cable calculator's); 1 per used output of a fused distribution block (branch rating entered, else the cable calculator's) |
| Cable | metres per use (power, ground, speaker, remote), gauge, material and product | sum of the lengths entered on the cable items (and the ground return on a power cable) + spare %, rounded up to whole metres; a product sold by length: whole packs. Links with no cable item are wires too: size from the cable calculator (battery to fuse: the fuse's distance as the length); wires with no length are listed in the notes and not counted. Big 3 wires from the cable calculator. |
| Cable | RCA interconnects | 1 pair per signal link with no interconnect item; "out 1-4" = 4 channels = 2 pairs; high-level inputs none |
| Connectors and terminals | ring lugs / ferrules by gauge and stud | 1 per power or ground wire end: battery, fuse holder, capacitor, chassis, alternator = ring lug; amplifier, DSP, distribution block = ferrule (set-screw); speaker wire: 2 ferrules at the amp, 2 spades at the speaker; big 3: ring lugs |
| | firewall grommet | 1 per power run leaving the battery |
| Missing / to decide | the check's issues, panels or sheets that could not be counted, drivers not chosen | not in the totals |

Prices: the lowest AUD price known (driver `priceAud`, part `prices_aud`, sheet catalogue), with supplier, date and URL; every known price is kept (Parts sheet). Lines with no known price stay blank; totals give "n of m lines priced".

## Spreadsheet
- BOM: Group, Item, Brand, Model, Part ID, Qty, Unit, Unit price AUD, Line total AUD, Supplier, Price date, Price link, From project item(s), How the quantity was worked out, Notes, Spec source. Line total `=IF(OR(F="",H=""),"",F*H)`; subtotals `SUM`, grand total `SUM` of the subtotals, counts `COUNT(...)&" of "&COUNTA(...)&" lines priced"`. Unit price, supplier, date and link of part lines: `=IF(Parts!$F$n="","",Parts!$F$n)` etc. An overridden price is a value ("your price").
- Parts: one row per distinct part, driver or sheet size: specs, lowest price (column F, the cell the BOM reads), price unit, supplier, date, URL, other prices, spec source.
- Cables: the cable calculator's runs, speaker cables, capacitors, big 3, alternator. Items: every item, its values and links. Diagram: the file name of the wiring diagram (exports/system.svg). Info: project, date, app version, spare, data sources and licences, "check before buying".
- CSV: the BOM sheet's values from the header row down (UTF-8 with BOM).
- Validation: no LibreOffice in the container; the test reads the file back and evaluates every formula, checks it against the cached value, changes a Parts price and checks the BOM line and grand total follow, and compares the CSV with the sheet.

## Limits
- Derived quantities are rules of thumb stated on each line (glue, screws, carpet, lugs by terminal type); stud sizes are not known unless the part gives them.
- Cable with no length is not counted (listed); remote wire size is not worked out (no calculator rule).
- A box shown in free-form mode counts its panels only when it is the item on screen; bandpass / isobaric boxes have no cut list (Missing).
- Prices are not live.
