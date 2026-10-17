import { S, start, onChange, shipRange, cartLines, lineTotal, offerOf, cardHTML, bindCards, subtotal, discount, shipping, grandTotal, setQty, removeFromCart, applyCoupon, removeCoupon, emptyHTML } from "./core.js";
import { $, esc, money, img, toast } from "./utils.js";

start("cart");
const box = $("#cartPage");
function draw() {
  if (!S.loaded) return;
  const lines = cartLines();
  if (!lines.length) { box.innerHTML = emptyHTML("السلة فاضية. ضيف منتج وابدأ.", ["shop.html", "روح للمتجر"]); return; }
  const sub = subtotal(), disc = discount(), ship = shipping(), free = Number(S.settings.freeShippingOver) || 0, net = sub - disc;
  box.innerHTML = `<div class="cart-layout">
    <div>
      ${free > 0 ? `<div class="ship-bar">${net < free ? `باقي <b>${money(free - net)}</b> على الشحن المجاني` : "الشحن مجاني على طلبك"}<div class="track"><i style="width:${Math.min(100, (net / free) * 100)}%"></i></div></div>` : ""}
      <div class="cart-list">${lines.map((l) => `
        <div class="line">
          <a href="product.html?id=${encodeURIComponent(l.id)}"><img src="${esc(img(l.p.images?.[0], 200))}" alt=""></a>
          <div><h4><a href="product.html?id=${encodeURIComponent(l.id)}">${esc(l.p.name)}</a></h4><b style="color:var(--forest)">${money(lineTotal(l.p, l.qty))}</b>${l.qty > 1 ? ` <small class="muted">(${money(l.p.price)} للقطعة)</small>` : ""}${offerOf(l.p) ? `<br><small class="dealnote">${l.qty >= offerOf(l.p).buy ? "عرض " : `ضيف ${offerOf(l.p).buy - (l.qty % offerOf(l.p).buy || 0)} كمان وخد عرض `}اشترِ ${offerOf(l.p).buy} وادفع ${offerOf(l.p).pay}</small>` : ""}<br><button class="rm" data-rm="${esc(l.id)}">حذف</button></div>
          <div class="qty"><button data-inc="${esc(l.id)}" aria-label="زيادة">+</button><span>${l.qty}</span><button data-dec="${esc(l.id)}" aria-label="نقص">−</button></div>
        </div>`).join("")}</div>
    </div>
    <aside class="summary">
      <h2>ملخص الطلب</h2>
      <div class="totals">
        <div><span>المجموع</span><span>${money(sub)}</span></div>
        ${disc ? `<div style="color:var(--forest)"><span>خصم (${esc(S.coupon.code)})</span><span>−${money(disc)}</span></div>` : ""}
        <div><span>الشحن</span><span>${shipRange() && ship ? "يتحدد حسب المحافظة" : ship ? money(ship) : "مجاني"}</span></div>
        <div class="grand"><span>الإجمالي${shipRange() && ship ? " (بدون الشحن)" : ""}</span><span>${money(shipRange() && ship ? sub - disc : grandTotal())}</span></div>
      </div>
      <div class="coupon">${S.coupon ? `<span class="msg ok">كوبون ${esc(S.coupon.code)} ${disc ? "مُفعّل" : `(يتطلب طلب بقيمة ${money(S.coupon.minOrder)})`}</span><button class="rm" id="cpRm">إزالة</button>` : `<input id="cpIn" placeholder="كود الخصم" autocomplete="off"><button class="btn btn-soft btn-sm" id="cpApply">تطبيق</button>`}</div>
      <a class="btn btn-primary btn-lg" href="checkout.html" style="width:100%;margin-top:16px">كمّل الطلب</a>
      <a class="btn btn-ghost" href="shop.html" style="width:100%;margin-top:8px">كمّل تسوق</a>
    </aside></div>
    <section class="block" id="alsoWrap"><div class="block-head"><h2>قد يعجبك أيضًا</h2></div><div class="grid" id="also"></div></section>`;
  const ids = new Set(lines.map((l) => l.id)), cats = new Set(lines.map((l) => l.p.category));
  const more = [...S.products.filter((p) => !ids.has(p.id) && cats.has(p.category)), ...S.products.filter((p) => !ids.has(p.id) && !cats.has(p.category))].slice(0, 4);
  $("#also").innerHTML = more.map((p) => cardHTML(p)).join(""); $("#alsoWrap").classList.toggle("hidden", !more.length);
}
bindCards(box);
onChange(draw);
box.addEventListener("click", async (e) => {
  const t = e.target, g = (a) => t.closest(`[data-${a}]`)?.dataset[a];
  const cur = (id) => S.cart.find((c) => c.id === id)?.qty || 0;
  if (g("inc")) setQty(g("inc"), cur(g("inc")) + 1);
  else if (g("dec")) setQty(g("dec"), cur(g("dec")) - 1);
  else if (g("rm")) removeFromCart(g("rm"));
  else if (t.closest("#cpRm")) removeCoupon();
  else if (t.closest("#cpApply")) { const r = await applyCoupon($("#cpIn").value); toast(r.msg, r.ok ? "ok" : "err"); }
});
box.addEventListener("keydown", async (e) => { if (e.key === "Enter" && e.target.id === "cpIn") { e.preventDefault(); const r = await applyCoupon(e.target.value); toast(r.msg, r.ok ? "ok" : "err"); } });
