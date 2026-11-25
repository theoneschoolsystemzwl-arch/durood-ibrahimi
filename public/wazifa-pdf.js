// Display the original PDF page as an image; no OCR or text conversion.
import {auth,db} from "./firebase-client.js";
import {doc,getDocFromServer,Bytes,writeBatch} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const root="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/";
const CHUNK=400000,MAX=25*1024*1024;
export function pdfMarker(value){
 const m=/^\[\[WZPDF:([a-f0-9]{32}):([1-9]\d{0,2}):([1-9]\d?)\]\]$/.exec(String(value??""));
 if(!m||+m[2]>500||+m[3]>66)return null;
 return {id:m[1],pages:+m[2],chunks:+m[3],marker:m[0]};
}
async function openDocument(bytes){
 const lib=await import(root+"pdf.mjs");lib.GlobalWorkerOptions.workerSrc=root+"pdf.worker.mjs";
 const task=lib.getDocument({data:bytes.slice(),isEvalSupported:false,enableXfa:false});
 try{const pdf=await task.promise;return {pdf,task};}catch(e){await task.destroy();throw e;}
}
export async function preparePdf(file){
 if(!file||file.size>MAX)throw Error("PDF کی حد 25 MB ہے۔");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw Error("درست PDF منتخب کریں۔");
 const {pdf,task}=await openDocument(bytes);
 try{
  if(!pdf.numPages||pdf.numPages>500)throw Error("PDF کی حد 500 صفحات ہے۔");
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,"0")).join("");
  const marker="[[WZPDF:"+id+":"+pdf.numPages+":"+Math.ceil(bytes.length/CHUNK)+"]]";
  return {bytes,marker};
 }finally{await task.destroy();}
}
function chunkRef(uid,scope,id,n){
 return scope==="group"?doc(db,"wazifaPdfGroup",id,"chunks",String(n)):doc(db,"wazifaPdfPrivate",scope.startsWith("shared:")?scope.slice(7):uid,"files",id,"chunks",String(n));
}
function localKey(uid,scope,id){return uid+":"+scope+":"+id;}
function localDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open("durood-pdf-images",1);r.onupgradeneeded=()=>r.result.createObjectStore("pdfs");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function localPdf(uid,scope,id,bytes){
 const database=await localDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=database.transaction("pdfs",bytes?"readwrite":"readonly"),store=tx.objectStore("pdfs");
  const req=bytes?store.put(bytes,localKey(uid,scope,id)):store.get(localKey(uid,scope,id));
  tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{database.close();}
}
function assertAccount(uid){if(auth.currentUser?.uid!==uid)throw Error("اکاؤنٹ تبدیل ہو چکا ہے۔");}
export async function savePdfAttachment(prepared,uid,scope,progress=()=>{}){
 assertAccount(uid);
 const meta=pdfMarker(prepared.marker);if(!meta)throw Error("PDF کی شناخت درست نہیں۔");
 if(scope!=="personal"&&scope!=="group")throw Error("PDF محفوظ کرنے کی اجازت نہیں۔");
 try{await localPdf(uid,scope,meta.id,prepared.bytes);}catch(e){console.debug("PDF device storage",e);}
 // Keep already committed chunks on failure so a retry can complete safely.
 // The Wazifa marker is not published until all server writes finish.
 let written=0;
 for(let offset=0;offset<meta.chunks;offset+=8){
  assertAccount(uid);const batch=writeBatch(db);
  for(let n=offset;n<Math.min(offset+8,meta.chunks);n++){
   batch.set(chunkRef(uid,scope,meta.id,n),{data:Bytes.fromUint8Array(prepared.bytes.slice(n*CHUNK,(n+1)*CHUNK))});
  }
  await batch.commit();written=Math.min(offset+8,meta.chunks);progress(written,meta.chunks);
 }
 assertAccount(uid);return {localOnly:false};
}
// Recover PDFs previously saved only on this device. Verify server presence,
// never use the local cache to claim a cross-device upload succeeded.
export async function ensurePdfCloud(value,uid,scope="personal"){
 assertAccount(uid);const meta=pdfMarker(value);if(!meta)throw Error("PDF کی شناخت درست نہیں۔");
 if(scope!=="personal"&&scope!=="group")throw Error("PDF محفوظ کرنے کی اجازت نہیں۔");
 const indices=meta.chunks===1?[0]:[0,meta.chunks-1];
 const checks=await Promise.all(indices.map(n=>getDocFromServer(chunkRef(uid,scope,meta.id,n))));
 assertAccount(uid);
 if(checks.every(s=>s.exists()))return;
 const bytes=await localPdf(uid,scope,meta.id);
 if(!(bytes instanceof Uint8Array)||!bytes.length||Math.ceil(bytes.length/CHUNK)!==meta.chunks)
  throw Error("اصل PDF پہلے موبائل سے کھولیں یا دوبارہ اپلوڈ کریں۔");
 await savePdfAttachment({marker:value,bytes},uid,scope);
}
export async function loadPdfAttachment(value,uid,scope){
 assertAccount(uid);const meta=pdfMarker(value);if(!meta)throw Error("PDF کی شناخت درست نہیں۔");
 if(!scope.startsWith("shared:"))try{const bytes=await localPdf(uid,scope,meta.id);assertAccount(uid);if(bytes instanceof Uint8Array&&bytes.length>0){
  if(scope==="personal"&&navigator.onLine!==false)void ensurePdfCloud(value,uid,scope).catch(e=>console.debug("PDF cloud repair",e));
  return bytes;
 }}catch(e){console.debug("PDF local read",e);}
 const parts=[];let size=0;
 for(let i=0;i<meta.chunks;i+=6){
  assertAccount(uid);
  const snapshots=await Promise.all(Array.from({length:Math.min(6,meta.chunks-i)},(_,k)=>getDocFromServer(chunkRef(uid,scope,meta.id,i+k))));
  for(const snap of snapshots){if(!snap.exists())throw Error("PDF اس ڈیوائس پر دستیاب نہیں۔ اصل PDF دوبارہ اپلوڈ کریں۔");const part=snap.data().data?.toUint8Array();if(!part||part.length>CHUNK)throw Error("PDF کا حصہ درست نہیں۔");parts.push(part);size+=part.length;if(size>MAX)throw Error("PDF مقررہ حد سے بڑی ہے۔");}
 }
 assertAccount(uid);const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 if(!scope.startsWith("shared:"))try{await localPdf(uid,scope,meta.id,bytes);}catch{}
 return bytes;
}
const viewers=new WeakMap();
export async function mountPdfViewer(host,bytesOrLoader,expectedPages){
 viewers.get(host)?.();
 let closed=false,task=null,renderTask=null,observer=null,visibility=null;
 const close=()=>{if(closed)return;closed=true;observer?.disconnect();visibility?.disconnect();renderTask?.cancel();if(task)void task.destroy().catch(()=>{});};
 viewers.set(host,close);
 observer=new MutationObserver(()=>{if(!host.isConnected)close();});observer.observe(document.body,{childList:true,subtree:true});
 host.innerHTML='<p class="wz-pdf-message" role="status">PDF کی تصویر لوڈ ہو رہی ہے…</p>';
 try{
  const bytes=typeof bytesOrLoader==="function"?await bytesOrLoader():bytesOrLoader;
  if(closed)return;
  const opened=await openDocument(bytes);task=opened.task;const pdf=opened.pdf;
  if(closed){await task.destroy();return;}
  if(expectedPages&&pdf.numPages!==expectedPages)throw Error("PDF کے صفحات کی تعداد درست نہیں۔");
  host.innerHTML='<div class="wz-pdf-nav" dir="rtl"><button type="button" data-pdf-scroll-toggle aria-pressed="false">اسکرول OFF</button><strong>کل '+pdf.numPages+' صفحات</strong><button type="button" data-pdf-zoom>بڑی تصویر</button></div><div class="wz-pdf-scroll is-scroll-off" tabindex="-1" aria-label="PDF کے تمام صفحات"></div><p class="wz-pdf-message" role="status"></p>';
  const scroll=host.querySelector(".wz-pdf-scroll"),toggle=host.querySelector("[data-pdf-scroll-toggle]"),zoom=host.querySelector("[data-pdf-zoom]"),msg=host.querySelector(".wz-pdf-message");
  const first=await pdf.getPage(1),initial=first.getViewport({scale:1});first.cleanup();
  if(closed)return;
  const pages=[],wanted=new Set();let running=false;
  for(let n=1;n<=pdf.numPages;n++){
   const el=document.createElement("div");el.className="wz-pdf-page";el.dataset.page=String(n);el.style.aspectRatio=initial.width+" / "+initial.height;el.setAttribute("aria-label","صفحہ "+n);scroll.appendChild(el);pages.push(el);
  }
  toggle.onclick=()=>{const on=toggle.getAttribute("aria-pressed")!=="true";toggle.setAttribute("aria-pressed",String(on));toggle.textContent=on?"اسکرول ON":"اسکرول OFF";scroll.classList.toggle("is-scroll-off",!on);scroll.toggleAttribute("data-no-pull",on);scroll.tabIndex=on?0:-1;};
  zoom.onclick=()=>{const large=host.classList.toggle("is-zoomed");zoom.textContent=large?"عام تصویر":"بڑی تصویر";};
  async function pump(){
   if(running||closed)return;running=true;
   try{
    while(!closed){
     const el=pages.find(p=>wanted.has(p)&&!p.firstChild&&!p.dataset.failed);
     if(!el)break;
     let page=null;
     try{
      page=await pdf.getPage(Number(el.dataset.page));if(closed)return;
      const b=page.getViewport({scale:1}),scale=Math.min(2.5,2200/Math.max(b.width,b.height),Math.sqrt(3500000/(b.width*b.height))),v=page.getViewport({scale});
      el.style.aspectRatio=b.width+" / "+b.height;
      const canvas=document.createElement("canvas");canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);canvas.setAttribute("role","img");canvas.setAttribute("aria-label","اصل PDF صفحہ "+el.dataset.page);
      renderTask=page.render({canvasContext:canvas.getContext("2d",{alpha:false}),viewport:v,background:"rgb(255,255,255)"});await renderTask.promise;renderTask=null;
      if(!closed&&wanted.has(el))el.appendChild(canvas);
      else {canvas.width=0;canvas.height=0;}
     }catch(e){if(!closed){el.dataset.failed="1";msg.textContent="صفحہ "+el.dataset.page+" نہیں کھل سکا: "+String(e?.message||e);}}
     finally{page?.cleanup();}
    }
   }finally{running=false;}
  }
  visibility=new IntersectionObserver(entries=>{
   for(const entry of entries){
    const el=entry.target;
    if(entry.isIntersecting){wanted.add(el);delete el.dataset.failed;}
    else {wanted.delete(el);const canvas=el.querySelector("canvas");if(canvas){canvas.width=0;canvas.height=0;canvas.remove();}}
   }
   void pump();
  },{root:scroll,rootMargin:"100% 0px",threshold:0});
  pages.forEach(el=>visibility.observe(el));
  wanted.add(pages[0]);void pump();
 }catch(e){if(!closed)host.textContent="PDF نہیں کھل سکی: "+String(e?.message||e);close();}
}
