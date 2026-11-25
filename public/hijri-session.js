// Pakistan accounting uses civil dates at PKT midnight. Hijri dates are estimates
// until the owner selects the local moon-sighting date of 12 Rabi al-Awwal.
// Existing annualStartDate / annualEndDate fields are retained, not new rules.
(function(root){
 const MS=86400000,EPOCH=Date.UTC(622,6,19)/MS;
 const months=["محرم","صفر","ربیع الاول","ربیع الثانی","جمادی الاول","جمادی الثانی","رجب","شعبان","رمضان","شوال","ذوالقعدہ","ذوالحجہ"];
 const en=["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Ula","Jumada al-Thani","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qadah","Dhu al-Hijjah"];
 function key(k){return new Date(k*MS).toISOString().slice(0,10);}
 function index(s){if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const k=Date.parse(s+"T00:00:00Z")/MS;return Number.isFinite(k)&&key(k)===s?k:NaN;}
 function lunar(y,m,d){return EPOCH+354*(y-1)+Math.floor((3+11*y)/30)+Math.ceil(29.5*(m-1))+d-1;}
 function parts(k){let y=Math.floor((30*(k-EPOCH)+10646)/10631);while(k<lunar(y,1,1))y--;while(k>=lunar(y+1,1,1))y++;let m=1;while(m<12&&k>=lunar(y,m+1,1))m++;return {y,m,d:k-lunar(y,m,1)+1};}
 function anchor(s){const k=index(s);if(!Number.isFinite(k))return null;const y=parts(k).y;const expected=lunar(y,3,12);return Math.abs(k-expected)<=3?{k,y,offset:k-expected}:null;}
 function format(s,cfg,english=false){const k=index(s);if(!Number.isFinite(k))return "—";const a=anchor(cfg?.annualEndDate);
 // Only use the owner's offset around the selected Rabi al-Awwal; it
 // cannot establish exact moon sightings for every other month.
 const p=parts(k-(a&&Math.abs(k-a.k)<=15?a.offset:0));
 const confirmed=!!a&&(k===a.k||k===a.k+1);
 return p.d+" "+(english?en:months)[p.m-1]+" "+p.y+(english?" AH":" ہجری")+(confirmed?"":english?" (est.)":" (تخمینی)");
 }
 function period(cfg,today){
 if(!cfg)return null;
 let start=index(cfg.annualStartDate);if(!Number.isFinite(start))start=index(cfg.startDate);
 const day=index(today);if(!Number.isFinite(start)||!Number.isFinite(day))return null;
 let year=parts(start).y;let end=lunar(year,3,12);if(end<start)end=lunar(++year,3,12);
 const a=anchor(cfg.annualEndDate);
 let confirmed=!!a&&a.k>=start&&a.k-start<=358;
 if(confirmed){end=a.k;year=a.y;}
 // In the initial partial session, count already-saved readings from the
 // same Rabi-to-Rabi cycle even if the group settings were created later.
 // A start near 13 Rabi is a real rollover boundary and must remain exact.
 const cycleStart=lunar(year-1,3,12)+1;
 let countStart=start>cycleStart+3?cycleStart:start;
 while(end<day){start=end+1;countStart=start;end=lunar(++year,3,12);confirmed=false;}
 return {start:key(start),countStart:key(countStart),end:key(end),next:key(end+1),confirmed,hijriYear:year};
 }
 function validEnd(s,p){const a=anchor(s);return !!a&&!!p&&a.y===p.hijriYear&&s>=p.start;}
 function nextDay(s){const k=index(s);return Number.isFinite(k)?key(k+1):"";}
 root.duroodHijri={format,period,validEnd,nextDay};
})(globalThis);
