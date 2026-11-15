/**
 * 铺位（建店仪式的第一步）—— 对应开罗 `store_data.txt` 的四档店，压成三档。
 *
 * 为什么是三档而不是四档：开罗的 Amazing Shop 要 ¥1,500（KCU 150,000）级别，
 * 属于三年后才有的事；开局只需要「便宜但天花板低 / 平衡 / 贵但天花板高」三种取舍。
 *
 * **钱怎么定的（坐标系规则，见 `data/anchors.ts`）**：
 *   - 起始现金 `GUANGXI.startCashYuan = ¥30,000`（现实下限：押金＋简装＋首批原料）
 *   - 转让费按「拿走起始现金的 0% / 50% / 93%」定，于是三种开局都是**现金取舍**而不是难度选项
 *   - 房租系数乘在 `rentFor(月目标)` 上：现实临街小铺 ¥4,500/月 对应系数 1.0
 */

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
  /** 房租系数：乘在 `rentFor()` 上 */
  rentFactor: number;
  /** 开张后第一句旁白（AI 可用同义句替换） */
  openingLine: string;
}

export const SITES: readonly SiteDef[] = [
  {
    id: "stall",
    name: "街边摊",
    pitch: "中山路口，晚上八点后才有人流；两张矮桌，雨天不开张。",
    feeYuan: 0,
    seats: 2,
    stoves: 1,
    capacity: 120,
    rentFactor: 0.6,
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
    rentFactor: 1,
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
    rentFactor: 1.4,
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
