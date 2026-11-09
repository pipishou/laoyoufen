"""眼睛绿（eye gate）：把「改完了」变成「改完并看见过」。

规矩来自 CCGS `.claude/docs/run-and-observe.md` 与本项目 `docs/gates.md` §3–§4：

  1. 玩家可见的改动，关闭前必须在真实视口里启动、截图、看图。
  2. 只有截图，没有 stamp 的，算「没评估」不算「通过」。
  3. 截图之后源文件又被改过，证据就旧了 —— 报 CHANGED / GONE，回落 NOT_ASSESSED。
  4. 截图是空白（纯色）说明这一跑其实没渲染，也必须报出来，不能当成「页面很干净」。

用法（仓库根目录）：
    python tools/gate/eye_gate.py shot --slug dualend-skeleton --build
    python tools/gate/eye_gate.py check game/data/evidence/dualend-skeleton/stamp.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "game"
EVIDENCE = ROOT / "game" / "data" / "evidence"
PORT = 4173
URL = f"http://127.0.0.1:{PORT}/"

# 四档视口对应 hud.responsive.css 的断点：手机小/手机标准/平板竖/桌面
VIEWPORTS = [
    ("375x667", 375, 667, True),
    ("667x375", 667, 375, True),  # 手机横屏：真正的主用形态
    ("390x844", 390, 844, True),
    ("768x1024", 768, 1024, True),
    ("1440x900", 1440, 900, False),
]

SOURCE_SUFFIXES = {".ts", ".css", ".html"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout.strip()


def changed_files() -> list[Path]:
    """取工作区里已改/已暂存/新增的前端源文件。

    不用 `git status --porcelain` 解析：它的首行在某些 git 版本里会丢掉状态列的前导空格
    （实测首行是 'M game/index.html' 而不是 ' M game/index.html'），
    按固定列位切会把路径切成 'ame/index.html'，于是改过的首页被静默漏掉。
    三查都走 --name-only，拿到的就是纯路径。
    """
    names: list[str] = []
    for cmd in (
        ("diff", "--name-only"),
        ("diff", "--cached", "--name-only"),
        ("ls-files", "--others", "--exclude-standard"),
    ):
        names.extend(l.strip() for l in git(*cmd).splitlines() if l.strip())

    files: list[Path] = []
    for p in dict.fromkeys(names):  # 去重且保序
        fp = ROOT / p
        if fp.is_file() and fp.suffix in SOURCE_SUFFIXES and p.startswith("game/"):
            files.append(fp)
    return files


def wait_port(deadline: float = 40.0) -> bool:
    end = time.time() + deadline
    while time.time() < end:
        try:
            with urllib.request.urlopen(URL, timeout=2) as r:
                if r.status < 500:
                    return True
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(0.4)
    return False


def is_blank(png: Path) -> tuple[bool, str]:
    """纯色截图＝这一跑没渲染，必须报出来（否则「零缺陷」是假的）。"""
    try:
        from PIL import Image
    except ImportError:
        return False, "PIL 缺失，未检测空白（本条未执行）"
    with Image.open(png) as im:
        colors = im.convert("RGB").getcolors(maxcolors=1 << 20)
    if colors is None:
        return False, "颜色过多，未判定"
    if len(colors) <= 2:
        return True, f"仅 {len(colors)} 色，疑未渲染"
    return False, f"{len(colors)} 色"


def launch_browser(pw):
    """优先用 Playwright 自带 Chromium；没下好就退回本机 Edge/Chrome。

    退回逻辑是必须的：装 Chromium 要 130MB 下载，而这台机器自带 Edge，
    门不该因为下载失败就变成「跳过」——跳过的门等于没有门。
    """
    errors = []
    for kwargs in (
        {"args": ["--force-device-scale-factor=1"]},
        {"channel": "msedge", "args": ["--force-device-scale-factor=1"]},
        {"channel": "chrome", "args": ["--force-device-scale-factor=1"]},
    ):
        try:
            return pw.chromium.launch(**kwargs), kwargs.get("channel", "bundled-chromium")
        except Exception as e:  # noqa: BLE001 - 逐个候选试，失败原因要留证
            errors.append(f"{kwargs.get('channel', 'bundled')}: {type(e).__name__}")
    raise RuntimeError("无可用浏览器：" + "; ".join(errors))


def cmd_shot(args: argparse.Namespace) -> int:
    slug = args.slug
    out_dir = EVIDENCE / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.build:
        print("[eye] vite build …")
        r = subprocess.run(["npx", "vite", "build"], cwd=GAME, capture_output=True, text=True)
        print(r.stdout.strip().splitlines()[-1] if r.stdout else "", r.stderr.strip()[:300])
        if r.returncode != 0:
            print("[eye] build 失败，门不执行 → NOT_ASSESSED")
            return 2

    server = None
    if args.url:
        url = args.url
    else:
        npx = "npx.cmd" if sys.platform == "win32" else "npx"
        log = out_dir / "preview.log"
        fh = open(log, "w", encoding="utf-8")
        server = subprocess.Popen(
            [npx, "vite", "preview", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
            cwd=GAME,
            stdout=fh,
            stderr=subprocess.STDOUT,
        )
        if not wait_port(60.0):
            tail = log.read_text(encoding="utf-8", errors="replace")[-400:] if log.exists() else ""
            print(f"[eye] preview 起不来 → 门未执行\n{tail}")
            if server:
                server.terminate()
            fh.close()
            return 2
        url = URL

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[eye] 缺 playwright：python -m pip install playwright && python -m playwright install chromium")
        if server:
            server.terminate()
        return 2

    results = []
    console_errors: list[str] = []
    browser_name = "?"
    try:
        with sync_playwright() as pw:
            browser, browser_name = launch_browser(pw)
            print(f"[eye] browser: {browser_name}")
            for i, (name, w, h, touch) in enumerate(VIEWPORTS, 1):
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=1,
                    is_mobile=touch,
                    has_touch=touch,
                )
                page = ctx.new_page()
                page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
                page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
                # 只记「哪条资源 404」：控制台只说 status 404，不说 URL，等于没报
                page.on(
                    "response",
                    lambda r: console_errors.append(f"http {r.status}: {r.url}") if r.status >= 400 else None,
                )
                page.goto(url, wait_until="load", timeout=30000)
                page.wait_for_selector("#game canvas", timeout=15000)
                page.wait_for_timeout(1200)  # 等首帧与 HUD 首渲染
                png = out_dir / f"{i:02d}-{name}.png"
                page.screenshot(path=str(png))
                blank, note = is_blank(png)
                results.append({"viewport": name, "png": png.name, "blank": blank, "note": note})
                print(f"[eye] {name:<10} {'空白!' if blank else 'ok':<6} {note}")
                ctx.close()
            browser.close()
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    files = [ROOT / f for f in args.files.split(",") if f.strip()] if args.files else changed_files()
    stamp = out_dir / "stamp.txt"
    lines = [f"{sha256(f)}  {f.relative_to(ROOT).as_posix()}" for f in files if f.is_file()]
    head = git("rev-parse", "HEAD")
    stamp.write_text("\n".join(lines + [f"# HEAD {head}", f"# slug {slug}"]) + "\n", encoding="utf-8")

    (out_dir / "run.json").write_text(
        json.dumps(
            {
                "slug": slug,
                "url": url,
                "browser": browser_name,
                "head": head,
                "stamped": [f.relative_to(ROOT).as_posix() for f in files if f.is_file()],
                "shots": results,
                "console_errors": console_errors[:20],
                "blank_shots": [r["viewport"] for r in results if r["blank"]],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    bad = [r["viewport"] for r in results if r["blank"]]
    print(f"[eye] 证据 {len(results)} 张 → {out_dir}")
    print(f"[eye] stamp {len(lines)} 条 → {stamp.name}")
    if console_errors:
        print(f"[eye] 控制台 error {len(console_errors)} 条（见 run.json）")
    if bad:
        print(f"[eye] 空白视口 {bad} → 整格 NOT_ASSESSED")
        return 3
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    stamp = Path(args.stamp)
    if not stamp.is_file():
        print("RECEIPT: NONE")
        return 2
    lines = [l for l in stamp.read_text(encoding="utf-8").splitlines() if l and not l.startswith("#")]
    changed, gone = [], []
    for line in lines:
        try:
            digest, rel = line.split("  ", 1)
        except ValueError:
            continue
        fp = ROOT / rel
        if not fp.is_file():
            gone.append(rel)
        elif sha256(fp) != digest:
            changed.append(rel)
    for rel in changed:
        print(f"CHANGED: {rel}")
    for rel in gone:
        print(f"GONE: {rel}")
    if not lines:
        print("RECEIPT: NONE")
        return 2
    if not changed and not gone:
        print(f"OK: {len(lines)} 个文件与截图一致")
        return 0
    print(f"STALE: {len(changed) + len(gone)}/{len(lines)} 个文件已和截图不一致 → NOT_ASSESSED")
    return 2


def main() -> int:
    ap = argparse.ArgumentParser(description="眼睛绿：截图 + 哈希戳 + 过期检测")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("shot", help="启动、四视口截图、生成 stamp")
    s.add_argument("--slug", required=True)
    s.add_argument("--url", default="", help="已有服务则直接给 URL，否则自己起 vite preview")
    s.add_argument("--build", action="store_true", help="先跑 vite build（对 dist 预览）")
    s.add_argument("--files", default="", help="逗号分隔的要盖戳文件；默认取 git 改动的前端源文件")
    s.set_defaults(fn=cmd_shot)

    c = sub.add_parser("check", help="检查 stamp 是否过期")
    c.add_argument("stamp")
    c.set_defaults(fn=cmd_check)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
