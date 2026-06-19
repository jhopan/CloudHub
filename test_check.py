#!/usr/bin/env python3
import urllib.request, json

BASE = "http://213.35.108.142:8989/api/v1"

# Login
data = json.dumps({"email": "admin@vps.io", "password": "Admin@123456"}).encode()
req = urllib.request.Req...[truncated]