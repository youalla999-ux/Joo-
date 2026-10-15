// Client for the Worker API (/api/*). Attaches the Firebase ID token when someone is signed in.
import { auth } from "./firebase.js";

export class ApiError extends Error {
  constructor(status, body) { super(body?.message || "تعذر الاتصال بالسيرفر"); this.status = status; this.code = body?.error; this.body = body || {}; }
}

export async function api(path, body) {
  const headers = { "content-type": "application/json" };
  try { const t = await auth.currentUser?.getIdToken(); if (t) headers.authorization = `Bearer ${t}`; } catch {}
  let r;
  try { r = await fetch(`/api/${path}`, { method: "POST", headers, body: JSON.stringify(body) }); }
  catch { throw new ApiError(0, { message: "مفيش اتصال بالإنترنت، حاول تاني." }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j);
  return j;
}
