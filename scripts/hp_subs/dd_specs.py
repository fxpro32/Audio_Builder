#!/usr/bin/env python3
"""Parse the 'Model Specs' label|value|explanation block of a saved ddaudio.com product page into JSON (stdout)."""
import sys, re, html, json
LABELS = ["Speaker Size (In)","Watts RMS","Peak Power","VCD (In)","Voice Coil Impedance","Piston Diameter (In)","Fs (Hz)","Qms","Qes","Qts","Vas (Ltr)",
          "Xmech (MM)","Xmax (MM)","Frame OD (In)","Frame OD w/ Gasket (In)","Mounting Diameter (In)","Mounting Depth (In)","Motor Diameter (In)",
          "Motor Depth (In)","Displacement (CuFt)","Ported Enclosure (CuFt)","Sealed Enclosure (CuFt)","Weight (Lbs)","Re (Ohms)","Sd","Mms","BL","Le","Sensitivity"]
out = {}
for f in sys.argv[1:]:
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S); t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); t = re.sub(r"(\s*\|\s*)+", "|", t)
    i = t.find("Model Specs|Model Specs|"); j = t.find("|Buy Online", i)
    seg = t[i + 24:j].split("|") if i >= 0 else []
    title = re.search(r"\|([^|]{2,40}): ([^|]+Subwoofer)\|", t)
    d = {"title": title.group(0).strip("|") if title else None}
    k = 0
    while k < len(seg) - 1:
        if seg[k] in LABELS or seg[k].endswith(")") and len(seg[k]) < 40:
            d[seg[k]] = seg[k + 1]; k += 3 if (k + 2 < len(seg) and len(seg[k + 2]) > 25) else 2
        else: k += 1
    out[f] = d
print(json.dumps(out, indent=0, ensure_ascii=False))
