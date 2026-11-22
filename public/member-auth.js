// Spark-plan member interface: Firebase Authentication + validated Firestore writes.
// DI member serials are profile metadata, never login credentials.
import {auth,db} from "./firebase-client.js";
import {signInWithEmailAndPassword,signOut as firebaseSignOut,onAuthStateChanged,getIdTokenResult,setPersistence,browserLocalPersistence,browserSessionPersistence} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  aliasEmail,registerSpark,invitationSpark,memberActiveSpark,profileNameSpark
} from "./spark-data.js";

// Pinned Firebase Authentication UID for the existing Master Owner.
// A DI number is never a login credential, and an email string never grants roles.
const TRUSTED_OWNER_UID="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const DELETED_TEST_OWNER_UID="ecrykLlmTAbV90llOdQVRSX4OyE3";

// Device ID helps the UI distinguish browsers. Security rules also bind the
// lease to Firebase's signed auth_time: a client-selected ID alone is unsafe.
const DEVICE_KEY="durood-device-id-v1";
let inMemoryDeviceId=null;

function sessionId(){
  if(inMemoryDeviceId)return inMemoryDeviceId;
  try{
    const stored=localStorage.getItem(DEVICE_KEY);
    if(stored && /^[a-z0-9-]{16,128}$/i.test(stored))return (inMemoryDeviceId=stored);
  }catch{}
  inMemoryDeviceId=crypto.randomUUID();
  try{localStorage.setItem(DEVICE_KEY,inMemoryDeviceId);}catch{}
  return inMemoryDeviceId;
}
async function authTime(user){
  const token=await getIdTokenResult(user);
  const timestamp=Number(token.claims.auth_time);
  if(!Number.isSafeInteger(timestamp)||timestamp<=0){
    throw Error("Firebase session identity is unavailable.");
  }
  return timestamp;
}
function isOwner(profile){return profile?.role==="owner";}

// Called only after Firebase Auth accepts the password and member profile.
export async function claimDeviceSession(user,profile){
  if(isOwner(profile))return;
  const [timestamp,id]=await Promise.all([authTime(user),Promise.resolve(sessionId())]);
  const ref=doc(db,"activeLogins",user.uid);
  await runTransaction(db,async tx=>{
    const old=await tx.get(ref);
    if(old.exists()){
      if(old.data().sessionId === id &&
         old.data().authTime === timestamp)return;
      // The first active login ALWAYS wins. A second login never forces out
      // the original session, even if the password is correct.
      const error=new Error("User already logged in");
      error.code="member/already-online";
      throw error;
    }
    tx.set(ref,{authTime:timestamp,sessionId:id,claimedAt:serverTimestamp()});
  });
}
export async function signOut(currentAuth=auth){
  const user=currentAuth.currentUser;
  if(user){
    try{
      const [timestamp,id]=await Promise.all([authTime(user),Promise.resolve(sessionId())]);
      const ref=doc(db,"activeLogins",user.uid);
      await runTransaction(db,async tx=>{
        const old=await tx.get(ref);
        if(old.exists() && old.data().authTime===timestamp && old.data().sessionId===id)tx.delete(ref);
      });
    }catch(error){
      if(error?.code==="unavailable"||error?.code==="firestore/unavailable"){
        // Do not abandon the only active lease when the network is offline.
        throw Error("انٹرنیٹ دستیاب نہیں۔ لاگ آؤٹ کے لیے دوبارہ کوشش کریں۔");
      }
      console.warn("Session cleanup not needed:",error.code||error);
    }
  }
  return firebaseSignOut(currentAuth);
}


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
  rememberOwnerEmail(user);
  return {uid:user.uid,...member.data()};
}

const OWNER_LOGIN="sherazanjum";
const OWNER_EMAIL_KEY="durood-owner-login-email-v1";

function knownOwnerEmail(){
  try{return sessionStorage.getItem(OWNER_EMAIL_KEY)||localStorage.getItem(OWNER_EMAIL_KEY);}catch{return null;}
}
function rememberOwnerEmail(user,persist){
  if(user?.uid!==TRUSTED_OWNER_UID || !user.email)return;
  try{
    sessionStorage.setItem(OWNER_EMAIL_KEY,user.email);
    if(persist===true)localStorage.setItem(OWNER_EMAIL_KEY,user.email);
    if(persist===false)localStorage.removeItem(OWNER_EMAIL_KEY);
  }catch{}
}

export async function login(usernameOrEmail,password,{remember=true}={}){
  const entered=String(usernameOrEmail||"").trim();
  // Email/password authenticates owners. Normal members may also enter a
  // username converted into a Firebase Auth email alias; DI numbers are not IDs.
  const ownerLogin=entered.toLowerCase()===OWNER_LOGIN;
  const email=ownerLogin?knownOwnerEmail():(entered.includes("@")?entered.toLowerCase():await aliasEmail(entered));
  if(ownerLogin && !email)throw Error("اس ڈیوائس پر پہلی مرتبہ اپنی مالک والی ای میل اور پاس ورڈ سے لاگ اِن کریں۔ پھر sherazanjum استعمال کر سکتے ہیں۔");
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw Error("Enter a valid Username or full Email address.");
  }
  let credential;
  try {
    await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence);
    credential=await signInWithEmailAndPassword(auth,email,password);
    if(ownerLogin && credential.user.uid!==TRUSTED_OWNER_UID){
      await firebaseSignOut(auth);
      throw Error("مالک کی موجودہ ای میل سے دوبارہ لاگ اِن کریں۔");
    }
    rememberOwnerEmail(credential.user,remember);
  } catch(error) {
    error.loginStage="firebase-auth";
    throw error;
  }
  try {
    const profile=await loadMemberProfile(credential.user);
    await claimDeviceSession(credential.user,profile);
    return profile;
  } catch(error) {
    if(!error.loginStage)error.loginStage="firestore-profile";
    // Keep a valid credential while the profile service is unavailable.
    if(error.loginStage!=="firestore-profile" || ["permission-denied","firestore/permission-denied","unauthenticated","firestore/unauthenticated"].includes(error.code)){
      if(auth.currentUser?.uid===credential.user.uid)await firebaseSignOut(auth);
    }
    throw error;
  }
}
export async function register(data){return registerSpark(data);}
export async function createInvitation(){return invitationSpark();}
export async function setMemberActive(uid,active){return memberActiveSpark(uid,active);}
export async function updateMyProfile(name){return profileNameSpark(name);}
export {onAuthStateChanged,auth};
