#!/usr/bin/env python3
"""R4B_DRIVERS_MORE: Power Acoustik car speakers from the maker's Shopify catalogue (https://poweracoustik.com/products.json, read 2026-11-23, 4 s apart;
local copy references/raw/car_drivers/poweracoustik/). Labelled spec lists in the product description only (scripts/car_drivers/shopify_specs.py);
products without labelled numbers are listed in no_specs_published. Home, marine/powersports, PA and accessories are left out.
Usage: python3 -I build_power_acoustik.py"""
import sys
sys.path.insert(0, "/workspace/scripts/car_drivers")
import shopify_specs as S
from common import save
from collections import Counter
ps = S.load("/workspace/references/raw/car_drivers/poweracoustik")
out, nospec = S.make(ps, "Power Acoustik", "https://poweracoustik.com", lambda p: S.typ_from_text((p.get("product_type") or "") + " " + p["title"] + " " + " ".join(p.get("tags") or [])))
print(Counter(r["type"] for r in out), "listed:", len(nospec))
save("power-acoustik", "Power Acoustik", "USA", "https://poweracoustik.com", "R4B 2026-11-23: Shopify products.json (public catalogue feed) read 4 s apart, browser user agent. Numbers only.", out, nospec)
