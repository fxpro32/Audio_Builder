#!/usr/bin/env python3
"""R2_SUBS_ALL: copy every data/hp_subs_raw/{us,world}/<brand>.json into data/car_subs_raw/<region>/ (records tagged
source "hp_subs_raw"), only where no car_subs_raw file exists yet (a brand builder's file is never overwritten).
Usage: python3 -I seed_from_hp.py"""
import sys, json, glob, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import save, ROOT, HP
for f in sorted(glob.glob(HP + "/*/*.json")):
    region, slug = f.split("/")[-2], os.path.basename(f)[:-5]
    if os.path.exists(f"{ROOT}/{region}/{slug}.json"): print("exists, kept:", region, slug); continue
    h = json.load(open(f))
    save(region, slug, h["brand"], h["country"], h["brand_url"], "", [], [],
         coverage="hp_subs_raw copy only (>= 2000 W RMS models); lower-power models NOT yet collected by R2_SUBS_ALL",
         extra={k: v for k, v in h.items() if k not in ("brand", "country", "brand_url", "terms_note", "drivers", "no_ts_published")})
