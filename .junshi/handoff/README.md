# 会话窗之间的交接约定（handoff）

> 这份文件解决一件事：**DSH 里开两个（或多个）会话窗时，它们怎么知道对方在干什么。**
> 2026-11-27 建，起因是老板用「分叉」开了第二个窗（`老友粉游戏迁移开发评估 -2`），问怎么联动。
> 2026-11-27 晚更新：把「能装的协同插件」逐个核完，加了第六节的装法与身份对照表。
> 2026-11-28 更新：**先自己写了一个本地插件 `@local/dsh-cross-session`，随后按老板要求换成插件市场上的第三方包**（「不要重复造轮子」）。自写插件已从 profile 的 `dependencies` 与 `dsh.profile.bundles` **双向摘除**；现役是 **`dsh-session-dm` 0.5.1 + `@lzlrt/dsh-cross-session` 1.0.2**（实测两者能并存，工具名不撞）。自写插件只留作历史记录，见 6.0 节与 `docs/跨窗口插件实测对比-2026-11-28.md`。

---

## 一、先说清 DSH 的边界（别指望不存在的东西）

| 能力 | **裸装**能不能跨会话窗 | 说明 |
| --- | --- | --- |
| `list_agents` / `send_message` / `wait_agent` / `interrupt_agent` | **不能** | 这几个工具只在**当前 Session 的 subagent 树**里寻址。用户在侧栏开的另一个窗是独立 Session，`list_agents` 看不见它，`send_message` 发不过去。 |
| `team_task_create` / `team_task_list` / … | **不能** | Team 任务板属于「一棵 subagent 树」，不是「多个会话窗的公共板」。而且新 Session（含普通分叉）**默认关闭 Team 模式**。 |
| `parallel_message` / `parallel_hold` / `parallel_release` | **能（装第三方 `dsh-parallel-sessions`）** | 见 6.2。本机**没装**（GitHub 直连不通，且该包没发 npm）。 |
| `session_list` / `session_send` / `session_reply` / `session_read` | **能（本机已装 `@lzlrt/dsh-cross-session`）** | 见 6.5。给 `cs_` 别名，对方**关着会自动叫醒**，`session_reply` 双向回信。 |
| `session_dm_send` / `session_dm_wait` / `session_model` | **能（本机已装 `dsh-session-dm`）** | 见 6.5。**唯一能阻塞等对方跑完**（`session_dm_wait`）+ 能改对方的模型。代价：往系统提示注入 1,341 字常驻。 |
| ~~`session_peers` / `session_tail` / `session_stop`~~ | **已摘除（自写插件）** | 2026-11-28 17:02 从 profile 双向摘除，改用上面两个第三方包。历史见 6.0。 |
| `session_search` / `session_event_search`（读历史会话） | **能（启用官方 `dsh-experimental-session-search` 之后）** | 官方内置、已装未启用。要求**两窗 cwd 字符串严格相等**（P530）。 |
| 工作目录（cwd） | **能（默认共享）** | 分叉窗继承同一个 cwd。两窗写的是同一批文件，改动互相立刻可见。 |
| git 仓库 | **能** | 同一个 `.git`。`git log` / `git status` / `git diff` 是两窗之间的**事实通道**。 |
| 文件系统 | **能** | 这是**裸装状态下**唯一可靠的「消息总线」。本目录就是干这个的。 |
| `hindsight_*` / `query_memory` 长期记忆 | **能** | 两个插件（`hindsight-coding-agents` 0.8.8、`dsh-project-memory` 0.7.2）都按**工作区**绑定，同 cwd 就共享同一份。 |

**结论：裸装状态下两个会话窗之间没有即时消息，只有「共享文件 + 共享 git + 共享记忆」。** 2026-11-28 起本机装了第三方 `dsh-session-dm` + `@lzlrt/dsh-cross-session`（6.5 节），两个窗**能直接发话、也能派完活等对方跑完**了；但**读不带上下文**——对方收到的是你写的那一段字，不是你的记忆。所以交接文件仍然要写。

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

### 身份对照表（两种口径并存，按你手上的插件挑一列用）

真实 id 是 46 个字符，抄错一个字符就投不出去。两个第三方包对它的叫法不同：

| 窗名 | 原始 `session-…` id（`dsh-session-dm` 要这个） | `cs_` 别名（`@lzlrt/dsh-cross-session` 的 `session_list` 直出，`session_reply` 也认它） |
| --- | --- | --- |
| 主窗（lead） | `session-9d96182c-7bbf-47b7-bbd7-6936ea1542cc` | `cs_K0xBRZbDid` |
| 副窗（-2） | `session-37407351-e8c4-47fb-8fd3-b93209a4da90` | `cs_Erdg1TDO7U` |

> **怎么取**：`session_list(query="老友粉")` 一次就把两列都印出来（原始 id + alias + 「（你自己）」标记）。`cs_` 别名不是永久的 —— 它按当前枚举顺序生成，**换一次窗口顺序就可能变**，所以别把它写死在脚本里，每次都现查。
> **`@laoyuehanni/dsh-session-tools` 已卸**（2 处输出不合自身 schema，见 P541），它没有别名层。

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

### 6.0 历史：自写的 `@local/dsh-cross-session`（2026-11-28 装上，同日摘除）

> **已被 6.5 取代。** 老板要求「不要重复造轮子，用市场上的插件」，所以这个自写包已从 profile 的 `dependencies` 与 `dsh.profile.bundles` **双向摘除**。源码 `D:\项目\skill\dsh-cross-session` 还在盘上（四个工具 `session_peers` / `session_send` / `session_tail` / `session_stop`，60 条离线断言全过），随时能再挂回去。

留在这里的原因只有一个：它把 DSH 的插件契约（`ctx.tools.register` 的 `output.render` 必填、`parameters` 要写完整 JSON Schema、`sessionController.prompt` 的 `requestId` 必填、`filterEvents` 怎么抽文本）全试过一遍，以后要再写本地包直接照抄。过程文档：[自己写一个跨窗口发话插件-2026-11-28](../../docs/自己写一个跨窗口发话插件-2026-11-28.md)。

### 6.5 本机现役的两个第三方包（2026-11-28 17:02 起）

装法（插件市场等价路径，profile 目录里 `pnpm add`）：

```powershell
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
& "D:\tools\node\corepack.cmd" pnpm --dir "C:\Users\Mo\.dsh\profiles\desktop" add "dsh-session-dm@0.5.1" "@lzlrt/dsh-cross-session@1.0.2"
```

**为什么是这两个**：三个候选包两两撞工具名，`dsh-tools` 同层重名直接抛 `tool "X" is already registered` —— 只有 `dsh-session-dm` + `@lzlrt/dsh-cross-session` 这一对零交集。选型全过程：[跨窗口插件实测对比-2026-11-28](../../docs/跨窗口插件实测对比-2026-11-28.md)。

| 包 | 工具 | 干什么 | 代价 |
| --- | --- | --- | --- |
| `@lzlrt/dsh-cross-session` 1.0.2 | `session_list` / `session_send` / `session_reply` / `session_read` | 说话层：给 `cs_` 别名、对方**关着会自动叫醒**、`session_reply` 双向回信 | 无（0 字系统提示） |
| `dsh-session-dm` 0.5.1 | `session_dm_send` / `session_dm_wait` / `session_model` | 节拍层：**唯一能阻塞等对方跑完**、能改对方的模型 | 往系统提示注入 **1,341 字**常驻（`tool:session-dm`） |

两个包都是零 peer、零 deps（`@lzlrt` 那条 `dsh-tools` peer 标了 optional），`engines` 都覆盖本机（`>=0.2.1-rc.5` / 无）。

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

**本机装不了**：GitHub 直连 `Recv failure: Connection was reset` / `Connection timed out after 300059 milliseconds`，npm 上也没有这个包（registry 404）。本机现在用 6.5 那两个第三方包，不需要它。

以下是**它的能力清单**（留作对照）：

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

原版 `session_send(session_id, message, mode)` 不列会话、不带暂停恢复。**本机已被 6.5 覆盖**，且这条路同样撞 GitHub 直连。

### 6.4 不要装的

| 包 | 原因 |
| --- | --- |
| `dsh-team-rooms` | **已 RETIRED**（2026-11-18），能力被官方 `dsh-experimental-agent-team` 继承 |
| `dsh-task-relay` | `peerDependencies` 上界 `<0.2.0`，本机 0.2.2-rc.5 不在范围 |
| `dsh-session-fork` | 15 个 peer 钉在 `0.2.1-rc.2 … 0.2.2-rc.1`，rc.5 一支都不覆盖 |
| `graph-memory` / `dsh-forge` / `dsh-teams-x` | 注册表标了 **REDLINE**（读凭据 + 有网络 / 安装期跑 postinstall） |

---

## 七、只在一个窗里说话的操作流程（2026-11-28 起可用）

主窗按这个顺序干活，老板**只需要在主窗里说话**：

1. **查**：`session_list(query="老友粉")` —— 拿到对方的原始 `session-…` id 与 `cs_` 别名；标着「（你自己）」的那条是自己。
2. **派活**：`session_dm_send(session_id=<原始 id>, message=<任务>)`
   - `mode` 默认 `queue`（排成对方下一轮）；对方正在跑要立刻插话用 `steer`。
   - 写清楚三件事：**做什么**、**判据是什么**、**不许碰什么**（单例六件 + `game/src/ui/panels.ts`）。
   - 例：「跑 `npm run -s probe:standin`，把四行原文贴回来；判据是与基线逐位相同。不要碰 `docs/ACCEPTANCE.md` 与 `.junshi/ledger.md`，不要 `npm run build`（我在改面板）。」
3. **等**（这是本轮新能力）：`session_dm_wait(session_id=<原始 id>, timeout_seconds=300)` —— **真阻塞**，直到对方这一轮 `turn/end`，返回结束原因。实测等到第 147 轮、耗时 17 秒。
4. **取**：`session_event_read(seq=<turn/end 的 seq>, before=1)` —— 把对方那一步的**原始工具输出**取回来（`session_read` 给的是摘要，P533）。
5. **回信**（对方也可以主动找你）：它会调 `session_reply({ to: "<你的 cs_ 别名>", text })`。

**要知道的四条**（写进代码的限制，不是猜测）：
- 对方**不会**因为你发话就凭空知道你的上下文 —— 它收到的是你写的那一段字，加上它自己的历史。
- `session_dm_send` **会冷启**离线会话（直调 `agent.followup`，绕过 `prompt` 的去重通道，P542）；`session_read` 不叫醒。
- `@laoyuehanni/dsh-session-tools` **已卸**：它的 `session_models` / `session_send` 输出不合自身 schema（P541），本机会抛 `ToolOutputError`。
- 两个窗**共享同一个 cwd 与同一批文件**（Team 也不隔离目录），所以「我改了你别动」只能靠文字约定 + git 核对。
