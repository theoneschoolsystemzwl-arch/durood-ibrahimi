// READ ONLY: Firestore REST GET requests, no writes or repair.
import {sideSerialDirectory,sideOf} from "../public/member-side-serial.js";
const project="durood-e-ibrahimi-global-c74e0";
const token=process.env.ACCESS_TOKEN;
if(!token)throw Error("Read-only audit credential is required");
const root="https://firestore.googleapis.com/v1/projects/"+project+"/databases/(default)/documents/";
const headers={Authorization:"Bearer "+token};
const dayKey=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const today=dayKey(new Date()),month=today.slice(0,7)+"-01",year=today.slice(0,4)+"-01-01";
const monday=new Date(today+"T00:00:00Z");monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
const week=monday.toISOString().slice(0,10);
function value(x){if(!x)return null;if("integerValue" in x)return Number(x.integerValue);if("stringValue" in x)return x.stringValue;if("booleanValue" in x)return x.booleanValue;if("timestampValue" in x)return x.timestampValue;return null;}
function decode(d){return {id:d.name.split("/").at(-1),...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,value(v)]))};}
async function request(url){const r=await fetch(url,{headers});if(r.status===404)return null;if(!r.ok)throw Error("Firestore read-only request denied or failed: HTTP "+r.status+"; no data changed");return r.json();}
async function get(path){const d=await request(root+path);return d?decode(d):null;}
async function list(path){let rows=[],page="";do{const u=new URL(root+path);u.searchParams.set("pageSize","100");if(page)u.searchParams.set("pageToken",page);const d=await request(u);if(!d)break;rows.push(...(d.documents||[]).map(decode));page=d.nextPageToken||"";if(rows.length>10000)throw Error("Audit size safety limit exceeded");}while(page);return rows;}
function number(n){if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid saved count");return n;}
const sum=a=>a.reduce((s,n)=>s+number(n),0);
function periods(days,session){const pick=(from,to)=>sum(Object.entries(days).filter(([d])=>d>=from&&d<=to).map(([,n])=>n));return {today:pick(today,today),weekly:pick(week,today),monthly:pick(month,today),calendarYear:pick(year,today),session:session?.start&&session?.end?pick(session.start,session.end<today?session.end:today):null,datedTotal:sum(Object.values(days))};}
function counts(rows,field,dateField){const m={};for(const r of rows){const d=r[dateField]||r.id;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d>today)throw Error("Invalid saved date");if(d in m)throw Error("Duplicate dated entry");m[d]=number(r[field]);}return m;}
function merge(target,source){for(const [d,n] of Object.entries(source))target[d]=(target[d]||0)+n;}
function legacyDay(days,summary){if(summary?.day&&!(summary.day in days)&&summary.today>0)days[summary.day]=number(summary.today);}
try{
 const members=(await list("members")).map(m=>({...m,uid:m.id}));
 const cfg=await get("wazaifSettings/group"),session={start:cfg?.annualStartDate||cfg?.startDate||null,end:cfg?.annualEndDate||null};
 const shared=await get("wazaifGroupStats/main"),sharedDays=counts(await list("wazaifGroupStats/main/days"),"count","date");legacyDay(sharedDays,shared);
 const combinedGroup={},combinedTotal=[];
 let discrepancyCount=0;
 const report=(x)=>console.log(JSON.stringify(x));
 report({today,week,month,year,session});
 for(const side of ["male","female"]){
   const directory=sideSerialDirectory(members,side),sideDoc=await get("genderStats/"+side);
   const sideDays=counts(await list("genderStats/"+side+"/days"),"total","day");
   const groupSum={},readerSum={},perMemberReader=new Map(),memberTotals=[],groupTotals=[];
   for(const uid of directory.keys())perMemberReader.set(uid,{});
   for(const [day,expected] of Object.entries(sideDays)){
     const readers=await list("genderStats/"+side+"/days/"+day+"/readers");
     let read=0;for(const r of readers){const n=number(r.total??0)+number(r.manualTotal??0);read+=n;if(!perMemberReader.has(r.id)){report({side,day,error:"reader missing from side directory",count:n});discrepancyCount++;continue;}perMemberReader.get(r.id)[day]=n;}
     readerSum[day]=read;if(read!==expected){report({side,day,error:"reader total mismatch",expected,actual:read});discrepancyCount++;}
   }
   for(const [uid,{member,label}] of directory){
     const path="wazaifGroupStats/main/members/"+encodeURIComponent(uid);
     const [own,group,rawDays,goalRows]=await Promise.all([get("memberCounts/"+encodeURIComponent(uid)),get(path),list(path+"/days"),list("memberPrivate/"+encodeURIComponent(uid)+"/duroodGoals")]);
     const dated=counts(rawDays,"count","date");legacyDay(dated,group);merge(groupSum,dated);
     const regular=perMemberReader.get(uid),joined=member.createdAt?dayKey(new Date(member.createdAt)):null;
     const ownTotal=number(own?.total??0),groupTotal=number(group?.total??0);
     memberTotals.push(ownTotal);groupTotals.push(groupTotal);
     const p=periods(regular,session),g=periods(dated,session),goal=goalRows.filter(x=>x.date<=today).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.goal??null;
     const issues=[];if(ownTotal!==p.datedTotal)issues.push("undated or unattributed Durood difference");if(groupTotal!==g.datedTotal)issues.push("undated group difference");if(!joined)issues.push("membership date missing");if(joined&&[...Object.keys(regular),...Object.keys(dated)].some(d=>d<joined))issues.push("reading before membership");
     discrepancyCount+=issues.length;
     report({side,serial:label,active:!member.deleted&&!member.disabled,joined,goal,durood:{total:ownTotal,...p,undatedDifference:ownTotal-p.datedTotal},group:{total:groupTotal,...g,undatedDifference:groupTotal-g.datedTotal},issues});
   }
   const expected=number(sideDoc?.totalRecitations??0),actual=sum(memberTotals),groupTotal=sum(groupTotals);
   if(expected!==actual){report({side,error:"member totals differ from side aggregate",expected,actual});discrepancyCount++;}
   report({side,memberCount:directory.size,durood:{total:expected,memberSum:actual,...periods(sideDays,session)},group:{total:groupTotal,...periods(groupSum,session)}});
   merge(combinedGroup,groupSum);combinedTotal.push(groupTotal);
 }
 const stored=number(shared?.total??0),derived=sum(combinedTotal);
 if(stored!==derived){report({error:"shared group aggregate mismatch",stored,derived});discrepancyCount++;}
 for(const d of new Set([...Object.keys(sharedDays),...Object.keys(combinedGroup)])){if((sharedDays[d]||0)!==(combinedGroup[d]||0)){report({day:d,error:"shared group dated mismatch",stored:sharedDays[d]||0,derived:combinedGroup[d]||0});discrepancyCount++;}}
 report({complete:true,discrepancyCount,sharedGroupTotal:stored,derivedGroupTotal:derived,writeOperations:0});if(discrepancyCount)process.exitCode=2;
}catch(error){console.error(error.message);process.exitCode=1;}
