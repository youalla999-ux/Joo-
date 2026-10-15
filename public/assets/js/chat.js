// الدعم الفني داخل "حسابي": محادثة بين العميل ولوحة التحكم
import { db, doc, collection, query, where, onSnapshot, updateDoc, writeBatch, serverTimestamp } from "./firebase.js";
import { S } from "./core.js";
import { fmtCode, cleanCode } from "./config.js";
import { $, esc, timeText } from "./utils.js";

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 31]).join("");
let unsubs = [];
const clear = () => { unsubs.forEach((f) => f()); unsubs = []; };
export const stopSupport = clear;

export function mountSupport(root, { orders = [], presetOrder = "" } = {}) {
  const user = S.user; if (!user) return;
  const cfg = S.settings.support || {};
  const home = () => {
    clear();
    let c = {}; try { c = JSON.parse(localStorage.getItem("joo_customer")) || {}; } catch {}
    root.innerHTML = `
      <p class="muted">${esc(cfg.greeting || "")}${cfg.hours ? ` <b>${esc(cfg.hours)}</b>` : ""}</p>
      <div class="tickets" id="tkList"></div>
      <details class="newtk" ${presetOrder ? "open" : ""}><summary class="btn btn-primary">محادثة جديدة</summary>
      <form class="form panel-form" id="tkForm">
        <div class="row"><label class="f">الاسم<input name="name" required maxlength="80" value="${esc(c.name || user.displayName || "")}"></label>
        <label class="f">رقم الموبايل<input name="phone" required inputmode="tel" pattern="01[0-9]{9}" value="${esc(c.phone || "")}" dir="ltr"></label></div>
        <label class="f">الموضوع<select name="subject">${["استفسار عن طلب", "مشكلة في منتج", "تعديل أو إلغاء طلب", "سؤال عن منتج", "شكوى أو اقتراح", "أخرى"].map((x, i) => `<option ${presetOrder && i === 0 ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        ${orders.length ? `<label class="f">الطلب (اختياري)<select name="order"><option value="">بدون</option>${orders.map((o) => `<option value="${o.id}" ${o.id === presetOrder ? "selected" : ""}>#${fmtCode(o.id)}</option>`).join("")}</select></label>` : ""}
        <label class="f">رسالتك<textarea name="text" required maxlength="2000" rows="4"></textarea></label>
        <div class="msg err hidden" id="tkErr"></div>
        <button class="btn btn-primary btn-lg">ابدأ المحادثة</button>
      </form></details>`;
    unsubs.push(onSnapshot(query(collection(db, "tickets"), where("userId", "==", user.uid)), (s) => {
      const l = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      $("#tkList").innerHTML = l.map((x) => `<a href="#support" class="tk" data-t="${x.id}"><b>${esc(x.subject)}${x.unreadCustomer ? ` <i class="dot">رد جديد</i>` : ""}</b><span>${esc((x.lastMessage || "").slice(0, 70))}</span><small>${x.status === "closed" ? "مغلقة · " : ""}${esc(timeText(x.updatedAt))}</small></a>`).join("") || "";
    }, console.error));
    $("#tkList").onclick = (e) => { const a = e.target.closest("[data-t]"); if (a) { e.preventDefault(); thread(a.dataset.t); } };
    $("#tkForm").onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button"), text = f.text.trim(); if (!text) return; btn.disabled = true;
      const id = newId();
      try {
        const b = writeBatch(db);
        b.set(doc(db, "tickets", id), { name: f.name.trim(), phone: f.phone.trim(), subject: f.subject, orderCode: cleanCode(f.order || ""), userId: user.uid, status: "open", lastMessage: text.slice(0, 120), lastFrom: "customer", unreadAdmin: true, unreadCustomer: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        b.set(doc(collection(db, "tickets", id, "messages")), { from: "customer", text, createdAt: serverTimestamp() });
        await b.commit();
        try { localStorage.setItem("joo_customer", JSON.stringify({ ...c, name: f.name.trim(), phone: f.phone.trim() })); } catch {}
        thread(id);
      } catch (er) { console.error(er); const m = $("#tkErr"); m.textContent = "تعذر إرسال الرسالة. جرّب تاني."; m.classList.remove("hidden"); btn.disabled = false; }
    };
  };

  const thread = (id) => {
    clear();
    root.innerHTML = `<div class="chat"><header><button class="btn btn-ghost btn-sm" id="back">← محادثاتي</button><div><b id="chTitle">...</b><small id="chState"></small></div></header>
      <div class="msgs" id="msgs" aria-live="polite"></div>
      <form id="chForm" class="composer"><textarea id="chText" rows="1" maxlength="2000" placeholder="اكتب رسالتك..." required></textarea><button class="btn btn-primary">إرسال</button></form></div>`;
    $("#back").onclick = home;
    let t = null;
    unsubs.push(onSnapshot(doc(db, "tickets", id), (d) => {
      if (!d.exists()) return home();
      t = d.data(); $("#chTitle").textContent = t.subject + (t.orderCode ? ` · ${fmtCode(t.orderCode)}` : "");
      $("#chState").textContent = t.status === "closed" ? "المحادثة مغلقة" : (cfg.hours || "");
      $("#chForm").classList.toggle("hidden", t.status === "closed");
      if (t.unreadCustomer) updateDoc(doc(db, "tickets", id), { unreadCustomer: false }).catch(() => {});
    }, home));
    unsubs.push(onSnapshot(query(collection(db, "tickets", id, "messages")), (s) => {
      const m = $("#msgs"); if (!m) return;
      const l = s.docs.map((x) => x.data()).sort((a, b) => (a.createdAt?.seconds || 9e12) - (b.createdAt?.seconds || 9e12));
      m.innerHTML = l.map((v) => `<div class="bub ${v.from === "admin" ? "them" : "me"}"><p>${esc(v.text)}</p><small>${v.from === "admin" ? "الدعم · " : ""}${esc(timeText(v.createdAt))}</small></div>`).join("");
      m.scrollTop = m.scrollHeight;
    }, console.error));
    const ta = $("#chText");
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chForm").requestSubmit(); } });
    $("#chForm").onsubmit = async (e) => {
      e.preventDefault(); const text = ta.value.trim(); if (!text || t?.status === "closed") return; ta.value = "";
      try {
        const b = writeBatch(db);
        b.set(doc(collection(db, "tickets", id, "messages")), { from: "customer", text, createdAt: serverTimestamp() });
        b.update(doc(db, "tickets", id), { lastMessage: text.slice(0, 120), lastFrom: "customer", unreadAdmin: true, updatedAt: serverTimestamp() });
        await b.commit();
      } catch (er) { console.error(er); ta.value = text; }
    };
  };
  home();
}
