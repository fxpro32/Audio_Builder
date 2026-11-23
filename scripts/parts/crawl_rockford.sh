#!/bin/bash
# R3: Rockford Fosgate amplifier product pages from the car-amplifier selector, 3 s apart.
P=/workspace/references/raw/parts/pages/rockford; mkdir -p $P
grep -o 'href="[^"]*details/[a-z0-9-]\+/"' $P/sel_car_amps.html | sed 's/.*details\///;s/\/"//' | sort -u > $P/product_list.txt
echo "products: $(wc -l < $P/product_list.txt)"
while read h; do [ -s $P/p_$h.html ] || /workspace/scripts/parts/fetch.sh https://rockfordfosgate.com/products/details/$h/ $P/p_$h.html 3; done < $P/product_list.txt
echo ROCKFORD_DONE
