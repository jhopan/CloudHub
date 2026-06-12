#!/bin/bash
# Delete broken storage account

# Login
LOGIN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@demo.com","password":"Demo1234"}')

echo "Login response: $LOGIN"

TOKEN_...[truncated]