// Signed-in Wazaif display. The original Durood reader remains the shared
// group reader; private readings have their own Firestore counters.
import {db} from "./firebase-client.js";
import {doc,collection,query,limit,onSnapshot}
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {GROUP_REF,DEFAULT_GROUP,localWazifaDate,saveGroupWazifa,
  savePersonalWazifa,recordPersonalWazifa,personalWazifaRef}
  from "./wazaif-data.js";

const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const fmt=x=>new Intl.NumberFormat("en").format(Math.max(0,Number(x)||0));
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function daysBetween(start,end){
  if(!datePattern.test(start)||!datePattern.test(end)||end<start)return 0;
  return Math.floor((Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000)+1;
}
const language=()=>document.documentElement.lang==="en";
const t=(en,ur)=>language()?en:ur;
export function initializeWazaifUI({ui,auth,bridge}){
  const state={
    uid:null,owner:false,group:{...DEFAULT_GROUP},hasGroup:false,groupCount:null,
    groupToday:null,personal:[],view:"list",editId:null,selected:null,editingGroup:false,
    editingMode:"daily",busy:false,notice:"",unsub:[],pending:new Map(),
    session:{id:null,lastTap:null,elapsed:0,intervals:0}
  };
  function stopListeners(){state.unsub.forEach(stop=>{try{stop();}catch{}});state.unsub=[];}
  function paint(){if(state.uid&&auth.currentUser?.uid===state.uid)bridge.refreshWazaif();}
  function note(message){state.notice=message;paint();}
  function startDayWatch(){
    const day=localWazifaDate();
    const dayDoc=doc(db,"wazaifGroupDays",day);
    state.unsub.push(onSnapshot(dayDoc,snap=>{
      state.groupToday=snap.exists()?Number(snap.data().total||0):0;paint();
    },error=>{state.groupToday=null;console.warn("Group daily stats:",error?.code);paint();}));
  }
  function connect(profile){
    if(!profile?.uid)return;
    if(state.uid===profile.uid)return;
    stopListeners();
    state.uid=profile.uid;
    state.owner=profile.role==="owner";
    state.group={...DEFAULT_GROUP};state.hasGroup=false;
    state.groupCount=null;state.groupToday=null;state.personal=[];
    state.view="list";state.selected=null;state.pending.clear();
    state.unsub.push(onSnapshot(GROUP_REF,snap=>{
      state.group=snap.exists()?{...DEFAULT_GROUP,...snap.data()}:{...DEFAULT_GROUP};
      state.hasGroup=snap.exists();paint();
    },e=>{console.warn("Group wazifa unavailable:",e?.code);paint();}));
    state.unsub.push(onSnapshot(doc(db,"publicStats","global"),snap=>{
      state.groupCount=snap.exists()?Number(snap.data().totalRecitations||0):0;
      paint();
    },e=>{state.groupCount=null;console.warn("Shared total:",e?.code);paint();}));
    startDayWatch();
    state.unsub.push(onSnapshot(query(collection(db,"memberWazaif",profile.uid,"items"),limit(40)),snap=>{
      state.personal=snap.docs.map(x=>({id:x.id,...x.data()}))
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      paint();
    },e=>{console.warn("Private wazaif:",e?.code);note(t("Your private wazifa list could not load.","ذاتی وظائف لوڈ نہیں ہوئے۔"));}));
  }
  function disconnect(){
    stopListeners();state.uid=null;state.personal=[];state.view="list";
    state.pending.clear();state.groupToday=null;state.groupCount=null;
  }
  function syncDay(){
    if(state.day===localWazifaDate())return;
    state.day=localWazifaDate();
    if(state.uid){
      // Old snapshot no longer counts as today's tally.
      // Listener refreshes whenever user revisits after midnight.
      const prior=state.unsub.pop();
      if(prior)prior();
      state.groupToday=null;
      startDayWatch();
    }
  }
  const status=()=>state.notice?'<p class="wz-notice" role="status">'+esc(state.notice)+'</p>':"";
  const fact=(name,value)=>'<div class="wz-stat"><small>'+name+'</small><strong>'+value+'</strong></div>';
  const count=(x)=>x===null?"—":fmt(x);
  function groupCard(){
    const g=state.group,enabled=Boolean(g.active),overall=state.groupCount;
    const year=g.yearlyGoal?'<div class="wz-progress"><div class="wz-mini-track"><span style="width:'+Math.min(100,Math.floor(100*(overall||0)/g.yearlyGoal))+'%"></span></div><small>'+t("Annual goal","سالانہ ہدف")+": "+fmt(g.yearlyGoal)+'</small></div>':"";
    return '<section class="wz-group-card '+(enabled?"wz-on":"wz-off")+'">'+
      '<div class="wz-card-head"><div><span class="wz-tag">'+t("GROUP WAZIFA","گروپ وظیفہ")+'</span>'+
      '<h2>'+esc(g.title)+'</h2></div><span class="wz-state">'+(enabled?t("● ACTIVE","● جاری ہے"):t("○ PAUSED","○ بند ہے"))+'</span></div>'+
      '<p lang="ar" dir="rtl" class="wz-arabic">'+esc(g.arabic)+'</p>'+
      (g.instructions?'<p class="wz-description">'+esc(g.instructions)+'</p>':"")+
      '<div class="wz-figures">'+
      fact(t("Today / shared","آج کا مشترکہ شمار"),count(state.groupToday))+
      fact(t("Total Durood","مجموعی درود"),count(overall))+
      fact(t("Daily goal","روزانہ ہدف"),fmt(g.dailyGoal||0))+
      fact(t("Annual goal","سالانہ ہدف"),fmt(g.yearlyGoal||0))+'</div>'+year+
      '<div class="wz-actions">'+
      (enabled?'<button type="button" class="wz-primary" data-action="wz-open-group">'+t("Read Tasbih","تسبیح کریں")+'</button>':"")+
      (state.owner?'<button type="button" data-action="wz-group-settings">'+t("Owner settings","گروپ سیٹنگ")+'</button>'+
        '<button type="button" data-action="wz-toggle-group">'+(enabled?t("Deactivate","بند کریں"):t("Activate","فعال کریں"))+'</button>':"")+
      '</div></section>';
  }
  function personalCard(w){
    const day=w.lastDay===localWazifaDate()?Number(w.dayRead||0):0;
    const target=w.mode==="daily"?Number(w.dailyGoal||0):Number(w.totalGoal||0);
    const measured=w.mode==="daily"?day:Number(w.totalRead||0);
    const percent=target?Math.min(100,Math.round(measured/target*100)):0;
    const label={daily:t("Daily","ڈیلی"),fixed:t("Fixed","فکس"),open:t("Open","اوپن")}[w.mode]||"";
    return '<article class="wz-personal-card"><div class="wz-card-head"><div><span class="wz-tag">'+label+'</span><h3>'+esc(w.title)+'</h3></div>'+
      '<span>'+((w.active)?t("Active","جاری"):t("Paused","بند"))+'</span></div>'+
      '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(w.arabic)+'</p>'+
      '<div class="wz-figures">'+fact(t("Today","آج پڑھا"),fmt(day))+
      fact(t("All time","کل پڑھا"),fmt(w.totalRead))+
      fact(t("Goal","ہدف"),fmt(target))+
      fact(t("Remaining","باقی"),target?fmt(Math.max(0,target-measured)):"—")+'</div>'+
      '<div class="wz-progress"><div class="wz-mini-track"><span style="width:'+percent+'%"></span></div></div>'+
      '<div class="wz-actions">'+
      (w.active?'<button type="button" class="wz-primary" data-action="wz-read-personal" data-id="'+esc(w.id)+'">'+t("Read Tasbih","تسبیح کریں")+'</button>':"")+
      '<button type="button" data-action="wz-edit-personal" data-id="'+esc(w.id)+'">'+t("Edit","ترمیم")+'</button></div></article>';
  }
  function listMarkup(){
    syncDay();
    if(state.view==="personal-reader" && state.selected)return readerMarkup();
    if(state.view==="edit")return editorMarkup();
    return '<section class="wz-page"><header class="wz-title"><h1>'+t("Wazaif","وظائف")+'</h1>'+
      '<p>'+t("Active group wazifa first, then your private wazaif.","سب سے پہلے مشترکہ گروپ وظیفہ، پھر آپ کے ذاتی وظائف۔")+'</p></header>'+
      status()+groupCard()+
      '<div class="wz-subheading"><h2>'+t("My personal wazaif","میرے ذاتی وظائف")+'</h2>'+
      '<button type="button" class="wz-primary" data-action="wz-new">'+t("+ New wazifa","+ نیا وظیفہ")+'</button></div>'+
      (state.personal.length?state.personal.map(personalCard).join(""):
        '<p class="wz-empty">'+t("No personal wazifa added yet.","ابھی کوئی ذاتی وظیفہ شامل نہیں کیا۔")+'</p>')+
      '</section>';
  }
  function editorMarkup(){
    const editing=state.editingGroup;
    const w=editing?state.group:(state.personal.find(x=>x.id===state.editId)||{mode:state.editingMode,active:true,title:"",arabic:"",instructions:"",purpose:"",dailyGoal:100,totalGoal:0,startDate:localWazifaDate(),endDate:""});
    const mode=editing?"group":(w.mode||"daily");
    const field=(label,name,value,element="input",extra="")=>
      '<label class="wz-field"><span>'+label+'</span>'+
      (element==="textarea"?'<textarea name="'+name+'" rows="3" maxlength="'+(name==="arabic"?4000:1800)+'" '+extra+'>'+esc(value)+'</textarea>':
      '<input name="'+name+'" value="'+esc(value)+'" '+extra+'>')+'</label>';
    const selectOptions=[["daily",t("Daily wazifa","ڈیلی وظیفہ")],["fixed",t("Fixed wazifa","فکس وظیفہ")],["open",t("Open wazifa","اوپن وظیفہ")]];
    if(state.owner)selectOptions.push(["group",t("Group wazifa (Owner)","گروپ وظیفہ (Owner)")]);
    const select='<label class="wz-field"><span>'+t("Wazifa type","وظیفے کی قسم منتخب کریں")+'</span><select name="mode" id="wz-mode">'+
      selectOptions.map(([key,label])=>'<option value="'+key+'"'+(mode===key?" selected":"")+'>'+label+'</option>').join("")+'</select></label>';
    const regular=field(t("Wazifa name","وظیفے کا نام"),"title",w.title,"input",'maxlength="80" required')+
      field(t("Arabic passage / Durood","عربی عبارت / درود"),"arabic",w.arabic,"textarea",'dir="rtl" required')+
      field(t("Instructions / method","طریقہ / ہدایات"),"instructions",w.instructions,"textarea")+
      field(t("Purpose","وظیفے کا مقصد"),"purpose",w.purpose,"textarea");
    const date=field(t("Start date","آغاز کی تاریخ"),"startDate",w.startDate||localWazifaDate(),"input",'type="date"');
    const daily=field(t("Daily target","روزانہ ہدف"),"dailyGoal",w.dailyGoal||0,"input",'type="number" min="0" max="1000000000" step="1"');
    const overall=field(t("Total target","کل ہدف"),"totalGoal",w.totalGoal||0,"input",'type="number" min="0" max="1000000000" step="1"');
    const until=field(t("End date","اختتامی تاریخ"),"endDate",w.endDate||"","input",'type="date"');
    const annual=field(t("Yearly group goal","گروپ کا سالانہ ہدف"),"yearlyGoal",w.yearlyGoal||0,"input",'type="number" min="0" max="1000000000" step="1"');
    return '<section class="wz-page wz-editor"><div class="wz-subheading"><h1>'+
      (editing?t("Group wazifa settings","گروپ وظیفے کی سیٹنگ"):t("Personal wazifa","ذاتی وظیفہ"))+
      '</h1><button type="button" data-action="wz-back">'+t("Close","بند کریں")+'</button></div>'+status()+
      '<form id="wz-editor-form" class="wz-form">'+select+regular+
      (editing?date+daily+annual:
        '<div data-wz-only="daily"'+(mode!=="daily"?" hidden":"")+'>'+date+daily+'</div>'+
        '<div data-wz-only="fixed"'+(mode!=="fixed"?" hidden":"")+'>'+field(t("Start date","آغاز کی تاریخ"),"fixedStart",w.startDate||localWazifaDate(),"input",'type="date"')+
         until+field(t("Total target","کل ہدف"),"fixedTotal",w.totalGoal||0,"input",'type="number" min="0" max="1000000000" step="1"')+
         '<p id="wz-estimate"></p></div>'+
        '<div data-wz-only="open"'+(mode!=="open"?" hidden":"")+'>'+field(t("Start date","آغاز کی تاریخ"),"openStart",w.startDate||localWazifaDate(),"input",'type="date"')+overall+'</div>')+
      '<label class="wz-check"><input name="active" type="checkbox"'+(w.active?" checked":"")+'><span>'+t("Active","فعال")+'</span></label>'+
      '<div class="wz-actions"><button type="submit" class="wz-primary"'+(state.busy?" disabled":"")+'>'+t("Save wazifa","محفوظ کریں")+'</button>'+
      '<button type="button" data-action="wz-back">'+t("Cancel","منسوخ")+'</button></div></form></section>';
  }
  function readerMarkup(){
    const w=state.personal.find(x=>x.id===state.selected);
    if(!w){state.view="list";return listMarkup();}
    const d=localWazifaDate(),pending=state.pending.get(w.id)||0;
    const today=(w.lastDay===d?Number(w.dayRead||0):0)+pending;
    const total=Number(w.totalRead||0)+pending;
    const goal=w.mode==="daily"?Number(w.dailyGoal||0):Number(w.totalGoal||0);
    const current=w.mode==="daily"?today:total;
    const completed=goal?Math.min(100,100*current/goal):0;
    return '<section class="wz-page wz-reader"><div class="wz-subheading"><h1>'+esc(w.title)+'</h1>'+
      '<button type="button" data-action="wz-back">'+t("Back to wazaif","وظائف میں واپس")+'</button></div>'+status()+
      '<div class="wz-figures">'+fact(t("Today","آج پڑھا"),fmt(today))+
      fact(t("Total","مجموعی"),fmt(total))+
      fact(t("Target","ہدف"),fmt(goal))+
      fact(t("Remaining","باقی"),goal?fmt(Math.max(0,goal-current)):"—")+'</div>'+
      '<p class="wz-arabic" lang="ar" dir="rtl">'+esc(w.arabic)+'</p>'+
      '<p class="wz-description">'+esc(w.instructions||"")+'</p>'+
      '<button type="button" class="wz-count-dial" data-action="wz-tap-personal" style="--wz-deg:'+Math.floor(completed*3.6)+'deg"'+(!w.active?" disabled":"")+'>'+
      '<small>'+t("Tap once after reading","ہر مرتبہ پڑھ کر دبائیں")+'</small>'+
      '<strong>'+fmt(today)+'</strong><span id="wz-personal-clock">00:00:00.000</span></button>'+
      '<div class="wz-figures">'+fact(t("Seconds per reading","سیکنڈ فی ورد"),'<span id="wz-seconds">—</span>')+
      fact(t("Per minute","فی منٹ"),'<span id="wz-per-minute">—</span>')+
      fact(t("Per hour","فی گھنٹہ"),'<span id="wz-per-hour">—</span>')+'</div></section>';
  }
  function resetToList(){state.view="list";state.selected=null;state.notice="";}
  function openGroupSettings(){
    if(!state.owner){note("صرف Owner گروپ وظیفے کی سیٹنگ تبدیل کر سکتا ہے۔");return;}
    state.editingGroup=true;state.editId=null;state.view="edit";state.notice="";paint();
  }
  function openPersonal(id){
    const w=state.personal.find(x=>x.id===id);
    if(!w||!w.active)return;
    state.selected=id;state.view="personal-reader";
    state.session={id,lastTap:null,elapsed:0,intervals:0};
    state.notice="";paint();
  }
  function openEditor(id=null){
    state.editingGroup=false;state.editId=id;state.editingMode="daily";
    state.view="edit";state.notice="";paint();
  }
  function updateEstimate(){
    const form=ui.querySelector("#wz-editor-form"),out=form?.querySelector("#wz-estimate");
    if(!out)return;
    const start=form.elements.fixedStart?.value,end=form.elements.endDate?.value;
    const days=daysBetween(start,end);
    const goal=Number(form.elements.fixedTotal?.value||0);
    out.textContent=days?t("Duration","کل دن")+": "+fmt(days)+" · "+t("Daily average","روزانہ اوسط")+": "+fmt(Math.ceil(goal/days)):"";
  }
  async function saveForm(form){
    if(state.busy)return;
    if(state.editingGroup&&!state.owner)return;
    const d=new FormData(form),mode=String(d.get("mode")||"daily");
    if(mode==="group"&&!state.owner){note("صرف Owner گروپ وظیفہ بنا سکتا ہے۔");return;}
    if(mode==="group"&&!state.editingGroup){openGroupSettings();return;}
    const value={
      title:d.get("title"),arabic:d.get("arabic"),instructions:d.get("instructions"),purpose:d.get("purpose"),
      mode,active:d.has("active"),
      dailyGoal:d.get("dailyGoal")||0,totalGoal:d.get("fixedTotal")||d.get("totalGoal")||0,
      yearlyGoal:d.get("yearlyGoal")||0,startDate:d.get("fixedStart")||d.get("openStart")||d.get("startDate")||"",
      endDate:d.get("endDate")||""
    };
    state.busy=true;const save=form.querySelector('[type="submit"]');if(save)save.disabled=true;
    try{
      if(state.editingGroup)await saveGroupWazifa(value);
      else await savePersonalWazifa(value,state.editId);
      resetToList();note(t("Wazifa saved.","وظیفہ محفوظ ہوگیا۔"));
    }catch(e){
      state.notice=e?.message||t("Could not save.","محفوظ نہیں ہوا۔");
      const line=ui.querySelector(".wz-notice");
      if(line)line.textContent=state.notice;
      else form.insertAdjacentHTML("afterbegin",status());
    }finally{state.busy=false;if(save?.isConnected)save.disabled=false;}
  }
  let tapTimer=null,busyTap=false;
  function countPersonalTap(){
    const id=state.selected,w=state.personal.find(x=>x.id===id);
    if(!id||!w?.active||state.busy)return;
    const day=localWazifaDate();
    const target=w.mode==="daily"?w.dailyGoal:w.totalGoal;
    const current=(w.mode==="daily"?(w.lastDay===day?w.dayRead:0):w.totalRead)+(state.pending.get(id)||0);
    if(w.mode==="fixed" && current>=Number(target||0)){note("فکس وظیفے کا ہدف مکمل ہو چکا ہے۔");return;}
    state.pending.set(id,(state.pending.get(id)||0)+1);
    const now=performance.now(),session=state.session;
    if(session.lastTap!==null && now-session.lastTap<=15000){
      session.elapsed+=now-session.lastTap;session.intervals++;
    }
    session.lastTap=now;
    paint();
    if(!tapTimer&&!busyTap)tapTimer=setTimeout(flushTapQueue,250);
  }
  async function flushTapQueue(){
    if(busyTap)return;
    clearTimeout(tapTimer);tapTimer=null;
    const id=state.selected,day=localWazifaDate(),amount=Math.min(10000,state.pending.get(id)||0);
    if(!id||!amount)return;
    busyTap=true;
    try{
      await recordPersonalWazifa(id,amount,day);
      state.pending.set(id,Math.max(0,(state.pending.get(id)||0)-amount));
      state.notice="";
    }catch(e){
      state.pending.set(id,Math.max(0,(state.pending.get(id)||0)-amount));
      state.notice=t("Readings were not saved: ","ورد محفوظ نہیں ہوا: ")+(e?.message||"Firebase");
    }finally{
      busyTap=false;paint();
      if((state.pending.get(id)||0)>0)tapTimer=setTimeout(flushTapQueue,250);
    }
  }
  function duration(ms){
    const n=Math.max(0,Math.floor(ms)),sec=Math.floor(n/1000);
    return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(x=>String(x).padStart(2,"0")).join(":")+"."+String(n%1000).padStart(3,"0");
  }
  setInterval(()=>{
    if(state.view!=="personal-reader"||document.hidden)return;
    const session=state.session;const clock=ui.querySelector("#wz-personal-clock");if(!clock)return;
    let elapsed=0;
    if(session.lastTap!==null){
      const since=performance.now()-session.lastTap;
      if(since>=15000){session.elapsed+=15000;session.lastTap=null;}
      else elapsed=since;
    }
    clock.textContent=duration(session.elapsed+elapsed);
    const pace=session.intervals&&session.elapsed>0?session.elapsed/session.intervals:0;
    const set=(id,value)=>{const target=ui.querySelector(id);if(target)target.textContent=value;};
    set("#wz-seconds",pace?(pace/1000).toFixed(1):"—");
    set("#wz-per-minute",pace?(60000/pace).toFixed(1):"—");
    set("#wz-per-hour",pace?(3600000/pace).toFixed(1):"—");
  },125);
  ui.addEventListener("click",event=>{
    const target=event.target.closest("[data-action^='wz-']");
    if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    const action=target.dataset.action;
    if(action==="wz-back"){resetToList();paint();}
    else if(action==="wz-new")openEditor();
    else if(action==="wz-group-settings")openGroupSettings();
    else if(action==="wz-open-group"){if(state.group.active){resetToList();bridge.openGroupReader();}}
    else if(action==="wz-edit-personal")openEditor(target.dataset.id);
    else if(action==="wz-read-personal")openPersonal(target.dataset.id);
    else if(action==="wz-tap-personal")countPersonalTap();
    else if(action==="wz-toggle-group"&&state.owner){
      saveGroupWazifa({...state.group,active:!state.group.active})
        .then(()=>note(t("Group status saved.","گروپ کی حالت محفوظ ہوگئی۔")))
        .catch(e=>note(e?.message||"Firebase error"));
    }
  },true);
  ui.addEventListener("submit",event=>{
    if(event.target.id!=="wz-editor-form")return;
    event.preventDefault();event.stopImmediatePropagation();saveForm(event.target);
  },true);
  ui.addEventListener("change",event=>{
    if(event.target.id!=="wz-mode")return;
    const mode=event.target.value;
    if(mode==="group"){openGroupSettings();return;}
    const form=event.target.form;
    for(const block of form.querySelectorAll("[data-wz-only]"))
      block.hidden=block.dataset.wzOnly!==mode;
    updateEstimate();
  },true);
  ui.addEventListener("input",event=>{
    if(["fixedStart","endDate","fixedTotal"].includes(event.target.name))updateEstimate();
  },true);
  const api={connect,disconnect,listMarkup,resetToList,openGroupSettings};
  window.duroodWazaif=api;
  return api;
}
