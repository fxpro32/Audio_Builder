| Brand / source | Status | What was read | Remaining |
|---|---|---|---|
| Rockford Fosgate | done (maker) | 36 car amps (spec tables incl. efficiency, current draw, fuse, wire gauge, alternator) + accessories (RFC10HB capacitor, breakers, ANL/MAXI/AGU fuses, holders, distribution, terminals, RCA, wire, kits); AUD prices joined from Frankies | marine/powersports amps, discontinued amps |
| Kicker | done (maker) | 41 amps (CX, KX, IQ, LX, PX/PXA, KPX, Warhorse, VXA) with CEA-2006 lines and dimensions; R3B: external fuse, power wire gauge and wiring kit from 15 maker PDF manuals for 30 amps | VXA, IQ, PXA manuals have no fuse table in the parsed form |
| Kenwood | done (maker, USA site) | 7 amps: CTA-2006 continuous power, current consumption, fuse | eXcelon / motorsports amps (other site paths) |
| Alpine | done (maker, USA site) | 18 amp/processor pages (S, R, Status HDA, KTA, KTP); processors skipped to dsp later | parser auto, spot-check; PXE processors not parsed as DSP |
| DD Audio | done (maker) | amps incl. discontinued: test voltage, continuous W per load, max current draw, wire gauge accepted, mm dims, MSRP | |
| Taramps | done (maker, Brazil site) | amps: power per load at 14.4 VDC, efficiency, rest / music / sine current | US store records kept for USD prices only |
| Sundown Audio | done (maker store) | 47 amps from the maker Shopify store text | current draw / fuse not in store text |
| DS18 | done (maker store) | 132 amps (titles/body), DSP/processors 28, cable 38, wiring kits 60, fuses/holders 13, distribution 9, terminals 9, RCA 73, batteries 21 | amp spec tabs not in store data (product HTML pages rate-limited, 429) |
| AudioControl | done (maker store) | 21 amps (with maker fuse-distance and wire notes) + 17 DSP/LOC/processors | |
| American Bass, Ampere Audio, Audiopipe, Cerwin-Vega Mobile | done (maker store) | amps from store text (Cerwin-Vega text has few RMS lines); R3B: Audiopipe capacitors 5 | Cerwin-Vega: store text has almost no ratings (79 of 80 records flagged no_rms) |
| Narva (Australian maker) | done (maker store, AUD) | cable 204 (B&S and AU "mm" auto cable), fuses/breakers/holders 115 (ANL, MIDI "ANS", MEGA "ANM", MAXI, bolt-down), lugs 92, bus bars 3 | conductor mm2 not on Narva pages (AU table used) |
| KnuKonceptz | done (maker) | power/ground cable spec tables (strand counts, OD, core diameter, max load @ 20 ft), fuses/holders, distribution blocks, terminals (USD) | variant prices per gauge (Store API needs one call per variant) |
| Stinger | partial | maker US store (wiring kits, holders, RCA); AU range via Frankies (retailer tier, AUD): capacitor SPC505, fuses, distribution, RCA, kits | maker catalogue of caps, batteries, cable (not in the maker store data) |
| JL Audio | retailer only (AUD) | Frankies AU listings (39 amps, 6 DSP, cable, kits) | maker site redirects to garmin.com, 403 from the container: read via the read-only non-VPN route (as A6) if the PM approves |
| Helix, Hertz, Audison, Zapco, Soundstream, Phoenix Gold, Orion, MB Quart, Infinity, JBL, Pioneer, Match, Morel, BRAX, Mosconi, DB Drive, Fusion, Clarion, Polk, Sony, JVC, Aerpro, DNA, OEX, Projecta, Blue Sea Systems, battery brands (SuperCharge, Fullriver, Trojan, Invicta, Optima, Ritar, ...) | retailer only (AUD) | Frankies AU listings, values auto-parsed from listing text | maker pages: Audison and Hertz return a bot check (HTTP 202), Helix maker URL not found, Zapco / Mosconi / Focal not read |
| Skar Audio, Hifonics, MTX | blocked | 403 from the container (as in A2/A6) | non-VPN route or saving pages by hand |
| XS Power | blocked | TLS failure from the container and WebFetch | non-VPN route |
| Kinetik | not found | kinetik.com is an unrelated energy company; the audio battery brand's site was not located | find the correct domain |
| Sky High Car Audio | partial (R3B, listing pages) | cable 34, fuses 14, distribution 11 (own brand) + Limitless Lithium 12, Full Throttle 19 batteries, SMD 7, SoundQubed 2 (retailer tier), titles + USD prices | product pages not read; ?page= paging returns page 1, so only the first page per category; no power capacitors sold |
| NVX, Connection, Focal | not done | NVX timed out; Connection only via Frankies (1 kit); Focal maker car-audio URL 404 | |
| AU retailers | Frankies done (19,997 products, AUD) | R3B retry 2026-11-23: JB Hi-Fi collections still HTTP 429 (store root answers), Strathfield time-out (000), Jaycar 403, Autobarn and Supercheap Auto search results are script-rendered (need the browser), Car Audio Centre domain did not resolve | browser read of Autobarn / Supercheap search pages |
| Boss Audio Systems | capacitors (R3B, maker store dump) | 5 capacitors (farads, rated / max voltage, ESR) | |
| Sundown Audio | capacitor (R3B) | SA150-975 ultracapacitor (no farads published) | |
