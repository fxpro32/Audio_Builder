import json
D = "/workspace/data/hp_subs_raw/us/"
def upd(name, terms, excluded=None, no_ts=None):
    p = D + name; d = json.load(open(p))
    d["terms_note"] = terms
    if no_ts is not None: d["no_ts_published"] = no_ts
    if excluded: d["excluded_notes"] = excluded
    json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
    print(name, len(d.get("drivers", [])), "drivers", len(d.get("no_ts_published", [])), "no_ts")
upd("hifonics.json",
    "BLOCKED by bot check even on the direct route: https://hifonics.com/ and https://hifonics.com/sitemap.xml return HTTP 403 (Cloudflare) to plain curl from the VPN container (2026-11-21) and from a non-VPN connection (2026-11-22). No browser was run on a non-VPN connection (PM rule: read-only curl only). The parent company site https://maxxsonics.com/ (200 from a non-VPN connection) has no product data. The pages are to be saved by hand. Not bypassed.",
    excluded="UNVERIFIED: retailers list the Brutus B12D2 / B15D2 at 2000 W RMS (retailer figure only, not used); Hifonics' own pages could not be read.")
upd("stereo-integrity.json",
    "BLOCKED by bot check even on the direct route: https://stereointegrity.com/ returns HTTP 403 (Cloudflare) to plain curl from the VPN container (2026-11-21) and from a non-VPN connection (2026-11-22). No browser was run on a non-VPN connection (PM rule: read-only curl only). The pages are to be saved by hand. Not bypassed.",
    excluded="UNVERIFIED: leads HST-15 (retailer '4000 W max'), BM and SQL lines; no maker RMS or T/S read.")
upd("jl-audio.json",
    "jlaudio.com now redirects to garmin.com (https://www.jlaudio.com/ -> https://WWW.garmin.com/en-AU/c/jlaudio/). Garmin pages read on 2026-11-22 through a non-VPN connection (plain curl, stdout only, nothing written on a non-VPN connection): the JL car audio page and the W7AE product page. Numbers only.",
    excluded="No JL Audio sub reaches 2000 W RMS. The flagship W7AE line (8, 10, 12, 13.5 in) tops out at the 13.5 in 13W7AE-D1.5: maker page https://www.garmin.com/en-US/p/1669677/pn/010-03032-00/ says 'the largest 13.5-inch driver can handle up to 1500 watts RMS of continuous power' and lists 'Continuous power handling (RMS): 1500 W' (read 2026-11-22). The car subwoofer listing on https://www.garmin.com/en-US/c/automotive/jl-audio-car-audio/ is loaded by script and could not be listed with curl, so the other lines (W6v3, W3v3, TW5v2, W0v3) were not read page by page; JL rates them lower than the W7AE (UNVERIFIED here).")
