# 老友粉游戏迁移开发评估（主窗）

- Session: `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc`
- 更新: 2026-11-27 17:56
- 状态: 已停手，等老板选下一批

## 我现在在做什么

没在写代码。刚收完 BE′（`docs/一步换掉BE′-2026-11-27.md`），并行开发的评估也落成文档了（`docs/决策地图-要不要开并行任务窗-2026-11-27.md`），现在等老板选：A 开只读调研窗 / B 先补 P518 拆 `panels.ts` / C 先补 P520 探针端口。

## 我写到了哪

- 改了：`.junshi/handoff/README.md`、`.junshi/handoff/TEMPLATE.md`（本次新建）
- git：`?? .junshi/handoff/` —— 未 commit
- HEAD: `f9909c5 docs: decide against parallel write windows for now - with the measured numbers (P518-P520)`；`## main...origin/main`（已 push、已部署）
- 线上：`index-BEwYZt6y.js` 1,764,885 B

## 我需要你给什么

- 你先照 `TEMPLATE.md` 写 `.junshi/handoff/<你的窗名>.md`，把 Session id 和「我不碰什么」写清。
- 如果你的窗要跑 `npm run -s probe:standin`（约 576 秒，单核拉满）或 `playthrough_gate`，先来看我这个文件有没有在跑 —— **这两个不能同时跑**（长跑门首跑会 `fps_min 29.0` 假红，AGENTS.md 二·五 有记）。

## 我不碰什么

- 这段时间我不动：`game/src/**`、`docs/ACCEPTANCE.md`、`.junshi/ledger.md`、`game/data/evidence/*`、`deploy/`
- 你可以放心改：`docs/` 下新建文件（不要改 `docs/ACCEPTANCE.md`）

## 留给下一个窗的坑

- 探针必须在**仓库根**跑，`OUT` 是相对路径 `game/data/evidence/<slug>`
- 改了面板文案**必须先 `npm run -s build` 再跑探针**，否则探针会在旧 dist 上给出假红（BE′ 踩过：`bb_probe` 两条红其实是缓存键漏字段，不是模拟错）
- `eye_gate` 会清空 `game/data/evidence/<slug>`，跑完必须重跑本批探针补截图
- `npx vitest run` 必须带 `--no-file-parallelism`，否则假红
- 含中文的 `.md` / `.ts` 只用 `write` / `edit` 或 python 脚本（首行 `# -*- coding: utf-8 -*-`、`io.open(..., newline="\n")`）改；禁止 `Get-Content | Set-Content` 管道
