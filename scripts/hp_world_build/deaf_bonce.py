# Builds data/hp_subs_raw/world/deaf-bonce.json and avatar.json from deafbonce.com product pages
# (Specifications tables, D1/D2 columns split into two records), read 2026-11-21.
import glob, os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
D = "/workspace/references/raw/hp_subs/world/deaf_bonce/pages/"
BOX = json.load(open(os.path.dirname(__file__) + "/deaf_bonce_boxes.json")) if os.path.exists(os.path.dirname(__file__) + "/deaf_bonce_boxes.json") else {}
def table(path):
    L = [l.strip() for l in open(path, encoding="utf-8")]
    try: i = L.index("Specifications")
    except ValueError: return {}
    t = {}
    for l in L[i+1:]:
        if l in ("Subwoofer box", "Sub box"): break
        parts = [p.strip() for p in l.split("|")]
        if len(parts) >= 3: t.setdefault(parts[0], parts[1])
    return t
def split(v, n):
    if v is None: return [None]*n
    v = re.sub(r"\s*(Hz|L|mm|dB|W)\s*$", "", v)
    parts = [p.strip() for p in v.split(" / ")]
    return parts if len(parts) == n else [v]*n
out = {"deaf-bonce": [], "avatar": []}; skipped = []; low = []; no_ts = []
SUSPECT = {"apocalypse-db-sa315-d1-d2": "DB-SA315 D1/D2", "apocalypse-db-sa315-neo": "DB-SA315 NEO"}
for path in sorted(glob.glob(D + "*.txt")):
    slug = os.path.basename(path)[:-4]
    t = table(path)
    rms = num(t.get("RMS Power"))
    title = open(path, encoding="utf-8").read().splitlines()[1].split(" | ")[0]
    if not t or not rms:
        skipped.append(slug)
        no_ts.append({"model": title.replace(" Предзаказ", ""), "rms_w": None, "url": f"https://deafbonce.com/subwoofers/{slug}", "note": "Product page has no specification values yet (all fields 0" + ("; marked pre-order, 'Предзаказ'" if "Предзаказ" in title else "") + "), read 2026-11-21."})
        continue
    if slug in SUSPECT:
        no_ts.append({"model": SUSPECT[slug], "rms_w": rms, "url": f"https://deafbonce.com/subwoofers/{slug}",
            "note": f"DATA PROBLEM: the page's specification table is labelled '{t.get('Model')}' and its Fs/Qts/Bl/Vas are identical to the 10 inch DB-SA310 page, so the T/S shown are not trusted for this 15 inch model. Table shows RMS {rms} W, impedance {t.get('Impedance')}, mounting depth {t.get('Mounting depth')}. Read 2026-11-21."})
        continue
    if rms < 2000: low.append((slug, rms)); continue
    models = [m.strip() for m in t.get("Model", slug).split(" / ")]
    n = len(models)
    imps = split(t.get("Impedance", "").replace(" Ohm", ""), n)
    res = split(t.get("Re"), n)
    for k in range(n):
        notes = []
        imp = imps[k] or ""
        m = re.match(r"(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)", imp)
        coil, oh, nc = ("DVC", num(m.group(1)), 2) if m else ("SVC", num(imp), 1)
        model = models[k]
        if imp.startswith("quad"):
            coil, oh, nc = "QVC", num(imp), 4
        sfx = re.search(r"D([124])$", model.replace(" ", ""))
        if sfx and coil == "DVC" and oh and int(sfx.group(1)) != oh:
            fixed = model[:-1] + str(int(oh))
            notes.append(f"DATA PROBLEM: the page's Model column says '{model}' but the matching Impedance column says {imp} ohm; the record is named '{fixed}' after the impedance (D1 = 1+1, D2 = 2+2 convention).")
            model = fixed
        re_txt = res[k]
        re_val = None
        if re_txt:
            mm = re.match(r"(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)", re_txt)
            re_val = num(mm.group(1)) if mm else num(re_txt)
            notes.append(f"Re printed '{re_txt}' (per coil when written a+b); re_ohm = one coil." if mm else f"Re printed '{re_txt}'.")
        g = lambda key: num(split(t.get(key), n)[k]) if t.get(key) else None
        md = re.search(r"\(([\d.]+) mm\)", t.get("Mounting depth", "")); co = re.search(r"\(([\d.]+) mm\)", t.get("Cut-out dimension", ""))
        xmech = g("Xmeh")
        if xmech: notes.append(f"Xmech (page 'Xmeh') {xmech} mm.")
        if n == 2 and t.get("BL") and len(set(split(t.get("BL"), 2))) == 1 and t.get("Qts") and len(set(split(t.get("Qts"), 2))) == 1:
            notes.append("DATA PROBLEM: the page prints the same Bl and Qts for the 1+1 and 2+2 ohm versions; two different windings cannot share both, so at least one column is probably copied, not measured.")
        notes.append(f"Voice coil {t.get('Voice coil size', '?')}, cone {t.get('Cone', '?')}, magnet {t.get('Magnet', '?')}, coil wire {t.get('Voice coil wire', '?')}. Page lists only Fs, Qts, Bl, Re, Vas, Xmax, SPL of the T/S set.")
        sources = [{"fields": ["*"], "url": f"https://deafbonce.com/subwoofers/{slug}", "doc": "Deaf Bonce product page, Specifications table", "page": None, "read_date": "2026-11-21", "tier": 1}]
        boxes = BOX.get(slug, {}).get("boxes", [])
        if boxes: sources.append(BOX[slug]["source"])
        rec = driver(model=model, size_in=num(t.get("Size")), coil=coil, ohms_per_coil=oh, coils=nc, rms_w=rms, peak_w=num(t.get("MAX Power")),
            fs_hz=g("Fs"), re_ohm=re_val, qts=g("Qts"), bl_tm=g("BL"), vas_l=g("Vas"), xmax_mm=g("Xmax"), spl_db_1w1m=None,
            mounting_depth_mm=num(md.group(1)) if md else None, cutout_mm=num(co.group(1)) if co else None,
            recommended_boxes=boxes, status="current", sources=sources,
            notes=" ".join(notes) + (" SPL " + str(g("SPL")) + " dB printed without its test condition (kept in notes only)." if g("SPL") else ""))
        if coil == "QVC":
            rec["final_loads_ohm"] = [0.175, 0.7, 2.8]
            rec["notes"] += " QVC 4 x 0.7 ohm ('quad 0.7 Ohm'): all parallel 0.175, two series pairs in parallel 0.7, all series 2.8 ohm (calculated). None is exactly 2, 1 or 0.5 ohm; included for PM decision."
        out["avatar" if slug.startswith("avatar") else "deaf-bonce"].append(rec)
terms = ("deafbonce.com robots.txt: generic group disallows only /login/, /cart/, /my/; no website terms of use found on the pages read. Product pages read one at a time, 3 s apart, 2026-11-21. Numbers only. "
         "Manuals name the manufacturer as Ningbo Sound Solution I&E Trading Co., Ltd (China); brand owner Alphard (alphard.audio), Russian Federation listed first among its regional sites; HQ country UNVERIFIED (Russia assumed).")
ex = {"skipped_pages_without_specs": skipped, "below_2000w": low}
save("deaf-bonce", "Deaf Bonce (Alphard)", "Russia (UNVERIFIED; made in China per manuals)", "https://deafbonce.com/", terms, out["deaf-bonce"], no_ts=no_ts, extra=ex)
save("avatar", "Avatar (Alphard, sold on deafbonce.com)", "Russia (UNVERIFIED; Alphard group brand)", "https://deafbonce.com/subwoofers/", terms, out["avatar"])
