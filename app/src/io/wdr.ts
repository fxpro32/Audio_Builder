// WinISD .wdr driver files: Windows INI, [Driver] section, SI units (spec: references/raw/openisd_WINISD_SCHEMA.md).
import { Driver, DriverParams } from "../engine/driver";

export function parseWdr(text: string, fileName = ""): Driver {
  const kv: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("[") || line.startsWith(";")) continue;
    const i = line.indexOf("=");
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const n = (k: string) => { const v = parseFloat(kv[k] ?? ""); return isFinite(v) && v !== 0 ? v : undefined; };
  const p: DriverParams = {
    fs: n("Fs")!, Re: n("Re")!, Qms: n("Qms")!, Qes: n("Qes")!, Qts: n("Qts"), Vas: n("Vas"), Sd: n("Sd") ?? (n("Dd") ? Math.PI * n("Dd")! ** 2 / 4 : NaN),
    Xmax: n("Xmax"), Le: n("Le"), Pe: n("Pe"), Mms: n("Mms"), Cms: n("Cms"), Rms: n("Rms"), Bl: n("BL"), Znom: n("Znom"), sens1W: n("SPL"),
    dia: n("Dia"),
  };
  const brand = kv.Brand || "Unknown", model = kv.Model || fileName.replace(/\.wdr$/i, "");
  return {
    id: slug(brand + "-" + model), brand, model, params: p,
    sources: [{ param: "*", source: `WinISD file ${fileName}`.trim(), where: kv.ProvidedBy ? `ProvidedBy=${kv.ProvidedBy}` : undefined }],
    notes: kv.Comment || undefined,
  };
}

export function writeWdr(d: Driver): string {
  const p = d.params;
  const lines: [string, number | string | undefined][] = [
    ["Brand", d.brand], ["Model", d.model], ["ProvidedBy", "Audio_Builder export"], ["Comment", d.notes ?? ""],
    ["Znom", p.Znom], ["Fs", p.fs], ["Pe", p.Pe], ["SPL", p.sens1W], ["Re", p.Re], ["Le", p.Le], ["BL", p.Bl], ["Xmax", p.Xmax],
    ["Cms", p.Cms], ["Qms", p.Qms], ["Qes", p.Qes], ["Rms", p.Rms], ["Mms", p.Mms], ["Sd", p.Sd], ["Vas", p.Vas], ["Dia", p.dia],
  ];
  return "[Driver]\r\n" + lines.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${v}`).join("\r\n") + "\r\n";
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "driver";
