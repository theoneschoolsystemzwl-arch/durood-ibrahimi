import {auth,db} from "./firebase-client.js";
import "./password-change.js";
import {
  login, register, createInvitation, setMemberActive, updateMyProfile, loadMemberProfile,
  claimDeviceSession, signOut, onAuthStateChanged
} from "./member-auth.js?release=fast-login-reader-v4";
import "./profile-contacts.js";
import {generatedUsername,readingsSpark} from "./spark-data.js?release=fast-login-reader-v4";
import {sendPasswordResetEmail,signOut as firebaseSignOut} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,getDocs,collection} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

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
let dashboardTimer;
let authGeneration=0;
let nullAuthTimer=null;
let lastAuthenticatedUid=null;

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
  if(code==="member/already-online")return "User already logged in۔ پہلے والی ڈیوائس سے Log out کریں۔";
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
const identityPreview=$("#login-identity-preview");
identityInput.addEventListener("input",()=>{
  const fullId=identityInput.value.trim();
  identityPreview.textContent=fullId;
  identityPreview.hidden=!fullId;
});
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

$("#forgot-password").addEventListener("click",async()=>{
  if(appState.busy)return;
  const entered=identityInput.value.trim();
  if(!entered || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entered)) {
    message("#auth-message","Password Reset کے لیے Firebase Users میں درج پوری Email لکھیں۔");
    identityInput.focus();
    return;
  }
  updateBusy(true);
  try {
    await sendPasswordResetEmail(auth,entered.toLowerCase());
    message("#auth-message","اگر یہ Email Firebase میں موجود ہے تو Password Reset کا لنک بھیج دیا گیا ہے۔ اپنی Email کا Inbox اور Spam چیک کریں۔",true);
  }catch(error) {
    if(error?.code==="auth/too-many-requests"){
      message("#auth-message","Reset کی بہت زیادہ کوششیں ہوئی ہیں؛ کچھ دیر بعد دوبارہ کوشش کریں۔");
    }else if(error?.code==="auth/network-request-failed"){
      message("#auth-message","Firebase سے رابطہ نہیں ہو سکا، انٹرنیٹ کنکشن چیک کریں۔");
    }else{
      // Do not disclose whether an email is registered.
      message("#auth-message","Reset درخواست مکمل نہیں ہوئی۔ Firebase Authentication اور Email کی درستگی چیک کریں۔");
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
      await claimDeviceSession(auth.currentUser,profile);
      showSignedIn(profile);
    }
    accessForm.reset();
    message("#auth-message","اکاؤنٹ کامیابی سے کھل گیا۔",true);
  }catch(err){
    if(appState.tab==="login")rememberLoginFailure(err);
    if(err.loginStage==="firestore-profile" && auth.currentUser){
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
function showSignedOut() {
  clearTimeout(nullAuthTimer);
  clearTimeout(dashboardTimer);
  document.body.classList.remove("classic-pending");
  $("#loading-retry").hidden=true;
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
  const alreadyOpening=lastAuthenticatedUid===profile.uid && classicFrameRequested;
  lastAuthenticatedUid=profile.uid;
  appState.profile=profile;
  view("#loading",false);
  view("#access",false);
  view("#portal",true);
  $("#member-name").textContent=profile.name||"Member";
  $("#member-serial").textContent=memberSerial(profile);
  $("#member-role").textContent=profile.role==="owner"?"Owner / Admin":"Member";
  $("#profile-serial").textContent=memberSerial(profile);
  $("#profile-username").textContent=profile.username||"";
  $("#profile-role").textContent=profile.role==="owner"?"Owner / Admin":"Member";
  $("#profile-name").value=profile.name||"";
  view("#admin-panel",profile.role==="owner");
  if(!alreadyOpening)showOriginalDashboardIfReady();
  if(classicReadyUid===profile.uid)revealOriginalDashboard();
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
  frame.src="./classic-app.html?release=explicit-logout-20261124-v1";
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
    small.textContent=[memberSerial(member),member.username,member.disabled?"Suspended":"Active"].filter(Boolean).join(" • ");
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
  if(appState.busy)event.preventDefault();
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
    if(appState.profile){
      clearTimeout(nullAuthTimer);
      view("#access",false);
      view("#portal",false);
      view("#loading",true);
      $("#loading-copy").textContent="محفوظ لاگ اِن بحال کیا جا رہا ہے…";
      nullAuthTimer=setTimeout(()=>{
        if(!auth.currentUser && !appState.signingIn && !appState.registering)showSignedOut();
      },2500);
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
  let profile;
  try {
    profile=await loadProfile(user);
    if(auth.currentUser?.uid!==user.uid || current!==authGeneration)return;
    await claimDeviceSession(user,profile);
  } catch(err) {
    if(auth.currentUser?.uid!==user.uid || current!==authGeneration)return;
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
  if(!auth.currentUser){showSignedOut();return;}
  $("#loading-retry").hidden=true;
  try{
    const profile=appState.profile?.uid===auth.currentUser.uid?appState.profile:await loadProfile(auth.currentUser);
    if(!appState.profile)await claimDeviceSession(auth.currentUser,profile);
    appState.profile=profile;
    const frame=$("#classic-frame");
    if(frame)frame.src="about:blank";
    classicFrameRequested=false;
    classicReadyUid=null;
    showSignedIn(profile);
  }catch(error){showProfileRetry(error);}
});
async function explicitLogout(){
  if(signingOut)return;
  signingOut=true;
  markLogout(true);
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
$("#add-one").addEventListener("click",()=>addRecitations(1,true));
$("#add-ten").addEventListener("click",()=>addRecitations(10,true));
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

function memberSerial(member){
  if(member.gender!=="female")return member.serial||"";
  const legacy={2:1,3:2};
  const number=member.sideNumber ?? legacy[member.memberNumber];
  return number ? "D"+number : "";
}

