#!/usr/bin/env bash
# ==============================================================================
# CloudHub Storage Gateway - Manual Install Script
# Works on: Linux, macOS
# ==============================================================================
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ERRORS=0

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   CloudHub Storage Gateway - Installation Script    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Helper functions ──────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; ERRORS=$((ERRORS + 1)); }

check_command() {
    local cmd="$1"
    local install_hint="$2"
    if command -v "$cmd" &>/dev/null; then
        local ver
        ver=$("$cmd" --version 2>/dev/null | head -1 || echo "unknown")
        success "$cmd found ($ver)"
    else
        error "$cmd not found — $install_hint"
    fi
}

# ─── Check prerequisites ──────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Checking prerequisites...${NC}\n"

check_command "go"       "Install: https://go.dev/dl/"
check_command "node"     "Install: https://nodejs.org/ (v20+)"
check_command "npm"      "Comes with Node.js"
check_command "psql"     "Install PostgreSQL: https://www.postgresql.org/download/"
check_command "redis-cli" "Install Redis: https://redis.io/download/"
check_command "rclone"   "Install: curl https://rclone.org/install.sh | sudo bash"

if [ "$ERRORS" -gt 0 ]; then
    echo -e "\n${RED}✗ $ERRORS required tool(s) missing. Install them and re-run this script.${NC}\n"
    exit 1
fi

# ─── Verify Node.js version ──────────────────────────────────────────────────

NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
    error "Node.js v20+ required (found $(node --version))"
    exit 1
fi

# ─── Check services ──────────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Checking services...${NC}\n"

# Check PostgreSQL
if pg_isready &>/dev/null 2>&1; then
    success "PostgreSQL is running"
else
    warn "PostgreSQL may not be running. Start it with:"
    echo "    Linux: sudo systemctl start postgresql"
    echo "    macOS: brew services start postgresql"
fi

# Check Redis
if redis-cli ping 2>/dev/null | grep -q PONG; then
    success "Redis is running"
else
    warn "Redis may not be running. Start it with:"
    echo "    Linux: sudo systemctl start redis"
    echo "    macOS: brew services start redis"
fi

# ─── Create database ─────────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Setting up database...${NC}\n"

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-storage_gateway}"
DB_PASS="${DB_PASS:-postgres}"

if psql -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    warn "Database '$DB_NAME' already exists — skipping creation"
else
    info "Creating database '$DB_NAME'..."
    if psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;" 2>/dev/null; then
        success "Database '$DB_NAME' created"
    else
        warn "Could not create database automatically."
        echo "    Run: createdb -U $DB_USER $DB_NAME"
    fi
fi

# ─── Run migrations ──────────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Running database migrations...${NC}\n"

MIGRATION_DIR="$PROJECT_ROOT/backend/migrations"
if [ -d "$MIGRATION_DIR" ]; then
    MIGRATION_COUNT=0
    for f in "$MIGRATION_DIR"/*.up.sql; do
        [ -f "$f" ] || continue
        info "Applying: $(basename "$f")"
        if psql -U "$DB_USER" -d "$DB_NAME" -f "$f" 2>/dev/null; then
            success "Applied $(basename "$f")"
        else
            warn "Migration $(basename "$f") may have already been applied or failed"
        fi
        MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    done
    success "Processed $MIGRATION_COUNT migration file(s)"
else
    error "Migration directory not found: $MIGRATION_DIR"
fi

# ─── Build backend ───────────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Building Go backend...${NC}\n"

cd "$PROJECT_ROOT/backend"
info "Downloading Go dependencies..."
go mod download
success "Dependencies downloaded"

info "Compiling server binary..."
CGO_ENABLED=0 go build -ldflags="-s -w" -o server ./cmd/server/
success "Backend built → backend/server"

# ─── Build frontend ──────────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Building Next.js frontend...${NC}\n"

cd "$PROJECT_ROOT/frontend"
info "Installing npm dependencies..."
npm ci --silent 2>/dev/null || npm install --silent
success "Dependencies installed"

info "Building production bundle..."
npm run build
success "Frontend built"

# ─── Generate config ─────────────────────────────────────────────────────────

echo -e "\n${CYAN}▸ Generating configuration...${NC}\n"

CONFIG_FILE="$PROJECT_ROOT/backend/config.yaml"
if [ -f "$CONFIG_FILE" ]; then
    warn "config.yaml already exists — keeping existing file"
else
    info "Creating default config.yaml..."
    cat > "$CONFIG_FILE" << 'CONFIGEOF'
# Storage Gateway Configuration

# Server
port: 8080
environment: development

# Database
database_url: postgres://postgres:***@localhost:5432/storage_gateway?sslmode=disable

# Redis
redis_addr: localhost:6379
redis_password: ""
redis_db: 0

# JWT
jwt_secret: change-this-to-a-random-secret
jwt_access_token_ttl: 900
jwt_refresh_token_ttl: 604800

# Encryption (must be exactly 32 characters)
encryption_key: CloudHub32CharEncryptionKey2026X

# rclone
rclone_path: rclone
rclone_config_path: rclone.conf

# Upload
max_upload_size: 10737418240
upload_concurrency: 10

# Workers (in seconds)
worker_capacity_refresh_interval: 900
worker_health_check_interval: 300
worker_retry_transfer_interval: 600
worker_orphan_cleanup_interval: 3600
CONFIGEOF
    success "config.yaml created — edit backend/config.yaml to customize"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║            ✓ Installation Complete!                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${CYAN}Start the application:${NC}"
echo ""
echo -e "    ${YELLOW}Option 1 — Start script:${NC}"
echo "      ./scripts/start.sh"
echo ""
echo -e "    ${YELLOW}Option 2 — Manual terminals:${NC}"
echo "      Terminal 1:  cd backend  && ./server"
echo "      Terminal 2:  cd frontend && npm start"
echo ""
echo -e "  ${CYAN}Then open:${NC} http://localhost:3000"
echo ""
echo -e "  ${CYAN}API docs:${NC}  http://localhost:8080/api/v1"
echo ""
