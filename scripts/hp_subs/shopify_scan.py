#!/usr/bin/env python3
"""A2: list a Shopify store's products (public /products.json, paged, 6 s apart), save raw JSON for audit, print subwoofer candidates
with power figures found and whether T/S keywords occur in the description. Usage: shopify_scan.py DOMAIN OUTDIR [minW]"""
import sys, json, time, subprocess, re, html, os
dom, out = sys.argv[1], sys.argv[2]; minw = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
os.makedirs(out, exist_ok=True); prods = []
for page in range(1, 11):
    f = f"{out}/products_{page}.json"
    if not os.path.exists(f):
        if page > 1: time.sleep(6)
        subprocess.run(["curl", "-s", "-L", "-m", "40", "-A", "Mozilla/5.0", "-o", f, f"https://{dom}/products.json?limit=250&page={page}"])
    try: d = json.load(open(f))["products"]
    except Exception as e: print("bad json", f, e); break
    prods += d
    if len(d) < 250: break
print(f"{dom}: {len(prods)} products")
for p in prods:
    txt = html.unescape(re.sub(r"<[^>]+>", " ", p.get("body_html") or "")); blob = p["title"] + " " + txt
    if not re.search(r"(?i)sub|woofer", blob + " " + (p.get("product_type") or "")): continue
    ws = sorted({int(w.replace(",", "")) for w in re.findall(r"(\d{1,2},?\d{3})\s*(?:W\b|w\b|watt|Watt|WATT)", blob)})
    if not ws or max(ws) < minw: continue
    ts = [k for k in ("Fs", "Qts", "Vas", "Xmax", "Qes", "Re ", "BL") if k.lower() in blob.lower()]
    print(f"{p['handle'][:70]} | {p['title'][:60]} | W={ws[:6]} | TS={','.join(ts)} | opts={[o['values'][:6] for o in p.get('options', [])][:2]}")
