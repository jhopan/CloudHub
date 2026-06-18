#!/usr/bin/env python3
"""Blackbox test: Upload file via API and verify"""
import subprocess, json, os, sys

# Create test file
test_content = 'CloudHub Storage Gateway Test File\n' * 20
with open('/tmp/test_cloudhub.txt', 'w') as f:
    f.write(test_content)
file_size = os.path.getsize('/tmp/test_cloudhub.txt')
print(f'Test file: {file_size} bytes')

def curl(method, url, headers=None, data=None, data_file=None, timeout=30):
    cmd = ['curl', '-s', '-w', '\n%{http_code}', '-X', method, url]
    if headers:
        for h in headers:
            cmd.extend(['-H', h])
    if data:
        cmd.extend(['-d', data])
    if data_file:
        cmd.extend(['--data-binary', f'@{data_file}'])
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    lines = r.stdout.strip().split('\n')
    status = lines[-1] if lines else '???'
    body = '\n'.join(lines[:-1]) if len(lines) > 1 else ''
    return int(status), body

def make_auth(token):
    return 'Authorization: Bearer ***  Login
print('\n=== 1. LOGIN ===')
status, body = curl('POST', 'http://localhost:8080/api/v1/auth/login',
    headers=['Content-Type: application/json'],
    data=json.dumps({'email': 'admin@cloudhub.io', 'password': 'admin123456'}))
print(f'  HTTP {status}')
if status != 200:
    print(f'  FAILED: {body}')
    sys.exit(1)
login_data = json.loads(body)
token = login_data['access_token']
auth_h = make_auth(token)
print(f'  User: {login_data["user"]["email"]}')

# 2. Auto-init upload
print('\n=== 2. AUTO-INIT UPLOAD ===')
status, body = curl('POST', 'http://localhost:8080/api/v1/vfs/upload/auto-init',
    headers=['Content-Type: application/json', auth_h],
    data=json.dumps({'filename': 'test_cloudhub.txt', 'total_size': file_size, 'path': '/'}))
print(f'  HTTP {status}')
if status != 200:
    print(f'  FAILED: {body}')
    sys.exit(1)
init_data = json.loads(body)
upload_id = init_data['upload_id']
print(f'  Upload ID: {upload_id}')
print(f'  Account: {init_data["account_label"]}')
print(f'  Strategy: {init_data["strategy_used"]}')
print(f'  Chunks: {init_data["total_chunks"]}')

# 3. Upload chunk 0
print('\n=== 3. UPLOAD CHUNK 0 ===')
status, body = curl('PUT',
    f'http://localhost:8080/api/v1/vfs/upload/{upload_id}/chunk/0',
    headers=[auth_h, 'Content-Type: application/octet-stream'],
    data_file='/tmp/test_cloudhub.txt',
    timeout=60)
print(f'  HTTP {status}')
print(f'  Response: {body[:200]}')
if status != 200:
    print(f'  CHUNK UPLOAD FAILED!')
    sys.exit(1)

# 4. Finalize
print('\n=== 4. FINALIZE ===')
status, body = curl('POST',
    f'http://localhost:8080/api/v1/vfs/upload/{upload_id}/finalize',
    headers=[auth_h],
    timeout=60)
print(f'  HTTP {status}')
print(f'  Response: {body[:300]}')
if status != 200:
    print(f'  FINALIZE FAILED!')
    sys.exit(1)

# 5. Verify file in VFS
print('\n=== 5. VERIFY FILE IN VFS ===')
status, body = curl('GET', 'http://localhost:8080/api/v1/vfs/list?path=/',
    headers=[auth_h], timeout=30)
print(f'  HTTP {status}')
test_file = None
if status == 200:
    files = json.loads(body)
    for f in files:
        if 'test_cloudhub' in f.get('name', ''):
            print(f'  FOUND: {f["name"]} ({f["size"]} bytes)')
            test_file = f
            break
    if not test_file:
        print(f'  NOT FOUND in {len(files)} items')

# 6. Transfer logs
print('\n=== 6. TRANSFER LOGS ===')
status, body = curl('GET', 'http://localhost:8080/api/v1/transfer-logs?limit=5&offset=0',
    headers=[auth_h], timeout=10)
if status == 200:
    logs = json.loads(body)
    print(f'  Total logs: {logs.get("total", 0)}')
    for log in logs.get('logs', [])[:5]:
        print(f'    {log["operation"]:10s} | {log["status"]:10s} | {log["bytes_transferred"]:>10} bytes')

# 7. Download
print('\n=== 7. DOWNLOAD TEST ===')
if test_file:
    dl_path = test_file.get('path', '')
    acct_id = test_file.get('account_id', '')
    status3, body3 = curl('GET',
        f'http://localhost:8080/api/v1/vfs/download?account_id={acct_id}&path={dl_path}',
        headers=[auth_h], timeout=30)
    print(f'  HTTP {status3} | Downloaded: {len(body3)} bytes')
    if 'CloudHub' in body3:
        print(f'  Content VERIFIED!')

# 8. Delete
print('\n=== 8. DELETE TEST ===')
if test_file:
    status4, body4 = curl('DELETE',
        f'http://localhost:8080/api/v1/vfs/delete?account_id={acct_id}&path={dl_path}',
        headers=[auth_h], timeout=30)
    print(f'  HTTP {status4} | {body4[:200]}')

print('\n=== BLACKBOX UPLOAD TEST COMPLETE ===')
