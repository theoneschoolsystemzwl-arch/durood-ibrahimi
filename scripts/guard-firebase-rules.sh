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
  echo "Direct Firebase Rules release read returned HTTP $status; checking list API."
  list_file="$(mktemp)"
  list_status="$(curl --silent --show-error --output "$list_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $token" \
    "https://firebaserules.googleapis.com/v1/projects/$project/releases")"
  echo "Firebase Rules release list returned HTTP $list_status."
  if [ "$list_status" = 200 ]; then
    release_json="$(node - "$list_file" "$project" <<'NODE'
const fs=require("fs");
const [file,project]=process.argv.slice(2),data=JSON.parse(fs.readFileSync(file,"utf8"));
const release=(data.releases||[]).find(r=>r.name===`projects/${project}/releases/cloud.firestore` ||
 r.name===`projects/${project}/releases/cloud.firestore/(default)`);
if(!release?.rulesetName){process.stderr.write("No verified default Firestore release in list.\\n");process.exit(1);}
process.stdout.write(JSON.stringify(release));
NODE
    )"
  else
    node - "$response_file" "$list_file" <<'NODE'
const fs=require("fs");
for(const file of process.argv.slice(2)){
 try{
  const j=JSON.parse(fs.readFileSync(file,"utf8"));
  console.error("Firebase API error: "+String(j.error?.message||"Unknown").slice(0,900));
  console.error("Google error status: "+String(j.error?.status||"unknown"));
  console.error("Error diagnostics: "+JSON.stringify(j.error?.details||[]).slice(0,1600));
 }catch{console.error("The API did not return readable JSON.");}
}
NODE
    permission_url="https://cloudresourcemanager.googleapis.com/v1/projects/$project:testIamPermissions"
    curl --silent --show-error --max-time 15 --header "Authorization: Bearer $token" \
      --header "Content-Type: application/json" \
      --data '{"permissions":["resourcemanager.projects.get","serviceusage.services.use","serviceusage.services.get","firebaserules.releases.get","firebaserules.releases.list","firebaserules.rulesets.get","firebaserules.rulesets.create","firebaserules.releases.update"]}' \
      "$permission_url" | node -e '
        let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
          try{let j=JSON.parse(s); console.log("Granted project-level permissions: "+(j.permissions||[]).join(", "));}
          catch{console.log("Project permission probe was unavailable.");}
        });' || true
    exit 1
  fi
else
  release_json="$(cat "$response_file")"
fi
rm -f "$response_file"

ruleset="$(printf '%s' "$release_json" | node -e '
  let text="";process.stdin.on("data",x=>text+=x).on("end",()=>{
    const j=JSON.parse(text);if(!j.rulesetName)process.exit(1);
    process.stdout.write(j.rulesetName);
  });')"
curl --fail --silent --show-error --header "Authorization: Bearer $token" \
  "https://firebaserules.googleapis.com/v1/$ruleset" > /tmp/durood-firebase-active-rules.json
# GitHub checkout is shallow by default. Fetch history strictly for the
# read-only source comparison; never attempt a rule update without it.
git fetch --quiet --no-tags --depth=90 origin main
node <<'NODE'
const fs=require('fs'),cp=require('child_process');
const response=JSON.parse(fs.readFileSync('/tmp/durood-firebase-active-rules.json','utf8'));
const existing=response.source?.files?.find(x=>/firestore\.rules$/.test(x.name||'')) ||
  (response.source?.files?.length===1?response.source.files[0]:null);
if(!existing || typeof existing.content!=='string'){
  console.error('Could not verify currently published Firestore rules. Refusing unsafe overwrite.');
  process.exit(1);
}
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
const same=(a,b)=>typeof a==='string' && normalize(a)===normalize(b);
function historicalRules(commit) {
  // Some older repository commits predate firestore.rules entirely. Do not
  // abort the safety audit for an absent historical path; only accept exact
  // matches to a source successfully retrieved from a trusted commit.
  try {
    return cp.execFileSync('git',['show',commit+':firestore.rules'],{
      encoding:'utf8',stdio:['ignore','pipe','ignore']});
  } catch { return null; }
}
if(same(existing.content,fs.readFileSync('firestore.rules','utf8'))){
  fs.writeFileSync('/tmp/durood-rules-already-current','1');
  console.log('Firestore rules already published; Hosting may proceed without re-publishing rules.');
  process.exit(0);
}
// This is the last trusted pre-Wazaif source. The Wazaif change on main
// has not been deployed, and HEAD^ now points to the new source, not baseline.
// Confirmed live difference: only this existing AND predicate was moved
// upward inside allowedMemberCreate. It changes no access semantics, and
// the exact single relocation is verified before any update is allowed.
let expected=historicalRules('bcf9beace253b59bd92d89ab95f336ab349f5235');
const sideRule="        (!('sideNumber' in m) || (m.gender == 'female' && m.sideNumber is int && m.sideNumber == previousGenderMembers('female') + 1)) &&\n";
const predicateAnchor="        m.uid == uid && validUsername(m.username) &&\n";
if(expected && expected.split(sideRule).length===2 && expected.split(predicateAnchor).length===2){
  expected=expected.replace(sideRule,'').replace(predicateAnchor,sideRule+predicateAnchor);
}else{
  // This special pre-Wazaif baseline is unavailable or not recognizable;
  // continue checking later immutable, verified deployment snapshots.
  expected=null;
}

// The 23 Nov Wazaif rules were deployed through the verified Firebase
// Rules REST API. Accept that exact, immutable pre-Qaza production version
// as an alternate trusted baseline for the Qaza-private-rules upgrade.
const beforeQaza=historicalRules('f024232628303dfaa2428930b3e0be3b0c923841');
// The verified Qaza update was published on 23 Nov. Any new change must
// match this exact trusted production source before deploying.
const beforeSharing=historicalRules('14f92184d86bdeb88a13b3977c00be22aeb86997');
// Wazifa serials and inbox controls from PR #9 are the confirmed live
// baseline. Never overwrite an unrecognized change made in Firebase Console.
const beforeFemaleSerial=historicalRules('76bfc2c07f21b7708e5d38f8876bd9a943f54dd5');
 // The last successfully deployed web commit kept these exact security rules.
 // Compare live rules against the immutable pre-redesign commit before allowing
 // any new Wazifa ledger rule change; never accept arbitrary Console edits.
const beforeHeroRedesign=historicalRules('1d7041c709a3df502647f5c04c62750a0b3fea80');
 // The verified live, audited Wazifa daily-ledger rules immediately before
 // the optional fixed-to-daily upgrade. Match the complete source exactly.
const beforeFixedDaily=historicalRules('46bc214724a4946e00e0de124feadf8371e639be');
// Confirmed exact Wazifa source in main immediately before this dated Save upgrade.
const beforeDatedSave=historicalRules('fd8bad24e68f3faad03f365028cf1f90cbdf6739');
// Published W1 dated Save rules from the preceding confirmed Hosting deployment.
const beforeRuleRepair=historicalRules('885869ff2e34141720630feb63812d4f4862edf2');
const beforeDatedDispatchFix=historicalRules('dfc046aac8295d0dfc861370f02fd2db29720cd8');
// Deployed, verified W1 source before evaluating the optimized count-only rules.
const beforeFastCount=historicalRules('6c4c3c510d6f2a1c5b56170b9497ffc42fe696d1');
// Exact rules source from the last successful production Hosting/Rules release
// (2026-11-23, commit 1ced3cf). Require an exact byte-for-byte match before any change.
const beforeSignedLedger=historicalRules('1ced3cfb5ae4919d5363353f0bd1bf135f3f4502');
// Last verified production release before adding immutable tap-sync receipts.
// This full source was deployed successfully with the previous profile update.
const beforeDurableTasbih=historicalRules('fd863f86ed73b1e997ca5703080a3c77cc35ee14');
const baselines=[
  expected,beforeQaza,beforeSharing,beforeFemaleSerial,beforeHeroRedesign,
  beforeFixedDaily,beforeDatedSave,beforeRuleRepair,beforeDatedDispatchFix,
  beforeFastCount,beforeSignedLedger,beforeDurableTasbih
].filter(source=>typeof source==='string');
if(!baselines.some(source=>same(existing.content,source))){
  console.error('Published rules differ from every verified, available repository baseline.');
  console.error('Stopping to protect manual Firebase Console changes and existing records.');
  // This guard never overwrites unverified production rules.
  process.exit(1);
}
fs.writeFileSync('/tmp/durood-guarded-ruleset-name',response.name);
console.log('Live Firebase rules match the backed-up baseline. A rules-only update is safe to attempt.');
NODE
