// Runs the Worker against an in-memory fake of Google OAuth + Firestore REST. `node tests/unit/worker.test.mjs`
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import worker from "../../worker/index.js";
import { toFields, fromFields } from "../../worker/lib/firestore.js";

// Minimal HTMLRewriter stand-in (the real one exists only inside the Workers runtime).
globalThis.HTMLRewriter = class { constructor() { this.h = []; } on(sel, h) { this.h.push([sel, h]); return this; }
  transform(res) { const self = this; return new Response(new ReadableStream({ async start(c) { let html = await res.text();
    for (const [sel, h] of self.h) { const el = { setInnerContent: (t) => { html = html.replace(/<title>.*?<\/title>/, `<title>${t}</title>`); }, setAttribute: (a, v) => { html = html.replace(/(<meta name="description" content=")[^"]*/, `$1${v}`); }, append: (t) => { html = html.replace("</head>", t + "</head>"); } }; h.element(el); }
    c.enqueue(new TextEncoder().encode(html)); c.close(); } }), { status: res.status, headers: res.headers }); } };

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const env = { FIREBASE_PROJECT_ID: "p", FIREBASE_API_KEY: "k", CLOUDINARY_CLOUD: "c", FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "sa@p.iam", private_key: privateKey }),
  ASSETS: { fetch: async () => new Response("<html><head><title>x</title><meta name=\"description\" content=\"d\"></head></html>", { headers: { "content-type": "text/html" } }) } };

const db = new Map(); // "col/id" -> fields (Firestore typed)
const seed = (path, obj) => db.set(path, toFields(obj));
const read = (path) => (db.has(path) ? fromFields(db.get(path)) : null);
const tokens = { goodToken: { localId: "admin1", email: "a@x.com" }, userToken: { localId: "user1", email: "u@x.com" } };
let abortNext = 0;

globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;
  const ok = (j, s = 200) => new Response(JSON.stringify(j), { status: s });
  if (url.includes("oauth2.googleapis.com")) return ok({ access_token: "T", expires_in: 3600 });
  if (url.includes("accounts:lookup")) { const u = tokens[body.idToken]; return u ? ok({ users: [u] }) : ok({ error: {} }, 400); }
  if (url.endsWith(":beginTransaction")) return ok({ transaction: "tx1" });
  if (url.endsWith(":batchGet")) return ok(body.documents.map((n) => { const p = n.split("/documents/")[1]; return db.has(p) ? { found: { name: n, fields: db.get(p) } } : { missing: n }; }));
  if (url.endsWith(":commit")) {
    if (abortNext > 0) { abortNext--; return ok({ error: { message: "aborted" } }, 409); }
    const staged = new Map(db);
    for (const w of body.writes) {
      if (w.update) { const p = w.update.name.split("/documents/")[1], ex = staged.has(p);
        if (w.currentDocument?.exists === false && ex) return ok({ error: { message: "exists" } }, 409);
        if (w.currentDocument?.exists === true && !ex) return ok({ error: { message: "nf" } }, 404);
        staged.set(p, w.updateMask ? { ...staged.get(p), ...w.update.fields } : w.update.fields); }
      if (w.transform) { const p = w.transform.document.split("/documents/")[1]; const cur = fromFields(staged.get(p) || {});
        for (const t of w.transform.fieldTransforms) cur[t.fieldPath] = (cur[t.fieldPath] || 0) + Number(t.increment.integerValue ?? t.increment.doubleValue);
        staged.set(p, toFields(cur)); }
    }
    db.clear(); staged.forEach((v, k) => db.set(k, v)); return ok({ writeResults: [] });
  }
  if (url.includes("/documents/")) return ok({ documents: [...db.entries()].filter(([k]) => k.startsWith("products/")).map(([k, f]) => ({ name: `projects/p/databases/(default)/documents/${k}`, fields: f })) });
  throw new Error("unexpected fetch " + url);
};

const req = (path, body, headers = {}, method = "POST") => new Request("https://x.test" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "1." + Math.floor(Math.random() * 255), ...headers }, body: body ? JSON.stringify(body) : undefined });
const call = async (path, body, headers) => { const r = await worker.fetch(req(path, body, headers), env, {}); return { s: r.status, j: await r.json() }; };
const customer = { name: "أحمد محمد", phone: "01012345678", gov: "القاهرة", city: "مدينة نصر", address: "شارع التسعين عمارة 5" };
const reset = () => {
  db.clear();
  seed("settings/store", { shipping: 60, freeShippingOver: 1000, shippingByGov: { "أسوان": 100 }, pay: { cod: true, transfer: false } });
  seed("products/a1", { name: "سماعة", price: 200, stock: 5, active: true, images: ["x.jpg"] });
  seed("products/b2", { name: "تيشيرت", price: 100, stock: null, active: true, buyQty: 3, payQty: 2 });
  seed("products/c3", { name: "مخفي", price: 50, active: false });
  seed("coupons/SAVE10", { type: "percent", value: 10, minOrder: 300, active: true, uses: 0, maxUses: 1 });
  seed("admins/admin1", { role: "admin", perms: { orders: true } });
  seed("admins/user1", { role: "admin", perms: { orders: false } });
};
let n = 0; const t = async (name, fn) => { reset(); await fn(); console.log("  ✓", name); n++; };

console.log("worker");
await t("prices come from the server, client price ignored", async () => {
  const r = await call("/api/order", { items: [{ id: "a1", qty: 2, price: 1 }], customer, payment: "cod" });
  assert.equal(r.s, 201); assert.equal(r.j.subtotal, 400); assert.equal(r.j.shipping, 60); assert.equal(r.j.total, 460);
  const o = read(`orders/${r.j.code}`); assert.equal(o.items[0].price, 200); assert.equal(o.status, "new");
  assert.equal(read(`track/${r.j.code}`).total, 460); assert.ok(!("customer" in read(`track/${r.j.code}`)));
});
await t("stock is decremented", async () => { await call("/api/order", { items: [{ id: "a1", qty: 2 }], customer }); assert.equal(read("products/a1").stock, 3); });
await t("oversell rejected with details", async () => { const r = await call("/api/order", { items: [{ id: "a1", qty: 6 }], customer }); assert.equal(r.s, 409); assert.equal(r.j.problems[0].available, 5); assert.equal(read("products/a1").stock, 5); });
await t("inactive/missing product rejected", async () => { assert.equal((await call("/api/order", { items: [{ id: "c3", qty: 1 }], customer })).s, 409); assert.equal((await call("/api/order", { items: [{ id: "zzz", qty: 1 }], customer })).s, 409); });
await t("buy 3 pay 2 offer", async () => { const r = await call("/api/order", { items: [{ id: "b2", qty: 3 }], customer }); assert.equal(r.j.subtotal, 200); });
await t("free shipping threshold + gov rate", async () => {
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 5 }], customer })).j.shipping, 0);
  assert.equal((await call("/api/order", { items: [{ id: "b2", qty: 1 }], customer: { ...customer, gov: "أسوان" } })).j.shipping, 100);
});
await t("coupon applies, counts use, and max uses enforced", async () => {
  const r = await call("/api/order", { items: [{ id: "a1", qty: 2 }], customer, coupon: "save10" });
  assert.equal(r.j.discount, 40); assert.equal(r.j.total, 420); assert.equal(read("coupons/SAVE10").uses, 1);
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 2 }], customer, coupon: "SAVE10" })).s, 400);
});
await t("coupon min order enforced; unknown coupon rejected", async () => {
  assert.equal((await call("/api/order", { items: [{ id: "b2", qty: 1 }], customer, coupon: "SAVE10" })).s, 400);
  assert.equal((await call("/api/order", { items: [{ id: "b2", qty: 1 }], customer, coupon: "NOPE" })).s, 400);
});
await t("validation: phone, gov, qty, honeypot, payment disabled", async () => {
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer: { ...customer, phone: "123" } })).s, 400);
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer: { ...customer, gov: "x" } })).s, 400);
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 0 }], customer })).s, 400);
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer, website: "bot" })).s, 400);
  assert.equal((await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer, payment: "transfer" })).s, 400);
});
await t("transaction retries on contention", async () => { abortNext = 2; const r = await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer }); assert.equal(r.s, 201); assert.equal(read("products/a1").stock, 4); });
await t("logged-in user id attached only when token valid", async () => {
  const a = await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer }, { authorization: "Bearer userToken" }); assert.equal(read(`orders/${a.j.code}`).userId, "user1");
  const b = await call("/api/order", { items: [{ id: "a1", qty: 1 }], customer }, { authorization: "Bearer fake" }); assert.equal(read(`orders/${b.j.code}`).userId, null);
});
await t("status change: staff only, cancel restocks, reopen reserves again", async () => {
  const { j } = await call("/api/order", { items: [{ id: "a1", qty: 2 }], customer, coupon: "SAVE10" }); const code = j.code;
  assert.equal((await call("/api/order-status", { code, status: "confirmed" })).s, 401);
  assert.equal((await call("/api/order-status", { code, status: "confirmed" }, { authorization: "Bearer userToken" })).s, 403);
  assert.equal((await call("/api/order-status", { code, status: "confirmed" }, { authorization: "Bearer goodToken" })).s, 200);
  assert.equal(read(`track/${code}`).status, "confirmed"); assert.equal(read(`orders/${code}`).history.length, 2);
  await call("/api/order-status", { code, status: "cancelled" }, { authorization: "Bearer goodToken" });
  assert.equal(read("products/a1").stock, 5); assert.equal(read("coupons/SAVE10").uses, 0);
  await call("/api/order-status", { code, status: "new" }, { authorization: "Bearer goodToken" });
  assert.equal(read("products/a1").stock, 3);
  assert.equal((await call("/api/order-status", { code: "bad", status: "new" }, { authorization: "Bearer goodToken" })).s, 400);
});
await t("product page gets OG tags + JSON-LD; sitemap lists products", async () => {
  const r = await worker.fetch(new Request("https://x.test/product?id=a1"), env, {}); const h = await r.text();
  assert.match(h, /og:title" content="سماعة \| Joo Store"/); assert.match(h, /application\/ld\+json/); assert.match(h, /res\.cloudinary\.com\/c\/image\/upload/);
  const s = await (await worker.fetch(new Request("https://x.test/sitemap.xml"), env, {})).text(); assert.match(s, /product\?id=a1/); assert.ok(!s.includes("c3"));
});
await t("unknown api → 404 json; health ok", async () => { assert.equal((await call("/api/nope", {})).s, 404); const h = await (await worker.fetch(req("/api/health", null, {}, "GET"), env, {})).json(); assert.equal(h.configured, true); });
console.log(`\n${n} passed`);
