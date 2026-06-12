import requests
import json

BASE_URL = "http://localhost:8080/api/v1"

def test(name, status, expected, body=None):
    icon = "✅" if status == expected else "❌"
    print(f"  {icon} {name}: {status} (expected {expected})")
    if body:
        print(f"     Response: {json.dumps(body, indent=2)[:200]}")
    return status == expected

print("=== CloudHub Auth API Test Suite ===\n")
passed = 0
total = 0

# Test 1: Register new user
print("1. Register new user:")
total += 1
r = requests.post(f"{BASE_URL}/auth/register", json={
    "email": "autotest@example.com",
    "password": "testpass123",
    "display_name": "Auto Test User"
})
body = r.json()
if test("Register new user", r.status_code, 201, body):
    passed += 1
print()

# Test 2: Duplicate registration
print("2. Duplicate registration:")
total += 1
r = requests.post(f"{BASE_URL}/auth/register", json={
    "email": "autotest@example.com",
    "password": "testpass123",
    "display_name": "Auto Test User"
})
if test("Duplicate register", r.status_code, 409):
    passed += 1
print()

# Test 3: Login
print("3. Login:")
total += 1
r = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "autotest@example.com",
    "password": "***"
})
body = r.json()
if test("Login", r.status_code, 200):
    passed += 1
access_token = body.get("access_token", "")
refresh_token = body.get("refresh_token", "")
user = body.get("user", {})
print(f"   Access Token: {access_token[:50]}...")
print(f"   Refresh Token: {refresh_token[:50]}...")
print(f"   User: {user.get('email')} ({user.get('role')})")
print()

# Test 4: Get profile with token
print("4. Get profile (protected):")
total += 1
headers = {"Authorization": "Bearer " + access_token}
r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
body = r.json()
if test("Get profile", r.status_code, 200, body):
    passed += 1
print()

# Test 5: Get profile without token
print("5. Get profile without token:")
total += 1
r = requests.get(f"{BASE_URL}/auth/me")
if test("No token (401)", r.status_code, 401):
    passed += 1
print()

# Test 6: Refresh token
print("6. Refresh token:")
total += 1
r = requests.post(f"{BASE_URL}/auth/refresh", json={
    "refresh_token": refresh_token
})
body = r.json()
if test("Refresh token", r.status_code, 200):
    passed += 1
new_token = body.get("access_token", "")
print(f"   New Token: {new_token[:50]}...")
print()

# Test 7: Use new token
print("7. Use refreshed token:")
total += 1
r = requests.get(f"{BASE_URL}/auth/me", headers={
    "Authorization": f"Bearer ***
})
if test("Use new token", r.status_code, 200):
    passed += 1
print()

# Test 8: Wrong password
print("8. Login with wrong password:")
total += 1
r = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "autotest@example.com",
    "password": "wrongpassword"
})
if test("Wrong password (401)", r.status_code, 401):
    passed += 1
print()

# Test 9: Invalid token
print("9. Access with invalid token:")
total += 1
r = requests.get(f"{BASE_URL}/auth/me", headers={
    "Authorization": "Bearer invalid_token_here"
})
if test("Invalid token (401)", r.status_code, 401):
    passed += 1
print()

# Test 10: Register with short password
print("10. Register with short password:")
total += 1
r = requests.post(f"{BASE_URL}/auth/register", json={
    "email": "short@example.com",
    "password": "short",
    "display_name": "Short Pass"
})
if test("Short password (400)", r.status_code, 400):
    passed += 1
print()

print(f"=== Results: {passed}/{total} tests passed ===")
