import { HttpError } from "../lib/google-auth.js";
import { getMany } from "../lib/firestore.js";
import { couponDiscount } from "../lib/pricing.js";
import { json, readJson, rateLimit } from "../lib/http.js";

// Coupon documents are private (rules deny client reads), so codes can't be listed or scraped.
// The cart asks here; only a valid code returns its terms, and guessing is rate limited.
export async function checkCoupon(req, env) {
  await rateLimit(req, env, "coupon", 12, 10 * 60 * 1000, "RL_COUPON");
  const b = await readJson(req, 2000);
  const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
  if (code.length < 2) throw new HttpError(400, "coupon_invalid", "اكتب كود الخصم");
  const c = (await getMany(env, [`coupons/${code}`]))[`coupons/${code}`];
  const r = couponDiscount(c, Number.MAX_SAFE_INTEGER); // validity only; the amount is computed at checkout
  if (!r.ok) throw new HttpError(400, "coupon_invalid", r.reason);
  return json({ ok: true, coupon: { code, type: c.type, value: Number(c.value), minOrder: Number(c.minOrder) || 0 } });
}
