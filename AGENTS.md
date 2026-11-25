# AGENTS.md · 开工协议（老友粉店）

> 这份文件是**给任何接手这个仓库的 AI 看的**。你是新来的开发者，玩家不可能用游戏开发术语向你描述问题，所以「按规矩办事」这件事必须写在仓库里、不靠记性。
> 每次开新会话，**先读这三份**，再动手：
> 1. 本文件（规矩）
> 2. `docs/ACCEPTANCE.md`（当期算什么算过关 —— 唯一入口，别再新开验收文档）
> 3. `.junshi/ledger.md` 最后三行（上一批做了什么、新记了哪些缺口 P###）

---

## 一、开工前必须加载的技能（按任务匹配，不是每次都全装）

| 技能 | 什么时候必须加载 |
| --- | --- |
| **`game-ui-ux`** | 任何**面板 / HUD / 弹窗 / 页签 / 字号 / 焦点 / 安全区 / 布局**改动。它给的是：锚点+容器不用绝对像素、参考分辨率缩放、安全区 inset、每屏要有初始焦点、屏幕栈、HUD 事件驱动、字号地板 26px@1080p。**改界面不加载它 = 违规**。 |
| **`create-game-assets`** | 要出**新美术**（图标、贴图、招牌字、包装贴纸、风格锚）时。 |
| **`performance-optimization`** | 掉帧、卡顿、GC 尖峰、绘制太多、包体变大时。 |
| **`input-systems`** | 键位、手柄、触屏、输入缓冲这类改动。 |
| **`office-docx` / `office-xlsx` / `office-pptx`** | 要交 Word / Excel / PPT 交付件时（先用 `office` 技能解锁工具）。 |
| **`project-memory`** | 想不起来「这条以前定过什么」时先查，别重新发明。 |

**关于「rea」和「Claude Game Studio」**：这两样**不是可加载的技能**。
- `REA` 是本机的逆向素材目录（`D:\项目\REA`），开罗拉面店的原始资源与取证都在里面；要对照「开罗怎么做的」就去翻 `REA/逆向/_逆向上游/TheRamenSensei/取证/`，**那是资料，不是工具**。
- 「Claude Code Game Studios」只在 `docs/评估-Claude-Code-Game-Studios-2026-11-09.md` 里评估过，没有装进本仓。真正装了、能用的是上表那四个。
- 外部插件 `dsh-game-studio` 的评估在 `docs/dsh-game-studio评估-2026-11-25.md`：**抄它的试玩契约，不要装它**。

> 如果某个技能名在这台机器上不存在，**直说「没有这个技能」，然后用手上的工具做完** —— 不要假装加载了，也不要因为没技能就停手。

---

## 二、五门（提交底线，一道都不能跳）

```powershell
cd D:\项目\REA\REA\重构\老友粉店\game
npx tsc --noEmit                              # 1. 类型
npx vitest run --no-file-parallelism          # 2. 全量测试（并行跑会假红！）
npm run -s build                              # 3. 构建
cd ..
python -X utf8 tools/gate/copy_gate.py        # 4. 文案红线（不许出现别的作品名）
python -X utf8 tools/gate/eye_gate.py shot --slug <本批slug>
python -X utf8 tools/gate/ai_gate.py          # 5. AI 落点在线体检 —— 跑完必须 npm run -s build
```

- `eye_gate` 会**清空** `game/data/evidence/<slug>`，所以**跑完要重跑本批探针**补截图。
- 本批如果动了界面，必须配套一个 `tools/gate/<本批>_probe.py` 探针，**全部 true 才算过**。
- 探针要连真界面（Playwright + `npx vite preview --port 424x --strictPort`，注意 preview **只听 IPv6**，URL 写 `http://localhost:PORT/`）。

### 二·五、另四道新门（批 AL′ 起，改到了才跑）

```powershell
python -X utf8 tools/gate/playthrough_gate.py --url http://localhost:4246/ --minutes 5   # 长跑：≥20 天、fps、堆、4xx 全在 /laoyou-api/、一天最多 3 次一句话接口
python -X utf8 tools/gate/framediff_probe.py --url http://localhost:4246/               # 帧差：同状态逐点比对（先 --save-baseline 存基准）
python -X utf8 tools/gate/debug_exit_gate.py                                            # 发布包：只许挂白名单里的 window.__ 出口
cd game; npm run -s gen:server                                                          # 条目清单：代码条数写进 game/data/entry-counts.json
```

- 跑测试偶发假红先看 `docs/FLAKY.md`，**不许靠重跑过关**。
- 帧差门只截 `.pane[data-pane='shop']` 且状态钉死；改文案后要重存基准，并在提交信息里写清「画面变了」。

---

## 三、数值纪律（最容易犯的错）

- **四种子是唯一基线**：`npm run -s probe:standin`，36 个月 × 4 个种子，取月均营收 / 日均碗数 / 总流失率 / 期末现金。
- **只改说法、只改界面、只加诊断**的批次：四种子必须**逐位不变**。变了就是偷偷动了经济。
- **改了「替身会不会用某个系统」**的批次（例如替身开始开袋装线）：四种子**必须变** —— 不变说明那个系统在替身里还是死的。
- **替身不是玩家**：它只按量尺行动。替身的数字好不代表玩家体感对；体感要看试玩报告与探针。
- 一条老规矩：**AI 不产数字**（数值只来自确定性模拟，AI 只产文字），**事件弹窗必须暂停时钟**。

---

## 四、每批交付物（缺一件都算没做完）

1. 代码 + 单元测试（新表/新出口都要有测试；`vitest` 用例数只增不减）
2. 探针 `tools/gate/<批>_probe.py`（全 true）+ 截图落 `game/data/evidence/<slug>/`
3. 文档 `docs/<这一批的名字>-<日期>.md`（**写清：开罗怎么做的 / 本作怎么做的 / 判据 / 探针清单 / 新缺口 / 复现命令**）
4. `docs/ACCEPTANCE.md` 改三处：日期、当期数字、当期文档链接
5. 账本 `.junshi/ledger.md` 追加一行 `### 行 N · 日期 · 标题` + 项目符号（**append-only，不许改旧行**）
6. commit（`feat(<范围>): batch <X>' - <一句话>`）+ push（`git push` 的 stderr 会让 PowerShell 报 exit 1，看 `git status -sb` 有没有 ahead）
7. 部署：`& .\deploy\deploy-cli.ps1 -SkipBuild`，**同时只能有一个 deploy job 在跑**（两个会撞远端 `/tmp/sb/NNN.b64`）
8. present（文档 + 一张最能说明问题的截图；**用绝对路径**，文件名含 `′` 时相对路径会找不到）

---

## 五、缺口怎么记、怎么挑

- 任何「知道但这次没做」的事，立刻记成 **P###**，写进本批文档的「新缺口」小节 + 账本。号码连续，不复用。
- 下一批从 `docs/ACCEPTANCE.md` 第五节「还剩什么」里挑，**优先带 bug 性质的那条**，其次「玩家看得见但说不清」的那条。
- 只改说法/界面的批次也要挑缺口 → 否则界面会停在「能点但看不懂」。
- 缺口清单里要能回答：**判据是什么**（怎么算做完）、**为什么现在不做**。

---

## 六、这台机器上的坑（踩过多次，别再踩）

| 坑 | 应对 |
| --- | --- |
| PowerShell 里 `python -X utf8 -c "…中文/引号/括号…"` | 引号必被吞或 `ParserError`。**一律** `write` 落 `game/.tmp_*.py`（首行 `# -*- coding: utf-8 -*-`，路径写绝对前缀）再 `python -X utf8` 跑 |
| `Set-Content -Encoding utf8` | 会给文件加 **BOM**，TS 直接炸。改文件用 `edit`/`write` 工具；已加 BOM 用 python `encoding='utf-8-sig'` 读、`utf-8` 写回 |
| `[IO.File]::ReadAllText("相对路径")` | 按**进程 CWD**（`D:\项目\REA`）解析，不认 `cd` |
| `npx vite preview` | 只听 IPv6；后台 job 上限 10 个，旧的先 `job_kill` |
| 面板缓存键 | 新字段进了状态但没进 `renderX` 的 key → 界面不重画（**已踩 13 次**）。加字段时同步 key |
| `let` 的 TDZ | 模板字符串里调读闭包变量的函数，那个变量必须在上方已声明（白屏且无报错） |
| 批量改数字 | 全局替换 `toBe(36)` → 会误伤「技法节点 36」「四档九档 36 句」。**按语义逐条核** |
| `git push` | stderr 让 PowerShell 报 exit 1；看输出里 `OLD..NEW HEAD -> main` 或 `git status -sb` |

---

## 七、和玩家（老板）怎么对话

- 他不用游戏开发术语。**你不要问「你要不要加 ECS」这种问题**，而是给「一句话是什么 + 一张表 + 我的建议 + 要不要现在做」。
- 拿不准的用**决策地图**：选项 A/B/C、各自代价、推荐哪个、推荐理由（`docs/决策地图-*.md` 是既有范式）。
- 每批交付后给一段**述职**：这批修了哪几条、数字怎么动的、还剩什么、下一步建议。**不要只报「已完成」。**
