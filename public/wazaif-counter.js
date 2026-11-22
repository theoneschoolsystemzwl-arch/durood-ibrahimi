// Shared, atomic accounting for the owner's active group Wazifa.
// Never edits an existing member's pre-Wazaif recitation history.
import {auth,db} from "./firebase-client.js";
import {doc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

export function readingDay(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export async function addGroupCountsToTransaction(tx,uid,amount,day,{durood=null}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
     !Number.isSafeInteger(amount)||amount<1||amount>10000)throw Error("غلط شمار یا تاریخ۔");
  const configRef=doc(db,"wazaifSettings","group");
  const statsRef=doc(db,"wazaifGroupStats","main");
  const memberRef=doc(db,"wazaifGroupStats","main","members",uid);
  const year=day.slice(0,4);
  const yearRef=doc(db,"wazaifGroupStats","main","years",year);
  const [config,stats,member,yearStats]=await Promise.all([
    tx.get(configRef),tx.get(statsRef),tx.get(memberRef),tx.get(yearRef)
  ]);
  if(!config.exists()||config.data().active!==true)throw Error("گروپ وظیفہ فعال نہیں ہے۔");
  if(durood!==null && config.data().countAsDurood!==durood)throw Error("گروپ وظیفے کی قسم بدل گئی ہے۔ صفحہ تازہ کریں۔");
  const prev=stats.exists()?stats.data():{};
  const own=member.exists()?member.data():{};
  const yr=yearStats.exists()?yearStats.data():{};
  const total=Number(prev.total||0),ownTotal=Number(own.total||0),yearTotal=Number(yr.total||0);
  if(![total,ownTotal,yearTotal].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error("گروپ شمار درست نہیں۔");
  tx.set(statsRef,{
    total:total+amount,day,year,today:(prev.day===day?Number(prev.today||0):0)+amount,
    lastUid:uid,lastAmount:amount,updatedAt:serverTimestamp()
  });
  tx.set(memberRef,{
    uid,total:ownTotal+amount,day,today:(own.day===day?Number(own.today||0):0)+amount,
    lastAmount:amount,updatedAt:serverTimestamp()
  });
  tx.set(yearRef,{
    year,total:yearTotal+amount,lastUid:uid,lastAmount:amount,
    updatedAt:serverTimestamp()
  });
}
export async function recordGroupWazifaOnly(amount=1,day=readingDay()){
  const user=auth.currentUser;
  if(!user)throw Error("لاگ اِن ضروری ہے۔");
  return runTransaction(db,async tx=>{
    await addGroupCountsToTransaction(tx,user.uid,amount,day,{durood:false});
  });
}
export async function recordPersonalWazifa(id,amount=1,day=readingDay(),{durationMs=0,intervals=0}={}){
  const user=auth.currentUser;
  if(!user)throw Error("لاگ اِن ضروری ہے۔");
  if(typeof id!=="string"||!/^[A-Za-z0-9]{10,30}$/.test(id)||
     !Number.isSafeInteger(amount)||amount<1||amount>1000 ||
     !Number.isSafeInteger(durationMs)||durationMs<0||durationMs>amount*15000 ||
     !Number.isSafeInteger(intervals)||intervals<0||intervals>amount)
    throw Error("اندراج یا دورانیہ درست نہیں۔");
  return runTransaction(db,async tx=>{
    const ref=doc(db,"memberWazaif",user.uid,"items",id);
    const snap=await tx.get(ref);
    if(!snap.exists())throw Error("وظیفہ موجود نہیں ہے۔");
    const w=snap.data();
    if(day<w.startDate || (w.kind==="fixed"&&day>w.endDate))throw Error("وظیفے کی تاریخ ابھی فعال نہیں ہے۔");
    const previous=Number(w.total||0);
    if(!Number.isSafeInteger(previous)||previous<0)throw Error("سابقہ شمار درست نہیں۔");
    const ledger=w.dailyLedger&&typeof w.dailyLedger==="object"?w.dailyLedger:{};
    const old=ledger[day]||{count:0,durationMs:0,intervals:0};
    const dailyLedger={...ledger,[day]:{
      count:Number(old.count||0)+amount,
      durationMs:Number(old.durationMs||0)+durationMs,
      intervals:Number(old.intervals||0)+intervals
    }};
    if(Object.keys(dailyLedger).length>3660)throw Error("روزانہ ریکارڈ کی زیادہ سے زیادہ حد پوری ہوگئی۔");
    tx.update(ref,{
      total:previous+amount,day,today:(w.day===day?Number(w.today||0):0)+amount,
      dailyLedger,updatedAt:serverTimestamp()
    });
  });
}
