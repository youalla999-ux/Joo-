import { S, start, onChange, categories, cardHTML, bindCards, skeletons, emptyHTML, soldOut, offerOf } from "./core.js";
import { $, esc } from "./utils.js";
import { searchProducts } from "./search.js";

start("shop");
const params = new URLSearchParams(location.search);
const st = { cat: params.get("cat") || "الكل", q: (params.get("q") || "").trim(), sort: "new", shown: 12, min: 0, max: 0, stock: false, offer: false };
const grid = $("#grid"); grid.innerHTML = skeletons(8); bindCards(grid);

function visible() {
  let l = S.products.filter((p) => st.cat === "الكل" || p.category === st.cat);
  if (st.q) l = searchProducts(l, st.q);
  if (st.min) l = l.filter((p) => p.price >= st.min);
  if (st.max) l = l.filter((p) => p.price <= st.max);
  if (st.stock) l = l.filter((p) => !soldOut(p));
  if (st.offer) l = l.filter((p) => p.oldPrice > p.price || offerOf(p));
  if (st.sort === "rate") l.sort((a, b) => (b.ratingCount ? b.ratingSum / b.ratingCount : 0) - (a.ratingCount ? a.ratingSum / a.ratingCount : 0)); else if (st.sort === "low") l.sort((a, b) => a.price - b.price); else if (st.sort === "high") l.sort((a, b) => b.price - a.price);
  return l;
}
function draw() {
  if (!S.loaded) return;
  const cats = ["الكل", ...categories()]; if (!cats.includes(st.cat)) st.cat = "الكل";
  $("#chips").innerHTML = cats.map((c) => `<button class="chip ${c === st.cat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  const l = visible();
  $("#count").textContent = st.q ? `${l.length} نتيجة عن "${params.get("q") || $("#q")?.value || ""}"` : `${l.length} منتج`;
  grid.innerHTML = l.length ? l.slice(0, st.shown).map((p) => cardHTML(p)).join("") : emptyHTML(S.error ? "تعذر تحميل المنتجات." : S.products.length ? "مفيش منتجات بالاسم ده. جرّب كلمة تانية أو قسم آخر." : "المنتجات جاية قريب.", st.q || st.cat !== "الكل" ? ["shop.html", "شوف كل المنتجات"] : null);
  $("#more").classList.toggle("hidden", l.length <= st.shown);
}
onChange(draw);
$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  st.cat = b.dataset.cat; st.shown = 12; history.replaceState(null, "", st.cat === "الكل" ? "shop.html" : `shop.html?cat=${encodeURIComponent(st.cat)}`); draw();
});
$("#sort").addEventListener("change", (e) => { st.sort = e.target.value; draw(); });
$("#more").addEventListener("click", () => { st.shown += 12; draw(); });
// بحث حي في الهيدر
const q = $("#q"); q.addEventListener("input", () => { st.q = q.value.trim(); params.set("q", q.value.trim()); st.shown = 12; draw(); });
$("#searchForm").addEventListener("submit", (e) => e.preventDefault());

const fc = $("#fcount");
function fupdate() {
  st.min = +$("#pmin").value || 0; st.max = +$("#pmax").value || 0; st.stock = $("#fstock").checked; st.offer = $("#foffer").checked; st.shown = 12;
  const n = (st.min ? 1 : 0) + (st.max ? 1 : 0) + (st.stock ? 1 : 0) + (st.offer ? 1 : 0); fc.textContent = n; fc.classList.toggle("hidden", !n); draw();
}
["pmin", "pmax", "fstock", "foffer"].forEach((id) => $("#" + id).addEventListener("input", fupdate));
$("#freset").onclick = () => { $("#pmin").value = ""; $("#pmax").value = ""; $("#fstock").checked = false; $("#foffer").checked = false; fupdate(); };
