// Spark-plan data layer: Firebase Auth + Firestore, no Cloud Functions or billing.
// Production access decisions are enforced by firestore.rules, NOT this client.
import {auth,db} from "./firebase-client.js";
import {addGroupCountsToTransaction} from "./wazaif-counter.js?v=group-periods-20261124-v2";
import {createUserWithEmailAndPassword,deleteUser} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  doc,collection,query,where,orderBy,limit,getDoc,getDocs,setDoc,updateDoc,runTransaction,serverTimestamp,addDoc,deleteDoc,increment
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const PROJECT="durood-e-ibrahimi-global-c74e0";
const usernamePattern=/^[\p{L}\p{M}\p{N}._-]{1,60}$/u;
const invitePattern=/^[a-z0-9]{6}$/;
const prayers=["fajr","dhuhr","asr","maghrib","isha"];
const modes=new Set(["jamat","solo","made","missed","clear"]);
const normalize=value=>String(value||"").trim().toLowerCase();
const memberGender=profile=>profile?.gender==="female"?"female":"male";
const isGender=gender=>gender==="male"||gender==="female";
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
export async function registerSpark({name,password,inviteCode,gender,pledgeAccepted}){
  const fullName=String(name||"").trim(),invite=normalize(inviteCode);
  const base=generatedUsername(fullName);
  if(!base)throw Error("اپنا نام حروف میں لکھیں۔");
  if(fullName.length<2||fullName.length>60||password.length<8||password.length>128||
     !invitePattern.test(invite)||!isGender(gender)||pledgeAccepted!==true){
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
      const sideMembers=doc(db,"genderMembers",gender);
      const [seq,inv,existing,already,side]=await Promise.all([
        tx.get(sequence),tx.get(invitation),tx.get(usernameDoc),tx.get(currentUser),
        gender==="female" ? tx.get(sideMembers) : null
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
      // New registrants cannot read another member's private profile.
      // Firestore Rules validate the inviter's identity, active status and
      // gender atomically; the client only checks the code's declared scope.
      const ownerInvite=inviterUid===seq.data().ownerUid;
      const invitedGender=inv.data().gender||(ownerInvite?"any":"male");
      if(invitedGender!==gender && !(ownerInvite&&invitedGender==="any")){
        throw Error("یہ دعوتی کوڈ منتخب Gender کے لیے نہیں ہے۔");
      }
      const n=seq.data().lastNumber+1;
      if(!Number.isSafeInteger(n))throw Error("ممبر نمبر کی حد مکمل ہو گئی ہے۔");
      const sideNumber=side ? (side.exists() ? side.data().totalMembers : 0)+1 : null;
      if(side && (!Number.isSafeInteger(sideNumber)||sideNumber<1)){
        throw Error("خواتین کا ممبر نمبر مقرر نہیں ہو سکا۔");
      }
      const sideFields=side ? {sideNumber} : {};
      const serial="DI-"+n;
      tx.update(sequence,{lastNumber:n,lastMemberUid:uid,updatedAt:serverTimestamp()});
      tx.update(invitation,{used:true,usedByUid:uid,usedAt:serverTimestamp()});
      tx.set(usernameDoc,{uid,createdAt:serverTimestamp()});
      tx.set(sideMembers,{gender,totalMembers:increment(1),
        updatedAt:serverTimestamp()},{merge:true});
      tx.set(currentUser,{
        uid,username:clean,name:fullName,role:"member",gender,memberNumber:n,serial,...sideFields,
        inviterUid,inviteCode:invite,disabled:false,
        pledgeAcceptedAt:serverTimestamp(),createdAt:serverTimestamp()
      });
      return {uid,serial,memberNumber:n,username:clean,name:fullName,gender,...sideFields};
    });
    return profile;
  }catch(error){
    // A newly-created Auth identity has no permissions until its member record exists.
    await deleteUser(credential.user).catch(()=>{});
    throw error;
  }
}
export async function invitationSpark(){
  const uid=requireUser(),letters="abcdefghijklmnopqrstuvwxyz";
  const profile=await getDoc(memberRef(uid));
  if(!profile.exists()||profile.data().disabled===true)throw Error("اکاؤنٹ فعال نہیں ہے۔");
  const gender=profile.data().role==="owner"?"any":memberGender(profile.data());
  const buf=new Uint8Array(6);
  for(let attempt=0;attempt<8;attempt++){
    crypto.getRandomValues(buf);
    const digits=Array.from(buf.subarray(0,3),v=>String(v%10)).join("");
    const suffix=Array.from(buf.subarray(3),v=>letters[v%letters.length]).join("");
    const code=digits+suffix;
    try{
      await setDoc(doc(db,"invitations",code),{
        byUid:uid,gender,createdAt:serverTimestamp(),used:false,revoked:false
      });
      return code.toUpperCase();
    }catch(err){
      if(err?.code!=="permission-denied" && err?.code!=="already-exists")throw err;
      // Existing invitations cannot be overwritten. Retry with a different code.
      if(attempt>=2)throw err;
    }
  }
  throw Error("دعوتی کوڈ نہیں بن سکا۔");
}
// Owner-authorized recovery when the original member phone is lost or broken.
// This never runs during a second login; the Owner must explicitly approve it.
export async function resetMemberSessionSpark(uid){
  const ownerUid=requireUser();
  if(typeof uid!=="string"||!uid||uid===ownerUid)
    throw Error("ممبر کا اکاؤنٹ منتخب کریں۔");
  const [issuer,target]=await Promise.all([
    getDoc(memberRef(ownerUid)),getDoc(memberRef(uid))
  ]);
  if(!issuer.exists()||issuer.data().role!=="owner"||!target.exists()||
     target.data().role==="owner"){
    throw Error("صرف Owner ممبر کا لاگ اِن ری سیٹ کر سکتا ہے۔");
  }
  // Security Rules independently enforce Owner identity and target UID.
  await deleteDoc(doc(db,"activeLogins",uid));
}
export async function memberActiveSpark(uid,active){
  requireUser();
  if(typeof uid!=="string"||typeof active!=="boolean")throw Error("غلط درخواست۔");
  await updateDoc(memberRef(uid),{
    disabled:!active,...(active?{deleted:false}:{}),updatedAt:serverTimestamp()
  });
}
// Reversible removal: keep Auth ID, DI serial, prayer and recitation history.
export async function memberDeleteSpark(uid){
  requireUser();
  if(typeof uid!=="string"||!uid)throw Error("ممبر درست نہیں۔");
  await updateDoc(memberRef(uid),{
    disabled:true,deleted:true,updatedAt:serverTimestamp()
  });
}
export async function classifyLegacyMemberSpark(uid,gender){
  requireUser();
  if(typeof uid!=="string"||!uid||!isGender(gender))throw Error("ممبر یا Gender غلط ہے۔");
  const ref=memberRef(uid);
  const snap=await getDoc(ref);
  if(!snap.exists()||isGender(snap.data().gender)){
    throw Error("اس ممبر کی Gender پہلے سے مقرر ہے۔");
  }
  await updateDoc(ref,{gender,updatedAt:serverTimestamp()});
}
export async function profileNameSpark(name){
  const uid=requireUser(),clean=String(name||"").trim();
  if(clean.length<2||clean.length>60)throw Error("نام 2 تا 60 حروف میں لکھیں۔");
  await updateDoc(memberRef(uid),{name:clean,updatedAt:serverTimestamp()});
}
export function localReadingDate(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export async function readingsSpark(amount,day=localReadingDate(),tasbih=false,groupWazifa=false,syncId=null){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<"1900-01-01"||day>localReadingDate()||
    localReadingDate(new Date(day+"T12:00:00"))!==day)throw Error("درست تاریخ منتخب کریں۔");
  const uid=requireUser();
  if(!Number.isSafeInteger(amount)||amount<1||amount>10000)throw Error("1 سے 10000 تک مکمل عدد درج کریں۔");
  if(syncId!==null&&(!/^[a-f0-9]{32}$/.test(syncId)||!tasbih||amount>1000))
    throw Error("غلط تسبیح سنک شناخت۔");
  const receipt=syncId?doc(db,"memberWazaif",uid,"syncReceipts",syncId):null;
  await runTransaction(db,async tx=>{
    if(receipt && (await tx.get(receipt)).exists())return;
    const personal=doc(db,"memberCounts",uid);
    const global=doc(db,"publicStats","global");
    const profileRef=memberRef(uid);
    const [p,profile]=await Promise.all([
      tx.get(personal),tx.get(profileRef)
    ]);
    if(!profile.exists()||profile.data().disabled===true||profile.data().deleted===true){
      throw Error("اکاؤنٹ فعال نہیں ہے۔");
    }
    const gender=memberGender(profile.data());
    const sideRef=doc(db,"genderStats",gender);
    const sideSnap=await tx.get(sideRef);
    const ownTotal=p.exists()?p.data().total||0:0;
    const sideTotal=sideSnap.exists()?sideSnap.data().totalRecitations||0:0;
    if(!Number.isSafeInteger(sideTotal)||sideTotal<0)throw Error("Gender totals invalid.");
    if(!Number.isSafeInteger(ownTotal)||ownTotal<0)throw Error("شمار کا ڈیٹا درست نہیں۔");
    // A group Durood tap saves the original Durood total AND its group
    // accounting in one transaction: no double-count or partial success.
    if(groupWazifa){
      if(!tasbih)throw Error("گروپ وظیفے کے لیے تسبیح ضروری ہے۔");
      await addGroupCountsToTransaction(tx,uid,amount,day,{durood:true});
    }
    tx.set(personal,{memberUid:uid,gender,total:ownTotal+amount,lastEntryAmount:amount,updatedAt:serverTimestamp()});
    // Blind atomic increment: users cannot read the cross-gender legacy aggregate.
    tx.set(global,{totalRecitations:increment(amount),lastEntryAmount:amount,
      lastEntryUid:uid,updatedAt:serverTimestamp()},{merge:true});
    tx.set(sideRef,{
      gender,totalRecitations:sideTotal+amount,lastEntryAmount:amount,lastEntryDay:day,
      lastEntryUid:uid,updatedAt:serverTimestamp()
    });
    // Keep manual and tasbih counts distinct. Both appear in today's reader list.
    const reader=doc(sideRef,"days",day,"readers",uid);
    if(tasbih){
      tx.set(reader,{name:profile.data().name,total:increment(amount),lastTap:serverTimestamp(),seen:serverTimestamp()},{merge:true});
    }else{
      tx.set(reader,{name:profile.data().name,total:increment(0),manualTotal:increment(amount),lastManual:serverTimestamp(),seen:serverTimestamp()},{merge:true});
    }
    tx.set(doc(sideRef,"days",day),{day,total:increment(amount),updatedAt:serverTimestamp()},{merge:true});
    if(receipt)tx.set(receipt,{uid,kind:"durood",taskId:"_durood_",day,amount,
      source:"tasbih",createdAt:serverTimestamp()});
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
// Read all of this member's historical prayer days, not only the currently viewed month.
export async function prayerHistorySpark(){
  const uid=requireUser();
  const result=await getDocs(collection(db,"memberPrivate",uid,"prayers"));
  if(auth.currentUser?.uid!==uid)throw Error("نماز کا اکاؤنٹ تبدیل ہوگیا۔");
  return {days:result.docs.map(d=>d.data())};
}
export async function rankingSpark(){
  const uid=requireUser();
  const member=await getDoc(memberRef(uid));
  if(!member.exists()||member.data().disabled===true)throw Error("اکاؤنٹ فعال نہیں۔");
  const gender=memberGender(member.data());
  // Never list other gender's count documents. No composite index required.
  const ranked=await getDocs(query(collection(db,"memberCounts"),where("gender","==",gender),limit(200)));
  const top=[...ranked.docs].sort((a,b)=>Number(b.data().total||0)-Number(a.data().total||0)).slice(0,10);
  const profiles=await Promise.all(top.map(d=>getDoc(memberRef(d.id))));
  return {leaders:top.flatMap((item,i)=>{
    const profile=profiles[i];
    if(!profile.exists()||profile.data().disabled===true||memberGender(profile.data())!==gender)return [];
    return [{name:profile.data().name||"Member",serial:profile.data().serial,total:item.data().total||0}];
  })};
}
export async function referralsSpark(){
  const uid=requireUser();
  const profile=await getDoc(memberRef(uid));
  if(!profile.exists())throw Error("اکاؤنٹ نہیں ملا۔");
  const gender=memberGender(profile.data());
  const rows=await getDocs(query(collection(db,"members"),
    where("inviterUid","==",uid),where("gender","==",gender),limit(200)));
  return {referrals:rows.docs.map(d=>({
    name:d.data().name,serial:d.data().serial,disabled:d.data().disabled===true
  }))};
}
export async function communitySpark(genderChoice){
  const uid=requireUser();
  const profile=await getDoc(memberRef(uid));
  if(!profile.exists()||profile.data().disabled===true)throw Error("اکاؤنٹ فعال نہیں۔");
  const gender=profile.data().role==="owner"&&isGender(genderChoice)?
    genderChoice:memberGender(profile.data());
  const [members,total]=await Promise.all([
    getDoc(doc(db,"genderMembers",gender)),getDoc(doc(db,"genderStats",gender))
  ]);
  return {gender,totalAccounts:members.exists()?members.data().totalMembers||0:0,
    totalRecitations:total.exists()?total.data().totalRecitations||0:0};
}

export async function groupMessagesSpark(genderChoice){
  const uid=requireUser(),profile=await getDoc(memberRef(uid));
  if(!profile.exists()||profile.data().disabled===true||profile.data().deleted===true)throw Error("اکاؤنٹ فعال نہیں۔");
  const gender=profile.data().role==="owner"&&isGender(genderChoice)?
    genderChoice:memberGender(profile.data());
  const messages=await getDocs(query(collection(db,"groupChats",gender,"messages"),
    orderBy("createdAt","desc"),limit(50)));
  return {gender,messages:messages.docs.map(item=>({
    id:item.id,...item.data(),
    createdAt:item.data().createdAt?.toDate?.()?.toISOString()||""
  })).reverse()};
}

export async function sendGroupMessageSpark(body,genderChoice){
  const uid=requireUser(),profile=await getDoc(memberRef(uid));
  if(!profile.exists()||profile.data().disabled===true||profile.data().deleted===true)throw Error("اکاؤنٹ فعال نہیں۔");
  const gender=profile.data().role==="owner"&&isGender(genderChoice)?
    genderChoice:memberGender(profile.data());
  const message=String(body||"").trim();
  if(message.length<1||message.length>1200)throw Error("پیغام 1 سے 1200 حروف میں لکھیں۔");
  await addDoc(collection(db,"groupChats",gender,"messages"),{
    gender,senderUid:uid,senderName:profile.data().name||"Member",
    body:message,createdAt:serverTimestamp()
  });
  return {gender};
}
