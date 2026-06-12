import requests
import time
import json
import sys

BASE = "http://localhost:8080/api/v1"
email = "oauthtest@test.com"
password = "SecureP4ss"

print("=== Register ===")
r = requests.post(BASE + "/auth/register",
    json={"email": email, "password": password, "display_name": "OAuth Test"},
    headers={"Content-Type": "application/json"})
print("Status:", r.status_code, "Body:", r.text[:200])

print("\n=== Login ===")
r = requests.post(BASE + "/auth/login",
    json={"email": email, "password": password},
    headers={"Content-Type": "application/json"})
print("Status:", r.status_code)

if r.status_code != 200:
    print("Login failed:", r.text)
    sys.exit(1)

data = r.json()
token = data["access_token"]
print("Token length:", len(token))
headers = {"Authorization": "Bearer " + token}

print("\n=== OAuth Initiate ===")
r2 = requests.get(
    BASE + "/oauth/google/initiate?provider=gdrive&label=MyDrive",
    headers=headers,
    timeout=15
)
print("Status:", r2.status_code)
print("Body:", r2.text[:500])

if r2.status_code == 200:
    result = r2.json()
    session_id = result.get("session_id", "")
    auth_url = result.get("auth_url", "")
    print("\nAuth URL:", auth_url)
    print("Session ID:", session_id)

    print("\n=== Polling Status ===")
    for i in range(5):
        time.sleep(2)
        r3 = requests.get(
            BASE + "/oauth/status?session_id=" + session_id,
            headers=headers,
            timeout=5
        )
        status = r3.json()
        done = status.get("done", False)
        success = status.get("success", False)
        remote = status.get("remote", "")
        print("Poll", i+1, "done=" + str(done), "success=" + str(success), "remote=" + remote)
        if done:
            if success:
                print("\nSUCCESS! Remote:", remote, "Label:", status.get("label", ""))
            else:
                print("\nFAILED:", status.get("error", ""))
            break
    else:
        print("\nStill waiting for Google sign-in...")
else:
    print("OAuth initiate failed")
