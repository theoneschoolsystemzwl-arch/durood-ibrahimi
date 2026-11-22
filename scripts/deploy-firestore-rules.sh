#!/usr/bin/env bash
# Publish only after guard-firebase-rules.sh has compared live source.
# Firebase Rules REST API needs roles/firebaserules.admin but does NOT need
# broad Service Usage Admin or Firebase CLI's serviceusage.services.get probe.
set -euo pipefail

project="durood-e-ibrahimi-global-c74e0"
base="https://firebaserules.googleapis.com/v1/projects/$project"
guard_file="/tmp/durood-guarded-ruleset-name"
if [[ ! -s "$guard_file" ]]; then
  echo "No verified production baseline. Refusing deployment." >&2
  exit 1
fi

token="$(gcloud auth print-access-token)"
payload="$(mktemp)"
response="$(mktemp)"
latest="$(mktemp)"
patch_payload="$(mktemp)"
verify_reply="$(mktemp)"
trap 'rm -f "$payload" "$response" "$latest" "$patch_payload" "$verify_reply"' EXIT

# Prevent race with anyone editing Rules through Firebase Console after guard.
code="$(curl --silent --show-error --output "$latest" --write-out '%{http_code}' \
  --header "Authorization: Bearer $token" "$base/releases/cloud.firestore")"
if [[ "$code" != 200 ]]; then
  echo "Could not verify the live release before publishing (HTTP $code)." >&2
  exit 1
fi
node - "$latest" "$guard_file" <<'NODE'
const fs=require("fs");
const live=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const guarded=fs.readFileSync(process.argv[3],"utf8").trim();
if(!guarded.startsWith("projects/")||live.rulesetName!==guarded){
  console.error("Production rules release changed since verification. Refusing overwrite.");
  process.exit(1);
}
NODE

node - "$payload" <<'NODE'
const fs=require("fs");
const content=fs.readFileSync("firestore.rules","utf8");
if(!content.startsWith("rules_version = '2';")||content.length>250000){
  console.error("Firestore rules are missing or exceed the safe source limit.");
  process.exit(1);
}
fs.writeFileSync(process.argv[2],JSON.stringify({
 source:{files:[{name:"firestore.rules",content}]}
}));
NODE

status="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
  --request POST --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' --data-binary "@$payload" \
  "$base/rulesets")"
if [[ "$status" != 200 && "$status" != 201 ]]; then
  echo "Firebase Rules compilation/create failed (HTTP $status)." >&2
  node - "$response" <<'NODE'
const fs=require("fs");
try{const e=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).error;
 console.error(String(e?.message||"Unknown Rules error").slice(0,1200));}
catch{console.error("No readable Firebase error response.");}
NODE
  exit 1
fi

ruleset="$(node - "$response" "$project" <<'NODE'
const fs=require("fs");
const j=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const prefix="projects/"+process.argv[3]+"/rulesets/";
if(typeof j.name!=="string"||!j.name.startsWith(prefix)||j.name.length< prefix.length+5){
  console.error("Firebase returned an invalid Ruleset name.");
  process.exit(1);
}
process.stdout.write(j.name);
NODE
)"

node - "$patch_payload" "$project" "$ruleset" <<'NODE'
const fs=require("fs");
fs.writeFileSync(process.argv[2],JSON.stringify({
 release:{name:"projects/"+process.argv[3]+"/releases/cloud.firestore",
   rulesetName:process.argv[4]}
}));
NODE
status="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
  --request PATCH --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' --data-binary "@$patch_payload" \
  "$base/releases/cloud.firestore")"
if [[ "$status" != 200 ]]; then
  echo "Firebase Rules release failed (HTTP $status)." >&2
  node - "$response" <<'NODE'
const fs=require("fs");
try{const e=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).error;
 console.error(String(e?.message||"Unknown Rules error").slice(0,1200));}
catch{console.error("No readable Firebase error response.");}
NODE
  exit 1
fi
node - "$response" "$ruleset" <<'NODE'
const fs=require("fs");
const data=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(data.rulesetName!==process.argv[3]){
  console.error("Release response did not confirm the intended Ruleset.");
  process.exit(1);
}
console.log("Production Firestore rules safely published through Firebase Rules REST API.");
NODE
