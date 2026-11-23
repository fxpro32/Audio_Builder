#!/usr/bin/env python3
"""Polite single-page fetcher for the high-power sub research (agent A3, 2026-11-21).
Usage: python3 -I hp_fetch.py URL [--pdf OUT.pdf] [--grep REGEX] [--max N]
Waits 3 s before each request (human pace), fetches one URL with curl,
prints the page as plain text (scripts/styles removed). With --pdf saves the file
and prints its text via scripts/pdf_text.mjs. Only for individual spec pages/PDFs."""
import html, re, subprocess, sys, time

def main():
    a = sys.argv[1:]
    url = a[0]
    pdf = a[a.index("--pdf") + 1] if "--pdf" in a else None
    grep = a[a.index("--grep") + 1] if "--grep" in a else None
    mx = int(a[a.index("--max") + 1]) if "--max" in a else 20000
    time.sleep(3)
    ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    if pdf:
        r = subprocess.run(["curl", "-sL", "-m", "60", "-A", ua, "-o", pdf, url])
        out = subprocess.run(["node", "/workspace/scripts/pdf_text.mjs", pdf], capture_output=True, text=True)
        txt = out.stdout or out.stderr
    else:
        r = subprocess.run(["curl", "-sL", "-m", "40", "--compressed", "-A", ua, url], capture_output=True)
        raw = r.stdout.decode("utf-8", "replace")
        pdfs = sorted(set(re.findall(r"""href=["']([^"']+\.pdf[^"']*)["']""", raw, re.I)))
        raw = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw)
        raw = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d|table|dt|dd)>", "\n", raw)
        raw = re.sub(r"(?i)</t[dh]>", " | ", raw)
        raw = re.sub(r"<[^>]+>", " ", raw)
        txt = html.unescape(raw)
        txt = "\n".join(re.sub(r"[ \t\xa0]+", " ", l).strip() for l in txt.splitlines())
        txt = re.sub(r"\n\s*\n+", "\n", txt)
        txt += "\nPDF_LINKS:\n" + "\n".join(pdfs)
    if grep:
        lines = txt.splitlines()
        keep = set()
        for i, l in enumerate(lines):
            if re.search(grep, l, re.I):
                keep.update(range(max(0, i - 1), min(len(lines), i + 3)))
        txt = "\n".join(lines[i] for i in sorted(keep))
    print(txt[:mx])

main()
