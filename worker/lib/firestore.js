// Minimal Firestore REST client: typed value codec, transactions, atomic commits.
import { accessToken, HttpError } from "./google-auth.js";

const base = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
export const docName = (env, path) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
export const toFields = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toValue(x)]));

export function fromValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
export const fromFields = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fromValue(v)]));
const idOf = (name) => name.split("/").pop();

async function call(env, url, body, method = "POST") {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new HttpError(r.status === 409 ? 409 : 502, r.status === 409 ? "aborted" : "firestore_error", j.error?.message || "firestore error"); throw e; }
  return j;
}

export const begin = async (env) => (await call(env, `${base(env)}:beginTransaction`, { options: { readWrite: {} } })).transaction;

// Reads many documents ([path,...]) inside an optional transaction. Returns { path: data|null }.
export async function getMany(env, paths, tx) {
  const j = await call(env, `${base(env)}:batchGet`, { documents: paths.map((p) => docName(env, p)), transaction: tx });
  const out = Object.fromEntries(paths.map((p) => [p, null]));
  for (const row of j) if (row.found) { const p = row.found.name.split("/documents/")[1]; out[p] = { id: idOf(row.found.name), ...fromFields(row.found.fields) }; }
  return out;
}
export const getOne = async (env, path) => (await getMany(env, [path]))[path];

// writes: { create: [path, data], set: [path, data, maskKeys], increment: [path, field, n] }
export function commit(env, writes, tx) {
  const w = [];
  for (const x of writes) {
    if (x.create) w.push({ update: { name: docName(env, x.create[0]), fields: toFields(x.create[1]) }, currentDocument: { exists: false } });
    else if (x.patch) w.push({ update: { name: docName(env, x.patch[0]), fields: toFields(x.patch[1]) }, updateMask: { fieldPaths: Object.keys(x.patch[1]) }, currentDocument: { exists: true } });
    else if (x.increment) w.push({ transform: { document: docName(env, x.increment[0]), fieldTransforms: [{ fieldPath: x.increment[1], increment: toValue(x.increment[2]) }] } });
  }
  return call(env, `${base(env)}:commit`, { writes: w, transaction: tx });
}

// Runs fn(tx) with automatic retries when Firestore aborts the transaction (contention).
export async function transact(env, fn) {
  let last;
  for (let i = 0; i < 4; i++) {
    const tx = await begin(env);
    try { return await fn(tx); } catch (e) { last = e; if (e.code !== "aborted") throw e; await new Promise((r) => setTimeout(r, 80 * (i + 1))); }
  }
  throw last;
}

export async function listAll(env, collection, pageSize = 300, maxPages = 10) {
  const out = []; let token = "";
  for (let i = 0; i < maxPages; i++) {
    const j = await call(env, `${base(env)}/${collection}?pageSize=${pageSize}${token ? `&pageToken=${token}` : ""}`, null, "GET");
    for (const d of j.documents || []) out.push({ id: idOf(d.name), ...fromFields(d.fields) });
    if (!(token = j.nextPageToken)) break;
  }
  return out;
}
