// Durable, exactly-once tasbih uploads; browser storage is a retry journal,
// never a second source of truth for committed Firebase totals.
export function createDurableTasbihSync({prefix,send,getUid,onChange=()=>{}}){
 let ownerUid=null,journal={pending:[],inflight:null},busy=false,timer=null,lastError="";
 const key=uid=>prefix+"-"+uid;
 const notify=()=>{try{onChange(status());}catch{}};
 function load(uid){
  try{
   const j=JSON.parse(localStorage.getItem(key(uid))||"null");
   if(j?.schema===3&&Array.isArray(j.pending))
    return {pending:j.pending.filter(item=>item&&typeof item.taskId==="string"),inflight:j.inflight||null};
  }catch{}
  return {pending:[],inflight:null};
 }
 function persist(){
  if(!ownerUid)return false;
  try{
   localStorage.setItem(key(ownerUid),JSON.stringify({schema:3,...journal}));
   return true;
  }catch{
   lastError="فون کی اسٹوریج دستیاب نہیں۔";
   notify();return false;
  }
 }
 function id(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
 }
 function pending(taskId=null,day=null){
  return [...journal.pending,...(journal.inflight?[journal.inflight]:[])]
   .filter(x=>(!taskId||x.taskId===taskId)&&(!day||x.day===day))
   .reduce((n,x)=>n+Math.max(0,Number(x.count)||0),0);
 }
 function status(){return {pending:pending(),error:lastError,online:navigator.onLine!==false,busy};}
 function start(uid){
  if(!uid||ownerUid===uid)return;
  clearTimeout(timer);timer=null;
  ownerUid=uid;journal=load(uid);lastError="";
  schedule(50);notify();
 }
 function enqueue({taskId,day,source="tasbih",count=1,durationMs=0,intervals=0}){
  if(!ownerUid||getUid()!==ownerUid||typeof taskId!=="string"||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(count)||count<1||count>1000||
    !Number.isSafeInteger(durationMs)||durationMs<0||durationMs>86400000||
    !Number.isSafeInteger(intervals)||intervals<0||intervals>count)return false;
  const last=journal.pending.at(-1);
  const aggregate=last&&last.taskId===taskId&&last.day===day&&last.source===source&&
   last.count+count<=1000&&last.durationMs+durationMs<=86400000;
  const old=aggregate?{...last}:null;
  if(aggregate){last.count+=count;last.durationMs+=durationMs;last.intervals+=intervals;}
  else journal.pending.push({taskId,day,source,count,durationMs,intervals});
  if(!persist()){
   if(aggregate)Object.assign(last,old);else journal.pending.pop();
   return false;
  }
  lastError="";notify();schedule(130);return true;
 }
 function schedule(delay=130){
  if(!ownerUid||getUid()!==ownerUid)return;
  clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void flush();},delay);
 }
 async function flush(){
  if(busy||!ownerUid||getUid()!==ownerUid||navigator.onLine===false)return;
  const uid=ownerUid;buzzy(true);
  try{
   while(uid===ownerUid&&getUid()===uid){
    if(!journal.inflight){
     if(!journal.pending.length)break;
     const operation=journal.pending.shift();
     journal.inflight={...operation,id:id()};
     if(!persist()){
      journal.inflight=null;journal.pending.unshift(operation);break;
     }
    }
    const operation=journal.inflight;
    try{
     await send(operation);
     if(uid!==ownerUid||getUid()!==uid)break;
     journal.inflight=null;
     persist();lastError="";notify();
    }catch(error){
     lastError=String(error?.code||error?.message||error).slice(0,120);
     notify();break; // Keep the exact ID for a safe retry.
    }
   }
  }finally{
   buzzy(false);
   if(uid===ownerUid&&pending()>0)schedule(20000);
   notify();
  }
 }
 function buzzy(value){busy=value;notify();}
 function stop(){clearTimeout(timer);timer=null;ownerUid=null;journal={pending:[],inflight:null};lastError="";}
 window.addEventListener("online",()=>schedule(0));
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule(0);});
 return {start,stop,enqueue,pending,status,schedule,flush};
}
