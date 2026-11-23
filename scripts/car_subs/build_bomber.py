#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): Bomber (Brazil) all sub/woofer product pages in the maker's product sitemap
(https://www.bomber.com.br/wp-sitemap-posts-product-1.xml, 108 entries with 'sub' or 'woofer'; quadriaxial 6x9 left out), read as text
3 s apart into references/raw/car_subs/bomber/pages/. Each page has a 'Especificação | Valor' table and a 'Parâmetros Thiele-Small' table
(Portuguese labels mapped below; decimal commas). Products titled 'Woofer' are Brazilian mid-bass/bass-wall drivers (noted).
The 4 hp_subs_raw records (from the maker manuals) win on equal model names. Usage: python3 -I build_bomber.py"""
import sys, os, re, unicodedata
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
D = "/workspace/references/raw/car_subs/bomber/pages/"
LAB = {"Fs (frequência de ressonância)": "fs_hz", "Vas (volume equivalente do falante)": "vas_l", "Qts (fator de qualidade)": "qts",
       "Qes (fator de qualidade elétrico)": "qes", "Qms (fator de qualidade mecânico)": "qms", "Sd (área efetiva do cone)": "sd_cm2",
       "βL (densidade de fluxo bobina)": "bl_tm", "Re (resistência elétrica)": "re_ohm", "Mms (massa móvel)": "mms_g",
       "Le @ 1 kHz (indutância da bobina)": "le_mh", "Xmax (deslocamento máx. pico)": "xmax_mm"}
import json
HPC = set(re.findall(r"\d\.\d\d\.\d{3}", " ".join(d["model"] for d in json.load(open("/workspace/data/hp_subs_raw/world/bomber.json"))["drivers"])))
drivers = []
for f in sorted(os.listdir(D)):
    if not f.endswith(".txt"): continue
    t = unicodedata.normalize("NFC", open(D + f, encoding="utf-8").read())
    i = t.find("Especificações Técnicas")
    if i < 0: print("no table:", f); continue
    toks = [x.strip() for x in t[i:].replace("\n", " ").split("|")]
    kv = {}
    for a, b in zip(toks, toks[1:]):
        a = re.sub(r"^.*?(Especificação|Valor)\s*", "", a).strip() if a.startswith(("Especificações", "Parâmetros")) else a
        kv.setdefault(a, b)
    title = (t.strip().splitlines() or [""])[0].split(" - ")[0].strip() or f[:-4]
    model = kv.get("Modelo") or f[:-4]
    if kv.get("Código") in HPC: print("hp_subs_raw already has code", kv.get("Código"), model); continue
    n = lambda s: num(s.replace(".", "").replace(",", ".")) if s and re.search(r"\d", s) else None
    p = {}
    for lab, k in LAB.items():
        v = kv.get(lab)
        if v: p[k] = num(v.split("+")[0].replace(",", ".")) if k == "re_ohm" else num(v.replace(",", "."))
    imp = kv.get("Impedância nominal") or ""
    m2 = re.match(r"\s*(\d+(?:,\d+)?)\s*\+\s*(\d+(?:,\d+)?)", imp)
    coil, ohm = ("DVC", num(m2.group(1).replace(",", "."))) if m2 else ("SVC", num(imp.replace(",", "."))) if imp else (None, None)
    size = num((kv.get("Tamanho") or "").replace(",", ".")) or num((re.search(r"-(\d+)-", f) or [None, None])[1])
    notes = [f"Maker product page tables ('Especificações Técnicas', 'Parâmetros Thiele-Small'); code {kv.get('Código')}, page title '{title[:80]}'."]
    if "Re (resistência elétrica)" in kv: notes.append(f"Re printed '{kv['Re (resistência elétrica)']}' (re_ohm = first coil).")
    if "Sensibilidade" in kv: notes.append(f"T/S sensitivity {kv['Sensibilidade']} (condition not stated, not entered).")
    if kv.get("Volume alto falante ocupado na caixa"): notes.append(f"Driver displacement printed {kv['Volume alto falante ocupado na caixa']}.")
    if kv.get("Dimensões do produto (L x A x P)"): notes.append(f"Product dimensions {kv['Dimensões do produto (L x A x P)']}.")
    if f.startswith("woofer") or title.lower().startswith("woofer"): notes.append("Sold as 'Woofer': Brazilian mid-bass / bass-wall driver (often high Fs, small Vas), not a deep-bass subwoofer.")
    if p.get("xmax_mm"): notes.append("Xmax is the page's 'deslocamento máx. pico' (peak, one way).")
    rms = n((kv.get("Potência (RMS)") or "").split("W")[0])
    if rms is None:
        mt = re.search(r"(?i)(\d[\d.]*)\s*(?:W|WATTS)\s*RMS|(\d[\d.]*)\s*WRMS", title)
        if mt: rms = n(mt.group(1) or mt.group(2)); notes.append("RMS from the page title (no 'Potência (RMS)' row).")
    drivers.append(rec(model, size, coil, ohm, rms, None, p, "unknown", status="current",
                       sources=[src("https://www.bomber.com.br/produto/" + f[:-4] + "/", doc="product page, Especificações Técnicas + Parâmetros Thiele-Small tables")],
                       notes=" ".join(notes)))
save("world", "bomber", "Bomber (Thomas K. L. Ind. de Alto-Falantes)", "Brazil", "https://www.bomber.com.br/",
     "R2B 2026-11-23: product sitemap + sub/woofer product pages read one at a time, 3 s apart; robots.txt disallows only WooCommerce/admin paths. Numbers only.",
     drivers, [], upgrade_listed=True, coverage="every sub/woofer product in the maker's product sitemap (Bicho Papão, Atrack, Rush, Upgrade, Slim, Carbon, B-One/B-Duo/W-One, Outdoor; all power levels)")
