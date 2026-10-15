// OAuth2 access token for a Google service account, signed with WebCrypto (no dependencies).
let cache = { token: "", exp: 0 };

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));

async function importKey(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export function serviceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(500, "server_not_configured", "FIREBASE_SERVICE_ACCOUNT secret is missing");
  try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { throw new HttpError(500, "server_not_configured", "FIREBASE_SERVICE_ACCOUNT is not valid JSON"); }
}

export async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp - 60 > now) return cache.token;
  const sa = serviceAccount(env);
  const head = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlStr(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importKey(sa.private_key), new TextEncoder().encode(`${head}.${claims}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(500, "auth_failed", j.error_description || "service account auth failed");
  cache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cache.token;
}

export class HttpError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; }
}

// Verifies a Firebase ID token through the Identity Toolkit and returns { uid, email } or null.
export async function verifyIdToken(env, token) {
  if (!token) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const u = (await r.json()).users?.[0];
  return u ? { uid: u.localId, email: u.email || "" } : null;
}
