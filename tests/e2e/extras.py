"""FAB, trust-strip toggles, pay page.  python3 tests/e2e/extras.py"""
import sys, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "mock"), str(ROOT)]
from playwright.sync_api import sync_playwright
from run import attach
from seed import seed
OUT = "/tmp/claude-0/-home-claude/0aa5b2c0-daf9-578e-aae3-87f85cbbc955/scratchpad"
d = json.loads(seed()); d["settings"]["store"].update(instapay="01012345678", wallet="01112223334", pay={"cod": True, "transfer": True, "card": False})
d["track"] = {"ABCDE12345": {"status": "new", "payment": "transfer", "total": 640, "items": [], "gov": "القاهرة", "city": "x"}}
fails = []
def ok(c, m):
    print(("  ok   " if c else "  FAIL ") + m); (not c) and fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch()
    for mobile in (True, False):
        ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1366, "height": 800}, is_mobile=mobile, locale="ar-EG"); attach(ctx)
        ctx.add_init_script(f"if(!localStorage.__mockdb) localStorage.__mockdb = {json.dumps(json.dumps(d))};")
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(900)
        ok(pg.locator("#fab").is_visible(), f"fab visible ({'m' if mobile else 'd'})")
        ok(pg.locator("#trust").count() == 0 and pg.locator("#hot .card").count() >= 2, "no trust strip; hot-deals rail has cards")
        pg.screenshot(path=f"{OUT}/x_home_{'m' if mobile else 'd'}.png", clip={"x": 0, "y": 0, "width": 390 if mobile else 1366, "height": 800})
        pg.locator("#fab").click(); pg.wait_for_timeout(300)
        ok(pg.locator("#fabDlg[open]").count() == 1, "fab opens dialog")
        ok(pg.locator("#fabDlg a[href='account.html#support']").count() == 1, "guest is asked to sign in")
        pg.screenshot(path=f"{OUT}/x_fab_{'m' if mobile else 'd'}.png")
        pg.goto("http://localhost:8765/pay.html?c=ABCDE12345"); pg.wait_for_timeout(900)
        ok("640" in pg.inner_text("#payRoot") or "٦٤٠" in pg.inner_text("#payRoot"), "pay page shows total")
        ok(pg.locator("[data-copy]").count() == 2, "pay page lists instapay + wallet")
        pg.screenshot(path=f"{OUT}/x_pay_{'m' if mobile else 'd'}.png", full_page=True)
        ok(not errs, f"no page errors {errs[:2]}")
        ctx.close()
sys.exit(1 if fails else 0)
