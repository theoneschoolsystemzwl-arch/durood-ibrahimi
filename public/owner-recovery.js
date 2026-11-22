import {auth} from "./firebase-client.js";
import {EmailAuthProvider,reauthenticateWithCredential} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {memberCall} from "./mobile-members.js";

class OwnerRecovery extends HTMLElement {
  connectedCallback(){
    this.innerHTML=`<section class="panel section"><h2>ممبر کا پاس ورڈ ری سیٹ کریں</h2>
      <div class="form"><button type="button" class="button secondary" data-refresh>درخواستیں تازہ کریں</button>
      <div data-requests></div><label>ممبر نمبر یا یوزرنیم<input data-id dir="auto" placeholder="DI-50"></label>
      <button type="button" class="button secondary" data-find>ممبر تلاش کریں</button>
      <div data-details></div><div data-controls hidden><label>ممبر کا نیا پاس ورڈ
      <input data-password type="password" minlength="8" maxlength="128" autocomplete="new-password"></label>
      <button type="button" class="button" data-reset>پاس ورڈ تبدیل کریں</button></div>
      <p data-status role="status"></p><div data-share hidden>
      <button class="button secondary" type="button" data-copy>نیا پاس ورڈ کاپی کریں</button>
      <a class="button" target="_blank" rel="noopener noreferrer" data-wa>رجسٹرڈ نمبر کا WhatsApp کھولیں</a></div></div></section>`;
    this.sentPassword="";
    const get=q=>this.querySelector(q);
    const say=text=>{get("[data-status]").textContent=text};
    const run=async fn=>{
      if(this.busy)return;
      this.busy=true;
      try{await fn()}catch(e){say(e.message||"درخواست مکمل نہیں ہوئی۔")}
      finally{this.busy=false}
    };
    const clear=()=>{
      this.member=null;this.sentPassword="";
      get("[data-details]").textContent="";get("[data-controls]").hidden=true;
      get("[data-share]").hidden=true;get("[data-password]").value="";
      get("[data-wa]").removeAttribute("href");say("");
    };
    const find=async()=>{
      clear();
      this.member=await memberCall("ownerRecoveryDesk",{action:"find",identity:get("[data-id]").value});
      const m=this.member;
      get("[data-details]").textContent=[m.serial,m.username,m.mobile].join(" · ");
      get("[data-controls]").hidden=false;
    };
    const refresh=async()=>{
      const {requests}=await memberCall("ownerRecoveryDesk",{action:"list"});
      const list=get("[data-requests]");list.replaceChildren();
      if(!requests.length)list.textContent="کوئی نئی درخواست نہیں ہے۔";
      for(const item of requests){
        const b=document.createElement("button");b.type="button";b.className="button secondary";
        b.textContent=item.serial+" · "+item.username;
        b.onclick=()=>run(async()=>{get("[data-id]").value=item.serial;await find()});
        list.append(b);
      }
    };
    get("[data-id]").oninput=clear;
    get("[data-find]").onclick=()=>run(find);
    get("[data-refresh]").onclick=()=>run(refresh);
    get("[data-reset]").onclick=()=>run(async()=>{
      const m=this.member,p=get("[data-password]").value;
      if(!m||p.length<8)return say("کم از کم آٹھ حروف کا نیا پاس ورڈ لکھیں۔");
      if(!confirm(m.serial+" · "+m.username+" · "+m.mobile+" — اسی ممبر کا پاس ورڈ تبدیل کریں؟"))return;
      const token=await auth.currentUser.getIdTokenResult();
      if(Date.now()/1000-Number(token.claims.auth_time)>240){
        const dialog=document.createElement("dialog");
        dialog.innerHTML='<form method="dialog"><label>تصدیق کے لیے اپنا Owner پاس ورڈ درج کریں<input type="password" autocomplete="current-password" required></label><button value="ok">تصدیق</button><button value="cancel" formnovalidate>منسوخ</button></form>';
        this.append(dialog);dialog.showModal();
        const secret=await new Promise(resolve=>dialog.onclose=()=>resolve(dialog.returnValue==="ok"?dialog.querySelector("input").value:""));
        dialog.remove();if(!secret)return;
        await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,secret));
        await auth.currentUser.getIdToken(true);
      }
      const {mobile}=await memberCall("ownerRecoveryDesk",{action:"reset",identity:m.serial,uid:m.uid,password:p});
      this.sentPassword=p;get("[data-password]").value="";get("[data-controls]").hidden=true;
      get("[data-wa]").href="https://wa.me/"+mobile.slice(1);
      get("[data-share]").hidden=false;
      say("پاس ورڈ بدل گیا ہے۔ اسے کاپی کر کے رجسٹرڈ نمبر کی WhatsApp چیٹ میں بھیجیں۔");
      await refresh();
    });
    get("[data-copy]").onclick=()=>run(async()=>{await navigator.clipboard.writeText(this.sentPassword);say("نیا پاس ورڈ کاپی ہو گیا۔")});
    if(this.hasAttribute("member-serial")){
      get("[data-id]").value=this.getAttribute("member-serial");
      run(find);
    }else run(refresh);
  }
  disconnectedCallback(){this.sentPassword="";this.member=null;}
}
customElements.define("owner-recovery",OwnerRecovery);
