/**
 * 铺位（建店仪式的第一步）—— 对应开罗 `store_data.txt` 的四档店，压成三档。
 *
 * 为什么是三档而不是四档：开罗的 Amazing Shop 要 ¥1,500（KCU 150,000）级别，
 * 属于三年后才有的事；开局只需要「便宜但天花板低 / 平衡 / 贵但天花板高」三种取舍。
 *
 * **钱怎么定的（坐标系规则，见 `data/anchors.ts`）**：
 *   - 起始现金 `GUANGXI.startCashYuan = ¥30,000`（现实下限：押金＋简装＋首批原料）
 *   - 转让费按「拿走起始现金的 0% / 50% / 93%」定，于是三种开局都是**现金取舍**而不是难度选项
 *   - **月租是固定值**（`RENT` 里的现实观测）：摊位费 ¥1,500 / 社区店 ¥4,600 / 临街 ¥7,600。
 *     2026-11-15 之前是「月目标 × 系数」，但月目标每月 +2% 涨到 ¥42,000 而实际营收被客流封顶，
 *     第 36 个月租金吃掉营收 34%，账上必亏（替身实测期末 −¥27,186）。现实里房租是房东定的固定数。
 */

// 日产能那道座位闸（批 BH′ / P548）：建店卡要写的「一天最多约几碗」和模型同一算式，
// 所以从 `sim/bottleneck.ts` 借，**不在这里另抄一遍数字**。
// 依赖方向是 data → sim，听着别扭，但 bottleneck 对 state 只有 `import type`（编译后被擦掉），
// 而 sites 只被 `sim/setup.ts` / `ui/setup.ts` 引用，没有环。
import { seatBowlCeiling } from "../sim/bottleneck";

export type SiteId = "stall" | "alley" | "streetfront";

export interface SiteDef {
  id: SiteId;
  name: string;
  /** 玩家读到的一句定位（南宁口吻，不写数值） */
  pitch: string;
  /** 转让费 + 押金，一次性从现金里扣 */
  feeYuan: number;
  /** 开局座位 */
  seats: number;
  /** 开局灶台 */
  stoves: number;
  /** 每日接待兜底闸（不是产能，产能由座位与灶台决定） */
  capacity: number;
  /** 固定月租（元），每年续约涨 3%（`rentMonthlyOf`） */
  rentMonthly: number;
  /** 开张后第一句旁白（AI 可用同义句替换） */
  openingLine: string;
}

export const SITES: readonly SiteDef[] = [
  {
    id: "stall",
    name: "街边摊",
    pitch: "中山路口摆两张矮桌，清早赶工的和送完孩子的顺路买一碗；雨天不开张。",
    feeYuan: 0,
    seats: 2,
    stoves: 1,
    capacity: 120,
    rentMonthly: 1_500,
    openingLine: "炉子一支，锅一放，老友粉的香味先把人引过来。",
  },
  {
    id: "alley",
    name: "巷内小店",
    pitch: "建政路巷子里，四张桌；街坊天天来，房租按月给。",
    feeYuan: 15_000,
    seats: 4,
    stoves: 1,
    capacity: 200,
    rentMonthly: 4_600,
    openingLine: "卷帘门拉开，先把招牌挂正——街坊认得这块牌子。",
  },
  {
    id: "streetfront",
    name: "临街铺面",
    pitch: "民族大道边，六张桌、两口灶；租金贵，过路客多。",
    feeYuan: 28_000,
    seats: 6,
    stoves: 2,
    capacity: 260,
    rentMonthly: 7_600,
    openingLine: "玻璃门擦到能照人，灶火一起，两条街都闻得到。",
  },
] as const;

export const SITE_BY_ID: ReadonlyMap<string, SiteDef> = new Map(SITES.map((s) => [s.id, s]));

export function siteById(id: string): SiteDef | undefined {
  return SITE_BY_ID.get(id);
}

/** 开局能选的铺位（付得起转让费的） */
export function affordableSites(cashYuan: number): SiteDef[] {
  return SITES.filter((s) => s.feeYuan <= cashYuan);
}

/**
 * 这个铺位「一天最多约几碗」（批 BH′，解 P548）。
 *
 * 为什么建店卡上要有这一行：线上 97 局试玩里 **48 局**选了免费的 2 座「街边摊」，
 * 中位只活 2 天、**0 局**活过第 5 天 —— 而卡片当时只写「2 座 / 1 口灶 / 月租约 ¥1,500」。
 * 「2 座」对玩家不是产能信息，是「便宜」；他不知道自己买的是一天 33 碗的天花板，
 * 也不知道旁边那档 4 座是一天 65 碗。数字必须写在**做决定的那一屏**上。
 *
 * 算式与模型同源（`sim/bottleneck.ts` 的 `seatBowlCeiling`），四舍五入到整碗 ——
 * 界面上说「约」，就不要在个位小数上和人较劲；2 座算出来 32.73 → 写 33。
 * 注意这**不是**「今天一定卖得掉 33 碗」：真正的瓶颈还可能是灶、日上限或来客量，
 * 所以文案写的是「最多约」。
 */
export function dailyBowlCeiling(site: SiteDef): number {
  return Math.round(seatBowlCeiling(site.seats));
}
