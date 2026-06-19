#!/usr/bin/env python3
import urllib.request, json

BASE = "http://213.35.108.142:8989/api/v1"
EMAIL = "admin@vps.io"
PW = "Admin@123456"

# Login
data = json.dumps({"email": EMAIL, "password": PW}).encode()
req = urllib.request.Request(BASE + "/auth/login", data=data, headers={"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["access_token"]

# Get storage accounts and check engine_type field
req2 = urllib.request.Request(BASE + "/storage-accounts", headers={"Authorization": "Bearer " + token})
accounts = json.loads(urllib.request.urlopen(req2).read())
print(f"Total accounts: {len(accounts)}")
for acc in accounts:
    print(f"  Label: {acc['label']}")
    print(f"    engine_type: {acc.get('engine_type', 'MISSING')}")
    print(f"    capacity: {acc.get('capacity_bytes', 0)}")
    print(f"    health: {acc.get('health_status', '?')}")
    print()
