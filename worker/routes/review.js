import { HttpError, verifyIdToken } from "../lib/google-auth.js";
import { getOne, commit } from "../lib/firestore.js";
import { json, readJson, rateLimit } from "../lib/http.js";

const ID = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => ID[n % ID.length]).join("");
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Customer reviews are created here (not from the browser) so they can be rate limited and validated.
// They stay hidden (approved: false) until a dashboard user approves them.
export async function createReview(req, env) {
  await rateLimit(req, env, "review", 5, 10 * 60 * 1000, "RL_REVIEW");
  const b = await readJson(req, 4096);
  if (b.website) throw new HttpError(400, "bad_request", "طلب مرفوض");
  const productId = String(b.productId || ""), rating = Number(b.rating), name = clean(b.name, 60), text = clean(b.text, 1000);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(productId)) throw new HttpError(400, "bad_product", "منتج غير صالح");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "bad_rating", "اختر تقييمًا من 1 إلى 5");
  if (name.length < 2) throw new HttpError(400, "bad_name", "اكتب اسمك");
  if (!text) throw new HttpError(400, "bad_text", "اكتب رأيك في المنتج");
  const p = await getOne(env, `products/${productId}`);
  if (!p || p.active === false) throw new HttpError(404, "not_found", "المنتج غير موجود");
  const user = await verifyIdToken(env, (req.headers.get("authorization") || "").replace(/^Bearer /i, ""));
  await commit(env, [{ create: [`reviews/${newId()}`, { productId, productName: clean(p.name, 200), name, rating, text, approved: false, ...(user ? { userId: user.uid } : {}), createdAt: new Date() }] }]);
  return json({ ok: true }, 201);
}
