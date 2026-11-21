// When launched from an existing install, prefer the newest hosted web release.
if("serviceWorker" in navigator && location.protocol==="https:"){
  window.addEventListener("load",async()=>{
    try{
      const originallyControlled=Boolean(navigator.serviceWorker.controller);
      let reloaded=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(originallyControlled && !reloaded){
          reloaded=true;
          window.location.reload();
        }
      });
      const reg=await navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"});
      await reg.update();
    }catch(error){console.debug("PWA update check skipped:",error?.message);}
  });
}
