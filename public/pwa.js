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
