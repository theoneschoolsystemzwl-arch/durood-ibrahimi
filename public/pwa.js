const RELEASE="shared-member-targets-20261126-v1";
const seenKey="durood-update-refresh-attempt";
function attemptedRelease(){try{return sessionStorage.getItem(seenKey);}catch{return null;}}
function markAttempt(version){try{sessionStorage.setItem(seenKey,version);}catch{}}
let checking=false,prompted=false;
async function checkRelease(){
 if(checking||prompted||navigator.onLine===false)return;
 checking=true;
 try{
  const res=await fetch("/release.json?t="+Date.now(),{cache:"no-store"});
  if(!res.ok)return;
  const data=await res.json();
  if(typeof data.version!=="string"||!data.version||data.version===RELEASE||attemptedRelease()===data.version)return;
  prompted=true;
  const button=document.createElement("button");
  button.type="button";button.textContent="نئی اپڈیٹ دستیاب ہے — ریفریش کریں";
  button.style.cssText="position:fixed;z-index:2147483647;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:12px 18px;border:1px solid #8de1ac;border-radius:10px;background:#064d39;color:white;font-weight:bold;max-width:95%;cursor:pointer";
  button.onclick=async()=>{
   const frame=document.getElementById("classic-frame");
   try{
    if(frame?.contentDocument&&!frame.contentDocument.dispatchEvent(new frame.contentWindow.CustomEvent("durood:before-refresh",{cancelable:true})))return;
    if(!document.dispatchEvent(new CustomEvent("durood:before-refresh",{cancelable:true})))return;
    markAttempt(data.version);button.disabled=true;button.textContent="اپ ڈیٹ ہو رہی ہے…";
    if("caches" in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("durood-global-shell-")).map(k=>caches.delete(k)));}
    if("serviceWorker" in navigator)await navigator.serviceWorker.getRegistration().then(r=>r?.update()).catch(()=>{});
   }catch(e){console.debug("Update refresh",e);}
   const url=new URL(location.href);url.searchParams.set("_refresh",String(Date.now()));location.replace(url.href);
  };
  document.body.appendChild(button);
 }catch(e){console.debug("Release check unavailable",e);}
 finally{checking=false;}
}
window.addEventListener("load",checkRelease);
window.addEventListener("focus",checkRelease);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void checkRelease();});
setInterval(()=>{if(!document.hidden)void checkRelease();},60000);
// Update the service worker without forcing a reload in the middle of a
// Firebase session, a form submission, or a recitation count.
if("serviceWorker" in navigator && location.protocol==="https:"){
  async function checkWorker(){
    try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}catch(error){console.debug("PWA update check skipped",error?.message);}
  }
  window.addEventListener("focus",checkWorker);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)void checkWorker();});
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"});
      // Next normal navigation picks up the updated version. In particular,
      // controllerchange must NOT reload an active Android WebView.
      reg.update().catch(error=>console.debug("PWA update unavailable:",error?.message));
    }catch(error){console.debug("PWA update check skipped:",error?.message);}
  });
}
