# Builds edge.json and vibe.json (UK brands): qualifying models found, but no usable maker T/S (see notes). Read 2026-11-22.
import os, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
C18 = "https://cdn.shopify.com/s/files/1/0608/9624/8053/files/EDGE_2018_Catalogue.pdf"
C19 = "https://cdn.shopify.com/s/files/1/0608/9624/8053/files/EDGE_2019_Catalogue.pdf"
E = [{"model": m, "rms_w": w, "url": C18 if y == 18 else C19, "note": f"EDGE {2000 + y} catalogue (maker PDF on Edge's Shopify store CDN): {imp}, {w} W RMS; catalogue gives construction data only, no T/S for this model. Final loads {fl} ohm (calculated). Read 2026-11-22."}
     for m, w, imp, fl, y in [("EDX12D1-E7", 2500, "dual 1 ohm", "0.5 / 2", 18), ("EDX15D1-E7", 2500, "dual 1 ohm", "0.5 / 2", 18), ("EDX18D1-E7", 3000, "dual 1 ohm", "0.5 / 2", 18),
                              ("EDX12D1SPL-E7", 5000, "dual 1 ohm", "0.5 / 2", 18), ("EDX15D1SPL-E7", 5000, "dual 1 ohm", "0.5 / 2", 18), ("EDX18D1SPL-E7", 5000, "dual 1 ohm", "0.5 / 2", 18),
                              ("EDS18D2-E7", 2000, "dual 2 ohm", "1 / 4", 18), ("EDS18D1-E7", 2000, "dual 1 ohm (2019 catalogue lists D1/D2)", "0.5 / 2", 19)]]
E.append({"model": "EDP122-E6 / EDP152SPL-E6", "rms_w": None, "url": C18, "note": "2018 catalogue page 7 prints T/S blocks for EDP122-E6 (Recv 3.6 ohm, F0 49.5 Hz, Qts 0.464, Vas 9.739 L, BL 27.22 T m, Mms 334.435 g) and EDP152SPL-E6 (Recv 4 ohm, F0 40.2 Hz, Qts 0.499, Vas 24.728 L, BL 29.895 T m, Mms 480.851 g) next to power text '2500 W RMS' and '4000 W RMS', but the page layout does not make clear which power line belongs to which model, impedance is not printed, and Sd is printed as 47.144 / 73.062 cm2 (a factor 10 too small for 12/15 inch). Not recorded as drivers; values kept here for the PM."})
save("edge", "EDGE Car Audio", "United Kingdom", "https://www.edgecaraudio.co.uk/ (UNVERIFIED URL; catalogues hosted on cdn.shopify.com)",
     "Catalogue PDFs read 2026-11-22. Numbers only.", [], no_ts=E)
V = [{"model": m, "rms_w": w, "url": u, "note": f"Maker page title as shown in search results: '{t}'. vibeaudio.co.uk returns HTTP 403 to curl, WebFetch and a headless browser (bot wall), so the page and its T/S could not be read. Read attempt 2026-11-22."}
     for m, w, u, t in [("BD15D1SPL-V4", 3000, "https://vibeaudio.co.uk/?p=9523", "BD15D1SPL-V4 BlackDeath 15 Inch 3000W RMS Subwoofer"),
                        ("BDC15SPL-V2", None, "https://vibeaudio.co.uk/?p=1990", "BDC15SPL-V2 BlackDeath 15 inch 9000 Watts Street Bass Subwoofer (search snippet: RMS power 3000 watts)")]]
save("vibe", "VIBE Audio", "United Kingdom", "https://vibeaudio.co.uk/",
     "Site blocks automated access (HTTP 403 to curl, WebFetch and headless Chromium, 2026-11-22); per research_b policy no further attempt. Recorded from search-result titles only, no values used.", [], no_ts=V,
     extra={"excluded_notes": "Other BlackDeath models (e.g. BD15D4-V4, 1600 W RMS per its page title) are below 2000 W. Full Vibe range not checked because the site is blocked."})
