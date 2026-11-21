/**
 * Safe one-time recovery for a replaced Firebase Authentication owner UID.
 *
 * Run ONLY in a trusted Google Cloud Shell with Application Default Credentials.
 * Inspection is the default: OWNER_EMAIL="..." node scripts/reconcile-owner.mjs
 * Explicit transfer requires CONFIRM_OWNER_TRANSFER=TRANSFER_TO_<targetAuthUid>.
 * Never paste passwords, tokens or service-account keys in chat or GitHub.
 *
 * Intentionally leaves old owner documents and old Auth user untouched until
 * their historical data has been reviewed after a successful new login.
 */
import {initializeApp,applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";

const projectId="durood-e-ibrahimi-global-c74e0";
const previousUid="ecrykLlmTAbV90llOdQVRSX4OyE3";
const email=String(process.env.OWNER_EMAIL||"").trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw Error("Set OWNER_EMAIL to the exact existing Firebase Authentication email.");
}
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth(),db=getFirestore();
const target=await auth.getUserByEmail(email);
if(target.disabled)throw Error("Target Firebase Authentication user is disabled.");
if(target.uid===previousUid)throw Error("Owner UID has not changed; investigate the Firestore permissions instead.");

const legacyMemberRef=db.doc("members/"+previousUid);
const targetMemberRef=db.doc("members/"+target.uid);
const legacyCountRef=db.doc("memberCounts/"+previousUid);
const targetCountRef=db.doc("memberCounts/"+target.uid);
const sequenceRef=db.doc("system/membership");
const usernameRef=db.doc("usernames/owner");
const legacyProfileRef=db.doc("ownerProfiles/DI-1");
const [legacyMember,targetMember,legacyCount,targetCount,sequence,username,legacyProfile,owners]=await Promise.all([
 legacyMemberRef.get(),targetMemberRef.get(),legacyCountRef.get(),targetCountRef.get(),
 sequenceRef.get(),usernameRef.get(),legacyProfileRef.get(),
 db.collection("members").where("role","==","owner").get()
]);
const otherOwners=owners.docs.filter(s=>![previousUid,target.uid].includes(s.id));
if(otherOwners.length)throw Error("Another owner exists. Stop and inspect ownership before changing anything.");
if(targetMember.exists && targetMember.get("role")!=="owner")throw Error("New Auth UID already belongs to a non-owner member; will not escalate.");
if(legacyMember.exists && legacyMember.get("role")!=="owner")throw Error("Legacy member record is not an owner; manual review required.");
if(sequence.exists && (![previousUid,target.uid].includes(sequence.get("ownerUid")) ||
 !Number.isSafeInteger(sequence.get("lastNumber")) || sequence.get("lastNumber")<1)) {
 throw Error("Stored owner UID or membership sequence conflicts with the proposed transfer.");
}
if(username.exists && ![previousUid,target.uid].includes(username.get("uid"))) {
 throw Error("Username 'owner' belongs to a different UID; stop.");
}
if(targetCount.exists && legacyCount.exists && targetCount.get("total")!==legacyCount.get("total")) {
 throw Error("Old and new counters differ; do not overwrite either.");
}
if(!sequence.exists){
 const existingMembers=await db.collection("members").limit(3).get();
 if(existingMembers.docs.some(s=>![previousUid,target.uid].includes(s.id))){
  throw Error("Membership sequence missing with other members present; manual reconstruction needed.");
 }
}
const sourcePrayers=await db.collection("memberPrivate").doc(previousUid).collection("prayers").get();
const destinationPrayers=await db.collection("memberPrivate").doc(target.uid).collection("prayers").get();
const destinationMap=new Map(destinationPrayers.docs.map(s=>[s.id,s]));
const toCopy=[];
for(const old of sourcePrayers.docs){
 const existing=destinationMap.get(old.id);
 if(existing && JSON.stringify(existing.data())!==JSON.stringify(old.data())) {
  throw Error("Prayer record conflict on "+old.id+"; no migration started.");
 }
 if(!existing)toCopy.push(old);
}
const inspection={
  projectId,oldUid:previousUid,newUid:target.uid,
  oldOwnerMemberExists:legacyMember.exists,newOwnerMemberExists:targetMember.exists,
  legacyOwnerProfileExists:legacyProfile.exists,
  membershipSequenceExists:sequence.exists,
  membershipOwnerUid:sequence.exists?sequence.get("ownerUid"):null,
  lastIssuedMemberNumber:sequence.exists?sequence.get("lastNumber"):null,
  oldCounter:legacyCount.exists?legacyCount.get("total"):null,
  newCounter:targetCount.exists?targetCount.get("total"):null,
  prayerDocumentsToCopy:toCopy.length,
  otherOwnerCount:otherOwners.length,
  action:"No old records or Auth users will be deleted."
};
console.log(JSON.stringify(inspection,null,2));
if(process.env.CONFIRM_OWNER_TRANSFER!=="TRANSFER_TO_"+target.uid){
 console.log("DRY RUN ONLY. Set CONFIRM_OWNER_TRANSFER=TRANSFER_TO_"+target.uid+" to transfer ownership.");
 process.exit(0);
}
// Copy prayer history first, without removing originals; retries are safe.
for(let i=0;i<toCopy.length;i+=350){
 const batch=db.batch();
 for(const old of toCopy.slice(i,i+350)){
  batch.create(db.collection("memberPrivate").doc(target.uid).collection("prayers").doc(old.id),old.data());
 }
 await batch.commit();
}
const backupRef=db.collection("ownerMigrationBackups").doc();
await db.runTransaction(async tx=>{
 const refs=[legacyMemberRef,targetMemberRef,legacyCountRef,targetCountRef,sequenceRef,usernameRef,legacyProfileRef];
 const [oldDoc,newDoc,oldCount,newCount,seq,alias,profile]=await Promise.all(refs.map(ref=>tx.get(ref)));
 if(newDoc.exists && newDoc.get("role")!=="owner")throw Error("New profile changed during migration.");
 if(seq.exists && ![previousUid,target.uid].includes(seq.get("ownerUid")))throw Error("Ownership changed during migration.");
 if(alias.exists && ![previousUid,target.uid].includes(alias.get("uid")))throw Error("Username mapping changed.");
 const backupData={
  createdAt:FieldValue.serverTimestamp(),oldUid:previousUid,newUid:target.uid,
  oldMember:oldDoc.exists?oldDoc.data():null,
  targetMemberBefore:newDoc.exists?newDoc.data():null,
  oldCounter:oldCount.exists?oldCount.data():null,
  targetCounterBefore:newCount.exists?newCount.data():null,
  membershipBefore:seq.exists?seq.data():null,
  usernameBefore:alias.exists?alias.data():null,
  legacyOwnerProfile:profile.exists?profile.data():null
 };
 tx.create(backupRef,backupData);
 const oldData=oldDoc.exists?oldDoc.data():{};
 const name=String(oldData.name||profile.data()?.displayName||target.displayName||"Owner").trim().slice(0,60);
 const ownerProfile={
  ...oldData,
  uid:target.uid,username:"owner",name:name.length>=2?name:"Owner",
  role:"owner",memberNumber:1,serial:"DI-1",disabled:false,inviterUid:null,
  updatedAt:FieldValue.serverTimestamp(),
  createdAt:oldData.createdAt||FieldValue.serverTimestamp()
 };
 if(!newDoc.exists)tx.create(targetMemberRef,ownerProfile);
 const lastNumber=seq.exists?seq.get("lastNumber"):1;
 if(seq.exists)tx.update(sequenceRef,{ownerUid:target.uid,updatedAt:FieldValue.serverTimestamp()});
 else tx.create(sequenceRef,{ownerUid:target.uid,lastNumber,updatedAt:FieldValue.serverTimestamp()});
 if(alias.exists)tx.update(usernameRef,{uid:target.uid});
 else tx.create(usernameRef,{uid:target.uid,createdAt:FieldValue.serverTimestamp()});
 if(oldCount.exists && !newCount.exists)tx.create(targetCountRef,{...oldCount.data(),memberUid:target.uid});
});
const claims={...(target.customClaims||{}),owner:true};
await auth.setCustomUserClaims(target.uid,claims);
console.log("Owner transferred to the existing Email/Password UID; old data preserved.");
console.log("Backup reference: "+backupRef.path);
console.log("Refresh login session to receive the owner claim. Verify counts and history before any cleanup.");
