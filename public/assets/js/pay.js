// صفحة الدفع: بيانات التحويل (إنستاباي/محفظة) + إرسال بيانات التحويل كرسالة تصل للوحة التحكم
import { db, doc, getDoc } from "./firebase.js";
import { S, start, onChange } from "./core.js";
import { sendSupport } from "./fab.js";
import { cleanCode, fmtCode } from "./config.js";
import { $, esc, money } from "./utils.js";
start("pay");
const code = cleanCode(new URLSearchParams(location.search).get("c") || "");
const root = $("#payRoot"); let order = null, loaded = false, sent = false;

(async () => {
  try { const d = code && (await getDoc(doc(db, "track", code))); order = d && d.exists() ? d.data() : null; } catch (e) { console.error(e); }
  loaded = true; draw();
})();

const copy = (txt, b) => { navigator.clipboard?.writeText(txt).then(() => { const o = b.textContent; b.textContent = "تم النسخ ✓"; setTimeout(() => (b.textContent = o), 1400); }).catch(() => {}); };

function draw() {
  if (!loaded) return;
  if (!order) { root.innerHTML = `<div class="empty"><p>مش لاقيين الطلب ده. اتأكد من الرابط أو افتح حسابي.</p><a class="btn btn-primary" style="margin-top:14px" href="account.html">حسابي</a></div>`; return; }
  const st = S.settings, total = money(order.total), ref = fmtCode(code);
  const accts = [[st.instapay, "إنستاباي"], [st.wallet, "محفظة (فودافون كاش / غيرها)"]].filter(([v]) => v);
  const head = `<div class="pay-sum"><div><small>رقم الطلب</small><b dir="ltr">#${esc(ref)}</b></div><div><small>المطلوب دفعه</small><b class="amt">${total}</b></div></div>`;
  if (order.payment === "transfer") {
    root.innerHTML = `${head}
    <section class="pay-card"><h2>١) حوّل المبلغ</h2>
      ${accts.length ? accts.map(([v, l], i) => `<div class="acct"><span>${l}</span><bdi dir="ltr">${esc(v)}</bdi><button type="button" class="btn btn-soft btn-sm" data-copy="${esc(v)}">نسخ</button></div>`).join("") : `<p class="muted">بيانات التحويل هتوصلك من الدعم.</p>`}
      <p class="muted">اكتب رقم الطلب <b dir="ltr">${esc(ref)}</b> في ملاحظة التحويل لو أمكن.</p></section>
    <section class="pay-card"><h2>٢) أكّد التحويل</h2>
      ${sent ? `<div class="msg ok">وصلت بيانات التحويل للوحة التحكم ✓ هنأكد طلبك أول ما نراجعها.</div>` : S.user ? `<form class="form" id="pf"><div class="row"><label class="f">الاسم<input name="name" required maxlength="80" value="${esc(S.user.displayName || "")}"></label><label class="f">موبايل التحويل<input name="phone" required inputmode="tel" pattern="01[0-9]{9}" dir="ltr"></label></div>
        <label class="f">تفاصيل التحويل<textarea name="text" required rows="3" maxlength="1500" placeholder="رقم العملية أو آخر ٤ أرقام من رقم المرسل، والمبلغ والوقت"></textarea></label>
        <div class="msg err hidden" id="pe"></div><button class="btn btn-primary btn-lg">تم التحويل — ابعت</button></form>` : `<p>سجّل دخولك علشان بيانات التحويل توصل للوحة التحكم.</p><a class="btn btn-primary" href="account.html#support">تسجيل الدخول</a>`}
    </section>`;
  } else if (order.payment === "card") {
    root.innerHTML = `${head}<section class="pay-card"><h2>الدفع بالبطاقة</h2><p>${order.paymentStatus === "paid" ? "تم الدفع بنجاح ✓" : "لو لسه ماكملتش الدفع أو الصفحة ماتفتحتش، كلّم الدعم وهنبعتلك رابط دفع جديد."}</p></section>`;
  } else {
    root.innerHTML = `${head}<section class="pay-card"><h2>الدفع عند الاستلام</h2><p>مفيش حاجة تدفعها دلوقتي. عاين طلبك وادفع <b>${total}</b> للمندوب كاش عند الاستلام.</p></section>`;
  }
  root.insertAdjacentHTML("beforeend", `<div class="pay-links"><a class="btn btn-ghost" href="account.html?c=${esc(code)}">تابع الطلب</a><a class="btn btn-ghost" href="shop.html">كمّل تسوق</a></div>`);
  root.onclick = (e) => { const b = e.target.closest("[data-copy]"); if (b) copy(b.dataset.copy, b); };
  const f = $("#pf");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(f)), b = f.querySelector("button"); b.disabled = true;
    try { await sendSupport({ name: v.name, phone: v.phone, subject: "إرسال إيصال تحويل", orderCode: code, text: v.text }); sent = true; draw(); }
    catch (er) { console.error(er); const m = $("#pe"); m.textContent = "تعذر الإرسال. جرّب تاني."; m.classList.remove("hidden"); b.disabled = false; }
  };
}
onChange(draw);
