// Firebase-authenticated account interface. This file replaces demo login on integration.
// Firebase Auth stores the deterministic internal email alias; users see only username.
import {auth, db} from "./firebase-client.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const projectId = "durood-e-ibrahimi-global-c74e0";
const functions = getFunctions(auth.app,"asia-southeast2");
const cleanName = value => String(value || "").trim().toLowerCase();
function aliasEmail(username) {
  const clean = cleanName(username);
  if (!/^[a-z0-9._-]{3,24}$/.test(clean) || /^di-\d+$/.test(clean)) {
    throw Error("Enter a valid username, not a DI member number.");
  }
  return clean + "@" + projectId + ".firebaseapp.com";
}
export async function login(username,password) {
  const credential = await signInWithEmailAndPassword(auth, aliasEmail(username),password);
  const docSnap = await getDoc(doc(db,"members",credential.user.uid));
  if (!docSnap.exists() || docSnap.data().disabled === true) {
    await signOut(auth);
    throw Error("This member profile is unavailable or disabled.");
  }
  return {uid:credential.user.uid,...docSnap.data()};
}
export async function register({name,username,password,inviteCode,pledgeAccepted}) {
  if (!pledgeAccepted) throw Error("Accept the registration pledge.");
  // Do not submit any member number; the server assigns DI-2, DI-3, ...
  const response = await httpsCallable(functions,"registerMember")({
    name,username,password,inviteCode,pledgeAccepted:true
  });
  const member = await login(username,password);
  return {member,...response.data};
}
export async function createInvitation() {
  const response = await httpsCallable(functions,"createInvitation")({});
  return response.data.code;
}
export async function setMemberActive(uid,active) {
  return (await httpsCallable(functions,"setMemberActive")({uid,active})).data;
}
export async function updateMyProfile(name) {
  return (await httpsCallable(functions,"updateMyProfile")({name})).data;
}
export {signOut,onAuthStateChanged,auth};
