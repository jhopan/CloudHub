#!/usr/bin/env bash
# ==============================================================================
# CloudHub Storage Gateway - Manual Deployment Script
# Deploys the backend as a systemd service and the frontend via Next.js
# Usage: ./deploy/manual-deploy.sh /path/to/server-binary
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

# ─── Argument check ──────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
    error "Usage: $0 <path-to-go-binary>"
    echo ""
    echo "  Build the backend first:"
    echo "    cd backend && go build -o ../cloudhub-server ./cmd/server"
    echo ""
    echo "  Then deploy:"
    echo "    $0 ./cloudhub-server"
    exit 1
fi

BINARY_PATH="$(realpath "$1")"
if [[ ! -f "${BINARY_PATH}" ]]; then
    error "Binary not found: ${BINARY_PATH}"
    exit 1
fi

CLOUDHUB_USER="cloudhub"
APP_DIR="/opt/cloudhub"

# ─── Root check ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (or with sudo)."
    exit 1
fi

# ─── Setup .env.manual ───────────────────────────────────────────────────────
cd "${PROJECT_ROOT}"

if [[ -f .env.manual ]]; then
    info "Using existing .env.manual"
else
    if [[ -f .env.manual.example ]]; then
        warn "No .env.manual found — copying from .env.manual.example"
        cp .env.manual.example .env.manual
        warn "Please review and edit .env.manual before production use!"
    else
        error "No .env.manual or .env.manual.example found."
        exit 1
    fi
fi

# Load environment values
source .env.manual
BACKEND_PORT="${BACKEND_PORT:-8989}"
FRONTEND_PORT="${FRONTEND_PORT:-3434}"

# ─── Install binary ──────────────────────────────────────────────────────────
info "Installing binary to ${APP_DIR}/bin/"
mkdir -p "${APP_DIR}/bin"
cp "${BINARY_PATH}" "${APP_DIR}/bin/cloudhub-server"
chmod +x "${APP_DIR}/bin/cloudhub-server"
chown -R "${CLOUDHUB_USER}:${CLOUDHUB_USER}" "${APP_DIR}/bin"

# ─── Copy env file ───────────────────────────────────────────────────────────
info "Installing environment config to ${APP_DIR}/config/"
mkdir -p "${APP_DIR}/config"
cp .env.manual "${APP_DIR}/config/cloudhub.env"
chown -R "${CLOUDHUB_USER}:${CLOUDHUB_USER}" "${APP_DIR}/config"

# ─── Create backend systemd service ─────────────────────────────────────────
info "Creating systemd service: cloudhub-backend.service"
cat > /etc/systemd/system/cloudhub-backend.service <<EOF
[Unit]
Description=CloudHub Storage Gateway - Backend
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=${CLOUDHUB_USER}
Group=${CLOUDHUB_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/config/cloudhub.env
Environment=PORT=${BACKEND_PORT}
Environment=ENVIRONMENT=production
ExecStart=${APP_DIR}/bin/cloudhub-server
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloudhub-backend

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data ${APP_DIR}/logs

[Install]
WantedBy=multi-user.target
EOF

# ─── Create frontend systemd service ────────────────────────────────────────
info "Creating systemd service: cloudhub-frontend.service"
cat > /etc/systemd/system/cloudhub-frontend.service <<EOF
[Unit]
Description=CloudHub Storage Gateway - Frontend (Next.js)
After=network.target cloudhub-backend.service
Wants=cloudhub-backend.service

[Service]
Type=simple
User=${CLOUDHUB_USER}
Group=${CLOUDHUB_USER}
WorkingDirectory=${APP_DIR}/frontend
Environment=PORT=${FRONTEND_PORT}
Environment=NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api/v1
ExecStart=/usr/bin/npx next start -p ${FRONTEND_PORT}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloudhub-frontend

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data ${APP_DIR}/logs

[Install]
WantedBy=multi-user.target
EOF

# ─── Reload and start ────────────────────────────────────────────────────────
info "Reloading systemd..."
systemctl daemon-reload

info "Starting cloudhub-backend..."
systemctl enable --now cloudhub-backend.service

info "Starting cloudhub-frontend..."
systemctl enable --now cloudhub-frontend.service

# ─── Status check ────────────────────────────────────────────────────────────
sleep 3
echo ""
info "Service status:"
echo ""
systemctl status cloudhub-backend.service --no-pager -l 2>/dev/null || true
echo ""
systemctl status cloudhub-frontend.service --no-pager -l 2>/dev/null || true

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
info "Manual deployment complete!"
echo ""
echo "  Frontend:  http://localhost:${FRONTEND_PORT}"
echo "  Backend:   http://localhost:${BACKEND_PORT}/api/v1"
echo ""
echo "  Manage services:"
echo "    systemctl status  cloudhub-backend"
echo "    systemctl restart cloudhub-backend"
echo "    journalctl -u cloudhub-backend -f"
echo ""
echo "    systemctl status  cloudhub-frontend"
echo "    systemctl restart cloudhub-frontend"
echo "    journalctl -u cloudhub-frontend -f"
echo ""
