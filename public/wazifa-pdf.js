// PDF processing is local; only library code is downloaded.
const root="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/";
const sourceName="durood-arabic-text.txt";
export async function readArabicPdf(file,progress){
 if(file.size>25*1024*1024)throw Error("PDF کی حد 25 MB ہے۔");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw Error("درست PDF منتخب کریں۔");
 const lib=await import(root+"pdf.mjs");lib.GlobalWorkerOptions.workerSrc=root+"pdf.worker.mjs";
 const task=lib.getDocument({data:bytes,isEvalSupported:false,enableXfa:false});
 try{
  const pdf=await task.promise;
  if(pdf.numPages>500)throw Error("PDF کی حد 500 صفحات ہے۔");
  const attachments=await pdf.getAttachments(),source=attachments&&Object.values(attachments).find(x=>x.filename===sourceName);
  if(source?.content?.length<=600000){const text=new TextDecoder("utf-8",{fatal:true}).decode(source.content);if(text.trim())return text;}
  let result=[],size=0,missing=0;
  for(let n=1;n<=pdf.numPages;n++){
   progress(n,pdf.numPages);
   const p=await pdf.getPage(n),c=await p.getTextContent();
   let line="",lines=[];
   for(const item of c.items){if(typeof item.str!=="string")continue;line+=(line&&!/\s$/.test(line)&&!/^\s/.test(item.str)?" ":"")+item.str;if(item.hasEOL){lines.push(line);line="";}}
   if(line)lines.push(line);
   const text=lines.join("\n").trim();if(!text)missing++;
   result.push(text);size+=text.length;if(size>600000)throw Error("PDF کا متن مقررہ حد سے زیادہ ہے۔");p.cleanup();
  }
  if(missing)throw Error("PDF کے "+missing+" صفحات میں قابلِ انتخاب متن نہیں ملا۔ اسکین شدہ PDF کے لیے OCR درکار ہے۔");
  return result.join("\n\n");
 }finally{await task.destroy();}
}
export function wrapArabicLines(text,measure,width){
 const lines=[],seg=typeof Intl.Segmenter==="function"?new Intl.Segmenter("ar",{granularity:"grapheme"}):null;
 for(const paragraph of text.replace(/\r\n?/g,"\n").split("\n")){
  let line="";
  for(const word of paragraph.split(/\s+/u).filter(Boolean)){
   const next=line?line+" "+word:word;
   if(measure(next)<=width){line=next;continue;}
   if(line){lines.push(line);line="";}
   if(measure(word)<=width){line=word;continue;}
   for(const c of seg?Array.from(seg.segment(word),x=>x.segment):Array.from(word)){if(line&&measure(line+c)>width){lines.push(line);line="";}line+=c;}
  }
  lines.push(line);
 }
 return lines;
}
export async function makeArabicPdf(text,progress){
 const {PDFDocument}=await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js");
 const pdf=await PDFDocument.create(),canvas=document.createElement("canvas");canvas.width=1240;canvas.height=1754;
 const ctx=canvas.getContext("2d"),font='40px "Noto Sans Arabic", serif';
 await document.fonts?.load(font);ctx.font=font;
 const margin=90,step=83,rows=Math.floor((canvas.height-margin*2)/step),lines=wrapArabicLines(text,t=>ctx.measureText(t).width,canvas.width-margin*2),total=Math.ceil(lines.length/rows);
 if(total>500)throw Error("PDF کے صفحات بہت زیادہ ہیں۔");
 for(let start=0;start<lines.length;start+=rows){
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#111";
  ctx.font=font;ctx.direction="rtl";ctx.textAlign="right";ctx.textBaseline="middle";
  lines.slice(start,start+rows).forEach((line,i)=>ctx.fillText(line,canvas.width-margin,margin+step/2+i*step));
  ctx.font="22px sans-serif";ctx.direction="ltr";ctx.textAlign="center";ctx.fillText(String(start/rows+1),canvas.width/2,canvas.height-32);
  const jpg=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("PDF صفحہ نہیں بن سکا۔")),"image/jpeg",.87));
  const image=await pdf.embedJpg(await jpg.arrayBuffer()),page=pdf.addPage([595.28,841.89]);page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});progress(start/rows+1,total);
 }
 await pdf.attach(new TextEncoder().encode(text),sourceName,{mimeType:"text/plain",description:"Original Arabic text"});
 const bytes=await pdf.save();if(bytes.length>32*1024*1024)throw Error("PDF 32 MB سے بڑی ہے۔ عبارت حصوں میں تقسیم کریں۔");
 return new Blob([bytes],{type:"application/pdf"});
}
export async function downloadArabicPdf(blob){
 const bridge=window.DuroodAndroid;
 if(bridge){
  if(typeof bridge.saveWazifaPdf!=="function")throw Error("PDF محفوظ کرنے کے لیے نئی Android ایپ یا Chrome استعمال کریں۔");
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
  if(!bridge.saveWazifaPdf(data))throw Error("PDF محفوظ کرنے کا عمل شروع نہیں ہو سکا۔");
  return "native";
 }
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="wazifa-arabic.pdf";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return "browser";
}
