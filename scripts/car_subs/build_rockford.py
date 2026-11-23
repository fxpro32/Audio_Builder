#!/usr/bin/env python3
"""R2_SUBS_ALL: Rockford Fosgate car subwoofers, all power levels, from rockfordfosgate.com product detail pages
(Specifications tab), saved in references/raw/car_subs/rockford/<slug>.html (read 2026-11-23). Metric values as printed
in brackets are used where given. Marine (M1/M2/RM) subs and enclosures are left out (car subs only).
Usage: python3 -I build_rockford.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save, num
R = "/workspace/references/raw/car_subs/rockford/"
U = "https://rockfordfosgate.com/products/details/"


def text(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


def g(spec, label, after=r"\|"):
    m = re.search(r"\|" + label + r"\|(?:\([^|]*\)\|)?(?:\(cm\|2\|\)\|)?([^|]+)", spec)
    return m.group(1).strip() if m else None


drivers = []
for f in sorted(glob.glob(R + "*.html")):
    slug = os.path.basename(f)[:-5]
    t = text(f)
    ms = [m.start() for m in re.finditer(r"Specifications\|(?!Support\|)(?=[^|]*\|[^|]*\|)", t) if re.match(r"Specifications\|(CEA|CTA|Frequency|Size|Power|Subwoofer|Nominal|Voice|Mounting|Qes|Qts|Fs|Sd|Speaker|Magnet|Re\||Le\||Vas|Xmax|Cutout|Woofer|Shipping|SPL)", t[m.start():])]
    if not ms: print("no spec", slug); continue
    i = ms[-1] - 1
    spec = t[i:t.find("|Support|", i) if t.find("|Support|", i) > 0 else i + 2500] + "|"
    title = re.search(r"<title>([^<]*)", open(f, encoding="utf-8", errors="replace").read())
    title = html.unescape(title.group(1)).strip() if title else slug
    size = num(g(spec, "Size"))
    vc = g(spec, "Voice Coil Type") or ""
    imp = g(spec, "Nominal Impedance") or ""
    coil = "DVC" if ("Dual" in vc or "Dual" in imp) else "SVC"
    ohm = num(imp)
    pw = re.search(r"Power Handling\|(?:\(Watts RMS\)\|)?([\d,]+) Watts RMS\|([\d,]+) Watts Max", spec)
    rms = num(pw.group(1).replace(",", "")) if pw else None
    peak = num(pw.group(2).replace(",", "")) if pw else None
    def mmv(lbl):
        m = re.search(r"\|" + lbl + r"\|[^|]*?\(([\d.]+)\s*(mm|cm)\)", spec) or re.search(r"\|" + lbl + r"\|[^|]*\|\(([\d.]+)\s*(mm|cm)\)", spec)
        if not m: return None
        return round(float(m.group(1)) * (10 if m.group(2) == "cm" else 1), 1)
    def lit(lbl):
        m = re.search(r"\|" + lbl + r"\|(?:\(Vb\)\|)?[^|]*?\(([\d.]+)\s*Liters?\)", spec) or re.search(r"\|" + lbl + r"\|(?:\(Vb\)\|)?[^|]*\|\(([\d.]+)\s*Liters?\)", spec)
        return float(m.group(1)) if m else None
    p = dict(qes=num(g(spec, "Qes")), qts=num(g(spec, "Qts")), fs_hz=num(g(spec, "Fs")), le_mh=num(g(spec, "Le")), re_ohm=num(g(spec, "Re")),
             sd_cm2=num(g(spec, "Sd")), vas_l=num(g(spec, "Vas")), qms=num(g(spec, "Qms")), xmax_mm=num(g(spec, "Xmax")))
    spl = re.search(r"\|SPL\|\(dB @ 1w/1m\)\|([\d.]+)", spec)
    if spl: p["spl_db_1w1m"] = num(spl.group(1))
    spl2 = re.search(r"\|SPL\|\(dB @ 2\.8\d?v/1m\)\|([\d.]+)|\|SPL \(2\.83V\)\|[^|]*\|([\d.]+)", spec, re.I)
    if spl2: p["spl_db_2v83"] = num(spl2.group(1) or spl2.group(2))
    boxes = []
    s, v = lit("Sealed Box Volume"), lit("Vented Box Volume")
    if s: boxes.append(box("sealed", None, None, "maker page " + slug, litres=s, note="maker Vb as printed in litres"))
    if v: boxes.append(box("ported", None, None, "maker page " + slug, litres=v, note="maker Vb as printed in litres; tuning not published"))
    model = slug.upper()
    series = re.sub(r"\s*\|.*", "", title)
    disc = "discontinued" if re.search(r"(?i)discontinued|no longer available", t[:i]) else "current"
    shallow = "shallow" if re.search(r"(?i)\|Subwoofer Type\|Shallow", spec) else ""
    drivers.append(rec(f"{model} ({series})" if series and series.upper() != model else model, size, coil, ohm, rms, peak, p,
                       "per_coil" if coil == "SVC" else "unknown",
                       depth_mm=mmv("Mounting Depth"), cut_mm=mmv("Cutout Diameter"), disp_l=lit("Woofer Displacement"), boxes=boxes,
                       status=disc, sources=[src(U + slug + "/", doc="product detail page, Specifications tab")],
                       notes="Power to CEA-2031 per maker. Mms, Bl not published. Metric values as printed in brackets."
                             + (" Shallow-mount model." if shallow else "")
                             + (" SVC: T/S are for the one coil." if coil == "SVC" else " DVC: maker does not say whether T/S are per coil, series or parallel.")))
seen = {}
for d in drivers:  # sitemap has old-style (p2d210) and new-style (p2d2-10) slugs; keep both only if values differ
    k = (d["size_in"], d["coil"], d["ohms_per_coil"], d["rms_w"], tuple(sorted((a, b) for a, b in d["params"].items() if b is not None)))
    if k in seen:
        seen[k]["notes"] += f" Same specifications also published at {d['sources'][0]['url']}."
        seen[k]["sources"].append(d["sources"][0]); d["_dup"] = True
    else: seen[k] = d
drivers = [d for d in drivers if not d.get("_dup")]
save("us", "rockford-fosgate", "Rockford Fosgate", "USA", "https://rockfordfosgate.com",
     "R2 2026-11-23: robots.txt 'Disallow:' empty (all allowed). Product pages read 4 s apart, one at a time. Numbers only.",
     drivers, [], coverage="all car subwoofer lines in the maker sitemap (Punch P1/P2/P3/P3S, Prime R1/R2/R2S, Power T0/T1/T1S/T2/T3); marine M1/M2/RM not included")
