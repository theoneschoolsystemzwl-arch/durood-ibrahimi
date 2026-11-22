// Authenticated Wazaif: one owner-controlled group task and private member tasks.
// No personal task is ever stored in another member's browser or Firestore path.
import {auth,db} from "./firebase-client.js";
import {readingDay,recordPersonalWazifa,recordGroupWazifaOnly} from "./wazaif-counter.js";
import {collection,doc,onSnapshot,query,limit,serverTimestamp,setDoc,updateDoc,deleteDoc}
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {wazifaSerial,validMemberSerial,assignLegacyWazifaSerial,createPersonalWazifaWithSerial,
  sharePersonalWazifa,acceptSharedWazifa,discardSharedWazifa,inboxCollection}
  from "./wazifa-sharing.js";

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>new Intl.NumberFormat("en").format(Math.max(0,Number(n)||0));
const dayOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||"")) && !Number.isNaN(Date.parse(s+"T12:00:00Z"));
const spanDays=(a,b)=>dayOk(a)&&dayOk(b)?Math.max(1,Math.floor((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000)+1):0;
const defaultGroup=()=>({
 title:"درودِ ابراہیمی",arabic:"اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ.\nاللَّهُمَّ بَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ.",
 instructions:"ہر مرتبہ مکمل درودِ ابراہیمی پڑھنے کے بعد تسبیح کو ایک بار دبائیں۔",
 purpose:"درودِ ابراہیمی کی مشترکہ روزانہ تلاوت",kind:"group",active:true,
 countAsDurood:true,dailyGoal:200,yearlyGoal:1000000,startDate:readingDay()
});
const state={
 profile:null,group:null,groupExists:false,groupStats:null,yearStats:null,personal:[],
 mode:"list",formScope:"personal",editId:null,readerId:null,panel:null,error:"",
 inbox:[],shareFor:null,shareNotice:"",migrating:false,migrationPromise:null,
 subscriptions:[],started:false,bootstrapTried:false,busy:false,
 tapQueue:0,tapBusy:false,pendingBack:false,dialFloating:false,skipDialClick:false,clockStart:null,clockMs:0,clockIntervals:0,clockLastTap:null,
 seenDay:readingDay()
};
const owner=()=>state.profile?.role==="owner";
const currentGroup=()=>state.group||defaultGroup();
const personalList=()=>state.personal.slice().sort((a,b)=>
 (Number(a.wNumber)||9999999999)-(Number(b.wNumber)||9999999999) ||
 (Number(a.createdAt?.seconds)||0)-(Number(b.createdAt?.seconds)||0) ||
 a.id.localeCompare(b.id));
async function reconcileLegacySerials(){
 if(state.migrating||!auth.currentUser||state.profile?.uid!==auth.currentUser.uid)return state.migrationPromise;
 const legacy=state.personal.filter(item=>!Number.isSafeInteger(item.wNumber)||item.wNumber<1)
   .sort((a,b)=>(Number(a.createdAt?.seconds)||0)-(Number(b.createdAt?.seconds)||0)||a.id.localeCompare(b.id));
 if(!legacy.length)return;
 const uid=state.profile.uid;state.migrating=true;
 state.migrationPromise=(async()=>{
   for(const item of legacy){
     if(auth.currentUser?.uid!==uid)break;
     await assignLegacyWazifaSerial(item.id);
   }
 })().catch(setError).finally(()=>{state.migrating=false;state.migrationPromise=null;});
 return state.migrationPromise;
}
function stop(){
  state.subscriptions.forEach(fn=>{try{fn();}catch{}});
  state.subscriptions=[];state.started=false;state.migrating=false;state.migrationPromise=null;
}
function setMember(profile){
  if(!profile?.uid)return;
  if(state.profile?.uid===profile.uid){state.profile=profile;return;}
  stop();
  state.profile=profile;state.group=null;state.groupExists=false;state.groupStats=null;
  state.yearStats=null;state.personal=[];state.inbox=[];state.shareFor=null;state.shareNotice="";state.mode="list";state.error="";
  state.bootstrapTried=false;state.tapQueue=0;state.tapBusy=false;
}
function setError(e){
  state.error=String(e?.code||e?.message||e||"رابطہ دستیاب نہیں").slice(0,180);
  const form=$("#wazifa-form");
  if(form){
    let region=form.querySelector(".wz-error");
    if(!region){region=document.createElement("p");region.className="wz-error";form.append(region);}
    region.textContent=state.error;
  }else render();
}
async function initializeGroup(){
  if(!owner()||state.groupExists||state.bootstrapTried)return;
  state.bootstrapTried=true;
  const value=defaultGroup();
  try{
    await setDoc(doc(db,"wazaifSettings","group"),{
      ...value,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
  }catch(e){setError("گروپ کی پہلی سیٹنگ محفوظ نہیں ہو سکی: "+(e.code||e.message));}
}
function subscribe(){
  if(state.started||!state.profile||!auth.currentUser)return;
  const uid=state.profile.uid;state.started=true;
  const safe=callback=>snap=>{if(auth.currentUser?.uid!==uid)return;callback(snap);};
  const err=e=>{if(auth.currentUser?.uid===uid)setError(e);};
  state.subscriptions.push(onSnapshot(doc(db,"wazaifSettings","group"),safe(snap=>{
    state.groupExists=snap.exists();
    state.group=snap.exists()?snap.data():null;
    if(!snap.exists()&&!snap.metadata.fromCache&&owner())initializeGroup();
    if(state.mode!=="form")render();
  }),err));
  state.subscriptions.push(onSnapshot(doc(db,"wazaifGroupStats","main"),safe(snap=>{
    state.groupStats=snap.exists()?snap.data():null;if(state.mode!=="form")render();
  }),err));
  state.subscriptions.push(onSnapshot(doc(db,"wazaifGroupStats","main","years",String(new Date().getFullYear())),safe(snap=>{
    state.yearStats=snap.exists()?snap.data():null;if(state.mode!=="form")render();
  }),err));
  const ownCollection=query(collection(db,"memberWazaif",uid,"items"),limit(100));
  state.subscriptions.push(onSnapshot(ownCollection,safe(snap=>{
    state.personal=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(state.mode!=="form")render();
    void reconcileLegacySerials();
  }),err));
  state.subscriptions.push(onSnapshot(query(inboxCollection(uid),limit(100)),safe(snap=>{
    state.inbox=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(Number(a.createdAt?.seconds)||0)-(Number(b.createdAt?.seconds)||0));
    if(state.mode==="list")render();
  }),err));
}
function metric(label,value,extra=""){
 return '<div class="wz-metric"><small>'+esc(label)+'</small><strong>'+fmt(value)+'</strong>'+(extra?'<small>'+esc(extra)+'</small>':'')+'</div>';
}
function renderAccounting(group=false,task=null){
 const today=readingDay(),stats=state.groupStats||{},annual=state.yearStats||{};
 const record=group?stats:task||{};
 const todayTotal=record.day===today?Number(record.today||0):0;
 const total=Number(record.total||0);
 const target=group?Number(currentGroup().dailyGoal||0):
   task?.kind==="daily"?Number(task.goal||0):task?.kind==="fixed"?
     Math.ceil((Number(task.goal||0))/Math.max(1,spanDays(task.startDate,task.endDate))):0;
 const yearGoal=group?Number(currentGroup().yearlyGoal||0):0;
 const yearTotal=group?Number(annual.total||0):0;
 return '<div class="wz-accounting"><div class="wz-metrics">'+metric("آج کی اکاؤنٹنگ",todayTotal)+
 metric("مجموعی شمار",total)+metric("روزانہ ہدف",target)+
 (group?metric("سالانہ شمار",yearTotal)+metric("سالانہ ہدف",yearGoal)+metric("سالانہ باقی",Math.max(0,yearGoal-yearTotal)):metric("ہدف سے باقی",Math.max(0,(task?.goal||0)-(task?.kind==="daily"?todayTotal:total))))+
 '</div>'+(group?'<p class="wz-help">گروپ کی گنتی اس فیچر کے فعال ہونے کے بعد سے محفوظ ہوتی ہے؛ پرانا درود ریکارڈ اپنی جگہ محفوظ ہے۔</p>':'')+
 (target?'<progress class="wz-progress" max="'+target+'" value="'+Math.min(target,todayTotal)+'"></progress>':'')+'</div>';
}
function groupCard(){
 const g=currentGroup(),enabled=g.active===true,ready=state.groupExists;
 return '<article class="wz-card wz-group '+(enabled?'is-live':'is-off')+'">'+
 '<header class="wz-card-head"><div><span class="wz-caption">گروپ وظیفہ</span><h2>'+esc(g.title)+'</h2></div>'+
 '<span class="wz-state '+(enabled?'on':'')+'"><i class="wz-led"></i>'+(enabled?'جاری ہے':'بند ہے')+'</span></header>'+
 '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(g.arabic)+'</p>'+
 '<p class="wz-help">'+esc(g.instructions)+'</p>'+
 '<div class="wz-actions"><button type="button" class="wz-button" data-wazifa-action="account-group">اکاؤنٹنگ</button>'+
 (owner()?'<button type="button" class="wz-button" data-wazifa-action="edit-group">سیٹنگ</button>':'')+
 '<button type="button" class="wz-button wz-primary" data-wazifa-action="read-group" '+(!enabled||!ready?'disabled':'')+'>تسبیح کریں</button></div>'+
 (state.panel==="group"?renderAccounting(true):'')+
 (!ready?'<p class="wz-help">گروپ کی سیٹنگ Firebase میں محفوظ ہونے کے بعد مشترکہ تسبیح شروع ہوگی۔</p>':'')+
 '</article>';
}
function taskStatus(task){
 const now=readingDay();
 if(task.startDate>now)return "شروع نہیں ہوا";
 if(task.kind==="fixed"&&task.endDate<now)return "مدت مکمل";
 return "جاری";
}
function personalCard(task){
 const end=task.kind==="fixed"?' · '+esc(task.endDate):'';
 const days=task.kind==="fixed"?' · '+spanDays(task.startDate,task.endDate)+' دن':'';
 const stateText=taskStatus(task);
 return '<article class="wz-card wz-personal">'+
 '<div class="wz-tasbih-top"><button type="button" class="wz-button wz-primary wz-tasbih-cta" data-wazifa-action="read-personal" data-wazifa-id="'+esc(task.id)+'" '+(stateText!=="جاری"?'disabled':'')+'>📿 تسبیح کریں</button></div>'+
 '<header class="wz-card-head"><div><span class="wz-caption">ذاتی وظیفہ · '+esc({daily:"ڈیلی",fixed:"فکس",open:"اوپن"}[task.kind]||"")+'</span><h3><bdi dir="ltr" class="wz-serial">'+esc(wazifaSerial(task))+'</bdi> · '+esc(task.title)+'</h3></div><span class="wz-state">'+stateText+'</span></header>'+
 '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(task.arabic)+'</p><p class="wz-help">'+esc(task.instructions)+'</p>'+
 '<p class="wz-help">آغاز '+esc(task.startDate)+end+days+'</p>'+
 '<div class="wz-actions"><button type="button" class="wz-button" data-wazifa-action="account-personal" data-wazifa-id="'+esc(task.id)+'">اکاؤنٹنگ</button>'+
 '<button type="button" class="wz-button" data-wazifa-action="edit-personal" data-wazifa-id="'+esc(task.id)+'">سیٹنگ</button>'+
 '<button type="button" class="wz-button" data-wazifa-action="share-personal" data-wazifa-id="'+esc(task.id)+'" '+(!Number.isSafeInteger(task.wNumber)?'disabled':'')+'>دوسرے یوزر کو شیئر کریں</button>'+
 '</div>'+
 (state.shareFor===task.id?'<div class="wz-share-form" role="group"><label for="wz-share-target">صرف اپنی سائیڈ کی ممبر آئی ڈی (مثلاً DI-2)</label>'+
 '<div class="wz-share-row"><input id="wz-share-target" placeholder="'+(state.profile?.gender==="female"?"D2":"DI-2")+'" dir="ltr" autocomplete="off" maxlength="16" aria-label="وصول کنندہ ممبر آئی ڈی">'+
 '<button type="button" class="wz-button wz-primary" data-wazifa-action="send-personal" data-wazifa-id="'+esc(task.id)+'">وظیفہ بھیجیں</button></div>'+
 '<p class="wz-help">مردوں کی شناخت DI-1، DI-2 اور خواتین کی D1، D2 ہے۔ شیئرنگ صرف اپنی سائیڈ میں ہوگی۔</p></div>':'')+
 (state.panel===task.id?renderAccounting(false,task):'')+'</article>';
}
function inboxMarkup(){
 if(!state.inbox.length)return "";
 return '<section class="wz-inbox"><h2 class="wz-subtitle">شیئرڈ وظائف · '+fmt(state.inbox.length)+'</h2>'+
 '<p class="wz-help">وظیفہ محفوظ کرنے سے آپ کے اکاؤنٹ میں اگلا W نمبر خود بن جائے گا۔ حذف کرنے سے یہ مستقل ذاتی فہرست میں شامل نہیں ہوگا۔</p>'+
 state.inbox.map(item=>'<article class="wz-card wz-received">'+
 '<header class="wz-card-head"><div><span class="wz-caption">شیئرڈ وظیفہ · بھیجنے والا <bdi dir="ltr">'+esc(item.senderSerial)+'</bdi></span>'+
 '<h3>'+esc(item.title)+'</h3></div></header>'+
 '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(item.arabic)+'</p>'+
 '<p class="wz-help">'+esc(item.instructions)+'</p>'+
 '<div class="wz-actions"><button type="button" class="wz-button wz-primary" data-wazifa-action="accept-share" data-wazifa-id="'+esc(item.id)+'">محفوظ کریں</button>'+
 '<button type="button" class="wz-button wz-delete" data-wazifa-action="reject-share" data-wazifa-id="'+esc(item.id)+'">حذف کریں</button></div></article>').join('')+'</section>';
}
function listMarkup(){
 return '<header class="wz-title"><h1>میرے وظائف</h1><button type="button" class="wz-button wz-primary" data-wazifa-action="new">+ نیا وظیفہ</button></header>'+
 '<p class="wz-help">ہر اکاؤنٹ کی ذاتی گنتی W-1 سے شروع ہوتی ہے؛ حذف ہونے والا نمبر دوبارہ کسی دوسرے وظیفے کو نہیں دیا جائے گا۔</p>'+
 groupCard()+inboxMarkup()+'<h2 class="wz-subtitle">میرے ذاتی وظائف</h2>'+
 (state.shareNotice?'<p class="wz-notice" role="status">'+esc(state.shareNotice)+'</p>':'')+
 (personalList().length?personalList().map(personalCard).join(''):'<div class="wz-empty">ابھی کوئی ذاتی وظیفہ شامل نہیں۔ اوپر نیا وظیفہ دبائیں۔</div>');
}
function formMarkup(){
 const g=state.formScope==="group";
 const original=g?currentGroup():state.personal.find(w=>w.id===state.editId)||{};
 const kind=g?"group":original.kind||"daily";
 const kinds=[["daily","ڈیلی وظیفہ","ہر روز پڑھنا ہے"],["fixed","فکس وظیفہ","مقررہ تاریخ تک"],["open","اوپن وظیفہ","اپنی مرضی سے"]];
 if(owner())kinds.push(["group","گروپ وظیفہ","تمام ممبرز کے لیے"]);
 const title=g?"گروپ وظیفے کی سیٹنگ":state.editId?"ذاتی وظیفے میں ترمیم":"نیا وظیفہ";
 return '<div class="wz-form-head"><button type="button" class="wz-button" data-wazifa-action="back">بند کریں</button><h2>'+title+'</h2></div>'+
 '<form id="wazifa-form" class="wz-form"><label>وظیفے کا نام<input name="title" required maxlength="80" placeholder="مثلاً آیت الکرسی" value="'+esc(original.title||'')+'"></label>'+
 '<label>عربی عبارت / درود<textarea name="arabic" rows="4" required maxlength="3000" placeholder="عربی عبارت درج کریں">'+esc(original.arabic||'')+'</textarea></label>'+
 '<label>طریقہ / ہدایات<textarea name="instructions" rows="3" maxlength="1200" placeholder="پڑھنے کا طریقہ">'+esc(original.instructions||'')+'</textarea></label>'+
 '<label>وظیفے کا مقصد<textarea name="purpose" rows="3" maxlength="1200" placeholder="اس وظیفے کا مقصد">'+esc(original.purpose||'')+'</textarea></label>'+
 '<p class="wz-label">وظیفے کی قسم منتخب کریں</p><div class="wz-kind">'+kinds.map(([id,name,description])=>
   '<label class="wz-kind-choice"><input type="radio" name="kind" value="'+id+'" '+(kind===id?'checked':'')+'><span><b>'+name+'</b><small>'+description+'</small></span></label>'
 ).join('')+'</div>'+
 '<div class="wz-form-goals"><label class="wz-goal-field" data-wz-goal="daily">روزانہ ہدف<input name="dailyGoal" type="number" min="1" max="1000000000" value="'+esc(original.dailyGoal||original.goal||200)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="total">کل ہدف<input name="goal" type="number" min="1" max="1000000000" value="'+esc(original.goal||1000)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="year">سالانہ کل ہدف<input name="yearlyGoal" type="number" min="1" max="1000000000" value="'+esc(original.yearlyGoal||1000000)+'"></label></div>'+
 '<div class="wz-dates"><label>آغاز کی تاریخ<input name="startDate" type="date" required value="'+esc(original.startDate||readingDay())+'"></label>'+
 '<label data-wz-end>اختتامی تاریخ<input name="endDate" type="date" value="'+esc(original.endDate||'')+'"></label></div>'+
 '<p class="wz-help" id="wz-date-preview"></p>'+
 '<label class="wz-toggle" data-wz-group><input type="checkbox" name="active" '+(g&&original.active===false?'':'checked')+'> گروپ وظیفہ فعال رکھیں</label>'+
 '<label class="wz-toggle" data-wz-group><input type="checkbox" name="countAsDurood" '+(!g||original.countAsDurood!==false?'checked':'')+'> یہ درود شریف ہے (مجموعی درود میں بھی شمار کریں)</label>'+
 '<p class="wz-help">گروپ سیٹنگ صرف Owner کو نظر آئے گی؛ ذاتی وظیفہ صرف اپنے اکاؤنٹ میں محفوظ ہوگا۔</p>'+
 '<button type="submit" class="wz-button wz-primary" '+(state.busy?'disabled':'')+'>محفوظ کریں</button>'+
 (state.editId&&!g?'<button type="button" class="wz-button wz-delete" data-wazifa-action="delete-personal" data-wazifa-id="'+esc(state.editId)+'">وظیفہ حذف کریں</button>':'')+
 '</form>';
}
function readerMarkup(group){
 const w=group?currentGroup():state.personal.find(x=>x.id===state.readerId);
 if(!w)return '<button class="wz-button" data-wazifa-action="back">فہرست واپس</button>';
 const record=group?state.groupStats||{}:w;
 const today=readingDay(),count=record.day===today?Number(record.today||0):0;
 const target=group?Number(w.dailyGoal||0):w.kind==="daily"?Number(w.goal||0):
   w.kind==="fixed"?Math.ceil(Number(w.goal||0)/Math.max(1,spanDays(w.startDate,w.endDate))):Number(w.goal||0);
 const step=Math.max(1,target||100);
 const progress=count>0&&count%step===0?100:(count%step)/step*100;
 const label=group?"گروپ تسبیح":"ذاتی تسبیح";
 return '<div class="wz-form-head"><button type="button" class="wz-button" data-wazifa-action="back">وظائف واپس</button><h2>'+label+'</h2></div>'+
 '<section class="wz-reading"><h2>'+esc(w.title)+'</h2><div class="wz-arabic" lang="ar" dir="rtl">'+esc(w.arabic)+'</div>'+
 '<p class="wz-help">'+esc(w.instructions)+'</p>'+
 '<div class="wz-metrics">'+metric("آج پڑھا",count)+metric("کل پڑھا",record.total||0)+metric("آج کا ہدف",target)+'</div>'+
 '<button type="button" id="wz-dial" class="wz-dial'+(state.dialFloating?' is-floating':'')+'" style="--wz-ring:'+progress+'%" data-wazifa-action="tap"><small>آج کی تسبیح</small><strong id="wz-dial-number">'+fmt(count+state.tapQueue)+'</strong><small id="wz-clock">00:00:00.000</small></button>'+
 '<p class="wz-help">ایک مرتبہ پڑھ کر گول تسبیح دبائیں۔ 15 سیکنڈ کی خاموشی پر وقت رک جائے گا۔</p>'+
 (state.tapQueue?'<p class="wz-help">'+fmt(state.tapQueue)+' شمار محفوظ ہو رہے ہیں…</p>':'')+
 (state.error?'<p class="wz-error">'+esc(state.error)+'</p>':'')+'</section>';
}
function render(){
 const root=$("#wazaif-root");
 if(!root||!state.profile)return;
 if(!state.started)subscribe();
 if(state.mode==="form"){
   if(root.querySelector("#wazifa-form"))return;
   root.innerHTML=formMarkup();syncForm();return;
 }
 if(state.mode==="personal-reader"||state.mode==="group-reader"){
   if(root.querySelector("#wz-dial")){
     const group=state.mode==="group-reader";
     const task=group?state.groupStats:state.personal.find(x=>x.id===state.readerId);
     const config=group?currentGroup():task;
     if(task&&config){
       const today=readingDay(),count=task.day===today?Number(task.today||0):0;
       const shown=count+state.tapQueue;
       const target=group?Number(config.dailyGoal||0):config.kind==="daily"?Number(config.goal||0):
         config.kind==="fixed"?Math.ceil(Number(config.goal||0)/Math.max(1,spanDays(config.startDate,config.endDate))):Number(config.goal||0);
       const num=$("#wz-dial-number");if(num)num.textContent=fmt(shown);
       const metrics=root.querySelectorAll(".wz-reading .wz-metric strong");
       if(metrics[0])metrics[0].textContent=fmt(shown);
       if(metrics[1])metrics[1].textContent=fmt(Number(task.total||0)+state.tapQueue);
       if(metrics[2])metrics[2].textContent=fmt(target);
       const step=Math.max(1,target||100);
       const progress=shown>0&&shown%step===0?100:(shown%step)/step*100;
       root.querySelector("#wz-dial").style.setProperty("--wz-ring",progress+"%");
     }
     return;
   }
   root.innerHTML=readerMarkup(state.mode==="group-reader");return;
 }
 root.innerHTML=listMarkup()+(state.error?'<p class="wz-error">'+esc(state.error)+'</p>':'');
}
function syncForm(){
 const form=$("#wazifa-form");if(!form)return;
 const kind=form.elements.kind.value;
 form.querySelectorAll('[data-wz-goal]').forEach(el=>{
   const type=el.dataset.wzGoal;
   el.hidden=!(kind==="group"?(type==="daily"||type==="year"):kind==="daily"?type==="daily":type==="total");
   el.querySelector("input").required=!el.hidden;
 });
 const end=form.querySelector("[data-wz-end]");
 end.hidden=kind!=="fixed";end.querySelector("input").required=kind==="fixed";
 form.querySelectorAll("[data-wz-group]").forEach(el=>el.hidden=kind!=="group");
 const start=form.elements.startDate.value,stop=form.elements.endDate.value;
 const n=spanDays(start,stop),target=Number(form.elements.goal.value||0);
 $("#wz-date-preview").textContent=kind==="fixed"?
   (n&&stop>=start?"کل دن: "+fmt(n)+" · روزانہ مطلوبہ تعداد: "+fmt(Math.ceil(target/n))+" · اختتام: "+stop:"آغاز اور اختتام کی درست تاریخ منتخب کریں۔"):
   kind==="daily"?"روزانہ وظیفہ شروع ہوگا، آخری تاریخ مقرر نہیں۔":
   kind==="open"?"مجموعی ہدف ہوگا، اختتامی تاریخ مقرر نہیں۔":
   "یہ گروپ وظیفہ تمام ممبرز کو سب سے اوپر نظر آئے گا۔";
}
function openForm(scope,id=null){
 if(scope==="group"&&!owner())return;
 state.formScope=scope;state.editId=id;
 state.mode="form";state.error="";
 const root=$("#wazaif-root");if(root)root.innerHTML="";
 render();
}
function back(){
 if(state.tapBusy){state.pendingBack=true;return;}
 state.pendingBack=false;state.mode="list";state.panel=null;state.readerId=null;state.tapQueue=0;state.clockLastTap=null;state.dialFloating=false;state.skipDialClick=false;
 const root=$("#wazaif-root");if(root)root.innerHTML="";
 render();
}
async function saveForm(form){
 if(state.busy)return;
 const data=new FormData(form);
 const kind=String(data.get("kind")||"");
 if(!["daily","fixed","open","group"].includes(kind))return;
 if(kind==="group"&&!owner())return;
 const title=String(data.get("title")||"").trim(),arabic=String(data.get("arabic")||"").trim();
 const startDate=String(data.get("startDate")||""),endDate=kind==="fixed"?String(data.get("endDate")||""):"";
 const goal=Number(data.get("goal")),dailyGoal=Number(data.get("dailyGoal")),yearlyGoal=Number(data.get("yearlyGoal"));
 if(!title||!arabic||!dayOk(startDate)||(kind==="fixed"&&(!dayOk(endDate)||endDate<startDate))){
   setError("عنوان، عبارت اور تاریخ درست درج کریں۔");return;
 }
 const valid=n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000000;
 if((kind==="daily"&&!valid(dailyGoal))||(kind==="fixed"||kind==="open")&&!valid(goal)||
   kind==="group"&&(!valid(dailyGoal)||!valid(yearlyGoal))){
   setError("ہدف 1 سے ایک ارب کے درمیان مکمل عدد درج کریں۔");return;
 }
 const common={title,arabic,instructions:String(data.get("instructions")||"").trim(),
  purpose:String(data.get("purpose")||"").trim(),startDate};
 state.busy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{
   if(kind==="group"){
     const value={...common,kind:"group",dailyGoal,yearlyGoal,
       active:data.has("active"),countAsDurood:data.has("countAsDurood"),updatedAt:serverTimestamp()};
     const ref=doc(db,"wazaifSettings","group");
     if(state.groupExists)await updateDoc(ref,value);
     else await setDoc(ref,{...value,createdAt:serverTimestamp()});
   }else{
     const config={...common,kind,goal:kind==="daily"?dailyGoal:goal,
       endDate,updatedAt:serverTimestamp()};
     const uid=auth.currentUser.uid;
     if(state.editId)await updateDoc(doc(db,"memberWazaif",uid,"items",state.editId),config);
     else {
       await reconcileLegacySerials();
       const result=await createPersonalWazifaWithSerial(config);
       state.shareNotice="وظیفہ "+wazifaSerial(result)+" محفوظ ہو گیا۔";
     }
   }
   state.error="";state.mode="list";state.editId=null;
   const root=$("#wazaif-root");if(root)root.innerHTML="";
   render();
 }catch(e){setError("محفوظ نہیں ہو سکا: "+(e.code||e.message));}
 finally{state.busy=false;if(button.isConnected)button.disabled=false;}
}
function startClock(){
 state.clockStart=performance.now();state.clockLastTap=null;state.clockMs=0;state.clockIntervals=0;
}
function tap(){
 if(state.skipDialClick){state.skipDialClick=false;return;}
 if(state.busy||!auth.currentUser||!["group-reader","personal-reader"].includes(state.mode))return;
 const now=performance.now(),gap=state.clockLastTap===null?0:now-state.clockLastTap;
 if(gap>0&&gap<=15000){state.clockMs+=gap;state.clockIntervals++;}
 state.clockLastTap=now;
 state.tapQueue++;
 const counter=$("#wz-dial-number");if(counter)counter.textContent=fmt(Number(counter.textContent.replace(/,/g,""))+1);
 if(!state.tapBusy)drain();
}
async function drain(){
 if(state.tapBusy)return;
 state.tapBusy=true;
 while(state.tapQueue){
   const amount=Math.min(state.tapQueue,1000),mode=state.mode,task=state.readerId;
   const day=readingDay();
   try{
     if(mode==="group-reader")await recordGroupWazifaOnly(amount,day);
     else await recordPersonalWazifa(task,amount,day);
     state.tapQueue-=amount;
     state.error="";
   }catch(e){
     state.tapQueue=0;
     setError("شمار محفوظ نہیں ہوا، دوبارہ کوشش کریں: "+(e.code||e.message));
     break;
   }
 }
 state.tapBusy=false;
 if(state.pendingBack){back();return;}
 render();
}
function tick(){
 if(!["personal-reader","group-reader"].includes(state.mode)||document.hidden)return;
 let extra=0;
 if(state.clockLastTap!==null){
   const idle=performance.now()-state.clockLastTap;
   if(idle>=15000){state.clockMs+=15000;state.clockLastTap=null;}
   else extra=idle;
 }
 const value=state.clockMs+extra,h=Math.floor(value/3600000),m=Math.floor(value/60000)%60,s=Math.floor(value/1000)%60,ms=Math.floor(value%1000);
 const clock=$("#wz-clock");
 if(clock)clock.textContent=[h,m,s].map(x=>String(x).padStart(2,"0")).join(":")+"."+String(ms).padStart(3,"0");
 if(state.seenDay!==readingDay()){
   state.seenDay=readingDay();state.clockLastTap=null;render();
 }
}
setInterval(tick,125);
let longHoldTimer=null;
document.addEventListener("pointerdown",event=>{
 const dial=event.target.closest("#wz-dial");
 if(!dial||event.button>0)return;
 clearTimeout(longHoldTimer);
 longHoldTimer=setTimeout(()=>{
   if(!dial.isConnected)return;
   state.dialFloating=!state.dialFloating;
   state.skipDialClick=true;
   dial.classList.toggle("is-floating",state.dialFloating);
 },5000);
},true);
for(const kind of ["pointerup","pointercancel","pointerleave"]){
 document.addEventListener(kind,()=>clearTimeout(longHoldTimer),true);
}

document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&state.clockLastTap!==null){
   state.clockMs+=Math.min(15000,Math.max(0,performance.now()-state.clockLastTap));
   state.clockLastTap=null;
 }
});
document.addEventListener("click",event=>{
 const button=event.target.closest("[data-wazifa-action]");
 if(!button)return;
 const action=button.dataset.wazifaAction,id=button.dataset.wazifaId;
 event.preventDefault();event.stopImmediatePropagation();
 if(action==="new")return openForm("personal");
 if(action==="share-personal"&&id){
   state.shareFor=state.shareFor===id?null:id;state.shareNotice="";render();return;
 }
 if(action==="send-personal"&&id){
   const input=$("#wz-share-target"),target=input?.value?.trim();
   if(!validMemberSerial(target)){setError("درست ممبر نمبر لکھیں، مثلاً DI-2");return;}
   if(state.busy)return;
   state.busy=true;button.disabled=true;
   sharePersonalWazifa(id,target,state.profile).then(result=>{
     state.shareFor=null;state.shareNotice="وظیفہ "+result.recipient+" کو شیئر کر دیا گیا۔";
     state.error="";render();
   }).catch(setError).finally(()=>{state.busy=false;if(button.isConnected)button.disabled=false;});
   return;
 }
 if(action==="accept-share"&&id){
   if(state.busy)return;
   state.busy=true;button.disabled=true;
   reconcileLegacySerials().then(()=>acceptSharedWazifa(id)).then(result=>{
     state.shareNotice="شیئرڈ وظیفہ "+wazifaSerial(result)+" کے طور پر محفوظ ہو گیا۔";
     state.error="";render();
   }).catch(setError).finally(()=>{state.busy=false;if(button.isConnected)button.disabled=false;});
   return;
 }
 if(action==="reject-share"&&id){
   if(!window.confirm("اس شیئرڈ وظیفے کو بغیر محفوظ کیے حذف کریں؟"))return;
   if(state.busy)return;
   state.busy=true;button.disabled=true;
   discardSharedWazifa(id).then(()=>{
     state.shareNotice="شیئرڈ وظیفہ حذف ہو گیا؛ آپ کے ذاتی وظائف میں شامل نہیں ہوا۔";
     state.error="";render();
   }).catch(setError).finally(()=>{state.busy=false;if(button.isConnected)button.disabled=false;});
   return;
 }
 if(action==="edit-group")return openForm("group");
 if(action==="edit-personal")return openForm("personal",id);
 if(action==="back")return back();
 if(action==="account-group"){state.panel=state.panel==="group"?null:"group";return render();}
 if(action==="account-personal"){state.panel=state.panel===id?null:id;return render();}
 if(action==="read-group"){
   if(!state.groupExists||currentGroup().active!==true)return;
   state.error="";state.readerId=null;state.tapQueue=0;startClock();
   if(currentGroup().countAsDurood!==false){
     window.duroodClassicBridge?.openGroupReader?.();
     return;
   }
   state.mode="group-reader";
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();return;
 }
 if(action==="read-personal"){
   state.readerId=id;state.mode="personal-reader";state.tapQueue=0;state.error="";startClock();
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();return;
 }
 if(action==="tap")return tap();
 if(action==="delete-personal"&&id){
   if(!window.confirm("یہ ذاتی وظیفہ حذف کریں؟ اس کا ذاتی ریکارڈ بھی ختم ہوگا۔"))return;
   deleteDoc(doc(db,"memberWazaif",auth.currentUser.uid,"items",id)).then(back).catch(setError);return;
 }
},true);
document.addEventListener("submit",event=>{
 if(event.target?.id!=="wazifa-form")return;
 event.preventDefault();event.stopImmediatePropagation();
 saveForm(event.target);
},true);
document.addEventListener("change",event=>{
 if(event.target?.closest("#wazifa-form")){
   const form=event.target.closest("#wazifa-form");
   if(event.target.name==="kind" && event.target.value==="group"&&!owner())return;
   syncForm();
 }
},true);
document.addEventListener("input",event=>{
 if(event.target?.closest("#wazifa-form")&&["endDate","startDate","goal"].includes(event.target.name))syncForm();
},true);
window.duroodWazaif={
 setMember,render,back,
 groupData:currentGroup,
 activeGroup:()=>state.groupExists&&currentGroup().active===true,
 groupCountsAsDurood:()=>currentGroup().countAsDurood!==false
};
