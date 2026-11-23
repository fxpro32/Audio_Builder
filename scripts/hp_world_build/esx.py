# Builds data/hp_subs_raw/world/esx.json from ESX (Audio Design GmbH) data sheets and product pages, read 2026-11-21.
import os, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
A = "http://www.esxaudio.de/assets/"; P = "http://www.esxaudio.de/"
def s(doc): return {"fields": ["*"], "url": A + doc, "doc": doc + " (ESX data sheet)", "page": 1, "read_date": "2026-11-21", "tier": 1}
def pg(m): return {"fields": ["status"], "url": P + m + ".html", "doc": "ESX product page", "page": None, "read_date": "2026-11-21", "tier": 1}
NOTE = "Xmax is the sheet's 'Max. Linear Excursion +/- 23 mm'; sheet also gives 'Xmax (Peak)' +/- 30 mm (mechanical). Winding height 57.5 mm. "
D = [
 driver(model="VX10PRO", size_in=10, coil="DVC", ohms_per_coil=2, coils=2, rms_w=2500, peak_w=5000, fs_hz=46, re_ohm=1.9, qms=3.89, qes=0.59, qts=0.51, vas_l=6.2,
        sd_cm2=325, xmax_mm=23, mms_g=286, bl_tm=23.7, spl_db_1w1m=83, mounting_depth_mm=198, cutout_mm=235, status="current",
        recommended_boxes=[{"type": "vented", "volume_l": 35, "tuning_hz": 45, "source": "vx10pro.pdf: port 100 mm (80 cm2), L 24 cm, F3 36 Hz"}],
        sources=[s("vx10pro.pdf"), pg("vx10pro")], notes=NOTE + "Re printed '2 x 1,9 Ohms' (per coil). Voice coil 76 mm. B/L printed in N/A (= T m)."),
 driver(model="VX12PRO", size_in=12, coil="DVC", ohms_per_coil=2, coils=2, rms_w=3000, peak_w=6000, fs_hz=39, re_ohm=None, qms=3.95, qes=0.61, qts=0.52, vas_l=18,
        sd_cm2=512, xmax_mm=23, mms_g=340, bl_tm=23.4, le_mh=1.52, spl_db_1w1m=84, mounting_depth_mm=222, cutout_mm=284, status="current",
        recommended_boxes=[{"type": "vented", "volume_l": 55, "tuning_hz": 38, "source": "vx12pro.pdf: port 120 mm (113 cm2), L 32 cm, F3 30 Hz"}],
        sources=[s("vx12pro.pdf"), pg("vx12pro")], notes=NOTE + "DC resistance printed as '2 x 2 Ohms' (the nominal impedance, not a measured Re), so re_ohm left empty. Voice coil 100 mm."),
 driver(model="VX15PRO", size_in=15, coil="DVC", ohms_per_coil=2, coils=2, rms_w=3500, peak_w=7000, fs_hz=33, re_ohm=None, qms=3.26, qes=0.65, qts=0.54, vas_l=54,
        sd_cm2=810, xmax_mm=23, mms_g=396, bl_tm=22.5, le_mh=2.15, spl_db_1w1m=85, mounting_depth_mm=251, cutout_mm=358, status="current",
        recommended_boxes=[{"type": "vented", "volume_l": 85, "tuning_hz": 38, "source": "vx15pro.pdf: 2 x 100 mm ports (160 cm2), L 26 cm, F3 30 Hz"}],
        sources=[s("vx15pro.pdf"), pg("vx15pro")], notes=NOTE + "DC resistance printed as '2 x 2 Ohms' (the nominal impedance, not a measured Re), so re_ohm left empty. Voice coil 100 mm."),
]
NO = [{"model": "VX21PRO", "rms_w": 6000, "url": P + "vx21pro.html", "note": "21 inch; product page: 6000/12000 W RMS/max, linear excursion +/- 23 mm, X-max +/- 35 mm, mounting depth 335 mm, cut-out 495 mm; data sheet vx21pro.pdf is image-only (no text), impedance and T/S not transcribed. Read 2026-11-21."}]
save("esx", "ESX (Audio Design GmbH)", "Germany", "https://www.esxaudio.de/",
     "robots.txt disallows only *.zip; no website terms of use found. Pages and data sheets read one at a time, 3 s apart, 2026-11-21. Numbers only. EU maker: database right only for a substantial part of a protected database; per-model facts from the maker's own sheets, cited.",
     D, no_ts=NO, extra={"excluded_notes": "ESX QXE15D2 is 1500 W RMS (qxe15d2.pdf); other ESX subs (SXE, QXE, DBX, HXB) are below 2000 W."})
