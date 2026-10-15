// حالة المتجر المشتركة بين كل الصفحات: المنتجات، الإعدادات، السلة، الكوبون، المستخدم
import { auth, db, collection, query, orderBy, onSnapshot, doc, getDoc, onAuthStateChanged } from "./firebase.js";
import { STORE } from "./config.js";
import { esc, money, img, toast } from "./utils.js";
import { mountLayout, updateChrome, bump } from "./layout.js";
import { initSearch } from "./search.js";

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const cached = load("joo_pcache", null); // عرض فوري من آخر زيارة
export function mergeSettings(d = {}) {
  const o = { ...STORE.defaults, ...d };
  for (const k of ["social", "pay", "hero", "sections", "support", "deal"]) o[k] = { ...STORE.defaults[k], ...(d[k] || {}) };
  return o;
}

const wl = () => load("joo_wish", []);
export const isWished = (id) => wl().includes(id);
export function toggleWish(id) { const a = wl(), i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); save("joo_wish", a); return i < 0; }
export const wishList = () => wl();

export const S = {
  products: cached || [],
  loaded: !!cached,
  settings: mergeSettings(),
  gov: "",
  cart: load("joo_cart", []), // [{id, qty}]
  coupon: load("joo_coupon", null),
  user: null,
  authReady: false,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn); }
let curActive = "";
function emit() { chrome(); listeners.forEach((f) => f()); }

/* ---------- Data ---------- */
export function start(active) {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost") && !navigator.webdriver) navigator.serviceWorker.register("/sw.js").catch(() => {});
  curActive = active; mountLayout(active);
  initSearch({ products: () => S.products, money, img, esc });
  chrome();
  onSnapshot(
    query(collection(db, "products"), orderBy("createdAt", "desc")),
    (snap) => { S.products = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.active !== false); S.loaded = true; S.error = false;
      save("joo_pcache", S.products.slice(0, 60).map(({ createdAt, updatedAt, ...p }) => p)); emit(); },
    (e) => { console.error(e); S.loaded = true; S.error = true; emit(); }
  );
  onSnapshot(doc(db, "settings", "store"), (d) => { if (d.exists()) S.settings = mergeSettings(d.data()); emit(); }, () => {});
  onAuthStateChanged(auth, (u) => { S.user = u && !u.isAnonymous ? u : null; S.authReady = true; emit(); });
  addEventListener("storage", (e) => { if (e.key === "joo_cart") { S.cart = load("joo_cart", []); emit(); } });
}

/* ---------- Helpers ---------- */
export const soldOut = (p) => p.stock != null && p.stock !== "" && Number(p.stock) <= 0;
export const maxQty = (p) => (p.stock != null && p.stock !== "" ? Number(p.stock) : 99);
export const findProduct = (id) => S.products.find((p) => p.id === id);
export const categories = () => [...new Set(S.products.map((p) => p.category).filter(Boolean))];
export const discountPct = (p) => (p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

const waNumber = () => String(S.settings.whatsapp || "").replace(/\D/g, "").replace(/^0/, "20");
export const waLink = (text = "") => (waNumber() ? `https://wa.me/${waNumber()}${text ? "?text=" + encodeURIComponent(text) : ""}` : "");

/* ---------- Cart ---------- */
export const cartLines = () => S.cart.map((c) => ({ ...c, p: findProduct(c.id) })).filter((l) => l.p);
export const cartCount = () => cartLines().reduce((s, l) => s + l.qty, 0);
// عرض "اشترِ N وادفع M" على منتج (buyQty / payQty)
export const offerOf = (p) => { const b = Number(p.buyQty), y = Number(p.payQty); return b > 1 && y >= 1 && y < b ? { buy: b, pay: y } : null; };
export const lineTotal = (p, qty) => { const o = offerOf(p); return o ? p.price * (qty - Math.floor(qty / o.buy) * (o.buy - o.pay)) : p.price * qty; };
export const subtotal = () => cartLines().reduce((s, l) => s + lineTotal(l.p, l.qty), 0);
export const discount = () => {
  const c = S.coupon, sub = subtotal();
  if (!c || sub < (c.minOrder || 0)) return 0;
  return Math.min(sub, c.type === "percent" ? Math.round((sub * c.value) / 100) : c.value);
};
// سعر الشحن: حسب المحافظة لو محدد من اللوحة، وإلا السعر العام
export const shipFor = (gov) => { const v = S.settings.shippingByGov?.[gov]; return v !== undefined && v !== "" && v !== null ? Number(v) || 0 : Number(S.settings.shipping) || 0; };
export const shipping = (gov = S.gov) => {
  const net = subtotal() - discount(); const free = Number(S.settings.freeShippingOver) || 0;
  return !net || (free > 0 && net >= free) ? 0 : shipFor(gov);
};
export const shipRange = () => { const v = Object.values(S.settings.shippingByGov || {}).filter((x) => x !== "" && x != null).map(Number); if (!v.length) return null; const all = [...v, Number(S.settings.shipping) || 0]; return [Math.min(...all), Math.max(...all)]; };
export const grandTotal = () => subtotal() - discount() + shipping();

function persist() { save("joo_cart", S.cart); emit(); }

export function addToCart(id, n = 1, { silent = false } = {}) {
  const p = findProduct(id); if (!p || soldOut(p)) return false;
  const line = S.cart.find((c) => c.id === id);
  if (line) line.qty = Math.min(maxQty(p), line.qty + n); else S.cart.push({ id, qty: Math.min(maxQty(p), n) });
  persist(); bump();
  if (!silent) { toast("اتضاف للسلة"); document.dispatchEvent(new CustomEvent("joo:added")); }
  return true;
}
export function setQty(id, qty) {
  const p = findProduct(id); const l = S.cart.find((c) => c.id === id); if (!l) return;
  l.qty = Math.min(p ? maxQty(p) : 99, qty);
  if (l.qty <= 0) S.cart = S.cart.filter((c) => c !== l);
  persist();
}
export function removeFromCart(id) { S.cart = S.cart.filter((c) => c.id !== id); persist(); }
export function clearCart() { S.cart = []; S.coupon = null; save("joo_coupon", null); persist(); }

export async function applyCoupon(raw) {
  const code = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""); if (!code) return { ok: false, msg: "اكتب كود الخصم" };
  try {
    const d = await getDoc(doc(db, "coupons", code)); const c = d.exists() ? d.data() : null;
    if (!c || c.active === false) return { ok: false, msg: "الكود غير صحيح" };
    if (c.expires && new Date(c.expires + "T23:59:59") < new Date()) return { ok: false, msg: "انتهت صلاحية الكود" };
    if (c.maxUses && (c.uses || 0) >= c.maxUses) return { ok: false, msg: "الكود استُنفد" };
    S.coupon = { code, type: c.type, value: Number(c.value), minOrder: Number(c.minOrder) || 0 };
    save("joo_coupon", S.coupon); emit();
    return discount() ? { ok: true, msg: "تم تطبيق الخصم" } : { ok: true, msg: `الكود مفعّل. الحد الأدنى للطلب ${money(S.coupon.minOrder)}` };
  } catch { return { ok: false, msg: "تعذر التحقق من الكود" }; }
}
export function removeCoupon() { S.coupon = null; save("joo_coupon", null); emit(); }

function chrome() {
  const st = S.settings; updateChrome({ active: curActive, name: st.name, about: st.aboutText, phone: st.phone, email: st.email, address: st.address, social: st.social, total: money(grandTotal()), count: cartCount(), cats: categories().map((c) => [c, S.products.filter((p) => p.category === c).length]), wa: waLink(), user: S.user });
}

/* ---------- Shared UI pieces ---------- */
export function cardHTML(p, { feature = false } = {}) {
  const off = discountPct(p), imgs = p.images || [], out = soldOut(p), w = feature ? 900 : 560;
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `<article class="card${feature ? " feature" : ""}${out ? " sold" : ""}">
    <div class="pic">
      <a href="${href}" aria-label="${esc(p.name)}">
        ${imgs[0] ? `<img src="${esc(img(imgs[0], w))}" alt="${esc(p.name)}" loading="lazy">` : `<div class="ph"><img src="assets/img/bags.png" alt=""></div>`}
        ${imgs[1] ? `<img src="${esc(img(imgs[1], w))}" alt="" loading="lazy">` : ""}
      </a>
      ${out ? `<span class="tag out">نفد</span>` : offerOf(p) ? `<span class="tag deal">اشترِ ${offerOf(p).buy} وادفع ${offerOf(p).pay}</span>` : off ? `<span class="tag">وفّر ${off}%</span>` : ""}
      <button class="wish${isWished(p.id) ? " on" : ""}" data-wish="${p.id}" aria-label="المفضلة" aria-pressed="${isWished(p.id)}"><svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.600-7.500 10.200-7.500 10.200z"/></svg></button>
    </div>
    <div class="info"><span class="cat">${esc(p.category || "")}</span><h3><a href="${href}">${esc(p.name)}</a></h3>${stars(p)}<div class="price"><b>${money(p.price)}</b>${off ? `<s>${money(p.oldPrice)}</s>` : ""}</div><button class="add" data-add="${p.id}" aria-label="أضف ${esc(p.name)} للسلة" ${out ? "disabled" : ""}>${out ? "غير متوفر" : "أضف للسلة"}</button></div>
  </article>`;
}
export const stars = (p) => (p.ratingCount > 0 ? `<span class="stars" aria-label="تقييم ${(p.ratingSum / p.ratingCount).toFixed(1)} من 5">★ ${(p.ratingSum / p.ratingCount).toFixed(1)} <small>(${p.ratingCount})</small></span>` : "");
// يربط أزرار "+" داخل أي حاوية
export function bindCards(root) {
  root.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wish]");
    if (w) { e.preventDefault(); const on = toggleWish(w.dataset.wish); w.classList.toggle("on", on); w.setAttribute("aria-pressed", on); toast(on ? "اتضاف للمفضلة" : "اتشال من المفضلة"); return; }
    const b = e.target.closest("[data-add]"); if (b) { e.preventDefault(); addToCart(b.dataset.add); }
  });
}
export const skeletons = (n = 4) => Array.from({ length: n }, () => `<div class="skeleton"></div>`).join("");
export const emptyHTML = (msg, cta) => `<div class="empty"><img src="assets/img/bags.png" alt="" width="110" style="margin:0 auto 14px"><p>${msg}</p>${cta ? `<a class="btn btn-primary" style="margin-top:16px" href="${cta[0]}">${cta[1]}</a>` : ""}</div>`;
export function setTitle(t) { document.title = `${t} | Joo Store`; }
