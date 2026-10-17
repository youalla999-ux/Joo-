import { auth, db, collection, query, where, onSnapshot, doc, onSnapshot as snap, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } from "./firebase.js";
import { ORDER_STATUS, ORDER_FLOW, fmtCode, cleanCode } from "./config.js";
import { S, start, onChange, cardHTML, bindCards, wishList, addToCart, findProduct } from "./core.js";
import { mountSupport, stopSupport } from "./chat.js";
import { $, $$, esc, money, img, toast, authError, dateText, timeText } from "./utils.js";

start("account");
const box = $("#account"); let mode = "login", drawn = null, tab = (location.hash || "#orders").slice(1), orders = [], unsubOrders = null;
const qs = new URLSearchParams(location.search), presetCode = cleanCode(qs.get("c") || ""), presetOrder = cleanCode(qs.get("order") || ""), presetType = qs.get("type") || "";
if (presetOrder) tab = "support";

onChange(() => {
  if (!S.authReady) return;
  const key = S.user ? S.user.uid : "out"; if (drawn === key + mode) return; drawn = key + mode;
  unsubOrders?.(); stopSupport();
  S.user ? hub() : login();
});

/* ---------- تتبع بالكود (من غير حساب) ---------- */
function timeline(o) {
  const hist = {}; (o.history || []).forEach((h) => (hist[h.status] = h.at));
  if (o.status === "cancelled") return `<div class="msg err">تم إلغاء الطلب${hist.cancelled ? " في " + esc(timeText(hist.cancelled)) : ""}. لو ده غلط كلّم الدعم.</div>`;
  const idx = ORDER_FLOW.findIndex(([k]) => k === o.status);
  return `<ol class="timeline">${ORDER_FLOW.map(([k, t, s], i) => `<li class="${i < idx ? "done" : i === idx ? "now" : ""}"><i></i><div><b>${t}</b><span>${i <= idx ? esc(timeText(hist[k] || (i === 0 ? o.createdAt : null))) || s : s}</span></div></li>`).join("")}</ol>`;
}

/* شريط تقدّم + إجراءات الطلب */
function progress(o) {
  if (o.status === "cancelled") return "";
  const idx = Math.max(0, ORDER_FLOW.findIndex(([k]) => k === o.status));
  return `<div class="oprog" role="img" aria-label="${esc(ORDER_STATUS[o.status] || "")}">${ORDER_FLOW.map((_, i) => `<i class="${i <= idx ? "on" : ""}"></i>`).join("")}</div>`;
}
function returnOpen(o) {
  if (o.status !== "delivered") return false;
  const days = Number(S.settings.returnDays) || 14, h = (o.history || []).find((x) => x.status === "delivered");
  const at = (h?.at?.seconds || h?.at?._seconds || o.updatedAt?.seconds || 0) * 1000; if (!at) return true;
  return Date.now() - at <= days * 864e5;
}
function actions(o) {
  const again = (o.items || []).filter((x) => x.id && findProduct(x.id)).length;
  return `<div class="order-act">
    ${again ? `<button class="btn btn-primary btn-sm" data-again="${esc(o.id)}">اطلب تاني</button>` : ""}
    ${returnOpen(o) ? `<a class="btn btn-soft btn-sm" href="account.html?order=${esc(o.id)}&type=return#support">استبدال / استرجاع</a>` : ""}
    ${o.status === "delivered" ? (o.items || []).slice(0, 1).filter((x) => x.id).map((x) => `<a class="btn btn-ghost btn-sm" href="product.html?id=${esc(x.id)}#reviews">قيّم المنتج</a>`).join("") : ""}
    <a class="btn btn-ghost btn-sm" href="account.html?order=${esc(o.id)}#support">مشكلة في الطلب؟</a></div>`;
}
function trackBox() {
  return `<form class="trackcode form" id="tcForm"><h3>تتبّع طلب بالكود</h3><p class="muted">عملت طلب من غير حساب؟ اكتب الكود اللي وصلك.</p>
    <div class="coupon"><input id="tcCode" placeholder="مثال: K7M2Q-9XBD4" dir="ltr" autocomplete="off" value="${esc(presetCode ? fmtCode(presetCode) : "")}"><button class="btn btn-soft btn-sm">تتبّع</button></div>
    <div class="msg err hidden" id="tcErr"></div><div id="tcOut"></div></form>`;
}
let tcUnsub = null;
function bindTrack() {
  const run = () => {
    tcUnsub?.(); const code = cleanCode($("#tcCode").value), err = $("#tcErr"), out = $("#tcOut"); err.classList.add("hidden"); out.innerHTML = "";
    if (code.length < 6) { err.textContent = "اكتب كود الطلب كامل."; err.classList.remove("hidden"); return; }
    tcUnsub = snap(doc(db, "track", code), (d) => {
      if (!d.exists()) { err.textContent = "مفيش طلب بالكود ده."; err.classList.remove("hidden"); out.innerHTML = ""; return; }
      const o = d.data(); err.classList.add("hidden");
      out.innerHTML = `<section class="track-card"><header><div><small>رقم الطلب</small><b dir="ltr">${fmtCode(code)}</b></div><span class="pill st-${o.status}">${ORDER_STATUS[o.status] || o.status}</span></header>${timeline(o)}
        <div class="mini">${(o.items || []).map((i) => `<div><img src="${esc(img(i.image, 100))}" alt=""><span>${esc(i.name)} ×${i.qty}</span><b>${money(i.lineTotal)}</b></div>`).join("")}</div>
        <div class="totals"><div><span>الشحن إلى ${esc(o.gov)}</span><span>${o.shipping ? money(o.shipping) : "مجاني"}</span></div><div class="grand"><span>الإجمالي</span><span>${money(o.total)}</span></div></div></section>`;
    }, () => { err.textContent = "تعذر الوصول للطلب دلوقتي."; err.classList.remove("hidden"); });
  };
  $("#tcForm").onsubmit = (e) => { e.preventDefault(); run(); };
  if (presetCode) run();
}

/* ---------- تسجيل الدخول ---------- */
function login() {
  box.innerHTML = `<div class="auth-grid"><div class="auth-box">
    <div class="tabs"><button class="${mode === "login" ? "on" : ""}" data-m="login">دخول</button><button class="${mode === "register" ? "on" : ""}" data-m="register">حساب جديد</button></div>
    <form class="form" id="authForm">
      ${mode === "register" ? `<label class="f">الاسم<input name="name" required></label>` : ""}
      <label class="f">البريد الإلكتروني<input name="email" type="email" required autocomplete="email"></label>
      <label class="f">كلمة المرور<input name="pass" type="password" required minlength="6" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></label>
      <div class="msg err hidden" id="authErr"></div>
      <button class="btn btn-primary btn-lg">${mode === "login" ? "دخول" : "إنشاء حساب"}</button>
      <div class="divider">أو</div>
      <button type="button" class="btn btn-ghost" id="google">المتابعة بحساب Google</button>
    </form><p class="muted" style="margin-top:12px;font-size:.9rem">بحسابك بتتابع طلباتك وتكلم الدعم. الطلب نفسه مش لازم حساب.</p></div>${trackBox()}</div>`;
  $$("[data-m]", box).forEach((b) => (b.onclick = () => { mode = b.dataset.m; drawn = null; login(); }));
  const run = async (fn) => { try { await fn(); toast("أهلاً بيك"); } catch (e) { const m = $("#authErr"); m.textContent = authError(e); m.classList.remove("hidden"); } };
  $("#google").onclick = () => run(() => signInWithPopup(auth, new GoogleAuthProvider()));
  $("#authForm").onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); run(async () => {
    if (mode === "login") await signInWithEmailAndPassword(auth, f.email, f.pass);
    else { const c = await createUserWithEmailAndPassword(auth, f.email, f.pass); await updateProfile(c.user, { displayName: f.name }); } }); };
  bindTrack();
}

/* ---------- حسابي ---------- */
const TABS = [["orders", "طلباتي"], ["wish", "المفضلة"], ["track", "تتبع طلب"], ["support", "الدعم"], ["profile", "بياناتي"]];
function hub() {
  box.innerHTML = `<div class="prof"><div><h2>أهلاً ${esc(S.user.displayName || S.user.email)}</h2><p class="muted">${esc(S.user.email || "")}</p></div></div>
    <div class="acc-tabs" role="tablist">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${t}<em class="dot hidden" id="dot-${k}"></em></button>`).join("")}</div>
    <div id="tabBody"></div>`;
  $$("[data-tab]", box).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, "", `account.html#${tab}`); $$("[data-tab]", box).forEach((x) => x.classList.toggle("on", x === b)); body(); }));
  unsubOrders = onSnapshot(query(collection(db, "orders"), where("userId", "==", S.user.uid)), (s) => {
    orders = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (tab === "orders") body();
  }, (e) => { console.error(e); if (tab === "orders") $("#tabBody").innerHTML = `<div class="msg err">تعذر تحميل الطلبات</div>`; });
  body();
}
function body() {
  const el = $("#tabBody"); if (!el) return; stopSupport(); tcUnsub?.();
  if (tab === "support") return mountSupport(el, { orders, presetOrder, presetType });
  if (tab === "profile") return profile(el);
  if (tab === "track") { el.innerHTML = trackBox(); bindTrack(); return; }
  if (tab === "wish") {
    const items = wishList().map((id) => S.products.find((p) => p.id === id)).filter(Boolean);
    el.innerHTML = items.length ? `<div class="grid" id="wg">${items.map((p) => cardHTML(p)).join("")}</div>` : `<div class="empty" style="padding:30px 0"><p>مفيش منتجات في المفضلة.</p><a class="btn btn-primary" style="margin-top:14px" href="shop.html">تصفّح المنتجات</a></div>`;
    if (items.length) bindCards($("#wg")); return;
  }
  el.innerHTML = orders.length ? `<div class="orders">${orders.map((o, i) => `<details class="order-card" ${i === 0 ? "open" : ""}><summary><span><b>#${fmtCode(o.id)}</b><small class="muted"> · ${esc(dateText(o.createdAt))}</small></span><span class="st ${o.status}">${ORDER_STATUS[o.status] || o.status}</span><b>${money(o.total)}</b>${progress(o)}</summary>
    ${timeline(o)}
    <div class="mini">${(o.items || []).map((x) => `<div><img src="${esc(img(x.image, 100))}" alt=""><span>${esc(x.name)} ×${x.qty}</span><b>${money(x.lineTotal ?? x.price * x.qty)}</b></div>`).join("")}</div>
    ${actions(o)}</details>`).join("")}</div>${trackBox()}`
    : `<div class="empty" style="padding:30px 0"><p>لسه معملتش أي طلب.</p><a class="btn btn-primary" style="margin-top:14px" href="shop.html">ابدأ التسوق</a></div>${trackBox()}`;
  el.onclick = (e) => { const b = e.target.closest("[data-again]"); if (!b) return; const o = orders.find((x) => x.id === b.dataset.again); let n = 0; (o?.items || []).forEach((x) => { if (x.id && addToCart(x.id, x.qty, { silent: true })) n++; }); if (n) { toast("اتضافت المنتجات للسلة"); location.href = "cart.html"; } else toast("المنتجات دي مش متاحة حاليًا"); };
  bindTrack();
}
function profile(el) {
  let c = {}; try { c = JSON.parse(localStorage.getItem("joo_customer")) || {}; } catch {}
  el.innerHTML = `<form class="form panel-form" id="pf" style="max-width:560px"><h3>بياناتي</h3>
    <label class="f">الاسم<input name="name" value="${esc(c.name || S.user.displayName || "")}"></label>
    <label class="f">رقم الموبايل<input name="phone" inputmode="tel" pattern="01[0-9]{9}" value="${esc(c.phone || "")}" dir="ltr"></label>
    <label class="f">العنوان<textarea name="address">${esc(c.address || "")}</textarea></label>
    <button class="btn btn-primary">حفظ</button><small class="muted">بتتحفظ على جهازك وتتملي تلقائيًا في الطلب الجاي.</small></form>
    <button class="btn btn-ghost" id="logout" style="margin-top:18px">تسجيل الخروج</button>`;
  $("#pf").onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { localStorage.setItem("joo_customer", JSON.stringify({ ...c, ...f })); } catch {} toast("تم الحفظ"); };
  $("#logout").onclick = async () => { await signOut(auth); toast("تم تسجيل الخروج"); };
}
