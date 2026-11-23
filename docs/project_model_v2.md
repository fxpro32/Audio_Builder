# Project model v2 (B1_SHELL, R42, 2026-11-23)

A project holds many items: a subwoofer box, door speakers, a home speaker box, and later (jobs B3 to B5) amplifiers, DSPs, capacitors, fuses, fuse holders, distribution blocks, cable and connectors. Items can be linked (an amplifier drives speakers). A single item can be built on its own, kept in "My items" and added to any project later.

Code: `app/src/ui/projectv2.ts` (model, pure functions), `app/src/ui/sections.ts` (sections), `app/server/store2.mjs` (server storage helpers), routes in `app/server/server.mjs`. Tests: `app/tests/projectv2.test.ts`.

## Project file: `data/projects/<name>.json`

```json
{
  "format": 2,
  "name": "car_system",
  "title": "Car system",
  "section": "subwoofer",
  "activeItem": "box-1",
  "items": [
    { "id": "box-1", "section": "subwoofer", "kind": "box", "name": "Subwoofer box", "data": { "...": "the box fields of a v1 project" }, "links": [] },
    { "id": "it_mi3k2x9ab12", "section": "door", "kind": "door", "name": "Door speakers", "data": { "driverId": "lib-...", "count": 2, "notes": "" }, "links": [] }
  ],
  "notes": "",
  "created": "2026-11-23T...Z",
  "saved": "2026-11-23T...Z"
}
```

| Field | Meaning |
|---|---|
| `format` | 2. A file without it is a v1 project (see below). |
| `name` | File name without `.json` (letters, digits, `.`, `_`, `-`). Measurements and exports live in `data/projects/<name>/`. |
| `title` | Name shown; "Rename" changes only this. |
| `section` | Section last shown: `subwoofer`, `door`, `ib`, `home`, `computer`. |
| `activeItem` | Item last shown. |
| `items[]` | The items (below). |
| `notes`, `created`, `saved` | Free text; ISO times (`saved` is set by the server on every write). |

## Item

| Field | Meaning |
|---|---|
| `id` | Unique in the project; also the file name in My items. `box-1` for the box of a migrated v1 project, else `it_<time><random>`. |
| `section` | One of the five sections, or (later kinds) another group name such as `electrical`. |
| `kind` | `box`, `door`, `ib` now. Reserved for later jobs: `amplifier`, `dsp`, `capacitor`, `fuse`, `fuseholder`, `distribution`, `cable`, `connector`, `other`. Unknown kinds are kept as they are. |
| `name` | Name shown. |
| `data` | Depends on `kind`. `box`: every field of a v1 project except `name`, `title`, `saved` (driverId, drivers, kind, geom, port, power, cabin, lowpassHz, symptoms, notes, shape, design, measuredBox, coil...). `door` and `ib`: `{ driverId, count, notes }`. Later kinds: defined by their job. |
| `links[]` | Typed connections from this item (R44), see "Links" below. Removing an item removes the links to it (and clears `cableItemId` where it was the cable). |
| `from` | Optional: `{ item, project }` it was copied from (My items <-> project). |
| `created`, `saved` | ISO times. |

## Links (R44: wiring diagram, missing-part check, cable calculator, BOM)

Each link is stored on the item it starts from (`items[].links`) and always carries both ends:

```json
{ "from": "it_amp1", "fromPort": "CH1 +", "to": "box-1", "toPort": "+", "kind": "speaker", "cableItemId": "it_cable4", "note": "" }
```

| Field | Meaning |
|---|---|
| `from` | Id of the item that holds the link (set from the owner when the file is read). |
| `fromPort`, `toPort` | Optional free port names, e.g. `+12V`, `GND`, `REM`, `CH1 L`, `RCA out 1`. The diagram job defines the names it expects per item kind. |
| `to` | Id of an item of the same project. |
| `kind` | `power`, `ground`, `signal`, `speaker` or `remote` (turn-on). Links with any other kind are dropped when read. |
| `cableItemId` | Optional id of the `cable` item that makes this connection (for gauge, length and the BOM). |
| `note` | Optional text. |

Rules (`linkItems`): no link to itself, both items (and the cable item) must exist, the same from/to/kind/ports only once. `allLinks(doc)` lists every link of a project, `linksTo(doc, id)` the incoming ones. Example chain: battery `power` -> fuse holder `power` -> amplifier (`cableItemId` = the power cable), amplifier `ground` -> chassis point, head unit `remote` -> amplifier, DSP `signal` -> amplifier, amplifier `speaker` -> subwoofer box.

## Save hook (R44)

`app/src/ui/hooks.ts`: `onProjectSave(doc, { legacy })` runs once after every successful write of a project file (autosave included; not for My items). It does nothing until a job registers a handler with `addProjectSaveHook(handler)` (returns an unregister function). Handlers get the in-memory project, must not change it, and their errors are caught, so a save never fails because of a hook. The wiring diagram and missing critical part alerts plug in here.

## My items: `data/items/<id>.json`

One item as above plus `"format": 2, "type": "item"`. "Add to project" puts a copy with a new id (and `from.item`) into the project; the item in My items is not changed. "Save to My items" from a project's Project tab saves a copy with a new id (`from.project`, links dropped).

## Old (v1) projects: migrate on read, write back only when needed

- A file without `format: 2` is read as a project with one item `{ id: "box-1", section: "subwoofer", kind: "box", name: "Subwoofer box", data: <the v1 project, upgraded as before> }`, so it shows exactly what it showed before B1.
- While such a project still holds only that one item (same id and name, no links, no project notes), autosave writes it back in the v1 format, as before. The autosave of a one-box project (for example `new_sub_box.json`) and the older scripts that read project files keep working.
- An item opened by switching the Section is kept in memory only until something in it is changed, so just looking at another section changes no file.
- The first time a v1 file must be written as v2 (a second item, a renamed item, links), the server copies the v1 file to `data/private/deleted/<name>.bak-<YYYY-MM-DD>-pre-B1.json` first (once per day per project; `app/server/store2.mjs` `backupBeforeV2`). The usual `<name>.json.prev` copy of the previous version is still made on every write.
- With an app server older than B1 (no `features` in `/api/health`) the app keeps writing v1 and refuses a v2 write over a v1 file, with a message to run `scripts/restart_app.sh`.

## Server routes (B1)

| Route | What |
|---|---|
| `GET /api/health` | `{ ok, data, features: ["projects-v2", "items", "trash", "branding", "project-delete"] }` |
| `GET /api/projects` | `[{ name, title, format, section, items, saved }]` |
| `GET/PUT /api/projects/<name>` | As before; a v2 PUT over a v1 file backs it up first (response `backup`). |
| `DELETE /api/projects/<name>` | Moves `<name>.json` and the folder `<name>/` to `data/private/deleted/project.<name>.<ms>[.json]`. |
| `GET /api/items` | `[{ id, name, section, kind, saved }]`, newest first. |
| `GET/PUT/DELETE /api/items/<id>` | One item; PUT needs `kind` and `section`; DELETE moves the file to `data/private/deleted/item.<id>.<ms>.json`. |
| `PUT /api/trash/<label>` | Writes the body to `data/private/deleted/<label>.<ms>.json` (an item removed from a project). |
| `GET /api/branding`, `GET /api/branding/logo.svg` (or .png, .webp, .jpg) | The logo from `data/branding/` (`{ logo: null }` until it is there). |

Settings (`data/private/settings.json`, `/api/settings`): `defaultSection` added; `defaultTab` may now also be `boards`, `door`, `ib`, `project`.

## Known limits

- Measurements (REW) and exports are kept per project name, so two box items in one project share them; a single item's exports go to `data/projects/<item id>/exports/` and do not follow the item into a project.
- Duplicating a project copies the project file only, not its measurements or exports.
