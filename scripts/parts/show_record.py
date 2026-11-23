#!/usr/bin/env python3
"""R3B: print one parts_raw record next to the rating/spec lines of its saved raw source (Shopify dump or saved page). Usage: show_record.py <category> <id> [regex]"""
import sys, re, json, glob, os; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
cat, rid = sys.argv[1], sys.argv[2]; rx = sys.argv[3] if len(sys.argv) > 3 else r"(?i)ohm|Ω|rms|watt|bridg|farad|volt|gauge|awg|mm"
for f in glob.glob(f"{OUT}/{cat}/*.json"):
    for r in json.load(open(f))["records"]:
        if r["id"] != rid: continue
        print(json.dumps({k: v for k, v in r.items() if k not in ("sources", "prices_other", "variants")}, ensure_ascii=False)[:1500])
        url = r["sources"][0]["url"]; print("URL", url)
        host = re.match(r"https://([^/]+)/", url).group(1); h = url.rstrip("/").split("/")[-1]
        txt = None
        if os.path.isdir(f"{RAW}/shopify/{host}"):
            p = next((p for p in shopify_products(host) if p["handle"] == h), None)
            if p: txt = p["title"] + "|" + clean(p["body_html"])
        if txt is None:
            for g in glob.glob(f"{RAW}/pages/*/p_{h}.html") + glob.glob(f"{RAW}/pages/*/{h}.html"):
                txt = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", open(g, errors="replace").read(), flags=re.S | re.I))
        print("SOURCE:", [x for x in (txt or "").split("|") if re.search(rx, x) and len(x) < 300][:30] if txt else "raw copy not found")
