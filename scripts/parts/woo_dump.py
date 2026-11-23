#!/usr/bin/env python3
"""R3: dump a WooCommerce store's public Store API product list (/wp-json/wc/store/v1/products), 100 per page, polite delay.
Usage: woo_dump.py BASEURL OUTDIR [maxpages=30] [delay=4]"""
import sys, json, time, subprocess, os
base, out = sys.argv[1].rstrip("/"), sys.argv[2]; maxp = int(sys.argv[3]) if len(sys.argv) > 3 else 30; delay = float(sys.argv[4]) if len(sys.argv) > 4 else 4
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
os.makedirs(out, exist_ok=True); n = 0
for page in range(1, maxp + 1):
    f = f"{out}/products_{page}.json"
    if not os.path.exists(f) or os.path.getsize(f) < 3:
        if page > 1: time.sleep(delay)
        r = subprocess.run(["curl", "-s", "-L", "-m", "60", "--compressed", "-A", UA, "-o", f, "-w", "%{http_code}", f"{base}/wp-json/wc/store/v1/products?per_page=100&page={page}"], capture_output=True, text=True)
        print(base, "page", page, "HTTP", r.stdout, flush=True)
    try: d = json.load(open(f))
    except Exception as e: print("bad json", f, e, flush=True); os.rename(f, f + ".bad"); break
    if not isinstance(d, list): print("not a list", f, flush=True); break
    n += len(d)
    if len(d) < 100: break
print(f"DONE {base}: {n} products -> {out}", flush=True)
