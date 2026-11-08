"""共享工具：定位项目根、解析 DeepSeek key、JSONL 读写。

key 解析链（只报来源，不打印值）：
  1. env DEEPSEEK_API_KEY
  2. <project>/game/.env.local 或 <project>/.env.local
  3. ~/.dsh/.credentials.yaml 的 DEEPSEEK_API_KEY
"""
from __future__ import annotations

import io
import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REVIEW_DIR = PROJECT_ROOT / "game" / "data" / "review"


def _from_env_files() -> str:
    for p in (PROJECT_ROOT / "game" / ".env.local", PROJECT_ROOT / ".env.local"):
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _from_dsh_credentials() -> str:
    p = Path(os.path.expanduser("~")) / ".dsh" / ".credentials.yaml"
    if not p.exists():
        return ""
    for line in p.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("DEEPSEEK_API_KEY:"):
            return s.split(":", 1)[1].strip().strip('"').strip("'")
    return ""


def resolve_key() -> tuple[str, str]:
    """返回 (key, 来源)。只暴露来源名。"""
    k = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if k:
        return k, "env"
    k = _from_env_files()
    if k:
        return k, ".env.local"
    k = _from_dsh_credentials()
    if k:
        return k, "~/.dsh/.credentials.yaml"
    return "", "none"


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    with io.open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def append_jsonl(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with io.open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
