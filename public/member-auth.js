// Spark-plan member interface: Firebase Authentication + validated Firestore writes.
// DI member serials are profile metadata, never login credentials.
import {auth,db} from "./firebase-client.js";
import {signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  aliasEmail,registerSpark,invitationSpark,memberActiveSpark,profileNameSpark
} from "./spark-data.js";

// Existing, trusted owner UID from the legacy production authorization rule.
// Never grant owner permissions just because somebody entered a particular email.
const TRUSTED_LEGACY_OWNER_UID="ecrykLlmTAbV90llOdQVRSX4OyE3";

async function restoreTrustedOwnerProfile(user){
  // Only the known owner identity (or a Firebase Admin-issued owner claim) can
  // recover an absent owner profile. No public user can assign themselves DI-1.
  const trusted=user.uid===TRUSTED_LEGACY_OWNER_UID ||
    (await user.getIdTokenResult()).claims.owner===true;
  if(!trusted)return;

  const memberRef=doc(db,"members",user.uid);
  const sequenceRef=doc(db,"system","membership");
  await runTransaction(db,async tx=>{
    const [member,sequence]=await Promise.all([tx.get(memberRef),tx.get(sequenceRef)]);
    if(member.exists())return;
    if(sequence.exists()&&(
      sequence.data().ownerUid!==user.uid ||
      !Number.isSafeInteger(sequence.data().lastNumber) ||
      sequence.data().lastNumber<1
    )){
      const err=new Error("Existing member sequence is owned by another account or is invalid. It has not been changed.");
      err.loginStage="owner-sequence-conflict";
      throw err;
    }
    const name=String(user.displayName||"Owner").trim().slice(0,60)||"Owner";
    if(!sequence.exists()){
      // The first owner is DI-1; each subsequent registration advances the
      // sequence atomically. Existing sequences are NEVER reset here.
      tx.set(sequenceRef,{
        ownerUid:user.uid,lastNumber:1,updatedAt:serverTimestamp()
      });
    }
    tx.set(memberRef,{
      uid:user.uid,username:"owner",name,role:"owner",memberNumber:1,
      serial:"DI-1",disabled:false,inviterUid:null,createdAt:serverTimestamp()
    });
  });
}

export async function loadMemberProfile(user){
  const ref=doc(db,"members",user.uid);
  let member=await getDoc(ref);
  if(!member.exists()){
    await restoreTrustedOwnerProfile(user);
    member=await getDoc(ref);
  }
  if(!member.exists()||member.data().disabled===true){
    const failure=new Error(member.exists()
      ?"Firebase پاس ورڈ قبول کر چکا ہے، مگر یہ ممبر اکاؤنٹ غیر فعال ہے۔"
      :"Firebase پاس ورڈ قبول کر چکا ہے، مگر Firestore میں اس اکاؤنٹ کا پروفائل نہیں ہے۔");
    failure.loginStage="missing-member-profile";
    throw failure;
  }
  return {uid:user.uid,...member.data()};
}

export async function login(usernameOrEmail,password){
  const entered=String(usernameOrEmail||"").trim();
  // Email/password authenticates owners. Normal members may also enter a
  // username converted into a Firebase Auth email alias; DI numbers are not IDs.
  const email=entered.includes("@")?entered.toLowerCase():aliasEmail(entered);
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw Error("Enter a valid Username or full Email address.");
  }
  let credential;
  try {
    credential=await signInWithEmailAndPassword(auth,email,password);
  } catch(error) {
    error.loginStage="firebase-auth";
    throw error;
  }
  try {
    return await loadMemberProfile(credential.user);
  } catch(error) {
    if(!error.loginStage)error.loginStage="firestore-profile";
    // Do not leave an authenticated but profile-less session behind.
    await signOut(auth).catch(()=>{});
    throw error;
  }
}
export async function register(data){return registerSpark(data);}
export async function createInvitation(){return invitationSpark();}
export async function setMemberActive(uid,active){return memberActiveSpark(uid,active);}
export async function updateMyProfile(name){return profileNameSpark(name);}
export {signOut,onAuthStateChanged,auth};
