#!/bin/bash

echo "=== Login ==="
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@demo.com","password":"Demo1234"}' > /tmp/login_resp.json

python -c "import json; d=json.load(open('/tmp/login_resp.json')); open('/tmp/token.txt','w').write(d.get('access_token',''))"
echo "Token saved"

TOKEN=***

echo ""
echo "=== Initiating OAuth ==="
curl -s -X GET "http://localhost:8080/api/v1/oauth/google/initiate?provider=gdrive&label=TestDrive" \
  -H "Authorization: Bearer $TOKEN" > /tmp/init_resp.json

echo "Response:"
python -m json.tool /tmp/init_resp.json

echo ""
echo "=== Port 53682 ==="
netstat -ano | grep ":53682" | head -3

echo ""
echo "=== Wait 30s then check ==="
sleep 30
netstat -ano | grep ":53682" | head -3
echo "Done!"
