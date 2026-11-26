// Spark-plan member interface: Firebase Authentication + validated Firestore writes.
// DI member serials are profile metadata, never login credentials.
import {auth,db} from "./firebase-client.js";
import {signInWithEmailAndPassword,signOut as firebaseSignOut,onAuthStateChanged,getIdTokenResult,setPersistence,browserLocalPersistence,browserSessionPersistence} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,getDocFromServer,onSnapshot,runTransaction,serverTimestamp,deleteDoc} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  aliasEmail,registerSpark,invitationSpark,memberActiveSpark,profileNameSpark
} from "./spark-data.js?release=fast-login-reader-v4";

// Pinned Firebase Authentication UID for the existing Master Owner.
// A DI number is never a login credential, and an email string never grants roles.
const TRUSTED_OWNER_UID="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const DELETED_TEST_OWNER_UID="ecrykLlmTAbV90llOdQVRSX4OyE3";

// Device ID helps the UI distinguish browsers. Security rules also bind the
// lease to Firebase's signed auth_time: a client-selected ID alone is unsafe.
const DEVICE_KEY="durood-device-id-v1";
let inMemoryDeviceId=null;

export function sessionId(){
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

// Preserve the signed Firebase authentication time independently of the active lease.
async function rememberLastLogin(user,timestamp){
  try{
    const ref=doc(db,"memberLastLogins",user.uid);
    await runTransaction(db,async tx=>{
      const old=await tx.get(ref);
      if(!old.exists() || Number(old.data().authTime)<timestamp)
        tx.set(ref,{authTime:timestamp});
    });
  }catch(error){console.warn("Last login record unavailable",error?.code||error);}
}
// Fresh credentials may replace an older lease; restoration never takes over.
function replacedSession(code="member/session-replaced"){
 const error=new Error("Session no longer current");error.code=code;return error;
}
export async function claimDeviceSession(user,profile,{fresh=false}={}){
 const timestamp=await authTime(user);
 if(isOwner(profile)){void rememberLastLogin(user,timestamp);return;}
 const id=sessionId(),ref=doc(db,"activeLogins",user.uid);
 const same=old=>old.exists()&&old.data().sessionId===id&&old.data().authTime===timestamp;
 if(!fresh){
  const old=await getDocFromServer(ref);
  if(!same(old))throw replacedSession();
  return;
 }
 await runTransaction(db,async tx=>{
  const old=await tx.get(ref);
  if(same(old))return;
  if(old.exists()&&old.data().authTime>=timestamp)
    throw replacedSession(old.data().authTime===timestamp?"member/same-second":"member/session-replaced");
  const history=await tx.get(doc(db,"memberLastLogins",user.uid));
  if(history.exists()&&Number(history.data().authTime)>=timestamp)
    throw replacedSession(Number(history.data().authTime)===timestamp?"member/same-second":"member/session-replaced");
  tx.set(ref,{authTime:timestamp,sessionId:id,claimedAt:serverTimestamp()});
 });
 await rememberLastLogin(user,timestamp);
}
export function watchDeviceSession(user,profile,onReplaced){
 if(isOwner(profile))return ()=>{};
 let stopped=false,unsubscribe=()=>{};
 const id=sessionId();
 void authTime(user).then(timestamp=>{
  if(stopped||auth.currentUser?.uid!==user.uid)return;
  unsubscribe=onSnapshot(doc(db,"activeLogins",user.uid),{includeMetadataChanges:true},snap=>{
   if(stopped||auth.currentUser?.uid!==user.uid||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
   if(!snap.exists()||snap.data().authTime!==timestamp||snap.data().sessionId!==id){
    stopped=true;unsubscribe();onReplaced();
   }
  },error=>console.warn("Device session watch unavailable",error?.code||error));
 }).catch(error=>console.warn("Device session identity unavailable",error?.code||error));
 return ()=>{stopped=true;unsubscribe();};
}
export async function signOut(currentAuth=auth){
  const user=currentAuth.currentUser;
  if(user){
    try{
      const [timestamp,id]=await Promise.all([authTime(user),Promise.resolve(sessionId())]);
      try{await deleteDoc(doc(db,"memberPresence",user.uid+"_"+id));}catch(error){console.warn("Presence logout cleanup",error?.code||error);}
      const ref=doc(db,"activeLogins",user.uid);
      await rememberLastLogin(user,timestamp);
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
    try{await claimDeviceSession(credential.user,profile,{fresh:true});}
    catch(error){
      if(error.code!=="member/same-second")throw error;
      await new Promise(resolve=>setTimeout(resolve,1200));
      credential=await signInWithEmailAndPassword(auth,email,password);
      await claimDeviceSession(credential.user,profile,{fresh:true});
    }
    return profile;
  } catch(error) {
    if(!error.loginStage)error.loginStage="firestore-profile";
    // Keep a valid credential while the profile service is unavailable.
    if(error.loginStage==="missing-member-profile" || ["member/session-replaced","member/same-second"].includes(error.code)){
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
