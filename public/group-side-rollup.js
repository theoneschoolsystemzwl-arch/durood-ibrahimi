// Read-only aggregation. Never estimate unknown historical dates or change stored data.
const validDay=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+"T00:00:00Z"))&&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
export function rollupSideGroup(records,today){
 if(!validDay(today)||records.some(r=>r.groupDays===null||r.groupSummary===null))return null;
 const days={};let total=0,undated=0;
 for(const r of records){
   const own={...r.groupDays},summary=r.groupSummary;
   const savedTotal=summary.total??0;
   if(!validCount(savedTotal))return null;
   if(summary.day&&!(summary.day in own)&&validDay(summary.day)&&validCount(summary.today))own[summary.day]=summary.today;
   let dated=0;
   for(const [day,count] of Object.entries(own)){
     if(!validDay(day)||day>today||!validCount(count))return null;
     if(r.meta?.joined&&day<r.meta.joined&&count>0)return null;
     dated+=count;days[day]=(days[day]||0)+count;
   }
   // Independent snapshots can arrive out of order. Do not publish impossible totals.
   if(dated>savedTotal)return null;
   if(summary.day&&summary.day in own&&own[summary.day]!==summary.today)return null;
   total+=savedTotal;undated+=savedTotal-dated;
 }
 if(!validCount(total)||!validCount(undated))return null;
 return {total,day:today,today:days[today]||0,days,undated};
}
