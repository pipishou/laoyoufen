# Claude Code Game Studios 对老友粉店的适用性评估

- 评估对象：https://github.com/Donchitos/Claude-Code-Game-Studios （MIT，37,311 stars / 4,902 forks，created 2026-02-12，pushed 2026-10-19，4,406 KB，语言 Shell）
- 评估基准：本项目现状（Phaser 3.90 + TypeScript + Vite + Vitest；89 用例三绿；单包 gzip 356.57 kB；`ui/hud.css` 1160 行 0 条 `@media`；`render/world.ts:655-660` Scale.NONE；真实玩家免费公开运营）
- 取证方式：GitHub API 逐层读 tree（782 项）＋ `git clone --depth 1` 本地全库关键词扫描 ＋ 阅读 README / project.yaml / rules / docs / scripts 原文。**所有数字均来自本次实测，不引用二手描述。**
- 评估日期：2026-11-09

---

## 结论先说

**有用，但不能整体搬。** 它的价值不在 49 个 agent、74 个 skill 的"工作室结构"，而在**四个语言无关的工程机制**：让 agent 真的把游戏跑起来看一眼并留证、规则按路径域生效、观察与裁决分离、以及它自己用数据证明「流程做重了不会让游戏更好」。

四个机制里，本项目**最缺的是第一个**：我们的"三绿"（`tsc --noEmit` / `vitest run` / `vite build`）全是"代码能不能加载、逻辑对不对"，没有一条是"看一眼屏幕"。而本项目当前最大的已知缺陷——手机端零适配——恰好是**只有看一眼才能抓到、三绿永远抓不到**的那一类。这不是巧合，是判据缺层。

置信：**HIGH**（引擎错配与工具链不可运行均为实测；缺口判断直接对得上本项目既有实测缺陷）。

---

## 一、它到底是什么（结构盘点，实测）

| 层 | 数量 | 内容 |
|---|---|---|
| `.claude/agents/` | **49** 个 .md | 三层：directors 3（creative / technical / producer）→ leads 8 → specialists 32（含 ui-programmer / performance-analyst / accessibility-specialist / live-ops-designer）＋引擎专精（godot / unity / unreal 各带子专精） |
| `.claude/skills/` | **278 文件 / 74 个 skill** | 立项→GDD→架构→故事→开发→QA→发布全链：`start / setup-engine / brainstorm / design-system / create-architecture / create-epics / create-stories / dev-story / story-done / qa-plan / perf-profile / asset-audit / ux-review / localize / adopt / release-checklist / retrospective …` |
| `.claude/docs/` | **134 文件 / 62 模板** | `director-gates/` 30+ 道导演门（cd-pillars / td-adr / lp-code-review / ql-test-coverage …）、`run-and-observe.md`、`coding-standards.md`、`model-tiers.md` |
| `.claude/rules/` | **14** 条 | **路径域 frontmatter**（`paths:` 命中才生效）：gameplay-code / ui-code / ai-code / data-files / test-standards / shader-code / network-code / scene-files / engine-code / prototype-code / narrative / design-docs / skill-authoring / agent-memory |
| `.claude/hooks/` + `scripts/` | **18 + 35** | 全是 Bash（少数 awk），依赖 Python 3 读 `project.yaml`、可选 jq；`yaml-helper.sh` / `validate-*.sh` / `asset-scan.sh`（32 KB）/ `review-receipts.sh` / `test-run.sh` |
| 配置 | `project.yaml` 1.1 KB | `modes.rigor` 一个前门统管六个旋钮（`review_mode / workflow / docs.density / qa.level / story_granularity / team.size`）；六个旋钮禁止直接写死 |

它的自证材料（README 原文，这是全仓最有价值的一段）：

> Four games were built from one brief at different `modes.rigor` levels … `minimal` = **1 文档（一页 brief）/ 0 min**；`standard` = **30 文档 / 58 min**。四者都产出可运行且有测试的游戏，**两个盲评 + 一次真人试玩把 `standard` 版排最后** —— "the extra 29 documents bought traceability, not a better game"。

一个 37k star 的仓库，公开写自己最重的那档产出被盲评排最后——这个诚实度值得当成证据用。

---

## 二、逐层适配矩阵（本项目视角）

| 层 | 它提供 | 本项目实际 | 判定 |
|---|---|---|---|
| **引擎层** | Godot 4 / Unity / Unreal 5 三套专精 agent；rules 的 `paths:` 全是 `Assets/**/*.cs`、`Source/**/*.{h,cpp}`、GDScript；`godot-parse-check.gd` | Phaser 3.90 + TS + Vite | **零匹配**。全库 `phaser` 仅出现 **1 次**（`agents/prototyper.md:116`，作为"原型替代工具"被顺带提及）；`test-run.sh` 里 **node/npm/vitest/jest/playwright 一次都没有**；`asset-scan.sh` 的资产目录约定只认 godot/unity/unreal。装上去 = 规则永不命中、门永远空转 |
| **工具层** | 18 bash hook + 35 script，`project.yaml` 驱动，Claude Code 的 hook 事件模型 | dsh：无 hook 事件、无 `!`bash`` 内联执行、无 `AskUserQuestion`/`Agent` 同名工具 | **不可原样运行**。skill frontmatter 里的 `allowed-tools` / `model: sonnet` / `argument-hint` / `user-invocable` 与正文 `` !`bash "${CLAUDE_SKILL_DIR}/…"` ``，dsh 的 skill 只读 `name` + `description`（对照本机 `~\.agents\skills\game-ui-ux\SKILL.md` 与本仓 skill 原文即知） |
| **流程层** | 74 skills + 30+ 导演门 + story/epic/sprint 三层 | 军师 D0–D7 + 决策卡 + 账本 9 行 + 审核官 L0–L3 + 三绿 + MVP 批次 B0–B6 | **高度重叠**（映射见第三节）。我们更轻、且已带数据飞轮 |
| **知识层** | rules 14 条工程禁令、`run-and-observe`、`coding-standards` 证据分级、`asset-scan` 的认识论、`model-tiers` | 语言无关，可直译 | **有价值**——这是唯一值得直取的部分 |
| **证据层** | 玩家可见改动必须启动→观察→截图入库 `production/qa/evidence/`，配 `review-receipts.sh hash` 给改动文件打哈希戳；"**A parse check is not a run**" | 三绿全过，但 0 张截图、0 条"看一眼"记录 | **本项目最大缺口** |

---

## 三、重复度分析：74 个 skill 里有多少是我们已有的

| 它的 skill | 我们的等价物 | 结论 |
|---|---|---|
| `brainstorm / design-system / create-architecture / review-all-gdds / propagate-design-change` | 军师 D0–D7（拷问→三支×三法→反证→MECE→双镜→卡→账本）+ 需求文档 C1–C9 | 已有，且带思考树与拍板双镜 |
| `gate-check / design-review / code-review / consistency-check / scope-check` | 军师双镜 K-01..K-08 / J-01..J-06 + 审核官 L0–L3 五判据 + 三绿 | 已有，且判据已校准到 PASS_S=3.85 |
| `perf-profile` + `performance-analyst` agent | **已装** `performance-optimization`（先测量后优化、帧预算 16.67ms@60、pooling/batching/GC） | 已装，且引擎中立、更贴 Phaser |
| `ux-design / ux-review / team-ui` | **已装** `game-ui-ux`（锚点+容器、参考分辨率、安全区、焦点栈、事件驱动 HUD） | 已装，且比它更工程化 |
| `art-bible / asset-spec / asset-audit` | **已装** `create-game-assets`（art-direction brief、asset-manifest.json、`asset_report.py`/`build_preview_sheet.py` 光栅 QA） | 已装，且带可跑脚本 |
| `accessibility-specialist` + `templates/accessibility-requirements.md` | **已装** `input-systems`（重映射、toggle/hold、灵敏度、无障碍清单）＋ `game-ui-ux`（字号下限/色盲/动效偏好） | 覆盖八成；它的无障碍模板可借格式 |
| `localize`（scan/extract/validate/cultural-review/RTL/string freeze） | 我们单语 zh-CN + P7「南宁白话审校人未定」 | 思想可借（硬编码字符串扫描），但对粤语/白话无能力；**RTL/VO 与我们无关** |
| `qa-plan / regression-suite / test-*（6 个）` | vitest 89 用例（含 1000 局同种子确定性）+ 三绿 | 已有，缺的是"眼睛"而非"回归" |
| `balance-check / economy-designer` | `sim/` 13 个模块 + 89 用例 + 28 条数值待校准（P6） | 我们的问题不是"缺检查器"而是"缺真实流水" |
| `create-epics / create-stories / sprint-plan / sprint-status / story-*` | MVP 批次 B0–B6 | 单人 + AI 场景下三层 story 是净负担 |
| `adopt / project-stage-detect` | 已于 2026-11-08 完成接入（账本档案头 + 评估报告 + 三查） | 已完成，无需重做 |
| `reverse-document` | 已有逆向取证三份报告 | 已有 |
| `launch-checklist / changelog / patch-notes / hotfix / release-checklist` | 尚无（ECS 未上线） | 上线时自建轻量版即可，不必搬 5 个 skill |

**粗算：74 个 skill 中约 30 个有等价物，约 25 个与"PC/主机商业发行"绑定（认证、VO、RTL、季票、live-ops、社区管理），约 19 个是它自身的元工具（`skill-improve / skill-test / settings / help / start / team-*`）。** 真正对本项目可能新增的，不到 10 个，其中 4 个是"机制"而非"skill"。

---

## 四、值得直取的四件（这是评估的实际产出）

### D1 · 眼睛绿：把"跑起来看一眼"变成门（最高价值）

- **它怎么做**：`docs/run-and-observe.md` + `skills/story-done` Phase 3。规则原文：凡是玩家可见的改动，"**launched and observed before it closes**"，截图必须留在 `production/qa/evidence/[story-slug]/`，并用 `review-receipts.sh hash <改动文件>` 生成 `stamp.txt`——**后来改了代码，旧证据自动显旧**。还规定"从启动参数直达该 story 的画面"（菜单三次点击才到的地方，等于没跑）。
- **我们缺什么（实证）**：`hud.css` 1160 行 0 条 `@media`、`#stage` 硬钉 1024×768、`world.ts:655-660` `Scale.NONE + zoom:2 + NO_CENTER`、`main.ts:138` 只有 pointerdown——这四条缺陷全部通过了三绿。**"tsc 过了"证明代码能加载，"vitest 过了"证明逻辑对，"build 过了"证明能打包；没有任何一条证明玩家在 iPhone 上看得见 HUD。**
- **改造方案（本项目版，约 4 小时）**：
  1. `tools/qa/observe.mjs`：Playwright 起 `vite preview`，按 4 个视口（390×844 / 768×1024 / 1024×768 / 1440×900）各截一张，落 `game/data/qa/evidence/<story-slug>/NN-<what>.png`；
  2. 截图同时算被改文件的 sha256 写 `stamp.txt`（对齐 `review-receipts.sh` 的思路），并在报告里对比 stamp 与当前 hash → 证据是否过期一目了然；
  3. 判定表：截图存在 + stamp 未过期 + 该视口无溢出/无遮挡 → 才算闭合；缺一张即 `blocked`；
  4. 与既有三绿并列，口径叫**第四绿：眼睛绿**（**eyes-green**）。
- **为什么现在做**：账本行 3 已拍板"先做双端骨架 + Playwright 三视口断言进 CI"。这门正好是那条批次的验收器，不是新开销。

### D2 · 规则按路径域生效（把 14 条规则直译成 Phaser/TS 版）

它的 rules 用 frontmatter `paths:` 绑定目录，命中才注入。语言无关、内容硬。直译 4 条对我们立刻有用：

| 它的原文（节选） | 我们的 TS/Phaser 版 |
|---|---|
| gameplay：**所有数值必须来自外部配置，绝不硬编码**；状态机须有显式转移表；禁止游戏状态用静态单例 | `game/src/sim/**`：数值只从 `data/*.ts` 出；`GameState` 只经 reducer/纯函数改变（现有 `advanceMinute` 已是这个形态）；禁新增全局单例 |
| ui：**UI 永不拥有/直接改游戏状态**；所有文案走本地化系统；动画可跳过且尊重动效偏好；不得阻塞主线程；每屏须测最小与最大分辨率 | `game/src/ui/**`：HUD 只读 `state`，改动走事件；文案走 zh-CN 表（P7 白话审校是同一件事的前置）；`prefers-reduced-motion` 必须尊重；**每屏测 390 与 1440** |
| data-files / test-standards | `game/src/data/**` 结构化可校验；每条规则改动必须带同种子可复现用例（现有 `determinism.test.ts` 是模板） |
| ai：**AI 每帧预算 2 ms，须 profile 验证**；参数数据化；须有可视化调试钩子；须 telegraph 意图 | `ai/director.ts`：离线池已满足"运行期零调用"；若将来上在线模式，2 ms 预算与调试钩子写进 ADR |

落地形式：写进项目记忆/`AGENTS.md` 一级，不做成 14 个 skill（我们没有它们的 hook 注入机制，做 skill 等于没人读）。**成本约 1 小时，收益是不再靠自觉。**

### D3 · "观察 ≠ 裁决"、"未跑 ≠ 通过"（修我们审核官的一个真缺口）

`asset-scan.sh` 头部原文：

> EMITS OBSERVATIONS, NOT A VERDICT … A check that did not run says so in a `check` row and its hits are `-`, never 0: **a scan that measured nothing is not a scan that found nothing.**

对照我们的 `tools/reviewer/l0_rules.py`：`check()` 返回"违规列表，空列表＝通过"（第 57 行 docstring）。**没有第三态**。具体漏洞：`run()` 用 `others = [t for t in pool_texts if t and t != c.get("body")]`（第 132 行）做 R6 去重，若 `pool_texts` 因解析/加载问题为空，R6 对全部条目**静默通过**，而报告上看不出"R6 根本没跑"。这违反我们自己在卡 4 立的 K-08（门不可绕过）。

修法（约 1 小时）：每条规则返回 `{rule, ran: bool, hits: [...]}`；`ran=false` 的规则在报告里显示 `-` 而非 `0`；`arbitrate()` 遇 `ran=false` 走 `to_human`（与现有 error→to_human 的 fail-closed 口径一致）。**这是它教我们的唯一一条"改判据结构"的东西，不是措辞。**

### D4 · rigor 的实测先验：别再往流程上加纸

它用四个游戏证明"30 篇文档的 standard 版盲评最后"。我们已有的对应物是军师"拍板件 ≤500 字 + 图 ≤2"和"决策卡落文件"。**把这条写成一条 wal 决策依据**：老友粉店走 minimal+（卡片 + 三绿 + 眼睛绿），**不补 GDD 全套、不建 epic/story/sprint**。这条的价值是防止将来有人（包括我们自己）以"专业工作室都这么做"为由给项目加纸。

---

## 五、明确不采用的（以及理由）

| 不采用 | 理由（都基于实测，不是口味） |
|---|---|
| 49 个 agent 整体引入 | 引擎专精全指向 Godot/Unity/Unreal；模型分层（director 要 Opus、16 个要 Sonnet、其余继承）在 DeepSeek 单模型下失去意义；我们连 `performance-optimization` 这种语言无关 skill 都只装 4 个，一次调 49 个 agent 的 token 成本与本项目"€0 免费运营"的成本纪律冲突 |
| 74 个 skill 全量移植 | 需逐条改 frontmatter（去 `allowed-tools`/`model`）、把 `` !`bash …` `` 内联换成 python 脚本、把 `Agent`/`AskUserQuestion` 换成 dsh 的 subagent/ask；粗估 3–5 天，产出物约 30 个与已有等价、25 个与主机发行绑定。**移植成本 > 全部收益** |
| 30+ 导演门（director-gates） | 它们服务的是"创意总监 / 技术总监 / 制片人"三方签字的分工。本项目单人 + AI，签字方只有用户一人；军师双镜 + 决策卡 + 账本已覆盖"拍板前自检 + 落文件" |
| story / epic / sprint 三层 | 单人开发下，"story 不关闭"的约束力可以由"眼睛绿 + 三绿"提供，不需要先分三层再逐层过门 |
| `asset-scan.sh` 直接用 | 目录约定只认 godot/unity/unreal（`--engine E` 三选一），无法扫我们的 `美术/` 与 `game/public/`。**但它的"观察/裁决分离"要被搬（见 D3），脚本不搬** |
| `localize` 的 RTL / VO / 认证段 | 我们是单语 zh-CN 网页游戏，无语音、无主机认证 |
| `test-run.sh` | 已实测：全库无 node/npm/vitest/playwright 分支，对本项目是空壳 |

---

## 六、成本与风险

**成本（采纳 D1–D4）**：D1 约 4 小时、D2 约 1 小时、D3 约 1 小时、D4 约 10 分钟（一条 wal 行）；合计约 **6 小时**，零新增依赖（Playwright 已计划，不引入 Claude Code 工具链）。**若走全量移植：3–5 天改造 + 每次会话技能清单噪声 + 跟版**（上游 `CHANGELOG.md` 88.6 KB、`UPGRADING.md` 83.5 KB，8 个月 3.7 万 star，属于高速迭代，深度耦合＝持续缴税）。

**风险清单**：

- **R1 流程通胀**：它自己实测的失败模式（30 篇文档排最后）会原样复现在任何人身上。对策＝D4 写成先验。
- **R2 Windows + Bash + Python 的可靠性**：本项目已有先例——上一轮用 PowerShell 内联 python 打补丁，因引号/heredoc 连续失败两次（`SyntaxError: EOL while scanning string literal`、`缺少字符串终止符`），最后改用 edit 工具逐处修改才过。它的 18 个 hook 全是 bash + python + jq，在 Windows 上属于"看起来装好了、偶尔静默不跑"。
- **R3 引擎错配导致静默失效（最危险）**：rules 的 `paths:` 永不命中 `.ts` 文件 → 规则装载成功但一句不生效，**表现与"遵守了"完全一致**。这类失败比报错危险，因为没有任何信号。
- **R4 工具假设降级**：`Agent` / `AskUserQuestion` / `model:` 分层在 dsh 均无对应消费方，会静默忽略。
- **R5 后继耦合**：一旦按它的目录结构（`.claude/**`、`production/epics/**`）落产物，将来想换回就变成迁移债。

---

## 七、如果将来真要移植（机制备忘）

只在这三种情况下才值得动：① 本项目转向 Godot/Unity；② dsh 增加 hook 事件模型；③ 我们有了第二个需要"工作室流程"的项目。移植顺序（成本从低到高）：`rules` 文本（纯 markdown，零依赖）→ `docs/director-gates` 的门清单（当检查表用，不接 agent）→ `run-and-observe` 流程（已是 D1 的蓝本）→ skill 正文（需改 frontmatter 与内联 bash）→ agents（需重写模型分层与工具声明）→ hooks/scripts（需 bash 环境与 Python 依赖）。

---

## 八、下一步（等拍板）

1. **采纳 B**：只做 D1–D4（6 小时），不做全量移植 → 见卡 `.junshi/decision-cards/2026-11-09-CCGS评估.md`
2. D1 与账本行 3 的"双端骨架"同批落地会更省：一次 Playwright 脚手架同时服务"三视口断言"和"眼睛绿截图闸"
3. D3 可与"勾完 20 条人审清单"同批做，因为两者都要动 `l0_rules.py` / `run_review.py`

---

## 双镜（拍板前自检）

| 判据 | 结论 | 证据 |
|---|---|---|
| K-01 该用数据的地方没用口号 | 通过 | 采纳与否的依据是它自己的盲评实验 + 我们的实测缺陷，不是 star 数 |
| K-07 可复现 | **不通过 → 支撑 D1** | 我们没有任何"看一眼"的存证；它的 `stamp.txt` 哈希戳正是缺的那一环 |
| K-08 门不可绕过 | **不通过 → 支撑 D3** | `l0_rules.py:57` 只有两态（通过/违规），`pool_texts` 为空时 R6 静默通过 |
| K-06 口径单一来源 | 通过 | `PASS_S` 由 `run_review.py` 单一导出 |
| J-01 减法 | 通过 | 74 → 4 件；且明确写下"不做什么" |
| J-05 敢署名 | 通过 | 引擎错配、工具不可运行、重复度均给出文件行号与命中计数 |
| J-06 真实 | 通过 | 全部数字来自本次 clone/API/本地 grep，无二手引用 |

## 假设账本

- **H1**：Playwright 四视口截图能一次抓到手机端断链 —— **HIGH**（0 条 `@media` + `Scale.NONE` + `#stage` 硬宽，任何 390 宽视口必然暴露）
- **H2**：14 条规则直译 4 条能在 1 小时内完成且不引入新约束 —— MED
- **H3**：不装那 74 个 skill 也不会漏关键流程 —— MED（依据：74 个里约 30 个有等价物、25 个与主机发行绑定）
- **H4**：上游 6 个月内不转向 Web/Phaser 引擎 —— **未知**（故不做深度耦合，见第六节 R5）

## 成本行

付费检索 **0 次**（未调用 `ds_search`）；直连 GitHub **6 次**（API tree ×2、raw 原文 ×3、`git clone --depth 1` ×1）＋ 本地 grep 4 轮；费用 **¥0**；本机耗时约 12 分钟。
