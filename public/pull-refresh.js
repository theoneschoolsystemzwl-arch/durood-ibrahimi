// Pull down from the top to fetch the newest live Firebase website.
(()=>{
 "use strict";
 // Explicit refresh works on any device, including Android WebViews.
 const LIMIT=88;
 let touch=null, refreshing=false, indicator=null, hideTimer=null;
 const isControl=el=>el?.closest?.("button,a,input,select,textarea,label,summary,[contenteditable],[role=button],[data-no-pull],.dial,.wz-dial");
 function scrollableAbove(el){
  const doc=document.scrollingElement||document.documentElement;
  if(window.scrollY>2||doc.scrollTop>2||document.body.scrollTop>2)return true;
  for(let node=el;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement){
   if(node.scrollTop>2&&node.scrollHeight>node.clientHeight+2)return true;
  }
  return false;
 }
 function show(message,offset=0){
  if(!indicator){
   indicator=document.createElement("div");
   indicator.id="durood-pull-indicator";
   indicator.setAttribute("role","status");
   indicator.setAttribute("aria-live","polite");
   indicator.style.cssText="position:fixed;z-index:2147483600;left:50%;top:max(8px,env(safe-area-inset-top));transform:translate(-50%,-125%);opacity:0;transition:transform .16s ease,opacity .16s ease;max-width:92%;min-width:160px;box-sizing:border-box;text-align:center;background:#064d39;color:#fff;border:1px solid #62d5a0;border-radius:999px;padding:9px 15px;box-shadow:0 4px 20px #00211766;font:700 14px/1.5 system-ui,sans-serif;pointer-events:none;direction:rtl";
   document.body.appendChild(indicator);
  }
  clearTimeout(hideTimer);
  indicator.textContent=message;
  indicator.style.opacity="1";
  indicator.style.transform="translate(-50%,"+Math.min(45,offset/4)+"px)";
 }
 function hide(delay=0){
  clearTimeout(hideTimer);
  hideTimer=setTimeout(()=>{
   if(!indicator)return;
   indicator.style.opacity="0";
   indicator.style.transform="translate(-50%,-125%)";
  },delay);
 }
 async function fetchLatest(){
  if(refreshing)return;
  const before=new CustomEvent("durood:before-refresh",{cancelable:true});
  let allowed=document.dispatchEvent(before);
  try{
   if(window.top!==window&&window.top.location.origin===location.origin)
    allowed=window.top.document.dispatchEvent(new window.top.CustomEvent("durood:before-refresh",{cancelable:true}))&&allowed;
   else {const frame=document.getElementById("classic-frame");if(frame?.contentDocument&&frame.contentWindow)
    allowed=frame.contentDocument.dispatchEvent(new frame.contentWindow.CustomEvent("durood:before-refresh",{cancelable:true}))&&allowed;}
  }catch(error){console.debug("Refresh guard unavailable",error);}
  if(!allowed){
   show("گنتی محفوظ ہو رہی ہے، دوبارہ کوشش کریں");
   hide(1800);
   return;
  }
  if(navigator.onLine===false){
   show("انٹرنیٹ دستیاب نہیں، دوبارہ کوشش کریں");
   hide(1800);
   return;
  }
  refreshing=true;
  // Only acknowledge the update after all save guards and connectivity checks pass.
  try{window.top.dispatchEvent(new window.top.Event("durood:refresh-accepted"));}catch{window.dispatchEvent(new Event("durood:refresh-accepted"));}
  show("اپ ڈیٹ چیک ہو رہی ہے…",90);
  // Network-first service worker and cache-busted navigation fetch the new shell.
  // Never wait indefinitely on a worker update, or remove offline fallback assets.
  if("serviceWorker" in navigator){
   try{await Promise.race([
     navigator.serviceWorker.getRegistration().then(reg=>reg?.update()).catch(()=>{}),
     new Promise(resolve=>setTimeout(resolve,1200))
   ]);}catch(error){console.debug("Refresh SW update skipped",error);}
  }
  // The dashboard runs in a same-origin iframe: reload its parent too so the
  // login portal, embedded dashboard, styles and scripts are all refreshed.
  try{
   const topWindow=window.top;
   if(topWindow!==window&&topWindow.location.origin===location.origin){
    const latest=new URL(topWindow.location.href);
    latest.searchParams.set("_refresh",String(Date.now()));
    topWindow.location.replace(latest.href);
    return;
   }
  }catch(error){console.debug("Parent refresh unavailable",error);}
  const latest=new URL(location.href);
  latest.searchParams.set("_refresh",String(Date.now()));
  location.replace(latest.href);
 }
 window.duroodRefreshPage=fetchLatest;
 document.addEventListener("click",event=>{
  if(event.target?.closest?.("[data-durood-refresh]")){event.preventDefault();event.stopImmediatePropagation();void fetchLatest();}
 },true);
 document.addEventListener("touchstart",event=>{
  touch=null;
  if(refreshing||event.touches.length!==1||!document.body)return;
  const origin=event.target instanceof Element?event.target:null;
  if(!origin||isControl(origin)||scrollableAbove(origin))return;
  touch={x:event.touches[0].clientX,y:event.touches[0].clientY,dy:0,cancelled:false};
 },{passive:true,capture:true});
 document.addEventListener("touchmove",event=>{
  if(!touch||refreshing)return;
  if(event.touches.length!==1){touch=null;hide();return;}
  const dx=event.touches[0].clientX-touch.x;
  const dy=event.touches[0].clientY-touch.y;
  if(dy<0 || (Math.abs(dx)>18&&Math.abs(dx)>dy*1.15)){
   touch.cancelled=true;hide();return;
  }
  if(dy<12||touch.cancelled)return;
  if(scrollableAbove(event.target)){touch.cancelled=true;hide();return;}
  touch.dy=dy;
  if(event.cancelable)event.preventDefault();
  show(dy>=LIMIT?"چھوڑیں تو ایپ ریفریش ہوگی":"نیچے کھینچیں، اپ ڈیٹ کریں",dy);
 },{passive:false,capture:true});
 document.addEventListener("touchend",()=>{
  if(!touch)return;
  const pulled=!touch.cancelled&&touch.dy>=LIMIT;
  touch=null;
  if(pulled)void fetchLatest();
  else hide();
 },{passive:true});
 document.addEventListener("touchcancel",()=>{touch=null;hide();},{passive:true});
})();
