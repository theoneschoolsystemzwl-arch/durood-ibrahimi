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
function client(store,send){
 const navigator={onLine:true};
 const context=vm.createContext({
  localStorage:store,navigator,Date,Math,Number,JSON,Array,Uint8Array,
  crypto:{getRandomValues(bytes){const seed=serial++;for(let i=0;i<bytes.length;i++)bytes[i]=(seed*17+i*13)&255;return bytes;}},
  setTimeout(){return 1;},clearTimeout(){},
  window:{addEventListener(){}},document:{hidden:false,addEventListener(){}}
 });
 vm.runInContext(source+"\nthis.createSync=createDurableTasbihSync;",context);
 const sync=context.createSync({prefix,getUid:()=>uid,send});
 sync.start(uid);
 return {sync,navigator};
}
const tap={taskId:"WAZIFA00123",day,source:"tasbih",count:1,durationMs:0,intervals:1};
(async()=>{
 const receipts=new Set(),backend={total:0};
 const send=async op=>{
  assert.match(op.id,/^[a-f0-9]{32}$/);
  if(!receipts.has(op.id)){receipts.add(op.id);backend.total+=op.count;}
 };
 // Same browser, two live tabs: each immutable entry survives the other's save.
 const shared=storage();
 const tabA=client(shared,send),tabB=client(shared,send);
 assert.equal(tabA.sync.enqueue(tap),true);
 assert.equal(tabB.sync.enqueue(tap),true);
 assert.equal(tabA.sync.pending(),2,"Both tabs' counts must remain in shared storage");
 tabA.navigator.onLine=false;
 await tabA.sync.flush();
 assert.equal(backend.total,0,"Offline taps must not be sent");
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
 console.log("Durable tasbih: same-browser tabs, devices, offline, restart, lost-ACK, migration and storage errors passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
