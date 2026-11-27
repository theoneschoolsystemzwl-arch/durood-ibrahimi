// Use the exact existing dashboard target calculations, not a parallel accounting formula.
import fs from "node:fs";
import vm from "node:vm";
const classic=fs.readFileSync("public/classic-app.html","utf8");
const input=JSON.parse(fs.readFileSync(0,"utf8"));
const day=d=>new Date((d?.getTime?.()??Date.now())+18000000).toISOString().slice(0,10);
const ctx=vm.createContext({window:{},dashboardGroupSettings:input.settings,globalDateKey:()=>day(),Date,Number,Math,Object,Array,Intl});
vm.runInContext(fs.readFileSync("public/hijri-session.js","utf8"),ctx);
vm.runInContext("window.duroodHijri=globalThis.duroodHijri",ctx);
function section(a,b){const i=classic.indexOf(a),j=classic.indexOf(b,i);if(i<0||j<i)throw Error("Missing shared accounting source");return classic.slice(i,j);}
vm.runInContext(section("function latestReaderGoal(","window.duroodMemberGroupTargets="),ctx);
vm.runInContext(classic.match(/const dashboardCountStart="[^"]+";/)[0]+section("function runningDashboardTargets(","function dashboardPeriodCount("),ctx);
vm.runInContext("const combinedValid=n=>Number.isSafeInteger(n)&&n>=0;"+section("function combinedSideTargets(","const combinedTargetKeys="),ctx);
const calculate=vm.runInContext("combinedSideTargets",ctx);
const grouped={male:[],female:[]};
for(const r of input.rows){
 const valid=[r.createdAt,r.registrationDate,r.joined,r.pledgeAcceptedAt].map(v=>typeof v==="string"?new Date(v):null).find(v=>v&&Number.isFinite(v.getTime())&&v.getTime()>0&&v.getTime()<=Date.now());
 const changed=typeof r.updatedAt==="string"?new Date(r.updatedAt):null;
 const inactive=r.disabled===true||r.deleted===true;
 const gender=r.role==="owner"?"male":r.gender==="female"?"female":"male";
 grouped[gender].push({daily:r.daily,joined:valid?day(valid):null,active:!inactive,inactiveDay:inactive&&changed&&Number.isFinite(changed.getTime())?day(changed):null});
}
const today=day();
process.stdout.write(JSON.stringify({day:today,male:calculate(grouped.male,today),female:calculate(grouped.female,today)}));
