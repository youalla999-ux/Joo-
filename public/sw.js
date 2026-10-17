// Joo Store service worker: fast repeat visits + offline shell. Never caches /api, Firebase or Cloudinary calls.
const V = "joo-v3";
const SHELL = ["/", "/index.html", "/shop.html", "/offers.html", "/cart.html", "/assets/css/style.css", "/assets/img/favicon.png", "/assets/img/bags.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/hq-")) return;
  if (r.mode === "navigate") { // pages: network first, cached copy when offline
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(V).then((x) => x.put(r, c)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match("/index.html"))));
    return;
  }
  e.respondWith(caches.match(r).then((m) => { const net = fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((x) => x.put(r, c)); } return res; }).catch(() => m); return m || net; })); // assets: stale-while-revalidate
});
