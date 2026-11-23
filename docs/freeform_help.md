# Free-form, fibreglass and scan boxes: how the app works it out (A1, 2026-11-21)
User help is also on the app's Help page. This file records the maths, the sources and the assumptions.

## Shapes
- Every shape becomes a closed triangle mesh of the OUTSIDE surface (app/src/engine/shapes.ts). Volume = sum over triangles of v1·(v2×v3)/6 (divergence theorem, exact for any closed polyhedron). Tested against cube, wedge, triangle prism, cylinder, sphere, irregular bipyramid, concave L-solid, frustum and a rounded box (Steiner's formula) to 0.1 % (app/tests/mesh.test.ts).
- Presets: rectangle, wedge 1 (sloped back), wedge 2 (sloped back and top), trapezoid, triangle/corner prism, cylinder/tube. Rounded edges: Minkowski rounding (shrink by r, hull of spheres around the corners), so every edge and corner is rounded.
- Side profile × width: corners of the side view (depth back from the front, height), straight or arc segments ("arc" = how far the segment bows out); optional second profile at the right side for a taper (lofted). Profile corners can be rounded.
- Corner points: convex hull by default; faces typed by corner numbers for dented shapes.
- Scan import: .stl (ASCII and binary), .obj, .ply (ASCII and binary). Steps: units, up axis (Z-up for most scanners), simplify over 40,000 triangles (grid clustering; the triangle counts are reported), scale check against one tape-measured size, place on the floor, crop box, close holes (flat fans), orient. Phone LiDAR scale can be off (two SAE papers, research_d §3), so the scale check matters.

## Inside volume, net volume, checks
- Inside (air) mesh = every face plane moved inward by its panel or shell thickness (exact for flat-faced solids; least squares on smooth scans). A per-panel thickness (double baffle) is supported.
- Net = inside volume minus driver displacement, port (outer tube volume, flares included), MDF ring (part thicker than the shell), braces, inserts, other. This net volume feeds the same lumped model as the rectangular box, in Design and in Analyse/Fix (all fix options).
- Standing waves: longest straight line that stays inside the shape (c/2L). Large meshes are sampled (marked "sampled").
- Driver/port holes on any panel; checks: hole fits on the panel, driver mounting depth, port fits straight with one port diameter (slot: its height) clear at its inner end (rule of thumb, UNVERIFIED), port overlapping the driver.
- Panel resonance only for flat wood panels, MDF values, over the rectangle around each panel (a low estimate; material data unverified, as before).

## Wood panels and blade angles
- Panels = coplanar faces of the outside mesh. Outline = the outside face. Joint angle = angle between the two panels inside the box; mitre blade tilt = (180° − angle)/2 from square (90° joint → 45°, 135° → 22.5°). Over 45° is flagged (beyond most table saws). Checked in app/tests/freeform.test.ts (wedge: 63.43° joint → 58.28° tilt).
- Cut sheet SVG and DXF (AutoCAD R12, mm, layers CUT / HOLES / BEVEL / TEXT).

## Fibreglass
- Shell thickness, MDF ring (outside diameter, thickness), inside volume after the shell, mould export (outside surface .stl).
- Material estimate from the outside area. ASSUMPTIONS, editable in the app, not from a datasheet: 450 g/m² chopped strand mat, about 1 mm laminate per layer, about 2.3 kg polyester resin per kg of mat, 15 % overlap and waste. Results are estimates for buying materials.

## Ports, bandpass, isobaric
- Flared (aeroport-style) round ports: air mass ρ·∫dx/S(x) along the port (quarter-circle flares), end corrections (k = 1.463, research_c §3) taken at the THROAT radius, because mouth-radius end corrections overestimate the air mass of flared ports: M. Hari and T. Michael (Yorkville Sound), "Exploring Asymmetric Vent Designs in Loudspeaker Systems: A Combined COMSOL and Experimental Approach", COMSOL conference paper, p. 3, https://comsol.fr/paper/download/1443022/exploring-asymmetric-vent-designs-in-loudspeaker-systems_a-combined-comsol-and-experimental-approach.pdf (local copy references/raw/flared_port/), citing A. Salvatti, A. Devantier, D. J. Button, "Maximizing performance from loudspeaker ports", JAES 50(1/2), 2002 (not read: paywalled). No measured flared-port test case was available, so the tests check the limits (no flare = straight formula), the integral, and that a flare lowers the air mass.
- Multi-chamber network (app/src/engine/network.ts): chambers, ports between chambers or to the outside, drivers between two nodes, parallel or series coils; solved per frequency. Tests: equals the single-box model for sealed and vented boxes (0.01 dB), 4th-order bandpass −3 dB points within 6 % of the cookbook (research_c T7), total slopes (4th order 12+12, 6th order 36 dB/oct), isobaric pair in half the volume = one driver in the full volume (same SPL at the same voltage, half the impedance, series wiring −6 dB).
- 3-chamber bandpass: no standard published definition was found (search 2026-11-21). The app's definition: rear chamber behind the driver (sealed, or ported to the outside for "dual reflex"), front chamber ported into a third chamber, third chamber ported to the outside.
- Reference books in references/ (Dickason, Beranek, etc.) could not be read (SELinux label, `??????????`), so no page of them is cited.

## Known limits
- Holes are not cut out of the 3D shell mesh (they are in the DXF and drawn as drivers/ports); the isobaric 3D view shows the drivers side by side on the front, not stacked.
- Bandpass designs are simulated and exported in 3D as rectangular boxes with inner walls; the Analyse/Fix tab still handles sealed and ported boxes only.
- Scan meshes that stay open after hole closing give approximate volumes (a warning is shown).
