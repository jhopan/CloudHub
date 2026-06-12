import requests
import time
import json

BASE = "http://localhost:8080/api/v1"

# Step 1: Login
print("=== Login ===")
try:
    r = requests.post(BASE + "/auth/login", json={"email": "demo@demo.com", "password": "***"}, timeout=10)
    print("Status:", r.status_code)
    print("Response:", r.text[:300])
    
    if r.status_code != 200:
        print("Login failed!")
        exit(1)
    
    data = r.json()
    token = data["access_token"]
    print("Token length:", len(token))
    
    headers = {"Authorization": "Bearer " + token}
    
    # Step 2: OAuth Initiate
    print("\n=== OAuth Initiate ===")
    r2 = requests.get(
        BASE + "/oauth/google/initiate?provider=gdrive&label=MyDrive",
        headers=headers,
        timeout=15
    )
    print("Status:", r2.status_code)
    print("Response:", r2.text[:500])
    
    if r2.status_code == 200:
        result = r2.json()
        session_id = result.get("session_id", "")
        auth_url = result.get("auth_url", "")
        print("\nAuth URL:", auth_url)
        print("Session ID:", session_id)
        
        # Step 3: Poll status
        print("\n=== Polling Status ===")
        for i in range(3):
            time.sleep(2)
            r3 = requests.get(
                BASE + "/oauth/status?session_id=" + session_id,
                headers=headers,
                timeout=5
            )
            print("Poll", i+1, ":", r3.text[:200])
    else:
        print("OAuth initiate failed:", r2.text)
        
except requests.exceptions.RequestException as e:
    print("Request error:", str(e))
except json.JSONDecodeError as e:
    print("JSON parse error:", str(e))
    print("Raw response:", r.text[:500] if 'r' in dir() else "no response")
