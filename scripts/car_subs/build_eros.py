#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): Eros Alto-Falantes (Brazil), all bass product pages A3 saved on 2026-11-22
(references/raw/hp_subs/world/eros/pages/, no new requests). Pages print only POTÊNCIA MÁXIMA (RMS), POTÊNCIA MUSICAL and
IMPEDÂNCIA NOMINAL (separate SVC versions); maker PDFs are drawings/images without T/S (A3). So every model is listed without T/S.
The 7 models already in hp_subs_raw keep their entries. Usage: python3 -I build_eros.py"""
import sys, os, re
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import save, num, src
D = "/workspace/references/raw/hp_subs/world/eros/pages/"
no_ts = []
for f in sorted(os.listdir(D)):
    if not f.endswith(".txt"): continue
    L = [l.strip() for l in open(D + f, encoding="utf-8") if l.strip()]
    title = L[0].split(" - ")[0].strip()
    g = lambda lab: next((L[i + 1].strip(" |") for i, l in enumerate(L[:-1]) if l.startswith(lab)), None)
    rms = num((g("POTÊNCIA MÁXIMA (RMS)") or "").replace("(RMS)", "").replace(".", ""))
    mus = num((g("POTÊNCIA MUSICAL") or "").replace(".", ""))
    imp = g("IMPEDÂNCIA NOMINAL")
    size = num((re.search(r"E-?(\d\d)", title) or [None, None])[1])
    url = "https://eros.com.br/produto/" + f[:-4] + "/"
    no_ts.append({"model": title.title().replace("Xbass", "XBass"), "rms_w": rms, "url": url, "size_in": size, "peak_w": mus,
                  "note": f"Product page: POTÊNCIA MÁXIMA (RMS) {rms} W, POTÊNCIA MUSICAL {mus} W, IMPEDÂNCIA NOMINAL '{imp}' (separate single-coil versions). No T/S published (page or PDF). "
                          "Brazilian 'woofer' for car bass walls (often high Fs); listed as a model only. Page saved by A3 on 2026-11-22.",
                  "sources": [src(url, doc="product page (saved by A3)", date="2026-11-22")]})
save("world", "eros", "Eros Alto-Falantes", "Brazil", "https://eros.com.br/",
     "R2B 2026-11-23: built from the 31 product pages A3 saved on 2026-11-22 (no new requests). Numbers only.", [], no_ts,
     coverage="every bass product page A3 saved (12, 15, 18 in Hammer, Target, Strike, Panzer, XBass lines; all power levels); no T/S published, all listed incomplete")
