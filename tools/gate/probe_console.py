"""探针共用：把「控制台干净」这一条从**字面过滤**改成**看来源**。

批 BB1′ 之前的三种写法都不对：

  ① `checks["console_clean"] = len(console) == 0`
     —— 预览服务（`vite preview`）里没有后端，前端那句 `GET /laoyou-api/...`
     必然 404，于是**每个探针都会红一条**。有的探针干脆整条不判，有的用
  ② `[e for e in errors if "404" not in e and "Failed to load resource" not in e]`
     —— 这会把「打包少了个 js / 图裂了」一起吞掉：那些也是 404，也是这句话。
  ③ 干脆不判。

这里改成看 `ConsoleMessage.location["url"]`：只有来源是 `/laoyou-api/` 的 404 才算噪声。
真少了资源（来源是本目录的 assets）照样红。

用法：

    from probe_console import on_console, noisy, texts

    errors: list = []
    page.on("console", on_console(errors))
    …
    checks["console_clean"] = not noisy(errors)
    print("CONSOLE:", texts(noisy(errors))[:5])
"""

from __future__ import annotations

import typing


def on_console(sink: list) -> typing.Callable:
    """`page.on("console", on_console(sink))` —— 只收 error 级，连来源一起记。"""

    def handle(m) -> None:  # noqa: ANN001 —— playwright 的 ConsoleMessage
        if m.type != "error":
            return
        loc = getattr(m, "location", None) or {}
        url = loc.get("url", "") if isinstance(loc, dict) else ""
        sink.append({"text": m.text, "url": url})

    return handle


def is_noise(entry) -> bool:  # noqa: ANN001
    """来源是 `/laoyou-api/` 的那条（预览里没有后端，必然 404）。"""
    if isinstance(entry, dict):
        return "laoyou-api" in entry.get("url", "")
    # 老写法只存了字符串，认不出来源 —— 当成真错误，不放过
    return False


def noisy(entries: list) -> list:
    """真正的问题（已剔掉 `/laoyou-api/` 的 404）。"""
    return [e for e in entries if not is_noise(e)]


def texts(entries: list) -> list:
    """打日志用：把 entry 还原成字符串。"""
    return [e.get("text", "") if isinstance(e, dict) else str(e) for e in entries]
