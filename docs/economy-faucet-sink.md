# 经济汇/漏盘点（实跑一次，P2 交付）

方法：`grep` 全部 `state.cash` 变更点，逐个标注是 faucet 还是 sink，并注明 `文件:行号`。
**未测量的比率一律标「待测」，不填估计值**——填了就成了假数。

## 1. Faucet（现金流入）

| 来源 | 位置 | 公式 | 备注 |
|---|---|---|---|
| 出餐毛收入 | `game/src/sim/customer.ts:198` | `state.cash += paid - cost`，`paid` 由售价与评分决定，`cost = score.cost × costMultiplier(state)` | 主汇，唯一与玩法直接挂钩的入口 |
| 熟客回礼 | `game/src/sim/customer.ts:218` | `state.cash += gift` | 小额、事件驱动 |
| 大赛奖金 | `game/src/sim/contest.ts:59` | `state.cash += prize` | 名次由 `rivalScore()` 纯客户端算，**无服务端复算** |
| 月结奖励 | `game/src/sim/ledger.ts:79` | `state.cash += bonus` | 触发条件待读 `ledger.ts` 上下文确认 |
| 事件效果 | `game/src/sim/events.ts:96` | `state.cash += effect.amount` | 事件表 32 条，正负都有（同时是 sink） |

## 2. Sink（现金流出）

| 去向 | 位置 | 常量/来源 | 备注 |
|---|---|---|---|
| 月租 | `game/src/sim/ledger.ts:32` | `RENT_PER_MONTH = 800`（`ledger.ts:4`） | **固定值，不随规模变化** → 长期会被收入稀释成噪声 |
| 员工工资 | `game/src/sim/staff.ts:160` | `state.monthWages`（按月累计） | 每月结算一次 |
| 招聘费 | `game/src/sim/staff.ts:123` | 一次性 fee | 待读 `data/staff.ts` 取真实值 |
| 采购升级 | `game/src/sim/shop.ts:27` | `cost`（来自商店表） | 一次性 |
| 大赛报名费 | `game/src/sim/contest.ts:40` | `CONTEST_ENTRY_FEE` | 待读常量 |
| 原料成本 | `game/src/sim/customer.ts:197` | `bowlCost(toppings)`（`score.ts:115`，`BASE_COST` + 各配料 cost） | 逐碗扣除，本质是 sink |

## 3. 已能算出的比率（真算，非估计）

1. **租金占月度营收目标 = 800 / 3600 = 22.2%**
   （`ledger.ts:4` vs `state.ts` 的 `START_MONTH_TARGET`）
   → 开局阶段租金是硬约束；但如果营收按 `TARGET_GROWTH = 1.02/月` 复利，三年后营收约
   `3600 × 1.02^36 ≈ 7,342`，租金占比降到 **10.9%**。**租金不涨 = 后期自动变宽松**。

2. **单碗毛利区间**：售价甜点 `PRICE_SWEET_SPOT = 12`（`score.ts:9`），
   `DEFAULT_PRICE = 12`（`score.ts:7`）。以 `bowlCost` 两档实测（`score-dims.test.ts:49`：
   空配料 < 双配料）为序，**具体数值待跑一次脚本取真值**，本文件不填。

3. **单日营收上限**：`START_CAPACITY = 40` 碗 × ¥12 = **¥480/日**（未计 sink）。
   对比 `START_MONTH_TARGET = 3600`：若按 30 天算，上限 ¥14,400，是目标的 4 倍
   → **目标不是被产能卡住的，是被客流与评分卡住的**（与 project_memory 里
   「客流生成是核心瓶颈而非出碗速度」一致）。

## 4. 判定：sink 是否悬空

| 币种 | faucet | sink | 是否悬空 |
|---|---|---|---|
| 现金 | 出餐/回礼/奖金/事件 | 租金/工资/采购/报名费/原料 | **否**，5 个 sink，且有一次性与按月两类 |
| 口碑 | 事件/评分/熟客 | 事件负效果、差评 | 待读 `sim/score.ts` 与 `sim/regulars.ts` 确认是否有「消耗口碑」的正向出口 |
| 客流 | 口碑与热度驱动 | 产能与耐心上限 | **否**（流失是 sink） |
| 热度（trend） | 事件/大赛 | 每月衰减 | **待测**：衰减率未在本次读取中确认 |

**结论（可执行）**：现金侧的汇/漏已经闭合，问题不在缺 sink，而在 **租金是常量**。
按原版判据「sink 不能悬空、要在时间上算盈余」——我们这里反过来：
**成本不随时间涨，而收入按 1.02 复利涨**，等于难度随时间递减。
下一步该做的不是加 sink，而是把 `RENT_PER_MONTH` 改成随门店规模/月数递增的公式，
并给出两端算例（第 1 月 / 第 36 月）。这条已进待办，未改代码。
