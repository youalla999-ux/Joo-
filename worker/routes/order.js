import { HttpError, verifyIdToken } from "../lib/google-auth.js";
import { transact, getMany, commit } from "../lib/firestore.js";
import { GOVERNORATES, lineTotal, shipFor, couponDiscount, paymentMethods } from "../lib/pricing.js";
import { json, readJson, rateLimit } from "../lib/http.js";
import { paymobEnabled, startCardPayment } from "./paymob.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => ALPHABET[n % ALPHABET.length]).join("");
// a client-generated random key makes retries/double-clicks land on the same order instead of creating duplicates
async function codeFromKey(key) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`joo-order:${key}`)));
  return Array.from(h.slice(0, 10), (n) => ALPHABET[n % ALPHABET.length]).join("");
}
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function validate(b) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "بيانات غير صالحة");
  if (b.website) throw new HttpError(400, "bad_request", "طلب مرفوض"); // honeypot
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw new HttpError(400, "empty_cart", "السلة فاضية");
  const merged = new Map();
  for (const it of b.items) {
    const id = String(it?.id ?? ""), qty = Number(it?.qty);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, "bad_item", "منتج غير صالح في السلة");
    merged.set(id, Math.min(99, (merged.get(id) || 0) + qty));
  }
  const c = b.customer || {};
  const customer = { name: clean(c.name, 80), phone: clean(c.phone, 11), phone2: clean(c.phone2, 20), gov: clean(c.gov, 40), city: clean(c.city, 60), address: clean(c.address, 300) };
  if (customer.name.length < 3) throw new HttpError(400, "bad_name", "اكتب الاسم بالكامل");
  if (!/^01[0-9]{9}$/.test(customer.phone)) throw new HttpError(400, "bad_phone", "رقم الموبايل غير صحيح");
  if (!GOVERNORATES.includes(customer.gov)) throw new HttpError(400, "bad_gov", "اختر المحافظة");
  if (!customer.city) throw new HttpError(400, "bad_city", "اكتب المدينة أو المنطقة");
  if (customer.address.length < 8) throw new HttpError(400, "bad_address", "اكتب العنوان بالتفصيل");
  const coupon = String(b.coupon || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
  const key = /^[A-Za-z0-9_-]{16,64}$/.test(String(b.key || "")) ? String(b.key) : "";
  return { key, merged, customer, notes: clean(b.notes, 500), payment: ["transfer", "card"].includes(b.payment) ? b.payment : "cod", coupon };
}

export async function createOrder(req, env) {
  await rateLimit(req, env, "order", 8, 10 * 60 * 1000, "RL_ORDER");
  const input = validate(await readJson(req));
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const user = await verifyIdToken(env, bearer);

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = input.key ? await codeFromKey(input.key) : newCode();
    try {
      const result = await transact(env, async (tx) => {
        const ids = [...input.merged.keys()];
        const prior = input.key ? (await getMany(env, [`orders/${code}`], tx))[`orders/${code}`] : null;
        if (prior) return { code, total: prior.total, shipping: prior.shipping, discount: prior.coupon?.discount || 0, subtotal: prior.subtotal, payment: prior.payment, name: prior.customer?.name, phone: prior.customer?.phone, customer: prior.customer, duplicate: true, writesDone: true };
        const paths = [...ids.map((i) => `products/${i}`), "settings/store", ...(input.coupon ? [`coupons/${input.coupon}`] : [])];
        const docs = await getMany(env, paths, tx);
        const settings = docs["settings/store"] || {};
        const pm = paymentMethods(settings);
        pm.card = paymobEnabled(env);
        if (!pm[input.payment]) throw new HttpError(400, "payment_unavailable", "طريقة الدفع دي غير متاحة حاليًا");

        const items = [], writes = [], problems = [];
        let subtotal = 0;
        for (const id of ids) {
          const p = docs[`products/${id}`], qty = input.merged.get(id);
          if (!p || p.active === false) { problems.push({ id, name: p?.name || "", reason: "unavailable" }); continue; }
          const stock = p.stock === null || p.stock === undefined ? null : Number(p.stock);
          if (stock !== null && stock < qty) { problems.push({ id, name: p.name, reason: "stock", available: Math.max(0, stock) }); continue; }
          const lt = lineTotal(p, qty);
          subtotal += lt;
          items.push({ id, name: String(p.name).slice(0, 200), price: Number(p.price), qty, lineTotal: lt, image: p.images?.[0] || "" });
          if (stock !== null) writes.push({ increment: [`products/${id}`, "stock", -qty] });
        }
        if (problems.length) throw new HttpError(409, "unavailable", "بعض المنتجات في السلة تغيّر توافرها، راجع السلة.", { problems });

        let discount = 0, couponInfo = null;
        if (input.coupon) {
          const r = couponDiscount(docs[`coupons/${input.coupon}`], subtotal);
          if (!r.ok) throw new HttpError(400, "coupon_invalid", r.reason);
          if (r.discount > 0) {
            discount = r.discount; couponInfo = { code: input.coupon, discount };
            writes.push({ increment: [`coupons/${input.coupon}`, "uses", 1] });
          }
        }
        const net = subtotal - discount, free = Number(settings.freeShippingOver) || 0;
        const shipping = !net || (free > 0 && net >= free) ? 0 : shipFor(settings, input.customer.gov);
        const total = net + shipping, now = new Date(), history = [{ status: "new", at: now }];

        writes.unshift(
          { create: [`orders/${code}`, { userId: user?.uid ?? null, customer: input.customer, notes: input.notes, items, subtotal, shipping, coupon: couponInfo, total, payment: input.payment, ...(input.payment === "card" ? { paymentStatus: "pending" } : {}), status: "new", history, restocked: false, createdAt: now }] },
          { create: [`track/${code}`, { status: "new", history, items: items.map(({ name, qty, lineTotal, image }) => ({ name, qty, lineTotal, image })), shipping, total, discount, gov: input.customer.gov, city: input.customer.city, payment: input.payment, ...(input.payment === "card" ? { paymentStatus: "pending" } : {}), createdAt: now }] },
        );
        await commit(env, writes, tx);
        return { code, total, shipping, discount, subtotal, payment: input.payment, name: input.customer.name, phone: input.customer.phone, customer: input.customer };
      });
      const { customer, writesDone, ...pub } = result;
      if (pub.payment === "card" && !pub.duplicate) {
        try { pub.payUrl = await startCardPayment(env, { total: pub.total, customer }, code); }
        catch (e) { console.error("paymob", e); pub.payUrl = null; pub.payError = "تم تسجيل طلبك لكن تعذر فتح صفحة الدفع. تواصل معنا لإتمام الدفع."; }
      }
      return json({ ok: true, ...pub }, pub.duplicate ? 200 : 201);
    } catch (e) {
      if (e.status === 409 && e.code === "aborted") continue;
      if (e.code === "exists" && !input.key) continue; // random code collision: pick another
      throw e;
    }
  }
  throw new HttpError(503, "busy", "السيرفر مشغول، حاول مرة أخرى.");
}
