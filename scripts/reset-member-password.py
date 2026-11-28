#!/usr/bin/env python3
"""Reset an existing member's Firebase Auth password on Spark using authorized Cloud Shell.
Run in an interactive terminal: python3 scripts/reset-member-password.py
No service account key, password file, email reset, or billing change is needed.
"""
import getpass
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "durood-e-ibrahimi-global-c74e0"
OWNER_UID = "vt06NK7DcmgPpUKD4R7EgwzAxIH3"
BASE = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:"
FIRESTORE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/members/"

def request(url, token, data=None):
    req = urllib.request.Request(
        url, data=None if data is None else json.dumps(data).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="GET" if data is None else "POST")
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def main():
    if not sys.stdin.isatty():
        raise SystemExit("Interactive terminal required; never pass a password as a command argument.")
    uid = input("Existing member Firebase UID: ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", uid) or uid == OWNER_UID:
        raise SystemExit("Invalid or protected account UID.")
    token = subprocess.check_output(["gcloud", "auth", "print-access-token", "--quiet"], text=True).strip()
    if not token:
        raise SystemExit("No authorized Google Cloud account.")
    profile = request(FIRESTORE + uid, token).get("fields", {})
    if profile.get("role", {}).get("stringValue") != "member":
        raise SystemExit("Not an existing ordinary member; no change made.")
    if any(profile.get(field, {}).get("booleanValue") is True for field in ("disabled", "deleted")):
        raise SystemExit("Inactive member; no change made.")
    users = request(BASE + "lookup", token, {"localId": [uid]}).get("users", [])
    if len(users) != 1 or users[0].get("localId") != uid or users[0].get("disabled"):
        raise SystemExit("Active Auth account could not be verified.")
    claims = json.loads(users[0].get("customAttributes") or "{}")
    if claims.get("owner") is True or claims.get("admin") is True:
        raise SystemExit("Protected administrator account.")
    name = profile.get("name", {}).get("stringValue", "Member")
    username = profile.get("username", {}).get("stringValue", "")
    print(f"Project: {PROJECT}\nMember: {name}\nUsername: {username}\nUID: {uid}")
    if input("Confirm exact member UID again: ").strip() != uid:
        raise SystemExit("Cancelled; no change made.")
    password = getpass.getpass("New password (8-128 characters): ")
    confirm = getpass.getpass("Confirm new password: ")
    if not 8 <= len(password) <= 128 or password != confirm:
        raise SystemExit("Passwords do not match or are invalid.")
    result = request(BASE + "update", token, {
        "localId": uid, "password": password, "returnSecureToken": False
    })
    if result.get("localId") != uid:
        raise SystemExit("Unexpected response; verify account status before retrying.")
    print("Password updated for the same UID. No member records were changed.")

if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        sys.exit(f"Google API returned HTTP {exc.code}. Check project IAM and account status; do not retry blindly.")
    except (urllib.error.URLError, TimeoutError, subprocess.CalledProcessError):
        sys.exit("Cloud authorization or connection failed; verify account status before retrying.")
    except KeyboardInterrupt:
        sys.exit("Cancelled; verify status if an update was already submitted.")
