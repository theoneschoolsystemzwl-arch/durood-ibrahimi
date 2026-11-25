// Repeatable regression audit for prayer history, Qaza dates and status styling.
// These tests do not log in as a real member or touch production records.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {validQazaDay,normalizeQazaPlan,hasQazaPlanData} from "../public/qaza-model.js";

assert.equal(validQazaDay("2003-05-15"),true);
assert.equal(validQazaDay("2026-02-30"),false);
assert.equal(validQazaDay("2026-13-01"),false);
assert.equal(validQazaDay("1900-01-01"),true);
assert.equal(validQazaDay("1899-12-31"),false);

const legacy={start:"2003-05-15",target:25,
  done:{fajr:{"2026-11-19":true,"2026-11-20":false},
    isha:{"2026-11-21":true},other:{"2026-11-22":true}}};
const clean=normalizeQazaPlan(legacy);
assert.deepEqual(clean,{start:"2003-05-15",target:25,
  done:{fajr:{"2026-11-19":true},isha:{"2026-11-21":true}}});
assert.equal(hasQazaPlanData(clean),true);
assert.equal(hasQazaPlanData({}),false);
assert.equal(normalizeQazaPlan({start:"2026-02-30",target:-10}).start,"");
assert.equal(normalizeQazaPlan({start:"2026-01-01",target:1e11}).target,0);
assert.throws(()=>normalizeQazaPlan({done:{fajr:Object.fromEntries(
  Array.from({length:3001},(_,i)=>[new Date(Date.UTC(2000,0,i)).toISOString().slice(0,10),true])
)}}),/limit|حد/);

const ui=fs.readFileSync("public/classic-app.html","utf8");
const css=fs.readFileSync("public/prayer-calendar-fix.css","utf8");
const rules=fs.readFileSync("firestore.rules","utf8");
const spark=fs.readFileSync("public/qaza-firebase.js","utf8");
const requiredActions=[
  "nav","count-durood","namaz-month","namaz-mark","namaz-mode","prayer-view",
  "qaza-month","qaza-mode","qaza-record","qaza-unlock",
  "manual-day","daily-goal","create-invite","copy-invite"
];
for(const key of requiredActions){
  assert(ui.includes(key),`Missing navigation/action: ${key}`);
}
for(const needle of [
  "restoreMemberPrivateSettings(profile.uid","qazaLocalRevision++",
  "loadPrivateQaza(profile)","qazaSaveSpark(snapshot)",
  "loadPrayerMonth(month,uid)","loadPrayerDays(days,month,revision=0)",
  "memberPrivateStorageKey","prayer-calendar-fix.css","requestedPrayerMonth()"
]){
 assert(ui.includes(needle),`Missing prayer regression guard: ${needle}`);
}
for(const status of ["namaz-jamat","namaz-solo","namaz-made","namaz-missed",
 "namaz-clear","qaza-paid"]){
 assert(css.includes(status),`Prayer theme misses ${status}`);
}
assert(css.includes(".namaz-calendar-bar"));
assert(css.includes(".prayer-ledger"));
assert(fs.readFileSync("public/wazaif.js","utf8").includes('read-group'));
assert(spark.includes('"memberPrivate",uid,"qaza","plan"'));
assert(rules.includes("match /memberPrivate/{uid}/qaza/{docId}"));
assert(rules.includes("validQazaPaid"));
assert(rules.includes("self(uid) && currentMember()"));


// Prayer-time-independent attendance and Qaza-backed all-month ledger.
const prayerKeys=["fajr","dhuhr","asr","maghrib","isha"];
const dayToday="2026-11-23",dayPast="2026-11-22";
const ledgerCtx={
  Date,
  registrationDate:person=>person?.joined instanceof Date?person.joined:null,
  prayers:prayerKeys.map(id=>[id,id]),modeButtons:["jamat","solo","made","clear"],
  attendance:{1:{
    "2026-11-21":{fajr:"jamat",dhuhr:"solo",maghrib:"missed"},
    "2026-11-22":{fajr:"jamat",dhuhr:"made",asr:"made",maghrib:"solo"},
    "2026-11-23":{fajr:"jamat",dhuhr:"solo",asr:"made"}
  }},
  qazaPlans:{1:{start:"2026-11-21",target:8,done:{
    asr:{"2026-11-21":true,"2026-11-22":true},
    isha:{"2026-11-22":true}
  }}},
  prayerDate:(_id,ms)=>ms===undefined?dayToday:new Date(ms).toISOString().slice(0,10),
  dateNumber:day=>Date.parse(day+"T00:00:00Z")/86400000,
  qazaDate:n=>new Date(n*86400000).toISOString().slice(0,10),
  attendancePhase:(_member,day)=>day===dayToday?"upcoming":"missed",
  parseDay:key=>new Date(key+"T12:00:00Z"),
  dateKey:date=>date.toISOString().slice(0,10),
  prayerLocalRevision:0,prayerEditedDays:new Map(),qazaLocalRevision:0
};
vm.createContext(ledgerCtx);
function addPureSource(from,to){
  const start=ui.indexOf(from),end=ui.indexOf(to,start);
  assert(start>=0&&end>start,"Prayer source segment not found: "+from);
  vm.runInContext(ui.slice(start,end),ledgerCtx);
}
addPureSource("function alreadyOnTime(status) {","function qazaEligible(id,day,prayer");
addPureSource("function prayerLedgerTotals(person,now,today) {","function qazaTopSettings(plan,today)");
const sampleMember={id:1,joined:new Date("2026-11-23T00:00:00Z")};
const historyTotals=ledgerCtx.prayerLedgerTotals(sampleMember,0,dayToday);
assert.equal(historyTotals.start,"2026-11-21","Qaza start, not membership date, determines the baseline");
const prayer=(id)=>historyTotals.prayerTotals[prayerKeys.indexOf(id)];
assert.equal(prayer("fajr").jamat,3,"Fajr congregation includes all saved dates");
assert.equal(prayer("dhuhr").solo,2,"Dhuhr solo attendance counts from past and current day");
assert.equal(prayer("dhuhr").made,1,"Dhuhr attendance marked Qaza paid counts");
assert.equal(prayer("asr").made,3,"Asr Qaza calendar and attendance dates are deduplicated");
assert.equal(prayer("asr").total,3,"Qaza paid must never count as two prayers");
assert.equal(prayer("maghrib").solo,1);
assert.equal(prayer("maghrib").missed,2,"Old missed prayer and unmarked prayer today both remain Qaza");
assert.equal(prayer("maghrib").total,3,"All days including today are counted from the Qaza start");
assert.equal(prayer("isha").made,1,"A Qaza payment stored only in Qaza calendar counts");
assert.equal(prayer("isha").missed,2);
assert.equal(historyTotals.prayerTotals.reduce((sum,p)=>sum+p.total,0),15,"Five prayers over three dates including today");
assert.equal(historyTotals.prayerTotals.reduce((sum,p)=>sum+p.missed,0),4,"Four remaining Qaza after three congregation, three solo, five made");
assert(historyTotals.prayerTotals.every(p=>p.total===3),"Every prayer has three due dates regardless of attendance or timing");
assert(historyTotals.prayerTotals.every(p=>p.missed===p.total-p.jamat-p.solo-p.made),"Every remaining balance is computed from all three paid categories");
const emptyLedgerCtx={...ledgerCtx,attendance:{2:{}},qazaPlans:{2:{start:"2026-11-21",done:{}}}};
vm.createContext(emptyLedgerCtx);
vm.runInContext(ui.slice(ui.indexOf("function prayerLedgerTotals(person,now,today) {"),ui.indexOf("function dailyAttendanceLedger(person,now,today) {")),emptyLedgerCtx);
const noAttendance=emptyLedgerCtx.prayerLedgerTotals({id:2,joined:new Date("2026-11-23T00:00:00Z")},0,dayToday);
assert(noAttendance.prayerTotals.every(p=>p.total===3&&p.missed===3),"Unmarked dates, including today, all remain pending");
assert.equal(noAttendance.prayerTotals.reduce((sum,p)=>sum+p.missed,0),15,"Five prayers over three dates are all Qaza when no attendance exists");

// The new total column sums each attendance category and the final row shows remaining Qaza.
ledgerCtx.tr=(_english,urdu)=>urdu;
ledgerCtx.formatNumber=value=>Number(value).toLocaleString("en-US");
addPureSource("function ledgerRow(label,values,tone=''", "function qazaLedger(byPrayer)");
const ledgerHtml=ledgerCtx.dailyAttendanceLedger(sampleMember,0,dayToday);
const ledgerTableHtml=ledgerHtml.slice(ledgerHtml.indexOf("<table"),ledgerHtml.indexOf("</table>")+8);
assert(ledgerHtml.includes("prayer-ledger-seven"),"Only daily prayer ledger gets the extra Total column");
assert(ledgerTableHtml.includes('<th scope="col">ٹوٹل</th>'),"The Total heading follows Isha");
assert(ledgerHtml.includes('ledger-frame prayer-ledger-fit'),"Daily prayer ledger uses a fixed-to-screen table wrapper");
assert(!ledgerHtml.includes('prayer-ledger-scroll-hint')&&!ledgerHtml.includes('role="region" tabindex="0"'),"No swipe hint or horizontal scroll control");
assert(!css.includes("width:601px")&&!css.includes("overflow-x:auto"),"Remove forced wide table and horizontal scrolling");
assert(css.includes("overflow:clip!important"),"Seven-column ledger clips overflow instead of scrolling");
assert(css.includes("width:100%!important;min-width:0!important;max-width:100%!important"),"Seven columns use full available width");
assert(css.includes("width:29%!important")&&css.includes("width:10.8%!important")&&css.includes("width:17%!important"),"Mobile widths are 29 plus five at 10.8 plus 17 percent");
assert(css.includes("word-break:normal!important")&&css.includes("white-space:normal!important"),"Prayer row labels wrap at words and never letter by letter");
assert(css.includes("prayer-ledger-big")&&css.includes("prayer-ledger-large"),"Long counts use responsive typography, not rounding");
assert(css.includes("col.prayer-ledger-status-col")&&css.includes("col.prayer-ledger-prayer-col")&&css.includes("col.prayer-ledger-total-col"),"Every column has its own width");
assert(ui.includes("prayers.map(()=>'<col class=\"prayer-ledger-prayer-col\">').join('')"),"Five separate prayer columns remain");
assert(!ui.slice(ui.indexOf("function ledgerTable("),ui.indexOf("function qazaLedger(")).includes('<col span="5">'),"Separate prayer columns are not collapsed");
assert(!ledgerHtml.includes('id="qaza-ledger-title"'),"No changes to the separate Qaza ledger");
const largeLedger=ledgerCtx.ledgerRow("کل", [13476,13476,13476,13476,13476], "total", true);
assert(largeLedger.includes('prayer-ledger-large')&&largeLedger.includes('>13,476</bdi>'),"Unrounded 5-digit prayer obligations fit");
const biggerLedger=ledgerCtx.ledgerRow("کل", [125000,125000,125000,125000,125000], "total", true);
assert(biggerLedger.includes('prayer-ledger-big')&&biggerLedger.includes('>125,000</bdi>'),"Unrounded six-digit totals fit");

assert.equal((ledgerTableHtml.match(/<th scope="col">/g)||[]).length,7,"Attendance, five daily prayers and Total");
assert.equal((ledgerTableHtml.match(/class="prayer-ledger-row-total"/g)||[]).length,5,"Four accounting rows and pending footer each have Total");
assert(ledgerHtml.includes("کل قضا نمازیں")&&ledgerHtml.includes("باقی قضا نمازیں"),"Both total due and pending rows are labeled");
assert(ledgerHtml.includes("کل باقی نمازیں"),"Bottom grand total displays pending Qaza rather than all prayers");
assert(ledgerHtml.includes('>15</bdi>')&&ledgerHtml.includes('>4</bdi>'),"Both 15 obligations and 4 pending are visible");
assert.equal(ledgerCtx.knownPrayerStatus(1,dayPast,"asr"),"made");
assert.equal(ledgerCtx.knownPrayerStatus(1,dayPast,"fajr"),"jamat");

const markStart=ui.indexOf("function setPrayerAttendance("),markEnd=ui.indexOf("function handleNamazAction(",markStart);
assert(markStart>=0&&markEnd>markStart);
const markSource=ui.slice(markStart,markEnd);
assert(!markSource.includes("phase !== 'on-time'")&&!markSource.includes("phase !== 'missed'"),"No prayer-time restriction on user attendance");
assert(markSource.includes("day > today"),"Future dates still disallowed");
vm.runInContext(markSource,ledgerCtx);
assert.equal(ledgerCtx.setPrayerAttendance(1,dayToday,"maghrib","jamat",dayToday,0),true,"Congregation can be recorded before its scheduled window");
assert.equal(ledgerCtx.setPrayerAttendance(1,dayToday,"maghrib","solo",dayToday,0),true,"Solo can be recorded at any time");
assert.equal(ledgerCtx.setPrayerAttendance(1,dayToday,"maghrib","made",dayToday,0),true,"Qaza paid can be recorded at any time");
assert.equal(ledgerCtx.setPrayerAttendance(1,"2026-11-21","isha","jamat",dayToday,0),true,"Past dates accept congregation");
assert.equal(ledgerCtx.setPrayerAttendance(1,"2026-11-24","fajr","jamat",dayToday,0),false,"Future dates remain locked");
assert.equal(ledgerCtx.setPrayerAttendance(1,"2026-02-30","fajr","solo",dayToday,0),false,"Invalid dates remain locked");
ledgerCtx.qazaPlans[1].done.isha[dayToday]=true;
const oldQazaRevision=ledgerCtx.qazaLocalRevision;
assert.equal(ledgerCtx.setPrayerAttendance(1,dayToday,"isha","solo",dayToday,0),true);
assert.equal(Boolean(ledgerCtx.qazaPlans[1].done.isha[dayToday]),false,"On-time status clears contradictory Qaza paid flag");
assert.equal(ledgerCtx.qazaLocalRevision,oldQazaRevision+1,"Qaza correction is scheduled for remote sync");
assert.equal(ledgerCtx.knownPrayerStatus(1,dayToday,"isha"),"solo");
assert.equal(ledgerCtx.prayerEditedDays.has(dayToday),true,"Local edits are protected against an in-flight Firebase read");

ledgerCtx.setPrayerAttendance(1,dayToday,"maghrib","clear",dayToday,0);
ledgerCtx.qazaPlan=id=>ledgerCtx.qazaPlans[id];
ledgerCtx.qazaEligible=()=>false; // Upcoming today: ordinary Qaza eligibility is not yet met.
const qazaTestNow=Date.parse(dayToday+"T00:00:00Z");
addPureSource("function setQazaRecord(id,day,prayer,status,now=Date.now()) {","function ledgerRow(label,values,tone='',withTotals=false)");
assert.equal(ledgerCtx.setQazaRecord(1,dayToday,"maghrib","made",qazaTestNow),true,"Qaza calendar can mark paid today before a prayer window");
assert.equal(ledgerCtx.qazaPlans[1].done.maghrib[dayToday],true,"Early Qaza is recorded by date");
assert.equal(ledgerCtx.setQazaRecord(1,"2026-11-24","maghrib","made",qazaTestNow),false,"Qaza calendar does not accept future dates");

assert(ui.includes("function loadPrayerHistory(uid)"),"Fetch historical attendance for the full ledger");
assert(ui.includes("loadPrayerHistoryDays(result.days||[],startRevision)"),"Hydrate full attendance in the private UI");
assert(ui.includes("prayerEditedDays.get(item.date)"),"Late Firebase responses may not erase user edits");
assert(ui.includes('class="prayer-ledger-grand"'),"Grand total is visible below all five prayer columns");
assert(ui.includes("function qazaDayButton(prayer,label,day,completed,kind='month',early=false)"),"Today's early Qaza entry remains visibly distinct");
const prayerSpark=fs.readFileSync("public/spark-data.js","utf8");
assert(prayerSpark.includes("export async function prayerHistorySpark()"));
assert(prayerSpark.includes('getDocs(collection(db,"memberPrivate",uid,"prayers"))'));
assert(css.includes(".prayer-ledger-grand"));

// Each successful Qaza attendance starts a real 15-second UI hold. Reloads do
// not reset it, and the marked card stays ahead of already-completed entries.
const holdStart=ui.indexOf("const QAZA_ENTRY_GAP_MS = 15000;");
const holdEnd=ui.indexOf("function resetQazaView()",holdStart);
assert(holdStart>0&&holdEnd>holdStart,"Qaza hold timer helpers are present");
let fakeClock=Date.parse("2026-11-23T09:00:00Z"),activeInterval=0;
const storedHold=new Map();
const holdContext={
  Date:class extends Date {static now(){return fakeClock;}},
  currentUser:()=>({uid:"test-uid",id:1}),
  prayers:prayerKeys.map(id=>[id,id]),
  localStorage:{
    getItem:key=>storedHold.get(key)||null,
    setItem:(key,value)=>storedHold.set(key,value),
    removeItem:key=>storedHold.delete(key)
  },
  setInterval:()=>++activeInterval,
  clearInterval:()=>{},
  app:{querySelectorAll:()=>[]},
  section:"namaz",namazView:"qaza"
};
vm.createContext(holdContext);
vm.runInContext(ui.slice(holdStart,holdEnd),holdContext);
holdContext.qazaStartHold("fajr","2026-11-23");
assert.equal(holdContext.qazaSeconds(holdContext.qazaActiveHold()),15,"Countdown begins at 15");
fakeClock+=1000;
assert.equal(holdContext.qazaSeconds(holdContext.qazaActiveHold()),14,"Countdown proceeds to 14");
fakeClock+=13000;
assert.equal(holdContext.qazaSeconds(holdContext.qazaActiveHold()),1,"Final second displays 1");
holdContext.qazaHoldMemory=null;
assert(holdContext.qazaActiveHold(),"A refresh continues the saved countdown");
fakeClock+=1000;
assert.equal(holdContext.qazaActiveHold(),null,"Next attendance is unlocked after 15 seconds");
assert.equal(storedHold.size,0,"Expired wait is cleared from localStorage");
assert(ui.includes("if (waiting) {")&&ui.includes("if(qazaMode==='made') qazaStartHold(value,day);"),
  "Successful Qaza completion starts timer; subsequent entries check lock");
assert(ui.includes("if (hold?.prayer===prayer && hold.day===day) open.push({day,held:true});"),
  "Completed date remains in original open slot until the countdown finishes");
assert(ui.includes(' disabled aria-disabled="true"'),
  "Other Qaza attendance buttons are disabled during the hold");
assert(css.includes(".qaza-holding")&&css.includes(".qaza-hold-count")&&css.includes(".qaza-wait-status"),
  "Completed Qaza cell has distinct confirmation color and countdown styling");

console.log("Prayer regression checks passed: Qaza migration, date validation, isolated Firebase saves, calendar colors and key buttons.");
