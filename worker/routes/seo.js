import { getOne, listAll } from "../lib/firestore.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const cdn = (u, env) => {
  if (!u) return "";
  if (/^https?:\/\//.test(u)) return u.includes("res.cloudinary.com") ? u.replace("/upload/", "/upload/f_auto,q_auto,w_1200,h_630,c_pad,b_white/") : u;
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD}/image/upload/f_auto,q_auto,w_1200,h_630,c_pad,b_white/${u}`;
};

// Serves product.html with real <title>/OG/JSON-LD so WhatsApp, Facebook and Google show the product card.
export async function productPage(req, env) {
  const url = new URL(req.url), id = (url.searchParams.get("id") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const base = await env.ASSETS.fetch(new Request(new URL("/product.html", url), { redirect: "follow" }));
  if (!id) return base;
  let p = null, store = {};
  try { [p, store] = await Promise.all([getOne(env, `products/${id}`), getOne(env, "settings/store")]); } catch { return base; }
  if (!p || p.active === false) return base;
  const name = store?.name || "Joo Store", title = `${p.name} | ${name}`, desc = cut(p.description, 160) || `اطلب ${p.name} من ${name} والدفع عند الاستلام.`;
  const image = cdn(p.images?.[0], env), canonical = `${url.origin}/product?id=${id}`;
  const inStock = p.stock === null || p.stock === undefined || p.stock > 0;
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, image: (p.images || []).slice(0, 4), description: desc, offers: { "@type": "Offer", priceCurrency: "EGP", price: p.price, availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: canonical } };
  if (p.ratingCount > 0) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: +(p.ratingSum / p.ratingCount).toFixed(1), reviewCount: p.ratingCount };
  const tags = `<meta property="og:type" content="product"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}<meta property="product:price:amount" content="${p.price}"><meta property="product:price:currency" content="EGP"><link rel="canonical" href="${esc(canonical)}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  const res = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute("content", desc); } })
    .on("head", { element(e) { e.append(tags, { html: true }); } })
    .transform(base);
  const out = new Response(res.body, base);
  out.headers.set("cache-control", "public, max-age=60");
  return out;
}

export async function sitemap(req, env) {
  const origin = new URL(req.url).origin;
  const prods = (await listAll(env, "products")).filter((p) => p.active !== false);
  const pages = ["", "shop", "about", "contact", "returns"].map((p) => `<url><loc>${origin}/${p}</loc></url>`);
  const items = prods.map((p) => `<url><loc>${origin}/product?id=${p.id}</loc>${p.updatedAt instanceof Date ? `<lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.join("")}${items.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export const robots = async (req) => {
  const origin = new URL(req.url).origin;
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
};
