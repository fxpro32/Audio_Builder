# A6: print the visible text of a saved HTML page as one line per block (untrusted data, parsed only).
import re, html, sys
t = open(sys.argv[1], encoding='utf8', errors='replace').read()
t = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', t); t = re.sub(r'<[^>]+>', '\n', t); t = html.unescape(t)
print('\n'.join(l.strip() for l in t.split('\n') if l.strip()))
