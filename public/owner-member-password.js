// Spark-compatible administrator password reset. No Cloud Shell, email, or service-account keys.
// Set a public Web OAuth client ID after configuring its authorized HTTPS origins.
// Never put a client secret or access token here.
export const OWNER_PASSWORD_OAUTH_CLIENT_ID = "";
const project = "durood-e-ibrahimi-global-c74e0";
const scope = "https://www.googleapis.com/auth/identitytoolkit";
const protectedUid = "vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const endpoint = "https://identitytoolkit.googleapis.com/v1/projects/"+project+"/accounts:";
let sdkPromise;
let busy = false;
const configured = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(OWNER_PASSWORD_OAUTH_CLIENT_ID);
const strings = {
  ur:{setup:"پاس ورڈ ری سیٹ کے لیے Google کی انتظامی اجازت ابھی ترتیب نہیں دی گئی۔",loading:"Google اجازت تیار ہو رہی ہے، دوبارہ Save دبائیں۔",invalid:"نیا پاس ورڈ 8 سے 128 حروف کا ہو اور دونوں خانے ایک جیسے ہوں۔",owner:"صرف تصدیق شدہ اونر یہ کام کر سکتا ہے۔",target:"فعال عام رکن کی تصدیق نہیں ہوئی۔",denied:"Google کی انتظامی اجازت نہیں ملی۔ اپنے مجاز Google اکاؤنٹ سے دوبارہ کوشش کریں۔",failed:"پاس ورڈ تبدیلی کی تصدیق نہیں ہوئی۔ دوبارہ کوشش سے پہلے رکن کا لاگ اِن چیک کریں۔",working:"Google اجازت اور ممبر کی تصدیق ہو رہی ہے…",done:"نیا پاس ورڈ محفوظ ہو گیا۔ ممبر نمبر، گروپ اور ریکارڈ تبدیل نہیں ہوئے۔"},
  en:{setup:"Google administrator authorization has not been configured.",loading:"Google authorization is loading. Press Save again.",invalid:"Use 8–128 characters and matching passwords.",owner:"Only the verified owner can do this.",target:"An active ordinary member could not be verified.",denied:"Google administrator authorization was not granted. Try your authorized Google account.",failed:"Password change could not be confirmed. Check the member login before trying again.",working:"Authorizing and verifying the member…",done:"New password saved. Member number, group and records were not changed."},
  id:{setup:"Otorisasi administrator Google belum dikonfigurasi.",loading:"Otorisasi Google sedang dimuat. Tekan Simpan lagi.",invalid:"Gunakan 8–128 karakter dan kata sandi yang sama.",owner:"Hanya pemilik terverifikasi yang dapat melakukan ini.",target:"Anggota biasa yang aktif tidak dapat diverifikasi.",denied:"Otorisasi administrator Google tidak diberikan. Gunakan akun Google yang berwenang.",failed:"Perubahan kata sandi tidak dapat dikonfirmasi. Periksa login anggota sebelum mencoba lagi.",working:"Mengotorisasi dan memverifikasi anggota…",done:"Kata sandi baru tersimpan. Nomor anggota, grup, dan data tidak diubah."}
};
function say(form,key,ok=false){
  const node=form.querySelector("[data-owner-reset-status]");
  if(!node)return;
  const lang=document.documentElement.lang.split("-")[0];
  node.textContent=(strings[lang]||strings.ur)[key];
  node.classList.toggle("success",ok);
  node.setAttribute("role","status");
}
function loadGoogle(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
    const tag=document.createElement("script");
    tag.src="https://accounts.google.com/gsi/client";
    tag.async=true;
    tag.onload=()=>globalThis.google?.accounts?.oauth2?resolve():reject(new Error("sdk"));
    tag.onerror=()=>{tag.remove();reject(new Error("sdk"));};
    document.head.append(tag);
  }).catch(e=>{sdkPromise=null;throw e;});
  return sdkPromise;
}
function requestGoogleToken(){
  // This call must stay synchronous with the owner's submit gesture.
  return new Promise((resolve,reject)=>{
    const client=globalThis.google.accounts.oauth2.initTokenClient({
      client_id:OWNER_PASSWORD_OAUTH_CLIENT_ID,scope,include_granted_scopes:false,
      callback:response=>{
        if(response.error||!response.access_token||!globalThis.google.accounts.oauth2.hasGrantedAllScopes(response,scope)){
          reject(new Error("denied"));return;
        }
        resolve(response.access_token);
      },
      error_callback:()=>reject(new Error("denied"))
    });
    client.requestAccessToken({prompt:"select_account"});
  });
}
async function call(action,token,body){
  const response=await fetch(endpoint+action,{
    method:"POST",credentials:"omit",cache:"no-store",redirect:"error",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if(!response.ok)throw new Error(response.status===401||response.status===403?"denied":"failed");
  return response.json();
}
export function eligibleMember(uid,profile,account){
  if(typeof uid!=="string"||! /^[A-Za-z0-9_-]{1,128}$/.test(uid)||uid===protectedUid)return false;
  if(!profile||profile.uid!==uid||profile.role!=="member"||profile.deleted===true||profile.disabled===true||profile.active===false)return false;
  if(!account||account.localId!==uid||account.disabled===true)return false;
  let claims;
  try{claims=JSON.parse(account.customAttributes||"{}");}catch{return false;}
  return !!claims && typeof claims==="object" && claims.owner!==true && claims.admin!==true;
}
export function installOwnerPasswordReset({isVerifiedOwner,loadTarget}){
  const formSelector="#owner-member-password-form";
  const prepare=()=>{
    const form=document.querySelector(formSelector);
    if(!form||!isVerifiedOwner())return;
    if(!configured){form.querySelector('button[type="submit"]').disabled=true;say(form,"setup");return;}
    if(!globalThis.google?.accounts?.oauth2)void loadGoogle().catch(()=>{if(form.isConnected)say(form,"denied");});
  };
  const observer=new MutationObserver(prepare);
  observer.observe(document.getElementById("app"),{childList:true,subtree:true});
  prepare();
  document.addEventListener("submit",async event=>{
    const form=event.target;
    if(!form.matches?.(formSelector))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(busy)return;
    if(!isVerifiedOwner()){form.reset();say(form,"owner");return;}
    if(!configured){form.reset();say(form,"setup");return;}
    const uid=form.dataset.uid;
    const password=form.elements.newPassword.value;
    if(password.length<8||password.length>128||password!==form.elements.confirmPassword.value){
      say(form,"invalid");return;
    }
    if(!globalThis.google?.accounts?.oauth2){
      say(form,"loading");void loadGoogle().catch(()=>say(form,"denied"));return;
    }
    const button=form.querySelector('button[type="submit"]');
    busy=true;button.disabled=true;say(form,"working");
    let token;
    try{
      token=await requestGoogleToken();
      if(!form.isConnected||!isVerifiedOwner())throw new Error("owner");
      const profile=await loadTarget(uid);
      const result=await call("lookup",token,{localId:[uid]});
      if(result.users?.length!==1||!eligibleMember(uid,profile,result.users[0]))throw new Error("target");
      if(!form.isConnected||!isVerifiedOwner()||form.dataset.uid!==uid)throw new Error("owner");
      const updated=await call("update",token,{localId:uid,password,returnSecureToken:false});
      if(updated.localId!==uid)throw new Error("failed");
      say(form,"done",true);
    }catch(e){
      say(form,["owner","target","denied"].includes(e?.message)?e.message:"failed");
    }finally{
      // Drop token and clear both password fields; never store or log either.
      token=undefined;form.reset();busy=false;if(form.isConnected)button.disabled=false;
    }
  },true);
}
