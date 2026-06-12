import requests
import time

BASE = "http://localhost:8080/api/v1"

print("=== Login ===")
r = requests.post(BASE + "/auth/login", json={"email": "demo@demo.com", "password": "Demo1234"}, timeout=10)
data = r.json()
token = data.get("access_token", "")
print("Status: %d, Token: %s..." % (r.status_code, token[:20]))

if not token:
    print("Login failed!")
    exit(1)

print("\n=== Initiate OAuth ===")
start = time.time()
headers = {"Authorization": "Bearer " + token}
r = requests.get(BASE + "/oauth/google/initiate?provider=gdrive&label=TestDrive", headers=headers, timeout=30)
elapsed = time.time() - start
data = r.json()
print("Status: %d" % r.status_code)
print("Time: %.1fs" % elapsed)
print("Auth URL: %s" % data.get("auth_url", "N/A"))
print("Session ID: %s..." % data.get("session_id", "N/A")[:20])

auth_url = data.get("auth_url", "")
if "state=" in auth_url:
    print("\nURL captured from stderr with state parameter!")
elif elapsed < 10:
    print("\nURL captured quickly (%.1fs)!" % elapsed)
else:
    print("\nURL might be default (took %.1fs)" % elapsed)
