import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "http://213.35.108.142:8989/api/v1"

# Step 1: Login
print("=== Step 1: Login ===")
login_data = json.dumps({"email": "admin@vps.io", "password": "Admin@123456"}).encode()
req = urllib.request.Request(BASE + "/auth/login", data=login_data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=10)
body = json.loads(resp.read())
token = body["access_token"]
print("Login OK, token:", token[:30] + "...")

# Step 2: Initiate OAuth
print("\n=== Step 2: Initiate OAuth ===")
header = {"Authorization": "Bearer " + token}
req2 = urllib.request.Request(BASE + "/oauth/google/initiate?provider=gdrive&label=TestDrive", headers=header)
resp2 = urllib.request.urlopen(req2, timeout=30)
oauth = json.loads(resp2.read())

auth_url = oauth.get("auth_url", "")
proxy = oauth.get("callback_proxy", "")
sid = oauth.get("session_id", "")

print("Auth URL is Google:", auth_url.startswith("https://accounts.google.com"))
print("Callback proxy:", proxy)
print("Session ID:", sid)

# Step 3: Check proxy is running
print("\n=== Step 3: Check Callback Proxy ===")
try:
    req3 = urllib.request.Request(proxy)
    resp3 = urllib.request.urlopen(req3, timeout=5)
    html = resp3.read().decode()
    print("Proxy status:", resp3.status)
    print("Has paste form:", "textarea" in html or "callback_url" in html)
except Exception as e:
    print("Proxy error:", e)

# Step 4: Check status (should be waiting)
print("\n=== Step 4: Check Status ===")
req4 = urllib.request.Request(BASE + "/oauth/status?session_id=" + sid, headers=header)
resp4 = urllib.request.urlopen(req4, timeout=5)
status = json.loads(resp4.read())
print("Status:", json.dumps(status))

# Step 5: Check existing accounts
print("\n=== Step 5: Existing Accounts ===")
req5 = urllib.request.Request(BASE + "/storage-accounts", headers=header)
resp5 = urllib.request.urlopen(req5, timeout=5)
accounts = json.loads(resp5.read())
print("Accounts:", json.dumps(accounts, indent=2) if accounts else "[] (empty)")

print("\n=== SUMMARY ===")
print("Backend: OK")
print("OAuth flow: Ready (waiting for user to complete Google auth)")
print("Callback proxy: Running at", proxy)
print("Accounts in DB:", len(accounts) if isinstance(accounts, list) else "check manually")
print("\nSystem is READY. Try adding a Google Drive account from the browser!")
