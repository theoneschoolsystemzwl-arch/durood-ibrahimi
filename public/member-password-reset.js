// Use an isolated, memory-only Google session for the project administrator.
// The portal's email/password session continues to identify the app owner.
import {initializeApp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {initializeAuth,inMemoryPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDocFromServer} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {auth,db,firebaseConfig} from "./firebase-client.js";

let adminAuth;
const ownerUid="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
const endpoint="https://identitytoolkit.googleapis.com/v1/projects/"+firebaseConfig.projectId+"/accounts:";

async function adminRequest(action,token,body){
  const response=await fetch(endpoint+action,{
    method:"POST",cache:"no-store",credentials:"omit",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if(!response.ok)throw new Error(response.status===403?"permission":"request");
  return response.json();
}

export async function resetMemberPassword(uid,password,stillSelected){
  const authorized=()=>auth.currentUser?.uid===ownerUid && uid && uid!==ownerUid && stillSelected();
  if(!authorized()||password.length<8||password.length>128)throw new Error("member");
  adminAuth??=initializeAuth(initializeApp(firebaseConfig,"member-recovery"),{
    persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver
  });
  const google=new GoogleAuthProvider();
  google.addScope("https://www.googleapis.com/auth/identitytoolkit");
  google.setCustomParameters({prompt:"select_account"});
  try{
    const result=await signInWithPopup(adminAuth,google);
    const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if(!token||!authorized())throw new Error("member");
    const profile=(await getDocFromServer(doc(db,"members",uid))).data();
    if(profile?.role!=="member"||profile.deleted||profile.disabled)throw new Error("member");
    const {users=[]}=await adminRequest("lookup",token,{localId:[uid]});
    const user=users[0];
    const claims=JSON.parse(user?.customAttributes||"{}");
    if(users.length!==1||user.localId!==uid||user.disabled||claims.admin||claims.owner||!authorized())throw new Error("member");
    const saved=await adminRequest("update",token,{localId:uid,password,returnSecureToken:false});
    if(saved.localId!==uid)throw new Error("request");
  }finally{
    await signOut(adminAuth).catch(()=>{});
  }
}
