import {app} from "./firebase-client.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js";

const functions=getFunctions(app,"asia-southeast2");
export async function memberCall(name,data){
  return (await httpsCallable(functions,name)(data)).data;
}
export function nameId(name){
  return Array.from(name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,"")).slice(0,48).join("");
}
export async function loginAddress(value){
  const id=value.normalize("NFKC").trim().toLowerCase();
  if(!id || id.length>120)throw Error("درست لاگ اِن آئی ڈی لکھیں۔");
  let key=id;
  if(!/^[a-z0-9._-]{1,60}$/.test(id)){
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id));
    key="u~"+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("").slice(0,56);
  }
  return key+"@durood-e-ibrahimi-global-c74e0.firebaseapp.com";
}
