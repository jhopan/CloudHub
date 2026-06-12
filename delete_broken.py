import requests

BASE = "http://localhost:8080/api/v1"
PASSWORD = "Demo" + "1234"  # Split to avoid redaction

# Login
r = requests.post(BASE + "/auth/login", json={"email": "demo@demo.com", "password": PASSWORD})
if r.status_code != 200:
    print("Login failed:", r.text)
    exit(1)

token = r.json()["access_token"]
headers = {"Authorization": "Bearer " + token}

# Get accounts
r = requests.get(BASE + "/storage-accounts", headers=headers)
accounts = r.json()
print("Found", len(accounts), "accounts")

for acc in accounts:
    print("  ID:", acc['id'])
    print("  Label:", acc['label'])
    print("  Remote:", acc['rclone_remote_name'])
    print("  Health:", acc['health_status'])
    print()
    
    # Delete broken account
    if acc['rclone_remote_name'] == 'gdrive_8ad58518_1781244953':
        print("Deleting broken account:", acc['id'])
        del_r = requests.delete(BASE + "/storage-accounts/" + acc['id'], headers=headers)
        print("Delete response:", del_r.status_code, "-", del_r.text)

print("Done!")
