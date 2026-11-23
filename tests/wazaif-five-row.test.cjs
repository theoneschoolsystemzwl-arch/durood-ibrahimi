const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("public/wazaif.js","utf8");
const css=fs.readFileSync("public/wazaif-rollover.css","utf8");
const start=src.indexOf("function readingSources(entry"),end=src.indexOf("function displayRecordDate(key)");
assert(start>0&&end>start,"pure counting and timing helpers must be present");
const day="2026-11-23";
const state={draftDay:day,tapQueue:0,clockIntervals:0,tapGapTotalMs:0};
const sandbox={
 state,wzSync:{pending:()=>0},Number,Math,Object,esc:x=>String(x),
 fmt:x=>Math.max(0,Number(x)||0).toLocaleString("en"),
 readingDay:()=>day,datedProgress:()=>[],
 targetForDay:()=>4000,elapsedTime:()=>0,
 durationText:ms=>String(Math.floor(ms/1000))
};
vm.createContext(sandbox);
vm.runInContext(src.slice(start,end),sandbox);
const compactStart=src.indexOf("function compactTasbihClock(ms){");
assert(compactStart>=0&&compactStart<start,"compact Tasbih dial timer must exist");
vm.runInContext(src.slice(compactStart,start),sandbox);
assert.equal(sandbox.compactTasbihClock(0),"0");
assert.equal(sandbox.compactTasbihClock(59000),"59");
assert.equal(sandbox.compactTasbihClock(65000),"1:05");
assert.equal(sandbox.compactTasbihClock(3661000),"1:01:01");
const record={day,today:3000,dailyLedger:{
 [day]:{count:3000,tasbihCount:2000,manualCount:1000,durationMs:100000,intervals:10}
}};
sandbox.datedProgress=()=>[{count:3000,previousDue:0,previousCredit:0}];
let d=sandbox.dailyFigures(false,{kind:"daily",goal:4000,startDate:day},record);
assert.equal(d.goal,4000);assert.equal(d.tasbih,2000);
assert.equal(d.manual,1000);assert.equal(d.read,3000);assert.equal(d.pending,1000);
assert.equal((sandbox.fiveFigureMarkup(false,{goal:4000},record).match(/class="wz-five-cell /g)||[]).length,0);
assert(!sandbox.fiveFigureMarkup(false,{goal:4000},record).includes("آج کا باقی ہدف پورا کریں"),"redundant today summary prompt is gone");
sandbox.datedProgress=()=>[{count:4000,previousDue:0,previousCredit:0}];
record.today=4000;record.dailyLedger[day].count=4000;record.dailyLedger[day].tasbihCount=3000;
d=sandbox.dailyFigures(false,{goal:4000},record);
assert.equal(d.pending,0);
sandbox.datedProgress=()=>[{count:3000,previousDue:2000,previousCredit:0}];
record.today=3000;record.dailyLedger[day].count=3000;record.dailyLedger[day].tasbihCount=2000;
d=sandbox.dailyFigures(false,{goal:4000},record);
assert.equal(d.previous,2000);assert.equal(d.pending,3000);
assert(sandbox.fiveFigureMarkup(false,{goal:4000},record).includes("3,000"));
assert.equal(d.previous,2000,"previous due is still included in pending");
const time=sandbox.readingTimes({dailyLedger:{[day]:{count:110,tasbihCount:10,durationMs:100000,intervals:10,manualCount:100}}});
assert.equal(time.tasbih,100000);assert.equal(time.manual,1000000);
assert.equal(time.total,1100000);assert.equal(sandbox.readingPace({dailyLedger:{[day]:{durationMs:100000,intervals:10}}}),10000);
assert(css.includes("grid-template-columns:repeat(5,minmax(0,1fr))"));
assert(src.includes("if(clock)clock.textContent=compactTasbihClock(value);"),"dial has no millisecond suffix or leading hours");
assert(src.includes('maximumFractionDigits:0'),"Tasbih pace is displayed as whole numbers");
assert(src.includes("const perMinute=seconds>0?pace(60/seconds)"));
assert(src.includes("const perHour=seconds>0?pace(3600/seconds)"));
assert(src.includes('wzSync.enqueue({taskId:state.mode'),"tap is queued in durable storage before local increment");

const todayEntry={count:587,tasbihCount:15,manualCount:572,durationMs:150000,intervals:14};
const dayRecord={day,today:587,dailyLedger:{[day]:todayEntry}};
sandbox.datedProgress=()=>[{count:587,previousDue:0,previousCredit:0}];
const figures=sandbox.dailyFigures(false,{kind:"daily",goal:4000,startDate:day},dayRecord);
assert.equal(figures.tasbih,15,"Tasbih for 23 November must stay distinct and green");
assert.equal(figures.manual,572,"572 manually entered recitations should appear in yellow");
assert.equal(figures.read,587,"total should not duplicate either source");
assert.equal(figures.pending,3413,"pending must be calculated from total read");
const five=sandbox.fiveFigureMarkup(false,{kind:"daily",goal:4000,startDate:day},dayRecord);
assert(!five.includes('wz-five-cell'),"do not duplicate dated source counters above history");
assert(!five.includes('id="wz-five-alert"'),"remove the extra today summary prompt");
assert(!five.includes("آج کا باقی ہدف پورا کریں"));
const legacy={day,today:587,dailyLedger:{[day]:{count:587,tasbihCount:15,durationMs:150000,intervals:14}}};
const legacyFigures=sandbox.dailyFigures(false,{kind:"daily",goal:4000,startDate:day},legacy);
assert.equal(legacyFigures.tasbih,15);
assert.equal(legacyFigures.manual,572,"unattributed historical remainder should appear in dated/manual column");
assert.equal(legacyFigures.read,587);
assert.equal(sandbox.readingPace(dayRecord),10000,"15 recitations in 150 seconds = 10 sec/zikr");
assert.equal(sandbox.readingTimes(dayRecord).manual,5720000);
assert.equal(sandbox.readingPace({dailyLedger:{[day]:{count:1,tasbihCount:1,intervals:1,durationMs:10000}}}),10000);
sandbox.datedProgress=()=>[{count:4000,previousDue:0,previousCredit:0}];
dayRecord.today=4000;
dayRecord.dailyLedger[day].count=4000;dayRecord.dailyLedger[day].manualCount=3985;
const complete=sandbox.fiveFigureMarkup(false,{kind:"daily",goal:4000,startDate:day},dayRecord);
assert(!complete.includes('wz-five-cell'),"the five summary cells stay removed");
assert(complete.includes('id="wz-five-pending"')&&complete.includes("is-done"),"completed today due is shown in green");
assert(!complete.includes('id="wz-five-alert"'),"no redundant reminder for completed or incomplete days");
assert(!src.includes('id="wz-live-speed"'),"remove per-Zikr subtitle inside circular dial");
assert(!src.includes('["#wz-live-speed",'));
assert(src.includes("<small>SEC</small>")&&!src.includes("<small>SEC سیکنڈ</small>"),"Rate label uses SEC alone without the Urdu seconds suffix");
assert(src.includes("value/(1000*state.tapQueue)"),"speed uses total elapsed divided by zikr count");
assert(src.includes('durationMs,intervals:isToday?1:0'),"each tap records an interval and sync metadata");
assert(src.includes('syncId:op.id'),"remote retries must use idempotent receipt");
assert(src.includes('Date.now()-state.lastTapAt>=300000'),"five-minute inactivity triggers Save");
assert(css.includes("wz-ledger-green strong")&&css.includes("#10db78"));
assert(css.includes("wz-ledger-yellow strong")&&css.includes("#ffde3c"));
assert(css.includes("wz-ledger-pending strong")&&css.includes("#ff5b66"));
assert(css.includes("grid-template-columns:repeat(3,minmax(0,1fr))"),"three speed indicators");

const reader=src.slice(src.indexOf("function readerMarkup(group){"),src.indexOf("function refreshHeroReader()"));
assert(reader.indexOf("wz-hero-six")<reader.indexOf("wz-hero-topstats"),"lifetime figures follow daily goal and dates");
assert.equal((reader.match(/heroStat\(/g)||[]).length,3,"three lifetime stats fit in one row");
assert(!reader.includes("wz-time-three")&&!reader.includes("readingTimesMarkup(record)"),"remove total time breakdown cards");
assert(!reader.includes("تسبیح کی منتخب تاریخ")&&!reader.includes("wz-selected-source"),"remove redundant selected-day labels");
assert(reader.includes('data-wazifa-action="open-date-picker"')&&reader.includes('data-wazifa-action="save-taps"'));
assert.equal((reader.match(/data-wazifa-action="save-taps"/g)||[]).length,1,"only one Save button exists");
assert(reader.indexOf('data-wazifa-action="save-taps"')<reader.indexOf('id="wz-dial"'),"existing Save remains above the dial");
assert(reader.includes('data-wazifa-action="toggle-vibration"')&&reader.includes('data-wazifa-action="toggle-sound"'));
assert(reader.includes('class="wz-reader-controls-row"')&&reader.includes('class="wz-hero-speed"'),"speed, date and Save share one line");
assert(reader.includes('class="wz-daily-toolbar"')&&reader.includes('class="wz-reader-feedback"'),"today/due and sound/vibration share a row");
assert(reader.includes('data-wazifa-action="vibration-up"')&&reader.includes('data-wazifa-action="vibration-down"'));
assert(reader.includes('data-wazifa-action="sound-up"')&&reader.includes('data-wazifa-action="sound-down"'));
assert(!reader.includes('id="wz-hero-today-read"')&&!reader.includes('class="wz-percent-today"'),"remove redundant percentage and today tiles");
assert(!reader.includes("💾")&&!reader.includes("📳")&&!reader.includes("🔊"),"no Save / feedback icons");
assert(src.includes('wz-today-due'),"green today summary is visible under lifetime totals");
assert(css.includes('background:linear-gradient(125deg,#075943,#004b38)!important'),"all five dated cells use green background, not black/red/yellow");
assert(css.includes('.wz-due-number.is-pending')&&css.includes('animation:wz-due-flash'),"only overdue number flashes red");
assert(src.includes('durood-wz-sound-level')&&src.includes('durood-wz-vibration-level'),"feedback levels persist");
assert(src.includes('gain.gain.setValueAtTime(0.01+state.soundLevel*0.014'),"sound gain responds to selected level");
assert(src.includes('navigator.vibrate?.(8+state.vibrateLevel*16)'),"vibration duration responds to selected level");
assert(src.includes('advanceHistoryEditTap(historyEditTap,day,Date.now())'),"triple tap controls dated editing");
const histStart=src.indexOf("function wazifaHistoryMarkup(record){"),histEnd=src.indexOf("function heroReadingState(group,w,record)");
const historySource=src.slice(histStart,histEnd);
assert(histStart>0&&histEnd>histStart);
assert(historySource.indexOf("wz-clear-heading")<historySource.indexOf('wz-history-row wz-history-clear'),"date heading sits outside and above the five boxes");
assert(historySource.includes("const netGoal=Math.max(0,goal+previousDue-previousCredit)"),"daily displayed goal includes carried debts and credits");
assert(!historySource.includes('item("بقایا"'),"daily due box replaced by edit button");
assert(historySource.includes('class="wz-ledger-slot wz-ledger-edit-slot"'),"edit occupies the fifth box");
assert(historySource.includes("wz-ledger-label"),"all number captions sit outside their boxes");
assert(!historySource.includes("wz-previous-due"),"previous debt is not displayed separately");
const pstart=src.indexOf("const dayOk="),pend=src.indexOf("function fixedPlanMarkup(task");
assert(pstart>=0&&pend>pstart,"W1 date helpers should be available");
const plans={readingDay:()=>day,fmt:x=>String(x)};vm.createContext(plans);
vm.runInContext(src.slice(pstart,pend),plans);
const plan=plans.fixedPlan({kind:"fixed",goal:125000,startDate:"2026-10-01",endDate:"2026-11-10",
 continueStartDate:"2026-11-11",continueDailyGoal:500,continueBaseTotal:120000,
 total:124000,day,today:150});
assert.equal(plan.days,41);
assert.equal(plan.elapsed,41,"original 41 days remain completed");
assert.equal(plan.extraDays,13,"13 additional days after 41-day original");
assert.equal(plan.currentDay,54,"total elapsed day number must keep counting");
assert.equal(plan.goal,131500,"13 continued daily targets are added to original 125,000");
assert(reader.includes('s.continuing?s.plan.currentDay:elapsed'),"W1 main card shows elapsed days past the original 41");

// Functional regression for carried totals, standalone headings, signed input, and triple-tap edit gate.
const historyContext={state:{historyLimit:60},Number,Math,Object,fmt:sandbox.fmt,esc:x=>String(x),
 datedProgress:()=>[{day,entry:todayEntry,count:587,goal:4000,remaining:4413,previousDue:1000,previousCredit:0}],
 readingPace:()=>10000,readingSources:entry=>({tasbih:entry.tasbihCount,manual:entry.manualCount}),
 durationText:()=> "00:00:00.0",hasContinuation:()=>false,displayRecordDate:()=>day,heroIcon:()=>""};
vm.createContext(historyContext);
vm.runInContext(historySource,historyContext);
const hRecord={kind:"daily",startDate:day,total:587,dailyLedger:{[day]:todayEntry}};
let hMarkup=historyContext.wazifaHistoryMarkup(hRecord);
assert(hMarkup.includes(">5,000</strong>"),"4000 today + 1000 previous = one goal 5000");
assert.equal((hMarkup.match(/class="wz-ledger-label"/g)||[]).length,5,"five captions are outside of boxes");
assert.equal((hMarkup.match(/class="wz-ledger-item /g)||[]).length,4,"four values plus the change button");
assert.equal((hMarkup.match(/class="wz-ledger-edit-button"/g)||[]).length,0,"edit button has compound class, not a duplicate"); 
assert.equal((hMarkup.match(/data-wazifa-action="history-day"/g)||[]).length,1,"only change button is editable");
assert(!hMarkup.includes('role="button"'),"tapping the row cannot open correction");
historyContext.datedProgress=()=>[{day,entry:todayEntry,count:587,goal:4000,remaining:1913,previousDue:0,previousCredit:1500}];
hMarkup=historyContext.wazifaHistoryMarkup(hRecord);
assert(hMarkup.includes(">2,500</strong>"),"4000 today - 1500 previous excess = goal 2500");

const modalStart=src.indexOf("function historyEditMarkup(record,day){"),modalEnd=src.indexOf("function wazifaHistoryMarkup(record){");
const modalContext={fmt:sandbox.fmt,esc:x=>String(x),displayRecordDate:()=>day,hasContinuation:()=>false};
vm.createContext(modalContext);vm.runInContext(src.slice(modalStart,modalEnd),modalContext);
const mMarkup=modalContext.historyEditMarkup(hRecord,day);
assert(!mMarkup.includes('wz-edit-signs')&&!mMarkup.includes('name="operation"'),"no plus/minus tabs or hidden operation");
assert(mMarkup.includes('name="amount"')&&mMarkup.includes('pattern="[+-]?[0-9]+"'),"one field accepts +/- input");
assert(src.includes('raw.startsWith("-")?"remove":"add"'),"unsuffixed positive numbers add by default");

const tapStart=src.indexOf("function advanceHistoryEditTap(tracker,day,now){"),tapEnd=src.indexOf("const historyEditTap=",tapStart);
const tapContext={};vm.createContext(tapContext);vm.runInContext(src.slice(tapStart,tapEnd),tapContext);
const tracker={day:"",count:0,last:0};
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,1000),false);
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,1200),false);
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,1400),true,"third tap opens edit");
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,1500),false,"gate resets after opening");
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,4201),false,"timeout restarts the count");
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,4400),false);
assert.equal(tapContext.advanceHistoryEditTap(tracker,day,4600),true);
assert(css.includes('.wz-daily-toolbar .wz-reader-feedback')&&css.includes('width:100%'),"feedback fits same row as reduced due panel");
console.log("Wazifa history cards, carried goal and triple-tap editing regression checks passed");
