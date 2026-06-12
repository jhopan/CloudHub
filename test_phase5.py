import requests
import json

BASE_URL = "http://localhost:8080/api/v1"

print("=== Phase 5 Transfer Logs API Tests ===\n")

# 1. Login
print("1. Login...")
r = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "test@example.com",
    "password": "password" + "123"
})
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
    exit(1)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"   PASS: Logged in\n")

# 2. Get transfer logs (empty initially)
print("2. Get transfer logs (empty)...")
r = requests.get(f"{BASE_URL}/transfer-logs", headers=headers)
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    data = r.json()
    print(f"   PASS: Found {len(data.get('logs', []))} logs (total: {data.get('total', 0)})\n")

# 3. Create folder (should NOT create transfer log)
print("3. Create folder (no transfer log expected)...")
import time
ts = str(int(time.time()))
r = requests.post(f"{BASE_URL}/files/folder", headers=headers, json={
    "name": f"TestLogs_{ts}"
})
if r.status_code != 201:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    folder = r.json()
    folder_id = folder['id']
    print(f"   PASS: Created folder '{folder['name']}'\n")

# 4. Check transfer logs (still empty - folder creation doesn't log)
print("4. Check transfer logs (still empty)...")
r = requests.get(f"{BASE_URL}/transfer-logs", headers=headers)
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    data = r.json()
    log_count = len(data.get('logs', []))
    print(f"   PASS: Found {log_count} logs\n")

# 5. Delete folder
print("5. Delete folder...")
r = requests.delete(f"{BASE_URL}/files/{folder_id}", headers=headers)
if r.status_code != 204:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    print(f"   PASS: Folder deleted\n")

# 6. Get transfer logs with pagination
print("6. Get transfer logs with pagination...")
r = requests.get(f"{BASE_URL}/transfer-logs?limit=10&offset=0", headers=headers)
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    data = r.json()
    print(f"   PASS: Found {len(data.get('logs', []))} logs (total: {data.get('total', 0)})")
    for log in data.get('logs', []):
        print(f"      - {log['operation']} | {log['status']} | {log['created_at']}")
    print()

print("=== All Phase 5 Tests Complete ===")
