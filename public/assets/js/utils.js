import { STORE } from "./config.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const money = (n) => `${Number(n || 0).toLocaleString("ar-EG")} ${STORE.currency}`;

// يضيف تحسين تلقائي لصور Cloudinary (حجم + صيغة + جودة)
export function img(url, w = 600) {
  if (!url) return "assets/img/bags.png";
  if (url.includes("res.cloudinary.com") && url.includes("/upload/") && !/\/upload\/[^/]*(w_|f_auto)/.test(url)) {
    return url.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`);
  }
  return url;
}

let toastTimer;
export function toast(msg, type = "ok") {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    document.body.append(t);
  }
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2800);
}

const AUTH_ERRORS = {
  "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة",
  "auth/invalid-email": "البريد الإلكتروني غير صالح",
  "auth/user-not-found": "لا يوجد حساب بهذا البريد",
  "auth/wrong-password": "كلمة المرور غير صحيحة",
  "auth/email-already-in-use": "هذا البريد مسجل بالفعل",
  "auth/weak-password": "كلمة المرور ضعيفة (6 أحرف على الأقل)",
  "auth/popup-closed-by-user": "تم إغلاق نافذة الدخول",
  "auth/too-many-requests": "محاولات كثيرة، حاول لاحقًا",
  "auth/network-request-failed": "مشكلة في الاتصال بالإنترنت",
  "auth/unauthorized-domain": "الدومين غير مضاف في Firebase (Authorized domains)",
  "auth/operation-not-allowed": "طريقة الدخول غير مفعلة في Firebase",
};
export const authError = (e) => AUTH_ERRORS[e?.code] || e?.message || "حدث خطأ";

export function dateText(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d ? d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "";
}
export const timeText = (ts) => { const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null; return d ? d.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""; };
