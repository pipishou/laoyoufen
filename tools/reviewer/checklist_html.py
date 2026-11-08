"""人审清单的可点击版：单文件 HTML，零依赖、零联网。

产出物不是「另一份清单」，而是同一份队列的第二种渲染：
  · 点按钮勾选（pass/revise/reject），可填一句理由，状态存 localStorage，刷新不丢
  · 底部实时生成回填命令，一键复制粘回终端
  · 视觉沿用项目美术规范：暖纸底 #fff8e6、3px 描边 #3b2b1d、三色阶硬阴影（不做圆角渐变）

用法（一般由 human_review.py export 调用）：
  from checklist_html import render
  html = render(queue)
"""
from __future__ import annotations

import html as _html
import json

PAPER = "#fff8e6"
INK = "#3b2b1d"
ACCENT = "#c2410c"
OK = "#2f7d32"
WARN = "#b45309"
BAD = "#a1201d"


def _esc(s) -> str:
    return _html.escape("" if s is None else str(s))


def _card(i: int, q: dict) -> str:
    snap = q.get("snapshot") or {}
    judges = q.get("judges", [])
    scored = {j["judge"]: j["score"] for j in judges if isinstance(j.get("score"), (int, float))}
    kind = "风险闸" if q.get("score") is None else "判据打架"
    badge = BAD if kind == "风险闸" else WARN
    s_txt = "闸" if q.get("score") is None else q["score"]
    chips = "".join(
        f'<span class="chip{" na" if j.get("score") is None else ""}">{_esc(j["judge"])}'
        f'{"" if j.get("score") is None else " " + _esc(j["score"])}</span>'
        for j in judges
    )
    chos = "".join(
        f'<li><b>{_esc(c.get("label"))}</b>｜<span class="dim">{_esc(c.get("summary"))}</span>'
        f' → {_esc(c.get("result"))}</li>'
        for c in (snap.get("choices") or [])
    )
    sjud = [j for j in judges if isinstance(j.get("score"), (int, float))]
    lo = min(sjud, key=lambda j: j["score"]) if sjud else None
    hi = max(sjud, key=lambda j: j["score"]) if sjud else None
    gate = next((j for j in judges if j["judge"] == "J5"), None)
    if q.get("score") is None:
        focus = f'<div class="focus"><b>只判一件事</b>：合规风险能不能接受。J5 原话：{_esc((gate or {}).get("reason"))}</div>'
    else:
        focus = ""
    vote_note = next(
        (ln for ln in (q.get("arbiter_note") or "").split("；") if ln.startswith("投票")), ""
    )
    votes = (
        f'<div class="votes">跨 run 投票：{_esc(vote_note)}'
        f'<span class="dim"> · 票数越散，越说明这条卡在判据边界上</span></div>'
        if vote_note
        else ""
    )
    return f"""
<section class="card" data-id="{_esc(q['candidate_id'])}">
  <div class="chead">
    <span class="idx">{i:02d}</span>
    <code class="cid">{_esc(q['candidate_id'])}</code>
    <span class="kind" style="background:{badge}">{kind}</span>
    <span class="s">S={_esc(s_txt)}</span>
    <span class="chips">{chips}</span>
  </div>
  {votes}
  <h3>{_esc(snap.get('title'))}</h3>
  <p class="body">{_esc(snap.get('body'))}</p>
  <ul class="chos">{chos}</ul>
  {focus}
  <div class="reasons">
    {f'<p><b class="low">最低分</b> {_esc(lo["judge"])} {_esc(lo.get("name"))} {_esc(lo["score"])} —— {_esc(lo.get("reason"))}</p>' if lo else ''}
    {f'<p><b class="high">最高分</b> {_esc(hi["judge"])} {_esc(hi.get("name"))} {_esc(hi["score"])} —— {_esc(hi.get("reason"))}</p>' if hi and hi is not lo else ''}
  </div>
  <div class="vote">
    <button data-v="pass" class="b-pass">✅ 通过（AI 判错了）</button>
    <button data-v="revise" class="b-revise">✏️ 改词后通过</button>
    <button data-v="reject" class="b-reject">❌ 否决（AI 判对了）</button>
  </div>
  <input class="note" placeholder="理由（revise / reject 必填）">
</section>"""


def render(queue: list[dict], run: str = "", title: str = "人审清单") -> str:
    cards = "".join(_card(i, q) for i, q in enumerate(queue, 1))
    ids = [q["candidate_id"] for q in queue]
    gate_n = sum(1 for q in queue if q.get("score") is None)
    data = json.dumps({"run": run, "ids": ids}, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_esc(title)} · {_esc(run)}</title>
<style>
:root{{--paper:{PAPER};--ink:{INK};--accent:{ACCENT};--ok:{OK};--warn:{WARN};--bad:{BAD}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);
 font:15px/1.65 "Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif}}
header{{position:sticky;top:0;z-index:9;background:var(--paper);
 border-bottom:3px solid var(--ink);padding:12px 18px}}
h1{{font-size:19px;margin:0 0 4px}}
.meta{{font-size:13px;color:#6b5545}}
.bar{{height:10px;border:3px solid var(--ink);margin-top:8px;background:#efe3c8}}
.bar>i{{display:block;height:100%;width:0;background:var(--ok);transition:width .2s}}
.wrap{{max-width:1080px;margin:0 auto;padding:18px}}
.card{{background:#fffdf5;border:3px solid var(--ink);box-shadow:4px 4px 0 var(--ink);
 margin:0 0 18px;padding:14px 16px}}
.card.done{{box-shadow:4px 4px 0 var(--ok);border-color:var(--ok)}}
.chead{{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px}}
.idx{{font-weight:700;background:var(--ink);color:var(--paper);padding:1px 7px}}
.cid{{background:#f2e6c9;padding:1px 6px;border:1px solid var(--ink)}}
.kind{{color:#fff;padding:1px 7px;font-weight:700}}
.s{{font-weight:700}}
.chips{{display:flex;gap:4px;margin-left:auto}}
.chip{{border:2px solid var(--ink);padding:0 5px;font-size:11px;background:#fff}}
.chip.na{{border-style:dashed;color:#8a7563}}
h3{{font-size:17px;margin:10px 0 4px}}
.body{{margin:0 0 8px}}
.chos{{margin:0 0 10px;padding-left:20px}}
.chos li{{margin:3px 0}}
.dim{{color:#7a6353}}
.focus{{border-left:6px solid var(--bad);background:#fdeee7;padding:8px 10px;margin:0 0 10px;font-size:14px}}
.votes{{border-left:6px solid var(--ink);background:#f2ecdc;padding:6px 10px;margin:0 0 10px;font-size:13px}}
.reasons{{border-top:2px dashed #d9c9a9;padding-top:8px;font-size:13px}}
.reasons p{{margin:4px 0}}
.low{{color:var(--bad)}} .high{{color:var(--ok)}}
.vote{{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 8px}}
button{{font:inherit;font-size:14px;cursor:pointer;border:3px solid var(--ink);
 background:#fff;padding:6px 12px;box-shadow:3px 3px 0 var(--ink)}}
button:active{{transform:translate(3px,3px);box-shadow:none}}
button.on{{color:#fff}}
.b-pass.on{{background:var(--ok)}} .b-revise.on{{background:var(--warn)}} .b-reject.on{{background:var(--bad)}}
.note{{width:100%;font:inherit;font-size:14px;padding:6px 8px;border:3px solid var(--ink);background:#fff}}
footer{{max-width:1080px;margin:0 auto;padding:0 18px 60px}}
pre{{background:#2b2018;color:#f4e9d4;padding:12px;overflow:auto;font-size:12.5px;
 border:3px solid var(--ink);white-space:pre-wrap;word-break:break-all}}
.copy{{margin:8px 0 0}}
.small{{font-size:12.5px;color:#6b5545}}
</style></head>
<body>
<header>
  <h1>{_esc(title)} · {_esc(run)}</h1>
  <div class="meta">共 <b id="n-total">{len(queue)}</b> 条｜其中风险闸 {gate_n} 条（AI 不敢评分，直接上交）｜
    已勾 <b id="n-done">0</b> 条</div>
  <div class="bar"><i id="pbar"></i></div>
</header>
<div class="wrap">
  <p class="small">点按钮即勾选，填一句理由；勾选状态只存在本机浏览器（localStorage），关闭不丢。
  勾完复制页面底部的命令粘回终端回填——不复制也行，状态在本地只是草稿，只有 <code>apply</code> 才进飞轮。</p>
{cards}
</div>
<footer>
  <h3 style="margin:18px 0 6px">回填命令（实时生成）</h3>
  <pre id="cmds"></pre>
  <button class="copy" id="btn-copy">复制命令</button>
  <p class="small">未勾的条目不会出现在命令里。全部勾完再复制，一次粘完。</p>
</footer>
<script>
const DATA = {data};
const KEY = "laoyoufen.humanreview." + DATA.run;
const state = JSON.parse(localStorage.getItem(KEY) || "{{}}");
const cards = [...document.querySelectorAll(".card")];
function save(){{ localStorage.setItem(KEY, JSON.stringify(state)); }}
function paint() {{
  let done = 0, lines = ["#!/usr/bin/env bash", "# 人审回填 " + DATA.run];
  for (const c of cards) {{
    const id = c.dataset.id, st = state[id] || {{}};
    c.querySelectorAll(".vote button").forEach(b => b.classList.toggle("on", b.dataset.v === st.v));
    const note = c.querySelector(".note");
    if (st.note !== undefined && note.value !== st.note) note.value = st.note;
    c.classList.toggle("done", !!st.v);
    if (st.v) {{
      done++;
      const n = (st.note || "").replace(/"/g, '\\\\"');
      lines.push(`python tools/reviewer/human_review.py apply --id ${{id}} --verdict ${{st.v}} --note "${{n}}"`);
    }}
  }}
  document.getElementById("n-done").textContent = done;
  document.getElementById("pbar").style.width = (done / cards.length * 100) + "%";
  document.getElementById("cmds").textContent = lines.length > 2 ? lines.join("\\n")
    : "# 还没勾任何一条";
}}
cards.forEach(c => {{
  c.querySelectorAll(".vote button").forEach(b => {{
    b.addEventListener("click", () => {{
      const id = c.dataset.id;
      state[id] = state[id] || {{}};
      state[id].v = (state[id].v === b.dataset.v) ? undefined : b.dataset.v;
      if (!state[id].v) delete state[id].v;
      save(); paint();
    }});
  }});
  c.querySelector(".note").addEventListener("input", e => {{
    const id = c.dataset.id;
    state[id] = state[id] || {{}};
    state[id].note = e.target.value;
    save(); paint();
  }});
}});
document.getElementById("btn-copy").addEventListener("click", async () => {{
  try {{ await navigator.clipboard.writeText(document.getElementById("cmds").textContent); 
        document.getElementById("btn-copy").textContent = "已复制"; }}
  catch (e) {{ document.getElementById("btn-copy").textContent = "请手动选中复制"; }}
}});
paint();
</script>
</body></html>"""
