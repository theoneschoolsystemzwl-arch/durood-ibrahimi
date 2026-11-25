import {auth,db} from "./firebase-client.js";
import {doc,getDoc,writeBatch,onSnapshot} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const fields=[["mobile","Mobile / WhatsApp","موبائل / واٹس ایپ"],["email","Email","ای میل"],["address","Address","پتہ"],["age","Age","عمر"],["birthDate","Date of birth","تاریخ پیدائش"]];
const lang=()=>document.documentElement.lang==="ur";
const tr=(a,b)=>lang()?b:a;
const imageOk=v=>typeof v==="string"&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<=180000;
class MemberSharedPhoto extends HTMLElement{
 connectedCallback(){
  const uid=this.dataset.uid;if(!uid||!auth.currentUser||uid===auth.currentUser.uid)return;
  const viewer=auth.currentUser.uid;
  this.stop=onSnapshot(doc(db,"memberProfileShares",uid),snap=>{
   if(!this.isConnected||auth.currentUser?.uid!==viewer)return;
   const a=this.querySelector(".avatar");if(!a)return;
   const image=snap.data()?.image;
   if(imageOk(image)){let img=document.createElement("img");img.src=image;img.alt="";a.replaceChildren(img);img.dataset.sharedPhoto="1";}
   else if(a.querySelector("[data-shared-photo]"))a.textContent="✧";
  },()=>{});
 }
 disconnectedCallback(){this.stop?.();}
}
class MemberProfileFields extends HTMLElement{
 connectedCallback(){
  const uid=this.dataset.uid,viewer=auth.currentUser?.uid;if(!uid||!viewer)return;
  const privateView=this.dataset.private==="1";
  const render=(data,contacts)=>{
   if(!this.isConnected||auth.currentUser?.uid!==viewer)return;
   const dl=document.createElement("dl");dl.className="detail-grid member-profile-details";
   for(const [key,en,ur] of fields){
    const value=contacts?.[key]??data?.[key];if(value===undefined||value===""||value===0)continue;
    const cell=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=tr(en,ur);dd.textContent=String(value);dd.dir="auto";cell.append(dt,dd);dl.append(cell);
   }
   if(!privateView&&data?.showJoined===true){
    const cell=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=tr("Membership date","تاریخ رکنیت");dd.textContent=this.dataset.joined||"—";cell.append(dt,dd);dl.append(cell);
   }
   this.replaceChildren(dl);
  };
  if(privateView)Promise.all([getDoc(doc(db,"memberProfileDetails",uid)),getDoc(doc(db,"memberContacts",uid))]).then(([d,c])=>render(d.data(),c.data())).catch(()=>{});
  else this.stop=onSnapshot(doc(db,"memberProfileShares",uid),snap=>render(snap.data(),null),()=>this.replaceChildren());
 }
 disconnectedCallback(){this.stop?.();}
}
class MemberProfileSharing extends HTMLElement{
 async connectedCallback(){
  const uid=auth.currentUser?.uid;if(!uid)return;
  this.innerHTML='<section class="panel section"><h2>'+tr("Profile information & visibility","پروفائل معلومات اور رازداری")+'</h2><p class="muted">'+tr("Unchecked information stays private. Contact details are for adults only. Do not publish a child’s address, phone, email or birth date.","بغیر ٹک معلومات نجی رہیں گی۔ رابطے کی معلومات صرف بالغ افراد شیئر کریں۔ بچوں کا پتہ، فون، ای میل یا تاریخ پیدائش عام نہ کریں۔")+'</p><form class="form"><fieldset disabled>'+fields.map(([k,en,ur])=>'<label class="field">'+tr(en,ur)+'<input name="'+k+'" dir="auto" '+(k==="age"?'type="number" min="0" max="120"':k==="birthDate"?'type="date"':k==="email"?'type="email" maxlength="254"':k==="mobile"?'type="tel" maxlength="32"':'maxlength="240"')+'></label><label class="profile-share-check"><input type="checkbox" name="show_'+k+'"> '+tr("Show other users","دوسرے صارفین کو دکھائیں")+'</label>').join("")+'<label class="profile-share-check"><input type="checkbox" name="adultConfirmed"> '+tr("I am 18 or older and consent to sharing selected contact information","میری عمر 18 سال یا زیادہ ہے اور منتخب معلومات شیئر کرنے کی اجازت دیتا/دیتی ہوں")+'</label><label class="profile-share-check"><input type="checkbox" name="showJoined"> '+tr("Show membership date","تاریخ رکنیت دکھائیں")+'</label><label class="profile-share-check"><input type="checkbox" name="showPhoto"> '+tr("Show my saved photo to other members","اپنی محفوظ تصویر دوسرے ممبران کو دکھائیں")+'</label><button class="button">'+tr("Save information and privacy","معلومات اور رازداری محفوظ کریں")+'</button></fieldset><p role="status"></p></form></section>';
  const form=this.querySelector("form"),fs=form.querySelector("fieldset"),status=form.querySelector("[role=status]");
  const e=form.elements;
  const valid=()=>this.isConnected&&auth.currentUser?.uid===uid;
  const toggle=()=>{const adult=e.adultConfirmed.checked&&Number(e.age.value)>=18;for(const [k] of fields){e["show_"+k].disabled=!adult;if(!adult)e["show_"+k].checked=false;}};
  try{
   const [d,c,p]=await Promise.all([getDoc(doc(db,"memberProfileDetails",uid)),getDoc(doc(db,"memberContacts",uid)),getDoc(doc(db,"memberProfileShares",uid))]);
   if(!valid())return;
   const priv={...d.data(),...c.data()},pub=p.data()||{};
   for(const [k] of fields){e[k].value=priv[k]||"";e["show_"+k].checked=Object.hasOwn(pub,k);}
   e.adultConfirmed.checked=priv.adultConfirmed===true;e.showJoined.checked=pub.showJoined===true;e.showPhoto.checked=!!pub.image;
   fs.disabled=false;toggle();
  }catch{status.textContent=tr("Profile sharing is not available yet. No information was published.","شیئرنگ ابھی دستیاب نہیں۔ کوئی معلومات عام نہیں ہوئیں۔");return;}
  form.addEventListener("change",toggle);
  form.addEventListener("submit",async ev=>{
   ev.preventDefault();ev.stopPropagation();if(!valid()||fs.disabled)return;
   fs.disabled=true;status.textContent="";
   try{
    const age=Number(e.age.value||0),adult=e.adultConfirmed.checked&&age>=18;
    const details={age,birthDate:e.birthDate.value,address:e.address.value.trim(),adultConfirmed:adult};
    const contacts={mobile:e.mobile.value.trim(),email:e.email.value.trim()};
    const pub={};
    if(adult)for(const [k] of fields){const value=({...details,...contacts})[k];if(e["show_"+k].checked&&value)pub[k]=value;}
    if(e.showJoined.checked)pub.showJoined=true;
    if(e.showPhoto.checked){const photo=(await getDoc(doc(db,"memberPhotos",uid))).data()?.image;if(!imageOk(photo))throw Error(tr("Save a profile photo first.","پہلے پروفائل تصویر محفوظ کریں۔"));pub.image=photo;}
    if(!valid())return;
    const batch=writeBatch(db);batch.set(doc(db,"memberProfileDetails",uid),details);batch.set(doc(db,"memberContacts",uid),contacts);batch.set(doc(db,"memberProfileShares",uid),pub);await batch.commit();
    if(valid())status.textContent=tr("Saved. Only checked information is shared.","محفوظ ہو گیا۔ صرف ٹک کردہ معلومات شیئر ہوں گی۔");
   }catch(err){if(valid())status.textContent=tr("Could not save. Check permissions and try again.","محفوظ نہیں ہو سکا۔ اجازت چیک کرکے دوبارہ کوشش کریں۔");}
   finally{if(valid()){fs.disabled=false;toggle();}}
  });
 }
}
customElements.define("member-shared-photo",MemberSharedPhoto);
customElements.define("member-profile-fields",MemberProfileFields);
customElements.define("member-profile-sharing",MemberProfileSharing);
