// Server-side pricing: the single source of truth. Mirrors the storefront maths but never trusts client numbers.
export const GOVERNORATES = ["القاهرة","الجيزة","الإسكندرية","القليوبية","الشرقية","الدقهلية","الغربية","المنوفية","كفر الشيخ","البحيرة","دمياط","بورسعيد","الإسماعيلية","السويس","شمال سيناء","جنوب سيناء","الفيوم","بني سويف","المنيا","أسيوط","سوهاج","قنا","الأقصر","أسوان","البحر الأحمر","الوادي الجديد","مطروح"];

export const offerOf = (p) => { const b = Number(p.buyQty), y = Number(p.payQty); return b > 1 && y >= 1 && y < b ? { buy: b, pay: y } : null; };
export const lineTotal = (p, qty) => { const o = offerOf(p); const price = Number(p.price) || 0; return o ? price * (qty - Math.floor(qty / o.buy) * (o.buy - o.pay)) : price * qty; };

export function shipFor(settings, gov) {
  const v = settings.shippingByGov?.[gov];
  return v !== undefined && v !== "" && v !== null ? Number(v) || 0 : Number(settings.shipping) || 0;
}

// Returns { ok, discount, reason }
export function couponDiscount(c, subtotal, now = new Date()) {
  if (!c || c.active === false) return { ok: false, reason: "الكود غير صحيح" };
  if (c.expires && new Date(`${c.expires}T23:59:59+02:00`) < now) return { ok: false, reason: "انتهت صلاحية الكود" };
  if (Number(c.maxUses) > 0 && Number(c.uses || 0) >= Number(c.maxUses)) return { ok: false, reason: "الكود وصل للحد الأقصى من الاستخدام" };
  if (subtotal < (Number(c.minOrder) || 0)) return { ok: false, reason: `الكود يتطبق على طلبات من ${Number(c.minOrder)} ج.م` };
  const raw = c.type === "percent" ? Math.round((subtotal * Number(c.value)) / 100) : Number(c.value);
  return { ok: true, discount: Math.min(subtotal, Math.max(0, raw)) };
}

export function paymentMethods(settings) {
  const pay = settings.pay || {};
  return { cod: pay.cod !== false, transfer: pay.transfer !== false && !!(settings.instapay || settings.wallet) };
}
