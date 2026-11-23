#!/usr/bin/env python3
"""R3: Rockford Fosgate power/signal accessories (capacitor, breakers, ANL/MAXI/AGU fuses, holders, distribution, terminals, RCA, wire, kits)
from maker product pages (title + overview numbers). Writes data/parts_raw/<category>/rockford-fosgate.json for categories without a Frankies-derived file conflict."""
import sys, re, glob, os, json; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
D = f"{RAW}/pages/rockford_acc"; out = {}
for f in sorted(glob.glob(f"{D}/p_*.html")):
    h = os.path.basename(f)[2:-5]; t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", open(f, errors="replace").read(), flags=re.S | re.I))
    m = re.search(r"\|([^|]{5,90})\|(RF[A-Z0-9-]+|BDSYNC2|PP?B1)\|", t)
    if not m: continue
    title, model = m.group(1).strip(), h.upper(); ov = (re.search(r"Find Dealer\|Overview\|Technologies\|Support\|Overview\|([^|]{0,400})", t) or re.search(r"Find Dealer\|Overview\|([^|]{0,400})", t) or [None, ""])[1]
    url = f"https://rockfordfosgate.com/products/details/{h}/"
    base = {"id": f"rockford-fosgate-{h}", "model": model, "title": title, "status": "listed on maker site " + TODAY, "prices_aud": [], "prices_other": [],
            "sources": [{"fields": ["values in the title / overview"], "url": url, "read_date": TODAY, "tier": "maker"}], "check": "maker title/overview numbers", "notes": ""}
    a = re.search(r"(\d+) Amp", title); g = re.findall(r"(\d/0|\d+) AWG", title + " " + ov); L = re.search(r"(\d+)[ -](?:Feet|Foot)", title)
    if re.search(r"(?i)capacitor", title):
        fa = re.search(r"(\d+(?:\.\d+)?) Farad", title); out.setdefault("capacitors", []).append({**base, "kind": "hybrid" if "Hybrid" in title else None, "farads": float(fa.group(1)) if fa else None, "inputs_awg": sorted(set(g)) or None, "voltage_v": None, "esr_mohm": None, "recommended_amp_power_w": None})
    elif re.search(r"(?i)circuit breaker|fuse\b|fuse holder", title):
        ft = next((x for x in ("ANL", "MAXI", "AGU", "Maxi") if x in title), None)
        out.setdefault("fuses", []).append({**base, "kind": "circuit breaker" if "Breaker" in title else ("fuse holder / distribution" if "Distribution" in title else ("fuse holder" if "Holder" in title else "fuse")), "fuse_type": ft.upper() if ft else None, "rating_a": int(a.group(1)) if a else None})
    elif re.search(r"(?i)distribution block", title):
        out.setdefault("distribution", []).append({**base, "kind": "distribution block", "awg": g or None})
    elif re.search(r"(?i)installation kit|wiring kit|kit\b", title):
        gk = re.findall(r"(\d/0|\d+)\s*(?:AWG|Power)", title); out.setdefault("wiring_kits", []).append({**base, "awg": gk[0] if gk else None})
    elif re.search(r"(?i)terminal|post extender|\blug\b|\bring\b", title):
        out.setdefault("terminals", []).append({**base, "kind": "battery terminal" if "Battery" in title else "terminal", "awg": g or None})
    elif re.search(r"(?i)signal cable|rca|y-adapt|communication cable", title):
        out.setdefault("interconnects", []).append({**base, "kind": "RF-Link communication cable" if "RF-Link" in title else "RCA", "length_m": round(int(L.group(1)) * 0.3048, 2) if L else None})
    elif re.search(r"(?i)installation kit|kit\b", title):
        out.setdefault("wiring_kits", []).append({**base, "awg": g[0] if g else None})
    elif re.search(r"(?i)wire|cable", title):
        out.setdefault("cable", []).append({**base, "kind": "speaker" if "Speaker" in title else "power/ground", "awg": g[0] if g else None, "length_m": round(int(L.group(1)) * 0.3048, 2) if L else None})
for cat, recs in out.items():
    p = f"{OUT}/{cat}/rockford-fosgate.json"
    if os.path.exists(p) and "Frankies" in json.load(open(p)).get("method", ""):
        os.makedirs("/workspace/data/private/deleted/r3_stale_2026-11-23/" + cat, exist_ok=True); os.replace(p, f"/workspace/data/private/deleted/r3_stale_2026-11-23/{cat}/rockford-fosgate.frankies.json")
    write(cat, "rockford-fosgate", {"brand": "Rockford Fosgate", "maker_site": "https://rockfordfosgate.com", "method": "maker accessory pages from https://rockfordfosgate.com/products/selector/car-accessories/ (title and overview numbers); scripts/parts/build_rockford_acc.py",
          "terms_note": "Numbers only with URL. Rockford accessory pages have no spec table."}, recs)
