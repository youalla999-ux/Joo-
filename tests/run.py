"""Shared Playwright helper: serves ./ and swaps Firebase CDN modules for the mock."""
import pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent
CORE = (ROOT / "core.js").read_text()
def attach(ctx):
    def fire(route):
        u = route.request.url
        if "firebasejs" in u:
            body = CORE if re.search(r"firebase-(auth|firestore|app|analytics)\.js", u) else ""
            # each module re-exports the same shared mock (state lives on window.__M)
            route.fulfill(status=200, content_type="application/javascript", body=f"export * from 'http://localhost:8765/__mock/core.js';")
        else:
            route.continue_()
    ctx.route("**/firebasejs/**", fire)
    ctx.route("**/__mock/core.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=CORE))
    ctx.route(re.compile(r"https://(fonts\.(googleapis|gstatic)\.com|res\.cloudinary\.com)/.*"), lambda r: r.fulfill(status=200, body="", content_type="text/css") if "css" in r.request.url else r.abort())
