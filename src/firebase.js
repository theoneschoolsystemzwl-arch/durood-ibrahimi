// Modular Firebase SDK entry for an npm-based production web app.
// Install: npm install firebase
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

export const firebaseConfig = {
  "apiKey": "AIzaSyD3E8Nkky3vzDRrDlt1jso4t5A_W5la8O4",
  "authDomain": "durood-e-ibrahimi-global-c74e0.firebaseapp.com",
  "projectId": "durood-e-ibrahimi-global-c74e0",
  "storageBucket": "durood-e-ibrahimi-global-c74e0.firebasestorage.app",
  "messagingSenderId": "277153649028",
  "appId": "1:277153649028:web:965d91c95c36fe48694dd1",
  "measurementId": "G-P94KRFGC60"
};
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export async function initializeAnalytics() {
  return (await isSupported()) ? getAnalytics(app) : null;
}
