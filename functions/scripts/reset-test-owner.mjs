/**
 * Reset this project's old test owner data and assign DI-1 to its ONE remaining
 * existing Firebase Authentication Email/Password user.
 *
 * PRIVILEGED ONE-TIME OPERATION: Google Cloud Admin SDK credentials required.
 * This file never asks for or changes the user's password.
 * Usage:
 *   cd functions && npm install
 *   CONFIRM_OWNER_RESET=DELETE_TEST_OWNER_DATA node scripts/reset-test-owner.mjs
 *
 * SAFETY: abort unless exactly one enabled Firebase Authentication user exists,
 * the old Auth user is deleted, and no member other than old/new UID exists.
 * Never use this on a real multi-member deployment.
 */
import {initializeApp, applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const projectId="durood-e-ibrahimi-global-c74e0";
const legacyUid="ecrykLlmTAbV90llOdQVRSX4OyE3";
if(process.env.CONFIRM_OWNER_RESET!=="DELETE_TEST_OWNER_DATA"){
  throw Error("No changes made. Set CONFIRM_OWNER_RESET=DELETE_TEST_OWNER_DATA to authorize test-data deletion.");
}
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth();
const db=getFirestore();

// Verify the exact scope BEFORE deleting anything.
const firstPage=await auth.listUsers(2);
if(firstPage.pageToken||firstPage.users.length!==1) {
  throw Error("STOP: expected exactly one existing Firebase Auth user. No data changed.");
}
const user=firstPage.users[0];
if(!user.email)throw Error("STOP: target account has no email identity.");
if(user.disabled||user.uid===legacyUid) {
  throw Error("STOP: current Auth user is disabled or still uses the legacy UID.");
}
const targetUid=user.uid;
const memberRefs=[db.doc("members/"+legacyUid),db.doc("members/"+targetUid)];
const members=await db.collection("members").limit(3).get();
const unexpectedMembers=members.docs.filter(d=>d.id!==legacyUid&&d.id!==targetUid);
if(unexpectedMembers.length)throw Error("STOP: another member exists; old test data cannot be reset safely.");
const [targetExisting,legacyExisting,sequence,oldCount,newCount,oldProfile]=await Promise.all([
  memberRefs[1].get(),memberRefs[0].get(),db.doc("system/membership").get(),
  db.doc("memberCounts/"+legacyUid).get(),db.doc("memberCounts/"+targetUid).get(),
  db.doc("ownerProfiles/DI-1").get()
]);
// A successful previous reset must NEVER wipe new legitimate readings on a retry.
if(targetExisting.exists&&targetExisting.get("role")==="owner"&&
 sequence.exists&&sequence.get("ownerUid")===targetUid&&
 !legacyExisting.exists&&(user.customClaims||{}).owner===true){
 console.log("Already the Master Owner (DI-1). No data was deleted or reset.");
 process.exit(0);
}
if(sequence.exists &&
 sequence.get("ownerUid")!==legacyUid&&sequence.get("ownerUid")!==targetUid){
 throw Error("STOP: sequence is owned by another UID.");
}
if(legacyExisting.exists && legacyExisting.get("role")!=="owner"){
 throw Error("STOP: legacy member is not marked owner.");
}
const aliasSnap=await db.collection("usernames").get();
const badAliases=aliasSnap.docs.filter(d=>d.get("uid")!==legacyUid&&d.get("uid")!==targetUid);
if(badAliases.length)throw Error("STOP: username records exist for different accounts.");
const invites=await db.collection("invitations").get();
const unknownInviters=invites.docs.filter(d=>d.get("byUid")!==legacyUid&&d.get("byUid")!==targetUid);
if(unknownInviters.length)throw Error("STOP: invitation records belong to another account.");
const displayName=String(user.displayName||oldProfile.data()?.displayName||legacyExisting.data()?.name||"Owner").trim().slice(0,60);
const name=displayName.length>=2?displayName:"Owner";

console.log("Authorized project:",projectId);
console.log("Target Firebase UID:",targetUid);
console.log("Target Email:",user.email);
console.log("Old test owner UID:",legacyUid);
console.log("Old member exists:",legacyExisting.exists);
console.log("Old counter exists:",oldCount.exists);
console.log("Old owner profile exists:",oldProfile.exists);
console.log("Old sequence exists:",sequence.exists);
console.log("Existing active member records:",members.size);
console.log("Reset requested for ONLY test data. Deletion starts.");

// Delete test-only nested histories first. Auth users are never deleted.
await db.recursiveDelete(db.doc("memberPrivate/"+legacyUid));
await db.recursiveDelete(db.doc("memberPrivate/"+targetUid));
await db.recursiveDelete(memberRefs[0]);
for(const ref of [
  db.doc("memberSessions/"+legacyUid),db.doc("memberAccess/"+legacyUid),
  db.doc("memberSessions/"+targetUid),db.doc("memberAccess/"+targetUid),
  db.doc("ownerProfiles/DI-1"),db.doc("memberCounts/"+legacyUid)
])await ref.delete();
for(const doc of aliasSnap.docs)await doc.ref.delete();
for(const doc of invites.docs)await doc.ref.delete();

// Finalize one fresh owner profile and zeroed test counters together.
// Admin SDK is privileged; no public role escalation is possible.
const now=FieldValue.serverTimestamp();
const batch=db.batch();
batch.set(db.doc("members/"+targetUid),{
  uid:targetUid,username:"owner",name,role:"owner",
  memberNumber:1,serial:"DI-1",disabled:false,inviterUid:null,
  createdAt:now,updatedAt:now
});
batch.set(db.doc("system/membership"),{
  ownerUid:targetUid,lastNumber:1,updatedAt:now
});
batch.set(db.doc("usernames/owner"),{
  uid:targetUid,createdAt:now
});
batch.set(db.doc("memberCounts/"+targetUid),{
  memberUid:targetUid,total:0,lastEntryAmount:0,updatedAt:now
});
batch.set(db.doc("publicStats/global"),{
  totalRecitations:0,lastEntryAmount:0,lastEntryUid:targetUid,updatedAt:now
});
await batch.commit();

// Auth identity is unchanged: current email and existing password still work.
await auth.setCustomUserClaims(targetUid,{...(user.customClaims||{}),owner:true});
await auth.revokeRefreshTokens(targetUid);
console.log("SUCCESS: existing Email/Password user is now the sole Master Owner, DI-1.");
console.log("Old owner test data removed. Counts reset to zero; login credentials unchanged.");
console.log("Refresh the page and sign in again to receive new owner permissions.");
