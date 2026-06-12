import requests
import time

BASE = "http://localhost:8080/api/v1"

# Login
r = requests.post(BASE + "/auth/login", json={"email": "demo@demo.com", "password": "***"})
token = r.json().get("access_token", "")
headers = {"Authorization": "Bearer " + token}
print("Login OK")

# Start OAuth
print("\n=== Starting OAuth ===")
r2 = requests.get(BASE + "/oauth/google/initiate?provider=gdrive&label=MyDrive", headers=headers, timeout=15)
print("Status:", r2.status_code)
result = r2.json()
session_id = result.get("session_id", "")
auth_url = result.get("auth_url", "")
print("Auth URL:", auth_url)
print("Session ID:", session_id)

# Poll status a few times
print("\n=== Polling Status ===")
for i in range(3):
    time.sleep(2)
    r3 = requests.get(BASE + "/oauth/status?session_id=" + session_id, headers=headers, timeout=5)
    print("Poll", i+1, ":", r3.text[:200])
