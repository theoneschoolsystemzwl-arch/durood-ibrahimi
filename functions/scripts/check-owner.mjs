// Read-only preflight to avoid recreating DI-1 after the owner is initialized.
// Exit 0: ready; 2: brand-new empty project; 3: inconsistent state needs review.
import {initializeApp, applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
const projectId="durood-e-ibrahimi-global-c74e0";
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth();
const db=getFirestore();
function stop(reason){console.error("OWNER REVIEW REQUIRED: "+reason);process.exit(3);}
const [sequence, firstAuth, firstMember] = await Promise.all([
  db.doc("system/membership").get(),
  auth.listUsers(1),
  db.collection("members").limit(1).get()
]);
if(!sequence.exists){
  if(firstAuth.users.length||!firstMember.empty) {
    stop("Auth users or member documents exist without the membership sequence. Do not reset DI numbers.");
  }
  console.log("OWNER_STATE=empty");
  process.exit(2);
}
const uid=sequence.get("ownerUid"),last=sequence.get("lastNumber");
if(typeof uid!=="string"||!uid||!Number.isSafeInteger(last)||last<1) {
  stop("Sequence is missing a valid owner UID or last issued member number.");
}
const ownerProfile=await db.doc("members/"+uid).get();
if(!ownerProfile.exists || ownerProfile.get("role")!=="owner" ||
   ownerProfile.get("serial")!=="DI-1" || ownerProfile.get("memberNumber")!==1) {
  stop("The first member profile is missing or no longer matches DI-1.");
}
let firebaseUser;
try {firebaseUser=await auth.getUser(uid);}
catch {stop("The owner's Firebase Authentication account is missing.");}
if(firebaseUser.disabled || firebaseUser.customClaims?.owner!==true) {
  stop("The owner is disabled or their server-side admin claim is missing.");
}
console.log("OWNER_STATE=ready");
console.log("Existing DI-1 owner is verified. The next member number will follow the stored sequence.");
