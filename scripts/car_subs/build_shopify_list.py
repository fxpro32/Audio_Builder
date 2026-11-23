#!/usr/bin/env python3
"""R2_SUBS_ALL: Shopify-store brands whose product pages mostly carry no T/S (Audiopipe, Cerwin-Vega Mobile, Diamond Audio,
Earthquake Sound, Orion, Power Acoustik, Rockville, Soundstream, Ampere Audio, American Bass (T/S only in image spec sheets; the >= 2000 W ones were transcribed by A2)). Source: each store's public /products.json saved by A2
on 2026-11-21 (references/raw/hp_subs/us/<brand>/products_*.json), re-used 2026-11-23, no new requests.
Per product: size, coil, ohms, RMS and peak are parsed from the title and description with strict patterns (left null when not
matched); T/S only where the description prints labelled values '(Fs): 45.55 Hz' style. Only passive car subwoofer drivers:
enclosures, powered/loaded subs, kits, home/pro audio, marine-only, used/refurbished listings and accessories are left out.
Usage: python3 -I build_shopify_list.py"""
import sys, re, glob, json, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
H = "/workspace/references/raw/hp_subs/us/"
BRANDS = [("audiopipe", "Audiopipe", "https://audiopipe.com"), ("cerwin-vega", "Cerwin-Vega (Mobile)", "https://cerwinvega.com"),
          ("diamond-audio", "Diamond Audio", "https://diamondaudio.com"), ("earthquake-sound", "Earthquake Sound", "https://www.earthquakesound.com"),
          ("orion", "Orion Car Audio", "https://orioncaraudio.com"), ("power-acoustik", "Power Acoustik", "https://poweracoustik.com"),
          ("rockville", "Rockville", "https://rockvilleaudio.com"), ("soundstream", "Soundstream", "https://soundstream.com"),
          ("ampere-audio", "Ampere Audio", "https://ampereaudio.com"), ("american-bass", "American Bass", "https://americanbassusa.com")]
SKIP = (r"(?i)enclos|\bbox|amplif|grill|loaded|powered|active|tube|cable|recone|\bkit\b|bundle|package|cover|\bring\b|adapter|spacer|harness|combo|"
        r"pair of|home|soundbar|theater|theatre|bluetooth|party|tower|pro audio|\bdj\b|\bpa\b|used|refurb|open box|b-stock|bass knob|remote|terminal|"
        r"shirt|hat|sticker|woofer su\b|(?<!sub)woofer$|raw woofer|dsp|\biw-|minime|supernova|in-wall|in-ceiling|underseat|under-seat|under seat|spare tire|vehicle specific|truck box|bass package|wedge|pre-loaded|preloaded|system\)?$|woofer system")
T_S = [("fs_hz", r"\(Fs\)\s*:?\s*([\d.]+)\s*Hz"), ("qes", r"\(Qes\)\s*:?\s*([\d.]+)"), ("qms", r"\(Qms\)\s*:?\s*([\d.]+)"), ("qts", r"\(Qts\)\s*:?\s*([\d.]+)"),
       ("vas_l", r"\(Vas\)\s*:?\s*[^|]*?([\d.]+)\s*L\b"), ("xmax_mm", r"\(Xmax\)\s*:?\s*[^|]*?([\d.]+)\s*mm"), ("re_ohm", r"\(Re\)\s*:?\s*([\d.]+)"),
       ("spl_db_1w1m", r"Efficiency \(1 ?W ?/ ?1 ?m\)\s*:?\s*([\d.]+)\s*dB")]
for slug, brand, url in BRANDS:
    P = [p for f in sorted(glob.glob(H + slug + "/products_*.json")) for p in json.load(open(f))["products"]]
    drivers, seen = [], set()
    hp_scope = __import__("os").path.exists(f"/workspace/data/hp_subs_raw/us/{slug}.json")
    for p in P:
        t0 = p["title"]; pt = p.get("product_type") or ""
        if not re.search(r"(?i)sub ?woofer|\bsub\b", t0 + " " + pt) or re.search(SKIP, t0 + " " + pt + " " + p["handle"]): continue
        tags = " ".join(p.get("tags") or []) if isinstance(p.get("tags"), list) else str(p.get("tags") or "")
        if re.search(r"(?i)home audio|outdoor|pro subwoofer|studio|\bdj\b|professional|powered|loaded enclosure|marine", tags + " " + pt + " " + t0): continue
        b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); b = re.sub(r"(\s*\|\s*)+", "|", re.sub(r"\s+", " ", b))
        if re.search(r"(?i)marine", t0) and not re.search(r"(?i)car", t0): continue
        blob = t0 + " | " + b[:1500]
        ms = re.search(r"(\d{1,2}(?:\.\d+)?)\s*(?:\"|”|″|''|-inch|\s?inch|\s?in\b)", t0)  # size from the title only
        size = num(ms.group(1)) if ms else None
        if size is not None and not (5 <= size <= 24): size = None
        mc = re.search(r"(?i)\b(dual|single|svc|dvc)\b[^|,.]{0,12}?(\d(?:\.\d)?)\s*-?\s*ohm", blob) or re.search(r"(?i)(\d(?:\.\d)?)\s*-?\s*ohm\s*(dual|single|svc|dvc)", blob)
        coil = ohm = None
        if mc:
            a, c = mc.groups()
            if a[0].isdigit(): a, c = c, a
            coil = "DVC" if a.lower() in ("dual", "dvc") else "SVC"; ohm = num(c)
        mr = re.search(r"(?i)([\d,]{2,6})\s*(?:w|watts?)\s*rms", blob) or re.search(r"(?i)rms[^|\d]{0,25}([\d,]{2,6})\s*(?:w|watts?)", blob)
        mp = re.search(r"(?i)([\d,]{3,6})\s*(?:w|watts?)\s*(?:peak|max)", blob) or re.search(r"(?i)(?:peak|max)[^|\d]{0,25}([\d,]{3,6})\s*(?:w|watts?)", blob)
        rms = num(mr.group(1).replace(",", "")) if mr else None
        peak = num(mp.group(1).replace(",", "")) if mp else None
        params = {}
        for k, pat in T_S:
            m = re.search(pat, b)
            if m: params[k] = num(m.group(1))
        sku = (p["variants"][0].get("sku") or "").strip()
        key = sku or p["handle"]
        if re.search(r"(?i)woofer", sku) and not re.search(r"(?i)subwoofer", sku): continue  # replacement woofer parts (e.g. Rockville 'WOOFER SU')
        if key in seen: continue
        seen.add(key)
        if hp_scope and rms is not None and rms >= 2000: continue  # A2 already covered >= 2000 W models of this brand (hp_subs_raw copy)
        r = rec(sku or t0[:60], size, coil, ohm, rms, peak, params, "per_coil" if coil == "SVC" else "unknown", status="current",
                sources=[src(url + "/products/" + p["handle"], doc="product page title/description (via public products.json)")],
                notes=f"Product title: '{t0[:120]}'. Size, coil, RMS and peak parsed from the title/description; null where not printed clearly."
                      + (" Labelled T/S values printed in the description." if params else ""))
        if coil is None: r["final_loads_ohm"] = []
        drivers.append(r)
    if slug == "american-bass":  # R2B_SUBS_MORE: T/S read from the maker's image-only spec sheets (scripts/car_subs/image_reads/american_bass.py)
        sys.path.insert(0, "/workspace/scripts/car_subs/image_reads"); import american_bass as AB
        from common import final_loads
        by = {d["model"]: d for d in drivers}
        for sku, fn, pg, prm, meta, note in AB.ROWS:
            d = by.get(sku)
            if d is None:  # model on the maker sheet but not in the saved store listing: own record, status not current
                d = rec(sku, meta.get("size_in"), meta["coil"], meta["ohm"], meta.get("rms_w"), meta.get("peak_w"), {}, "unknown", status="UNVERIFIED (on the maker spec sheet, not in the 2026-11-21 store listing)",
                        sources=[], notes="Model printed on the maker spec sheet next to listed models; not sold in the saved store listing.")
                drivers.append(d); by[sku] = d; print("AB image row added as own record:", sku)
            qc = prm["qms"] * prm["qes"] / (prm["qms"] + prm["qes"]) if prm.get("qms") and prm.get("qes") else None
            print(f"AB {sku}: Qts {prm.get('qts')} vs Qms*Qes/(Qms+Qes) {qc:.3f}" if qc else f"AB {sku}: no Qms/Qes")
            d["params"].update(prm)
            for k in ("rms_w", "peak_w", "size_in"):
                if d.get(k) is None and meta.get(k) is not None: d[k] = meta[k]
            if d.get("coil") is None: d["coil"], d["ohms_per_coil"] = meta["coil"], meta["ohm"]; d["coils"] = {"SVC": 1, "DVC": 2}[meta["coil"]]; d["final_loads_ohm"] = final_loads(meta["coil"], meta["ohm"])
            d["ts_basis"] = meta.get("basis", d["ts_basis"])
            d["sources"].append(src(AB.CDN + fn, doc=f"maker spec sheet PDF (image only), page {pg}: T/S READ FROM IMAGE", page=str(pg)))
            d["notes"] += (f" T/S READ FROM IMAGE ({fn} p.{pg}), double-checked: printed Qts {prm.get('qts')} vs Qms*Qes/(Qms+Qes) {qc:.3f}." if qc else f" T/S READ FROM IMAGE ({fn} p.{pg}).") + (" " + note if note else "")
    save("us", slug, brand, "USA", url, "R2 2026-11-23: re-used the store's public /products.json saved by A2 on 2026-11-21 (no new requests). Numbers only.",
         drivers, [], coverage="passive car subwoofer drivers in the store listing (all power levels); most pages publish no T/S, so most are listed incomplete")
