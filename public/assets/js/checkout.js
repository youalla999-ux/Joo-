import { api } from "./api.js";
import { GOVERNORATES } from "./config.js";
import { S, start, onChange, cartLines, lineTotal, subtotal, discount, shipping, grandTotal, clearCart } from "./core.js";
import { $, esc, money, img } from "./utils.js";

start("cart");
let cardOn = false;
fetch("/api/config").then((r) => r.json()).then((j) => { cardOn = !!j.card; document.dispatchEvent(new CustomEvent("joo:paycfg")); }).catch(() => {});
const box = $("#checkout"); let built = false;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

function summary() {
  const lines = cartLines(), disc = discount(), ship = shipping();
  return `<h2>طلبك</h2><div class="mini">${lines.map((l) => `<div><img src="${esc(img(l.p.images?.[0], 100))}" alt=""><span>${esc(l.p.name)} ×${l.qty}</span><b>${money(lineTotal(l.p, l.qty))}</b></div>`).join("")}</div>
    <div class="totals"><div><span>المجموع</span><span>${money(subtotal())}</span></div>${disc ? `<div><span>خصم</span><span>−${money(disc)}</span></div>` : ""}<div><span>الشحن${S.gov ? "" : " (حسب المحافظة)"}</span><span>${ship ? money(ship) : S.gov || !subtotal() ? "مجاني" : "يتحدد"}</span></div><div class="grand"><span>الإجمالي</span><span>${money(grandTotal())}</span></div></div>`;
}

function payHTML(sel) {
  const pay = S.settings.pay || {}, t = pay.transfer !== false && (S.settings.instapay || S.settings.wallet), cod = pay.cod !== false;
  const card = cardOn && pay.card !== false;
  if (!cod && !t && !card) return `<div class="msg err">مفيش طرق دفع متاحة حاليًا. كلّمنا من حسابك.</div>`;
  if (!t && !card) sel = "cod"; else if (!cod && !card) sel = "transfer";
  return `<fieldset class="pay"><legend>طريقة الدفع</legend>
    ${card ? `<label class="opt"><input type="radio" name="payment" value="card" ${sel === "card" ? "checked" : ""}><span><b>بطاقة بنكية / محفظة إلكترونية</b><small>دفع آمن أونلاين عبر Paymob. بنأكد طلبك فور نجاح الدفع.</small></span></label>` : ""}
    ${cod ? `<label class="opt"><input type="radio" name="payment" value="cod" ${sel !== "transfer" && sel !== "card" ? "checked" : ""}><span><b>الدفع عند الاستلام</b><small>ادفع كاش بعد ما تستلم وتعاين طلبك</small></span></label>` : ""}
    ${t ? `<label class="opt"><input type="radio" name="payment" value="transfer" ${sel === "transfer" ? "checked" : ""}><span><b>تحويل (إنستاباي / محفظة)</b><small>حوّل الإجمالي على ${[S.settings.instapay && `إنستاباي <bdi dir="ltr">${esc(S.settings.instapay)}</bdi>`, S.settings.wallet && `محفظة <bdi dir="ltr">${esc(S.settings.wallet)}</bdi>`].filter(Boolean).join(" أو ")} وابعت صورة التحويل للدعم برقم طلبك. بنأكد الطلب أول ما التحويل يوصل.</small></span></label>` : ""}
  </fieldset>`;
}
document.addEventListener("joo:paycfg", () => { const pb = $("#payBox"); if (pb) { const html = payHTML(pb.querySelector("input:checked")?.value); pb.dataset.h = html; pb.innerHTML = html; } });
onChange(() => {
  if (!S.loaded) return;
  if (!cartLines().length && !$("#coForm")?.dataset.sent) { box.innerHTML = `<div class="empty"><img src="assets/img/bags.png" alt="" width="110" style="margin:0 auto 14px"><p>السلة فاضية، مفيش طلب نكمّله.</p><a class="btn btn-primary" style="margin-top:16px" href="shop.html">روح للمتجر</a></div>`; built = false; return; }
  if (!built) {
    built = true;
    const c = load("joo_customer", {});
    box.innerHTML = `<ol class="steps" aria-label="مراحل الطلب"><li class="done"><i>1</i><span>السلة</span></li><li class="now"><i>2</i><span>البيانات والدفع</span></li><li><i>3</i><span>التأكيد</span></li></ol>
      <div class="cart-layout">
      <form class="form panel-form" id="coForm">
        <h2>بيانات التوصيل</h2>
        <label class="f">الاسم بالكامل<input name="name" required minlength="3" value="${esc(c.name || S.user?.displayName || "")}" autocomplete="name"></label>
        <div class="row">
          <label class="f">رقم الموبايل<input name="phone" required inputmode="tel" pattern="01[0-9]{9}" title="رقم موبايل مصري (11 رقم)" value="${esc(c.phone || "")}" autocomplete="tel"></label>
          <label class="f">رقم آخر (اختياري)<input name="phone2" inputmode="tel" value="${esc(c.phone2 || "")}"></label>
        </div>
        <div class="row">
          <label class="f">المحافظة<select name="gov" required><option value="">اختر...</option>${GOVERNORATES.map((g) => `<option ${c.gov === g ? "selected" : ""}>${g}</option>`).join("")}</select></label>
          <label class="f">المدينة / المنطقة<input name="city" required value="${esc(c.city || "")}"></label>
        </div>
        <label class="f">العنوان بالتفصيل<textarea name="address" required minlength="8">${esc(c.address || "")}</textarea></label>
        <label class="f">ملاحظات (اختياري)<input name="notes"></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div id="payBox"></div>
        <div class="msg err hidden" id="coErr"></div>
        <div class="paybar"><div><small>الإجمالي</small><b id="coTotal"></b></div><button class="btn btn-primary btn-lg" id="coSubmit">تأكيد الطلب</button></div>
        <small class="muted">من غير حساب ولا تسجيل. الطلب بيوصلنا فورًا وتقدر تتابعه بكوده.</small>
      </form>
      <aside class="summary" id="sum"></aside></div>`;
    $("#coForm").addEventListener("submit", submit);
    $("#coForm [name=gov]").addEventListener("change", (e) => { S.gov = e.target.value; $("#sum").innerHTML = summary(); });
  }
  $("#sum").innerHTML = summary(); { const t = $("#coTotal"); if (t) t.textContent = money(grandTotal()); }
  const pb = $("#payBox"); if (pb) { const cur = pb.querySelector("input:checked")?.value; const html = payHTML(cur); if (pb.dataset.h !== html) { pb.dataset.h = html; pb.innerHTML = html; } }
});

async function submit(e) {
  e.preventDefault();
  const form = e.target, f = Object.fromEntries(new FormData(form)), lines = cartLines(); if (!lines.length) return;
  const btn = $("#coSubmit"); btn.disabled = true; btn.textContent = "جاري إرسال الطلب...";
  S.gov = f.gov;
    const customer = { name: f.name.trim(), phone: f.phone.trim(), phone2: (f.phone2 || "").trim(), gov: f.gov, city: f.city.trim(), address: f.address.trim() };
  let key; try { key = sessionStorage.getItem("joo_okey"); if (!key) { key = crypto.randomUUID(); sessionStorage.setItem("joo_okey", key); } } catch { key = crypto.randomUUID(); }
  try {
    const r = await api("order", { key, items: lines.map((l) => ({ id: l.id, qty: l.qty })), customer, notes: (f.notes || "").trim(), payment: ["transfer", "card"].includes(f.payment) ? f.payment : "cod", coupon: S.coupon?.code || "", website: f.website || "" });
    try { localStorage.setItem("joo_customer", JSON.stringify(customer)); sessionStorage.setItem("joo_last", JSON.stringify({ code: r.code, pay: r.payment, total: r.total, name: r.name, phone: r.phone })); } catch {}
    form.dataset.sent = "1"; clearCart(); try { sessionStorage.removeItem("joo_okey"); } catch {}
    if (r.payUrl && /^https:\/\/accept\.paymob\.com\//.test(r.payUrl)) { location.href = r.payUrl; return; }
    location.href = r.payment === "transfer" ? `pay.html?c=${r.code}` : `thanks.html?c=${r.code}${r.payError ? "&pe=1" : ""}`;
  } catch (err) {
    console.error(err);
    const names = Object.fromEntries(lines.map((l) => [l.id, l.p.name]));
    const detail = err.body?.problems?.map((x) => x.reason === "stock" ? `${names[x.id] || x.name}: المتاح ${x.available} فقط` : `${names[x.id] || x.name || "منتج"}: غير متاح حاليًا`).join(" · ");
    const m = $("#coErr"); m.textContent = (err.message || "تعذر إرسال الطلب، حاول مرة أخرى.") + (detail ? ` (${detail})` : ""); m.classList.remove("hidden");
    btn.disabled = false; btn.textContent = "تأكيد الطلب";
  }
}
