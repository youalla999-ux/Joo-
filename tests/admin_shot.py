import sys, pathlib, json, time
sys.path.insert(0, str(pathlib.Path(__file__).parent / "mock")); sys.path.insert(0, str(pathlib.Path(__file__).parent))
from playwright.sync_api import sync_playwright
from run import attach; from seed import seed
OUT = "/tmp/claude-0/-home-claude/0aa5b2c0-daf9-578e-aae3-87f85cbbc955/scratchpad"
def admin_db():
    d = json.loads(seed()); now = int(time.time())
    d["admins"] = {"owner1": {"role": "owner", "email": "o@x.com"}}
    d["orders"] = {f"ORD{i}AAAAAA"[:10]: {"userId": None, "customer": {"name": f"عميل {i}", "phone": "01012345678", "gov": "القاهرة", "city": "مدينة نصر", "address": "شارع التسعين"}, "notes": "", "items": [{"id": "p0", "name": "سماعة بلوتوث", "price": 150, "qty": 2, "lineTotal": 300, "image": ""}], "subtotal": 300, "shipping": 60, "coupon": None, "total": 360, "payment": "cod", "status": ["new", "confirmed", "shipped", "delivered"][i % 4], "history": [{"status": "new", "at": {"__ts": now - i * 86400}}], "createdAt": {"__ts": now - i * 40000}} for i in range(8)}
    d["tickets"] = {"t1aaaaaaaaaaaaaaaa": {"name": "منى", "phone": "01011112222", "subject": "استفسار عن طلب", "status": "open", "lastMessage": "هو الطلب وصل فين؟", "lastFrom": "customer", "unreadAdmin": True, "userId": "u1", "createdAt": {"__ts": now}, "updatedAt": {"__ts": now}}}
    return json.dumps(d)
def run(tabs, mobile=False):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1366, "height": 800}, is_mobile=mobile)
        attach(ctx)
        ctx.add_init_script(f"if(!localStorage.__mockdb) {{ localStorage.__mockdb = {admin_db()!r}; localStorage.__mockuser = JSON.stringify({{uid:'owner1',email:'o@x.com',displayName:'Owner'}}); }}")
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://localhost:8765/hq-aw2yy2c0.html"); pg.wait_for_timeout(1200)
        for t in tabs:
            if t != "dash":
                el = pg.query_selector(f'[data-tab="{t}"]')
                if el: el.click(); pg.wait_for_timeout(500)
            pg.screenshot(path=f"{OUT}/a_{'m' if mobile else 'd'}_{t}.png")
        print("errors:", errs[:5]); b.close()
if __name__ == "__main__": run(sys.argv[2:], sys.argv[1] == "m")
