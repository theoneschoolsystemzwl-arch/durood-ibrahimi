// Offline, retry and simultaneous-device tests without live Firebase writes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("public/tasbih-durable-sync.js","utf8")
 .replace("export function createDurableTasbihSync","function createDurableTasbihSync");
const uid="owner-device-test",day="2026-11-23",prefix="wazifa-test-v4";
let serial=1;
function storage(){
 const values=new Map();
 return {
  get length(){return values.size;},
  key(i){return Array.from(values.keys())[i]??null;},
  getItem(k){return values.has(k)?values.get(k):null;},
  setItem(k,v){values.set(k,String(v));},
  removeItem(k){values.delete(k);}
 };
}
function client(store,send,locks=null){
 const navigator={onLine:true,...(locks?{locks}:{})};
 const timers=[],events={};
 const context=vm.createContext({
  localStorage:store,navigator,Date,Math,Number,JSON,Array,Uint8Array,
  crypto:{getRandomValues(bytes){const seed=serial++;for(let i=0;i<bytes.length;i++)bytes[i]=(seed*17+i*13)&255;return bytes;}},
  setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
  window:{addEventListener(name,fn){events[name]=fn;}},document:{hidden:false,addEventListener(name,fn){events[name]=fn;}}
 });
 vm.runInContext(source+"\nthis.createSync=createDurableTasbihSync;",context);
 const sync=context.createSync({prefix,getUid:()=>uid,send});
 sync.start(uid);
 return {sync,navigator,timers,events};
}
const tap={taskId:"WAZIFA00123",day,source:"tasbih",count:1,durationMs:0,intervals:1};
(async()=>{
 const receipts=new Set(),backend={total:0};
 const send=async op=>{
  assert.match(op.id,/^[a-f0-9]{32}$/);
  if(!receipts.has(op.id)){receipts.add(op.id);backend.total+=op.count;}
 };
 // Manual-save contract: no automatic request on ordinary taps or startup.
 const draftStore=storage(), draft=client(draftStore,send);
 assert(draft.sync.enqueue(tap));
 assert(draft.sync.enqueue({...tap,taskId:"_group_"}));
 draft.sync.schedule(0);draft.events.visibilitychange?.();
 assert.equal(draft.timers.length,0,"No automatic Firebase flush timers");
 assert.equal(backend.total,0,"No Firebase write before explicit Save");
 draft.sync.stop();
 const restored=client(draftStore,async()=>{});
 assert.equal(restored.sync.pending(),2);
 await restored.sync.flush(tap.taskId);
 assert.equal(restored.sync.pending(tap.taskId),0);
 assert.equal(restored.sync.pending("_group_"),1,"Personal Save must not submit group draft");
 await restored.sync.flush("_group_");
 assert.equal(restored.sync.pending(),0);
 // With a browser Web Lock, 100 taps share one locally durable batch.
 const held=new Set();
 const locks={request(name,opts,callback){
  if(typeof opts==="function"){callback=opts;opts={};}
  if(held.has(name))return Promise.resolve(callback(null));
  held.add(name);return Promise.resolve(callback({name})).finally(()=>held.delete(name));
 }};
 const batchedStore=storage(),sent=[];
 const batched=client(batchedStore,async op=>sent.push(op),locks);
 for(let i=0;i<100;i++)assert(batched.sync.enqueue(tap));
 assert.equal(batched.sync.pending(tap.taskId),100);
 assert.equal(sent.length,0,"100 taps do not call Firebase");
 await batched.sync.flush(tap.taskId);
 assert.equal(sent.length,1,"100 taps are submitted in one batch");
 assert.equal(sent[0].count,100);
 assert.equal(batched.sync.pending(),0,"acknowledgement removes the local count");
 assert.equal(batchedStore.length,0,"no acknowledged draft remains");
 for(let i=0;i<100;i++)assert(batched.sync.enqueue({...tap,taskId:"_group_"}));
 assert.equal(sent.length,1);
 await batched.sync.flush("_group_");
 assert.equal(sent.length,2);assert.equal(sent[1].count,100);
 assert.equal(batched.sync.pending(),0);
 for(let i=0;i<2505;i++)assert(batched.sync.enqueue({...tap,durationMs:3000}));
 assert.equal(batched.sync.pending(tap.taskId),2505,"No 100 or 1000 cap on the dial");
 assert.equal(sent.length,2,"More than two hours of taps remain local before Save");
 assert.equal(sent.length,2,"No automatic Firebase write even above 1000");
 await batched.sync.flush(tap.taskId);
 assert.deepEqual(sent.slice(2).map(op=>op.count),[1000,1000,505]);
 assert.equal(sent.slice(2).reduce((n,op)=>n+op.durationMs,0),7515000);
 assert.equal(batched.sync.pending(),0);
 batched.events.pagehide?.();
 // Same browser, two live tabs: each immutable entry survives the other's save.
 const shared=storage();
 const tabA=client(shared,send),tabB=client(shared,send);
 assert.equal(tabA.sync.enqueue(tap),true);
 assert.equal(tabB.sync.enqueue(tap),true);
 assert.equal(tabA.sync.pending(),2,"Both tabs' counts must remain in shared storage");
 tabA.navigator.onLine=false;
 await tabA.sync.flush();
 assert.equal(backend.total,0,"Offline taps must not be sent");
 assert.equal(tabA.sync.status().error,"offline");
 assert.equal(tabA.sync.pending(),2,"Offline save must retain every tap");
 tabA.navigator.onLine=true;
 await Promise.all([tabA.sync.flush(),tabB.sync.flush()]);
 assert.equal(backend.total,2,"Parallel tabs must never duplicate or overwrite");
 assert.equal(tabA.sync.pending(),0);
 assert.equal(tabB.sync.pending(),0);
 // An acknowledged but interrupted connection is retried with its original receipt ID.
 const crashStorage=storage();
 let dropAck=true;
 const broken=client(crashStorage,async op=>{
  await send(op);
  if(dropAck){dropAck=false;throw Error("ACK lost after server commit");}
 });
 assert(broken.sync.enqueue(tap));
 await broken.sync.flush();
 assert.equal(broken.sync.pending(),1);
 assert.match(broken.sync.status().error,/ACK lost/);
 assert.equal(backend.total,3);
 broken.sync.stop();
 const restarted=client(crashStorage,send);
 assert.equal(restarted.sync.pending(),1,"Pending count must survive refresh/log out");
 await restarted.sync.flush();
 assert.equal(backend.total,3,"Server receipt must prevent counting twice after lost ACK");
 assert.equal(restarted.sync.pending(),0);
 // Owner on two separate phones: independent offline storage merges into same server total.
 const phone=client(storage(),send),desktop=client(storage(),send);
 assert(phone.sync.enqueue(tap));
 assert(desktop.sync.enqueue(tap));
 await Promise.all([phone.sync.flush(),desktop.sync.flush()]);
 assert.equal(backend.total,5,"Two distinct devices both contribute");
 // Old per-account v3 journals migrate into immutable entries, including inflight ID.
 const legacyStorage=storage();
 legacyStorage.setItem("durood-device-id-v1","legacy-phone-unique-id");
 legacyStorage.setItem(prefix+"-"+uid,JSON.stringify({schema:3,pending:[
  {...tap,count:7,intervals:7}
 ],inflight:{...tap,count:3,intervals:3,id:"a".repeat(32)}}));
 const old=client(legacyStorage,send);
 assert.equal(old.sync.pending(),10,"Previous unsent counts must migrate");
 assert.equal(legacyStorage.getItem(prefix+"-"+uid),null,"Old journal removed only after migration");
 await old.sync.flush();
 assert.equal(backend.total,15);
 assert.equal(old.sync.pending(),0);
 const failedStorage=storage();
 failedStorage.setItem=()=>{throw Error("Storage full");};
 const noSpace=client(failedStorage,send);
 assert.equal(noSpace.sync.enqueue(tap),false,"Never show a successful count when offline storage fails");
 assert.equal(backend.total,15);
 // Reconnect submits pending group and personal counts without a Save tap.
 const reconnect=client(storage(),send);
 reconnect.navigator.onLine=false;
 assert(reconnect.sync.enqueue({...tap,count:4}));
 assert(reconnect.sync.enqueue({...tap,taskId:"_group_",count:2}));
 reconnect.events.offline?.();
 assert.equal(backend.total,15);
 assert.equal(reconnect.sync.pending(),6);
 reconnect.navigator.onLine=true;
 await reconnect.events.online();
 assert.equal(backend.total,21);
 assert.equal(reconnect.sync.pending(),0);
 await reconnect.events.online();
 assert.equal(backend.total,21,"Repeated online events must not duplicate counts");
 // A reconnect arriving during an existing Save is handled after it finishes.
 let release,attempt=0;
 const race=client(storage(),async op=>{if(++attempt===1){await new Promise(resolve=>{release=resolve;});throw Error("connection lost");}await send(op);});
 assert(race.sync.enqueue(tap));
 const saving=race.sync.flush();
 await Promise.resolve();
 assert.equal(typeof release,"function");
 await race.events.online();
 release();
 await saving;
 assert.equal(race.sync.pending(),0);
 assert.equal(backend.total,22);
 console.log("Durable tasbih: same-browser tabs, devices, offline, restart, lost-ACK, migration and storage errors passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
