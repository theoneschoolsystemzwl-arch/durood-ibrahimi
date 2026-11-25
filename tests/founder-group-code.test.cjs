const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("public/classic-app.html","utf8");
const rows=[{id:1,uid:"m1",gender:"Male",isOwner:true},{id:2,uid:"f1",gender:"Female",isFoundingSpouse:true},{id:3,uid:"m2",gender:"Male",inviterUid:"m1"},{id:4,uid:"m3",gender:"Male",inviterUid:"m1"},{id:5,uid:"m4",gender:"Male",inviterUid:"m2"},{id:6,uid:"m5",gender:"Male",inviterUid:"m3"},{id:7,uid:"m6",gender:"Male",inviterUid:"m2"},{id:8,uid:"f2",gender:"Female",inviterUid:"f1"},{id:9,uid:"m7",gender:"Male",inviterUid:"m1"}];
const a=src.indexOf("function buildGroupIdentity"),b=src.indexOf("let groupDirectoryReady",a);
const ctx={};vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
const g=ctx.buildGroupIdentity(rows);
for(const [id,membership,owned] of [[1,"","A"],[2,"","A"],[3,"A1","B"],[4,"A2","C"],[5,"B1",""],[6,"C1",""],[7,"B2",""],[8,"A1",""],[9,"A3",""]]){assert.equal(g.get(id).membership,membership);assert.equal(g.get(id).owned,owned);}
assert.equal(ctx.buildGroupIdentity([rows[0]]).get(1).owned,"");
rows[4].deleted=true;assert.equal(ctx.buildGroupIdentity(rows).get(7).membership,"B2");
const x=src.indexOf("function groupWirdPeople"),y=src.indexOf("function groupWirdText",x);
const cc={directMembers:id=>rows.filter(p=>p.inviterUid===rows.find(r=>r.id===id).uid)};vm.createContext(cc);vm.runInContext(src.slice(x,y),cc);
assert.equal(cc.groupWirdPeople(rows[0]).map(p=>p.uid).join(","),"m1,m2,m3,m7");
assert.equal(cc.groupWirdPeople(rows[2]).map(p=>p.uid).join(","),"m6");
console.log("Group membership positions, independent letters, and non-overlapping direct GC passed");
