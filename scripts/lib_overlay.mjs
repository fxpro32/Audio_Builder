// P1_PUBLIC_DATA (2026-11-23): public data + private overlay, shared by the importers.
// Public data = data/<path> (tracked in git, no retailer or supplier data). Private overlay = data/private/<same path>
// (gitignored, the owner's machine only: retailer-listing records, prices, supplier catalogues, records read past a bot block).
// Each importer writes the public bundle to data/<path> from the public inputs only, and, when private inputs exist, the full
// bundle (as before the split) to data/private/<same path> from the public inputs overlaid by the private ones.
// Spec: references/terms_check_public_release.md; split tool: scripts/public_data/split.py.
import fs from "node:fs";
import path from "node:path";

/** JSON file names in a folder (sorted); [] when the folder is missing. */
export const jsonFiles = (dir) => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);

/** Files of one folder with the private overlay: [{ name, file, private }] sorted by name; a private file replaces the public
 * file of the same name. privDir undefined = public only. */
export function overlayFiles(pubDir, privDir) {
  const m = new Map();
  for (const f of jsonFiles(pubDir)) m.set(f, { name: f, file: path.join(pubDir, f), private: false });
  for (const f of jsonFiles(privDir)) m.set(f, { name: f, file: path.join(privDir, f), private: true });
  return [...m.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Any key containing "price" (any depth) removed, and "price..." names in a source's `fields` list (e.g. "price_aud"): the
 * public copy carries no prices (same rule as scripts/public_data/split.py). */
export function stripPrices(o) {
  if (Array.isArray(o)) return o.map(stripPrices);
  if (o && typeof o === "object") {
    const r = {};
    for (const [k, v] of Object.entries(o)) if (!/price/i.test(k)) r[k] = k === "fields" && Array.isArray(v) ? v.filter((x) => !(typeof x === "string" && /price/i.test(x))) : stripPrices(v);
    return r;
  }
  return o;
}

/** True when a parts_raw record or file was built from a retailer listing (source tier "retailer"). */
export const fromRetailer = (rec) => (rec?.sources || []).some((s) => s?.tier === "retailer");

/** data/private next to a data folder. */
export const privateOf = (dataDir) => path.join(dataDir, "private");
