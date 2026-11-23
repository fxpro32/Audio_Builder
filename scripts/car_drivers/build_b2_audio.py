#!/usr/bin/env python3
"""R4_CAR_DRIVERS: B2 Audio (Denmark) car loudspeakers (pro-style midrange/midbass 6.5-8 in, coaxials, components, horns/drivers)
from b2audio.com product pages (WooCommerce), listed from the speakers, coaxials-and-components, drivers and horns categories,
read 2026-11-23 3 s apart. Spec sheet blocks print a group of 'Label:' tokens followed by the same number of values
(method of A2's scripts/hp_subs/b2_parse.py). 10-15 in models and subwoofers are R2's. EUR prices not stored.
Raw: references/raw/car_drivers/b2-audio/. Usage: python3 -I build_b2_audio.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/b2-audio/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def blocks(t):
    parts = t.split("|"); out = []; cur = None; i = 0; header = None
    while i < len(parts):
        p = parts[i].strip()
        if re.search(r"spec sheet$", p, re.I): header = p; cur = {"_header": header}; out.append(cur); i += 1; continue
        if cur is not None and p.endswith(":"):
            labels = []
            while i < len(parts) and parts[i].strip().endswith(":"): labels.append(parts[i].strip()[:-1]); i += 1
            vals = parts[i:i + len(labels)]; i += len(labels)
            for l, v in zip(labels, vals): cur.setdefault(l, v.strip())
            continue
        if p.startswith("Reviews"): cur = None
        i += 1
    return out


out, seen = [], set()
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    bl = blocks(t)
    title = re.search(r"\|([^|]{3,60}) - B2 audio\|", t)
    name = title.group(1).strip() if title else fn[2:-5].upper()
    slug = fn[2:-5]
    if not bl: print("no spec block", slug); continue
    for b in bl:
        hdr = b.get("_header", "")
        model = re.sub(r"(?i)\s*spec sheet$", "", hdr).strip() or name
        if model in seen: continue
        seen.add(model)
        nl = (name + " " + slug + " " + hdr).lower()
        if re.search(r"rageh1|cdr|horn|driver", nl): typ = "tweeter"
        elif re.search(r"\b(65x|69x|8cxp)\b|65x|69x|cxp", nl): typ = "coaxial"
        elif re.search(r"rage6[13]|riot61|refsq63", slug): typ = "component_set"
        else: typ = "midbass"
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:\"|”|″|inch)", t[:t.find("spec sheet")] if "spec sheet" in t else "")
        size = {"6": 6.5}.get(None)
        ms = re.search(r"(?:rage|riot|ref|cfm-?)(\d{1,2})", slug.replace("refsq", "ref"))
        code = ms.group(1) if ms else ""
        size = {"6": 6.5, "8": 8, "61": 6.5, "63": 6.5, "65": 6.5, "69": None}.get(code[:2] if code.startswith(("61", "63", "65", "69")) else code[:1])
        lab = "6x9" if "69" in code[:2] else None
        if typ == "tweeter": size, lab = None, "compression driver / horn" if "h1" in slug or "cdr" in slug else None
        fr = None
        mf = re.search(r"([\d.,]+)\s*(K?)Hz\s*[~\-–]\s*([\d.,]+)\s*(K|k)?Hz", b.get("Frequency Response", ""), re.I)
        if mf: fr = [num(mf.group(1)) * (1000 if mf.group(2) else 1), num(mf.group(3)) * (1000 if mf.group(4) else 1)]
        pw = b.get("Power Handling", "")
        mp = re.findall(r"(\d+)\s*W", pw)
        rms = peak = None
        if len(mp) >= 2: peak, rms = max(int(x) for x in mp[:2]), min(int(x) for x in mp[:2])
        elif mp: rms = int(mp[0])
        vas = b.get("VAS", "")
        fsr = b.get("Resonance Frequency") or ""
        p_ = {"fs_hz": (num(fsr) * 1000 if re.search(r"k\s*hz", fsr, re.I) else num(fsr)), "qms": num(b.get("QMS")), "qes": num(b.get("QES")), "qts": num(b.get("QTS")),
              "vas_l": num(vas) if re.search(r"L\b", vas) else None, "mms_g": num(b.get("MMS")), "sd_cm2": num(b.get("SD")), "le_mh": num(b.get("LE")),
              "xmax_mm": num(b.get("Xmax")) if b.get("Xmax") else None, "re_ohm": num(b.get("RE") or b.get("Re")) if (b.get("RE") or b.get("Re")) else None}
        sens = num(b.get("Sensitivity"))
        notes = ["Power printed as 'peak / RMS' (larger value taken as peak)."] if len(mp) >= 2 else []
        if b.get("BL^2/RE"): notes.append(f"Maker prints BL^2/RE {b['BL^2/RE']} (not Bl).")
        if sens: notes.append("Sensitivity printed without a drive reference; basis unknown.")
        if b.get("Effiency"): notes.append(f"Maker efficiency {b['Effiency']}.")
        extra = {k2: v for k2, v in (("magnet_as_printed", b.get("Magnet Type")), ("cone_material", b.get("Cone Material")), ("voice_coil_as_printed", b.get("Voice Coil Dim"))) if v}
        r = rec(f"B2 Audio {model}", typ, size, lab, num(b.get("Nominal Impedance")), "SVC", rms, peak, sens, "unknown" if sens else None, fr,
                (b.get("Magnet Type") or "").lower() or None, p_, "unknown", sources=[src(url, ["*"], doc="product page, spec sheet block")], notes=" ".join(notes), extra=extra)
        if not any(v for v in p_.values()) and not rms and not sens: print("no numbers", model); continue
        out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("b2-audio", "B2 Audio", "Denmark", "https://www.b2audio.com", "R4 2026-11-23: product pages read 3 s apart (A2 read the same site for subs). Numbers only.", out)
