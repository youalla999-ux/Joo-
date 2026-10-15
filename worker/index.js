// Joo Store edge server. Static site is served by the ASSETS binding; this Worker owns /api/*, /product (SEO) and /sitemap.xml.
import { wrap, json } from "./lib/http.js";
import { HttpError } from "./lib/google-auth.js";
import { createOrder } from "./routes/order.js";
import { setOrderStatus } from "./routes/order-status.js";
import { paymobEnabled, paymobWebhook } from "./routes/paymob.js";
import { productPage, sitemap, robots } from "./routes/seo.js";

const routes = {
  "POST /api/order": createOrder,
  "POST /api/order-status": setOrderStatus,
  "POST /api/paymob/webhook": paymobWebhook,
  "GET /api/config": async (_, env) => json({ ok: true, card: paymobEnabled(env) }, 200, { "cache-control": "public, max-age=300" }),
  "GET /api/health": async (_, env) => json({ ok: true, configured: !!env.FIREBASE_SERVICE_ACCOUNT, card: paymobEnabled(env), time: new Date().toISOString() }),
  "GET /sitemap.xml": sitemap,
  "GET /robots.txt": robots,
  "GET /product": productPage,
};

export default {
  fetch(req, env, ctx) {
    const url = new URL(req.url), key = `${req.method} ${url.pathname.replace(/\.html$/, "")}`;
    const h = routes[key];
    if (h) return wrap(h)(req, env, ctx);
    if (url.pathname.startsWith("/api/")) return wrap(async () => { throw new HttpError(404, "not_found", "غير موجود"); })(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
};
