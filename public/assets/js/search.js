// بحث ذكي: تطبيع للعربي، تحمّل أخطاء إملائية بسيطة، وتكميل تلقائي
export const norm = (s = "") => String(s).toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); min = Math.min(min, cur[j]); }
    if (min > max) return max + 1; prev = cur;
  }
  return prev[b.length];
}

function tokenScore(t, words, whole) {
  if (whole.includes(t)) return words.some((w) => w.startsWith(t)) ? 3 : 2;
  const tol = t.length >= 5 ? 2 : t.length >= 4 ? 1 : 0; if (!tol) return 0;
  return words.some((w) => lev(t, w.slice(0, Math.max(t.length, 1) + 1 > w.length ? w.length : t.length + 1), tol) <= tol || lev(t, w, tol) <= tol) ? 1 : 0;
}

export function searchProducts(list, q) {
  const toks = norm(q).split(" ").filter(Boolean); if (!toks.length) return list;
  const out = [];
  for (const p of list) {
    const name = norm(p.name), cat = norm(p.category), desc = norm(p.description);
    const nw = name.split(" "), all = `${name} ${cat} ${desc}`, aw = all.split(" ");
    let total = 0, hit = 0;
    for (const t of toks) { const s = Math.max(tokenScore(t, nw, name) * 2, tokenScore(t, aw, all)); if (s) { hit++; total += s; } }
    if (hit === toks.length || (toks.length >= 2 && hit >= toks.length - 1 && hit > 0)) out.push([total - (toks.length - hit), p]);
  }
  return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

// قائمة اقتراحات تحت خانة البحث
export function initSearch({ products, money, img, esc }) {
  const form = document.getElementById("searchForm"), input = document.getElementById("q"); if (!form || !input) return;
  const box = document.createElement("div"); box.className = "sugg hidden"; box.id = "sugg"; box.setAttribute("role", "listbox"); form.append(box);
  let idx = -1, items = [];
  const close = () => { box.classList.add("hidden"); idx = -1; input.removeAttribute("aria-activedescendant"); };
  const draw = () => {
    const q = input.value.trim(); if (q.length < 2) return close();
    items = searchProducts(products(), q).slice(0, 6);
    box.innerHTML = items.length
      ? items.map((p, i) => `<a role="option" id="sg${i}" href="product.html?id=${encodeURIComponent(p.id)}"><img src="${esc(img(p.images?.[0], 90))}" alt=""><span><b>${esc(p.name)}</b><small>${esc(p.category || "")}</small></span><em>${money(p.price)}</em></a>`).join("") + `<a class="all" href="shop.html?q=${encodeURIComponent(q)}">شوف كل النتايج ←</a>`
      : `<p>مفيش نتايج لـ "${esc(q)}". جرّب كلمة تانية.</p>`;
    box.classList.remove("hidden");
  };
  input.addEventListener("input", draw);
  input.addEventListener("focus", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (!items.length || box.classList.contains("hidden")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      box.querySelectorAll("[role=option]").forEach((a, i) => a.classList.toggle("on", i === idx)); input.setAttribute("aria-activedescendant", "sg" + idx);
    } else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); location.href = `product.html?id=${encodeURIComponent(items[idx].id)}`; }
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) close(); });
}
