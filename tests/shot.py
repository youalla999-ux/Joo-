import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent / "mock")); sys.path.insert(0, str(pathlib.Path(__file__).parent))
from playwright.sync_api import sync_playwright
from run import attach; from seed import seed
def go(pages, mobile=True, out="/tmp/claude-0/-home-claude/0aa5b2c0-daf9-578e-aae3-87f85cbbc955/scratchpad"):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1366, "height": 800}, device_scale_factor=1, is_mobile=mobile, locale="ar-EG")
        attach(ctx); ctx.add_init_script(f"if(!localStorage.__mockdb) {{ localStorage.__mockdb = {seed()!r}; localStorage.joo_cart = JSON.stringify([{{id:'p0',qty:2}},{{id:'p3',qty:3}}]); }}")
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        for name, url in pages:
            pg.goto("http://localhost:8765/" + url); pg.wait_for_timeout(900)
            pg.screenshot(path=f"{out}/{name}.png", full_page=True)
            try:
                from PIL import Image
                im = Image.open(f"{out}/{name}.png"); H = 1500 if mobile else 1300
                for i in range(0, min(im.height, H * 4), H): im.crop((0, i, im.width, min(i + H, im.height))).save(f"{out}/{name}_{i // H}.png")
                print(name, im.size)
            except Exception as e: print("slice", e)
        print("errors:", [e for e in errs if "ERR_" not in e][:8]); b.close()
if __name__ == "__main__":
    mob = sys.argv[1] == "m"; go([(a.split("=",1)[0], a.split("=",1)[1]) for a in sys.argv[2:]], mob)
