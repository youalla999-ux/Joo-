"""Applies the enforcing CSP from public/_headers to every page and fails on any violation.  python3 tests/e2e/csp.py"""
import sys, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "mock"), str(ROOT)]
from playwright.sync_api import sync_playwright
from run import attach
csp = re.search(r"Content-Security-Policy: (.+)", (ROOT.parent / "public/_headers").read_text()).group(1).strip()
pages = ["index.html","shop.html","product.html?id=p3","cart.html","checkout.html","thanks.html?c=ABC","account.html","about.html","contact.html","returns.html","404.html","hq-aw2yy2c0.html"]
bad = []
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); attach(ctx)
    def add(route):
        r = route.fetch(); h = dict(r.headers); h["content-security-policy"] = csp; route.fulfill(response=r, headers=h)
    ctx.route(re.compile(r"http://localhost:8765/[^_]*\.html.*"), add)
    for pg in pages:
        page = ctx.new_page()
        page.on("console", lambda m, pg=pg: bad.append((pg, m.text[:160])) if "Content Security Policy" in m.text or "Refused to" in m.text else None)
        page.goto("http://localhost:8765/" + pg); page.wait_for_timeout(900); page.close()
print("\n".join(f"VIOLATION {a}: {b}" for a, b in bad) or "no CSP violations")
sys.exit(1 if bad else 0)
