import {auth,db} from "./firebase-client.js";
import "./password-change.js";
import {
  login, register, createInvitation, setMemberActive, updateMyProfile, signOut, onAuthStateChanged
} from "./member-auth.js";
import {readingsSpark} from "./spark-data.js";
import {doc,getDoc,getDocs,collection} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

import {initializeCommunityPages,activateMemberHome} from "./community-pages.js";

initializeCommunityPages();
const $=selector=>document.querySelector(selector);
const appState={tab:"login",profile:null,busy:false,registering:false,loadingAuth:true};

const number=new Intl.NumberFormat("en-US");

function view(selector,visible) {$(selector).hidden=!visible;}
function message(selector,text,ok=false) {
  const element=$(selector);
  element.textContent=text||"";
  element.classList.toggle("ok",!!ok);
}
function errorText(err) {
  const code=err?.code||"";
  if(code==="auth/invalid-credential"||code==="auth/wrong-password"||code==="auth/user-not-found")
    return "یوزر نیم یا پاس ورڈ درست نہیں۔";
  if(code==="auth/too-many-requests")return "بہت زیادہ کوششیں ہوئیں۔ کچھ دیر بعد دوبارہ کوشش کریں۔";
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

$("#access-form").addEventListener("submit",async event=>{
  event.preventDefault();
  if(appState.busy)return;
  const form=new FormData(event.currentTarget);
  updateBusy(true);
  message("#auth-message","");
  try{
    if(appState.tab==="login"){
      await login(form.get("loginUsername"),form.get("loginPassword"));
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
  if(user && appState.registering)return;
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
