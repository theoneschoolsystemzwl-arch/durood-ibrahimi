// Account-scoped W-1, W-2, ... personal Wazifa serials and same-gender
// invitation inbox. All numbering + acceptance is atomic in Firestore.
import {auth,db} from "./firebase-client.js";
import {parseSideSerial,sideOf} from "./member-side-serial.js";
import {readSideDirectory} from "./member-side-directory.js";
import {collection,doc,query,where,limit,startAfter,getDoc,getDocs,
  runTransaction,setDoc,deleteDoc,serverTimestamp,getDocFromServer,getDocsFromServer}
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
// The sequence document serializes allocations, even when an older W slot is reused.
// Query the owner's current items from the server, never a cached/UI list.
const serialRetry="WAZIFA_SERIAL_CHANGED";
async function allocateSerial(uid,writeItem){
  const counter=seqRef(uid);
  for(let attempt=0;attempt<6;attempt++){
    const [before,items]=await Promise.all([
      getDocFromServer(counter),
      getDocsFromServer(query(personalCollection(uid),limit(100)))
    ]);
    if(items.size>=100)throw Error("وظائف کی حد پوری ہوگئی؛ نمبر محفوظ نہیں ہو سکا۔");
    const used=new Set();
    items.forEach(item=>{
      const n=item.data().wNumber;
      if(Number.isSafeInteger(n)&&n>0)used.add(n);
    });
    let serial=1;
    while(used.has(serial))serial++;
    const previous=before.exists()?before.data():null;
    const eventNumber=Number(previous?.next||0)+1;
    if(!Number.isSafeInteger(eventNumber)||eventNumber<1||eventNumber>MAX_SERIAL)
      throw Error("وظائف کی سیریل گنتی دستیاب نہیں۔");
    try{
      return await runTransaction(db,async tx=>{
        const current=await tx.get(counter);
        sameUid(uid);
        const latest=current.exists()?current.data():null;
        if(Number(latest?.next||0)!==Number(previous?.next||0)||
           String(latest?.lastItemId||"")!==String(previous?.lastItemId||""))
          throw Error(serialRetry);
        const result=await writeItem(tx,serial);
        if(result?.skip)return result.value;
        tx.set(counter,{next:eventNumber,lastNumber:serial,lastItemId:result.id,
          updatedAt:serverTimestamp()});
        return {...result,wNumber:serial};
      });
    }catch(error){
      if(error.message===serialRetry&&attempt<5)continue;
      throw error;
    }
  }
  throw Error("نمبر بدل گیا؛ دوبارہ کوشش کریں۔");
}
function sameUid(expected){if(auth.currentUser?.uid!==expected)throw Error("اکاؤنٹ تبدیل ہو گیا، دوبارہ کوشش کریں۔");}
export function wazifaSerial(task){return Number.isSafeInteger(task?.wNumber)&&task.wNumber>0?"W-"+task.wNumber:"نمبر لگ رہا ہے…";}
export function validMemberSerial(value){return parseSideSerial(value);}
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
  const uid=currentUid(),ref=itemRef(uid,itemId);
  const assigned=await allocateSerial(uid,async(tx,n)=>{
    const item=await tx.get(ref);
    if(!item.exists())return {skip:true,value:null};
    if(Number.isSafeInteger(item.data().wNumber)&&item.data().wNumber>0)
      return {skip:true,value:item.data().wNumber};
    tx.update(ref,{wNumber:n,updatedAt:serverTimestamp()});
    return {id:itemId};
  });
  return typeof assigned==="number"||assigned===null?assigned:assigned.wNumber;
}
export async function createPersonalWazifaWithSerial(data){
  const uid=currentUid(),ref=doc(personalCollection(uid));
  return allocateSerial(uid,async(tx,n)=>{
    tx.set(ref,{...data,uid,total:0,today:0,day:todayLocal(),
      wNumber:n,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    return {id:ref.id};
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
  if(!parsed)throw Error("درست ممبر آئی ڈی لکھیں، مثلاً M-2 یا F-2۔");
  const {number,type}=parsed;
  const gender=sideOf(profile);
  if((type==="female"&&gender!=="female")||(type==="male"&&gender!=="male"))
    throw Error("صرف اپنی سائیڈ کے ممبر کو شیئر کر سکتے ہیں۔");
  const directory=await readSideDirectory(gender);
  const hit=[...directory.values()].find(r=>type==="global"?Number(r.member.memberNumber)===number:r.number===number);
  let recipient=hit?{...hit.member,displaySideSerial:hit.label}:null;
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
  const pdf=await import("./wazifa-pdf.js?v=5"),meta=pdf.pdfMarker(data.arabic);
  if(meta)await pdf.ensurePdfCloud(data.arabic,uid,"personal");
  sameUid(uid);
  const outgoing=Object.fromEntries(DATA_KEYS.map(key=>[key,data[key]]));
  const target=meta?inboxRef(recipient.uid,meta.id):doc(inboxCollection(recipient.uid));
  await setDoc(target,{...outgoing,senderUid:uid,recipientUid:recipient.uid,
    senderSerial:displayMemberSerial(profile),sourceId:itemId,
    createdAt:serverTimestamp()});
  sameUid(uid);
  return {recipient:recipient.displaySideSerial};
}
export async function acceptSharedWazifa(inboxId,settings){
  const {kind,goal,startDate,durationDays}=settings||{};
  const validDay=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+"T12:00:00Z"))&&new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;
  if(!["daily","fixed","open"].includes(kind)||!Number.isSafeInteger(goal)||goal<1||goal>1000000000||!validDay(startDate)||
    (kind==="fixed"&&(!Number.isSafeInteger(durationDays)||durationDays<1||durationDays>3650)))
    throw Error("اپنا ہدف، قسم اور آغاز کی تاریخ درست مقرر کریں۔");
  const endDate=kind==="fixed"?new Date(Date.parse(startDate+"T12:00:00Z")+(durationDays-1)*86400000).toISOString().slice(0,10):"";
  if(kind==="fixed"&&!validDay(endDate))throw Error("اختتامی تاریخ درست نہیں۔");
  const uid=currentUid();
  const received=inboxRef(uid,inboxId),newItem=doc(personalCollection(uid));
  const preview=await getDocFromServer(received);
  if(!preview.exists())throw Error("یہ شیئرڈ وظیفہ پہلے ہی محفوظ یا حذف ہو چکا ہے۔");
  const initial=preview.data(),pdf=await import("./wazifa-pdf.js?v=5"),meta=pdf.pdfMarker(initial.arabic);
  if(meta){
    if(initial.recipientUid!==uid||meta.id!==inboxId)throw Error("PDF شیئر درست نہیں۔");
    const bytes=await pdf.loadPdfAttachment(initial.arabic,uid,"shared:"+initial.senderUid);
    await pdf.savePdfAttachment({marker:initial.arabic,bytes},uid,"personal");
  }
  sameUid(uid);
  return allocateSerial(uid,async(tx,n)=>{
    const message=await tx.get(received);
    if(!message.exists())throw Error("یہ شیئرڈ وظیفہ پہلے ہی محفوظ یا حذف ہو چکا ہے۔");
    const source=message.data();
    if(source.recipientUid!==uid||source.arabic!==initial.arabic||source.senderUid!==initial.senderUid)throw Error("یہ پیغام بدل چکا ہے۔ دوبارہ کوشش کریں۔");
    const config={...Object.fromEntries(["title","arabic","instructions","purpose"].map(key=>[key,source[key]])),
      kind,goal,startDate,endDate,durationDays:kind==="fixed"?durationDays:0};
    tx.set(newItem,{...config,uid,total:0,today:0,day:todayLocal(),
      wNumber:n,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.delete(received);
    return {id:newItem.id};
  });
}
export async function discardSharedWazifa(inboxId){
  const uid=currentUid();
  await deleteDoc(inboxRef(uid,inboxId));
}
export {inboxCollection};
