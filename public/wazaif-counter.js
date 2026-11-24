// Shared, atomic accounting for the owner's active group Wazifa.
// Never edits an existing member's pre-Wazaif recitation history.
import {auth,db} from "./firebase-client.js";
import {doc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

export function readingDay(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export async function addGroupCountsToTransaction(tx,uid,amount,day,{durood=null}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || day>readingDay() || readingDay(new Date(day+"T12:00:00"))!==day ||
     !Number.isSafeInteger(amount)||amount<1||amount>10000)throw Error("غلط شمار یا تاریخ۔");
  const configRef=doc(db,"wazaifSettings","group");
  const statsRef=doc(db,"wazaifGroupStats","main");
  const memberRef=doc(db,"wazaifGroupStats","main","members",uid);
  const dailyRef=doc(memberRef,"days",day),groupDayRef=doc(statsRef,"days",day);
  const year=day.slice(0,4);
  const yearRef=doc(db,"wazaifGroupStats","main","years",year);
  const [config,stats,member,yearStats,daily,groupDay]=await Promise.all([
    tx.get(configRef),tx.get(statsRef),tx.get(memberRef),tx.get(yearRef),tx.get(dailyRef),tx.get(groupDayRef)
  ]);
  if(!config.exists()||config.data().active!==true)throw Error("گروپ وظیفہ فعال نہیں ہے۔");
  if(durood!==null && config.data().countAsDurood!==durood)throw Error("گروپ وظیفے کی قسم بدل گئی ہے۔ صفحہ تازہ کریں۔");
  const prev=stats.exists()?stats.data():{};
  const own=member.exists()?member.data():{};
  const yr=yearStats.exists()?yearStats.data():{};
  const total=Number(prev.total||0),ownTotal=Number(own.total||0),yearTotal=Number(yr.total||0);
  if(![total,ownTotal,yearTotal].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error("گروپ شمار درست نہیں۔");
  // Before the first rollover, preserve the legacy last-day summary.
  const legacyDay=own.day,legacyCount=Number(own.today||0);
  let previousDayRef=null,previousDaySnap=null;
  if(legacyDay!==day&&/^\d{4}-\d{2}-\d{2}$/.test(legacyDay||"")&&
      Number.isSafeInteger(legacyCount)&&legacyCount>0){
    previousDayRef=doc(memberRef,"days",legacyDay);
    previousDaySnap=await tx.get(previousDayRef);
  }
  const groupLegacyDay=prev.day,groupLegacyCount=Number(prev.today||0);
  let priorGroupRef=null,priorGroupSnap=null;
  if(groupLegacyDay!==day&&/^\d{4}-\d{2}-\d{2}$/.test(groupLegacyDay||"")&&groupLegacyCount>0){
    priorGroupRef=doc(statsRef,"days",groupLegacyDay);
    priorGroupSnap=await tx.get(priorGroupRef);
  }
  const sharedCount=groupDay.exists()?Number(groupDay.data().count):groupLegacyDay===day?groupLegacyCount:0;
  if(!Number.isSafeInteger(sharedCount)||sharedCount<0)throw Error("گروپ کا روزانہ شمار درست نہیں۔");
  const previousCount=daily.exists()?Number(daily.data().count):
    (legacyDay===day?legacyCount:0);
  if(!Number.isSafeInteger(previousCount)||previousCount<0)throw Error("روزانہ شمار درست نہیں۔");
  if(previousDayRef&&!previousDaySnap.exists())tx.set(previousDayRef,{
    uid,date:legacyDay,count:legacyCount,updatedAt:serverTimestamp()
  });
  if(priorGroupRef&&!priorGroupSnap.exists())tx.set(priorGroupRef,{date:groupLegacyDay,count:groupLegacyCount,updatedAt:serverTimestamp()});
  tx.set(groupDayRef,{date:day,count:sharedCount+amount,updatedAt:serverTimestamp()});
  tx.set(dailyRef,{uid,date:day,count:previousCount+amount,updatedAt:serverTimestamp()});
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
export async function recordGroupWazifaOnly(amount=1,day=readingDay(),syncId=null){
  const user=auth.currentUser;
  if(!user)throw Error("لاگ اِن ضروری ہے۔");
  if(syncId && (!/^[a-f0-9]{32}$/.test(syncId)||amount>1000))throw Error("غلط سنک شناخت۔");
  const receipt=syncId?doc(db,"memberWazaif",user.uid,"syncReceipts",syncId):null;
  return runTransaction(db,async tx=>{
    if(receipt && (await tx.get(receipt)).exists())return {duplicate:true};
    await addGroupCountsToTransaction(tx,user.uid,amount,day,{durood:false});
    if(receipt)tx.set(receipt,{uid:user.uid,kind:"group",taskId:"_group_",
      day,amount,source:"tasbih",createdAt:serverTimestamp()});
    return {duplicate:false};
  });
}
// Each Save is one atomic addition/correction on the selected day.
// The latest-day summary never rewinds when a previous date is saved.
export async function recordPersonalWazifa(id,amount=1,day=readingDay(),
  {durationMs=0,intervals=0,source="tasbih",syncId=null}={}){
 const user=auth.currentUser;
 if(!user)throw Error("لاگ اِن ضروری ہے۔");
 if(typeof id!=="string"||!/^[A-Za-z0-9]{10,30}$/.test(id)||
    !Number.isSafeInteger(amount)||amount===0||amount < -1000||amount>1000||
    !["tasbih","manual"].includes(source)||(amount<0&&source!=="manual")||
    !Number.isSafeInteger(durationMs)||durationMs<0||durationMs>86400000||
    (amount<0&&durationMs!==0)||
    !Number.isSafeInteger(intervals)||intervals<0||intervals>Math.max(0,amount)||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)||day>readingDay()||
    readingDay(new Date(day+"T12:00:00"))!==day ||
    (syncId!==null&&(!/^[a-f0-9]{32}$/.test(syncId)||amount===0)))
  throw Error("تعداد، وقت یا تاریخ درست نہیں۔");
 const receipt=syncId?doc(db,"memberWazaif",user.uid,"syncReceipts",syncId):null;
 return runTransaction(db,async tx=>{
  if(receipt && (await tx.get(receipt)).exists())return {duplicate:true};
  const ref=doc(db,"memberWazaif",user.uid,"items",id);
  const snap=await tx.get(ref);
  if(!snap.exists())throw Error("وظیفہ موجود نہیں ہے۔");
  const w=snap.data();
  const legacyContinuation=w.kind==="fixed"&&typeof w.continueStartDate==="string" &&
   Number.isSafeInteger(w.continueDailyGoal)&&w.continueDailyGoal>0 &&
   day>=w.continueStartDate&&w.continueStartDate>w.endDate;
  const plannedContinuation=w.kind==="fixed"&&Array.isArray(w.continuePeriods)&&
   w.continuePeriods.some(p=>p&&day>=p.startDate&&
     (p.mode==="daily"||(p.mode==="fixed"&&day<=p.endDate)));
  if(day<w.startDate||(w.kind==="fixed"&&day>w.endDate&&
      !legacyContinuation&&!plannedContinuation))
   throw Error("منتخب تاریخ وظیفے کی مدت میں نہیں ہے۔");
  const previous=Number(w.total||0);
  if(!Number.isSafeInteger(previous)||previous<0||previous+amount<0)
   throw Error("سابقہ شمار درست نہیں۔");
  const ledger=w.dailyLedger&&typeof w.dailyLedger==="object"?w.dailyLedger:{};
  const old=ledger[day]||{count:0,durationMs:0,intervals:0};
  const prevCount=Number(old.count||0);
  const prevManual=Number(old.manualCount||0);
  const prevTasbih=Number(old.tasbihCount||0);
  const newCount=prevCount+amount;
  if(newCount<0)throw Error("اس تاریخ کی محفوظ تعداد سے زیادہ کمی ممکن نہیں۔");
  // A correction removes manual counts first, then unclassified legacy counts,
  // finally dated tasbih counts; never yields a negative source count.
  const newManual=amount<0?Math.max(0,prevManual+amount):
   prevManual+(source==="manual"?amount:0);
  const newTasbih=amount<0?Math.min(prevTasbih,newCount):
   prevTasbih+(source==="tasbih"?amount:0);
  const nextEntry={
   count:newCount,
   durationMs:Number(old.durationMs||0)+durationMs,
   intervals:amount<0?Math.min(Number(old.intervals||0),newCount):
    Number(old.intervals||0)+intervals,
   tasbihCount:newTasbih,
   manualCount:newManual
  };
  const dailyLedger={...ledger,[day]:nextEntry};
  if(Object.keys(dailyLedger).length>3660)throw Error("روزانہ ریکارڈ کی حد پوری ہوگئی۔");
  const latestDay=w.day>day?w.day:day;
  const newToday=latestDay===w.day?Number(w.today||0)+(day===latestDay?amount:0):amount;
  if(newToday<0)throw Error("روزانہ شمار درست نہیں۔");
  tx.update(ref,{
   total:previous+amount,day:latestDay,today:newToday,dailyLedger,
   lastReadingDay:day,lastReadingSource:source,updatedAt:serverTimestamp()
  });
  if(receipt)tx.set(receipt,{uid:user.uid,kind:"personal",taskId:id,
    day,amount:Math.abs(amount),source,createdAt:serverTimestamp()});
  return {duplicate:false};
 });
}
