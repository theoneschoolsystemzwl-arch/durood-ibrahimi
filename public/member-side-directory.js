import {db} from "./firebase-client.js";
import {collection,query,where,limit,startAfter,getDocsFromServer} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {sideSerialDirectory} from "./member-side-serial.js";
export async function readSideDirectory(side){
 if(side!=="male"&&side!=="female")throw Error("Invalid member side");
 let last=null;const rows=[];
 for(;;){
   const filters=[where("gender","==",side),limit(200)];
   if(last)filters.push(startAfter(last));
   const page=await getDocsFromServer(query(collection(db,"members"),...filters));
   rows.push(...page.docs.map(d=>({...d.data(),uid:d.id})));
   if(page.size<200)break;
   last=page.docs.at(-1);
 }
 return sideSerialDirectory(rows,side);
}
