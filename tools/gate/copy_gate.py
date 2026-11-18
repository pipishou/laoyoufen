"""本土化门：玩家能看到的文案里，不许出现别的作品的名字。

判定规则（可机检，不靠人眼）：
1. 只看 `game/src/ui/*.ts`（真正渲染文案的地方）；
2. 先剥掉注释（`//` 行与 `/* */` 块）—— 注释里写「对齐开罗哪一句」是取证依据，允许保留；
3. 再剥掉 `devNote(...)` —— 那是 `?dev=1` 才显示的开发者注记；
4. 剩下的代码里只要出现 Ramen / 开罗 / Kairo / Kairosoft，就算越界。

用法：
    python tools/gate/copy_gate.py          # 只报，退出码 0/1
    python tools/gate/copy_gate.py -v       # 连允许的注释命中一起列出来
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI_DIR = ROOT / "game" / "src" / "ui"

# 别的作品的名字。大小写不敏感。
BANNED = re.compile(
    r"ramen|ラーメン|kairosoft|kairo|开罗|spirit\s*point|rank\s*bonus|charisma",
    re.IGNORECASE,
)

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
DEV_NOTE = re.compile(r"devNote\([^()]*\)")


def strip_comments(src: str) -> str:
    src = BLOCK_COMMENT.sub("", src)
    out = []
    for line in src.splitlines():
        # 行内注释：只在引号外才算注释（这里文案里没有 `//`，够用且不误杀 URL）
        idx = line.find("//")
        if idx >= 0 and line.count('"', 0, idx) % 2 == 0 and line.count("'", 0, idx) % 2 == 0:
            line = line[:idx]
        out.append(line)
    return "\n".join(out)


def main() -> int:
    verbose = "-v" in sys.argv
    files = sorted(UI_DIR.glob("*.ts"))
    if not files:
        print(f"[copy-gate] 没找到 ui 文件：{UI_DIR}")
        return 1

    hits: list[tuple[str, int, str]] = []
    allowed: list[tuple[str, int, str]] = []
    for path in files:
        raw = path.read_text(encoding="utf-8")
        if verbose:
            for n, line in enumerate(raw.splitlines(), 1):
                if BANNED.search(line):
                    allowed.append((path.name, n, line.strip()))
        code = DEV_NOTE.sub("", strip_comments(raw))
        for n, line in enumerate(code.splitlines(), 1):
            if BANNED.search(line):
                hits.append((path.name, n, line.strip()))

    if verbose:
        print(f"[copy-gate] 注释/开发注记里的命中（允许）：{len(allowed)} 处")
        for name, n, line in allowed:
            print(f"  ~ {name}:{n}  {line[:96]}")

    if hits:
        print(f"[copy-gate] 渲染文案越界 {len(hits)} 处：")
        for name, n, line in hits:
            print(f"  ✗ {name}:{n}  {line[:110]}")
        return 1

    print("[copy-gate] ok —— 玩家可见文案 0 处别的作品名")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
