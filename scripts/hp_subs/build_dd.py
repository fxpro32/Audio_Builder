#!/usr/bin/env python3
"""A2: DD Audio (Digital Designs, Oklahoma City) records, parsed with dd_specs.py from ddaudio.com product pages read 2026-11-21
(raw copies in references/raw/hp_subs/us/dd-audio/ and .../archive/). One T/S set per model (not per coil option)."""
import sys, json, subprocess, re, glob, os; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box_range, src, save
R = "/workspace/references/raw/hp_subs/us/dd-audio/"
def num(s):
    if s is None: return None
    s = s.strip(); m = re.fullmatch(r"(\d+)\s+(\d+)/(\d+)", s)
    if m: return round(int(m[1]) + int(m[2]) / int(m[3]), 4)
    m = re.fullmatch(r"(\d+)/(\d+)", s)
    if m: return round(int(m[1]) / int(m[2]), 4)
    try: return float(s)
    except ValueError: return None
files = sorted(glob.glob(R + "*.html")) + sorted(glob.glob(R + "archive/*.html"))
files = [f for f in files if not f.endswith(("terms.html", "archive.html"))]
specs = json.loads(subprocess.run([sys.executable, "-I", "/workspace/scripts/hp_subs/dd_specs.py", *files], capture_output=True, text=True).stdout)
# page URL per file: from sitemap (current) or archive list
urls = {}
for line in open(R + "archive_subs.txt"): u = line.strip(); urls[R + "archive/" + u.rstrip("/").split("/")[-1] + ".html"] = u
for u in re.findall(r"<loc>([^<]+/subwoofers/[^<]+)", open(R + "product-sitemap.xml").read()): urls[R + u.rstrip("/").split("/")[-1] + ".html"] = u
PROBLEMS = {
 "9918c": "DATA PROBLEM: Qms 2.265 with Qes 0.5167 gives Qts 0.42, not the published 0.4705; Fs 26.24 Hz and Vas 161.9 L are identical to the 9921c page (likely copied). Check with the maker.",
 "9918b-esp": "DATA PROBLEM: same T/S as 9918c (Qts 0.4705 vs Qms/Qes); Fs/Vas identical to 9921b.",
 "9512l": "T/S identical to 9512k (ESP) page.", "9515l-esp": "T/S identical to 9515k (ESP) page.", "9518l-esp": "T/S identical to 9518k (ESP) page.",
 "9921c": "Fs 26.24 Hz and Vas 161.9 L are identical to the 9918c page (one of the two is likely copied).",
}
drivers, no_ts = [], []
for f in files:
    v = specs.get(f, {}); name = os.path.basename(f)[:-5]; url = urls.get(f)
    rms_s = v.get("Watts RMS"); imp = v.get("Voice Coil Impedance") or ""
    if not rms_s or not url: continue
    parts = [num(x) for x in re.split(r"\s*[–-]\s*", rms_s)]
    rms_lo, rms_hi = parts[0], parts[-1]
    if rms_hi is None or rms_hi < 2000: continue
    title = (v.get("title") or {"9515l-esp": "9515L (ESP)", "z418-esp": "Z418 (ESP)"}.get(name, name)).split(":")[0].strip().replace("2024)", "2024")
    status = "discontinued" if "/archive/" in f else "current"
    ohms = [int(x) for x in re.findall(r"D(\d)", imp)]
    if not v.get("Fs (Hz)"):
        no_ts.append({"model": f"{title} ({imp})", "rms_w": rms_hi, "url": url, "note": f"{rms_s} W RMS, peak {v.get('Peak Power')} W; no T/S published on the maker page ({status})."}); continue
    p = dict(fs_hz=num(v.get("Fs (Hz)")), qms=num(v.get("Qms")), qes=num(v.get("Qes")), qts=num(v.get("Qts")), vas_l=num(v.get("Vas (Ltr)")), xmax_mm=num(v.get("Xmax (MM)")))
    rng = v.get("Ported Enclosure (CuFt)"); boxes = []
    if rng:
        a = re.split(r"\s*[–-]\s*", rng)
        if len(a) == 2: boxes.append(box_range("ported", num(a[0]), num(a[1]), None, "maker page " + url))
    note = (f"One T/S set published for the model (applies to both coil options as printed; Re, Bl, Mms, Sd not published). ts_basis not stated. "
            f"Piston diameter {v.get('Piston Diameter (In)')} in, Xmech {v.get('Xmech (MM)')} mm, voice coil {v.get('VCD (In)')} in published.")
    if "–" in rms_s or "-" in rms_s: note += f" RMS published as a range '{rms_s}' W; the upper bound is entered as rms_w and the full range is in rms_range_w."
    if name in PROBLEMS: note += " " + PROBLEMS[name]
    for ohm in ohms:
        drivers.append(rec(f"{title} D{ohm}", int(num(v.get('Speaker Size (In)'))), "DVC", ohm, rms_hi, num(v.get("Peak Power")), p, "unknown",
            depth_in=num(v.get("Mounting Depth (In)")), cut_in=num(v.get("Mounting Diameter (In)")), disp_cuft=num(v.get("Displacement (CuFt)")),
            boxes=boxes, status=status, sources=[src(url, doc="product page, Model Specs table" + (" (Product Archive, discontinued)" if status == "discontinued" else ""))], notes=note))
        if rms_lo != rms_hi: drivers[-1]["rms_range_w"] = [rms_lo, rms_hi]
save("dd-audio", "DD Audio (Digital Designs)", "https://ddaudio.com",
     "WordPress site. robots.txt disallows only /wp-admin/. Terms and Conditions https://ddaudio.com/terms-and-conditions/ (read 2026-11-23) say: \"You may use the content of this site only for the purpose of shopping on this site or placing an order on this site and for no other purpose. No materials from this site may be copied, reproduced, modified, republished, uploaded, posted, transmitted, or distributed in any form or by any means without our prior written permission.\" Only numeric specifications and source links are recorded here; no text or images. Pages read 5 s apart. Numbers only.",  # P1_PUBLIC_DATA: corrected terms note
     drivers, no_ts)
