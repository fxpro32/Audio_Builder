# A6: extract model title and the 'Технические характеристики' + T/S block from saved Ural product pages.
import re, html, sys, glob, os, json
res = {}
for f in sorted(glob.glob('/workspace/references/raw/hp_subs/direct/ural/*.html')):
    n = os.path.basename(f)[:-5]
    if n in ('passive-sub', 'dev') or n.startswith('news-'): continue
    t = open(f, encoding='utf8', errors='replace').read()
    t = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', t); t = re.sub(r'<[^>]+>', '\n', t); t = html.unescape(t)
    L = [l.strip() for l in t.split('\n') if l.strip()]
    title = L[0]
    try:
        s = L.index('Технические характеристики'); e = next(i for i in range(s, len(L)) if L[i].startswith('Доставка') or L[i] == 'Отзывы')
    except (ValueError, StopIteration):
        res[n] = {'title': title, 'spec': None}; continue
    blk = L[s+1:e]; d = {}; i = 0
    while i < len(blk) - 1:
        if blk[i] == 'Параметры Тиля-Смолла': i += 1; continue
        d[blk[i]] = blk[i+1]; i += 2
    res[n] = {'title': title, 'spec': d}
json.dump(res, open('/workspace/references/raw/hp_subs/direct/ural/_extract.json', 'w'), ensure_ascii=False, indent=1)
for n, v in res.items():
    s = v['spec'] or {}
    print(n, '|', v['title'][:70], '| nom', s.get('Номинальная мощность'), '| max', s.get('Максимальная мощность'), '| Ом', s.get('Сопротивление, Ом'), '| Fs', s.get('Fs, Гц'))
