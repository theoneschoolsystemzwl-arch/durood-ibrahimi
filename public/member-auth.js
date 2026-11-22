// Spark-plan member interface: Firebase Authentication + validated Firestore writes.
// DI member serials are profile metadata, never login credentials.
import {auth,db} from "./firebase-client.js";
import {signInWithEmailAndPassword,signOut,onAuthStateChanged,getIdTokenResult} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  aliasEmail,registerSpark,invitationSpark,memberActiveSpark,profileNameSpark
} from "./spark-data.js";

// Pinned Firebase Authentication UID for the existing Master Owner.
// A DI number is never a login credential, and an email string never grants roles.
const TRUSTED_OWNER_UID="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const DELETED_TEST_OWNER_UID="ecrykLlmTAbV90llOdQVRSX4OyE3";

async function restoreTrustedOwnerProfile(user){
  // An Auth password alone never grants ownership: the immutable Firebase UID
  // must match the known Owner identity, or have a trusted Admin-issued claim.
  const trusted=user.uid===TRUSTED_OWNER_UID ||
    (await getIdTokenResult(user)).claims.owner===true;
  if(!trusted)return;

  const memberRef=doc(db,"members",user.uid);
  const sequenceRef=doc(db,"system","membership");
  await runTransaction(db,async tx=>{
    const [member,sequence]=await Promise.all([tx.get(memberRef),tx.get(sequenceRef)]);
    if(member.exists())return;
    const seq=sequence.exists()?sequence.data():null;
    if(seq && (
      !Number.isSafeInteger(seq.lastNumber) || seq.lastNumber<1 ||
      ![user.uid,DELETED_TEST_OWNER_UID].includes(seq.ownerUid)
    )){
      const err=new Error("Existing member sequence is owned by an unexpected account or is invalid; nothing was changed.");
      err.loginStage="owner-sequence-conflict";
      throw err;
    }
    const name=String(user.displayName||"Owner").trim().slice(0,60)||"Owner";
    // Preserve the last issued member number: never reuse a DI serial.
    if(!sequence.exists()){
      tx.set(sequenceRef,{
        ownerUid:user.uid,lastNumber:1,updatedAt:serverTimestamp()
      });
    }else if(seq.ownerUid===DELETED_TEST_OWNER_UID && user.uid===TRUSTED_OWNER_UID){
      // The old deleted test Owner held the sequence. Transfer it to the
      // currently authenticated Owner in the same transaction as their profile.
      // Firestore rules additionally require the old member document be absent.
      tx.update(sequenceRef,{ownerUid:user.uid,updatedAt:serverTimestamp()});
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
