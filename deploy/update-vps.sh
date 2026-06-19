#!/bin/bash
# Update .env and restart manual backend + frontend

cd ~/cloudhub

# Update backend .env with VPS config
cat >> backend/.env << 'EOF'
APP_BASE_URL=http://213.35.108.142:3434
OAUTH_REDIRECT_HOST=213.35.108.142
EOF

echo "env updated"

# Start backend
cd ~/cloudhub/backend
chmod +x cloudhub-server
nohup ./cloudhub-server > /tmp/manual-backend.log 2>&1 &
sleep 3

# Check
if curl -s http://localhost:8989/health | grep -q OK; then
    echo "Backend OK"
else
    echo "Backend FAILED"
    tail -5 /tmp/manual-backend.log
fi
