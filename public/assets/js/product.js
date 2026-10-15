import { db, collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from "./firebase.js";
import { S, start, onChange, findProduct, shipRange, offerOf, lineTotal, stars, soldOut, maxQty, discountPct, addToCart, cardHTML, bindCards, waLink, setTitle, emptyHTML } from "./core.js";
import { $, $$, esc, money, img, toast, timeText } from "./utils.js";

start("shop");
let sbObs = null, rvUnsub = null; // قبل أي استدعاء لـ onChange (المنتجات ممكن تكون محفوظة من زيارة سابقة)
const id = new URLSearchParams(location.search).get("id");
const box = $("#product"); let qty = 1, drawnFor = null;
bindCards($("#related")); bindCards($("#recent"));

// فتح رابط مباشر للمنتج حتى لو قايمة المنتجات لسه ما وصلتش
let direct = null, directTried = false;
async function fetchDirect() {
  directTried = true;
  try { const d = await getDoc(doc(db, "products", id || "_")); if (d.exists() && d.data().active !== false) { direct = { id: d.id, ...d.data() }; S.products.push(direct); } } catch {}
  drawnFor = null; S.loaded = true; draw();
}
function draw() {
  if (!S.loaded) return;
  let p = findProduct(id);
  if (!p && id && !directTried) { fetchDirect(); return; }
  if (!p) { box.innerHTML = emptyHTML("المنتج ده مش موجود أو اتشال من المتجر.", ["shop.html", "ارجع للمتجر"]); $("#relatedWrap").classList.add("hidden"); $("#crumbName").textContent = ""; return; }
  if (drawnFor !== p.id) { drawnFor = p.id; render(p); remember(p.id); }
  else { // تحديث حالة التوفر فقط
    $("#buy")?.toggleAttribute("disabled", soldOut(p));
  }
  const rc = recentIds().filter((x) => x !== p.id).map(findProduct).filter(Boolean).slice(0, 4);
  $("#recent").innerHTML = rc.map((x) => cardHTML(x)).join(""); $("#recentWrap").classList.toggle("hidden", !rc.length);
  const rel = S.products.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 4);
  const more = rel.length ? rel : S.products.filter((x) => x.id !== p.id).slice(0, 4);
  $("#related").innerHTML = more.map((x) => cardHTML(x)).join(""); $("#relatedWrap").classList.toggle("hidden", !more.length);
}
onChange(draw);

function recentIds() { try { return JSON.parse(localStorage.getItem("joo_recent")) || []; } catch { return []; } }
function remember(pid) { try { localStorage.setItem("joo_recent", JSON.stringify([pid, ...recentIds().filter((x) => x !== pid)].slice(0, 12))); } catch {} }
function shipLine() {
  const r = shipRange(), f = Number(S.settings.freeShippingOver) || 0;
  const base = r ? (r[0] === r[1] ? `الشحن ${money(r[0])}` : `الشحن من ${money(r[0])} حسب المحافظة`) : Number(S.settings.shipping) ? `الشحن ${money(S.settings.shipping)}` : "شحن مجاني";
  return base + (f ? ` · مجاني فوق ${money(f)}` : "");
}
function specRows(p) {
  const rows = String(p.specs || "").split("\n").map((l) => l.split(/[:：]/)).filter((a) => a.length > 1 && a[0].trim());
  const base = [["القسم", p.category], ["التوفر", soldOut(p) ? "غير متوفر" : "متوفر"]].filter((r) => r[1]);
  const all = [...rows.map((a) => [a[0].trim(), a.slice(1).join(":").trim()]), ...base];
  return `<table class="spec">${all.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
}
function seo(p) {
  const set = (sel, attr, val, mk) => { let e = document.head.querySelector(sel); if (!e) { e = document.createElement(mk); const [k, v] = sel.replace(/^[a-z]+\[|\]$/g, "").split("="); e.setAttribute(k, v.replace(/"/g, "")); document.head.append(e); } e.setAttribute(attr, val); };
  const desc = (p.description || p.name).replace(/\s+/g, " ").slice(0, 160), im = p.images?.[0] ? img(p.images[0], 800) : "", url = `${location.origin}${location.pathname.replace(/\.html$/, "")}?id=${encodeURIComponent(p.id)}`;
  set('meta[name="description"]', "content", desc, "meta"); set('meta[property="og:title"]', "content", p.name, "meta"); set('meta[property="og:description"]', "content", desc, "meta");
  set('meta[property="og:type"]', "content", "product", "meta"); set('meta[property="og:url"]', "content", url, "meta"); if (im) set('meta[property="og:image"]', "content", im, "meta");
  set('link[rel="canonical"]', "href", url, "link");
  let j = document.getElementById("ld"); if (!j) { j = document.createElement("script"); j.type = "application/ld+json"; j.id = "ld"; document.head.append(j); }
  j.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: p.name, description: desc, image: p.images || [], category: p.category || undefined, ...(p.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: (p.ratingSum / p.ratingCount).toFixed(1), reviewCount: p.ratingCount } } : {}), offers: { "@type": "Offer", priceCurrency: "EGP", price: p.price, availability: soldOut(p) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url } });
}
function render(p) {
  setTitle(p.name); seo(p); $("#crumbName").textContent = p.name;
  const imgs = p.images?.length ? p.images : [null], off = discountPct(p), out = soldOut(p), max = maxQty(p);
  box.innerHTML = `
  <div class="pgallery">
    <div class="pmain"><img id="pmain" src="${esc(img(imgs[0], 1000))}" alt="${esc(p.name)}">${off ? `<span class="tag">وفّر ${off}%</span>` : ""}</div>
    ${imgs.length > 1 || p.video ? `<div class="thumbs">${imgs.map((u, i) => `<img class="${i ? "" : "on"}" src="${esc(img(u, 160))}" data-i="${i}" alt="">`).join("")}${p.video ? `<button class="vthumb" id="vthumb" aria-label="تشغيل الفيديو">▶ فيديو</button>` : ""}</div>` : ""}
  </div>
  <div class="pinfo">
    ${p.category ? `<a class="cat" href="shop.html?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a>` : ""}
    <h1>${esc(p.name)}</h1>
    <div class="pprice"><b>${money(p.price)}</b>${off ? `<s>${money(p.oldPrice)}</s>` : ""}</div>
    ${stars(p) ? `<a class="rate-link" href="#reviews">${stars(p)}</a>` : ""}
    ${offerOf(p) ? `<div class="offer"><b>عرض خاص</b> اشترِ ${offerOf(p).buy} وادفع ${offerOf(p).pay} بس. ضيف الكمية وهيتحسب الخصم لوحده.</div>` : ""}
    <div class="shipline">${shipLine()}</div>
    ${p.description ? `<p class="desc">${esc(p.description.split("\n")[0].slice(0, 160))}${p.description.length > 160 || p.description.includes("\n") ? "…" : ""}</p>` : ""}
    ${out ? `<div class="msg err">المنتج غير متوفر حاليًا</div>` : `
      ${max <= 5 ? `<div class="msg ok">باقي ${max} قطعة فقط</div>` : ""}
      <div class="ptotal" id="ptotal"></div>
      <div class="buyrow">
        <div class="qty"><button id="qMinus" aria-label="أقل">−</button><span id="qVal">1</span><button id="qPlus" aria-label="أكثر">+</button></div>
        <button class="btn btn-primary btn-lg" id="buy">أضف للسلة</button>
      </div>
      <button class="btn btn-mango btn-lg" id="now" style="width:100%">اطلب دلوقتي</button>`}
    <div class="share"><span>شارك:</span><a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(p.name + " " + location.href)}">واتساب</a><a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}">فيسبوك</a><button type="button" id="copyLink">نسخ الرابط</button></div>
  </div>
  <div class="ptabs">
    <div class="tabs" role="tablist"><button class="on" data-pt="d">التفاصيل</button><button data-pt="s">المواصفات</button><button data-pt="h">الشحن والاسترجاع</button></div>
    <div class="pt" id="pt-d">${p.description ? esc(p.description).replace(/\n/g, "<br>") : "<span class='muted'>لا يوجد وصف لهذا المنتج.</span>"}</div>
    <div class="pt hidden" id="pt-s">${specRows(p)}</div>
    <div class="pt hidden" id="pt-h"><ul><li>${shipLine()}.</li>${S.settings.deliveryNote ? `<li>${esc(S.settings.deliveryNote)}</li>` : ""}<li>الاستبدال والاسترجاع خلال ${Number(S.settings.returnDays) || 14} يوم. التفاصيل في <a href="returns.html">صفحة الاستبدال</a>.</li></ul></div>
  </div>
  <section class="reviews${S.settings.sections.reviews === false ? " hidden" : ""}" id="reviews"><h2>آراء العملاء</h2><div id="rvSummary"></div><div id="rvList"><div class="skeleton" style="height:90px"></div></div>
    <form class="form panel-form" id="rvForm"><h3>شاركنا رأيك</h3>
      <div class="row"><label class="f">اسمك<input name="name" required maxlength="60"></label>
      <div class="f">تقييمك<div class="starpick" role="radiogroup" aria-label="التقييم">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="st${n}" value="${n}" ${n === 5 ? "checked" : ""}><label for="st${n}" title="${n}">★</label>`).join("")}</div></div></div>
      <label class="f">رأيك في المنتج<textarea name="text" required maxlength="1000" rows="3"></textarea></label>
      <div class="msg err hidden" id="rvErr"></div><button class="btn btn-primary">إرسال التقييم</button><small class="muted">التقييم بيظهر بعد مراجعته.</small></form></section>`;
  loadReviews(p);
  $("#copyLink")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); toast("تم نسخ الرابط"); } catch {} });
  $$("[data-pt]", box).forEach((b) => (b.onclick = () => { $$("[data-pt]", box).forEach((x) => x.classList.toggle("on", x === b)); $$(".pt", box).forEach((x) => x.classList.toggle("hidden", x.id !== "pt-" + b.dataset.pt)); }));
  qty = 1; const upd = () => { const t = $("#ptotal"); if (t) t.innerHTML = qty > 1 || offerOf(p) ? `الإجمالي: <b>${money(lineTotal(p, qty))}</b>${lineTotal(p, qty) < p.price * qty ? ` <s>${money(p.price * qty)}</s>` : ""}` : ""; }; upd();
  $("#vthumb")?.addEventListener("click", () => { $(".pmain", box).innerHTML = `<video src="${esc(p.video)}" controls playsinline autoplay></video>`; });
  stickyBar(p, max);
  $$(".thumbs img", box).forEach((t) => (t.onclick = () => { $("#pmain").src = img(imgs[+t.dataset.i], 1000); $$(".thumbs img", box).forEach((x) => x.classList.toggle("on", x === t)); }));
  $("#qMinus")?.addEventListener("click", () => { qty = Math.max(1, qty - 1); $("#qVal").textContent = qty; upd(); });
  $("#qPlus")?.addEventListener("click", () => { qty = Math.min(max, qty + 1); $("#qVal").textContent = qty; upd(); });
  $("#buy")?.addEventListener("click", () => addToCart(p.id, qty));
  $("#now")?.addEventListener("click", () => { addToCart(p.id, qty, { silent: true }); location.href = "checkout.html"; });
}

/* شريط شراء ثابت على الموبايل لما زر الإضافة يخرج من الشاشة */
function stickyBar(p, max) {
  $("#sbar")?.remove(); sbObs?.disconnect(); if (soldOut(p)) return;
  const bar = document.createElement("div"); bar.id = "sbar"; bar.className = "stickybuy";
  bar.innerHTML = `<div><b>${money(p.price)}</b><small>${esc(p.name)}</small></div><button class="btn btn-primary" id="sAdd">أضف للسلة</button><button class="btn btn-mango" id="sNow">اطلب دلوقتي</button>`;
  document.body.append(bar);
  $("#sAdd").onclick = () => addToCart(p.id, qty); $("#sNow").onclick = () => { addToCart(p.id, qty, { silent: true }); location.href = "checkout.html"; };
  const target = $("#buy"); if (!target) return;
  sbObs = new IntersectionObserver(([e]) => bar.classList.toggle("show", !e.isIntersecting), { threshold: 0 });
  sbObs.observe(target);
}

/* التقييمات */
function loadReviews(p) {
  rvUnsub?.();
  rvUnsub = onSnapshot(query(collection(db, "reviews"), where("productId", "==", p.id), where("approved", "==", true)), (snap) => {
    const l = snap.docs.map((d) => d.data()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const avg = l.length ? l.reduce((s, r) => s + r.rating, 0) / l.length : 0;
    $("#rvSummary").innerHTML = l.length ? `<div class="rv-sum"><b>${avg.toFixed(1)}</b><span class="stars">${"★".repeat(Math.round(avg))}${"☆".repeat(5 - Math.round(avg))}</span><small>من ${l.length} تقييم</small></div>` : "";
    $("#rvList").innerHTML = l.length ? l.map((r) => `<article class="rv"><header><b>${esc(r.name)}</b><span class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span><small>${esc(timeText(r.createdAt))}</small></header><p>${esc(r.text)}</p></article>`).join("") : `<p class="muted">لسه مفيش تقييمات. كن أول واحد يقيّم المنتج.</p>`;
  }, () => { $("#rvList").innerHTML = ""; });
  $("#rvForm").onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button"); btn.disabled = true;
    try {
      await addDoc(collection(db, "reviews"), { productId: p.id, productName: p.name, name: f.name.trim(), rating: Number(f.rating), text: f.text.trim(), approved: false, createdAt: serverTimestamp() });
      e.target.reset(); toast("شكرًا! تقييمك هيظهر بعد المراجعة");
    } catch (er) { console.error(er); const m = $("#rvErr"); m.textContent = "تعذر إرسال التقييم."; m.classList.remove("hidden"); }
    btn.disabled = false;
  };
}
