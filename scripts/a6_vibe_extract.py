# A6: extract title, Technical Specifications list and PDF links from saved Vibe product pages.
import re, html, sys, glob, os, json
out = {}
for f in sorted(glob.glob('/workspace/references/raw/hp_subs/direct/vibe/*.html')):
    t = open(f, encoding='utf8', errors='replace').read()
    title = html.unescape(re.search(r'<title>(.*?)</title>', t, re.S).group(1)).strip()
    i = t.find('Technical Specifications')
    seg = t[i:i+4000] if i >= 0 else ''
    seg = seg[:seg.find('</ul>\n</li>\n</ul>')+20] if '</ul>\n</li>\n</ul>' in seg else seg[:2500]
    txt = html.unescape(re.sub(r'<[^>]+>', ' ', seg))
    txt = re.sub(r'\s+', ' ', txt)
    pdfs = sorted(set(re.findall(r'https://vibeaudio\.co\.uk/wp-content/uploads/[^"\' )]+\.pdf', t)))
    out[os.path.basename(f)] = {'title': title, 'spec': txt, 'pdfs': pdfs}
json.dump(out, open('/workspace/references/raw/hp_subs/direct/vibe/_extract.json', 'w'), indent=1)
for k, v in out.items():
    print('==', k, '|', v['title']); print('  ', v['spec'][:700]); [print('   PDF', p) for p in v['pdfs']]
