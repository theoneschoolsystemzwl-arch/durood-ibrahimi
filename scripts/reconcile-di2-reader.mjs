// Owner-authorized, one-time reconciliation for DI-2, 2026-11-24.
// Do not change totals, member identity, pictures, or unrelated dates.
const project="durood-e-ibrahimi-global-c74e0",day="2026-11-24",amount=100;
const root="https://firestore.googleapis.com/v1/projects/"+project+"/databases/(default)/documents";
const token=process.env.ACCESS_TOKEN;
if(!token)throw Error("Missing existing project deployment authorization");
const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
const val=(d,k)=>d?.fields?.[k];
const str=(d,k)=>val(d,k)?.stringValue||"";
const num=(d,k)=>Number(val(d,k)?.integerValue||0);
const bool=(d,k)=>val(d,k)?.booleanValue===true;
const uidOf=d=>decodeURIComponent(d.name.split("/").at(-1));
const integer=n=>({integerValue:String(n)});
const string=s=>({stringValue:s});
const stamp=()=>({timestampValue:new Date().toISOString()});
async function api(suffix,{method="GET",body,missing=false}={}){
 const r=await fetch(root+suffix,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 if(missing&&r.status===404)return null;
 if(!r.ok)throw Error("Firestore "+method+" HTTP "+r.status+" ("+(r.status===403?"IAM permission denied":"request failed")+")");
 return r.json();
}
const get=(path,tx)=>api("/"+path+(tx?"?transaction="+encodeURIComponent(tx):""),{missing:true});
async function list(path,tx){
 let page="",docs=[];
 do{
  const p=new URLSearchParams({pageSize:"200"});if(page)p.set("pageToken",page);if(tx)p.set("transaction",tx);
  const result=await api("/"+path+"?"+p);
  docs.push(...(result.documents||[]));page=result.nextPageToken||"";
  if(docs.length>20000)throw Error("Unexpectedly large collection; stopping safely");
 }while(page);
 return docs;
}
const male=d=>str(d,"gender")!=="female";
const nameMatches=d=>/wah+a?b|و[ھہه]اب/iu.test(str(d,"name").normalize("NFKC").replace(/[\u064b-\u065f\u0670\u0640\s-]/gu,""));
const dayPath="genderStats/male/days/"+day;
const marker=dayPath+"/legacyAttribution/DI-2-reader";
let transaction;
try{
 const members=await list("members");
 // Dashboard uses side-relative order, not global registration number.
 const men=members.filter(m=>male(m)&&num(m,"memberNumber")>0).sort((a,b)=>num(a,"memberNumber")-num(b,"memberNumber"));
 const target=men[1];
 if(!target||!nameMatches(target)||bool(target,"deleted")||str(target,"role")!=="member")throw Error("DI-2 identity did not match; no record changed");
 const uid=uidOf(target);
 const photo=await get("memberPhotos/"+uid);
 const image=str(photo,"image");
 console.log("DI-2 profile photo: "+(image.startsWith("data:image/")?"present in Firebase":photo?"document exists but image missing or invalid":"not saved in Firebase"));
 const start=await api(":beginTransaction",{method:"POST",body:{options:{readWrite:{}}}});
 transaction=start.transaction;
 const [dayDoc,readers,personal,done,prior,member]=await Promise.all([
  get(dayPath,transaction),list(dayPath+"/readers",transaction),get("memberCounts/"+uid,transaction),
  get(marker,transaction),get(dayPath+"/legacyAttribution/DI-2",transaction),get("members/"+uid,transaction)
 ]);
 if(!member||!nameMatches(member)||!male(member)||bool(member,"deleted")||str(member,"role")!=="member")throw Error("Identity changed during audit");
 const own=readers.find(d=>uidOf(d)===uid),manual=num(own,"manualTotal"),taps=num(own,"total");
 const total=num(dayDoc,"total"),listed=readers.reduce((n,d)=>n+num(d,"total")+num(d,"manualTotal"),0);
 console.log(JSON.stringify({date:day,dayTotal:total,listedTotal:listed,DI2Tasbih:taps,DI2Manual:manual,unattributed:total-listed,photoSaved:image.startsWith("data:image/")}));
 if(manual>=amount){console.log("DI-2 record already contains the 100 offline recitations. No write required.");}
 else {
  if(done||manual!==0||!dayDoc||!personal||num(personal,"total")<amount||total-listed<amount||!Number.isSafeInteger(taps)||taps<0)throw Error("Existing totals or repair marker do not support a safe attribution. No write.");
  if(prior&&str(prior,"uid")!==uid)throw Error("Prior marker refers to a different account. No write.");
  const name=str(member,"name");
  const readerName="projects/"+project+"/databases/(default)/documents/"+dayPath+"/readers/"+uid;
  const markerName="projects/"+project+"/databases/(default)/documents/"+marker;
  const writes=[
    {update:{name:markerName,fields:{uid:string(uid),name:string(name),amount:integer(amount),day:string(day),verifiedBy:string("authorized-deployment-reconciliation"),createdAt:stamp()}},currentDocument:{exists:false}},
    {update:{name:readerName,fields:{name:string(name),total:integer(taps),manualTotal:integer(amount)}},updateMask:{fieldPaths:["name","total","manualTotal"]},currentDocument:own?{updateTime:own.updateTime}:{exists:false}}
  ];
  await api(":commit",{method:"POST",body:{transaction,writes}});transaction=null;
  const [verified,sameDay]=await Promise.all([get(dayPath+"/readers/"+uid),get(dayPath)]);
  if(num(verified,"manualTotal")!==amount||num(verified,"total")!==taps)throw Error("Post-write verification did not match.");
  console.log(JSON.stringify({repair:"verified",DI2Tasbih:taps,DI2Manual:amount,DI2Total:taps+amount,dayTotalAfter:num(sameDay,"total"),aggregateWrites:0}));
 }
}finally{if(transaction)await api(":rollback",{method:"POST",body:{transaction}}).catch(()=>{});}
