# Measuring a subwoofer with REW and importing it into Audio Builder

Written 2026-11-22 (A5_REW). Room EQ Wizard (REW) is free measurement software (Windows, macOS, Linux): https://www.roomeqwizard.com/
Every REW step below was checked against REW's own help pages (copies saved in `references/raw/rew_help/`, fetched 2026-11-22):

- Impedance measurement: https://www.roomeqwizard.com/help/help_en-GB/html/impedancemeasurement.html
- Thiele-Small parameters: https://www.roomeqwizard.com/help/help_en-GB/html/thielesmall.html
- File menu (exports): https://www.roomeqwizard.com/help/help_en-GB/html/file.html
- Importing measurement data (file formats): https://www.roomeqwizard.com/help/help_en-GB/html/dataimport.html
- Making measurements (levels, headroom): https://www.roomeqwizard.com/help/help_en-GB/html/makingmeasurements.html
- Measurement level: https://www.roomeqwizard.com/help/help_en-GB/html/measurementlevel.html

The app section is the "Measurements (REW)" panel under the results on the Analyse / Fix / Tweak tab (and on the Design tab), and the "Measure this driver's T/S values" panel on the Drivers tab (open a saved driver).

## Safety first

1. Drive the jig from the sound card's **headphone or line output**, not from the car amplifier. REW's impedance page says a power amplifier is possible but "great care must be taken as the levels a power amplifier can generate can easily damage soundcard inputs"; it then needs a resistive divider of about 20 dB and back-to-back zener diodes on the inputs. Keep the amplifier out of the jig unless you build that protection.
2. Keep the level low: REW recommends a loudspeaker terminal voltage of about 100 to 200 mV at most. With a 100 Ω sense resistor and an 8 Ω load that is about 1.35 V at the output for 100 mV at the terminals (REW impedance page).
3. Never let the inputs clip: watch REW's level meters and the headroom figure (red = less than 6 dB headroom, REW "Making Measurements" page). Do not exceed your sound card's input limits.
4. For acoustic measurements (car, near field) start quietly: REW's measurement-level page warns that high test levels can damage speakers and ears.

## 1. The impedance jig (sense resistor method)

What you need: a sound card or USB interface with **two line inputs** (left and right) and an output, a **100 Ω non-inductive resistor** (metal film; REW suggests 100 Ω with a headphone output, about 1 kΩ with a weak line output, 47 Ω or less if the output can drive it), test leads with clips, a multimeter.

Wiring (REW impedance page):

- Output (left or both channels) → one end of the sense resistor. This point also goes to the **reference input** (left input in REW's diagram).
- Other end of the sense resistor → speaker terminal +. This point goes to the **measurement input** (right input in REW's diagram). The voltage here is the voltage across the speaker.
- Speaker terminal − → ground (output ground and both input grounds).
- The measurement input must be the input chosen in REW's soundcard settings. If the left and right are swapped, the curve comes out about one sense-resistor value too high and the phase shifts by about 180°: test with a plain resistor first.
- Measure the exact value of the sense resistor with a good meter and type it into REW: any error goes straight into the results.

Set the two input gains equal: leads open at the speaker end, play a 1 kHz sine at the test level with REW's signal generator, adjust the gains until the two level meters agree within 1 dB without clipping.

## 2. Calibrate the jig (REW impedance page)

Press Measure (Ctrl+M), choose **Impedance**, then:

1. **Open circuit cal** (at least this one): leads connected to the jig but open at the speaker end.
2. **Short circuit cal**: leads shorted together at the speaker end (removes the lead resistance).
3. **Reference cal**: a known non-inductive resistor (100 Ω or lower) on the leads; enter its exact value.

Repeat the calibration if you change the leads or the sample rate.

## 3. Sweep settings (REW impedance and T/S pages)

- Start frequency 5 Hz (subwoofer resonances in a ported box can be below 20 Hz; REW sweeps from half the start frequency). End frequency: 20 kHz for driver T/S sweeps (REW: "measure up to 20 kHz"), 500 Hz or more is enough for the box sweeps.
- Length: 10 seconds or more (for example 512k samples at 48 kHz). Sweeps: 2 to 4 (averaging improves the signal-to-noise ratio). Noise filter: High.
- Level: about 100 to 200 mV at the speaker terminals (see Safety). Use **Check Levels** before **Start**.
- Quiet room, no wind, car engine off. A speaker is also a microphone: noise and vibration show up in the curve.

## 4. Measure the sub in free air (driver T/S)

- Driver out of the box, held rigidly, no baffle, **cone firing horizontally** (driver standing vertical), away from walls (REW T/S page).
- Play it for a while at a medium level first (REW: pre-conditioning stabilises the suspension).
- Dual voice coil (the Pioneer TS-W3003D4 has two 4 Ω coils): choose a wiring and **note it**. Series, parallel, or one coil with the other coil left **open** (not shorted: a shorted coil adds damping). The app asks for it.
- Measure the DC resistance Re with a meter on the same wiring, and subtract the reading with the meter leads shorted. REW's T/S page notes low resistances are hard to measure; the app accepts an empty field and then estimates Re from the curve (marked "estimated").
- Name the measurement (for example "free air, coils series") and export it (step 7).

## 5. Vas: second sweep (choose one)

**Added mass** (REW T/S page): add about half the expected moving mass (the Pioneer's published Mms is 257 g, so about 120-130 g), split into 4 equal pieces placed evenly round the cone near the voice coil, firmly stuck on (Blu-tack, a nut in the Blu-tack for more mass). Not near the outer edge. Weigh the mass on an accurate scale: the result depends on it directly. Sweep again with the same settings and export.

**Known sealed box**: mount the driver in an airtight test box whose net volume (inside volume minus the driver's displacement) is a little less than the expected Vas (REW T/S page; for the Pioneer's published 34.6 L, about 25-30 L). Sweep and export.

In the app: Drivers tab → open the driver → "Measure this driver's T/S values" → pick the free-air file, the method, the second file, the mass (g) or box volume (L), Re (meter), Sd (cone area: cone plus 1/3 to 1/2 of the surround), the coil wiring during the sweeps and the wiring to save. **Work out T/S** shows each value next to the sheet value and how it was worked out. **Save as new private driver** creates "<model> (measured <date>)"; the original entry is never changed.

Formulas (what the app does):

- Small's impedance method: r0 = Zmax/Re; f1, f2 where |Z| = sqrt(r0)·Re; fs = sqrt(f1·f2); Qms = fs·sqrt(r0)/(f2 − f1); Qes = Qms/(r0 − 1); Qts = Qms·Qes/(Qms + Qes). Read in Rod Elliott's "Measuring Thiele/Small loudspeaker parameters", https://sound-au.com/tsp.htm (which cites R. H. Small, JAES 1972; Small's paper itself was not read).
- When the file has phase (REW text exports do), the app uses the real part of Z instead, at half height of its peak: Qms = fs/(f2 − f1). With a plain-inductance coil model this is exact, so the coil inductance no longer skews the result (derived for this app; the algebra is in `app/src/engine/measure.ts`).
- Added mass m: Mms = m/((fs/fs')² − 1), Cms = 1/((2π·fs)²·Mms), Vas = ρc²·Sd²·Cms (same ESP page).
- Known box Vb: Vas = Vb·((fc·Qec)/(fs·Qes) − 1) (R. H. Small, "Closed-Box Loudspeaker Systems Part I", JAES 1972, as commonly quoted; UNVERIFIED against the paper); the simpler Vb·((fc/fs)² − 1) (ESP page) is shown too.
- Bl = sqrt(2π·fs·Mms·Re/Qes), Rms = 2π·fs·Mms/Qms (research_c §1).
- Dual coils (two identical coils assumed): series = Re×2 and Bl×2 of one coil; parallel = Re/2, Bl of one coil; Qes is the same in series and parallel and half the one-coil Qes; fs, Qms, Vas, Mms do not change. Le: series about 4× parallel is ASSUMED (tightly coupled coils), not verified.

## 6. Measure the sub in its box (find the real box)

- Driver mounted in its box, port open, box on the floor (or in the car), same jig and settings as above. Note the coil wiring.
- A ported box shows **two peaks with a dip between them**: the dip is about the port tuning fb. A sealed box (or a blocked port) shows **one peak** at fc.
- In the app (Analyse / Fix / Tweak tab): Measurements (REW) → set "What was measured" = "Driver in its box (impedance)", the coil wiring, then pick the file. The curve appears dotted on the impedance plot.
- "Match the model to the real box": pick the sweep, say which wiring the driver's T/S values describe (the Pioneer entry is for the two coils in series), press **Fit the box to this sweep**. The app reads the peaks, then adjusts net volume, tuning and box losses (leakage QL, port QP, optionally absorption QA, and a small Re offset for coil temperature and leads) until the model's impedance matches; the match is shown as an rms error.
- A poor match (over about 10 %) means the driver's published T/S values are probably wrong: measure the driver in free air (step 4) and use the measured copy.
- **Use the fitted box for the analysis…** asks first and shows old and new values; the diagnosis and fix options are then worked out on the fitted box. **Undo last change** and **Stop using the fitted box** put it back.

## 7. Export from REW

REW's File menu → Export → **Export measurement as text** (the help page lists "Export measurement as text" in the File menu; REW groups the export items in an Export submenu). In the dialog: use the range of the measurement (or 5 Hz to 20 kHz), keep the default dot decimal format, any delimiter. For impedance keep smoothing off or light (1/48 octave); for SPL use some smoothing (REW warns if it is too little for a log-spaced export). The file starts with comment lines beginning with `*`, then frequency, value and phase per line (REW help, file.html). The app also reads `.frd` (frequency, dB, phase) and `.zma` (frequency, ohms, phase), comma, tab, space or semicolon separated, and a decimal comma.

Do not import REW's `.mdat` files: they are binary (the app says so).

## 8. Frequency response: in the car, near field

- **In the car at the seat**: mic at your head position, doors closed, engine off. REW's SPL is only absolute if you calibrated it (REW "Calibrating the SPL reading"); otherwise use the app's **Level** offset or **Align** button (matches the model between 40 and 100 Hz). Import with "Box in the car, mic at the seat"; it is drawn on both loudness plots, best compared with the in-car (cabin gain) plot.
- **Near field, cone**: mic very close to the centre of the dust cap (a few mm), low level. **Near field, port**: mic in the centre of the port mouth. Import each with its own "What was measured". The near-field method is from D. B. Keele, "Low-Frequency Loudspeaker Assessment by Nearfield Sound-Pressure Measurement", JAES 22(3), 1974 (paper not read). To compare the port with the cone, the port curve is usually lowered by 20·log10(port diameter / cone diameter) dB before adding (secondary sources only, for example https://www.diyaudio.com/community/goto/post?id=2921305; UNVERIFIED); the app does not add them, use the Level offset.

## 9. What the app stores

Each import is saved in `data/projects/<project>/measurements/<id>.json` with: kind (impedance or response), what was measured, date, notes, mic/jig notes, coil wiring, number of drivers on the jig (and series/parallel), the file name and REW header lines, and the data (frequency, value, phase). Deleting one moves it to `data/private/deleted/`.
