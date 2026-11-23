#!/bin/bash
# R4_CAR_DRIVERS: one HEAD-like GET per URL (3 s apart), prints HTTP code, size, final URL. Body discarded.
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
for U in "$@"; do sleep 3; echo "$(curl -s -L -m 25 --compressed -A "$UA" -o /dev/null -w '%{http_code} %{size_download} %{url_effective}' "$U") <- $U"; done
