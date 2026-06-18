#!/bin/bash
# Fix PostgreSQL password and restart manual backend

# Reset password
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'cloudhub2024';" 2>&1

# Kill old backend
fuser -k 8989/tcp 2>/dev/null
sleep 1

# Rewrite .env
cat > ~/cloudhub/backend/.env << 'EOF'
PORT=8989
DATABASE_URL=postgresql://postgres:***@localhost:5432/cloudhub_manual
REDIS_URL=redis://localhost:6379
JWT_SECRET=cloudh...

# Start backend
cd ~/cloudhub/backend
chmod +x cloudhub-server
nohup ./cloudhub-server > /tmp/manual-backend.log 2>&1 &
echo "Backend PID: $!"

# Wait and check
sleep 5
HEALTH=$(curl -s http://localhost:8989/health 2>/dev/null)
if [ "$HEALTH" = "OK" ]; then
    echo "✅ Backend OK on port 8989"
else
    echo "❌ Backend failed"
    tail -5 /tmp/manual-backend.log
fi
