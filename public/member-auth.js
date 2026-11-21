// Spark-plan member interface: Firebase Authentication + validated Firestore writes.
// No paid Cloud Functions are required for account, invitation, or member operations.
import {auth,db} from "./firebase-client.js";
import {signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  aliasEmail,registerSpark,invitationSpark,memberActiveSpark,profileNameSpark
} from "./spark-data.js";
export async function login(username,password){
  const credential=await signInWithEmailAndPassword(auth,aliasEmail(username),password);
  const member=await getDoc(doc(db,"members",credential.user.uid));
  if(!member.exists()||member.data().disabled===true){
    await signOut(auth);
    throw Error("ممبر کا اکاؤنٹ موجود نہیں یا بند کر دیا گیا ہے۔");
  }
  return {uid:credential.user.uid,...member.data()};
}
export async function register(data){
  return registerSpark(data);
}
export async function createInvitation(){return invitationSpark();}
export async function setMemberActive(uid,active){return memberActiveSpark(uid,active);}
export async function updateMyProfile(name){return profileNameSpark(name);}
export {signOut,onAuthStateChanged,auth};
