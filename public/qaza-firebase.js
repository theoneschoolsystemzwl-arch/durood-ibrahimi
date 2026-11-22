// Qaza data is private to the signed-in Firebase UID, not browser-wide
// demo/member number storage. A successful save is confirmed by Firestore.
import {auth,db} from "./firebase-client.js";
import {doc,getDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {normalizeQazaPlan} from "./qaza-model.js";

const qazaRef=uid=>doc(db,"memberPrivate",uid,"qaza","plan");
function uid(){
  const value=auth.currentUser?.uid;
  if(!value)throw Error("Firebase میں لاگ اِن نہیں ہیں۔");
  return value;
}
export async function qazaReadSpark(){
  const current=uid();
  const snap=await getDoc(qazaRef(current));
  if(auth.currentUser?.uid!==current)throw Error("اکاؤنٹ تبدیل ہوگیا، پرانا ریکارڈ نہیں کھولا۔");
  return snap.exists()?normalizeQazaPlan(snap.data()):null;
}
export async function qazaSaveSpark(plan){
  const current=uid();
  const value=normalizeQazaPlan(plan);
  await setDoc(qazaRef(current),{...value,updatedAt:serverTimestamp()});
  if(auth.currentUser?.uid!==current)throw Error("اکاؤنٹ تبدیل ہو گیا ہے۔");
  return value;
}
