# Transmission line (quarter-wave) builder: method, formulas, sources, checks, limits
A15_TLINE, 2026-11-23, requirement R36. Code: `app/src/engine/tline.ts` (line model), `app/src/engine/tlfold.ts` (folded box and starting design), `app/src/ui/tlui.ts` (Design new page), tests `app/tests/tline.test.ts`. Research notes and rejected options: `references/research_g_transmission_line.md`.

## 1. The line model (engine/tline.ts)
The line runs from a closed end to an open end (the terminus). It is cut into short uniform duct elements (at most 20 mm long; a tapered stretch becomes a staircase with each element's area taken at its middle, so the volume is kept). Each element is a 1-D plane-wave duct with a lossy medium:

- series impedance per metre: z = (jωρ + λ) / S
- shunt admittance per metre: y = jωS / (ρ c_e²)
- γ = √(z·y), Zc = z / γ
- chain (ABCD) matrix of an element of length l: [p1; U1] = [[cosh γl, Zc sinh γl], [sinh γl / Zc, cosh γl]] · [p2; U2]

p = pressure, U = volume velocity along the line, S = area, ρ = air density, λ = viscous damping coefficient of the stuffing (N·s/m⁴), c_e = speed of sound in the stuffed line. With λ = 0 and c_e = c this is the textbook lossless duct (Kinsler and Frey, Fundamentals of Acoustics, ch. 10). The element approach and the damped wave equation ρ ∂²ξ/∂t² = −∂p/∂x − λ ∂ξ/∂t are M. J. King's: "Section 3.0: A Mathematical Model for an Expanding Fiber Damped Transmission Line" and "Section 4.0: The Calculation Algorithm", 2002, http://www.quarter-wave.com/TLs/TL_Theory.html (local copies `references/raw/tline/mjk/Method_Derivation.pdf`, `Calculation_Algorithm.pdf`).

Stuffing (polyester fibre, Dacron Hollofil II), King, "Section 5.0: Derivation and Correlation of the Viscous Damping Coefficient" (revised 2003), p.1 (`references/raw/tline/mjk/Damping_Coefficient.pdf`):
- λ(f) = λ_tube + 1570·D·(f/50)^n / (1 + (f/50)^n) N·s/m⁴, with D in lb/ft³ (1 lb/ft³ = 16.0185 kg/m³), λ_tube = 10 (applied to every element, stuffed or not), n = 2 up to 0.2 lb/ft³, falling linearly to 1 at 0.4 lb/ft³, 1 above. (King writes "r_d·ω/50 Hz"; his plots label the same variable "Frequency (Hz)", so it is f in Hz.)
- c_e: 342, 335, 325, 320 m/s at 0, 0.191, 0.382, 0.573 lb/ft³, about 319 m/s up to 1 lb/ft³ (his Fig. 5.5); linear in between, flat above, scaled by c_air/342 so an empty line uses the app's air setting.
- The fibres do not move with the air (King 2026, "Are the Fibers Moving in my TL Slowing the Speed of Sound?", `references/raw/tline/mjk/TL_Moving_Fibers.pdf`).

Terminus: radiation impedance of a rigid piston of the same area in an infinite baffle (half space, consistent with the app's half-space SPL): Zrad = (ρc/S)·[1 − 2J1(2ka)/(2ka) + j·2H1(2ka)/(2ka)], a = √(S/π) (Kinsler and Frey ch. 7). J1 by its power series, Struve H1 by Aarts and Janssen, "Approximation of the Struve function H1 occurring in impedance calculations", JASA 113(5) 2635-2637, 2003, https://doi.org/10.1121/1.1564019. At low frequency its mass equals an end correction of 8a/(3π) = 0.849·a (tested). A slot terminus is treated as a circle of the same area.

Driver: at the closed end or at an offset (tapped) point x_d. The line seen from the back of the cone is the closed part (x_d back to the closed end, U = 0 there: Z = A/C of its chain) in parallel with the open part (x_d to the terminus: Z = (A·Zrad + B)/(C·Zrad + D)); King, "Section 6.0: Advanced Transmission Line Modeling Techniques", offset driver, Fig. 6.2 (`Advanced_Models.pdf`). The driver equations are the app's lumped ones (engine/model.ts): Zm = jωMms + Rms + 1/(jωCms) + Sd²·Z_line; Ze = Re + jωLe + Bl²/Zm; u = Bl·i/Zm. Back pressure p_d = −Sd·u·Z_line; flow into the open part U_o = p_d/Z_open; terminus flow U_L = U_o/(C·Zrad + D).

Outputs (per frequency): SPL at 1 m, half space, from Sd·u + U_L (complex sum, so the phase between cone and terminus is included): p = jωρ·U/(2π r); also driver only and terminus only; in the car the project's cabin gain is added (engine/filters.ts). Cone travel peak = √2·|u/(jω)|; terminus air speed peak = √2·|U_L|/S_L; impedance; group delay. Several drivers: N drivers side by side on one line = N identical lines of area S/N (linear, symmetric), SPL + 20·log10(N).

Line tuning shown: the frequency where the cone travel has its deepest dip between 12 and 150 Hz (King 2021: "the enclosure tuning frequency can be easily identified by the first deep null in the woofer's SPL response").

Maximum SPL per frequency (all box types in the comparison): from the linear result at the amp voltage V: V_x = V·Xmax/x(f), V_pe = √(Pe·Z) (rated power into the impedance the amp power is quoted for); max SPL = SPL(f) + 20·log10(min(V_x, V_pe)/V). Thermal compression and suspension non-linearity are not modelled.

## 2. Folded geometry (engine/tlfold.ts)
Upright channels side by side from front to back, full inside width, separated by dividers parallel to the baffle. Channel 1 is behind the baffle; the driver fires into it; the line is closed at the bottom of channel 1, goes up, over divider 1, down channel 2, under divider 2, and so on. The open end is a slot in the top panel at the back (odd channel count) or in the back panel at the bottom (even count). Channel depths fall linearly from channel 1 to the last by the taper ratio TR = S_L/S_0 (the width is constant, so area ratio = depth ratio): d1 = 2·(Di − (n−1)·t)/(n·(1+TR)). A fold gap is the mean of the two channel depths it joins. The model follows the centre line: channel runs (Hi − half gaps) plus the turns (d_i/2 + t + d_(i+1)/2 at the gap's area). The driver's displacement is taken out of channel 1 over the height of its cut-out (area − displacement/cut-out diameter). Net air = gross inside − dividers − driver(s).

Checks shown in red: a channel under 30 mm, fold gaps taking the whole height, the driver's cut-out or frame not fitting the baffle, channel 1 shallower than the driver's depth behind the baffle + 10 mm, the driver height outside its possible range.

Editing the outside sizes recomputes the line (depth sets the channel depths, height and channel count set the length). The A11 "keep the volume" tool does not apply: a line's tuning is set by its length (and taper), not only its volume.

## 3. Starting design (suggestTL)
King, "Classic Transmission Line Enclosure Alignments", 2021, pp. 3-6 (`references/raw/tline/mjk/TL_Alignments.pdf`):
- Vb = Vas/α and fb = h·fs from the ported alignment for the driver's Qts (the app uses QB3 under Qts 0.383, else SBB4, as in the ported designer; King used Dickason's BB4 table).
- L = SF(TR)·c/(4·fb), SF from his Table 1 (TR 0.1: 0.62, 0.2: 0.71, 0.33: 0.80, 0.5: 0.87, 1: 1.00, 2: 1.14, 3: 1.22, 5: 1.32, 10: 1.42), interpolated in log TR.
- S0 = 2·Vb/((1+TR)·L), S_L = TR·S0.
- Stuffing 0.5 lb/ft³ (8 kg/m³) over the first 3/4 of the line (King's tapered example, Fig. 10); driver offset about L/5 (an offset damps the 3/4-wave mode; King 2002 section 6: at about L/3 of a straight line the 3/4 mode is removed).
Physical layout: channel 1 must hold the magnet (depth − t + 15 mm) and the baffle the frame, so S0 may have to be larger than the alignment's; the taper is then made stronger (down to a last channel of 35 mm) to keep the volume, and the page says so. Channels: one per about 0.5 m of line; the height is solved so the folded centre line has length L.

Suitability (plain words on the page): poor if Qts > 0.5 or EBP = fs/Qes < 50 (EBP rule: research_c §1, "<50 sealed, >100 vented"), fair if Qts 0.45 to 0.5, good otherwise. The Qts band is a common TL rule of thumb, not a published table (UNVERIFIED as a citation); the reasoning given is King's finding that a TL behaves like a ported box of the same volume and tuning.

## 4. Checks (app/tests/tline.test.ts; numbers from scripts/a15_validate.ts)
(a) Straight empty pipe, 2 m × 0.01 m², driven at the closed end: quarter-wave pole of the input impedance at 41.892 Hz; c/(4·(L + 0.849a)) = 41.897 Hz (0.01 %). Element length 20 mm vs 4 mm: SPL within 0.3 dB to 300 Hz.
(b) A closed line 0.1 m × 0.2 m² (20 L) vs the lumped sealed box (no leak): SPL within 0.008 dB to 150 Hz, cone travel within 1 %. A fat short line (30 L, 0.15 m) with a narrow end (50 cm², 0.15 m) vs the lumped vented box with Leff = L + 0.849a: same tuning (51.87 Hz both); SPL within 0.25 dB at 20, 30, 40 and 80 Hz; largest difference 1.3 dB at 55 Hz just above the tuning (the line keeps King's small tube loss, the lumped box was run loss-free). The 1-D model has no inner end correction at an abrupt step, so in the lumped comparison only the outer end correction is used.
(c) King 2021, SB Acoustics Satori WO24P-4 (fs 28, Qms 6.7, Qes 0.42, Vas 71 L, Sd 255 cm², Re 3.3, Le 0.29 mH), tapered 5:1 line L 2.181 m, S0 0.0357 m², S_L 0.0071 m², tuned 28 Hz (TL_Alignments.pdf p.4-6). His driver offset is not stated.
- Unstuffed (his Fig. 7, read from the plot): impedance peaks about 14.5 Hz / 29 Ω and 48 Hz / 48 Ω, cone null about 28 Hz. This model: 13.7 Hz / 26.8 Ω and 49.7 Hz / 46.3 Ω (driver at the end), 14.2 Hz / 27.4 Ω and 51.5 Hz / 49.5 Ω (offset 0.2 L); cone dip 27.3 Hz.
- Stuffed 0.5 lb/ft³ over the first 3/4 (his Fig. 10): low peak gone (about 7 Ω flat), upper peak about 43 Hz / 16.5 Ω. This model (driver at the end): about 7.3 Ω flat below 25 Hz, upper peak 47.6 Hz / 15.7 Ω (frequency 11 % high). With a 0.2 L offset the upper peak is 49.4 Hz / 25.2 Ω, so his offset is probably small or his stuffing shifts the peak more than this implementation of his published formula does.

## 5. Limits
- 1-D plane waves only: no bend effects at the folds, no cross modes (fine below roughly c/(2·width), about 500 Hz for a 0.3 m wide line), no inner step end corrections.
- Stuffing model: King's fit for polyester fibre only; wool, foam or lining are not modelled.
- No panel flex, no leaks, no thermal compression; max SPL is a linear estimate.
- Driver outer size, cut-out and mounting depth come from the driver data, or are estimated from Sd (outer = 1.25 × piston diameter, depth = half the outer) when missing: the Pioneer TS-W3002D4 entry has no sizes, so its first channel depth rests on that estimate. Measure the driver and enter the sizes on the Drivers tab.
- The Analyse / Fix tab does not take TL boxes; the design is kept in the project's design settings, and its panels go to the Cut list and the Boards tab.
