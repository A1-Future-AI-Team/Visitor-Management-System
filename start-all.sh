#!/bin/bash
# ============================================
# VMS - Start All Services
# ============================================
# Launches all 3 backends (uvicorn) and 3 frontends (next dev)
# Press Ctrl+C to stop everything.

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo "All services stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "=========================================="
echo "  Starting Visitor Management System"
echo "=========================================="

# --- Backends ---
echo "[Backend] Registration API  → http://localhost:8000"
cd "$ROOT_DIR/registration-app"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
PIDS+=($!)

echo "[Backend] Check-in API      → http://localhost:8001"
cd "$ROOT_DIR/check-in-app"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001 &
PIDS+=($!)

echo "[Backend] Admin API         → http://localhost:8002"
cd "$ROOT_DIR/admin-app"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8002 &
PIDS+=($!)

# --- Frontends ---
echo "[Frontend] Registration UI  → http://localhost:3000"
cd "$ROOT_DIR/registration-app"
npx next dev --turbo -p 3000 &
PIDS+=($!)

echo "[Frontend] Check-in UI      → http://localhost:3001"
cd "$ROOT_DIR/check-in-app"
npx next dev --turbo -p 3001 &
PIDS+=($!)

echo "[Frontend] Admin UI         → http://localhost:3002"
cd "$ROOT_DIR/admin-app"
npx next dev --turbo -p 3002 &
PIDS+=($!)

echo "=========================================="
echo "  All 6 services launched!"
echo "  Press Ctrl+C to stop everything."
echo "=========================================="

wait
