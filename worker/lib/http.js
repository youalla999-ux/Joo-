import { HttpError } from "./google-auth.js";

const SEC = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cross-origin-resource-policy": "same-origin", "x-frame-options": "DENY" };

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SEC, ...headers } });

// Browser-originated writes must come from our own origin (CSRF / cross-site abuse). Server-to-server callers (webhooks) opt out.
export function sameOrigin(req, env) {
  const url = new URL(req.url), origin = req.headers.get("origin"), site = req.headers.get("sec-fetch-site");
  const allowed = new Set([url.origin, ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  if (origin) { if (!allowed.has(origin)) throw new HttpError(403, "bad_origin", "طلب غير مسموح"); }
  else if (site && !["same-origin", "none"].includes(site)) throw new HttpError(403, "bad_origin", "طلب غير مسموح");
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) throw new HttpError(415, "bad_content_type", "نوع البيانات غير مدعوم");
}

export function wrap(handler, { browser = true } = {}) {
  return async (req, env, ctx) => {
    try {
      if (browser && req.method === "POST") sameOrigin(req, env);
      return await handler(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.code, message: e.status >= 500 && e.code !== "busy" ? "حصل خطأ في السيرفر، حاول مرة أخرى." : e.message, ...(e.extra || {}) }, e.status, e.status === 429 ? { "retry-after": "60" } : {});
      console.error(e);
      return json({ ok: false, error: "server_error", message: "حصل خطأ في السيرفر، حاول مرة أخرى." }, 500);
    }
  };
}

export async function readJson(req, maxBytes = 32768) {
  const t = await req.text();
  if (t.length > maxBytes) throw new HttpError(413, "too_large", "الطلب كبير جدًا");
  let v; try { v = JSON.parse(t); } catch { throw new HttpError(400, "bad_json", "بيانات غير صالحة"); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "bad_json", "بيانات غير صالحة");
  return v;
}

// Two layers: (1) the optional Cloudflare Rate Limiting binding env[binding] (hard, shared across the edge),
// (2) a per-isolate sliding window as a fallback. Add a WAF rate-limit rule on /api/* as well.
const hits = new Map();
export async function rateLimit(req, env, key, max, windowMs, binding) {
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  if (binding && env[binding]?.limit) {
    const { success } = await env[binding].limit({ key: `${key}:${ip}` });
    if (!success) throw new HttpError(429, "rate_limited", "محاولات كتير، استنى شوية وحاول تاني.");
  }
  const k = `${key}:${ip}`, now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "rate_limited", "محاولات كتير، استنى شوية وحاول تاني.");
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
}
