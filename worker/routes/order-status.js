import { HttpError, verifyIdToken } from "../lib/google-auth.js";
import { transact, getMany, commit } from "../lib/firestore.js";
import { json, readJson } from "../lib/http.js";

const STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];

async function requirePerm(env, bearer, perm) {
  const user = await verifyIdToken(env, bearer);
  if (!user) throw new HttpError(401, "unauthenticated", "سجّل الدخول أولًا");
  const a = (await getMany(env, [`admins/${user.uid}`]))[`admins/${user.uid}`];
  if (!a || !(a.role === "owner" || a.perms?.[perm] === true)) throw new HttpError(403, "forbidden", "ليس لديك صلاحية");
  return user;
}

// Changes an order's status, mirrors it to the public track doc, and restocks on cancel (idempotent).
export async function setOrderStatus(req, env) {
  const body = await readJson(req);
  const code = String(body.code || ""), status = String(body.status || "");
  if (!/^[A-Z0-9]{10}$/.test(code) || !STATUSES.includes(status)) throw new HttpError(400, "bad_request", "بيانات غير صالحة");
  await requirePerm(env, (req.headers.get("authorization") || "").replace(/^Bearer /i, ""), "orders");

  const out = await transact(env, async (tx) => {
    const o = (await getMany(env, [`orders/${code}`], tx))[`orders/${code}`];
    if (!o) throw new HttpError(404, "not_found", "الطلب غير موجود");
    if (o.status === status) return { status, unchanged: true };
    const entry = { status, at: new Date() }, history = [...(o.history || []), entry];
    const writes = [
      { patch: [`orders/${code}`, { status, history }] },
      { patch: [`track/${code}`, { status, history }] },
    ];
    // cancel → return stock once; re-open a cancelled order → take it again (if still limited stock)
    const limited = (o.items || []);
    if (status === "cancelled" && !o.restocked) {
      const prods = await getMany(env, limited.map((i) => `products/${i.id}`), tx);
      for (const i of limited) if (prods[`products/${i.id}`] && prods[`products/${i.id}`].stock !== null && prods[`products/${i.id}`].stock !== undefined) writes.push({ increment: [`products/${i.id}`, "stock", i.qty] });
      if (o.coupon?.code) writes.push({ increment: [`coupons/${o.coupon.code}`, "uses", -1] });
      writes[0].patch[1].restocked = true;
    } else if (o.status === "cancelled" && status !== "cancelled" && o.restocked) {
      const prods = await getMany(env, limited.map((i) => `products/${i.id}`), tx);
      for (const i of limited) {
        const p = prods[`products/${i.id}`];
        if (p && p.stock !== null && p.stock !== undefined) {
          if (p.stock < i.qty) throw new HttpError(409, "out_of_stock", `لا يوجد مخزون كافٍ من "${i.name}" لإعادة فتح الطلب`);
          writes.push({ increment: [`products/${i.id}`, "stock", -i.qty] });
        }
      }
      if (o.coupon?.code) writes.push({ increment: [`coupons/${o.coupon.code}`, "uses", 1] });
      writes[0].patch[1].restocked = false;
    }
    await commit(env, writes, tx);
    return { status };
  });
  return json({ ok: true, ...out });
}
