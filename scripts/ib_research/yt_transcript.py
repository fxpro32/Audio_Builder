#!/usr/bin/env python3
"""R1_IB: save a YouTube video's metadata + English caption track (auto or manual) as text with [mm:ss] stamps.
Usage: python3 -I yt_transcript.py <videoId> <outdir>. Reads the public watch page only; one request per page, polite."""
import re, json, sys, urllib.request, time, html
vid, out = sys.argv[1], sys.argv[2]
UA = {'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en'}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode('utf-8', 'ignore')
t = get('https://www.youtube.com/watch?v=' + vid)
open(f'{out}/yt_watch_{vid}.html', 'w').write(t)
m = re.search(r'var ytInitialPlayerResponse = (\{.*?\});(?:var|</script>)', t, re.S)
d = json.loads(m.group(1))
vd = d['videoDetails']; mf = d.get('microformat', {}).get('playerMicroformatRenderer', {})
head = f"title: {vd['title']}\nurl: https://www.youtube.com/watch?v={vid}\nchannel: {vd.get('author')}\npublished: {mf.get('publishDate')}\nlength_s: {vd['lengthSeconds']}\nfetched: {time.strftime('%Y-%m-%d')}\n\ndescription:\n{vd.get('shortDescription','')}\n\n"
tracks = d.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
en = [c for c in tracks if c['languageCode'].startswith('en')]
body = 'NO ENGLISH CAPTION TRACK\n'
if en:
    c = en[0]; time.sleep(3)
    j = get(c['baseUrl'] + '&fmt=json3')
    if j.strip():
        ev = json.loads(j).get('events', [])
        lines = []
        for e in ev:
            s = ''.join(x.get('utf8', '') for x in e.get('segs', []) or []).replace('\n', ' ').strip()
            if s:
                ms = e.get('tStartMs', 0); lines.append(f"[{ms//60000:02d}:{ms//1000%60:02d}] {s}")
        body = f"transcript ({c['languageCode']}, kind={c.get('kind')}):\n" + '\n'.join(lines) + '\n'
    else:
        body = 'CAPTION FETCH RETURNED EMPTY (YouTube may require a PO token)\n'
open(f'{out}/yt_{vid}.txt', 'w').write(head + body)
print(vid, vd['title'][:60], mf.get('publishDate'), body[:60].replace('\n', ' '))
