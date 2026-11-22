"use strict";
// Non-destructive, opt-in Firestore gender backfill. Never runs automatically.
// Uses Application Default Credentials for the correct Firebase project.
const fs = require("node:fs");
const path = require("node:path");
const {initializeApp,applicationDefault,getApp} = require("firebase-admin/app");
const {getFirestore,FieldValue} = require("firebase-admin/firestore");
const PROJECT = "durood-e-ibrahimi-global-c74e0";
const OWNER_UID = "vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? "" : String(args[index+1]||"").trim();
};
const apply = args.includes("--apply");
const validGender = value => value==="male"||value==="female";
const toNumber = value => Number.isSafeInteger(value)&&value>=0?value:NaN;
if(args.includes("--help")){
  console.log("Usage: node functions/scripts/prepare-gender-migration.cjs --audit [--map local-genders.json]");
  console.log("Apply only AFTER verifying a full Firebase backup: --apply --map local-genders.json --backup-path /private/gender-backup.json --confirm-project "+PROJECT);
  process.exit(0);
}
if(apply && (option("--confirm-project")!==PROJECT || !option("--backup-path"))){
  console.error("Apply refused: project confirmation and private backup path are mandatory.");
  process.exit(2);
}
const mappingPath=option("--map");
let mapping={};
if(mappingPath){
  mapping=JSON.parse(fs.readFileSync(mappingPath,"utf8"));
  if(!mapping||typeof mapping!=="object"||Array.isArray(mapping)){
    throw Error("Expected a UID-to-gender JSON mapping object.");
  }
}
initializeApp({credential:applicationDefault(),projectId:PROJECT});
const db=getFirestore();
async function run(){
  const [memberSnap,countSnap,counterSnap,globalSnap,sideSnap,genderMemberSnap]=await Promise.all([
    db.collection("members").get(),
    db.collection("memberCounts").get(),
    db.doc("system/membership").get(),
    db.doc("publicStats/global").get(),
    db.collection("genderStats").get(),
    db.collection("genderMembers").get()
  ]);
  if(!counterSnap.exists||counterSnap.get("ownerUid")!==OWNER_UID){
    throw Error("Owner UID differs from the verified project record. No data changed.");
  }
  const byUid=new Map(memberSnap.docs.map(d=>[d.id,d]));
  if(!byUid.has(OWNER_UID)){
    throw Error("Trusted Owner document is absent; migration refused.");
  }
  const genders=new Map(),unassigned=[],issues=[];
  for(const doc of memberSnap.docs){
    const data=doc.data();
    const selected=validGender(data.gender)?data.gender:
      doc.id===OWNER_UID?"male":mapping[doc.id];
    if(!validGender(selected)){
      unassigned.push({serial:data.serial||doc.id,uid:doc.id});
      continue;
    }
    if(validGender(data.gender)&&mapping[doc.id]&&mapping[doc.id]!==data.gender){
      issues.push("Mapping conflicts with existing gender: "+(data.serial||doc.id));
    }
    genders.set(doc.id,selected);
  }
  const totals={male:0,female:0},members={male:0,female:0};
  for(const [uid,g] of genders)members[g]++;
  const orphan=[];
  for(const doc of countSnap.docs){
    const owner=byUid.get(doc.id);
    if(!owner){orphan.push(doc.id);continue;}
    const gender=genders.get(doc.id);
    if(!gender)continue;
    const amount=toNumber(doc.get("total"));
    if(!Number.isFinite(amount)){
      issues.push("Invalid recitation count: "+(owner.get("serial")||doc.id));continue;
    }
    totals[gender]+=amount;
  }
  const globalValue=globalSnap.exists?toNumber(globalSnap.get("totalRecitations")):0;
  const discrepancy=Number.isFinite(globalValue)?
    globalValue-(totals.male+totals.female):null;
  console.log(JSON.stringify({
    project:PROJECT,mode:apply?"APPLY":"AUDIT",
    existingMembers:memberSnap.size,existingCountDocs:countSnap.size,
    sideMemberCounts:members,sideRecitationTotals:totals,
    globalHistoricalTotal:globalValue,unattributedRecitations:discrepancy,
    missingGender:unassigned,orphanCountUids:orphan,issues
  },null,2));
  if(!apply)return;
  if(unassigned.length||orphan.length||issues.length||discrepancy!==0){
    throw Error("Apply refused: classify every existing member, reconcile historic totals and repair orphan counters first. No data changed.");
  }
  const bp=path.resolve(option("--backup-path"));
  if(fs.existsSync(bp))throw Error("Backup path already exists; refusing to overwrite "+bp);
  if(!fs.existsSync(path.dirname(bp)))throw Error("Backup destination directory does not exist.");
  // The before-snapshot covers EVERY document this script may modify.
  const snapshot={project:PROJECT,createdAt:new Date().toISOString(),
    records:[
      ...memberSnap.docs.map(d=>({path:d.ref.path,data:d.data()})),
      ...countSnap.docs.map(d=>({path:d.ref.path,data:d.data()})),
      ...sideSnap.docs.map(d=>({path:d.ref.path,data:d.data()})),
      ...genderMemberSnap.docs.map(d=>({path:d.ref.path,data:d.data()})),
      {path:counterSnap.ref.path,data:counterSnap.data()},
      {path:globalSnap.ref.path,data:globalSnap.exists?globalSnap.data():null}
    ]
  };
  fs.writeFileSync(bp,JSON.stringify(snapshot,null,2),{flag:"wx",mode:0o600});
  const written=fs.statSync(bp);
  if(written.size<250)throw Error("Backup verification failed: aborting without writes.");
  console.log("Private before-snapshot verified at "+bp+" ("+written.size+" bytes).");
  const writes=[];
  for(const d of memberSnap.docs)if(!validGender(d.get("gender"))){
    writes.push({ref:d.ref,data:{gender:genders.get(d.id),updatedAt:FieldValue.serverTimestamp()}});
  }
  for(const d of countSnap.docs){
    if(d.get("gender")!==genders.get(d.id)){
      writes.push({ref:d.ref,data:{gender:genders.get(d.id),updatedAt:FieldValue.serverTimestamp()}});
    }
  }
  for(const gender of ["male","female"]){
    const memberRef=db.doc("genderMembers/"+gender);
    const statsRef=db.doc("genderStats/"+gender);
    const currentM=genderMemberSnap.docs.find(d=>d.id===gender);
    const currentS=sideSnap.docs.find(d=>d.id===gender);
    if(!currentM||currentM.get("totalMembers")!==members[gender]){
      writes.push({ref:memberRef,data:{
        gender,totalMembers:members[gender],updatedAt:FieldValue.serverTimestamp()
      }});
    }
    if(!currentS||currentS.get("totalRecitations")!==totals[gender]){
      writes.push({ref:statsRef,data:{
        gender,totalRecitations:totals[gender],updatedAt:FieldValue.serverTimestamp()
      }});
    }
  }
  // Batches are idempotent and merge-only: never delete profiles, Auth users,
  // invites, prayer history, DI serials, or old global counters.
  for(let i=0;i<writes.length;i+=400){
    const batch=db.batch();
    for(const item of writes.slice(i,i+400)){
      batch.set(item.ref,item.data,{merge:true});
    }
    await batch.commit();
  }
  console.log("Migration complete. Merge-only writes="+writes.length+
    ". Original member serials and historical counter retained.");
}
run().catch(error=>{console.error(error.message||error);process.exitCode=1;});
