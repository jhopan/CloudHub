import requests
import json

BASE_URL = "http://localhost:8080/api/v1"

# Login to get token
r = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "test@example.com",
    "password": "password123"
})
token = r.json()["access_token"]
headers = {"Authorization": "Bearer " + token}

print("=== 1. Get All Providers ===")
r = requests.get(f"{BASE_URL}/providers", headers=headers)
providers = r.json()
print(f"Status: {r.status_code}")
print(f"Total providers: {len(providers)}")
for p in providers:
    print(f"  - {p['name']} ({p['slug']}) | auth: {p['auth_type']} | accounts: {p['account_count']}")
print()

print("=== 2. Get Storage Pool ===")
r = requests.get(f"{BASE_URL}/storage-pool", headers=headers)
pool = r.json()
print(f"Status: {r.status_code}")
print(json.dumps(pool, indent=2))
print()

print("=== 3. Create Storage Account (Mega) ===")
r = requests.post(f"{BASE_URL}/storage-accounts", headers=headers, json={
    "provider_id": providers[3]["id"],  # Mega
    "name": "My Mega Account",
    "credentials": {
        "email": "myemail@mega.nz",
        "password": "***"
    }
})
print(f"Status: {r.status_code}")
account = r.json()
print(json.dumps(account, indent=2))
print()

print("=== 4. Create Storage Account (Cloudflare R2) ===")
r = requests.post(f"{BASE_URL}/storage-accounts", headers=headers, json={
    "provider_id": providers[1]["id"],  # Cloudflare R2
    "name": "My R2 Bucket",
    "credentials": {
        "account_id": "abc123",
        "access_key": "AKIAIOSFODNN7EXAMPLE",
        "secret_key": "***",
        "bucket": "my-bucket"
    }
})
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2))
print()

print("=== 5. Get Storage Accounts ===")
r = requests.get(f"{BASE_URL}/storage-accounts", headers=headers)
accounts = r.json()
print(f"Status: {r.status_code}")
print(f"Total accounts: {len(accounts)}")
for acc in accounts:
    print(f"  - {acc['name']} ({acc['provider_name']}) | status: {acc['status']}")
print()

print("=== 6. Get Storage Pool (Updated) ===")
r = requests.get(f"{BASE_URL}/storage-pool", headers=headers)
pool = r.json()
print(f"Status: {r.status_code}")
print(json.dumps(pool, indent=2))
print()

print("=== 7. Get Providers with Stats (Updated) ===")
r = requests.get(f"{BASE_URL}/providers", headers=headers)
providers = r.json()
print(f"Status: {r.status_code}")
for p in providers:
    if p['account_count'] > 0:
        print(f"  - {p['name']} | accounts: {p['account_count']} | capacity: {p['total_capacity']} | health: {p['health_status']}")
print()

print("=== 8. Delete Storage Account ===")
if accounts:
    account_id = accounts[0]["id"]
    r = requests.delete(f"{BASE_URL}/storage-accounts/{account_id}", headers=headers)
    print(f"Delete {accounts[0]['name']}: Status {r.status_code}")
print()

print("=== 9. Get Storage Accounts (After Delete) ===")
r = requests.get(f"{BASE_URL}/storage-accounts", headers=headers)
accounts = r.json()
print(f"Status: {r.status_code}")
print(f"Total accounts: {len(accounts)}")

print("\n=== All Provider API Tests Complete ===")
