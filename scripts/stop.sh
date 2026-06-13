#!/usr/bin/env bash
# ==============================================================================
# CloudHub Storage Gateway - Stop Script (Linux/macOS)
# Kills all running Storage Gateway processes
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping CloudHub Storage Gateway services...${NC}"

# Kill backend (look for the server binary)
if pgrep -f "backend/server" &>/dev/null || pgrep -f "./server" &>/dev/null; then
    pkill -f "backend/server" 2>/dev/null || true
    pkill -f "./server" 2>/dev/null || true
    echo -e "${GREEN}[✓]${NC} Backend stopped"
else
    echo -e "${YELLOW}[!]${NC} Backend not running"
fi

# Kill frontend (look for next start or next dev)
if pgrep -f "next start" &>/dev/null || pgrep -f "next dev" &>/dev/null; then
    pkill -f "next start" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    echo -e "${GREEN}[✓]${NC} Frontend stopped"
else
    echo -e "${YELLOW}[!]${NC} Frontend not running"
fi

echo -e "${GREEN}Done.${NC}"
