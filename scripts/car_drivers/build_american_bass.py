#!/usr/bin/env python3
"""R4B_DRIVERS_MORE: American Bass car speakers (midrange, midbass, full range, components, tweeters) from the maker's Shopify
catalogue (https://www.americanbassusa.com/products.json; local copy saved by R3 2026-11-23 in references/raw/parts/shopify/www.americanbassusa.com/,
no new request) plus the maker spec sheet PDFs linked in the descriptions (references/raw/car_drivers/american-bass/sheets/, image-only:
HAWK-6.5 and HAWK-8 T/S READ FROM IMAGE by R4B from the rendered pages in sheets/png/). Subwoofers are R2's. Usage: python3 -I build_american_bass.py"""
import sys
sys.path.insert(0, "/workspace/scripts/car_drivers")
import shopify_specs as S
from common import save, src
from collections import Counter

CDN = "https://cdn.shopify.com/s/files/1/0655/3550/8703/files/"
IMG = ("T/S read from image: the maker spec sheet {f} is a scanned page with no text layer; values transcribed by R4B 2026-11-23 from "
       "the rendered page (references/raw/car_drivers/american-bass/sheets/png/). Sheet also prints Mmd {mmd} g and Cms {cms} mm/N (as printed).")
OVR = {
    "American Bass HAWK-8-MR": dict(params=dict(vas_l=20.32, fs_hz=78, qms=4.91, qes=0.53, qts=0.45, sd_cm2=211.24, mms_g=12.99, bl_tm=6.68, re_ohm=3.20),
                                    src=src(CDN + "American_Bass_Hawk_8.pdf", ["params"], doc="maker spec sheet PDF (image, read visually)", page=1),
                                    notes=IMG.format(f="American_Bass_Hawk_8.pdf", mmd="15.00", cms="320.70")),
    "American Bass HAWK-6.5-MR": dict(params=dict(vas_l=3.26, fs_hz=133, qms=7.38, qes=0.61, qts=0.51, sd_cm2=122.72, mms_g=9.28, bl_tm=7.53, re_ohm=3.20),
                                      src=src(CDN + "American_Bass_Hawk_6.5.pdf", ["params"], doc="maker spec sheet PDF (image, read visually)", page=1),
                                      notes=IMG.format(f="American_Bass_Hawk_6.5.pdf", mmd="8.50", cms="152.41")),
}
TYPES = {"Midrange Speakers": "midrange", "Midbass Speakers": "midbass", "Full Range Speakers": "coaxial", "Component Speakers": "component_set", "Tweeters": "tweeter"}
ps = S.load("/workspace/references/raw/parts/shopify/www.americanbassusa.com")
out, nospec = S.make(ps, "American Bass", "https://www.americanbassusa.com", lambda p: TYPES.get(p.get("product_type")), overrides=OVR)
for r in out:  # American Bass writes 6x9 speakers as '6.9"' (e.g. SYMPHONY-6.9-FR, NEO-6.9-MR): labelled 6x9, number kept in notes
    if r["size_in"] == 6.9:
        r["size_in"] = None; r["size_label"] = "6x9"; r["notes"] = (r["notes"] + " " if r["notes"] else "") + "Maker title prints 6.9 in; stored as size label 6x9."
print(Counter(r["type"] for r in out), "listed:", len(nospec), "with T/S:", sum(1 for r in out if r["params"]["qts"]))
save("american-bass", "American Bass", "USA", "https://www.americanbassusa.com",
     "R4B 2026-11-23: Shopify products.json (public catalogue feed, R3 local copy) + spec sheet PDFs on the maker CDN (11, 3 s apart). Numbers only.", out, nospec)
