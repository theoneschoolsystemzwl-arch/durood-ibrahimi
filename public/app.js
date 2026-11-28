import {prepareApproval,requestOwnerApproval,approveRecovery,checkRecoveryCode,redeemRecoveryCode} from "./member-recovery.js";
import {auth,db} from "./firebase-client.js";
import {createDurableTasbihSync} from "./tasbih-durable-sync.js?v=reconnect-save-20261126-v6";
import {globalDay} from "./global-clock.js";
import {createOfflineSession} from "./offline-session.js";
import "./password-change.js";
import {
  login, register, createInvitation, setMemberActive, updateMyProfile, loadMemberProfile,
  claimDeviceSession, watchDeviceSession, signOut, onAuthStateChanged
} from "./member-auth.js?release=latest-device-v1";
import "./profile-contacts.js";
import {generatedUsername,readingsSpark} from "./spark-data.js?release=member-visibility-20261127-v1";
import {sendPasswordResetEmail,signOut as firebaseSignOut} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,getDocs,collection,query,where,limit,startAfter,getDocsFromServer} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

import {initializeCommunityPages,activateMemberHome} from "./community-pages.js";

initializeCommunityPages();
const $=selector=>document.querySelector(selector);
const appState={tab:"login",profile:null,busy:false,signingIn:false,registering:false,loadingAuth:true};
// Explicit logout must win over the two Auth contexts' automatic restoration.
const LOGOUT_KEY="durood-explicit-logout-v1";
let signingOut=false,logoutMarked=false;
try{logoutMarked=localStorage.getItem(LOGOUT_KEY)==="1";}catch{}
function logoutBlocked(){return signingOut||logoutMarked;}
function markLogout(value){
  logoutMarked=value;
  try{if(value)localStorage.setItem(LOGOUT_KEY,"1");else localStorage.removeItem(LOGOUT_KEY);}catch{}
}
window.duroodLogoutBlocked=logoutBlocked;
window.duroodVerifiedProfile=uid=>!logoutBlocked() && auth.currentUser?.uid===uid && appState.profile?.uid===uid ? appState.profile : null;
window.duroodParentAuthUser=()=>!logoutBlocked() && appState.profile?.uid===auth.currentUser?.uid ? auth.currentUser : null;
let classicFrameRequested=false;
let classicReadyUid=null;
let pendingLoginFireworkUid=null;
let dashboardTimer;
let authGeneration=0;
let nullAuthTimer=null;
let lastAuthenticatedUid=null;
const offlineSession=createOfflineSession({auth,db,isVerified:uid=>!logoutBlocked()&&appState.profile?.uid===uid,blocked:logoutBlocked});
const SESSION_RECOVERY_MS=15000;
function sessionText(ur,en,id){return window.duroodLocale?.message(window.duroodStaticLocale?.selection()||'ur',{ur,en,id})||ur;}
function recoveryText(){return sessionText('محفوظ لاگ اِن بحال کیا جا رہا ہے…','Restoring your saved login…','Memulihkan login tersimpan…');}
function recoverVerifiedSession(){
  clearTimeout(nullAuthTimer);clearTimeout(dashboardTimer);
  view('#access',false);view('#portal',false);view('#loading',true);
  $('#loading-copy').textContent=recoveryText();$('#loading-retry').hidden=true;$('#loading-signin').hidden=true;
  const expected=lastAuthenticatedUid,generation=authGeneration;
  nullAuthTimer=setTimeout(()=>{
    if(logoutBlocked()||auth.currentUser||appState.signingIn||appState.registering||authGeneration!==generation||lastAuthenticatedUid!==expected)return;
    $('#loading-copy').textContent=sessionText('محفوظ سیشن بحال نہیں ہو سکا۔ دوبارہ کوشش کریں یا ضرورت ہو تو لاگ اِن کریں۔','Your saved session could not be restored. Retry or sign in if needed.','Sesi tersimpan belum dapat dipulihkan. Coba lagi atau masuk jika perlu.');
    $('#loading-retry').hidden=false;$('#loading-signin').hidden=false;
  },SESSION_RECOVERY_MS);
}

// This local courtesy pause reduces accidental repeat attempts.
// It does not override Firebase's server-side rate limiting.
const LOGIN_RETRY_KEY="di-login-retry-guard-v1";
function readLoginRetry(){
  try{
    const value=JSON.parse(sessionStorage.getItem(LOGIN_RETRY_KEY)||"{}");
    return {
      failures:Number.isInteger(value.failures)?value.failures:0,
      since:Number.isFinite(value.since)?value.since:0,
      until:Number.isFinite(value.until)?value.until:0
    };
  }catch{return {failures:0,since:0,until:0};}
}
function saveLoginRetry(state){
  try{sessionStorage.setItem(LOGIN_RETRY_KEY,JSON.stringify(state));}catch{}
}
function checkLoginRetry(){
  const minutes=Math.ceil((readLoginRetry().until-Date.now())/60000);
  if(minutes>0){
    const error=new Error("مزید بار بار کوششوں سے بچنے کے لیے "+minutes+" منٹ رکیں۔ یہ ایپ کا حفاظتی وقفہ ہے؛ Firebase کی پابندی اس سے زیادہ بھی رہ سکتی ہے۔");
    error.code="client/login-cooldown";
    throw error;
  }
}
function rememberLoginFailure(error){
  const code=error?.code||"";
  const now=Date.now();
  const state=readLoginRetry();
  if(code==="auth/too-many-requests"){
    state.until=Math.max(state.until,now+5*60*1000);
  }else{return;}
  saveLoginRetry(state);
}
function clearLoginRetry(){
  try{sessionStorage.removeItem(LOGIN_RETRY_KEY);}catch{}
}

const number=new Intl.NumberFormat("en-US");

function view(selector,visible) {$(selector).hidden=!visible;}
function message(selector,text,ok=false) {
  const element=$(selector);
  element.textContent=text||"";
  element.classList.toggle("ok",!!ok);
}
function errorText(err) {
  const code=err?.code||"";
  if(code==="member/session-replaced"||code==="member/same-second")return "";
  if(err?.loginStage==="missing-member-profile")return "یوزر موجود نہیں یا اکاؤنٹ غیر فعال ہے۔";
  if(err?.loginStage==="owner-sequence-conflict")return "پرانے ممبر نمبرز اور Owner اکاؤنٹ میں تضاد ہے۔ ریکارڈ کی حفاظت کے لیے کوئی نمبر تبدیل نہیں کیا گیا۔";
  if(err?.loginStage==="firestore-profile") {
    if(code==="permission-denied"||code==="firestore/permission-denied")return "اکاؤنٹ تک رسائی نہیں۔";
    if(code==="not-found"||code==="firestore/not-found")return "یوزر کا ریکارڈ موجود نہیں۔";
    if(code==="unavailable"||code==="firestore/unavailable")return "انٹرنیٹ سے رابطہ نہیں ہو رہا۔";
    return "لاگ اِن مکمل نہیں ہوا۔ دوبارہ کوشش کریں۔";
  }
  if(code==="auth/invalid-credential"||code==="auth/wrong-password"||code==="auth/user-not-found")
    return "آئی ڈی یا پاس ورڈ غلط ہے، یا یوزر موجود نہیں۔";
  if(code==="auth/user-disabled")return "یہ Firebase Authentication اکاؤنٹ غیر فعال ہے۔";
  if(code==="auth/operation-not-allowed")return "اس وقت لاگ اِن دستیاب نہیں۔";
  if(code==="auth/network-request-failed")return "Firebase سے رابطہ نہیں ہو رہا، انٹرنیٹ کنکشن چیک کریں۔";
  if(code==="auth/unauthorized-domain")return "اس ویب سائٹ سے لاگ اِن ممکن نہیں۔";
  if(code==="auth/too-many-requests")return "زیادہ کوششیں ہو گئیں۔ کچھ دیر بعد لاگ اِن کریں۔";
  if(code==="unavailable"||code==="firestore/unavailable")return "انٹرنیٹ یا Firebase Firestore دستیاب نہیں۔";
  if(code==="permission-denied"||code==="firestore/permission-denied")return "Firebase Security Rules یا ممبر کی اجازت چیک کریں۔";
  if(code==="not-found"||code==="firestore/not-found")return "Firestore کا ریکارڈ یا ڈیٹابیس نہیں ملا۔";
  return String(err?.message || "درخواست مکمل نہیں ہو سکی۔").replace(/^(FirebaseError|Firebase):\s*/i,"").slice(0,240);
}
function updateBusy(on){
  appState.busy=on;
  for(const button of document.querySelectorAll("button")) {
    if(button.id==="signout")continue;
    button.disabled=on;
  }
}
function switchTab(which) {
  if(appState.busy)return;
  appState.tab=which;
  const registerTab=which==="register";
  $("#tab-login").setAttribute("aria-selected",String(!registerTab));
  $("#tab-register").setAttribute("aria-selected",String(registerTab));
  $("#login-fields").hidden=registerTab;
  $("#login-fields").disabled=registerTab;
  $("#register-fields").hidden=!registerTab;
  $("#register-fields").disabled=!registerTab;
  $("#access-submit").textContent=registerTab?"Create Account":"Log in";
  message("#auth-message","");
}
const genderOathText={
  male:"میں مرد ہوں اور حلف دیتا ہوں کہ درود شریف اخلاص سے پڑھوں گا اور صرف اتنی تعداد درج کروں گا جتنی میں نے واقعی پڑھی ہے۔ تسبیح کاؤنٹر یا دستی اندراج کے ذریعے جان بوجھ کر کوئی جھوٹی تعداد شامل نہیں کروں گا۔",
  female:"میں عورت ہوں اور حلف دیتی ہوں کہ درود شریف اخلاص سے پڑھوں گی اور صرف اتنی تعداد درج کروں گی جتنی میں نے واقعی پڑھی ہے۔ تسبیح کاؤنٹر یا دستی اندراج کے ذریعے جان بوجھ کر کوئی جھوٹی تعداد شامل نہیں کروں گی۔"
};
function updateGenderOath(){
 const chosen=document.querySelector('#register-fields input[name="gender"]:checked')?.value||"male";
 const female=chosen==="female";
 $("#gender-oath-text").textContent=genderOathText[chosen];
 $("#prayer-oath-text").textContent=female ? "میں پانچ وقت کی نماز پڑھنے کی کوشش کروں گی۔" : "میں پانچ وقت کی نماز پڑھنے کی کوشش کروں گا۔";
 $("#invite-oath-text").textContent=female ? "میں دس ممبرز کو درود شریف پڑھنے کی دعوت دینے کی کوشش کروں گی اور انہیں اس گروپ کا حصہ بناؤں گی۔" : "میں دس ممبرز کو درود شریف پڑھنے کی دعوت دینے کی کوشش کروں گا اور انہیں اس گروپ کا حصہ بناؤں گا۔";
 $("#gender-oath-check-label").textContent=chosen==="female"
   ?"میں عورت ہوں اور اس حلف کی تصدیق کرتی ہوں"
   :"میں مرد ہوں اور اس حلف کی تصدیق کرتا ہوں";
 const checked=document.querySelector('#register-fields input[name="genderOath"]');
 if(checked)checked.checked=false;
}
document.querySelectorAll('#register-fields input[name="gender"]').forEach(el=>el.addEventListener("change",updateGenderOath));
$("#access-form").addEventListener("reset",()=>queueMicrotask(updateGenderOath));
updateGenderOath();

$("#tab-login").addEventListener("click",()=>switchTab("login"));
$("#tab-register").addEventListener("click",()=>switchTab("register"));

const registrationName=document.querySelector('#register-fields input[name="name"]');
function showGeneratedUsername(){
  $("#generated-username").textContent=generatedUsername(registrationName.value);
}
registrationName.addEventListener("input",showGeneratedUsername);
$("#access-form").addEventListener("reset",()=>queueMicrotask(showGeneratedUsername));
const identityInput=$("#login-identity");
const loginPassword=$("#login-password");

const passwordEye=$("#toggle-login-password");
passwordEye.addEventListener("click",()=>{
  const show=loginPassword.type==="password";
  loginPassword.type=show?"text":"password";
  passwordEye.setAttribute("aria-pressed",String(show));
  passwordEye.setAttribute("aria-label",show?"Hide password":"Show password");
  passwordEye.title=show?"Hide password":"Show password";
  passwordEye.querySelector(".eye-slash").hidden=!show;
  loginPassword.focus({preventScroll:true});
});

window.duroodPrepareApproval=prepareApproval;
window.duroodApproveRecovery=(uid,id,selected)=>approveRecovery(uid,id,()=>appState.profile?.role==="owner" && !logoutBlocked() && selected());
const recoveryDialog=$("#recovery-dialog"), recoveryForm=$("#recovery-form");
function showRecoveryPassword(button,visible){
  const input=document.getElementById(button.getAttribute("aria-controls"));
  input.type=visible?"text":"password";
  button.setAttribute("aria-pressed",String(visible));
  button.setAttribute("aria-label",input.labels[0].textContent+(visible?" چھپائیں":" دکھائیں"));
  button.querySelector(".eye-slash").toggleAttribute("hidden",!visible);
}
const recoveryEyes=recoveryForm.querySelectorAll(".password-eye");
for(const button of recoveryEyes){
  button.addEventListener("click",()=>showRecoveryPassword(button,button.getAttribute("aria-pressed")!=="true"));
}
recoveryForm.addEventListener("reset",()=>{for(const button of recoveryEyes)showRecoveryPassword(button,false);});
const recoveryMenu=$("#recovery-menu"),requestForm=$("#recovery-request-form");
$("#forgot-password").addEventListener("click",()=>{
  if(appState.busy)return;
  requestForm.elements.identity.value=identityInput.value.trim();
  requestForm.querySelector('[role="status"]').textContent="";
  recoveryMenu.showModal();
});
$("#close-recovery-menu").onclick=()=>recoveryMenu.close();
$("#redeem-recovery").onclick=()=>{
  recoveryMenu.close();
  recoveryForm.reset();
  const fields=recoveryForm.querySelector("fieldset");
  fields.hidden=fields.disabled=true;
  recoveryForm.elements.username.readOnly=recoveryForm.elements.code.readOnly=false;
  recoveryForm.elements.username.value=requestForm.elements.identity.value;
  recoveryForm.querySelector('[type="submit"]').textContent="کوڈ چیک کریں";
  recoveryForm.querySelector('[role="status"]').textContent="";
  recoveryDialog.showModal();
};
$("#close-recovery").onclick=()=>recoveryDialog.close();
recoveryDialog.onclose=()=>recoveryForm.reset();
recoveryForm.onsubmit=async e=>{
  e.preventDefault();
  const f=recoveryForm.elements,fields=recoveryForm.querySelector("fieldset"),save=recoveryForm.querySelector('[type="submit"]'),notice=recoveryForm.querySelector('[role="status"]');
  if(save.disabled)return;
  save.disabled=true;notice.textContent="";
  try{
    if(fields.disabled){
      await checkRecoveryCode(f.username.value,f.code.value);
      fields.disabled=fields.hidden=false;
      f.username.readOnly=f.code.readOnly=true;save.textContent="نیا پاس ورڈ محفوظ کریں";f.next.focus();
    }else{
      const username=f.username.value;
      await redeemRecoveryCode(username,f.code.value,f.next.value,f.confirm.value);
      recoveryDialog.close();identityInput.value=username;loginPassword.value="";
      message("#auth-message","پاس ورڈ محفوظ ہو گیا۔ اب نئے پاس ورڈ سے لاگ اِن کریں۔",true);
    }
  }catch(error){notice.textContent=error.code?"کوڈ یا رابطہ چیک کریں ("+error.code+")۔":error.message;}
  finally{save.disabled=false;}
};

requestForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const report=text=>{requestForm.querySelector('[role="status"]').textContent=text;};
  if(appState.busy)return;
  const entered=requestForm.elements.identity.value.trim();
  if(!entered){report("اپنی لاگ اِن آئی ڈی یا رجسٹرڈ ای میل لکھیں۔");requestForm.elements.identity.focus();return;}
  if(!entered.includes("@")){
    updateBusy(true);
    try{await requestOwnerApproval(entered);report("درخواست اونر کو بھیج دی گئی۔ کوڈ ملنے پر «میرے پاس اونر کا دیا ہوا ری سیٹ کوڈ ہے» دبائیں۔",true);}
    catch(error){report(error.code==="permission-denied"?"آئی ڈی چیک کریں۔ اگر درخواست پہلے بھیجی تھی تو اونر سے کوڈ لیں۔":"درخواست بھیجنے میں مسئلہ آیا۔ دوبارہ کوشش کریں۔");}
    finally{updateBusy(false);}return;
  }
  updateBusy(true);
  try {
    await sendPasswordResetEmail(auth,entered.toLowerCase());
    report("اگر یہ Email Firebase میں موجود ہے تو Password Reset کا لنک بھیج دیا گیا ہے۔ اپنی Email کا Inbox اور Spam چیک کریں۔",true);
  }catch(error) {
    if(error?.code==="auth/too-many-requests"){
      report("Reset کی بہت زیادہ کوششیں ہوئی ہیں؛ کچھ دیر بعد دوبارہ کوشش کریں۔");
    }else if(error?.code==="auth/network-request-failed"){
      report("Firebase سے رابطہ نہیں ہو سکا، انٹرنیٹ کنکشن چیک کریں۔");
    }else{
      // Do not disclose whether an email is registered.
      report("Reset درخواست مکمل نہیں ہوئی۔ Firebase Authentication اور Email کی درستگی چیک کریں۔");
    }
  }finally{updateBusy(false);}
});


$("#access-form").addEventListener("submit",async event=>{
  event.preventDefault();
  if(appState.busy||signingOut)return;
  const accessForm=event.currentTarget;
  const form=new FormData(accessForm);
  updateBusy(true);
  message("#auth-message","");
  try{
    // Only a fresh, user-submitted login or registration may lift the logout block.
    if(logoutMarked && auth.currentUser)await firebaseSignOut(auth);
    markLogout(false);
    if(appState.tab==="login"){
      // Prevent the auth-state listener from racing the explicit login's profile lookup.
      appState.signingIn=true;
      try {
        checkLoginRetry();
        const profile=await login(form.get("loginUsername"),form.get("loginPassword"),{remember:$("#remember-login").checked});
        clearLoginRetry();
        pendingLoginFireworkUid=profile.uid;
        showSignedIn(profile);
      } finally {
        appState.signingIn=false;
      }
    }else{
      const password=String(form.get("password")||"");
      if(!["male","female"].includes(form.get("gender"))||!form.has("genderOath")||!form.has("muslim")||!form.has("pledge"))throw Error("جنس منتخب کریں اور حلف کے تمام خانے قبول کریں۔");
      appState.registering=true;
      try {
        await register({
          name:form.get("name"),
          gender:form.get("gender"),
          password,
          inviteCode:form.get("invite"),
          pledgeAccepted:true
        });
      } finally {
        appState.registering=false;
      }
      // Firebase Auth signs in immediately on account creation. Suppress the
      // auth-state listener until the same transaction creates the member record.
      const profile=await loadProfile(auth.currentUser);
      await claimDeviceSession(auth.currentUser,profile,{fresh:true});
      pendingLoginFireworkUid=profile.uid;
      showSignedIn(profile);
    }
    accessForm.reset();
    message("#auth-message","اکاؤنٹ کامیابی سے کھل گیا۔",true);
  }catch(err){
    if(appState.tab==="login")rememberLoginFailure(err);
    if(["member/session-replaced","member/same-second"].includes(err.code)){showSignedOut();message("#auth-message","");}
    else if(err.loginStage==="firestore-profile" && auth.currentUser){
      showProfileRetry(err);
    }else{
      message("#auth-message",errorText(err));
    }
  }finally{updateBusy(false);}
});

async function loadProfile(user){
  // Works after a page refresh too, not only during the first login attempt.
  return loadMemberProfile(user);
}
function showProfileRetry(err){
  view("#access",false);
  view("#portal",false);
  view("#loading",true);
  $("#loading-copy").textContent=errorText(err);
  $("#loading-retry").hidden=false;
}
let stopDeviceWatch=()=>{},deviceWatchUid=null;
function clearDeviceWatch(){stopDeviceWatch();stopDeviceWatch=()=>{};deviceWatchUid=null;}
async function silentlyReplacedSession(uid){
 if(auth.currentUser?.uid!==uid||signingOut)return;
 signingOut=true;markLogout(true);++authGeneration;clearDeviceWatch();
 try{showSignedOut();switchTab("login");$("#access-form").reset();message("#auth-message","");await firebaseSignOut(auth);}
 catch(error){console.warn("Local session sign-out",error?.code||error);}
 finally{signingOut=false;}
}
function showSignedOut() {
  clearDeviceWatch();
  pendingLoginFireworkUid=null;
  clearTimeout(nullAuthTimer);
  clearTimeout(dashboardTimer);
  document.body.classList.remove("classic-pending");
  $("#loading-retry").hidden=true;
  $("#loading-signin").hidden=true;
  offlineSession.hide();
  appState.profile=null;
  lastAuthenticatedUid=null;
  classicFrameRequested=false;
  classicReadyUid=null;
  document.body.classList.remove("classic-active");
  const classicFrame=$("#classic-frame");
  if(classicFrame){classicFrame.hidden=true;classicFrame.src="about:blank";}
  view("#loading",false);
  view("#portal",false);
  view("#access",true);
  view("#admin-panel",false);
}
function showSignedIn(profile){
  if(logoutBlocked()||!profile?.uid || auth.currentUser?.uid!==profile.uid)return;
  clearTimeout(nullAuthTimer);
  $("#loading-signin").hidden=true;
  const alreadyOpening=lastAuthenticatedUid===profile.uid && classicFrameRequested;
  lastAuthenticatedUid=profile.uid;
  appState.profile=profile;
  offlineSession.remember(profile.uid);offlineSession.flushPrayers();fallbackTasbih.start(profile.uid);
  if(deviceWatchUid!==profile.uid){
    clearDeviceWatch();deviceWatchUid=profile.uid;
    stopDeviceWatch=watchDeviceSession(auth.currentUser,profile,()=>void silentlyReplacedSession(profile.uid));
  }
  view("#loading",false);
  view("#access",false);
  view("#portal",true);
  $("#member-name").textContent=profile.name||"Member";
  $("#member-serial").textContent=memberSerial(profile);
  $("#member-role").textContent=profile.role==="owner"?"Owner / Admin":"Member";
  $("#profile-serial").textContent=memberSerial(profile);
  void resolveMemberSerial(profile);
  $("#profile-username").textContent=profile.username||"";
  $("#profile-role").textContent=profile.role==="owner"?"Owner / Admin":"Member";
  $("#profile-name").value=profile.name||"";
  view("#admin-panel",profile.role==="owner");
  if(!alreadyOpening)showOriginalDashboardIfReady();
  else if(classicReadyUid!==profile.uid){view("#loading",true);view("#access",false);}
  if(classicReadyUid===profile.uid)revealOriginalDashboard();
  else $("#classic-frame")?.contentWindow?.postMessage({type:"durood-parent-auth-ready",uid:profile.uid},location.origin);
}
function showOriginalDashboardIfReady(){
  const frame=$("#classic-frame");
  if(logoutBlocked()||!frame||!appState.profile||!auth.currentUser||classicFrameRequested)return;
  // Load the original UI just once. Do not download its 580 KB HTML twice.
  // Its Firebase data is loaded in the frame and must not be simulated here.
  classicFrameRequested=true;
  classicReadyUid=null;
  document.body.classList.add("classic-pending");
  view("#loading",true);
  $("#loading-copy").textContent="ڈیش بورڈ کھل رہا ہے…";
  $("#loading-retry").hidden=true;
  dashboardTimer=setTimeout(()=>{$("#loading-retry").hidden=false;$("#loading-copy").textContent="ڈیش بورڈ کھلنے میں دیر ہے۔ آپ دوبارہ کوشش کر سکتے ہیں؛ لاگ اِن برقرار ہے۔";},6000);
  // Give the iframe its full viewport layout before hydration, but keep it
  // visually invisible and non-interactive until it signals readiness.
  frame.hidden=false;
  frame.src="./classic-app.html?release=isolated-dashboard-auth-20261127-v1";
}
// A ready message can arrive while Firebase briefly reports null during its
// initial shared-storage handoff. Remember it; reveal only on verified auth.
function revealOriginalDashboard(){
  const frame=$("#classic-frame");
  if(logoutBlocked()||!frame||!appState.profile||auth.currentUser?.uid!==classicReadyUid)return;
  frame.hidden=false;
  clearTimeout(dashboardTimer);
  view("#loading",false);
  view("#access",false);
  view("#portal",true);
  document.body.classList.remove("classic-pending");
  document.body.classList.add("classic-active");
  if(pendingLoginFireworkUid===classicReadyUid){
    pendingLoginFireworkUid=null;
    frame.contentWindow?.postMessage({type:"durood-login-fireworks",uid:classicReadyUid},location.origin);
  }
}
// Keep the working portal visible until the authenticated classic dashboard
// explicitly confirms that it has rendered with the current Firebase user.
window.addEventListener("message",event=>{
  const frame=$("#classic-frame");
  if(logoutBlocked()||!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==="durood-use-top")return; // An embedded view must not navigate the authenticated parent.
  if(event.data?.type==="durood-classic-ready" &&
     appState.profile?.uid===event.data.uid){
    classicReadyUid=event.data.uid;
    revealOriginalDashboard();
  }else if(event.data?.type==="durood-classic-auth-pending"){
    if(classicReadyUid===appState.profile?.uid)return;
    // The iframe initializes Firebase independently. Its temporary empty Auth
    // state is not a logout, nor a failed account login.
    if(appState.profile?.uid===auth.currentUser?.uid){
      $("#loading-copy").textContent="آپ لاگ اِن ہیں؛ اندرونی ڈیش بورڈ کا سیشن ملایا جا رہا ہے…";
      view("#loading",true);view("#access",false);view("#portal",true);
      $("#loading-retry").hidden=true;
    }
  }else if(event.data?.type==="durood-classic-error"){
    frame.hidden=true;
    clearTimeout(dashboardTimer);
    view("#loading",false);
    view("#portal",true);
    view("#access",false);
    document.body.classList.remove("classic-active","classic-pending");
    $("#loading-retry").hidden=false;
    if(appState.profile && auth.currentUser?.uid===appState.profile.uid){
      activateMemberHome(appState.profile);
      refreshCounts().catch(err=>message("#reading-message",errorText(err)));
      if(appState.profile.role==="owner")refreshMembers().catch(err=>message("#admin-message",errorText(err)));
    }
  }
});
async function refreshCounts(){
  if(!auth.currentUser||!appState.profile)return;
  const gender=appState.profile.role==="owner"&&window.duroodOwnerSide==="female"?"female":appState.profile.gender==="female"?"female":"male";
  const [personal,side]=await Promise.all([
    getDoc(doc(db,"memberCounts",auth.currentUser.uid)),
    getDoc(doc(db,"genderStats",gender))
  ]);
  $("#personal-total").textContent=number.format(personal.exists()?(personal.get("total")||0):0);
  $("#global-total").textContent=number.format(side.exists()?(side.get("totalRecitations")||0):0);
}
async function refreshMembers(){
  if(appState.profile?.role!=="owner")return;
  message("#admin-message","");
  const snapshot=await getDocs(collection(db,"members"));
  const entries=snapshot.docs.map(s=>s.data()).sort((a,b)=>(a.memberNumber||0)-(b.memberNumber||0));
  const list=$("#member-list");
  list.replaceChildren();
  for(const member of entries){
    const outer=document.createElement("article");
    outer.className="member";
    const info=document.createElement("div");
    info.className="member-info";
    const name=document.createElement("strong");
    name.textContent=member.name||"Member";
    const small=document.createElement("small");
    small.textContent=[memberSerial(member,entries),member.username,member.disabled?"Suspended":"Active"].filter(Boolean).join(" • ");
    info.append(name,small);
    outer.append(info);
    if(member.role!=="owner"){
      const button=document.createElement("button");
      button.type="button";
      button.className="secondary";
      button.textContent=member.disabled?"Restore":"Suspend";
      button.addEventListener("click",async()=>{
        const wasDisabled=!!member.disabled;
        if(!window.confirm(wasDisabled?"اس ممبر کو دوبارہ فعال کریں؟":"اس ممبر کا اکاؤنٹ معطل کریں؟"))return;
        button.disabled=true;
        try{
          await setMemberActive(member.uid,wasDisabled);
          await refreshMembers();
          message("#admin-message","ممبر کی حالت بدل دی گئی ہے۔",true);
        }catch(err){message("#admin-message",errorText(err));button.disabled=false;}
      });
      outer.append(button);
    }
    list.append(outer);
  }
}
document.addEventListener("durood:before-refresh",event=>{
  if(appState.busy||fallbackTasbih.status().busy)event.preventDefault();
});
onAuthStateChanged(auth,async user=>{
  const current=++authGeneration;
  if(signingOut)return;
  if(logoutMarked){
    if(user)try{await firebaseSignOut(auth);}catch(error){console.warn("Logout restoration blocked",error?.code||error);}
    if(logoutMarked&&!signingOut)showSignedOut();
    return;
  }
  if(appState.registering || appState.signingIn)return;
  if(!user){
    // Two same-origin Firebase Auth contexts (portal + WebView iframe) can
    // briefly emit null while sharing the freshly persisted first login.
    // Never show the login form over a verified session during that handoff.
    if(auth.currentUser)return;
    if(appState.profile||lastAuthenticatedUid){
      recoverVerifiedSession();
      return;
    }
    showSignedOut();return;
  }
  clearTimeout(nullAuthTimer);
  if(appState.profile?.uid===user.uid){
    // Restore the visible portal too: a transient null callback might have
    // displayed the "reconnecting" screen without clearing the member.
    showSignedIn(appState.profile);
    return;
  }
  view("#loading",true);
  view("#access",false);
  if(navigator.onLine===false&&offlineSession.open(user.uid)){view("#loading",false);view("#access",false);return;}
  let profile;
  try {
    profile=await loadProfile(user);
    if(auth.currentUser?.uid!==user.uid || current!==authGeneration)return;
    await claimDeviceSession(user,profile);
  } catch(err) {
    if(auth.currentUser?.uid!==user.uid || current!==authGeneration)return;
    if(err?.code==="member/session-replaced"){await silentlyReplacedSession(user.uid);return;}
    $("#loading-copy").textContent="آپ کا لاگ اِن محفوظ ہے؛ انٹرنیٹ سے دوبارہ رابطہ کیا جا رہا ہے۔";
    $("#loading-retry").hidden=false;
    console.warn("Session restoration delayed:",err?.code||err?.message);
    return;
  }
  if(auth.currentUser?.uid!==user.uid || current!==authGeneration)return;
  showSignedIn(profile);
});
$("#loading-retry").addEventListener("click",async()=>{
  if(logoutBlocked()||appState.busy)return;
  if(!auth.currentUser){
    if(appState.profile||lastAuthenticatedUid){location.reload();return;}
    showSignedOut();return;
  }
  $("#loading-retry").hidden=true;
  $("#loading-signin").hidden=true;
  try{
    const profile=appState.profile?.uid===auth.currentUser.uid?appState.profile:await loadProfile(auth.currentUser);
    if(!appState.profile)await claimDeviceSession(auth.currentUser,profile);
    appState.profile=profile;
    const frame=$("#classic-frame");
    if(frame)frame.src="about:blank";
    classicFrameRequested=false;
    classicReadyUid=null;
    showSignedIn(profile);
  }catch(error){if(error?.code==="member/session-replaced"&&auth.currentUser)await silentlyReplacedSession(auth.currentUser.uid);else showProfileRetry(error);}
});
$("#loading-signin").addEventListener("click",()=>{
  if(auth.currentUser||appState.signingIn||appState.registering||signingOut)return;
  ++authGeneration;showSignedOut();switchTab("login");
});
window.duroodPortalRetryReady=true;
window.addEventListener("online",()=>{if(!logoutBlocked()&&!auth.currentUser&&lastAuthenticatedUid)recoverVerifiedSession();});
async function explicitLogout(){
  if(signingOut)return;
  signingOut=true;
  markLogout(true);
  offlineSession.hide();
  ++authGeneration;
  clearTimeout(nullAuthTimer);
  clearTimeout(dashboardTimer);
  try{
    // Release the existing member lease before signing out of Firebase.
    await signOut(auth);
    showSignedOut();
    switchTab("login");
    $("#access-form").reset();
    message("#auth-message","");
  }catch(error){
    // Preserve the existing session if its lease cannot be released offline.
    markLogout(false);
    throw error;
  }finally{signingOut=false;}
}
window.duroodExplicitLogout=explicitLogout;
$("#signout").addEventListener("click",async()=>{
  const button=$("#signout");button.disabled=true;
  try{await explicitLogout();}catch(err){message("#reading-message",errorText(err));}
  finally{button.disabled=false;}
});
async function addRecitations(amount,tasbih=false){
  if(appState.busy||!auth.currentUser)return;
  updateBusy(true);
  message("#reading-message","");
  try{
    await readingsSpark(amount,undefined,tasbih);
    await refreshCounts();
    message("#reading-message",number.format(amount)+" درود شمار میں شامل ہو گئے۔",true);
  }catch(err){message("#reading-message",errorText(err));}
  finally{updateBusy(false);}
}
const fallbackTasbih=createDurableTasbihSync({
 prefix:"durood-classic-counts-v3",getUid:()=>auth.currentUser?.uid,
 send:op=>readingsSpark(op.count,op.day,true,true,op.id),
 onChange:({pending,busy})=>{const n=$("#fallback-tasbih-count");if(n)n.textContent=number.format(pending);const b=$("#fallback-tasbih-save");if(b)b.disabled=busy||!pending;}
});
function fallbackTap(count){
 const uid=auth.currentUser?.uid;if(!uid||appState.busy||fallbackTasbih.status().busy)return;
 fallbackTasbih.start(uid);
 if(fallbackTasbih.enqueue({taskId:"_durood_",day:globalDay(),count,source:"tasbih"}))
   message("#reading-message","گنتی فون میں محفوظ ہے؛ Firebase کے لیے Save دبائیں۔",true);
 else message("#reading-message","فون میں گنتی محفوظ نہیں ہو سکی۔");
}
$("#add-one").addEventListener("click",()=>fallbackTap(1));
$("#add-ten").addEventListener("click",()=>fallbackTap(10));
$("#fallback-tasbih-save").addEventListener("click",async()=>{
 const uid=auth.currentUser?.uid;if(!uid||appState.busy)return;
 fallbackTasbih.start(uid);await fallbackTasbih.flush("_durood_");
 if(fallbackTasbih.pending())message("#reading-message","محفوظ نہیں ہوا؛ دوبارہ Save دبائیں۔ "+(fallbackTasbih.status().error||""));
 else{message("#reading-message","گنتی Firebase میں محفوظ ہو گئی۔",true);await refreshCounts().catch(()=>{});}
});
onAuthStateChanged(auth,user=>{if(!user)fallbackTasbih.stop();});
$("#manual-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const amount=Number($("#manual-amount").value);
  if(!Number.isSafeInteger(amount)||amount<1||amount>10000){
    message("#reading-message","1 سے 10000 تک مکمل عدد درج کریں۔");return;
  }
  await addRecitations(amount);
  $("#manual-amount").value="";
});
$("#make-invite").addEventListener("click",async()=>{
  if(appState.busy)return;
  updateBusy(true);
  try{
    const code=await createInvitation();
    $("#invitation-code").textContent=code;
    view("#copy-invite",true);
    message("#invitation-message","یہ نیا دعوتی کوڈ صرف ایک مرتبہ استعمال ہوگا۔",true);
  }catch(err){message("#invitation-message",errorText(err));}
  finally{updateBusy(false);}
});
$("#copy-invite").addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText($("#invitation-code").textContent.trim());
    message("#invitation-message","دعوتی کوڈ کاپی ہو گیا۔",true);
  }catch(err){message("#invitation-message","کوڈ منتخب کرکے کاپی کریں۔");}
});
$("#profile-form").addEventListener("submit",async event=>{
  event.preventDefault();
  if(appState.busy)return;
  updateBusy(true);
  try{
    await updateMyProfile($("#profile-name").value);
    const profile=await loadProfile(auth.currentUser);
    showSignedIn(profile);
    message("#profile-message","نام محفوظ ہو گیا۔",true);
  }catch(err){message("#profile-message",errorText(err));}
  finally{updateBusy(false);}
});
$("#refresh-members").addEventListener("click",async()=>{
  try{await refreshMembers();message("#admin-message","فہرست تازہ ہو گئی۔",true);}
  catch(err){message("#admin-message",errorText(err));}
});

function memberSerial(member,directory=null){
  const gender=m=>m.role==="owner"?"male":m.gender==="female"?"female":"male";
  const side=gender(member);
  const same=directory?.filter(m=>gender(m)===side).sort((a,b)=>Number(a.memberNumber)-Number(b.memberNumber));
  const rank=same?.findIndex(m=>m.uid===member.uid||m.memberNumber===member.memberNumber);
  const number=member.role==="owner"?1:member.sideNumber??(rank>=0?rank+1:null)??(side==="female"?({2:1,3:2})[member.memberNumber]:null);
  return number?(side==="female"?"F":"M")+number:"—";
}
async function resolveMemberSerial(profile){
  if(memberSerial(profile)!=="—")return;
  const side=profile.gender==="female"?"female":"male",rows=[];let last=null;
  try{
    for(;;){const constraints=[where("gender","==",side),limit(200)];if(last)constraints.push(startAfter(last));
      const page=await getDocsFromServer(query(collection(db,"members"),...constraints));rows.push(...page.docs.map(d=>d.data()));
      if(page.size<200)break;last=page.docs.at(-1);
    }
    if(auth.currentUser?.uid!==profile.uid)return;
    $("#member-serial").textContent=$("#profile-serial").textContent=memberSerial(profile,rows);
  }catch(e){console.warn("Member side serial unavailable",e.code||e);}
}

