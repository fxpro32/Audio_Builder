#!/usr/bin/env python3
"""R3: dump a Shopify store's public product list (/products.json or /collections/<c>/products.json), paged 250 at a time,
browser UA, polite delay (default 4 s). Raw JSON kept for audit. Usage: shopify_dump.py BASEURL OUTDIR [maxpages=20] [delay=4]
BASEURL example: https://www.ds18.com  or  https://www.jbhifi.com.au/collections/car-amplifiers"""
import sys, json, time, subprocess, os
base, out = sys.argv[1].rstrip("/"), sys.argv[2]
maxp = int(sys.argv[3]) if len(sys.argv) > 3 else 20; delay = float(sys.argv[4]) if len(sys.argv) > 4 else 4
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
os.makedirs(out, exist_ok=True); n = 0
for page in range(1, maxp + 1):
    f = f"{out}/products_{page}.json"
    if not os.path.exists(f) or os.path.getsize(f) < 50:
        if page > 1: time.sleep(delay)
        r = subprocess.run(["curl", "-s", "-L", "-m", "60", "--compressed", "-A", UA, "-o", f, "-w", "%{http_code}", f"{base}/products.json?limit=250&page={page}"], capture_output=True, text=True)
        print(base, "page", page, "HTTP", r.stdout, flush=True)
    try: d = json.load(open(f))["products"]
    except Exception as e: print("bad json", f, e, flush=True); os.rename(f, f + ".bad"); break
    n += len(d)
    if len(d) < 250: break
print(f"DONE {base}: {n} products -> {out}", flush=True)
