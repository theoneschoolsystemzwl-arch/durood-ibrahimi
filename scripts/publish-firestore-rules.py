"""Publish the existing repository rules to the default Firestore database.
Uses the configured GitHub identity and the official Rules API; never grants IAM
roles, modifies data, or enables billing. An API denial fails the job.
"""
from pathlib import Path
import sys
import google.auth
from google.auth.transport.requests import AuthorizedSession

PROJECT = "durood-e-ibrahimi-global-c74e0"
ROOT = "https://firebaserules.googleapis.com/v1/"
RELEASE = f"projects/{PROJECT}/releases/cloud.firestore"
credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
session = AuthorizedSession(credentials)

def request(method, path, **kwargs):
    response = session.request(method, ROOT + path, timeout=60, **kwargs)
    if not response.ok:
        sys.exit(f"{method} {path} failed: HTTP {response.status_code} {response.text[:6000]}")
    return response.json()

content = Path("firestore.rules").read_text(encoding="utf-8")
# Compilation and creation are performed by the official Rules API before release.
created = request("POST", f"projects/{PROJECT}/rulesets",
    json={"source": {"files": [{"name": "firestore.rules", "content": content}]}})
ruleset = created.get("name")
if not isinstance(ruleset, str) or not ruleset.startswith(f"projects/{PROJECT}/rulesets/"):
    sys.exit("Rules API did not return a valid ruleset name; no release attempted.")
released = request("PATCH", RELEASE, json={
    "release": {"name": RELEASE, "rulesetName": ruleset},
    "updateMask": "rulesetName",
})
if released.get("rulesetName") != ruleset:
    sys.exit("Rules API did not confirm the expected release.")
verified = request("GET", RELEASE)
if verified.get("rulesetName") != ruleset:
    sys.exit("Read-back verification did not match the new ruleset.")
print(f"Confirmed Firestore release: {ruleset}")
