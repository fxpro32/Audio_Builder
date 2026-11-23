#!/usr/bin/env python3
"""R3: fill the generated tables (counts, brands) into references/research_i_car_electronics.md (placeholders or previous generated blocks)."""
import subprocess, re
p = "/workspace/references/research_i_car_electronics.md"; s = open(p).read()
counts = subprocess.run(["python3", "-I", "/workspace/scripts/parts/counts.py"], capture_output=True, text=True).stdout.strip()
summary, detail = counts.split("\n\n")[1], counts.split("\n\n")[0]
block = "Totals per category:\n\n" + summary + "\n\nPer brand file (tier: maker = maker product pages; maker-store = maker's own online store data; retailer = Frankies Auto Electrics AU listing):\n\n" + detail
s = re.sub(r"<!-- COUNTS -->.*?<!-- /COUNTS -->|COUNTS_TABLE_PLACEHOLDER", lambda m: "<!-- COUNTS -->\n" + block + "\n<!-- /COUNTS -->", s, flags=re.S)
brands = open("/workspace/scripts/parts/brands_table.md").read().strip()
s = re.sub(r"<!-- BRANDS -->.*?<!-- /BRANDS -->|BRANDS_TABLE_PLACEHOLDER", lambda m: "<!-- BRANDS -->\n" + brands + "\n<!-- /BRANDS -->", s, flags=re.S)
open(p, "w").write(s); print("filled")
