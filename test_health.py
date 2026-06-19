#!/usr/bin/env python3
import urllib.request, json

BASE = "http://213.35.108.142:8989/api/v1"
EMAIL = "admin@vps.io"
PW = "Admin@123456"

# Login
data = json.dumps({"email": EMAIL, "password": PW}).encode()
req = urllib.request.Request(BASE + "/auth/login", data=data, headers={"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["access_token"]
print("Token OK")

# Get accounts
req2 = urllib.request.Request(BASE + "/storage-accounts", headers={"Authorization": "Bearer " + token})
accounts = json.loads(urllib.request.urlopen(req2).read())
print(f"Accounts: {len(accounts)}")

if accounts:
    acc = accounts[-1]
    acc_id = acc["id"]
    print(f"Latest: {acc['label']} | capacity={acc.get('capacity_bytes',0)} | used={acc.get('used_bytes',0)} | health={acc.get('health_status','?')}")
    
    # Test connection
    print(f"\nTesting connection for {acc_id}...")
    req3 = urllib.request.Request(BASE + f"/storage-accounts/{acc_id}/test", data=b"", method="POST", headers={"Authorization": "Bearer " + token})
    result = json.loads(urllib.request.urlopen(req3).read())
    print(f"Test result: {json.dumps(result, indent=2)}")
    
    # Check account again
    req4 = urllib.request.Request(BASE + "/storage-accounts", headers={"Authorization": "Bearer " + token})
    accounts2 = json.loads(urllib.request.urlopen(req4).read())
    acc2 = [a for a in accounts2 if a["id"] == acc_id][0]
    print(f"\nAfter test: {acc2['label']} | capacity={acc2.get('capacity_bytes',0)} | used={acc2.get('used_bytes',0)} | health={acc2.get('health_status','?')}")
