#!/bin/bash
# R3: Kicker car amplifier pages (series pages -> product pages), 3 s apart. Raw copies: references/raw/parts/pages/kicker/
P=/workspace/references/raw/parts/pages/kicker; mkdir -p $P
for s in cx-amplifiers iq-amplifiers kx-amplifiers lx-amplifiers px-amplifiers pxa-amplifiers warhorse-amplifiers kpx-series-amplifiers vxa_amplifiers; do
  [ -s $P/s_$s.html ] || /workspace/scripts/parts/fetch.sh https://www.kicker.com/$s $P/s_$s.html 3
done
grep -ho 'href="/[a-z0-9]*[0-9][a-z0-9-]*amplifier[a-z0-9-]*"' $P/s_*.html | sort -u | sed 's/href="\///;s/"//' > $P/product_list.txt
echo "products: $(wc -l < $P/product_list.txt)"
while read h; do [ -s $P/p_$h.html ] || /workspace/scripts/parts/fetch.sh https://www.kicker.com/$h $P/p_$h.html 3; done < $P/product_list.txt
echo KICKER_DONE
