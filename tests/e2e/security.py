"""XSS / injection sweep: every user-controllable field is poisoned, then every page + dashboard tab is opened.
Any executed payload sets window.__xss and fails the run.   python3 tests/e2e/security.py"""
import sys, json, pathlib, time
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "mock"), str(ROOT)]
from playwright.sync_api import sync_playwright
from run import attach
from admin_shot import admin_db

X = '"><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=(window.__xss||0)+1">'
A = '" autofocus onfocus="window.__xss=(window.__xss||0)+1" x="'      # attribute-context breakout
S = "</script><script>window.__xss=(window.__xss||0)+1</script>"
J = "javascript:window.__xss=(window.__xss||0)+1"

def poisoned():
    d = json.loads(admin_db()); now = int(time.time())
    for k, p in d["products"].items():
        p.update(name=X + p["name"], description=X, category=X, specs=f"{X}: {X}\nالخامة: {A}", video=J, images=[A, X])
    st = d["settings"]["store"]
    st.update(name=X, whatsapp=J, phone=X, email=X, address=X, instapay=X, wallet=X, aboutText=X, returnsText=X, deliveryNote=X, announcement=X, announcementCode=X,
              social={"facebook": J, "instagram": J, "tiktok": J}, faq=[{"q": X, "a": X}], categories=[{"name": X, "image": A}, {"name": A}],
              deal={**st["deal"], "title": X}, support={"greeting": X, "hours": X, "quick": [X, A]}, hero={"title": X, "sub": X, "cta": X, "ctaLink": J})
    for r in d["reviews"].values(): r.update(name=X, text=X, productName=X)
    for o in d["orders"].values():
        o["customer"] = {k: X for k in o["customer"]}; o["customer"]["phone"] = X; o["notes"] = X
        o["items"][0].update(name=X, image=A); o["coupon"] = {"code": X, "discount": 5}
    for t in d["tickets"].values(): t.update(name=X, subject=X, lastMessage=X, phone=X, orderCode=X)
    d["messages"] = {}
    d["coupons"] = {"A1": {"type": "percent", "value": 10, "minOrder": 0, "active": True, "uses": 0}}
    d["admins"]["owner1"]["email"] = X
    d["admins"]["x" * 24] = {"role": "admin", "email": X, "perms": {"orders": True}}
    return json.dumps(d)

fails = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for label, mobile, user, pages in [
        ("storefront", True, {"uid": "u_demo_user_0001", "email": X, "displayName": X}, ["index.html", "shop.html", "shop.html?q=" + X, "shop.html?cat=" + X, "product.html?id=p3", "product.html?id=" + X, "cart.html", "checkout.html", "thanks.html?c=" + X, "account.html", "account.html?c=" + X, "account.html?order=" + X + "#support", "about.html", "contact.html", "returns.html", "404.html"]),
        ("dashboard", False, {"uid": "owner1", "email": "o@x.com", "displayName": X}, ["hq-aw2yy2c0.html"]),
    ]:
        ctx = b.new_context(viewport={"width": 390 if mobile else 1366, "height": 844}, is_mobile=mobile)
        attach(ctx)
        ctx.add_init_script(f"if(!localStorage.__mockdb) {{ localStorage.__mockdb = {poisoned()!r}; localStorage.__mockuser = JSON.stringify({json.dumps(user)}); localStorage.joo_cart = JSON.stringify([{{id:'p0',qty:1}}]); localStorage.joo_customer = JSON.stringify({{name:{json.dumps(X)},address:{json.dumps(A)}}}); localStorage.joo_wish = JSON.stringify(['p0','p1']); localStorage.joo_coupon = JSON.stringify({{code:{json.dumps(X)},type:'fixed',value:1,minOrder:0}}); }}")
        ctx.route("**/api/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true,"card":false}'))
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: (fails.append(f"dialog opened: {d.message}"), d.dismiss()))
        for u in pages:
            pg.goto("http://localhost:8765/" + u); pg.wait_for_timeout(900)
            if label == "storefront":
                for sel in ('[data-tab="orders"]', '[data-tab="wish"]', '[data-tab="support"]', '[data-tab="profile"]', ".tk", "#menuBtn", ".tabs [data-pt]"):
                    for el in pg.query_selector_all(sel)[:3]:
                        try: el.click(timeout=800); pg.wait_for_timeout(150)
                        except Exception: pass
                try: pg.keyboard.press("Escape"); pg.fill("#q", X); pg.wait_for_timeout(250)
                except Exception: pass
            else:
                for t in ("dash", "orders", "products", "coupons", "customers", "support", "reviews", "settings", "team"):
                    el = pg.query_selector(f'[data-tab="{t}"]')
                    if el: el.click(); pg.wait_for_timeout(350)
                    for sel in (".slist button", "[data-edit]", "[data-print]"):
                        for e in pg.query_selector_all(sel)[:2]:
                            try: e.click(timeout=800); pg.wait_for_timeout(200); pg.keyboard.press("Escape")
                            except Exception: pass
            hit = pg.evaluate("window.__xss || 0")
            if hit: fails.append(f"{label}: XSS executed on {u[:60]} ({hit}x)")
            else: print("  clean", label, u[:60])
        ctx.close()
    b.close()
print("\nFAILED:" if fails else "\nno payload executed anywhere"); [print(" -", f) for f in fails]
sys.exit(1 if fails else 0)
