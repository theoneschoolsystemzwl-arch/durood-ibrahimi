// Durable, exactly-once offline tasbih journal.
// Every accepted tap is written to its own immutable localStorage record BEFORE the UI increments.
// Distinct records avoid lost updates when two tabs share the same browser storage.
// Firebase transactions use that record's stable id as a sync receipt to prevent double counting.
export function createDurableTasbihSync({prefix,send,getUid,onChange=()=>{}}){
 let ownerUid=null,busy=false,timer=null,lastError="";
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
     return op?.schema===4&&op.uid===uid&&validId(op.id)&&k===prefixKey+op.id&&valid(op)?[op]:[];
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
  ownerUid=uid;lastError="";
  migrateLegacy(uid);
  schedule(40);notify();
 }
 function enqueue({taskId,day,source="tasbih",count=1,durationMs=0,intervals=0}){
  const uid=ownerUid,op={taskId,day,source,count,durationMs,intervals};
  if(!uid||getUid()!==uid||!valid(op))return false;
  try{
   const id=newId();
   const record={...op,id,uid,schema:4,createdAt:Date.now()};
   localStorage.setItem(recordPrefix(uid)+id,JSON.stringify(record));
  }catch{
   lastError="فون کی اسٹوریج میں محفوظ نہیں ہو سکا۔";
   notify();return false;
  }
  lastError="";notify();schedule(150);return true;
 }
 function schedule(delay=150){
  if(!ownerUid||getUid()!==ownerUid)return;
  clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void flush();},delay);
 }
 async function flush(){
  if(busy||!ownerUid||getUid()!==ownerUid||navigator.onLine===false)return;
  const uid=ownerUid;busy=true;notify();
  try{
   for(const op of listOps(uid)){
    if(uid!==ownerUid||getUid()!==uid||navigator.onLine===false)break;
    const k=recordPrefix(uid)+op.id;
    if(!localStorage.getItem(k))continue; // A second tab may have sent it.
    try{
     await send(op);
     if(uid!==ownerUid||getUid()!==uid)break;
     // Delete only the immutable record which was acknowledged by Firebase.
     if(localStorage.getItem(k))localStorage.removeItem(k);
     lastError="";notify();
    }catch(error){
     lastError=String(error?.code||error?.message||error).slice(0,120);
     notify();break; // The SAME receipt id is retried after an unknown acknowledgement.
    }
   }
  }finally{
   busy=false;
   if(uid===ownerUid&&pending()>0)schedule(20000);
   notify();
  }
 }
 function stop(){clearTimeout(timer);timer=null;ownerUid=null;lastError="";notify();}
 window.addEventListener("online",()=>schedule(0));
 window.addEventListener("storage",event=>{
  if(!ownerUid||!event.key||(!event.key.startsWith(recordPrefix(ownerUid))&&event.key!==legacyKey(ownerUid)))return;
  if(event.key===legacyKey(ownerUid))migrateLegacy(ownerUid);
  notify();if(navigator.onLine!==false)schedule(300);
 });
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule(0);});
 return {start,stop,enqueue,pending,byDay,status,schedule,flush};
}
