import urllib.request
import json

BASE = "http://213.35.108.142:8989/api/v1"

# Login
login_data = json.dumps({"email": "admin@vps.io", "password": "Admin@123456"}).encode()
req = urllib.request.Request(BASE + "/auth/login", data=login_data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=10)
body = json.loads(resp.read())
token = body["access_token"]
print("Login OK, token:", token[:30] + "...")

# Initiate OAuth
header = {"Authorization": "Bearer " + token}
req2 = urllib.request.Request(BASE + "/oauth/google/initiate?provider=gdrive", headers=header)
resp2 = urllib.request.urlopen(req2, timeout=30)
oauth = json.loads(resp2.read())

print("\n=== OAUTH RESPONSE ===")
print(json.dumps(oauth, indent=2))

auth_url = oauth.get("auth_url", "")
proxy = oauth.get("callback_proxy", "")
sid = oauth.get("session_id", "")

print("\n=== CHECKS ===")
print("Auth URL is Google OAuth:", auth_url.startswith("https://accounts.google.com"))
print("Callback proxy:", proxy)
print("Session ID:", sid)

# Check if callback proxy is accessible
print("\n=== CALLBACK PROXY TEST ===")
try:
    req3 = urllib.request.Request(proxy)
    resp3 = urllib.request.urlopen(req3, timeout=5)
    html = resp3.read().decode()
    print("Proxy status:", resp3.status)
    print("Has paste form:", "textarea" in html or "callback_url" in html)
    print("Page title:", html[html.find("<title>"):html.find("</title>")+8] if "<title>" in html else "N/A")
except Exception as e:
    print("Proxy error:", e)
