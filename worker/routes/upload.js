import { HttpError } from "../lib/google-auth.js";
import { requirePerm } from "../lib/auth.js";
import { json } from "../lib/http.js";

const FORMATS = "jpg,jpeg,png,webp,gif,avif";
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Signed Cloudinary uploads: only signed-in staff can obtain a signature, the signature pins folder + formats,
// so the unsigned preset can be switched off in Cloudinary (anyone could otherwise upload to your account).
export async function signUpload(req, env) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_CLOUD) throw new HttpError(501, "not_configured", "رفع الصور الموقّع غير مفعّل");
  await requirePerm(env, req, ["products", "settings"]);
  const timestamp = Math.floor(Date.now() / 1000), folder = env.CLOUDINARY_FOLDER || "joo-store";
  const toSign = `allowed_formats=${FORMATS}&folder=${folder}&timestamp=${timestamp}`;
  const sig = hex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(toSign + env.CLOUDINARY_API_SECRET)));
  return json({ ok: true, cloudName: env.CLOUDINARY_CLOUD, apiKey: env.CLOUDINARY_API_KEY, timestamp, folder, allowedFormats: FORMATS, signature: sig });
}
