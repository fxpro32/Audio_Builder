#!/usr/bin/env python3
"""R3: amplifier records from saved maker product pages (generic spec-text parser). Usage: build_amps_pages.py <brand-slug> "<Brand>" <pages dir> <list.txt> [spec-anchor]
Anchor = text that starts the spec block (default tries 'Tech Specs', 'Specifications', 'SPECIFICATIONS')."""
import sys, re, os, glob, html; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
key, brand, D, L = sys.argv[1:5]; anchors = [sys.argv[5]] if len(sys.argv) > 5 else ["Tech Specs", "Specifications", "SPECIFICATIONS", "Specs"]
urls = {re.sub(r"/+$", "", u.strip()).split("/")[-1]: u.strip() for u in open(L) if u.strip()}
recs = []; skipped = []
for n, url in urls.items():
    f = f"{D}/p_{n}.html"
    if not os.path.exists(f): continue
    if re.search(r"(?i)processor|dsp(?!.*amp)", n): skipped.append({"title": n, "reason": "sound processor, not an amplifier (see dsp category)"}); continue
    raw = open(f, errors="replace").read(); t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I))
    og = re.search(r'property="og:title" content="([^"]*)"', raw); jn = re.search(r'"name":"([^"]{3,40})"', raw)
    title = re.sub(r"\s+", " ", html.unescape(og.group(1) if og else ([x for x in re.findall(r"<title>(.*?)</title>", raw, re.S) if x.strip() not in ("Arrow", "")] or [n])[0])).strip()
    jmodel = jn.group(1).strip() if jn and re.search(r"\d", jn.group(1)) and re.match(r"^[A-Z0-9][A-Z0-9.\-/ ]+$", jn.group(1).strip()) else None
    i = max([t.rfind(a) for a in anchors]); spec = t[i:i + 5000] if i >= 0 else t
    rat = ratings(spec) or ratings(t)
    cur = re.search(r"(?i)current (?:draw|consumption)[^|:]{0,40}:?\s*\|?\s*(?:max\.?\s*)?(\d+(?:\.\d+)?)\s*A(?:mps?)?\b", t)
    fz = re.search(r"(?i)fuse(?: rating| size)?\s*:?\s*\|?\s*(\d{2,3})\s*A(?:mps?)?\s*(?:x\s*(\d))?", t)
    pw = re.search(r"(?i)(?:power|power/ground)\s*(?:wire|cable)[^|:]{0,25}:?\s*\|?\s*(\d/0|\d{1,2})\s*(?:AWG|ga|gauge)", t)
    ch = re.search(r"(?i)(\d)[\s-]*channel", title) or re.search(r"(?i)(\d)[\s-]*channel", spec)
    mono = re.search(r"(?i)mono", title)
    v = re.search(r"(?i)(1[234](?:\.\d)?)\s*V(?:DC)?\s*,?\s*≤?\s*1\s*%\s*THD", t) or re.search(r"(?i)(?:@|at)\s*(1[234](?:\.\d)?)\s*V", spec)
    recs.append({"id": f"{key}-{n}"[:90], "model": None, "title": title[:150], "status": "maker page " + TODAY,
                 "class": "AB" if re.search(r"(?i)class[\s-]*a/?b\b", spec + title) else ("D" if re.search(r"(?i)class[\s-]*d\b", t) else None),
                 "channels": int(ch.group(1)) if ch else (1 if mono else None), "rms_ratings": rat, "rated_voltage_v": float(v.group(1)) if v else None,
                 "cta2006": True if re.search(r"(?i)CTA[- ]?2006|CEA[- ]?2006", t) else None, "min_load_ohm": min([x["ohm"] for x in rat if not x["bridged"]], default=None),
                 "fuse_onboard_a": (int(fz.group(1)) * (int(fz.group(2)) if fz.group(2) else 1)) if fz else None, "power_wire_awg_maker": pw.group(1) if pw else None,
                 "current_draw_a": float(cur.group(1)) if cur else None, "dims_mm": dims_in(spec) or dims_in(t),
                 "prices_aud": [], "prices_other": [], "sources": [{"fields": ["all values"], "url": url, "read_date": TODAY, "tier": "maker"}],
                 "check": "auto-parsed from the maker page text by scripts/parts/build_amps_pages.py; spot-check before relying on a value", "notes": "" if rat else "no RMS rating parsed"})
    if jmodel: recs[-1]["model"], recs[-1]["model_basis"] = jmodel, "maker page product name"
    else:
        mp, mb = model_pick(title, []); recs[-1]["model"], recs[-1]["model_basis"] = (mp, mb) if mp else (n.upper(), "page address")
write("amplifiers", key, {"brand": brand, "maker_site": re.match(r"https?://[^/]+", next(iter(urls.values()))).group(0), "method": f"maker product pages ({L.split('/')[-2]}), 3 s apart; generic parser",
      "terms_note": "Numbers only with URL.", "units": {"w_per_ch": "W RMS", "dims_mm": "mm"}}, recs, skipped)
