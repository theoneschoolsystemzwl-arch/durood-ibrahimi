// Shared accounting time: Pakistan UTC+05:00. Private tasks and prayers keep local time.
import {auth,db} from "./firebase-client.js";
import {doc,setDoc,getDocFromServer,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const OFFSET=5*3600000, DAY=86400000;
let anchor=null,flight=null;
export function globalNow(){
  return anchor?anchor.epoch+Math.max(0,performance.now()-anchor.mono):Date.now();
}
export function globalDay(date=new Date(globalNow())){
  return new Date(date.getTime()+OFFSET).toISOString().slice(0,10);
}
export function globalDayEnd(day=globalDay()){
  return Date.parse(day+"T00:00:00Z")+DAY-OFFSET;
}
export function globalWeekStart(day=globalDay()){
  const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
export function globalClockVerified(){return !!anchor;}
export async function syncGlobalClock(){
  const uid=auth.currentUser?.uid;
  if(!uid||navigator.onLine===false)return false;
  if(flight)return flight;
  flight=(async()=>{
    try{
      const ref=doc(db,"globalClock",uid);
      await setDoc(ref,{at:serverTimestamp()});
      const snap=await getDocFromServer(ref);
      const epoch=snap.data()?.at?.toMillis?.();
      if(auth.currentUser?.uid!==uid||!Number.isFinite(epoch))return false;
      anchor={epoch,mono:performance.now()};return true;
    }catch(e){console.warn("Pakistan clock sync unavailable",e?.code||e);return false;}
    finally{flight=null;}
  })();
  return flight;
}
window.duroodGlobalClock={now:globalNow,day:globalDay,end:globalDayEnd,week:globalWeekStart,verified:globalClockVerified,sync:syncGlobalClock};
