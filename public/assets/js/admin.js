import {
  auth, db, collection, query, orderBy, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, doc, getDoc, writeBatch, arrayUnion, Timestamp, increment,
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from "./firebase.js";
import { CLOUDINARY, STORE, ORDER_STATUS, GOVERNORATES, fmtCode } from "./config.js";
import { mergeSettings } from "./core.js";
import { api } from "./api.js";
import { $, $$, esc, money, img, toast, authError, dateText, timeText } from "./utils.js";

const app = $("#app");
const A = { tab: "dash", me: null, products: [], orders: [], reviews: [], tickets: [], sel: null, msgs: [], draft: "", coupons: [], admins: [], settings: mergeSettings(), dirty: false, unsub: [], of: { q: "", st: "" } };
let editing = null;
const code6 = fmtCode;
const dObj = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);

/* ================= Auth gate ================= */
onAuthStateChanged(auth, async (u) => {
  A.unsub.forEach((f) => f()); A.unsub = []; A.me = null;
  if (!u) return showLogin();
  try {
    const snap = await getDoc(doc(db, "admins", u.uid));
    if (snap.exists()) { A.me = { uid: u.uid, email: u.email, ...snap.data() }; return start(); }
  } catch (e) { console.error(e); }
  showDenied(u);
});

function showLogin() {
  let mode = "login";
  const draw = () => {
    app.innerHTML = `<div class="center"><form class="box" id="lf">
      <img src="assets/img/logo.png" alt=""><h2>Joo HQ</h2><small style="color:var(--muted)">لوحة تحكم المتجر</small>
      <div class="tabs"><button type="button" data-m="login" class="${mode === "login" ? "on" : ""}">دخول</button><button type="button" data-m="reg" class="${mode === "reg" ? "on" : ""}">تسجيل حساب</button></div>
      <label class="f" style="text-align:start">البريد<input name="email" type="email" required autocomplete="email"></label>
      <label class="f" style="text-align:start">كلمة المرور<input name="pass" type="password" required minlength="6" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></label>
      <div class="msg err hidden" id="le"></div>
      <button class="btn btn-primary">${mode === "login" ? "دخول" : "إنشاء الحساب"}</button>
      <button type="button" class="btn btn-ghost" id="lg">المتابعة بحساب Google</button>
      ${mode === "reg" ? `<small style="color:var(--muted)">إنشاء الحساب لا يمنح صلاحيات. أول حساب يدخل يتحول لمالك، والباقي يضيفهم المالك.</small>` : ""}
    </form></div>`;
    $$("[data-m]").forEach((b) => (b.onclick = () => { mode = b.dataset.m; draw(); }));
    const fail = (e) => { const m = $("#le"); m.textContent = authError(e); m.classList.remove("hidden"); };
    $("#lf").onsubmit = (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      (mode === "login" ? signInWithEmailAndPassword(auth, f.email, f.pass) : createUserWithEmailAndPassword(auth, f.email, f.pass)).catch(fail);
    };
    $("#lg").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(fail);
  };
  draw();
}

async function showDenied(u) {
  let first = false;
  try { first = !(await getDoc(doc(db, "meta", "bootstrap"))).exists(); } catch {}
  app.innerHTML = `<div class="center"><div class="box"><img src="assets/img/logo.png" alt="">
    ${first ? `<h2>إعداد أول مرة</h2><p>لا يوجد مالك للمتجر بعد. سجّل حسابك <b>${esc(u.email)}</b> كمالك للوحة التحكم.</p>
      <div class="msg err hidden" id="be"></div><button class="btn btn-primary" id="claim">اجعلني المالك</button>`
    : `<h2>غير مصرح لك بالدخول</h2><p>اطلب من مالك المتجر إضافتك كمشرف وأعطه هذا الـ UID:</p><code>${esc(u.uid)}</code>`}
    <button class="btn btn-ghost" id="lo">تسجيل الخروج</button></div></div>`;
  $("#lo").onclick = () => signOut(auth);
  $("#claim")?.addEventListener("click", async () => {
    try {
      const b = writeBatch(db);
      b.set(doc(db, "admins", u.uid), { email: u.email || "", role: "owner", createdAt: serverTimestamp() });
      b.set(doc(db, "meta", "bootstrap"), { uid: u.uid, at: serverTimestamp() });
      await b.commit(); location.reload();
    } catch (e) { console.error(e); const m = $("#be"); m.textContent = "تعذر الإعداد. تأكد من نشر قواعد Firestore الجديدة."; m.classList.remove("hidden"); }
  });
}

/* ================= Start ================= */
const err = (e) => console.error(e);
function alertNew(msg) {
  toast(msg);
  try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(.2, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .5); o.start(); o.stop(c.currentTime + .5); } catch {}
}
const PERMS = [["orders", "الطلبات والعملاء"], ["products", "المنتجات"], ["coupons", "الكوبونات"], ["reviews", "التقييمات"], ["support", "الدعم"], ["settings", "الإعدادات"]];
const can = (k) => A.me?.role === "owner" || A.me?.perms?.[k] === true;
function start() {
  const sub = (q, fn) => A.unsub.push(onSnapshot(q, (s) => { fn(s); render(); }, err));
  sub(query(collection(db, "products"), orderBy("createdAt", "desc")), (s) => (A.products = s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  let seen = null;
  if (can("orders")) sub(query(collection(db, "orders"), orderBy("createdAt", "desc")), (s) => {
    A.orders = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (seen) A.orders.filter((o) => o.status === "new" && !seen.has(o.id)).forEach((o) => alertNew(`طلب جديد #${code6(o.id)} · ${money(o.total)}`));
    seen = new Set(A.orders.map((o) => o.id));
  });
  if (can("reviews")) sub(query(collection(db, "reviews"), orderBy("createdAt", "desc")), (s) => (A.reviews = s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  let seenT = null;
  if (can("support")) sub(query(collection(db, "tickets"), orderBy("updatedAt", "desc")), (s) => {
    A.tickets = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (seenT) A.tickets.filter((t) => t.unreadAdmin && !seenT.has(t.id + (t.updatedAt?.seconds || ""))).forEach((t) => alertNew(`رسالة دعم من ${t.name}`));
    seenT = new Set(A.tickets.map((t) => t.id + (t.updatedAt?.seconds || "")));
  });
  if (can("coupons")) sub(collection(db, "coupons"), (s) => (A.coupons = s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  A.unsub.push(onSnapshot(doc(db, "settings", "store"), (d) => { if (d.exists()) A.settings = mergeSettings(d.data()); if (A.tab === "settings" && !A.dirty) render(); else if (A.tab === "support") render(); }, err));
  if (A.me.role === "owner") sub(collection(db, "admins"), (s) => (A.admins = s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  render();
}

const TABS = () => {
  const n = A.orders.filter((o) => o.status === "new").length, rv = A.reviews.filter((r) => !r.approved).length, sp = A.tickets.filter((t) => t.unreadAdmin).length;
  const d = (c) => (c ? ` <span class="dot">${c}</span>` : "");
  const all = [["البيع", [["dash", "الرئيسية", "orders"], ["orders", "الطلبات" + d(n), "orders"], ["support", "الدعم" + d(sp), "support"], ["reviews", "التقييمات" + d(rv), "reviews"]]],
    ["المتجر", [["products", "المنتجات", "products"], ["coupons", "الكوبونات", "coupons"], ["customers", "العملاء", "orders"], ["settings", "الإعدادات", "settings"]]],
    ...(A.me.role === "owner" ? [["الإدارة", [["team", "المشرفون", "owner"]]]] : [])];
  return all.map(([g, l]) => [g, l.filter(([, , p]) => p === "owner" || can(p)).map(([k, t]) => [k, t])]).filter(([, l]) => l.length);
};
const ALLTABS = () => TABS().flatMap(([, l]) => l);

function render() {
  if (!A.me) return;
  const first = ALLTABS()[0]?.[0]; if (!ALLTABS().some(([k]) => k === A.tab)) A.tab = first;
  if (!first) { app.innerHTML = `<div class="center"><div class="box"><img src="assets/img/logo.png" alt=""><h2>لا توجد صلاحيات</h2><p>حسابك مسجّل كمشرف لكن المالك لسه ما أعطاكش صلاحيات. اطلب منه يفعّلها من تبويب المشرفون.</p><button class="btn btn-ghost" id="lo2">تسجيل الخروج</button></div></div>`; $("#lo2").onclick = () => signOut(auth); return; }
  // لا نعيد رسم الصفحة أثناء الكتابة في حقل بحث
  const keep = document.activeElement?.id;
  const kv = document.activeElement?.value, ks = document.activeElement?.selectionStart;
  app.innerHTML = `<div class="adm"><aside class="side">
    <a class="brand" href="./" target="_blank"><img src="assets/img/favicon.png" alt=""><span>Joo HQ</span></a>
    ${TABS().map(([g, l]) => `<div class="grp"><small>${g}</small>${l.map(([k, t]) => `<button data-tab="${k}" class="${A.tab === k ? "on" : ""}">${t}</button>`).join("")}</div>`).join("")}
    <span class="sp"></span><a href="./" target="_blank" class="vs">عرض المتجر</a><small class="me">${esc(A.me.email)}</small><button id="out">تسجيل الخروج</button>
  </aside><main class="main" id="view"></main></div>`;
  $$("[data-tab]").forEach((b) => (b.onclick = () => { A.tab = b.dataset.tab; A.dirty = false; render(); }));
  $("#out").onclick = () => signOut(auth);
  ({ dash: viewDash, orders: viewOrders, products: viewProducts, coupons: viewCoupons, support: viewSupport, reviews: viewReviews, customers: viewCustomers, settings: viewSettings, team: viewTeam })[A.tab]($("#view"));
  document.title = `${ALLTABS().find(([k]) => k === A.tab)?.[1].replace(/<.*$/, "") || "لوحة التحكم"} | Joo HQ`;
  if (keep && $("#" + keep)) { const el = $("#" + keep); el.focus(); try { if (kv != null && el.value !== undefined) el.setSelectionRange(ks, ks); } catch {} }
}

/* ================= Dashboard ================= */
function viewDash(el) {
  const live = A.orders.filter((o) => o.status !== "cancelled");
  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = day0(new Date()), mStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const at = (o) => dObj(o.createdAt) || new Date(0);
  const sum = (l) => l.reduce((t, o) => t + num(o.total), 0);
  const tdy = live.filter((o) => at(o) >= today), yst = live.filter((o) => at(o) >= day0(today - 864e5) && at(o) < today), mon = live.filter((o) => at(o) >= mStart);
  const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const dl = delta(sum(tdy), sum(yst));
  const days = [...Array(14)].map((_, i) => { const d = new Date(today); d.setDate(d.getDate() - (13 - i)); return d; });
  const pts = days.map((d) => { const l = live.filter((o) => day0(at(o)).getTime() === d.getTime()); return { d, v: sum(l), n: l.length }; });
  const mx = Math.max(...pts.map((p) => p.v), 1), W = 640, H = 170, X = (i) => 20 + (i * (W - 40)) / 13, Y = (v) => H - 14 - (v / mx) * (H - 40);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
  const top = {}; live.forEach((o) => (o.items || []).forEach((i) => (top[i.name] = (top[i.name] || 0) + i.qty)));
  const topList = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5), topMax = topList[0]?.[1] || 1;
  const low = A.products.filter((p) => p.stock != null && p.stock !== "" && p.stock <= 3);
  const st = Object.keys(ORDER_STATUS).map((k) => [k, A.orders.filter((o) => o.status === k).length]);
  const nNew = st[0][1], rv = A.reviews.filter((r) => !r.approved).length, sp = A.tickets.filter((t) => t.unreadAdmin).length;
  const alerts = [[nNew, "طلب جديد", "orders"], [sp, "رسالة دعم", "support"], [rv, "تقييم للمراجعة", "reviews"], [low.length, "منتج مخزونه قليل", "products"]].filter((a) => a[0]);
  el.innerHTML = `<h1>الرئيسية</h1>
    ${alerts.length ? `<div class="alerts">${alerts.map(([n, t, k]) => `<button data-go="${k}"><b>${n}</b> ${t}</button>`).join("")}</div>` : `<div class="alerts ok">كل شيء تمام، مفيش حاجة محتاجة تدخّل.</div>`}
    <div class="stats">
      <div class="stat"><small>مبيعات اليوم</small><b>${money(sum(tdy))}</b><em class="${dl === null ? "" : dl >= 0 ? "up" : "dn"}">${dl === null ? `${tdy.length} طلب` : `${dl >= 0 ? "▲" : "▼"} ${Math.abs(dl)}% عن أمس · ${tdy.length} طلب`}</em></div>
      <div class="stat"><small>مبيعات الشهر</small><b>${money(sum(mon))}</b><em>${mon.length} طلب</em></div>
      <div class="stat"><small>متوسط الطلب</small><b>${money(live.length ? sum(live) / live.length : 0)}</b><em>من ${live.length} طلب</em></div>
      <div class="stat"><small>مستلمة فعليًا</small><b>${money(sum(A.orders.filter((o) => o.status === "delivered")))}</b><em>${A.orders.filter((o) => o.status === "delivered").length} طلب</em></div>
    </div>
    <div class="two"><div class="panel"><h3>المبيعات آخر 14 يوم</h3>
      <svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="مبيعات آخر 14 يوم"><path d="${line} L${X(13)} ${H - 14} L${X(0)} ${H - 14}Z" class="area"/><path d="${line}" class="ln"/>${pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4"><title>${p.d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}: ${money(p.v)} (${p.n} طلب)</title></circle>`).join("")}${[0, 6, 13].map((i) => `<text x="${X(i)}" y="${H}" text-anchor="middle">${pts[i].d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</text>`).join("")}</svg></div>
      <div class="panel"><h3>حالة الطلبات</h3>${st.map(([k, n]) => `<div class="stbar"><span>${ORDER_STATUS[k]}</span><i><u style="width:${A.orders.length ? (n / A.orders.length) * 100 : 0}%"></u></i><b>${n}</b></div>`).join("")}</div></div>
    <div class="two b"><div class="panel"><h3>الأكثر مبيعًا</h3>${topList.map(([n, q]) => `<div class="stbar"><span>${esc(n)}</span><i><u style="width:${(q / topMax) * 100}%"></u></i><b>${q}</b></div>`).join("") || "<p class='muted'>لا بيانات بعد</p>"}</div>
      <div class="panel"><h3>مخزون قليل</h3>${low.map((p) => `<div class="li"><span>${esc(p.name)}</span><b style="color:var(--danger)">${p.stock}</b></div>`).join("") || "<p class='muted'>كل المنتجات متوفرة</p>"}</div></div>
    <h3 style="margin:22px 0 10px">آخر الطلبات</h3>${A.orders.slice(0, 4).map(orderCard).join("") || "<p class='muted'>مفيش طلبات لسه.</p>"}`;
  $$("[data-go]", el).forEach((b) => (b.onclick = () => { A.tab = b.dataset.go; render(); }));
  bindOrders(el);
}

/* ================= Orders ================= */
const num = (n) => Number(n || 0);
function orderCard(o) {
  const c = o.customer || {};
  return `<div class="ord"><header><span>#${code6(o.id)} · ${esc(c.name)}</span>
    <select data-st="${o.id}">${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></header>
    <div class="meta">${dateText(o.createdAt)} · <a href="tel:${esc(c.phone)}" style="color:var(--green-dark);font-weight:700">${esc(c.phone)}</a>${c.phone2 ? ` / ${esc(c.phone2)}` : ""}</div>
    <div class="meta">${esc(c.gov)} - ${esc(c.city)} - ${esc(c.address)}</div>
    <div class="items">${(o.items || []).map((i) => `${esc(i.name)} ×${i.qty}`).join(" ، ")}</div>
    <div class="meta">الدفع: <b>${o.payment === "transfer" ? "تحويل (راجع صورة التحويل في الدعم)" : o.payment === "card" ? `بطاقة · ${({ paid: "مدفوع ✓", failed: "فشل الدفع", pending: "في انتظار الدفع" })[o.paymentStatus] || ""}` : "عند الاستلام"}</b></div>
    ${o.notes ? `<div class="meta">ملاحظات: ${esc(o.notes)}</div>` : ""}
    ${o.coupon?.code ? `<div class="meta">كوبون: <b>${esc(o.coupon.code)}</b> (−${money(o.coupon.discount)})</div>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><b style="color:var(--green-dark)">${money(o.total)} <small style="font-weight:400;color:var(--muted)">(شحن ${money(o.shipping)})</small></b>
    <span style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-print="${o.id}">طباعة</button><a class="btn btn-soft btn-sm" target="_blank" rel="noopener" href="https://wa.me/${String(c.phone || "").replace(/^0/, "20")}">واتساب</a><button class="btn btn-danger btn-sm" data-delo="${o.id}">حذف</button></span></div></div>`;
}
function bindOrders(el) {
  $$("[data-st]", el).forEach((s) => (s.onchange = async () => {
    const id = s.dataset.st, prev = A.orders.find((o) => o.id === id)?.status; s.disabled = true;
    try { await api("order-status", { code: id, status: s.value }); toast(s.value === "cancelled" ? "تم الإلغاء وإرجاع المخزون" : "تم تحديث الحالة"); }
    catch (e) { console.error(e); s.value = prev; toast(e.message || "فشل التحديث", "err"); }
    s.disabled = false;
  }));
  $$("[data-delo]", el).forEach((b) => (b.onclick = () => confirm("حذف الطلب نهائيًا؟") && deleteDoc(doc(db, "orders", b.dataset.delo))));
  $$("[data-print]", el).forEach((b) => (b.onclick = () => printInvoice(A.orders.find((o) => o.id === b.dataset.print))));
}
function viewOrders(el) {
  const { q, st } = A.of;
  el.innerHTML = `<h1>الطلبات</h1><div class="bar"><div style="display:flex;gap:8px;flex-wrap:wrap">
    <input class="sort" id="oq" placeholder="بحث بالاسم/الهاتف/رقم الطلب" value="${esc(q)}" style="min-width:230px">
    <select class="sort" id="of"><option value="">كل الحالات</option>${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${st === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    <button class="btn btn-soft" id="csv">تصدير CSV</button></div><div id="ol"></div>`;
  const list = () => A.orders.filter((o) => (!A.of.st || o.status === A.of.st) && (!A.of.q || `${o.customer?.name} ${o.customer?.phone} ${code6(o.id)}`.toLowerCase().includes(A.of.q.toLowerCase())));
  const draw = () => { $("#ol").innerHTML = list().map(orderCard).join("") || "<p class='muted'>لا توجد طلبات مطابقة.</p>"; bindOrders($("#ol")); };
  $("#oq").oninput = (e) => { A.of.q = e.target.value.trim(); draw(); };
  $("#of").onchange = (e) => { A.of.st = e.target.value; draw(); };
  $("#csv").onclick = () => csv("orders.csv", [["رقم", "التاريخ", "الاسم", "الهاتف", "المحافظة", "العنوان", "المنتجات", "الشحن", "الخصم", "الإجمالي", "الحالة"],
    ...list().map((o) => [code6(o.id), dateText(o.createdAt), o.customer?.name, o.customer?.phone, o.customer?.gov, `${o.customer?.city} ${o.customer?.address}`, (o.items || []).map((i) => `${i.name}×${i.qty}`).join(" | "), o.shipping, o.coupon?.discount || 0, o.total, ORDER_STATUS[o.status]])]);
  draw();
}
function csv(name, rows) {
  const t = "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function printInvoice(o) {
  if (!o) return; const c = o.customer || {};
  const w = window.open("", "_blank"); if (!w) return toast("اسمح بالنوافذ المنبثقة للطباعة", "err");
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>فاتورة ${code6(o.id)}</title><style>
  body{font-family:Cairo,Tahoma,sans-serif;max-width:700px;margin:24px auto;color:#333}h1{color:#4f7243;margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{border-bottom:1px solid #ddd;padding:8px;text-align:right}th{background:#f3f7ef}.r{display:flex;justify-content:space-between}.t{font-size:1.2rem;font-weight:800}</style>
  <div class="r"><div><h1>Joo Store</h1><small>Easy Shopping</small></div><div style="text-align:left"><b>فاتورة #${code6(o.id)}</b><br>${esc(dateText(o.createdAt))}</div></div><hr>
  <p><b>${esc(c.name)}</b><br>${esc(c.phone)}${c.phone2 ? " / " + esc(c.phone2) : ""}<br>${esc(c.gov)} - ${esc(c.city)}<br>${esc(c.address)}</p>
  <table><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join("")}</table>
  <div class="r"><span>المجموع</span><span>${money(o.subtotal)}</span></div>${o.coupon?.discount ? `<div class="r"><span>خصم (${esc(o.coupon.code)})</span><span>−${money(o.coupon.discount)}</span></div>` : ""}
  <div class="r"><span>الشحن</span><span>${money(o.shipping)}</span></div><div class="r t"><span>الإجمالي (الدفع عند الاستلام)</span><span>${money(o.total)}</span></div>
  <script>onload=()=>setTimeout(print,300)<\/script></html>`);
  w.document.close();
}

/* ================= Products ================= */
function viewProducts(el) {
  el.innerHTML = `<h1>المنتجات</h1><div class="bar"><span>${A.products.length} منتج</span><input id="psearch" type="search" placeholder="ابحث باسم المنتج أو القسم" style="flex:1;max-width:320px;padding:9px 14px;border:1.5px solid var(--line);border-radius:12px"><button class="btn btn-primary" id="add">+ منتج جديد</button></div>
  <div class="tbl"><table><thead><tr><th></th><th>المنتج</th><th>القسم</th><th>السعر</th><th>المخزون</th><th></th></tr></thead><tbody>
  ${A.products.map((p) => `<tr class="${p.active === false ? "off" : ""}"><td><img class="t" src="${esc(img(p.images?.[0], 100))}" alt=""></td><td><b>${esc(p.name)}</b>${p.active === false ? " <small>(مخفي)</small>" : ""}</td><td>${esc(p.category || "-")}</td><td><input class="qe" type="number" min="0" step="0.01" value="${p.price}" data-pp="${p.id}" aria-label="السعر"></td><td><input class="qe" type="number" min="0" step="1" value="${p.stock == null || p.stock === "" ? "" : p.stock}" placeholder="∞" data-ps="${p.id}" aria-label="المخزون"></td>
  <td><div class="acts"><button class="btn btn-soft btn-sm" data-edit="${p.id}">تعديل</button><button class="btn btn-ghost btn-sm" data-dup="${p.id}">نسخ</button><button class="btn btn-danger btn-sm" data-del="${p.id}">حذف</button></div></td></tr>`).join("") || `<tr><td colspan="6" style="text-align:center;padding:30px">لا توجد منتجات بعد، أضف أول منتج!</td></tr>`}
  </tbody></table></div>`;
  $("#add").onclick = () => openForm();
  const qe = (attr, field, conv) => $$(`[${attr}]`, el).forEach((i) => (i.onchange = async () => {
    const v = conv(i.value); if (v === undefined) { toast("قيمة غير صالحة", "err"); return; }
    try { await updateDoc(doc(db, "products", i.getAttribute(attr)), { [field]: v, updatedAt: serverTimestamp() }); toast("تم الحفظ ✓"); } catch (e) { console.error(e); toast("فشل الحفظ", "err"); }
  }));
  qe("data-pp", "price", (x) => (x !== "" && +x >= 0 ? +x : undefined)); qe("data-ps", "stock", (x) => (x === "" ? null : +x >= 0 ? +x : undefined));
  $("#psearch")?.addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); $$("tbody tr", el).forEach((r) => r.classList.toggle("hidden", !!q && !r.textContent.toLowerCase().includes(q) && ![...r.querySelectorAll("input")].some((i) => i.value.toLowerCase().includes(q)))); });
  $$("[data-edit]", el).forEach((b) => (b.onclick = () => openForm(A.products.find((p) => p.id === b.dataset.edit))));
  $$("[data-dup]", el).forEach((b) => (b.onclick = () => { const p = A.products.find((x) => x.id === b.dataset.dup); openForm({ ...p, id: undefined, name: p.name + " (نسخة)" }); }));
  $$("[data-del]", el).forEach((b) => (b.onclick = () => confirm("حذف المنتج نهائيًا؟") && deleteDoc(doc(db, "products", b.dataset.del)).then(() => toast("تم الحذف"))));
}

const form = $("#pForm");
function drawImgs() {
  $("#imgs").innerHTML = editing.images.map((u, i) => `<div class="im"><img src="${esc(img(u, 150))}" alt=""><button type="button" data-ri="${i}" aria-label="حذف الصورة">✕</button></div>`).join("");
  $$("[data-ri]").forEach((b) => (b.onclick = () => { editing.images.splice(+b.dataset.ri, 1); drawImgs(); }));
}
function openForm(p) {
  editing = { id: p?.id, images: [...(p?.images || [])] };
  $("#fTitle").textContent = p?.id ? "تعديل منتج" : "منتج جديد";
  form.reset();
  for (const k of ["name", "description", "specs", "video", "buyQty", "payQty", "price", "oldPrice", "category", "stock"]) form.elements[k].value = p?.[k] ?? "";
  form.elements.active.checked = p ? p.active !== false : true; form.elements.featured.checked = !!p?.featured;
  $("#catList").innerHTML = [...new Set(A.products.map((x) => x.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("");
  $("#pErr").classList.add("hidden"); $("#upState").textContent = "";
  drawImgs(); $("#dlgProduct").showModal();
}
async function uploadToCloudinary(file) {
  if (!CLOUDINARY.cloudName || CLOUDINARY.cloudName === "YOUR_CLOUD_NAME") throw new Error("ضع Cloud name في assets/js/config.js");
  if (file.size > 10 * 1024 * 1024) throw new Error("الصورة أكبر من 10MB");
  const fd = new FormData();
  fd.append("file", file); fd.append("upload_preset", CLOUDINARY.uploadPreset); fd.append("folder", CLOUDINARY.folder);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "فشل رفع الصورة");
  return j.secure_url;
}
$("#file").onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = ""; const st = $("#upState"); let n = 0;
  for (const f of files) {
    st.textContent = `جاري رفع ${++n}/${files.length}...`;
    try { editing.images.push(await uploadToCloudinary(f)); drawImgs(); }
    catch (er) { const m = $("#pErr"); m.textContent = er.message; m.classList.remove("hidden"); }
  }
  st.textContent = "";
};
form.onsubmit = async (e) => {
  e.preventDefault();
  const f = form.elements, btn = $("#pSave");
  const data = {
    name: f.name.value.trim(), description: f.description.value.trim(), specs: f.specs.value.trim(), video: f.video.value.trim(), buyQty: f.buyQty.value ? Number(f.buyQty.value) : null, payQty: f.payQty.value ? Number(f.payQty.value) : null, category: f.category.value.trim(),
    price: Number(f.price.value), oldPrice: f.oldPrice.value ? Number(f.oldPrice.value) : null,
    stock: f.stock.value === "" ? null : Number(f.stock.value), images: editing.images, active: f.active.checked, featured: f.featured.checked, updatedAt: serverTimestamp(),
  };
  btn.disabled = true;
  try {
    if (editing.id) await updateDoc(doc(db, "products", editing.id), data);
    else await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
    $("#dlgProduct").close(); toast("تم الحفظ ✓");
  } catch (er) { console.error(er); const m = $("#pErr"); m.textContent = "تعذر الحفظ. تأكد من الصلاحيات."; m.classList.remove("hidden"); }
  btn.disabled = false;
};
$("#dlgProduct").addEventListener("click", (e) => { if (e.target.id === "dlgProduct" || e.target.closest("[data-close]")) e.currentTarget.close(); });

/* ================= Coupons ================= */
function viewCoupons(el) {
  el.innerHTML = `<h1>كوبونات الخصم</h1>
  <form class="panel form" id="cf" style="margin-bottom:18px"><div class="row3">
    <label class="f">الكود<input name="code" required pattern="[A-Za-z0-9_-]{3,20}" placeholder="JOO10" style="text-transform:uppercase"></label>
    <label class="f">النوع<select name="type"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></select></label>
    <label class="f">القيمة<input name="value" type="number" min="1" step="0.01" required></label></div>
  <div class="row3"><label class="f">أقل قيمة للطلب<input name="minOrder" type="number" min="0" value="0"></label>
    <label class="f">ينتهي في (اختياري)<input name="expires" type="date"></label>
    <label class="f">أقصى عدد استخدامات (فاضي = بلا حد)<input name="maxUses" type="number" min="1" step="1"></label></div><div class="row3"><span></span><span></span><button class="btn btn-primary" style="align-self:end">إضافة كوبون</button></div></form>
  <div class="tbl"><table><thead><tr><th>الكود</th><th>الخصم</th><th>الحد الأدنى</th><th>الانتهاء</th><th>الاستخدام</th><th></th></tr></thead><tbody>
  ${A.coupons.map((c) => `<tr class="${c.active === false ? "off" : ""}"><td><b>${esc(c.id)}</b></td><td>${c.type === "percent" ? c.value + "%" : money(c.value)}</td><td>${money(c.minOrder)}</td><td>${esc(c.expires || "-")}</td>
  <td>${c.uses || 0}${c.maxUses ? ` / ${c.maxUses}` : ""}</td>
  <td><div class="acts"><button class="btn btn-soft btn-sm" data-tg="${c.id}">${c.active === false ? "تفعيل" : "إيقاف"}</button><button class="btn btn-danger btn-sm" data-dc="${c.id}">حذف</button></div></td></tr>`).join("") || `<tr><td colspan="6" style="text-align:center;padding:24px">لا توجد كوبونات</td></tr>`}</tbody></table></div>`;
  $("#cf").onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const code = f.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (code.length < 2) return toast("الكود حروف إنجليزي وأرقام، حرفين على الأقل", "err");
    if (f.type === "percent" && +f.value > 100) return toast("النسبة لا تتجاوز 100", "err");
    try { await setDoc(doc(db, "coupons", code), { type: f.type, value: +f.value, minOrder: +f.minOrder || 0, expires: f.expires || null, maxUses: f.maxUses ? Math.floor(+f.maxUses) : null, uses: 0, active: true, createdAt: serverTimestamp() }); toast("تم إضافة الكوبون ✓"); }
    catch { toast("فشل الحفظ", "err"); }
  };
  $$("[data-tg]", el).forEach((b) => (b.onclick = () => { const c = A.coupons.find((x) => x.id === b.dataset.tg); updateDoc(doc(db, "coupons", c.id), { active: c.active === false }); }));
  $$("[data-dc]", el).forEach((b) => (b.onclick = () => confirm("حذف الكوبون؟") && deleteDoc(doc(db, "coupons", b.dataset.dc))));
}

/* ================= Customers ================= */
function viewCustomers(el) {
  const m = new Map();
  A.orders.filter((o) => o.status !== "cancelled").forEach((o) => {
    const k = o.customer?.phone || o.id; const c = m.get(k) || { name: o.customer?.name, phone: o.customer?.phone, gov: o.customer?.gov, n: 0, sum: 0, last: null };
    c.n++; c.sum += num(o.total); if (!c.last) c.last = o.createdAt; m.set(k, c);
  });
  const list = [...m.values()].sort((a, b) => b.sum - a.sum);
  el.innerHTML = `<h1>العملاء</h1><div class="bar"><span>${list.length} عميل</span><button class="btn btn-soft" id="csv">تصدير CSV</button></div>
  <div class="tbl"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>المحافظة</th><th>الطلبات</th><th>إجمالي الشراء</th><th>آخر طلب</th></tr></thead><tbody>
  ${list.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td><td>${esc(c.gov)}</td><td>${c.n}</td><td>${money(c.sum)}</td><td>${dateText(c.last)}</td></tr>`).join("") || `<tr><td colspan="6" style="text-align:center;padding:24px">لا يوجد عملاء بعد</td></tr>`}</tbody></table></div>`;
  $("#csv").onclick = () => csv("customers.csv", [["الاسم", "الهاتف", "المحافظة", "الطلبات", "الإجمالي"], ...list.map((c) => [c.name, c.phone, c.gov, c.n, c.sum])]);
}

/* ================= Settings ================= */
function viewSettings(el) {
  const s = A.settings, so = s.social || {}, h = s.hero || {}, sec = s.sections || {}, pay = s.pay || {}, sup = s.support || {}, d = s.deal || {};
  const row = (cls, vals, ph) => `<div class="rrow ${cls}">${vals.map(([n, v, p, t]) => t === "area" ? `<textarea data-n="${n}" placeholder="${p}" rows="2">${esc(v)}</textarea>` : `<input data-n="${n}" placeholder="${p}" value="${esc(v)}">`).join("")}${cls.startsWith("cat") ? `<label class="btn btn-soft btn-sm">رفع<input type="file" accept="image/*" hidden data-up></label>` : ""}<button type="button" class="btn btn-danger btn-sm" data-rm>✕</button></div>`;
  const chk = (n, v, t) => `<label class="chk"><input type="checkbox" name="${n}" ${v !== false ? "checked" : ""}> ${t}</label>`;
  el.innerHTML = `<h1>الإعدادات</h1><form id="sf" class="sets">
  <details open><summary>عام</summary><div class="form">
    <div class="row"><label class="f">اسم المتجر<input name="name" value="${esc(s.name)}"></label></div>
    <div class="row"><label class="f">واتساب<input name="whatsapp" inputmode="tel" value="${esc(s.whatsapp)}" dir="ltr"></label><label class="f">هاتف<input name="phone" value="${esc(s.phone)}" dir="ltr"></label></div>
    <div class="row"><label class="f">البريد<input name="email" value="${esc(s.email)}" dir="ltr"></label><label class="f">العنوان<input name="address" value="${esc(s.address)}"></label></div>
    <div class="row3"><label class="f">فيسبوك (رابط)<input name="facebook" value="${esc(so.facebook)}" dir="ltr"></label><label class="f">إنستجرام (رابط)<input name="instagram" value="${esc(so.instagram)}" dir="ltr"></label><label class="f">تيك توك (رابط)<input name="tiktok" value="${esc(so.tiktok)}" dir="ltr"></label></div></div></details>
  <details><summary>الصفحة الرئيسية</summary><div class="form">
    <div class="chks">${chk("sec_categories", sec.categories, "الأقسام")}${chk("sec_featured", sec.featured, "المختارات (منتجات مميزة)")}${chk("sec_latest", sec.latest, "وصل جديد")}${chk("sec_top", sec.top, "الأعلى تقييمًا")}${chk("sec_reviews", sec.reviews, "آراء العملاء (التقييمات المعتمدة)")}</div>
    <b>عرض اليوم</b>
    <div class="chks">${chk("deal_on", d.on === true && d.on, "تفعيل")}</div>
    <div class="row"><label class="f">المنتج<select name="deal_p"><option value="">— اختر —</option>${A.products.map((p) => `<option value="${p.id}" ${d.productId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><label class="f">العنوان<input name="deal_title" value="${esc(d.title)}"></label></div>
    <div class="row"><label class="f">ينتهي في<input name="deal_end" type="datetime-local" value="${esc(d.endsAt)}"></label><label class="f">الكمية الأصلية (لشريط المتبقي، المخزون الحالي هو المتبقي)<input name="deal_total" type="number" min="0" value="${num(d.total)}"></label></div>
    <b>ترتيب الأقسام وصورها</b><p class="muted">الأقسام الموجودة هنا بتظهر أول واحدة بالترتيب ده، وباقي الأقسام بعدها. صورة القسم اختيارية.</p>
    <div id="cats">${(s.categories || []).map((c) => row("cat", [["name", c.name, "اسم القسم (مطابق لقسم المنتج)"], ["image", c.image || "", "رابط الصورة"]])).join("")}</div>
    <button type="button" class="btn btn-ghost btn-sm" id="addCat">+ قسم</button></div></details>
  <details><summary>الشحن</summary><div class="form">
    <div class="row"><label class="f">سعر الشحن العام (ج.م)<input name="shipping" type="number" min="0" value="${num(s.shipping)}"></label><label class="f">شحن مجاني فوق (0 = غير مفعل)<input name="freeShippingOver" type="number" min="0" value="${num(s.freeShippingOver)}"></label></div>
    <label class="f">ملاحظة عن التوصيل (تظهر في صفحة المنتج، اختياري)<input name="deliveryNote" value="${esc(s.deliveryNote)}"></label>
    <b>سعر شحن لكل محافظة (فاضي = السعر العام)</b>
    <div class="govs">${GOVERNORATES.map((g) => `<label>${g}<input type="number" min="0" data-gov="${esc(g)}" value="${esc(s.shippingByGov?.[g] ?? "")}"></label>`).join("")}</div></div></details>
  <details><summary>طرق الدفع</summary><div class="form">
    <div class="chks">${chk("pay_cod", pay.cod, "الدفع عند الاستلام")}${chk("pay_transfer", pay.transfer, "تحويل (إنستاباي / محفظة)")}${chk("pay_card", pay.card, "بطاقة / محفظة إلكترونية (Paymob، يحتاج مفاتيح في السيرفر)")}</div>
    <div class="row"><label class="f">إنستاباي (رقم أو عنوان)<input name="instapay" value="${esc(s.instapay)}" dir="ltr"></label><label class="f">رقم المحفظة<input name="wallet" value="${esc(s.wallet)}" dir="ltr"></label></div>
    <p class="muted">الدفع بالكارت أونلاين (Paymob وغيرها) بيتفعّل بعد ربط حساب بوابة الدفع. لسه مش مفعّل.</p></div></details>
  <details><summary>الصفحات والمحتوى</summary><div class="form">
    <label class="f">مدة الاستبدال (أيام)<input name="returnDays" type="number" min="0" value="${num(s.returnDays) || 14}"></label>
    <label class="f">نص صفحة الاستبدال والاسترجاع (سطر لكل فقرة)<textarea name="returnsText" rows="5">${esc(s.returnsText)}</textarea></label>
    <label class="f">نص صفحة من نحن<textarea name="aboutText" rows="4">${esc(s.aboutText)}</textarea></label>
    <b>أسئلة شائعة</b><div id="faqs">${(s.faq || []).map((f) => row("faq", [["q", f.q, "السؤال"], ["a", f.a, "الجواب", "area"]])).join("")}</div>
    <button type="button" class="btn btn-ghost btn-sm" id="addFaq">+ سؤال</button></div></details>
  <details><summary>الدعم الفني</summary><div class="form">
    <label class="f">رسالة ترحيب للعميل<input name="greeting" value="${esc(sup.greeting)}"></label>
    <label class="f">مواعيد الرد (اختياري)<input name="hours" value="${esc(sup.hours)}"></label>
    <label class="f">ردود جاهزة (رد في كل سطر، بتظهر لك كأزرار وانت بترد)<textarea name="quick" rows="5">${esc((sup.quick || []).join("\n"))}</textarea></label></div></details>
  <button class="btn btn-primary btn-lg" style="position:sticky;bottom:12px">حفظ الإعدادات</button></form>`;
  const f = $("#sf");
  f.addEventListener("input", () => (A.dirty = true));
  const add = (id, html) => { $(id).insertAdjacentHTML("beforeend", html); A.dirty = true; };
  $("#addCat").onclick = () => add("#cats", row("cat", [["name", "", "اسم القسم (مطابق لقسم المنتج)"], ["image", "", "رابط الصورة"]]));
  $("#addFaq").onclick = () => add("#faqs", row("faq", [["q", "", "السؤال"], ["a", "", "الجواب", "area"]]));
  f.addEventListener("click", (e) => { const r = e.target.closest("[data-rm]"); if (r) { r.closest(".rrow").remove(); A.dirty = true; } });
  f.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-up]")) return; const file = e.target.files[0]; if (!file) return; const inp = e.target.closest(".rrow").querySelector('[data-n=image]');
    try { toast("جاري رفع الصورة..."); inp.value = await uploadToCloudinary(file); A.dirty = true; toast("تم الرفع ✓"); } catch (er) { toast(er.message, "err"); }
  });
  const rows = (id) => $$(`${id} .rrow`).map((r) => Object.fromEntries($$("[data-n]", r).map((i) => [i.dataset.n, i.value.trim()])));
  f.onsubmit = async (e) => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(f)), on = (n) => f.elements[n].checked;
    const byGov = {}; $$("[data-gov]").forEach((i) => { if (i.value !== "") byGov[i.dataset.gov] = +i.value; });
    const data = {
      name: v.name.trim() || "Joo Store", whatsapp: v.whatsapp.trim(), phone: v.phone.trim(), email: v.email.trim(), address: v.address.trim(),
      social: { facebook: v.facebook.trim(), instagram: v.instagram.trim(), tiktok: v.tiktok.trim() },
      sections: { categories: on("sec_categories"), featured: on("sec_featured"), latest: on("sec_latest"), top: on("sec_top"), reviews: on("sec_reviews") },
      categories: rows("#cats").filter((c) => c.name),
      deal: { on: on("deal_on"), productId: v.deal_p, title: v.deal_title.trim() || "عرض اليوم", endsAt: v.deal_end, total: +v.deal_total || 0 },
      shipping: +v.shipping || 0, freeShippingOver: +v.freeShippingOver || 0, deliveryNote: v.deliveryNote.trim(), shippingByGov: byGov,
      pay: { cod: on("pay_cod"), transfer: on("pay_transfer"), card: on("pay_card") }, instapay: v.instapay.trim(), wallet: v.wallet.trim(),
      returnDays: +v.returnDays || 14, returnsText: v.returnsText.trim(), aboutText: v.aboutText.trim(), faq: rows("#faqs").filter((q) => q.q),
      support: { greeting: v.greeting.trim(), hours: v.hours.trim(), quick: v.quick.split("\n").map((x) => x.trim()).filter(Boolean) },
    };
    try { await setDoc(doc(db, "settings", "store"), data); A.dirty = false; toast("تم حفظ الإعدادات ✓"); } catch (er) { console.error(er); toast("فشل الحفظ", "err"); }
  };
}

/* ================= Team (owner) ================= */
function viewTeam(el) {
  const boxes = (name, perms = {}) => PERMS.map(([k, t]) => `<label class="chk"><input type="checkbox" ${name ? `name="p_${k}"` : `data-pk="${k}"`} ${perms[k] ? "checked" : ""}> ${t}</label>`).join("");
  el.innerHTML = `<h1>المشرفون</h1><div class="panel" style="margin-bottom:18px"><p class="muted" style="margin-bottom:10px">الشخص يسجل حساب من صفحة اللوحة، فتظهر له رسالة فيها UID، يرسله لك وتضيفه هنا وتحدد صلاحياته.</p>
  <form class="form" id="tf"><div class="row"><label class="f">UID<input name="uid" required></label><label class="f">البريد (للتعريف)<input name="email" type="email"></label></div>
  <b>الصلاحيات</b><div class="chks">${boxes("x")}</div><button class="btn btn-primary">إضافة مشرف</button></form></div>
  ${A.admins.map((a) => `<div class="panel" style="margin-bottom:10px"><div class="bar" style="margin:0 0 8px"><b>${esc(a.email || a.id)} <small class="muted">${a.role === "owner" ? "مالك" : "مشرف"}</small></b>${a.role === "owner" || a.id === A.me.uid ? `<small class="muted">${a.role === "owner" ? "كل الصلاحيات" : "(أنت)"}</small>` : `<button class="btn btn-danger btn-sm" data-ra="${a.id}">إزالة</button>`}</div>
  ${a.role === "owner" ? "" : `<div class="chks" data-pid="${a.id}">${boxes("", a.perms || {})}</div>`}</div>`).join("")}`;
  const read = (root) => Object.fromEntries(PERMS.map(([k]) => [k, !!root.querySelector(`[data-pk="${k}"]`)?.checked]));
  $("#tf").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), perms = Object.fromEntries(PERMS.map(([k]) => [k, f.get("p_" + k) === "on"]));
    try { await setDoc(doc(db, "admins", String(f.get("uid")).trim()), { role: "admin", email: String(f.get("email") || "").trim(), perms, createdAt: serverTimestamp() }); toast("تمت الإضافة ✓"); e.target.reset(); }
    catch { toast("فشلت الإضافة", "err"); }
  };
  $$("[data-pid]", el).forEach((c) => c.addEventListener("change", () => updateDoc(doc(db, "admins", c.dataset.pid), { perms: read(c) }).then(() => toast("تم حفظ الصلاحيات ✓")).catch(() => toast("فشل الحفظ", "err"))));
  $$("[data-ra]", el).forEach((b) => (b.onclick = () => confirm("إزالة هذا المشرف؟") && deleteDoc(doc(db, "admins", b.dataset.ra))));
}


/* ================= Support ================= */
let msgUnsub = null, msgFor = null;
function selectTicket(id) {
  A.sel = id; A.msgs = []; msgUnsub?.(); msgFor = id;
  if (!id) return render();
  msgUnsub = onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("createdAt", "asc")), (s) => {
    A.msgs = s.docs.map((d) => d.data()); if (A.tab === "support") { drawThread(); }
  }, err);
  const t = A.tickets.find((x) => x.id === id);
  if (t?.unreadAdmin) updateDoc(doc(db, "tickets", id), { unreadAdmin: false }).catch(err);
  render();
}
function drawThread() {
  const m = $("#adMsgs"); if (!m) return;
  m.innerHTML = A.msgs.map((v) => `<div class="bub ${v.from === "admin" ? "me" : "them"}"><p>${esc(v.text)}</p><small>${esc(timeText(v.createdAt))}</small></div>`).join("");
  m.scrollTop = m.scrollHeight;
}
function viewSupport(el) {
  const t = A.tickets.find((x) => x.id === A.sel);
  el.innerHTML = `<h1>الدعم الفني</h1><div class="supp"><div class="slist">${A.tickets.map((x) => `<button data-t="${x.id}" class="${x.id === A.sel ? "on" : ""}"><b>${esc(x.name)}${x.unreadAdmin ? ` <span class="dot">جديد</span>` : ""}</b><span>${esc(x.subject)}${x.status === "closed" ? " · مغلقة" : ""}</span><small>${esc((x.lastMessage || "").slice(0, 60))}</small></button>`).join("") || "<p class='muted'>لا توجد محادثات بعد.</p>"}</div>
  <div class="sthread">${t ? `<header><div><b>${esc(t.name)}</b> · <a href="tel:${esc(t.phone)}">${esc(t.phone)}</a><br><small>${esc(t.subject)}${t.orderCode ? ` · طلب <b>${esc(fmtCode(t.orderCode))}</b>` : ""}</small></div>
    <button class="btn btn-ghost btn-sm" id="tkToggle">${t.status === "closed" ? "إعادة فتح" : "إغلاق المحادثة"}</button></header>
    <div class="msgs" id="adMsgs"></div>
    ${t.status === "closed" ? "<p class='muted' style='padding:12px'>المحادثة مغلقة.</p>" : `<div class="quick">${(A.settings.support?.quick || []).map((q, i) => `<button type="button" data-q="${i}">${esc(q.length > 38 ? q.slice(0, 38) + "…" : q)}</button>`).join("")}</div><form class="composer" id="adForm"><textarea id="adText" rows="2" placeholder="اكتب الرد...">${esc(A.draft)}</textarea><button class="btn btn-primary">إرسال</button></form>`}` : "<p class='muted' style='padding:30px'>اختر محادثة من القائمة.</p>"}</div></div>`;
  $$("[data-t]", el).forEach((b) => (b.onclick = () => selectTicket(b.dataset.t)));
  if (!t) return; drawThread();
  $("#tkToggle").onclick = () => updateDoc(doc(db, "tickets", t.id), { status: t.status === "closed" ? "open" : "closed" }).catch(() => toast("فشل التحديث", "err"));
  const ta = $("#adText"); if (!ta) return;
  $$("[data-q]", el).forEach((b) => (b.onclick = () => { ta.value = (ta.value ? ta.value + "\n" : "") + A.settings.support.quick[+b.dataset.q]; A.draft = ta.value; ta.focus(); }));
  ta.oninput = () => (A.draft = ta.value);
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#adForm").requestSubmit(); } };
  $("#adForm").onsubmit = async (e) => {
    e.preventDefault(); const text = ta.value.trim(); if (!text) return; A.draft = ""; ta.value = "";
    try {
      const b = writeBatch(db);
      b.set(doc(collection(db, "tickets", t.id, "messages")), { from: "admin", text, createdAt: serverTimestamp() });
      b.update(doc(db, "tickets", t.id), { lastMessage: text.slice(0, 120), lastFrom: "admin", unreadCustomer: true, unreadAdmin: false, updatedAt: serverTimestamp() });
      await b.commit();
    } catch (er) { console.error(er); A.draft = text; ta.value = text; toast("فشل الإرسال", "err"); }
  };
}

/* ================= Reviews ================= */
function viewReviews(el) {
  const row = (r) => `<div class="ord"><header><span>${esc(r.productName || r.productId)} · ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span><span class="muted" style="font-weight:400">${esc(timeText(r.createdAt))}</span></header>
    <div class="meta"><b>${esc(r.name)}</b></div><div class="items">${esc(r.text)}</div>
    <div style="display:flex;gap:8px">${r.approved ? "" : `<button class="btn btn-primary btn-sm" data-ok="${r.id}">اعتماد ونشر</button>`}<button class="btn btn-danger btn-sm" data-del="${r.id}">حذف</button></div></div>`;
  const pend = A.reviews.filter((r) => !r.approved), ok = A.reviews.filter((r) => r.approved);
  el.innerHTML = `<h1>التقييمات</h1><h3 style="margin:8px 0">بانتظار المراجعة (${pend.length})</h3>${pend.map(row).join("") || "<p class='muted'>لا توجد تقييمات جديدة.</p>"}<h3 style="margin:20px 0 8px">المنشورة (${ok.length})</h3>${ok.map(row).join("") || "<p class='muted'>لا يوجد.</p>"}`;
  const find = (id) => A.reviews.find((r) => r.id === id);
  $$("[data-ok]", el).forEach((b) => (b.onclick = async () => {
    const r = find(b.dataset.ok); b.disabled = true;
    try { const w = writeBatch(db); w.update(doc(db, "reviews", r.id), { approved: true }); w.update(doc(db, "products", r.productId), { ratingSum: increment(r.rating), ratingCount: increment(1) }); await w.commit(); toast("تم النشر ✓"); }
    catch (e) { console.error(e); toast("فشل الاعتماد (قد يكون المنتج محذوفًا)", "err"); b.disabled = false; }
  }));
  $$("[data-del]", el).forEach((b) => (b.onclick = async () => {
    const r = find(b.dataset.del); if (!confirm("حذف التقييم؟")) return;
    try { const w = writeBatch(db); w.delete(doc(db, "reviews", r.id)); if (r.approved) w.update(doc(db, "products", r.productId), { ratingSum: increment(-r.rating), ratingCount: increment(-1) }); await w.commit(); toast("تم الحذف"); }
    catch (e) { console.error(e); toast("فشل الحذف", "err"); }
  }));
}
