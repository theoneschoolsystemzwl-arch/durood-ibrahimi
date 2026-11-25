// Display-only serials. The original memberNumber, serial and UID are immutable.
export function sideOf(m){return m?.role==="owner"?"male":m?.gender==="female"?"female":"male";}
export function sideSerialDirectory(rows,side){
 const unique=new Map(rows.filter(m=>m.uid&&sideOf(m)===side&&Number.isSafeInteger(Number(m.memberNumber))&&Number(m.memberNumber)>0).map(m=>[m.uid,m]));
 const ordered=[...unique.values()].sort((a,b)=>Number(a.memberNumber)-Number(b.memberNumber));
 const result=new Map(),used=new Set();
 for(const [i,m] of ordered.entries()){
   const n=side==="female"?Number(m.sideNumber??i+1):i+1;
   if(!Number.isSafeInteger(n)||n<1||used.has(n))throw Error("Duplicate or invalid side serial; reconciliation required");
   used.add(n);result.set(m.uid,{number:n,label:(side==="female"?"F-":"M-")+n,member:m});
 }
 return result;
}
export function parseSideSerial(value){
 const t=String(value||"").trim().toUpperCase().replace(/\s+/g,"");
 const m=/^M-?([1-9]\d{0,8})$/.exec(t),f=/^[FD]-?([1-9]\d{0,8})$/.exec(t),d=/^DI-([1-9]\d{0,8})$/.exec(t);
 return m?{type:"male",number:Number(m[1])}:f?{type:"female",number:Number(f[1])}:d?{type:"global",number:Number(d[1])}:null;
}
