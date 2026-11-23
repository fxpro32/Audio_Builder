#!/usr/bin/env python3
"""R3: reference constants + tables for the cable calculator (R41). Writes data/parts_raw/_reference/cable_constants.json and prints markdown tables.
Every constant carries its source; see references/research_i_car_electronics.md section B."""
import math, json
OUT = "/workspace/data/parts_raw/_reference/cable_constants.json"
RHO = {"copper": {"rho20_ohm_mm2_per_m": 0.017241, "alpha_per_C": 0.00393, "source": "IACS annealed copper 100 % = 1/58 ohm mm2/m at 20 C (NBS Handbook 100 Copper Wire Tables, https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf); ASTM B566 note repeats the IACS basis"},
       "cca_10pct": {"rho20_ohm_mm2_per_m": 0.02743, "alpha_per_C": 0.0040, "source": "10 % copper-clad aluminium, max DC resistivity 0.02743 ohm mm2/m at 20 C (= 62.9 % IACS min; ASTM B566 class 10A per MWS Wire https://mwswire.com/wp-content/uploads/2024/03/MWS-copper-clad-aluminum-other-clad-metals.pdf and Ulbrich https://www.ulbrich.com/uploads/data-sheets/Ulbrich-Lite-Weight-Copper-Clad-Aluminum-Data-Sheet.pdf, 2.74e-8 ohm m, 62.85 %). Kanthal lists 0.026 (65 %). alpha 0.0040 = aluminium-dominated conductor, rounded from aluminium 0.00403 (assumption, stated)"},
       "aluminium_ec": {"rho20_ohm_mm2_per_m": 0.028264, "alpha_per_C": 0.00403, "source": "EC aluminium 61.0 % IACS (1/(58*0.61))"}}
ABYC_IV_105 = {"18": (20, 17.0), "16": (25, 21.3), "14": (35, 29.8), "12": (45, 38.3), "10": (60, 51.0), "8": (80, 68.0), "6": (120, 102), "4": (160, 136), "2": (210, 178), "1": (245, 208), "1/0": (285, 242), "2/0": (330, 280), "3/0": (385, 327), "4/0": (445, 378)}
ABYC_IV_90 = {"18": (20, 16.4), "16": (25, 20.5), "14": (30, 24.6), "12": (40, 32.8), "10": (55, 45.1), "8": (70, 57.4), "6": (100, 82.0), "4": (135, 110), "2": (180, 147), "1": (210, 172), "1/0": (245, 200), "2/0": (285, 233), "3/0": (330, 270), "4/0": (385, 315)}
ABYC_XII_CM = {"18": (1620, 1537), "16": (2580, 2336), "14": (4110, 3702), "12": (6530, 5833), "10": (10380, 9343), "8": (16510, 14810), "6": (26240, 24538), "4": (41740, 37360), "2": (66360, 62450), "1": (83690, 77790), "1/0": (105600, 98980), "2/0": (133100, 125100), "3/0": (167800, 158600), "4/0": (211600, 205500)}
ORDER = ["18", "16", "14", "12", "10", "8", "6", "5", "4", "3", "2", "1", "1/0", "2/0", "3/0", "4/0"]
CM_TO_MM2 = math.pi / 4 * 0.0254 ** 2  # 1 circular mil = 5.067e-4 mm2
def awg_n(g): return {"1/0": 0, "2/0": -1, "3/0": -2, "4/0": -3}.get(g, None) if "/" in g else int(g)
def awg_d_mm(g): return 0.127 * 92 ** ((36 - awg_n(g)) / 39)
def awg_mm2(g): return math.pi / 4 * awg_d_mm(g) ** 2
def r_per_m(area_mm2, mat="copper", T=20.0):
    c = RHO[mat]; return c["rho20_ohm_mm2_per_m"] * (1 + c["alpha_per_C"] * (T - 20)) / area_mm2
awg_rows = []
for g in ORDER:
    a = awg_mm2(g); cm = ABYC_XII_CM.get(g)
    awg_rows.append({"awg": g, "d_mm": round(awg_d_mm(g), 3), "area_mm2": round(a, 2), "cmil": round(awg_d_mm(g) ** 2 / 0.0254 ** 2),
                     "abyc_min_cm_awg": cm[0] if cm else None, "abyc_min_cm_sae": cm[1] if cm else None, "sae_min_area_mm2": round(cm[1] * CM_TO_MM2, 2) if cm else None,
                     "r_mohm_per_m_cu_20C": round(1000 * r_per_m(a), 3), "r_mohm_per_m_cu_60C": round(1000 * r_per_m(a, T=60), 3), "r_mohm_per_m_cca_20C": round(1000 * r_per_m(a, "cca_10pct"), 3),
                     "abyc_105C_outside_engine_a": ABYC_IV_105.get(g, (None,))[0], "abyc_105C_inside_engine_a": ABYC_IV_105.get(g, (None, None))[1],
                     "abyc_90C_outside_engine_a": ABYC_IV_90.get(g, (None,))[0]})
ISO_MM2 = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120]
ISO_10133_105 = {0.75: 16, 1.0: 20, 1.5: 25, 2.5: 35, 4.0: 45, 6.0: 60, 10.0: 90, 16.0: 130, 25.0: 170, 35.0: 210, 50.0: 270, 70.0: 330, 95.0: 390, 120.0: 450}
AU_AUTO_MM = {"3mm": 1.13, "4mm": 1.84, "5mm": 2.9, "6mm": 4.59}
const = {
 "schema": "cable_constants/1", "agent": "R3_ELECTRONICS", "read_date": "2026-11-23",
 "conductors": RHO,
 "awg_formula": "d_mm = 0.127 * 92**((36 - n)/39), n = 0, -1, -2, -3 for 1/0..4/0 (ASTM B258); area = pi/4 d^2",
 "awg_table": awg_rows,
 "abyc": {"doc": "ABYC E-11 (2003), public copy incorporated by reference in US law: https://law.resource.org/pub/us/cfr/ibr/inc/ansi/abyc.e-11.2003.pdf",
          "table_iv_note": "Allowable amperage for systems under 50 V; ambient 30 C outside, 50 C inside machinery spaces (E-11.5.1.1); no more than two conductors bundled (AP Table 2 note)",
          "bundling_factors_from_table_vii": {"3": 0.70, "4-6": 0.60, "7-24": 0.50, "note": "ratio of Table VII-B..D to VII-A (AC conductor tables), applied by ABYC when bundled > 24 in (610 mm)"},
          "voltage_drop": {"critical_pct": 3, "non_critical_pct": 10, "formula": "CM = 10.75 * I * L_ft / E (L = round-trip length in feet, E = allowed drop in volts)", "clause": "E-11.16.1.2.7 to 11.16.1.2.9"},
          "fuse_location": {"within_mm": 175, "sheathed_from_battery_max_mm": 1830, "sheathed_other_source_max_mm": 1020, "clause": "E-11.12.1.2 and exceptions"},
          "fuse_rating": "not above 150 % of the conductor ampacity (E-11.12.1.4, 11.12.1.5.2); next larger standard rating allowed when none equals 100 % (AC clause 11.12.2.2)"},
 "iso_10133_105C_a": {str(k): v for k, v in ISO_10133_105.items()}, "iso_note": "ABYC E-11 AP Table 2 quoting ISO/FDIS 10133 (1999), 105 C insulation",
 "au_auto_cable_mm_label_to_mm2": AU_AUTO_MM, "au_note": "Australian 'mm' auto-cable sizes are overall size labels, not conductor area; areas from https://www.solar4rvs.com.au/buying/buyer-guides/cable-size-conversion-tables-mm-mm2-b_s-awg (retailer table; Narva listings show 1.13 and 1.85 mm2 for 3 and 4 mm). B&S = AWG.",
 "speaker_wire_rule": {"max_wire_fraction_of_impedance": 0.05, "source": "Roger Russell, McIntosh speaker manuals wire table, http://www.roger-russell.com/wire/wire.htm (two-conductor round trip, wire R <= 5 % of rated impedance; up to 10 % may be inaudible)"},
 "amp_efficiency_defaults": {"eta_design_for_current_sizing": {"D": 0.50, "BD": 0.50, "AD": 0.50, "AB": 0.45}, "supply_voltage_v": 13.8,
     "basis": "I = P_rated_total / (eta_design x 13.8 V); eta_design derived from maker current data (Rockford P_rated / (13.8 V x I_max_sine): A/B 0.45-0.54, BD 0.52-0.67, D 0.56-0.81); same values as scripts/parts/cable_calc.py ETA_DESIGN; see research_i section B3",
     "typical_datasheet_efficiency_not_used_for_current_sizing": {"class_D": 0.80, "class_AB": 0.50, "class_BD_rockford_claim": "75-80 % (Rockford Fosgate Class-BD technology note)",
        "note": "maker efficiency at one operating point; higher than the maker's own current figures imply, so NOT used to size cable or fuses"},
     "source": "research_i section B3; maker figures in data/parts_raw/amplifiers/rockford-fosgate.json and data/parts_raw/_reference/current_vs_power.json"},
}
json.dump(const, open(OUT, "w"), indent=1); print("wrote", OUT)
print("| AWG | d mm | area mm2 | SAE min mm2 | Cu mOhm/m 20C | Cu mOhm/m 60C | CCA mOhm/m 20C | ABYC 105C out A | ABYC 105C engine A |")
print("|---|---|---|---|---|---|---|---|---|")
for r in awg_rows: print(f"| {r['awg']} | {r['d_mm']} | {r['area_mm2']} | {r['sae_min_area_mm2'] or ''} | {r['r_mohm_per_m_cu_20C']} | {r['r_mohm_per_m_cu_60C']} | {r['r_mohm_per_m_cca_20C']} | {r['abyc_105C_outside_engine_a'] or ''} | {r['abyc_105C_inside_engine_a'] or ''} |")
