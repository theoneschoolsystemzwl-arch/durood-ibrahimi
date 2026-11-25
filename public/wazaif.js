// Authenticated Wazaif: one owner-controlled group task and private member tasks.
// No personal task is ever stored in another member's browser or Firestore path.
import {auth,db} from "./firebase-client.js";
import {createDurableTasbihSync} from "./tasbih-durable-sync.js?v=20261123-6";
import {readingDay,groupReadingDay,recordPersonalWazifa,recordGroupWazifaOnly} from "./wazaif-counter.js?v=pkt-global-20261125-v1";
import {collection,doc,onSnapshot,query,limit,serverTimestamp,setDoc,updateDoc,deleteDoc,runTransaction,getDocFromServer}
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
function continuationPeriods(task){
 return Array.isArray(task?.continuePeriods)?task.continuePeriods:[];
}
function periodOnDay(task,day=readingDay()){
 return continuationPeriods(task).find(p=>p&&day>=p.startDate&&
   (p.mode==="daily"||(p.mode==="fixed"&&day<=p.endDate)))||null;
}
function legacyContinuation(task){
 return task?.kind==="fixed" && dayOk(task.continueStartDate) &&
   task.continueStartDate>task.endDate &&
   Number.isSafeInteger(task.continueDailyGoal) && task.continueDailyGoal>0 &&
   Number.isSafeInteger(task.continueBaseTotal) && task.continueBaseTotal>=0;
}
function hasContinuation(task){
 return legacyContinuation(task)||continuationPeriods(task).length>0;
}
function continuationActive(task,today=readingDay()){
 return !!periodOnDay(task,today)||
   (legacyContinuation(task)&&today>=task.continueStartDate);
}
function lastPlanEnd(task){
 const plans=continuationPeriods(task);
 if(plans.length){
   const last=plans[plans.length-1];
   return last.mode==="daily"?"":last.endDate;
 }
 return legacyContinuation(task)?"":task?.endDate||"";
}
function fixedExpired(task,today=readingDay()){
 const end=task?.kind==="fixed"?lastPlanEnd(task):"";
 return !!(end&&dayOk(end)&&today>end);
}
function activeDailyGoal(task,today=readingDay()){
 if(task?.kind==="fixed")return targetForDay(task,today);
 return Number(task?.goal||0);
}
function continuationGoal(t,day){
 const h=t?.continueGoalHistory||{},days=Object.keys(h).filter(k=>dayOk(k)&&k<=day).sort();
 return days.length?Number(h[days[days.length-1]]):Number(t?.continueDailyGoal||0);
}
function periodDailyGoal(p,day){
 if(p.mode==="daily")return Number(p.goal||0);
 const n=spanDays(p.startDate,p.endDate),i=dayDistance(p.startDate,day);
 if(!n||i<0||i>=n)return 0;
 const goal=Number(p.goal||0);
 return Math.floor(goal/n)+(i<goal%n?1:0);
}
function targetForDay(t,day){
 if(!t||day<t.startDate)return 0;
 if(t.kind==="fixed"){
  if(day<=t.endDate){
   const n=spanDays(t.startDate,t.endDate),i=dayDistance(t.startDate,day),base=Math.floor(t.goal/n);
   return n&&i>=0?base+(i<t.goal%n?1:0):0;
  }
  const period=periodOnDay(t,day);
  if(period)return periodDailyGoal(period,day);
  return legacyContinuation(t)&&day>=t.continueStartDate?continuationGoal(t,day):0;
 }
 return t.kind==="daily"?Number(t.goal||0):0;
}
function runningGoal(t,day){
 let sum=Math.max(0,Number(t.goal||0));
 if(t?.kind!=="fixed"||!hasContinuation(t))return sum;
 for(let d=addDays(t.endDate,1),i=0;d&&d<=day&&i<3660;i++,d=addDays(d,1))
  sum+=targetForDay(t,d);
 return sum;
}
function dailyConversionHint(t){
 if(t?.kind!=="fixed")return "";
 if(continuationPeriods(t).length)
  return '<p class="wz-daily-convert-note">پرانا ہدف اور تمام سابقہ ادوار محفوظ ہیں۔ نئی مقررہ مدت صرف "اگلا ہدف" سے بنائیں۔</p>';
 if(legacyContinuation(t))return '<p class="wz-daily-convert-note">پہلے '+fmt(spanDays(t.startDate,t.endDate))+' دن اور اصل '+fmt(t.goal)+' کا ہدف محفوظ ہے۔ روزانہ وظیفہ جاری ہے۔</p>';
 return fixedExpired(t)?'<p class="wz-daily-convert-note">مقررہ مدت مکمل ہے۔ سیٹنگ میں "اگلا ہدف" منتخب کریں؛ سابقہ ریکارڈ محفوظ رہے گا۔</p>':"";
}
// Current visible dates come from the latest continuation, not the
// immutable historical first period. The same source feeds card and reader.
function visibleWazifaPeriod(task,today=readingDay()){
 const latest=continuationPeriods(task).at(-1);
 const legacy=legacyContinuation(task);
 const start=latest?.startDate||(legacy?task.continueStartDate:task.startDate);
 const end=latest?(latest.mode==="fixed"?latest.endDate:""):
   (legacy?"":task.endDate);
 const mode=latest?.mode||(legacy?"daily":task.kind);
 const days=mode==="fixed"?spanDays(start,end):Math.max(0,dayOk(start)&&today>=start?spanDays(start,today):0);
 const elapsed=mode==="fixed"?Math.min(days,Math.max(0,dayDistance(start,today)+1)):days;
 return {startDate:start,endDate:end,mode,days,elapsed,remaining:mode==="fixed"?Math.max(0,days-elapsed):0};
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
 const firstContinuation=continuationPeriods(task)[0]?.startDate||
    (legacyContinuation(task)?task.continueStartDate:"");
 const continuationDays=firstContinuation&&today>=firstContinuation?spanDays(firstContinuation,today):0;
 const extraDays=continuationDays;
 const daily=targetForDay(task,today);
 const goal=hasContinuation(task)?runningGoal(task,today):fixedGoal;
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
 const visible=visibleWazifaPeriod(task);
 const dateTile=(label,date)=>'<div class="wz-stat"><small>'+label+'</small><strong dir="ltr">'+esc(date)+'</strong></div>';
 const statTile=(label,value,id="")=>'<div class="wz-stat"><small>'+label+'</small><strong'+(id?' id="'+id+'"':'')+'>'+fmt(value)+'</strong></div>';
 const dailyTile=statTile(p.continuing?"ڈیلی ہدف":"روزانہ مطلوبہ تعداد",p.daily);
 return '<section class="wz-fixed-plan" aria-label="فکس وظیفے کی پیش رفت">'+
 '<div class="wz-plan-tiles">'+
 statTile("اصل دن",p.days)+statTile(p.continuing?"موجودہ دن":"مکمل دن",p.continuing?p.currentDay:p.elapsed)+
 (p.continuing?'<div class="wz-stat wz-stat-extra"><small>اضافی دن</small><strong>+'+fmt(p.extraDays)+'</strong></div>':statTile("باقی دن",p.remaining))+
 dateTile("آغاز کی تاریخ",visible.startDate)+dateTile("اختتامی تاریخ",visible.endDate||"جاری")+
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
 countAsDurood:true,dailyGoal:200,yearlyGoal:1000000,startDate:groupReadingDay()
});
const state={
 profile:null,group:null,groupExists:false,groupStats:null,groupMember:null,groupDays:{},groupDaysReady:false,yearStats:null,personal:[],
 mode:"list",formScope:"personal",editId:null,readerId:null,panel:null,error:"",
 inbox:[],shareFor:null,shareNotice:"",migrating:false,migrationPromise:null,
 subscriptions:[],started:false,bootstrapTried:false,busy:false,
 tapQueue:0,tapMetaQueue:[],historyDay:null,continueFor:null,continueEdit:false,historyLimit:60,draftDay:null,tapBusy:false,pendingBack:false,dialFloating:false,skipDialClick:false,clockStart:null,clockMs:0,clockIntervals:0,clockLastTap:null,tapGapMs:0,tapGapTotalMs:0,
 seenDay:readingDay(),seenGroupDay:groupReadingDay(),soundEnabled:false,soundLevel:10,motorEnabled:true,motorStrength:10,immersive:false,lastTapAt:0
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
 state.motorEnabled=localStorage.getItem("durood-tap-motor-v5-enabled")!=="0";
 state.motorStrength=normalizeMotorStrength(localStorage.getItem("durood-tap-motor-v5-strength")??10);

  state.soundLevel=Math.min(10,Math.max(0,Number(localStorage.getItem("durood-wz-sound-level")??10)));

}catch{}
let wzTapAudio=null;

let wzFullscreenHistory=false;
let wzFullscreenScroll=null;
function setWazifaImmersive(enabled,fromBack=false){
 const wasImmersive=state.immersive;
 state.immersive=!!enabled;
 if(state.immersive&&!wasImmersive){
  wzFullscreenScroll={x:window.scrollX,y:window.scrollY};
  try{
   history.pushState({...history.state,wzTasbihFullscreen:true},"");
   wzFullscreenHistory=true;
  }catch{}
 }else if(!state.immersive&&wasImmersive){
  const savedScroll=wzFullscreenScroll;wzFullscreenScroll=null;
  if(savedScroll)requestAnimationFrame(()=>window.scrollTo(savedScroll.x,savedScroll.y));
  const shouldPop=wzFullscreenHistory&&!fromBack&&history.state?.wzTasbihFullscreen;
  wzFullscreenHistory=false;
  if(shouldPop)try{history.back();}catch{}
 }
 document.body.classList.toggle("wz-immersive-reader",state.immersive);
 requestAnimationFrame(syncArabicTicker);
 const button=$("#wazaif-root [data-wazifa-action='toggle-fullscreen']");
 if(button){
  button.setAttribute("aria-pressed",String(state.immersive));
  button.textContent=state.immersive?"فل سکرین بند کریں":"فل سکرین";
 }
 let nativeMode=false;
 try{
  if(typeof window.DuroodAndroid?.setImmersive==="function"){
   window.DuroodAndroid.setImmersive(state.immersive);nativeMode=true;
  }
 }catch{}
 // Standard browsers may support native fullscreen while older Android
 // WebViews do not. Either way the in-app focus mode above remains usable.
 if(!nativeMode){
  try{
   if(state.immersive&&!document.fullscreenElement&&document.documentElement.requestFullscreen){
    const pending=document.documentElement.requestFullscreen();
    pending?.catch?.(()=>{});
   }else if(!state.immersive&&document.fullscreenElement){
    const pending=document.exitFullscreen?.();pending?.catch?.(()=>{});
   }
  }catch{}
 }
}
document.addEventListener("fullscreenchange",()=>{
 if(!document.fullscreenElement&&state.immersive&&typeof window.DuroodAndroid?.setImmersive!=="function")
  setWazifaImmersive(false);
});
function exitWazifaFullscreen(){
 if(state.immersive)setWazifaImmersive(false);
}
window.addEventListener("durood-exit-immersive",exitWazifaFullscreen);
try{
 if(window.parent!==window)window.parent.addEventListener("durood-exit-immersive",exitWazifaFullscreen);
}catch{}
window.addEventListener("popstate",()=>{
 if(state.immersive&&!history.state?.wzTasbihFullscreen)
  setWazifaImmersive(false,true);
});
document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&state.immersive&&!document.querySelector("dialog[open]")){
  event.preventDefault();exitWazifaFullscreen();
 }
});
function normalizeMotorStrength(value){
 const n=Number(value);
 return Number.isFinite(n)?Math.min(10,Math.max(0,Math.round(n))):10;
}
// A single short native waveform per accepted count; never wait for a hold.
let lastTapMotorOutcome="off",lastMotorDiagnostic="";
function requestTapMotor(allowBrowser=true){
 lastMotorDiagnostic="";
 if(!state.motorEnabled||state.motorStrength===0)return "off";
 const frames=[window];
 try{if(window.parent!==window&&window.parent.location.origin===location.origin)frames.push(window.parent);}catch{}
 for(const frame of frames){
  try{
   const api=frame.DuroodAndroid;
   if(typeof api?.pulseTasbihMotor==="function"){
    const accepted=api.pulseTasbihMotor(state.motorStrength)===true;
    try{lastMotorDiagnostic=typeof api.tapMotorDiagnostic==="function"?String(api.tapMotorDiagnostic()):"old-native";}catch{lastMotorDiagnostic="old-native";}
    return accepted?"native":"unavailable";
   }
  }catch{return "unavailable";}
 }
 lastMotorDiagnostic="browser-only";
 if(!allowBrowser)return "unavailable";
 // Ordinary browsers do not expose motor amplitude; use a short web pulse only.
 for(const frame of frames){
  try{if(frame.navigator.vibrate?.(180)===true)return "web";}catch{}
 }
 return "web-pending";
}
// Inspect the actual installed Android bridge without starting a vibration or changing the count.
function inspectTapMotorBridge(){
 if(!state.motorEnabled||state.motorStrength===0){lastMotorDiagnostic="";showTapMotorDiagnostic("off");return;}
 const frames=[window];
 try{if(window.parent!==window&&window.parent.location.origin===location.origin)frames.push(window.parent);}catch{}
 for(const frame of frames){
  try{
   const api=frame.DuroodAndroid;
   if(!api)continue;
   if(typeof api.pulseTasbihMotor!=="function"||typeof api.tapMotorDiagnostic!=="function"){
    lastMotorDiagnostic="old-native";showTapMotorDiagnostic("unavailable");return;
   }
   lastMotorDiagnostic=String(api.tapMotorDiagnostic());
   showTapMotorDiagnostic(lastMotorDiagnostic==="v6|ready"?"ready":"status");return;
  }catch{lastMotorDiagnostic="error:bridge";showTapMotorDiagnostic("unavailable");return;}
 }
 lastMotorDiagnostic="browser-only";showTapMotorDiagnostic("unavailable");
}
function showTapMotorDiagnostic(outcome){
 const note=$("#wz-motor-status");if(!note)return;
 const d=lastMotorDiagnostic;
 let message="";
 if(outcome==="off")message="وائبریشن بند";
 else if(d.includes("system-off"))message="فون کی Settings میں Touch vibration آن کریں۔";
 else if(d.includes("no-motor"))message="فون کی وائبریشن موٹر دستیاب نہیں۔";
 else if(d.includes("permission"))message="Android وائبریشن کی اجازت نہیں۔";
 else if(d.includes("untrusted")||d.includes("error"))message="Android موٹر سگنل ناکام: "+d.split("|").pop();
 else if(d==="old-native")message="پرانا Android موٹر ورژن؛ نئی APK درکار ہے۔";
 else if(d==="browser-only")message="براؤزر موڈ: Android موٹر دستیاب نہیں؛ نئی APK چیک کریں۔";
 else if(outcome==="ready")message="Android موٹر v6 منسلک ہے؛ تسبیح پر ٹچ کریں۔";
 else if((outcome==="native"||outcome==="status")&&d.includes("requested-hz:"))message="Android موٹر v6: سگنل "+d.split("requested-hz:")[1]+" Hz (درخواست)۔";
 else if((outcome==="native"||outcome==="status")&&d.includes("requested-pulse:"))message="Android موٹر v6: سگنل "+d.split("requested-pulse:")[1]+" (درخواست)۔";
 else if(outcome==="native")message="Android موٹر کو سگنل بھیجا گیا؛ حقیقی وائبریشن کی تصدیق فون پر کریں۔";
 else message="وائبریشن سگنل قبول نہیں ہوا۔";
 note.textContent=message;
}
function updateTapMotorControls(){
 const toggle=$('[data-wazifa-action="toggle-vibration"]');
 if(toggle){
  toggle.setAttribute("aria-pressed",String(state.motorEnabled));
  toggle.textContent=state.motorEnabled?"وائبریشن ON":"وائبریشن OFF";
 }
 const strength=$("#wz-motor-strength");if(strength)strength.textContent=String(state.motorStrength);
}
function saveTapMotorSettings(){
 try{
  localStorage.setItem("durood-tap-motor-v5-enabled",state.motorEnabled?"1":"0");
  localStorage.setItem("durood-tap-motor-v5-strength",String(state.motorStrength));
 }catch{}
 updateTapMotorControls();inspectTapMotorBridge();
}
function playWazifaFeedback(){
 if(!state.soundEnabled||state.soundLevel===0)return;
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
  state.yearStats=null;state.groupMember=null;state.groupDays={};state.groupDaysReady=false;state.personal=[];state.inbox=[];state.shareFor=null;state.shareNotice="";state.mode="list";state.error="";
  state.bootstrapTried=false;state.tapQueue=0;state.lastTapAt=0;state.tapMetaQueue=[];state.historyDay=null;state.continueFor=null;state.continueEdit=false;state.tapBusy=false;state.historyLimit=60;state.draftDay=null;
}
function setError(e){
  state.error=String(e?.code||e?.message||e||"رابطہ دستیاب نہیں").slice(0,180);
  const form=$("#wazifa-form")||$("#wz-continue-form");
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
  const ownGroup=doc(db,"wazaifGroupStats","main","members",uid);
  state.subscriptions.push(onSnapshot(ownGroup,safe(snap=>{
    state.groupMember=snap.exists()?snap.data():null;
    if(state.mode==="group-reader")refreshHeroReader();
  }),err));
  state.subscriptions.push(onSnapshot(collection(ownGroup,"days"),safe(snap=>{
    state.groupDays=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));
    state.groupDaysReady=!snap.metadata.fromCache;
    if(state.mode==="group-reader")refreshHeroReader();
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
// Long Arabic passages get a deliberate scroll switch. In the default
// state the *page* keeps scrolling when the reader swipes on Arabic text.
// The switch unlocks a bounded Arabic pane for lengthy verses/Surahs.
function arabicScrollControl(value){
 return String(value??"").trim().length>250?
  '<button type="button" class="wz-arabic-scroll-toggle" data-wazifa-action="toggle-arabic-scroll" aria-pressed="false">↕ عربی اسکرول کھولیں</button>' : "";
}
function arabicDisplayAttrs(value){
 return String(value??"").trim().length>250?
  ' class="wz-arabic wz-arabic-scroll" tabindex="0" aria-label="مکمل عربی عبارت پڑھنے کے لیے اوپر اسکرول کھولیں دبائیں"' :
  ' class="wz-arabic"';
}
// Each launch tab contains one clean, single-line name (no tasbih emoji).
// Avoid repeating the suffix when the Wazifa name already contains it.
function tasbihTabLabel(title){
 const name=String(title||"").trim();
 return /تسبیح\s*$/u.test(name)?name:name+" تسبیح";
}
function groupCard(){
 const g=currentGroup(),enabled=g.active===true,ready=state.groupExists;
 const stats=state.groupMember||{},today=groupReadingDay();
 const todayCount=stats.day===today?Number(stats.today||0):0;
 const all=Number(stats.total||0);
 return '<article class="wz-card wz-group '+(enabled?'is-live':'is-off')+'">'+
 '<div class="wz-tasbih-top"><button type="button" class="wz-button wz-primary wz-tasbih-cta" data-wazifa-action="read-group" '+(!enabled||!ready?'disabled':'')+' aria-label="'+esc(tasbihTabLabel(g.title))+' کھولیں"><span class="wz-cta-single" lang="ur" dir="rtl">'+esc(tasbihTabLabel(g.title))+'</span></button></div>'+
 '<header class="wz-card-head"><div><span class="wz-caption">گروپ وظیفہ</span><h2>'+esc(g.title)+'</h2></div>'+
 '<span class="wz-state '+(enabled?'on':'')+'"><i class="wz-led"></i>'+(enabled?'جاری ہے':'بند ہے')+'</span></header>'+
 '<div class="wz-inline-counts" aria-label="گروپ کی براہ راست اکاؤنٹنگ">'+
 compactCount("میرا آج پڑھا",todayCount)+compactCount("میرا مجموعی شمار",all)+'</div>'+
 arabicScrollControl(g.arabic)+'<p'+arabicDisplayAttrs(g.arabic)+' lang="ar" dir="rtl">'+esc(g.arabic)+'</p>'+
 '<p class="wz-help">'+esc(g.instructions)+'</p>'+
 '<div class="wz-actions">'+
 (owner()?'<button type="button" class="wz-button" data-wazifa-action="edit-group">مالک کی گروپ سیٹنگ</button>':'')+'</div>'+
 (!ready?'<p class="wz-help">گروپ کی سیٹنگ Firebase میں محفوظ ہونے کے بعد مشترکہ تسبیح شروع ہوگی۔</p>':'')+
 '</article>';
}
function taskStatus(task){
 const now=readingDay();
 if(task.startDate>now)return "شروع نہیں ہوا";
 const active=periodOnDay(task,now);
 if(active)return active.mode==="fixed"?"فکس جاری":"روزانہ جاری";
 if(continuationActive(task,now))return "روزانہ جاری";
 if(fixedExpired(task,now))return "مدت مکمل";
 return "جاری";
}
function personalCard(task){
 const stateText=taskStatus(task);
 return '<article class="wz-card wz-personal">'+
 '<div class="wz-tasbih-top"><button type="button" class="wz-button wz-primary wz-tasbih-cta" data-wazifa-action="read-personal" data-wazifa-id="'+esc(task.id)+'" '+(!["جاری","روزانہ جاری","فکس جاری"].includes(stateText)?'disabled':'')+' aria-label="'+esc(tasbihTabLabel(task.title))+' کھولیں"><span class="wz-cta-single" lang="ur" dir="rtl">'+esc(tasbihTabLabel(task.title))+'</span></button></div>'+
 '<header class="wz-card-head"><div><span class="wz-caption">ذاتی وظیفہ · '+esc((periodOnDay(task)?.mode==="daily"||legacyContinuation(task))?"ڈیلی":({daily:"ڈیلی",fixed:"فکس",open:"اوپن"}[task.kind]||""))+'</span><h3><bdi dir="ltr" class="wz-serial">'+esc(wazifaSerial(task))+'</bdi> · '+esc(task.title)+'</h3></div><span class="wz-state">'+stateText+'</span></header>'+
 arabicScrollControl(task.arabic)+'<p'+arabicDisplayAttrs(task.arabic)+' lang="ar" dir="rtl">'+esc(task.arabic)+'</p><p class="wz-help">'+esc(task.instructions)+'</p>'+
 (task.kind==="fixed"?fixedPlanMarkup(task):
  '<div class="wz-inline-counts" aria-label="روزانہ وظیفے کا شمار">'+
  compactCount("آج پڑھا",task.day===readingDay()?task.today:0)+
  compactCount("آج ہدف",targetForDay(task,readingDay()))+
  compactCount("مجموعی شمار",task.total||0)+'</div><p class="wz-help">آغاز '+esc(task.startDate)+'</p>')+
 '<div class="wz-actions"><button type="button" class="wz-button" data-wazifa-action="edit-personal" data-wazifa-id="'+esc(task.id)+'">سیٹنگ</button>'+
 '<button type="button" class="wz-button" data-wazifa-action="share-personal" data-wazifa-id="'+esc(task.id)+'" '+(!Number.isSafeInteger(task.wNumber)?'disabled':'')+'>دوسرے یوزر کو شیئر کریں</button>'+
 '</div>'+
 (state.shareFor===task.id?'<div class="wz-share-form" role="group"><label for="wz-share-target">صرف اپنی سائیڈ کی ممبر آئی ڈی (مثلاً M-2 یا F-2)</label>'+
 '<div class="wz-share-row"><input id="wz-share-target" placeholder="'+(state.profile?.gender==="female"?"F-2":"M-2")+'" dir="ltr" autocomplete="off" maxlength="16" aria-label="وصول کنندہ ممبر آئی ڈی">'+
 '<button type="button" class="wz-button wz-primary" data-wazifa-action="send-personal" data-wazifa-id="'+esc(task.id)+'">وظیفہ بھیجیں</button></div>'+
 '<p class="wz-help">مردوں کی شناخت M-1، M-2 اور خواتین کی F-1، F-2 ہے۔ شیئرنگ صرف اپنی سائیڈ میں ہوگی۔</p></div>':'')+
 '</article>';
}
function inboxMarkup(){
 if(!state.inbox.length)return "";
 return '<section class="wz-inbox"><h2 class="wz-subtitle">شیئرڈ وظائف · '+fmt(state.inbox.length)+'</h2>'+
 '<p class="wz-help">وظیفہ محفوظ کرنے سے آپ کے اکاؤنٹ میں اگلا W نمبر خود بن جائے گا۔ حذف کرنے سے یہ مستقل ذاتی فہرست میں شامل نہیں ہوگا۔</p>'+
 state.inbox.map(item=>'<article class="wz-card wz-received">'+
 '<header class="wz-card-head"><div><span class="wz-caption">شیئرڈ وظیفہ · بھیجنے والا <bdi dir="ltr">'+esc(item.senderSerial)+'</bdi></span>'+
 '<h3>'+esc(item.title)+'</h3></div></header>'+
 arabicScrollControl(item.arabic)+'<p'+arabicDisplayAttrs(item.arabic)+' lang="ar" dir="rtl">'+esc(item.arabic)+'</p>'+
 '<p class="wz-help">'+esc(item.instructions)+'</p>'+
 '<div class="wz-actions"><button type="button" class="wz-button wz-primary" data-wazifa-action="accept-share" data-wazifa-id="'+esc(item.id)+'">محفوظ کریں</button>'+
 '<button type="button" class="wz-button wz-delete" data-wazifa-action="reject-share" data-wazifa-id="'+esc(item.id)+'">حذف کریں</button></div></article>').join('')+'</section>';
}
function listMarkup(){
 return '<header class="wz-title"><h1>میرے وظائف</h1><button type="button" class="wz-button wz-primary" data-wazifa-action="new">+ نیا وظیفہ</button></header>'+
 '<p class="wz-help">ہر اکاؤنٹ کے وظائف W-1 سے شروع ہوتے ہیں؛ حذف شدہ نمبر کی خالی جگہ پہلے استعمال ہوگی۔</p>'+
 groupCard()+inboxMarkup()+'<h2 class="wz-subtitle">میرے ذاتی وظائف</h2>'+
 (state.shareNotice?'<p class="wz-notice" role="status">'+esc(state.shareNotice)+'</p>':'')+
 (personalList().length?personalList().map(personalCard).join(''):'<div class="wz-empty">ابھی کوئی ذاتی وظیفہ شامل نہیں۔ اوپر نیا وظیفہ دبائیں۔</div>');
}
function autoGroupGoalMarkup(){
 const goals=window.duroodAggregateGroupTargets?.();
 const labels=[["dailyGoal","روزانہ ہدف"],["weeklyGoal","ہفتہ وار ہدف"],["monthlyGoal","ماہانہ ہدف"],["yearlyGoal","سالانہ ہدف"]];
 return labels.map(([key,label])=>'<label class="wz-goal-field">'+label+'<input type="text" readonly value="'+(goals?fmt(goals[key]):"لوڈ ہو رہا ہے")+'"></label>').join("")+
 '<p class="wz-help">موجودہ سائیڈ کے تمام فعال ممبرز کے اپنی تسبیح میں محفوظ روزانہ اہداف کا مجموعہ۔ ہفتہ 7 دن، مہینہ موجودہ کیلنڈر کے دن، سالانہ ہدف منتخب مدت کے محفوظ اہداف اور باقی دنوں کے حساب سے۔</p>';
}
function formMarkup(){
 const g=state.formScope==="group";
 const original=g?currentGroup():state.personal.find(w=>w.id===state.editId)||{};
 const continued=hasContinuation(original),legacy=legacyContinuation(original),expired=original.kind==="fixed"&&fixedExpired(original);
 const kind=g?"group":legacy?"daily":original.kind||"daily";
 const kinds=[["daily","ڈیلی وظیفہ","ہر روز پڑھنا ہے"],["fixed","فکس وظیفہ","مقررہ تاریخ تک"],["open","اوپن وظیفہ","اپنی مرضی سے"]];
 if(owner())kinds.push(["group","گروپ وظیفہ","تمام ممبرز کے لیے"]);
 const title=g?"گروپ وظیفے کی سیٹنگ":state.editId?"ذاتی وظیفے میں ترمیم":"نیا وظیفہ";
 const annual=window.duroodAnnualTargetPeriod?.(original);
 return '<div class="wz-form-head"><button type="button" class="wz-button" data-wazifa-action="back">بند کریں</button><h2>'+title+'</h2></div>'+
 '<form id="wazifa-form" class="wz-form"><label>وظیفے کا نام<input name="title" required maxlength="80" placeholder="مثلاً آیت الکرسی" value="'+esc(original.title||'')+'"></label>'+
 '<label>عربی عبارت / درود<textarea name="arabic" lang="ar" dir="rtl" id="wz-arabic-input" rows="12" required aria-describedby="wz-arabic-length" placeholder="مکمل عربی عبارت یا پوری سورۃ یہاں پیسٹ کریں">'+esc(original.arabic||'')+'</textarea></label>'+
 '<p id="wz-arabic-length" class="wz-arabic-length" role="status" aria-live="polite">الفاظ: 0 / 25,000</p>'+
 '<label>طریقہ / ہدایات<textarea name="instructions" rows="3" maxlength="1200" placeholder="پڑھنے کا طریقہ">'+esc(original.instructions||'')+'</textarea></label>'+
 '<label>وظیفے کا مقصد<textarea name="purpose" rows="3" maxlength="1200" placeholder="اس وظیفے کا مقصد">'+esc(original.purpose||'')+'</textarea></label>'+
 '<p class="wz-label">وظیفے کی قسم منتخب کریں</p><div class="wz-kind">'+kinds.map(([id,name,description])=>
   '<label class="wz-kind-choice"><input type="radio" name="kind" value="'+id+'" '+(kind===id?'checked':'')+(continued&&id!==kind?' disabled':expired&&id==="open"?' disabled':'')+'><span><b>'+name+'</b><small>'+description+'</small></span></label>'
 ).join('')+'</div>'+
 '<div class="wz-form-goals"><label class="wz-goal-field" data-wz-goal="daily">روزانہ ہدف<input name="dailyGoal" type="number" min="1" max="1000000000" value="'+esc(legacy?activeDailyGoal(original):expired?Math.ceil(original.goal/spanDays(original.startDate,original.endDate)):original.dailyGoal||original.goal||200)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="total">کل ہدف<input name="goal" type="number" min="1" max="1000000000" '+(continued?'readonly ':'')+'value="'+esc(original.goal||1000)+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="week">ہفتہ وار ہدف<input name="weeklyGoal" type="number" min="1" max="1000000000" value="'+esc(original.weeklyGoal||"")+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="month">ماہانہ ہدف<input name="monthlyGoal" type="number" min="1" max="1000000000" value="'+esc(original.monthlyGoal||"")+'"></label>'+
 '<label class="wz-goal-field" data-wz-goal="year">سالانہ کل ہدف<input name="yearlyGoal" type="number" min="1" max="1000000000" value="'+esc(original.yearlyGoal||1000000)+'"></label></div>'+
 '<div class="wz-form-goals" data-wz-auto-goals hidden>'+autoGroupGoalMarkup()+'</div>'+
 '<div class="wz-dates" data-wz-annual-dates hidden><label>سیشن کی آغاز تاریخ (Start Date)<input name="annualStartDate" type="date" value="'+esc(annual?.start||groupReadingDay())+'"></label>'+
 '<label>سیشن کی اختتامی تاریخ (End Date)<input name="annualEndDate" type="date" value="'+esc(annual?.end||"")+'"></label><p class="wz-help">مدت چھ ماہ، ایک سال یا اس سے زیادہ ہو سکتی ہے۔ اختتامی تاریخ کے بعد سیشن مکمل ہوگا، نئی مدت صرف اونر مقرر کرے گا۔ مجموعی ہدف برقرار رہے گا۔</p></div>'+
 '<div class="wz-dates"><label>آغاز کی تاریخ<input name="startDate" type="date" required '+(continued?'readonly ':'')+'value="'+esc(original.startDate||(g?groupReadingDay():readingDay()))+'"></label>'+
 '<label data-wz-end>اختتامی تاریخ (خودکار)<input name="endDate" type="date" readonly value="'+esc(original.endDate||'')+'"></label></div>'+
 '<label class="wz-fixed-days" data-wz-days>کتنے دن کا وظیفہ؟<input name="durationDays" type="number" min="1" max="3650" '+(continued?'readonly ':'')+'value="'+esc(original.kind==="fixed"&&spanDays(original.startDate,original.endDate)||41)+'"></label>'+
 dailyConversionHint(original)+
 (state.editId&&!g&&expired?'<div class="wz-continue-prompt"><p>مقررہ مدت مکمل ہوگئی۔ کیا آپ اس وظیفے کو اگلے دن سے جاری رکھنا چاہتے ہیں؟ سابقہ ہدف اور ریکارڈ محفوظ رہیں گے۔</p><button type="button" class="wz-button wz-primary" data-wazifa-action="continue-personal" data-wazifa-id="'+esc(original.id)+'">اگلا ہدف مقرر کریں</button></div>':'')+
 (state.editId&&!g&&continuationPeriods(original).length?'<div class="wz-continue-prompt"><p>موجودہ مرحلے کا ہدف، آغاز یا اختتامی تاریخ درست کر سکتے ہیں۔ پہلے کا ریکارڈ محفوظ رہے گا۔</p><button type="button" class="wz-button wz-primary" data-wazifa-action="edit-continuation" data-wazifa-id="'+esc(original.id)+'">موجودہ ہدف اور تاریخ تبدیل کریں</button></div>':'')+
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
function compactTasbihClock(ms){
 const tenths=Math.max(0,Math.floor((Number(ms)||0)/100));
 const seconds=Math.floor(tenths/10),fraction=tenths%10;
 const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60,second=seconds%60;
 return (hours?hours+":"+String(minutes).padStart(2,"0")+":"+String(second).padStart(2,"0"):
  minutes?minutes+":"+String(second).padStart(2,"0"):String(second))+"."+fraction;
}

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
 const today=group?groupReadingDay():readingDay(),rows=group?[]:datedProgress(record);
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
function selectedDayFigures(group,w,record,day=readingDay()){
 const selected=group?groupReadingDay():day;
 const entry=record?.dailyLedger?.[selected]||{};
 const dated=group?null:datedProgress(record).find(item=>item.day===selected);
 const pending=wzSync.pending(group?"_group_":state.readerId,selected);
 const isToday=selected===(group?groupReadingDay():readingDay());
 const base=group?ownGroupDay(selected):
  Math.max(0,Number(dated?.count??entry.count??(record?.day===selected?record.today:0))||0);
 const source=readingSources(entry,base);
 const dailyGoal=group?memberGroupDailyGoal(w,selected):Number(dated?.goal??targetForDay(w,selected));
 const previous=Math.max(0,Number(dated?.previousDue)||0);
 const credit=Math.max(0,Number(dated?.previousCredit)||0);
 const goal=Math.max(0,dailyGoal+previous-credit);
 const read=base+pending;
 const tasbih=(group?base:source.tasbih)+(isToday?pending:0);
 const manual=(group?0:source.manual)+(isToday?0:pending);
 return {goal,tasbih,manual,read,pending:Math.max(0,goal-read)};
}
function fiveFigureMarkup(group,w,record){
 const day=group?groupReadingDay():state.draftDay||readingDay();
 const d=selectedDayFigures(group,w,record,day);
 return '<section class="wz-today-due" aria-label="منتخب تاریخ کی پڑھی گئی اور باقی گنتی">'+
  '<div class="wz-today-due-cell"><small>آج کا باقی ہدف</small><strong id="wz-five-pending" class="wz-due-number '+(d.pending?'is-pending':'is-done')+'">'+fmt(d.pending)+'</strong></div>'+
  '<div class="wz-today-due-cell"><small>کل</small><strong id="wz-five-read">'+fmt(d.read)+'</strong></div>'+
  '<div class="wz-today-due-cell"><small>دستی</small><strong id="wz-five-manual">'+fmt(d.manual)+'</strong></div>'+
  '<div class="wz-today-due-cell"><small>تسبیح</small><strong id="wz-five-tasbih">'+fmt(d.tasbih)+'</strong></div>'+
  '<div class="wz-today-due-cell"><small>ہدف</small><strong id="wz-five-goal">'+fmt(d.goal)+'</strong></div>'+
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
   !!periodOnDay(record,day)||
   (legacyContinuation(record)&&day>=record.continueStartDate));
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
   !!periodOnDay(record,day)||(legacyContinuation(record)&&day>=record.continueStartDate);
 return '<form class="wz-edit-form" id="wz-manual-form" data-day="'+esc(day)+'">'+
 '<h3 id="wz-edit-title">روزانہ گنتی میں تبدیلی</h3>'+
 '<p class="wz-edit-date"><time datetime="'+esc(day)+'">'+esc(displayRecordDate(day))+'</time></p>'+
 '<div class="wz-edit-saved"><small>موجودہ محفوظ تعداد</small><strong>'+fmt(count)+'</strong></div>'+
 (permitted?'<div class="wz-edit-fields">'+
 '<label>تعداد لکھیں (اضافے کے لیے +، کمی کے لیے −)<input type="text" inputmode="numeric" name="amount" pattern="[+-]?[0-9]+" maxlength="7" autocomplete="off" placeholder="مثلاً 100، +100 یا -20" dir="ltr" required></label></div>':
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
  const netGoal=Math.max(0,goal+previousDue-previousCredit);
  const source=readingSources(e,count),green=source.tasbih,yellow=source.manual;
  const time=Math.max(0,Number(e.durationMs||0));
  const outside=goal===0&&count===0&&remaining===0&&
    record.kind==="fixed"&&day>record.endDate&&!periodOnDay(record,day)&&
    !(legacyContinuation(record)&&day>=record.continueStartDate);
  const fulfilled=!outside&&remaining===0;
  const status=outside?'<span class="wz-day-neutral">مدت مکمل</span>':
    fulfilled?'<span class="wz-day-complete">✓ بقایا مکمل، ہدف پورا</span>':
    '<span class="wz-day-pending" role="status">● آج کا باقی ہدف پورا کریں — '+fmt(remaining)+' بقایا</span>';
  const extra=count>netGoal?'<span class="wz-day-extra">اس تاریخ میں زائد '+fmt(count-netGoal)+'</span>':"";
  const item=(label,n,klass="")=>'<div class="wz-ledger-slot"><span class="wz-ledger-label">'+label+'</span><span class="wz-ledger-item '+klass+'"><strong class="'+(n>=100000?"wz-value-xl":n>=10000?"wz-value-wide":"")+'">'+fmt(n)+'</strong></span></div>';
  return '<section class="wz-history-entry '+(fulfilled?"wz-day-ok":outside?"wz-day-idle":"wz-day-due")+
   '" dir="rtl" aria-label="'+esc(displayRecordDate(day))+' کا محفوظ ریکارڈ">'+
   '<div class="wz-clear-heading"><time datetime="'+day+'">'+esc(displayRecordDate(day))+'</time>'+
   '<span class="wz-clear-state">'+status+'</span></div>'+
   '<div class="wz-history-row wz-history-clear wz-ledger-entry '+(fulfilled?"wz-day-ok":outside?"wz-day-idle":"wz-day-due")+'"><div class="wz-ledger-lines"><div class="wz-ledger-line wz-ledger-five">'+
   item("ہدف",netGoal,"wz-ledger-goal")+
   item("تسبیح",green,"wz-ledger-green")+item("دستی",yellow,"wz-ledger-yellow")+
   item("کل",count,"wz-ledger-total")+
   '<div class="wz-ledger-slot wz-ledger-edit-slot"><span class="wz-ledger-label">تبدیلی</span>'+
   '<button type="button" class="wz-history-edit wz-ledger-edit-button" data-wazifa-action="history-day" data-wazifa-day="'+day+
   '" title="تبدیلی کھولنے کے لیے تین بار ٹیپ کریں" aria-label="'+esc(displayRecordDate(day))+' کے اعداد میں تبدیلی کے لیے تین بار دبائیں">تبدیلی</button></div>'+
   '</div></div>'+

   '<div class="wz-clear-foot"><span class="wz-clear-clock">'+heroIcon("clock")+
   '<span>تسبیح <bdi dir="ltr">'+durationText(time)+'</bdi></span>'+
   (yellow?'<span>دستی '+(pace>0?'<bdi dir="ltr">'+durationText(Math.round(yellow*pace))+'</bdi> تخمینی':'وقت نامعلوم')+'</span>':"")+
   '<span>کل <bdi dir="ltr">'+durationText(time+(pace>0?Math.round(yellow*pace):0))+'</bdi></span></span>'+
   extra+'</div></div></section>';
 }).join("");
 const more=allRows.length>state.historyLimit?'<button type="button" class="wz-button wz-history-more" data-wazifa-action="history-more">مزید پرانا ریکارڈ دکھائیں</button>':"";
 return (historicUnallocated?'<p class="wz-history-unallocated">پرانے مجموعی شمار میں سے '+fmt(historicUnallocated)+' کی الگ تاریخ محفوظ نہیں تھی؛ اس لیے انہیں کسی غلط دن کے ہدف میں شامل نہیں کیا گیا۔</p>':"")+
 (rows||'<div class="wz-history-empty">ابھی ریکارڈ نہیں۔</div>')+more+
 '<p class="wz-history-note">پچھلا بقایا اگلے دن جمع ہوگا؛ بعد میں پورا ہونے پر کارڈ سبز ہو جائے گا۔ دستی وقت تسبیح کی اوسط رفتار سے تخمینہ ہے۔</p>';
}
function memberGroupDailyGoal(w,day=groupReadingDay()){
 const goals=window.duroodMemberGroupTargets?.(day);
 return Math.max(0,Number(goals?.dailyGoal)||0);
}
function ownGroupDay(day){
 const saved=state.groupDays[day];
 if(saved)return Math.max(0,Number(saved.count)||0);
 return state.groupMember?.day===day?Math.max(0,Number(state.groupMember.today)||0):0;
}
function groupHistoryMarkup(w){
 const today=groupReadingDay();
 // Only the authenticated member's registration timestamp sets the first row.
 // Group launch dates and old counters must never backdate another member.
 const raw=state.profile?.createdAt??state.profile?.joined;
 const joined=raw?.toDate?.()??(Number.isFinite(raw?.seconds)?new Date(raw.seconds*1000):raw instanceof Date?raw:null);
 const membership=joined instanceof Date&&Number.isFinite(joined.getTime())?groupReadingDay(joined):null;
 if(!membership||membership>today)return '<p class="wz-history-note">رکنیت کی اصل تاریخ دستیاب ہونے تک روزانہ ریکارڈ نہیں دکھایا جا سکتا۔</p>';
 const start=membership;
 const rows=[];
 for(let day=today,i=0;day>=start&&i<Math.min(3660,state.historyLimit);i++,day=addDays(day,-1)){
  const goal=memberGroupDailyGoal(w,day);
  const saved=ownGroupDay(day),pending=wzSync.pending("_group_",day);
  const count=saved+pending,left=Math.max(0,goal-count);
  const cell=(label,n,klass="")=>'<div class="wz-ledger-slot"><span class="wz-ledger-label">'+label+'</span><span class="wz-ledger-item '+klass+'"><strong>'+fmt(n)+'</strong></span></div>';
  rows.push('<section class="wz-history-entry '+(left?"wz-day-due":"wz-day-ok")+'"><div class="wz-clear-heading"><time datetime="'+esc(day)+'">'+esc(displayRecordDate(day))+'</time><span class="wz-clear-state">'+(left?"بقایا "+fmt(left):"✓ ہدف مکمل")+'</span></div><div class="wz-ledger-lines"><div class="wz-ledger-line wz-ledger-five">'+cell("ہدف",goal,"wz-ledger-goal")+cell("تسبیح",count,"wz-ledger-green")+cell("محفوظ",saved)+cell("سنک باقی",pending,"wz-ledger-yellow")+cell("باقی",left,"wz-ledger-total")+'</div></div></section>');
 }
 return '<p class="wz-help">تاریخِ رکنیت: '+esc(displayRecordDate(start))+' • میری مجموعی تسبیح: '+fmt(Number(state.groupMember?.total||0)+wzSync.pending("_group_"))+(state.groupDaysReady?"":" • ریکارڈ لوڈ ہو رہا ہے")+'</p>'+rows.join("")+
 (spanDays(start,today)>state.historyLimit?'<button type="button" class="wz-button" data-wazifa-action="history-more">مزید پرانا ریکارڈ</button>':"");
}
function heroReadingState(group,w,record){
 const today=group?groupReadingDay():readingDay(),todayCount=record.day===today?Math.max(0,Number(record.today)||0):0;
 const total=Math.max(0,Number(record.total)||0);
 const plan=!group?fixedPlan(w):null;
 const continuing=!group&&continuationActive(w,today);
 const dailyGoal=group?memberGroupDailyGoal(w,today):activeDailyGoal(w,today);
 const totalGoal=continuing?plan.goal:
  group?Number(window.duroodAggregateGroupTargets?.()?.yearlyGoal||0):Number(w.goal||0);
 const left=Math.max(0,totalGoal-total);
 const percent=totalGoal?Math.min(100,total*100/totalGoal):0;
 const dayLeft=Math.max(0,dailyGoal-todayCount);
 return {todayCount,total,plan,dailyGoal,totalGoal,left,percent,dayLeft,continuing};
}
// Reader-only Arabic ticker preferences; no impact on the saved recitation count.
let wzArabicSpeed=300,wzArabicFont=24;
try{
 const speed=Number(localStorage.getItem("durood-wz-marquee-speed-v3")||300);
 const font=Number(localStorage.getItem("durood-wz-marquee-font")||24);
 if(Number.isFinite(speed))wzArabicSpeed=Math.max(10,Math.min(400,speed));
 if(Number.isFinite(font))wzArabicFont=Math.max(16,Math.min(40,font));
}catch{}
function arabicTickerMarkup(arabic){
 return '<section class="wz-arabic-ticker" aria-label="چلتی ہوئی عربی عبارت">'+
 '<div class="wz-ticker-window"><span class="wz-ticker-text" lang="ar" dir="rtl">'+esc(String(arabic||"").replace(/\s+/g," ").trim())+'</span></div>'+
 '<div class="wz-ticker-controls" dir="ltr">'+
 '<div class="wz-ticker-setting"><span>رفتار</span><button type="button" data-wazifa-action="ticker-speed-down" aria-label="رفتار کم کریں">−</button><output id="wz-ticker-speed">'+wzArabicSpeed+'</output><button type="button" data-wazifa-action="ticker-speed-up" aria-label="رفتار بڑھائیں">+</button></div>'+
 '<div class="wz-ticker-setting"><span>فونٹ</span><button type="button" data-wazifa-action="ticker-font-down" aria-label="فونٹ چھوٹا کریں">−</button><output id="wz-ticker-font">'+wzArabicFont+'</output><button type="button" data-wazifa-action="ticker-font-up" aria-label="فونٹ بڑا کریں">+</button></div></div></section>';
}
let wzTickerAnimation=null;
function fitWzFullscreenDial(){
 const card=$("#wazaif-root .wz-session-card"),dial=card?.querySelector("#wz-dial");
 if(!card||!dial)return;
 if(!state.immersive){card.style.removeProperty("--wz-fit-dial");return;}
 const cs=getComputedStyle(card);
 const num=v=>parseFloat(v)||0;
 const children=Array.from(card.children).filter(el=>el!==dial&&getComputedStyle(el).display!=="none");
 const used=children.reduce((sum,el)=>{
  const s=getComputedStyle(el);return sum+el.getBoundingClientRect().height+num(s.marginTop)+num(s.marginBottom);
 },0);
 const available=card.clientHeight-num(cs.paddingTop)-num(cs.paddingBottom)-used-num(cs.rowGap)*children.length-12;
 const width=card.clientWidth-num(cs.paddingLeft)-num(cs.paddingRight);
 card.style.setProperty("--wz-fit-dial",Math.max(0,Math.floor(Math.min(420,width*.88,available)))+"px");
}
function syncArabicTicker(){
 fitWzFullscreenDial();
 const viewport=$("#wazaif-root .wz-ticker-window"),line=viewport?.querySelector(".wz-ticker-text");
 if(!line)return;
 line.style.fontSize=wzArabicFont+"px";
 viewport.style.setProperty("--wz-arabic-size",wzArabicFont+"px");
 viewport.style.height=Math.max(50,Math.ceil(wzArabicFont*1.85+4))+"px";
 fitWzFullscreenDial();
 const speed=$("#wz-ticker-speed"),font=$("#wz-ticker-font");
 if(speed)speed.textContent=String(wzArabicSpeed);
 if(font)font.textContent=String(wzArabicFont);
 const width=line.scrollWidth,view=viewport.clientWidth;
 if(!width||!view)return;
 const duration=(width+view)/wzArabicSpeed*1000;
 const prev=wzTickerAnimation;
 const position=prev?.effect?.target===line?Number(prev.currentTime||0)/Number(prev.effect.getTiming().duration||1):0;
 prev?.cancel();
 if(typeof line.animate==="function"){
  wzTickerAnimation=line.animate([{transform:"translateX("+(-width)+"px)"},{transform:"translateX("+view+"px)"}],
   {duration,iterations:Infinity,easing:"linear"});
  wzTickerAnimation.currentTime=(position%1)*duration;
 }else{
  line.style.setProperty("--wz-ticker-distance",view+"px");
  line.style.animationDuration=duration+"ms";
  line.classList.add("wz-ticker-css");
 }
}
window.addEventListener("resize",()=>requestAnimationFrame(syncArabicTicker));
function readerMarkup(group){
 const w=group?currentGroup():state.personal.find(x=>x.id===state.readerId);
 if(!w)return '<button class="wz-button" data-wazifa-action="back">وظائف واپس</button>';
 const record=group?state.groupMember||{}:w;
 const s=heroReadingState(group,w,record);
 const visible=!group?visibleWazifaPeriod(w):null;
 const days=visible?.days||0,elapsed=visible?.elapsed||0,remaining=visible?.remaining||0;
 const showDates=!!s.plan;
 const today=group?groupReadingDay():readingDay();
 const history=group?groupHistoryMarkup(w):wazifaHistoryMarkup(record);
 const progress=s.percent;
 return '<div class="wz-hero-reader" dir="rtl">'+
 '<div class="wz-hero-ornament" aria-hidden="true"></div>'+
 '<div class="wz-hero-content">'+
 '<button class="wz-hero-back" type="button" data-wazifa-action="back">‹ '+esc("وظائف واپس")+'</button>'+
 '<h2 class="wz-hero-title"><span aria-hidden="true">❖</span>'+esc(w.title)+'<span aria-hidden="true">❖</span></h2>'+ 
 '<section class="wz-reading-text wz-reading-text-visible" aria-label="وظیفے کی مکمل تفصیل">'+
 '<h3>عربی عبارت</h3>'+arabicScrollControl(w.arabic)+'<div'+arabicDisplayAttrs(w.arabic)+' lang="ar" dir="rtl">'+esc(w.arabic)+'</div>'+
 '<p class="wz-reading-instruction"><b>پڑھنے کا طریقہ:</b> '+esc(w.instructions||"ہر مرتبہ مکمل وظیفہ پڑھ کر تسبیح کو ایک بار دبائیں۔")+'</p>'+
 '<p class="wz-reading-purpose"><b>وظیفے کا مقصد:</b> '+esc(w.purpose||"مقصد درج نہیں کیا گیا۔")+'</p></section>'+
 '<section class="wz-session-card" aria-label="تسبیح کاؤنٹر اور روزانہ کا حساب">'+
 (showDates?'<div class="wz-hero-six">'+
 heroTile("روزانہ ہدف",fmt(s.dailyGoal),"target")+
 heroTile("کل دن",visible.mode==="daily"?"روزانہ":fmt(days),"date")+
 heroTile("مکمل دن",fmt(s.continuing?s.plan.currentDay:elapsed),"check")+
 heroTile(s.continuing?"اضافی دن":"باقی دن",s.continuing?"+"+fmt(s.plan.extraDays):fmt(remaining),"date")+
 heroTile("آغاز تاریخ",visible.startDate,"date")+
 heroTile("اختتامی تاریخ",visible.endDate||"جاری","date")+
 '</div>':'<div class="wz-hero-six wz-hero-six-basic">'+
 heroTile(group?"میرا روزانہ ہدف":"روزانہ ہدف",fmt(s.dailyGoal),"target","wz-mini-goal")+heroTile(group?"میرا آج پڑھا":"آج پڑھا",fmt(group?ownGroupDay(today):s.todayCount),"book","wz-mini-today")+
 heroTile("آج باقی",fmt(group?Math.max(0,s.dailyGoal-ownGroupDay(today)):s.dayLeft),"hourglass","wz-mini-left")+'</div>')+
 '<div class="wz-hero-topstats">'+
 heroStat(group?"میرا مجموعی شمار":"کل پڑھی گئی تعداد",fmt(s.total),"book","wz-hero-total")+
 (group?"":heroStat(s.continuing?"مجموعی باقی":"باقی",fmt(s.left),"hourglass","wz-hero-left")+
 heroStat(s.continuing?"کل ہدف":"مجموعی ہدف",fmt(s.totalGoal),"target","wz-hero-goal"))+
 '</div>'+
 '<div class="wz-progress-trio" role="group" aria-label="مجموعی تکمیل، باقی اور روزانہ ہدف">'+
 (group?"":'<div class="wz-hero-progress wz-progress-line">'+
 '<progress id="wz-hero-progress-bar" max="100" value="'+progress+'" aria-label="مجموعی تکمیل"></progress>'+
 '<span class="wz-progress-copy"><b id="wz-hero-progress-label" dir="ltr">'+progress.toFixed(2)+'%</b><small>مجموعی ہدف</small></span></div>'+
 '<div class="wz-remaining-progress wz-progress-line">'+
 '<progress id="wz-remaining-progress-bar" max="100" value="'+progress+'" aria-label="مکمل شدہ مجموعی حصہ، ساتھ باقی فیصد"></progress>'+
 '<span class="wz-progress-copy"><b id="wz-remaining-progress-label" dir="ltr">'+(100-progress).toFixed(2)+'%</b><small>باقی</small></span></div>')+
 '<div class="wz-daily-progress wz-progress-line">'+
 '<progress id="wz-daily-progress-bar" max="100" value="0" aria-label="منتخب تاریخ کے روزانہ ہدف کی پیش رفت"></progress>'+
 '<span class="wz-progress-copy"><b id="wz-daily-progress-label" dir="ltr">0.00%</b>'+
 '<small id="wz-daily-progress-detail" dir="ltr">0 / '+fmt(s.dailyGoal)+'</small></span></div></div>'+
 '<div class="wz-daily-toolbar">'+
 '<div class="wz-reader-feedback" aria-label="ساؤنڈ، وائبریشن اور فل سکرین">'+
 '<div class="wz-feedback-control">'+
  '<button type="button" class="wz-feedback-button" data-wazifa-action="toggle-sound" aria-pressed="'+state.soundEnabled+'">ساؤنڈ</button>'+
  '<div class="wz-feedback-level"><button type="button" data-wazifa-action="sound-down" aria-label="ساؤنڈ کم کریں">−</button>'+
  '<output id="wz-sound-level" aria-label="ساؤنڈ کی سطح">'+state.soundLevel+'</output>'+
  '<button type="button" data-wazifa-action="sound-up" aria-label="ساؤنڈ بڑھائیں">+</button></div></div>'+
 '<div class="wz-feedback-control">'+
  '<button type="button" class="wz-feedback-button" data-wazifa-action="toggle-vibration" aria-pressed="'+state.motorEnabled+'">'+(state.motorEnabled?'وائبریشن ON':'وائبریشن OFF')+'</button>'+
  '<div class="wz-feedback-level"><button type="button" data-wazifa-action="vibration-down" aria-label="وائبریشن کم کریں">−</button>'+
  '<output id="wz-motor-strength" aria-label="وائبریشن کی طاقت">'+state.motorStrength+'</output>'+
  '<button type="button" data-wazifa-action="vibration-up" aria-label="وائبریشن بڑھائیں">+</button></div></div>'+
 '<button type="button" class="wz-reader-fullscreen" data-wazifa-action="toggle-fullscreen" aria-pressed="false">فل سکرین</button>'+
 '</div>'+
 fiveFigureMarkup(group,w,record)+
 '</div>'+
 '<div class="wz-reader-controls-row">'+
 '<div class="wz-hero-speed" aria-label="تسبیح کی رفتار">'+
 '<div><small>فی گھنٹہ</small><strong id="wz-speed-hour">—</strong></div>'+
 '<div><small>فی منٹ</small><strong id="wz-speed-min">—</strong></div>'+
 '<div><small>SEC</small><strong id="wz-speed-sec">—</strong></div>'+
 '</div>'+
 (group?'<span class="wz-current-date">'+esc(displayRecordDate(today))+'</span>':
 '<div class="wz-date-select"><input id="wz-save-date" type="hidden" value="'+esc(state.draftDay||today)+'">'+
 '<button type="button" class="wz-day-step" data-wazifa-action="day-prev" aria-label="پچھلا دن">−</button>'+
 '<button type="button" class="wz-date-button" data-wazifa-action="open-date-picker" aria-label="تسبیح کی تاریخ منتخب کریں">'+
 '<span id="wz-selected-date">'+esc(displayRecordDate(state.draftDay||today))+'</span></button>'+
 '<button type="button" class="wz-day-step" data-wazifa-action="day-next" aria-label="اگلا دن">+</button></div>')+
 '<button type="button" class="wz-button wz-primary wz-reader-save" data-wazifa-action="save-taps" '+(state.tapQueue?'':'disabled')+'>'+
 'محفوظ کریں <b id="wz-unsaved">'+fmt(state.tapQueue)+'</b></button>'+
 '</div>'+

 '<p id="wz-motor-status" role="status" aria-live="polite" style="margin:2px 0;padding:4px 6px;text-align:center;line-height:1.4;font-size:12px;color:inherit;border:1px solid #35b995;border-radius:6px"></p>'+ 
 arabicTickerMarkup(w.arabic)+
 '<button type="button" id="wz-dial" class="wz-dial wz-hero-dial'+(state.dialFloating?' is-floating':'')+'" style="--wz-ring:'+(state.tapQueue>0?(state.tapQueue%100||100):0)+'%" data-wazifa-action="tap">'+
 '<svg class="wz-dial-ring-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+
 '<circle class="wz-dial-ring-track" cx="50" cy="50" r="46" pathLength="100"/>'+
 '<circle class="wz-dial-ring-fill" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="100" stroke-dashoffset="'+(100-(state.tapQueue>0?(state.tapQueue%100||100):0))+'"/></svg>'+
 '<strong id="wz-dial-number">'+fmt(state.tapQueue)+'</strong>'+
 '<span class="wz-dial-clock"><span>سیشن کا وقت <bdi id="wz-clock" dir="ltr">0.0</bdi></span></span>'+
 '<span class="wz-dial-plus" aria-hidden="true">+</span><span class="wz-dial-invite">پڑھیں یا تسبیح کریں</span>'+
 '</button></section>'+
  (group?'<button type="button" class="wz-button" data-group-daily-goal>روزانہ ہدف مقرر کریں</button>':"")+
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
 const record=group?(state.groupMember||{}):w;
 if(!w||!record)return;
 const s=heroReadingState(group,w,record);
 const taskId=group?"_group_":state.readerId;
 const todayCount=s.todayCount+wzSync.pending(taskId,group?groupReadingDay():readingDay()),total=s.total+wzSync.pending(taskId);
 const dayLeft=Math.max(0,s.dailyGoal-todayCount);
  const left=Math.max(0,s.totalGoal-total);
  const percent=s.totalGoal?Math.min(100,total*100/s.totalGoal):0;
 const set=(id,value)=>{const el=root.querySelector("#"+id);if(el)el.textContent=value;};
 set("wz-dial-number",fmt(state.tapQueue));set("wz-unsaved",fmt(state.tapQueue));
 const save=root.querySelector('[data-wazifa-action="save-taps"]');
 if(save)save.disabled=state.tapBusy||state.tapQueue===0;
 set("wz-hero-total",fmt(total));set("wz-hero-left",fmt(left));
 set("wz-hero-progress-label",percent.toFixed(2)+"%");
 set("wz-hero-today",fmt(todayCount));set("wz-hero-day-left",fmt(dayLeft));
  if(s.continuing)set("wz-hero-days-left",fmt(left));
 const ownToday=group?ownGroupDay(groupReadingDay())+wzSync.pending("_group_",groupReadingDay()):todayCount;
 set("wz-mini-goal",fmt(s.dailyGoal));set("wz-mini-today",fmt(ownToday));set("wz-mini-left",fmt(group?Math.max(0,s.dailyGoal-ownToday):dayLeft));
 const d=selectedDayFigures(group,w,record,group?groupReadingDay():state.draftDay||readingDay());
 set("wz-today-read",fmt(d.read));
 for(const [id,value] of [["wz-five-goal",d.goal],["wz-five-tasbih",d.tasbih],
  ["wz-five-manual",d.manual],["wz-five-read",d.read],["wz-five-pending",d.pending]])set(id,fmt(value));
 const pendingCell=root.querySelector("#wz-five-pending");
 if(pendingCell){pendingCell.classList.toggle("is-pending",d.pending>0);
  pendingCell.classList.toggle("is-done",d.pending===0);}
 const t=readingTimes(record,true);
 set("wz-time-real",durationText(t.tasbih));
 set("wz-time-est",t.hasSpeed?durationText(t.manual):"—");
 set("wz-time-all",durationText(t.total));
 updateWzSyncStatus();
 const bar=root.querySelector("#wz-hero-progress-bar");if(bar)bar.value=percent;
 const remainingPercent=Math.max(0,100-percent);
 const remainingBar=root.querySelector("#wz-remaining-progress-bar");
 if(remainingBar)remainingBar.value=percent;
 set("wz-remaining-progress-label",remainingPercent.toFixed(2)+"%");
 // Daily percentage uses the selected day's original daily target, not the
 // carried-over outstanding balance displayed separately in the five cards.
 const selectedDay=group?groupReadingDay():state.draftDay||readingDay();
 const dailyTarget=Math.max(0,Number(group?memberGroupDailyGoal(w,selectedDay):targetForDay(w,selectedDay))||0);
 const dailyPercent=dailyTarget>0?Math.min(100,d.read*100/dailyTarget):0;
 set("wz-daily-progress-label",dailyPercent.toFixed(2)+"%");
 set("wz-daily-progress-detail",fmt(d.read)+" / "+fmt(dailyTarget));
 const dayBar=root.querySelector("#wz-daily-progress-bar");if(dayBar)dayBar.value=dailyPercent;
 const dial=root.querySelector("#wz-dial");
 const ringCycle=state.tapQueue>0?(state.tapQueue%100||100):0;
 dial.style.setProperty("--wz-ring",ringCycle+"%");
 const ringCircle=dial.querySelector?.(".wz-dial-ring-fill");
 if(ringCircle)ringCircle.setAttribute("stroke-dashoffset",String(100-ringCycle));
 if(group){const history=root.querySelector("#wz-record-history");if(history){const markup=groupHistoryMarkup(w);if(history.dataset.groupMarkup!==markup){history.innerHTML=markup;history.dataset.groupMarkup=markup;}}}
 if(!group){
   const history=root.querySelector("#wz-record-history");
   if(history){
     // The Edit button may keep keyboard focus after the dialog closes.
     // Never let that focus suppress a confirmed new Firestore daily count.
     // Rebuild only when the server record, day or list limit changes.
     const ts=record.updatedAt;
     const stamp=[ts?.seconds??"",ts?.nanoseconds??"",
       record.total??0,record.day??"",state.historyLimit,readingDay()].join(":");
     if(history.dataset.wzRenderStamp!==stamp){
       history.innerHTML=wazifaHistoryMarkup(record);
       history.dataset.wzRenderStamp=stamp;
     }
   }
 }
}

function continuationFormMarkup(){
 const task=state.personal.find(item=>item.id===state.continueFor);
 const edit=state.continueEdit;
 const plans=continuationPeriods(task),last=plans.at(-1);
 if(!task||(edit?!last:!fixedExpired(task)))return '<p class="wz-error">اگلا مرحلہ دستیاب نہیں۔</p>';
 const previousEnd=lastPlanEnd(task),next=edit?last.startDate:addDays(previousEnd,1);
 const mode=edit?last.mode:"daily";
 const duration=edit&&last.mode==="fixed"?last.durationDays:
   last?.mode==="fixed"?last.durationDays:
   Math.max(1,Number(task.durationDays)||spanDays(task.startDate,task.endDate)||41);
 const dailyGoal=edit&&last.mode==="daily"?last.goal:activeDailyGoal(task,previousEnd)||200;
 const fixedGoal=edit&&last.mode==="fixed"?last.goal:task.goal||1000;
 return '<div class="wz-form-head"><button type="button" class="wz-button" data-wazifa-action="back">واپس</button><h2>'+(edit?'موجودہ ہدف میں ترمیم':'اگلا وظیفہ اور نیا ہدف')+'</h2></div>'+
 '<form id="wz-continue-form" class="wz-form" data-edit-period="'+(edit?'1':'0')+'" data-period-signature="'+esc(edit?JSON.stringify(last):'')+'" data-previous-end="'+esc(previousEnd)+'">'+
 '<p class="wz-help">'+esc(task.title)+' · '+esc(wazifaSerial(task))+'</p>'+
 '<p class="wz-help">'+(edit?'اس مرحلے کا ہدف دوبارہ لکھیں۔ پڑھی ہوئی گنتی، پہلے مراحل اور تاریخیں محفوظ رہیں گی؛ اسی مرحلے کا بقایا نئے ہدف کے مطابق دوبارہ حساب ہوگا۔':
   'پچھلی مدت '+esc(previousEnd)+' کو مکمل ہوگئی۔ کیا آپ اسے جاری رکھنا چاہتے ہیں؟ پرانی گنتی اور تمام تاریخیں محفوظ رہیں گی۔')+'</p>'+
 '<label>اس مرحلے کے آغاز کی تاریخ<input name="nextStart" type="date" value="'+esc(next)+'" '+(edit?'':'readonly')+'></label>'+
 '<p class="wz-label">'+(edit?'موجودہ وظیفے کی قسم':'اگلے وظیفے کی قسم')+'</p><div class="wz-kind">'+
 '<label class="wz-kind-choice"><input type="radio" name="nextMode" value="daily" '+(mode==="daily"?'checked':'')+(edit&&mode!=="daily"?' disabled':'')+'><span><b>ڈیلی وظیفہ</b><small>روزانہ بغیر آخری تاریخ کے</small></span></label>'+
 '<label class="wz-kind-choice"><input type="radio" name="nextMode" value="fixed" '+(mode==="fixed"?'checked':'')+(edit&&mode!=="fixed"?' disabled':'')+'><span><b>فکس وظیفہ</b><small>دوبارہ 41 دن یا اپنی مدت</small></span></label></div>'+
 '<div data-wz-next-daily><label>روزانہ ہدف<input name="nextDailyGoal" type="number" min="1" max="1000000000" value="'+esc(dailyGoal)+'"></label></div>'+
 '<div data-wz-next-fixed hidden><label>فکس وظیفے کا مجموعی ہدف<input name="nextFixedGoal" type="number" min="1" max="1000000000" value="'+esc(fixedGoal)+'"></label>'+
 '<label>کتنے دن کا وظیفہ؟<input name="nextDuration" type="number" min="1" max="3650" value="'+esc(duration)+'"></label>'+
 '<label>اختتامی تاریخ<input name="nextEnd" type="date" value="'+esc(edit&&last.mode==="fixed"?last.endDate:addDays(next,duration-1))+'" '+(edit?'':'readonly')+'></label></div>'+
 (edit?'<p class="wz-help">تاریخ یا مدت بدلنے پر محفوظ گنتی کو خارج کرنا جائز نہیں؛ پرانے مراحل اور وظیفے کی قسم برقرار رہیں گے۔</p>':'')+
 '<div class="wz-date-preview" id="wz-next-preview" role="status"></div>'+
 '<div class="wz-actions"><button type="submit" class="wz-button wz-primary">'+(edit?'تبدیلی محفوظ کریں':'نیا ہدف محفوظ کریں')+'</button>'+
 '<button type="button" class="wz-button" data-wazifa-action="back">منسوخ</button></div></form>';
}
function syncContinuationForm(changed=""){
 const form=$("#wz-continue-form");if(!form)return;
 const mode=form.elements.nextMode.value, fixed=mode==="fixed";
 form.querySelector("[data-wz-next-daily]").hidden=fixed;
 form.querySelector("[data-wz-next-fixed]").hidden=!fixed;
 form.elements.nextDailyGoal.required=!fixed;
 form.elements.nextFixedGoal.required=fixed;
 form.elements.nextDuration.required=fixed;
 form.elements.nextEnd.required=fixed;
 const preview=form.querySelector("#wz-next-preview"),start=form.elements.nextStart.value;
 if(fixed){
   const endField=form.elements.nextEnd,daysField=form.elements.nextDuration;
   if(changed==="nextEnd"&&form.dataset.editPeriod==="1"&&
      spanDays(start,endField.value)>0)daysField.value=String(spanDays(start,endField.value));
   else if(dayOk(start)&&Number.isSafeInteger(Number(daysField.value))&&
      Number(daysField.value)>=1&&Number(daysField.value)<=3650)
     endField.value=addDays(start,Number(daysField.value)-1);
   const duration=Number(daysField.value),goal=Number(form.elements.nextFixedGoal.value);
   const good=dayOk(start)&&dayOk(endField.value)&&
     spanDays(start,endField.value)===duration&&duration>=1&&duration<=3650;
   preview.textContent=good?"اختتام: "+endField.value+" · روزانہ مطلوبہ تعداد: "+
     fmt(Math.ceil(goal/duration)):"آغاز، اختتام، کل دن اور مجموعی ہدف درست درج کریں۔";
 }else preview.textContent="آغاز: "+start+" · روزانہ ہدف: "+fmt(Number(form.elements.nextDailyGoal.value));
}

function render(){
 const root=$("#wazaif-root");
 if(!root||!state.profile)return;
 if(!["personal-reader","group-reader"].includes(state.mode)&&state.immersive)setWazifaImmersive(false);
 if(!state.started)subscribe();
 if(state.mode==="form"){
   if(root.querySelector("#wazifa-form"))return;
   root.innerHTML=formMarkup();syncForm();return;
 }
 if(state.mode==="continuation-form"){
   if(root.querySelector("#wz-continue-form"))return;
   root.innerHTML=continuationFormMarkup();syncContinuationForm();return;
 }
 if(state.mode==="personal-reader"||state.mode==="group-reader"){
   if(root.querySelector("#wz-dial")){refreshHeroReader();return;}
   root.innerHTML=readerMarkup(state.mode==="group-reader");
   inspectTapMotorBridge();
   if(state.immersive)setWazifaImmersive(true);
   requestAnimationFrame(syncArabicTicker);
   document.fonts?.ready?.then(syncArabicTicker);
   refreshHeroReader();return;
 }
 root.innerHTML=listMarkup()+(state.error?'<p class="wz-error">'+esc(state.error)+'</p>':'');
}
function syncArabicCounter(form){
 if(!form)return;
 const textarea=form.elements.arabic,notice=form.querySelector("#wz-arabic-length");
 if(!textarea||!notice)return;
 const count=arabicWordCount(textarea.value),maximum=25000,error=arabicLengthError(textarea.value);
 notice.textContent="عربی الفاظ: "+count.toLocaleString("en")+" / "+maximum.toLocaleString("en")+(error?" — "+error:"");
 notice.classList.toggle("is-over-limit",Boolean(error));
 textarea.setCustomValidity(error);
}
function arabicWordCount(value){
 const text=value.trim();
 return text?text.split(/\s+/u).length:0;
}
function arabicLengthError(value){
 if(arabicWordCount(value)>25000)return "عربی عبارت 25,000 الفاظ سے زیادہ نہیں ہو سکتی۔";
 if(new TextEncoder().encode(value.trim()).length>600000)return "عربی عبارت کا ڈیٹا 600,000 بائٹس سے زیادہ ہے۔";
 return "";
}
function syncForm(){
 const form=$("#wazifa-form");if(!form)return;
 syncArabicCounter(form);
 const kind=form.elements.kind.value;
 form.querySelectorAll('[data-wz-goal]').forEach(el=>{
   const type=el.dataset.wzGoal;
   el.hidden=kind==="group"||!(kind==="daily"?type==="daily":type==="total");
   el.querySelector("input").required=!el.hidden;
 });
 form.querySelector("[data-wz-auto-goals]").hidden=kind!=="group";
 const annualFields=form.querySelector("[data-wz-annual-dates]");
 annualFields.hidden=kind!=="group";
 for(const input of annualFields.querySelectorAll("input")){input.required=kind==="group";input.disabled=kind!=="group";}
 if(kind==="group")form.elements.annualEndDate.min=form.elements.annualStartDate.value;
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
function openContinuationForm(id,edit=false){
 const task=state.personal.find(item=>item.id===id);
 if(!task||(edit?!continuationPeriods(task).length:!fixedExpired(task)))return;
 state.continueFor=id;state.continueEdit=edit;state.mode="continuation-form";state.error="";
 const root=$("#wazaif-root");if(root)root.innerHTML="";
 render();
}
function openForm(scope,id=null){
 if(scope==="group"&&!owner())return;
 state.formScope=scope;state.editId=id;
 state.mode="form";state.error="";
 const root=$("#wazaif-root");if(root)root.innerHTML="";
 render();
}
function back(){
 if(state.immersive)setWazifaImmersive(false);
 persistDraft();wzSync.schedule(0);
 if(state.tapBusy){state.pendingBack=true;return;}
 state.pendingBack=false;state.mode="list";state.panel=null;state.readerId=null;state.historyDay=null;state.tapQueue=0;state.lastTapAt=0;state.tapMetaQueue=[];state.clockLastTap=null;state.dialFloating=false;state.skipDialClick=false;state.draftDay=null;
 const root=$("#wazaif-root");if(root)root.innerHTML="";
 state.continueFor=null;state.continueEdit=false;
 render();
}
async function saveForm(form){
 if(state.busy)return;
 const data=new FormData(form);
 const kind=String(data.get("kind")||"");
 if(!["daily","fixed","open","group"].includes(kind))return;
 if(kind==="group"&&!owner())return;
 const title=String(data.get("title")||"").trim(),arabic=String(data.get("arabic")||"").trim();
 const arabicError=arabicLengthError(arabic);
 if(arabicError){setError(arabicError);return;}
 const startDate=String(data.get("startDate")||"");
 const durationDays=Number(data.get("durationDays"));
 const endDate=kind==="fixed"&&Number.isSafeInteger(durationDays)&&durationDays>=1&&durationDays<=3650?
   addDays(startDate,durationDays-1):"";
 const goal=Number(data.get("goal")),dailyGoal=Number(data.get("dailyGoal")),yearlyGoal=Number(data.get("yearlyGoal")),weeklyGoal=Number(data.get("weeklyGoal")),monthlyGoal=Number(data.get("monthlyGoal"));
 if(!title||!arabic||!dayOk(startDate)||(kind==="fixed"&&(!dayOk(endDate)||endDate<startDate))){
   setError("عنوان، عبارت اور تاریخ درست درج کریں۔");return;
 }
 const valid=n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000000;
 if((kind==="daily"&&!valid(dailyGoal))||(kind==="fixed"||kind==="open")&&!valid(goal)){
   setError("ہدف 1 سے ایک ارب کے درمیان مکمل عدد درج کریں۔");return;
 }
 const common={title,arabic,instructions:String(data.get("instructions")||"").trim(),
  purpose:String(data.get("purpose")||"").trim(),startDate};
 state.busy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{
   if(kind==="group"){
     const prior=currentGroup(),legacy=n=>valid(n)?n:1;
     let annualStartDate=String(data.get("annualStartDate")||""),annualEndDate=String(data.get("annualEndDate")||"");
     const realDate=d=>dayOk(d)&&new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;
     if(!realDate(annualStartDate)||!realDate(annualEndDate)||annualEndDate<annualStartDate)throw Error("سیشن کی درست آغاز اور اختتامی تاریخ مقرر کریں۔");
     const current=window.duroodAnnualTargetPeriod?.(prior);
     if(current?.start===annualStartDate&&current?.end===annualEndDate&&prior.annualStartDate&&prior.annualEndDate){annualStartDate=prior.annualStartDate;annualEndDate=prior.annualEndDate;}
     const value={...common,annualStartDate,annualEndDate,kind:"group",dailyGoal:legacy(prior.dailyGoal),weeklyGoal:legacy(prior.weeklyGoal),monthlyGoal:legacy(prior.monthlyGoal),yearlyGoal:legacy(prior.yearlyGoal),
       active:data.has("active"),countAsDurood:data.has("countAsDurood"),updatedAt:serverTimestamp()};
     const ref=doc(db,"wazaifSettings","group");
     if(state.groupExists)await updateDoc(ref,value);
     else await setDoc(ref,{...value,createdAt:serverTimestamp()});
   }else{
     const config={...common,kind,goal:kind==="daily"?dailyGoal:goal,
       endDate,durationDays:kind==="fixed"?durationDays:0,updatedAt:serverTimestamp()};
     const uid=auth.currentUser.uid;
     const existing=state.editId?state.personal.find(item=>item.id===state.editId):null;
     if(existing&&existing.kind==="fixed"&&kind==="daily"&&(legacyContinuation(existing)||fixedExpired(existing))){
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
async function saveContinuationForm(form){
 if(state.busy)return;
 const mode=String(new FormData(form).get("nextMode")||"");
 const daily=Number(form.elements.nextDailyGoal.value);
 const fixedGoal=Number(form.elements.nextFixedGoal.value);
 const duration=Number(form.elements.nextDuration.value);
 const startDay=form.elements.nextStart.value;
 const endDay=mode==="fixed"?form.elements.nextEnd.value:"";
 const valid=n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000000;
 if(!["fixed","daily"].includes(mode)||
    (mode==="daily"&&!valid(daily))||
    (mode==="fixed"&&(!valid(fixedGoal)||!Number.isSafeInteger(duration)||duration<1||duration>3650||
      !dayOk(endDay)||spanDays(startDay,endDay)!==duration))||!dayOk(startDay)){
   setError("نیا ہدف اور مدت درست درج کریں۔");return;
 }
 const uid=auth.currentUser?.uid,id=state.continueFor;
 if(!uid||!id){setError("دوبارہ لاگ اِن کریں۔");return;}
 state.busy=true;const button=form.querySelector('[type="submit"]');
 if(button)button.disabled=true;
 try{
   await runTransaction(db,async tx=>{
     const ref=doc(db,"memberWazaif",uid,"items",id);
     const snap=await tx.get(ref);
     if(!snap.exists())throw Error("وظیفہ موجود نہیں۔");
     const current=snap.data(),previousEnd=lastPlanEnd(current);
     const edit=form.dataset.editPeriod==="1",old=continuationPeriods(current);
     if(current.kind!=="fixed"||legacyContinuation(current))
       throw Error("یہ مرحلہ تبدیل نہیں کیا جا سکتا۔");
     if(edit){
       const latest=old.at(-1);
       if(!latest||JSON.stringify(latest)!==form.dataset.periodSignature||
          latest.mode!==mode)
         throw Error("مرحلے میں دوسری جگہ تبدیلی ہوئی ہے۔ سیٹنگ دوبارہ کھولیں۔");
       const lastFixedEnd=old.length>1?old[old.length-2].endDate:current.endDate;
       if(!dayOk(lastFixedEnd)||startDay<=lastFixedEnd)
         throw Error("نئی تاریخ پچھلے مرحلے کی اختتامی تاریخ کے بعد ہونی چاہیے۔");
       const newPeriod={...latest,startDate:startDay,
         endDate:mode==="fixed"?endDay:"",
         durationDays:mode==="fixed"?duration:0,
         goal:mode==="fixed"?fixedGoal:daily};
       // A corrected date must never push an already saved recitation outside
       // its period. This checks all dated rows in the transaction snapshot.
       const ledger=current.dailyLedger||{};
       for(const [date,entry] of Object.entries(ledger)){
         if(Number(entry?.count||0)<=0||date<latest.startDate||
             (latest.mode==="fixed"&&date>latest.endDate))continue;
         if(date<newPeriod.startDate||
            (newPeriod.mode==="fixed"&&date>newPeriod.endDate))
           throw Error("اس تاریخ کی پڑھی ہوئی گنتی محفوظ ہے ("+date+")؛ اسے نئی مدت سے باہر نہیں کر سکتے۔");
       }
       if(JSON.stringify(newPeriod)!==JSON.stringify(latest))
         tx.update(ref,{continuePeriods:[...old.slice(0,-1),newPeriod],updatedAt:serverTimestamp()});
     }else{
       if(!fixedExpired(current)||previousEnd!==form.dataset.previousEnd)
         throw Error("اس وظیفے کا مرحلہ دوسری جگہ تبدیل ہو گیا۔ دوبارہ کھولیں۔");
       if(old.length>=50)throw Error("اس وظیفے میں مزید مرحلے شامل نہیں ہو سکتے۔");
       const start=addDays(previousEnd,1);
       const period={mode,startDate:start,
         endDate:mode==="fixed"?addDays(start,duration-1):"",
         durationDays:mode==="fixed"?duration:0,
         goal:mode==="fixed"?fixedGoal:daily};
       tx.update(ref,{continuePeriods:[...old,period],updatedAt:serverTimestamp()});
     }
   });
   state.continueFor=null;state.continueEdit=false;state.error="";
   state.shareNotice=form.dataset.editPeriod==="1"?"موجودہ ہدف اور تاریخ درست ہوگئے؛ پرانی گنتی محفوظ ہے۔":"اگلے مرحلے کا ہدف محفوظ ہوگیا؛ پچھلا ریکارڈ محفوظ ہے۔";
   state.mode="list";
   const root=$("#wazaif-root");if(root)root.innerHTML="";
   render();
 }catch(error){setError("محفوظ نہیں ہو سکا: "+(error.code||error.message));}
 finally{state.busy=false;if(button?.isConnected)button.disabled=false;}
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
 if(state.mode==="group-reader"&&window.duroodEnsureMemberDailyGoal?.()===false)return;
 if(state.mode==="personal-reader"){
  const task=state.personal.find(item=>item.id===state.readerId);
  if(!task||state.draftDay<task.startDate||
    task.kind==="fixed"&&state.draftDay>task.endDate&&
    !periodOnDay(task,state.draftDay)&&
    !(legacyContinuation(task)&&state.draftDay>=task.continueStartDate)){
   setError("منتخب تاریخ وظیفے کی مدت میں نہیں ہے۔");return;
  }
 }
 const pressedAt=performance.now();
 // Only suppress events closer than 50 ms; no minimum touch/hold duration.
 if(state.clockLastTap!==null&&pressedAt-state.clockLastTap<50)return false;
 if(state.clockStart===null)state.clockStart=pressedAt;
 if(state.clockLastTap!==null){
   const gap=pressedAt-state.clockLastTap;
   if(gap>0){state.tapGapMs=gap;state.tapGapTotalMs+=gap;state.clockIntervals++;}
 }
 const today=state.mode==="group-reader"?groupReadingDay():readingDay();
 const day=state.mode==="group-reader"?today:state.draftDay||today,isToday=day===today;
 const durationMs=isToday&&state.clockLastTap!==null?
  Math.min(86400000,Math.max(0,Math.round(pressedAt-state.clockLastTap))):0;
 if(!wzSync.enqueue({taskId:state.mode==="group-reader"?"_group_":state.readerId,
   day,source:isToday?"tasbih":"manual",count:1,
   durationMs,intervals:isToday?1:0})){
  setError("فون کی اسٹوریج میں محفوظ نہیں ہو سکا؛ گنتی نہیں بڑھائی گئی۔");return;
 }
 state.clockLastTap=pressedAt;
 state.tapQueue++;state.lastTapAt=Date.now();
 // Trigger the motor on the confirmed tap, before rendering or sound.
 // Even a very brief touch is sufficient; there is no minimum press duration.
 lastTapMotorOutcome="off";
 try{lastTapMotorOutcome=requestTapMotor();showTapMotorDiagnostic(lastTapMotorOutcome);}catch{}
 try{playWazifaFeedback();}catch{}
 try{const k=draftStorageKey();if(k)localStorage.setItem(k+"-v3-imported","1");}catch{}
 persistDraft();
 const el=$("#wz-dial-number");if(el)el.textContent=fmt(state.tapQueue);
 const dial=$("#wz-dial");
 if(dial){
  const cycle=state.tapQueue%100||100;
  dial.style.setProperty("--wz-ring",cycle+"%");
  const ringCircle=dial.querySelector?.(".wz-dial-ring-fill");
  if(ringCircle)ringCircle.setAttribute("stroke-dashoffset",String(100-cycle));
 }
 const unsaved=$("#wz-unsaved");if(unsaved)unsaved.textContent=fmt(state.tapQueue);
 const save=$('[data-wazifa-action="save-taps"]');if(save)save.disabled=false;
 tick();
 return true;
}
async function drain(){
 // Every tap was queued already. Save resets only the visible session.
 resetWzSession(false);
 await wzSync.flush();
}
function tick(){
 if(!["personal-reader","group-reader"].includes(state.mode)||document.hidden)return;
 const value=elapsedTime();
 const clock=$("#wz-clock");
 if(clock)clock.textContent=compactTasbihClock(value);
 // Calculate live pace as elapsed session time divided by completed taps.
 // The first tap starts the session, so both time and projection update continuously.
 const seconds=state.tapQueue>0?value/(1000*state.tapQueue):0;
 const pace=n=>Number.isFinite(n)&&n>0?n.toLocaleString("en",{minimumFractionDigits:1,maximumFractionDigits:1}):"—";
 const perZikr=seconds>0?pace(seconds):"—";
 const perMinute=seconds>0?pace(60/seconds):"—";
 const perHour=seconds>0?(3600/seconds).toLocaleString("en",{maximumFractionDigits:0}):"—";
 for(const [id,text] of [["#wz-speed-sec",perZikr],["#wz-speed-min",perMinute],["#wz-speed-hour",perHour]]){
  const node=$(id);if(node)node.textContent=text;
 }
 checkWzIdle();
 if(state.seenGroupDay!==groupReadingDay()){
  state.seenGroupDay=groupReadingDay();
  if(state.mode==="group-reader"){resetWzSession(true);state.draftDay=groupReadingDay();refreshHeroReader();}
 }
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
let activeFeedbackPress=null,handledFeedbackClick=null,pendingMotorClick=false;
const dialMoveTolerance=10;
function feedbackPressAction(target){
 const button=target?.closest?.('#wz-dial[data-wazifa-action="tap"]');
 return button&&!button.disabled?button:null;
}
function cancelDialGesture(){
 clearTimeout(longHoldTimer);
 if(activeFeedbackPress)activeFeedbackPress.cancelled=true;
}
document.addEventListener("pointerdown",event=>{
 const button=feedbackPressAction(event.target);
 if(!button||event.button>0||event.isPrimary===false)return;
 clearTimeout(longHoldTimer);
 state.skipDialClick=false;
 handledFeedbackClick="tap";pendingMotorClick=false;
 const press={id:event.pointerId,button,x:event.clientX,y:event.clientY,cancelled:false};
 activeFeedbackPress=press;
 // Do not count until a genuine tap is completed; scrolling starts with pointerdown too.
 longHoldTimer=setTimeout(()=>{
  if(activeFeedbackPress!==press||press.cancelled||!button.isConnected)return;
  press.cancelled=true;
  state.dialFloating=!state.dialFloating;
  button.classList.toggle("is-floating",state.dialFloating);
 },5000);
},true);
document.addEventListener("pointermove",event=>{
 const press=activeFeedbackPress;
 if(!press||press.id!==event.pointerId)return;
 if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>dialMoveTolerance)cancelDialGesture();
},true);
document.addEventListener("pointerup",event=>{
 const press=activeFeedbackPress;
 if(!press||press.id!==event.pointerId)return;
 clearTimeout(longHoldTimer);activeFeedbackPress=null;
 if(press.cancelled||!press.button.isConnected||
    Math.hypot(event.clientX-press.x,event.clientY-press.y)>dialMoveTolerance)return;
 const hit=document.elementFromPoint(event.clientX,event.clientY);
 if(!hit||!press.button.contains(hit))return;
 // A confirmed stationary touch counts exactly once and vibrates immediately on release.
 const counted=tap();pendingMotorClick=counted===true&&lastTapMotorOutcome==="web-pending";
},true);
document.addEventListener("pointercancel",event=>{
 if(activeFeedbackPress?.id===event.pointerId){cancelDialGesture();activeFeedbackPress=null;}
},true);
document.addEventListener("scroll",cancelDialGesture,{capture:true,passive:true});
document.addEventListener("contextmenu",event=>{
 if(feedbackPressAction(event.target)){cancelDialGesture();event.preventDefault();}
},true);
function consumeFeedbackClick(event,action){
 if(handledFeedbackClick===action&&(event.detail!==0||["touch","pen","mouse"].includes(event.pointerType))){
  handledFeedbackClick=null;
  if(pendingMotorClick){pendingMotorClick=false;try{showTapMotorDiagnostic(requestTapMotor());}catch{}}
  return true;
 }
 handledFeedbackClick=null;pendingMotorClick=false;return false;
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
// Dated records open only on the third tap of their own edit button.
function advanceHistoryEditTap(tracker,day,now){
 if(tracker.day!==day||now-tracker.last>2200||now<tracker.last){
  tracker.day=day;tracker.count=0;
 }
 tracker.count+=1;tracker.last=now;
 if(tracker.count<3)return false;
 tracker.day="";tracker.count=0;tracker.last=0;return true;
}
// A manual edit is one durable operation, even if Firestore acknowledges
// the transaction after the phone refreshes or loses its connection.
const manualOperations=new Map();
function manualOperationKey(taskId,day){
 const uid=auth.currentUser?.uid;
 if(!uid)throw Error("لاگ اِن ضروری ہے۔");
 return "durood-wz-manual-operation-v1-"+uid+"-"+taskId+"-"+day;
}
function readManualOperation(key){
 if(manualOperations.has(key))return manualOperations.get(key);
 try{
   const raw=localStorage.getItem(key);
   if(!raw)return null;
   const value=JSON.parse(raw);
   if(!/^[a-f0-9]{32}$/.test(value.token)||!Number.isSafeInteger(value.amount)||
      value.amount===0||!Number.isSafeInteger(value.saved)||value.saved<0||
      value.saved>Math.abs(value.amount))return null;
   manualOperations.set(key,value);return value;
 }catch{return null;}
}
function storeManualOperation(key,value){
 // Refuse a new save if the durable retry token cannot be stored.
 localStorage.setItem(key,JSON.stringify(value));
 manualOperations.set(key,value);
}
function removeManualOperation(key){
 localStorage.removeItem(key);manualOperations.delete(key);
}
function newManualToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
function manualReceipt(token,step){
 return token.slice(0,24)+step.toString(16).padStart(8,"0");
}
// Reconcile completed receipts against the authoritative record, never
// permanently lock a date because its local count is stale.
async function refreshManualEditForm(task,day,form){
 const uid=auth.currentUser?.uid,modal=$("#wz-edit-dialog");
 if(!uid||!modal||!form||form.dataset.loading==="1")return;
 const submit=form.querySelector('[type="submit"]'),feedback=form.querySelector("#wz-edit-error");
 if(submit)submit.disabled=true;
 form.dataset.ready="0";form.dataset.loading="1";
 if(feedback){feedback.hidden=false;feedback.textContent="تازہ ریکارڈ حاصل کیا جا رہا ہے…";}
 try{
  const fresh=await getDocFromServer(doc(db,"memberWazaif",uid,"items",task.id));
  if(auth.currentUser?.uid!==uid||state.readerId!==task.id||
     state.historyDay!==day||!modal.open||modal.querySelector("form")!==form)return;
  if(!fresh.exists())throw Error("وظیفہ موجود نہیں ہے۔");
  const latest={id:fresh.id,...fresh.data()};
  state.personal=state.personal.map(item=>item.id===task.id?latest:item);
  const key=manualOperationKey(task.id,day),prior=readManualOperation(key);
  if(prior?.status==="complete")removeManualOperation(key);
  modal.innerHTML=historyEditMarkup(latest,day);
  const next=modal.querySelector("form");
  next.dataset.ready="1";
  if(prior?.status==="pending"){
   const input=next.querySelector('[name="amount"]');
   if(input)input.value=String(prior.amount);
   const note=next.querySelector("#wz-edit-error");
   if(note){note.hidden=false;note.textContent="پچھلی نامکمل تبدیلی محفوظ کرنے کے لیے دوبارہ محفوظ کریں دبائیں۔";}
  }
  refreshHeroReader();
 }catch(error){
  if(!form.isConnected)return;
  if(feedback){feedback.hidden=false;feedback.textContent="تازہ ریکارڈ نہیں ملا۔ انٹرنیٹ چیک کرکے دوبارہ کوشش کریں۔";}
  if(submit){submit.disabled=false;submit.textContent="ریکارڈ تازہ کریں";submit.formNoValidate=true;}
 }finally{form.dataset.loading="0";}
}
const historyEditTap={day:"",count:0,last:0};
document.addEventListener("click",event=>{
 const button=event.target.closest("[data-wazifa-action]");
 if(!button)return;
 const action=button.dataset.wazifaAction,id=button.dataset.wazifaId;
 event.preventDefault();event.stopImmediatePropagation();
 if(action==="toggle-arabic-scroll"){
  const passage=button.nextElementSibling;
  if(!passage?.classList.contains("wz-arabic-scroll"))return;
  const enabled=passage.classList.toggle("is-scroll-enabled");
  button.setAttribute("aria-pressed",String(enabled));
  button.textContent=enabled?"اسکرول بند کریں":"↕ عربی اسکرول کھولیں";
  passage.setAttribute("aria-label",enabled?
   "عربی عبارت: اوپر نیچے سوائپ کرکے مکمل پڑھیں":
   "عربی اسکرول کھولنے کے لیے اوپر والا بٹن دبائیں");
  return;
 }
 if(["ticker-speed-up","ticker-speed-down","ticker-font-up","ticker-font-down"].includes(action)){
  const delta=action.endsWith("-up")?1:-1;
  if(action.startsWith("ticker-speed"))wzArabicSpeed=Math.max(10,Math.min(400,wzArabicSpeed+5*delta));
  else wzArabicFont=Math.max(16,Math.min(40,wzArabicFont+2*delta));
  try{localStorage.setItem("durood-wz-marquee-speed-v3",String(wzArabicSpeed));localStorage.setItem("durood-wz-marquee-font",String(wzArabicFont));}catch{}
  syncArabicTicker();return;
 }
 if(["sound-up","sound-down"].includes(action)){
  const key="soundLevel";
  state[key]=Math.min(10,Math.max(0,state[key]+(action.endsWith("-up")?1:-1)));
  try{localStorage.setItem("durood-wz-sound-level",String(state[key]));}catch{}
  const output=$("#wz-sound-level");if(output)output.textContent=String(state[key]);
  if(state.soundEnabled)playWazifaFeedback();
  return;
 }
 if(action==="vibration-up"||action==="vibration-down"){
  state.motorStrength=normalizeMotorStrength(state.motorStrength+(action==="vibration-up"?1:-1));
  saveTapMotorSettings();
  return;
 }
 if(action==="toggle-vibration"){
  state.motorEnabled=!state.motorEnabled;
  if(state.motorEnabled&&state.motorStrength===0)state.motorStrength=10;
  saveTapMotorSettings();
  return;
 }
 if(action==="toggle-sound"){
  state.soundEnabled=!state.soundEnabled;
  try{localStorage.setItem("durood-wz-sound",state.soundEnabled?"1":"0");}catch{}
  button.setAttribute("aria-pressed",String(state.soundEnabled));
  button.textContent="ساؤنڈ";
  return;
 }
 if(action==="toggle-fullscreen"){
  // Works in the existing Android WebView even when native fullscreen is unsupported.
  setWazifaImmersive(!state.immersive);
  return;
 }
 if(action==="day-prev"||action==="day-next"){
  if(state.mode!=="personal-reader")return;
  const selected=state.draftDay||readingDay();
  const target=addDays(selected,action==="day-next"?1:-1);
  if(dayOk(target))changeWazifaDay(target);
  return;
 }
 if(action==="new")return openForm("personal");
 if(action==="share-personal"&&id){
   state.shareFor=state.shareFor===id?null:id;state.shareNotice="";render();return;
 }
 if(action==="send-personal"&&id){
   const input=$("#wz-share-target"),target=input?.value?.trim();
   if(!validMemberSerial(target)){setError("درست ممبر نمبر لکھیں، مثلاً M-2 یا F-2");return;}
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
 if(action==="continue-personal")return openContinuationForm(id);
 if(action==="edit-continuation")return openContinuationForm(id,true);
 if(action==="back")return back();
 if(action==="read-group"){
   if(!state.groupExists||currentGroup().active!==true)return;
   state.error="";state.readerId=null;state.tapQueue=0;startClock();
   if(currentGroup().countAsDurood!==false){
     window.duroodClassicBridge?.openGroupReader?.();
     return;
   }
   state.mode="group-reader";state.historyDay=null;state.historyLimit=60;state.tapMetaQueue=[];state.draftDay=groupReadingDay();
   const root=$("#wazaif-root");if(root)root.innerHTML="";render();root?.scrollIntoView({block:"start",behavior:"auto"});window.duroodEnsureMemberDailyGoal?.();return;
 }
 if(action==="read-personal"){
   const selected=state.personal.find(item=>item.id===id);
   if(!selected||!["جاری","روزانہ جاری","فکس جاری"].includes(taskStatus(selected)))return;
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
  if(state.mode==="group-reader"&&target)target.innerHTML=groupHistoryMarkup(currentGroup());
   else if(task&&target)target.innerHTML=wazifaHistoryMarkup(task);
  return;
 }
 if(action==="history-day"&&button.matches(".wz-ledger-edit-button")&&button.dataset.wazifaDay){
   const record=state.personal.find(x=>x.id===state.readerId),day=button.dataset.wazifaDay;
   const modal=$("#wz-edit-dialog");
   if(!modal||!record||!dayOk(day)||day<record.startDate||day>readingDay())return;
   if(!advanceHistoryEditTap(historyEditTap,day,Date.now())){
    button.textContent="تبدیلی "+historyEditTap.count+"/3";
    return;
   }
   state.historyDay=day;
   modal.innerHTML=historyEditMarkup(record,day);
    void Promise.resolve().then(()=>refreshManualEditForm(record,day,modal.querySelector("form")));
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
 if(action==="tap"){if(!consumeFeedbackClick(event,action))return tap();return;}
 if(action==="delete-personal"&&id){
   if(!window.confirm("یہ ذاتی وظیفہ حذف کریں؟ اس کا ذاتی ریکارڈ بھی ختم ہوگا۔"))return;
   deleteDoc(doc(db,"memberWazaif",auth.currentUser.uid,"items",id)).then(back).catch(setError);return;
 }
},true);
document.addEventListener("submit",event=>{
 if(event.target?.id==="wz-continue-form"){
  event.preventDefault();event.stopImmediatePropagation();
  void saveContinuationForm(event.target);return;
 }
 if(event.target?.id==="wz-manual-form"){
  event.preventDefault();event.stopImmediatePropagation();
  const form=event.target,task=state.personal.find(w=>w.id===state.readerId);
  if(!task||state.busy||state.tapBusy)return;
  const data=new FormData(form),day=form.dataset.day,raw=String(data.get("amount")||"").trim();
  if(form.dataset.ready!=="1"){void refreshManualEditForm(task,day,form);return;}
  const operation=raw.startsWith("-")?"remove":"add";
  const amount=Number(raw.replace(/^[+-]/,""));
  const allowed=canEnterDay(task,day);
  const savedCount=Number(task.dailyLedger?.[day]?.count||0);
  const priorKey=auth.currentUser?.uid?manualOperationKey(task.id,day):null;
  const priorOp=priorKey?readManualOperation(priorKey):null;
  const removalCapacity=priorOp?.status==="pending"&&priorOp.amount===-amount?Math.max(savedCount,Number(priorOp.baseCount)||0,amount):savedCount;
  if(!allowed||!/^[-+]?\d+$/.test(raw)||!Number.isSafeInteger(amount)||amount<1||amount>10000||
    !["add","remove"].includes(operation)||(operation==="remove"&&amount>removalCapacity)){
   const error=form.querySelector("#wz-edit-error");if(error){error.hidden=false;error.textContent="درست تعداد درج کریں۔ کمی صرف اسی دن کی محفوظ تعداد تک ہو سکتی ہے۔";}return;
  }
  const feedback=form.querySelector("#wz-edit-error");
  const signedAmount=operation==="remove"?-amount:amount;
  let key,op;
  try{
    key=manualOperationKey(task.id,day);
    op=readManualOperation(key);
    if(op?.status==="complete"){
      // Do not replay a completed operation from an already-open stale form.
      void refreshManualEditForm(task,day,form);return;
    }
    if(op&&op.amount!==signedAmount)
      throw Error("پچھلی درخواست نامکمل ہے: "+(op.amount>0?"+":"")+op.amount+
        "۔ پہلے وہی تعداد دوبارہ محفوظ کریں۔");
    if(!op){
      op={token:newManualToken(),amount:signedAmount,saved:0,
        baseCount:savedCount,status:"pending",createdAt:Date.now()};
      storeManualOperation(key,op);
    }
  }catch(error){
    if(feedback){feedback.hidden=false;feedback.textContent=error.message;}
    return;
  }
  state.busy=true;const submit=form.querySelector('[type="submit"]');
  if(submit)submit.disabled=true;
  (async()=>{
    while(op.saved<amount){
      const step=Math.min(1000,amount-op.saved);
      const index=Math.floor(op.saved/1000);
      // The same receipt ID is replayed on retries, never counted twice.
      await recordPersonalWazifa(task.id,operation==="remove"?-step:step,day,{
        durationMs:0,intervals:0,source:"manual",
        syncId:manualReceipt(op.token,index)
      });
      op.saved+=step;
      storeManualOperation(key,op);
    }
    op.status="complete";
    storeManualOperation(key,op);
    // The write already succeeded. Read the authoritative ledger back from
    // Firebase so a delayed collection snapshot cannot leave the UI at zero.
    // A transient read error must not turn a successful Save into a retry.
    try{
      const fresh=await getDocFromServer(doc(db,"memberWazaif",auth.currentUser.uid,"items",task.id));
      if(fresh.exists()){
        const latest={id:fresh.id,...fresh.data()};
        state.personal=state.personal.map(item=>item.id===task.id?latest:item);
      }
    }catch(readError){
      // onSnapshot still provides eventual refresh; the durable receipt
      // keeps a repeat press from adding the same recitations twice.
      console.warn("Saved manual Wazifa, server refresh pending:",readError?.code||readError?.message);
    }
  })().then(()=>{
    state.error="";state.historyDay=null;
    const dialog=$("#wz-edit-dialog");
    if(dialog?.open&&typeof dialog.close==="function")dialog.close();
    else dialog?.removeAttribute("open");
    state.shareNotice="دستی گنتی "+fmt(amount)+" محفوظ ہوگئی۔";
    refreshHeroReader();
   })
   .catch(error=>{
    if(feedback){
      feedback.hidden=false;
      feedback.textContent=(op.saved?"محفوظ "+fmt(op.saved)+"؛ باقی "+fmt(amount-op.saved)+
        " ہیں۔ اسی تعداد سے دوبارہ کوشش کریں۔ ":"محفوظ نہیں ہوا: ")+
        String(error?.code||error?.message||error);
    }
   }).finally(()=>{state.busy=false;if(submit?.isConnected)submit.disabled=false;});
  return;
 }
 if(event.target?.id!=="wazifa-form")return;
 event.preventDefault();event.stopImmediatePropagation();
 saveForm(event.target);
},true);
document.addEventListener("change",event=>{
 if(event.target?.closest("#wz-continue-form")){syncContinuationForm(event.target.name);return;}
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
 if(event.target?.closest("#wz-continue-form")&&
    ["nextStart","nextEnd","nextDuration","nextFixedGoal","nextDailyGoal"].includes(event.target.name)){
   syncContinuationForm(event.target.name);return;
 }
 if(event.target?.closest("#wazifa-form")&&event.target.name==="arabic"){
   syncArabicCounter(event.target.closest("#wazifa-form"));return;
 }
 if(event.target?.closest("#wazifa-form")&&["durationDays","startDate","goal"].includes(event.target.name))syncForm();
},true);
// Do not discard Firestore taps or settings that have not finished saving.
document.addEventListener("durood:before-refresh",event=>{
 if(state.tapBusy||state.tapQueue>0||state.busy)event.preventDefault();
});
window.duroodWazaif={
 setMember,render,back,
 groupData:currentGroup,
 refreshGroupTargets:()=>{if(state.mode==="group-reader")refreshHeroReader();const el=$("#wazifa-form [data-wz-auto-goals]");if(el){const html=autoGroupGoalMarkup();if(el.innerHTML!==html)el.innerHTML=html;}},
 activeGroup:()=>state.groupExists&&currentGroup().active===true,
 groupCountsAsDurood:()=>currentGroup().countAsDurood!==false
};
