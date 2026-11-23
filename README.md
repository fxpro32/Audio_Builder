# Audio Builder

Audio Builder is an open-source assistant for building car audio systems and speaker boxes from published spec sheets. It runs as a small web app on your own computer: you open it in a web browser, pick what you are building (a car subwoofer box, door speakers, an infinite baffle, home or computer speakers), and it works out the box, shows it in 3D, simulates how it will sound, lays the panels out on real sheets of MDF or plywood, sizes the power and speaker cables and fuses for the whole system, draws the wiring diagram and produces a bill of materials as a linked spreadsheet. Every driver and part records where its values came from; in the project's own databases each value is credited to its source (the maker's own page or document wherever possible) with the date it was read.

When the app loads it shows a welcome page for 3 seconds (the logo, or the name Audio Builder in text until a logo file is added), then a start menu: **Continue where I left off**, **Build a project**, **Build a single item**, **Open a project**, **My saved items**, **System and wiring**, **Browse the parts database**. The **☰ Menu** button at the top left brings the menu back at any time.

Licence: GPL-3.0-or-later (see `LICENSE`). Data licences: see [Data included](#data-included).

## Contents

- [Quick start](#quick-start)
- [What it does](#what-it-does)
  - [Sections](#sections)
  - [Design new](#design-new)
  - [Analyse / Fix / Tweak](#analyse--fix--tweak)
  - [Infinite baffle](#infinite-baffle)
  - [Door speakers](#door-speakers)
  - [Home and computer speakers](#home-and-computer-speakers)
  - [3D view and exports](#3d-view-and-exports)
  - [Boards (MDF and plywood sheets)](#boards-mdf-and-plywood-sheets)
  - [Drivers](#drivers)
  - [REW measurements](#rew-measurements)
  - [Parts](#parts)
  - [System: linking, cable calculator, wiring diagram, missing-part check](#system-linking-cable-calculator-wiring-diagram-missing-part-check)
  - [BOM (bill of materials)](#bom-bill-of-materials)
  - [Projects, items and My items](#projects-items-and-my-items)
  - [Help](#help)
- [The maths and where it comes from](#the-maths-and-where-it-comes-from)
- [Data included](#data-included)
- [Project layout](#project-layout)
- [Tests and dry runs](#tests-and-dry-runs)
- [Known limits and not yet done](#known-limits-and-not-yet-done)
- [Licence](#licence)

## Quick start

You need Node.js 22.12 or newer, with npm (it comes with Node.js). The LTS version from https://nodejs.org/ is fine on every system; on Fedora `sudo dnf install nodejs` also works.

Get the project (the repository is private for now: this clone line works once it is public, or for people given access):

```
git clone https://github.com/fxpro32/Audio_Builder.git
cd Audio_Builder
```

### Linux and macOS

From inside the project folder:

```
bash scripts/start_app.sh
```

Then open **http://localhost:8420** in your web browser. To restart it (after an update that changes the server):

```
bash scripts/restart_app.sh
```

From anywhere, if you cloned it into your home folder (`~` is your home folder, `$HOME`):

```
bash ~/Audio_Builder/scripts/start_app.sh
bash ~/Audio_Builder/scripts/restart_app.sh
```

The scripts find their own folder, so any other location works the same way with its own path.

macOS has not been tested. `start_app.sh` uses only bash, curl and Node.js, so it should work there; `restart_app.sh` needs Linux (it reads `ss` and `/proc`), so on a Mac use `node scripts/start_app.mjs` to start and stop the server from Activity Monitor (the `node` process running `server/server.mjs`).

### Windows 10 and 11

Double-click `scripts\start_app.cmd` in File Explorer, or run it from Command Prompt inside the project folder:

```
cd Audio_Builder
scripts\start_app.cmd
```

It opens **http://localhost:8420** in your web browser when the server is up. To restart it, double-click `scripts\restart_app.cmd` or run `scripts\restart_app.cmd`; to stop it, `scripts\stop_app.cmd`.

From anywhere, if you cloned it into your user folder:

```
"%USERPROFILE%\Audio_Builder\scripts\start_app.cmd"
"%USERPROFILE%\Audio_Builder\scripts\restart_app.cmd"
```

In PowerShell:

```
& "$env:USERPROFILE\Audio_Builder\scripts\start_app.cmd"
& "$env:USERPROFILE\Audio_Builder\scripts\restart_app.cmd"
```

When the script was started by a double-click, its window waits for a key at the end so you can read what it said. The server keeps running in the background after the window closes. More detail (what the scripts do, what was tested, limits): `docs/windows.md`.

### Any system, with Node.js only

From inside the project folder: `node scripts/start_app.mjs` (add `--open` to open the browser too), or `cd app` then `npm run app`. This does the same as the start scripts.

### What the start scripts do

They install the app's packages the first time (`npm ci`, cache in `.npm-cache/`), build the web app if it has not been built (`npm run build`), and start the server in the background on port 8420 (log: `data/private/server.log`). If the server is already running they only say so. After a `git pull` that changes the app, build it again (`cd app` then `npm run build`) and restart.

The restart scripts stop only the Audio_Builder server on port 8420 (they check that the process is `server/server.mjs`, or `server\server.mjs` on Windows, and leave anything else alone), then start it again. Changes to the web pages only need a browser reload.

Notes:
- On Linux and macOS the server listens on port 8420 on all network interfaces (`0.0.0.0`); on Windows only on this computer (`127.0.0.1`), so Windows Firewall does not ask about it. `AB_HOST` sets the address, `PORT` another port.
- The data folder can be pointed elsewhere with `AB_DATA_DIR` (the test scripts use this so they never touch your real data).
- Developer commands, in `app/`: `npm run build` (type check + build), `npm test` (all tests), `npm start` (server only, after a build), `npm run app` (the cross-platform start).

## What it does

### Sections

The **Section** control at the top says what kind of speaker you are working on. It decides which tabs, drivers and box types are shown. One project can hold items from several sections (for example a subwoofer box and door speakers).

| Section | Drivers offered | Tabs |
|---|---|---|
| Subwoofer | every driver | Design new, Analyse / Fix / Tweak, Boards, Drivers, Parts, System, BOM, Project, Help |
| Door speaker | about 4 to 8 inch (midbass, midrange, coaxials, component sets, full range) | Door speakers, Drivers, Parts, System, BOM, Project, Help |
| Infinite baffle | about 8 to 40 inch subwoofers | Infinite baffle, Boards, Drivers, Parts, System, BOM, Project, Help |
| Home speakers | about 4 to 12 inch | Design new, Boards, Drivers, Parts, System, BOM, Project, Help |
| Computer speakers | about 2 to 5 inch | Design new, Boards, Drivers, Parts, System, BOM, Project, Help |

Outside the Subwoofer section, tweeters are not offered. The subwoofer section starts with your own default driver (set on the Drivers tab); home starts with a Dayton Audio RS180-8, computer with a Dayton Audio ND105-4 (both from the bundled driver-base library), and infinite baffle with the Acoustic Elegance IB15AU. Units can be metric or imperial (inches and cubic feet work in every size and volume field; the app stores millimetres and litres).

### Design new

Design a new box for a driver, to fit the space you have.

**Box types** (Subwoofer section; home and computer offer the first three):
- **Sealed**: sized to a target Qtc (0.707 is flat) or to your own volume.
- **Ported (vented)**: QB3 or SBB4 alignment (picked from the driver's Qts), or your own volume and tuning. Round or slot ports, several ports, and flared (aeroport-style) round ports.
- **Sealed with passive radiators** (passive radiators are sometimes called "drones": a cone with no voice coil or magnet that the air in the box moves, doing the job of a port). The box is sized and tuned like a ported box; the app can work out the added mass each passive radiator needs for the tuning, and warns when the passive radiators together displace less than 2 times what the driver does.
- **Transmission line (quarter-wave)**: a folded line inside a rectangular box: channels, taper, stuffing (polyester fibre), driver position along the line, open-end slot. The app suggests a starting design, recomputes the line when you change the outside sizes, rates the driver as a poor, fair or good line candidate in plain words, and compares the line with a sealed and a ported box in the car. The 3D view shows the dividers and the folded path; the panels go to the cut list and the Boards tab.
- **Bandpass**: 4th-order, 6th-order (dual reflex), and 3-chamber (single or dual reflex; the 3-chamber layout is the app's own definition, as no standard published one was found).
- **Isobaric**: two drivers per position, in half the volume.

**Shape**: rectangle or wedge (sloped back) with the classic designer; any other shape with the free-form Shape panel (see below).

**Sizing tools** (rectangle and wedge boxes):
- **Best size** works out width, height and depth for the gross inside volume the design needs: the net volume from the alignment, plus driver displacement times the number of drivers, passive radiator displacement, braces, and the port with its boards. It keeps the inside proportions near 1 : 1.28 : 1.54 (depth : height : width) so no two inside sizes are alike, checks every driver and passive radiator fits on the front baffle (one row, a grid or one column, whichever gives the best proportions), checks the magnet has room behind it (mounting depth + 10 mm, also on the sloped back of a wedge), and prefers a box wider than tall for a car.
- **Keep the volume** (ticked by default): change one side and the other unlocked sides change with it so the box keeps the volume the driver needs. Changing the panel thickness, the wedge's top %, the driver, the number of drivers, the target, braces, the port or the passive radiators does the same. Unticked: only the side you edit changes, and every result follows the real volume (a **Volume check** line shows how far it is from what is needed).
- **Locks**: a lock next to a side means it never changes by itself. With no free side left, the edit is refused and the screen says which side to unlock.
- **Several drivers in one box**: set the number of drivers; the volume, the baffle layout, the 3D view, the cut list and the simulation follow.
- **Dual voice coils**: pick the coil wiring (series, parallel or one coil). The app converts the published values to that wiring (or uses the maker's own per-wiring values where published) and shows the impedance per driver and the final load at the amplifier.

**Ports that are too long**: a port is always drawn and counted inside the box. If it cannot run straight, it is folded once (an L along the bottom and up the back); if even that does not fit, a slot is made narrower or a round port smaller, and the screen says so; if nothing fits, a red line says what is needed. Port air and port boards are taken off the net volume.

**Results** (plots and tables): loudness (SPL) in free field and in the car (cabin gain model, from the cabin's longest inside dimension), cone travel against Xmax, port air speed (with a 17 m/s rule-of-thumb line), impedance and group delay, with f3, peak and maximum cone travel in the summary. The transmission line comparison also gives the maximum SPL limited by Xmax or the driver's rated power.

**Free-form, fibreglass and scanned shapes** (the Shape panel, Design new and Analyse / Fix):
- Ways to give the shape: presets (rectangle, two wedges, trapezoid, triangle/corner prism, tube; rounded edges optional), a side profile times a width (straight or curved segments, optional taper), corner points (x, y, z of every corner), or a **3D scan** (`.stl`, `.obj` or `.ply` from a phone LiDAR app, photogrammetry or a scanner) with units, up axis, simplify, scale check against one tape-measured size, crop and automatic hole closing.
- Inside volume after wall or shell thickness (a thicker panel, such as a double baffle, can be set per panel), net volume after driver, port, MDF ring, braces and inserts. The same simulation as a rectangular box.
- **Wood**: every flat panel with its true outline, the angle to each neighbour and the table-saw blade tilt for a mitred joint (angles beyond most table saws are flagged); cut sheet `.svg` and `.dxf` for a CNC router.
- **Fibreglass**: shell thickness and MDF driver ring; estimates of mat and resin from the outside area (the assumptions are shown and editable); mould export (outside surface `.stl`) and ring `.dxf`.
- Driver and port holes on any panel, with checks (hole fits the panel, mounting depth, port fits straight with room at its end, port not overlapping the driver).
- **Export inside air .stl**: a closed mesh of the air inside, to check the volume independently in Blender or MeshLab.

**Use this design** saves the design as the box of the open project.

### Analyse / Fix / Tweak

For a box that already exists (Subwoofer section). Enter the driver, the box's outside sizes and panel thickness, the port (diameter or slot size and physical length), the amplifier power and impedance, and (optionally) the car's cabin for the in-car response. **Analyse and find fixes** then:
- lists findings in plain words: cone over-travel, port air speed too high, response peak ("boomy"), sealed box Q too high or low, port tuned far below the driver's resonance, long group delay, power above the driver's rating, internal standing waves, panel resonance, what the driver wants, and mechanical checks to do first;
- simulates each fix and shows the result: keep the box and add a subsonic filter, re-tune the port, block the port (box becomes sealed), reduce to a sealed Qtc 0.707 with solid inserts, or reduce to a ported QB3/SBB4 with inserts. Click a fix to see it in 3D (a blue block shows the inserts). A "Solid inserts already added" field shows the effect of inserts already fitted;
- shows a **Port fit** row (straight, folded or does not fit).

Free-form boxes can be analysed too. This tab handles sealed and ported boxes (see [Known limits](#known-limits-and-not-yet-done)).

### Infinite baffle

The subwoofers sit on a rigid, sealed baffle instead of in a box, as used and taught by PS Sound (UK). Modes:
- **Trunk IB**: the baffle is a wall between the boot and the cabin; the boot air behind the drivers works as the box, the cabin in front as a second load (can be switched off).
- **True IB**: drivers mounted through the floor, breathing to the outside; the cabin is the only air the cones work into.
- **Free air**: no load, for comparison.

It shows the response, the effect of a leak between boot and cabin (a gap works as a port and the bass below its tuning falls away), cone travel and the lowest 24 dB/octave subsonic filter that keeps the cone within Xmax, the most pressure the cones can make in the cabin, the power the drivers really draw (low near resonance), driver checks against published IB rules (PS Sound, MTX, Eminence/Lucas; shown as notes, not hard rules), and a **baffle board** sized for the drivers in one or more layers, sent to the Boards tab (birch plywood by default).

### Door speakers

A door is not a box, so no box is shown or calculated. The door mounting panel is blank ("to be decided"). What can be worked out without a box is shown: the driver's own data, a **fit check** from your measurements (hole diameter, room behind the mounting face to the window glass with the window down, spacer thickness), the response of the driver on its own, cone travel at the power set with the lowest high-pass that keeps it within Xmax, and the displacement-limited loudness. PS Sound's view on midbass in doors is given as their view.

### Home and computer speakers

The box designer with sealed, ported and passive radiator boxes, plus presets as starting shapes (not a standard): small bookshelf sealed, bookshelf ported, floor-standing ported with 2 drivers, desktop sealed and desktop ported, based on the sizes of named reference products (BBC LS3/5A, Wharfedale Diamond 12.2 / 12.3 / 12.4, KEF LS50 Meta, Genelec 8010A / 8020D, JBL 104). A preset is scaled to the volume your driver needs. Best size stands these boxes upright, and a box is kept at least 0.8 times as deep as it is wide. The page also gives the baffle step frequency (115 / front width in metres) and the inside-to-outside volume ratio of the reference products. Crossovers are not designed.

### 3D view and exports

An interactive 3D view (three.js) of the box, drivers, ports, passive radiators, inserts and transmission line dividers. Mouse and keys work like Blender: drag or middle-drag to orbit, right-drag or Shift+middle-drag to pan, wheel to zoom; 1 / 3 / 7 = front / right / top views, Ctrl+number = opposite view, 5 or Home = reset, X = x-ray.

| Export | What |
|---|---|
| `.glb` | The 3D scene; opens directly in Blender (File, Import, glTF 2.0), units in metres. Free-form boxes include the inside air as an object called `Inside_Air`. |
| `.stl` | The box mesh. Free-form: also the inside air and (fibreglass) the mould. |
| `.png` | Save picture of the 3D view. |
| Cut list | Every panel with its size. |
| `.svg` | Cut sheet; Boards layout; wiring diagram. |
| `.dxf` | Free-form panels for a CNC router (AutoCAD R12, mm, layers CUT / HOLES / BEVEL / TEXT); fibreglass MDF ring. |
| `.wdr` | A driver, in WinISD's format (Drivers tab). |
| `.xlsx`, `.csv` | The bill of materials (BOM tab). |

Exports are also saved with the project, in `data/projects/<project>/exports/`.

### Boards (MDF and plywood sheets)

Lays every panel of the box (or the infinite-baffle baffle) out on standard sheet sizes, drawn to scale. The repository includes a generic list of common Australian MDF and plywood sizes and thicknesses without prices (`data/boards/generic_sheets.json`); a local supplier catalogue with prices, if you keep one in `data/private/boards/`, is used instead:
- **Materials**: MDF (default for a box) or plywood: birch (default for an IB baffle), marine, hoop pine, structural, non-structural, exterior. The choice is saved with the item and used by the BOM. A sheet within 0.5 mm of the design thickness counts as that thickness, and the screen says so.
- **Layout**: straight edge-to-edge (guillotine) cuts as a panel saw or track saw breaks a sheet down; numbered cut order; two wedge sides can share one blank split by one sloped cut. Saw kerf (default 3.2 mm) and the trim off each factory edge (default 5 mm) are editable. Offcuts are shown.
- **Smallest sheet** that holds every panel, and, when prices are known, the **cheapest way to buy** (one supplier, one or several sheets, sizes may be mixed), with the percentage of each sheet used. Sheets marked "comparison only" in the catalogue are listed but never picked as the sheet to buy when another is available.
- **Grain** (plywood): with "keep the grain along the long side of each panel" (on by default) no panel is turned across the grain; the drawing shows the grain lines.
- **Weight** of the panels from the material's density (sourced values for MDF, birch, hoop pine and radiata structural / non-structural; no weight is given where the maker publishes no density).
- Save picture (SVG) and Print. With a local supplier catalogue, prices are as read on the date shown, with a link to check the current price.

### Drivers

- One list of every driver: your own, the public ones in `data/drivers/` and the bundled libraries (see [Data included](#data-included)), with paging, a count line, and filters: library, brand, size, type (subwoofer, tweeter, midrange, midbass, coaxial, component set, full range), final load (2, 1 or 0.5 ohm and others), coil, RMS power, simulatable only, sizes for the current section, and **Subwoofers only** (on by default). Filters in use are listed with **Clear filters**.
- Enter a driver from its spec sheet (Kind: driver or passive radiator). A spec-sheet check cross-checks the values against each other and marks problems in red; library entries whose maker values contradict each other carry a **CHECK** note, also shown above the driver choice where the driver is used. Entries without enough published values are listed but marked "no sim".
- Library entries are read-only: change a value and Save to keep your own copy.
- Import WinISD `.wdr` files (several at once) or a CSV saved from a spreadsheet (first row = column names such as Brand, Model, Fs, Re, Qms, Qes, Qts, Vas, Sd, Xmax). Imported spreadsheet rows are stored as private. Export any driver as `.wdr`.
- **Make this my default driver**: new projects, and projects with no driver chosen, start with it (stored per user, not in the shipped data).
- **Measure this driver's T/S values** from REW impedance sweeps (see below).

### REW measurements

For people who measure with Room EQ Wizard (REW, free software). A step-by-step guide is in `docs/rew_measuring_guide.md` and in the app's Help (impedance jig, calibration, sweeps, free air, Vas, in the box, export, import), with safety notes first.
- **Measurements (REW)** panel (Analyse / Fix and Design new): import REW text, FRD (response) or ZMA (impedance) exports; the app detects impedance or response, overlays measured against predicted, and stores the measurements with the project.
- **Fit the box to this sweep**: a least-squares fit of the box (volume, tuning, losses QL / QA / QP, Re offset) to an impedance sweep of the driver in its box, so the model matches the real box; undo / redo.
- **T/S from sweeps** (Drivers tab): a free-air sweep plus an added-mass or sealed-test-box sweep gives fs, Qms, Qes, Qts, Vas, Le and more; dual-voice-coil wiring is converted; the measured driver is saved as a copy.

### Parts

The **Parts** tab browses the car audio parts database: amplifiers, DSPs, capacitors, batteries, fuses and holders, distribution blocks, cable, interconnects, terminals and wiring kits, plus shortcuts to each driver type. Each part shows its values, its sources (URL, date read, source tier), known AUD prices with supplier, date and link (local price data only), and any **CHECK** note on how the values were read. **Add to project** makes it an item of the open project; **Save to My items** keeps it on its own. Values on an item can be changed; an empty field uses the part's value.

### System: linking, cable calculator, wiring diagram, missing-part check

The **System** tab shows every item of the open project in groups: Power (battery, alternator, fuses and holders, distribution blocks, cable, capacitors, ground points), Amplifiers, Signal (head unit, DSP) and Speakers.
- **Connect…** links two items with what the link carries: power, ground, signal, speaker or remote turn-on, with port names and the cable item that makes the connection.
- **Wire it for me…** proposes the usual chain for what the project holds: battery, main fuse at the battery, main run, a distribution block when more than one item draws power, the capacitor next to the amplifier, grounds to a chassis point, head unit to DSP to amplifiers (signal and remote), amplifiers to speakers. Nothing changes until you tick what you want and press **Apply**. A missing fuse is not invented: the check asks for it so you choose the real one.
- **Cable calculator**: for every power run, the current at full output and on music, the fuse (yours, or the next stocked rating), the recommended copper and CCA AWG sizes and the ISO metric size, the voltage drop (including the run before it), the power lost in the wire, and the maker's own wire size next to the calculated one. Options: supply voltage, drop limit (3 % by default), conductor temperature, material, engine space, insulation rating, bundling, fuse ceiling. **Use this size** writes the size on the cable item; **Real products that fit** lists cable from the database by its real copper area (for example Australian "6 mm" auto cable is 4.59 mm², not 6), cheapest per metre first. Also: speaker cable by the 5 % rule (loss, power lost, damping factor per size), capacitors (energy, hold-up illustration, precharge resistor timing, inrush), alternator spare capacity and the big 3 upgrade wires. A **quick calculator** (one amplifier, one power cable) is on the System tab and under Build a single item.
- **Wiring diagram**: drawn on every save of a project and shown on the System tab: battery and alternator on the left, the power chain by distance from the battery, amplifiers, then speakers; head unit and DSP along the top, grounds along the bottom. Each link kind has its own colour and line style (readable in black and white). Cable sizes and lengths, fuse ratings, loads in ohms and port names are written on the lines; unlinked items are in a "Not connected" box. Zoom, click an item to edit it, **Download SVG**, **Print**. Saved as `data/projects/<project>/exports/system.svg` whenever it changes.
- **Missing-part check**: on save, the project is checked for missing or critical parts (no battery, an amplifier with no power wire, no fuse at the battery, a fuse too far from the battery, no ground, no speakers, no signal or turn-on, a speaker with no amplifier, a DSP with no source, a load below the amplifier's minimum, a branch wire thinner than the fuse upstream, wires too thin or with too much drop, a capacitor off the amplifier's wire or without a precharge resistor, parts not connected, an alternator too small for the music draw). Each problem has one button such as **Add a main fuse at the battery?**, which adds the part and links it where it belongs. Critical problems are listed first. When nothing is missing, no panel is shown at all.

### BOM (bill of materials)

The **BOM** tab lists everything the project needs, grouped: speakers and drivers; enclosures and materials; amplifiers; DSP and head unit; power; cable; connectors and terminals; other. It works for a whole project or a single item.
- Derived quantities, each line saying how it was worked out: cable metres per use, gauge and material plus a spare % (default 10 %); ring lugs and ferrules per wire end by what the wire lands on; fuses per fuse holder and per used output of a fused distribution block; firewall grommets; RCA lead pairs per signal link; MDF or plywood sheets as on the Boards tab; glue, sealant, screws (1 per 150 mm of joint), driver screws, terminal cups, fill, round port tubes and carpet.
- Prices: the lowest AUD price known, with supplier, date and link; totals say how many lines are priced. A plain battery counts as the car's own (quantity 0).
- Your own quantity or price on any line, and the spare %, are saved with the project.
- **Missing / to decide**: the missing-part check's problems and anything that could not be counted, kept out of the totals.
- **Download spreadsheet (.xlsx)** with sheets BOM, Parts, Cables, Items, Diagram and Info. On the BOM sheet the line totals, subtotals and grand total are formulas, and each part line's price, supplier, date and link are read from the Parts sheet, so changing a price on the Parts sheet updates the BOM. **Download CSV** gives the BOM sheet's values. Both are also saved as `data/projects/<project>/exports/bom.xlsx` and `bom.csv`. The `.xlsx` is written by the app itself, with no spreadsheet library.

### Projects, items and My items

- A **project** holds many **items**: subwoofer boxes, door speakers, an infinite baffle, home speaker boxes, amplifiers, DSPs, capacitors, fuses, distribution blocks, cable, connectors and more, with typed links between them (power, ground, signal, speaker, remote).
- The **Project** tab lists the items: open, rename, duplicate, save a copy to My items, remove, add new ones or ones from My items, and link them.
- **Build a single item** works on one item on its own. **Save to My items** keeps it (`data/items/`); **Add to a project** puts a copy into any project later.
- Projects open, rename, duplicate and delete from the start menu. Delete never really deletes: the file moves to a deleted-files folder. Projects save automatically; the previous version of each file is kept as `.prev`.
- **Open here at start** marks the project, section and tab that **Continue where I left off** opens.
- Projects made by earlier versions open unchanged and keep their file format until they get a second item; the first save in the new format keeps a backup of the old file. Format: `docs/project_model_v2.md`.

### Help

The **Help** tab covers all of the above in more detail: start-up and menu, sections, projects and items, how to fix an existing box, the REW guide, free-form shapes, Best size, Keep the volume and locks, several subwoofers, passive radiators, transmission lines, bandpass and isobaric, flared ports, long ports, the 3D view, what the numbers rest on, the driver libraries and their licences, infinite baffle, door, home and computer speakers, the System tab, cable calculator, wiring diagram, missing-part check, BOM, the high-power subwoofer database and Boards.

## The maths and where it comes from

Short summary; each document named gives the formulas, sources, checks and limits.

- **Box model**: one lumped-circuit (Thiele/Small) model gives every curve, extended to several chambers for bandpass and isobaric boxes and with a passive radiator branch (Small, "Passive-Radiator Loudspeaker Systems", JAES 1974). It is checked against published alignment tables and calculator results.
- **Free-form shapes**: closed triangle meshes, volume by the divergence theorem, inside surface by moving each face inward by its thickness; flared ports with end corrections at the throat radius (Hari and Michael, Yorkville Sound, COMSOL conference paper). `docs/freeform_help.md`.
- **Best size**: inside ratio from Sepmeyer (JASA 1965) within Bolt's range (JASA 1946), as tabulated in Everest and Pohlmann, Master Handbook of Acoustics; using a room ratio for a box is a rule of thumb. `docs/autosize_help.md`.
- **Transmission line**: 1-D chain-matrix duct model with M. J. King's fibre stuffing fit and starting alignments (quarter-wave.com), validated against a quarter-wave pipe, the lumped sealed and vented boxes, and King's published example. `docs/tline_help.md`.
- **Infinite baffle, door, home and computer**: IB maths with the boot and cabin as loads, a leak treated as a port, cabin pressure, baffle step (115 / front width), reference-product presets.
- **Cable calculator**: ABYC E-11 (ampacity, 3 % drop, fuse placement and ceilings), NBS Handbook 100 copper tables, CCA resistivity, makers' current and fuse figures, Roger Russell's 5 % speaker cable rule. `docs/cable_engine.md`.
- **Wiring diagram and missing-part rules**: `docs/diagram_engine.md`. **BOM rules and spreadsheet layout**: `docs/bom.md`.
- **REW import, box fit and T/S extraction**: `docs/rew_measuring_guide.md` (every REW step checked against REW's own help pages).
- Values marked "rule of thumb" (for example 17 m/s port air speed, the passive radiator 2 times rule, BOM screw and carpet quantities) are stated as such in the app.

## Data included

Counts as of 2026-11-23.

**Driver libraries** (`data/drivers/library/`, read-only in the app):

| Library | Entries | Of these simulatable | Also listed without T/S | Brands | Licence | Source |
|---|---|---|---|---|---|---|
| driver-base | 1,635 | 1,635 | | 15 | CC BY 4.0 | https://github.com/JonathanDCohen/driver-base |
| QSpeakers | 439 | 439 | | 23 | GPL-3.0 | https://github.com/be1/qspeakers |
| BuildBass (car subwoofers; each entry cites the maker's manual) | 326 | 326 | | 7 | MIT | https://github.com/guilhermemcr1/BuildBass |
| Audio_Builder car subwoofer database (all power levels) | 1,533 | 970 | 626 | 41 | CC BY 4.0 | maker pages and documents, credited per value |
| Audio_Builder car speaker database (152 tweeters, 157 midrange, 181 midbass, 372 coaxials, 300 component sets, 7 full range) | 1,169 | 276 | 407 | 23 | CC BY 4.0 | maker pages and documents, credited per value |

That is 5,102 library entries. The earlier high-power car subwoofer database (`hp-car-subs.json`, 481 entries, CC BY 4.0) is kept on disk so older projects still find their drivers, but it has been replaced by the car subwoofer database and is not listed twice. The three open libraries keep only records with enough values to simulate; impossible records were rejected at import.

`data/drivers/` also holds a few public driver files: the Acoustic Elegance IB15AU in 4 and 8 ohm (values from the PS Sound shop page), a Dayton Audio RS225-8 and two example drivers.

**Car audio parts** (`data/parts/`, CC BY 4.0 for the compilation; the numbers are the makers' published facts, credited in each record), 1,472 records read from the makers' own pages, stores and manuals:

| Category | Records | Brands |
|---|---|---|
| Amplifiers | 605 | 13 |
| DSP | 42 | 2 |
| Capacitors | 12 | 4 |
| Batteries | 21 | 1 |
| Fuses and holders | 167 | 5 |
| Distribution | 35 | 5 |
| Cable | 300 | 5 |
| Interconnects | 94 | 2 |
| Terminals | 127 | 4 |
| Wiring kits | 69 | 2 |

Records whose values could not be read cleanly carry a CHECK note. Cable sizing constants (AWG table, resistivities, ABYC ampacity, bundling factors, fuse rules, Australian mm labels) are in `data/parts_raw/_reference/cable_constants.json`.

**Board sheets** (`data/boards/generic_sheets.json`): 42 generic MDF and plywood sizes and thicknesses commonly sold in Australia, with no prices and no suppliers.

**Prices and supplier catalogues are not included in the public repository.** Retail prices, supplier sheet catalogues and records built from retailer listings are local private data only (`data/private/`, never committed). Without them the app shows no prices: the Boards tab still finds the smallest sheet, and the BOM counts parts and sheets with blank prices that you can type in. The importers write the public bundles to `data/` and, when the private inputs exist on your machine, the full bundles to `data/private/`, which the app server then uses instead (see `scripts/lib_overlay.mjs` and `scripts/public_data/split.py`).

**How the values were sourced**: the maker first (spec sheets, manuals, product pages); only when the maker gives nothing, its authorised distributor or a named independent measurement; never forums or other databases. Values the importers worked out by a standard identity (for example Qes from Qts and Qms) are marked "calculated". Where a maker's own values contradict each other, the entry carries a CHECK note and, when they cannot be trusted, is not offered for simulation. The raw research records with per-value sources are in `data/car_subs_raw/`, `data/car_drivers_raw/`, `data/hp_subs_raw/` and `data/parts_raw/`. To correct a value, edit the raw record (value, source URL, document, page, date read) and rerun the importer (`scripts/import_hp_subs.mjs`, `scripts/import_car_subs.mjs`, `scripts/import_car_drivers.mjs`, `scripts/import_parts.mjs`, `scripts/import_driver_libraries.mjs`). Makers can ask for a record to be corrected or removed by opening a GitHub issue.

Where prices are shown (local data only), they are not live: check every price and part before buying.

## Project layout

| Path | What |
|---|---|
| `app/src/engine/` | The maths, no user interface: driver and box model, alignments, ports and port fit, diagnosis and fixes, free-form meshes and panels, bandpass/isobaric network, passive radiators, transmission line, infinite baffle, home-box rules, Best size, REW measurement maths and box fit, coil wiring, sheet nesting and board materials, cable engine, wiring diagram, missing-part check, BOM, parts normaliser |
| `app/src/io/` | File formats: WinISD `.wdr`, CSV, STL/OBJ/PLY/DXF meshes, REW text/FRD/ZMA, `.xlsx` writer, BOM export |
| `app/src/ui/` | The web pages (TypeScript, three.js 3D view, SVG plots) |
| `app/server/` | The Node.js server (port 8420): serves the app and stores drivers, projects, items, measurements, exports and settings as JSON files |
| `app/tests/` | Automated tests (vitest) |
| `data/drivers/` | Public drivers; `library/` the bundled driver libraries |
| `data/parts/`, `data/boards/` | Parts database (maker records), generic board sheet sizes |
| `data/*_raw/` | Raw research records the libraries are built from |
| `data/projects/` | Your projects (one JSON file per project, plus `<project>/measurements/` and `<project>/exports/`); created by the app, not part of the repository |
| `data/items/` | My items |
| `data/branding/` | The logo slot (`logo.svg`, `logo.png`, `logo.webp` or `logo.jpg`) |
| `data/private/` | Per-user data that is never shipped (gitignored): private drivers, settings, server log, deleted files and, if you keep them, local prices, supplier catalogues and the full bundles built from them |
| `docs/` | Method documents, the REW guide and the Windows notes |
| `scripts/` | Start / restart / stop (`.sh` for Linux and macOS, `.cmd` for Windows, `start_app.mjs` for any system), importers, research builders, headless dry runs |

## Tests and dry runs

- `cd app && npx vitest run`: 397 tests in 23 files, all passing on 2026-11-23. They cover published alignment and calculator cases, the model against closed-form maths, the importers, mesh volumes, bandpass and isobaric limits, the passive radiator and transmission line validations, REW parsing and fitting, coil wiring, sheet nesting, the cable engine's worked examples, the wiring diagram and missing-part rules, the BOM workbook (read back and every formula evaluated), project migration and the bundled libraries.
- `cd app && npx tsc --noEmit -p .`: type check.
- `scripts/ui_dryrun*.mjs`: headless-browser dry runs of each part of the app (shell, sections, drivers, parts, system, BOM, boards, plywood, transmission line, Best size, REW, free-form, ports and more). They need a test server on another port with a copy of the data (`PORT` and `AB_DATA_DIR`) and Playwright Chromium.

## Known limits and not yet done

- **Door section**: what replaces a box for door speakers is still to be decided; the mounting panel is blank.
- **Logo**: until a logo file is placed in `data/branding/`, the welcome page shows the name in text.
- **Analyse / Fix / Tweak** handles sealed and ported boxes only: passive radiator, bandpass, isobaric and transmission line designs are simulated in Design new but not analysed there.
- **Bandpass and isobaric** boxes have no cut list yet; the isobaric 3D view shows the drivers side by side, not stacked. Holes are not cut out of the free-form 3D shell (they are in the DXF).
- **Transmission line**: 1-D model (no bend effects or cross modes), King's polyester stuffing fit only, linear maximum SPL. When a driver has no published outer size, cut-out or mounting depth, they are estimated.
- **Passive radiators**: no passive radiator data is bundled yet; add them on the Drivers tab from their spec sheets.
- **Boards**: the nesting is a heuristic; slot-port walls and braces are not in the cut list; the cheapest-buy search uses one supplier; plywood grain is assumed to run along the sheet length.
- **BOM**: derived quantities are rules of thumb stated on each line; cable with no length entered is listed but not counted. The `.xlsx` has been checked by reading it back programmatically, not yet by opening it in Excel or LibreOffice.
- **Wiring diagram**: lines can cross in busy systems; bridged amplifier outputs are not modelled (name the port, for example "CH1+2 bridged").
- **REW import**: tested on synthetic sweeps; some REW menu paths in the guide are partly inferred (the guide says where).
- **Data coverage**: some brands are not yet covered because their sites could not be read from here (for example JL Audio, JBL, Sony, Hertz, Audison, Skar, Boss, Pyle, some Sundown lines). Some makers publish no T/S values; those models are listed without them.
- **Prices**: not included in the public repository; local price data (if any) is not live.
- **Saving**: a browser tab with an older copy of a project can autosave over a newer copy of the same project; avoid editing the same project in two tabs.
- **Dry runs**: a few older dry-run scripts (ports, REW, free-form, Best size) carry outdated assumptions and report failures that are not app faults.

## Licence

The app's code is free software under the **GNU General Public License, version 3 or (at your option) any later version** (GPL-3.0-or-later); the full text is in `LICENSE`. The bundled QSpeakers driver data is GPL-3.0.

Data licences: driver-base data CC BY 4.0 (credit: driver-base, https://github.com/JonathanDCohen/driver-base); QSpeakers GPL-3.0; BuildBass MIT; the Audio_Builder car subwoofer, car speaker, high-power subwoofer and car audio parts databases and the generic sheet list CC BY 4.0 for the compilation (the numbers themselves are the makers' published facts; if you reuse the data, credit the database and keep each entry's source). The credits, the BuildBass MIT notice, the data-licence statement, a trademarks / no-affiliation note and how makers can ask for a correction or removal are in **`NOTICE`**.

Reference books and third-party documents used during research are kept for local reading only and are not part of the repository.
