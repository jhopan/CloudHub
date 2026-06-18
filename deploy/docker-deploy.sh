#!/usr/bin/env bash
# ==============================================================================
# CloudHub Storage Gateway - Docker Deployment Script
# Deploys the application using Docker Compose with .env.docker configuration
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

# ─── Setup .env from .env.docker ─────────────────────────────────────────────
cd "${PROJECT_ROOT}"

if [[ -f .env.docker ]]; then
    info "Copying .env.docker → .env"
    cp .env.docker .env
elif [[ -f .env ]]; then
    warn ".env already exists and no .env.docker found — using existing .env"
else
    error "No .env.docker or .env found. Copy .env.docker.example to .env.docker and configure it."
    exit 1
fi

# ─── Build and start ─────────────────────────────────────────────────────────
info "Building and starting Docker Compose services..."
docker compose up -d --build

# ─── Health check ─────────────────────────────────────────────────────────────
info "Waiting for backend health check..."

BACKEND_PORT=$(grep -oP 'BACKEND_PORT=\K[0-9]+' .env 2>/dev/null || echo "8888")
MAX_RETRIES=30
RETRY_INTERVAL=2

for ((i=1; i<=MAX_RETRIES; i++)); do
    if curl -sf "http://localhost:${BACKEND_PORT}/api/v1/health" >/dev/null 2>&1; then
        echo ""
        info "Backend is healthy and responding!"
        break
    fi
    if [[ $i -eq $MAX_RETRIES ]]; then
        warn "Backend did not respond after $((MAX_RETRIES * RETRY_INTERVAL))s. It may still be starting up."
        warn "Check logs: docker compose logs -f backend"
    else
        printf "."
        sleep ${RETRY_INTERVAL}
    fi
done

# ─── Summary ──────────────────────────────────────────────────────────────────
FRONTEND_PORT=$(grep -oP 'FRONTEND_PORT=\K[0-9]+' .env 2>/dev/null || echo "3333")

echo ""
info "CloudHub Storage Gateway is running!"
echo ""
echo "  Frontend:  http://localhost:${FRONTEND_PORT}"
echo "  Backend:   http://localhost:${BACKEND_PORT}/api/v1"
echo ""
echo "  Logs:      docker compose logs -f"
echo "  Stop:      docker compose down"
echo ""
