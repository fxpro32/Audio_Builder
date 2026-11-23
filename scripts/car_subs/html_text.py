#!/usr/bin/env python3
"""R2B_SUBS_MORE: print a saved HTML page as plain text (scripts/styles removed, table cells separated by ' | '), same rules as
scripts/hp_fetch.py. Usage: python3 -I html_text.py page.html"""
import html, re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
raw = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw)
raw = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d|table|dt|dd)>", "\n", raw)
raw = re.sub(r"(?i)</t[dh]>", " | ", raw)
t = html.unescape(re.sub(r"<[^>]+>", " ", raw))
t = "\n".join(re.sub(r"[ \t\xa0]+", " ", l).strip() for l in t.splitlines())
print(re.sub(r"\n\s*\n+", "\n", t))
