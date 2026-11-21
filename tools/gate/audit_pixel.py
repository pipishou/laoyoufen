# -*- coding: utf-8 -*-
"""验收用：像素 UI 的四条硬不变量 + 布局证据。"""
import io
import os
import re
from pathlib import Path

ROOT = Path(r"D:\项目\REA\REA\重构\老友粉店")
UI = ROOT / "game" / "src" / "ui"
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")


def lit_hex(path):
    s = io.open(path, encoding="utf-8").read()
    # 去掉 /* :root ... */ 那一段后统计字面色值
    body = re.sub(r"(?s)/\*[^*]*12 色板.*?\*/", "", s)
    root = re.search(r"(?s):root\s*\{.*?\n\}", body)
    if root:
        body = body.replace(root.group(0), "")
    return HEX.findall(body)


print("== 1. 字面色值（应当只剩像素阴影 rgba/0）==")
total = 0
for f in sorted(os.listdir(UI)):
    if not f.endswith(".css"):
        continue
    hits = lit_hex(UI / f)
    if hits:
        total += len(hits)
        print("  %-22s %d %s" % (f, len(hits), sorted(set(hits))[:6]))
print("  合计", total)

pal = io.open(UI / "hud.css", encoding="utf-8").read()
root = re.search(r"(?s):root\s*\{(.*?)\n\}", pal)
print("\n== 2. 12 色板唯一真源 ==")
tokens = re.findall(r"--([a-z0-9\-]+):\s*#[0-9a-fA-F]{6}", root.group(1)) if root else []
print("  hud.css :root 色 token", len(tokens), tokens)

print("\n== 3. 图标图集 ==")
ic = io.open(UI / "icons.ts", encoding="utf-8").read()
names = re.findall(r'^\s*\|\s*"([a-z]+)"', ic, re.M)
print("  IconName 条目", len(names), names)
print("  <symbol", ic.count("<symbol"), " mountIcons", "mountIcons" in ic)

print("\n== 4. 像素字体与动效 ==")
px = io.open(UI / "pixel.css", encoding="utf-8").read()
print("  @font-face", "@font-face" in px, "| woff2 引用", "fusion-pixel" in px)
print("  image-rendering: pixelated", px.count("pixelated"))
css_all = "".join(io.open(UI / f, encoding="utf-8").read() for f in os.listdir(UI) if f.endswith(".css"))
print("  @keyframes 条数", len(re.findall(r"@keyframes\s+([a-zA-Z0-9_-]+)", css_all)))
print("  prefers-reduced-motion", css_all.count("prefers-reduced-motion"))
print("  steps( 硬切帧", css_all.count("steps("))

print("\n== 5. 面板与页签 ==")
pn = io.open(UI / "panels.ts", encoding="utf-8").read()
print("  sechd 段数", pn.count('class="sechd'), "| icon( 调用", pn.count("icon("))
print("  data-act 种类", len(set(re.findall(r'data-act="([a-z]+)"', pn))))
