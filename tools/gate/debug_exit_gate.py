# -*- coding: utf-8 -*-
"""发布包调试出口门（批 AL′，抄 DSGS 的 `/share` 那条纪律：包里还留着调试面板就别发）。

查三样：
  1. 产物里挂了哪些 `window.__xxx` —— 只允许白名单（探针契约与存档出口，都是有意的）；
  2. `debugger` 语句；
  3. 指向本机的地址（`localhost` / `127.0.0.1`；`/laoyou-api/` 这种同源相对路径不算）。

用法（仓库任意位置）：
    python -X utf8 tools\\gate\\debug_exit_gate.py
    python -X utf8 tools\\gate\\debug_exit_gate.py --dist game/dist --json game/data/evidence/debug-exit/report.json
"""
import argparse
import io
import json
import os
import re
import sys

ALLOW = ("__laoyou", "__gameState", "__autoplay", "__probeReady")
WINDOW_RE = re.compile(r"window\.(__[A-Za-z0-9_]+)")
DEBUGGER_RE = re.compile(r"\bdebugger\b")
LOCAL_RE = re.compile(r"(?:https?://)?(?:localhost|127\.0\.0\.1)(?::\d+)?")


def scan_file(path):
    text = io.open(path, encoding="utf-8", errors="replace").read()
    names = sorted(set(WINDOW_RE.findall(text)))
    return {
        "file": os.path.basename(path),
        "bytes": len(text.encode("utf-8")),
        "window_exits": names,
        "debugger": len(DEBUGGER_RE.findall(text)),
        "localhost": sorted(set(LOCAL_RE.findall(text))),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=None, help="默认 <repo>/game/dist")
    ap.add_argument("--json", default=None, help="报告写到哪（默认不写）")
    ap.add_argument("--extra-allow", default="", help="额外允许的 window.__名字，逗号分隔")
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    dist = args.dist or os.path.join(repo, "game", "dist")
    assets = os.path.join(dist, "assets")
    if not os.path.isdir(assets):
        print("[debug-exit] 没有 %s —— 先 npm run -s build" % assets)
        return 2

    allow = set(ALLOW)
    for n in args.extra_allow.split(","):
        n = n.strip().lstrip("_")
        if n:
            allow.add("__" + n)

    rows = []
    for name in sorted(os.listdir(assets)):
        if name.endswith(".js"):
            rows.append(scan_file(os.path.join(assets, name)))

    unknown = []
    for r in rows:
        for n in r["window_exits"]:
            if n not in allow:
                unknown.append("%s 里有 window.%s" % (r["file"], n))
    debuggers = ["%s 里有 %d 处 debugger" % (r["file"], r["debugger"]) for r in rows if r["debugger"] > 0]
    locals_ = []
    for r in rows:
        for u in r["localhost"]:
            locals_.append("%s 里有本机地址 %s" % (r["file"], u))

    checks = {
        "dist_found": len(rows) > 0,
        "window_exits_known": len(unknown) == 0,
        "no_debugger": len(debuggers) == 0,
        "no_localhost": len(locals_) == 0,
    }

    print("[debug-exit] 扫了 %d 个 js（共 %d B）" % (len(rows), sum(r["bytes"] for r in rows)))
    exits = sorted({n for r in rows for n in r["window_exits"]})
    print("[debug-exit] 挂出来的 window 出口：%s" % ("、".join(exits) if exits else "（一个都没有）"))
    for line in unknown + debuggers + locals_:
        print("  ! " + line)
    for k, v in checks.items():
        print("  %-20s %s" % (k, "ok" if v else "FAIL"))

    if args.json:
        os.makedirs(os.path.dirname(args.json), exist_ok=True)
        io.open(args.json, "w", encoding="utf-8").write(
            json.dumps({"checks": checks, "files": rows, "problems": unknown + debuggers + locals_},
                       ensure_ascii=False, indent=1) + "\n"
        )
        print("[debug-exit] 报告 %s" % args.json)

    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
