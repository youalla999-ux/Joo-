// Paymob (Accept) card payments. Enabled only when PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, PAYMOB_HMAC are set.
import { HttpError } from "../lib/google-auth.js";
import { transact, getMany, commit } from "../lib/firestore.js";
import { json } from "../lib/http.js";

export const paymobEnabled = (env) => !!(env.PAYMOB_API_KEY && env.PAYMOB_INTEGRATION_ID && env.PAYMOB_IFRAME_ID && env.PAYMOB_HMAC);

async function pm(path, body) {
  const r = await fetch(`https://accept.paymob.com/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, "paymob_error", "تعذر بدء الدفع بالبطاقة");
  return j;
}

// Creates a payment session for an existing order and returns the hosted iframe URL.
export async function startCardPayment(env, order, code) {
  const cents = Math.round(order.total * 100);
  const { token } = await pm("auth/tokens", { api_key: env.PAYMOB_API_KEY });
  const o = await pm("ecommerce/orders", { auth_token: token, delivery_needed: false, amount_cents: cents, currency: "EGP", merchant_order_id: code, items: [] });
  const [first, ...rest] = (order.customer.name || "Customer").split(" ");
  const k = await pm("acceptance/payment_keys", {
    auth_token: token, amount_cents: cents, expiration: 3600, order_id: o.id, currency: "EGP", integration_id: Number(env.PAYMOB_INTEGRATION_ID),
    billing_data: { first_name: first, last_name: rest.join(" ") || "NA", email: "NA", phone_number: order.customer.phone, apartment: "NA", floor: "NA", street: order.customer.address.slice(0, 80), building: "NA", shipping_method: "NA", postal_code: "NA", city: order.customer.city, country: "EG", state: order.customer.gov },
  });
  return `https://accept.paymob.com/api/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${k.token}`;
}

const HMAC_FIELDS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"];
const dig = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function paymobWebhook(req, env) {
  if (!paymobEnabled(env)) throw new HttpError(404, "not_enabled", "");
  const url = new URL(req.url), given = url.searchParams.get("hmac") || "";
  const body = await req.json().catch(() => null);
  if (!body?.obj) throw new HttpError(400, "bad_request", "");
  const expected = await hmacHex(env.PAYMOB_HMAC, HMAC_FIELDS.map((f) => String(dig(body.obj, f) ?? "")).join(""));
  const a = new TextEncoder().encode(expected), c = new TextEncoder().encode(given.toLowerCase());
  let diff = a.length ^ c.length; for (let i = 0; i < a.length; i++) diff |= a[i] ^ (c[i] ?? 0);
  if (diff !== 0) throw new HttpError(401, "bad_signature", "");
  const code = String(body.obj.order?.merchant_order_id || "");
  if (!/^[A-Z0-9]{10}$/.test(code) || body.type !== "TRANSACTION") return json({ ok: true, ignored: true });
  const success = body.obj.success === true && body.obj.pending !== true && body.obj.is_voided !== true && body.obj.is_refunded !== true;
  await transact(env, async (tx) => {
    const o = (await getMany(env, [`orders/${code}`], tx))[`orders/${code}`];
    if (!o || o.payment !== "card" || o.paymentStatus === "paid") return;
    // never trust the amount in the callback blindly: it must match what we asked for
    if (success && Number(body.obj.amount_cents) !== Math.round(o.total * 100)) return;
    const patch = { paymentStatus: success ? "paid" : "failed", paymentRef: String(body.obj.id || "") };
    const writes = [{ patch: [`orders/${code}`, patch] }, { patch: [`track/${code}`, { paymentStatus: patch.paymentStatus }] }];
    if (success && o.status === "new") {
      const history = [...(o.history || []), { status: "confirmed", at: new Date() }];
      writes[0].patch[1].status = "confirmed"; writes[0].patch[1].history = history;
      writes[1].patch[1].status = "confirmed"; writes[1].patch[1].history = history;
    }
    await commit(env, writes, tx);
  });
  return json({ ok: true });
}
