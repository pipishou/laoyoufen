# P37：热卖槽（照开罗 Ramen Frenzy）

日期：2026-11-15 · 提交：`feat(frenzy)` · 前置：`docs/出餐吞吐P35-2026-11-15.md`、`docs/中期节奏P24-2026-11-15.md`

## 0. 三句话

1. 开罗的中期节奏里还有一件我们完全没有的东西：**Ramen Frenzy　——　门口排队 + 客人吃到喜欢的面 → 机器上的槽涨满 → 一大批人来**。
2. 已按它的三条原句实现：涨槽条件（排队 + 满意）、满了维持 30 分钟、期间来客翻倍/来客钱包高一档/店员 aura 涨满意度，另外补了「并行槽 ×1.25」（对应原文 *your staff will get auras*）。
3. **实测它目前不是收益放大器，而是节律器**：替身 36 个月触发 **390 次**（约每 2.7 天一次），但月均营收只从 ¥20,534 变到 **¥20,557（+0.1%）**——因为替身常年产能饱和（流失 62%），热卖期间多来的人照样做不出来。这一点写进 P38，不粉饰。

## 1. 开罗原句（`help.txt`）

| 出处 | 原文 |
|---|---|
| `Ramen Frenzy 1` | 「When you have a line outside your shop and customers are eating ramen that they like, the ramen frenzy gauge above the vending machine will start to fill up. **When it is completely full, a frenzy will occur.**」 |
| `Ramen Frenzy 2` | 「When a ramen frenzy occurs, **many customers come**, so you can expect a boost to your sales. In addition, the **stats of customers coming to your shop will increase**, and your **staff will get auras**.」 |

三个条件、三个效果，正好对上可以落地的参数：

| 原文要素 | 本作参数 |
|---|---|
| 门口有人排队 | `waiting >= FRENZY_MIN_QUEUE`（1） |
| 客人吃到喜欢的面 | 今日满意度均分 `>= FRENZY_MIN_SAT`（60） |
| 槽涨满 | `FRENZY_MAX = 100`，每分钟 `+5`，不满足则 `−2` |
| 很多人来 | `spawnChance × FRENZY_SPAWN_BOOST`（2.0）＋区客流池 `× 1.3` |
| 来客 stats 更高 | 来客钱包 `× 1.15`（看价牌那一关也按抬过的钱包算） |
| staff get auras | 满意度 `+4`；并行槽 `× 1.25` |
| 持续 | `FRENZY_MINUTES = 30`（一天 120 分钟，≈ 1/4 天） |
| 防刷 | 热卖结束后 `FRENZY_COOLDOWN_MINUTES = 240`（2 天）槽不涨 |

## 2. 改了什么

| 文件 | 内容 |
|---|---|
| `game/src/sim/frenzy.ts`（新） | 槽推进 `frenzyTick(state, waiting, satToday)`；查询 `frenzyActive / frenzySpawnBoost / frenzyPoolBoost / frenzyBudgetBoost / frenzyAura / frenzyServeBoost / frenzyLeftMinutes`；时间基准 `absMinuteOf(state)` |
| `game/src/sim/state.ts` | 新增 `FrenzyState { gauge; until; restUntil; count }`、`flow.lastFrenzy`；`SAVE_VERSION 11 → 12` |
| `game/src/sim/save.ts` | v11→v12 迁移：补 `frenzy`（槽空/未热卖/无冷却/0 次）与 `flow.lastFrenzy`，字段类型非法也逐个兜底 |
| `game/src/sim/customer.ts` | `spawnChance` 乘热卖倍率；看价牌用抬过的钱包；`settle` 的满意度加 aura；出餐并行槽乘 `frenzyServeBoost`；区池上限乘 `frenzyPoolBoost`；`tickCustomers` 末尾调 `frenzyTick` 并写 `flow.lastFrenzy` |
| `game/src/ui/hud.ts` / `hud.css` | 产能行下面加一条**热卖槽**（灰条 + 百分比），热卖时整条变红并呼吸，文案改「🔥 热卖中 · 还剩 N 分（人比平时多一倍）」 |
| `game/src/main.ts` | `tickFeedback` 消费 `flow.lastFrenzy` → 打喜报 toast |
| `game/src/sim/frenzy.test.ts`（新） | 5 例：新局中性；排队+满意才涨、否则回落且不为负；满槽触发且倍率正确；热卖期槽不动、冷却期不涨、冷却完才涨；`absMinuteOf` 跨日跨月连续 |

### 踩到的两个坑（都写进注释了）

1. **`absMinuteOf` 的月份基准**：`state.month` 是 **0 基**（`createInitialState` 里 `month: 0`），我一开始按 `(month - 1)` 算，新局得到 **−3600** 分钟，于是 `frenzyActive` 一开始就为 `true`——热卖槽永远"正在进行"。测试第一例「新局没在热卖」直接抓出来。
2. **PowerShell 写文件会把中文读坏**：用 `(Get-Content) -replace … | Set-Content -Encoding utf8` 改 `state.ts`，tsc 报 `TS1110: Type expected`，全文件中文注释被按 GBK 读坏。已 `git checkout -- game/src/sim/state.ts` 复原，全部改用 edit 工具逐处改。（这是我第二次踩同一个坑，已记入 lesson。）

## 3. 实测

### 3.1 替身（`npm run probe:standin`，36 个月）

| 种子 | 月均营收 | 日均碗数 | 总流失 | **热卖次数** | 期末现金 |
|---|---|---|---|---|---|
| 1 | ¥20,557 | 85.4 | 62% | **390** | ¥52,487 |
| 2 | ¥20,529 | 85.3 | 62% | **389** | **−¥69,524** |

加 frenzy **之前**同一替身：月均营收 ¥20,534、日均 85.3 碗、流失 62%。→ **营收 +0.1%**。

### 3.2 可赢性（`npm run probe:win`，¥9、5 seeds × 36 月）

| 配置 | 日均碗数 | 流失 | 月均营收 | 期末现金 |
|---|---|---|---|---|
| 4 座 | 69.0 | 66% | ¥18,631 | ¥165,437 |
| 8 座 | 90.7 | 63% | ¥24,477 | ¥275,026 |

### 3.3 怎么读这三个数

- **热卖 390 次 / 36 月 ≈ 每 2.7 天一次**，覆盖率 390×30 ÷ 129,600 ≈ **9% 的营业时间**。频率合理（不是天天爆，也不是从没见过），但内容上它更接近「稳定的节律」而不是「稀有大事件」。
- **营收几乎没动**：因为替身常年产能饱和，热卖期间需求（×2）涨得比产能（×1.25）快，多来的人照样做不出碗 → 流失率不变、碗数不变。
- 这恰恰把 **P38** 摆到台面上：热卖要变成「收益」，前提是玩家**平时留富余产能**，而替身从不这么做（P36）。真人的玩法是「热卖前扩座/买灶」——这就是我们想要的决策点；替身证明不了它，只能证明机制没坏。

## 4. 与开罗的对照

| 开罗 | 我们 | 状态 |
|---|---|---|
| 排队 + 吃到喜欢的面 → 槽涨 | 排队 ≥1 且今日均分 ≥60 | ✓ |
| 槽满 → frenzy 发生 | 100 分满即触发 | ✓ |
| 很多人来 | 来客 ×2、区池 ×1.3 | ✓ |
| 来客 stats 更高 | 钱包 ×1.15 | ✓（简化：只抬钱包） |
| staff get auras | 满意度 +4、并行槽 ×1.25 | ✓ |
| 槽画在门口机器上 | 画在 HUD 右栏 | △（位置不同，信息一样） |

## 5. 已知缺口

| 编号 | 内容 |
|---|---|
| **P38** | **热卖目前只有节律、没有收益**：替身产能常年饱和，实测 +0.1%。要验证「热卖 → 扩产能 → 吃到爆发」这条链，得先解决 P36（替身会买设备），否则这条机制在我们自己的测试里永远是零收益 |
| P36 | 替身不买设备、守不住价（这是 P38 的前置） |
| P33 | 16 倍速日循环疑似停表，未查 |
| P34 | S3 布置 / S6 分店未做 |

## 6. 复现命令

```bash
cd game
npx tsc --noEmit                  # 0
npx vitest run                    # 20 文件 182 用例（新增 src/sim/frenzy.test.ts 5 例）
npm run build                     # dist/assets/index-sBqe0aSP.js 1,344.63 kB / gzip 373.75
npm run probe:standin             # 第 3.1 节（日志里有「热卖 N 次」）
npm run probe:win                 # 第 3.2 节
cd .. && python tools/gate/eye_gate.py shot --slug frenzy
```
