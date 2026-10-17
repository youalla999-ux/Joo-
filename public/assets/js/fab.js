// زرار الدعم العائم + إرسال رسالة تصل للوحة التحكم (تذكرة دعم)
import { db, doc, collection, writeBatch, serverTimestamp } from "./firebase.js";
import { S, onChange, waLink } from "./core.js";
import { cleanCode } from "./config.js";
import { $, esc } from "./utils.js";
import { I } from "./layout.js";

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 31]).join("");
const SUBJECTS = ["استفسار عن طلب", "إرسال إيصال تحويل", "مشكلة في منتج", "تعديل أو إلغاء طلب", "سؤال عن منتج", "أخرى"];

// يُنشئ تذكرة + أول رسالة. بيرجّع id التذكرة. بيتطلب تسجيل دخول (القواعد بتربط التذكرة بالحساب).
export async function sendSupport({ name, phone, subject, orderCode = "", text }) {
  if (!S.user) throw new Error("auth");
  text = String(text).trim().slice(0, 2000); const id = newId();
  const b = writeBatch(db);
  b.set(doc(db, "tickets", id), { name: name.trim(), phone: phone.trim(), subject, orderCode: cleanCode(orderCode), userId: S.user.uid, status: "open", lastMessage: text.slice(0, 120), lastFrom: "customer", unreadAdmin: true, unreadCustomer: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.set(doc(collection(db, "tickets", id, "messages")), { from: "customer", text, createdAt: serverTimestamp() });
  await b.commit();
  try { localStorage.setItem("joo_customer", JSON.stringify({ ...(JSON.parse(localStorage.getItem("joo_customer")) || {}), name: name.trim(), phone: phone.trim() })); } catch {}
  return id;
}

export function mountFab() {
  if (document.getElementById("fab")) return;
  const btn = document.createElement("button");
  btn.id = "fab"; btn.type = "button"; btn.className = "fab"; btn.setAttribute("aria-label", "الدعم الفني"); btn.innerHTML = `${I.chat}<span>الدعم</span>`;
  const dlg = document.createElement("dialog"); dlg.id = "fabDlg"; dlg.className = "fab-dlg"; dlg.setAttribute("aria-label", "الدعم الفني");
  if (/product/.test(location.pathname)) btn.classList.add("up");
  document.body.append(btn, dlg);
  const draw = () => {
    let c = {}; try { c = JSON.parse(localStorage.getItem("joo_customer")) || {}; } catch {}
    const wa = waLink("أهلاً، عندي استفسار.");
    dlg.innerHTML = `<div class="dlg-head"><h2>الدعم الفني</h2><button class="icon-btn" type="button" data-close aria-label="إغلاق">✕</button></div><div class="dlg-body">
      ${S.user ? `<p class="muted">${esc(S.settings.support?.greeting || "اكتب رسالتك وهتوصل لفريقنا، وهنرد عليك هنا في حسابك.")}</p>
      <form class="form" id="fabForm">
        <div class="row"><label class="f">الاسم<input name="name" required maxlength="80" value="${esc(c.name || S.user.displayName || "")}"></label><label class="f">الموبايل<input name="phone" required inputmode="tel" pattern="01[0-9]{9}" dir="ltr" value="${esc(c.phone || "")}"></label></div>
        <label class="f">الموضوع<select name="subject">${SUBJECTS.map((x) => `<option>${x}</option>`).join("")}</select></label>
        <label class="f">رسالتك<textarea name="text" required maxlength="2000" rows="4" placeholder="اكتب رقم الطلب لو بتسأل عن طلب"></textarea></label>
        <div class="msg err hidden" id="fabErr"></div><button class="btn btn-primary btn-lg">إرسال</button></form>`
      : `<p>سجّل دخولك الأول علشان رسالتك توصلنا ونقدر نرد عليك ونتابع طلباتك.</p><a class="btn btn-primary btn-lg" href="account.html#support">تسجيل الدخول</a>`}
      ${wa ? `<a class="btn btn-soft" style="margin-top:10px" href="${esc(wa)}" target="_blank" rel="noopener">أو كلّمنا على واتساب</a>` : ""}</div>`;
    const f = $("#fabForm");
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f)), b = f.querySelector("button"); b.disabled = true;
      try { await sendSupport({ name: v.name, phone: v.phone, subject: v.subject, text: v.text }); dlg.querySelector(".dlg-body").innerHTML = `<div class="msg ok">وصلت رسالتك للوحة التحكم ✓ هنرد عليك قريب.</div><a class="btn btn-primary" style="margin-top:12px" href="account.html#support">افتح المحادثة</a>`; }
      catch (er) { console.error(er); const m = $("#fabErr"); m.textContent = "تعذر الإرسال. جرّب تاني."; m.classList.remove("hidden"); b.disabled = false; }
    };
  };
  btn.onclick = () => { draw(); dlg.showModal(); };
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  onChange(() => { btn.classList.toggle("hidden", S.settings.sections?.fab === false); });
}
