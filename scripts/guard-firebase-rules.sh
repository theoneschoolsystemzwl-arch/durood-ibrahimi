#!/usr/bin/env bash
# Never overwrite manual Firebase Console rule edits without reviewing them.
set -euo pipefail
project="durood-e-ibrahimi-global-c74e0"
token="$(gcloud auth print-access-token)"
release_json="$(curl --fail --silent --show-error --header "Authorization: Bearer $token" \
  "https://firebaserules.googleapis.com/v1/projects/$project/releases/cloud.firestore")"
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
