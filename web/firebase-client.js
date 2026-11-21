// Firebase project settings supplied by project owner.
// This uses the browser ESM CDN, so it does not require npm or a bundler.
// Import this module from a module-based production application.
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-analytics.js";

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
