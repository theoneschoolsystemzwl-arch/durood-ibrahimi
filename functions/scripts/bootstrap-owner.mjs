// One-time owner setup. Run in a trusted terminal with Google Application Default Credentials.
// Never place OWNER_PASSWORD or service-account JSON inside browser code or GitHub.
import {initializeApp, applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
const projectId = "durood-e-ibrahimi-global-c74e0";
const username = (process.env.OWNER_USERNAME || "").trim().toLowerCase();
const name = (process.env.OWNER_NAME || "").trim();
const password = process.env.OWNER_PASSWORD || "";
if (!/^[a-z0-9._-]{3,24}$/.test(username) || /^di-\d+$/.test(username) ||
    name.length < 2 || name.length > 60 || password.length < 8) {
  throw Error("Provide valid OWNER_USERNAME, OWNER_NAME and OWNER_PASSWORD through trusted environment variables.");
}
initializeApp({credential:applicationDefault(),projectId});
const db = getFirestore();
const auth = getAuth();
const seqRef = db.doc("system/membership");
const memberCollection = db.collection("members");
const userRef = db.doc("usernames/" + username);
const [anyMembers, counter, authUsers] = await Promise.all([
  memberCollection.limit(1).get(), seqRef.get(), auth.listUsers(1)
]);
if (!anyMembers.empty || counter.exists || authUsers.users.length > 0) {
  throw Error("STOP: existing Firebase Auth users, member records or sequence found. Review account history before assigning DI-1.");
}
const email = username + "@" + projectId + ".firebaseapp.com";
let owner;
try {
  owner = await auth.createUser({email, password, displayName:name,disabled:false});
} catch(error) {
  if (error.code === "auth/email-already-exists") {
    throw Error("Owner username exists in Firebase Authentication. Verify existing Auth users; do not overwrite credentials.");
  }
  throw error;
}
let created = false;
try {
  await db.runTransaction(async tx => {
    const [seq,userDoc] = await Promise.all([tx.get(seqRef),tx.get(userRef)]);
    if (seq.exists || userDoc.exists) throw Error("Concurrent owner setup or username conflict.");
    tx.create(seqRef,{lastNumber:1,ownerUid:owner.uid,updatedAt:FieldValue.serverTimestamp()});
    tx.create(userRef,{uid:owner.uid,createdAt:FieldValue.serverTimestamp()});
    tx.create(memberCollection.doc(owner.uid),{
      uid:owner.uid,username,name,role:"owner",memberNumber:1,serial:"DI-1",
      disabled:false,inviterUid:null,createdAt:FieldValue.serverTimestamp()
    });
  });
  created = true;
  await auth.setCustomUserClaims(owner.uid,{owner:true});
  console.log("Owner account created. Member number DI-1. Username:",username);
} catch(error) {
  if (!created) await auth.deleteUser(owner.uid).catch(console.error);
  else console.error("Owner Firestore record was created but admin custom claim failed; repair securely before logging in.");
  throw error;
}
