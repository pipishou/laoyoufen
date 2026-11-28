# -2 窗 · 批 BH′ 任务书（2026-11-28 21:5x 下达）

> 这份文件是**主窗写给 -2 窗的开工令**。主窗 = `session-9d96182c-…`（`cs_K0xBRZbDid`）。
> 你干完这一批，把结果追加到本文件末尾，再用 `session_reply` 回主窗。

---

## 0. 你这次**不在**主检出里干活

主检出 `D:\项目\REA\REA\重构\老友粉店` 归主窗独占（主窗同时在改 `telemetry.ts`）。
你的工作目录是 **git worktree**：

```
D:\项目\REA\REA\重构\老友粉店\.agents\worktrees\fork2
```

- 分支 `batch/bh-2seat`，基线 commit `cb56b3a`。
- `node_modules` 已经用 junction 接好（`npx tsc` / `npx vitest` 都验过能跑）。
- **不要** `cd` 回主检出写任何文件；**不要**在主检出里跑 `npm run build`（会抢 `game/dist/`）。
- 交接文件写到**主仓库**路径：`D:\项目\REA\REA\重构\老友粉店\.junshi\handoff\fork2.md`（不是 worktree 里那份）。

---

## 1. 开工三读（按顺序，都在 worktree 里读）

```
.agents/worktrees/fork2/AGENTS.md
.agents/worktrees/fork2/docs/ACCEPTANCE.md
.agents/worktrees/fork2/.junshi/ledger.md   ← 只看最后三行（行 168/169/170）
```

然后按任务加载技能：**必须真的调 `skill` 工具**加载 `laoyoufen-batch`；
本批动界面（建店卡）⇒ **还要加载 `game-ui-ux`**。

---

## 2. 这一批做什么：**「2 座档不再是陷阱」**（P545 + P547 + P548）

### 为什么要做（证据，不是猜的）

线上 97 局真实试玩数据的硬事实：

| 首日座位 | 局数 | 中位天数 | ≥5 天比例 | 最长 |
|---|---|---|---|---|
| **2 座（免费的「街边摊」）** | **48** | **2.0 天** | **0%（0/48）** | 4 天 |
| 4 座（巷内小店） | 39 | 5.0 天 | 56% | 12 天 |
| 6 座（临街铺面） | 10 | 5.0 天 | 70% | 5 天 |

48/97 的玩家选了**免费的**街边摊（开局现金 ¥30,000，三档铺位的转让费是 ¥0 / ¥15,000 / ¥28,000，全都付得起），
于是拿到 2 座。而 2 座的理论产能是 `2 × 120 × 0.9 / 6.6 ≈ 32.7 碗/天`，
第一天就丢 38% 的客人（同数值下 4 座是 0%、6 座是 0%）。
**玩家看到的是「开门就有人掉头走」，会误判成「我定价错了」，然后调价、然后一天就退出。**

主窗实测（同数值只换铺位，种子 1/2/3 平均，前 7 天）：

| 铺位 | D1 卖出 / 走掉 | D7 | 七日流失 |
|---|---|---|---|
| 2 座 stall | 36 / **22（38%）** | 35 / 39 | 51% |
| 4 座 alley | 64 / **0（0%）** | 74 / 111 | 51% |
| 6 座 streetfront | 72 / **0（0%）** | 111 / 183 | 49% |

三条缺口（都记在 `docs/ACCEPTANCE.md` 第五节之三十一）：

- **P545** 免费「街边摊」2 座 = 每天最多 33 碗，48/97 玩家选了它、0 局活过第 5 天。
  判据：**2 座首日流失 ≤25%**。
- **P547** `spawnScaleByDay` 只按天数分档、不按座位数，2 座第一天就 38% 流失。
  判据：**分档要乘一个跟 `state.venue.seats` 有关的系数**。
- **P548** 建店卡只写「N 座 / N 口灶 / 月租」，不写日产能，玩家事前无法判断。
  判据：**卡片上有一行「一天最多约 N 碗」**。

---

## 3. 你要改的文件（**只有这 5 个，别扩散**）

| 文件 | 改什么 |
|---|---|
| `game/src/sim/customer.ts` | `spawnScaleByDay(state)`（约 `:302-307`）加座位系数 |
| `game/src/sim/bottleneck.ts` | 把 `EAT_MINUTES`（`:52`）、`SEAT_IDLE`（`:62`）**export 出去**；可加一个纯函数算「给定座数的日上限」 |
| `game/src/data/sites.ts` | 加一个纯函数 `dailyBowlCeiling(site)`，给建店卡用 |
| `game/src/ui/setup.ts` | 建店卡（约 `:121-143`）加一行日产能 |
| `game/src/sim/setup.test.ts` | 新增断言（原有断言不许删） |

新测试文件也可以建（例如 `game/src/data/sites.test.ts`）。
**绝对不要碰**：`telemetry.ts`、`telemetry.test.ts`（主窗正在改，碰了必冲突）。

---

## 4. 两条硬约束（这两条决定这一批算不算过）

### 约束 A：`seats >= 4` 的行为必须**一个字节都不变**

四种子基线（`npm run -s probe:standin`，主窗刚跑过、逐位不变）：

```
[替身 1] 月均 ¥136,294 · 日均 235.7 碗 · 流失 34% · 期末 ¥303,313
[替身 2] 月均 ¥121,201 · 日均 212.9 碗 · 流失 35% · 期末 ¥402,821
[替身 3] 月均 ¥132,802 · 日均 238.8 碗 · 流失 32% · 期末 ¥272,230
[替身 4] 月均 ¥137,872 · 日均 244.8 碗 · 流失 33% · 期末 ¥358,805
```

替身全程 `seats = 4`（`createInitialState` 的 `START_SEATS`，替身从不调 `openForBusiness`）。
所以你只要保证 **`seats >= 4` 时系数恒等于 1.0**，四种子就必然逐位不变 ——
不用你自己跑替身（那是主窗的活，282 秒，别跟主窗抢 CPU）。
你可以用单测钉住这一点：`expect(spawnScaleByDay(stateWith4Seats)).toBe(原来的值)`。

### 约束 B：2 座首日流失 ≤25%，4 座首日仍然是 0%

这就是 P545 的判据。**形状建议**（可以自己调，但别偏离太多）：

```ts
export function spawnScaleByDay(state: GameState): number {
  // 座位系数：4 座是基准（1.0），少于 4 座按比例压客流。
  // 为什么按 sqrt：线性会让 2 座第一天完全没人来，玩家看不到「忙」的感觉。
  const seatFactor = state.venue.seats >= 4 ? 1 : Math.sqrt(state.venue.seats / 4);
  ...
  return base * seatFactor;
}
```

按这个形状粗算：2 座 D1 系数 `0.55 × 0.707 ≈ 0.389`，到店从 ~58 人降到 ~41 人，
2 座能卖 36 碗 ⇒ 走 5 人（12%）⇒ 达标，且第一天仍然「有人排队」。

**测量方法**：写一个临时探针（参考主窗那份的做法），或者直接复用
`game/src/sim/start.probe.ts`（它是 `describe/it` 形式的 vitest 探针，会 `console.log` 前七天表）。
用 `npx vitest run src/sim/start.probe.ts --no-file-parallelism` 跑，看输出的「到店/卖出/走掉」列。
种子用 1/2/3 各跑一遍取平均。

> 提醒：探针临时文件命名成 `game/src/sim/_tmp_bh_*.probe.ts`，**跑完删掉**，别提交。

---

## 5. P548 建店卡那一行怎么写

现在卡片（`game/src/ui/setup.ts:127-136`）是：

```html
<div class="sstats">
  <span>${site.seats} 座</span><span>${site.stoves} 口灶</span><span>月租约 ${yuan(rentOf(site))}</span>
</div>
```

要加一行「一天最多约 N 碗」。N 用 `dailyBowlCeiling(site)`，公式就是
`seats × 120 × 0.9 / 6.6` 向下取整（`DAY_MINUTES × SEAT_IDLE / EAT_MINUTES`，从 `bottleneck.ts` 引常量）。

写法要求（`game-ui-ux` 技能 + 本仓规矩）：

- 玩家看不懂「产能」这个词，写「**一天最多约 33 碗**」这种人话。
- 2 座那档要**明确劝一句**，而不是只给数字 —— 例如加一句
  「**先摆两张矮桌，接不住就加凳**」（已经在 `site.pitch` 里有的意思就别重复）。
  更好的做法：在 `.sbadge`（现有 `data-badge`）里给 2 座打一个「起步档」标记。
- **不要**用绝对像素；卡片是 flex 容器里的一项，加 `<span>` 让它自然换行。
- 字号地板：正文不低于 `hud.css` 现有的 token（别自己写 `font-size: 12px`）。

跑完 `npx tsc --noEmit` 必须 0 error（这块是 DOM 字符串拼接，TS 不查，但要保证没有未定义变量）。

---

## 6. 这一批必跑的门（在 worktree 里跑）

```powershell
cd D:\项目\REA\REA\重构\老友粉店\.agents\worktrees\fork2\game
npx tsc --noEmit                                   # 必须 0 error
npx vitest run --no-file-parallelism               # 全量，112 文件 1136 例的基线只许多不许少
```

**不要跑**（主窗独占，会撞）：
- `npm run -s probe:standin`（282 秒纯 CPU，主窗要跑）
- `npm run -s build`（抢 `game/dist/`）
- `npx vite preview --port 4246`（主窗的预览端口）

如果要起 preview 验证建店卡，**用 4247**：
```powershell
npx vite preview --port 4247 --strictPort
# URL 必须写 http://localhost:4247/ （preview 只听 IPv6）
```

界面改动的证据：用 `tools/gate/eye_gate.py` 之前先看清它**会清空** `game/data/evidence/<slug>`
—— worktree 里跑没关系（那是你自己的工作副本），slug 用 `bh-2seat`。

---

## 7. 干完之后

1. 在 worktree 里 commit（**不要 push**，主窗统一处理）：
   ```
   git add -A
   git commit -m "feat(sim): batch BH' - the free two-seat stall is no longer a trap (P545 P547 P548)"
   ```
2. 把下面这段填好，**追加到本文件末尾**（`D:\项目\REA\REA\重构\老友粉店\.junshi\handoff\fork2.md`）：

```markdown
## BH′ 交付（-2 窗，<时间>）

- worktree: `.agents/worktrees/fork2`，分支 `batch/bh-2seat`，commit `<sha>`
- 改了哪些文件（逐个列，带行号区间）：
- `spawnScaleByDay` 终版代码（贴出来）：
- 三类证据：
  - 2 座首日流失：__%（判据 ≤25%）
  - 4 座首日流失：__%（判据 0%）
  - `seats >= 4` 系数恒 1.0 的单测：`<测试名>`
- `npx tsc --noEmit`：__ error
- `npx vitest run --no-file-parallelism`：__ 文件 __ 用例（全过 / 有红）
- 建店卡新增那一行的最终文案（原文照贴）：
- 没做到的 / 发现的坑（如果没有就写「无」）：
```

3. 用 `session_reply({ to: "cs_K0xBRZbDid", text: "<一句话进度 + 那个百分比>" })` 回主窗。

---

## 8. 边界（越界会毁掉两边的工作）

- **只写** worktree 里那 5 个文件 + 你新加的测试/探针文件。
- **只读不写**：`docs/ACCEPTANCE.md`、`.junshi/ledger.md`、`game/src/ui/panels.ts`、
  `deploy/`、`game/src/sim/telemetry.ts`。
- 文档、ACCEPTANCE、账本、commit 汇总，**全部由主窗统一写**，你别动。
- 服务器不要碰（`aliyun` / nginx / 部署），那是主窗的活。

---

## BH′ 交付（-2 窗，2026-11-28 22:16）

- worktree: `.agents/worktrees/fork2`，分支 `batch/bh-2seat`，commit `8f5b2b2b90d88433cc8d2ae7c27ec0feda1ef07e`（基线 `cb56b3a`，**未 push**）
- 改了哪些文件（逐个列，带行号区间）：
  - `game/src/sim/customer.ts:296-336` —— `spawnScaleByDay` 重写（乘座位系数）、`SEAT_BASE = 4`、新增 `export function spawnSeatFactor(seats)`
  - `game/src/sim/bottleneck.ts:62`（`SEAT_IDLE` 加 `export`）、`:64-76`（新增 `seatBowlCeiling`）、`:141`（`capacityOf` 改调它）、`:264`（`capacityGain` 改调它）
  - `game/src/data/sites.ts:19`（`import { seatBowlCeiling }`）、`:90-104`（新增 `dailyBowlCeiling`）
  - `game/src/ui/setup.ts:13`（import `dailyBowlCeiling`）、`:45-47`（`startTagOf`）、`:106`（badge 用它）、`:148`（卡片新增 `<span class="sbowls" data-bowls>`）
  - `game/src/ui/setup.css:109-116`（`.sstats span.sbowls` —— **这是第 6 个文件，任务书写 5 个**；不加样式那行字跟其余三枚统计同色，看不出是重点，7 行、只动 `setup.css`）
  - `game/src/sim/setup.test.ts:5,9`（import）、`:184-255`（新增 `describe("2 座档不再是陷阱（批 BH′）")` 5 例）
  - `game/src/data/sites.test.ts`（新文件，3 例）
  - `game/data/evidence/bh-2seat/`（`01-bh-setup-1440x900.png` 118,931 B / `02-bh-setup-375x667.png` 32,372 B / `card.json`）
- `spawnScaleByDay` 终版代码（贴出来）：

```ts
export function spawnScaleByDay(state: GameState): number {
  // 座位系数（批 BH′ / P547）：4 座是基准，少于 4 座按 sqrt 压客流。
  const seatFactor = spawnSeatFactor(state.venue.seats);
  if (state.month !== 0) return seatFactor;
  if (state.day <= 1) return 0.55 * seatFactor;
  if (state.day <= 7) return 0.85 * seatFactor;
  return seatFactor;
}

/** 座位基准：从这里往上不再压客流（替身全程 4 座，所以它的数字一个字节都不会变） */
const SEAT_BASE = 4;

export function spawnSeatFactor(seats: number): number {
  if (seats >= SEAT_BASE) return 1;
  return Math.sqrt(Math.max(0, seats) / SEAT_BASE);
}
```

- 三类证据：
  - 2 座首日流失：**20.1%**（判据 ≤25%；改前 38.1%。逐种子 35卖/13走=27.1%、39卖/14走=26.4%、33卖/0走=0.0%，探针配平下）
  - 4 座首日流失：**0%**（判据 0%；种子 1/2/3 全 0，卖出 64.0 碗与改前逐位相同）
  - `seats >= 4` 系数恒 1.0 的单测：`src/sim/setup.test.ts:217` 「座位系数：4 座及以上恒等于 1.0 —— 替身全程 4 座，四种子一个字节都不许动」（`for (const seats of [4,5,6,8,12]) expect(spawnSeatFactor(seats)).toBe(1)`）
  - 另：2 座 D2 42% / D3 37% / D4 32% / D5 21% / D6 29% / D7 25%（第 1 天最扎眼，第 5 天起和 4 座一样稳）；6 座 D1 71.7 卖 / 0 走，与改前逐位相同
- `npx tsc --noEmit`：**0** error
- `npx vitest run --no-file-parallelism`：**113 文件 1144 用例**（全过；基线 112/1136 ⇒ +1 文件 +8 例）
- 建店卡新增那一行的最终文案（原文照贴）：`一天最多约 33 碗`（街边摊）/ `一天最多约 65 碗`（巷内小店）/ `一天最多约 98 碗`（临街铺面）；2 座那档的 badge 从空变成 `起步档`。DOM 实测：`.sstats` 里第四枚统计为 `一天最多约 33 碗`，`font-size 11px / weight 700`，375px 视口单列三卡各 309px、`boxScroll 0 / gridScroll 0`、`PAGEERRORS []`
- 没做到的 / 发现的坑（如果没有就写「无」）：
  1. **「一天最多约 N 碗」是座位闸，不是承诺。** 它算的是 `seats × 120 分 × 0.9 / 6.6 分`（座位坐满、不空转），真正的闸还可能是来客量与日上限：6 座合同算 98 碗，探针配平下 D1 只卖 72、到第 7 天能卖 113。文案用了「最多约」，但玩家可能读成「今天能卖完」——若主窗要更稳，可改成「座位上限约 N 碗」。
  2. **界面证据没走 preview**：任务书禁止 `npm run -s build`（抢 `game/dist/`），所以没有 dist 可 preview。改用 `npx vite --port 4247 --strictPort --host localhost`（dev server 按需编译，不写 dist）截的图，跑完已 `job_kill`。`eye_gate.py` 没跑（它会清空 slug 目录且要连 preview 端口）。
  3. **`game/src/ui/setup.css` 是第 6 个文件**（任务书写 5 个）。只 7 行、只在 `.sstats span` 之后加一条 `.sbowls` 强化样式，不改栅格与字号地板。
  4. `SEAT_IDLE` 从模块常量改成 `export`，是为了让 `data/sites.ts` 与模型共用同一个算式；`capacityOf` / `capacityGain` 的浮点运算顺序没变（`(seats * DAY_MINUTES * SEAT_IDLE) / EAT_MINUTES` 原样搬进函数），所以 4 座以上的 `capacity.total` 逐位不变 —— 这条由全量 1144 例（含 `advice` / `bottleneck` 相关断言）兜住。
  5. 2 座首日到店从 58 人降到约 41 人（`0.55 × 0.707`），仍会排一点队：这是有意的，2 座不该「来多少接多少」，但也不该第一分钟就掉头走光。
  6. **四种子没有实跑**（任务书禁止 `probe:standin`，主窗独占）。替身全程 4 座 ⇒ 座位系数恒 1.0，理论上逐位不变；这一条要主窗跑完替身来钉。
