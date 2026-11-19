"""本土化门：玩家能看到的文案里，不许出现别的作品的名字。

判定规则（可机检，不靠人眼）：
1. `game/src/ui/*.ts` 全文扫（真正渲染文案的地方，含 `title="…"`）；
2. `game/src/data/*.ts` 与 `game/src/sim/*.ts` 也扫 —— 玩家看到的字大多来自这里
   （`name` / `line` / `note` / `hint` / `pitch` / `request` / `effect`），
   ui 层只是把字段贴上去，光扫 ui 会漏（试玩二轮 F6 就是栽在这上面：
   `sim/achievements.ts` 的 `hint` 写着「开罗 trophy：…」，被 hud 贴进 `title` 属性）；
3. 两条都先剥注释（`//` 行与 `/* */` 块）—— 注释里写「对齐开罗哪一句」是取证依据，允许保留；
4. ui 层再剥掉 `devNote(...)` —— 那是 `?dev=1` 才显示的开发者注记；
5. **`kairo:` 字段整行豁免** —— 那是给开发看的取证引用（原文照抄开罗那句描述），
   从来不渲染；除此之外任何一行命中都算越界。

用法：
    python tools/gate/copy_gate.py          # 只报，退出码 0/1
    python tools/gate/copy_gate.py -v       # 连允许的注释命中一起列出来
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "game" / "src"
UI_DIR = SRC / "ui"
DATA_DIRS = [SRC / "data", SRC / "sim"]

# 别的作品的名字。大小写不敏感。
BANNED = re.compile(
    r"ramen|ラーメン|kairosoft|kairo|开罗|spirit\s*point|rank\s*bonus|charisma",
    re.IGNORECASE,
)

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
DEV_NOTE = re.compile(r"devNote\([^()]*\)")
# 取证引用字段：整行豁免（`kairo: "…"` / `kairo?: "…"`）
DEV_FIELD = re.compile(r"^\s*kairo\??\s*:")
# 只认字符串字面量：`RAMEN_CALC` / `KAIRO_REF` 这类**标识符**不算文案，
# 玩家看到的是引号里那几个字。
STRING_LIT = re.compile(r'"([^"\\]|\\.)*"|\'([^\'\\]|\\.)*\'|`[^`]*`')
# 测试与探针不进包，玩家永远看不到
SKIP_SUFFIX = (".test.ts", ".probe.ts")
# import / export 行里的字符串是模块路径
MODULE_LINE = re.compile(r"^\s*(import|export)\b")


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
    ui_files = sorted(p for p in UI_DIR.glob("*.ts") if not p.name.endswith(SKIP_SUFFIX))
    if not ui_files:
        print(f"[copy-gate] 没找到 ui 文件：{UI_DIR}")
        return 1
    data_files = sorted(
        p
        for d in DATA_DIRS
        if d.is_dir()
        for p in d.glob("*.ts")
        if not p.name.endswith(SKIP_SUFFIX)
    )

    hits: list[tuple[str, int, str]] = []
    allowed: list[tuple[str, int, str]] = []

    def strings_in(line: str) -> str:
        """把一行里所有字符串字面量拼起来；没有字符串就是空串"""
        out = []
        for m in STRING_LIT.finditer(line):
            out.append(m.group(0))
        return " ".join(out)

    # ① ui 层：渲染串 + title="…"，剥注释与 devNote
    for path in ui_files:
        raw = path.read_text(encoding="utf-8")
        if verbose:
            for n, line in enumerate(raw.splitlines(), 1):
                if BANNED.search(line):
                    allowed.append((path.name, n, line.strip()))
        code = DEV_NOTE.sub("", strip_comments(raw))
        for n, line in enumerate(code.splitlines(), 1):
            text = strings_in(line)
            if text and BANNED.search(text):
                hits.append((path.name, n, line.strip()))

    # ③ data / sim 层：字段里的字会被贴到界面上，`kairo:` 整行豁免
    for path in data_files:
        raw = path.read_text(encoding="utf-8")
        code = strip_comments(raw)
        for n, line in enumerate(code.splitlines(), 1):
            # import / export 里的字符串是模块路径，不是文案
            if MODULE_LINE.match(line):
                continue
            text = strings_in(line)
            if not text or not BANNED.search(text):
                continue
            if DEV_FIELD.match(line):
                if verbose:
                    allowed.append((path.name, n, line.strip()))
                continue
            hits.append((f"{path.parent.name}/{path.name}", n, line.strip()))

    if verbose:
        print(f"[copy-gate] 注释/取证引用里的命中（允许）：{len(allowed)} 处")
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
