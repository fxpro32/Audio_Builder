#!/usr/bin/env python3
"""R4_CAR_DRIVERS: print a compact table of records for a brand slug (all types). Usage: python3 -I show.py <slug>"""
import json, glob, sys
for f in sorted(glob.glob(f"/workspace/data/car_drivers_raw/*/{sys.argv[1]}.json")):
    d = json.load(open(f))
    for r in d["drivers"]:
        p = r["params"]
        print(f"{r['type'][:5]:5} {r['model'][:38]:38} sz={r['size_in']} {r['size_label'] or ''} z={r['impedance_ohm']} rms={r['rms_w']}/{r['peak_w']} sens={r['sensitivity_db']}({r['sensitivity_basis']}) fr={r['freq_range_hz']} "
              f"fs={p['fs_hz']} qts={p['qts']} qes={p['qes']} qms={p['qms']} vas={p['vas_l']} sd={p['sd_cm2']} xm={p['xmax_mm']} mms={p['mms_g']} bl={p['bl_tm']} re={p['re_ohm']} "
              f"dep={r['mounting_depth_mm']} cut={r['cutout_mm']} od={r['frame_mm']} xo={r['recommended_crossover']} set={len(r['set_parts'] or [])} of={r['part_of_sets']}")
