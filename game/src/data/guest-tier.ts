/**
 * 顾客等级（A8）：开罗 `customer.txt` 90 行里每一类客人都有等级，
 * 等级决定「愿意出多少钱、能等多久、说的话算不算数」。
 *
 * 本土化：南宁粉店里客人不是按「等级」分的，是按**关系**分的 ——
 *   · 路过的（看招牌进来，吃一碗就走）
 *   · 街坊（这条街上的人，天天见）
 *   · 识食的（懂吃、嘴刁，出一句好评顶十句）
 *
 * 三条纪律：
 * 1. **只改四个出口**：钱包、耐心、口碑权重、挑剔扣分。不加新资源、不加新数值条。
 * 2. **不按段位硬升**：讲究客出现概率随口碑与段位涨，但永远有路过的客 ——
 *    否则后期全店只剩讲究客，一碗粉卖不出去。
 * 3. **档位看得见**：HUD 队列里一行一个色条，玩家要能看出「这几位是识食的，
 *    别把味道做崩」。
 */

export type TierId = "passer" | "neighbor" | "picky";

export interface TierDef {
  id: TierId;
  name: string;
  /** HUD 上的两个字 */
  word: string;
  /** 钱包系数 */
  budgetPct: number;
  /** 耐心系数 */
  patiencePct: number;
  /** 口碑权重：他一句话抵几句 */
  repWeight: number;
  /** 挑剔阈值：菜分低于这个数，他当场减分 */
  pickMin?: number;
  /** 挑剔扣分系数（差值乘它） */
  pickPenalty?: number;
  /** 一句话人设 */
  note: string;
  kairo: string;
}

export const TIERS: readonly TierDef[] = [
  {
    id: "passer",
    name: "路过的",
    word: "路过",
    budgetPct: 0.85,
    patiencePct: 0.85,
    repWeight: 0.7,
    note: "看招牌进来，吃完就走",
    kairo: "customer：普通客，钱包与耐心都低一档",
  },
  {
    id: "neighbor",
    name: "街坊",
    word: "街坊",
    budgetPct: 1,
    patiencePct: 1,
    repWeight: 1,
    note: "这条街上的人，天天见",
    kairo: "customer：常客，标准档",
  },
  {
    id: "picky",
    name: "识食的",
    word: "识食",
    budgetPct: 1.35,
    patiencePct: 1.2,
    repWeight: 1.5,
    pickMin: 68,
    pickPenalty: 0.28,
    note: "懂吃、嘴刁，一句好评顶十句",
    kairo: "customer 高等级：吃得起、等得起，但也最会挑",
  },
];

export const TIER_BY_ID: ReadonlyMap<string, TierDef> = new Map(TIERS.map((t) => [t.id, t]));
export const DEFAULT_TIER: TierId = "neighbor";

export function tierById(id: string | null | undefined): TierDef {
  return (id ? TIER_BY_ID.get(id) : undefined) ?? TIER_BY_ID.get(DEFAULT_TIER)!;
}
