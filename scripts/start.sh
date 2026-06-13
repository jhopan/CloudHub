#!/usr/bin/env bash
# ==============================================================================
# CloudHub Storage Gateway - Start Script (Linux/macOS)
# Starts all services: PostgreSQL check, Redis check, Backend, Frontend
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()

# ─── Cleanup on exit ──────────────────────────────────────────────────────────

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ─── Pre-flight checks ───────────────────────────────────────────────────────

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   CloudHub Storage Gateway - Starting Services      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check backend binary exists
if [ ! -f "$PROJECT_ROOT/backend/server" ]; then
    echo -e "${RED}[✗] Backend binary not found.${NC}"
    echo "    Run scripts/install.sh first, or build manually:"
    echo "    cd backend && go build -o server ./cmd/server/"
    exit 1
fi

# Check if PostgreSQL is accessible
if command -v pg_isready &>/dev/null; then
    if ! pg_isready &>/dev/null 2>&1; then
        echo -e "${YELLOW}[!] PostgreSQL may not be running.${NC}"
        echo "    Start: sudo systemctl start postgresql  (Linux)"
        echo "    Start: brew services start postgresql   (macOS)"
        echo ""
        read -p "    Continue anyway? (y/N) " -n 1 -r
        echo ""
        [[ $REPLY =~ ^[Yy]$ ]] || exit 1
    fi
fi

# Check if Redis is accessible
if command -v redis-cli &>/dev/null; then
    if ! redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${YELLOW}[!] Redis may not be running.${NC}"
        echo "    Start: sudo systemctl start redis  (Linux)"
        echo "    Start: brew services start redis   (macOS)"
        echo ""
        read -p "    Continue anyway? (y/N) " -n 1 -r
        echo ""
        [[ $REPLY =~ ^[Yy]$ ]] || exit 1
    fi
fi

# ─── Start backend ────────────────────────────────────────────────────────────

echo -e "${GREEN}[✓]${NC} Starting backend on :8080..."
cd "$PROJECT_ROOT/backend"
./server &
PIDS+=($!)
BACKEND_PID=$!
echo -e "    ${CYAN}PID: $BACKEND_PID${NC}"

# Wait for backend to be ready
echo -n "    Waiting for backend"
for i in $(seq 1 30); do
    if curl -sf http://localhost:8080/api/v1/health &>/dev/null; then
        echo -e " ${GREEN}ready!${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ "$i" -eq 30 ]; then
        echo -e " ${YELLOW}timeout (may still be starting)${NC}"
    fi
done

# ─── Start frontend ──────────────────────────────────────────────────────────

echo -e "${GREEN}[✓]${NC} Starting frontend on :3000..."
cd "$PROJECT_ROOT/frontend"
npm start &
PIDS+=($!)
FRONTEND_PID=$!
echo -e "    ${CYAN}PID: $FRONTEND_PID${NC}"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✓ All services started!                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Frontend:  ${CYAN}http://localhost:3000${NC}"
echo -e "  Backend:   ${CYAN}http://localhost:8080${NC}"
echo -e "  API:       ${CYAN}http://localhost:8080/api/v1${NC}"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# ─── Wait for processes ──────────────────────────────────────────────────────

wait
