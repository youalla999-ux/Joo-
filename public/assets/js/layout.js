// الهيدر والفوتر وشريط الموبايل: مكان واحد يتعدّل منه لكل الصفحات
import { $ } from "./utils.js";

const ico = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const I = {
  search: ico('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
  user: ico('<circle cx="12" cy="8.5" r="3.7"/><path d="M4.5 20c.8-3.6 3.7-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>'),
  bag: ico('<path d="M5 8.5h14l-1 11.5H6z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>'),
  home: ico('<path d="m4 11 8-6.5 8 6.5"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>'),
  shop: ico('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
  menu: ico('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  cash: ico('<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/>'),
  truck: ico('<path d="M3 6.5h11v9H3zM14 10h4l3 3v2.5h-7"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>'),
  swap: ico('<path d="M4 9h13l-3-3M20 15H7l3 3"/>'),
  chat: ico('<path d="M4 5h16v11H9l-5 4z"/>'),
};

export function mountLayout(active = "") {
  const head = $("#site-header");
  if (head) {
    head.className = "site";
    head.innerHTML = `
    <div class="wrap bar">
      <button class="icon-btn menu-btn" id="menuBtn" type="button" aria-label="القائمة">${I.menu}</button>
      <a href="index.html" class="brand" aria-label="Joo Store"><img src="assets/img/favicon.png" alt=""><span id="brandName">Joo Store</span></a>
      <form class="search" id="searchForm" role="search" action="shop.html">
        <span aria-hidden="true">${I.search}</span>
        <input id="q" name="q" type="search" placeholder="ابحث عن منتج أو قسم" aria-label="بحث" autocomplete="off" enterkeyhint="search">
      </form>
      <div class="nav-actions">
        <a class="nav-link" href="account.html" id="navAccount">${I.user}<span>حسابي</span></a>
        <a class="cart-pill" href="cart.html" id="btnCart" aria-label="السلة">${I.bag}<b id="cartTotal">٠ ج.م</b><em class="badge hidden" id="cartCount">0</em></a>
      </div>
    </div>
    <div class="catnav-wrap"><nav class="wrap catnav" id="catNav" aria-label="الأقسام"><button type="button" class="all" id="allCats">${I.menu}<span>كل الأقسام</span></button><a href="shop.html" class="${active === "shop" ? "on" : ""}">المتجر</a><span id="catLinks" style="display:contents"></span><span class="sep"></span><a href="about.html" class="${active === "about" ? "on" : ""}">من نحن</a><a href="contact.html" class="${active === "contact" ? "on" : ""}">تواصل معنا</a></nav></div>`;
    const q = new URLSearchParams(location.search).get("q");
    if (q && active === "shop") $("#q").value = q;
  }

  const foot = $("#site-footer");
  if (foot) {
    foot.className = "site";
    foot.innerHTML = `
    <div class="wrap">
      <div class="fcols">
        <div class="fbrand"><div class="brandline"><img src="assets/img/favicon.png" alt=""><b id="fName">Joo Store</b></div><p id="fAbout"></p><div class="social" id="fSocial"></div></div>
        <div><h4>تسوّق</h4><a href="shop.html">كل المنتجات</a><a href="cart.html">السلة</a><a href="account.html">حسابي وطلباتي</a><a href="account.html#track">تتبع طلب</a></div>
        <div><h4>مساعدة</h4><a href="returns.html">الاستبدال والاسترجاع</a><a href="contact.html#faq">أسئلة شائعة</a><a href="about.html">من نحن</a><a href="contact.html">تواصل معنا</a></div>
        <div><h4>تواصل</h4><div id="fContact"></div><a id="footWa" class="btn btn-peach btn-sm hidden" target="_blank" rel="noopener" style="margin-top:10px">كلمنا على واتساب</a></div>
      </div>
      <div class="legal"><span>© ${new Date().getFullYear()} <span id="fName2">Joo Store</span></span><span>الأسعار بالجنيه المصري</span></div>
    </div>`;
  }

  const dlg = document.createElement("dialog"); dlg.className = "drawer right"; dlg.id = "menuDlg"; dlg.setAttribute("aria-label", "القائمة");
  dlg.innerHTML = `<div class="dlg-head"><h2>تصفّح</h2><button class="icon-btn" type="button" data-close aria-label="إغلاق">✕</button></div><div class="dlg-body menu" id="menuBody"></div>`;
  document.body.append(dlg);
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]") || e.target.closest("a")) dlg.close(); });
  for (const id of ["menuBtn", "allCats"]) { const b = $("#" + id); if (b) b.onclick = () => dlg.showModal(); }

  // شريط سفلي للموبايل
  const tab = document.createElement("nav");
  tab.className = "tabbar"; tab.setAttribute("aria-label", "التنقل السريع");
  const T = [["index.html", I.home, "الرئيسية", "home"], ["shop.html", I.shop, "المتجر", "shop"], ["cart.html", I.bag, "السلة", "cart"], ["account.html", I.user, "حسابي", "account"]];
  tab.innerHTML = T.map(([h, i, t, k]) => `<a href="${h}" class="${k === active ? "on" : ""}" ${k === active ? 'aria-current="page"' : ""}>${i}<span>${t}</span>${k === "cart" ? `<em class="badge hidden" id="tabCount">0</em>` : ""}</a>`).join("");
  document.body.append(tab);
}

const SOCIAL = [["facebook", "فيسبوك"], ["instagram", "إنستجرام"], ["tiktok", "تيك توك"]];
const safe = (s) => String(s ?? "").replace(/[<>&"]/g, "");

// تحديثات حية من core.js
export function updateChrome({ total, count, wa, user, cats, name, about, phone, email, address, social = {}, active = "" }) {
  const t = $("#cartTotal"); if (t) t.textContent = total;
  for (const id of ["cartCount", "tabCount"]) { const b = $("#" + id); if (b) { b.textContent = count; b.classList.toggle("hidden", !count); } }

  const catKey = JSON.stringify(cats || []);
  const links = $("#catLinks");
  if (links && links.dataset.k !== catKey) {
    links.dataset.k = catKey;
    const cur = new URLSearchParams(location.search).get("cat");
    links.innerHTML = (cats || []).slice(0, 12).map(([c]) => `<a href="shop.html?cat=${encodeURIComponent(c)}" class="${active === "shop" && cur === c ? "on" : ""}">${safe(c)}</a>`).join("");
  }
  const mbody = $("#menuBody");
  if (mbody && mbody.dataset.k !== catKey) {
    mbody.dataset.k = catKey;
    mbody.innerHTML = `<a href="shop.html" class="m-all">كل المنتجات</a><h3>الأقسام</h3>${(cats || []).map(([c, n]) => `<a href="shop.html?cat=${encodeURIComponent(c)}"><span>${safe(c)}</span><small>${n}</small></a>`).join("") || "<p class='muted'>الأقسام هتظهر بعد إضافة المنتجات.</p>"}<h3>المتجر</h3><a href="account.html">حسابي وطلباتي</a><a href="about.html">من نحن</a><a href="returns.html">الاستبدال والاسترجاع</a><a href="contact.html">تواصل معنا</a>`;
  }
  const u = $("#navAccount"); if (u) u.classList.toggle("in", !!user);

  if (name) { for (const id of ["brandName", "fName", "fName2"]) { const e = $("#" + id); if (e) e.textContent = name; } }
  const fa = $("#fAbout"); if (fa) fa.textContent = about ? String(about).split("\n")[0].slice(0, 140) : "";
  const fc = $("#fContact");
  if (fc) fc.innerHTML = [phone && `<span class="contact-line" dir="ltr" style="text-align:start">${safe(phone)}</span>`, email && `<span class="contact-line">${safe(email)}</span>`, address && `<span class="contact-line">${safe(address)}</span>`].filter(Boolean).join("") || `<span class="contact-line">من حسابك ثم الدعم</span>`;
  const fs = $("#fSocial");
  if (fs) fs.innerHTML = SOCIAL.filter(([k]) => /^https?:\/\//.test(social[k] || "")).map(([k, l]) => `<a href="${safe(social[k])}" target="_blank" rel="noopener">${l}</a>`).join("");
  const f = $("#footWa"); if (f) { f.classList.toggle("hidden", !wa); if (wa) f.href = wa; }
}

export function bump() {
  const pill = $("#btnCart"); if (!pill) return;
  pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
}
