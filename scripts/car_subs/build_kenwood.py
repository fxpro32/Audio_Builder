#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): Kenwood (JVCKENWOOD, Japan) component subwoofers from kenwood.eu. The EU sitemap (saved by R2,
references/raw/car_subs/kenwood/sm.xml) lists 5 subwoofer pages: KFC-PS2517W and KFC-PS3017W are drivers; KSC-W1200B/T (boxed) and
KSC-PSW7EQ (powered) are left out. The spec tab is loaded by script, so the two pages were read in the headless browser with the
'Specifications' tab opened (references/raw/car_subs/browser_r2b/kenwood_eu_<model>.txt). Usage: python3 -I build_kenwood.py"""
import sys, re
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
B = "/workspace/references/raw/car_subs/browser_r2b/kenwood_eu_"
drivers = []
for m, size in (("KFC-PS2517W", 10), ("KFC-PS3017W", 12)):
    t = open(B + m + ".txt", encoding="utf-8").read()
    g = lambda lab: num((re.search(re.escape(lab) + r"\t([^\n]+)", t) or [None, ""])[1])
    s = lambda lab: (re.search(re.escape(lab) + r"\t([^\n]+)", t) or [None, None])[1]
    sd = g("Piston Area (SD)")
    p = dict(re_ohm=g("DC resistance (Re)"), fs_hz=g("Resonant frequency (FSO)"), qms=g("Mechanical Q factor (QMS)"), qes=g("Electrical Q factor (QES)"),
             qts=g("Total Q factor (QTS)"), le_mh=g("Voice coil inductance (LBM)"), bl_tm=g("Force factor (BL)"), xmax_mm=g("Peak excursion Xmax"),
             mms_g=g("Moving mass (MMS)"), vas_l=g("Volume accoustic compliance (VAS)"), sd_cm2=round(sd * 1e4, 1) if sd else None, spl_db_1w1m=g("Sensitivity"))
    boxes = [{"type": "sealed", "volume_l": g("Sealed box volume"), "tuning_hz": None, "source": f"https://www.kenwood.eu/car/speakers/subwoofers/{m}/", "note": s("Sealed Box Dimensions")},
             {"type": "vented", "volume_l": g("Vented box volume"), "tuning_hz": None, "source": f"https://www.kenwood.eu/car/speakers/subwoofers/{m}/", "note": "labyrinth port " + str(s("Port dimensions (labyrinth) (W x H x L)"))}]
    drivers.append(rec(m, size, "SVC", g("Speaker Impedance"), g("Rated Input Power"), g("Peak Input Power"), p, "per_coil",
                       depth_mm=g("Mounting Depth"), cut_mm=g("Mouting Hole Diameter Ø"), boxes=boxes, status="current",
                       sources=[src(f"https://www.kenwood.eu/car/speakers/subwoofers/{m}/", doc="kenwood.eu product page, Specifications tab (headless browser)")],
                       notes=f"Sd printed {sd} m2; Bl printed in 'T/m'; 'Peak excursion Xmax' as printed; Displacement printed '{s('Displacement')}' (unit as printed, not entered). Rated input power taken as RMS."))
save("world", "kenwood", "Kenwood (JVCKENWOOD)", "Japan", "https://www.kenwood.eu/",
     "R2B 2026-11-23: two kenwood.eu product pages read in the headless browser (Specifications tab opened), one page per launch. kenwood.com (US/AU) refuses automated reading (Akamai 403). Numbers only.",
     drivers, [], coverage="the two component subwoofers on kenwood.eu (KFC-PS2517W, KFC-PS3017W); boxed and powered subs left out; US/AU ranges blocked")
