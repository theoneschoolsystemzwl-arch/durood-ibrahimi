// Network-first app shell. Never caches personal member records, Firebase API responses,
// OAuth credentials, or third-party CDN requests. Online launches fetch latest deploy.
const SHELL_CACHE="durood-global-shell-v74";
const ALLOWED=new Set([
  "/","/index.html","/classic-app","/classic-app.html","/pull-refresh.js","/pwa.js","/arabic-fonts.css","/styles.css","/app.js","/community-pages.js",
  "/password-change.js","/member-auth.js","/firebase-client.js",
  "/spark-data.js","/global-clock.js","/hijri-session.js","/profile-contacts.js","/wazaif.js","/wazifa-pdf.js","/wazaif-counter.js","/tasbih-durable-sync.js","/wazifa-sharing.js","/wazaif.css","/wazaif-rollover.css",
  "/fonts/NotoNastaliqUrdu.woff","/manifest.webmanifest","/app-icon.svg","/about-founder-photo.svg","/about-teacher-photo.svg","/tasbih-calligraphy.webp","/wazifa-arch.svg","/dashboard-reference.css","/dashboard-arch.svg"
]);
self.addEventListener("install",()=>self.skipWaiting());
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
  if(url.origin!==self.location.origin || !ALLOWED.has(url.pathname))return;
  const isHtml=url.pathname==="/" || url.pathname==="/index.html" || url.pathname==="/classic-app.html" || url.pathname==="/classic-app";
  event.respondWith((async()=>{
    const cached=await caches.match(request);
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
      if(cached && self.navigator.onLine===false)return cached;
      throw error;
    }
  })());
});
