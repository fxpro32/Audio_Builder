#!/usr/bin/env python3
"""Parse B2 Audio product page spec blocks (labels group then values group) from saved HTML. Prints JSON per page."""
import sys, re, json, subprocess
out = {}
for f in sys.argv[1:]:
    t = subprocess.run([sys.executable, "-I", "/workspace/scripts/hp_subs/fetch_text.py", "x", f, "--nofetch"], capture_output=True, text=True).stdout
    t = t.replace("Spec Shee|t|", "Spec Sheet|")
    parts = t.split("|"); blocks = []; cur = None; i = 0; header = None
    while i < len(parts):
        p = parts[i].strip()
        if re.fullmatch(r"(SINGLE|DUAL)\s*[\d.,]+\s*Ω", p, re.I) or re.search(r"Spec Sheet$", p): header = p
        if p == "Frequency Response:":
            cur = {"_header": header}; blocks.append(cur)
        if cur is not None and p.endswith(":"):
            labels = []
            while i < len(parts) and parts[i].strip().endswith(":"): labels.append(parts[i].strip()[:-1]); i += 1
            vals = parts[i:i + len(labels)]; i += len(labels)
            for l, v in zip(labels, vals): cur[l] = v.strip()
            if "Displacement" in labels: cur = None
            continue
        i += 1
    title = re.search(r"\|([^|]{3,60}) – B2 Audio", t)
    out[f] = {"title": title.group(1) if title else None, "blocks": blocks}
print(json.dumps(out, indent=0, ensure_ascii=False))
