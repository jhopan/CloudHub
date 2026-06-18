#!/usr/bin/env bash
# ==============================================================================
# CloudHub Storage Gateway - VPS Setup Script
# Prepares a fresh VPS for both Docker and Manual deployments
# Run as root or with sudo
# ==============================================================================
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

# ─── Root check ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (or with sudo)."
    exit 1
fi

# ─── 1. Install rclone if not present ─────────────────────────────────────────
if command -v rclone &>/dev/null; then
    info "rclone is already installed ($(rclone version | head -1))"
else
    info "Installing rclone..."
    curl -sSL https://rclone.org/install.sh | bash
    info "rclone installed ($(rclone version | head -1))"
fi

# ─── 2. Ensure PostgreSQL is available ────────────────────────────────────────
if ! command -v psql &>/dev/null; then
    warn "PostgreSQL client (psql) not found. Attempting install..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq postgresql-client
    elif command -v dnf &>/dev/null; then
        dnf install -y postgresql
    elif command -v yum &>/dev/null; then
        yum install -y postgresql
    else
        error "Could not auto-install PostgreSQL client. Please install manually."
        exit 1
    fi
fi

# ─── 3. Create PostgreSQL databases ──────────────────────────────────────────
info "Creating PostgreSQL databases..."

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='cloudhub_docker'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE cloudhub_docker;"
info "Database 'cloudhub_docker' ready"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='cloudhub_manual'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE cloudhub_manual;"
info "Database 'cloudhub_manual' ready"

# ─── 4. Open firewall ports ──────────────────────────────────────────────────
PORTS=(3333 3434 8888 8989)

if command -v ufw &>/dev/null; then
    info "Configuring UFW firewall..."
    for port in "${PORTS[@]}"; do
        ufw allow "${port}/tcp" >/dev/null 2>&1
        info "Opened port ${port}/tcp (UFW)"
    done
elif command -v firewall-cmd &>/dev/null; then
    info "Configuring firewalld..."
    for port in "${PORTS[@]}"; do
        firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null 2>&1
        info "Opened port ${port}/tcp (firewalld)"
    done
    firewall-cmd --reload >/dev/null 2>&1
else
    warn "No supported firewall (ufw/firewalld) detected. Please open these ports manually:"
    for port in "${PORTS[@]}"; do
        echo "  - ${port}/tcp"
    done
fi

# ─── 5. Create system user for manual deployment ─────────────────────────────
CLOUDHUB_USER="cloudhub"
if id "${CLOUDHUB_USER}" &>/dev/null; then
    info "System user '${CLOUDHUB_USER}' already exists"
else
    useradd --system --create-home --shell /bin/bash "${CLOUDHUB_USER}"
    info "Created system user '${CLOUDHUB_USER}'"
fi

# Create application directories
mkdir -p /opt/cloudhub/{bin,config,data,logs,frontend}
chown -R "${CLOUDHUB_USER}:${CLOUDHUB_USER}" /opt/cloudhub
info "Application directories ready at /opt/cloudhub"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
info "VPS setup complete!"
echo ""
echo "  Docker deployment:  ./deploy/docker-deploy.sh"
echo "  Manual deployment:  ./deploy/manual-deploy.sh /path/to/server-binary"
echo ""
