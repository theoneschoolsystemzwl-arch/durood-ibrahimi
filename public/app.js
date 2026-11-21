import {auth,db} from "./firebase-client.js";
import "./password-change.js";
import {
  login, register, createInvitation, setMemberActive, updateMyProfile, signOut, onAuthStateChanged
} from "./member-auth.js";
import {readingsSpark} from "./spark-data.js";
import {sendPasswordResetEmail} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,getDocs,collection} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

import {initializeCommunityPages,activateMemberHome} from "./community-pages.js";

initializeCommunityPages();
const $=selector=>document.querySelector(selector);
const appState={tab:"login",profile:null,busy:false,signingIn:false,registering:false,loadingAuth:true};

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
  }else if(["auth/invalid-credential","auth/wrong-password","auth/user-not-found"].includes(code)){
    if(now-state.since>10*60*1000){state.since=now;state.failures=0;}
    state.failures+=1;
    if(state.failures>=3){state.until=now+60*1000;state.failures=0;}
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
  if(err?.loginStage==="missing-member-profile")return String(err?.message||"Firebase پروفائل نہیں ملا۔");
  if(err?.loginStage==="firestore-profile") {
    if(code==="permission-denied"||code==="firestore/permission-denied")
      return "Firebase Login درست ہے، مگر Firestore نے Owner پروفائل پڑھنے کی اجازت نہیں دی (permission-denied)۔ Firestore کی Published Security Rules چیک کریں۔";
    if(code==="not-found"||code==="firestore/not-found")
      return "Firebase Login درست ہے، مگر Firestore ڈیٹابیس نہیں ملا (not-found)۔ Firebase Console میں Firestore Database کی موجودگی چیک کریں۔";
    if(code==="failed-precondition"||code==="firestore/failed-precondition")
      return "Firebase Login درست ہے، مگر Firestore سیٹ اپ مکمل نہیں (failed-precondition)۔ Firestore Database اور Rules چیک کریں۔";
    if(code==="unavailable"||code==="firestore/unavailable")
      return "Firebase Login درست ہے، مگر Firestore عارضی طور پر دستیاب نہیں (unavailable)۔ انٹرنیٹ یا سروس چیک کریں۔";
    return "Firebase Login درست ہے، مگر Firestore پروفائل پڑھنے میں مسئلہ ہے ("+String(code||"unknown")+ ")۔ Firebase Console میں Owner ممبر ریکارڈ اور Published Rules چیک کریں۔";
  }
  if(code==="auth/invalid-credential"||code==="auth/wrong-password"||code==="auth/user-not-found")
    return "Firebase Authentication نے Email یا Password قبول نہیں کیا۔ Firebase Users میں مکمل Email دیکھیں؛ Reset Password والی Email میں لنک کھول کر نیا پاس ورڈ محفوظ کریں۔";
  if(code==="auth/user-disabled")return "یہ Firebase Authentication اکاؤنٹ غیر فعال ہے۔";
  if(code==="auth/operation-not-allowed")return "Firebase میں Email/Password Sign-in طریقہ فعال نہیں۔";
  if(code==="auth/network-request-failed")return "Firebase سے رابطہ نہیں ہو رہا، انٹرنیٹ کنکشن چیک کریں۔";
  if(code==="auth/unauthorized-domain")return "اس ویب سائٹ کا ڈومین Firebase Authentication میں مجاز نہیں۔";
  if(code==="auth/too-many-requests")return "Firebase نے بار بار کوششوں کی وجہ سے Login عارضی طور پر روک دیا ہے۔ دوبارہ بار بار Login نہ دبائیں؛ کچھ وقفے کے بعد درست Email اور Password سے ایک بار کوشش کریں۔";
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
$("#tab-login").addEventListener("click",()=>switchTab("login"));
$("#tab-register").addEventListener("click",()=>switchTab("register"));

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
  if(appState.busy)return;
  const form=new FormData(event.currentTarget);
  updateBusy(true);
  message("#auth-message","");
  try{
    if(appState.tab==="login"){
      // Prevent the auth-state listener from racing the explicit login's profile lookup.
      appState.signingIn=true;
      try {
        checkLoginRetry();
        const profile=await login(form.get("loginUsername"),form.get("loginPassword"));
        clearLoginRetry();
        showSignedIn(profile);
        refreshCounts().catch(err=>message("#reading-message",errorText(err)));
        if(profile.role==="owner")refreshMembers().catch(err=>message("#admin-message",errorText(err)));
      } finally {
        appState.signingIn=false;
      }
    }else{
      const password=String(form.get("password")||"");
      if(password!==String(form.get("confirm")||""))throw Error("دونوں پاس ورڈ ایک جیسے نہیں ہیں۔");
      if(!form.has("male")||!form.has("muslim")||!form.has("pledge"))throw Error("تمام تین خانے منتخب کریں۔");
      appState.registering=true;
      try {
        await register({
          name:form.get("name"),
          username:form.get("username"),
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
      showSignedIn(profile);
      refreshCounts().catch(err=>message("#reading-message",errorText(err)));
    }
    event.currentTarget.reset();
    message("#auth-message","اکاؤنٹ کامیابی سے کھل گیا۔",true);
  }catch(err){
    if(appState.tab==="login")rememberLoginFailure(err);
    message("#auth-message",errorText(err));
  }finally{updateBusy(false);}
});

async function loadProfile(user){
  const snap=await getDoc(doc(db,"members",user.uid));
  if(!snap.exists()||snap.get("disabled")===true)throw Error("یہ اکاؤنٹ غیر فعال ہے یا پروفائل ابھی بنائی نہیں گئی۔");
  return snap.data();
}
function showSignedOut() {
  appState.profile=null;
  view("#loading",false);
  view("#portal",false);
  view("#access",true);
  view("#admin-panel",false);
}
function showSignedIn(profile){
  appState.profile=profile;
  view("#loading",false);
  view("#access",false);
  view("#portal",true);
  $("#member-name").textContent=profile.name||"Member";
  $("#member-serial").textContent=profile.serial||"";
  $("#member-role").textContent=profile.role==="owner"?"Owner / Admin":"Member";
  $("#profile-serial").textContent=profile.serial||"";
  $("#profile-username").textContent=profile.username||"";
  $("#profile-role").textContent=profile.role==="owner"?"Owner / Admin":"Member";
  $("#profile-name").value=profile.name||"";
  view("#admin-panel",profile.role==="owner");
  activateMemberHome(profile);
}
async function refreshCounts(){
  if(!auth.currentUser)return;
  const [personal,global]=await Promise.all([
    getDoc(doc(db,"memberCounts",auth.currentUser.uid)),
    getDoc(doc(db,"publicStats/global"))
  ]);
  $("#personal-total").textContent=number.format(personal.exists()?(personal.get("total")||0):0);
  $("#global-total").textContent=number.format(global.exists()?(global.get("totalRecitations")||0):0);
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
    small.textContent=[member.serial,member.username,member.disabled?"Suspended":"Active"].filter(Boolean).join(" • ");
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
onAuthStateChanged(auth,async user=>{
  if(user && (appState.registering || appState.signingIn))return;
  if(!user){showSignedOut();return;}
  view("#loading",true);
  view("#access",false);
  view("#portal",false);
  let profile;
  try {
    profile=await loadProfile(user);
  } catch(err) {
    message("#auth-message",errorText(err));
    await signOut(auth).catch(()=>{});
    showSignedOut();
    return;
  }
  // A temporary analytics or directory failure must not log out a valid member.
  showSignedIn(profile);
  refreshCounts().catch(err=>message("#reading-message",errorText(err)));
  if(profile.role==="owner") {
    refreshMembers().catch(err=>message("#admin-message",errorText(err)));
  }
});
$("#signout").addEventListener("click",async()=>{
  try{await signOut(auth);}catch(err){message("#reading-message",errorText(err));}
});
async function addRecitations(amount){
  if(appState.busy||!auth.currentUser)return;
  updateBusy(true);
  message("#reading-message","");
  try{
    await readingsSpark(amount);
    await refreshCounts();
    message("#reading-message",number.format(amount)+" درود شمار میں شامل ہو گئے۔",true);
  }catch(err){message("#reading-message",errorText(err));}
  finally{updateBusy(false);}
}
$("#add-one").addEventListener("click",()=>addRecitations(1));
$("#add-ten").addEventListener("click",()=>addRecitations(10));
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
