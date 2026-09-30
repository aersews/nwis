#!/usr/bin/env bash
# =========================================================
# NWIS — start the backend and the frontend together.
#
#   ./scripts/dev.sh          start both and wait until ready
#   ./scripts/dev.sh stop     stop both
#
# Services run in their own process group so they survive the
# shell that launched them. PIDs are recorded in logs/pids and
# stopped by PID: a pattern match on "vite" would also match
# any shell whose command line happens to contain the word.
# =========================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs"
PIDS="$LOGS/pids"
VENV="$ROOT/.venv/bin/python"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

mkdir -p "$LOGS"

stop() {
  local stopped=0

  if [ -f "$PIDS/frontend.pid" ]; then
    local pid
    pid="$(cat "$PIDS/frontend.pid")"
    # Kill the whole process group so npm and its vite child
    # both stop.
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$PIDS/frontend.pid"
    stopped=1
  fi

  if [ -f "$PIDS/backend.pid" ]; then
    local pid
    pid="$(cat "$PIDS/backend.pid")"
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$PIDS/backend.pid"
    stopped=1
  fi

  if [ "$stopped" = "1" ]; then
    echo "NWIS stopped."
  else
    echo "NWIS was not running."
  fi
}

if [ "${1:-start}" = "stop" ]; then
  stop
  exit 0
fi

if [ ! -x "$VENV" ]; then
  echo "error: $VENV not found."
  echo "  python -m venv .venv"
  echo "  .venv/bin/pip install -r requirements.txt"
  exit 1
fi

mkdir -p "$PIDS"

cd "$ROOT"

setsid nohup "$VENV" -m uvicorn backend.main:app \
  --port "$BACKEND_PORT" --host 127.0.0.1 \
  > "$LOGS/backend.log" 2>&1 < /dev/null &
echo $! > "$PIDS/backend.pid"
echo "backend  → http://127.0.0.1:$BACKEND_PORT   (logs/backend.log)"

HAVE_FRONTEND=0

if [ -d "$ROOT/frontend/node_modules" ]; then
  HAVE_FRONTEND=1
  cd "$ROOT/frontend"
  setsid nohup npm run dev -- --port "$FRONTEND_PORT" \
    > "$LOGS/frontend.log" 2>&1 < /dev/null &
  echo $! > "$PIDS/frontend.pid"
  echo "frontend → http://127.0.0.1:$FRONTEND_PORT   (logs/frontend.log)"
else
  echo "frontend → skipped: run 'cd frontend && npm install' first"
fi

wait_for() {
  local url="$1" name="$2" log="$3"
  printf '  waiting for %s' "$name"
  for _ in $(seq 1 60); do
    if curl -fsS -m 2 -o /dev/null "$url" 2>/dev/null; then
      echo " ready"
      return 0
    fi
    printf '.'
    sleep 1
  done
  echo " NOT RESPONDING"
  echo ""
  echo "  Last lines of $log:"
  tail -n 25 "$log" 2>/dev/null || true
  return 1
}

wait_for "http://127.0.0.1:$BACKEND_PORT/api/status" \
  "backend" "$LOGS/backend.log" || exit 1

if [ "$HAVE_FRONTEND" = "1" ]; then
  wait_for "http://127.0.0.1:$FRONTEND_PORT/" \
    "frontend" "$LOGS/frontend.log" || exit 1
fi

echo ""
echo "NWIS is online."
echo ""
echo "  Dashboard : http://127.0.0.1:$FRONTEND_PORT"
echo "  API docs  : http://127.0.0.1:$BACKEND_PORT/docs"
echo "  Stop      : ./scripts/dev.sh stop"
echo ""
echo "  Reproduce the reported figures:"
echo "    python -m evaluation.replay --all"
echo "    python -m evaluation.evaluate"
echo "    python -m evaluation.smoke"
exit 0
