// Durable, exactly-once offline tasbih journal.
// Every accepted tap is written to its own immutable localStorage record BEFORE the UI increments.
// Distinct records avoid lost updates when two tabs share the same browser storage.
// Firebase transactions use that record's stable id as a sync receipt to prevent double counting.
export function createDurableTasbihSync({prefix,send,getUid,onChange=()=>{}}){
 let ownerUid=null,busy=false,timer=null,timerDue=0,lastError="",retryAfter=0,quotaFailures=0;
 // A page owns its mutable draft under a browser-wide Web Lock. A different
 // page may recover it only after that lock is released. Without Web Locks,
 // preserve the original immutable per-tap journal rather than risk data.
 const pageId=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
 const lockName=id=>prefix+"-draft-"+id;
 let draftLease=false,draftId=null,releaseLease=null,leaseRequested=false;
 function acquireLease(){
  if(leaseRequested||!navigator.locks?.request)return;
  leaseRequested=true;
  navigator.locks.request(lockName(pageId),()=>{draftLease=true;return new Promise(resolve=>{releaseLease=resolve;});})
   .catch(()=>{}).finally(()=>{draftLease=false;releaseLease=null;leaseRequested=false;});
 }
 acquireLease();
 const legacyKey=uid=>prefix+"-"+uid;
 const recordPrefix=uid=>prefix+"-op-"+uid+"-";
 const validId=value=>typeof value==="string"&&/^[a-f0-9]{32}$/.test(value);
 function newId(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
 }
 function valid(op){
  return op&&typeof op.taskId==="string"&&op.taskId.length>0&&op.taskId.length<=50&&
   /^\d{4}-\d{2}-\d{2}$/.test(op.day)&&["tasbih","manual"].includes(op.source)&&
   Number.isSafeInteger(op.count)&&op.count>=1&&op.count<=1000&&
   Number.isSafeInteger(op.durationMs)&&op.durationMs>=0&&op.durationMs<=86400000&&
   Number.isSafeInteger(op.intervals)&&op.intervals>=0&&op.intervals<=op.count;
 }
 function listOps(uid=ownerUid){
  if(!uid)return [];
  const prefixKey=recordPrefix(uid),keys=[];
  try{
   for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k?.startsWith(prefixKey)&&validId(k.slice(prefixKey.length)))keys.push(k);
   }
   return keys.flatMap(k=>{
    try{
     const op=JSON.parse(localStorage.getItem(k)||"null");
     return (op?.schema===4||(op?.schema===5&&typeof op.draftOwner==="string"))&&op.uid===uid&&validId(op.id)&&k===prefixKey+op.id&&valid(op)?[op]:[];
    }catch{return [];}
   }).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id));
  }catch(error){
   lastError="فون کی محفوظ گنتی پڑھنے میں خرابی ہے۔";
   return [];
  }
 }
 // v3 used one shared read/modify/write key; migrate it without losing
 // existing offline taps. A deterministic migration id makes two tabs
 // importing the same old record safe against double counting.
 function legacyId(input){
  const seeds=[2166136261,2246822519,3266489917,668265263];
  for(let i=0;i<input.length;i++){
   const x=input.charCodeAt(i);
   for(let k=0;k<4;k++)seeds[k]=Math.imul((seeds[k]^x)>>>0,16777619+(k*2))>>>0;
  }
  return seeds.map(n=>n.toString(16).padStart(8,"0")).join("");
 }
 function migrateLegacy(uid){
  const oldKey=legacyKey(uid);
  let original,old;
  try{
   original=localStorage.getItem(oldKey);
   if(!original)return;
   old=JSON.parse(original);
   if(old?.schema!==3||!Array.isArray(old.pending))return;
   const device=localStorage.getItem("durood-device-id-v1")||
    localStorage.getItem(prefix+"-legacy-device")||newId();
   if(!localStorage.getItem("durood-device-id-v1"))
    localStorage.setItem(prefix+"-legacy-device",device);
   const ops=old.pending.map((item,i)=>({...item,id:legacyId(
    prefix+"|"+uid+"|"+device+"|"+i+"|"+JSON.stringify(item))}));
   if(old.inflight)ops.push(old.inflight);
   for(const op of ops){
    if(!valid(op))throw Error("Invalid previous journal record");
    const id=validId(op.id)?op.id:legacyId(prefix+"|"+uid+"|"+device+"|inflight|"+JSON.stringify(op));
    const k=recordPrefix(uid)+id;
    if(!localStorage.getItem(k))
     localStorage.setItem(k,JSON.stringify({...op,id,uid,schema:4,createdAt:Date.now()}));
   }
   // Do not erase old data if an older page changed it while migrating.
   if(localStorage.getItem(oldKey)===original)localStorage.removeItem(oldKey);
  }catch(error){
   lastError="پرانا آف لائن شمار منتقل نہیں ہوا؛ محفوظ ریکارڈ برقرار ہے۔";
  }
 }
 function notify(){try{onChange(status());}catch{}}
 function pending(taskId=null,day=null){
  return listOps().filter(op=>(!taskId||op.taskId===taskId)&&(!day||op.day===day))
   .reduce((n,op)=>n+op.count,0);
 }
 function byDay(taskId=null){
  const days={};
  for(const op of listOps()){
   if(taskId&&op.taskId!==taskId)continue;
   days[op.day]=(days[op.day]||0)+op.count;
  }
  return days;
 }
 function status(){return {pending:pending(),error:lastError,online:navigator.onLine!==false,busy};}
 function start(uid){
  if(!uid||ownerUid===uid)return;
  clearTimeout(timer);timer=null;
  ownerUid=uid;lastError="";retryAfter=0;quotaFailures=0;draftId=null;
  migrateLegacy(uid);
  notify();
 }
 function enqueue({taskId,day,source="tasbih",count=1,durationMs=0,intervals=0}){
  const uid=ownerUid,op={taskId,day,source,count,durationMs,intervals};
  if(!uid||getUid()!==uid||!valid(op))return false;
  try{

   let merged=false;
   if(draftLease&&draftId){
    const k=recordPrefix(uid)+draftId;
    const old=JSON.parse(localStorage.getItem(k)||"null");
    if(old?.schema===5&&old.draftOwner===pageId&&old.taskId===taskId&&old.day===day&&old.source===source&&
       old.count+count<=1000&&old.durationMs+durationMs<=86400000){
     const next={...old,count:old.count+count,durationMs:old.durationMs+durationMs,intervals:old.intervals+intervals};
     if(valid(next)){localStorage.setItem(k,JSON.stringify(next));merged=true;}
    }
    if(!merged)sealOwnDraft(uid);
   }
   if(!merged){
    const id=newId();
    const record={...op,id,uid,schema:draftLease?5:4,createdAt:Date.now(),...(draftLease?{draftOwner:pageId}:{})};
    localStorage.setItem(recordPrefix(uid)+id,JSON.stringify(record));
    if(draftLease)draftId=id;
   }
  }catch{
   lastError="فون کی اسٹوریج میں محفوظ نہیں ہو سکا۔";
   notify();return false;
  }
  if(Date.now()>=retryAfter)lastError="";
  notify();return true;
 }

 function sealOwnDraft(uid=ownerUid){
  if(!uid||!draftId)return;
  const k=recordPrefix(uid)+draftId,op=JSON.parse(localStorage.getItem(k)||"null");
  if(op?.schema===5&&op.draftOwner===pageId){
   const {draftOwner,...rest}=op;localStorage.setItem(k,JSON.stringify({...rest,schema:4}));
  }
  draftId=null;
 }
 async function sealRecoverable(op,uid){
  if(op.schema===4)return op;
  if(op.draftOwner===pageId){
   const k=recordPrefix(uid)+op.id,current=JSON.parse(localStorage.getItem(k)||"null");
   if(current?.schema===5&&current.draftOwner===pageId&&valid(current)){
    const {draftOwner,...rest}=current;localStorage.setItem(k,JSON.stringify({...rest,schema:4}));
   }
   if(draftId===op.id)draftId=null;
  }
  else{
   if(!navigator.locks?.request)return null;
   await navigator.locks.request(lockName(op.draftOwner),{ifAvailable:true},lock=>{
    if(!lock)return;
    const k=recordPrefix(uid)+op.id,current=JSON.parse(localStorage.getItem(k)||"null");
    if(current?.schema===5&&current.draftOwner===op.draftOwner&&valid(current)){
     const {draftOwner,...rest}=current;localStorage.setItem(k,JSON.stringify({...rest,schema:4}));
    }
   });
  }
  const latest=JSON.parse(localStorage.getItem(recordPrefix(uid)+op.id)||"null");
  return latest?.schema===4&&valid(latest)?latest:null;
 }
 // Only explicit Save invokes flush; background events only refresh local status.
 function schedule(){notify();}
 async function flush(taskId=null){
  if(busy)return;
  if(!ownerUid||getUid()!==ownerUid){lastError="auth-required";notify();return;}
  if(navigator.onLine===false){lastError="offline";notify();return;}
  if(Date.now()<retryAfter){lastError="resource-exhausted: "+Math.ceil((retryAfter-Date.now())/1000)+"s";notify();return;}
  try{sealOwnDraft();}catch(error){lastError=String(error?.message||error);notify();schedule(20000);return;}
  const uid=ownerUid;busy=true;lastError="";notify();
  try{
   for(const candidate of listOps(uid).filter(op=>!taskId||op.taskId===taskId)){
    if(uid!==ownerUid||getUid()!==uid||navigator.onLine===false)break;
    try{
     const op=await sealRecoverable(candidate,uid);
     if(uid!==ownerUid||getUid()!==uid)break;
     if(!op){lastError="draft-in-other-tab";continue;}
     const k=recordPrefix(uid)+op.id;
     if(!localStorage.getItem(k))continue;
     await send(op);
     if(uid!==ownerUid||getUid()!==uid)break;
     // Delete only the immutable record which was acknowledged by Firebase.
     if(localStorage.getItem(k))localStorage.removeItem(k);
     lastError="";retryAfter=0;quotaFailures=0;notify();
    }catch(error){

     lastError=String([error?.code,error?.message].filter(Boolean).join(": ")||error).slice(0,220);
     if(/resource-exhausted|quota/i.test(lastError)){
      quotaFailures++;retryAfter=Date.now()+Math.min(1800000,300000*2**Math.min(3,quotaFailures-1));
     }
     notify();break; // The SAME receipt id is retried after an unknown acknowledgement.
    }
   }
  }finally{
   busy=false;
   if(uid===ownerUid&&pending(taskId)>0&&!lastError)lastError="pending-retry";
   if(uid===ownerUid&&pending()>0)schedule(20000);
   notify();
  }
 }
 function stop(){try{sealOwnDraft();}catch{}clearTimeout(timer);timer=null;timerDue=0;ownerUid=null;lastError="";retryAfter=0;quotaFailures=0;notify();}
 window.addEventListener("pagehide",()=>{try{sealOwnDraft();}catch{}finally{draftLease=false;releaseLease?.();}});
 window.addEventListener("pageshow",()=>acquireLease());
 document.addEventListener("visibilitychange",()=>{if(document.hidden){try{sealOwnDraft();}catch{}}});
 window.addEventListener("online",()=>schedule(0));
 window.addEventListener("storage",event=>{
  if(!ownerUid||!event.key||(!event.key.startsWith(recordPrefix(ownerUid))&&event.key!==legacyKey(ownerUid)))return;
  if(event.key===legacyKey(ownerUid))migrateLegacy(ownerUid);
  notify();if(navigator.onLine!==false)schedule(10000);
 });
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule(0);});
 return {start,stop,enqueue,pending,byDay,status,schedule,flush};
}
