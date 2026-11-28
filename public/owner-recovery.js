import {auth,db} from "./firebase-client.js";
import {doc,onSnapshot} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {prepareApproval,approveRecovery,watchRecoveryRequests} from "./member-recovery.js";

class RecoveryNotices extends HTMLElement{
  connectedCallback(){
    this.stop=watchRecoveryRequests(ids=>{
      this.replaceChildren();

      const title=document.createElement("h2");
      title.textContent="پاس ورڈ ری سیٹ کی درخواستیں ("+ids.length+")";
      this.append(title);
      for(const id of ids){
        const button=document.createElement("button");
        button.type="button";button.className="button secondary";button.textContent=id+" — پروفائل کھولیں";
        button.onclick=()=>window.duroodOpenRecoveryProfile(id);
        this.append(button);
      }
    },()=>{this.textContent="پاس ورڈ کی درخواستیں لوڈ نہیں ہو سکیں۔";});
  }
  disconnectedCallback(){this.stop?.();}
}

function showCode(code,id){
  const dialog=document.createElement("dialog");
  dialog.innerHTML='<h2></h2><p>یہ کوڈ ذاتی طور پر اسی رکن کو دیں۔ وہ لاگ اِن پر اپنی آئی ڈی اور کوڈ درج کرے گا۔</p><input readonly dir="ltr" aria-label="یک بار استعمال ہونے والا کوڈ"><button type="button">کوڈ کاپی کریں</button><button type="button">بند کریں</button>';
  dialog.querySelector("h2").textContent=id+" — ری سیٹ کوڈ";
  const field=dialog.querySelector("input");
  field.value=code;
  const [copy,close]=dialog.querySelectorAll("button");
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(field.value);copy.textContent="کاپی ہو گیا";}catch{field.focus();field.select();}};
  close.onclick=()=>dialog.close();
  dialog.onclose=()=>{field.value="";dialog.remove();};
  document.body.append(dialog);dialog.showModal();
}

// Google authorization runs only on the project's verified Firebase Hosting sites.
const approvalHost="durood-e-ibrahimi-global-c74e0.firebaseapp.com";
const hostingHosts=new Set([approvalHost,"durood-e-ibrahimi-global-c74e0.web.app"]);
function showHostingLink(container,username){
  const destination=new URL("https://"+approvalHost+"/");
  destination.hash=new URLSearchParams({recoveryMember:username}).toString();
  const link=document.createElement("a");
  link.className="button secondary";link.href=destination.href;link.target="_blank";link.rel="noopener noreferrer";
  link.textContent="اونر کی منظوری Firebase پر کھولیں";
  container.replaceChildren("اس ایپ میں گوگل کی تصدیق دستیاب نہیں۔ ",link);
}

class RecoveryApproval extends HTMLElement{
  connectedCallback(){
    const {uid,username}=this.dataset;
    this.stop=onSnapshot(doc(db,"memberRecoveryRequests",username),snap=>{
      this.replaceChildren();
      if(!snap.exists())return;
      const button=document.createElement("button"),status=document.createElement("p");
      button.type="button";button.className="button";button.textContent=snap.data().status==="pending"?"پاس ورڈ ری سیٹ کی منظوری دیں":"ری سیٹ کوڈ دوبارہ جاری کریں";
      this.append(button,status);
      if(location.protocol!=="https:"||!hostingHosts.has(location.hostname)){button.hidden=true;showHostingLink(status,username);return;}
      const prepare=window.parent.duroodPrepareApproval||prepareApproval;
      if(location.hostname===approvalHost){
        button.disabled=true;
        prepare().catch(error=>{status.textContent=error.message;}).finally(()=>{button.disabled=false;});
      }
      button.onclick=async()=>{
        const owner=auth.currentUser?.uid;
        button.disabled=true;status.textContent="رکن کے کوڈ کے لیے Google کی تصدیق مکمل کریں۔";
        try{
          const approve=window.parent.duroodApproveRecovery||approveRecovery;
          const code=await approve(uid,username,()=>window.duroodRecoverySelection(uid) && auth.currentUser?.uid===owner);
          if(auth.currentUser?.uid===owner && window.duroodRecoverySelection(uid))showCode(code,username);
        }catch(error){void prepare().catch(()=>{});if(error.code==="auth/unauthorized-domain"||error.code==="auth/operation-not-supported-in-this-environment"){showHostingLink(status,username);return;}status.textContent=error.code?"کوڈ جاری نہیں ہوا ("+error.code+")۔":error.message;}
        finally{button.disabled=false;}
      };
    },()=>{this.textContent="ری سیٹ درخواست لوڈ نہیں ہو سکی۔";});
  }
  disconnectedCallback(){this.stop?.();}
}
customElements.define("recovery-notices",RecoveryNotices);
customElements.define("recovery-approval",RecoveryApproval);
