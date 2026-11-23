# A6: extract the Specifications table (Model ... until 'Download drivers') from saved Reiss product pages.
import re, html, glob, os, json
res = {}
for f in sorted(glob.glob('/workspace/references/raw/hp_subs/direct/reiss-audio/rs-*.html')):
    n = os.path.basename(f)[:-5]
    t = open(f, encoding='utf8', errors='replace').read()
    pdfs = sorted(set(re.findall(r'https?://[^"\' ]+\.pdf', t)))
    t = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', t); t = re.sub(r'<[^>]+>', '\n', t); t = html.unescape(t)
    L = [l.strip() for l in t.split('\n') if l.strip()]
    try:
        s = L.index('Technical details of this product.'); e = next(i for i in range(s, len(L)) if L[i].startswith('Download drivers'))
    except (ValueError, StopIteration):
        res[n] = {'spec': None, 'pdfs': pdfs}; continue
    blk = L[s+1:e]; desc = blk[0] if not blk[0] == 'Model' else ''
    i = blk.index('Model') if 'Model' in blk else 1; d = {}
    while i < len(blk) - 1: d[blk[i]] = blk[i+1]; i += 2
    res[n] = {'desc': desc, 'spec': d, 'pdfs': pdfs}
json.dump(res, open('/workspace/references/raw/hp_subs/direct/reiss-audio/_extract.json', 'w'), ensure_ascii=False, indent=1)
keys = set(k for v in res.values() if v['spec'] for k in v['spec'])
print('keys:', sorted(keys))
for n, v in res.items():
    s = v['spec'] or {}
    print(n, '| RMS', s.get('RMS Power'), '| max', s.get('Max Power'), '| Z', s.get('Impedance'), '| size', s.get('Size'), '| VC', s.get('Voice Coil Size'), '| coil', s.get('Voice Coil'), '| pdf', [p.split('/')[-1] for p in v['pdfs']])
