#!/usr/bin/env python3
"""Print cleaned description text of chosen products from saved Shopify products_*.json. Usage: shopify_body.py DIR handle-substring... [--from WORD] [--len N]"""
import sys, json, re, html, glob
a = sys.argv[1:]; d = a.pop(0); frm = None; n = 2500
if "--from" in a: i = a.index("--from"); frm = a[i + 1]; del a[i:i + 2]
if "--len" in a: i = a.index("--len"); n = int(a[i + 1]); del a[i:i + 2]
P = [p for f in sorted(glob.glob(d + "/products_*.json")) for p in json.load(open(f))["products"]]
for p in P:
    if any(s == p["handle"] or (s.endswith("*") and p["handle"].startswith(s[:-1])) for s in a):
        t = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); t = re.sub(r"\s+", " ", t); t = re.sub(r"(\s*\|\s*)+", "|", t)
        i = t.find(frm) if frm else 0
        print("=====", p["handle"], "|", p["title"], "| updated", p.get("updated_at", "")[:10]); print(t[max(0, i):max(0, i) + n] if i >= 0 else t[:n])
