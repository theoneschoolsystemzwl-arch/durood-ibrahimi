// Non-deployment structural checks for owner/member front-end and server contracts.
// These tests do not replace Firebase Emulator Suite or live security testing.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("public/index.html","utf8");
const client=fs.readFileSync("public/app.js","utf8");
const auth=fs.readFileSync("public/member-auth.js","utf8");
const fn=fs.readFileSync("functions/index.js","utf8");
const rules=fs.readFileSync("firestore.rules","utf8");
const config=JSON.parse(fs.readFileSync("firebase.json","utf8"));
const styles=fs.readFileSync("public/styles.css","utf8");
const classic=fs.readFileSync("public/classic-app.html","utf8");
const native=fs.readFileSync("android-online/src/app/duroodibrahimi/online/MainActivity.java","utf8");
function present(txt,needle){assert.ok(txt.includes(needle),"Missing "+needle);}
for(const item of ["tab-login","tab-register","id=\"access-form\"","id=\"login-fields\"","id=\"register-fields\""])present(html,item);
assert.equal((html.match(/<form id=\"access-form\"/g)||[]).length,1,"There must be one combined account form");
const authPanel=html.split('<section id="access"')[1].split('<section id="portal"')[0];
assert.ok(!authPanel.includes("DI-1"),"Member number must not appear on login screen");
for(const item of ["function switchTab(","document.querySelector(","await login(","await register("])present(client,item);
for(const item of ["registerMember","createInvitation","setMemberActive","updateMyProfile","recordRecitations","runTransaction","memberNumber:next","role:\"member\""])present(fn,item);
present(auth,"signInWithEmailAndPassword");
present(html,'id="login-identity"');
present(html,'maxlength="254"');
present(html,'dir="ltr"');
present(html,'id="toggle-login-password"');
assert.ok(!html.includes('id="login-identity-preview"'),"Removed login preview must not reappear");
present(client,'loginPassword.type=show?"text":"password"');
present(auth,'entered.includes("@")');
present(auth,'loginStage="firebase-auth"');
present(auth,'loginStage="firestore-profile"');
present(auth,'loginStage="missing-member-profile"');
present(client,'signingIn:false');
present(client,'appState.signingIn=true');
present(client,'if(appState.registering || appState.signingIn)return');
// A null auth-state notification during first sign-in must not bounce to login.
assert.ok(!client.includes('if(user && (appState.registering || appState.signingIn))return'));
present(client,'durood-classic-auth-pending');
present(client,'classicFrameRequested=false;');

present(client,'آئی ڈی یا پاس ورڈ غلط ہے');
present(html,'id="remember-login"');
present(auth,"browserLocalPersistence");
present(auth,"browserSessionPersistence");
present(html,'id="forgot-password"');
present(client,'sendPasswordResetEmail(auth,entered.toLowerCase())');
present(client,'#forgot-password');



present(auth,"registerSpark");
present(auth,"invitationSpark");
const spark=fs.readFileSync("public/spark-data.js","utf8");
for(const api of ["registerSpark","invitationSpark","memberActiveSpark","profileNameSpark","readingsSpark","prayerSaveSpark","prayerMonthSpark","rankingSpark","referralsSpark","communitySpark"])present(spark,api);
present(spark,"runTransaction");
for(const id of ["prayer-form","prayer-history","ranking-list","referrals-list","members-count","admin-panel"])present(html,id);
const memberPages=fs.readFileSync("public/community-pages.js","utf8");
const changePassword=fs.readFileSync("public/password-change.js","utf8");
present(html,"id=\"password-form\"");
present(changePassword,"reauthenticateWithCredential");
present(changePassword,"updatePassword");
for(const entry of ["savePrayerDay","getPrayerMonth","getLeaderboard","getMyReferrals","getCommunitySummary"]) {
  present(fn, "exports."+entry+" = onCall");
}
present(client, "initializeCommunityPages");
present(client, "activateMemberHome");
present(rules,"request.auth.token.get('owner', false) == true");
present(rules,"getAfter(");
present(rules,"allowedMemberCreate");
present(rules,"allow read, write: if false;");
present(config.functions[0].source,"functions");
assert.equal(config.hosting.public,"public");
assert.equal(config.firestore.rules,"firestore.rules");
for(const asset of ["public/index.html","public/app.js","public/member-auth.js","public/firebase-client.js","public/styles.css","public/community-pages.js","public/password-change.js","public/spark-data.js","functions/scripts/bootstrap-owner.mjs"]){
  assert.ok(fs.statSync(asset).size>0,asset+" must be present");
}
// Guard against regression to Android viewport reflow and jumping nav tabs.
present(styles,".classic-frame{");
present(styles,"opacity:0;visibility:hidden;pointer-events:none");
present(styles,"height:100%");
assert.ok(!styles.includes("height:100dvh"),"Dynamic frame height made Android tabs jump");
present(client,"frame.hidden=false;");
present(classic,"overflow-x:clip");
present(classic,".nav{flex:1 0 45px;min-width:45px");
present(native,"settings.setUseWideViewPort(true)");
present(native,"settings.setLoadWithOverviewMode(false)");
// Gender isolation and first-device-wins coverage.
for(const api of ["groupMessagesSpark","sendGroupMessageSpark",
 "classifyLegacyMemberSpark","memberDeleteSpark","genderStats","genderMembers"]){
  present(spark,api);
}
for(const item of ["switch-side","group-message-form","group-chat-list",
 "chat-refresh","duroodOwnerInviteTotal","duroodCurrentSide"]){
  present(classic,item);
}
for(const item of ["match /genderMembers/{gender}","match /genderStats/{gender}",
 "match /groupChats/{gender}/messages/{messageId}",
 "allow update: if false;","invitationMatches"]){
  present(rules,item);
}
// Newly requested timer and counter behavior must remain in the classic app.
for(const contract of ['queueTasbihTap','tasbihSync.enqueue','readerJournalKey',
  'persistReaderJournal','manual-yellow','top-corners','boxed-headline',
  'dialFloating','suppressNextDialClick','15000','--ring-progress'])present(classic,contract);
present(classic,"tasbihSync.byDay");
present(rules,"syncReceipts/{receiptId}");
present(spark,"syncId=null");
assert.ok(!classic.includes('type:"durood-use-top"'),"Classic must not bounce authenticated parent to login");
// Classic HTML contains two large inline JS bundles. Validate BOTH using
// Node's parser, including the module that loads Firebase in the iframe.
const {spawnSync}=require("node:child_process");
const extracted=[...classic.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.ok(extracted.length>=2,"Classic dashboard must contain its app and Firebase bridge scripts");
for(const [,attrs,source] of extracted){
  const moduleScript=/type=["']module["']/i.test(attrs);
  const options=moduleScript?["--input-type=module","--check"]:["--check"];
  const check=spawnSync(process.execPath,options,{input:source,encoding:"utf8"});
  assert.equal(check.status,0,
    "Classic inline JavaScript syntax invalid: "+(check.stderr||check.stdout));
}
const indexConfig=JSON.parse(fs.readFileSync("firestore.indexes.json","utf8"));
assert.ok(indexConfig.indexes.some(index=>index.collectionGroup==="members" &&
  index.fields.some(f=>f.fieldPath==="inviterUid") &&
  index.fields.some(f=>f.fieldPath==="gender")));
assert.equal(config.firestore.indexes,"firestore.indexes.json");
console.log("Spark structural checks passed. Firestore rule emulation and real deployment are separate.");
