# 老友粉游戏迁移开发评估（主窗）

- Session: `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc`
- 更新: 2026-11-27 22:00
- 状态: 已停手，等老板决定要不要装协同插件 / 开副窗

## 我现在在做什么

没在写游戏代码。今晚做完两件事：

1. **插件盘点 + 多窗口协同选型**：把本机 `node_modules`（约 300 个 `@deepseek-ai/dsh-*`）、
   profile 的 18 条 `bundles`、`cordis.patch.yml`（403 行）逐个对过；又把插件市场注册表
   `https://awesome-dsh-plugin.com/plugins.json`（**13,445 条，updated 2026-11-26**）按
   worktree / 跨会话 / handoff / 共享记忆 / 并行会话 / 任务板 / mailbox 等加权关键词扫了一遍
   → 464 条强相关、384 条 ≥8 分，再逐条判兼容。
   结论落成 [`docs/插件盘点与多窗口协同选型-2026-11-27.md`](../docs/插件盘点与多窗口协同选型-2026-11-27.md)。
2. 同步更新了本目录的 `README.md`（加了身份对照表与两个插件的装法）。

一句话结论：**跨任务记忆你已经装了两个（`hindsight-coding-agents` 0.8.8 + `dsh-project-memory` 0.7.2），
按工作区绑定、同 cwd 自动共享 —— 这一层不缺。缺的是「窗与窗之间发话」这一层，本机一个都没启用。**

## 该记的几条事实

| 事实 | 证据 |
| --- | --- |
| profile 只挂了 28 个 `@deepseek-ai` 插件 | `cordis.patch.yml` 403 行 |
| `session-query` / `session-search` / `liveshare` / `worktree` / `forge` **零命中** | 同文件 grep |
| 官方 `dsh-experimental-session-search` 已装未启用 | `node_modules/@deepseek-ai/` 下有 |
| FTS 全文索引当前是关的 | `dsh-base/cordis.patch.yml:157-160` → `path: ':memory:'`、`openAt: never` |
| `dsh-parallel-sessions` v0.6.0 **可装** | 无 `peerDependencies`、无 `engines`；`inject: ['tools','agents','sessionQuery']` 三个服务本机全在 |
| `dsh-tool-session-message` v0.2.0 **可装** | `engines.dsh: ">=0.2.1-rc.5"`，本机 0.2.2-rc.5 |
| `dsh-task-relay` **装不了** | peer `dsh-tools` 上界 `<0.2.0-0` |
| `dsh-session-fork` **装不了** | 15 个 peer 钉在 `0.2.1-rc.2 … 0.2.2-rc.1` |
| `dsh-team-rooms` 已 **RETIRED** | 作者 README 顶：能力由官方 `dsh-experimental-agent-team` 继承 |
| Team 模式本机 base 已挂、新会话默认关 | `dsh-base/cordis.patch.yml:366-372`；开关在「模型与推理等级菜单」 |

## 我写到了哪

- 新建：`docs/插件盘点与多窗口协同选型-2026-11-27.md`（十节）
- 改了：`docs/ACCEPTANCE.md`（新增「五·二十七」P528–P530，**292 → 313 行**；候选行尾部同步）
- 改了：`.junshi/handoff/README.md`（边界表加「装了插件之后能/不能」一列、身份对照表、第六节装法、单例表扩到六行）
- 改了：本文件
- git：以上均**未 commit**
- HEAD: `214e87d docs: how to split game dev across two windows - measured per-step timings, file whitelist/blacklist, three role templates (P524-P527)`
- 线上：`index-BEwYZt6y.js` 1,764,885 B ＝本地 dist

## 我需要你给什么

**一个点头，二选一（或都点）**：

1. 开 **`@deepseek-ai/dsh-experimental-session-search`**（官方、零风险）——
   设置 → 插件 → 添加插件 → 粘贴包名 → 安装 → 立即启用。开了之后两个窗能互相搜到历史。
2. 开 **`github:CatLollipop/dsh-parallel-sessions`**（第三方 v0.6.0、1★、无 peer 约束）——
   装完两个窗能 `parallel_message` / `parallel_hold` / `parallel_release`，副窗排班才跑得起来。

装完重启 DSH，然后在副窗照 `.junshi/handoff/TEMPLATE.md` 写 `fork2.md`，把 Session id 填进
`README.md` 的身份对照表。

## 我不碰什么（这段时间）

- `game/src/**`、`tools/gate/**`、`docs/ACCEPTANCE.md`、`.junshi/ledger.md`、`game/data/evidence/*`、`deploy/`
- 你可以放心写：`docs/` 下**新建**文件、`.junshi/handoff/<你的窗名>.md`、`game/data/evidence/<你自己的 slug>/`

## 六个单例（两个窗都别同时动）

| 资源 | 为什么 |
| --- | --- |
| `docs/ACCEPTANCE.md` | 第一节标签链要整条重排，两窗各插一行必然错位（批 BE′ 踩过：`+4` 写成 `+3` 吃掉了 `[`） |
| `.junshi/ledger.md` | append-only，1,664 行 |
| `game/src/ui/panels.ts` | 2,159 行，`mountPanels` 一个函数 1,361 行；最近 12 个 commit 中了 8 个（P518） |
| `game/data/evidence/framediff/baseline/` | 帧差基准谁后 `--save-baseline` 谁说了算（P525） |
| `game/dist/` | 两窗共用，「这个包是谁建的」分不清（P527） |
| `deploy/deploy-cli.ps1` | 远端 `/tmp/sb/NNN.b64` 会撞 |

## 留给下一个窗的坑

- 探针必须在**仓库根**跑，`OUT` 是相对路径 `game/data/evidence/<slug>`
- 改了面板文案**必须先 `npm run -s build` 再跑探针**，否则探针会在旧 dist 上给假红
- `eye_gate` 会清空 `game/data/evidence/<slug>`，跑完必须重跑本批探针补截图
- `npx vitest run` 必须带 `--no-file-parallelism`
- `framediff_probe` 的基准是**共享单例**（P525），两个窗各自 `--save-baseline` 会互相作废
- 两个窗共享 `game/dist/`（P527）：build 出来是谁的包分不清，验之前先看 dist 名对不对得上
- 副窗起 preview 用 **4247 起**（4246 主窗占着，P520/P524）
- 想用 `session_search` 搜对方会话，**两窗 cwd 必须字符串完全相等**（P530）——
  副窗起 preview 用工具 `workdir` 参数，别 `cd game`
- `parallel_hold` 的暂停登记只在**进程内存**（P528）：DSH 重启后不会自动恢复，要人工 `parallel_release`
- 含中文的 `.md` / `.ts` 只用 `write` / `edit` 或 python 脚本（首行 `# -*- coding: utf-8 -*-`、`io.open(..., newline="\n")`）改；禁止 `Get-Content | Set-Content` 管道
- `python -c "…"` 里带中文/引号必炸，先 `write` 落 `.tmp_*.py` 再跑
