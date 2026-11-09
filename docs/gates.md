# 门矩阵（gates.md）

本文件是「一条改动什么时候算完」的唯一判据表。改编自 Claude Code Game Studios
`.claude/skills/story-done/SKILL.md` 与 `.claude/docs/qa-plan.md` 的 qa.level × Story Type 矩阵，
把 Unity/Godot 术语换成老友粉店（Phaser 3.90 + TypeScript + Vite）的实际类型。

## 0. 四态裁决

任何一次改动、一条事件、一个页面，都只允许落在四态之一（实现见 `tools/reviewer/verdict.py`）：

| 裁决 | 含义 | 触发 |
|---|---|---|
| `BLOCKED` | 不通过 | 任一判据 `fail`，或存在 BLOCKING 缺口/偏离 |
| `NOT_ASSESSED` | **没被评估**（不是通过） | 判据 `untested`、门返回 `not_assessed`、证据读不出、缺判据输入、判据调用报错 |
| `COMPLETE_WITH_NOTES` | 通过但有 ADVISORY | 全部 pass 或 deferred，存在 advisory 项 |
| `COMPLETE` | 通过 | 全部 pass，无 advisory |

判定顺序即上表顺序，第一个匹配的胜出。`NOT_ASSESSED` **优先于**两种通过状态，
且必须点名「什么能 settle 它」——否则它会永远停在未评估态，被下一次汇总误当成通过。

信息行（证据戳哈希、`Run result:`、缺失的 sprint 文件）**不改变裁决**，只作为证据附注。

## 1. 观察方式（证据强度从高到低）

| 方式 | 判定含义 | 我们这里怎么给 |
|---|---|---|
| `screenshot` | **亲眼看过图** | `game/data/evidence/<slug>/NN-what.png` + sha256 stamp |
| `looking` | 文件/产物在当前工作区存在 | `ls`/读文件即可 |
| `asked` | 只能问，做不了 | 视作 `untested`，落 `NOT_ASSESSED` |
| `deferred` | 需真人试玩或上真机 | 落 `COMPLETE_WITH_NOTES`，进待办 |

两句硬话（原文语气保留）：
**「a described check is an assertion」**——描述一次检查不等于执行了检查；
**「an evidence doc with no image beside it is not evidence」**——没有图的证据文档不是证据。

## 2. 门矩阵：qa.level × 改动类型

改动类型（对应本项目的真实产物，不用 Unity 的 Story Type）：

- **Logic**：`game/src/sim/**` 纯逻辑（数值、判据、RNG、存档）
- **Integration**：跨模块接线（`main.ts` / `world.ts` / 服务端接口 / 存档迁移）
- **Config/Data**：`game/src/data/**`、`game/data/review/**`、JSON/TS 静态表
- **Visual**：程序化绘制、调色板、字体、HUD 布局在真实屏幕上长什么样
- **UI**：`game/src/ui/**` 交互、断点、触摸、焦点导航

| qa.level | Logic | Integration | Config/Data | Visual | UI |
|---|---|---|---|---|---|
| `minimal` | 单测（vitest 覆盖该函数） | 冒烟：`tsc` + `build` + 手动跑一局 | 结构校验（`l0_rules` R4） | **眼睛绿** | 一眼（见 3） |
| `standard` | 单测 + 边界用例 | 冒烟 + 存档往返 + 控制台零 error | 结构校验 + 数字闸 R2 + 去重 R6 | **眼睛绿**（两视口） | **眼睛绿**（四视口） |
| `full` | 单测 + determinism 摘要不变 | 冒烟 + 回归集 + 存档版本迁移 | 结构 + 数字 + 去重 + 人审一轮 | 眼睛绿（四视口）+ 对比图 | 眼睛绿（四视口）+ 触摸实机 |

**唯一不随 qa.level 降级的行：Visual —— 「the look is never waived」。**
（原项目对 `minimal` 档也保留「看一眼」，理由：颜色/溢出/截断这类缺陷只有看图能发现。）

Config/Data 在 `full` 档默认 **blocking**：静态表改错会静默污染全局，比代码 bug 更难查。

## 3. 眼睛绿（eye gate）细则

- 工具：`tools/gate/eye_gate.py`（Playwright；自带 Chromium 缺失时自动退回本机 Edge/Chrome）
- 视口（五档，与本项目 HUD 断点一致）：
  `375x667`（iPhone SE 竖）、**`667x375`（手机横屏，真正主用形态）**、`390x844`（iPhone 12+ 竖）、
  `768x1024`（iPad 竖）、`1440x900`（桌面）
- 每档截 1 张，落 `game/data/evidence/<slug>/<NN>-<viewport>.png`（每次跑先清旧图，避免残留图冒充本次证据）
- 同时生成 `stamp.txt`：对 **`game/**` 下全部会改变玩家所见的源文件**（`.ts/.css/.html`，排除 `*.test.ts`）
  取 sha256，附 `git rev-parse HEAD`
- 判定：有图 + stamp 未过期 → 该格 pass；缺图 → 该格 `NOT_ASSESSED`（不是 fail，是要补）
- 空白截图（≤2 色）判「这一跑没渲染」，整格 `NOT_ASSESSED` —— 「零缺陷」不能建立在没画出来上
- 控制台 error 必须带 URL（只听 console 只知道 404、不知道 404 了谁，等于没报）

## 4. 证据生命周期（三态，不许静默通过）

`eye_gate.py check <stamp.txt>` 输出三种信息行：

| 输出 | 含义 | 是否改裁决 |
|---|---|---|
| `CHANGED: <file>` | 证据之后该文件被改过 → 图已旧 | 是（该格降 `NOT_ASSESSED`） |
| `GONE: <file>` | 被改动的文件已删除 | 是（同上） |
| `RECEIPT: NONE` | **根本没有 stamp** | 是（整格 `NOT_ASSESSED`） |

硬验收（负测试 K-08）：删掉 `stamp.txt` 后重跑 check，必须输出 `RECEIPT: NONE`
且**不得**返回 pass。若此项不成立，说明門只看图不看时效——等于没有门。

## 5. scope 对照

每次改动前先写「允许改的文件」，改动后跑：

```
git status --porcelain
```

凡出现在 porcelain 而不在允许清单里的文件 → `OUT OF SCOPE`（advisory）；
若该文件是 `game/src/sim/**` 或 `game/src/data/**` → 升级为 **BLOCKED**（静默改数值是最贵的错误）。

## 6. 与审核管线的接口

`game/data/review/review_log.jsonl` 每行包含：

- `gate_verdict`：四态之一（`from_review()` 映射：pass_auto→COMPLETE / reject_auto→BLOCKED / to_human→NOT_ASSESSED）
- `gate_reasons`：为什么落这个态（`NOT_ASSESSED` 必须能看出「什么能 settle」）
- `l0_rules`：逐规则 `{rule, ran, hits}`，`ran=false` 时 `hits=null`

「AI 弃权（to_human）」在统计上记 `NOT_ASSESSED`，**不计入错误率**——
弃权不等于判错，把它算成错会让判据越改越保守。

## 7. 本项目的待定项

| 项 | 状态 | 说明 |
|---|---|---|
| 眼睛绿是否进 CI | 待定 | 现为本地 `npm run gate:eye`；CI 需装 Chromium，ECS 上成本待测 |
| `full` 档人审轮次 | 待定 | 现为每批 1 轮，样本量未定 |
| 触摸实机证据 | 待定 | 无真机，暂以 Playwright 触摸事件近似 |
