"""Read only membership dates/status and Durood goals, then publish aggregate targets.
Uses the existing authorized deployment identity; no permission grants or personal exports.
"""
import json, subprocess, sys
import google.auth
from google.auth.transport.requests import AuthorizedSession
P="durood-e-ibrahimi-global-c74e0"
base=f"https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents"
cred,_=google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
session=AuthorizedSession(cred)
def call(method,path="",**kw):
    r=session.request(method,base+path,timeout=60,**kw)
    if not r.ok:
        sys.exit(f"Dashboard sync {method} failed: HTTP {r.status_code}; existing data unchanged unless publication succeeded.")
    return r.json()
def decode(v):
    if "integerValue" in v: return int(v["integerValue"])
    for k in ("stringValue","booleanValue","timestampValue"):
        if k in v: return v[k]
    return None
def fields(d):
    return {k:decode(v) for k,v in d.get("fields",{}).items()}
def list_docs(path,keys):
    result=[]; token=None
    while True:
        params=[("pageSize","200")]+[("mask.fieldPaths",k) for k in keys]
        if token: params.append(("pageToken",token))
        page=call("GET",path,params=params)
        result.extend(page.get("documents",[]))
        token=page.get("nextPageToken")
        if not token:return result
# Fetch only whitelisted aggregate input fields; don't read names, emails, or personal ledgers.
settings_doc=call("GET","/wazaifSettings/group")
settings=fields(settings_doc)
members=list_docs("/members",["role","gender","createdAt","registrationDate","joined","pledgeAcceptedAt","disabled","deleted","updatedAt"])
rows=[]
for doc in members:
    uid=doc["name"].rsplit("/",1)[-1]
    m=fields(doc)
    m["daily"]=[fields(x) for x in list_docs(f"/memberPrivate/{uid}/duroodGoals",["date","goal"])]
    rows.append(m)
payload=json.loads(subprocess.check_output(["node","scripts/sync-dashboard-targets.mjs"],input=json.dumps({"rows":rows,"settings":settings}),text=True))
# Atomically update only the dedicated aggregate document; leave all source records untouched.
def enc(v):
    if v is None:return {"nullValue":None}
    if isinstance(v,int):return {"integerValue":str(v)}
    if isinstance(v,str):return {"stringValue":v}
    return {"mapValue":{"fields":{k:enc(x) for k,x in v.items()}}}
name=f"projects/{P}/databases/(default)/documents/dashboardAggregates/duroodTargets"
call("POST",":commit",json={"writes":[{"update":{"name":name,"fields":{k:enc(v) for k,v in payload.items()}},"updateTransforms":[{"fieldPath":"updatedAt","setToServerValue":"REQUEST_TIME"}]}]})
readback=call("GET","/dashboardAggregates/duroodTargets")
if readback.get("fields",{}).get("day",{}).get("stringValue")!=payload["day"]:
    sys.exit("Shared target verification failed")
print("Shared dashboard aggregate published; no member records changed.")
