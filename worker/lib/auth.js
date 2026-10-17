import { HttpError, verifyIdToken } from "./google-auth.js";
import { getMany } from "./firestore.js";

// Returns the signed-in staff member if they own the store or hold the given permission.
export async function requirePerm(env, req, perm) {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const user = await verifyIdToken(env, bearer);
  if (!user) throw new HttpError(401, "unauthenticated", "سجّل الدخول أولًا");
  const a = (await getMany(env, [`admins/${user.uid}`]))[`admins/${user.uid}`];
  const perms = Array.isArray(perm) ? perm : [perm];
  if (!a || !(a.role === "owner" || perms.some((p) => a.perms?.[p] === true))) throw new HttpError(403, "forbidden", "ليس لديك صلاحية");
  return { ...user, role: a.role };
}
