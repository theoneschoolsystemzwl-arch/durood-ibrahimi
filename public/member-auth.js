// Spark-plan member interface: Firebase Authentication + validated Firestore writes.
// No paid Cloud Functions are required for account, invitation, or member operations.
import {auth,db} from "./firebase-client.js";
import {signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  aliasEmail,registerSpark,invitationSpark,memberActiveSpark,profileNameSpark
} from "./spark-data.js";
export async function login(usernameOrEmail,password){
  const entered=String(usernameOrEmail||"").trim();
  // Existing members can continue with a short username, while an owner
  // whose Firebase Authentication identity is a full email may sign in
  // with that exact address. Never truncate the email to 24 characters.
  const email=entered.includes("@")?entered.toLowerCase():aliasEmail(entered);
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    throw Error("Enter a valid Username or full Email address.");
  }
  let credential;
  try {
    credential=await signInWithEmailAndPassword(auth,email,password);
  } catch(error) {
    // Preserve Firebase's actual diagnostic code; never log or expose passwords.
    error.loginStage="firebase-auth";
    throw error;
  }
  let member;
  try {
    member=await getDoc(doc(db,"members",credential.user.uid));
  } catch(error) {
    error.loginStage="firestore-profile";
    throw error;
  }
  if(!member.exists()||member.data().disabled===true){
    const failure=new Error(member.exists()
      ?"Firebase پاس ورڈ قبول کر چکا ہے، مگر یہ ممبر اکاؤنٹ غیر فعال ہے۔"
      :"Firebase پاس ورڈ قبول کر چکا ہے، مگر Owner/Members کا Firestore پروفائل موجود نہیں۔");
    failure.loginStage="missing-member-profile";
    await signOut(auth);
    throw failure;
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
