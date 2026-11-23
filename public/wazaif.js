// Authenticated Wazaif: one owner-controlled group task and private member tasks.
// No personal task is ever stored in another member's browser or Firestore path.
import {auth,db} from "./firebase-client.js";
import {createDurableTasbihSync} from "./tasbih-durable-sync.js?v=20261123-6";
import {readingDay,recordPersonalWazifa,recordGroupWazifaOnly} from "./wazaif-counter.js?v=durable-sync-20261123-v6";
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
 if(continuationActive(task,today))return continuationGoal(task,today);
 if(task?.kind==="fixed")return Math.ceil(Number(task.goal||0)/Math.max(1,spanDays(task.startDate,task.endDate)));
 return Number(task?.goal||0);
}
function continuationGoal(t,day){
 const h=t?.continueGoalHistory||{},days=Object.keys(h).filter(k=>dayOk(k)&&k<=day).sort();
 return days.length?Number(h[days[days.length-1]]):Number(t?.continueDailyGoal||0);
}
function targetForDay(t,day){
 if(!t||day<t.startDate)return 0;
 if(t.kind==="fixed"){
  if(day<=t.endDate){
   const n=spanDays(t.startDate,t.endDate),i=dayDistance(t.startDate,day),base=Math.floor(t.goal/n);
   return n&&i>=0?base+(i<t.goal%n?1:0):0;
  }
  return hasContinuation(t)&&day>=t.continueStartDate?continuationGoal(t,day):0;
 }
 return t.kind==="daily"?Number(t.goal||0):0;
}
function runningGoal(t,day){
 let sum=Number(t.goal||0);
 if(!continuationActive(t,day))return sum;
 for(let d=t.continueStartDate,i=0;d<=day&&i<3660;i++,d=addDays(d,1))sum+=targetForDay(t,d);
 return sum;
}
function dailyConversionHint(t){
 if(t?.kind!=="fixed")return "";
 if(hasContinuation(t))return '<p class="wz-daily-convert-note">پہلے '+fmt(spanDays(t.startDate,t.endDate))+' دن اور اصل '+fmt(t.goal)+' کا ہدف محفوظ ہے۔ روزانہ وظیفہ جاری ہے۔</p>';
 return fixedExpired(t)?'<p class="wz-daily-convert-note">41 دن مکمل ہیں۔ اوپر ڈیلی وظیفہ منتخب کر کے روزانہ ہدف محفوظ کریں۔ اصل ہدف اور تمام ریکارڈ محفوظ رہے گا۔</p>':"";
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
 const extraDays=continuationDays;
 const daily=targetForDay(task,today);
 const goal=continuing?runningGoal(task,today):fixedGoal;
 const total=Math.max(0,Number(task.total)||0);
 const todayTotal=(continuing||today<=task.endDate)&&task.day===today?
   Math.max(0,Number(task.today)||0):0;
 return {days,elapsed,remaining,currentDay:Math.max(0,dayDistance(task.startDate,today)+1),
  continuing,extraDays,goal,total,todayTotal,daily,
  remainingCount:Math.max(0,goal-total),todayLeft:Math.max(0,daily-todayTotal),
  progress:goal?Math.min(100,Math.floor(total*100/goal)):0};
}
function fixedPlanMarkup(task,reader=false){
 const p=fixedPlan(task);if(!p)return "";
 const dateTile=(label,date)=>'<div class="wz-stat"><small>'+label+'</small><strong dir="ltr">'+esc(date)+'</strong></div>';
 const statTile=(label,value,id="")=>'<div class="wz-stat"><small>'+label+'</small><strong'+(id?' id="'+id+'"':'')+'>'+fmt(value)+'</strong></div>';
 const dailyTile=statTile(p.continuing?"ڈیلی ہدف":"روزانہ مطلوبہ تعداد",p.daily);
 return '<section class="wz-fixed-plan" aria-label="فکس وظیفے کی پیش رفت">'+
 '<div class="wz-plan-tiles">'+
 statTile("اصل دن",p.days)+statTile(p.continuing?"موجودہ دن":"مکمل دن",p.continuing?p.currentDay:p.elapsed)+
 (p.continuing?'<div class="wz-stat wz-stat-extra"><small>اضافی دن</small><strong>+'+fmt(p.extraDays)+'</strong></div>':statTile("باقی دن",p.remaining))+
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
 (p.continuing?fmt(p.days)+' دن مکمل + '+fmt(p.extraDays)+' اضافی':p.elapsed+' / '+p.days)+'</strong></div>'+
 '<progress class="wz-plan-progress wz-days-progress" max="'+p.days+'" value="'+p.elapsed+'" aria-label="مکمل شدہ دن"></progress>'+
 '<p class="wz-plan-foot">'+(p.continuing?'+'+fmt(p.extraDays)+' اضافی دن · روزانہ ہدف '+fmt(p.daily)+' · مجموعی باقی '+fmt(p.remainingCount):
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
 tapQueue:0,tapMetaQueue:[],historyDay:null,continueFor:null,historyLimit:60,draftDay:null,tapBusy:false,pendingBack:false,dialFloating:false,skipDialClick:false,clockStart:null,clockMs:0,clockIntervals:0,clockLastTap:null,tapGapMs:0,tapGapTotalMs:0,
 seenDay:readingDay(),soundEnabled:false,vibrateEnabled:false,soundLevel:3,vibrateLevel:3,lastTapAt:0
};

const wzSync=createDurableTasbihSync({
 prefix:"durood-wazaif-sync-v3",
 getUid:()=>auth.currentUser?.uid,
 send:op=>op.taskId==="_group_"?
  recordGroupWazifaOnly(op.count,op.day,op.id):
  recordPersonalWazifa(op.taskId,op.count,op.day,{
   durationMs:op.durationMs,intervals:op.intervals,source:op.source,syncId:op.id}),
 onChange:()=>{updateWzSyncStatus();if(["personal-reader","group-reader"].includes(state.mode))refreshHeroReader();}
});
function updateWzSyncStatus(){
 const el=$("#wz-sync-status");if(!el)return;
 const {pending,error,online}=wzSync.status();
 el.dataset.pending=String(pending>0);
 el.textContent=pending?(!online?
  "آف لائن: "+fmt(pending)+" تسبیح فون میں محفوظ، انٹرنیٹ کا انتظار":
  error?"سنک رکا ہوا ہے: "+error+" • "+fmt(pending)+" گنتیاں فون میں محفوظ":
  fmt(pending)+" تسبیح فون میں محفوظ، Firebase کو بھیجی جا رہی ہیں"):
  "تمام تسبیح Firebase میں محفوظ ہے؛ Save صرف کاؤنٹر صفر کرے گا";
}
function resetWzSession(auto=false){
 if(!state.tapQueue)return;
 state.tapQueue=0;state.lastTapAt=0;state.clockMs=0;state.clockStart=null;
 state.clockLastTap=null;state.clockIntervals=0;state.tapGapMs=0;state.tapGapTotalMs=0;
 persistDraft();wzSync.schedule(0);refreshHeroReader();
 const note=$("#wz-session-note");
 if(note)note.textContent=auto?
  "پانچ منٹ کی خاموشی پر کاؤنٹر خود صفر ہوا؛ گنتی محفوظ ہے۔":
  "Save: کاؤنٹر صفر ہوگیا؛ گنتی محفوظ رہے گی۔";
}
function checkWzIdle(){
 if(["personal-reader","group-reader"].includes(state.mode)&&state.tapQueue>0&&
  state.lastTapAt&&Date.now()-state.lastTapAt>=300000)resetWzSession(true);
}

const owner=()=>state.profile?.role==="owner";
try{
 state.soundEnabled=localStorage.getItem("durood-wz-sound")==="1";
 state.vibrateEnabled=localStorage.getItem("durood-wz-vibration")==="1";
  state.soundLevel=Math.min(5,Math.max(1,Number(localStorage.getItem("durood-wz-sound-level"))||3));
  state.vibrateLevel=Math.min(5,Math.max(1,Number(localStorage.getItem("durood-wz-vibration-level"))||3));
}catch{}
let wzTapAudio=null;
function playWazifaFeedback(){
 if(state.vibrateEnabled){try{navigator.vibrate?.(8+state.vibrateLevel*16);}catch{}}
 if(!state.soundEnabled)return;
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  wzTapAudio ||= new Audio();
  if(wzTapAudio.state==="suspended")void wzTapAudio.resume().catch(()=>{});
  const oscillator=wzTapAudio.createOscillator(),gain=wzTapAudio.createGain(),at=wzTapAudio.currentTime;
  oscillator.type="sine";oscillator.frequency.setValueAtTime(740,at);
  gain.gain.setValueAtTime(0.01+state.soundLevel*0.014,at);gain.gain.exponentialRampToValueAtTime(0.001,at+0.055);
  oscillator.connect(gain);gain.connect(wzTapAudio.destination);
  oscillator.start(at);oscillator.stop(at+0.055);
 }catch{}
}

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
  wzSync.stop();
  state.subscriptions.forEach(fn=>{try{fn();}catch{}});
  state.subscriptions=[];state.started=false;state.migrating=false;state.migrationPromise=null;
}
function setMember(profile){
  if(!profile?.uid)return;
  if(state.profile?.uid===profile.uid){state.profile=profile;return;}
  stop();
  state.profile=profile;wzSync.start(profile.uid);state.group=null;state.groupExists=false;state.groupStats=null;
  state.yearStats=null;state.personal=[];state.inbox=[];state.shareFor=null;state.shareNotice="";state.mode="list";state.error="";
  state.bootstrapTried=false;state.tapQueue=0;state.lastTapAt=0;state.tapMetaQueue=[];state.historyDay=null;state.continueFor=null;state.tapBusy=false;state.historyLimit=60;state.draftDay=null;
}
function setError(e){
  state.error=String(e?.code||e?.message||e||"رابطہ دستیاب نہیں").slice(0,180);
  const form=$("#wazifa-form");
  if(form){
    let region=form.querySelector(".wz-error");
    if(!region){region=document.createElement("p");region.className="wz-error";form.append(region);}
    region.textContent=state.error;
  }else {
   const reader=$("#wz-hero-error");
   if(reader){reader.textContent=state.error;reader.hidden=false;}else render();
  }
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
function compactCount(label,number){
 return '<div class="wz-inline-count"><small>'+esc(label)+'</small><strong>'+fmt(number)+'</strong></div>';
}
function groupCard(){
 const g=currentGroup(),enabled=g.active===true,ready=state.groupExists;
 const stats=state.groupStats||{},annual=state.yearStats||{},today=readingDay();
 const todayCount=stats.day===today?Number(stats.today||0):0;
 const daily=Number(g.dailyGoal||0),all=Number(stats.total||0);
 const yearGoal=Number(g.yearlyGoal||0),yearTotal=Number(annual.total||0);
 return '<article class="wz-card wz-group '+(enabled?'is-live':'is-off')+'">'+
 '<div class="wz-tasbih-top"><button type="button" class="wz-button wz-primary wz-tasbih-cta" data-wazifa-action="read-group" '+(!enabled||!ready?'disabled':'')+'>📿 تسبیح کریں</button></div>'+
 '<header class="wz-card-head"><div><span class="wz-caption">گروپ وظیفہ</span><h2>'+esc(g.title)+'</h2></div>'+
 '<span class="wz-state '+(enabled?'on':'')+'"><i class="wz-led"></i>'+(enabled?'جاری ہے':'بند ہے')+'</span></header>'+
 '<div class="wz-inline-counts" aria-label="گروپ کی براہ راست اکاؤنٹنگ">'+
 compactCount("آج پڑھا",todayCount)+compactCount("روزانہ ہدف",daily)+
 compactCount("آج باقی",Math.max(0,daily-todayCount))+
 compactCount("مجموعی شمار",all)+compactCount("سالانہ ہدف",yearGoal)+
 compactCount("سالانہ باقی",Math.max(0,yearGoal-yearTotal))+'</div>'+
 '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(g.arabic)+'</p>'+
 '<p class="wz-help">'+esc(g.instructions)+'</p>'+
 (owner()?'<div class="wz-actions"><button type="button" class="wz-button" data-wazifa-action="edit-group">سیٹنگ</button></div>':'')+
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
 '<header class="wz-card-head"><div><span class="wz-caption">ذاتی وظیفہ · '+esc(hasContinuation(task)?"ڈیلی":({daily:"ڈیلی",fixed:"فکس",open:"اوپن"}[task.kind]||""))+'</span><h3><bdi dir="ltr" class="wz-serial">'+esc(wazifaSerial(task))+'</bdi> · '+esc(task.title)+'</h3></div><span class="wz-state">'+stateText+'</span></header>'+
 '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(task.arabic)+'</p><p class="wz-help">'+esc(task.instructions)+'</p>'+
 (task.kind==="fixed"?fixedPlanMarkup(task):
  '<div class="wz-inline-counts" aria-label="روزانہ وظیفے کا شمار">'+
  compactCount("آج پڑھا",task.day===readingDay()?task.today:0)+
  compactCount("آج ہدف",targetForDay(task,readingDay()))+
  compactCount("مجموعی شمار",task.total||0)+'</div><p class="wz-help">آغاز '+esc(task.startDate)+'</p>')+
 '<div class="wz-actions"><button type="button" class="wz-button" data-wazifa-action="edit-personal" data-wazifa-id="'+esc(task.id)+'">سیٹنگ</button>'+
 '<button type="button" class="wz-button" data-wazifa-action="share-personal" data-wazifa-id="'+esc(task.id)+'" '+(!Number.isSafeInteger(task.wNumber)?'disabled':'')+'>دوسرے یوزر کو شیئر کریں</button>'+
 '</div>'+
 (state.shareFor===task.id?'<div class="wz-share-form" role="group"><label for="wz-share-target">صرف اپنی سائیڈ کی ممبر آئی ڈی (مثلاً DI-2)</label>'+
 '<div class="wz-share-row"><input id="wz-share-target" placeholder="'+(state.profile?.gender==="female"?"D2":"DI-2")+'" dir="ltr" autocomplete="off" maxlength="16" aria-label="وصول کنندہ ممبر آئی ڈی">'+
 '<button type="button" class="wz-button wz-primary" data-wazifa-action="send-personal" data-wazifa-id="'+esc(task.id)+'">وظیفہ بھیجیں</button></div>'+
 '<p class="wz-help">مردوں کی شناخت DI-1، DI-2 اور خواتین کی D1، D2 ہے۔ شیئرنگ صرف اپنی سائیڈ میں ہوگی۔</p></div>':'')+
 '</article>';
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
 const continued=hasContinuation(original),expired=original.kind==="fixed"&&fixedExpired(original);
 const kind=g?"group":continued?"daily":original.kind||"daily";
 const kinds=[["daily","ڈیلی وظیفہ","ہر روز پڑھنا ہے"],["fixed","فکس وظیفہ","مقررہ تاریخ تک"],["open","اوپن وظیفہ","اپنی مرضی سے"]];
 if(owner())kinds.push(["group","گروپ وظیفہ","تمام ممبرز کے لیے"]);
 const title=g?"گروپ وظیفے کی سیٹنگ":state.editId?"ذاتی وظیفے میں ترمیم":"نیا وظیفہ";
 return '<div class="wz-form-head"><button type="button" class="wz-button" data-wazifa-action="back">بند کریں</button><h2>'+title+'</h2></div>'+
 '<form id="wazifa-form" class="wz-form"><label>وظیفے کا نام<input name="title" required maxlength="80" placeholder="مثلاً آیت الکرسی" value="'+esc(original.title||'')+'"></label>'+
 '<label>عربی عبارت / درود<textarea name="arabic" rows="4" required maxlength="3000" placeholder="عربی عبارت درج کریں">'+esc(original.arabic||'')+'</textarea></label>'+
 '<label>طریقہ / ہدایات<textarea name="instructions" rows="3" maxlength="1200" placeholder="پڑھنے کا طریقہ">'+esc(original.instructions||'')+'</textarea></label>'+
 '<label>وظیفے کا مقصد<textarea name="purpose" rows="3" maxlength="1200" placeholder="اس وظیفے کا مقصد">'+esc(original.purpose||'')+'</textarea></label>'+
 '<p class="wz-label">وظیفے کی قسم منتخب کریں</p><div class="wz-kind">'+kinds.map(([id,name,description])=>
   '<label class="wz-kind-choice"><input type="radio" name="kind" value="'+id+'" '+(kind===id?'checked':'')+(continued&&id!==kind?' disabled':expired&&id==="open"?' disabled':'')+'><span><b>'+name+'</b><small>'+description+'</small></span></label>'
 ).join('')+'</div>'+
 '<div class="wz-form-goals"><label class="wz-goal-field" data-wz-goal="daily">روزانہ ہدف<input name="dailyGoal" type="number" min="1" max="1000000000" value="'+esc(continued?activeDailyGoal(original):expired?Math.ceil(original.goal/spanDays(original.startDate,original.endDate)):original.dailyGoal||original.goal||200)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="total">کل ہدف<input name="goal" type="number" min="1" max="1000000000" '+(continued?'readonly ':'')+'value="'+esc(original.goal||1000)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="year">سالانہ کل ہدف<input name="yearlyGoal" type="number" min="1" max="1000000000" value="'+esc(original.yearlyGoal||1000000)+'"></label></div>'+
 '<div class="wz-dates"><label>آغاز کی تاریخ<input name="startDate" type="date" required '+(continued?'readonly ':'')+'value="'+esc(original.startDate||readingDay())+'"></label>'+
 '<label data-wz-end>اختتامی تاریخ (خودکار)<input name="endDate" type="date" readonly value="'+esc(original.endDate||'')+'"></label></div>'+
 '<label class="wz-fixed-days" data-wz-days>کتنے دن کا وظیفہ؟<input name="durationDays" type="number" min="1" max="3650" '+(continued?'readonly ':'')+'value="'+esc(original.kind==="fixed"&&spanDays(original.startDate,original.endDate)||41)+'"></label>'+
 dailyConversionHint(original)+
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
 return '<div class="wz-hero-stat">'+'<div class="wz-hero-stat-copy"><small>'+esc(label)+'</small><strong'+(id?' id="'+id+'"':'')+'>'+esc(value)+'</strong></div></div>';
}
function heroTile(label,value,icon,id){
 return '<div class="wz-hero-tile">'+'<small>'+esc(label)+'</small><strong'+(id?' id="'+id+'"':'')+'>'+esc(value)+'</strong></div>';
}
function durationText(ms){
 const whole=Math.max(0,Math.floor(Number(ms)||0)),seconds=Math.floor(whole/1000);
 return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60]
   .map(n=>String(n).padStart(2,"0")).join(":")+"."+String(Math.floor(whole%1000/100));
}

// Source totals on older dates may lack separate source fields.
// Render an unattributed remainder in the dated/manual column without rewriting Firestore.
function readingSources(entry={},fallbackCount=0){
 const raw=Number(entry?.count),count=Number.isFinite(raw)&&raw>=0?raw:Math.max(0,Number(fallbackCount)||0);
 const tasbih=Math.min(count,Math.max(0,Number(entry?.tasbihCount)||0));
 const explicitManual=Math.min(Math.max(0,count-tasbih),Math.max(0,Number(entry?.manualCount)||0));
 const legacy=Math.max(0,count-tasbih-explicitManual);
 return {count,tasbih,manual:explicitManual+legacy,legacy};
}
function readingPace(record,live=false){
 const ledger=record?.dailyLedger&&typeof record.dailyLedger==="object"?record.dailyLedger:{};
 let duration=0,intervals=0;
 for(const entry of Object.values(ledger)){
  const ms=Number(entry?.durationMs||0),n=Math.max(0,Number(entry?.intervals||0));
  // Earlier sessions stored N-1 button gaps instead of N completed readings.
  const divisor=Math.max(n,readingSources(entry).tasbih);
  if(Number.isFinite(ms)&&ms>0&&Number.isFinite(divisor)&&divisor>0){duration+=ms;intervals+=divisor;}
 }
 if(live&&state.tapQueue>0){
  const liveMs=elapsedTime();
  if(liveMs>0){duration+=liveMs;intervals+=state.tapQueue;}
 }
 return intervals>0?duration/intervals:0;
}
function readingTimes(record,live=false){
 const ledger=record?.dailyLedger&&typeof record.dailyLedger==="object"?record.dailyLedger:{};
 let tasbih=0,manualCount=0;
 for(const entry of Object.values(ledger)){
  tasbih+=Math.max(0,Number(entry?.durationMs)||0);
  manualCount+=readingSources(entry).manual;
 }
 if(live&&state.tapQueue>0)tasbih+=elapsedTime();
 const speed=readingPace(record,live),manual=speed>0?Math.round(manualCount*speed):0;
 return {tasbih,manual,total:tasbih+manual,hasSpeed:speed>0,manualCount};
}
function dailyFigures(group,w,record,queued=0){
 const today=readingDay(),rows=group?[]:datedProgress(record);
 const r=rows.length?rows[rows.length-1]:null,entry=record?.dailyLedger?.[today]||{};
 const goal=group?Number(w.dailyGoal||0):targetForDay(w,today);
 const saved=group?(record?.day===today?Number(record.today||0):0):
  Number(r?.count??(record?.day===today?record.today:0))||0;
 const queuedToday=state.draftDay===today?queued:0;
 const previous=Math.max(0,Number(r?.previousDue||0)),credit=Math.max(0,Number(r?.previousCredit||0));
 const read=saved+queuedToday,sources=readingSources(entry,saved);
 return {goal,previous,tasbih:(group?saved:sources.tasbih)+queuedToday,
  manual:group?0:sources.manual,read,pending:Math.max(0,goal+previous-credit-read)};
}
function fiveFigureMarkup(group,w,record){
 const d=dailyFigures(group,w,record,wzSync.pending(group?"_group_":state.readerId,readingDay()));
 return '<section class="wz-today-due" aria-label="آج کی پڑھی گئی اور باقی گنتی">'+
  '<div class="wz-today-due-cell"><small>آج کل پڑھا</small><strong id="wz-today-read">'+fmt(d.read)+'</strong></div>'+
  '<div class="wz-today-due-cell"><small>آج کا باقی ہدف</small><strong id="wz-five-pending" class="wz-due-number '+(d.pending?'is-pending':'is-done')+'">'+fmt(d.pending)+'</strong></div>'+
  '<p id="wz-five-alert" class="wz-five-alert" role="status"'+(d.pending?'':' hidden')+'>آج کا باقی ہدف پورا کریں</p>'+
  '</section>';
}
function displayRecordDate(key){
 if(!dayOk(key))return key;
 return new Intl.DateTimeFormat("ur-PK",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric",numberingSystem:"latn"})
  .format(new Date(key+"T12:00:00Z"));
}
function canEnterDay(record,day){
 return !!record&&dayOk(day)&&day>=record.startDate&&day<=readingDay()&&
  (record.kind!=="fixed"||day<=record.endDate||
   (hasContinuation(record)&&day>=record.continueStartDate));
}
function wazifaCalendarMarkup(record){
 const month=state.pickerMonth||(state.draftDay||readingDay()).slice(0,7);
 const [year,monthNo]=month.split("-").map(Number);
 const first=new Date(Date.UTC(year,monthNo-1,1)).getUTCDay();
 const last=new Date(Date.UTC(year,monthNo,0)).getUTCDate();
 const selected=state.draftDay||readingDay();
 let cells="";
 for(let i=0;i<first;i++)cells+='<span class="wz-cal-empty" aria-hidden="true"></span>';
 for(let d=1;d<=last;d++){
  const day=month+"-"+String(d).padStart(2,"0");
  const enabled=canEnterDay(record,day);
  cells+='<button type="button" class="wz-cal-day'+(selected===day?' is-selected':'')+
   (day===readingDay()?' is-today':'')+'" data-wazifa-action="calendar-date" data-wazifa-day="'+day+'"'+
   (enabled?'':' disabled title="وظیفے کی مدت سے باہر"')+' aria-label="'+esc(displayRecordDate(day))+'"'+
   (selected===day?' aria-pressed="true"':'')+'>'+d+'</button>';
 }
 const label=new Intl.DateTimeFormat("ur-PK",{timeZone:"UTC",month:"long",year:"numeric",numberingSystem:"latn"})
  .format(new Date(month+"-01T12:00:00Z"));
 return '<div class="wz-cal-box" dir="rtl"><h3 id="wz-calendar-title">تسبیح کی تاریخ منتخب کریں</h3>'+
  '<div class="wz-cal-nav"><button type="button" class="wz-cal-arrow" data-wazifa-action="calendar-prev" aria-label="پچھلا مہینہ">‹</button>'+
  '<strong>'+esc(label)+'</strong>'+
  '<button type="button" class="wz-cal-arrow" data-wazifa-action="calendar-next" aria-label="اگلا مہینہ">›</button></div>'+
  '<div class="wz-cal-grid wz-cal-weekdays">'+["اتوار","پیر","منگل","بدھ","جمعرات","جمعہ","ہفتہ"].map(x=>'<span>'+x+'</span>').join("")+'</div>'+
  '<div class="wz-cal-grid">'+cells+'</div>'+
  '<label class="wz-cal-native-label">یا تاریخ منتخب کریں <input id="wz-cal-native-date" type="date" min="'+esc(record.startDate)+'" max="'+readingDay()+'" value="'+esc(selected)+'"></label>'+
  '<p class="wz-cal-note">آج کی تسبیح سبز، پچھلی منتخب تاریخ کی تسبیح پیلے دستی شمار میں محفوظ ہوگی۔</p>'+
  '<button type="button" class="wz-button" data-wazifa-action="calendar-close">منسوخ</button></div>';
}
function changeWazifaDay(day){
 const task=state.personal.find(item=>item.id===state.readerId);
 if(!canEnterDay(task,day)){
  setError("منتخب تاریخ وظیفے کی فعال مدت میں نہیں ہے۔");return false;
 }
 if(state.tapQueue){
  setError("تاریخ تبدیل کرنے سے پہلے موجودہ تسبیح محفوظ کریں۔");return false;
 }
 state.draftDay=day;state.clockMs=0;state.clockStart=null;state.clockLastTap=null;
 state.clockIntervals=0;state.tapGapMs=0;state.tapGapTotalMs=0;
 const hidden=$("#wz-save-date");if(hidden)hidden.value=day;
 const label=$("#wz-selected-date");if(label)label.textContent=displayRecordDate(day);
 state.error="";const error=$("#wz-hero-error");if(error)error.hidden=true;
 refreshHeroReader();
 return true;
}
function datedProgress(record){
 const ledger=record?.dailyLedger&&typeof record.dailyLedger==="object"?record.dailyLedger:{};
 const today=readingDay(),start=dayOk(record?.startDate)?record.startDate:today;
 const dates=[];
 let cumulativeGoal=0,cumulativeRead=0;
 for(let d=start,i=0;d<=today&&i<3660;i++,d=addDays(d,1)){
  const entry=ledger[d]||{},goal=targetForDay(record,d),count=Math.max(0,Number(entry.count||0));
  const previousDue=Math.max(0,cumulativeGoal-cumulativeRead);
  const previousCredit=Math.max(0,cumulativeRead-cumulativeGoal);
  cumulativeGoal+=goal;cumulativeRead+=count;
  dates.push({day:d,entry,goal,count,previousDue,previousCredit,
   cumulativeGoal,cumulativeRead,balance:cumulativeRead-cumulativeGoal,
   pendingAtDay:Math.max(0,cumulativeGoal-cumulativeRead)});
 }
 // Later excess readings may settle a previously overdue day, without
 // moving the recitations out of their original daily row.
 let futureBest=-Infinity;
 for(let i=dates.length-1;i>=0;i--){
  futureBest=Math.max(futureBest,dates[i].balance);
  dates[i].remaining=Math.max(0,-futureBest);
 }
 return dates;
}
function historyEditMarkup(record,day){
 const entry=record?.dailyLedger?.[day]||{},count=Math.max(0,Number(entry.count||0));
 const permitted=record.kind!=="fixed"||day<=record.endDate||
   hasContinuation(record)&&day>=record.continueStartDate;
 return '<form class="wz-edit-form" id="wz-manual-form" data-day="'+esc(day)+'">'+
 '<h3 id="wz-edit-title">روزانہ گنتی میں تبدیلی</h3>'+
 '<p class="wz-edit-date"><time datetime="'+esc(day)+'">'+esc(displayRecordDate(day))+'</time></p>'+
 '<div class="wz-edit-saved"><small>موجودہ محفوظ تعداد</small><strong>'+fmt(count)+'</strong></div>'+
 (permitted?'<div class="wz-edit-fields">'+
 '<div class="wz-edit-signs" role="group" aria-label="تعداد جمع یا کم کریں">'+
 '<button type="button" class="wz-sign-button is-selected" aria-pressed="true" data-wazifa-action="edit-sign" data-wazifa-sign="add" title="جمع کریں">+ جمع</button>'+
 '<button type="button" class="wz-sign-button" aria-pressed="false" data-wazifa-action="edit-sign" data-wazifa-sign="remove" title="کم کریں">− کم</button></div>'+
 '<input name="operation" type="hidden" value="add">'+
 '<label>نئی تعداد لکھیں<input type="text" inputmode="numeric" name="amount" pattern="[+-]?[0-9]+" maxlength="7" autocomplete="off" placeholder="مثلاً +100 یا -20" dir="ltr" required></label></div>':
 '<p class="wz-history-note">اس تاریخ کا اندراج وظیفے کی فعال مدت میں نہیں ہے۔</p>')+
 '<p class="wz-edit-error" id="wz-edit-error" role="alert" hidden></p>'+
 '<div class="wz-modal-actions">'+
 (permitted?'<button type="submit" class="wz-button wz-primary">محفوظ کریں</button>':'')+
 '<button type="button" class="wz-button" data-wazifa-action="history-cancel">منسوخ</button></div>'+
 '</form>';
}
function wazifaHistoryMarkup(record){
 const ledger=record?.dailyLedger&&typeof record.dailyLedger==="object"?record.dailyLedger:{};
 const allRows=datedProgress(record);
 const pace=readingPace(record);
 const countedDays=Object.values(ledger).reduce((n,e)=>n+Math.max(0,Number(e?.count||0)),0);
 const historicUnallocated=Math.max(0,Number(record?.total||0)-countedDays);
 const rows=allRows.slice(-state.historyLimit).reverse().map(r=>{
  const {day,entry:e,count,goal,remaining,previousDue,previousCredit}=r;
  const source=readingSources(e,count),green=source.tasbih,yellow=source.manual;
  const time=Math.max(0,Number(e.durationMs||0));
  const outside=goal===0&&count===0&&remaining===0&&
    !hasContinuation(record)&&record.kind==="fixed"&&day>record.endDate;
  const fulfilled=!outside&&remaining===0;
  const status=outside?'<span class="wz-day-neutral">مدت مکمل</span>':
    fulfilled?'<span class="wz-day-complete">✓ بقایا مکمل، ہدف پورا</span>':
    '<span class="wz-day-pending" role="status">● آج کا باقی ہدف پورا کریں — '+fmt(remaining)+' بقایا</span>';
  const extra=count>goal?'<span class="wz-day-extra">اس تاریخ میں زائد '+fmt(count-goal)+'</span>':"";
  const item=(label,n,klass="",hint="")=>'<span class="wz-ledger-item '+klass+'"><small>'+label+'</small><strong class="'+(n>=100000?"wz-value-xl":n>=10000?"wz-value-wide":"")+'">'+fmt(n)+'</strong>'+(hint?'<em class="wz-previous-due">'+hint+'</em>':'')+'</span>';
  return '<section class="wz-history-entry '+(fulfilled?"wz-day-ok":outside?"wz-day-idle":"wz-day-due")+
   '" dir="rtl" role="button" tabindex="0" data-wazifa-action="history-day" data-wazifa-day="'+day+
   '" aria-label="'+esc(displayRecordDate(day))+' کا ریکارڈ تبدیل کریں">'+
   '<div class="wz-clear-heading"><time datetime="'+day+'">'+esc(displayRecordDate(day))+'</time>'+
   '<span class="wz-clear-state">'+status+'</span></div>'+
   '<div class="wz-history-row wz-history-clear wz-ledger-entry '+(fulfilled?"wz-day-ok":outside?"wz-day-idle":"wz-day-due")+'"><div class="wz-ledger-lines"><div class="wz-ledger-line wz-ledger-five">'+
   item("ہدف",goal,"wz-ledger-goal",previousDue?'<span>پچھلا +</span><b>'+fmt(previousDue)+'</b>':"")+
   item("تسبیح",green,"wz-ledger-green")+item("دستی",yellow,"wz-ledger-yellow")+
   item("کل",count,"wz-ledger-total")+item("بقایا",remaining,remaining?"wz-ledger-pending":"wz-ledger-done")+
   '</div></div>'+
   (previousCredit?'<p class="wz-clear-credit">پچھلے دنوں کا زائد شمار: '+fmt(previousCredit)+' (آج کے ہدف میں شامل)</p>':"")+
   '<div class="wz-clear-foot"><span class="wz-clear-clock">'+heroIcon("clock")+
   '<span>تسبیح <bdi dir="ltr">'+durationText(time)+'</bdi></span>'+
   (yellow?'<span>دستی '+(pace>0?'<bdi dir="ltr">'+durationText(Math.round(yellow*pace))+'</bdi> تخمینی':'وقت نامعلوم')+'</span>':"")+
   '<span>کل <bdi dir="ltr">'+durationText(time+(pace>0?Math.round(yellow*pace):0))+'</bdi></span></span>'+
   extra+'<button type="button" class="wz-history-edit" data-wazifa-action="history-day" data-wazifa-day="'+day+'">تبدیلی</button></div></div></section>';
 }).join("");
 const more=allRows.length>state.historyLimit?'<button type="button" class="wz-button wz-history-more" data-wazifa-action="history-more">مزید پرانا ریکارڈ دکھائیں</button>':"";
 return (historicUnallocated?'<p class="wz-history-unallocated">پرانے مجموعی شمار میں سے '+fmt(historicUnallocated)+' کی الگ تاریخ محفوظ نہیں تھی؛ اس لیے انہیں کسی غلط دن کے ہدف میں شامل نہیں کیا گیا۔</p>':"")+
 (rows||'<div class="wz-history-empty">ابھی ریکارڈ نہیں۔</div>')+more+
 '<p class="wz-history-note">پچھلا بقایا اگلے دن جمع ہوگا؛ بعد میں پورا ہونے پر کارڈ سبز ہو جائے گا۔ دستی وقت تسبیح کی اوسط رفتار سے تخمینہ ہے۔</p>';
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
 '<h2 class="wz-hero-title"><span aria-hidden="true">❖</span>'+esc(w.title)+'<span aria-hidden="true">❖</span></h2>'+ 
 '<section class="wz-reading-text wz-reading-text-visible" aria-label="وظیفے کی مکمل تفصیل">'+
 '<h3>عربی عبارت</h3><div class="wz-arabic" lang="ar" dir="rtl">'+esc(w.arabic)+'</div>'+
 '<p class="wz-reading-instruction"><b>پڑھنے کا طریقہ:</b> '+esc(w.instructions||"ہر مرتبہ مکمل وظیفہ پڑھ کر تسبیح کو ایک بار دبائیں۔")+'</p>'+
 '<p class="wz-reading-purpose"><b>وظیفے کا مقصد:</b> '+esc(w.purpose||"مقصد درج نہیں کیا گیا۔")+'</p></section>'+
 (showDates?'<div class="wz-hero-six">'+
 heroTile("روزانہ ہدف",fmt(s.dailyGoal),"target")+
 heroTile("کل دن",fmt(days),"date")+
 heroTile("مکمل دن",fmt(s.continuing?s.plan.currentDay:elapsed),"check")+
 heroTile(s.continuing?"اضافی دن":"باقی دن",s.continuing?"+"+fmt(s.plan.extraDays):fmt(remaining),"date")+
 heroTile("آغاز تاریخ",w.startDate,"date")+
 heroTile("اختتامی تاریخ",w.endDate,"date")+
 '</div>':'<div class="wz-hero-six wz-hero-six-basic">'+
 heroTile("روزانہ ہدف",fmt(s.dailyGoal),"target")+heroTile("آج پڑھا",fmt(s.todayCount),"book","wz-mini-today")+
 heroTile("آج باقی",fmt(s.dayLeft),"hourglass","wz-mini-left")+'</div>')+
 '<div class="wz-hero-topstats">'+
 heroStat("کل پڑھی گئی تعداد",fmt(s.total),"book","wz-hero-total")+
 heroStat(s.continuing?"مجموعی باقی":"باقی",fmt(s.left),"hourglass","wz-hero-left")+
 heroStat(s.continuing?"کل ہدف":"مجموعی ہدف",fmt(s.totalGoal),"target","wz-hero-goal")+
 '</div>'+
 '<div class="wz-percent-today">'+
 '<div class="wz-percent-tile"><small>فیصد تکمیل</small><strong id="wz-hero-percent">'+s.percent+'%</strong></div>'+
 '<div class="wz-today-tile"><small>آج پڑھی گئی تعداد</small><strong id="wz-hero-today-read">'+fmt(dailyFigures(group,w,record,wzSync.pending(group?"_group_":state.readerId,today)).read)+'</strong></div>'+
 '</div>'+
 '<div class="wz-hero-progress"><span id="wz-hero-progress-label">'+progress+'% تکمیل</span>'+
 '<progress id="wz-hero-progress-bar" max="100" value="'+progress+'"></progress></div>'+
 fiveFigureMarkup(group,w,record)+
 '<div class="wz-reader-controls-row">'+
 '<div class="wz-hero-speed" aria-label="تسبیح کی رفتار">'+
 '<div><small>فی ذکر وقت</small><strong id="wz-speed-sec">—</strong></div>'+
 '<div><small>فی منٹ</small><strong id="wz-speed-min">—</strong></div>'+
 '<div><small>فی گھنٹہ</small><strong id="wz-speed-hour">—</strong></div>'+
 '</div>'+
 (group?'<span class="wz-current-date">'+esc(displayRecordDate(today))+'</span>':
  '<div class="wz-date-select"><input id="wz-save-date" type="hidden" value="'+esc(state.draftDay||today)+'">'+
  '<button type="button" class="wz-date-button" data-wazifa-action="open-date-picker" aria-label="تسبیح کی تاریخ منتخب کریں">'+
  '<span id="wz-selected-date">'+esc(displayRecordDate(state.draftDay||today))+'</span></button></div>')+
 '<button type="button" class="wz-button wz-primary wz-reader-save" data-wazifa-action="save-taps" '+(state.tapQueue?'':'disabled')+'>'+
  'محفوظ کریں <b id="wz-unsaved">'+fmt(state.tapQueue)+'</b></button>'+
 '</div>'+
 '<div class="wz-reader-feedback" aria-label="آواز اور وائبریشن کے کنٹرول">'+
 '<div class="wz-feedback-control">'+
  '<button type="button" class="wz-feedback-button" data-wazifa-action="toggle-vibration" aria-pressed="'+state.vibrateEnabled+'">وائبریشن '+(state.vibrateEnabled?'آن':'آف')+'</button>'+
  '<div class="wz-feedback-level"><button type="button" data-wazifa-action="vibration-down" aria-label="وائبریشن کم کریں">−</button>'+
  '<output id="wz-vibration-level" aria-label="وائبریشن کی سطح">'+state.vibrateLevel+'</output>'+
  '<button type="button" data-wazifa-action="vibration-up" aria-label="وائبریشن بڑھائیں">+</button></div></div>'+
 '<div class="wz-feedback-control">'+
  '<button type="button" class="wz-feedback-button" data-wazifa-action="toggle-sound" aria-pressed="'+state.soundEnabled+'">ساؤنڈ '+(state.soundEnabled?'آن':'آف')+'</button>'+
  '<div class="wz-feedback-level"><button type="button" data-wazifa-action="sound-down" aria-label="ساؤنڈ کم کریں">−</button>'+
  '<output id="wz-sound-level" aria-label="ساؤنڈ کی سطح">'+state.soundLevel+'</output>'+
  '<button type="button" data-wazifa-action="sound-up" aria-label="ساؤنڈ بڑھائیں">+</button></div></div>'+
 '</div>'+
 '<button type="button" id="wz-dial" class="wz-dial wz-hero-dial'+(state.dialFloating?' is-floating':'')+'" style="--wz-ring:'+Math.min(100,Math.floor(s.todayCount/Math.max(1,s.dailyGoal)*100))+'%" data-wazifa-action="tap">'+
 '<strong id="wz-dial-number">'+fmt(state.tapQueue)+'</strong>'+
 '<span class="wz-dial-clock"><span>سیشن کا وقت <bdi id="wz-clock" dir="ltr">00:00:00.0</bdi></span></span>'+
 '<span class="wz-dial-plus" aria-hidden="true">+</span><span class="wz-dial-invite">پڑھیں یا تسبیح کریں</span>'+
 '</button>'+
  '<h3 class="wz-record-title">روزانہ محفوظ ریکارڈ</h3>'+
 '<div id="wz-record-history">'+history+'</div>'+
  '<p class="wz-reader-advice">ہر دباؤ فوراً فون میں محفوظ اور Firebase پر منتقل ہوتا ہے۔ Save صرف کاؤنٹر صفر کرتا ہے؛ پانچ منٹ خاموشی پر خودکار Save ہوگا۔</p>'+
 '<p id="wz-sync-status" class="wz-sync-status" role="status" aria-live="polite"></p>'+
 '<p id="wz-session-note" class="wz-help" role="status"></p>'+
 (state.tapQueue?'<p class="wz-help">ابھی غیر محفوظ گنتی: '+fmt(state.tapQueue)+'</p>':'')+
 '<p id="wz-hero-error" class="wz-error" '+(state.error?'':'hidden')+'>'+esc(state.error)+'</p>'+
 '</div></div>'+(group?"":'<dialog class="wz-edit-dialog" id="wz-edit-dialog" aria-labelledby="wz-edit-title"></dialog><dialog class="wz-date-dialog" id="wz-date-dialog" aria-labelledby="wz-calendar-title"></dialog>');
}
function refreshHeroReader(){
 const root=$("#wazaif-root");if(!root||!root.querySelector("#wz-dial"))return;
 const group=state.mode==="group-reader",w=group?currentGroup():state.personal.find(x=>x.id===state.readerId);
 const record=group?state.groupStats:w;
 if(!w||!record)return;
 const s=heroReadingState(group,w,record);
 const taskId=group?"_group_":state.readerId;
 const todayCount=s.todayCount+wzSync.pending(taskId,readingDay()),total=s.total+wzSync.pending(taskId);
 const dayLeft=Math.max(0,s.dailyGoal-todayCount);
  const left=Math.max(0,s.totalGoal-total);
  const percent=s.totalGoal?Math.min(100,Math.floor(total*100/s.totalGoal)):0;
 const set=(id,value)=>{const el=root.querySelector("#"+id);if(el)el.textContent=value;};
 set("wz-dial-number",fmt(state.tapQueue));set("wz-unsaved",fmt(state.tapQueue));
 const save=root.querySelector('[data-wazifa-action="save-taps"]');
 if(save)save.disabled=state.tapBusy||state.tapQueue===0;
 set("wz-hero-total",fmt(total));set("wz-hero-left",fmt(left));
 set("wz-hero-percent",percent+"%");set("wz-hero-progress-label",percent+"% تکمیل");
 set("wz-hero-today",fmt(todayCount));set("wz-hero-day-left",fmt(dayLeft));
  if(s.continuing)set("wz-hero-days-left",fmt(left));
 set("wz-mini-today",fmt(todayCount));set("wz-mini-left",fmt(dayLeft));
 const d=dailyFigures(group,w,record,wzSync.pending(group?"_group_":state.readerId,readingDay()));
 set("wz-today-read",fmt(d.read));set("wz-hero-today-read",fmt(d.read));
 for(const [id,value] of [["wz-five-goal",d.goal],["wz-five-tasbih",d.tasbih],
  ["wz-five-manual",d.manual],["wz-five-read",d.read],["wz-five-pending",d.pending]])set(id,fmt(value));
 const pendingCell=root.querySelector("#wz-five-pending");
 if(pendingCell){pendingCell.classList.toggle("is-pending",d.pending>0);
  pendingCell.classList.toggle("is-done",d.pending===0);}
 const notice=root.querySelector("#wz-five-alert");
 if(notice){notice.hidden=d.pending===0;notice.textContent="آج کا باقی ہدف پورا کریں";}
 const t=readingTimes(record,true);
 set("wz-time-real",durationText(t.tasbih));
 set("wz-time-est",t.hasSpeed?durationText(t.manual):"—");
 set("wz-time-all",durationText(t.total));
 updateWzSyncStatus();
 const bar=root.querySelector("#wz-hero-progress-bar");if(bar)bar.value=percent;
 const step=Math.max(1,s.dailyGoal);const cycle=todayCount>0&&todayCount%step===0?step:todayCount%step;
 root.querySelector("#wz-dial").style.setProperty("--wz-ring",Math.floor(cycle/step*100)+"%");
 if(!group){
   const history=root.querySelector("#wz-record-history");
   if(history&&!history.contains(document.activeElement))history.innerHTML=wazifaHistoryMarkup(record);
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
   root.innerHTML=readerMarkup(state.mode==="group-reader");refreshHeroReader();return;
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
 persistDraft();wzSync.schedule(0);
 if(state.tapBusy){state.pendingBack=true;return;}
 state.pendingBack=false;state.mode="list";state.panel=null;state.readerId=null;state.historyDay=null;state.tapQueue=0;state.lastTapAt=0;state.tapMetaQueue=[];state.clockLastTap=null;state.dialFloating=false;state.skipDialClick=false;state.draftDay=null;
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
     if(existing&&existing.kind==="fixed"&&kind==="daily"&&fixedExpired(existing)){
       if(!valid(dailyGoal))throw Error("درست روزانہ ہدف درج کریں۔");
       const already=hasContinuation(existing),start=addDays(existing.endDate,1),today=readingDay();
       const effectiveDay=today<start?start:today;
       const change=already?{continueDailyGoal:dailyGoal,
        continueGoalHistory:{...(existing.continueGoalHistory||{[start]:existing.continueDailyGoal}),[effectiveDay]:dailyGoal},
        updatedAt:serverTimestamp()}:
        {continueStartDate:start,continueDailyGoal:dailyGoal,
         continueBaseTotal:Number(existing.total||0),continueGoalHistory:{[start]:dailyGoal},
         updatedAt:serverTimestamp()};
       await updateDoc(doc(db,"memberWazaif",uid,"items",state.editId),change);
     }else if(existing&&hasContinuation(existing)){
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
function draftStorageKey(){
 return auth.currentUser&&state.readerId?"durood-wazifa-draft-v2-"+auth.currentUser.uid+"-"+state.readerId:null;
}
function elapsedTime(){
 return Math.max(0,Math.floor(state.clockMs+(state.clockStart===null?0:performance.now()-state.clockStart)));
}
function persistDraft(){
 const key=draftStorageKey();if(!key)return;
 try{
  if(state.tapQueue>0)localStorage.setItem(key,JSON.stringify({
   day:state.draftDay,count:state.tapQueue,ms:elapsedTime(),lastTapAt:state.lastTapAt}));
  else localStorage.removeItem(key);
 }catch{}
}
function restoreDraft(){
 state.tapQueue=0;state.tapMetaQueue=[];
 const key=draftStorageKey();if(!key)return;
 try{
  const draft=JSON.parse(localStorage.getItem(key)||"null");
  const task=state.personal.find(w=>w.id===state.readerId);
  if(draft&&task&&dayOk(draft.day)&&draft.day>=task.startDate&&draft.day<=readingDay()&&
    Number.isSafeInteger(draft.count)&&draft.count>0&&draft.count<=1000000){
   state.draftDay=draft.day;state.tapQueue=draft.count;
   state.clockMs=Math.min(86400000,Math.max(0,Number(draft.ms)||0));
   state.lastTapAt=Math.max(0,Number(draft.lastTapAt)||Date.now());
   const marker=key+"-v3-imported";
   if(!localStorage.getItem(marker)){
    let remaining=wzSync.pending(state.readerId,draft.day)?0:draft.count;
    while(remaining>0){
     const n=Math.min(1000,remaining);
     if(!wzSync.enqueue({taskId:state.readerId,day:draft.day,
       count:n,source:draft.day===readingDay()?"tasbih":"manual",durationMs:0,
       intervals:draft.day===readingDay()?n:0}))break;
     remaining-=n;
    }
    if(remaining===0)localStorage.setItem(marker,"1");
   }
  }
 }catch{}
}
function startClock(){
 state.clockStart=null;state.clockLastTap=null;state.clockMs=0;state.clockIntervals=0;state.tapGapMs=0;state.tapGapTotalMs=0;
 state.tapQueue=0;state.lastTapAt=0;state.tapMetaQueue=[];state.draftDay=readingDay();
}
function tap(){
 if(state.skipDialClick){state.skipDialClick=false;return;}
 if(state.busy||state.tapBusy||!auth.currentUser||!["group-reader","personal-reader"].includes(state.mode))return;
 if(state.mode==="personal-reader"){
  const task=state.personal.find(item=>item.id===state.readerId);
  if(!task||state.draftDay<task.startDate||
    task.kind==="fixed"&&state.draftDay>task.endDate&&
    !(hasContinuation(task)&&state.draftDay>=task.continueStartDate)){
   setError("منتخب تاریخ وظیفے کی مدت میں نہیں ہے۔");return;
  }
 }
 const pressedAt=performance.now();
 if(state.clockStart===null)state.clockStart=pressedAt;
 if(state.clockLastTap!==null){
   const gap=pressedAt-state.clockLastTap;
   if(gap>0){state.tapGapMs=gap;state.tapGapTotalMs+=gap;state.clockIntervals++;}
 }
 const day=state.draftDay||readingDay(),isToday=day===readingDay();
 const durationMs=isToday&&state.clockLastTap!==null?
  Math.min(86400000,Math.max(0,Math.round(pressedAt-state.clockLastTap))):0;
 if(!wzSync.enqueue({taskId:state.mode==="group-reader"?"_group_":state.readerId,
   day,source:isToday?"tasbih":"manual",count:1,
   durationMs,intervals:isToday?1:0})){
  setError("فون کی اسٹوریج میں محفوظ نہیں ہو سکا؛ گنتی نہیں بڑھائی گئی۔");return;
 }
 state.clockLastTap=pressedAt;
 state.tapQueue++;state.lastTapAt=Date.now();
 try{const k=draftStorageKey();if(k)localStorage.setItem(k+"-v3-imported","1");}catch{}
 playWazifaFeedback();
 persistDraft();
 const el=$("#wz-dial-number");if(el)el.textContent=fmt(state.tapQueue);
 const unsaved=$("#wz-unsaved");if(unsaved)unsaved.textContent=fmt(state.tapQueue);
 const save=$('[data-wazifa-action="save-taps"]');if(save)save.disabled=false;
 tick();
}
async function drain(){
 // Every tap was queued already. Save resets only the visible session.
 resetWzSession(false);
 await wzSync.flush();
}
function tick(){
 if(!["personal-reader","group-reader"].includes(state.mode)||document.hidden)return;
 const value=elapsedTime(),h=Math.floor(value/3600000),m=Math.floor(value/60000)%60,sec=Math.floor(value/1000)%60,tenth=Math.floor(value%1000/100);
 const clock=$("#wz-clock");
 if(clock)clock.textContent=[h,m,sec].map(x=>String(x).padStart(2,"0")).join(":")+"."+tenth;
 // Calculate live pace as elapsed session time divided by completed taps.
 // The first tap starts the session, so both time and projection update continuously.
 const seconds=state.tapQueue>0?value/(1000*state.tapQueue):0;
 const pace=n=>Number.isFinite(n)&&n>0?n.toLocaleString("en",{maximumFractionDigits:1}):"—";
 const perZikr=seconds>0?pace(seconds)+" ثانیے":"—";
 const perMinute=seconds>0?pace(60/seconds):"—";
 const perHour=seconds>0?pace(3600/seconds):"—";
 for(const [id,text] of [["#wz-speed-sec",perZikr],["#wz-speed-min",perMinute],["#wz-speed-hour",perHour]]){
  const node=$(id);if(node)node.textContent=text;
 }
 checkWzIdle();
 if(state.seenDay!==readingDay()){
  state.seenDay=readingDay();
  if(!state.tapQueue&&state.mode==="personal-reader"){
   state.draftDay=readingDay();const picker=$("#wz-save-date");if(picker)picker.value=state.draftDay;
   const selected=$("#wz-selected-date");if(selected)selected.textContent=displayRecordDate(state.draftDay);
  }
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
 if(!document.hidden){checkWzIdle();wzSync.schedule(0);}
 if(document.hidden&&state.clockStart!==null){
   state.clockMs=elapsedTime();state.clockStart=null;state.clockLastTap=null;persistDraft();
 }
 if(document.hidden)wzSync.schedule(0);
});
window.addEventListener("pagehide",()=>{persistDraft();wzSync.schedule(0);});
setInterval(()=>{checkWzIdle();if(wzSync.pending()&&navigator.onLine!==false)wzSync.schedule(0);},20000);
document.addEventListener("keydown",event=>{
 const row=event.target.closest(".wz-history-entry[data-wazifa-action='history-day']");
 if(row&&event.target===row&&(event.key==="Enter"||event.key===" ")){
  event.preventDefault();row.click();
 }
},true);
document.addEventListener("click",event=>{
 const button=event.target.closest("[data-wazifa-action]");
 if(!button)return;
 const action=button.dataset.wazifaAction,id=button.dataset.wazifaId;
 event.preventDefault();event.stopImmediatePropagation();
 if(action==="edit-sign"){
   const form=button.closest("#wz-manual-form"),mode=button.dataset.wazifaSign;
   if(!form||!["add","remove"].includes(mode))return;
   const hidden=form.elements.namedItem("operation"),input=form.elements.namedItem("amount");
   if(hidden)hidden.value=mode;
   form.querySelectorAll(".wz-sign-button").forEach(item=>{
    const active=item.dataset.wazifaSign===mode;
    item.classList.toggle("is-selected",active);item.setAttribute("aria-pressed",String(active));
   });
   if(input){
    const digits=String(input.value||"").replace(/^[+-]/,"");
    input.value=(mode==="remove"?"-":"+")+digits;
    input.focus();input.setSelectionRange(input.value.length,input.value.length);
   }
   return;
 }
 if(["vibration-up","vibration-down","sound-up","sound-down"].includes(action)){
  const sound=action.startsWith("sound-"),key=sound?"soundLevel":"vibrateLevel";
  state[key]=Math.min(5,Math.max(1,state[key]+(action.endsWith("-up")?1:-1)));
  try{localStorage.setItem(sound?"durood-wz-sound-level":"durood-wz-vibration-level",String(state[key]));}catch{}
  const output=$(sound?"#wz-sound-level":"#wz-vibration-level");
  if(output)output.textContent=String(state[key]);
  if(!sound&&state.vibrateEnabled){try{navigator.vibrate?.(8+state.vibrateLevel*16);}catch{}}
  if(sound&&state.soundEnabled)playWazifaFeedback();
  return;
 }
 if(action==="toggle-sound"||action==="toggle-vibration"){
  const sound=action==="toggle-sound",key=sound?"soundEnabled":"vibrateEnabled";
  state[key]=!state[key];
  try{localStorage.setItem(sound?"durood-wz-sound":"durood-wz-vibration",state[key]?"1":"0");}catch{}
  button.setAttribute("aria-pressed",String(state[key]));
  button.textContent=(sound?"ساؤنڈ ":"وائبریشن ")+(state[key]?"آن":"آف");
  return;
 }
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
 if(action==="read-group"){
   if(!state.groupExists||currentGroup().active!==true)return;
   state.error="";state.readerId=null;state.tapQueue=0;startClock();
   if(currentGroup().countAsDurood!==false){
     window.duroodClassicBridge?.openGroupReader?.();
     return;
   }
   state.mode="group-reader";state.historyDay=null;state.tapMetaQueue=[];state.draftDay=readingDay();
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();root?.scrollIntoView({block:"start",behavior:"auto"});return;
 }
 if(action==="read-personal"){
   const selected=state.personal.find(item=>item.id===id);
   if(!selected||!["جاری","روزانہ جاری"].includes(taskStatus(selected)))return;
   state.readerId=id;state.mode="personal-reader";state.historyDay=null;state.historyLimit=60;state.error="";startClock();restoreDraft();
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();root?.scrollIntoView({block:"start",behavior:"auto"});return;
 }
 if(action==="open-date-picker"){
   if(state.mode!=="personal-reader")return;
   const task=state.personal.find(item=>item.id===state.readerId);
   const modal=$("#wz-date-dialog");if(!task||!modal)return;
   if(state.tapQueue){setError("تاریخ بدلنے سے پہلے Save دباکر موجودہ کاؤنٹر صفر کریں۔");return;}
   state.pickerMonth=(state.draftDay||readingDay()).slice(0,7);
   modal.innerHTML=wazifaCalendarMarkup(task);
   if(typeof modal.showModal==="function")modal.showModal();else modal.setAttribute("open","");
   return;
 }
 if(action==="calendar-close"){
   const modal=$("#wz-date-dialog");
   if(modal?.open&&typeof modal.close==="function")modal.close();else modal?.removeAttribute("open");
   return;
 }
 if(action==="calendar-prev"||action==="calendar-next"){
   const task=state.personal.find(item=>item.id===state.readerId);
   const month=state.pickerMonth;const modal=$("#wz-date-dialog");
   if(!task||!month||!modal)return;
   const [y,m]=month.split("-").map(Number);
   const next=new Date(Date.UTC(y,m-1+(action==="calendar-prev"?-1:1),1)).toISOString().slice(0,7);
   if(next<task.startDate.slice(0,7)||next>readingDay().slice(0,7))return;
   state.pickerMonth=next;modal.innerHTML=wazifaCalendarMarkup(task);return;
 }
 if(action==="calendar-date"){
   if(changeWazifaDay(button.dataset.wazifaDay)){
    const modal=$("#wz-date-dialog");
    if(modal?.open&&typeof modal.close==="function")modal.close();else modal?.removeAttribute("open");
   }
   return;
 }
 if(action==="save-taps")return void drain();
 if(action==="history-more"){
  state.historyLimit=Math.min(3660,state.historyLimit+60);
  const task=state.personal.find(x=>x.id===state.readerId),target=$("#wz-record-history");
  if(task&&target)target.innerHTML=wazifaHistoryMarkup(task);
  return;
 }
 if(action==="history-day"&&button.dataset.wazifaDay){
   const record=state.personal.find(x=>x.id===state.readerId),day=button.dataset.wazifaDay;
   const modal=$("#wz-edit-dialog");
   if(!modal||!record||!dayOk(day)||day<record.startDate||day>readingDay())return;
   state.historyDay=day;
   modal.innerHTML=historyEditMarkup(record,day);
   if(typeof modal.showModal==="function")modal.showModal();
   else modal.setAttribute("open","");
   return;
 }
 if(action==="history-cancel"){
   const modal=$("#wz-edit-dialog");
   if(modal?.open&&typeof modal.close==="function")modal.close();
   else modal?.removeAttribute("open");
   state.historyDay=null;
   return;
 }
 if(action==="tap")return tap();
 if(action==="delete-personal"&&id){
   if(!window.confirm("یہ ذاتی وظیفہ حذف کریں؟ اس کا ذاتی ریکارڈ بھی ختم ہوگا۔"))return;
   deleteDoc(doc(db,"memberWazaif",auth.currentUser.uid,"items",id)).then(back).catch(setError);return;
 }
},true);
document.addEventListener("submit",event=>{
 if(event.target?.id==="wz-manual-form"){
  event.preventDefault();event.stopImmediatePropagation();
  const form=event.target,task=state.personal.find(w=>w.id===state.readerId);
  if(!task||state.busy||state.tapBusy)return;
  const data=new FormData(form),day=form.dataset.day,raw=String(data.get("amount")||"").trim();
  const operation=raw.startsWith("-")?"remove":raw.startsWith("+")?"add":String(data.get("operation"));
  const amount=Number(raw.replace(/^[+-]/,""));
  const allowed=canEnterDay(task,day);
  const savedCount=Number(task.dailyLedger?.[day]?.count||0);
  if(!allowed||!/^[-+]?\d+$/.test(raw)||!Number.isSafeInteger(amount)||amount<1||amount>10000||
    !["add","remove"].includes(operation)||(operation==="remove"&&amount>savedCount)){
   const error=form.querySelector("#wz-edit-error");if(error){error.hidden=false;error.textContent="درست تعداد درج کریں۔ کمی صرف اسی دن کی محفوظ تعداد تک ہو سکتی ہے۔";}return;
  }
  state.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  let saved=0;
  (async()=>{
    while(saved<amount){
      const step=Math.min(1000,amount-saved);
      await recordPersonalWazifa(task.id,operation==="remove"?-step:step,day,{
        durationMs:0,intervals:0,source:"manual"});
      saved+=step;
    }
  })().then(()=>{
    state.error="";state.historyDay=null;
    const dialog=$("#wz-edit-dialog");
    if(dialog?.open&&typeof dialog.close==="function")dialog.close();
    else dialog?.removeAttribute("open");
   })
   .catch(error=>{
    const feedback=form.querySelector("#wz-edit-error");
    if(feedback){feedback.hidden=false;feedback.textContent=(saved?"جزوی محفوظ "+fmt(saved)+" ہو گئے؛ باقی "+fmt(amount-saved)+" دوبارہ درج کریں۔ ":"محفوظ نہیں ہوا: ")+String(error?.code||error?.message||error);}
   }).finally(()=>{state.busy=false;if(submit.isConnected)submit.disabled=false;});
  return;
 }
 if(event.target?.id!=="wazifa-form")return;
 event.preventDefault();event.stopImmediatePropagation();
 saveForm(event.target);
},true);
document.addEventListener("change",event=>{
 if(event.target?.id==="wz-save-date"||event.target?.id==="wz-cal-native-date"){
  if(changeWazifaDay(event.target.value)){
   const dialog=$("#wz-date-dialog");
   if(dialog?.open&&typeof dialog.close==="function")dialog.close();
   else dialog?.removeAttribute("open");
  }else event.target.value=state.draftDay||readingDay();
  return;
 }
 if(event.target?.closest("#wazifa-form")){
   const form=event.target.closest("#wazifa-form");
   if(event.target.name==="kind" && event.target.value==="group"&&!owner())return;
   syncForm();
 }
},true);
document.addEventListener("input",event=>{
 if(event.target?.closest("#wazifa-form")&&["durationDays","startDate","goal"].includes(event.target.name))syncForm();
},true);
// Do not discard Firestore taps or settings that have not finished saving.
document.addEventListener("durood:before-refresh",event=>{
 if(state.tapBusy||state.tapQueue>0||state.busy)event.preventDefault();
});
window.duroodWazaif={
 setMember,render,back,
 groupData:currentGroup,
 activeGroup:()=>state.groupExists&&currentGroup().active===true,
 groupCountsAsDurood:()=>currentGroup().countAsDurood!==false
};
