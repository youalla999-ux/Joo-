import { start, onChange, waLink } from "./core.js";
import { fmtCode, cleanCode } from "./config.js";
import { $, money } from "./utils.js";
start("track");
const qs = new URLSearchParams(location.search);
const code = cleanCode(qs.get("c") || qs.get("merchant_order_id") || "");
const paid = qs.get("success") === "true", failed = qs.get("success") === "false";
let last = {}; try { last = JSON.parse(sessionStorage.getItem("joo_last")) || {}; } catch {}
$("#code").textContent = code ? `#${fmtCode(code)}` : "";
const tr = $("#trackBtn"); if (tr) tr.href = `account.html?c=${code}`;
const wa = $("#wa");
onChange(() => {
  const l = waLink(`أهلاً Joo Store${last.name ? "، أنا " + last.name : ""}. عملت طلب رقم ${fmtCode(code)}${last.total ? " بإجمالي " + money(last.total) : ""}.`);
  wa.classList.toggle("hidden", !l); if (l) wa.href = l;
});

// رجوع من صفحة الدفع بالبطاقة (Paymob) أو فشل فتحها
const note = document.querySelector("#payNote");
if (note) {
  if (paid) { note.textContent = "تم الدفع بنجاح. هنأكد طلبك ونجهزه للشحن."; note.hidden = false; }
  else if (failed) { note.textContent = "عملية الدفع لم تكتمل. طلبك مسجّل عندنا، تقدر تدفع عند الاستلام أو تتواصل معنا."; note.hidden = false; }
  else if (qs.get("pe")) { note.textContent = "تم تسجيل طلبك لكن تعذر فتح صفحة الدفع. تواصل معنا لإتمام الدفع."; note.hidden = false; }
}
