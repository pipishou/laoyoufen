# dsh-game-studio 深度评估：能借什么、不能借什么

> 结论先说：**它做的是「一句话造一个小游戏」，我们做的是「一款经营模拟」。**
> 所以它的**产物形态**（单个 `game.js` + `game.json` + 模板）用不上，
> 但它的**试玩契约与报告形状**值得抄，而且我已经抄了一遍、在我们游戏上跑通了 ——
> 顺手逮到一个我们现有门从没量化过的问题（P429）。

## 一、它到底是什么（读的是哪个版本）

| 项 | 值 |
| --- | --- |
| 仓库 | `https://github.com/ZSeven-W/dsh-game-studio`（`ZSeven-W`） |
| 版本 / 许可 | `@zseven-w/dsh-game-studio` **0.1.0-rc.6** / **MIT** |
| 体量 | 仓库 9.6 MB；`src/` 25 个文件约 **501 KB**；`test/` 8 个 `.mjs` |
| 最近推送 | 2026-11-21；⭐ 906 |
| 形态 | DSH 客户端插件（`src/client/index.tsx` 侧栏）+ **一个 MCP 服务**（`src/mcp-server.ts`，47 KB） |
| 模板 | 两套：`collector`（2D Canvas）与 `voxel`（Three.js 体素，`vendor/three.js` 随包） |

MCP 一共 **20 个工具**，我按「对我们有没有用」分了三堆：

| 堆 | 工具 | 对我们的意义 |
| --- | --- | --- |
| **能借** | `game_studio_playtest`（无人值守试玩）、`game_studio_generate_asset` / `apply_asset` / `revert_asset`（AI 美术候选 + 回退）、`game_studio_versions` / `restore_version`（版本回退）、`game_studio_share`（局域网/隧道预览） | 试玩契约与报告形状；AI 美术的**候选 → 审批 → 一键替换 → 可回退**这套流程 |
| **用不上** | `create`、`build`、`export`、`export_wall`、`export_wechat`、`upload_wechat`、`publish`、`list` | 全是「单文件小游戏」的产物管线，我们走 Vite 构建 + 阿里云静态站 |
| **看情况** | `game_studio_asset_*` 的 slot 体系、`pricing` / `spend`（花费审批） | slot 绑定它自己的 `game.json`；但「花之前先报账、没人批准就不花」这条纪律可直接搬 |

## 二、它的试玩是怎么做的（这是我们最该看的部分）

`src/playtest.ts`（34 KB）干的事，一句话：**用本机 Chrome/Edge + `playwright-core` 开一个无头页面，让游戏自己「玩」自己，然后交一份带截图的体检报告。**

关键设计，逐条抄在这里（都是我们缺的）：

1. **契约先行**：游戏必须暴露 `window.__gameState()`，返回
   `{ phase: "title"|"playing"|"won"|"lost", score, hearts, fps, hero:{x,y}, pickups[], enemies[], world:{w,h} }`；
   不是「一个人拿方向键跑」的类型（明确点名了 **grid / cards / aiming / rhythm / building / management**），
   就再暴露 `window.__autoplay(state)`：**每秒调大约 10 次**，每次做一个合理动作。
   ——「管理」这一类，被它写进了契约里。
2. **循环**：`read() → 采样 fps → __autoplay 一次 → 每 100ms 一拍 → 中途截一张 mid → 结尾截 end`；
   `phase` 一变就停。`rules` 可以只对这一跑生效（比如 `{"duration": 3}` 让它快点到结算）。
3. **报告字段**：`browser / viewport / phases[{phase, at}] / finalPhase / fps{min,avg} / errors[] / requests[] / shots[]`。
   fps 取的是**游戏自己报的** `state.fps`（不是外面量的）。
4. **报错与 4xx 分开记**：`console error` + `pageerror` 各进 `errors`，HTTP ≥ 400 进 `requests`。
5. **微信小游戏模拟**：注入 `wx.*`、画右上角胶囊 `(291,51)–(378,83)`、统计 `__wxWebglContexts`（>1 就警告，因为真机只支持 1 个 WebGL 上下文）。
6. **导出前审计**：主包 ≤ **4,194,304 B**、`.svg` 槽位光栅化成 `.png`、生成 `WECHAT_SUBMISSION_DRAFT.md`。
7. **花钱先问**（`spend.ts` / `pricing.ts`）：按 OpenAI 列表价算这一张图大概多少钱，通过宿主自己的审批弹窗问；**没人可问就 fail closed，绝不偷偷花**。

`skills/game-studio/SKILL.md` 只有 42 行，但把纪律写死了：「读 `game.json` 再改」「保留 `__gameState`/`__autoplay` 否则下次试玩就退化成只按方向键」「别自己写 Playwright 脚本，用 `game_studio_playtest`」。

## 三、和我们的现状对比

| 能力 | 我们 | 它 | 差距判断 |
| --- | --- | --- | --- |
| 无头浏览器截图 | `tools/gate/eye_gate.py`：5 个视口、空白检测、色数、stamp | `playtest`：mid/end 两张 + 分辨率随平台 | 我们视口更全，**它多了「边玩边拍」** |
| 控制台与 404 | `eye_gate` 记 error 与 4xx（每次 10 条，全是预览 `/laoyou-api/` 404） | 同样记，但跑几分钟累计 | **它能把「累积」变成数字** |
| 帧率 | 没有 | `fps{min,avg}` | **缺** |
| 玩法推进 | 纯模拟层替身（`standin.probe.ts`，36 个月四种子） | 真在 UI 上点按钮 | 我们**只在数据层验**，没在界面层连跑过 |
| 断网/接口挂掉 | 无专门门 | 记 `requests` | **它顺手暴露了 P429** |
| AI 美术 | 21 个像素图标全是手写 rect 拼块 | 生成候选 → 编号挑选 → 一键替换 → 可回退 | 我们**没有**这条流程 |
| 版本回退 | git | 自带版本快照 + `restore` | git 够用 |
| 分发 | 阿里云静态站 + 自建部署脚本（含事件表对账） | 单文件 HTML / 微信小游戏 / GH Pages / 隧道 | 各有各的路，**不重叠** |

## 四、实测：把它的契约抄到我们游戏上

我照它的设计写了 [`tools/gate/autoplay_probe.py`](../tools/gate/autoplay_probe.py)（约 200 行，Python + 我们已有的 Playwright），
把两个契约函数注入页面：

- `__gameState()`：`phase` 用「报账单有没有挂着」推，`score` = 现金，`hearts` = 座位数，
  `fps` 自己在页面里用 `requestAnimationFrame` 数（我们的游戏不吐 fps），`time` = 月×30+日；
- `__autoplay(state)`：① 有事件就点第一个选项 → ② 报账单挂着就点 `[data-day-next]` → ③ 没开门就点 `[data-openpill]` 并把时间倍速拉到最快 → ④ 否则等。

三次跑的实测结果（1440×900，无头 Chromium）：

| 跑时长 | 推进 | 动作统计 | fps(min/avg) | 控制台 error | 4xx |
| --- | --- | --- | --- | --- | --- |
| 45 s | 第 1 天 09:00 | open 380（**全是空转**） | 58 / 60 | 8 | 8 |
| 180 s | 第 23 天 | open 23 · next-day 22 · event 6 · wait 1386 | 56 / 60 | 247 | 247 |
| 300 s | 第 **37** 天 | open 37 · next-day 36 · event 8 · wait 2322 | **47 / 60** | 400 | 400 |

三条读法：

1. **它真的能玩起来**：一局 5 分钟走了 37 个游戏日（开门 → 营业 → 报账 → 明天），中间自己答了 8 次街边事件。
   这意味着「在真实界面上连着推进几十天」这件事我们以前**从来没做过**。
2. **契约得改**：我第一版把「报账单挂着」当成 `phase: "won"`，结果第 8.1 秒就翻成 won —— 
   按它的循环逻辑会立刻停（`if (state.phase !== "playing") break`）。
   我们是连续经营，没有输赢；**要用它，第一个要改的就是 `phase` 语义**（它其实把这条缝留给了 `__autoplay`，但 phase 仍会掐断循环）。
3. **它顺手逮到一个我们没量化过的问题**：400 条 4xx 全是预览环境缺 `/laoyou-api/`，
   但拆开看是 **`/laoyou-api/line` 389 次 / 37 天 ≈ 10.5 次/天**。
   查代码（`game/src/ai/lines.ts:657` 的 `fetchLine`）：失败**不进缓存、也没有冷却**，
   所以服务端一挂，每一句都照发，每次还吃满 800ms 超时。线上有真接口时不明显，
   断网/接口抖动时就是「10 次/天 × 无数台设备」的空转。**记作 P429。**

一次空转的教训也留在探针里：45 秒那版把「按钮存在」当成「按钮能用」，
开门后被置灰仍算成功，记了 380 次 `open`。改成 `usable = 可见 && !disabled` 才有意义 —— 
这跟批 AJ′ 学的「守卫成本要看得见」是同一件事。

## 五、能用在哪（按性价比排）

1. **长跑试玩门（值得做，性价比最高）**
   把 `autoplay_probe.py` 从「评估脚本」升成一条门：**≥5 分钟、≥20 个游戏日、fps 不得低于某阈值、error 只能是白名单、4xx 必须全在 `/laoyou-api/`**。
   它补的是我们现在唯一的空白：**界面层能不能连着跑几十天**（现有探针都是点到为止）。
   代价：一次 5 分钟，跑五门时可以只在收尾批次跑。
2. **报告形状统一（值得抄，成本近零）**
   `phases[{phase, at}] / fps{min,avg} / errors[] / requests[] / shots[]`。
   我们的 `run.json` 已经有 error/4xx 与截图，补 `fps` 与 `phases` 两个字段即可，
   这样不同门之间的报告可以直接横向比。
3. **AI 美术候选流程（值得借，但要自建）**
   它的价值不在「调哪个模型」，而在流程：**候选出图 → 侧栏按编号挑 → 一键替换 → 可回退 → 事先报账**。
   我们的 21 个图标现在全是手写 rect，换成「代码画打底 + 需要时出候选」也不会更好看，
   但**招牌字、店内小图、道旗、包装盒贴纸**这类「要一点手绘味」的地方用得上。
4. **微信小游戏 / 单文件导出（看情况）**
   它做了 4 MB 主包审计、`.svg` 光栅化、胶囊安全区、单 WebGL 检查。
   如果哪天要做「扫码手机玩」，这些坑它都踩过了，可以直接照抄清单；
   但我们现在是「静态站 + 手机视口门」，**没必要为此改架构**。

## 六、不建议照搬的四条

1. **workspace / project 结构**（`game.json` + `versions` + `assets` 账本）：我们的真相在 `game/src/data/*.ts`，搬过去等于把内容分家（P344 的教训）。
2. **单 `game.js` 双模板**：我们的体量是 60+ 个 TS 模块、1700+ 条 id，塞进一个文件就失去类型与测试。
3. **`rules` 覆盖（只对这一跑生效）**：听起来很美，但我们的难度来自数据表与替身，加一层「试玩时改规则」会让门与真局分叉。
4. **publish 到 GH Pages**：我们已经有一套带事件表对账的部署脚本（`[1.5/5] server table`），换过去是纯损失。

## 七、如果要做，落地方案（三步）

| 步 | 做什么 | 判据 | 估时 |
| --- | --- | --- | --- |
| 1 | `autoplay_probe.py` 硬化成 `tools/gate/playthrough_gate.py`：20 天、fps 下限、error 白名单、**失败时点名是哪条 URL/哪句报错** | 连跑三次结果一致；故意把 `fetchLine` 改成死循环能被抓 | 半天 |
| 2 | 把 `fps` 与 `phases` 补进 `eye_gate` / 各探针的 `run.json` | 报告字段齐，`ACCEPTANCE.md` 增加一节「怎么读报告」 | 半天 |
| 3 | P429 修掉（失败冷却：失败一次后 N 分钟不再发，或负缓存 60s） | 断网环境下 5 分钟跑，`/laoyou-api/line` 请求数 ≤ 天数×2 | 两小时 |

## 八、风险与代价

- **外部依赖**：它的试玩依赖 `playwright-core` + 本机 Chrome/Edge。我们已经有 Playwright，**这条风险已经在付**；装它的包则多一层 RC 版本（`0.1.0-rc.6`）的变更风险。
- **模板耦合**：`playtest` 是围着 `game.json`/`versions`/`assets` 账本写的，**直接拿来跑我们的 dist 跑不动**（它读的是 Studio 项目目录，不是我们的 `dist/`）。这也是为什么我选择「抄契约」而不是「装插件」。
- **迁移成本**：真要用它的工具，得把 `dist/assets` 塞进它的项目结构、或者给它加一个「external project」入口 —— 都是改上游的活，不值。
- **它自己的质量**：905 star、`test/` 只有 8 个 `.mjs`，`playtest` 无单测（只有 `studio.test.mjs` 间接覆盖），属于「作者自用得很顺、边界靠契约兜」的工程。

## 九、复现

```powershell
# 只读评估：克隆到项目外
git clone --depth 1 https://github.com/ZSeven-W/dsh-game-studio.git D:\项目\REA\_plugins\dsh-game-studio

# 实测：起预览（4244 已在跑则跳过）
cd D:\项目\REA\REA\重构\老友粉店\game ; npx vite preview --port 4244 --strictPort

# 照它的契约跑我们自己的游戏
cd D:\项目\REA\REA\重构\老友粉店
$env:PYTHONIOENCODING="utf-8"
python -X utf8 tools\gate\autoplay_probe.py --url http://localhost:4244/ --seconds 300
# → game/data/evidence/autoplay/{run.json,01-title.png,02-mid.png,03-end.png}
```

`run.json` 里能直接看到：`actions`（每种动作各几次）、`phases`、`fps`、`errors`、`requests`、`hud`（收尾时的顶栏与「为什么」那行）。
