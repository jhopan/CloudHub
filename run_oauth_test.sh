#!/bin/bash
cd /c/Users/ACER/Documents/project/CloudHub/storage-gateway

# Login and save token
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test3@test3.com","password":"***"}' > /tmp/login_resp.json

# Extract token
python -c "import json; d=json.load(open('/tmp/login_resp.json')); open('/tmp/token.txt','w').write(d['access_token'])"

# Read token
TOKEN=***
echo "Token length: ${#TOKEN}"

# OAuth Initiate
echo ""
echo "=== OAuth Initiate ==="
curl -s "http://localhost:8080/api/v1/oauth/google/initiate?provider=gdrive&label=MyDrive" \
  -H "Authorization: Bearer *** \
  --max-time 15
echo ""
