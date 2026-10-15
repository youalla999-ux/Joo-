import { HttpError } from "./google-auth.js";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export function wrap(handler) {
  return async (req, env, ctx) => {
    try { return await handler(req, env, ctx); }
    catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.code, message: e.message, ...(e.extra || {}) }, e.status);
      console.error(e);
      return json({ ok: false, error: "server_error", message: "حصل خطأ في السيرفر، حاول مرة أخرى." }, 500);
    }
  };
}

export async function readJson(req, maxBytes = 32768) {
  const t = await req.text();
  if (t.length > maxBytes) throw new HttpError(413, "too_large", "الطلب كبير جدًا");
  try { return JSON.parse(t); } catch { throw new HttpError(400, "bad_json", "بيانات غير صالحة"); }
}

// Best-effort per-isolate rate limit. For hard limits add a Cloudflare WAF/Rate Limiting rule on /api/*.
const hits = new Map();
export function rateLimit(req, key, max, windowMs) {
  const ip = req.headers.get("cf-connecting-ip") || "anon", k = `${key}:${ip}`, now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "rate_limited", "محاولات كتير، استنى شوية وحاول تاني.");
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
}
