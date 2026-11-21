// Additional Firebase-backed member pages: prayers, referrals, leaderboard, about.
import {auth} from "./firebase-client.js";
import {prayerSaveSpark,prayerMonthSpark,rankingSpark,referralsSpark,communitySpark} from "./spark-data.js";
const $=selector=>document.querySelector(selector);
const api={
  prayerSave:async ({date,statuses})=>({data:await prayerSaveSpark(date,statuses)}),
  prayerMonth:async ({month})=>({data:await prayerMonthSpark(month)}),
  ranking:async ()=>({data:await rankingSpark()}),
  referrals:async ()=>({data:await referralsSpark()}),
  summary:async ()=>({data:await communitySpark()})
};
const prayers=["fajr","dhuhr","asr","maghrib","isha"];
const modes=[
  ["clear","منتخب نہیں"],["jamat","باجماعت"],["solo","انفرادی نماز"],
  ["made","قضا ادا"],["missed","قضا باقی"]
];
const num=new Intl.NumberFormat("en-US");
const state={role:"member",prayerDays:new Map(),month:"",ready:false};
const localDate=(date=new Date())=>[
  String(date.getFullYear()),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")
].join("-");
function say(selector,text,success=false){
  const element=$(selector);if(!element)return;
  element.textContent=text||"";
  element.classList.toggle("ok",success);
}
const errorText=error=>{
  if(error?.code==="permission-denied")return "Firestore کی اجازت یا اکاؤنٹ کی حالت چیک کریں۔";
  if(error?.code==="unauthenticated")return "دوبارہ لاگ اِن کریں۔";
  return String(error?.message||"سرور سے رابطہ نہیں ہوا۔").slice(0,180);
};
function emptyMessage(node,text){
  const line=document.createElement("p");
  line.className="muted";line.textContent=text;
  node.replaceChildren(line);
}
function rowCard(label,right,sub=""){
  const row=document.createElement("div");row.className="history-item";
  const block=document.createElement("div");
  const title=document.createElement("strong");title.textContent=String(label);
  block.append(title);
  if(sub){const small=document.createElement("small");small.textContent=" "+sub;block.append(small);}
  const count=document.createElement("span");count.className="count";count.textContent=String(right);
  row.append(block,count);return row;
}
export function activateMemberHome(profile){
  state.role=profile.role==="owner"?"owner":"member";
  for(const node of document.querySelectorAll(".owner-only")){
    node.hidden=state.role!=="owner";
  }
  selectPage("home");
}
function selectPage(name){
  if(name==="owner"&&state.role!=="owner")name="home";
  for(const node of document.querySelectorAll("[data-page]")){
    node.hidden=node.dataset.page!==name;
  }
  for(const button of document.querySelectorAll(".nav-item")){
    if(button.dataset.view===name)button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  }
  if(name==="prayers")loadPrayerMonth().catch(error=>say("#prayer-message",errorText(error)));
  if(name==="ranking")loadLeaderboard().catch(error=>say("#ranking-message",errorText(error)));
  if(name==="referrals")loadReferrals().catch(error=>say("#referrals-message",errorText(error)));
  if(name==="home")loadCommunityTotals().catch(()=>{});
}
async function loadPrayerMonth(){
  if(!auth.currentUser)return;
  const input=$("#prayer-date"), month=input.value.slice(0,7);
  if(!month)return;
  const result=await api.prayerMonth({month});
  const days=result.data?.days||[];
  state.month=month;
  state.prayerDays=new Map(days.map(item=>[item.date,item.statuses||{}]));
  renderPrayerDate();
  const list=$("#prayer-history");list.replaceChildren();
  for(const item of days.sort((a,b)=>b.date.localeCompare(a.date))){
    const statuses=Object.values(item.statuses||{}).filter(v=>v!=="clear");
    list.append(rowCard(item.date, statuses.length+" / 5","نمازوں کا اندراج"));
  }
  if(!days.length)emptyMessage(list,"اس ماہ ابھی کوئی نماز کا ریکارڈ محفوظ نہیں ہوا۔");
}
function renderPrayerDate(){
  const statuses=state.prayerDays.get($("#prayer-date").value)||{};
  for(const prayer of prayers) {
    const input=$('#prayer-form select[name="'+prayer+'"]');
    input.value=statuses[prayer]||"clear";
  }
}
async function loadLeaderboard(){
  const list=$("#ranking-list");
  const result=await api.ranking({});
  const rows=result.data?.leaders||[];
  list.replaceChildren();
  rows.forEach((item,index)=>{
    list.append(rowCard((index+1)+". "+item.name,num.format(item.total||0),item.serial||""));
  });
  if(!rows.length)emptyMessage(list,"ابھی درود کا شمار درج نہیں ہوا۔");
  say("#ranking-message","فہرست تازہ ہو گئی۔",true);
}
async function loadReferrals(){
  const list=$("#referrals-list");
  const result=await api.referrals({});
  const rows=result.data?.referrals||[];
  list.replaceChildren();
  for(const item of rows){
    list.append(rowCard(item.name,item.serial||"",item.disabled?"معطل":"فعال"));
  }
  if(!rows.length)emptyMessage(list,"ابھی کوئی براہِ راست ممبر شامل نہیں ہوا۔");
  say("#referrals-message","دعوتی ممبرز کی فہرست تازہ ہو گئی۔",true);
}
async function loadCommunityTotals(){
  const response=await api.summary({});
  const element=$("#members-count");
  if(element)element.textContent=num.format(response.data?.totalAccounts||0);
}
export function initializeCommunityPages(){
  if(state.ready)return;
  state.ready=true;
  for(const button of document.querySelectorAll(".nav-item")){
    button.addEventListener("click",()=>selectPage(button.dataset.view));
  }
  for(const prayer of prayers){
    const select=$('#prayer-form select[name="'+prayer+'"]');
    for(const [value,label] of modes){
      const item=document.createElement("option");item.value=value;item.textContent=label;
      select.append(item);
    }
  }
  $("#prayer-date").value=localDate();
  $("#prayer-date").max=localDate();
  $("#prayer-date").addEventListener("change",async()=>{
    const month=$("#prayer-date").value.slice(0,7);
    if(month!==state.month) {
      try{await loadPrayerMonth();say("#prayer-message","");}
      catch(error){say("#prayer-message",errorText(error));}
    }else renderPrayerDate();
  });
  $("#prayer-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!auth.currentUser)return;
    const date=$("#prayer-date").value;
    if(!date||date>localDate())return say("#prayer-message","درست تاریخ منتخب کریں۔");
    const statuses=Object.fromEntries(prayers.map(prayer=>[
      prayer,$('#prayer-form select[name="'+prayer+'"]').value
    ]));
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      await api.prayerSave({date,statuses});
      await loadPrayerMonth();
      say("#prayer-message","نماز کا ریکارڈ محفوظ ہو گیا۔",true);
    }catch(error){say("#prayer-message",errorText(error));}
    finally{button.disabled=false;}
  });
  $("#refresh-ranking").addEventListener("click",()=>loadLeaderboard().catch(err=>say("#ranking-message",errorText(err))));
  $("#refresh-referrals").addEventListener("click",()=>loadReferrals().catch(err=>say("#referrals-message",errorText(err))));
}
