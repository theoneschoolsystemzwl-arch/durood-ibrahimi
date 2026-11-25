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
assert.equal(sandbox.compactTasbihClock(0),"0.0");
assert.equal(sandbox.compactTasbihClock(59000),"59.0");
assert.equal(sandbox.compactTasbihClock(65000),"1:05.0");
assert.equal(sandbox.compactTasbihClock(3661000),"1:01:01.0");
assert.equal(sandbox.compactTasbihClock(6150),"6.1");
assert.equal(sandbox.compactTasbihClock(6259),"6.2");
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
assert(src.includes('minimumFractionDigits:1,maximumFractionDigits:1'),"Tasbih pace uses one decimal place");
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
assert(reader.includes('class="wz-daily-toolbar"')&&reader.includes('class="wz-reader-feedback"'),"today/due and sound share a row");
assert(reader.includes('data-wazifa-action="vibration-up"')&&reader.includes('data-wazifa-action="vibration-down"')&&!reader.includes('data-wazifa-action="test-vibration"'),"new strength controls without test button");
assert(reader.includes('data-wazifa-action="sound-up"')&&reader.includes('data-wazifa-action="sound-down"'));
assert(!reader.includes('id="wz-hero-today-read"')&&!reader.includes('class="wz-percent-today"'),"remove redundant percentage and today tiles");
assert(!reader.includes("💾")&&!reader.includes("📳")&&!reader.includes("🔊"),"no Save / feedback icons");
assert(src.includes('wz-today-due'),"green today summary is visible under lifetime totals");
assert(css.includes('background:linear-gradient(125deg,#075943,#004b38)!important'),"all five dated cells use green background, not black/red/yellow");
assert(css.includes('.wz-due-number.is-pending')&&css.includes('animation:wz-due-flash'),"only overdue number flashes red");
assert(src.includes('durood-wz-sound-level')&&!src.includes('durood-wz-vibration-level'),"sound level persists; vibration level removed");
assert(src.includes('gain.gain.setValueAtTime(0.01+state.soundLevel*0.014'),"sound gain responds to selected level");
assert(src.includes('durood-tap-motor-v5-strength')&&src.includes('api.pulseTasbihMotor(state.motorStrength)'),"fresh native motor and settings");
assert(!src.includes('bridge.vibrateTap')&&!src.includes('bridge.hapticClick'),"do not restore the previous motor engine");
{
 const a=src.indexOf("function normalizeMotorStrength("),b=src.indexOf("function updateTapMotorControls()",a);
 assert(a>=0&&b>a);
 let levels=[],fallbacks=0;
 const win={DuroodAndroid:{pulseTasbihMotor:n=>{levels.push(n);return true;}},navigator:{vibrate:()=>{fallbacks++;return true;}}};win.parent=win;
 const c={window:win,state:{motorEnabled:true,motorStrength:10}};
 vm.createContext(c);vm.runInContext(src.slice(a,b),c);
 assert.equal(c.normalizeMotorStrength(50),10);
 assert.equal(c.normalizeMotorStrength(-1),0);
 assert.equal(c.requestTapMotor(),"native");assert.deepEqual(levels,[10]);assert.equal(fallbacks,0);
 c.state.motorEnabled=false;assert.equal(c.requestTapMotor(),"off");assert.deepEqual(levels,[10]);
 c.state.motorEnabled=true;c.state.motorStrength=0;assert.equal(c.requestTapMotor(),"off");
 c.state.motorStrength=4;assert.equal(c.requestTapMotor(),"native");assert.deepEqual(levels,[10,4]);
 delete win.DuroodAndroid;assert.equal(c.requestTapMotor(),"web");assert.equal(fallbacks,1);
}
for(const file of ["android-online/src/app/duroodibrahimi/online/MainActivity.java","android-live/app/src/main/java/com/theoneschoolsystemzw/duroodlive/MainActivity.java"]){
 const native=fs.readFileSync(file,"utf8");
 assert(native.includes("pulseTasbihMotor(int strength)")&&native.includes("createWaveform(timings,amplitudes,-1)"),"new non-repeating waveform on both Android versions");
}
 // Motor request must happen before audio and before rendering the accepted count.
 {
  const a=src.indexOf("function tap(){"),b=src.indexOf("async function drain",a);
  const tapSource=src.slice(a,b);
  assert(tapSource.indexOf("state.tapQueue++")<tapSource.indexOf("lastTapMotorOutcome=requestTapMotor()"));
  assert(tapSource.indexOf("lastTapMotorOutcome=requestTapMotor()")<tapSource.indexOf("playWazifaFeedback()"));
  assert(tapSource.indexOf("lastTapMotorOutcome=requestTapMotor()")<tapSource.indexOf("persistDraft()"));
  assert(css.includes("#wazaif-root #wz-dial{touch-action:pan-y"),"dial permits vertical scroll");
 }
 // Confirm short stationary taps count once; scrolling and canceled gestures do not count.
 const feedbackStart=src.indexOf("let longHoldTimer=null;"),feedbackEnd=src.indexOf('document.addEventListener("visibilitychange"',feedbackStart);
 assert(feedbackStart>=0&&feedbackEnd>feedbackStart);
 {
  const handlers={};let counts=0,pulses=0;
  const button={isConnected:true,disabled:false,contains:node=>node===button,dataset:{wazifaAction:"tap"}};
  const ctx={
   document:{addEventListener:(name,fn)=>{handlers[name]=fn;},elementFromPoint:()=>button},
   state:{motorEnabled:true},
   tap:()=>{counts++;pulses++;return true;},
   setTimeout:()=>1,clearTimeout:()=>{}
  };
  vm.createContext(ctx);vm.runInContext(src.slice(feedbackStart,feedbackEnd),ctx);
  const event=(x=100,y=100)=>({target:{closest:()=>button},clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,pointerType:"touch",detail:1});
  handlers.pointerdown(event());assert.equal(counts,0);
  handlers.pointerup(event());assert.equal(counts,1);assert.equal(pulses,1);
  assert.equal(ctx.consumeFeedbackClick(event(),"tap"),true);
  handlers.pointerdown(event());handlers.pointermove(event(100,125));handlers.pointerup(event());assert.equal(counts,1,"swipe must not count");
  assert.equal(ctx.consumeFeedbackClick(event(),"tap"),true);
  handlers.pointerdown(event());handlers.pointercancel(event());handlers.pointerup(event());assert.equal(counts,1,"cancelled touch must not count");
  handlers.pointerdown(event());handlers.scroll();handlers.pointerup(event());assert.equal(counts,1,"scroll must not count");
  handlers.pointerdown(event());handlers.pointerup(event(102,101));assert.equal(counts,2);assert.equal(pulses,2);
  assert.equal(ctx.consumeFeedbackClick(event(),"tap"),true);
  assert.equal(ctx.consumeFeedbackClick({detail:0},"tap"),false);
 }

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
// Approved dashboard controls: one wide, unlabelled daily bar and five live
// date-dependent counters. Date stays only in the lower speed/Save row.
const selectedMetrics=src.slice(src.indexOf("function selectedDayFigures("),src.indexOf("function displayRecordDate(key)"));
assert(selectedMetrics.includes("selectedDayFigures(group,w,record,day)"));
assert.equal((selectedMetrics.match(/class="wz-today-due-cell"/g)||[]).length,5,"exactly five live metric boxes");
assert(selectedMetrics.includes('id="wz-five-goal"')&&selectedMetrics.includes('id="wz-five-pending"'));
assert(!selectedMetrics.includes("wz-selected-date"),"do not duplicate the date in the five metrics");
assert(reader.includes('data-wazifa-action="day-prev"')&&reader.includes('data-wazifa-action="day-next"'));
assert(reader.includes('data-wazifa-action="toggle-fullscreen"'));
assert(reader.includes('id="wz-daily-progress-bar"')&&reader.includes('id="wz-daily-progress-label"'));
assert(!reader.includes(">روزانہ کی پیش رفت<"),"the daily progress bar must not have a visible Urdu heading");
assert(reader.includes('progress.toFixed(2)')&&reader.includes('id="wz-hero-progress-label"'),"total percentage has two decimals");
assert(src.includes("Math.min(10,Math.max(0,state[key]"),"sound scales to 10");
assert(css.includes("wz-daily-progress progress")&&css.includes("flex:1"),"unlabelled daily bar stretches to fill available space");
const dayFiguresContext={...sandbox,datedProgress:()=>[{day,goal:4000,count:3000,previousDue:2000,previousCredit:0}]};
vm.createContext(dayFiguresContext);
vm.runInContext(selectedMetrics,dayFiguresContext);
const selectedFigures=dayFiguresContext.selectedDayFigures(false,{kind:"daily",goal:4000},record,day);
assert.equal(selectedFigures.goal,6000,"selected date target includes carried debt");
assert.equal(selectedFigures.read,3000);
assert.equal(selectedFigures.pending,3000);
// Unified neon counting card and 100-tap ring cycle (UI only).
assert(reader.includes('class="wz-session-card"')&&reader.includes('</button></section>'),
  "all counter summary lines and round dial share one bordered card");
assert(reader.indexOf('class="wz-session-card"')<reader.indexOf('class="wz-hero-six"'),
  "unified card begins before the six target/date tiles");
assert(reader.indexOf('</button></section>')<reader.indexOf('class="wz-record-title"'),
  "daily history sits below the unified card");
assert(reader.includes("(state.tapQueue>0?(state.tapQueue%100||100):0)"),
  "circular dial uses the session's 100-tap cycle");
assert(src.includes('const ringCycle=state.tapQueue>0?(state.tapQueue%100||100):0')&&
  src.includes('dial.style.setProperty("--wz-ring",ringCycle+"%")'),
  "refresh uses the same 100-tap cycle as initial render");
assert(src.includes('const cycle=state.tapQueue%100||100')&&
  src.includes('dial.style.setProperty("--wz-ring",cycle+"%")'),
  "successful taps update the circular progress immediately");
const ringProgress=count=>count>0?(count%100||100):0;
for(const [count,expected] of [[0,0],[1,1],[25,25],[99,99],[100,100],[101,1],[200,100],[201,1]]){
  assert.equal(ringProgress(count),expected,"100-tap progress at "+count);
}
assert(css.includes(".wz-hero-reader .wz-session-card{"),"unified bordered card is styled");
assert(css.includes("1.155rem,4.425vw,1.725rem"),"speed digits are 50% larger");
assert(css.includes(".wz-session-card #wz-five-pending")&&css.includes("#ff636e"),
  "the remaining daily count is red");
assert(css.includes(".wz-today-due-cell:nth-child(2) strong")&&css.includes("2.325rem"),
  "the selected day's total count has been enlarged");
// Three linked progress rows: overall recited, overall pending, and only
// the selected calendar day's own daily goal (never the carried balance).
assert(reader.includes('class="wz-progress-trio"'),"3 progress bars are grouped together");
for(const name of ["hero","remaining","daily"])
 assert(reader.includes('id="wz-'+name+'-progress-bar"'),"missing "+name+" progress bar");
assert.equal((reader.match(/id="wz-daily-progress-bar"/g)||[]).length,1,
  "daily progress bar is only shown once");
assert(reader.indexOf('class="wz-progress-trio"')<reader.indexOf('class="wz-daily-toolbar"'),
  "all three bars stay next to one another above the controls");
assert(reader.includes('(100-progress).toFixed(2)'),"remaining fraction complements completion");
assert(src.includes("const dailyTarget=Math.max(0,Number(group?memberGroupDailyGoal(w,selectedDay):targetForDay(w,selectedDay))||0)"),
  "daily bar uses the date-specific target, not carried backlog");
assert(src.includes('d.read*100/dailyTarget'),"daily percent uses actual day readings");
assert(src.includes('set("wz-daily-progress-detail",fmt(d.read)+" / "+fmt(dailyTarget))'),
  "daily bar shows both the day's recitations and target");
assert(reader.includes('class="wz-dial-ring-svg"')&&reader.includes('class="wz-dial-ring-fill"'),
  "show a browser-independent SVG progress ring on the dial");
assert(reader.includes('pathLength="100"')&&reader.includes('stroke-dasharray="100"'),
  "SVG path uses one percent per successful click");
assert(src.includes('ringCircle.setAttribute("stroke-dashoffset",String(100-cycle))'),
  "each tap moves the visible SVG circumference immediately");
const progressOffset=count=>100-(count>0?(count%100||100):0);
for(const [count,offset] of [[0,100],[1,99],[25,75],[99,1],[100,0],[101,99],[200,0]])
 assert.equal(progressOffset(count),offset,"visual ring offset at "+count+" taps");
assert(css.includes(".wz-progress-trio")&&css.includes(".wz-dial-ring-svg"),
  "progress trio and visible SVG ring have explicit mobile styles");
// Regression: the SVG ring must be anchored inside the dial button.
// Otherwise absolute positioning uses the entire session card as its
// containing block and draws a giant circle over the top counters.
assert(css.includes(".wz-hero-reader .wz-hero-dial:not(.is-floating){\n  position:relative;isolation:isolate;"),
  "the Tasbih ring must be positioned relative to the dial, not the card");
assert(css.includes(".wz-hero-reader .wz-hero-dial.is-floating{\n  position:fixed;isolation:isolate;"),
  "floating mode must retain fixed positioning");
const ringSelector=css.slice(css.lastIndexOf(".wz-hero-reader .wz-hero-dial .wz-dial-ring-svg{"),
  css.lastIndexOf(".wz-hero-reader .wz-hero-dial .wz-dial-ring-track{"));
assert(ringSelector.includes("position:absolute;inset:0")&&ringSelector.includes("overflow:hidden"),
  "SVG must be clipped to the actual dial");
assert(ringSelector.includes("max-width:100%;max-height:100%"),
  "the SVG must never exceed the circular button dimensions");
// Remaining percentage is still displayed, but its colored progress moves
// forward with completed work, rather than shrinking as the balance falls.
assert(reader.includes('id="wz-remaining-progress-bar" max="100" value="\'+progress+\'"'),
  "middle progress bar fills according to work completed");
assert(src.includes("if(remainingBar)remainingBar.value=percent;"),
  "live updates fill the remaining-row bar as work is completed");
assert(reader.includes("<small>مجموعی ہدف</small>"),
  "top bar shows a compact total-goal label");
assert(src.includes('function setWazifaImmersive(enabled)')&&
  src.includes('classList.toggle("wz-immersive-reader"'),
  "fullscreen has a working WebView CSS fallback");
assert(src.includes('window.DuroodAndroid.setImmersive(state.immersive)'),
  "new Android versions can hide system bars natively");
assert(src.includes('document.documentElement.requestFullscreen()')&&
  src.includes('document.exitFullscreen?.()'),
  "browsers with fullscreen support use the real fullscreen API");
assert(css.includes("body.wz-immersive-reader #wazaif-root")&&
  css.includes("position:fixed!important"),
  "reader focus view displays over existing bottom navigation");
console.log("Wazifa history cards, carried goal and triple-tap editing regression checks passed");
