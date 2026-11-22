// Wazaif are separate from the Durood-e-Ibrahimi counter.
// Only the shared group Durood is counted in the existing global totals.
import {auth,db} from "./firebase-client.js";
import {doc,collection,query,limit,getDocs,runTransaction,setDoc,updateDoc,serverTimestamp,
  getDoc} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

export const GROUP_REF=doc(db,"wazaifConfig","group");
export const GROUP_ARABIC="اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ. اللَّهُمَّ بَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ.";
export const DEFAULT_GROUP=Object.freeze({
  title:"درودِ ابراہیمی",arabic:GROUP_ARABIC,
  instructions:"مکمل درود ابراہیمی پڑھ کر تسبیح کو ایک مرتبہ دبائیں۔",
  purpose:"درود شریف کی روزانہ تلاوت اور مشترکہ دعوت",
  mode:"group",active:true,dailyGoal:100,yearlyGoal:0,startDate:""
});
export function localWazifaDate(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
function requireUid(){
  const uid=auth.currentUser?.uid;
  if(!uid)throw Error("پہلے لاگ اِن کریں۔");
  return uid;
}
const cleanText=(value,max)=>String(value??"").trim().slice(0,max);
const int=(value,max)=>Number.isSafeInteger(Number(value)) && Number(value)>=0 && Number(value)<=max ? Number(value):NaN;
function dateOrEmpty(input){const date=String(input||"");if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("تاریخ درست درج کریں۔");return date;}
export function sanitizeWazifa(input,{group=false}={}){
  const mode=group?"group":String(input.mode||"");
  if(!group&&!["daily","fixed","open"].includes(mode))throw Error("وظیفے کی قسم منتخب کریں۔");
  const title=cleanText(input.title,80),arabic=cleanText(input.arabic,4000);
  const instructions=cleanText(input.instructions,1800),purpose=cleanText(input.purpose,1800);
  if(title.length<2 || arabic.length<1)throw Error("وظیفے کا نام اور عربی عبارت درج کریں۔");
  const dailyGoal=int(input.dailyGoal??0,1000000000),totalGoal=int(input.totalGoal??0,1000000000);
  const yearlyGoal=int(input.yearlyGoal??0,1000000000);
  if(!Number.isFinite(dailyGoal)||!Number.isFinite(totalGoal)||!Number.isFinite(yearlyGoal))throw Error("ہدف ایک درست مثبت عدد ہونا چاہیے۔");
  const startDate=dateOrEmpty(input.startDate),endDate=mode==="fixed"?dateOrEmpty(input.endDate):"";
  if(mode==="fixed" && (!startDate||!endDate||endDate<startDate || !totalGoal))throw Error("فکس وظیفے کے لیے آغاز، اختتام اور کل ہدف ضروری ہیں۔");
  return group?{title,arabic,instructions,purpose,mode,active:Boolean(input.active),
    dailyGoal,yearlyGoal,startDate}:
    {title,arabic,instructions,purpose,mode,active:Boolean(input.active),
      dailyGoal,totalGoal,startDate,endDate};
}
export async function saveGroupWazifa(input){
  requireUid();
  const value=sanitizeWazifa(input,{group:true});
  await setDoc(GROUP_REF,{...value,updatedAt:serverTimestamp()});
  return value;
}
function personalCollection(uid){return collection(db,"memberWazaif",uid,"items");}
export function personalWazifaRef(uid,id){return doc(db,"memberWazaif",uid,"items",id);}
export async function readPersonalWazaif(){
  const uid=requireUid();
  const snap=await getDocs(query(personalCollection(uid),limit(40)));
  return snap.docs.map(x=>({id:x.id,...x.data()}));
}
export async function savePersonalWazifa(input,id=null){
  const uid=requireUid();
  const data=sanitizeWazifa(input);
  if(id){
    await updateDoc(personalWazifaRef(uid,id),{...data,updatedAt:serverTimestamp()});
    return id;
  }
  const created=doc(personalCollection(uid));
  await setDoc(created,{...data,totalRead:0,lastDay:"",dayRead:0,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return created.id;
}
export async function recordPersonalWazifa(id,amount=1,day=localWazifaDate()){
  const uid=requireUid();
  if(!/^[A-Za-z0-9]{16,30}$/.test(id))throw Error("وظیفے کی آئی ڈی درست نہیں۔");
  if(!Number.isSafeInteger(amount)||amount<1||amount>10000)throw Error("درست تعداد درج کریں۔");
  const ref=personalWazifaRef(uid,id);
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists() || !snap.data().active)throw Error("وظیفہ بند ہے یا موجود نہیں۔");
    const data=snap.data(),old=Number(data.totalRead||0);
    if(data.startDate && day<data.startDate)throw Error("یہ وظیفہ ابھی شروع نہیں ہوا۔");
    if(data.mode==="fixed" && (day>data.endDate || old+amount>data.totalGoal))throw Error("اس وظیفے کا مقررہ ہدف یا تاریخ مکمل ہو گئی ہے۔");
    const dayRead=data.lastDay===day?Number(data.dayRead||0):0;
    tx.update(ref,{totalRead:old+amount,dayRead:dayRead+amount,lastDay:day,
      updatedAt:serverTimestamp()});
    return {totalRead:old+amount,dayRead:dayRead+amount,lastDay:day};
  });
}
