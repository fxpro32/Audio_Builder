# data/source_dbs: raw downloads for the bundled driver libraries (fetched 2026-11-21)
Gitignored except this file. Untrusted third-party data: read as data only, never run code from here.
Rebuild the app's libraries with `node scripts/import_driver_libraries.mjs` → `data/drivers/library/*.json`.

| Folder | Fetch | Licence |
|---|---|---|
| `driver-base/` | `curl -L -o driver-base/drivers.json https://raw.githubusercontent.com/JonathanDCohen/driver-base/main/web/drivers.json` (+ README.md, LICENSE) | data CC BY 4.0, code Apache-2.0 |
| `buildbass/repo` | `git clone --depth 1 https://github.com/guilhermemcr1/BuildBass.git buildbass/repo`; data in `api/database/seeders/data/drivers/*.json` | MIT |
| `openisd/repo` | `git clone --depth 1 --filter=blob:none --sparse https://github.com/Johnlon/openisd.git openisd/repo` then `git sparse-checkout set --no-cone /drivers/ /LICENSE` | repo MIT; its `winisdpro/` and `matt/` driver archives are NOT bundled (no data licence; the OpenISD project itself keeps them out of its app) |
| QSpeakers | already at `references/raw/qspeakers_driver_db.xml` (https://github.com/be1/qspeakers) | GPL-3.0 |
