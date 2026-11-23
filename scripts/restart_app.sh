#!/bin/bash
# RUNS ON: Fedora host (or the container). Stops the Audio_Builder server listening on port 8420 (only that one), then starts it again.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID=$(ss -ltnpH 'sport = :8420' 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
if [ -n "$PID" ] && tr '\0' ' ' < /proc/$PID/cmdline 2>/dev/null | grep -q 'server/server.mjs'; then
  echo "Stopping Audio_Builder server (PID $PID)"; kill "$PID"
  for i in 1 2 3 4 5; do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
elif [ -n "$PID" ]; then
  echo "Port 8420 is used by something that is not the Audio_Builder server (PID $PID); not touching it."; exit 1
else
  echo "No server running on 8420."
fi
bash "$ROOT/scripts/start_app.sh"
