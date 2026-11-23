#!/usr/bin/env python3
"""A2: small US brand files (Soundstream, Orion, and brands with no qualifying model or no published T/S). Read 2026-11-21."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
# ---- Soundstream (X5 Team subwoofers) from soundstream.com product pages
SS = "https://soundstream.com/products/"
d = []
for m, size, depth, p, sealed, ported, port, extra in [
  ("X5.12", 12, 8.5, dict(re_ohm=1, fs_hz=43.08, qes=0.556, qms=6.983, qts=0.515, le_mh=1.0274, vas_l=11.855, bl_tm=18.04, mms_g=328.9, spl_db_1w1m=87.8), 1.5, 3.5, '3" x 11.5" long',
   "Spec table gives 'Optimum Sealed 1.50' and 'Optimum Ported 3.50' (cu ft, printed with an inch mark); the 'Recommended Enclosures' block on the same page says sealed 2.00 / ported 4.50 ft, identical to the X5.15 page (likely copied). The Optimum values are entered."),
  ("X5.15", 15, 9.5, dict(re_ohm=1, fs_hz=40.18, qes=0.546, qms=9.098, qts=0.507, le_mh=1.0274, vas_l=36.97, bl_tm=17.59, mms_g=334.74, spl_db_1w1m=88.3), 2.0, 4.5, '4" x 15.75" long',
   "Le 1.0274 mH identical to X5.12 (possible copy).")]:
    d.append(rec(f"{m} Team Subwoofer (DVC 1 ohm)", size, "DVC", 1, 3500, 7500, p, "unknown", depth_in=depth, status="current",
        boxes=[box("sealed", sealed, None, "maker page " + SS + m.lower().replace(".", "-")), box("ported", ported, None, "maker page", note=f"port {port}; F3 published, tuning not")],
        sources=[src(SS + m.lower().replace(".", "-"), doc="product page Specifications / Thiele-Small Parameters"),
                 src("https://soundstream.com/cdn/shop/files/Owners-Manual-X5.12-and-X5.15.pdf", ["status"], doc="Team Subwoofer Owners Manual (linked, not read)")],
        notes="'Limited Edition'. Re printed as 1 (equals the nominal coil impedance; basis not stated). Sd, Xmax not published. " + extra))
save("soundstream", "Soundstream", "https://soundstream.com",
     "Shopify store; /products.json read once, X5 product pages read 5 s apart. No terms on automated reading found (not read in full). Other 'xxxx W' models (Reference R1/R5, Tarantula T5, Reserve) carry max power in the title; RMS 1000 to 1300 W, so excluded.", d, [])
# ---- Orion (orioncaraudio.com): qualifying models but no T/S published
OR = "https://orioncaraudio.com/products/"
save("orion", "Orion Car Audio", "https://orioncaraudio.com",
     "Shopify store; /products.json read once and one product page (hcca152spl) checked: no T/S, no spec sheet or manual link on product pages.",
     [], [{"model": m, "rms_w": w, "url": OR + h, "note": n} for m, w, h, n in [
        ("HCCA102 (10 in, Dual 2)", 2000, "hcca102-10-inch-subwoofer-2000-watts-rms-2-ohm-dvc", "2000 W RMS / 8000 W peak; no T/S on the page."),
        ("XTRPRO152D / XTRPRO154D (15 in, Dual 2 / Dual 4)", 2000, "xtrpro152d-15-inch-subwoofer-2000-watts-rms-2-ohm-dvc", "2000 W RMS / 8000 W peak; no T/S."),
        ("HCCA151SPL / HCCA152SPL / HCCA154SPL (15 in, Dual 1/2/4)", 5000, "hcca152spl", "5000 W RMS / 20000 W peak; no T/S (page fetched and checked)."),
        ("HCCA121SPLX / HCCA151SPLX / HCCA181SPLX (Dual 1)", 7500, "hcca151splx-15-inch-subwoofer-7500-watts-rms-1-ohm-dvc", "7500 W RMS / 30000 W peak; no T/S."),
        ("XTRPRO-SW12D2/D4, XTR12SWD2/D4 (shallow)", None, "xtr12swd2", "Titles give 2000 to 3200 W max (not RMS); RMS not confirmed >= 2000 W.")]])
# ---- Timpano (timpanoaudio.com): product descriptions state 'THIELE-SMALL PARAMETERS - Wired in Parallel Re x Ohm'
TP = "https://timpanoaudio.com/products/"
d = []
for model, size, ohm, rms, h, p, extra in [
  ("TPT-T3500-15 D2", 15, 2, 3500, "tpt-t3500-15_d2-powerful-15-inch-car-audio-subwoofer", dict(re_ohm=0.7, fs_hz=30, qes=0.52, vas_l=75.65, qts=0.50, qms=11.14, xmax_mm=29, bl_tm=10.24), "Xmech 45 mm."),
  ("TPT-T3500-12 D2", 12, 2, 3500, "tpt-t3500-12_d2-powerful-12-inch-car-audio-subwoofer", dict(re_ohm=0.7, fs_hz=35, qes=0.53, vas_l=26.16, qts=0.51, qms=11.38, xmax_mm=29, bl_tm=10.15), "Xmech 45 mm."),
  ("TPT-T2500-10 D2", 10, 2, 2000, "10-car-audio-subwoofer-2000-watts-dual-2-ohm-tpt-t2500-10-d2", dict(re_ohm=0.9, fs_hz=44, qes=0.77, vas_l=11.59, qts=0.77, qms=9.81, xmax_mm=23.5, bl_tm=7.81), "Xmech 32 mm. DATA PROBLEM: Qts 0.77 equals Qes 0.77 although Qms is 9.81 (calculated Qts 0.714). Model name T2500 but rated 2,000 W RMS."),
  ("TPT-T2500-12 D2", 12, 2, 2500, "12-car-audio-subwoofer-2500-watts-dual-2-ohm-tpt-t2500-12-d2", dict(re_ohm=0.9, fs_hz=36, qes=0.79, vas_l=26.54, qts=0.732, qms=9.46, xmax_mm=23.5, bl_tm=8.51), "Xmech 37 mm. DATA PROBLEM: the description heading says 'Dual 4 Ohm' while the title, handle and parallel Re 0.9 indicate Dual 2."),
  ("TPT-T2500-12 D4", 12, 4, 2500, "12-car-audio-subwoofer-2500-watts-dual-4-ohm-tpt-t2500-12-d4", dict(re_ohm=1.8, fs_hz=39, qes=0.916, vas_l=26.40, qts=0.833, qms=9.10, xmax_mm=23.5, bl_tm=10.82), "Xmech 37 mm. Dual 4 ohm: parallel gives 2 ohm."),
  ("TPT-T2500-15 D4", 15, 4, 2500, "15-car-audio-subwoofer-2500-watts-dual-4-ohm-tpt-t2500-15-d4", dict(re_ohm=1.9, fs_hz=35, qes=1.14, vas_l=67.25, qts=1.01, qms=9.05, xmax_mm=23.5, bl_tm=10.69), "Xmech 37 mm. Dual 4 ohm: parallel gives 2 ohm.")]:
    d.append(rec(model, size, "DVC", ohm, rms, None, p, "parallel", status="current", sources=[src(TP + h, doc="product page description, THIELE-SMALL PARAMETERS block")],
        notes="Maker states the T/S are for the coils wired in parallel. RMS from 'conservatively rated of N watts RMS' in the description. Box recommendations (compact/large sealed and ported with F3 and port size) are on the page but not entered (tuning not given). " + extra))
save("timpano", "Timpano Audio", "https://timpanoaudio.com",
     "Shopify store; /products.json read once (descriptions). No terms clause on reading found (not read in full).", d, [])
save("power-acoustik", "Power Acoustik", "https://poweracoustik.com",
     "Shopify store; /products.json read once. No model rated >= 2000 W RMS: largest are BAMF-152/154 (1900 W RMS, 3800 W max) and MOFO-15X (1700 W RMS). Recorded as checked, none qualifying.", [], [])
# ---- Memphis Car Audio: qualifying MOJO models publish no T/S (the linked 'MOJO SUBWOOFER SPEC SHEET' is for the 1500 W MJ1212)
MP = "https://www.memphiscaraudio.com/product/"
save("memphis", "Memphis Car Audio", "https://www.memphiscaraudio.com",
     "WooCommerce site; 6 product pages and 2 PDFs read 4-6 s apart. No terms on automated reading found. MOJO Pro (750 W), VIV 10/12 (1000 W) and the MJ1212 (1500 W, which has a T/S sheet) are below threshold.",
     [], [{"model": m, "rms_w": w, "url": MP + h, "note": n} for m, w, h, n in [
        ("MOJO MJ1212V (12 in, selectable 1 or 2 ohm)", 2000, "mj1212v", "2000/4000 W; mounting depth 8.5 in, cutout 11 in; no T/S (spec-sheet link points to the MJ1212 sheet)."),
        ("MOJO MJ1512 (15 in, selectable 1 or 2 ohm)", 2000, "mj1512", "2000/4000 W; depth 9.06 in, cutout 13.81 in; no T/S."),
        ("MOJO MJ1812LVS (18 in, selectable 1 or 2 ohm)", 4000, "mj1812lvs", "4000/8000 W; depth 10.49 in, cutout 16.73 in; no T/S."),
        ("VIV 14 in (VIVE14S1 loaded enclosure, 1 ohm)", 2200, "vive14s1", "Sold only as a loaded enclosure on the site; 2200/4400 W; no driver T/S.")]])
# ---- Crescendo Audio (Las Vegas, NV): product pages carry only a marketing description, no specifications or T/S
CR = "https://crescendoaudio.com/"
save("crescendo-audio", "Crescendo Audio", "https://crescendoaudio.com",
     "BigCommerce store; 6 pages read 5 s apart. Product pages have no specification table (only description and photos).",
     [], [{"model": m, "rms_w": w, "url": CR + h, "note": n} for m, w, h, n in [
        ("NENDO 12 / 15 / 18", 3000, "nendo-series-15-subwoofer-3000w-rms/", "3000 W RMS in titles; coil options not checked; no T/S."),
        ("CARTEL 10 / 12 / 15 / 18 (D2 or D4)", 2000, "cartel-series-15-subwoofer-2000w-rms/", "2000 W RMS in titles; category filter shows D2 and D4; no T/S."),
        ("CONTRALTO 12 / 15 / 18 (discontinued)", 2500, "discontinued-products/", "2500 W RMS (Contralto 10: 1800 W); discontinued; no T/S found.")]])
# ---- Resilient Sounds (Wix site, product text rendered with JavaScript; read with the headless browser)
RS = "https://www.resilientsounds.com/"
save("resilient-sounds", "Resilient Sounds", "https://www.resilientsounds.com",
     "Wix site (product text is JavaScript-rendered): 2 pages read with headless Chromium, 6 s apart, browser closed after. No T/S published on the product page checked (Platinum 12 V2: only power, Xmax, box range, depth, cutout).",
     [], [{"model": m, "rms_w": w, "url": RS + h, "note": n} for m, w, h, n in [
        ("Platinum 10 / 12 / 15 / 18 V2", 2500, "product-page/resilient-sounds-platinum-12-v2", "'conservative rated at 2,500RMS/5,000Watts', Xmax 35 mm; 12 V2: ported 2.00 to 3.00 cu ft, tuning 28-33 Hz, mounting depth 10.25 in, cutout 11.175 in, displacement 0.25 cu ft; impedance options not visible without selecting; no T/S."),
        ("Onyx 12 / 15", 2500, "onyx-series-2500rms", "'RATED 5,000 WATTS/2,500 RMS'; Onyx 15 marked DISCONTINUED; no T/S."),
        ("Team series", 5000, "", "Menu lists 'TEAM SERIES 5000RMS WOOFER'; page not read."),
        ("Platinum (V1) series", 2000, "platinum-series-2000rms", "Menu lists 'PLATINUM SERIES 2000RMS WOOFER' (older line); no T/S seen.")]])
# ---- PRV Audio (PRV Audio USA; brand of Brazilian origin, US site prvaudio.com) - added on PM request
save("prv-audio", "PRV Audio (PRV Audio USA)", "https://prvaudio.com", 
     "Cloudflare challenge blocks curl (HTTP 403); 3 pages rendered in headless Chromium 5-6 s apart, the third returned 403 (challenge) and was not retried. Car subwoofer range on the US site: RS65/RS8/RS10/RS12-SUBD4 (300 to 1000 W, dual 4 ohm): none >= 2000 W RMS. PRV pro-audio woofers are single 8 ohm (or similar) PA drivers, not car subs with 2/1/0.5 ohm final loads; not checked further.",
     [], [], country="Brazil", extra={"country_note": "Brand founded in Brazil; US entity PRV Audio USA (prvaudio.com). A3 could not reach it; A2 checked the US site."})
# ---- Shopify scans with nothing to record as T/S (2026-11-21)
save("ampere-audio", "Ampere Audio", "https://ampereaudio.com", "Shopify store; /products.json read once. No T/S in the descriptions.", [],
     [{"model": "AA-3.0 Series 10/12/15/18 (D1, D2)", "rms_w": 2000, "url": "https://ampereaudio.com/products/ampere-audio-aa-3-0-series-2000w-car-subwoofer", "note": "'2000 Watts RMS power handling' (title says 4000W); no T/S published."},
      {"model": "AA-2.75 Series (D2, D4)", "rms_w": 1000, "url": "https://ampereaudio.com/products/ampere-audio-aa-2-75-series-2000w-car-subwoofer-test", "note": "Title 2000W is peak; RMS 1000 W (below threshold), listed for completeness."}])
save("audiopipe", "Audiopipe", "https://audiopipe.com", "Shopify store; /products.json read once. No T/S in the descriptions.", [],
     [{"model": "TXX-BDX-15 (D4) / TXX-BDX-15D2", "rms_w": 2000, "url": "https://audiopipe.com/products/15-competition-subwoofer-txx-bdx-15d2", "note": "2000 W RMS / 4000 W peak, 87 dB; no T/S. TXX-BDC-V-18 is 1900 W RMS (below threshold)."}])
for slug, name, url, note in [("earthquake-sound", "Earthquake Sound", "https://www.earthquakesound.com", "Shopify store (308 products) scanned: no car subwoofer rated >= 2000 W RMS found."),
                              ("rockville", "Rockville", "https://rockvilleaudio.com", "Shopify store (2500 products, first 10 pages) scanned: no new car subwoofer rated >= 2000 W RMS found (only used-stock listings with peak figures)."),
                              ("diamond-audio", "Diamond Audio", "https://diamondaudio.com", "Shopify store scanned: largest is HXP154 (1100 W RMS); none qualifying."),
                              ("cerwin-vega", "Cerwin-Vega (Mobile)", "https://cerwinvega.com", "Shopify store scanned: car subs up to 1500 W RMS (Vega V15); none qualifying.")]:
    save(slug, name, url, note, [], [])
# ---- brands checked with no usable maker data (blocked, defunct, no qualifying model, or not a sub maker)
for slug, name, url, note, nots in [
 ("skar-audio", "Skar Audio", "https://www.skaraudio.com", "BLOCKED: skaraudio.com returns Cloudflare error 1005 (the network's ASN is banned by the site owner) to curl, WebFetch and the headless browser. Not bypassed. Skar high-power lines (e.g. ZVX, EVL, SDR) could not be read from the maker; aggregator values exist but are excluded by the brief. Needs fetching from another network (e.g. the owner's PC) or maker permission.", []),
 ("jl-audio", "JL Audio", "https://www.jlaudio.com", "jlaudio.com product URLs now redirect to garmin.com, which returned HTTP 403. Flagship W7AE (13.5 in) is rated 1500 W RMS per retailers (UNVERIFIED on the maker site); no JL sub >= 2000 W RMS known.", []),
 ("mtx", "MTX Audio", "https://mtx.com", "Cloudflare: curl gets 403; the headless browser loaded the home page and the 75-series page (750 W RMS, below threshold) but got 403 on the Jackhammer page. Not retried. Jackhammer (MTX's largest sub) could not be checked.", [{"model": "Jackhammer", "rms_w": None, "url": "https://mtx.com/jackhammer-car-audio-subwoofer", "note": "Blocked (403); power and T/S not read."}]),
 ("hifonics", "Hifonics", "https://hifonics.com", "BLOCKED: Cloudflare challenge (403) for curl and the headless browser. Not bypassed.", []),
 ("stereo-integrity", "Stereo Integrity", "https://stereointegrity.com", "BLOCKED: Cloudflare challenge (403) for curl and the headless browser. Not bypassed.", []),
 ("ssa", "SSA (Sound Solutions Audio)", "https://soundsolutionsaudio.com", "soundsolutionsaudio.com is a multi-brand car-audio store (American Bass, Massive, Orion, VFL ...); collections exist for SSA amplifiers, speakers and alternators but no own-brand SSA subwoofer collection was found (2026-11-21). robots.txt carries Cloudflare content-signal terms.", []),
 ("incriminator-audio", "Incriminator Audio", "https://incriminatoraudio.com", "Domain does not resolve (no DNS) on 2026-11-21; brand appears inactive. No maker data.", []),
 ("audioque", "Audioque", "https://audioque.com", "Domain is parked (redirects to a lander page); brand appears inactive. No maker data.", []),
 ("atomic", "Atomic Car Audio", "https://atomiccaraudio.com", "atomiccaraudio.com is an installer / custom-build shop (project gallery), not a subwoofer maker. No data.", []),
 ("cadence", "Cadence Sound", "https://cadencesound.com", "Home page returned almost no server-side text (JavaScript site); not pursued further (time). UNVERIFIED whether any sub >= 2000 W RMS exists.", []),
 ("down4sound", "Down4Sound", "https://www.down4soundshop.com", "Retail store (BigCommerce) selling Sundown and others; no own-brand sub line with T/S. The 'TEAM D4S x Sundown NEO 18 D2 5000W RMS' is listed in sundown-audio.json no_ts_published.", []),
]:
    save(slug, name, url, note, [], nots)
