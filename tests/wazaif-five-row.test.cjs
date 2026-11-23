const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("public/wazaif.js","utf8");
const css=fs.readFileSync("public/wazaif-rollover.css","utf8");
const start=src.indexOf("function readingPace(record"),end=src.indexOf("function displayRecordDate(key)");
assert(start>0&&end>start,"pure counting and timing helpers must be present");
const day="2026-11-23";
const state={draftDay:day,tapQueue:0,clockIntervals:0,tapGapTotalMs:0};
const sandbox={
 state,Number,Math,Object,esc:x=>String(x),
 fmt:x=>Math.max(0,Number(x)||0).toLocaleString("en"),
 readingDay:()=>day,datedProgress:()=>[],
 targetForDay:()=>4000,elapsedTime:()=>0,
 durationText:ms=>String(Math.floor(ms/1000))
};
vm.createContext(sandbox);
vm.runInContext(src.slice(start,end),sandbox);
const record={day,today:3000,dailyLedger:{
 [day]:{count:3000,tasbihCount:2000,manualCount:1000,durationMs:100000,intervals:10}
}};
sandbox.datedProgress=()=>[{count:3000,previousDue:0,previousCredit:0}];
let d=sandbox.dailyFigures(false,{kind:"daily",goal:4000,startDate:day},record);
assert.equal(d.goal,4000);assert.equal(d.tasbih,2000);
assert.equal(d.manual,1000);assert.equal(d.read,3000);assert.equal(d.pending,1000);
assert.equal((sandbox.fiveFigureMarkup(false,{goal:4000},record).match(/class="wz-five-cell /g)||[]).length,5);
sandbox.datedProgress=()=>[{count:4000,previousDue:0,previousCredit:0}];
record.today=4000;record.dailyLedger[day].count=4000;record.dailyLedger[day].tasbihCount=3000;
d=sandbox.dailyFigures(false,{goal:4000},record);
assert.equal(d.pending,0);
sandbox.datedProgress=()=>[{count:3000,previousDue:2000,previousCredit:0}];
record.today=3000;record.dailyLedger[day].count=3000;record.dailyLedger[day].tasbihCount=2000;
d=sandbox.dailyFigures(false,{goal:4000},record);
assert.equal(d.previous,2000);assert.equal(d.pending,3000);
assert(sandbox.fiveFigureMarkup(false,{goal:4000},record).includes("پچھلا +2,000"));
const time=sandbox.readingTimes({dailyLedger:{[day]:{durationMs:100000,intervals:10,manualCount:100}}});
assert.equal(time.tasbih,100000);assert.equal(time.manual,1000000);
assert.equal(time.total,1100000);assert.equal(sandbox.readingPace({dailyLedger:{[day]:{durationMs:100000,intervals:10}}}),10000);
assert(css.includes("grid-template-columns:repeat(5,minmax(0,1fr))"));
assert(src.includes("Math.floor(value%1000/100)")&&!src.includes('String(ms).padStart(3,"0")'));
assert(src.includes("const perMinute=seconds>0?pace(60/seconds)"));
assert(src.includes("const perHour=seconds>0?pace(3600/seconds)"));
assert(src.includes('durationMs:isToday?durationMs:0'));
console.log("Wazifa five-counter and measured/manual time regression checks passed");
