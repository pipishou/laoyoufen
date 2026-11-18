"""12 色板收口：把 ui/*.css 里的字面色值换成 var(--token)。

规则：
  - 12 个色相（palette.ts 同值）；表里没有的颜色按 RGB 最近邻归并，并打印映射，
    方便人工复核有没有归错相。
  - `:root` 块单独处理：整块换成新的 12 色板声明（旧变量名保留为别名），
    避免自己引用自己。
  - 只改 `#hex` 与 `#hex` 简写；`rgba(...)`、`transparent`、`inherit` 不动。
"""
import glob
import os
import re
import sys

PALETTE = {
    "ink": "#2f2118",
    "ink2": "#5a4632",
    "wood": "#8a6f52",
    "sand": "#c9b28f",
    "cream": "#e8dcc4",
    "paper2": "#fff8e6",
    "paper": "#fffdf6",
    "red": "#b5493a",
    "orange": "#d97b52",
    "green": "#2f7d4f",
    "gold": "#b8912f",
    "blue": "#4a6f8a",
}

ROOT = """/* 12 色板 —— 全站唯一的颜色来源（与 game/src/ui/palette.ts 同值）
 * 十二个色相，每相最多两阶；组件里不许再写字面色值，一律 var(--token)。 */
:root {
  --ink: #2f2118;
  --ink2: #5a4632;
  --wood: #8a6f52;
  --sand: #c9b28f;
  --cream: #e8dcc4;
  --paper2: #fff8e6;
  --paper: #fffdf6;
  --red: #b5493a;
  --orange: #d97b52;
  --green: #2f7d4f;
  --gold: #b8912f;
  --blue: #4a6f8a;

  /* 旧变量名保留成别名：老样式逐条指过来，不必改三百处引用 */
  --shadow: var(--sand);
  --brick: var(--red);
  --bamboo: var(--green);
  --mustard: var(--gold);
  --sky: var(--blue);
  --chili: var(--red);
  --sour: var(--green);
}"""

HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")


def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


PAL_RGB = {k: rgb(v) for k, v in PALETTE.items()}

# 显式指定：距离算法会把亮黄判给沙色，视觉上它们是金
EXACT_OVERRIDE = {
    "#ffc845": "gold",
    "#8a5a00": "gold",
    "#ffe9b8": "gold",
    "#ffe6b3": "gold",
    "#e2ecf7": "paper2",
}


def nearest(h: str) -> str:
    """按 RGB 距离找最近的色板 token（加权：人眼对绿更敏感，稍微降权）"""
    r, g, b = rgb(h)
    best, dist = "ink", 1e9
    for k, (pr, pg, pb) in PAL_RGB.items():
        d = (r - pr) ** 2 * 0.3 + (g - pg) ** 2 * 0.6 + (b - pb) ** 2 * 0.1
        if d < dist:
            best, dist = k, d
    return best


def main() -> int:
    exact = {}
    for path in sorted(glob.glob(os.path.join("src", "ui", "*.css"))):
        with open(path, encoding="utf-8") as f:
            text = f.read()

        root_block = ""
        m = re.search(r":root\s*\{[^}]*\}", text)
        if m:
            root_block = m.group(0)
            text = text[: m.start()] + "/*PALETTE_ROOT*/" + text[m.end() :]

        report: list[tuple[str, str]] = []

        def sub(mo: re.Match) -> str:
            raw = mo.group(0).lower()
            for k, v in PALETTE.items():
                if v == raw:
                    return f"var(--{k})"
            key = EXACT_OVERRIDE.get(raw) or nearest(raw)
            report.append((raw, key))
            exact[raw] = key
            return f"var(--{key})"

        new = HEX.sub(sub, text)
        if root_block:
            new = new.replace("/*PALETTE_ROOT*/", ROOT, 1)
        if new != text or not root_block:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
        print(f"{path}: {len(report)} 处归并")

    print("\n归并明细（原值 -> token）:")
    for k in sorted(exact):
        print(f"  {k} -> --{exact[k]}({PALETTE[exact[k]]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
