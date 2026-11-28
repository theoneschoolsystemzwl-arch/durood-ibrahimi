import {auth,db,firebaseConfig} from "./firebase-client.js";
import {aliasEmail} from "./spark-data.js?release=member-visibility-20261127-v1";
import {initializeApp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {initializeAuth,inMemoryPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut,verifyPasswordResetCode,confirmPasswordReset} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,collection,where,query,onSnapshot,getDocFromServer,setDoc,serverTimestamp,runTransaction} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const requests="memberRecoveryRequests";
const normalize=id=>id.trim().normalize("NFKC").toLowerCase();
let googleAuth;
let issuing=false;

const projectClientId="277153649028-4mt9dsr000h62bn3np6o6l985e6o0f8o.apps.googleusercontent.com";
const identityScope="https://www.googleapis.com/auth/identitytoolkit";
let loadingGoogle;

export function prepareApproval(){
  if(location.hostname!==firebaseConfig.authDomain || window.google?.accounts?.oauth2)return Promise.resolve();
  if(!loadingGoogle)loadingGoogle=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://accounts.google.com/gsi/client";script.async=true;
    script.onload=resolve;
    script.onerror=()=>{loadingGoogle=null;script.remove();reject(Error("Google سے رابطہ نہیں ہوا۔ دوبارہ کوشش کریں۔"));};
    document.head.append(script);
  });
  return loadingGoogle;
}

function projectToken(){
  // This origin is the project's own OAuth host. Authorize the Google API
  // directly without performing another Firebase sign-in for the owner.
  if(location.hostname===firebaseConfig.authDomain){
    return new Promise((resolve,reject)=>{
      const oauth=window.google?.accounts?.oauth2;
      if(!oauth){reject(Error("Google کی تصدیق لوڈ ہونے دیں، پھر دوبارہ دبائیں۔"));return;}
      const client=oauth.initTokenClient({
        client_id:projectClientId,scope:identityScope,include_granted_scopes:false,
        callback:r=>r.access_token?resolve(r.access_token):reject(Error("Google کی اجازت مکمل نہیں ہوئی۔")),
        error_callback:()=>reject(Error("Google کی تصدیق کے لیے اسی صفحے کو Chrome میں کھولیں اور پاپ اَپ کی اجازت دیں۔"))
      });
      client.requestAccessToken({prompt:"select_account"});
    });
  }
  googleAuth??=initializeAuth(initializeApp(firebaseConfig,"member-code-approval"),{
    persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver});
  const provider=new GoogleAuthProvider();provider.addScope(identityScope);
  return signInWithPopup(googleAuth,provider).then(result=>GoogleAuthProvider.credentialFromResult(result)?.accessToken);
}

export async function requestOwnerApproval(id){
  const username=normalize(id);
  await aliasEmail(username);
  await setDoc(doc(db,requests,username),{status:"pending",requestedAt:serverTimestamp()});
}

export function watchRecoveryRequests(show,fail){
  return onSnapshot(query(collection(db,requests),where("status","==","pending")),snap=>show(snap.docs.map(d=>d.id)),fail);
}

async function adminCall(action,token,body){
  const result=await fetch("https://identitytoolkit.googleapis.com/v1/projects/"+firebaseConfig.projectId+"/accounts:"+action,{
    method:"POST",credentials:"omit",cache:"no-store",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  if(!result.ok)throw Error(result.status===403?"پروجیکٹ کے مجاز Google اکاؤنٹ سے اجازت دیں۔":"Firebase نے کوڈ جاری نہیں کیا ("+result.status+")۔");
  return result.json();
}

export async function approveRecovery(uid,loginId,selected){
  if(issuing)throw Error("پہلی درخواست مکمل ہونے دیں۔");
  const username=normalize(loginId),owner=auth.currentUser?.uid;
  const valid=()=>owner && owner!==uid && auth.currentUser?.uid===owner && selected();
  if(!valid())throw Error("اونر کے اکاؤنٹ سے رکن کی پروفائل کھولیں۔");
  issuing=true;
  try{
    const token=await projectToken();
    const ref=doc(db,requests,username);
    const [request,profile,alias]=await Promise.all([getDocFromServer(ref),getDocFromServer(doc(db,"members",uid)),aliasEmail(username)]);
    const member=profile.data(),pending=request.data();
    if(!valid()||!token||!pending||member?.username!==username||member.role!=="member"||member.disabled||member.deleted)throw Error("اس فعال رکن کی زیرِ التوا درخواست درکار ہے۔");
    const {users=[]}=await adminCall("lookup",token,{localId:[uid]});
    const user=users[0],claims=JSON.parse(user?.customAttributes||"{}");
    if(!valid()||users.length!==1||user.localId!==uid||user.disabled||claims.owner||claims.admin||user.email?.toLowerCase()!==alias)throw Error("رکن کی لاگ اِن آئی ڈی کی تصدیق نہیں ہوئی۔");
    const attempt=crypto.randomUUID();
    await runTransaction(db,async tx=>{
      const current=(await tx.get(ref)).data();
      if(!valid()||!current||!current.requestedAt.isEqual(pending.requestedAt))throw Error("درخواست تبدیل ہو گئی ہے۔");
      if(current.status!=="pending" && Date.now()-(current.approvedAt?.toMillis()||0)<120000)
        throw Error("کوڈ پہلے جاری ہو چکا ہے یا جاری ہو رہا ہے۔ دو منٹ بعد دوبارہ کوشش کریں۔");
      tx.update(ref,{status:"issuing",attempt,approvedAt:serverTimestamp()});
    });
    const settle=async status=>runTransaction(db,async tx=>{
      const current=(await tx.get(ref)).data();
      if(current?.attempt!==attempt||current.status!=="issuing")throw Error("نئی درخواست منتخب کریں۔");
      tx.update(ref,{status,approvedAt:serverTimestamp()});
    });
    let code;
    try{
      const {oobLink}=await adminCall("sendOobCode",token,{requestType:"PASSWORD_RESET",email:alias,returnOobLink:true});
      code=new URL(oobLink).searchParams.get("oobCode");
      if(!code||!valid())throw Error("رکن کی پروفائل دوبارہ کھولیں۔");
      await settle("approved");
    }catch(error){await settle("pending").catch(()=>{});throw error;}
    return code;
  }finally{issuing=false;if(googleAuth)await signOut(googleAuth).catch(()=>{});}
}

export async function checkRecoveryCode(id,code){
  const expected=await aliasEmail(normalize(id));
  if((await verifyPasswordResetCode(auth,code.trim())).toLowerCase()!==expected)throw Error("آئی ڈی اور کوڈ ایک ہی رکن کے ہونے چاہئیں۔");
}

export async function redeemRecoveryCode(id,code,password,confirm){
  if(password!==confirm||password.length<8||password.length>128)throw Error("دونوں خانوں میں ایک ہی پاس ورڈ لکھیں، 8 سے 128 حروف تک۔");
  await checkRecoveryCode(id,code);
  await confirmPasswordReset(auth,code.trim(),password);
}
