#!/usr/bin/env python3
"""R3B: pick a reproducible random sample of parts_raw records (seed 23) for the manual spot check. Usage: spotcheck_sample.py N_amps N_other"""
import json, glob, random, sys
random.seed(23); na, no = int(sys.argv[1]), int(sys.argv[2])
recs = [(f.split("/")[-2], r["id"]) for f in sorted(glob.glob("/workspace/data/parts_raw/*/*.json")) if "/_" not in f for r in json.load(open(f))["records"]]
amps = [x for x in recs if x[0] == "amplifiers"]; other = [x for x in recs if x[0] in ("dsp", "distribution", "fuses", "terminals", "cable", "capacitors")]
for c, i in random.sample(amps, na) + random.sample(other, no): print(c, i)
