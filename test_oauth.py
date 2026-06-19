#!/usr/bin/env python3
import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "http://213.35.108.142:8989/api/v1"

# Login
login_data = json.dumps({"email": "admin@vps.io", "password": "Admin@123456"}).encode()
req = urllib.request.Request(BASE + "/auth/login", data=login_data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=10)
body = json.loads(resp.read())
token = body["access_token"]
print("Login OK")

# Initiate OAuth
header = {"Authorization": "Bearer " + token}
req2 = urllib.request.Request(BASE + "/oauth/google/initiate?provider=gdrive", headers=header)
resp2 = urllib.request.urlopen(req2, timeout=30)
oauth = json.loads(resp2.read())
print("\n=== OAUTH RESPONSE ===")
print(json.dumps(oauth, indent=2))

# Check auth URL
auth_url = oauth.get("auth_url", "")
print("\n=== AUTH URL ===")
print(auth_url)

if "127.0.0.1" in auth_url:
    print("\n WARNING: URL contains 127.0.0.1!")
else:
    print("\n OK: URL does not contain 127.0.0.1")

# Check callback proxy
proxy = oauth.get("callback_proxy", oauth.get("callback_proxy_url", ""))
print("\n=== CALLBACK PROXY ===")
print(proxy if proxy else "NOT SET")

# Check session ID
sid = oauth.get("session_id", "")
print("\n=== SESSION ID ===")
print(sid if sid else "NOT SET")
