import { start } from "./core.js";
import { fmtCode, cleanCode, ORDER_FLOW } from "./config.js";
import { db, doc, onSnapshot } from "./firebase.js";
import { $, esc, timeText } from "./utils.js";
start("track");
const qs = new URLSearchParams(location.search);
const code = cleanCode(qs.get("c") || qs.get("merchant_order_id") || "");
const paid = qs.get("success") === "true", failed = qs.get("success") === "false";
let last = {}; try { last = JSON.parse(sessionStorage.getItem("joo_last")) || {}; } catch {}
$("#code").textContent = code ? `#${fmtCode(code)}` : "";
const tr = $("#trackBtn"); if (tr) tr.href = `account.html?c=${code}`;

function timeline(o) {
  const hist = {}; (o.history || []).forEach((h) => (hist[h.status] = h.at));
  if (o.status === "cancelled") return `<div class="msg err">تم إلغاء الطلب. لو ده غلط كلّم الدعم من حسابك.</div>`;
  const idx = Math.max(0, ORDER_FLOW.findIndex(([k]) => k === o.status));
  return `<ol class="timeline">${ORDER_FLOW.map(([k, t, s], i) => `<li class="${i < idx ? "done" : i === idx ? "now" : ""}"><i></i><div><b>${t}</b><span>${i <= idx ? esc(timeText(hist[k] || (i === 0 ? o.createdAt : null))) || s : s}</span></div></li>`).join("")}</ol>`;
}
const draw = (o) => { $("#tl").innerHTML = timeline(o); };
draw({ status: "new" });
if (code) { try { onSnapshot(doc(db, "track", code), (d) => d.exists() && draw(d.data()), () => {}); } catch {} }

const note = document.querySelector("#payNote");
if (note) {
  if (paid) { note.textContent = "تم الدفع بنجاح. هنأكد طلبك ونجهزه للشحن."; note.hidden = false; }
  else if (failed) { note.textContent = "عملية الدفع لم تكتمل. طلبك مسجّل عندنا، تقدر تعيد الدفع أو تتواصل مع الدعم من حسابك."; note.hidden = false; }
  else if (qs.get("pe")) { note.textContent = "تم تسجيل طلبك لكن تعذر فتح صفحة الدفع. تواصل مع الدعم من حسابك لإتمام الدفع."; note.hidden = false; }
}
{ const t = $("#payText"); if (t && last.pay === "transfer") t.innerHTML = `الدفع تحويل — <a href="pay.html?c=${code}">افتح صفحة الدفع</a>.`; else if (t && last.pay === "card") t.textContent = "الدفع بالبطاقة."; }
