# Builds data/hp_subs_raw/world/pioneer.json. TS-W8102SPL values from a print-out of Pioneer Italy's product page
# (www.pioneer.it, printed 28/06/2009) hosted as a PDF by RG Sound (rgsound.it), read 2026-11-21.
import os, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
U = "https://www.rgsound.it/prodotti/atch/20101122101743_TS-W8102SPL.pdf"
D = [driver(model="TS-W8102SPL", size_in=15, coil="DVC", ohms_per_coil=2, coils=2, rms_w=3000, peak_w=8000,
    fs_hz=23.2, re_ohm=3.0, qms=5.270, qes=0.330, qts=0.310, vas_l=70.14, sd_cm2=918, xmax_mm=15.4, mms_g=800.11, bl_tm=33.640, le_mh=5.560,
    spl_db_1w1m=91, displacement_l=8.00, status="discontinued",
    recommended_boxes=[{"type": "sealed", "volume_l": 70.75, "tuning_hz": None, "source": U + " p2: 'Recom. Enclosure 70,75 l', F0 in cabinet 32.7 Hz, Q0 0.437 (sealed implied by F0/Q0, type not printed)"}],
    sources=[{"fields": ["*"], "url": U, "doc": "20101122101743_TS-W8102SPL.pdf (print of http://www.pioneer.it/it/products/TS-W8102SPL/print.html, 28/06/2009)", "page": "1-2", "read_date": "2026-11-21", "tier": 1}],
    notes="Maker page (Pioneer Italy) reproduced as a PDF by RG Sound, rgsound.it (Italian distributor status not verified; the content is the maker's own page). Italian labels: Potenza massima = max power 8000 W, Potenza d'ingresso nominale = nominal input 3000 W. Sd printed 0.0918 m2 (converted to 918 cm2). Revc 3.0 ohm on a dual 2 ohm coil: basis not printed (series would be about 4 ohm nominal). Also printed: Vd 1.413 L, Zmax 58.56 ohm, Rms 20.367 Ns/m, Cms 0.00006 m/N, Hvc 61 mm, Hag 30 mm, VC diameter 85 mm, efficiency 0.26 %. Status: discontinued (not on current Pioneer EU/US sites).")]
NO = [{"model": "TS-W5102SPL", "rms_w": None, "url": "https://kitchen.manualsonline.com/manuals/mfg/pioneer/rsd7rii.html?p=44",
       "note": "12 inch dual 2 ohm Champion SPL sub, discontinued. Pioneer catalogue page (hosted copy) gives 6000 W max; nominal input reported as 2500 W only by retailers, and no Pioneer page with T/S was found. Not recorded as a driver."}]
save("pioneer", "Pioneer", "Japan", "https://www.pioneer-car.eu/",
     "Only one document used (maker page print-out hosted by rgsound.it). Current Pioneer subwoofers on pioneer-car.eu and usa.pioneer are all below 2000 W RMS (the owner's TS-W3003D4 is 600 W). Numbers only.",
     D, no_ts=NO)
