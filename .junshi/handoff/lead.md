# 老友粉游戏迁移开发评估（主窗）

- Session: `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc`（`cs_` 别名 `cs_K0xBRZbDid`）
- 更新: 2026-11-28 17:30
- 状态: 已停手待命 —— 游戏代码没有在写，等老板挑下一批（BF′）

## 我现在在做什么

没在写游戏代码。今天下午这一轮做的是**跨窗口协同**这件事本身，分三步：

1. **先自己写**：老板问「能不能只在这个窗说话就编排 -2 窗」，查遍内核（`list_agents`/`team_task_*`
   按根 Session 隔离、`schedule_create` 只能 `this_session`、`dsh-parallel-sessions` 与
   `dsh-tool-session-message` 都没发 npm、GitHub 直连超时）后自己写了个本地插件
   `@local/dsh-cross-session`（四工具、60 条离线断言、profile 组合验证全过），commit `f2ea6af`。
2. **老板改口**「本机装了插件市场，不要重复造轮子，用市场装第三方，装完测哪个更能实现需求」。
   于是把自写插件从 `dependencies` 与 `dsh.profile.bundles` **双向摘除**，从注册表 13,580 条里
   扫出 219 条相关，实装三个（`@laoyuehanni/dsh-session-tools` 0.1.1 / `dsh-session-dm` 0.5.1 /
   `@lzlrt/dsh-cross-session` 1.0.2），在 mock 宿主 + 真实跨窗两条路上都跑过。
3. **结论**：三个包两两撞工具名（`dsh-tools` 同层重名直接抛 `already registered`），
   **只有 `dsh-session-dm` + `@lzlrt/dsh-cross-session` 能并存**，现在用的就是这一对。
   前者唯一能**阻塞等对方跑完**（`session_dm_wait`，实测等到 -2 窗第 147 轮 `turn/end`、
   并用 `session_event_read` 取回了原始输出 —— 那个 `panels.ts` 2,230 行的数就是这么来的）；
   后者给 `cs_` 别名 + 双向 `session_reply`。`@laoyuehanni` 有 2 处输出不合自身 schema 的真 bug，不启用。

**「只在一个窗说话」这件事现在是通的**：查 → 派 → 等 → 取，四步都在主窗完成。

## 该记的几条事实（今天新得的）

| 事实 | 证据 |
| --- | --- |
| 本机 npm 走**国内镜像**，不是直连 npmjs | `C:\Users\Mo\.npmrc` 全文 = `registry=https://registry.npmmirror.com` |
| `corepack pnpm` 可用 → 手动装包可行 | `D:\tools\node\corepack.cmd`，版本 12.23.0 |
| 无 npm 的包在镜像上确实 404 | `dsh-parallel-sessions` / `dsh-tool-session-message` / `dsh-task-relay` |
| 现行 profile：`dependencies` 17 条、`bundles` 20 条 | 末两位 `dsh-session-dm` / `@lzlrt/dsh-cross-session` |
| 改 `package.json` **可能热生效**，不必等重启 | 17:02 改完，17:18 `session_list` 就直出 `cs_` 别名 |
| `-2` 窗的 `cs_` 别名是 `cs_Erdg1TDO7U` | `session_list(query="老友粉")` 现查；**别写死**，顺序一变它就变 |
| `dsh-session-dm` 往系统提示注入 **1,341 字**常驻 | `prompttext.mjs` 抽出 `PROMPT_TEXT` 全文 |
| 两个包都零 peer 零 deps | `node_modules/<pkg>/package.json` 实读 |

## 我写到了哪（本轮，全部已落盘）

- 新建 `docs/自己写一个跨窗口发话插件-2026-11-28.md`（七节，自写插件全过程，**现已作历史**）
- 新建 `docs/跨窗口插件实测对比-2026-11-28.md`（八节：前提修正 / 实装命令 / 硬指标与撞名 / 三份真跨窗实测 / 判据矩阵与排名 / 六个坑 / P540–P544 / 复现命令）
- `docs/ACCEPTANCE.md` **349 → 372 行**：五·二十九 顶部加「已被取代」注记；新增**五·三十** P540–P544（编号 105–109）；第一节候选行尾部扩充
- `.junshi/handoff/README.md` **186 → 196 行**：边界表换口径、身份对照表补 `cs_` 列、6.0 降级为历史、新增 **6.5 现役两个第三方包**、第七节四步操作全改写
- 本文件（`lead.md`）

## 我需要老板给什么

1. **游戏那边下一批挑哪个**：缺口账里优先带 bug 性质的两条 —— **P514**（打烊单脚注与账本格读的是**当前**状态，翻历史月份看到的门路格仍是今天的，是 bug）或 **P518**（`panels.ts` 已经 **2,230 行**、`mountPanels` 1,361 行，是并行开发的硬墙）。
2. **-2 窗要不要真的开工**：现在链路是通的，但「谁写什么文件」还没定。真要并行写代码得先做 P518；不做的话泼它只读活（调研、跑门、贴原文）是最稳的。

## 我不碰什么

| 单例 | 为什么 |
| --- | --- |
| `docs/ACCEPTANCE.md` | 第一节标签链要整条重排，两窗各插一行必错位 |
| `.junshi/ledger.md` | append-only（1,664 行），并发 append 会互相覆盖 |
| `game/src/ui/panels.ts` | 2,230 行、单函数 1,361 行，冲突率极高 |
| `game/data/evidence/framediff/baseline/` | 共享单例，谁 `--save-baseline` 谁作废对方基准（P525） |
| `game/dist/` | 两窗共享，验门前先问「这是谁建的包」（P527） |
| `deploy/` | 同时只许一个 deploy job，两个会撞远端 `/tmp/sb/NNN.b64` |

## 留给下一个窗的坑

1. **`session_read` 的参数名是 `session_id`**，写成 `target=` 会报 `missing required property "session_id"`。老插件（`@laoyuehanni`）才用 `target`。
2. **`session_list` 现查现用**：`cs_` 别名按当前枚举顺序生成，写死在脚本里迟早失效。
3. **`dsh-session-dm` 会冷启离线窗**（直调 `agent.followup`，绕过 `prompt` 去重，P542）—— 叫醒别人前想清楚要不要付这个代价。
4. **`session_dm_wait` 的真超时路径没验过**（P544）：本轮 17 秒就 `completed`，永远走成功路径。
5. **装同类插件前先算工具名交集**（P540）：三个候选两两都有交集，装完再重启才发现重名就白跑一轮。
6. **`game/src/ui/panels.ts` 已经 2,230 行**（P518 记账时是 2,159，又长 71 行）—— 任何「两窗同时写代码」的念头先看 P518。
7. 游戏当期口径：**当期 = 批 BE′**（`docs/ACCEPTANCE.md` 第三节「批 BE′ 之后」），账本末行 `### 行 168 · 2026-11-27 · 批 BE′：一步换掉（P505 + P506）`，HEAD `f2ea6af`，线上 `index-BEwYZt6y.js` 1,764,885 B，`audit_ai --remote` 29/29。
