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
