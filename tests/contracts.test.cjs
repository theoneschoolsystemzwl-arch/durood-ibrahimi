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
present(html,'id="login-identity-preview"');
present(client,'identityPreview.textContent=fullId');
present(client,'loginPassword.type=show?"text":"password"');
present(auth,'entered.includes("@")');
present(auth,'loginStage="firebase-auth"');
present(auth,'loginStage="firestore-profile"');
present(auth,'loginStage="missing-member-profile"');
present(client,'signingIn:false');
present(client,'appState.signingIn=true');
present(client,'if(user && (appState.registering || appState.signingIn))return');
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
present(rules,"request.auth.token.owner == true");
present(rules,"getAfter(");
present(rules,"allowedMemberCreate");
present(rules,"allow read, write: if false;");
present(config.functions[0].source,"functions");
assert.equal(config.hosting.public,"public");
assert.equal(config.firestore.rules,"firestore.rules");
for(const asset of ["public/index.html","public/app.js","public/member-auth.js","public/firebase-client.js","public/styles.css","public/community-pages.js","public/password-change.js","public/spark-data.js","functions/scripts/bootstrap-owner.mjs"]){
  assert.ok(fs.statSync(asset).size>0,asset+" must be present");
}
console.log("Spark structural checks passed. Firestore rule emulation and real deployment are separate.");
