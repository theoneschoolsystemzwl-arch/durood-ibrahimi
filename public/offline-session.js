// Restricted offline workspace; Firebase Auth is still required. No credentials are cached here.
import {createDurableTasbihSync} from "./tasbih-durable-sync.js?v=reconnect-save-20261126-v6";
import {globalDay} from "./global-clock.js";
import {readingDay} from "./wazaif-counter.js";
import {doc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const names={fajr:"فجر",dhuhr:"ظہر",asr:"عصر",maghrib:"مغرب",isha:"عشاء"};
const modes={clear:"—",jamat:"باجماعت",solo:"بغیر جماعت",made:"قضا ادا",missed:"قضا"};
const key=(uid,kind)=>"durood-offline-v1-"+uid+"-"+kind;
function read(uid,kind,fallback){try{return JSON.parse(localStorage.getItem(key(uid,kind))||"null")??fallback;}catch{return fallback;}}
function write(uid,kind,value){try{localStorage.setItem(key(uid,kind),JSON.stringify(value));return true;}catch{return false;}}
function allowed(task,day){return task&&day>=task.startDate&&!(task.pausePeriods||[]).some(p=>day>=p.startDate&&(!p.endDate||day<p.endDate))&&(task.kind!=="fixed"||day<=task.endDate||(task.continuePeriods||[]).some(p=>day>=p.startDate&&(p.mode==="daily"||day<=p.endDate))||!!(task.continueStartDate&&day>=task.continueStartDate));}
export function createOfflineSession({auth,db,isVerified,blocked}){
 let active=null,host=null,busy=false,selected=null,prayerDay=null;
 const uidNow=()=>auth.currentUser?.uid;
 const sync=(prefix)=>createDurableTasbihSync({prefix,getUid:uidNow,send:async()=>{throw Error("Offline journal waits for verified dashboard");},onChange:()=>updateCount()});
 const group=sync("durood-classic-counts-v3"),personal=sync("durood-wazaif-sync-v3");
 const authorized=uid=>!!uid&&uid===uidNow()&&!blocked();
 const cached=uid=>read(uid,"verified",false)===true;
 function remember(uid){if(authorized(uid)&&navigator.onLine!==false&&isVerified(uid))write(uid,"verified",true);}
 function tasks(uid){const g=read(uid,"group",null),list=read(uid,"tasks",[]).filter(t=>allowed(t,readingDay()));return [...(g?.active?[{id:g.countAsDurood===false?"_group_":"_durood_",title:g.title||"گروپ وظیفہ",arabic:g.arabic}]:[]),...list];}
 function selectTask(uid,id){if(authorized(uid))write(uid,"selected",id);}
 function pending(uid){return read(uid,"prayer-pending",{});}
 function queue(uid,day,changes){if(!authorized(uid)||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
  const ops=pending(uid),stamp=crypto.randomUUID?.()||String(Date.now())+Math.random();
  for(const [prayer,status] of Object.entries(changes)){if(!(prayer in names)||!(status in modes))continue;ops[day+"|"+prayer]={day,prayer,status,stamp};}
  if(!write(uid,"prayer-pending",ops))return false;
  void flushPrayers();return true;
 }
 function cachePrayers(uid,days){if(!authorized(uid))return;const existing=read(uid,"prayers",{});for(const d of days)if(d?.date&&d.statuses)existing[d.date]=d.statuses;
  const keys=Object.keys(existing).sort().slice(-90);write(uid,"prayers",Object.fromEntries(keys.map(d=>[d,existing[d]])));}
 async function flushPrayers(){const uid=uidNow();if(busy||!authorized(uid)||!isVerified(uid)||navigator.onLine===false)return;busy=true;
  try{for(const [id,op] of Object.entries(pending(uid))){if(!authorized(uid)||!isVerified(uid)||navigator.onLine===false)break;
   await setDoc(doc(db,"memberPrivate",uid,"prayers",op.day),{date:op.day,statuses:{[op.prayer]:op.status},updatedAt:serverTimestamp()},{merge:true});
   const latest=pending(uid);if(latest[id]?.stamp===op.stamp){cachePrayers(uid,[{date:op.day,statuses:{...read(uid,"prayers",{})[op.day],[op.prayer]:op.status}}]);delete latest[id];write(uid,"prayer-pending",latest);}
  }}catch(e){console.warn("Offline prayer sync retained",e?.code||e?.message);}finally{busy=false;}}
 function currentSync(){return selected==="_durood_"?group:personal;}
 function updateCount(){if(host&&selected){const el=host.querySelector("[data-count]");if(el)el.textContent=String(currentSync().pending(selected));}}
 function hide(){active=null;host?.remove();host=null;group.stop();personal.stop();}
 function open(uid){if(navigator.onLine!==false||!authorized(uid)||!cached(uid))return false;if(active===uid&&host)return true;
  hide();active=uid;group.start(uid);personal.start(uid);const list=tasks(uid);selected=read(uid,"selected",null);if(!list.some(t=>t.id===selected))selected=list[0]?.id||null;prayerDay=readingDay();
  host=document.createElement("main");host.dir="rtl";host.setAttribute("aria-label","آف لائن عبادت");host.style.cssText="position:fixed;inset:0;z-index:2147483646;background:#073c31;color:white;padding:20px;overflow:auto;font:16px system-ui;text-align:center;box-sizing:border-box";
  host.innerHTML='<h2>آف لائن عبادت</h2><p>لاگ اِن برقرار ہے۔ انٹرنیٹ آنے پر محفوظ ریکارڈ خودکار منتقل ہوگا۔</p><section><label>وظیفہ <select data-task style="max-width:100%;padding:10px"></select></label><p data-arabic style="font-size:23px;line-height:1.8;white-space:pre-wrap;max-height:160px;overflow:auto"></p><p>فون میں محفوظ، زیر التوا گنتی</p><button type="button" data-tap style="width:180px;height:180px;border-radius:50%;border:6px solid #a0d6b4;background:#126b4c;color:white;font-size:50px;touch-action:manipulation"><span data-count>0</span></button><p data-note role="status"></p></section><hr><h2>نماز کی حاضری</h2><input data-day type="date"><div data-prayers></div><p>دیگر سیٹنگز انٹرنیٹ آنے پر دستیاب ہوں گی۔</p>';
  document.body.append(host);const select=host.querySelector("[data-task]");for(const t of list){const opt=document.createElement("option");opt.value=t.id;opt.textContent=t.title||t.name||"وظیفہ";select.append(opt);}select.value=selected||"";select.disabled=!selected;
  const tap=host.querySelector("[data-tap]"),note=host.querySelector("[data-note]");tap.disabled=!selected;if(!selected)note.textContent="وظائف کا محفوظ فہرست ریکارڈ موجود نہیں۔";
  const showArabic=()=>{host.querySelector("[data-arabic]").textContent=list.find(t=>t.id===selected)?.arabic||"";};showArabic();
  select.onchange=()=>{selected=select.value;selectTask(uid,selected);showArabic();updateCount();};
  tap.onclick=()=>{if(!authorized(uid)||navigator.onLine!==false||!selected)return;const t=tasks(uid).find(t=>t.id===selected);if(!t){note.textContent="اس تاریخ کو وظیفہ دستیاب نہیں۔";return;}const day=selected.startsWith("_")?globalDay():readingDay();if(!currentSync().enqueue({taskId:selected,day,count:1,source:"tasbih"})){note.textContent="فون میں محفوظ نہیں ہوا۔";return;}note.textContent="فون میں محفوظ";updateCount();};
  const date=host.querySelector("[data-day]");date.value=prayerDay;date.max=readingDay();
  function renderPrayers(){const area=host.querySelector("[data-prayers]");area.replaceChildren();const local=read(uid,"prayers",{})[prayerDay]||{},ops=pending(uid);for(const [prayer,label] of Object.entries(names)){const row=document.createElement("label");row.style.cssText="display:flex;justify-content:space-between;align-items:center;padding:8px";row.textContent=label;const input=document.createElement("select");input.style.padding="7px";for(const [value,text] of Object.entries(modes)){const opt=document.createElement("option");opt.value=value;opt.textContent=text;input.append(opt);}input.value=ops[prayerDay+"|"+prayer]?.status||local[prayer]||"clear";input.onchange=()=>{if(!queue(uid,prayerDay,{[prayer]:input.value})){note.textContent="نماز فون میں محفوظ نہیں ہوئی۔";renderPrayers();}else note.textContent="نماز فون میں محفوظ ہے۔";};row.append(input);area.append(row);}}
  date.onchange=()=>{if(date.value&&date.value<=readingDay()){prayerDay=date.value;renderPrayers();}};renderPrayers();updateCount();return true;
 }
 window.duroodCacheTasks=(uid,list)=>{if(authorized(uid))write(uid,"tasks",list.map(t=>({id:t.id,title:t.title,name:t.name,kind:t.kind,startDate:t.startDate,endDate:t.endDate,pausePeriods:t.pausePeriods,continuePeriods:t.continuePeriods,continueStartDate:t.continueStartDate,arabic:typeof t.arabic==="string"&&t.arabic.length<=150000&&!t.arabic.startsWith("data:")?t.arabic:""})));};
 window.duroodCacheGroup=(uid,g)=>{if(authorized(uid))write(uid,"group",g?{title:g.title,active:g.active,countAsDurood:g.countAsDurood,arabic:typeof g.arabic==="string"&&g.arabic.length<=150000&&!g.arabic.startsWith("data:")?g.arabic:""}:null);};
 window.duroodSelectOfflineTask=selectTask;window.duroodQueuePrayer=queue;window.duroodCachePrayers=cachePrayers;
 window.addEventListener("offline",()=>{if(uidNow())open(uidNow());});
 window.addEventListener("online",()=>{if(active){hide();location.reload();}else void flushPrayers();},true);
 setInterval(()=>{if(navigator.onLine!==false&&Object.keys(pending(uidNow())).length)void flushPrayers();},20000);
 return {open,hide,remember,flushPrayers};
}
