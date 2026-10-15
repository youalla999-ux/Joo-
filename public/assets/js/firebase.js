import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics اختياري، ولا يوقف الموقع لو فشل
isSupported().then((ok) => ok && getAnalytics(app)).catch(() => {});

export * from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
