import {auth} from "./firebase-client.js";
import {EmailAuthProvider, reauthenticateWithCredential, updatePassword} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
const form=document.querySelector("#password-form");
const notice=document.querySelector("#password-message");
form?.addEventListener("submit",async (event)=>{
  event.preventDefault();
  const user=auth.currentUser;
  if(!user?.email)return;
  const fields=new FormData(form);
  const oldValue=String(fields.get("currentPassword")||"");
  const newValue=String(fields.get("newPassword")||"");
  const confirm=String(fields.get("confirmPassword")||"");
  if(newValue.length<8||newValue!==confirm){
    notice.textContent="نیا پاس ورڈ کم از کم 8 حروف کا اور دونوں خانوں میں ایک جیسا ہونا چاہیے۔";
    return;
  }
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
    await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,oldValue));
    await updatePassword(user,newValue);
    form.reset();
    notice.textContent="پاس ورڈ کامیابی سے تبدیل ہو گیا۔";
  }catch(e){
    notice.textContent=e.code==="auth/invalid-credential"?"موجودہ پاس ورڈ درست نہیں۔":"پاس ورڈ تبدیل نہیں ہو سکا، دوبارہ کوشش کریں۔";
  }finally{submit.disabled=false;}
});
