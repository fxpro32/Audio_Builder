#!/usr/bin/env python3
"""Print the spec segment of a saved page text (stdin): window around the first T/S keyword found after the nav."""
import sys, re
t = sys.stdin.read(); start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
before = int(sys.argv[2]) if len(sys.argv) > 2 else 700; after = int(sys.argv[3]) if len(sys.argv) > 3 else 1300
best = None
for k in ["Qts", "QTS", "Qtc", "Q ts", "Fs (Hz)", "|Fs|", "FS (Hz)", "Vas", "VAS"]:
    i = t.find(k, start)
    if i >= 0 and (best is None or i < best): best = i
print(t[max(0, best - before): best + after] if best is not None else "[no T/S keyword]")
