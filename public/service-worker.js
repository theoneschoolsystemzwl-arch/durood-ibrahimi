// Network-first app shell. Never caches personal member records, Firebase API responses,
// OAuth credentials, or third-party CDN requests. Online launches fetch latest deploy.
const SHELL_CACHE="durood-global-shell-v126"; // retain existing offline assets across releases
const ALLOWED=new Set([
  "/","/index.html","/classic-app","/classic-app.html","/pull-refresh.js","/pwa.js","/arabic-fonts.css","/styles.css","/app.js","/community-pages.js",
  "/member-recovery.js","/owner-recovery.js","/password-change.js","/member-auth.js","/firebase-client.js","/ui-locale.js","/static-locale.js","/app-theme.js","/theme-contrast.css","/emerald.css","/prayer-calendar-fix.css",
  "/spark-data.js","/global-clock.js","/hijri-session.js","/profile-contacts.js","/wazaif.js","/wazifa-pdf.js","/wazaif-counter.js","/tasbih-durable-sync.js","/wazifa-sharing.js","/wazaif.css","/wazaif-rollover.css",
  "/offline-session.js","/qaza-firebase.js","/group-side-rollup.js","/member-side-serial.js","/fonts/NotoNastaliqUrdu.woff","/manifest.webmanifest","/app-icon.svg","/about-founder-photo.svg","/about-teacher-photo.svg","/tasbih-calligraphy.webp","/wazifa-arch.svg","/dashboard-reference.css","/dashboard-arch.svg"
]);
const staticAllowed=url=>url.origin===self.location.origin?ALLOWED.has(url.pathname):url.origin==="https://www.gstatic.com"&&/^\/firebasejs\/13\.4\.0\/[A-Za-z0-9_.-]+\.js$/.test(url.pathname);
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("message",event=>{
 if(event.data?.type!=="durood-warm-shell"||!Array.isArray(event.data.urls))return;
 event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);for(const value of [...new Set(event.data.urls)].slice(0,180)){try{const url=new URL(value);if(!staticAllowed(url))continue;const request=new Request(url.href,{mode:"cors",credentials:"omit"});if(await cache.match(request))continue;const res=await fetch(request);if(res.ok)await cache.put(request,res);}catch{}}})());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith("durood-global-shell-")&&name!==SHELL_CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
// Network-first for HTML, JS, and CSS; fallback to cached assets offline.
// Never show an old cached profile design when a newer live CSS is reachable.
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(!staticAllowed(url))return;
  const isHtml=url.pathname==="/" || url.pathname==="/index.html" || url.pathname==="/classic-app.html" || url.pathname==="/classic-app";
  event.respondWith((async()=>{
    const cached=await caches.match(request) || (isHtml?await caches.match(url.origin+url.pathname,{ignoreSearch:true}):null);
    if(cached&&self.navigator.onLine===false)return cached;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),isHtml?9000:6500);
    try{
      const fresh=await fetch(request,{cache:"no-store",signal:controller.signal});
      clearTimeout(timeout);
      if(fresh.ok){
        const cache=await caches.open(SHELL_CACHE);
        await cache.put(request,fresh.clone());
      }
      return fresh;
    }catch(error){
      clearTimeout(timeout);
      // Do not silently use an obsolete shell on an online refresh.
      if(cached)return cached;
      throw error;
    }
  })());
});
