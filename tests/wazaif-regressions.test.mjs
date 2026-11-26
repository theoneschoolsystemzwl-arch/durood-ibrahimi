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
const paused={kind:"daily",goal:100,startDate:"2026-11-20",pausePeriods:[{startDate:"2026-11-21",endDate:"2026-11-24"}]};
assert.equal(f.targetForDay(paused,"2026-11-20"),100);
assert.equal(f.targetForDay(paused,"2026-11-21"),0);
assert.equal(f.targetForDay(paused,"2026-11-23"),0);
assert.equal(f.targetForDay(paused,"2026-11-24"),100);
assert.equal(f.targetForDay({...paused,dailyLedger:{"2026-11-21":{count:20}}},"2026-11-21"),100);
assert.equal(f.targetForDay({...paused,pausePeriods:[{startDate:"2026-11-21",endDate:""}]},"2026-11-24"),0);
assert(sharing.includes("acceptSharedWazifa(inboxId,settings)")&&sharing.includes("kind,goal,startDate,endDate,durationDays"));
assert(source.includes('data-wazifa-action="pause-personal"')&&source.includes("if(pausedOn(record,d)&&!savedOn(record,d))continue;"));
assert(rules.includes("validWzPauseChange"));
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
// Both Tasbih launch buttons are elegant single-line tabs. The original
// name + W-number remain in the card heading; no prayer-beads emoji is added.
const wazifaCss=fs.readFileSync("public/wazaif.css","utf8");
const personalCardMarkup=source.slice(source.indexOf("function personalCard("),source.indexOf("function inboxMarkup("));
const groupCardMarkup=source.slice(source.indexOf("function groupCard("),source.indexOf("function taskStatus("));
const readerMarkupSource=source.slice(source.indexOf("function readerMarkup("),source.indexOf("function refreshHeroReader("));
assert(personalCardMarkup.includes('class="wz-cta-single" lang="ur" dir="rtl">\'+esc(tasbihTabLabel(task.title))'),
  "Personal Tasbih tab must show the Wazifa title and Tasbih in one span");
assert(groupCardMarkup.includes('class="wz-cta-single" lang="ur" dir="rtl">\'+esc(tasbihTabLabel(g.title))'),
  "Group Tasbih tab must show the Wazifa title and Tasbih in one span");
assert(!personalCardMarkup.includes("📿")&&!groupCardMarkup.includes("📿"),
  "Launch tabs must not show a Tasbih icon");
assert(!personalCardMarkup.includes("wz-cta-action")&&!groupCardMarkup.includes("wz-cta-action"),
  "The launch tab must not split its label over two lines");
assert(wazifaCss.includes(".wz-tasbih-cta .wz-cta-single{"));
assert(wazifaCss.includes("white-space:nowrap")&&wazifaCss.includes("overflow-x:auto"),
  "Tab labels remain on one line, with sideways scroll for unusually long names");
assert(wazifaCss.includes("border-radius:16px 16px 6px 6px"));
assert(personalCardMarkup.includes('<h3><bdi dir="ltr" class="wz-serial"'),
  "Keep the existing name and W number in the card heading");
const sharedArabicRenderer=source.slice(source.indexOf("function arabicOrPdf("),source.indexOf("function arabicScrollControl("));
assert(readerMarkupSource.includes('arabicOrPdf(w.arabic,group?"group":"personal","div",true)') &&
  sharedArabicRenderer.includes("arabicDisplayAttrs(value)") &&
  sharedArabicRenderer.includes("arabicScrollControl(value)") &&
  sharedArabicRenderer.includes("pdfViewerMarkup(value,scope,auto)"),
  "Long Arabic and original PDF pages must both scroll inside the tasbih reader");
const attrsStart=source.indexOf("function arabicDisplayAttrs("),attrsEnd=source.indexOf("function groupCard(",attrsStart);
assert(attrsStart>0&&attrsEnd>attrsStart);
const arabicCtx={String};vm.createContext(arabicCtx);
vm.runInContext(source.slice(attrsStart,attrsEnd),arabicCtx);
assert.equal(arabicCtx.tasbihTabLabel("آیت الکرسی"),"آیت الکرسی تسبیح");
assert.equal(arabicCtx.tasbihTabLabel("آیت الکرسی تسبیح"),"آیت الکرسی تسبیح");
assert.equal(arabicCtx.tasbihTabLabel("سورۃ یٰسین"),"سورۃ یٰسین تسبیح");
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
 selectedDayFigures:()=>({goal:100,tasbih:0,manual:100,read:100,pending:0}),
 targetForDay:()=>100,
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
// Arabic text editor must accept a full Surah, never silently truncate a
// paste at the old 3,000-character browser limit. Confirm backend alignment.
const editorSource=source.slice(source.indexOf("function formMarkup("),source.indexOf("function heroIcon("));
assert(/<textarea\b[^>]*name="arabic"[^>]*id="wz-arabic-input"[^>]*rows="12"[^>]*\brequired\b/.test(editorSource));
assert(!editorSource.includes('name="arabic" rows="4" required maxlength="3000"'));
assert(!/textarea name="arabic"[^>]*maxlength=/.test(editorSource),
 "Pasting a long Surah must not be silently cut by HTML maxlength");
assert(source.includes("if(arabicWordCount(value)>25000)"));
assert(rules.includes("d.arabic.toUtf8().size() <= 600000"));
assert(rules.includes(".size() <= 25000"));
assert(editorSource.includes('data-wazifa-action="pdf-upload"')&&!editorSource.includes('data-wazifa-action="pdf-download"'));
assert(editorSource.includes('accept="application/pdf,.pdf"'));
const pdfModule=fs.readFileSync("public/wazifa-pdf.js","utf8");
assert(pdfModule.includes("isEvalSupported:false")&&!pdfModule.includes("downloadArabicPdf")&&!pdfModule.includes("makeArabicPdf"));
assert(pdfModule.includes("page.render(")&&pdfModule.includes("mountPdfViewer")&&!pdfModule.includes("createWorker"));
assert(pdfModule.includes('data-pdf-scroll-toggle aria-pressed="false"') && pdfModule.includes('class="wz-pdf-scroll is-scroll-off"') && pdfModule.includes('scroll.toggleAttribute("data-no-pull",on)'));
assert(pdfModule.includes("data-pdf-scroll-toggle") && pdfModule.includes("IntersectionObserver") && !pdfModule.includes("data-pdf-next") && !pdfModule.includes("data-pdf-prev"));
assert(pdfModule.includes("ensurePdfCloud") && pdfModule.includes("getDocFromServer") && !pdfModule.includes("localOnly:true"));
assert(sharing.includes('await pdf.ensurePdfCloud(data.arabic,uid,"personal")') && sharing.includes('await pdf.savePdfAttachment({marker:initial.arabic,bytes},uid,"personal")'));
assert(rules.includes("wzPdfShareRead(uid,fileId)") && rules.includes("get(ref).data.recipientUid == request.auth.uid"));
assert(rules.includes("fileId.matches('^[a-f0-9]{32}$')"));
assert(source.includes("preparePdf(file)")&&source.includes("savePdfAttachment")&&source.includes("pdfMark"));
assert(rules.includes("match /wazifaPdfPrivate/")&&rules.includes("match /wazifaPdfGroup/"));
const deployedRelease=JSON.parse(fs.readFileSync("public/release.json","utf8")).version;
assert(fs.readFileSync("public/pwa.js","utf8").includes('const RELEASE="'+deployedRelease+'";'));
assert(fs.readFileSync("public/index.html","utf8").includes("pwa.js?v="+deployedRelease));
const editorCss=fs.readFileSync("public/wazaif.css","utf8");
assert(editorCss.includes('textarea[name="arabic"]'));
assert(editorCss.includes("min-height:260px")&&editorCss.includes("resize:vertical"));
const counterStart=source.indexOf("function syncArabicCounter(");
const counterEnd=source.indexOf("function syncForm(){",counterStart);
assert(counterStart>0&&counterEnd>counterStart);
const editorContext={TextEncoder};
vm.createContext(editorContext);
vm.runInContext(source.slice(counterStart,counterEnd),editorContext);
const editorNotice={textContent:"",classList:{toggle(name,yes){this.over=Boolean(yes);}}};
const editorInput={value:"ب".repeat(7000),setCustomValidity(msg){this.error=msg;}};
const editorForm={elements:{arabic:editorInput},querySelector:()=>editorNotice};
editorContext.syncArabicCounter(editorForm);
assert.equal(editorInput.value.length,7000,"A long pasted Surah must remain intact");
assert.equal(editorInput.error,"");
assert(editorNotice.textContent.includes("1 / 25,000"));
editorInput.value="الحمد ".repeat(25000).trim();
editorContext.syncArabicCounter(editorForm);
assert.equal(editorInput.error,"");
assert(editorNotice.textContent.includes("25,000 / 25,000"));
editorInput.value+=" الحمد";
editorContext.syncArabicCounter(editorForm);
assert(editorInput.error.includes("25,000"));
assert(editorNotice.classList.over,"Oversized Arabic text should give a visible warning");
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

// Member daily targets sum once, legacy personal goals migrate without double-counting.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const start=classic.indexOf("function latestReaderGoal("),end=classic.indexOf("window.duroodMemberGroupTargets=",start);
 assert(start>=0&&end>start);
 const targetContext=vm.createContext({Date,Number,Math,Object,Array,window:{}});
 vm.runInContext(fs.readFileSync("public/hijri-session.js","utf8"),targetContext);
 vm.runInContext("window.duroodHijri=globalThis.duroodHijri",targetContext);
 vm.runInContext(classic.slice(start,end),targetContext);
 const aggregate=vm.runInContext("aggregateGroupTargets",targetContext);
 const member=(goal,date="2026-11-24",joined=date)=>({daily:[{date,goal}],legacy:[],joined});
 const total=aggregate([member(100),member(100)],"2026-11-24");
 assert.equal(total.dailyGoal,200);assert.equal(total.weeklyGoal,1400);assert.equal(total.monthlyGoal,6000);assert.equal(total.yearlyGoal,7600);
 const example=aggregate([member(100),member(101)],"2026-11-25",{annualStartDate:"2026-11-24",annualEndDate:"2027-08-16"});
 assert.equal(example.dailyGoal,201);
 assert.equal(example.overallGoal,201);assert.equal(example.fullYearGoal,53466);
 assert.equal(example.yearlyGoal,53466);
 assert(classic.includes('gender=m.role==="owner"?"male":(m.gender==="female"?"female":"male")'));
 assert.equal(aggregate([member(100,"2028-02-01")],"2028-02-29").monthlyGoal,2900);
 assert.equal(aggregate([member(100,"2028-02-01")],"2028-02-29").yearlyGoal,33500);
 assert.equal(aggregate([{daily:[{date:"2026-11-24",goal:120}],legacy:[{date:"2026-11-24",mode:"personal",dailyGoal:100}]}],"2026-11-24").dailyGoal,120);
 assert.equal(aggregate([{daily:[],legacy:[{date:"2026-11-24",mode:"owner",dailyGoal:100}]}],"2026-11-24").dailyGoal,0);
 assert.equal(aggregate([member(100),member(0)],"2026-11-24").dailyGoal,100);
 assert.equal(aggregate([{daily:[{date:"2026-11-23",goal:100},{date:"2026-11-24",goal:0}],legacy:[{date:"2026-11-24",mode:"personal",dailyGoal:200}]}],"2026-11-24").dailyGoal,0);
 assert.equal(aggregate([{daily:[],legacy:[{date:"2026-11-24",mode:"personal",dailyGoal:500}]}],"2026-11-24").dailyGoal,0);
 const period={annualStartDate:"2026-11-24",annualEndDate:"2027-08-16"};
 const rolling=aggregate([member(100),member(100,"2026-11-25")],"2026-11-25",period);
 assert.equal(rolling.overallGoal,200);assert.equal(rolling.fullYearGoal,53100);
 assert.equal(rolling.yearlyGoal,53100);
 const next=aggregate([member(100)],"2027-08-17",period);
 // The next session starts immediately after the prior inclusive end.
 assert.equal(next.annualStartDate,"2027-08-17");
 assert.equal(next.annualEndDate,"2028-08-03");
 assert.equal(next.overallGoal,100);assert.equal(next.fullYearGoal,35300);assert.equal(next.yearlyGoal,35300);
 const shortSession=aggregate([member(100)],"2026-12-31",{annualStartDate:"2026-11-24",annualEndDate:"2026-12-31"});
 assert.equal(shortSession.yearlyGoal,26500); // Old Gregorian end is replaced by estimated 12 Rabi al-Awwal.
 assert.equal(aggregate([{daily:[{date:"2026-11-24",goal:100},{date:"2026-11-25",goal:50}]}],"2026-11-25",period).overallGoal,50);
 assert.equal(aggregate([{daily:[{date:"2026-11-24",goal:100}],active:false,inactiveDay:"2026-11-25"}],"2026-11-26",period).overallGoal,0);
 assert.equal(aggregate(null,"2026-11-24"),null);
 const progress=vm.runInContext("memberToDateProgress",targetContext);
 const sixDays=member(100,"2026-11-21");
 assert.equal(progress(sixDays,"2026-11-26",500).target,600);
 assert.equal(progress(sixDays,"2026-11-26",500).status,"short");
 assert.equal(progress(sixDays,"2026-11-26",800).status,"complete");
 assert.equal(progress(sixDays,"2026-11-26",600).status,"complete");
 assert.equal(progress(sixDays,"2026-11-26",null).status,"unknown");
 assert.equal(progress({...sixDays,joined:null},"2026-11-26",500).target,null);
 assert.equal(progress({...sixDays,daily:[{date:"2026-11-21",goal:100},{date:"2026-11-24",goal:200}]},"2026-11-26",900).target,900);
 assert(classic.includes('dialog.addEventListener("click",()=>{if(dialog.open)dialog.close();})'));
 const audit=vm.runInContext("memberTargetAudit",targetContext);
 const four=[member(100,"2026-11-25"),member(100,"2026-11-25"),member(100,"2026-11-26"),member(100,"2026-11-26")];
 const fourResult=aggregate(four,"2026-11-26");
 assert.equal(fourResult.dailyGoal,400);assert.equal(fourResult.overallGoal,400);assert.equal(fourResult.fullYearGoal,14600);assert.equal(fourResult.missingTargets,0);
 assert.equal(aggregate(four,"2026-11-27").overallGoal,400);assert.equal(aggregate(four,"2026-11-27").fullYearGoal,14600);
 assert.equal(aggregate(four,"2026-11-27").dailyGoal,400);
 assert.equal(aggregate(four,"2026-11-27",{annualStartDate:"2026-11-24",annualEndDate:"2027-08-16"}).yearlyGoal,105800);
 assert.equal(aggregate([member(100),member(100)],"2026-11-26").fullYearGoal,7600);
 assert.equal(aggregate([member(100,"2028-01-01")],"2028-02-29").fullYearGoal,36600);
 assert.equal(audit(four,"2026-11-26").reduce((n,r)=>n+r.annual,0),14600);
 const women=[{daily:[],legacy:[{date:"2026-11-24",mode:"personal",dailyGoal:100}]},{daily:[]}];
 assert.equal(aggregate(women,"2026-11-26").missingTargets,2);
 assert.equal(audit(women,"2026-11-26")[0].goal,null);assert.equal(audit(women,"2026-11-26")[0].legacyGoal,100);
 assert.equal(audit([member(0)],"2026-11-26")[0].goal,0);
 assert.equal(aggregate([member(0)],"2026-11-26").missingTargets,0);
 assert(classic.includes('id="member-target-audit"'));
 const daily221=aggregate([member(100),member(100),member(21)],"2026-11-26");
 assert.equal(daily221.overallGoal,221);assert.equal(daily221.fullYearGoal,8398);
 assert.equal(aggregate([member(100),member(100),member(21)],"2026-11-27").fullYearGoal,8398);
 const janSession={annualStartDate:"2027-01-01",annualEndDate:"2027-08-16"};
 const joiners=["2027-01-01","2027-06-01","2027-07-01","2027-08-01"].map(d=>member(100,d));
 const yearOne=aggregate(joiners,"2027-08-01",janSession);
 assert.equal(yearOne.dailyGoal,400);assert.equal(yearOne.yearlyGoal,36800);
 assert.equal(aggregate(joiners,"2027-08-02",janSession).yearlyGoal,36800);
 assert.equal(aggregate(joiners,"2028-01-01",janSession).yearlyGoal,141200);
 const yearTwo=[...joiners,member(100,"2028-06-01")];
 assert.equal(aggregate(yearTwo,"2028-06-01",janSession).yearlyGoal,147600);
 assert.equal(aggregate([{daily:[{date:"2027-01-01",goal:100}]}],"2027-01-01",janSession).yearlyGoal,null);
 assert.equal(aggregate([{...joiners[0],active:false}],"2028-01-01",janSession).yearlyGoal,0);
 const home=classic.slice(classic.indexOf("function overview()"),classic.indexOf("function simulateSave()"));
 assert(home.includes('data-action="open-target-audit"')&&!home.includes('id="member-target-audit"'));
 assert(home.includes('dashboard-group-summary'));
 assert(home.indexOf('data-action="open-target-audit"')<home.indexOf('dashboard-group-summary'));
 assert(home.includes('class="dashboard-quick-strip')&&home.includes('prayerTickerMarkup(currentUser())')&&home.includes('id="global-pkt-clock"'));
 assert(home.indexOf('prayerTickerMarkup(currentUser())')<home.indexOf('id="global-pkt-clock"'));
 assert(home.indexOf('id="global-pkt-clock"')<home.indexOf('data-action="open-target-audit"'));
 assert(classic.includes('section==="overview"?"":prayerTickerMarkup(person)'));
 assert(classic.includes('class="pkt-date"')&&classic.includes('class="pkt-time"'));
 assert(home.includes('class="dashboard-quick-strip" dir="ltr"'));
 assert(!home.includes("currentUser()?.isOwner?'<button type=\"button\" class=\"button secondary target-audit-launch"));
 assert(classic.includes('function openTargetAudit(){\n if(!currentUser()||'));
 assert(classic.includes('query(collection(db,"members"),where("gender","==",side),limit(200))'));
 assert(classic.includes('exists')&&classic.includes('isGoalOwner?[["daily","duroodGoals"],["legacy","groupTargets"]]:[["daily","duroodGoals"]]'));
 assert(rules.includes('exists(memberPath(uid)) && matchingGender(get(memberPath(uid)).data));'));
 assert(classic.includes('includeMetadataChanges:true},snap=>{')&&classic.includes('gender===side'));
 assert(!classic.includes('memberReaderGoalRows===null||memberGoalRows===null'));
 const overview=classic.slice(classic.indexOf("function overview()"),classic.indexOf("function simulateSave()"));
 assert(!overview.includes("dashboard-group-progress")&&!overview.includes("data-member-group-progress"));
 assert(!source.includes("data-group-target-settings"));
}

  
// Dashboard reader totals retain the saved count and effective-dated personal target.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const start=classic.indexOf("function latestReaderGoal("),end=classic.indexOf("function effectiveGroupDailyGoal(",start);
 const a=classic.indexOf("function readerCountAndTarget("),b=classic.indexOf("function readerList(",a);
 assert(start>=0&&end>start&&a>=0&&b>a);
 const ctx=vm.createContext({formatNumber:String,displayNumber:n=>"<bdi>"+n+"</bdi>"});
 vm.runInContext(classic.slice(start,end)+classic.slice(a,b),ctx);
 const format=vm.runInContext("readerCountAndTarget",ctx);
 const history=[{date:"2026-11-24",goal:100},{date:"2026-11-25",goal:200},{date:"2026-11-26",goal:0}];
 const row={total:50,manualTotal:25};
 assert.equal(format(row,"2026-11-24",history,true),"75 / 100");
 assert.equal(format(row,"2026-11-25",history,true),"75 / 200");
 assert.equal(format({total:1,manualTotal:101},"2026-11-25",[{date:"2026-11-25",goal:101}],true),"102 / 101");
 assert(!/[<>]/.test(format(row,"2026-11-25",history,true)));
 assert(classic.includes('class="dashboard-reader-read" style="font-size:1.5em"'));
 assert(classic.includes('class="dashboard-reader-target" style="font-size:1em"'));
 assert.equal(format(row,"2026-11-26",history,true),"75 / 0");
 assert.equal(format(row,"2026-11-23",history,true),"75 / —");
 assert.equal(format(row,"2026-11-25",null,true),"75 / —");
 assert.equal(format(row,"2026-11-25",history,false),"75");
 assert(classic.includes("bridge.readerDirectoryGoals(observedUid,[...goalMembers]"));
}

// Foreground presence is independent of the login lease and group membership.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const begin=classic.indexOf("function presenceOnline("),end=classic.indexOf("function memberLoginMarkup(",begin);
 assert(begin>=0&&end>begin);
 const context=vm.createContext({Date,Number,window:{duroodMemberLoginStatus:{presence:new Map([["a",100000]])}}});
 vm.runInContext(classic.slice(begin,end),context);
 const online=vm.runInContext("presenceOnline",context);
 assert.equal(online("a",159999),true);assert.equal(online("a",160000),false);assert.equal(online("b",110000),false);
 assert(classic.includes("document.hidden||navigator.onLine===false"));
 assert(classic.includes("directoryGroupName(person.id)"));
 assert(rules.includes("match /memberPresence/{presenceId}"));
 assert(!classic.includes("Open authorized Google password reset"));
}

{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const ctx=vm.createContext({Date,Number,Math,Object,window:{}});
 vm.runInContext(fs.readFileSync("public/hijri-session.js","utf8"),ctx);
 vm.runInContext('window.duroodHijri=globalThis.duroodHijri;let today="2026-11-26";const globalDateKey=()=>today;let dashboardGroupSettings={annualStartDate:"2026-11-24",annualEndDate:"2027-08-16"};let periodCounts={month:244};let periodDatedCounts={"2026-08-01":1000,"2026-11-22":1,"2026-11-23":29,"2026-11-24":214};const annualTargetPeriod=(cfg,day)=>window.duroodHijri.period(cfg,day);',ctx);
 const a=classic.indexOf("function dashboardPeriodCount("),b=classic.indexOf("function periodGoalStatus(",a);
 vm.runInContext(classic.match(/const dashboardCountStart="[^"]+";/)[0]+classic.slice(a,b),ctx);
 assert.equal(vm.runInContext('dashboardPeriodCount("year")',ctx),244);
 assert.equal(vm.runInContext('dashboardPeriodCount("month")',ctx),244);
 vm.runInContext('today="2027-08-17";periodDatedCounts["2027-08-16"]=7;periodDatedCounts["2027-08-17"]=3;',ctx);
 assert.equal(vm.runInContext('dashboardPeriodCount("year")',ctx),3);
}

 // Running targets use each day's saved goal and actual membership start.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const ctx=vm.createContext({Date,Number,Math,Object,Array,window:{}});
 vm.runInContext(fs.readFileSync("public/hijri-session.js","utf8"),ctx);
 vm.runInContext("window.duroodHijri=globalThis.duroodHijri",ctx);
 const a=classic.indexOf("function latestReaderGoal("),b=classic.indexOf("window.duroodMemberGroupTargets=",a);
 vm.runInContext(classic.slice(a,b),ctx);
 const c=classic.indexOf("function runningDashboardTargets("),d=classic.indexOf("function dashboardPeriodCount(",c);
 vm.runInContext(classic.match(/const dashboardCountStart="[^"]+";/)[0]+classic.slice(c,d),ctx);
 const running=vm.runInContext("runningDashboardTargets",ctx);
 const row=(joined,goal=100)=>({joined,active:true,daily:[{date:joined,goal}]});
 const cfg={annualStartDate:"2026-11-23",annualEndDate:"2027-08-16"};
 const four=Array.from({length:4},()=>row("2026-11-23"));
 for(const [day,expected] of [["2026-11-23",400],["2026-11-24",800],["2026-11-25",1200],["2026-11-29",2800]]){
  const g=running(four,day,cfg);assert.equal(g.week,expected);assert.equal(g.month,expected);assert.equal(g.year,expected);assert.equal(g.today,400);
 }
 assert.equal(running(four,"2026-11-30",cfg).week,400);
 assert.equal(running(four,"2026-12-01",cfg).month,400);
 assert.equal(running(four,"2027-08-17",cfg).year,400);
 const changed=[{...row("2026-11-23"),daily:[{date:"2026-11-23",goal:100},{date:"2026-11-25",goal:200}]},row("2026-11-25")];
 assert.equal(running(changed,"2026-11-25",cfg).week,500);
 assert.equal(running(changed,"2026-11-25",cfg).today,300);
 assert.equal(running([row("2026-11-23",0)],"2026-11-25",cfg).week,0);
 assert.equal(running([{joined:"2026-11-23",active:true,daily:[]}],"2026-11-25",cfg).week,null);
 assert.equal(running([{...row("2026-11-23"),joined:null}],"2026-11-25",cfg).year,null);
 assert.equal(running([{...row("2026-11-23"),active:false,inactiveDay:"2026-11-24"}],"2026-11-25",cfg).week,200);
 assert.equal(running(null,"2026-11-25",cfg),null);
 const known=vm.runInContext("knownDashboardTargets",ctx);
 const partial=known([row("2026-11-23",100),{joined:"2026-11-23",active:true,daily:[]}],"2026-11-26",cfg);
 assert.equal(partial.today,100);assert.equal(partial.week,400);assert.equal(partial.month,400);assert.equal(partial.year,400);
 const missingJoin=known([row("2026-11-23",100),{...row("2026-11-23",50),joined:null}],"2026-11-26",cfg);
 assert.equal(missingJoin.today,150);assert.equal(missingJoin.week,400);
 const full=vm.runInContext("aggregateGroupTargets",ctx);
 assert(full(four,"2026-11-25",cfg).yearlyGoal>running(four,"2026-11-25",cfg).year);
}

 // Refresh must preserve locally queued recitations and block only active writes.
 {
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const refresh=fs.readFileSync("public/pull-refresh.js","utf8");
 const guard=source.slice(source.indexOf('document.addEventListener("durood:before-refresh"'),source.indexOf("window.duroodWazaif="));
 let handler, persisted=0, blocked=0;
 const state={tapQueue:500,tapBusy:false,busy:false};
 const ctx=vm.createContext({state,wzSync:{status:()=>({busy:false})},persistDraft:()=>persisted++,document:{addEventListener:(n,fn)=>handler=fn}});
 vm.runInContext(guard,ctx);
 const event={preventDefault:()=>blocked++};
 handler(event);assert.equal(persisted,1);assert.equal(blocked,0);assert.equal(state.tapQueue,500);
 state.tapBusy=true;handler(event);assert.equal(blocked,1);assert.equal(persisted,1);
 assert(classic.includes("data-durood-refresh")&&refresh.includes("window.duroodRefreshPage=fetchLatest"));
 assert(refresh.includes("Promise.race")&&!refresh.includes("caches.delete"));
 }

 // Both group reader variants and the existing personal Save submit only on click.
 {
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const reader=source.slice(source.indexOf("function readerMarkup(group)"),source.indexOf("function refreshHeroReader()"));
 assert(reader.includes('data-wazifa-action="save-taps"'));
 assert(source.includes('if(action==="save-taps")return void drain()'));
 const groupSave=classic.indexOf('data-action="save-durood" disabled');
 const groupDial=classic.indexOf('data-action="count-durood"');
 assert(groupSave>=0&&groupSave<groupDial,"group Save appears above the dial");
 assert(classic.includes('tasbihSync.flush("_durood_")'));
 assert(classic.includes('set(\'group-unsaved\',formatNumber(taps))'));
 }

// A failed member goal listener must not suppress the other verified goals.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const a=classic.indexOf("const publishGoals=()=>{"),b=classic.indexOf("const isGoalOwner=",a);
 const reports=[];
 const ctx=vm.createContext({stillCurrent:()=>true,goalDirectoryReady:true,observedUid:"owner",goalMembers:new Map([["a",{daily:[{date:"2026-11-23",goal:100}],meta:{uid:"a"}}],["b",{daily:null,meta:{uid:"b"}}]]),bridge:{readerDirectoryGoals(){},aggregateGoalRows(...args){reports.push(args);}}});
 vm.runInContext(classic.slice(a,b).trim().replace(/\{\s*$/,"")+"\npublishGoals();",ctx);
 assert.equal(reports[0][1],null);assert.equal(reports[0][2].length,1);assert.equal(reports[0][2][0].daily[0].goal,100);
 vm.runInContext('goalMembers.get("b").daily=[{date:"2026-11-23",goal:50}];publishGoals();',ctx);
 assert.equal(reports[1][1].length,2);
}

 // Each card compares its own confirmed period count and accrued goal.
 {
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const css=fs.readFileSync("public/dashboard-reference.css","utf8");
 const a=classic.indexOf("function periodGoalStatus("),b=classic.indexOf("function periodGoalLabel(",a);
 const ctx=vm.createContext({Number});
 vm.runInContext(classic.slice(a,b),ctx);
 const compare=vm.runInContext("periodGoalStatus",ctx);
 assert.equal(compare(99,100),"short");
 assert.equal(compare(100,100),"complete");
 assert.equal(compare(101,100),"complete");
 assert.equal(compare(100,null),"unknown");
 const markup=classic.slice(classic.indexOf("function metricPeriodCards("),classic.indexOf("// Local visual welcome"));
 assert(markup.includes("dashboard-period-numbers"));
 assert(markup.indexOf('class="dashboard-period-copy"')<markup.indexOf('class="dashboard-period-goal"'));
 assert(css.includes(".period-short strong[data-period]")&&css.includes(".period-complete strong[data-period]"));
 }

// Four period headings only; center the unchanged white target and retain accessibility labels.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const css=fs.readFileSync("public/dashboard-reference.css","utf8");
 const markup=classic.slice(classic.indexOf("function metricPeriodCards("),classic.indexOf("// Local visual welcome"));
 assert(markup.includes('<h2 class="dashboard-period-heading"')&&!markup.includes("<small"),"only the period headings, no extra number labels");
 assert(classic.includes("['today','روزانہ'],['week','ہفتہ وار'],['month','ماہانہ'],['year','سالانہ']"));
 assert(markup.includes('lang="ur" dir="rtl"'));
 assert(css.includes("grid-row:1;grid-column:1;align-items:center;justify-content:center;align-self:center;text-align:center"));
 assert(markup.includes('aria-label="پڑھی گئی تعداد"')&&markup.includes('aria-label="'+ "'"));
 assert(css.includes("font:700 clamp(.72rem,3vw,1.15rem)")&&css.includes("font:800 clamp(1rem,4.3vw,1.75rem)"));
}

// Independently compare every period with its own accrued target.
{
 const classic=fs.readFileSync("public/classic-app.html","utf8");
 const a=classic.indexOf("function periodGoalStatus("),b=classic.indexOf("function periodGoalLabel(",a);
 const ctx=vm.createContext({Number});
 vm.runInContext(classic.slice(a,b),ctx);
 const compare=vm.runInContext("periodGoalStatus",ctx);
 for(const goal of [221,623,10000,58525]){
   assert.equal(compare(goal-1,goal),"short");
   assert.equal(compare(goal,goal),"complete");
   assert.equal(compare(goal+1,goal),"complete");
 }
 assert.equal(compare(null,221),"unknown");
 assert.equal(compare(270,null),"unknown");
}
