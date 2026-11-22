import {auth,db} from "./firebase-client.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {doc,getDoc,setDoc} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

class ProfileContacts extends HTMLElement{
  connectedCallback(){
    this.innerHTML=`<section class="panel section"><h2>رابطے کی معلومات</h2>
      <form class="form"><label class="field">موبائل نمبر (اختیاری)
      <input name="mobile" type="tel" dir="ltr" maxlength="32" autocomplete="tel"></label>
      <label class="field">ای میل (اختیاری)
      <input name="email" type="email" dir="ltr" maxlength="254" autocomplete="email"></label>
      <button class="button" disabled>رابطے کی معلومات محفوظ کریں</button>
      <p role="status"></p></form></section>`;
    const form=this.querySelector("form"),button=form.querySelector("button"),status=form.querySelector("[role=status]");
    let loadedUid=null;
    this.unsubscribe=onAuthStateChanged(auth,async user=>{
      loadedUid=null;button.disabled=true;form.reset();status.textContent="";
      if(!user)return;
      try{
        const snap=await getDoc(doc(db,"memberContacts",user.uid));
        if(auth.currentUser?.uid!==user.uid||!this.isConnected)return;
        form.elements.mobile.value=snap.data()?.mobile||"";
        form.elements.email.value=snap.data()?.email||"";
        loadedUid=user.uid;button.disabled=false;
      }catch{status.textContent="رابطے کی معلومات لوڈ نہیں ہو سکیں۔ پروفائل دوبارہ کھولیں۔";}
    });
    form.onsubmit=async e=>{
      e.preventDefault();
      if(!loadedUid||auth.currentUser?.uid!==loadedUid||button.disabled)return;
      button.disabled=true;
      try{
        await setDoc(doc(db,"memberContacts",loadedUid),{mobile:form.elements.mobile.value.trim(),email:form.elements.email.value.trim()});
        status.textContent="رابطے کی معلومات محفوظ ہو گئیں۔";
      }catch{status.textContent="معلومات محفوظ نہیں ہو سکیں۔ دوبارہ کوشش کریں۔";}
      finally{button.disabled=!loadedUid||auth.currentUser?.uid!==loadedUid;}
    };
  }
  disconnectedCallback(){this.unsubscribe?.();}
}
customElements.define("profile-contacts",ProfileContacts);
