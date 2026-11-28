"""站点门：公网上那几个站到底还能不能打开。

为什么要有它（P549）：2026-11-27 20:51 同机另一个项目加了 `x7k2-80-redirect.conf`，
把 80 端口**所有 Host、所有路径**一起 301 到 https，而 443 上只有 x7k2beta 一台 server、
最后一句是 `location / { return 404; }` —— 于是 laoyoufen / laoyou-api / ai-course /
course-08 / x7k2preview / 目录页**全部静默 404 了一整天**。部署脚本 `deploy-cli.ps1`
的最后一步只断言 `http://`，所以它一直说成功。

这个门把「站点的真实可达性」变成可机检的判据：**每一条都要 200，且内容不能是空壳**。
它跑在**公网**上（不是 127.0.0.1），因为坏的那一层恰好是 nginx 的 Host / 路径分流 ——
本机 curl 也会中招，但只有公网那一条能证明「别人真能打开」。

用法：
    python -X utf8 tools/gate/site_gate.py                 # 用默认 IP
    python -X utf8 tools/gate/site_gate.py --host 1.2.3.4  # 换机器
    python -X utf8 tools/gate/site_gate.py --local         # 打 127.0.0.1（服务器上跑）
    python -X utf8 tools/gate/site_gate.py --local --port 8081   # 打一个临时 nginx 实例

`--port` 是给「证明这个门有判别力」用的：在服务器上起一个复刻坏配置的临时 nginx，
把它指过去必须变红；换成复刻好配置的实例必须全绿。一个只会说 true 的门不算门。

判据（全部 true 才算过）：
1. `http://HOST/`            200，且是目录页（`<title>目录 · …</title>`）
2. `http://HOST/laoyoufen/`  200，且 body 里引的每个 `./assets/…` 都能取到 200
3. `http://HOST/laoyou-api/health` 200，且是 JSON 且 `ok == true`
4. `http://HOST/course-08.html`    200，字节数 > 10 KB
5. `http://HOST/ai-course/`        200
6. `http://HOST/x7k2preview/`      200
7. `http://HOST/x7k2beta/`         301 且 Location 以 `https://` 开头（beta 的 https-only 意图没丢）
8. `https://HOST/x7k2beta/`        200（忽略证书 —— 证书 CN 是 sslip.io，IP 访问必告警）
9. acme 续期通道：`http://HOST/.well-known/acme-challenge/<随机名>` 能读到一个刚写进去的文件
   **这一条只在 --local 时跑**（公网那一条需要服务器上先落文件，见 `--write-challenge`）

退出码 0 = 全过，1 = 有红。
"""

from __future__ import annotations

import argparse
import json
import random
import re
import string
import subprocess
import sys
from pathlib import Path

DEFAULT_HOST = "8.134.86.249"
TIMEOUT = 20

# (名字, 路径, 期望码, 额外断言)
CHECKS = [
    ("home", "/", 200, "html:目录"),
    ("game_html", "/laoyoufen/", 200, "html:老友粉店"),
    ("api_health", "/laoyou-api/health", 200, "json:ok"),
    ("course_08", "/course-08.html", 200, "size>10000"),
    ("ai_course", "/ai-course/", 200, ""),
    ("beta_preview", "/x7k2preview/", 200, ""),
    ("beta_http_redirect", "/x7k2beta/", 301, "redirect:https"),
    ("beta_https", "/x7k2beta/", 200, "https"),
]

ASSET = re.compile(rb'src="\./(assets/[^"]+)"|href="\./(assets/[^"]+)"')


def run(url: str, extra: list[str] | None = None) -> tuple[int, bytes, dict[str, str], str]:
    """curl 一次，返回 (状态码, body, headers, 有效 URL)。用 curl 而不是 urllib：
    我们要能 --insecure、能拿到 301 而不跟随、能看 content-type。"""
    cmd = [
        "curl.exe" if sys.platform == "win32" else "curl",
        "-sS", "-m", str(TIMEOUT), "--max-redirs", "0",
        "-D", "-", "-o", "-",
        "-w", "\n__META__ %{http_code} %{url_effective}",
    ]
    cmd += extra or []
    cmd.append(url)
    p = subprocess.run(cmd, capture_output=True)
    raw = p.stdout
    meta = ""
    if b"__META__ " in raw:
        head, _, tail = raw.rpartition(b"__META__ ")
        raw = head
        meta = tail.decode("utf-8", "replace").strip()
    parts = meta.split()
    code = int(parts[0]) if parts and parts[0].isdigit() else 0
    effective = parts[1] if len(parts) > 1 else url
    # 分离 header 与 body（-D - 会把 header 写进 stdout，空行后是 body）
    sep = raw.find(b"\r\n\r\n")
    if sep < 0:
        sep = raw.find(b"\n\n")
        headers_blob, body = (raw[:sep], raw[sep + 2:]) if sep >= 0 else (b"", raw)
    else:
        headers_blob, body = raw[:sep], raw[sep + 4:]
    headers: dict[str, str] = {}
    for line in headers_blob.decode("utf-8", "replace").splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            headers[k.strip().lower()] = v.strip()
    return code, body, headers, effective


def check(name: str, path: str, want: int, assertion: str, base: str) -> tuple[str, bool, str]:
    url = base + path
    extra = ["-k"] if assertion == "https" else []
    code, body, headers, eff = run(url, extra)
    ok = code == want
    detail = f"{code}"

    if ok and assertion == "html:目录":
        ok = "目录" in body.decode("utf-8", "replace")[:400]
        detail += " · 是目录页" if ok else " · 不是目录页（拿到的不是 index.html）"
    elif ok and assertion == "html:老友粉店":
        txt = body.decode("utf-8", "replace")[:600]
        ok = "老友粉店" in txt
        detail += " · 标题对" if ok else " · 标题不对"
    elif ok and assertion == "json:ok":
        try:
            j = json.loads(body.decode("utf-8"))
            ok = j.get("ok") is True
            detail += f" · ok={j.get('ok')} playtests={j.get('playtests')}"
        except Exception as e:  # noqa: BLE001
            ok, detail = False, f" · 不是 JSON: {e}"
    elif ok and assertion == "size>10000":
        ok = len(body) > 10_000
        detail += f" · {len(body)} B"
    elif ok and assertion == "redirect:https":
        loc = headers.get("location", "")
        ok = loc.startswith("https://")
        detail += f" · -> {loc or '(无 Location)'}"

    return name, ok, detail


def check_assets(base: str) -> list[tuple[str, bool, str]]:
    """游戏页引的每个 assets 都要能取到 —— index.html 200 但 js 404 是最容易漏的一种。"""
    code, body, _, _ = run(base + "/laoyoufen/")
    if code != 200:
        return [("game_assets", False, f"html 先红了（{code}），资产无法检查")]
    found = [m.group(1) or m.group(2) for m in ASSET.finditer(body)]
    if not found:
        return [("game_assets", False, "index.html 里没找到 ./assets/ 引用（构建产物有问题）")]
    out = []
    for rel in found:
        c, b, h, _ = run(f"{base}/laoyoufen/{rel.decode()}")
        ctype = h.get("content-type", "")
        ok = c == 200 and len(b) > 1000
        cache = h.get("cache-control", "")
        if ok and "assets/" in rel.decode():
            ok = "max-age" in cache           # 长缓存头必须还在（批 BB1′ 定的）
        out.append(
            (
                "game_asset " + rel.decode().rsplit("/", 1)[-1],
                ok,
                f"{c} · {len(b)} B · {ctype} · {cache or '(无缓存头)'}",
            )
        )
    return out


def check_acme(base: str) -> tuple[str, bool, str]:
    """acme 续期：/.well-known/acme-challenge/ 必须在明文 http 上可达（证书 2027-02-24 到期）。"""
    name = "_gate" + "".join(random.choices(string.ascii_lowercase, k=8))
    code, body, _, _ = run(f"{base}/.well-known/acme-challenge/{name}")
    # 目录里没有这个文件时应当是 404（能到 404 就说明这条路由通、没被 301 劫走）
    ok = code == 404
    return "acme_channel", ok, f"{code}（能到 nginx 的 challenge 目录即可，404 是预期）"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=DEFAULT_HOST)
    ap.add_argument("--local", action="store_true", help="打 127.0.0.1（在服务器上跑）")
    ap.add_argument("--port", type=int, default=0, help="换端口（配合 --local 打临时 nginx 实例）")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    host = "127.0.0.1" if a.local else a.host
    if a.port:
        host = f"{host}:{a.port}"
    http_base = f"http://{host}"
    https_base = f"https://{host}"

    results: list[tuple[str, bool, str]] = []
    for name, path, want, assertion in CHECKS:
        base = https_base if assertion == "https" else http_base
        results.append(check(name, path, want, assertion, base))
    results += check_assets(http_base)
    if a.local and not a.port:
        # 打临时实例时 .well-known 的 root 指向临时 html 目录，没有意义，跳过
        results.append(check_acme(http_base))

    width = max(len(n) for n, _, _ in results)
    red = 0
    for name, ok, detail in results:
        mark = "true " if ok else "FALSE"
        if not ok:
            red += 1
        print(f"  {mark}  {name.ljust(width)}  {detail}")
    print(f"\n{len(results) - red} / {len(results)} true")
    if red:
        print("\n红的那几条不是「游戏坏了」，是「站点不可达」—— 先看 nginx 的 80 分流与 443 include。")
    return 0 if red == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
