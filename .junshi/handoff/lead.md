# 老友粉游戏迁移开发评估（主窗）

- Session: `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc`
- 更新: 2026-11-27 21:25
- 状态: 已停手，等老板决定要不要开副窗

## 我现在在做什么

没在写代码。做完两件事：

1. **BE′ 已上线**（`docs/一步换掉BE′-2026-11-27.md`，commit `cd119c7`，线上 `index-BEwYZt6y.js` 1,764,885 B）。
2. **并行开发怎么分工**：今天把每一步耗时全部实测了一遍，结论落成
   [`docs/两窗口怎么分工-2026-11-27.md`](../docs/两窗口怎么分工-2026-11-27.md)。

一句话结论：**主窗写代码，副窗吃等待** —— 副窗做「读 / 跑 / 验 / 查」四件事，一个字节都不许落进 `game/src/**`。

## 今天的实测数字（别再猜了）

| 步骤 | 耗时 |
| --- | --- |
| `npx tsc --noEmit` | 2.0 s |
| 全量 `vitest --no-file-parallelism` | 68.1 s |
| `npm run -s build` | 1.7 s |
| 单个探针 | 8.4 s（两个并发 12.1 s，不打架） |
| `eye_gate shot` | 15.0 s |
| `framediff_probe` | 16.9 s |
| `ai_gate` | 46.7 s |
| **`probe:standin`（四种子）** | **257.8 s**（先前记的 576 s 是旧机器状态，作废） |
| **`playthrough_gate --minutes 5`** | **305.6 s** |

并发压测（替身 + 全量 vitest 同跑）：替身 268.6 s（+4.2%）、vitest 86.0 s（+26.3%）、最低空闲内存 **977 MB**（未换页）。
**能同跑**；但**替身 + 长跑门不能同跑**（BD′ 实测 `fps_min 29.0`，门槛 30）。

机器：8 核 / 16 线程，15.4 GB 总内存但只有 **1.67 GB 空闲**，node 进程 18 个占 1,411 MB，两个 DSH 实例占 2.3 GB。

## 我写到了哪

- 新建：`docs/两窗口怎么分工-2026-11-27.md`
- 改了：`docs/ACCEPTANCE.md`（新增「五·二十六」P524–P527，**282 → 292 行**）、本文件
- git：以上均**未 commit**
- HEAD: `121c6e1 docs: how two dsh windows can actually coordinate, plus the handoff convention (P521-P523)`
- 线上：`index-BEwYZt6y.js` 1,764,885 B ＝本地 dist

## 我需要你给什么

如果你开副窗，**从手册第六节的三个模板里挑一个整段粘过去**（A 只读取证 / B 验证 / C worktree 独立写）。三个模板都写好了，不用你自己想 prompt。

开之前先照 `TEMPLATE.md` 写 `.junshi/handoff/<你的窗名>.md`，把 Session id 和「我不碰什么」写清。

## 我不碰什么（这段时间）

- `game/src/**`、`tools/gate/**`、`docs/ACCEPTANCE.md`、`.junshi/ledger.md`、`game/data/evidence/*`、`deploy/`
- 你可以放心写：`docs/` 下**新建**文件、`.junshi/handoff/<你的窗名>.md`、`game/data/evidence/<你自己的 slug>/`

## 四件黑名单（两个窗都别同时动）

| 资源 | 为什么 |
| --- | --- |
| `docs/ACCEPTANCE.md` | 第一节标签链要整条重排，两窗各插一行必然错位（批 BE′ 踩过：`+4` 写成 `+3` 吃掉了 `[`） |
| `.junshi/ledger.md` | append-only 1,663 行 |
| `game/src/ui/panels.ts` | 2,159 行，`mountPanels` 一个函数 1,361 行；最近 12 个 commit 中了 8 个 |
| `deploy/deploy-cli.ps1` | 远端 `/tmp/sb/NNN.b64` 会撞 |

## 留给下一个窗的坑

- 探针必须在**仓库根**跑，`OUT` 是相对路径 `game/data/evidence/<slug>`
- 改了面板文案**必须先 `npm run -s build` 再跑探针**，否则探针会在旧 dist 上给假红
- `eye_gate` 会清空 `game/data/evidence/<slug>`，跑完必须重跑本批探针补截图
- `npx vitest run` 必须带 `--no-file-parallelism`
- `framediff_probe` 的基准是**共享单例**（P525），两个窗各自 `--save-baseline` 会互相作废
- 两个窗共享 `game/dist/`（P527）：build 出来是谁的包分不清，验之前先看 dist 名对不对得上
- 含中文的 `.md` / `.ts` 只用 `write` / `edit` 或 python 脚本（首行 `# -*- coding: utf-8 -*-`、`io.open(..., newline="\n")`）改；禁止 `Get-Content | Set-Content` 管道
- `python -c "…"` 里带中文/引号必炸，先 `write` 落 `.tmp_*.py` 再跑
