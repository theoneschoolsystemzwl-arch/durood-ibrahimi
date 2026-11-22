// Authenticated Wazaif: one owner-controlled group task and private member tasks.
// No personal task is ever stored in another member's browser or Firestore path.
import {auth,db} from "./firebase-client.js";
import {readingDay,recordPersonalWazifa,recordGroupWazifaOnly} from "./wazaif-counter.js?v=fixed-daily-20261123-v1";
import {collection,doc,onSnapshot,query,limit,serverTimestamp,setDoc,updateDoc,deleteDoc}
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {wazifaSerial,validMemberSerial,assignLegacyWazifaSerial,createPersonalWazifaWithSerial,
  sharePersonalWazifa,acceptSharedWazifa,discardSharedWazifa,inboxCollection}
  from "./wazifa-sharing.js";

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>new Intl.NumberFormat("en").format(Math.max(0,Number(n)||0));
const dayOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||"")) && !Number.isNaN(Date.parse(s+"T12:00:00Z"));
const spanDays=(a,b)=>dayOk(a)&&dayOk(b)&&b>=a?Math.floor((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000)+1:0;
const addDays=(start,offset)=>dayOk(start)&&Number.isSafeInteger(offset)?
  new Date(Date.parse(start+"T12:00:00Z")+offset*86400000).toISOString().slice(0,10):"";
const dayDistance=(start,end)=>dayOk(start)&&dayOk(end)?
  Math.round((Date.parse(end+"T12:00:00Z")-Date.parse(start+"T12:00:00Z"))/86400000):0;
function hasContinuation(task){
 return task?.kind==="fixed" && dayOk(task.continueStartDate) &&
   task.continueStartDate>task.endDate &&
   Number.isSafeInteger(task.continueDailyGoal) && task.continueDailyGoal>0 &&
   Number.isSafeInteger(task.continueBaseTotal) && task.continueBaseTotal>=0;
}
function continuationActive(task,today=readingDay()){
 return hasContinuation(task)&&today>=task.continueStartDate;
}
function fixedExpired(task,today=readingDay()){
 return task?.kind==="fixed"&&dayOk(task.endDate)&&today>task.endDate;
}
function activeDailyGoal(task,today=readingDay()){
 if(continuationActive(task,today))return task.continueDailyGoal;
 if(task?.kind==="fixed")return Math.ceil(Number(task.goal||0)/Math.max(1,spanDays(task.startDate,task.endDate)));
 return Number(task?.goal||0);
}
function continuationOptionMarkup(task){
 if(task?.kind!=="fixed")return "";
 if(hasContinuation(task))return state.continueFor===task.id?continuationFormMarkup(task):"";
 if(!fixedExpired(task))return "";
 return '<section class="wz-continuation-offer">'+
 '<h4>آپ کے '+fmt(spanDays(task.startDate,task.endDate))+' دن مکمل ہو گئے ہیں</h4>'+
 '<p>کیا آپ یہ وظیفہ روزانہ جاری رکھنا چاہتے ہیں؟ پہلے دور کا تمام ریکارڈ محفوظ رہے گا۔</p>'+
 '<div class="wz-continuation-actions"><button type="button" class="wz-button wz-primary" data-wazifa-action="continue-open" data-wazifa-id="'+esc(task.id)+'">ہاں، روزانہ جاری رکھیں</button>'+
 '<button type="button" class="wz-button" data-wazifa-action="continue-later" data-wazifa-id="'+esc(task.id)+'">ابھی نہیں</button></div>'+
 (state.continueFor===task.id?continuationFormMarkup(task):"")+
 '</section>';
}
function continuationFormMarkup(task){
 const existing=hasContinuation(task);
 const start=existing?task.continueStartDate:readingDay();
 return '<form class="wz-continuation-form" data-wazifa-continuation="'+esc(task.id)+'">'+
 '<label>نیا روزانہ ہدف (تعداد)<input type="number" name="continueDailyGoal" min="1" max="1000000000" step="1" required value="'+
 esc(existing?task.continueDailyGoal:activeDailyGoal(task))+'"></label>'+
 '<p>روزانہ گنتی '+(existing?'اس تاریخ سے جاری ہے: ':'اس تاریخ سے شروع ہوگی: ')+
 '<bdi dir="ltr">'+esc(start)+'</bdi>۔ پرانے 41 دن، تاریخیں اور گنتی نہیں بدلیں گے۔</p>'+
 '<div class="wz-continuation-actions"><button class="wz-button wz-primary" type="submit">'+
 (existing?'نیا ہدف محفوظ کریں':'روزانہ وظیفہ شروع کریں')+'</button>'+
 '<button class="wz-button" type="button" data-wazifa-action="continue-close" data-wazifa-id="'+esc(task.id)+'">منسوخ</button></div></form>';
}
function fixedPlan(task){
 if(task?.kind!=="fixed")return null;
 const days=spanDays(task.startDate,task.endDate);
 if(!days)return null;
 const today=readingDay();
 const elapsed=Math.max(0,Math.min(days,dayDistance(task.startDate,today)+1));
 const remaining=days-elapsed;
 const continuing=continuationActive(task,today);
 // Extend the original goal by the current daily goal for each continued day.
 // Never reset or separate the lifetime reading total.
 const fixedGoal=Math.max(0,Number(task.goal)||0);
 const continuationDays=continuing?spanDays(task.continueStartDate,today):0;
 const daily=continuing?task.continueDailyGoal:Math.ceil(fixedGoal/days);
 const goal=fixedGoal+continuationDays*daily;
 const total=Math.max(0,Number(task.total)||0);
 const todayTotal=(continuing||today<=task.endDate)&&task.day===today?
   Math.max(0,Number(task.today)||0):0;
 return {days,elapsed,remaining,currentDay:Math.max(0,dayDistance(task.startDate,today)+1),
  continuing,goal,total,todayTotal,daily,
  remainingCount:Math.max(0,goal-total),todayLeft:Math.max(0,daily-todayTotal),
  progress:goal?Math.min(100,Math.floor(total*100/goal)):0};
}
function fixedPlanMarkup(task,reader=false){
 const p=fixedPlan(task);if(!p)return "";
 const dateTile=(label,date)=>'<div class="wz-stat"><small>'+label+'</small><strong dir="ltr">'+esc(date)+'</strong></div>';
 const statTile=(label,value,id="")=>'<div class="wz-stat"><small>'+label+'</small><strong'+(id?' id="'+id+'"':'')+'>'+fmt(value)+'</strong></div>';
 const dailyTile=p.continuing?
  '<div class="wz-stat wz-stat-daily-goal"><small>روزانہ ہدف</small><strong>'+fmt(p.daily)+'</strong>'+
  '<button type="button" class="wz-inline-goal-edit" data-wazifa-action="continue-open" data-wazifa-id="'+esc(task.id)+'" aria-label="روزانہ ہدف کی سیٹنگ">تبدیل کریں</button></div>':
  statTile("روزانہ مطلوبہ تعداد",p.daily);
 return '<section class="wz-fixed-plan" aria-label="فکس وظیفے کی پیش رفت">'+
 '<div class="wz-plan-tiles">'+
 statTile("کل دن",p.days)+statTile("مکمل دن",p.elapsed)+
 statTile(p.continuing?"جاری دن":"باقی دن",p.continuing?p.currentDay:p.remaining)+
 dateTile("آغاز کی تاریخ",task.startDate)+dateTile("اختتامی تاریخ",task.endDate)+
 statTile("کل پڑھے گئے",p.total,reader?"wz-fixed-total":"")+
 dailyTile+statTile("کل ہدف",p.goal)+
 statTile("مجموعی باقی",p.remainingCount,reader?"wz-fixed-left":"")+
 statTile("آج پڑھا",p.todayTotal,reader?"wz-fixed-today":"")+
 statTile("آج باقی",p.todayLeft,reader?"wz-fixed-today-left":"")+
 '<div class="wz-stat"><small>فیصد تکمیل</small><strong>'+p.progress+'%</strong></div>'+
 '</div><div class="wz-plan-bar-label"><span>تعداد کی پیش رفت</span><strong id="'+(reader?'wz-fixed-percent':'wz-fixed-card-percent')+'">'+p.progress+'%</strong></div>'+
 '<progress class="wz-plan-progress" max="100" value="'+p.progress+'" aria-label="وظیفے کی تعداد کی پیش رفت"></progress>'+
 '<div class="wz-plan-bar-label"><span>'+(p.continuing?'پہلے '+fmt(p.days)+' دن مکمل':'دنوں کی پیش رفت')+'</span><strong>'+
 (p.continuing?'جاری دن '+fmt(p.currentDay):p.elapsed+' / '+p.days)+'</strong></div>'+
 '<progress class="wz-plan-progress wz-days-progress" max="'+p.days+'" value="'+p.elapsed+'" aria-label="مکمل شدہ دن"></progress>'+
 '<p class="wz-plan-foot">'+(p.continuing?'روزانہ ہدف '+fmt(p.daily)+' · مجموعی باقی '+fmt(p.remainingCount):
  'باقی '+p.remaining+' دن · باقی تعداد '+fmt(p.remainingCount))+'</p></section>';
}
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
 tapQueue:0,tapMetaQueue:[],historyDay:null,continueFor:null,tapBusy:false,pendingBack:false,dialFloating:false,skipDialClick:false,clockStart:null,clockMs:0,clockIntervals:0,clockLastTap:null,
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
  state.bootstrapTried=false;state.tapQueue=0;state.tapMetaQueue=[];state.historyDay=null;state.continueFor=null;state.tapBusy=false;
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
   continuationActive(task)?task.continueDailyGoal:
   task?.kind==="daily"?Number(task.goal||0):task?.kind==="fixed"?
    Math.ceil(Number(task.goal||0)/Math.max(1,spanDays(task.startDate,task.endDate))):0;
 const yearGoal=group?Number(currentGroup().yearlyGoal||0):0;
 const yearTotal=group?Number(annual.total||0):0;
 const plan=!group&&task?.kind==="fixed"?fixedPlan(task):null;
 const left=plan?plan.remainingCount:task?.kind==="daily"?
   Math.max(0,target-todayTotal):Math.max(0,Number(task?.goal||0)-total);
 return '<div class="wz-accounting"><div class="wz-metrics">'+
  metric("آج کی اکاؤنٹنگ",todayTotal)+metric("مجموعی شمار",total)+
  metric("روزانہ ہدف",target)+
  (group?metric("سالانہ شمار",yearTotal)+metric("سالانہ ہدف",yearGoal)+
   metric("سالانہ باقی",Math.max(0,yearGoal-yearTotal)):
   (plan?metric("کل ہدف",plan.goal):"")+metric("مجموعی باقی",left))+
  '</div>'+(plan?fixedPlanMarkup(task):"")+
  (group?'<p class="wz-help">گروپ کی گنتی اس فیچر کے فعال ہونے کے بعد سے محفوظ ہوتی ہے؛ پرانا درود ریکارڈ اپنی جگہ محفوظ ہے۔</p>':'')+
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
 if(continuationActive(task,now))return "روزانہ جاری";
 if(task.kind==="fixed"&&task.endDate<now)return "مدت مکمل";
 return "جاری";
}
function personalCard(task){
 const stateText=taskStatus(task);
 return '<article class="wz-card wz-personal">'+
 '<div class="wz-tasbih-top"><button type="button" class="wz-button wz-primary wz-tasbih-cta" data-wazifa-action="read-personal" data-wazifa-id="'+esc(task.id)+'" '+(!["جاری","روزانہ جاری"].includes(stateText)?'disabled':'')+'>📿 تسبیح کریں</button></div>'+
 '<header class="wz-card-head"><div><span class="wz-caption">ذاتی وظیفہ · '+esc({daily:"ڈیلی",fixed:"فکس",open:"اوپن"}[task.kind]||"")+'</span><h3><bdi dir="ltr" class="wz-serial">'+esc(wazifaSerial(task))+'</bdi> · '+esc(task.title)+'</h3></div><span class="wz-state">'+stateText+'</span></header>'+
 '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(task.arabic)+'</p><p class="wz-help">'+esc(task.instructions)+'</p>'+
 (task.kind==="fixed"?fixedPlanMarkup(task):'<p class="wz-help">آغاز '+esc(task.startDate)+'</p>')+
 continuationOptionMarkup(task)+
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
 const continued=hasContinuation(original);
 const kinds=[["daily","ڈیلی وظیفہ","ہر روز پڑھنا ہے"],["fixed","فکس وظیفہ","مقررہ تاریخ تک"],["open","اوپن وظیفہ","اپنی مرضی سے"]];
 if(owner())kinds.push(["group","گروپ وظیفہ","تمام ممبرز کے لیے"]);
 const title=g?"گروپ وظیفے کی سیٹنگ":state.editId?"ذاتی وظیفے میں ترمیم":"نیا وظیفہ";
 return '<div class="wz-form-head"><button type="button" class="wz-button" data-wazifa-action="back">بند کریں</button><h2>'+title+'</h2></div>'+
 '<form id="wazifa-form" class="wz-form"><label>وظیفے کا نام<input name="title" required maxlength="80" placeholder="مثلاً آیت الکرسی" value="'+esc(original.title||'')+'"></label>'+
 '<label>عربی عبارت / درود<textarea name="arabic" rows="4" required maxlength="3000" placeholder="عربی عبارت درج کریں">'+esc(original.arabic||'')+'</textarea></label>'+
 '<label>طریقہ / ہدایات<textarea name="instructions" rows="3" maxlength="1200" placeholder="پڑھنے کا طریقہ">'+esc(original.instructions||'')+'</textarea></label>'+
 '<label>وظیفے کا مقصد<textarea name="purpose" rows="3" maxlength="1200" placeholder="اس وظیفے کا مقصد">'+esc(original.purpose||'')+'</textarea></label>'+
 '<p class="wz-label">وظیفے کی قسم منتخب کریں</p><div class="wz-kind">'+kinds.map(([id,name,description])=>
   '<label class="wz-kind-choice"><input type="radio" name="kind" value="'+id+'" '+(kind===id?'checked':'')+(continued&&id!==kind?' disabled':'')+'><span><b>'+name+'</b><small>'+description+'</small></span></label>'
 ).join('')+'</div>'+
 '<div class="wz-form-goals"><label class="wz-goal-field" data-wz-goal="daily">روزانہ ہدف<input name="dailyGoal" type="number" min="1" max="1000000000" value="'+esc(original.dailyGoal||original.goal||200)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="total">کل ہدف<input name="goal" type="number" min="1" max="1000000000" '+(continued?'readonly ':'')+'value="'+esc(original.goal||1000)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="year">سالانہ کل ہدف<input name="yearlyGoal" type="number" min="1" max="1000000000" value="'+esc(original.yearlyGoal||1000000)+'"></label></div>'+
 '<div class="wz-dates"><label>آغاز کی تاریخ<input name="startDate" type="date" required '+(continued?'readonly ':'')+'value="'+esc(original.startDate||readingDay())+'"></label>'+
 '<label data-wz-end>اختتامی تاریخ (خودکار)<input name="endDate" type="date" readonly value="'+esc(original.endDate||'')+'"></label></div>'+
 '<label class="wz-fixed-days" data-wz-days>کتنے دن کا وظیفہ؟<input name="durationDays" type="number" min="1" max="3650" '+(continued?'readonly ':'')+'value="'+esc(original.kind==="fixed"&&spanDays(original.startDate,original.endDate)||41)+'"></label>'+
 (continued?'<p class="wz-help">فکس مرحلہ مکمل ہے۔ پہلے 41 دن، آغاز، اختتام اور پرانا ہدف محفوظ ہیں۔ روزانہ نیا ہدف وظیفے کے کارڈ سے تبدیل کریں۔</p>':"")+
 '<div class="wz-date-preview" id="wz-date-preview" role="status"></div>'+
 '<label class="wz-toggle" data-wz-group><input type="checkbox" name="active" '+(g&&original.active===false?'':'checked')+'> گروپ وظیفہ فعال رکھیں</label>'+
 '<label class="wz-toggle" data-wz-group><input type="checkbox" name="countAsDurood" '+(!g||original.countAsDurood!==false?'checked':'')+'> یہ درود شریف ہے (مجموعی درود میں بھی شمار کریں)</label>'+
 '<p class="wz-help">گروپ سیٹنگ صرف Owner کو نظر آئے گی؛ ذاتی وظیفہ صرف اپنے اکاؤنٹ میں محفوظ ہوگا۔</p>'+
 '<button type="submit" class="wz-button wz-primary" '+(state.busy?'disabled':'')+'>محفوظ کریں</button>'+
 (state.editId&&!g?'<button type="button" class="wz-button wz-delete" data-wazifa-action="delete-personal" data-wazifa-id="'+esc(state.editId)+'">وظیفہ حذف کریں</button>':'')+
 '</form>';
}
// Decorative icons match the emerald screenshot but all numbers remain live.
function heroIcon(name){
 const paths={
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l8-8m-3 0h3v3"/>',
  book:'<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1m0-14c3-2 6-2 9-1v14c-3-1-6-1-9 1V6Z"/>',
  hourglass:'<path d="M6 3h12M6 21h12M7 3c0 5 3 6 5 9-2 3-5 4-5 9m10-18c0 5-3 6-5 9 2 3 5 4 5 9"/>',
  date:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 4h6"/>',
  check:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m5 5 2 2 4-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  bolt:'<path d="M13 2 4 13h7l-1 9 10-12h-7z"/>',
  meter:'<path d="M4 18a10 10 0 1 1 16 0M12 13l4-5M3 20h18"/>',
  percent:'<circle cx="12" cy="12" r="9"/><path d="M8 16 16 8M8 8h.01M16 16h.01"/>'
 };
 return '<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.target)+'</svg>';
}
function heroStat(label,value,icon,id){
 return '<div class="wz-hero-stat">'+heroIcon(icon)+'<div class="wz-hero-stat-copy"><small>'+esc(label)+'</small><strong'+(id?' id="'+id+'"':'')+'>'+esc(value)+'</strong></div></div>';
}
function heroTile(label,value,icon,id){
 return '<div class="wz-hero-tile">'+heroIcon(icon)+'<small>'+esc(label)+'</small><strong'+(id?' id="'+id+'"':'')+'>'+esc(value)+'</strong></div>';
}
function durationText(ms){
 const whole=Math.max(0,Math.floor(Number(ms)||0)),seconds=Math.floor(whole/1000);
 return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60]
   .map(n=>String(n).padStart(2,"0")).join(":")+"."+String(Math.floor(whole%1000/100));
}
function displayRecordDate(key){
 if(!dayOk(key))return key;
 return new Intl.DateTimeFormat("ur-PK",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric",numberingSystem:"latn"})
  .format(new Date(key+"T12:00:00Z"));
}
function wazifaHistoryMarkup(record){
 const ledger=record?.dailyLedger&&typeof record.dailyLedger==="object"?record.dailyLedger:{};
 const today=readingDay();
 const day=record?.day;
 const days=[...new Set([today,...Object.keys(ledger),...(dayOk(day)?[day]:[])])]
  .filter(dayOk).sort().reverse().slice(0,60);
 const rows=days.map(key=>{
  const entry=ledger[key]||{};
  const current=key===record.day;
  const count=current?Math.max(0,Number(record.today)||0):Number(entry.count||0);
  const duration=Number(entry.durationMs||0);
  return '<div class="wz-history-row" dir="rtl">'+
   '<span class="wz-history-date">'+heroIcon("date")+'<time datetime="'+key+'">'+esc(displayRecordDate(key))+'</time></span>'+
   '<span class="wz-history-count">'+esc("تعداد: ")+ '<strong>'+fmt(count)+'</strong></span>'+
   '<span class="wz-history-time">'+heroIcon("clock")+'<span>دورانیہ: <bdi dir="ltr">'+(duration>0?durationText(duration):"—")+'</bdi></span></span>'+
   '<button type="button" class="wz-history-edit" data-wazifa-action="history-day" data-wazifa-day="'+key+'">'+(key===today?'تبدیل':'تفصیل')+'</button>'+
   '</div>';
 }).join("");
 let details="";
 if(state.historyDay&&days.includes(state.historyDay)){
   const entry=ledger[state.historyDay]||{};
   const count=state.historyDay===record.day?Number(record.today||0):Number(entry.count||0);
   const canAdd=state.historyDay===today&&taskStatus(record)==="جاری";
   details='<div class="wz-history-detail"><strong>'+esc(displayRecordDate(state.historyDay))+'</strong>'+
    '<span> محفوظ تعداد: '+fmt(count)+' · دورانیہ: '+(Number(entry.durationMs||0)?durationText(entry.durationMs):"—")+'</span>'+
    (canAdd?'<div class="wz-history-add"><label>مزید تعداد<input id="wz-extra-count" type="number" min="1" max="1000" value="1"></label>'+
    '<button type="button" class="wz-button wz-primary" data-wazifa-action="history-add">اضافہ محفوظ کریں</button></div>':'<small>پرانی تاریخ کی تفصیل صرف دیکھ سکتے ہیں۔</small>')+
    '</div>';
 }
 return (rows||'<div class="wz-history-empty">ابھی روزانہ کا ریکارڈ نہیں۔</div>')+details+
 '<p class="wz-history-note">پرانے وظائف کی جن تاریخوں کا الگ ریکارڈ محفوظ نہیں تھا، ان کا دورانیہ تخمیناً نہیں دکھایا جاتا۔</p>';
}
function heroReadingState(group,w,record){
 const today=readingDay(),todayCount=record.day===today?Math.max(0,Number(record.today)||0):0;
 const total=Math.max(0,Number(record.total)||0);
 const plan=!group?fixedPlan(w):null;
 const continuing=!group&&continuationActive(w,today);
 const dailyGoal=group?Number(w.dailyGoal||0):activeDailyGoal(w,today);
 const totalGoal=continuing?plan.goal:
  group?Number(w.yearlyGoal||w.dailyGoal||0):Number(w.goal||0);
 const left=Math.max(0,totalGoal-total);
 const percent=totalGoal?Math.min(100,Math.floor(total*100/totalGoal)):0;
 const dayLeft=Math.max(0,dailyGoal-todayCount);
 return {todayCount,total,plan,dailyGoal,totalGoal,left,percent,dayLeft,continuing};
}
function readerMarkup(group){
 const w=group?currentGroup():state.personal.find(x=>x.id===state.readerId);
 if(!w)return '<button class="wz-button" data-wazifa-action="back">وظائف واپس</button>';
 const record=group?state.groupStats||{}:w;
 const s=heroReadingState(group,w,record);
 const days=s.plan?.days||0,elapsed=s.plan?.elapsed||0,remaining=s.plan?.remaining||0;
 const showDates=!!s.plan;
 const today=readingDay();
 const history=group?'<p class="wz-history-empty">مشترکہ گروپ کی الگ روزانہ تفصیل تسبیح کے اپنے ریکارڈ میں دیکھیے۔</p>':wazifaHistoryMarkup(record);
 const progress=s.percent;
 return '<div class="wz-hero-reader" dir="rtl">'+
 '<div class="wz-hero-ornament" aria-hidden="true"></div>'+
 '<div class="wz-hero-content">'+
 '<button class="wz-hero-back" type="button" data-wazifa-action="back">‹ '+esc("وظائف واپس")+'</button>'+
 '<div class="wz-hero-topstats">'+
 heroStat("کل پڑھی گئی تعداد",fmt(s.total),"book","wz-hero-total")+
 heroStat(s.continuing?"کل ہدف":"مجموعی ہدف",fmt(s.totalGoal),"target","wz-hero-goal")+
 heroStat(s.continuing?"مجموعی باقی":"باقی",fmt(s.left),"hourglass","wz-hero-left")+
 heroStat("فیصد تکمیل",s.percent+"%","percent","wz-hero-percent")+
 '</div>'+
 '<div class="wz-hero-progress"><span id="wz-hero-progress-label">'+progress+'% تکمیل</span>'+
 '<progress id="wz-hero-progress-bar" max="100" value="'+progress+'"></progress></div>'+
 '<h2 class="wz-hero-title"><span aria-hidden="true">❖</span>'+esc(w.title)+'<span aria-hidden="true">❖</span></h2>'+
 (showDates?'<div class="wz-hero-six">'+
 heroTile("روزانہ ہدف",fmt(s.dailyGoal),"target")+
 heroTile("کل دن",fmt(days),"date")+
 heroTile("مکمل دن",fmt(elapsed),"check")+
 heroTile(s.continuing?"جاری دن":"باقی دن",fmt(s.continuing?s.plan.currentDay:remaining),"date")+
 heroTile("آغاز تاریخ",w.startDate,"date")+
 heroTile("اختتامی تاریخ",w.endDate,"date")+
 '</div>':'<div class="wz-hero-six wz-hero-six-basic">'+
 heroTile("روزانہ ہدف",fmt(s.dailyGoal),"target")+heroTile("آج پڑھا",fmt(s.todayCount),"book","wz-mini-today")+
 heroTile("آج باقی",fmt(s.dayLeft),"hourglass","wz-mini-left")+'</div>')+
 '<div class="wz-hero-daily">'+
 heroTile("آج کا ہدف",fmt(s.dailyGoal),"target")+
 heroTile("آج پڑھا",fmt(s.todayCount),"book","wz-hero-today")+
 heroTile("آج باقی",fmt(s.dayLeft),"hourglass","wz-hero-day-left")+
 '<div class="wz-hero-remaining">'+heroIcon("hourglass")+'<div><small>'+(s.continuing?'مجموعی باقی':showDates?'مقررہ اختتام تک باقی':'ہدف سے باقی')+'</small>'+
 '<strong id="wz-hero-days-left">'+(s.continuing?fmt(s.left):showDates?remaining+" دن":fmt(s.left))+'</strong></div></div>'+
 '</div>'+
 '<div class="wz-hero-speed">'+
 '<div>'+heroIcon("bolt")+'<small>فی سیکنڈ</small><strong id="wz-speed-sec">—</strong></div>'+
 '<div>'+heroIcon("clock")+'<small>فی منٹ</small><strong id="wz-speed-min">—</strong></div>'+
 '<div>'+heroIcon("clock")+'<small>فی گھنٹہ</small><strong id="wz-speed-hour">—</strong></div>'+
 '<div>'+heroIcon("meter")+'<small>کارکردگی</small><strong id="wz-speed-status">—</strong></div>'+
 '</div>'+
 '<button type="button" id="wz-dial" class="wz-dial wz-hero-dial'+(state.dialFloating?' is-floating':'')+'" style="--wz-ring:'+Math.min(100,Math.floor(s.todayCount/Math.max(1,s.dailyGoal)*100))+'%" data-wazifa-action="tap">'+
 '<strong id="wz-dial-number">'+fmt(s.todayCount+state.tapQueue)+'</strong>'+
 '<small id="wz-live-speed">رفتار: — فی سیکنڈ</small>'+
 '<span class="wz-dial-clock">'+heroIcon("clock")+'<span>سیشن کا وقت <bdi id="wz-clock" dir="ltr">00:00:00.000</bdi></span></span>'+
 '<span class="wz-dial-plus" aria-hidden="true">+</span><span class="wz-dial-invite">پڑھیں یا تسبیح کریں</span>'+
 '</button>'+
 '<h3 class="wz-record-title">روزانہ محفوظ ریکارڈ</h3>'+
 '<div id="wz-record-history">'+history+'</div>'+
 '<details class="wz-reading-text"><summary>وظیفے کی عبارت اور ہدایات</summary>'+
 '<div class="wz-arabic" lang="ar" dir="rtl">'+esc(w.arabic)+'</div>'+
 '<p class="wz-help">'+esc(w.instructions)+'</p></details>'+
 '<p class="wz-reader-advice">ایک بار پڑھنے کے بعد دائرہ دبائیں۔ 15 سیکنڈ خاموشی کے بعد وقت رک جاتا ہے۔</p>'+
 (state.tapQueue?'<p class="wz-help">محفوظ ہو رہے ہیں: '+fmt(state.tapQueue)+'</p>':'')+
 (state.error?'<p class="wz-error">'+esc(state.error)+'</p>':'')+
 '</div></div>';
}
function refreshHeroReader(){
 const root=$("#wazaif-root");if(!root||!root.querySelector("#wz-dial"))return;
 const group=state.mode==="group-reader",w=group?currentGroup():state.personal.find(x=>x.id===state.readerId);
 const record=group?state.groupStats:w;
 if(!w||!record)return;
 const s=heroReadingState(group,w,record);
 const todayCount=s.todayCount+state.tapQueue,total=s.total+state.tapQueue;
 const dayLeft=Math.max(0,s.dailyGoal-todayCount);
  const left=Math.max(0,s.totalGoal-total);
  const percent=s.totalGoal?Math.min(100,Math.floor(total*100/s.totalGoal)):0;
 const set=(id,value)=>{const el=root.querySelector("#"+id);if(el)el.textContent=value;};
 set("wz-dial-number",fmt(todayCount));
 set("wz-hero-total",fmt(total));set("wz-hero-left",fmt(left));
 set("wz-hero-percent",percent+"%");set("wz-hero-progress-label",percent+"% تکمیل");
 set("wz-hero-today",fmt(todayCount));set("wz-hero-day-left",fmt(dayLeft));
  if(s.continuing)set("wz-hero-days-left",fmt(left));
 set("wz-mini-today",fmt(todayCount));set("wz-mini-left",fmt(dayLeft));
 const bar=root.querySelector("#wz-hero-progress-bar");if(bar)bar.value=percent;
 const step=Math.max(1,s.dailyGoal);const cycle=todayCount>0&&todayCount%step===0?step:todayCount%step;
 root.querySelector("#wz-dial").style.setProperty("--wz-ring",Math.floor(cycle/step*100)+"%");
 if(!group){
   const history=root.querySelector("#wz-record-history");
   if(history)history.innerHTML=wazifaHistoryMarkup(record);
 }
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
   if(root.querySelector("#wz-dial")){refreshHeroReader();return;}
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
 const daysField=form.querySelector("[data-wz-days]");
 end.hidden=kind!=="fixed";daysField.hidden=kind!=="fixed";
 const duration=Number(form.elements.durationDays.value),start=form.elements.startDate.value;
 const valid=Number.isSafeInteger(duration)&&duration>=1&&duration<=3650&&dayOk(start);
 const stop=kind==="fixed"&&valid?addDays(start,duration-1):"";
 form.elements.endDate.value=stop;
 end.querySelector("input").required=kind==="fixed";
 daysField.querySelector("input").required=kind==="fixed";
 form.querySelectorAll("[data-wz-group]").forEach(el=>el.hidden=kind!=="group");
 const goal=Number(form.elements.goal.value||0);
 const preview=$("#wz-date-preview");
 if(kind==="fixed"&&valid){
   preview.innerHTML='<div class="wz-plan-tiles">'+
    '<div class="wz-stat"><small>کل دن</small><strong>'+fmt(duration)+'</strong></div>'+
    '<div class="wz-stat"><small>روزانہ مطلوبہ تعداد</small><strong>'+fmt(Math.ceil(goal/duration))+'</strong></div>'+
    '<div class="wz-stat"><small>آغاز</small><strong dir="ltr">'+start+'</strong></div>'+
    '<div class="wz-stat"><small>اختتام</small><strong dir="ltr">'+stop+'</strong></div></div>';
 }else{
   preview.textContent=kind==="fixed"?"آغاز کی درست تاریخ اور 1 سے 3650 تک کل دن درج کریں۔":
    kind==="daily"?"روزانہ وظیفہ شروع ہوگا، آخری تاریخ مقرر نہیں۔":
    kind==="open"?"مجموعی ہدف ہوگا، اختتامی تاریخ مقرر نہیں۔":
    "یہ گروپ وظیفہ تمام ممبرز کو سب سے اوپر نظر آئے گا۔";
 }
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
 state.pendingBack=false;state.mode="list";state.panel=null;state.readerId=null;state.historyDay=null;state.tapQueue=0;state.tapMetaQueue=[];state.clockLastTap=null;state.dialFloating=false;state.skipDialClick=false;
 const root=$("#wazaif-root");if(root)root.innerHTML="";
 state.continueFor=null;
 render();
}
async function saveForm(form){
 if(state.busy)return;
 const data=new FormData(form);
 const kind=String(data.get("kind")||"");
 if(!["daily","fixed","open","group"].includes(kind))return;
 if(kind==="group"&&!owner())return;
 const title=String(data.get("title")||"").trim(),arabic=String(data.get("arabic")||"").trim();
 const startDate=String(data.get("startDate")||"");
 const durationDays=Number(data.get("durationDays"));
 const endDate=kind==="fixed"&&Number.isSafeInteger(durationDays)&&durationDays>=1&&durationDays<=3650?
   addDays(startDate,durationDays-1):"";
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
       endDate,durationDays:kind==="fixed"?durationDays:0,updatedAt:serverTimestamp()};
     const uid=auth.currentUser.uid;
     const existing=state.editId?state.personal.find(item=>item.id===state.editId):null;
     if(existing&&hasContinuation(existing)){
       if(kind!=="fixed"||goal!==existing.goal||startDate!==existing.startDate||
          endDate!==existing.endDate){
         throw Error("جاری وظیفے کے پرانے 41 دن یا ہدف تبدیل نہیں کیے جا سکتے۔");
       }
       await updateDoc(doc(db,"memberWazaif",uid,"items",state.editId),{
         title,arabic,instructions:common.instructions,purpose:common.purpose,updatedAt:serverTimestamp()
       });
     }else if(state.editId)await updateDoc(doc(db,"memberWazaif",uid,"items",state.editId),config);
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
async function saveContinuation(form){
 if(state.busy||!auth.currentUser)return;
 const id=form.dataset.wazifaContinuation;
 const task=state.personal.find(item=>item.id===id);
 if(!task||task.kind!=="fixed")return setError("فکس وظیفہ موجود نہیں۔");
 const value=Number(new FormData(form).get("continueDailyGoal"));
 if(!Number.isSafeInteger(value)||value<1||value>1000000000){
   setError("روزانہ ہدف ایک سے ایک ارب کے درمیان درج کریں۔");return;
 }
 const existing=hasContinuation(task);
 if(!existing&&!fixedExpired(task)){
   setError("فکس وظیفے کے تمام دن مکمل ہونے کے بعد یہ آپشن کھلے گا۔");return;
 }
 state.busy=true;
 const button=form.querySelector('[type="submit"]');
 if(button)button.disabled=true;
 try{
   const uid=auth.currentUser.uid;
   const change=existing?{continueDailyGoal:value,updatedAt:serverTimestamp()}:
     {continueStartDate:readingDay(),continueDailyGoal:value,
      continueBaseTotal:Number(task.total||0),updatedAt:serverTimestamp()};
   await updateDoc(doc(db,"memberWazaif",uid,"items",id),change);
   state.continueFor=null;
   state.shareNotice=existing?"نیا روزانہ ہدف محفوظ ہو گیا۔":
     "وظیفہ روزانہ جاری ہے۔ سابقہ فکس مرحلے کا ریکارڈ محفوظ ہے۔";
   state.error="";
   render();
 }catch(error){setError("روزانہ وظیفہ محفوظ نہیں ہوا: "+(error.code||error.message));}
 finally{state.busy=false;if(button?.isConnected)button.disabled=false;}
}
function startClock(){
 state.clockStart=performance.now();state.clockLastTap=null;state.clockMs=0;state.clockIntervals=0;
}
function tap(){
 if(state.skipDialClick){state.skipDialClick=false;return;}
 if(state.busy||!auth.currentUser||!["group-reader","personal-reader"].includes(state.mode))return;
 if(state.mode==="personal-reader"){
   const task=state.personal.find(item=>item.id===state.readerId);
   if(!task||!["جاری","روزانہ جاری"].includes(taskStatus(task))){back();return;}
 }
 const now=performance.now(),gap=state.clockLastTap===null?0:now-state.clockLastTap;
 const durationMs=gap>0&&gap<=15000?Math.floor(gap):0;
 if(durationMs>0){state.clockMs+=durationMs;state.clockIntervals++;}
 state.clockLastTap=now;
 state.tapQueue++;
 state.tapMetaQueue.push({durationMs,intervals:durationMs>0?1:0});
 const counter=$("#wz-dial-number");if(counter)counter.textContent=fmt(Number(counter.textContent.replace(/,/g,""))+1);
 if(!state.tapBusy)drain();
}
async function drain(){
 if(state.tapBusy)return;
 state.tapBusy=true;
 while(state.tapQueue){
   const amount=Math.min(state.tapQueue,1000),mode=state.mode,task=state.readerId;
   const day=readingDay();
   const entries=state.tapMetaQueue.slice(0,amount);
   const durationMs=entries.reduce((n,item)=>n+item.durationMs,0);
   const intervals=entries.reduce((n,item)=>n+item.intervals,0);
   try{
     if(mode==="group-reader")await recordGroupWazifaOnly(amount,day);
     else await recordPersonalWazifa(task,amount,day,{durationMs,intervals});
     state.tapQueue-=amount;state.tapMetaQueue.splice(0,amount);
     state.error="";
   }catch(e){
     state.tapQueue=0;state.tapMetaQueue=[];
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
 const rate=state.clockMs>0&&state.clockIntervals>0?state.clockIntervals*1000/state.clockMs:0;
 const pace=n=>n>0?n.toLocaleString("en",{maximumFractionDigits:1}):"—";
 const p=pace(rate);
 const sec=$("#wz-speed-sec"),min=$("#wz-speed-min"),hour=$("#wz-speed-hour"),dialSpeed=$("#wz-live-speed");
 if(sec)sec.textContent=p;if(min)min.textContent=pace(rate*60);
 if(hour)hour.textContent=pace(rate*3600);if(dialSpeed)dialSpeed.textContent="رفتار: "+p+" فی سیکنڈ";
 const status=$("#wz-speed-status");if(status)status.textContent=rate>0?(rate>=1?"تیز":"معمول"):"—";
 if(state.seenDay!==readingDay()){
   state.seenDay=readingDay();state.clockLastTap=null;
   if(state.mode==="personal-reader"){
     const task=state.personal.find(item=>item.id===state.readerId);
     if(!task||!["جاری","روزانہ جاری"].includes(taskStatus(task))){back();return;}
   }
   render();
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
 if(action==="continue-open"&&id){
   const task=state.personal.find(item=>item.id===id);
   if(!task||!(fixedExpired(task)||hasContinuation(task)))return;
   state.continueFor=state.continueFor===id?null:id;
   return render();
 }
 if(action==="continue-later"&&id){
   state.continueFor=null;state.shareNotice="آپ جب چاہیں فکس مدت کے بعد روزانہ جاری رکھ سکتے ہیں۔";
   return render();
 }
 if(action==="continue-close"){state.continueFor=null;return render();}
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
   state.mode="group-reader";state.historyDay=null;state.tapMetaQueue=[];
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();root?.scrollIntoView({block:"start",behavior:"auto"});return;
 }
 if(action==="read-personal"){
   const selected=state.personal.find(item=>item.id===id);
   if(!selected||!["جاری","روزانہ جاری"].includes(taskStatus(selected)))return;
   state.readerId=id;state.mode="personal-reader";state.tapQueue=0;state.tapMetaQueue=[];state.historyDay=null;state.error="";startClock();
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();root?.scrollIntoView({block:"start",behavior:"auto"});return;
 }
 if(action==="history-day"&&button.dataset.wazifaDay){
   state.historyDay=state.historyDay===button.dataset.wazifaDay?null:button.dataset.wazifaDay;
   const record=state.personal.find(x=>x.id===state.readerId);
   const target=$("#wz-record-history");if(target&&record)target.innerHTML=wazifaHistoryMarkup(record);
   return;
 }
 if(action==="history-add"){
   if(state.busy||state.mode!=="personal-reader")return;
   const extra=Number($("#wz-extra-count")?.value);
   if(!Number.isSafeInteger(extra)||extra<1||extra>1000){setError("تعداد 1 سے 1000 درج کریں۔");return;}
   const id=state.readerId,day=readingDay();
   if(state.historyDay!==day)return;
   state.busy=true;button.disabled=true;
   recordPersonalWazifa(id,extra,day,{durationMs:0,intervals:0}).then(()=>{
     state.historyDay=null;state.error="";render();
   }).catch(setError).finally(()=>{state.busy=false;if(button.isConnected)button.disabled=false;});
   return;
 }
 if(action==="tap")return tap();
 if(action==="delete-personal"&&id){
   if(!window.confirm("یہ ذاتی وظیفہ حذف کریں؟ اس کا ذاتی ریکارڈ بھی ختم ہوگا۔"))return;
   deleteDoc(doc(db,"memberWazaif",auth.currentUser.uid,"items",id)).then(back).catch(setError);return;
 }
},true);
document.addEventListener("submit",event=>{
 if(event.target?.matches(".wz-continuation-form")){
   event.preventDefault();event.stopImmediatePropagation();
   void saveContinuation(event.target);return;
 }
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
 if(event.target?.closest("#wazifa-form")&&["durationDays","startDate","goal"].includes(event.target.name))syncForm();
},true);
window.duroodWazaif={
 setMember,render,back,
 groupData:currentGroup,
 activeGroup:()=>state.groupExists&&currentGroup().active===true,
 groupCountsAsDurood:()=>currentGroup().countAsDurood!==false
};
