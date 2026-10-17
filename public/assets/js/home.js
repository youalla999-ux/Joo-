import { I } from "./layout.js";
import { S, start, shipRange, onChange, categories, cardHTML, bindCards, skeletons, emptyHTML } from "./core.js";
import { $, esc, img, money } from "./utils.js";
import { db, collection, query, where, limit, onSnapshot } from "./firebase.js";

start("home");

let revs = [], dealT = null;
onSnapshot(query(collection(db, "reviews"), where("approved", "==", true), limit(30)), (sn) => {
  revs = sn.docs.map((d) => d.data()).filter((r) => r.rating >= 4).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 6);
  $("#revs").innerHTML = revs.map((r) => `<figure class="rev"><span class="stars">${"★".repeat(r.rating)}</span><blockquote>${esc(r.text)}</blockquote><figcaption>${esc(r.name)}${r.productName ? ` <small>· ${esc(r.productName)}</small>` : ""}</figcaption></figure>`).join("");
  $("#revWrap").classList.toggle("hidden", !revs.length || S.settings.sections.reviews === false);
}, () => {});

/* عرض اليوم: عدّاد تنازلي وشريط المتبقي، من إعدادات اللوحة */
const pad = (n) => String(n).padStart(2, "0");
function drawDeal() {
  clearInterval(dealT); const d = S.settings.deal || {}, w = $("#dealWrap"), p = S.products.find((x) => x.id === d.productId);
  const end = d.endsAt ? new Date(d.endsAt).getTime() : 0;
  if (!d.on || !p || (end && end < Date.now())) { w.classList.add("hidden"); return; }
  const total = Number(d.total) || 0, left = p.stock != null && p.stock !== "" ? Number(p.stock) : null, pct = total && left != null ? Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100))) : null;
  const off = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  w.classList.remove("hidden");
  w.innerHTML = `<div class="block-head"><h2>${esc(d.title || "عرض اليوم")}</h2></div><div class="dealbox"><a class="deal-pic" href="product.html?id=${encodeURIComponent(p.id)}"><img src="${esc(img(p.images?.[0], 600))}" alt="${esc(p.name)}" loading="lazy">${off ? `<em>-${off}%</em>` : ""}</a>
    <div class="deal-body"><small>${p.category ? esc(p.category) : "عرض محدود"}</small><h3 style="font-size:clamp(1.3rem,2.4vw,1.8rem)"><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
    <div class="deal-price"><b>${money(p.price)}</b>${off ? `<s>${money(p.oldPrice)}</s>` : ""}</div>
    ${pct !== null ? `<div class="meter" role="img" aria-label="تم بيع ${pct}%"><i style="width:${pct}%"></i></div><p class="muted">اتباع ${pct}% · فاضل ${left} قطعة</p>` : ""}</div>
    <div class="deal-stub">${end ? `<small>العرض بينتهي بعد</small><div class="count" id="dealCount" dir="ltr"></div>` : `<small>عرض محدود</small>`}
    <button class="btn" data-add="${esc(p.id)}" ${left === 0 ? "disabled" : ""}>أضف للسلة</button></div></div>`;
  if (end) { const c = $("#dealCount"), run = () => { let t = Math.max(0, end - Date.now()); if (!t) { clearInterval(dealT); w.classList.add("hidden"); return; } const dd = Math.floor(t / 864e5); t %= 864e5; c.innerHTML = `${dd ? `<span><b>${dd}</b>يوم</span>` : ""}<span><b>${pad(Math.floor(t / 36e5))}</b>ساعة</span><span><b>${pad(Math.floor((t % 36e5) / 6e4))}</b>دقيقة</span><span><b>${pad(Math.floor((t % 6e4) / 1e3))}</b>ثانية</span>`; }; run(); dealT = setInterval(run, 1000); }
}

const grid = $("#latest"); grid.innerHTML = skeletons(4); bindCards(grid); bindCards($("#featured")); bindCards($("#top")); bindCards($("#dealWrap")); bindCards($("#hot")); bindCards($("#recent")); bindCards($("#catSections"));
onChange(() => {
  const st = S.settings, sec = st.sections;
  if (!S.loaded) return;
  drawDeal();
  const rated = S.products.filter((p) => p.ratingCount >= 1).sort((a, b) => b.ratingSum / b.ratingCount - a.ratingSum / a.ratingCount || b.ratingCount - a.ratingCount).slice(0, 4);
  $("#top").innerHTML = rated.map((p) => cardHTML(p)).join(""); $("#topWrap").classList.toggle("hidden", !rated.length || sec.top === false);
  $("#revWrap").classList.toggle("hidden", !revs.length || sec.reviews === false);
  const cats = categories();
  // أقسام معرّفة من اللوحة (ترتيب وصورة)، وإلا الأقسام من المنتجات
  const defined = (st.categories || []).filter((c) => c.name && cats.includes(c.name));
  const order = defined.length ? [...defined.map((c) => c.name), ...cats.filter((c) => !defined.some((d) => d.name === c))] : cats;
  $("#cats").innerHTML = order.map((c) => {
    const def = defined.find((d) => d.name === c); const p = S.products.find((x) => x.category === c && x.images?.[0]);
    const imgUrl = def?.image || p?.images[0];
    return `<a class="cat-tile" href="shop.html?cat=${encodeURIComponent(c)}"><div class="ring">${imgUrl ? `<img src="${esc(imgUrl.replace("/upload/", "/upload/f_auto,q_auto,w_240/"))}" alt="" loading="lazy">` : `<img class="ph" src="assets/img/bags.png" alt="">`}</div><span>${esc(c)}<small>${S.products.filter((x) => x.category === c).length} منتج</small></span></a>`;
  }).join("");
  $("#catsWrap").classList.toggle("hidden", !order.length || sec.categories === false);
  const cs = $("#catSections"), top4 = order.slice(0, 5).map((c) => [c, S.products.filter((x) => x.category === c).slice(0, 4)]).filter(([, l]) => l.length >= 2);
  cs.innerHTML = sec.categories === false ? "" : top4.map(([c, l]) => `<section class="wrap block"><div class="block-head"><h2>${esc(c)}</h2><a class="more-link" href="shop.html?cat=${encodeURIComponent(c)}">عرض الكل</a></div><div class="grid rail">${l.map((p) => cardHTML(p)).join("")}</div></section>`).join("");
  const feat = S.products.filter((p) => p.featured).slice(0, 4);
  $("#featured").innerHTML = feat.map((p) => cardHTML(p)).join(""); $("#featWrap").classList.toggle("hidden", !feat.length || sec.featured === false);
  const hot = S.products.filter((p) => p.oldPrice > p.price && !(p.stock != null && p.stock !== "" && Number(p.stock) <= 0)).sort((a, b) => b.oldPrice / b.price - a.oldPrice / a.price).slice(0, 8);
  $("#hot").innerHTML = hot.map((p) => cardHTML(p)).join(""); $("#hotWrap").classList.toggle("hidden", hot.length < 2);
  const list = S.products.slice(0, 8);
  $("#latestWrap").classList.toggle("hidden", sec.latest === false);
  grid.innerHTML = list.length ? list.map((p, i) => cardHTML(p)).join("") : emptyHTML(S.error ? "تعذر تحميل المنتجات. حاول تاني بعد شوية." : "المنتجات جاية قريب.");
});

// شفته قبل كده (من جهاز الزائر فقط)
onChange(() => {
  if (!S.loaded) return;
  let ids = []; try { ids = JSON.parse(localStorage.getItem("joo_recent")) || []; } catch {}
  const l = ids.map((id) => S.products.find((p) => p.id === id)).filter(Boolean).slice(0, 6);
  $("#recent").innerHTML = l.map((p) => cardHTML(p)).join(""); $("#recentWrap").classList.toggle("hidden", !l.length);
});
