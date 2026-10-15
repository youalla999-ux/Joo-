import { S, start, onChange } from "./core.js";
import { $, esc } from "./utils.js";
const page = location.pathname.split("/").pop().replace(".html", "");
start(page === "returns" ? "" : page);
const paras = (t) => String(t || "").split("\n").filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
onChange(() => {
  const s = S.settings;
  if (page === "returns") $("#policy").innerHTML = `<p class="muted">مدة الاستبدال: <b>${Number(s.returnDays) || 14} يوم</b> من الاستلام.</p>${paras(s.returnsText)}`;
  if (page === "about") $("#policy").innerHTML = paras(s.aboutText);
  if (page === "contact") {
    const wa = (s.whatsapp || "").replace(/\D/g, "").replace(/^0/, "20"), so = s.social || {};
    const rows = [
      wa && ["واتساب", s.whatsapp, `https://wa.me/${wa}`], s.phone && ["اتصال", s.phone, `tel:${s.phone}`], s.email && ["البريد", s.email, `mailto:${s.email}`], s.address && ["العنوان", s.address, ""],
      so.facebook && ["فيسبوك", "صفحتنا", so.facebook], so.instagram && ["إنستجرام", "حسابنا", so.instagram], so.tiktok && ["تيك توك", "حسابنا", so.tiktok],
    ].filter(Boolean);
    $("#cards").innerHTML = rows.length ? rows.map(([k, v, h]) => `<${h ? `a href="${esc(h)}" target="_blank" rel="noopener"` : "div"} class="ccard"><small>${k}</small><b>${esc(v)}</b></${h ? "a" : "div"}>`).join("") : `<p class="muted">بيانات التواصل بتتضاف من لوحة التحكم.</p>`;
    $("#faq").innerHTML = (s.faq || []).filter((f) => f.q).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
    $("#faqTitle").classList.toggle("hidden", !(s.faq || []).some((f) => f.q));
  }
});
