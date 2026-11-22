const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const docs=new Map(), accounts=new Map(), revoked=[];
const owner="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const snapshot=(path)=>({exists:docs.has(path),id:path.split("/").pop(),get:k=>docs.get(path)?.[k]});
const ref=path=>({path,get:async()=>snapshot(path)});
function collection(path){
  return {doc:id=>ref(path+"/"+id),where:(field,op,value)=>({limit:()=>({get:async()=>({
    docs:[...docs.keys()].filter(k=>k.startsWith(path+"/")&&docs.get(k)[field]===value).map(snapshot)
  })})})};
}
function writes(){
  return {get:r=>r.get(),create(r,v){assert(!docs.has(r.path));docs.set(r.path,v)},
    update(r,v){assert(docs.has(r.path));docs.set(r.path,{...docs.get(r.path),...v})},
    set(r,v,opt){docs.set(r.path,opt?.merge?{...docs.get(r.path),...v}:v)},delete:r=>docs.delete(r.path),commit:async()=>{}};
}
const db={doc:ref,collection,runTransaction:fn=>fn(writes()),batch:writes};
const auth={createUser:async v=>{
  if(accounts.has(v.email))throw Object.assign(Error(),{code:"auth/email-already-exists"});
  const user={...v,uid:"u"+accounts.size};accounts.set(v.email,user);return user;
},updateUser:async(uid,v)=>Object.assign([...accounts.values()].find(x=>x.uid===uid),v),
revokeRefreshTokens:async uid=>revoked.push(uid)};
const apis={};
const modules={"node:crypto":crypto,"firebase-functions/v2/https":{onCall:(o,f)=>f,HttpsError:class extends Error{}},
"firebase-admin/app":{initializeApp(){}}, "firebase-admin/firestore":{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>({toMillis:()=>Date.now()})}},
"firebase-admin/auth":{getAuth:()=>auth}};
vm.runInNewContext(fs.readFileSync("functions/index.js","utf8"),{exports:apis,require:k=>modules[k],process:{env:{GCLOUD_PROJECT:"demo"}},console});
(async()=>{
  docs.set("system/membership",{ownerUid:owner,lastNumber:1});docs.set("members/"+owner,{role:"owner",username:"sherazanjum"});
  const make=async(name,code)=>{
    docs.set("invitations/"+code,{byUid:owner,gender:"any"});
    return apis.registerMember({data:{name,mobile:"+92 300 1234567",gender:"male",password:"sample-pass",inviteCode:code,pledgeAccepted:true}});
  };
  assert.equal((await make("Sheraz","abcdef")).username,"sheraz");
  assert.equal((await make("Sheraz","abcdeg")).username,"sheraz2");
  assert.equal((await make("Ali Raza","abcdeh")).username,"aliraza");
  assert.equal((await make("علی رضا","abcdei")).username,"علیرضا");
  assert.equal((await make("Sheraz Anjum","abcdej")).username,"sherazanjum2");
  assert.equal(docs.get("members/u0").mobile,undefined);
  const ask=mobile=>apis.requestMemberRecovery({data:{identity:"sheraz",mobile}});
  await ask("+923009999999");assert(!docs.has("memberRecovery/u0"));
  await ask("+923001234567");assert(docs.get("memberRecovery/u0").pending);
  const desk=(uid,data)=>apis.ownerRecoveryDesk({auth:{uid,token:{auth_time:Math.floor(Date.now()/1000)}},data});
  await assert.rejects(desk("u0",{action:"list"}));
  assert.equal((await desk(owner,{action:"list"})).requests.length,1);
  assert.equal((await desk(owner,{action:"find",identity:"DI-2"})).uid,"u0");
  await desk(owner,{action:"reset",identity:"DI-2",uid:"u0",password:"new-sample-pass"});
  assert.equal(accounts.get("sheraz@demo.firebaseapp.com").password,"new-sample-pass");
  assert(!docs.get("memberRecovery/u0").pending);assert.deepEqual(revoked,["u0"]);
  console.log("Mobile registration and owner-assisted recovery cases passed (mock services).");
})().catch(e=>{console.error(e);process.exitCode=1});
