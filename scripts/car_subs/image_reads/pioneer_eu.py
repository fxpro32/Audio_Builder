"""R2B_SUBS_MORE (2026-11-23): Pioneer Europe subwoofer T/S READ FROM IMAGES (image-only user-manual PDFs, no text layer).
Manuals opened in headless Chromium from the product pages of https://pioneer-car.eu (curl gets Cloudflare 403; the browser loads them
normally): local copies references/raw/car_subs/pioneer/eu_manuals/<slug>.pdf, manual URLs in manual_urls.txt there. Tables rendered and
cropped with scripts/car_subs/pdf_crop.mjs (crops crop_*.png in the same folder) and read by eye by agent R2B_SUBS_MORE.
Double-check of every row: Re implied by Qes*Bl^2/(2 pi Fs Mms) compared with the printed Re (all within 25 %), and the column count
(13 T/S columns: Revc, Levc, Fs, Qms, Qes, Qts, Vas, Rms, Mms, Cms, Diam, BL, Xmax) checked against the header crop.
DVC rows print Levc and BL for the series (8 ohm on D4 / 4 ohm on D2) and parallel wiring; the series figures are kept (ts_basis series),
Re is printed per coil ('Dual 3.3'). Cut-out / depth: manual table where read, else the product page (noted per row: dim_src)."""
M = {  # manual slug -> manual URL (manual_urls.txt)
    "ts-d12d2": "https://pioneer-car.eu/asset/user_manuals/UPLOAD_ID_12577/27821cd561cb682ae33b21871d7766da5178ba46/",
    "ts-z10ls2": "https://pioneer-car.eu/asset/user_manuals/UPLOAD_ID_12580/003b7209299938d00de743d5b38c7fcbce7410ed/",
    "ts-d10ls2": "https://pioneer-car.eu/asset/user_manuals/UPLOAD_ID_12848/4bd65e4a8f7ee5330d299551d17eb3943f51fa92/",
    "ts-a2000ld2": "https://pioneer-car.eu/asset/user_manuals/UPLOAD_ID_13716/2c237d43f2de86e3723c7a96653541cb97c0e029/",
    "ts-a250d4": "https://pioneer-car.eu/asset/user_manuals/UPLOAD_ID_19212/3145ff8c7338f51f12ef447bd9843eeef3d5157a/",
    "ts-w32d4": None,  # filled from manual_urls.txt by the builder
}
# model, manual, page, size_in, coil, ohms/coil, rms, max, spl(1W/1m; None if 'in car'), Re printed, Le(series), Fs, Qms, Qes, Qts, Vas L, Mms g, Cms m/N, Diam mm, Bl(series), Xmax mm, cut mm, depth mm, dim_src, extra note
ROWS = [
 ("TS-D12D4", "ts-d12d2", 2, 12, "DVC", 4, 600, 2000, 78, 3.3, 4.52, 34, 9.75, 0.74, 0.69, 47.9, 183, 1.3e-4, 256, 19.2, 13.0, 281, 157, "manual", "Parallel (2 ohm) column: Le 1.14 mH, Bl 9.5."),
 ("TS-D12D2", "ts-d12d2", 2, 12, "DVC", 2, 600, 2000, 76, 1.7, 2.80, 33, 9.71, 0.69, 0.64, 46.2, 193, 1.2e-4, 256, 14.6, 13.0, 281, 157, "manual", "Parallel (1 ohm) column: Le 0.72 mH, Bl 7.3."),
 ("TS-D10D4", "ts-d12d2", 2, 10, "DVC", 4, 500, 1500, 76, 3.6, 4.31, 41, 8.41, 0.85, 0.77, 22.3, 124, 1.4e-4, 209, 16.1, 10.8, 230, 140, "manual", "Parallel (2 ohm) column: Le 1.08 mH, Bl 8.0."),
 ("TS-D10D2", "ts-d12d2", 2, 10, "DVC", 2, 500, 1500, 74, 1.7, 2.59, 40, 8.74, 0.76, 0.70, 20.9, 131, 1.2e-4, 209, 12.7, 9.8, 230, 140, "manual", "Parallel (1 ohm) column: Le 0.66 mH, Bl 6.4."),
 ("TS-Z10LS4", "ts-z10ls2", 2, 10, "SVC", 4, 400, 1300, 76, 3.3, 2.85, 35, 11.37, 0.55, 0.52, 23.7, 190, 1.1e-4, 232, 16.7, 9.5, 231, 81, "manual", "Shallow-mount."),
 ("TS-Z10LS2", "ts-z10ls2", 2, 10, "SVC", 2, 400, 1300, 74, 1.7, 1.74, 34, 10.80, 0.50, 0.48, 23.1, 204, 1.1e-4, 232, 13.2, 9.4, 231, 81, "manual", "Shallow-mount."),
 ("TS-D10LS4", "ts-d10ls2", 2, 10, "SVC", 4, 350, 1300, 76, 3.3, 2.09, 37, 11.91, 0.86, 0.80, 19.8, 148, 1.2e-4, 207, 12.3, 8.3, 230, 84, "product page", "Shallow-mount. Manual also prints 82 dB (1 W / 0.5 m)."),
 ("TS-D10LS2", "ts-d10ls2", 2, 10, "SVC", 2, 350, 1300, 74, 1.7, 1.35, 36, 11.71, 0.80, 0.75, 18.0, 171, 1.1e-4, 207, 9.8, 7.9, 230, 84, "product page", "Shallow-mount. Manual also prints 80 dB (1 W / 0.5 m). Cut-out/depth from the TS-D10LS2 product page (same frame assumed for LS4)."),
 ("TS-A3000LS4", "ts-a2000ld2", 1, 12, "SVC", 4, 400, 1500, 88, 3.6, 2.89, 31, 5.71, 0.60, 0.54, 45.6, 221, 12.2e-5, 254, 16.1, 8.80, 281, 90, "product page", "Shallow-mount."),
 ("TS-A2500LS4", "ts-a2000ld2", 1, 10, "SVC", 4, 300, 1200, 85, 3.7, 2.52, 38, 10.93, 0.90, 0.83, 17.9, 153, 11.2e-5, 207, 12.3, 8.30, 230, 87, "product page", "Shallow-mount."),
 ("TS-A2000LD2", "ts-a2000ld2", 1, 8, "DVC", 2, 250, 700, 83, 3.2, 1.12, 63, 7.49, 1.14, 0.99, 4.11, 90, 7.1e-5, 160, 10.0, 2.30, 179, 67, "product page", "Re printed as a single 3.2 ohm on a 2 ohm DVC (fits the coils in series: Qes*Bl^2/(2 pi Fs Mms) = 3.2); single Le/Bl column. Shallow-mount."),
 ("TS-A300S4", "ts-a250d4", 2, 12, "SVC", 4, 500, 1500, 77, 4.4, 4.86, 26, 7.22, 0.67, 0.62, 75.0, 188, 20.0e-5, 256, 14.1, 10.7, 281, 147, "manual", ""),
 ("TS-A300D4 / TS-A1200D4", "ts-a250d4", 2, 12, "DVC", 4, 500, 1500, 77, 4.3, 7.73, 25, 5.62, 0.78, 0.69, 87.1, 181, 23.3e-5, 256, 17.7, 10.1, 281, 147, "manual", "Parallel (2 ohm) column: Le 1.93 mH, Bl 8.9. Product page prints 400 W nominal in the header and 500 W in the table; manual 500 W kept."),
 ("TS-A250S4", "ts-a250d4", 2, 10, "SVC", 4, 400, 1300, 73, 3.7, 3.84, 30, 4.42, 0.60, 0.52, 34.1, 136, 20.5e-5, 209, 12.6, 11.3, 230, 133, "manual", ""),
 ("TS-A250D4", "ts-a250d4", 2, 10, "DVC", 4, 400, 1300, 74, 3.7, 6.53, 30, 4.27, 0.68, 0.59, 36.6, 128, 22.0e-5, 209, 16.1, 10.8, 230, 133, "manual", "Parallel (2 ohm) column: Le 1.63 mH, Bl 8.0."),
 ("TS-W32S4 / TS-W1202S4", "ts-w32d4", 2, 12, "SVC", 4, 400, 1500, None, 3.3, 3.40, 30, 6.61, 0.68, 0.61, 57.7, 181, 15.4e-5, 256, 13.0, 11.6, 281, 146, "product page", "Sensitivity printed 90 dB +/- 1.5 dB 'in car, input 1 W' (not a 1 W/1 m figure, not entered). Cut-out/depth from the TS-W32D4 product page (same frame assumed)."),
 ("TS-W32D4 / TS-W1202D4", "ts-w32d4", 2, 12, "DVC", 4, 400, 1500, None, 3.3, 5.99, 30, 6.37, 0.90, 0.79, 57.4, 190, 15.4e-5, 256, 16.2, 13.4, 281, 146, "product page", "Parallel (2 ohm) column: Le 1.49 mH, Bl 8.1. Sensitivity printed 90 dB +/- 1.5 dB 'in car, input 1 W' (not entered)."),
]
