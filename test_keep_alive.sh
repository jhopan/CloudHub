#!/bin/bash
cd /c/Users/ACER/Documents/project/CloudHub/storage-gateway

# Login
echo "=== Login ==="
LOGIN_RESP=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@demo.com","password":"Demo1234"}')
echo "$LOGIN_RESP" | python -c "import sys,json; d=json.load(sys.stdin); print('Token:', d.get('access_token','FAIL')[:20]+'...')"

# Extract token
TOKEN=$(echo "$LOGIN_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

if [ -z "$TOKEN" ]; then
  echo "Login failed!"
  exit 1
fi

echo ""
echo "=== Initiate OAuth ==="
INIT_RESP=$(curl -s -X GET "http://localhost:8080/api/v1/oauth/google/initiate?provider=gdrive&label=TestDrive" \
  -H "Authorization: Bearer $TOKEN")
echo "$INIT_RESP" | python -m json.tool

echo ""
echo "=== Check port 53682 ==="
netstat -ano | grep ":53682" | head -3

echo ""
echo "=== Wait 10s then check again ==="
sleep 10
netstat -ano | grep ":53682" | head -3
echo "If port 53682 still LISTENING, rclone is alive!"

echo ""
echo "=== Wait 20s more then check ==="
sleep 20
netstat -ano | grep ":53682" | head -3
echo "If port 53682 still LISTENING after 30s total, keep-alive works!"
