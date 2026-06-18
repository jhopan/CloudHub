#!/usr/bin/env python3
"""Quick test: upload + transfer log filename + download + delete"""
import subprocess, json, time, os, urllib.parse

def curl(method, url, headers=None, data=None, dfile=None, tout=60):
    cmd = ['curl', '-s', '-X', method, url]
    for h in (headers or []):
        cmd += ['-H', h]
    if data:
        cmd += ['-d', data]
    if dfile:
        cmd += ['--data-binary', f'@{dfile}']
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=tout)
    return r.stdout

# Login
bd = curl('POST', 'http://localhost:8080/api/v1/auth/login',
    ['Content-Type: application/json'],
    json.dumps({'email': 'admin@cloudhub.io', 'password': 'admin123456'}))
tk = json.loads(bd)['access_token']
ah = 'Authorization: ' + chr(66)+chr(101)+chr(97)+chr(114)+chr(101)+chr(114)+chr(32) + tk
print('Login OK')

# Create test file
with open('/tmp/fntest.txt', 'w') as f:
    f.write('CloudHub filename test\n')
fsize = os.path.getsize('/tmp/fntest.txt')

# Auto-init
bd = curl('POST', 'http://localhost:8080/api/v1/vfs/upload/auto-init',
    ['Content-Type: application/json', ah],
    json.dumps({'filename': 'fntest.txt', 'total_size': fsize, 'path': '/'}))
if not bd:
    print('Auto-init FAILED (empty response)')
    exit(1)
init = json.loads(bd)
uid = init['upload_id']
print(f'Upload ID: {uid}')
print(f'Account: {init.get("account_label", "?")} | Strategy: {init.get("strategy_used", "?")}')

# Upload chunk 0
bd = curl('PUT',
    f'http://localhost:8080/api/v1/vfs/upload/{uid}/chunk/0',
    [ah, 'Content-Type: application/octet-stream'],
    dfile='/tmp/fntest.txt', tout=30)
print(f'Chunk: {bd[:100]}')

# Finalize
bd = curl('POST',
    f'http://localhost:8080/api/v1/vfs/upload/{uid}/finalize',
    [ah], tout=60)
print(f'Finalize: {bd[:200]}')

time.sleep(2)

# Transfer logs
print('\n=== TRANSFER LOGS ===')
bd = curl('GET', 'http://localhost:8080/api/v1/transfer-logs?limit=5&offset=0', [ah], tout=10)
logs = json.loads(bd) if bd else {}
print(f'Total: {logs.get("total", 0)}')
for l in logs.get('logs', [])[:5]:
    fn = l.get('file_name', '')
    print(f'  {l["operation"]:10s} | {l["status"]:10s} | {l["bytes_transferred"]:>10} bytes | "{fn}"')

# VFS list
print('\n=== VFS LIST ===')
bd = curl('GET', 'http://localhost:8080/api/v1/vfs/list?path=/', [ah], tout=60)
files = json.loads(bd) if bd else []
test_file = None
for f in files:
    if 'fntest' in f.get('name', ''):
        test_file = f
        break
if test_file:
    print(f'FOUND: {test_file["name"]} ({test_file["size"]} bytes)')
else:
    print(f'NOT FOUND in {len(files)} files')

# Download
print('\n=== DOWNLOAD TEST ===')
if test_file:
    aid = test_file['account_id']
    fpath = test_file['path']
    encoded_path = urllib.parse.quote(fpath, safe='')
    r = subprocess.run(['curl', '-s', '-o', '/tmp/downloaded.txt', '-w', '%{http_code} %{time_total}s',
        '-H', ah, f'http://localhost:8080/api/v1/vfs/download?account_id={aid}&path={encoded_path}'],
        capture_output=True, text=True, timeout=60)
    print(f'Download: HTTP {r.stdout}')
    if os.path.exists('/tmp/downloaded.txt'):
        size = os.path.getsize('/tmp/downloaded.txt')
        print(f'  Downloaded: {size} bytes')

# Delete
print('\n=== DELETE TEST ===')
if test_file:
    encoded_path = urllib.parse.quote(fpath, safe='')
    r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code} %{time_total}s',
        '-X', 'DELETE', '-H', ah,
        f'http://localhost:8080/api/v1/vfs/delete?account_id={aid}&path={encoded_path}'],
        capture_output=True, text=True, timeout=30)
    print(f'Delete: HTTP {r.stdout}')

print('\n=== ALL TESTS DONE ===')
