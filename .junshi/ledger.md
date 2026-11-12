# 决策账本 · 老友粉店（独立项目）

> 本项目是独立项目，不并入 REA 采购工具账本（`D:\项目\REA\.junshi\ledger.md` 属另一项目）。
> 军师拍板即记账；复盘回写「复盘」栏。只追加不删改；错账用新行勘误并标注「勘误@日期」。

## 档案头

- **项目名**：老友粉店（广西老友粉模拟器）
- **形态**：存量迁移（trae → dsh），代码已存在，非 greenfield
- **来源**：REA 逆向开罗拉面店 产物；玩法/常客/喜好严格对齐原作
- **形态定位**：浏览器游戏（H5），阿里云 ECS 已在手
- **红线**：① 免费无内购 ② 数值与文案本地化优先 ③ AI 不产数字 ④ 逆向只做静态资源分析 ⑤ 老友粉店不写入模拟器账本
- **代码位置**：`D:\项目\REA\REA\重构\老友粉店\game`（32 ts / 5,204 行 + 11 test / 901 行）
- **接入日期**：2026-11-08
- **评估报告**：[评估报告-2026-11-08-整体评估.md](../../评估报告-2026-11-08-整体评估.md)

## 决策账本

| # | 日期 | 坐标 | 问题 | 选项 | 拍板 | 理由与证据 | 假设 | 置信 | 复盘（留空） |
|---|------|------|------|------|------|------------|------|------|--------------|
| 1 | 2026-11-08 | D0 | 迁移 dsh 后的整体评估与下一步路线 | A 移动端先活 / B 在线化先活 / C 内容深度先活 / D 美术先活 | **评估已出：加权 62/100；推荐顺序 A → 真人试玩 → C → B → D**；「治工程（独立 git repo）」列为任何路线的前置，不占选项 | 实测三绿全过（89 用例）、B0–B3 绿 / B4B5 半 / B6 未开工；0 条 @media、Scale.NONE、无服务端、0/152 美术；`.gitignore:2:/REA/` 实证项目零版本控制 | H1 DOM HUD 适配便宜；H2 手机 60fps；H3 经济曲线手感；H4 AI 为加分项 | MED-HIGH | 2026-11-08 回写：H1 成立（HUD 为 DOM，重排 < 改画布）；B 段不砍（目标＝真实玩家免费运营） |
| 2 | 2026-11-08 | D2→D6 | AI 在游戏循环里占哪个位置才是真差异 | A B1 输出侧当「嘴」/ B B2 生产侧当「缸」/ C B3 输入侧当「耳」 | **B2 主线（离线预生成每日街市事件池，运行期零调用）；B3 降为可关闭彩蛋；B1 只保结构化记忆字段** | 卡 `.junshi/decision-cards/2026-11-08-AI能力定位.md`（图 `-map.html`）｜树 `.junshi/brainstorm/2026-11-08-AI能力定位/review.html`｜`ai/director.ts` 已有 800ms 超时＋`/\d/` 过滤＋回落模板 → B5 门禁现成；事件表驱动（每月3号固定＋每日5%＋间隔6天）→ 加池不动机制 | A4 合规须以「每日 10 分钟人审」为前置；A5「玩家能感知每日新酿」未验 | MED | 待 Alpha 留存曲线回写 |
| 3 | 2026-11-08 | D2→D6 | 双端 UI 与技术底座怎么走 | A 先做双端骨架 / B 先做 AI 池、UI 后置 | **A：Scale.FIT＋CENTER_BOTH 改 6 行、新增 `hud.responsive.css` 三档断点（360/768/1280）、触摸补 `touchstart`、Playwright 三视口断言进 CI** | 卡 `.junshi/decision-cards/2026-11-08-双端UI与技术底座.md`｜`render/world.ts:655-660`、`ui/hud.css` 1160 行 0 条 @media、`#stage` 固定 1024×768、`main.ts:138` 仅 pointerdown 解锁音频 | H1 已验；H2 手机 60fps 未测（单包 gzip 356.57 kB 未分割） | MED-HIGH | 待实机试玩回写 |

| 4 | 2026-11-08 | D2→D6 | 审核环节要不要全自动（用户要求 AI 当审核官 + 数据飞轮） | A 完整四齿飞轮（AI 审核官·人只留放行权与抽样） / B 只做 L0+J1/J5 轻量版 | **A（用户 2026-11-08 拍板；L1 模型＝当前会话模型 DeepSeek，先不引入第二家）**：三层闸门（L0 规则闸→L1 五判据异构调用→L2 确定性仲裁→L3 人审唯一放行权）＋ review_log.jsonl 喂回判据版本（棘轮只升不降）＋ 冷启动 200 条金标＋每月 20 条盲测自检** | 卡 `.junshi/decision-cards/2026-11-08-AI审核官与数据飞轮.md`｜设计 `../../AI审核官与数据飞轮-v1.md`｜R2 数字闸沿用 `ai/director.ts` 的 `/\d/` 口径；审核为离线脚本 `tools/reviewer/` 不进 bundle；静态 216 卡作 floor → B5 门禁自动满足 | 「5 判据独立调用优于单 prompt 五连评」「金标 200 条够冷启动」自动走；「人审 15 分钟/天」未测 | MED | 待对照期（第 1 月）翻案率矩阵回写 |
| 5 | 2026-11-08 | D0 | 能否复用现有 git 仓库（用户提问） | A 同仓 orphan 分支 `game`+worktree / B 同仓 main 白名单纳入 / C 新建独立仓 | **C（用户 2026-11-08 拍板）：新建独立仓库且为公开仓**——项目目录自身 `git init`＋白名单 `.gitignore`（源码≈4.7MB，排除 node_modules 211.5MB/dist/.tmp），不碰 `rea-procurement-agent` | 卡 `.junshi/decision-cards/2026-11-08-代码仓库归属.md`｜实测：`REA/` 3,405MB 只能白名单；原仓私有（未认证 API 404）→ 公开仓须新建；本机无 gh CLI，凭据存在 Windows 凭据管理器（user=pipishou） | 「公开仓会暴露项目全部源码与决策账本」为自动走，用户已明示公开 | HIGH | 2026-11-08 回写：选 C，与「真实玩家免费公开运营」目标一致（Pages/ECS 均可直连） |
| 6 | 2026-11-08 | D4→D6 | 审核官判据门槛怎么定才不把好内容毙掉 | A 凭直觉设 S≥4.0 / B 用人类已发布内容做参照集、按 S 分布定门槛 | **B（实测拍板）：跑 32 条真人事件为基准，S 分布 min2.80/p25 3.35/median 3.67/p75 4.07 → PASS_S=3.85**；同时 J5 由加权维度降为否决闸、na 判据剔除后权重归一 | 报告 `AI审核官-首轮校准-2026-11-08.md`｜`review_log.jsonl` 4 轮 run/76 行；v0.3 末轮 pass 13(41%)/human 15(47%)/reject 4(13%)，打架率 82%，成本 ¥0.013/条 | 门槛仍随判据版本漂移，需 200 条金标盲测定版 | MED | 2026-11-08 回写：J5 降闸后抓出 3 条真人漏掉的合规风险（食药监/文旅局非遗/市场监管所地方标准）；J2 在事件池 31/32 标 n/a → 应改挂配方系统 |
| 7 | 2026-11-08 | D6 | 人审回填怎么度量，才不把「AI 弃权」当成「AI 判错」 | A 所有回填都算翻案 / B 翻案（AI 有方向被人推翻）与补位（AI 弃权、人补位）分开算 | **B（实测）：`to_human` 被人判 pass 记「误杀」不记翻案**；回填写入 `human_overrides.jsonl`（append-only，不改 review_log 历史行），`review_stats` 合并后输出翻案率 / 补位分布 / 误杀（人 pass 且 S<PASS_S）/ 漏放（人 reject 且 S≥PASS_S）/ J5 闸弃权三种去向 | 工具 `tools/reviewer/human_review.py`（export/apply/status）＋`checklist_html.py`（可点击单文件清单）｜清单 `.junshi/review/20261108-人审清单.md`＋`.html`（15 条＝风险闸 3＋判据打架 12）｜自测：临时 overrides 三例验证补位/误杀/闸分布计算正确 | 「勾选状态存 localStorage 只作草稿，只有 apply 才进飞轮」自动走；「revise/reject 必填理由」自动走 | MED | 待 15 条勾完回写，届时首次算出误杀/漏放名单 |

| 8 | 2026-11-08 | D5→D6 | 15 条 to_human 该动判据、动内容，还是只动这批货 | A 只人判（判据不动）/ B 人判＋把 J4 改成锚点清单后重跑对照 / C J4 移出加权 / D 改题库 32→60 | **推荐 B，待拍板**：反事实重算证明判据侧天花板只有 5/12（移出 J4 可过 5 条、移出 J1 可过 2 条、7 条怎么移都过不了）→ 纯调判据压不到 0；C 虽能立刻救 5 条但砍掉唯一「内容是否平庸」的度量；D 不是同层选项，是 B/C 之后的下一轮 | 卡 `.junshi/decision-cards/2026-11-08-人审15条处置.md`｜地图 `-map.html`（4 选项×5 维＋选项卡详情）｜实测 run `20261108T125819Z` 的 15 条重算，W 剔除后权重重归一，PASS_S=3.85；最低分判据分布 J4=8/J1=6/J3=1 | H1 人审率与 J4 边界强相关（MED，待重跑证）；H2 7 条不过的根因是内容（HIGH）；H3 扩写能降人审率（LOW） | MED | 待重跑对照的迁移矩阵回写 |

| 9 | 2026-11-08 | D3→D6 | 改提示词能不能降人审率（用户拍板走 B 后执行验证） | A 改 J4 边界（锚点计数）→ 降人审率 / B 先测噪声再说 | **B（数据逼迫，推翻 A）**：同文本连跑 4 次 pass_auto=13/10/6/10（sd 2.49，逐条一致率 46.9%）→ **单 run 不可用于版本比较**；锚点方案同批次只有 5，但 k=1 不能定罪 → J4 文本回滚 v0.3，仅保留 J4≤2 地板（实测无害守卫）；规程改为「判据比较一律 k≥3 多数票」 | 报告 `AI审核官-J4边界实验-2026-11-08.md`｜工具 `tools/reviewer/aggregate.py`（多数票/翻转率/S 极差，平票取保守侧）｜`human_review.py export --runs`（清单带跨 run 投票行）｜六 run 表见报告第 2 节 | 「提示词微调在噪声内不可测」为实测结论；「地板是惰性守卫」为实测（每 run 命中 3–4 条且 S 本就 <3.5） | MED | 2026-11-08 回写：人审率真实基线是 **20/32=62.5%（k=4 多数票）**，此前报的 47% 与卡 8 的 41/47/13 分段均降级为 `[单 run]` |

| 10 | 2026-11-09 | D3→D6 | Claude Code Game Studios（37.3k star，49 agent/74 skill，仅 Godot/Unity/Unreal）对本项目是否是有帮助 | A 全量移植 / B 选择性直取 4 件机制 / C 不采用只记结论 | **推荐 B，待拍板**：只取 D1 眼睛绿（Playwright 四视口截图＋哈希戳，"story 不闭合除非看一眼"）／D2 规则直译（gameplay·ui·data·test 四条→Phaser/TS 版写进项目记忆）／D3 观察≠裁决（L0 加 `ran` 第三态，未跑记 `-` 不记 0）／D4 rigor 先验（走 minimal+，不补 GDD 全套）；A 因引擎层零匹配且 rules 的 `paths:` 永不命中 `.ts` 而否决 | 评估 `../../评估-Claude-Code-Game-Studios-2026-11-09.md`｜卡 `.junshi/decision-cards/2026-11-09-CCGS评估.md`＋地图 `-map.html`｜实测：全库 `phaser` 仅 1 次（`agents/prototyper.md:116` 当替代原型工具）、`test-run.sh` 无 node/vitest 分支、rules `paths:` 全指 `.cs/.cpp/gdscript`；其 README 自证「minimal=1 文档 vs standard=30 文档，standard 被双盲评＋真人试玩排最后」；本项目四条手机端缺陷全部通过三绿、`l0_rules.py:57` 只有两态 | H1 四视口必抓到手机断链（HIGH）；H2 四条规则 1 小时可译（MED）；H3 不装 74 skill 不漏流程（MED）；H4 上游半年不转 Web（未知→不深度耦合） | HIGH | — |

| 11 | 2026-11-09 | D3→D6 | CCGS 已拉到本地，改造方案该停在哪一层 | A 只搬四件机制（首评 B 的延续）/ B 三层改造（机制＋目录协议＋最小角色集）/ C 全量 74 skill 移植 | **推荐 B，置信 HIGH，双向门**：L1 机制层全搬（四态 verdict：NOT ASSESSED 优先于通过且须点名什么能 settle；观察三证据 looking/asked/seen-on-screen；证据过期三态 CHANGED/GONE/RECEIPT: NONE；qa.level×Type 豁免矩阵；scope 对照 git）；L2 目录协议层（registry.yaml 单一数值来源、evidence/<slug>/NN-*.png 命名即规范、session-state 含 Run result、tech-debt）；L3 角色层只留 economy-designer / qa-lead / performance-analyst，其余 46 个丢弃；分 P0 1.5h → P1 5h → P2 2h 三批可停 | 报告 `CCGS第二次评估-改造方案-2026-11-09.md`｜卡 `.junshi/decision-cards/2026-11-09-CCGS改造方案.md`＋地图 `-map.html`｜树 `.junshi/brainstorm/2026-11-09-CCGS改造/review.html`｜本地实测：638 文件/5.79MB/HEAD 05ad7c8；**68/74** 内联 `yaml-helper.sh`、**25/74** 调 `.claude/scripts/*`、**8/74** 才提证据、**32/74** 含三引擎指令、docs 128＝gate 28＋templates 63＋根 31，且 1.2.0 已无 `engine-reference`；`story-done/SKILL.md:112-131/170-174/198-203/251-266` 可 1:1 落进 `tools/reviewer` | H1 Playwright 可装可跑｜H2 Vite 5173 可直连｜H3 registry 改造不致 32 条事件数值漂移｜H4 economy 框架适配单币种结构 | HIGH | 待 P0 落地后回写「未执行」第三态是否真能报出 |
| 12 | 2026-11-09 | D6→执行 | CCGS 三层改造怎么才算落地（用户拍板 A 后实施） | P0 机制 / P1 眼睛绿 / P2 角色集 | **A（用户 2026-11-09 拍板，已实施）**：P0＝`verdict.py` 四态（12 例自测过）＋`l0_rules.check_report()` 逐规则 `{ran,hits}`（未执行 `hits=null`，绝不记 0）＋`run_review` 行增 `gate_verdict/gate_reasons/l0_rules`＋`docs/gates.md` 门矩阵；P1＝`tools/gate/eye_gate.py`（5 视口 375×667/667×375/390×844/768×1024/1440×900，sha256 stamp，`CHANGED/GONE/RECEIPT: NONE`，空白截图判未渲染）＋双端骨架（`--stage-scale` 等比缩放、安全区、触摸 44px 热区、竖屏提示）；P2＝`docs/roles.md`（economy/qa/perf 三角色 brief）＋`docs/economy-faucet-sink.md`（实跑一次汇/漏）＋`docs/rules.md`（四条规则直译 Phaser/TS 版） | 实测：K-08 负测试三态全部成立（删 stamp→`RECEIPT: NONE`；改文件→`CHANGED`；还原→`OK`）；四绿 `tsc=0 / 89 tests / build 571ms / eye 5 张零 console error`；竖屏 375 下舞台曾被 body flex 压成 137px 宽（flex-shrink 所致）→ 加 `flex:0 0 auto` 修复；`git status --porcelain` 首行丢状态列前导空格 → 改用 `diff --name-only` 三查取路径，否则 `game/index.html` 被静默漏戳 | 「门必须能表达未执行」已落代码；「眼睛绿必须点名哪条资源 404」已落（`response` 监听）；`RENT_PER_MONTH=800` 为常量导致难度随时间递减（待改公式，未动代码） | HIGH | 待下批改动跑一次完整眼睛绿回写 |

## 待拍板（未入账）


| # | 问题 | 卡在哪 |
|---|---|---|
| P1 | ~~承重追问：自己玩 / 真实玩家上线~~ | **已答（2026-11-08）：给真实玩家玩、免费无内购** → B 段不砍，转执行 |
| P2 | ~~微信小游戏 vs 浏览器 H5~~ | **已答：手机＋PC 双端浏览器 H5**，不做小游戏（若日后转小游戏，双端骨架需返工一次） |
| P3 | 员工体系二选一（现状＝满意度补充 / 补全人气-客流正向循环） | 1107 遗留 |
| P4 | 事件冷却是否降到「每日一件」（开罗式） | 1108 遗留；与卡 2 的预生成池节奏耦合，建议同批定 |
| P5 | 服务技能是否对喜好发现速度加成 | 1108 遗留 |
| P6 | 起始经济常量（START_CASH 5000 / CAPACITY 40 / TARGET 3600 / GROWTH 1.02）校准 | 源码自认占位，缺真实流水 |
| P7 | 广西白话/南宁话审校人 | §15 未定项；写错方言比不写更伤本地玩家 |
| P8 | ~~是否装 `awesome-gamedev-agent-skills` 的 2 个 discipline~~ | **已答（2026-11-08）：装**——已装 game-ui-ux / performance-optimization / input-systems / create-game-assets 四个到 `~\.agents\skills\`；`phaser-core` 是 4.2 不装（项目锁 3.90） |
| P9 | ~~J4 判「题材骨架」还是「细节密度」~~ | **已答（2026-11-08，实测推翻问题本身）**：两个都不成立——先得能测出差异才谈取舍。同文本 4 次 run 一致率仅 46.9%，判据微调在噪声内不可测；J4 文本回滚 v0.3，改 J4 措辞降人审率这条路封了（见账本行 9） |
| P10 | B 定案后是否同批上 D（题库 32→60） | 顺序仍未定；但行 9 证明「判据侧已到噪声地板」→ D（内容侧）优先级上升，且 B 的人判结果未回填前不应急着扩题库 |
| P15 | 是否需要第二条固定成本曲线（水电/损耗/设备维护）来制造现金流张力 | 行 13 实测：租金改动打不动难度；行 16 再证：不操作局现金仍涨到 22–48 万 → **优先级上升**，待用户拍板 |
| P16 | 20 条人审是否按 A（全判）执行 | 见行 14；待用户拍板 |
| P11 | ~~眼睛绿（D1）与行 3「双端骨架」是否同批落地~~ | **已答（2026-11-09，见行 11 推荐 A）：同批** —— 一套 Playwright 脚手架两用；分开则手机端缺陷在 UI 批次前仍无自动发现手段 |
| P12 | ~~是否把 CCGS 的 rules 直译写进项目常驻记忆（D2）~~ | **已答（2026-11-09）：写**——落为 `docs/rules.md` 四条（gameplay/ui/ai/data，Phaser+TS 口径），不进 skill、不进每轮上下文，靠 `docs/gates.md` 与 code review 对照 |
| P13 | ~~改造是否按 P0→P1→P2 今日开工~~ | **已答（2026-11-09，用户拍板 A）：已全做**，见行 12；P1 与行 3 双端骨架同批交付，证据 `game/data/evidence/dualend-skeleton/`（5 视口 + stamp） |
| P14 | ~~`RENT_PER_MONTH = 800` 固定常量 → 难度随时间递减~~ | **已实测（2026-11-09，见行 13）**：前提成立（占营收 19.3%→13.8%）但<b>量级不足</b>——五套公式达标月数全同、现金从未转负；待用户拍板取 B（目标22%）与否 |
| 13 | 2026-11-09 | D6→实测 | 租金公式怎么定（用户令：决策地图＋游戏实测） | A 常量800 / B 目标×22% / C 阶梯 / D 营收×18% | **待拍板，推荐 B（HIGH，双向门）**：`rent = round(monthTarget × 0.22)`，一处改动＋一条确定性测试；**明确不把它当难度杠杆**，难度另立 P15 | 卡 `.junshi/decision-cards/2026-11-09-租金公式.md`（图 `-map.html`）｜报告 `租金公式实测-2026-11-09.md`｜实测 `npm run probe:rent`（8 局×36 月不操作基线，`game/src/sim/rent-probe.probe.ts` + `vitest.probe.config.ts`）｜五方案结果：期末现金 18.2万/17.0万/16.1万/17.4万/17.0万，**累计租金 2.88万→4.95万，但达标月数全为 24.6/36、现金为负 0 月**；租金占营收 19.3%→13.8%（第1/36月）｜根因：`state.ts:404` `monthTarget=3600×1.02^month`（36月+100%）跑赢营收（+40%） | H1 高手局营收更高→租金占比更低、结论方向不变；H2 事件直接改 cash 未计入营收→真实占比更低 | HIGH | 待用户拍板后回写；若取 B 需重跑四绿＋眼睛绿 |
| 14 | 2026-11-09 | D6 | 20 条待判人审怎么处置（用户令：给决策地图） | A 全判20 / B 只判闸3+17伪标签 / C 分层12 / D 先建200金标 | **待拍板，推荐 A（HIGH，单向门）**：45–60 分钟全判，判完 `apply` 一次落盘再出三率 | 卡 `.junshi/decision-cards/2026-11-09-人审20条处置.md`（图 `-map.html`）｜队列实测：20 = 3 条 J5 闸弃权（inspect/heritage/standard，score=None）+ 17 条打架（S 2.733–3.800）；最低分判据 **J4×9 / J1×8 / J3×3**；`human_overrides.jsonl` 当前 0 条 → 翻案率/误杀率/准确率一个都算不出 | H1 单条 2–3 分钟；H2 后段疲劳需分两段 | HIGH | 判完回写三率与 J1/J3/J4 相关性 |

| 15 | 2026-11-12 | D6→执行 | 数值从哪来、怎么写进代码（用户令：用 REA 逆向开罗数值，换算成广西现实） | A 直接照搬开罗数 / B 只当比例参照 / C 分层换算＋单一来源 | **已拍板执行（HIGH，双向门已过）**：`balance.ts` 作唯一来源，`KAIRO_REF`（[COMPUTED]，面粉 500–14000、碱水 800–13000、顾客预算 910/1050/840、浇头 10–1260、区域费 0–30000、成就 100/1000/3000/6000 客）＋`GUANGXI`（[ANCHOR]，10 元/碗、成本 4.2、日均 45/70/95、月租 4500、帮工 3800、起步 30000）；锚点 **1 KCU = 0.01 元**（1050 KCU ↔ 10 元，误差 5%）；租金已切 `rentFor(target)=round(target×0.22)`，`ledger.ts` 常量 800 已删，`systems.test.ts` 三处改符号引用｜**三条硬结论**：① 租金 22% 与现实吻合（4500/21000=21.4%）；② `START_MONTH_TARGET=3600` 只有现实 17%，应取 **21000**；③ 真瓶颈是客流——不操作局实测日均 **11.5 碗** vs 产能 40 碗/日 vs 目标 70 碗/日，需提高约 6 倍 | 文档 `docs/数值来源与换算-2026-11-12.md`｜代码 `game/src/data/balance.ts`＋`game/src/data/balance.test.ts`（10 例）｜四绿：tsc 0 / vitest **99 用例** 全过 / build 1,299.55 kB gzip 357.02 / probe:rent 八局×36 月重跑通过 | H1 现实锚点需本地实采（现为行业常识量级）；H2 面粉/碱水应「每碗折算」不应整袋对碗 | HIGH | 待办：切 TARGET_BASE_YUAN/START_CASH、客流×6、面粉折算、装修档位（见文档第七节） |

| 16 | 2026-11-12 | D6→执行 | 客流怎么定（用户令：继续推进） | A 只调 spawn 倍率 / B 只抬 capacity / C 三个天花板逐个切开后定值 | **已拍板执行（HIGH，双向门已过）**：`FLOW_DEFAULTS = {spawnScale:6, serveMinutes:1, patienceScale:1.5, eatScale:1, queueMax:12}`；`START_CAPACITY 40→200`（只当防呆阀）；`hall` 扩建改为 **+2 座**＋capacity +10；灶台冷却改成「先减冷却再判 <=0 上菜」 | 探针 `game/src/sim/flow-probe.probe.ts`、`flow-diag.probe.ts`、`flow-curve.probe.ts`、`winnable.probe.ts`（`npm run probe:flow` / `probe:win`）｜三层天花板实测：① capacity=40 把日销锁死（spawn ×4→×10 全在 40 上下）；② 灶台冷却时序让 serve=1 实际变 2 分钟一碗（57.7 vs 119 上限）；③ 修好后座位才是杠杆（4 座 71.2 碗 vs 8 座 110.5 碗）｜可赢性（5 seeds×36 月）：4 座不操作 71.2 碗/日、流失 29%、达标 **29%**、期末现金 22.4 万；8 座 110.5 碗/日、流失 0%、达标 **91%**、期末现金 48.3 万 | 文档 `docs/数值来源与换算-2026-11-12.md` 第七节（客流换算表＋可赢性对照）｜四绿：tsc 0 / vitest 99 全过 / build 1,299.81 kB gzip 357.11 / 眼睛绿 5 视口 stamp 45 文件 | H1 eat×0.8 的 87 碗/日比现实乐观故不采用；H2 流失 29% 会压口碑，需观察是否过痛（未验） | HIGH | 待办：第二条成本曲线（P15）让现金别一路涨到 22 万；装修档位（文档第八节第 4 项） |
