// Pure regression checks. Never authenticates or reads production data.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync("public/wazaif.js","utf8");
const counter=fs.readFileSync("public/wazaif-counter.js","utf8");
const sharing=fs.readFileSync("public/wazifa-sharing.js","utf8");
const rules=fs.readFileSync("firestore.rules","utf8");
const start=source.indexOf("const dayOk=");
const end=source.indexOf("const defaultGroup=",start);
assert(start>=0&&end>start,"Date and fixed-plan functions missing");
const ctx={
 readingDay:()=>"2026-11-24",
 fmt:n=>String(n),
 esc:s=>String(s),
 Date,Number,String,Math,Object,Array,JSON,Intl
};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
const f=vm.runInContext("({addDays,spanDays,targetForDay,periodOnDay,runningGoal,fixedExpired,continuationActive,fixedPlan,visibleWazifaPeriod})",ctx);
const original={
 kind:"fixed",title:"درود خضری",goal:110,
 startDate:"2026-10-01",endDate:"2026-10-11",
 total:100,day:"2026-11-24",today:0
};
const extension={
 mode:"fixed",startDate:"2026-10-12",endDate:"2026-11-21",
 durationDays:41,goal:410
};
const daily={
 mode:"daily",startDate:"2026-11-22",endDate:"",
 durationDays:0,goal:20
};
assert.equal(f.fixedExpired(original),true);
assert.equal(f.addDays(original.endDate,1),"2026-10-12");
assert.equal(f.targetForDay({...original,continuePeriods:[extension]},"2026-10-12"),10);
assert.equal(f.targetForDay({...original,continuePeriods:[extension]},"2026-11-21"),10);
assert.equal(f.fixedExpired({...original,continuePeriods:[extension]}),true);
assert.equal(f.fixedExpired({...original,continuePeriods:[extension,daily]}),false);
assert.equal(f.targetForDay({...original,continuePeriods:[extension,daily]},"2026-11-24"),20);
assert.equal(f.targetForDay({...original,continuePeriods:[extension,daily]},"2026-10-08"),10);
assert.equal(f.runningGoal({...original,continuePeriods:[extension,daily]},"2026-11-24"),580);
assert.equal(f.continuationActive({...original,continuePeriods:[extension]}),false);
assert.equal(f.continuationActive({...original,continuePeriods:[extension,daily]}),true);
const correctedFixed={...extension,startDate:"2026-10-13",endDate:"2026-11-22"};
const correctedDaily={...daily,startDate:"2026-11-23"};
const shifted={...original,continuePeriods:[correctedFixed,correctedDaily]};
assert.equal(f.visibleWazifaPeriod(shifted,"2026-11-24").startDate,"2026-11-23");
assert.equal(f.visibleWazifaPeriod(shifted,"2026-11-24").endDate,"");
assert.equal(f.targetForDay(shifted,"2026-11-24"),20);
assert.equal(f.visibleWazifaPeriod({...original,continuePeriods:[correctedFixed]},
  "2026-11-24").startDate,"2026-10-13");
assert.equal(f.visibleWazifaPeriod({...original,continuePeriods:[correctedFixed]},
  "2026-11-24").endDate,"2026-11-22");
assert(source.includes('dateTile("آغاز کی تاریخ",visible.startDate)'));
assert(source.includes('heroTile("اختتامی تاریخ",visible.endDate||"جاری"'));

// The fixed-expiry "next goal" button belongs inside the personal settings,
// never on the main Wazifa card. It must remain tied to the edited Wazifa.
const mainCard=source.slice(source.indexOf("function personalCard("),source.indexOf("function inboxMarkup("));
const editForm=source.slice(source.indexOf("function formMarkup("),source.indexOf("function heroIcon("));
assert(!mainCard.includes('data-wazifa-action="continue-personal"'),
  "Next-goal action must not appear on the main Wazifa card");
assert(editForm.includes('state.editId&&!g&&expired?') &&
  editForm.includes('data-wazifa-action="continue-personal"') &&
  editForm.includes("esc(original.id)"),
  "Next-goal action must appear only in expired personal Wazifa settings");
// After saving, the same latest phase may be reopened for repeated goal
// corrections without reopening the original fixed Wazifa or its ledger.
assert(editForm.includes('state.editId&&!g&&continuationPeriods(original).length?'));
assert(editForm.includes('data-wazifa-action="edit-continuation"'));
assert(source.includes('if(action==="edit-continuation")return openContinuationForm(id,true)'));
assert(source.includes('data-edit-period="'));
assert(source.includes('continuePeriods:[...old.slice(0,-1),newPeriod]'));
assert(source.includes('if(date<newPeriod.startDate||'),
  "Saved recitation dates must not fall outside a corrected period");
assert(source.includes('name="nextEnd" type="date"'));

assert(rules.includes("validWzPeriodRevision"));
assert(rules.includes("affectedKeys().hasOnly(['goal','startDate','endDate','durationDays'])"));
// Launch tabs show the Wazifa name before "Tasbih", and the original
// heading remains below. Long Arabic passages scroll without text truncation.
const wazifaCss=fs.readFileSync("public/wazaif.css","utf8");
const personalCardMarkup=source.slice(source.indexOf("function personalCard("),source.indexOf("function inboxMarkup("));
const groupCardMarkup=source.slice(source.indexOf("function groupCard("),source.indexOf("function taskStatus("));
const readerMarkupSource=source.slice(source.indexOf("function readerMarkup("),source.indexOf("function refreshHeroReader("));
assert(personalCardMarkup.includes('class="wz-cta-title">\'+esc(task.title)'),
  "Personal tasbih tab must name the Wazifa");
assert(groupCardMarkup.includes('class="wz-cta-title">\'+esc(g.title)'),
  "Group tasbih tab must name its Wazifa");
assert(personalCardMarkup.includes('<h3><bdi dir="ltr" class="wz-serial"'),
  "Keep the existing name and W number in the card heading");
assert(readerMarkupSource.includes("arabicDisplayAttrs(w.arabic)"),
  "Long Arabic must also scroll inside the tasbih reader");
const attrsStart=source.indexOf("function arabicDisplayAttrs("),attrsEnd=source.indexOf("function groupCard(",attrsStart);
assert(attrsStart>0&&attrsEnd>attrsStart);
const arabicCtx={String};vm.createContext(arabicCtx);
vm.runInContext(source.slice(attrsStart,attrsEnd),arabicCtx);
assert(!arabicCtx.arabicDisplayAttrs("بسم الله الرحمن الرحيم").includes("wz-arabic-scroll"),
  "Short Arabic remains fully visible");
assert(arabicCtx.arabicDisplayAttrs("الحمد لله ".repeat(80)).includes('tabindex="0"'),
  "Long Arabic is accessible by keyboard and scrolling");
assert(wazifaCss.includes(".wz-card .wz-arabic-scroll{max-height:min(37dvh,350px)}"));
assert(wazifaCss.includes(".wz-hero-reader .wz-reading-text-visible .wz-arabic-scroll{max-height:min(48dvh,440px)}"));
assert(wazifaCss.includes("overflow-y:auto")&&wazifaCss.includes("touch-action:pan-y"));
// A deleted middle number must be reused for new and incoming tasks.
assert(sharing.includes("while(used.has(serial))serial++"));
assert(sharing.includes("lastNumber:serial"));
assert(sharing.includes("getDocsFromServer(query(personalCollection(uid),limit(100)))"));
// Manual transactions store durable per-attempt tokens; retries use the same receipt.
assert(source.includes("manualReceipt(op.token,index)"));
assert(source.includes('syncId:manualReceipt(op.token,index)'));
assert(counter.includes("if(receipt && (await tx.get(receipt)).exists())return {duplicate:true}"));
assert(counter.includes("day,amount:Math.abs(amount),source,createdAt:serverTimestamp()"));
// A focused ledger edit button must not suppress a confirmed Firebase
// update. Rebuilding only on a new record stamp also prevents needless DOM
// replacement on every Tasbih tap.
const refreshStart=source.indexOf("function refreshHeroReader(){");
const refreshEnd=source.indexOf("\nfunction continuationFormMarkup(){",refreshStart);
assert(refreshStart>0&&refreshEnd>refreshStart);
const existingHistory={dataset:{wzRenderStamp:"old"},innerHTML:"0",contains:()=>true};
const focusedEditButton={};
let historyRenderCount=0;
const dial={style:{setProperty(){}}};
const root={querySelector(selector){
 if(selector==="#wz-dial")return dial;
 if(selector==="#wz-record-history")return existingHistory;
 return null;
}};
const item={id:"TestWazifa",updatedAt:{seconds:1,nanoseconds:10},
 day:"2026-11-24",total:100,dailyLedger:{"2026-11-16":{count:100,manualCount:100,tasbihCount:0}}};
const ledgerEnv={
 state:{mode:"personal-reader",readerId:item.id,personal:[item],tapQueue:0,
  historyLimit:60,draftDay:"2026-11-16"},
 $:()=>root,readingDay:()=>"2026-11-24",wzSync:{pending:()=>0},
 heroReadingState:()=>({todayCount:0,total:100,dailyGoal:100,totalGoal:100}),
 dailyFigures:()=>({goal:100,tasbih:0,manual:0,read:0,pending:100}),
 readingTimes:()=>({tasbih:0,manual:0,total:0,hasSpeed:false}),
 durationText:()=>"",fmt:n=>String(n),Math,Number,
 updateWzSyncStatus:()=>{},
 wazifaHistoryMarkup:()=>{historyRenderCount++;return '<strong>دستی 100</strong>';},
 document:{activeElement:focusedEditButton}
};
vm.createContext(ledgerEnv);
vm.runInContext(source.slice(refreshStart,refreshEnd),ledgerEnv);
ledgerEnv.refreshHeroReader();
assert.equal(existingHistory.innerHTML,'<strong>دستی 100</strong>',
  "A focused edit button must not leave confirmed saved counts showing zero");
assert.equal(historyRenderCount,1);
ledgerEnv.refreshHeroReader();
assert.equal(historyRenderCount,1,"No unnecessary rerender when the ledger is unchanged");
item.updatedAt={seconds:2,nanoseconds:99};item.total=200;
ledgerEnv.refreshHeroReader();
assert.equal(historyRenderCount,2,"A new server update must repaint the ledger");
assert(source.includes('const fresh=await getDocFromServer('),
  "After manual Save the client must read the confirmed Firebase ledger");
assert(source.includes('state.personal=state.personal.map(item=>item.id===task.id?latest:item)'));
// Live Firestore rules must validate the same additions.
assert(rules.includes("validWzPeriodAppend"));
assert(rules.includes("wzAllowedContinuedDay"));
assert(rules.includes("lastNumber"));
assert(!rules.includes("getAfter(wzSequencePath(uid)).data.next == number"),
  "Reused W slots must not be denied just because the allocation event counter is higher");
assert(rules.includes("getAfter(wzSequencePath(uid)).data.next == wzOldSequence(uid) + 1"),
  "Every W slot allocation must still advance the immutable event counter");
assert(rules.includes("number == getAfter(wzSequencePath(uid)).data.get('lastNumber'"),
  "The W number must match the serial explicitly assigned in the transaction");
console.log("Wazifa regression checks passed (numbering, fixed continuation, dated totals, retry receipts).");
