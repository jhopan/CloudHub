#!/bin/bash
# Login and save token
TOKEN=*** -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@demo.com","password":"Demo1234"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token length: ${#TOKEN}"

# OAuth Initiate
echo ""
echo "=== OAuth Initiate ==="
RESULT=*** -s "http://localhost:8080/api/v1/oauth/google/initiate?provider=gdrive&label=MyDrive" \
  -H "Authorization: Bearer *** \
  --max-time 15)

echo "$RESULT"

# Parse session_id
SESSION_ID=$(echo "$RESULT" | python -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
AUTH_URL=$(echo "$RESULT" | python -c "import sys,json; print(json.load(sys.stdin).get('auth_url',''))" 2>/dev/null)

echo ""
echo "Auth URL: $AUTH_URL"
echo "Session ID: $SESSION_ID"

# Poll status
if [ -n "$SESSION_ID" ]; then
  echo ""
  echo "=== Polling Status ==="
  for i in 1 2 3; do
    sleep 2
    STATUS=*** -s "http://localhost:8080/api/v1/oauth/status?session_id=$SESSION_ID" \
      -H "Authorization: Bearer *** \
      --max-time 5)
    echo "Poll $i: $STATUS"
  done
fi
