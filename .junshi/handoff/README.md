# 会话窗之间的交接约定（handoff）

> 这份文件解决一件事：**DSH 里开两个（或多个）会话窗时，它们怎么知道对方在干什么。**
> 2026-11-27 建，起因是老板用「分叉」开了第二个窗（`老友粉游戏迁移开发评估 -2`），问怎么联动。
> 2026-11-27 晚更新：把「能装的协同插件」逐个核完，加了第六节的装法与身份对照表。
> 2026-11-28 更新：**自己写了一个本地插件 `@local/dsh-cross-session`，已装进 profile**（不进网络、不依赖 GitHub）。四个工具 `session_peers` / `session_send` / `session_tail` / `session_stop` 让主窗能直接给 -2 窗发话。见 6.0 节。

---

## 一、先说清 DSH 的边界（别指望不存在的东西）

| 能力 | **裸装**能不能跨会话窗 | 说明 |
| --- | --- | --- |
| `list_agents` / `send_message` / `wait_agent` / `interrupt_agent` | **不能** | 这几个工具只在**当前 Session 的 subagent 树**里寻址。用户在侧栏开的另一个窗是独立 Session，`list_agents` 看不见它，`send_message` 发不过去。 |
| `team_task_create` / `team_task_list` / … | **不能** | Team 任务板属于「一棵 subagent 树」，不是「多个会话窗的公共板」。而且新 Session（含普通分叉）**默认关闭 Team 模式**。 |
| `parallel_message` / `parallel_hold` / `parallel_release` | **能（装第三方 `dsh-parallel-sessions`）** | 见 6.2。本机**没装**（GitHub 直连不通）。 |
| `session_send` / `session_peers` / `session_tail` / `session_stop` | **能（本机已装 `@local/dsh-cross-session`）** | 见 6.0。**自写本地插件，不走网络**，2026-11-28 装上，重启 DSH 后生效。 |
| `session_search` / `session_event_search`（读历史会话） | **能（启用官方 `dsh-experimental-session-search` 之后）** | 官方内置、已装未启用。要求**两窗 cwd 字符串严格相等**（P530）。 |
| 工作目录（cwd） | **能（默认共享）** | 分叉窗继承同一个 cwd。两窗写的是同一批文件，改动互相立刻可见。 |
| git 仓库 | **能** | 同一个 `.git`。`git log` / `git status` / `git diff` 是两窗之间的**事实通道**。 |
| 文件系统 | **能** | 这是**裸装状态下**唯一可靠的「消息总线」。本目录就是干这个的。 |
| `hindsight_*` / `query_memory` 长期记忆 | **能** | 两个插件（`hindsight-coding-agents` 0.8.8、`dsh-project-memory` 0.7.2）都按**工作区**绑定，同 cwd 就共享同一份。 |

**结论：裸装状态下两个会话窗之间没有即时消息，只有「共享文件 + 共享 git + 共享记忆」。** 2026-11-28 起本机装了自己写的 `@local/dsh-cross-session`（6.0 节），两个窗**能直接发话**了；但**读不带上下文**——对方收到的是你写的那一段字，不是你的记忆。所以交接文件仍然要写。

---

## 二、规则（四条，照抄即可）

1. **一人一个文件，只写自己的**。文件名 = 你自己的窗名 slug（见下表）。绝不编辑别人的文件 —— `write` 是全量替换，同时写一个文件必然互相覆盖。
2. **读别人的文件只读**。想知道对方进展就 `read` 对方的文件，不要开对话。
3. **代码状态以 git 为准**，不以文字为准。交接文件里写「我改了 X」，要用 `git log --oneline -3` / `git diff --stat` 能对上；对不上就是没写。
4. **`game/dist/` 是共享的**（P527）：对方 `npm run -s build` 出的包会被你的 preview 读到。跑门前先问一句「这个 dist 是你刚建的吗」，别验错包。

### 已知的窗

| 窗名（侧栏标题） | 文件 | Session id | 角色 |
| --- | --- | --- | --- |
| 老友粉游戏迁移开发评估 | `lead.md` | `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc` | 主窗：写代码、跑五门、部署 |
| 老友粉游戏迁移开发评估 -2 | `fork2.md` | `session-37407351-e8c4-47fb-8fd3-b93209a4da90` | 待定：建议只读调研 / 或 worktree 隔离写 |

新开一个窗就在上表加一行，并 `write` 自己的文件。

> **-2 窗的 id 是怎么确认的**（2026-11-28，主窗实测）：读 `C:\Users\Mo\.dsh\storages\session_projcache\sessions\*.json` 的 `record.rows.title.val` 与 `header.cwd`，按标题匹配。两窗 `cwd` 都是 `D:\项目\REA`（字符串严格相等，满足 session-search 与 `@local/dsh-cross-session` 的前提）。**这份 id 是主窗侧认定的；-2 窗自己应核一遍 `$env:DSH_SESSION_ID`，不一致以 -2 窗自己读到的为准。**

### 身份对照表（`@local/dsh-cross-session` 时代：只要一列原始 id）

| 窗名 | 原始 `session-…` id（`session_peers` 直出的就是这个） | 谁给它发话 |
| --- | --- | --- |
| 主窗 | `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc` | -2 窗（用 `session_send`） |
| 副窗（-2） | `session-37407351-e8c4-47fb-8fd3-b93209a4da90` | 主窗 |

> **为什么现在只要一列**：`@local/dsh-cross-session` 的 `session_peers` 直出原始 `session-…`，`session_send` 也只认它，没有 `cs_` 别名那一层（P529 在本插件里不存在）。若哪天装了 `dsh-parallel-sessions`，再补第三列。

---

## 三、写什么（模板见 `TEMPLATE.md`）

每次交接至少写这四段，顺序固定，方便对方扫：

1. **我现在在做什么** —— 一句话 + 起止时间。
2. **我写到了哪** —— 改了哪些文件（相对路径），`git status` 上是什么状态，有没有 commit。
3. **我需要你给什么** —— 具体到一个文件、一句话、一个数字。写「需要你确认 X」不算具体；写「需要你在 `docs/X.md` 第三节补上 Y 这个数字」才算。
4. **我不碰什么** —— 明确列出这段时间我不会动的文件/目录，让对方敢下手。

**单例资源**（两个人同时写必然打架，交接时必须点名归属）：

| 单例 | 为什么 |
| --- | --- |
| `docs/ACCEPTANCE.md` | 第一节标签链要整条重排，两窗各插一行会连锁错位 |
| `.junshi/ledger.md` | append-only（1,664 行），两窗同时 append 会冲突 |
| `game/data/evidence/<slug>/` | `eye_gate` 会清空整个目录 |
| `game/src/ui/panels.ts` | 2,159 行，最近 12 个 commit 有 8 个动了它（P518） |
| `game/data/evidence/framediff/baseline/` | 帧差基准，谁后 `--save-baseline` 谁说了算（P525） |
| `game/dist/` | 两窗共用的构建产物（P527） |

---

## 四、真要并行写代码时

默认**不要**两个窗同时写代码：老友粉店每批八件交付物里，后五件（探针 / 文档 / ACCEPTANCE / 账本 / 部署）全是全局单例，凑不出干净切法（见 `docs/决策地图-要不要开并行任务窗-2026-11-27.md`）。

真要写，用 Git worktree 隔离 —— 见 `docs/决策地图-要不要开并行任务窗-2026-11-27.md` 第五节和 `docs/DSH-多窗口操作手册-2026-11-27.md`。
注意 worktree 建出来**没有 `node_modules`**（P521）：`game/` 下 267 MB / 5,602 文件要手补，或建 junction。

---

## 五、只读副窗的排班（实测过一遍，见 `docs/两窗口怎么分工-2026-11-27.md`）

一批 96 分钟里，**17 分钟是纯等待**（替身 258 s + 长跑门 306 s + 全量测 68 s + AI 门 47 s + 部署）。

- 主窗：读场 → 写代码 → 全量测 → 探针 → 写文档 → ACCEPTANCE → 账本 → 上线。
- 副窗（只读 + 跑门）：起**自己的端口**（4247 起，别用 4246，P520/P524）→ 跑 `copy_gate` / `debug_exit_gate` / `framediff_probe` → 替身与长跑门**串行**（P526）→ 结果写进自己的交接文件。

副窗第一句话可以直接抄 `docs/两窗口怎么分工-2026-11-27.md` 第六节的模板。

---

## 六、装哪两个插件才真的能「窗与窗说话」

详细盘点在 `docs/插件盘点与多窗口协同选型-2026-11-27.md`，这里只留结论与动作。

### 6.0 本机已经装好的：`@local/dsh-cross-session`（自写，2026-11-28）

**为什么自己写**：GitHub 直连不通（`Recv failure` / `Connection timed out`），npm 上没有 `dsh-parallel-sessions`，装第三方这条路实际走不通。于是照 DSH 内核的插件契约写了一个本地包。

**装在哪**：源码 `D:\项目\skill\dsh-cross-session`；profile 里 `"@local/dsh-cross-session": "link:D:/项目/skill/dsh-cross-session"`，junction 在 `C:\Users\Mo\.dsh\profiles\desktop\node_modules\@local\dsh-cross-session`，`dsh.profile.bundles` 末位一条。包内自带 `cordis.patch.yml`，profile 的 `cordis.patch.yml` 不用改。

**四个工具**：

| 工具 | 干什么 | 参数 |
| --- | --- | --- |
| `session_peers` | 列**同 cwd 的顶层会话**（不含自己、不含子 agent、不含别的 cwd），带标题 / 是否开着 / 忙闲 | 无 |
| `session_send` | 给对方发一句话 | `session_id` / `message` / `mode`（`queue` 默认 = 排成对方下一轮；`steer` = 插进对方下一步） |
| `session_tail` | 读对方最近几条发言（只挑 `assistant/message` 与 `user/message`） | `session_id` / `limit`（默认 3，上限 20） |
| `session_stop` | 叫停对方当前这一轮（不丢它排队的消息） | `session_id` |

**边界（写进代码里的，不是口头约定）**：只认 `header.cwd` 字符串完全相等的顶层会话；两边任一方 cwd 为空就一律不认（否则会把全表默认空 cwd 的会话拉进来）；`origin === 'subagent'` 或 `delegationDepth > 0` 一律排除；单条消息上限 32 KB；同一对会话 2 秒一条（限流表在**进程内存**，重启即清，P528 同型）；`session_stop` 只对**开着**的会话有效（冷会话直接返回「没开着」）。

**离线自检**：`D:\项目\skill\dsh-cross-session\test-offline.mjs` 不启 DSH 直接 import 内核 `dsh-tools` 的校验函数，60 条断言全过（工具定义过 `register` 校验 / `execute` 返回值严格合 `output.schema` / `render` 出 text / 各条拒绝路径）。`test-compose.mjs` 用 `dsh-app-boot` 的 `loadProfile` + `composeEntries` 验 profile 组合：19 层、226 个条目、`cross-session` 在里面。

**装完必须重启一次 DeepSeek Harness**（Host 插件在启动时加载）。重启后主窗第一句先 `session_peers`，确认能看到 -2 窗，再 `session_send`。

### 6.1 想读对方历史（官方内置，零风险）

```
设置 → 插件 → 添加插件 →  @deepseek-ai/dsh-experimental-session-search  → 安装 → 立即启用
```

或写进 `C:\Users\Mo\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles`。启用后本窗与对方窗（**同 cwd**）都能用 `session_search` / `session_event_search` / `session_trace` / `session_event_trace` / `session_event_read` 五个只读工具。
**注意**：cwd 必须字符串完全相等；副窗别用 `cd game` 去起 preview，用工具的 `workdir` 参数（P530）。

### 6.2 第三方 `dsh-parallel-sessions` v0.6.0（本机装不上，留作备选）

```
设置 → 插件 → 添加插件 →  github:CatLollipop/dsh-parallel-sessions
```

**本机装不了**：GitHub 直连 `Recv failure: Connection was reset` / `Connection timed out after 300059 milliseconds`，npm 上也没有这个包（registry 404）。6.0 的本地插件就是它的替代品。

以下是**它的能力清单**（留作对照；本机用 6.0 的本地插件替代）：

| 工具 | 干什​么 | 我们怎么用 |
| --- | --- | --- |
| `parallel_sessions` | 列同工作区的活动会话（`cs_` 别名 + 状态 + 暂停关系） | 开会话第一步先列一次，把 `cs_` 抄进第二节的身份对照表 |
| `parallel_message` | 给对方发话，**默认 `mode=steer` 直接插进对方下一步** | 主窗在「要跑全量测 / 要跑替身」这两个交接点发一句 |
| `parallel_hold` | **真实取消对方当前回合并清空其待处理队列**（`until=holder-turn-end` 默认本轮结束自动恢复） | 主窗要改 `panels.ts` 时把副窗挂住，别让它同时摸面板 |
| `parallel_release` | 恢复并投递「继续工作」+ 变更摘要 | 改完手动放开（`until=manual` 时必用） |

**四条边界**：只协调**同一工作区的顶层会话**；**不会创建 / 唤醒**离线会话；暂停登记只在**进程内存**（重启即失联，P528）；一对会话限速 **10 条 / 60 秒**。

### 6.3 极简版 `dsh-tool-session-message`（同样装不上，本机不需要）

```
设置 → 插件 → 添加插件 →  github:BigBugy/dsh-tool-session-message
```

原版 `session_send(session_id, message, mode)` 不列会话、不带暂停恢复。**本机已被 6.0 覆盖**（我们的插件同时有 `session_peers` 与 `session_tail`），且这条路同样撞 GitHub 直连。

### 6.4 不要装的

| 包 | 原因 |
| --- | --- |
| `dsh-team-rooms` | **已 RETIRED**（2026-11-18），能力被官方 `dsh-experimental-agent-team` 继承 |
| `dsh-task-relay` | `peerDependencies` 上界 `<0.2.0`，本机 0.2.2-rc.5 不在范围 |
| `dsh-session-fork` | 15 个 peer 钉在 `0.2.1-rc.2 … 0.2.2-rc.1`，rc.5 一支都不覆盖 |
| `graph-memory` / `dsh-forge` / `dsh-teams-x` | 注册表标了 **REDLINE**（读凭据 + 有网络 / 安装期跑 postinstall） |

---

## 七、只在一个窗里说话的操作流程（2026-11-28 起可用）

重启 DSH 之后，主窗按这个顺序干活，老板**只需要在主窗里说话**：

1. **开场**：`session_peers` —— 确认 -2 窗在列表里（`开着` / `忙`/`闲`），把它的 `session_id` 记下来（就是第二节表里那个）。
2. **派活**：`session_send(session_id, message)` —— 用 `queue`（默认）把任务排成对方下一轮；对方正在跑时要立刻插话就用 `steer`。
   - 写清楚三件事：**做什么**、**判据是什么**、**不许碰什么**（单例资源四件 + `game/src/ui/panels.ts`）。
   - 例：「跑 `npm run -s probe:standin`，把四行原文贴回来；判据是与基线逐位相同。不要碰 `docs/ACCEPTANCE.md` 与 `.junshi/ledger.md`，不要 `npm run build`（我在改面板）。」
3. **收**：`session_tail(session_id, limit=3)` —— 读对方最近几条发言验收。**它是摘要，不是全过程**（P533），要它给 `文件:行号`。
4. **叫停**：`session_stop(session_id)` —— 只有对方**开着**才有效；停完它排队的消息还在（`keepInbox: true`）。

**要知道的三条**（写进代码的限制，不是猜测）：
- 对方**不会**因为你发话就凭空知道你的上下文 —— 它收到的是你写的那一段字，加上它自己的历史。
- 发话**不唤醒离线会话**？不对，`session_send` 走的 `sessionController.prompt` **会冷启**离线会话（`resolveAgent` → `resume`）。**只是 `session_stop` 不会冷启**。
- 两个窗**共享同一个 cwd 与同一批文件**（Team 也不隔离目录），所以「我改了你别动」只能靠文字约定 + git 核对。
