"""R2_SUBS_ALL: parser for Audio Design GmbH data sheets (ESX, Musway, Crunch brands share one layout): label column then value
column on the 'Technical Specifications' block, 'Dimensions & Weight' block, 'Power Handling' line, 'Recommended Enclosure' blocks.
parse(pdf) -> dict with keys model, size_cm, coil, ohm, rms, peak, params, depth, cut, boxes, notes (values as printed, decimal commas converted)."""
import re, os, subprocess


def n(s):
    if s is None: return None
    m = re.search(r"\d+(?:[.,]\d+)?", s.replace("+/- ", ""))
    if not m: return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


def parse(pdf):
    t = subprocess.run(["node", "/workspace/scripts/pdf_text.mjs", pdf], capture_output=True, text=True).stdout
    L = [x.strip() for x in t.splitlines() if x.strip()]
    J = "|".join(L)
    out = {"params": {}, "notes": [], "boxes": []}
    if "Technical Specifications" in L and "Zn" in L:
        i = L.index("Zn"); j = i
        while j < len(L) and not re.match(r"^[\d+]", L[j]): j += 1
        labs = L[L.index("Technical Specifications") + 1:i]; vals = L[j:j + len(labs)]
        d = dict(zip(labs, vals))
        z = d.get("Impedance", "")
        mz = re.search(r"(\d)\s*x\s*([\d,]+)", z)
        out["coil"], out["ohm"] = (("DVC" if mz.group(1) == "2" else "QVC"), n(mz.group(2))) if mz else ("SVC", n(z))
        out["params"] = dict(xmax_mm=n(d.get("Max. Linear Excursion")), sd_cm2=n(d.get("Cone Area")), mms_g=n(d.get("Moving Mass")),
                             re_ohm=n((d.get("DC Resistance") or "").split("x")[-1]), fs_hz=n(d.get("Resonance Frequency")), qms=n(d.get("Mechanical Q-Factor")),
                             qes=n(d.get("Electrical Q-Factor")), qts=n(d.get("Total Q-Factor")), vas_l=n(d.get("Equivalent Air Volume")),
                             le_mh=n(d.get("VC Inductance")), bl_tm=n(d.get("Flux Density")), spl_db_1w1m=n(d.get("Efficiency 1W/1m")))
        ok = len(labs) == len(vals) and str(d.get("Flux Density", "")).endswith("N/A")
        out["notes"].append("Data sheet prints labels and values in separate columns; paired in printed order"
                            + ("; row 'Flux Density' carries the B/L value in N/A (Tm), entered as bl_tm." if ok else "; CHECK: columns did not pair cleanly, values may be shifted."))
        if d.get("Max. Mechanical Excursion"): out["notes"].append(f"Max. mechanical excursion {d['Max. Mechanical Excursion']}; Xmax entered is the linear one-way value.")
    dm = re.search(r"External Diameter:\|Mounting Diameter:\|Mounting Depth:\|[^|]*\|([\d,]+) mm\|([\d,]+) mm\|([\d,]+) mm", J)
    out["cut"], out["depth"] = (n(dm.group(2)), n(dm.group(3))) if dm else (None, None)
    pw = re.search(r"([\d.,]+) Watts RMS / ([\d.,]+) Watts Max", J)
    out["rms"], out["peak"] = (n(pw.group(1).replace(".", "")), n(pw.group(2).replace(".", ""))) if pw else (None, None)
    sz = re.search(r"Subwoofer (\d+(?:[.,]\d+)?) cm", J)
    out["size_cm"] = n(sz.group(1)) if sz else None
    for vb in re.finditer(r"Vented Volume:\|Port Diameter:\|Port Area:\|Port Length:\|Tuning Freq\. \(Fb\):\|-3 dB Rolloff \(F3\):\|([\d,]+) L\|[^|]*\|[^|]*\|[^|]*\|([\d,]+) Hz", J):
        out["boxes"].append({"type": "ported", "volume_l": n(vb.group(1)), "tuning_hz": n(vb.group(2)), "source": "maker data sheet " + os.path.basename(pdf)})
    for sb in re.finditer(r"Sealed Volume:\|-3 dB Rolloff \(F3\):\|([\d,]+)(?: - [\d,]+)? L", J):
        out["boxes"].append({"type": "sealed", "volume_l": n(sb.group(1)), "tuning_hz": None, "source": "maker data sheet " + os.path.basename(pdf)})
    m = re.search(r"\|([A-Z0-9-]{4,})\|(?:Dual|Single|Quad) Voice Coil", J)
    out["model"] = m.group(1) if m else None
    return out


SIZE = {16.5: 6.5, 17: 6.5, 20: 8, 25: 10, 30: 12, 38: 15, 46: 18, 53: 21}
