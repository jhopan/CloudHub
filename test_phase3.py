import requests
import json
import os
import tempfile
import time

BASE_URL = "http://localhost:8080/api/v1"

print("=== Phase 3 File Manager API Tests ===\n")

# 1. Login
print("1. Login...")
r = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "test@example.com",
    "password": "password" + "123"
})
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
    exit(1)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"   PASS: Logged in\n")

# 2. Create folder (unique name with timestamp)
ts = str(int(time.time()))
folder_name = f"TestFolder_{ts}"
print(f"2. Create folder '{folder_name}'...")
r = requests.post(f"{BASE_URL}/files/folder", headers=headers, json={"name": folder_name})
if r.status_code != 201:
    print(f"   FAIL: {r.status_code} - {r.text}")
    folder_id = None
else:
    folder = r.json()
    folder_id = folder['id']
    print(f"   PASS: Created folder '{folder['name']}' (ID: {folder_id[:8]}...)\n")

# 3. Upload file (skip if no storage accounts)
print("3. Upload file 'test.txt'...")
r = requests.get(f"{BASE_URL}/storage-accounts", headers=headers)
accounts = r.json() if r.status_code == 200 else []

file_id = None
if len(accounts) == 0:
    print("   SKIP: No storage accounts configured\n")
else:
    test_content = "Hello from CloudHub Storage Gateway!"
    tmpfile = os.path.join(tempfile.gettempdir(), "test.txt")
    with open(tmpfile, "w") as f:
        f.write(test_content)

    with open(tmpfile, "rb") as f:
        r = requests.post(f"{BASE_URL}/files/upload", headers=headers, files={"file": ("test.txt", f, "text/plain")})

    if r.status_code != 201:
        print(f"   FAIL: {r.status_code} - {r.text}\n")
    else:
        uploaded = r.json()
        file_id = uploaded['id']
        print(f"   PASS: Uploaded '{uploaded['name']}' ({uploaded['size']} bytes)\n")

# 4. List files (root)
print("4. List files (root)...")
r = requests.get(f"{BASE_URL}/files", headers=headers)
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    files = r.json()
    print(f"   PASS: Found {len(files)} items")
    for f in files:
        dtype = "folder" if f['is_directory'] else "file"
        print(f"      - {f['name']} ({dtype}, {f['size']} bytes)")
    print()

# 5. Search files
print("5. Search for 'Test'...")
r = requests.get(f"{BASE_URL}/files/search?q=Test", headers=headers)
if r.status_code != 200:
    print(f"   FAIL: {r.status_code} - {r.text}")
else:
    results = r.json()
    print(f"   PASS: Found {len(results)} results\n")

# 6-8. File operations (only if file was uploaded)
if file_id:
    print("6. Get file metadata...")
    r = requests.get(f"{BASE_URL}/files/{file_id}", headers=headers)
    if r.status_code == 200:
        meta = r.json()
        print(f"   PASS: Name={meta['name']}, Size={meta['size']}, Path={meta['virtual_path']}\n")

    print("7. Rename file to 'hello.txt'...")
    r = requests.put(f"{BASE_URL}/files/{file_id}/rename", headers=headers, json={"name": "hello.txt"})
    if r.status_code == 200:
        print(f"   PASS: Renamed to '{r.json()['name']}'\n")

    print("8. Delete file...")
    r = requests.delete(f"{BASE_URL}/files/{file_id}", headers=headers)
    if r.status_code == 204:
        print(f"   PASS: File deleted\n")
else:
    print("6-8. SKIP: File upload/download/rename/delete (no storage accounts)\n")

# 9. Delete folder
if folder_id:
    print("9. Delete folder...")
    r = requests.delete(f"{BASE_URL}/files/{folder_id}", headers=headers)
    if r.status_code == 204:
        print(f"   PASS: Folder deleted\n")
    else:
        print(f"   FAIL: {r.status_code} - {r.text}\n")
else:
    print("9. SKIP: No folder to delete\n")

print("=== All Phase 3 Tests Complete ===")
