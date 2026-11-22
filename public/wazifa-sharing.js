// Account-scoped W-1, W-2, ... personal Wazifa serials and same-gender
// invitation inbox. All numbering + acceptance is atomic in Firestore.
import {auth,db} from "./firebase-client.js";
import {collection,doc,query,where,limit,startAfter,getDoc,getDocs,
  runTransaction,setDoc,deleteDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const OWNER_UID="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const MAX_SERIAL=1000000000;
const seqRef=uid=>doc(db,"memberWazaif",uid,"meta","sequence");
const itemRef=(uid,id)=>doc(db,"memberWazaif",uid,"items",id);
const inboxRef=(uid,id)=>doc(db,"wazifaInbox",uid,"items",id);
const personalCollection=uid=>collection(db,"memberWazaif",uid,"items");
const inboxCollection=uid=>collection(db,"wazifaInbox",uid,"items");
const DATA_KEYS=["title","arabic","instructions","purpose","kind","goal","startDate","endDate"];
function currentUid(){
  const uid=auth.currentUser?.uid;
  if(!uid)throw Error("وظیفہ شیئر کرنے سے پہلے لاگ اِن کریں۔");
  return uid;
}
function nextSerial(snapshot){
  const old=Number(snapshot.exists()?snapshot.data().next:0);
  if(!Number.isSafeInteger(old)||old<0||old>=MAX_SERIAL)throw Error("وظائف کی سیریل گنتی دستیاب نہیں۔");
  return old+1;
}
function serialData(n){return {next:n,lastItemId:"",updatedAt:serverTimestamp()};}
function sameUid(expected){if(auth.currentUser?.uid!==expected)throw Error("اکاؤنٹ تبدیل ہو گیا، دوبارہ کوشش کریں۔");}
export function wazifaSerial(task){return Number.isSafeInteger(task?.wNumber)&&task.wNumber>0?"W-"+task.wNumber:"نمبر لگ رہا ہے…";}
export function validMemberSerial(value){
  const text=String(value||"").trim().toUpperCase().replace(/\s+/g,"");
  const global=/^DI-([1-9]\d{0,8})$/.exec(text);
  if(global)return {type:"global",number:Number(global[1])};
  const female=/^D-?([1-9]\d{0,8})$/.exec(text);
  return female?{type:"female",number:Number(female[1])}:null;
}
// Women use D1, D2 ... within the women's branch. Existing founding
// women may have a legacy memberNumber but no persisted sideNumber.
function femaleNumber(profile){
  const side=Number(profile?.sideNumber);
  if(Number.isSafeInteger(side)&&side>0)return side;
  const global=Number(profile?.memberNumber);
  return global===2?1:global===3?2:global;
}
function displayMemberSerial(profile){
  return profile?.gender==="female"?"D"+femaleNumber(profile):
    "DI-"+Number(profile.memberNumber);
}
export async function assignLegacyWazifaSerial(itemId){
  const uid=currentUid();
  const ref=itemRef(uid,itemId),counter=seqRef(uid);
  return runTransaction(db,async tx=>{
    const [item,sequence]=await Promise.all([tx.get(ref),tx.get(counter)]);
    sameUid(uid);
    if(!item.exists())return null;
    if(Number.isSafeInteger(item.data().wNumber)&&item.data().wNumber>0)return item.data().wNumber;
    const next=nextSerial(sequence);
    tx.update(ref,{wNumber:next,updatedAt:serverTimestamp()});
    tx.set(counter,{next,lastItemId:itemId,updatedAt:serverTimestamp()});
    return next;
  });
}
export async function createPersonalWazifaWithSerial(data){
  const uid=currentUid();
  const counter=seqRef(uid),ref=doc(personalCollection(uid));
  return runTransaction(db,async tx=>{
    const current=await tx.get(counter);
    sameUid(uid);
    const next=nextSerial(current);
    tx.set(ref,{...data,uid,total:0,today:0,day:todayLocal(),
      wNumber:next,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(counter,{next,lastItemId:ref.id,updatedAt:serverTimestamp()});
    return {id:ref.id,wNumber:next};
  });
}
function todayLocal(){
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),
    String(now.getDate()).padStart(2,"0")].join("-");
}
export async function findSameGenderRecipient(memberSerial,profile){
  const senderUid=currentUid();
  const parsed=validMemberSerial(memberSerial);
  if(!parsed)throw Error("ممبر آئی ڈی DI-1 یا D1 جیسی درست شکل میں لکھیں۔");
  const {number,type}=parsed;
  const gender=profile?.gender==="female"?"female":"male";
  if(type==="female" && gender!=="female")
    throw Error("مرد خواتین کے D ممبر نمبرز کو وظیفہ نہیں بھیج سکتے۔");
  let recipient=null;
  if(type==="global"&&number===1){
    if(gender!=="male")throw Error("خواتین اور مرد ایک دوسرے کو وظیفہ نہیں بھیج سکتے۔");
    const snapshot=await getDoc(doc(db,"members",OWNER_UID));
    if(snapshot.exists())recipient={uid:snapshot.id,...snapshot.data()};
  }else{
    // The member directory exposes only same-gender profiles, in pages
    // of at most 200. No user can search across the gender boundary.
    let last=null;
    for(let page=0;page<20;page++){
      const constraint=[where("gender","==",gender),limit(200)];
      if(last)constraint.push(startAfter(last));
      const docs=await getDocs(query(collection(db,"members"),...constraint));
      const hit=docs.docs.find(d=>type==="female"
        ? femaleNumber(d.data())===number
        : Number(d.data().memberNumber)===number);
      if(hit){recipient={uid:hit.id,...hit.data()};break;}
      if(docs.size<200)break;
      last=docs.docs[docs.size-1];
    }
  }
  sameUid(senderUid);
  if(!recipient||recipient.deleted===true||recipient.disabled===true)
    throw Error("یہ ممبر نمبر آپ کی سائیڈ پر فعال نہیں یا موجود نہیں۔");
  if(recipient.uid===senderUid)throw Error("اپنے اکاؤنٹ کو وظیفہ شیئر کرنے کی ضرورت نہیں۔");
  const recipientGender=recipient.gender==="female"?"female":"male";
  if(recipientGender!==gender)throw Error("صرف اپنی سائیڈ کے ممبر کو شیئر کر سکتے ہیں۔");
  return recipient;
}
export async function sharePersonalWazifa(itemId,memberSerial,profile){
  const uid=currentUid();
  const recipient=await findSameGenderRecipient(memberSerial,profile);
  const source=await getDoc(itemRef(uid,itemId));
  sameUid(uid);
  if(!source.exists())throw Error("یہ وظیفہ آپ کے اکاؤنٹ میں موجود نہیں۔");
  const data=source.data();
  const outgoing=Object.fromEntries(DATA_KEYS.map(key=>[key,data[key]]));
  const target=doc(inboxCollection(recipient.uid));
  await setDoc(target,{...outgoing,senderUid:uid,recipientUid:recipient.uid,
    senderSerial:displayMemberSerial(profile),sourceId:itemId,
    createdAt:serverTimestamp()});
  sameUid(uid);
  return {recipient:displayMemberSerial(recipient)};
}
export async function acceptSharedWazifa(inboxId){
  const uid=currentUid();
  const received=inboxRef(uid,inboxId),counter=seqRef(uid),newItem=doc(personalCollection(uid));
  return runTransaction(db,async tx=>{
    const [message,seq]=await Promise.all([tx.get(received),tx.get(counter)]);
    sameUid(uid);
    if(!message.exists())throw Error("یہ شیئرڈ وظیفہ پہلے ہی محفوظ یا حذف ہو چکا ہے۔");
    const source=message.data();
    if(source.recipientUid!==uid)throw Error("یہ پیغام آپ کے اکاؤنٹ کا نہیں۔");
    const config=Object.fromEntries(DATA_KEYS.map(key=>[key,source[key]]));
    const next=nextSerial(seq);
    tx.set(newItem,{...config,uid,total:0,today:0,day:todayLocal(),
      wNumber:next,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(counter,{next,lastItemId:newItem.id,updatedAt:serverTimestamp()});
    tx.delete(received);
    return {wNumber:next,id:newItem.id};
  });
}
export async function discardSharedWazifa(inboxId){
  const uid=currentUid();
  await deleteDoc(inboxRef(uid,inboxId));
}
export {inboxCollection};
