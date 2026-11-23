#!/bin/bash
# RUNS ON: Fedora host OR the Audio_Builder container (paths are worked out from this script's own location).
# Builds the web app if needed and starts the server on port 8420 in the background (log: data/private/server.log).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/app" || exit 1
command -v node >/dev/null || { echo "Node.js is not installed here. On Fedora: sudo dnf install nodejs"; exit 1; }
export npm_config_cache="$ROOT/.npm-cache/cache"
[ -d node_modules ] || npm ci
[ -f dist/index.html ] || npm run build
if curl -s -m 2 http://127.0.0.1:8420/api/health >/dev/null; then echo "Already running: open http://localhost:8420 in your web browser"; exit 0; fi
mkdir -p "$ROOT/data/private"
nohup node server/server.mjs >> "$ROOT/data/private/server.log" 2>&1 &
sleep 1
if curl -s -m 2 http://127.0.0.1:8420/api/health >/dev/null; then echo "Running: open http://localhost:8420 in your web browser"; else echo "Failed: see $ROOT/data/private/server.log"; fi
