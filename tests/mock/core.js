// Firestore + Auth mock (localStorage-backed) for offline E2E tests. Not shipped to production.
const KEY = "__mockdb";
const G = (window.__M ||= { subs: new Set(), user: null, authSubs: new Set() });
const rd = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const wr = (d) => { localStorage.setItem(KEY, JSON.stringify(d)); G.subs.forEach((f) => f()); };
export class Timestamp { constructor(s, n = 0) { this.seconds = s; this.nanoseconds = n; } toDate() { return new Date(this.seconds * 1000); } toMillis() { return this.seconds * 1000; } static now() { return new Timestamp(Math.floor(Date.now() / 1000)); } static fromDate(d) { return new Timestamp(Math.floor(d.getTime() / 1000)); } }
const enc = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Timestamp ? { __ts: x.seconds } : x)));
const dec = (v) => JSON.parse(JSON.stringify(v), function (k, x) { return x; }, 0) && revive(v);
function revive(v) { if (Array.isArray(v)) return v.map(revive); if (v && typeof v === "object") { if ("__ts" in v) return new Timestamp(v.__ts); const o = {}; for (const k in v) o[k] = revive(v[k]); return o; } return v; }
export const serverTimestamp = () => ({ __sv: "ts" });
export const increment = (n) => ({ __sv: "inc", n });
export const arrayUnion = (...a) => ({ __sv: "union", a });
const resolve = (old, val) => { const o = { ...(old || {}) }; for (const k in val) { const v = val[k]; if (v && v.__sv === "ts") o[k] = { __ts: Math.floor(Date.now() / 1000) }; else if (v && v.__sv === "inc") o[k] = (o[k] || 0) + v.n; else if (v && v.__sv === "union") o[k] = [...(o[k] || []), ...v.a.map(enc).filter((x) => !(o[k] || []).some((y) => JSON.stringify(y) === JSON.stringify(x)))]; else o[k] = enc(v); } return o; };
export const collection = (_, name) => ({ type: "col", name });
export const doc = (a, b, c) => (a?.type === "col" ? { type: "doc", col: a.name, id: b || Math.random().toString(36).slice(2, 12) } : { type: "doc", col: b, id: c });
export const where = (f, op, v) => ({ k: "where", f, op, v });
export const orderBy = (f, d = "asc") => ({ k: "order", f, d });
export const limit = (n) => ({ k: "limit", n });
export const query = (c, ...q) => ({ ...c, q });
const snapOf = (id, data) => ({ id, data: () => revive(data), exists: () => true, ref: { id } });
function run(q) {
  const d = rd()[q.name] || {}; let rows = Object.entries(d).map(([id, v]) => ({ id, v }));
  for (const c of q.q || []) {
    if (c.k === "where") rows = rows.filter(({ v }) => { const x = v[c.f]; return c.op === "==" ? x === c.v : c.op === ">=" ? x >= c.v : c.op === "<=" ? x <= c.v : c.op === "in" ? c.v.includes(x) : c.op === "array-contains" ? (x || []).includes(c.v) : true; });
    if (c.k === "order") rows.sort((a, b) => { const g = (r) => { const x = r.v[c.f]; return x && x.__ts ? x.__ts : x; }; const A = g(a), B = g(b); return (A > B ? 1 : A < B ? -1 : 0) * (c.d === "desc" ? -1 : 1); });
    if (c.k === "limit") rows = rows.slice(0, c.n);
  }
  return { docs: rows.map((r) => snapOf(r.id, r.v)), size: rows.length, empty: !rows.length, forEach(f) { this.docs.forEach(f); } };
}
export function onSnapshot(ref, cb) {
  const fire = () => { if (ref.type === "doc") { const v = (rd()[ref.col] || {})[ref.id]; cb({ id: ref.id, exists: () => !!v, data: () => (v ? revive(v) : undefined) }); } else cb(run(ref)); };
  G.subs.add(fire); setTimeout(fire, 0); return () => G.subs.delete(fire);
}
export const getDocs = async (q) => run(q);
export const getDoc = async (r) => { const v = (rd()[r.col] || {})[r.id]; return { id: r.id, exists: () => !!v, data: () => (v ? revive(v) : undefined) }; };
const put = (r, val, merge) => { const d = rd(); d[r.col] ||= {}; d[r.col][r.id] = resolve(merge ? d[r.col][r.id] : {}, val); wr(d); };
export const setDoc = async (r, v, o) => put(r, v, o?.merge);
export const addDoc = async (c, v) => { const r = doc(c); put(r, v); return { id: r.id }; };
export const updateDoc = async (r, v) => { const d = rd(); if (!d[r.col]?.[r.id]) throw new Error("not-found"); const flat = {}; for (const k in v) flat[k] = v[k]; put(r, flat, true); };
export const deleteDoc = async (r) => { const d = rd(); if (d[r.col]) delete d[r.col][r.id]; wr(d); };
export const writeBatch = () => { const ops = []; return { set: (r, v, o) => ops.push(() => put(r, v, o?.merge)), update: (r, v) => ops.push(() => put(r, v, true)), delete: (r) => ops.push(() => { const d = rd(); delete d[r.col]?.[r.id]; wr(d); }), commit: async () => ops.forEach((f) => f()) }; };
export const runTransaction = async (_, fn) => fn({ get: getDoc, set: (r, v) => put(r, v), update: (r, v) => put(r, v, true) });
// auth
const notify = () => G.authSubs.forEach((f) => f(G.user));
try { G.user = JSON.parse(localStorage.getItem("__mockuser")); } catch {}
export const getAuth = () => ({ get currentUser() { return G.user; } });
export const onAuthStateChanged = (a, cb) => { G.authSubs.add(cb); setTimeout(() => cb(G.user), 0); return () => G.authSubs.delete(cb); };
const login = (email, name) => { G.user = { uid: "u_" + btoa(email).replace(/\W/g, "").slice(0, 10), email, displayName: name || email.split("@")[0], getIdToken: async () => "t" }; localStorage.setItem("__mockuser", JSON.stringify(G.user)); notify(); return { user: G.user }; };
export const signInWithEmailAndPassword = async (_, e) => login(e);
export const createUserWithEmailAndPassword = async (_, e) => login(e);
export const signInWithPopup = async () => login("google@test.com", "Google User");
export const signOut = async () => { G.user = null; localStorage.removeItem("__mockuser"); notify(); };
export const updateProfile = async (u, p) => { Object.assign(G.user, p); localStorage.setItem("__mockuser", JSON.stringify(G.user)); };
export const sendPasswordResetEmail = async () => {};
export class GoogleAuthProvider {}
export const initializeApp = () => ({});
export const isSupported = async () => false; export const getAnalytics = () => ({});
export const getFirestore = () => ({});
