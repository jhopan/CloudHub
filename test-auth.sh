#!/bin/bash
echo "=== Full Auth Flow Test ==="
echo

# 1. Login
echo "1. Login dan dapatkan token:"
RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"***"}')

TOKEN=*** $RESPONSE | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
REFRESH=*** $RESPONSE | python -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])" 2>/dev/null)

echo "   Access Token: ${TOKEN:0:40}..."
echo "   Refresh Token: ${REFRESH:0:40}..."
echo

# 2. Get Profile (Protected)
echo "2. Akses protected endpoint (GET /auth/me):"
PROFILE=$(curl -s http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer ***
echo "   $PROFILE"
echo

# 3. Refresh Token
echo "3. Refresh token:"
REFRESHED=$(curl -s -X POST http://localhost:8080/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH\"}")
NEW_TOKEN=*** $REFRESHED | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
echo "   New Token: ${NEW_TOKEN:0:40}..."
echo

# 4. Test without token
echo "4. Akses tanpa token (harus 401):"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/auth/me)
echo "   Status: $STATUS (expected: 401)"
echo

# 5. Test wrong password
echo "5. Login dengan password salah (harus 401):"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpass"}')
echo "   Status: $STATUS (expected: 401)"
echo

# 6. Duplicate registration
echo "6. Register dengan email yang sama (harus 409):"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"***","display_name":"Test"}')
echo "   Status: $STATUS (expected: 409)"
echo

echo "=== All Tests Complete ==="
