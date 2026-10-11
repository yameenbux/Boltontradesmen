#!/usr/bin/env bash
# Stop the proxy, PostgREST and Supabase Auth started by start.sh.
# Postgres (cluster 16/supa) is left running; stop it with
#   pg_ctlcluster 16 supa stop
set -euo pipefail
RUN="$(cd "$(dirname "$0")" && pwd)/run"

for name in proxy postgrest auth; do
  pidfile="$RUN/$name.pid"
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      echo "[stack] stopped $name (pid $pid)"
    else
      echo "[stack] $name not running (stale pid $pid)"
    fi
    rm -f "$pidfile"
  else
    echo "[stack] $name not running"
  fi
done
