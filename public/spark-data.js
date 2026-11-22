// Spark-plan data layer: Firebase Auth + Firestore, no Cloud Functions or billing.
// Production access decisions are enforced by firestore.rules, NOT this client.
import {auth,db} from "./firebase-client.js";
import {createUserWithEmailAndPassword,deleteUser} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  doc,collection,query,where,orderBy,limit,getDoc,getDocs,setDoc,updateDoc,runTransaction,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const PROJECT="durood-e-ibrahimi-global-c74e0";
const usernamePattern=/^[\p{L}\p{M}\p{N}._-]{1,60}$/u;
const invitePattern=/^[a-z0-9]{6}$/;
const prayers=["fajr","dhuhr","asr","maghrib","isha"];
const modes=new Set(["jamat","solo","made","missed","clear"]);
const normalize=value=>String(value||"").trim().toLowerCase();
const memberRef=uid=>doc(db,"members",uid);
function requireUser(){
  if(!auth.currentUser)throw Error("پہلے اپنے اکاؤنٹ میں لاگ اِن کریں۔");
  return auth.currentUser.uid;
}
export function generatedUsername(name){
  const base=Array.from(String(name||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,"")).slice(0,48).join("");
  return ["owner","sherazanjum"].includes(base)?base+"2":base;
}
export async function aliasEmail(username){
  const id=normalize(username).normalize("NFKC");
  if(!usernamePattern.test(id)||/^di-\d+$/i.test(id))throw Error("درست لاگ اِن آئی ڈی لکھیں۔");
  let key=id;
  if(!/^[a-z0-9._-]+$/.test(id)){
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id));
    key="u~"+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("").slice(0,56);
  }
  return key+"@"+PROJECT+".firebaseapp.com";
}
export async function registerSpark({name,password,inviteCode,pledgeAccepted}){
  const fullName=String(name||"").trim(),invite=normalize(inviteCode);
  const base=generatedUsername(fullName);
  if(!base)throw Error("اپنا نام حروف میں لکھیں۔");
  if(fullName.length<2||fullName.length>60||password.length<8||password.length>128||
     !invitePattern.test(invite)||pledgeAccepted!==true){
    throw Error("رجسٹریشن کے نام، دعوتی کوڈ، حلف یا پاس ورڈ میں غلطی ہے۔");
  }
  let clean=base,credential;
  for(let attempt=1;attempt<=100;attempt++){
    if(attempt>1)clean=base+(attempt<=10?attempt:crypto.getRandomValues(new Uint32Array(1))[0].toString(36));
    try{
      credential=await createUserWithEmailAndPassword(auth,await aliasEmail(clean),password);
      break;
    }catch(err){if(err.code!=="auth/email-already-in-use")throw err;}
  }
  if(!credential)throw Error("لاگ اِن آئی ڈی نہیں بن سکی۔ دوبارہ کوشش کریں۔");
  const uid=credential.user.uid;
  try{
    const profile=await runTransaction(db,async tx=>{
      const sequence=doc(db,"system","membership");
      const invitation=doc(db,"invitations",invite);
      const usernameDoc=doc(db,"usernames",clean);
      const currentUser=memberRef(uid);
      const [seq,inv,existing,already]=await Promise.all([
        tx.get(sequence),tx.get(invitation),tx.get(usernameDoc),tx.get(currentUser)
      ]);
      if(!seq.exists()||!Number.isSafeInteger(seq.data().lastNumber) || seq.data().lastNumber<1){
        throw Error("Owner اکاؤنٹ ابھی قائم نہیں ہوا۔");
      }
      if(existing.exists()||already.exists())throw Error("یہ Username پہلے سے استعمال ہو رہا ہے۔");
      if(!inv.exists()||inv.data().used===true||inv.data().revoked===true){
        throw Error("دعوتی کوڈ غلط یا پہلے استعمال ہو چکا ہے۔");
      }
      const inviterUid=inv.data().byUid;
      if(typeof inviterUid!=="string"||!inviterUid)throw Error("دعوتی کوڈ کا مالک درست نہیں۔");
      const n=seq.data().lastNumber+1;
      if(!Number.isSafeInteger(n))throw Error("ممبر نمبر کی حد مکمل ہو گئی ہے۔");
      const serial="DI-"+n;
      tx.update(sequence,{lastNumber:n,lastMemberUid:uid,updatedAt:serverTimestamp()});
      tx.update(invitation,{used:true,usedByUid:uid,usedAt:serverTimestamp()});
      tx.set(usernameDoc,{uid,createdAt:serverTimestamp()});
      tx.set(currentUser,{
        uid,username:clean,name:fullName,role:"member",memberNumber:n,serial,
        inviterUid,inviteCode:invite,disabled:false,
        pledgeAcceptedAt:serverTimestamp(),createdAt:serverTimestamp()
      });
      return {uid,serial,memberNumber:n,username:clean,name:fullName};
    });
    return profile;
  }catch(error){
    // A newly-created Auth identity has no permissions until its member record exists.
    await deleteUser(credential.user).catch(()=>{});
    throw error;
  }
}
export async function invitationSpark(){
  const uid=requireUser(),chars="abcdefghijklmnopqrstuvwxyz0123456789";
  const buf=new Uint8Array(6);
  for(let attempt=0;attempt<8;attempt++){
    crypto.getRandomValues(buf);
    const code=Array.from(buf,v=>chars[v%chars.length]).join("");
    try{
      await setDoc(doc(db,"invitations",code),{
        byUid:uid,createdAt:serverTimestamp(),used:false,revoked:false
      });
      return code;
    }catch(err){
      if(err?.code!=="permission-denied" && err?.code!=="already-exists")throw err;
      // A collision is extraordinarily unlikely. Retry; a permission failure repeats.
      if(attempt>=2)throw err;
    }
  }
  throw Error("دعوتی کوڈ نہیں بن سکا۔");
}
export async function memberActiveSpark(uid,active){
  requireUser();
  if(typeof uid!=="string"||typeof active!=="boolean")throw Error("غلط درخواست۔");
  await updateDoc(memberRef(uid),{disabled:!active,updatedAt:serverTimestamp()});
}
export async function profileNameSpark(name){
  const uid=requireUser(),clean=String(name||"").trim();
  if(clean.length<2||clean.length>60)throw Error("نام 2 تا 60 حروف میں لکھیں۔");
  await updateDoc(memberRef(uid),{name:clean,updatedAt:serverTimestamp()});
}
export async function readingsSpark(amount){
  const uid=requireUser();
  if(!Number.isSafeInteger(amount)||amount<1||amount>10000)throw Error("1 سے 10000 تک مکمل عدد درج کریں۔");
  await runTransaction(db,async tx=>{
    const personal=doc(db,"memberCounts",uid);
    const global=doc(db,"publicStats","global");
    const [p,g]=await Promise.all([tx.get(personal),tx.get(global)]);
    const ownTotal=p.exists()?p.data().total||0:0;
    const globalTotal=g.exists()?g.data().totalRecitations||0:0;
    if(!Number.isSafeInteger(ownTotal)||!Number.isSafeInteger(globalTotal))throw Error("شمار کا ڈیٹا درست نہیں۔");
    tx.set(personal,{memberUid:uid,total:ownTotal+amount,lastEntryAmount:amount,updatedAt:serverTimestamp()});
    tx.set(global,{totalRecitations:globalTotal+amount,lastEntryAmount:amount,lastEntryUid:uid,updatedAt:serverTimestamp()});
  });
  return {recorded:amount};
}
export async function prayerSaveSpark(date,statuses){
  const uid=requireUser();
  if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof statuses!=="object"||!statuses){
    throw Error("نماز کی تاریخ یا تفصیل درست نہیں۔");
  }
  if(Object.keys(statuses).some(k=>!prayers.includes(k)) ||
     Object.values(statuses).some(v=>!modes.has(v)))throw Error("نماز کی حیثیت درست نہیں۔");
  await setDoc(doc(db,"memberPrivate",uid,"prayers",date),{date,statuses,updatedAt:serverTimestamp()});
  return {date,statuses};
}
export async function prayerMonthSpark(month){
  const uid=requireUser();
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error("مہینہ درست نہیں۔");
  const result=await getDocs(query(collection(db,"memberPrivate",uid,"prayers"),where("date",">=",month+"-01"),where("date","<=",month+"-31"),limit(31)));
  return {days:result.docs.map(d=>d.data())};
}
export async function rankingSpark(){
  requireUser();
  const ranked=await getDocs(query(collection(db,"memberCounts"),orderBy("total","desc"),limit(10)));
  const profiles=await Promise.all(ranked.docs.map(d=>getDoc(memberRef(d.id))));
  return {leaders:ranked.docs.flatMap((item,i)=>{
    const profile=profiles[i];
    if(!profile.exists()||profile.data().disabled===true)return [];
    return [{name:profile.data().name||"Member",serial:profile.data().serial,total:item.data().total||0}];
  })};
}
export async function referralsSpark(){
  const uid=requireUser();
  const rows=await getDocs(query(collection(db,"members"),where("inviterUid","==",uid),limit(200)));
  return {referrals:rows.docs.map(d=>({
    name:d.data().name,serial:d.data().serial,disabled:d.data().disabled===true
  }))};
}
export async function communitySpark(){
  requireUser();
  const [counter,total]=await Promise.all([
    getDoc(doc(db,"system","membership")),getDoc(doc(db,"publicStats","global"))
  ]);
  return {totalAccounts:counter.exists()?counter.data().lastNumber||0:0,
    totalRecitations:total.exists()?total.data().totalRecitations||0:0};
}
