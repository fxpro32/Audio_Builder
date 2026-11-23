# Builds data/hp_subs_raw/world/dynamic-state.json from dynamicstate.ru product pages ("характеристики" block), read 2026-11-21.
import glob, os, re, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
D = "/workspace/references/raw/hp_subs/world/dynamic_state/pages/"
SIZE = {"25": 10, "30": 12, "38": 15, "45": 18, "46": 18, "20": 8}
COPIED = {"sabvufer-serii-force-light-sw46d1-cc2", "sabvufer-serii-force-light-sw46d1-pc2"}
no_ts = []
def mmval(v):
    if not v: return None
    m = re.search(r"/\s*(\d+(?:[.,]\d+)?)", v)
    return num(m.group(1)) if m else num(v)
STOP = ("Популярные товары", "Видео", "К этому товару рекомендуем", "Будьте в курсе наших новых продуктов.")
out = []
for path in sorted(glob.glob(D + "*.txt")):
    slug = os.path.basename(path)[:-4]
    L = [l.strip() for l in open(path, encoding="utf-8")]
    i = L.index("характеристики"); j = min([L.index(s, i) for s in STOP if s in L[i:]])
    blk = L[i+1:j]; t = {}
    k = 0
    while k < len(blk) - 1:
        if blk[k] == "Дополнительная информация":
            t["extra"] = " ".join(blk[k+1:]); break
        t[blk[k]] = blk[k+1]; k += 2
    g = lambda key: t.get(key)
    imp = g("Номинальное сопротивление (Ом)") or ""
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)", imp)
    coil, oh, nc = ("DVC", num(m.group(1)), 2) if m else ("SVC", num(imp), 1)
    notes = []
    re_txt = g("Re (Om)"); re_val = None
    if re_txt:
        mm = re.match(r"(\d+(?:[.,]\d+)?)\s*\+", re_txt)
        re_val = num(mm.group(1)) if mm else num(re_txt)
        notes.append(f"Re printed '{re_txt}'" + (" (per coil)." if mm else "."))
        if not mm and coil == "DVC" and re_val and oh and re_val < oh * 0.75:
            notes.append(f"Re {re_val} ohm on a {imp} ohm DVC matches the two coils in parallel (inference, page does not state the T/S basis).")
    mms = None
    if t.get("extra"):
        mm = re.search(r"Mms\s*([\d.,]+)\s*g", t["extra"]); mms = num(mm.group(1)) if mm else None
        notes.append(f"Additional info on page: '{t['extra'][:120]}'.")
    md = g("Монтажная глубина посадки (мм)"); co = g("Монтажный диаметр посадки (мм)")
    md_v = mmval(md); co_v = mmval(co)
    title = next(l for l in L if l).split(" | ")[0].replace("Dynamic State ", "").replace("Сабвуфер серии ", "")
    if slug in COPIED:
        no_ts.append({"model": title, "rms_w": num(g("Мощность (Ватт RMS)")), "url": f"https://www.dynamicstate.ru/catalog/sabvufery/force/{slug}/",
            "note": "DATA PROBLEM: this 18 inch page prints Fs 37.1, Qts 0.529, Vas 40.58 L, Mms 422.3 g, identical to the 15 inch SW40D1-CC2 page, while its Sd is 1225.42 cm2; Vas calculated from Fs, Mms and that Sd would be about 93 L, so the T/S are copied and not used. Mounting depth " + str(md) + ", cut-out " + str(co) + ". Read 2026-11-21."})
        continue
    rng = (g("Размерность (см)") or "").split("-")[0]
    le = g("Le (mH)")
    notes.append(f"Labels translated: Мощность (Ватт Min/RMS/MAX) = power min/RMS/max (min {g('Мощность (Ватт Min)')} W); Чувствительность = sensitivity '{g('Чувствительность')}' (condition not stated, not put in spl fields); Монтажная глубина = mounting depth; Монтажный диаметр посадки = cut-out. Size class '{g('Размерность (см)')}' cm, exact size '{g('Точный размер (см)')}'. Voice coil '{g('Диаметр звуковой катушки (мм)')}'. Series {g('Серия')}.")
    out.append(driver(model=title, size_in=SIZE.get(rng) or (18 if "464" in (g("Точный размер (см)") or "") else 12 if "320" in (g("Точный размер (см)") or "") else None), coil=coil, ohms_per_coil=oh, coils=nc,
        rms_w=num(g("Мощность (Ватт RMS)")), peak_w=num(g("Мощность (Ватт MAX)")),
        fs_hz=num(g("Fs (Гц)")), re_ohm=re_val, qms=num(g("Qms")), qes=num(g("Qes")), qts=num(g("Qts")), vas_l=num(g("Vas (Литров)")),
        sd_cm2=num(g("Sd (cm2)")), xmax_mm=num(g("Xmax (mm)")), mms_g=mms, le_mh=num(le),
        mounting_depth_mm=md_v, cutout_mm=co_v, status="current",
        sources=[{"fields": ["*"], "url": f"https://www.dynamicstate.ru/catalog/sabvufery/{'force' if 'force' in slug else 'viking'}/{slug}/", "doc": "Dynamic State product page, характеристики block", "page": None, "read_date": "2026-11-21", "tier": 1}],
        notes=" ".join(notes)))
save("dynamic-state", "Dynamic State (DST)", "Russia", "https://www.dynamicstate.ru/",
     "No website terms of use found on pages read; pages read one at a time, 3 s apart, 2026-11-21. Numbers only.",
     out, no_ts=no_ts, extra={"excluded_notes": "Other Dynamic State subs (Custom, Force P5W, Pro, Sarmat, Skif, Viking VSW 16x to 42x and Axe) are below 2000 W RMS per their pages read 2026-11-21 (Viking VSW-31D2/41D2 1800 W)."})
