#!/usr/bin/env python3
"""R3: KnuKonceptz (US) power/ground cable spec tables (product pages) + fuses, holders, distribution blocks, terminals (Woo Store API list, USD)."""
import sys, re, glob, json, html, math; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
P = [p for f in sorted(glob.glob(f"{RAW}/woo/knukonceptz/products_*.json")) for p in json.load(open(f))]
def strand_mm(gauge): n = int(gauge); return 0.127 * 92 ** ((36 - n) / 39)
cable = []
for f in sorted(glob.glob(f"{RAW}/pages/knu/*.html")):
    url = "https://www.knukonceptz.com/product/" + f.split("/")[-1][:-5] + "/"
    t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", open(f, errors="replace").read(), flags=re.S | re.I))
    m = re.search(r"Specifications\|([^|]*(?:Wire|Cable)[^|]*)\|Core Material\|([^|]+)\|Cable Composition\|(\d+) Gauge[^|]*\|Dielectric\|([^|]+)\|(?:Specifications\|(.*?)\|Description)?", t)
    if not m: continue
    name, core, sg, diel, table = m.groups()
    if not table: cable.append({"id": "knukonceptz-" + re.sub(r"\W+", "-", name.lower()).strip("-"), "model": name, "title": name, "status": "maker page " + TODAY, "kind": "power/ground", "material": core, "strand_awg": int(sg), "sizes": None,
                                "prices_aud": [], "prices_other": [], "sources": [{"fields": ["material", "strand_awg"], "url": url, "read_date": TODAY, "tier": "maker"}], "notes": "no per-size table on the page"}); continue
    cells = table.split("|"); gauges = []
    for c in cells:
        if re.match(r"^(\d/0|\d+)( Gauge)?$", c): gauges.append(c.replace(" Gauge", ""))
        else: break
    rows = {}; i = len(gauges)
    while i < len(cells):
        lab = cells[i]; vals = cells[i + 1:i + 1 + len(gauges)]; rows[lab] = vals; i += 1 + len(gauges)
    for k, g in enumerate(gauges):
        def v(lab):
            x = rows.get(lab); return x[k] if x and k < len(x) else None
        st = v("OFC Strands"); nst = int(st.replace(",", "")) if st else None; sd = strand_mm(sg)
        cable.append({"id": f"knukonceptz-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}-{g.replace('/', '-')}", "model": f"{name} {g} AWG", "title": name, "status": "maker page " + TODAY,
                      "kind": "power/ground", "awg": g, "material": "tinned OFC" if "Copper" in core and "Clad" not in core else ("CCA" if "Clad" in core else core),
                      "strand_awg": int(sg), "strand_d_mm": round(sd, 4), "strands": nst, "actual_area_mm2_from_strands": round(nst * math.pi / 4 * sd * sd, 1) if nst else None,
                      "outer_diameter_mm": float(re.sub(r"[^\d.]", "", v("Outer Diameter"))) if v("Outer Diameter") else None,
                      "core_diameter_mm": float(re.sub(r"[^\d.]", "", v("Core Diameter").split("(")[0])) if v("Core Diameter") else None, "core_diameter_note": "maker: estimated" if v("Core Diameter") and "estim" in v("Core Diameter") else None,
                      "maker_max_load_a": int(re.sub(r"\D", "", v("Max Load @ 20Ft"))) if v("Max Load @ 20Ft") else None, "maker_max_load_basis": "maker 'Max Load @ 20Ft' (6.1 m), basis not stated",
                      "insulation": diel, "length_note": "sold cut to length or by spool (variants on the store page); spec per gauge", "jacket_temp_c": "-40 to 105 (maker text)" if "105" in t else None,
                      "prices_aud": [], "prices_other": [], "sources": [{"fields": ["all values"], "url": url, "read_date": TODAY, "tier": "maker"}],
                      "notes": "strand area computed from the maker strand count and strand gauge (AWG formula)" if nst else ""})
write("cable", "knukonceptz", {"brand": "KnuKonceptz", "maker_site": "https://www.knukonceptz.com", "method": "maker product pages, Specifications table; scripts/parts/build_knukonceptz.py",
      "terms_note": "Numbers only with URL.", "units": {"diameters": "mm", "maker_max_load_a": "A"}}, cable)
fz, dist, term = [], [], []
for p in P:
    name = html.unescape(p["name"]); cats = [html.unescape(c["name"]) for c in p.get("categories", [])]; url = p["permalink"]
    pr = p["prices"]; mu = 10 ** pr.get("currency_minor_unit", 2); price = int(pr["price"]) / mu if pr.get("price") else None
    rng = pr.get("price_range") or {}
    base = {"id": f"knukonceptz-{p['slug']}"[:90], "model": name, "title": name, "status": "listed on maker store " + TODAY, "prices_aud": [],
            "prices_other": [{"supplier": "KnuKonceptz store (US)", "price": sorted({price} | ({int(rng['min_amount']) / mu, int(rng['max_amount']) / mu} if rng else set())), "currency": pr.get("currency_code"), "url": url, "read_date": TODAY, "note": "range over variants (gauge, length, rating)" if rng else None}],
            "sources": [{"fields": ["name", "attributes", "price"], "url": url, "read_date": TODAY, "tier": "maker-store", "doc": "https://www.knukonceptz.com/wp-json/wc/store/v1/products"}]}
    attrs = {a["name"]: [t["name"] for t in a["terms"]] for a in p.get("attributes", [])}
    if "Fuses" in cats or "In Line Fuse Holders" in cats or "Distribution & Fuse Blocks" in cats:
        ft = "ANL" if re.search(r"\bANL\b", name) and "Mini" not in name else ("mini ANL / AFS" if "Mini-ANL" in name else ("AGU" if "AGU" in name else None))
        kind = "fuse" if "Fuses" in cats and "Holder" not in name and "Link" not in name else ("fuse holder" if "Holder" in name else ("distribution block" if "Distribution" in name or "Block" in name else "link/other"))
        rec = {**base, "kind": kind, "fuse_type": ft, "ratings_a": sorted(int(x) for x in attrs.get("Amps", []) if x.isdigit()) or None, "gauges_in_name": re.findall(r"(\d/0|\d+) (?:to|Gauge|-)", name) or None}
        (dist if kind == "distribution block" else fz).append(rec); continue
    if any(c in cats for c in ("Crimp Terminals", "Set Screw Terminals", "Battery Terminals", "Input Gauge Reducers", "Compression Fittings")):
        term.append({**base, "kind": cats[0], "gauges": attrs.get("Gauge") or re.findall(r"(\d/0|\d+) Gauge", name) or None})
write("fuses", "knukonceptz", {"brand": "KnuKonceptz", "maker_site": "https://www.knukonceptz.com", "method": "WooCommerce Store API list (names, attributes, USD prices)", "terms_note": "Numbers only with URL."}, fz)
write("distribution", "knukonceptz", {"brand": "KnuKonceptz", "maker_site": "https://www.knukonceptz.com", "method": "WooCommerce Store API list", "terms_note": "Numbers only with URL."}, dist)
write("terminals", "knukonceptz", {"brand": "KnuKonceptz", "maker_site": "https://www.knukonceptz.com", "method": "WooCommerce Store API list", "terms_note": "Numbers only with URL."}, term)
