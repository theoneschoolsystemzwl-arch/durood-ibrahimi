// Repeatable regression audit for prayer history, Qaza dates and status styling.
// These tests do not log in as a real member or touch production records.
import assert from "node:assert/strict";
import fs from "node:fs";
import {validQazaDay,normalizeQazaPlan,hasQazaPlanData} from "../public/qaza-model.js";

assert.equal(validQazaDay("2003-05-15"),true);
assert.equal(validQazaDay("2026-02-30"),false);
assert.equal(validQazaDay("2026-13-01"),false);
assert.equal(validQazaDay("1900-01-01"),true);
assert.equal(validQazaDay("1899-12-31"),false);

const legacy={start:"2003-05-15",target:25,
  done:{fajr:{"2026-11-19":true,"2026-11-20":false},
    isha:{"2026-11-21":true},other:{"2026-11-22":true}}};
const clean=normalizeQazaPlan(legacy);
assert.deepEqual(clean,{start:"2003-05-15",target:25,
  done:{fajr:{"2026-11-19":true},isha:{"2026-11-21":true}}});
assert.equal(hasQazaPlanData(clean),true);
assert.equal(hasQazaPlanData({}),false);
assert.equal(normalizeQazaPlan({start:"2026-02-30",target:-10}).start,"");
assert.equal(normalizeQazaPlan({start:"2026-01-01",target:1e11}).target,0);
assert.throws(()=>normalizeQazaPlan({done:{fajr:Object.fromEntries(
  Array.from({length:3001},(_,i)=>[new Date(Date.UTC(2000,0,i)).toISOString().slice(0,10),true])
)}}),/limit|حد/);

const ui=fs.readFileSync("public/classic-app.html","utf8");
const css=fs.readFileSync("public/prayer-calendar-fix.css","utf8");
const rules=fs.readFileSync("firestore.rules","utf8");
const spark=fs.readFileSync("public/qaza-firebase.js","utf8");
const requiredActions=[
  "nav","count-durood","namaz-month","namaz-mark","namaz-mode","prayer-view",
  "qaza-month","qaza-mode","qaza-record","qaza-unlock",
  "manual-day","daily-goal","create-invite","copy-invite"
];
for(const key of requiredActions){
  assert(ui.includes(key),`Missing navigation/action: ${key}`);
}
for(const needle of [
  "restoreMemberPrivateSettings(profile.uid","qazaLocalRevision++",
  "loadPrivateQaza(profile)","qazaSaveSpark(snapshot)",
  "loadPrayerMonth(month,uid)","loadPrayerDays(days,month)",
  "memberPrivateStorageKey","prayer-calendar-fix.css","requestedPrayerMonth()"
]){
 assert(ui.includes(needle),`Missing prayer regression guard: ${needle}`);
}
for(const status of ["namaz-jamat","namaz-solo","namaz-made","namaz-missed",
 "namaz-clear","qaza-paid"]){
 assert(css.includes(status),`Prayer theme misses ${status}`);
}
assert(css.includes(".namaz-calendar-bar"));
assert(css.includes(".prayer-ledger"));
assert(fs.readFileSync("public/wazaif.js","utf8").includes('read-group'));
assert(spark.includes('"memberPrivate",uid,"qaza","plan"'));
assert(rules.includes("match /memberPrivate/{uid}/qaza/{docId}"));
assert(rules.includes("validQazaPaid"));
assert(rules.includes("self(uid) && currentMember()"));
console.log("Prayer regression checks passed: Qaza migration, date validation, isolated Firebase saves, calendar colors and key buttons.");
