// PDF and OCR processing are local to the device; only libraries and language data are fetched.
const root="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/";
const ocrRoot="https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/";
const sourceName="durood-arabic-text.txt";
let ocrLoader;
function loadOcr(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(!ocrLoader)ocrLoader=new Promise((resolve,reject)=>{
  const script=document.createElement("script");script.src=ocrRoot+"tesseract.min.js";script.crossOrigin="anonymous";
  let timer;
  function fail(){clearTimeout(timer);script.remove();reject(Error("عربی OCR لوڈ نہیں ہو سکا۔ انٹرنیٹ چیک کریں۔"));}
  script.onload=()=>{clearTimeout(timer);if(window.Tesseract?.createWorker)resolve(window.Tesseract);else fail();};
  script.onerror=fail;timer=setTimeout(fail,30000);document.head.append(script);
 }).catch(error=>{ocrLoader=null;throw error;});
 return ocrLoader;
}
function textFromItems(items){
 let line="",lines=[];
 for(const item of items){if(typeof item.str!=="string")continue;line+=(line&&!/\s$/.test(line)&&!/^\s/.test(item.str)?" ":"")+item.str;if(item.hasEOL){lines.push(line);line="";}}
 if(line)lines.push(line);
 return lines.join("\n").trim();
}
function needsOcr(text){return !/[\p{Script=Arabic}]/u.test(text);}
export async function readArabicPdf(file,progress=()=>{}){
 if(!file||file.size>25*1024*1024)throw Error("PDF کی حد 25 MB ہے۔");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw Error("درست PDF منتخب کریں۔");
 const lib=await import(root+"pdf.mjs");lib.GlobalWorkerOptions.workerSrc=root+"pdf.worker.mjs";
 const task=lib.getDocument({data:bytes,isEvalSupported:false,enableXfa:false});
 let worker=null,currentPage=0,total=0,ocrPages=0;
 try{
  const pdf=await task.promise;total=pdf.numPages;
  if(total>500)throw Error("PDF کی حد 500 صفحات ہے۔");
  const attachments=await pdf.getAttachments(),source=attachments&&Object.values(attachments).find(x=>x.filename===sourceName);
  if(source?.content?.length<=600000){const text=new TextDecoder("utf-8",{fatal:true}).decode(source.content);if(text.trim())return {text,ocrPages:0,unreadPages:[]};}
  const result=[],unreadPages=[];let size=0;
  for(let n=1;n<=total;n++){
   currentPage=n;progress(n,total,"text",0);
   const page=await pdf.getPage(n);
   try{
    let text="";
    try{text=textFromItems((await page.getTextContent()).items);}catch(error){console.debug("PDF text layer unavailable",error);}
    if(needsOcr(text)){
     ocrPages++;progress(n,total,"loading",0);
     if(!worker){
      const tesseract=await loadOcr();
      worker=await tesseract.createWorker("ara",1,{
       workerPath:ocrRoot+"worker.min.js",
       logger:m=>{if(m.status==="recognizing text")progress(currentPage,total,"ocr",Math.round(m.progress*100));else progress(currentPage,total,"loading",Math.round((m.progress||0)*100));}
      });
      await worker.setParameters({tessedit_pageseg_mode:"3",preserve_interword_spaces:"1"});
     }
     const base=page.getViewport({scale:1}),scale=Math.min(3,2600/Math.max(base.width,base.height),Math.sqrt(6000000/(base.width*base.height)));
     const viewport=page.getViewport({scale}),canvas=document.createElement("canvas");
     canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     const ctx=canvas.getContext("2d",{alpha:false,willReadFrequently:true});
     if(!ctx)throw Error("صفحے کی تصویر نہیں بن سکی۔");
     try{
      await page.render({canvasContext:ctx,viewport,background:"rgb(255,255,255)"}).promise;
      const recognized=await worker.recognize(canvas);
      const ocrText=String(recognized.data?.text||"").trim();
      if(!needsOcr(ocrText))text=ocrText;
      else unreadPages.push(n);
     }finally{canvas.width=0;canvas.height=0;}
    }
    result.push(text);size+=text.length;if(size>600000)throw Error("PDF کا متن مقررہ حد سے زیادہ ہے۔");
   }finally{page.cleanup();}
  }
  const text=result.join("\n\n").trim();
  if(!text||needsOcr(text))throw Error("عربی متن نہیں پڑھا جا سکا۔ زیادہ واضح PDF منتخب کریں۔");
  return {text,ocrPages,unreadPages};
 }finally{
  if(worker)try{await worker.terminate();}catch(error){console.debug("OCR worker cleanup",error);}
  await task.destroy();
 }
}
