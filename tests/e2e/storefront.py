"""Storefront + dashboard E2E (Playwright) against the Firebase mock. Run: python3 tests/e2e/storefront.py"""
import sys, json, pathlib, time
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "mock"), str(ROOT)]
from playwright.sync_api import sync_playwright
from run import attach
from seed import seed
from admin_shot import admin_db

BASE = "http://localhost:8765/"
fails = []; passed = 0
def check(name, cond, extra=""):
    global passed
    if cond: passed += 1; print("  ok  ", name)
    else: fails.append(name); print("  FAIL", name, extra)

def new_ctx(b, mobile=True, db=None, user=None, w=390):
    ctx = b.new_context(viewport={"width": w if mobile else 1366, "height": 844}, is_mobile=mobile, locale="ar-EG")
    attach(ctx)
    ctx.add_init_script(f"if(!localStorage.__mockdb) {{ localStorage.__mockdb = {(db or seed())!r}; {('localStorage.__mockuser = JSON.stringify(%s);' % json.dumps(user)) if user else ''} }}")
    calls = []
    def api(route):
        req = route.request; body = json.loads(req.post_data or "{}"); calls.append((req.url.split("/api/")[1], body))
        if req.url.endswith("/api/order"):
            if any(i["qty"] > 50 for i in body["items"]): return route.fulfill(status=409, content_type="application/json", body=json.dumps({"ok": False, "error": "unavailable", "message": "بعض المنتجات تغيّر توافرها", "problems": [{"id": body["items"][0]["id"], "reason": "stock", "available": 3}]}))
            return route.fulfill(status=201, content_type="application/json", body=json.dumps({"ok": True, "code": "K7M2Q9XBD4", "total": 460, "shipping": 60, "discount": 0, "subtotal": 400, "payment": body["payment"], "name": body["customer"]["name"], "phone": body["customer"]["phone"]}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "status": body.get("status")}))
    ctx.route("**/api/order", api); ctx.route("**/api/order-status", api)
    ctx.route("**/api/config", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true,"card":false}'))
    return ctx, calls

def page_errors(pg):
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); return errs

with sync_playwright() as p:
    b = p.chromium.launch()

    print("home (mobile)")
    ctx, calls = new_ctx(b); pg = ctx.new_page(); errs = page_errors(pg)
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".card", timeout=8000)
    check("trust strip removed, deals rail present", pg.locator("#trust").count() == 0 and pg.locator("#hot .card").count() >= 2)
    check("category rings rendered", pg.locator(".cat-tile").count() >= 4)
    check("deal ticket shows countdown", pg.locator(".dealbox .count span").count() >= 3)
    check("no hero / announcement bar", pg.locator(".hero, .announce").count() == 0)
    check("category rails present", pg.locator(".grid.rail").count() >= 1)
    check("cards have add buttons", pg.locator(".card .add").count() > 4)
    check("fonts: display + body stacks set", "Baloo" in pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--font-display')"))
    # add to cart from a card
    pg.locator(".card .add").first.click(); pg.wait_for_timeout(300)
    check("cart badge increments", pg.locator("#cartCount").inner_text().strip() in ("1", "١"))
    # search suggestions
    pg.fill("#q", "ساعه"); pg.wait_for_timeout(300)
    check("search tolerates spelling (ساعه → ساعة)", pg.locator(".sugg a[role=option]").count() >= 1)
    # wishlist
    pg.keyboard.press("Escape"); pg.locator(".card .wish").first.click()
    check("wishlist toggles", pg.locator(".card .wish.on").count() >= 1)
    check("no page errors on home", not errs, errs)

    print("overflow audit")
    for w in (360, 390):
        c2, _ = new_ctx(b, w=w); q = c2.new_page()
        for u in ["index.html", "shop.html", "product.html?id=p3", "cart.html", "checkout.html", "account.html", "about.html", "contact.html", "returns.html"]:
            q.goto(BASE + u); q.wait_for_timeout(700)
            sw = q.evaluate("document.documentElement.scrollWidth")
            check(f"{u} fits {w}px (scrollWidth {sw})", sw <= w + 1)
        c2.close()

    print("shop filters")
    pg.goto(BASE + "shop.html?cat=" + "موضة"); pg.wait_for_selector(".card")
    n = pg.locator(".card").count(); check("category filter narrows list", 0 < n < 16, n)
    pg.goto(BASE + "shop.html"); pg.wait_for_selector(".card")
    pg.select_option("#sort", "low"); pg.wait_for_timeout(200)
    prices = pg.eval_on_selector_all(".card .price b", "els => els.map(e => e.textContent.replace(/[^٠-٩0-9]/g,''))")
    check("sorted by price", len(prices) > 3)

    print("product page")
    pg.goto(BASE + "product.html?id=p3"); pg.wait_for_selector(".pinfo h1")
    check("buy 3 pay 2 offer shown", pg.locator(".offer").count() == 1)
    pg.click("#qPlus"); pg.click("#qPlus"); pg.wait_for_timeout(200)
    check("offer price computed for qty 3 (2×405 = ٨١٠)", "٨١٠" in pg.inner_text("#ptotal"), pg.inner_text("#ptotal"))
    check("JSON-LD present", pg.locator("script#ld").count() == 1)
    check("sticky buy bar exists on mobile", pg.locator("#sbar").count() == 1)

    print("checkout")
    pg.goto(BASE + "cart.html"); pg.wait_for_selector(".line")
    check("cart shows lines", pg.locator(".line").count() >= 1)
    pg.goto(BASE + "checkout.html"); pg.wait_for_selector("#coForm")
    pg.fill("[name=name]", "أحمد علي"); pg.fill("[name=phone]", "01012345678"); pg.select_option("[name=gov]", "القاهرة"); pg.fill("[name=city]", "مدينة نصر"); pg.fill("[name=address]", "شارع التسعين عمارة 5")
    check("honeypot field hidden from users", pg.locator(".hp").count() == 1 and pg.eval_on_selector(".hp", "e => getComputedStyle(e).opacity") == "0")
    pg.click("#coSubmit"); pg.wait_for_url("**/thanks.html?c=*", timeout=6000)
    check("order posted to /api/order (server computes totals)", any(c[0] == "order" for c in calls))
    check("redirects to thanks with code", "K7M2Q9XBD4" in pg.url)
    check("cart cleared after order", pg.evaluate("localStorage.joo_cart") in ("[]", None))
    ctx.close()

    print("account (signed in)")
    ctx, calls = new_ctx(b, user={"uid": "u_demo_user_0001", "email": "demo@x.com", "displayName": "Demo"}); pg = ctx.new_page(); errs = page_errors(pg)
    pg.goto(BASE + "account.html"); pg.wait_for_selector(".acc-tabs")
    for t in ("orders", "wish", "track", "support", "profile"):
        pg.click(f'[data-tab="{t}"]'); pg.wait_for_timeout(250)
    check("all five account tabs render", not errs, errs)
    pg.click('[data-tab="track"]'); pg.fill("#tcCode", "NOPE12345"); pg.click("#tcForm button"); pg.wait_for_timeout(500)
    check("track shows not-found message", pg.locator("#tcErr:not(.hidden)").count() == 1)
    ctx.close()

    print("dashboard")
    ctx, calls = new_ctx(b, mobile=False, db=admin_db(), user={"uid": "owner1", "email": "o@x.com", "displayName": "Owner"}); pg = ctx.new_page(); errs = page_errors(pg)
    pg.goto(BASE + "hq-aw2yy2c0.html"); pg.wait_for_selector("#view", timeout=8000); pg.wait_for_timeout(800)
    for t in ("orders", "products", "coupons", "customers", "settings", "team", "reviews", "support"):
        el = pg.query_selector(f'[data-tab="{t}"]')
        if el: el.click(); pg.wait_for_timeout(300)
    check("every dashboard tab renders without errors", not errs, errs)
    pg.click('[data-tab="orders"]'); pg.wait_for_selector("[data-st]")
    pg.locator("[data-st]").first.select_option("cancelled"); pg.wait_for_timeout(500)
    check("status change goes through /api/order-status", any(c[0] == "order-status" and c[1]["status"] == "cancelled" for c in calls), calls)
    ctx.close(); b.close()

print(f"\n{passed} checks passed, {len(fails)} failed")
sys.exit(1 if fails else 0)
