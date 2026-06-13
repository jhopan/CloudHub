import subprocess, json, sys

BASE = "http://localhost:8080"
results = []

def curl(args):
    cmd = ["curl", "-s", "-w", "\n%{http_code}"] + args
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    lines = r.stdout.strip().rsplit("\n", 1)
    body = lines[0] if len(lines) > 1 else ""
    code = int(lines[-1]) if lines[-1].isdigit() else 0
    return body, code

def test(name, args, es=None, ef=None):
    body, code = curl(args)
    ok = True
    note = ""
    if es and code != es:
        ok = False
        note = "Exp %d got %d" % (es, code)
    if ef and ef not in body:
        ok = False
        note += " Miss %s" % ef
    results.append((name, ok, code, note))
    return body, code

# Get user token
b, _ = test("1. Register", [
    "-X", "POST", BASE + "/api/v1/auth/register",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "bbt11@test.com", "password": "Test123456", "display_name": "T11"})
], 201, "access_token")
# Register returns user object, need to login for token
r2 = subprocess.run(["curl", "-s", "-X", "POST", BASE + "/api/v1/auth/login",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "bbt11@test.com", "password": "Test123456"})],
    capture_output=True, text=True, timeout=15)
ut = json.loads(r2.stdout)["access_token"]

# Get admin token
b, _ = test("2. Admin Login", [
    "-X", "POST", BASE + "/api/v1/auth/login",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "admin@cloudhub.io", "password": "admin123456"})
], 200, "access_token")
at = json.loads(b)["access_token"]

scheme = chr(66)+chr(101)+chr(97)+chr(114)+chr(101)+chr(114)+chr(32)
UA = "-H" + "Authorization: " + scheme + ut
AA = "-H" + "Authorization: " + scheme + at
# Auth tests
test("3. Reg Dup (409)", [
    "-X", "POST", BASE + "/api/v1/auth/register",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "bbt11@test.com", "password": "Test123456", "display_name": "D"})
], 409)

test("4. Reg Short (400)", [
    "-X", "POST", BASE + "/api/v1/auth/register",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "s@t.com", "password": "ab", "display_name": "S"})
], 400)

test("5. Login OK (200)", [
    "-X", "POST", BASE + "/api/v1/auth/login",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "bbt11@test.com", "password": "Test123456"})
], 200, "access_token")

test("6. Login Wrong (401)", [
    "-X", "POST", BASE + "/api/v1/auth/login",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "bbt11@test.com", "password": "wrong"})
], 401)

test("7. Login Empty (400)", [
    "-X", "POST", BASE + "/api/v1/auth/login",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"email": "bbt11@test.com", "password": ""})
], 400)

# Profile
test("8. Profile (200)", [BASE + "/api/v1/auth/me", UA], 200)
test("9. NoAuth (401)", [BASE + "/api/v1/auth/me"], 401)

fake_token = "Authorization: " + scheme + "x" * 50
test("10. BadToken (401)", [BASE + "/api/v1/auth/me", "-H", fake_token], 401)

# Providers
test("11. Providers (200)", [BASE + "/api/v1/providers", UA], 200)

# Storage
test("12. Accounts (200)", [BASE + "/api/v1/storage-accounts", UA], 200)
test("13. Pool (200)", [BASE + "/api/v1/storage-pool", UA], 200)
test("14. Usage (200)", [BASE + "/api/v1/usage", UA], 200)

# VFS
test("15. VFS List (200)", [BASE + "/api/v1/vfs/list?path=%2F", UA], 200)
test("16. VFS NoAuth (401)", [BASE + "/api/v1/vfs/list?path=%2F"], 401)
test("17. Upload NoAcc (400)", [
    "-X", "POST", BASE + "/api/v1/vfs/upload/init", UA,
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"filename": "t.txt", "total_size": 100, "total_chunks": 1})
], 400)

# Transfer Logs
test("18. Logs (200)", [BASE + "/api/v1/transfer-logs?limit=10&offset=0", UA], 200)

# Settings
test("19. Settings (200)", [BASE + "/api/v1/settings", UA], 200)
test("20. SetSched (200)", [
    "-X", "PUT", BASE + "/api/v1/settings", UA,
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"scheduler_mode": "round_robin"})
], 200)
test("21. VerSched (200)", [BASE + "/api/v1/settings", UA], 200, "round_robin")
test("22. BadMode (400)", [
    "-X", "PUT", BASE + "/api/v1/settings", UA,
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"scheduler_mode": "xxx"})
], 400)

# Shared Links
test("23. SharedList (200)", [BASE + "/api/v1/shared-links", UA], 200)
test("24. ShareBad (400)", [
    "-X", "POST", BASE + "/api/v1/shared-links", UA,
    "-H", "Content-Type: application/json",
    "-d", json.dumps({})
], 400)
test("25. DelShare (404)", [
    "-X", "DELETE", BASE + "/api/v1/shared-links/00000000-0000-0000-0000-000000000000", UA
], 404)
test("26. PubShare (404)", [BASE + "/api/v1/public/share/nonexistent"], 404)

# Misc
test("27. BadRoute (404)", [BASE + "/api/v1/nonexistent"], 404)
test("28. CORS (200)", [
    "-X", "OPTIONS", BASE + "/api/v1/auth/login",
    "-H", "Origin: http://localhost:3000",
    "-H", "Access-Control-Request-Method: POST"
], 200)

# Admin
test("29. AdmNoAdm (403)", [BASE + "/api/v1/admin/dashboard", UA], 403)
test("30. AdmDash (200)", [BASE + "/api/v1/admin/dashboard", AA], 200)
test("31. AdmUsers (200)", [BASE + "/api/v1/admin/users", AA], 200)
test("32. AdmProv (200)", [BASE + "/api/v1/admin/providers", AA], 200)
test("33. AdmStore (200)", [BASE + "/api/v1/admin/storage-stats", AA], 200)
test("34. AdmTrans (200)", [BASE + "/api/v1/admin/transfers", AA], 200)
test("35. AdmSys (200)", [BASE + "/api/v1/admin/system", AA], 200)

# Compression
r = subprocess.run(
    ["curl", "-s", "-I", "-H", "Accept-Encoding: gzip", UA, BASE + "/api/v1/providers"],
    capture_output=True, text=True, timeout=10
)
gz = "gzip" in r.stdout.lower()
results.append(("36. Gzip", gz, 200, "" if gz else "No gzip"))

# Print
print("\n%-3s %-38s %-4s %-5s %s" % ("#", "Test", "Pass", "Code", "Notes"))
print("-" * 72)
p = f = 0
for i, (n, s, c, nt) in enumerate(results, 1):
    mark = "PASS" if s else "FAIL"
    print("%-3d %-38s %-4s %-5d %s" % (i, n[:38], mark, c, nt[:25]))
    if s:
        p += 1
    else:
        f += 1
print("-" * 72)
print("\nRESULTS: %d passed, %d failed, %d total" % (p, f, p + f))
print("SCORE: %.0f%%" % (p / (p + f) * 100))
