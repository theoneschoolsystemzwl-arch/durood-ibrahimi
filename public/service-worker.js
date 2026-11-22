// Network-first app shell. Never caches personal member records, Firebase API responses,
// OAuth credentials, or third-party CDN requests. Online launches fetch latest deploy.
const SHELL_CACHE="durood-global-shell-v5";
const ALLOWED=new Set([
  "/","/index.html","/classic-app.html","/arabic-fonts.css","/styles.css","/app.js","/community-pages.js",
  "/password-change.js","/member-auth.js","/firebase-client.js",
  "/spark-data.js","/profile-contacts.js",
  "/manifest.webmanifest","/app-icon.svg","/about-founder-photo.svg","/about-teacher-photo.svg","/tasbih-calligraphy.webp"
]);
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith("durood-global-shell-")&&name!==SHELL_CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || !ALLOWED.has(url.pathname))return;
  event.respondWith((async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
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
      const cached=await caches.match(request);
      if(cached)return cached;
      throw error;
    }
  })());
});
