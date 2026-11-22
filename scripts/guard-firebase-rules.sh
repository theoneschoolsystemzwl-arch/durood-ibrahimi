#!/usr/bin/env bash
# Never overwrite manual Firebase Console rule edits without reviewing them.
set -euo pipefail
project="durood-e-ibrahimi-global-c74e0"
token="$(gcloud auth print-access-token)"
# Keep HTTP error bodies so IAM / disabled-API failures are diagnosable.
# Never print OAuth tokens or service-account private credentials.
rules_api="https://firebaserules.googleapis.com/v1/projects/$project/releases/cloud.firestore"
response_file="$(mktemp)"
status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $token" "$rules_api")"
if [ "$status" != 200 ]; then
  echo "Firebase Rules release read returned HTTP $status."
  node -e '
    const fs=require("fs");
    try { const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      console.error("Firebase API error: "+String(j.error?.message||"No JSON error message").slice(0,900));
      console.error("Google error status: "+String(j.error?.status||"unknown"));
    } catch(e) { console.error("The API did not return a readable JSON error."); }
  ' "$response_file"
  # permissions are tested without requesting or changing any IAM policy.
  permission_url="https://cloudresourcemanager.googleapis.com/v1/projects/$project:testIamPermissions"
  curl --silent --show-error --max-time 15 --header "Authorization: Bearer $token" \
    --header "Content-Type: application/json" --data '{"permissions":["resourcemanager.projects.setIamPolicy","serviceusage.services.enable","firebaserules.releases.get","firebaserules.rulesets.get","firebaserules.rulesets.create","firebaserules.releases.update"]}' \
    "$permission_url" | node -e '
      let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
        try {let j=JSON.parse(s); console.log("Granted project-level permissions: "+(j.permissions||[]).join(", "));}
        catch{console.log("Project permission probe was unavailable.");}
      });
    ' || true
  exit 1
fi
release_json="$(cat "$response_file")"
rm -f "$response_file"
ruleset="$(printf '%s' "$release_json" | node -e '
  let text="";process.stdin.on("data",x=>text+=x).on("end",()=>{
    const j=JSON.parse(text);if(!j.rulesetName)process.exit(1);
    process.stdout.write(j.rulesetName);
  });')"
curl --fail --silent --show-error --header "Authorization: Bearer $token" \
  "https://firebaserules.googleapis.com/v1/$ruleset" > /tmp/durood-firebase-active-rules.json
node <<'NODE'
const fs=require('fs'),cp=require('child_process');
const response=JSON.parse(fs.readFileSync('/tmp/durood-firebase-active-rules.json','utf8'));
const existing=response.source?.files?.find(x=>/firestore\.rules$/.test(x.name||'')) ||
  (response.source?.files?.length===1?response.source.files[0]:null);
if(!existing || typeof existing.content!=='string'){
  console.error('Could not verify currently published Firestore rules. Refusing unsafe overwrite.');
  process.exit(1);
}
const expected=cp.execFileSync('git',['show','HEAD^:firestore.rules'],{encoding:'utf8'});
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
if(normalize(existing.content)!==normalize(expected)){
  console.error('Published rules differ from repository baseline. Stop to protect the existing live project.');
  process.exit(1);
}
console.log('Live Firebase rules match the backed-up baseline. A rules-only update is safe to attempt.');
NODE
