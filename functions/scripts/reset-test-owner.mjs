/**
 * Privileged owner reset for the specified Firebase project.
 * Uses the user's EXISTING Firebase Email/Password account: no password change,
 * no new Auth user, and DI-1 remains only a member serial.
 *
 * Required: OWNER_EMAIL=<current auth email>
 * First run is READ-ONLY unless CONFIRM_OWNER_RESET=DELETE_TEST_OWNER_DATA.
 * Only the target Auth user and optional known legacy owner are allowed.
 *
 * Must run in authenticated Google Cloud Shell with Firebase Admin permissions.
 */
import {initializeApp, applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const projectId="durood-e-ibrahimi-global-c74e0";
const legacyUid="ecrykLlmTAbV90llOdQVRSX4OyE3";
const requestedEmail=String(process.env.OWNER_EMAIL||"").trim().toLowerCase();
if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(requestedEmail)){
 throw Error("OWNER_EMAIL must be the exact Firebase login email.");
}
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth(),db=getFirestore();
const target=await auth.getUserByEmail(requestedEmail);
if(target.disabled)throw Error("STOP: target account is disabled.");
if(!target.email || target.email.toLowerCase()!==requestedEmail)throw Error("STOP: account email mismatch.");
const uid=target.uid;

// A one-person reset must never erase another user's records.
const allAuth=await auth.listUsers(1000);
if(allAuth.pageToken)throw Error("STOP: too many Firebase Auth accounts for a test-only reset.");
const unexpectedAuth=allAuth.users.filter(u=>u.uid!==uid&&u.uid!==legacyUid);
if(unexpectedAuth.length)throw Error("STOP: other Firebase Auth users exist; no deletion allowed.");
const memberDocs=await db.collection("members").limit(3).get();
if(memberDocs.docs.some(d=>d.id!==uid&&d.id!==legacyUid))throw Error("STOP: another member exists.");
const countDocs=await db.collection("memberCounts").limit(3).get();
if(countDocs.docs.some(d=>d.id!==uid&&d.id!==legacyUid))throw Error("STOP: another member count exists.");
const aliasDocs=await db.collection("usernames").limit(100).get();
if(aliasDocs.size>=100)throw Error("STOP: too many username aliases for test reset.");
if(aliasDocs.docs.some(d=>![uid,legacyUid].includes(d.get("uid"))))throw Error("STOP: another account owns a username alias.");
const invites=await db.collection("invitations").limit(100).get();
if(invites.size>=100)throw Error("STOP: too many invitations for test reset.");
if(invites.docs.some(d=>![uid,legacyUid].includes(d.get("byUid"))))throw Error("STOP: another account owns invitations.");
const sequenceRef=db.doc("system/membership"),ownerRef=db.doc("members/"+uid);
const oldMemberRef=db.doc("members/"+legacyUid),auditRef=db.doc("system/ownerTestResetAudit");
const [seq,member,oldMember,audit]=await Promise.all([
 sequenceRef.get(),ownerRef.get(),oldMemberRef.get(),auditRef.get()
]);
if(seq.exists && ![uid,legacyUid].includes(seq.get("ownerUid")))throw Error("STOP: another account owns the DI member sequence.");
if(member.exists && !["owner","member"].includes(member.get("role")))throw Error("STOP: unknown target profile role.");
if(oldMember.exists && oldMember.get("role")!=="owner" && uid!==legacyUid)throw Error("STOP: legacy UID is not the owner.");
if(audit.exists&&audit.get("ownerUid")!==uid)throw Error("STOP: reset was previously assigned to another account.");
console.log("PROJECT:",projectId);
console.log("TARGET EMAIL:",target.email);
console.log("TARGET AUTH UID:",uid);
console.log("OLD AUTH UID FOUND:",allAuth.users.some(u=>u.uid===legacyUid));
console.log("CURRENT PROFILE:",member.exists?(member.get("role")||"unknown"):"missing");
console.log("CURRENT OWNER UID:",seq.exists?seq.get("ownerUid"):"no sequence");
console.log("OTHER USERS:",unexpectedAuth.length);
if(audit.exists){
 if(target.customClaims?.owner!==true) {
  if(process.env.CONFIRM_OWNER_RESET==="DELETE_TEST_OWNER_DATA"){
   await auth.setCustomUserClaims(uid,{...(target.customClaims||{}),owner:true});
   await auth.revokeRefreshTokens(uid);
   console.log("OWNER CLAIM REPAIRED. Sign out and log in again.");
  } else console.log("OWNER CLAIM MISSING. Confirm the reset to repair only this claim.");
 }else console.log("RESET PREVIOUSLY COMPLETED. No data was deleted.");
 process.exit(0);
}
if(process.env.CONFIRM_OWNER_RESET!=="DELETE_TEST_OWNER_DATA"){
 console.log("DRY RUN: Nothing changed. Set CONFIRM_OWNER_RESET=DELETE_TEST_OWNER_DATA to reset only these test accounts.");
 process.exit(0);
}
if(member.exists && member.get("role")==="owner" &&
 seq.exists && seq.get("ownerUid")===uid && target.customClaims?.owner===true){
 throw Error("STOP: active owner already exists. Refusing to wipe current data.");
}
const nameRaw=String(target.displayName||member.data()?.name||oldMember.data()?.name||"Owner").trim().slice(0,60);
const name=nameRaw.length>=2?nameRaw:"Owner";
const now=FieldValue.serverTimestamp();
const aliasesToDelete=aliasDocs.docs.filter(d=>d.id!=="owner");
const invitesToDelete=invites.docs;
if(aliasesToDelete.length+invitesToDelete.length>250)throw Error("STOP: deletion scope too large.");

// Transaction creates a working DI-1 Owner before any test data is cleared.
// If this fails, the old data remains intact and can be reviewed.
await db.runTransaction(async tx=>{
 const [latestSeq,latestTarget,latestOld,latestAudit]=await Promise.all([
  tx.get(sequenceRef),tx.get(ownerRef),tx.get(oldMemberRef),tx.get(auditRef)
 ]);
 if(latestAudit.exists)throw Error("STOP: reset already happened in a concurrent process.");
 if(latestSeq.exists&&![uid,legacyUid].includes(latestSeq.get("ownerUid")))throw Error("STOP: sequence changed.");
 if(latestTarget.exists&&!["owner","member"].includes(latestTarget.get("role")))throw Error("STOP: target profile changed.");
 if(latestOld.exists&&uid!==legacyUid&&latestOld.get("role")!=="owner")throw Error("STOP: old owner changed.");
 tx.set(ownerRef,{
  uid,username:"owner",name,role:"owner",memberNumber:1,serial:"DI-1",
  inviterUid:null,disabled:false,createdAt:now,updatedAt:now
 });
 tx.set(sequenceRef,{ownerUid:uid,lastNumber:1,updatedAt:now});
 tx.set(db.doc("usernames/owner"),{uid,createdAt:now});
 tx.set(db.doc("memberCounts/"+uid),{
  memberUid:uid,total:0,lastEntryAmount:0,updatedAt:now
 });
 tx.set(db.doc("publicStats/global"),{
  totalRecitations:0,lastEntryAmount:0,lastEntryUid:uid,updatedAt:now
 });
 tx.create(auditRef,{ownerUid:uid,legacyUid,createdAt:now,kind:"owner-test-reset"});
 if(uid!==legacyUid){
  tx.delete(oldMemberRef);
  tx.delete(db.doc("memberCounts/"+legacyUid));
 }
 for(const item of aliasesToDelete)tx.delete(item.ref);
 for(const item of invitesToDelete)tx.delete(item.ref);
});
// New identity can log in with its old email/password; activate owner claim.
await auth.setCustomUserClaims(uid,{...(target.customClaims||{}),owner:true});
await auth.revokeRefreshTokens(uid);
// Remove only confirmed test histories. Real data of other accounts is untouched.
for(const ownerUid of new Set([uid,legacyUid])){
 await db.recursiveDelete(db.doc("memberPrivate/"+ownerUid));
 await db.doc("memberSessions/"+ownerUid).delete();
 await db.doc("memberAccess/"+ownerUid).delete();
}
await db.doc("ownerProfiles/DI-1").delete();
await db.doc("members/"+uid+"/private/profile").delete();
if(uid!==legacyUid){
 await db.doc("members/"+legacyUid+"/private/profile").delete();
 const oldAuth=allAuth.users.find(u=>u.uid===legacyUid);
 if(oldAuth)await auth.deleteUser(legacyUid);
}
console.log("SUCCESS: existing Firebase Email/Password is the Master Owner (DI-1).");
console.log("Old test-only readings and prayer records cleared; counters reset to 0.");
console.log("Sign out, reload the live site, then log in with the same email and password.");
