#!/bin/bash
# R3: rebuild every data/parts_raw file from the saved raw copies (no network). Order matters: maker builders first, then Frankies, then the AUD join.
set -e; cd /workspace/scripts/parts
for b in sundown american-bass ampere audiopipe cerwin-vega ds18 audiocontrol; do python3 -I build_amps_shopify.py $b; done
python3 -I build_amps_shopify.py taramps >/dev/null; python3 -I build_taramps_br.py
python3 -I build_kicker_amps.py; python3 -I build_rockford_amps.py; python3 -I build_kenwood_amps.py
python3 -I build_amps_pages.py alpine "Alpine" /workspace/references/raw/parts/pages/alpine /workspace/references/raw/parts/pages/alpine/list.txt "Tech Specs"
python3 -I build_dd_amps.py
python3 -I build_dsp_shopify.py audiocontrol; python3 -I build_ds18_accessories.py; python3 -I build_narva.py; python3 -I build_knukonceptz.py; python3 -I build_rockford_acc.py
python3 -I cable_tables.py >/dev/null
python3 -I build_caps_shopify.py; python3 -I build_skyhigh.py
python3 -I build_frankies.py
python3 -I join_au_prices.py
echo RUN_ALL_DONE
