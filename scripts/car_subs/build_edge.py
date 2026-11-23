#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): EDGE Car Audio (UK) subwoofers from the maker's 2019 catalogue PDF that A3 saved
(references/raw/hp_subs/world/edge/EDGE_2019_Catalogue.pdf; text layer in references/raw/car_subs/edge/EDGE_2019_Catalogue.txt).
Pages 24-25 'Subwoofer Technical Data' carry 23 T/S blocks; the text layer lists model names and blocks in different orders, so each block
is matched to its model by (Fs, Re) as read on the rendered pages (references/raw/car_subs/edge/png/edge19_p24.png, edge19_p25.png).
No power in these tables: RMS is carried over from the hp_subs_raw entry where A3 read it from the 2018 catalogue, else left empty.
hp_subs_raw entries 'listed without T/S' for the same model are replaced by these records (upgrade_listed). Usage: python3 -I build_edge.py"""
import sys, re, json
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
T = open("/workspace/references/raw/car_subs/edge/EDGE_2019_Catalogue.txt", encoding="utf-8").read()
URL = None
for u in re.findall(r"https://cdn\.shopify\.com\S+EDGE_2019_Catalogue\.pdf\S*", json.dumps(json.load(open("/workspace/data/hp_subs_raw/world/edge.json")))): URL = u.rstrip('"\\,'); break
URL = URL or "EDGE_2019_Catalogue.pdf (URL as in data/hp_subs_raw/world/edge.json)"
HP = {n["model"]: n for n in json.load(open("/workspace/data/hp_subs_raw/world/edge.json"))["no_ts_published"]}
KEY = {(30, 3.8): "EDB12D2-E7", (28, 4): "EDB12BR-E9", (35.4, 3.9): "EDS10D2-E7", (42.5, 2): "EDS8D2-E8", (35.4, 1.9): "EDS12D1-E7", (38.9, 3.9): "EDS12D2-E7",
       (37.5, 3.6): "EDP122SPL-E6", (29.9, 3.9): "EDB12D2X-E7", (25.5, 3.9): "EDB15D2X-E7", (33.7, 3.9): "EDS18D2-E7", (32.9, 2.8): "EDX12D1.4SPL-E7",
       (33.32, 3.8): "EDX12D2SPL-E7", (32.6, 1.7): "EDX12D1-E7", (28.35, 1.8): "EDX15D1SPL-E7", (32.3, 1.9): "EDS15D1-E7", (28.1, 1.7): "EDX15D1-E7",
       (25.71, 1.8): "EDX18D1SPL-E7", (40.2, 4): "EDP152SPL-E6", (34.6, 4): "EDS15D2-E7", (27.1, 3.8): "EDX18D1-E7", (33.4, 2): "EDS18D1-E7",
       (32.2, 1.8): "EDX12D1SPL-E7", (49.5, 3.6): "EDP122-E6"}
seg = T[T.index("Subwoofer Technical Data"):T.index("Pro Audio Midrange Speaker Technical Data")]
blocks = re.split(r"\n(?=Fs [\d.]+Hz)", seg)[1:]
f = lambda pat, b: (re.search(pat, b) or [None, None])[1]
drivers = []
for b in blocks:
    fs = num(f(r"Fs ([\d.]+)Hz", b)); re_ = num(f(r"Re ([\d.]+) Ohms", b)); model = KEY[(fs, re_)]
    vas_raw = f(r"Vas ([\d.,]+\s*\w+)", b); sd = num(f(r"SD ([\d.]+)m", b)); cms = f(r"Cms (\S+)", b)
    size = int(re.match(r"ED[A-Z](\d\d?)", model).group(1)[:2]) if not model.startswith("EDS8") else 8
    size = {12: 12, 15: 15, 18: 18, 10: 10}.get(size, size)
    mc = re.search(r"D(\d(?:\.\d)?)(?:X|SPL)?-", model)
    coil, ohm = ("DVC", num(mc.group(1))) if mc else (None, None)
    hp = HP.get(model, {})
    notes = ("2019 catalogue 'Subwoofer Technical Data' block (text layer; block matched to the model by Fs and Re on the rendered page). "
             f"Sd printed {sd} 'm/2' (m2). Cms printed '{cms}'. ts_basis not stated (Re close to one coil's or the series value; not stated). ")
    vas = num(vas_raw)
    if vas_raw and "mm" in vas_raw: notes += f"Vas printed '{vas_raw}' (unit misprint; the number is entered as litres, UNVERIFIED). "
    if model == "EDX12D1.4SPL-E7": coil, ohm = "DVC", None; notes += "Model name 'D1.4': coil impedance not clear, left empty. "
    if hp: notes += "RMS from the hp_subs_raw entry (2018 catalogue, A3): " + hp.get("note", "")[:160]
    drivers.append(rec(model, size, coil, ohm, hp.get("rms_w"), None,
                       dict(fs_hz=fs, bl_tm=num(f(r"BL ([\d.,]+)Tm", b).replace(",", ".")), vas_l=vas, spl_db_1w1m=None, re_ohm=re_, sd_cm2=round(sd * 1e4, 1) if sd else None,
                            qms=num(f(r"Qms ([\d.]+)", b)), qes=num(f(r"Qes ([\d.]+)", b)), mms_g=num(f(r"Mms ([\d.]+)g", b)), qts=num(f(r"Qts ([\d.]+)", b)),
                            xmax_mm=num((f(r"Xmax ([\d.,]+)mm", b) or "").replace(",", ".") or None)),
                       "unknown", status="UNVERIFIED (2019 catalogue)", sources=[src(URL, doc="EDGE 2019 catalogue PDF, Subwoofer Technical Data", page="24-25")],
                       notes=notes + " SPL printed " + str(f(r"SPL ([\d.]+)dB", b)) + " dB (condition not stated, not entered)."))
assert len(drivers) == 23, len(drivers)
save("world", "edge", "EDGE Car Audio", "UK", "https://www.edgecaraudio.co.uk/ (UNVERIFIED URL; catalogues hosted on cdn.shopify.com)",
     "R2B 2026-11-23: 2019 catalogue PDF saved by A3 (no new requests). Numbers only.", drivers, [],
     coverage="all 23 subwoofer T/S blocks of the 2019 catalogue (DB, DBX, Street, Xtreme, Unlimited series; all power levels) + hp_subs_raw 2018 entries", upgrade_listed=True)
