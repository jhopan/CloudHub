#!/bin/bash
set -e

cd ~/cloudhub

# Backend .env
cat > backend/.env << 'EOF'
PORT=8989
DATABASE_URL=postgresql://postgres:***@localhost:5432/cloudhub_manual
REDIS_URL=redis://localhost:6379
JWT_SECRET=cloudh...
EOF

# Frontend .env
cat > frontend/.env.production << 'EOF'
NEXT_PUBLIC_API_URL=http://213.35.108.142:8989
EOF

# Start backend
cd ~/cloudhub/backend
chmod +x cloudhub-server
nohup ./cloudhub-server > /tmp/manual-backend.log 2>&1 &
echo "Backend PID: $!"

# Wait for backend
sleep 3
curl -s http://localhost:8989/health && echo " Backend OK" || echo " Backend FAILED"

# Start frontend
cd ~/cloudhub/frontend
PORT=3434 nohup npm start > /tmp/manual-frontend.log 2>&1 &
echo "Frontend PID: $!"

# Wait for frontend
sleep 8
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3434)
echo "Frontend: HTTP $HTTP"

echo ""
echo "=== Manual Deployment Status ==="
echo "Backend:  http://213.35.108.142:8989"
echo "Frontend: http://213.35.108.142:3434"
