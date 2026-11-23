# Builds bomber.json, triton.json, eros.json, selenium-jbl-brasil.json (Brazil) from maker manuals / data sheets / product pages, read 2026-11-21/22.
import os, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
def s(url, doc, fields=("*",), page=1, tier=1): return {"fields": list(fields), "url": url, "doc": doc, "page": page, "read_date": "2026-11-21", "tier": tier}
MID = "Brazilian 'woofer' for car bass/midbass walls: high Fs, small Vas; meets the power and load rule but is not a deep-bass subwoofer. "
BU = "https://www.bomber.com.br/wp-content/uploads/"
B = [
 driver(model="Woofer 12\" Atrack 5K 2 ohms (1.32.057)", size_in=12, coil="SVC", ohms_per_coil=2, coils=1, rms_w=2500, fs_hz=80, re_ohm=1.84, qms=17.9, qes=0.73, qts=0.7, vas_l=10.51,
        sd_cm2=511, mms_g=139.15, bl_tm=13.22, le_mh=0.45, status="current",
        sources=[s(BU + "2025/06/3.27.431-1.32.057-MANUAL-WOOFER-12-ATRACK-5K-2-OHMS-2500-WATTS-RMS.pdf", "3.27.431 manual, Woofer 12\" Atrack 5K 2 ohms 2500 W RMS")],
        notes=MID + "Le 0.45 mH at 1 kHz (0.24 mH at 10 kHz); Zmin 2.92 ohm; Cms 0.03 mm/N; reference efficiency 0.69 %; T/S 'sensitivity' 90.6 dB SPL (condition not stated, not in spl fields). Xmax, cut-out and depth appear only in a drawing table whose numbers could not be matched to labels with certainty; left out. Manual also gives suggested vented boxes (round, rectangular, triangular port) in a table not transcribed."),
 driver(model="Woofer 15\" Atrack 5K 2 ohms (1.32.055)", size_in=15, coil="SVC", ohms_per_coil=2, coils=1, rms_w=2500, fs_hz=59, re_ohm=1.75, qms=11.35, qes=0.44, qts=0.42, vas_l=33.88,
        sd_cm2=819, mms_g=204.82, bl_tm=17.38, le_mh=0.40, status="current",
        sources=[s(BU + "2025/06/3.27.429-1.32.055-MANUAL-WOOFER-15-ATRACK-5K-2-OHMS-2500-WATTS-RMS.pdf", "3.27.429 manual, Woofer 15\" Atrack 5K 2 ohms 2500 W RMS")],
        notes=MID + "Le 0.40 mH at 1 kHz; Zmin 2.75 ohm; Cms 0.04 mm/N; efficiency 1.49 %; T/S sensitivity 94.2 dB SPL (condition not stated). Xmax/dimensions left out (drawing table not mappable)."),
 driver(model="Woofer 12\" Atrack 6.5K 2 ohms (1.32.075)", size_in=12, coil="SVC", ohms_per_coil=2, coils=1, rms_w=3250, fs_hz=80, re_ohm=1.86, qms=13.91, qes=0.68, qts=0.65, vas_l=10.20,
        sd_cm2=511, mms_g=141.5, bl_tm=13.91, le_mh=0.4552, status="current",
        sources=[s(BU + "2026/01/3.27.447-1.32.075-MANUAL-WOOFER-12-ATRACK-6.5K-2-OHMS-3250-WATTS-RMS.pdf", "3.27.447 manual, Woofer 12\" Atrack 6.5K 2 ohms 3250 W RMS")],
        notes=MID + "Bl printed '13,91' without unit (T m assumed); Mms printed '141,5' without unit (g assumed); Cms 0.028 mm/N; Zmin 3.07 ohm; T/S sensitivity 90.85 dB SPL. Xmax/dimensions left out."),
 driver(model="Subwoofer Bicho Papão BPF 5K 4+4 ohms (1.23.110)", size_in=None, coil="DVC", ohms_per_coil=4, coils=2, rms_w=2500, peak_w=5000, fs_hz=32, re_ohm=2.84, qms=16.69, qes=0.62, qts=0.60, vas_l=64,
        sd_cm2=779, xmax_mm=17.5, mms_g=326, bl_tm=24.59, le_mh=6.36, status="current",
        sources=[s(BU + "2024/09/3.27.403-1.23.110-MANUAL-SUBWOOFER-14-BICHO-PAPAO-5K-44-OHMS-2500-WATTS-RMS.pdf", "3.27.403 / 3.27.365 Rev. 00 manual, Subwoofer Bicho Papão 5K 4+4 ohms 2500 W RMS")],
        notes="Re printed '2,84 + 2,87' ohm (per coil; re_ohm = first coil). Power: 2500 W RMS, 5000 W 'competição'. File name says 14 inch, product listing says 15 inch; size left empty (UNVERIFIED). Cms 0.08 mm/N; Le 2.63 mH at 10 kHz; efficiency 0.33 %. Xmax is the manual's 'deslocamento máx. pico' (peak, one way). Final load 2 ohm with coils in parallel."),
]
BNO = [
 {"model": "Subwoofer 15\" Bicho Papão 2000 W RMS 2+2 ohms", "rms_w": 2000, "url": "https://www.bomber.com.br/produto/subwoofer-15-bicho-papao-2000-wrms-2-2-ohms/", "note": "DVC 2+2 ohm (final 1 or 4 ohm). Manual https://www.bomber.com.br/wp-content/uploads/2022/09/3.27.140_Manual-Sub-BP-2000W.pdf has the T/S table as an image (no text); product page table values could not be matched to labels. Sealed box 40 L suggested for SWBP15-2000 (manual)."},
]
BEX = "Bicho Papão Competição 12\"/15\" (5000 W 'competição', 2500 W programme, 1250 W RMS-AES per https://www.bomber.com.br/produto/subwoofer-12-bicho-papao-competicao-5000-wrms-2-ohms/) excluded: RMS (AES) below 2000 W. Atrack 4 ohm versions (5K, 6.5K, Bass 4K/6K) excluded: single 4 ohm coil cannot give 2/1/0.5 ohm."
save("bomber", "Bomber (Thomas K. L. Ind. de Alto-Falantes)", "Brazil", "https://www.bomber.com.br/",
     "robots.txt disallows only WooCommerce/admin paths; no terms of use found. Manuals and pages read one at a time 2026-11-21/22. Numbers only. Also present in the BuildBass MIT bundle already in the app; values here re-read from the maker's manuals.", B, no_ts=BNO, extra={"excluded_notes": BEX})
TU = "https://tritonaltofalantes.com.br/wp-content/uploads/"
T = [
 driver(model="AK 6.1 12\"", size_in=12, coil="SVC", ohms_per_coil=2, coils=1, rms_w=3050, peak_w=6100, fs_hz=80, re_ohm=1.55, qms=5.08, qes=0.461, qts=0.422, vas_l=10.31,
        sd_cm2=526.3, xmax_mm=10, mms_g=153, bl_tm=16.0362, le_mh=0.469, spl_db_1w1m=93.1, status="current",
        sources=[s(TU + "2024/08/FICHA-TECNICA-ALTO-FALANTE-AK-6.1-TRITON-ALTO-FALANTES-1.pdf", "Ficha técnica AK 6.1")],
        notes=MID + "Power: 3050 W 'potência máxima contínua' (AES 2-1984), 6100 W musical programme. Xmax is 'Xmax (Linear Mathematical)'; peak-to-peak max excursion 15 mm. Zmin 1.85 ohm. Voice coil 4 in CCAW."),
 driver(model="TR 4000 12\"", size_in=12, coil="SVC", ohms_per_coil=2, coils=1, rms_w=4000, peak_w=8000, fs_hz=93.25, re_ohm=1.6, qms=11.62, qes=0.71, qts=0.67, vas_l=6.24,
        sd_cm2=468.7, xmax_mm=10.75, mms_g=145.6, bl_tm=13.87, le_mh=0.33, spl_db_1w1m=90.57, spl_db_2v83=97.56, displacement_l=0.504, status="current",
        recommended_boxes=[{"type": "vented", "volume_l": 39, "tuning_hz": 85.24, "source": TU + "2022/02/FT_TR_4000_12.pdf (Vb 39 L, total 53.4 L, F3 67.47 Hz, rectangular port 120 x 290 x 230 mm)"}],
        sources=[s(TU + "2022/02/FT_TR_4000_12.pdf", "Ficha técnica TR 4000 12 (Setembro/17)")],
        notes=MID + "Xmech 16.13 mm; Cms 0.02 mm/N; Rms 7.344 kg/s; efficiency 0.687 %."),
 driver(model="TR 4350 12\" (2 ohm version)", size_in=12, coil="SVC", ohms_per_coil=2, coils=1, rms_w=2900, peak_w=4350, fs_hz=79.22, re_ohm=1.5, qms=8.05, qes=0.43, qts=0.41, vas_l=9.11,
        sd_cm2=532.2, xmax_mm=10.75, mms_g=174.3, bl_tm=17.35, le_mh=0.23, spl_db_1w1m=92.22, mounting_depth_mm=169, status="current",
        recommended_boxes=[{"type": "vented", "volume_l": 45, "tuning_hz": 89, "source": TU + "2022/02/FT_TR4350_12PL.pdf (total volume 45 L, rectangular port 11 x 29 x 27 cm)"}],
        sources=[s(TU + "2022/02/FT_TR4350_12PL.pdf", "Ficha técnica TR 4350 (Maio 2019)")],
        notes=MID + "Sheet covers '2 e 4 ohm' versions with Re '1,5 e 2,6' ohm; the other T/S are printed once (basis not stated, so they may belong to one version only). Power: 2900 W RMS (AES, free air), 4350 W 'RMS competição' (2 h pink noise). Le at 10 kHz. Dimension D 169 mm read as mounting depth from the drawing labels (UNVERIFIED)."),
]
save("triton", "Triton Alto-Falantes", "Brazil", "https://tritonaltofalantes.com.br/",
     "No robots sitemap or terms page found; three data sheets read one at a time 2026-11-22. Numbers only. Also in the BuildBass MIT bundle; re-read from the maker's sheets.", T,
     extra={"excluded_notes": "Triton AK 4.0/AK 6.0 and TR 4350 15 inch are 4 ohm only; catalogue not fully browsed (no sitemap), so further 2 ohm models may exist."})
EP = "https://eros.com.br/produto/"
ENO = [{"model": m, "rms_w": w, "url": EP + slug + "/", "note": f"Product page: POTÊNCIA MÁXIMA (RMS) {w} W, IMPEDÂNCIA NOMINAL '{imp}' (separate SVC versions). Maker PDFs are box drawings or images without T/S text. Read 2026-11-22."}
       for m, w, imp, slug in [("E-12 Hammer 4.7K", 2350, "2, 4 ou 8 Ohms", "e-12-hammer-4-7-k"), ("E-12 Hammer 5.2K Black", 2600, "2, 4 e 8 Ohms", "e-12-hammer-5-2-k-black"),
                               ("E-12 Hammer 6.5K Hybrid", 3250, "2, 4 ou 8 Ohms", "e-12-hammer-6-5k-hybrid"), ("E-12 Hammer 7K", 3500, "2, 4 ou 8 Ohms", "e-12-hammer-7k"),
                               ("E-12 Hammer 7.2K", 3600, "2 ou 4 Ohms", "e-12-hammer-7-2k"), ("E-12 Hammer Xbass 7200", 3600, "2 ou 4 Ohms", "e-12-hammer-xbass-7200"),
                               ("E-15 Hammer 7K", 3500, "2, 4 ou 8 Ohms", "e-15-hammer-7k")]]
save("eros", "Eros Alto-Falantes", "Brazil", "https://eros.com.br/",
     "robots.txt lists a sitemap only; site has 'Aviso Legal' and privacy pages (not read in full). 31 bass product pages read one at a time 2026-11-22. Numbers only.", [], no_ts=ENO,
     extra={"excluded_notes": "Eros models of 2000 W RMS or more offered only in 4 or 8 ohm (Hammer 4.0K, 5.2K 15, 7.2K 15, 7.5K 15, Target/Strike/Panzer, Xbass 4 ohm) excluded."})
save("selenium-jbl-brasil", "JBL Selenium (Harman do Brasil)", "Brazil", "https://support.jbl.com/",
     "Harman support PDF read 2026-11-22. Numbers only.", [],
     no_ts=[{"model": "12MB8.0 2R (12 inch midbass, 2 ohm)", "rms_w": 4000, "url": "https://support.jbl.com/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw8868dd50/pdfs/JBL_Woofer_JBL_12MB8.0_-_2R_-_Preto_28025035_manual_portuguese.pdf",
             "note": "Manual text lists labels and values in separate blocks (numbers seen include 8000, 4000, '80,00 Hz', '16,88 Tm', '132,44 g'; 4000 is taken as the nominal RMS) but most values cannot be matched to labels with certainty, so no T/S recorded. Sheet notes 'for DVC, Re with coils in series'. Pro-style midbass, not a deep-bass subwoofer."}])
