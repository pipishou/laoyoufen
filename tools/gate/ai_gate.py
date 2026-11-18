"""AI 门：一句话通道（四个落点）在三种代理状态下的行为。

三个阶段各 build 一次（构建时把 VITE_AI_LINE_URL 内联进包）：
  offline  代理指到 127.0.0.1:9（根本不通）→ 游戏必须照常，文案回落本地，不能有 JS 异常
  online   假代理返回固定句            → 那句必须真的上屏（街坊请求 / 同行传闻 / 落场喊话）
  digits   假代理返回带阿拉伯数字的句子 → 整句必须被丢掉，界面仍是本地句

判定口径：
  - 只把 JS 异常（pageerror）当失败；网络层的 ERR_CONNECTION_REFUSED 是 offline 阶段预期行为；
  - 每次换阶段都重建 dist 并重新起 preview，避免拿到上一次的包。

用法： python tools/gate/ai_gate.py
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

GAME = os.path.join("game")
OUT = os.path.join("game", "data", "evidence", "ai")
PORT = 4190
FAKE_PORT = 8791
LINE_OK = "这条巷子晚上黑，娃娃放学走这儿我不放心。"
LINE_BAD = "这条街现在有 3 家粉店，我们家最便宜。"


class FakeProxy(BaseHTTPRequestHandler):
    """假代理：按当前 MODE 决定回什么。"""

    mode = "online"

    def log_message(self, *_args):
        return

    def _cors(self) -> None:
        # 页面在 preview 端口，代理在另一个端口 —— 不带头浏览器直接把响应丢掉
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.send_header("access-control-allow-methods", "POST, OPTIONS")

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self._cors()
        self.send_header("content-length", "0")
        self.end_headers()

    def do_POST(self):  # noqa: N802
        n = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        kind = body.get("kind", "")
        if self.mode == "digits":
            text = LINE_BAD
        elif kind == "arena_call":
            text = "锅气起来了，趁势再来一记！"
        else:
            text = LINE_OK
        payload = json.dumps({"body": text, "source": "remote"}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def port_open(port: int, timeout: float = 0.3) -> bool:
    with socket.socket() as s:
        s.settimeout(timeout)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_port(port: int, seconds: float = 40) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        if port_open(port):
            return True
        time.sleep(0.3)
    return False


def build(line_url: str) -> None:
    env = dict(os.environ)
    env["VITE_AI_LINE_URL"] = line_url
    r = subprocess.run(
        ["npx.cmd", "vite", "build"],
        cwd=GAME,
        env=env,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )
    if r.returncode != 0:
        raise SystemExit(f"build failed for {line_url}\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")


def start_preview():
    proc = subprocess.Popen(
        ["npx.cmd", "vite", "preview", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
        cwd=GAME,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not wait_port(PORT):
        proc.kill()
        raise SystemExit("preview 起不来")
    return proc


def enter_shop(page) -> None:
    page.evaluate("localStorage.clear(); location.reload();")
    page.wait_for_timeout(1600)
    page.click('.sitecard[data-site="alley"]')
    page.click("[data-chips] .chip")
    page.click("[data-open]")
    page.wait_for_timeout(700)
    for sel in ["[data-guide='dismiss']", ".gbtn.ghost"]:
        if page.locator(sel).count():
            page.evaluate(f"document.querySelector(\"{sel}\").click()")
            break
    page.wait_for_timeout(300)
    page.evaluate("window.__laoyou.state.cash = 120000; window.__laoyou.state.gradeLevel = 6;")
    page.evaluate('document.querySelector("[data-tab=\\"shop\\"]").click()')
    page.wait_for_timeout(900)


def read_panel(page) -> dict:
    return page.evaluate(
        """() => {
          const secs = Array.from(document.querySelectorAll(".sec"));
          const block = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("街面"));
          const street = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("同条街"));
          const reqEl = block ? Array.from(block.querySelectorAll(".lmeta")).find((n) => (n.textContent||"").includes("街坊来提")) : null;
          return {
            request: reqEl ? reqEl.textContent.trim() : "",
            rumour: street ? Array.from(street.querySelectorAll(".lmeta.rumour")).map((n) => n.textContent.trim()) : [],
          };
        }"""
    )


def run_stage(name: str, line_url: str, expect: str) -> dict:
    build(line_url)
    proc = start_preview()
    errors: list[str] = []
    result: dict = {"stage": name, "ok": False}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="msedge", headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on("pageerror", lambda e: errors.append(f"{type(e).__name__}: {e}"))
            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="load")
            page.wait_for_timeout(1200)
            enter_shop(page)
            panel = read_panel(page)
            # 触发一次预取（正常是每分钟一次；这里推一天再手动调，绕过「每天一次」的节流）
            page.evaluate("() => { window.__laoyou.state.day = (window.__laoyou.state.day || 1) + 1; }")
            page.evaluate("async () => { await window.__laoyou.prefetch(); window.__laoyou.refresh(); }")
            page.wait_for_timeout(800)
            panel2 = read_panel(page)

            # 落场：点一场，看场上有没有那句喊话
            page.evaluate('document.querySelector("[data-tab=\\"contest\\"]").click()')
            page.wait_for_timeout(700)
            page.evaluate(
                """() => {
                  const b = document.querySelector('[data-act="startarena"][data-id="market"]');
                  if (b) b.click();
                }"""
            )
            page.wait_for_timeout(1400)
            call = page.evaluate(
                """() => {
                  const el = document.querySelector("[data-acall]");
                  return el ? el.textContent.trim() : "";
                }"""
            )
            page.evaluate(
                """() => {
                  const s = window.__laoyou.state;
                  if (s.arena) { const b = document.querySelector('[data-act="aflee"]'); if (b) b.click(); }
                }"""
            )
            page.wait_for_timeout(400)

            result.update(
                {
                    "request": panel2["request"] or panel["request"],
                    "rumour": panel2["rumour"],
                    "call": call,
                    "pageerrors": list(errors),
                }
            )
            if expect == "local":
                result["ok"] = (
                    LINE_OK not in result["request"]
                    and LINE_OK not in " ".join(result["rumour"])
                    and (not result["request"] or "街坊来提" in result["request"])
                    and not errors
                )
            elif expect == "remote":
                result["ok"] = (
                    LINE_OK in result["request"] or any(LINE_OK in r for r in result["rumour"]) or LINE_OK in call
                ) and not errors
            else:  # digits
                joined = result["request"] + " ".join(result["rumour"]) + call
                result["ok"] = "3 家粉店" not in joined and not errors

            page.screenshot(path=os.path.join(OUT, f"{name}.png"))
            browser.close()
    finally:
        proc.kill()
        time.sleep(1.0)
    return result


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(OUT, exist_ok=True)
    report: dict = {"ok": False, "stages": []}

    # ① offline：代理根本连不上（高位端口，避开浏览器屏蔽的 9 号端口）
    report["stages"].append(run_stage("01-offline", "http://127.0.0.1:45999/line", "local"))

    # ②/③ 起假代理
    proxy = ThreadingHTTPServer(("127.0.0.1", FAKE_PORT), FakeProxy)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    try:
        FakeProxy.mode = "online"
        report["stages"].append(run_stage("02-online", f"http://127.0.0.1:{FAKE_PORT}/line", "remote"))
        FakeProxy.mode = "digits"
        report["stages"].append(run_stage("03-digits", f"http://127.0.0.1:{FAKE_PORT}/line", "digits"))
    finally:
        proxy.shutdown()

    report["ok"] = all(s["ok"] for s in report["stages"])
    with open(os.path.join(OUT, "gate-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # 收尾：重建生产包（读 .env.production），别把测试代理留在 dist 里
    build(os.environ.get("VITE_AI_LINE_URL", ""))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
