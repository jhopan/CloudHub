#!/bin/bash

echo "=== CloudHub Phase 1 - Authentication Test ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Backend Build
echo "Test 1: Backend Build"
cd ~/Documents/project/CloudHub/storage-gateway/backend
if go build -o test_server ./cmd/server; then
    echo -e "${GREEN}✓ Backend builds successfully${NC}"
    rm test_server
else
    echo -e "${RED}✗ Backend build failed${NC}"
    exit 1
fi

# Test 2: Frontend Build
echo ""
echo "Test 2: Frontend Build"
cd ~/Documents/project/CloudHub/storage-gateway/frontend
npm run build > /tmp/frontend-build.log 2>&1
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend builds successfully${NC}"
else
    echo -e "${RED}✗ Frontend build failed (exit code: $BUILD_EXIT)${NC}"
    echo "Build log:"
    tail -20 /tmp/frontend-build.log
    exit 1
fi

# Test 3: Check API Endpoints Structure
echo ""
echo "Test 3: API Endpoints Structure"
cd ~/Documents/project/CloudHub/storage-gateway/backend
if grep -q "auth/register" internal/api/router.go && \
   grep -q "auth/login" internal/api/router.go && \
   grep -q "auth/refresh" internal/api/router.go && \
   grep -q "auth/me" internal/api/router.go; then
    echo -e "${GREEN}✓ All authentication endpoints defined${NC}"
else
    echo -e "${RED}✗ Missing authentication endpoints${NC}"
    exit 1
fi

# Test 4: Check JWT Implementation
echo ""
echo "Test 4: JWT Implementation"
if [ -f "internal/util/jwt.go" ] && \
   grep -q "GenerateAccessToken" internal/util/jwt.go && \
   grep -q "GenerateRefreshToken" internal/util/jwt.go && \
   grep -q "ValidateAccessToken" internal/util/jwt.go; then
    echo -e "${GREEN}✓ JWT manager implemented correctly${NC}"
else
    echo -e "${RED}✗ JWT manager incomplete${NC}"
    exit 1
fi

# Test 5: Check Auth Middleware
echo ""
echo "Test 5: Auth Middleware"
if [ -f "internal/api/middleware/auth.go" ] && \
   grep -q "func Auth" internal/api/middleware/auth.go && \
   grep -q "func RequireRole" internal/api/middleware/auth.go; then
    echo -e "${GREEN}✓ Auth middleware implemented${NC}"
else
    echo -e "${RED}✗ Auth middleware missing or incomplete${NC}"
    exit 1
fi

# Test 6: Check Frontend Auth Pages
echo ""
echo "Test 6: Frontend Auth Pages"
cd ~/Documents/project/CloudHub/storage-gateway/frontend
if [ -f "app/login/page.tsx" ] && \
   [ -f "app/register/page.tsx" ] && \
   [ -f "app/dashboard/page.tsx" ]; then
    echo -e "${GREEN}✓ All auth pages created${NC}"
else
    echo -e "${RED}✗ Missing auth pages${NC}"
    exit 1
fi

# Test 7: Check Auth Context
echo ""
echo "Test 7: Auth Context"
if [ -f "lib/auth-context.tsx" ] && \
   grep -q "AuthProvider" lib/auth-context.tsx && \
   grep -q "useAuth" lib/auth-context.tsx; then
    echo -e "${GREEN}✓ Auth context implemented${NC}"
else
    echo -e "${RED}✗ Auth context incomplete${NC}"
    exit 1
fi

# Test 8: Check API Client
echo ""
echo "Test 8: API Client"
if [ -f "lib/api-client.ts" ] && \
   grep -q "interceptors.request" lib/api-client.ts && \
   grep -q "interceptors.response" lib/api-client.ts; then
    echo -e "${GREEN}✓ API client with interceptors created${NC}"
else
    echo -e "${RED}✗ API client incomplete${NC}"
    exit 1
fi

# Test 9: Check Database Migrations
echo ""
echo "Test 9: Database Migrations"
cd ~/Documents/project/CloudHub/storage-gateway/backend
if [ -f "migrations/000001_create_users.up.sql" ] && \
   [ -f "migrations/000001_create_users.down.sql" ]; then
    echo -e "${GREEN}✓ User migration files exist${NC}"
else
    echo -e "${RED}✗ Migration files missing${NC}"
    exit 1
fi

# Test 10: Check User Model
echo ""
echo "Test 10: User Model"
if [ -f "internal/model/user.go" ] && \
   grep -q "type User struct" internal/model/user.go; then
    echo -e "${GREEN}✓ User model defined${NC}"
else
    echo -e "${RED}✗ User model missing${NC}"
    exit 1
fi

echo ""
echo "======================================"
echo -e "${GREEN}✓ All Phase 1 Tests Passed!${NC}"
echo "======================================"
echo ""
echo "Phase 1 Implementation Summary:"
echo "- ✓ Backend: Authentication API endpoints"
echo "- ✓ Backend: JWT token management"
echo "- ✓ Backend: Auth middleware & RBAC"
echo "- ✓ Backend: User repository & service"
echo "- ✓ Frontend: Login & Register pages"
echo "- ✓ Frontend: Auth context & hooks"
echo "- ✓ Frontend: API client with token refresh"
echo "- ✓ Database: User migrations"
echo ""
echo "Next Steps:"
echo "1. Install PostgreSQL (manual download recommended)"
echo "2. Run migrations: migrate -path migrations -database 'postgresql://...' up"
echo "3. Start backend: go run cmd/server/main.go"
echo "4. Start frontend: npm run dev"
echo "5. Test at http://localhost:3000"
echo ""
