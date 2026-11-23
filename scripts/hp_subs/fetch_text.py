#!/usr/bin/env python3
"""A2/A3 hp-subs research helper: fetch one page at human pace, keep the raw copy for audit, print cleaned text.
Usage: fetch_text.py URL OUT_HTML [--delay S] [--around WORD] [--span N]
Raw copies go under references/raw/hp_subs/ (gitignored). Never executes downloaded content."""
import sys, time, re, html, subprocess, argparse
ap = argparse.ArgumentParser(); ap.add_argument("url"); ap.add_argument("out")
ap.add_argument("--delay", type=float, default=6); ap.add_argument("--around", default=None); ap.add_argument("--span", type=int, default=4000)
ap.add_argument("--nofetch", action="store_true")
a = ap.parse_args()
if not a.nofetch:
    time.sleep(a.delay)
    r = subprocess.run(["curl", "-s", "-L", "-m", "40", "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
                        "-H", "Accept: text/html,application/xhtml+xml", "-o", a.out, "-w", "%{http_code} %{size_download}", a.url], capture_output=True, text=True)
    print("HTTP", r.stdout, file=sys.stderr)
t = open(a.out, encoding="utf-8", errors="replace").read()
t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
t = re.sub(r"<[^>]+>", "|", t); t = html.unescape(t); t = re.sub(r"\s+", " ", t); t = re.sub(r"(\s*\|\s*)+", "|", t)
if a.around:
    i = t.find(a.around)
    print(t[max(0, i - 300): i + a.span] if i >= 0 else f"[no '{a.around}']")
else:
    print(t)
