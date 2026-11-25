// Display the original PDF page as an image; no OCR or text conversion.
import {auth,db} from "./firebase-client.js";
import {doc,getDoc,setDoc,Bytes,writeBatch} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
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
 return scope==="group"?doc(db,"wazifaPdfGroup",id,"chunks",String(n)):doc(db,"wazifaPdfPrivate",uid,"files",id,"chunks",String(n));
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
 let local=false;
 try{await localPdf(uid,scope,meta.id,prepared.bytes);local=true;}catch(e){console.debug("PDF device storage",e);}
 const written=[];
 try{
  for(let offset=0;offset<meta.chunks;offset+=8){
   assertAccount(uid);const batch=writeBatch(db),part=[];
   for(let n=offset;n<Math.min(offset+8,meta.chunks);n++){
    const ref=chunkRef(uid,scope,meta.id,n);
    batch.set(ref,{data:Bytes.fromUint8Array(prepared.bytes.slice(n*CHUNK,(n+1)*CHUNK))});part.push(ref);
   }
   await batch.commit();written.push(...part);progress(written.length,meta.chunks);
  }
  assertAccount(uid);return {localOnly:false};
 }catch(error){
  // Never publish a group attachment which members cannot read.
  if(local&&scope!=="group"&&error?.code==="permission-denied"&&auth.currentUser?.uid===uid&&window.confirm("Firebase پر PDF محفوظ نہیں ہو سکی۔ کیا صرف اسی موبائل میں PDF محفوظ کریں؟ دوسرے موبائل پر تصویر نہیں آئے گی۔"))return {localOnly:true};
  throw error;
 }
}
export async function loadPdfAttachment(value,uid,scope){
 assertAccount(uid);const meta=pdfMarker(value);if(!meta)throw Error("PDF کی شناخت درست نہیں۔");
 try{const bytes=await localPdf(uid,scope,meta.id);assertAccount(uid);if(bytes instanceof Uint8Array&&bytes.length>0)return bytes;}catch(e){console.debug("PDF local read",e);}
 const parts=[];let size=0;
 for(let i=0;i<meta.chunks;i+=6){
  assertAccount(uid);
  const snapshots=await Promise.all(Array.from({length:Math.min(6,meta.chunks-i)},(_,k)=>getDoc(chunkRef(uid,scope,meta.id,i+k))));
  for(const snap of snapshots){if(!snap.exists())throw Error("PDF اس ڈیوائس پر دستیاب نہیں۔ اصل PDF دوبارہ اپلوڈ کریں۔");const part=snap.data().data?.toUint8Array();if(!part||part.length>CHUNK)throw Error("PDF کا حصہ درست نہیں۔");parts.push(part);size+=part.length;if(size>MAX)throw Error("PDF مقررہ حد سے بڑی ہے۔");}
 }
 assertAccount(uid);const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{await localPdf(uid,scope,meta.id,bytes);}catch{}
 return bytes;
}
const viewers=new WeakMap();
export async function mountPdfViewer(host,bytesOrLoader,expectedPages){
 viewers.get(host)?.();
 let closed=false,task=null,renderTask=null,observer=null;
 const close=()=>{if(closed)return;closed=true;observer?.disconnect();renderTask?.cancel();if(task)void task.destroy().catch(()=>{});};
 viewers.set(host,close);
 observer=new MutationObserver(()=>{if(!host.isConnected)close();});observer.observe(document.body,{childList:true,subtree:true});
 host.innerHTML='<p class="wz-pdf-message" role="status">PDF کی تصویر لوڈ ہو رہی ہے…</p>';
 try{
  const bytes=typeof bytesOrLoader==="function"?await bytesOrLoader():bytesOrLoader;
  if(closed)return;
  const opened=await openDocument(bytes);task=opened.task;const pdf=opened.pdf;
  if(closed){await task.destroy();return;}
  if(expectedPages&&pdf.numPages!==expectedPages)throw Error("PDF کے صفحات کی تعداد درست نہیں۔");
  host.innerHTML='<div class="wz-pdf-nav" dir="rtl"><button type="button" data-pdf-prev>پچھلا صفحہ</button><strong data-pdf-page></strong><button type="button" data-pdf-next>اگلا صفحہ</button></div><div class="wz-pdf-scroll" data-no-pull><canvas role="img" aria-label="اصل PDF کا صفحہ"></canvas></div><button type="button" class="wz-button" data-pdf-zoom>بڑی تصویر</button><p class="wz-pdf-message" role="status"></p>';
  const canvas=host.querySelector("canvas"),label=host.querySelector("[data-pdf-page]"),prev=host.querySelector("[data-pdf-prev]"),next=host.querySelector("[data-pdf-next]"),zoom=host.querySelector("[data-pdf-zoom]"),msg=host.querySelector(".wz-pdf-message");
  let current=1,busy=false;
  async function show(n){
   if(closed||busy||n<1||n>pdf.numPages)return;busy=true;prev.disabled=next.disabled=true;msg.textContent="صفحہ لوڈ ہو رہا ہے…";
   try{
    const page=await pdf.getPage(n);if(closed)return;
    const b=page.getViewport({scale:1}),scale=Math.min(3,2600/Math.max(b.width,b.height),Math.sqrt(6000000/(b.width*b.height))),v=page.getViewport({scale});
    canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
    renderTask=page.render({canvasContext:canvas.getContext("2d",{alpha:false}),viewport:v,background:"rgb(255,255,255)"});await renderTask.promise;renderTask=null;page.cleanup();
    current=n;label.textContent=n+" / "+pdf.numPages;msg.textContent="";host.querySelector(".wz-pdf-scroll").scrollTop=0;
   }catch(e){if(!closed)msg.textContent="صفحہ نہیں کھل سکا: "+String(e?.message||e);}
   finally{busy=false;prev.disabled=current<=1;next.disabled=current>=pdf.numPages;}
  }
  prev.onclick=()=>void show(current-1);next.onclick=()=>void show(current+1);zoom.onclick=()=>{const large=host.classList.toggle("is-zoomed");zoom.textContent=large?"عام تصویر":"بڑی تصویر";};
  await show(1);
 }catch(e){if(!closed)host.textContent="PDF نہیں کھل سکی: "+String(e?.message||e);close();}
}
