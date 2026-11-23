# Builds data/hp_subs_raw/world/eton.json from ETON's FORCE SPL woofer manual (BedAnltg_ForceWoofer_SPL_Serie_20110210_04.pdf,
# hosted by rgsound.it), page 6 technical-data table, read 2026-11-22.
import os, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
U = "https://www.rgsound.it/prodotti/atch/n_20170210173917_BedAnltg_ForceWoofer_SPL_Serie_20110210_04.pdf"
SRC = [{"fields": ["*"], "url": U, "doc": "ETON BedAnltg_ForceWoofer_SPL_Serie_20110210_04.pdf (owner's manual, FORCE F 10/12/15/18)", "page": 6, "read_date": "2026-11-22", "tier": 1}]
PARSE = ("The PDF's technical-data table has no separators between numbers; values were split in the table's column order "
         "(Zn, Re, fr, Cms, Qms, Qes, Qts, Rms, Mmd, Xmax, Sd, coil diameter, former, coil length, layers, Le, Bl, gap, magnet, mass, SPL, rated power, Vas) "
         "and checked: Qts = Qes x Qms / (Qes + Qms) and Vas from Cms and Sd both agree (calculated). Rms and moving mass could not be split with certainty and are left empty. ")
COM = "Manual: impedance 2 x 1 ohm; box simulations are 'Simulation 2 Ohm (coils in series)', so the T/S are taken as coils in series. Rated power ('Nennbelastbarkeit') 2000 W. Xmax 14 mm ('maximale lineare Auslenkung'). Voice coil 72 mm, aluminium former, 8 layers, winding 54 mm. Manual dated 2011; current status UNVERIFIED."
def e(model, size, fs, cms, qms, qes, qts, sd, le, bl, mass, spl, vas, co, md, extra=""):
    return driver(model=model, size_in=size, coil="DVC", ohms_per_coil=1, coils=2, rms_w=2000, ts_basis="series",
                  fs_hz=fs, re_ohm=1.4, qms=qms, qes=qes, qts=qts, vas_l=vas, sd_cm2=sd, xmax_mm=14, le_mh=le, bl_tm=bl, spl_db_1w1m=spl,
                  mounting_depth_mm=md, cutout_mm=co, status="unknown", sources=SRC,
                  notes=PARSE + COM + f" Cms {cms}. Speaker mass {mass} kg." + extra)
D = [
 e("FORCE F 10", 10, 80, "0,02 mm/N", 11.53, 0.69, 0.65, 336.0, 1.88, 16.93, 21.8, 84.4, 2.39, 235, 167, " Re printed 1,5 ohm for this model (re_ohm set to 1.5 below)."),
 e("FORCE F 12", 12, 37.5, "69,82 (micrometre/N by the Vas check)", 4.68, 0.416, 0.379, 530.9, 2.52, 14.30, 21.9, 87.4, 27.945, 287, 208),
 e("FORCE F 15", 15, 36, "62,067 (micrometre/N by the Vas check)", 4.709, 0.554, 0.496, 804.2, 2.255, 13.39, 22.7, 89.2, 57.525, 359, 231),
 e("FORCE F 18", 18, 34.4, "50,541 (micrometre/N by the Vas check)", 3.367, 0.584, 0.498, 1225.4, 2.377, 15.33, 25, 90.6, 107.77, 430, 265),
]
D[0]["params"]["re_ohm"] = 1.5
save("eton", "ETON", "Germany", "https://www.eton-audio.de/ (UNVERIFIED URL; eton.de redirects to a merchandising site)",
     "Maker manual read from rgsound.it (Italian reseller/distributor, status UNVERIFIED); one PDF, read 2026-11-22. Numbers only. EU maker: per-model facts from the maker's own manual, cited.", D,
     extra={"excluded_notes": "A Czech retailer lists the FORCE F 15 R at 3000 W RMS; the maker manual found gives 2000 W rated power for the FORCE F series and was used. The 'R' versions' own sheets were not found."})
