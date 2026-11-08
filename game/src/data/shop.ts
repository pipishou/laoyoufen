/**
 * 店铺扩建 / 摆件表。
 *
 * 结构溯源：对应 REA `shop`/`deco` 类表（取证报告 §4 提到的店铺扩建与摆件系统），
 * 但原表列语义未核实，这里只借「一次性买断 + 等级 + 每级一个可感知效果」的形状。
 *
 * 效果口径：全部直接改顾客循环里的一个变量，不做「+5% 氛围」这类看不见的数值。
 */

export type UpgradeId = "seats" | "stove" | "hall" | "sign" | "ac" | "decor";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  /** 每级价格倍率 */
  growth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: "seats", name: "加桌加凳", desc: "同时多坐 1 人", maxLevel: 4, baseCost: 900, growth: 1.8 },
  { id: "stove", name: "加一口灶", desc: "出碗速度 +100%", maxLevel: 3, baseCost: 2400, growth: 2.0 },
  { id: "hall", name: "扩建店面", desc: "每日接待上限 +10", maxLevel: 4, baseCost: 1500, growth: 1.7 },
  { id: "sign", name: "换招牌", desc: "魅力 +3（门店吸引力）", maxLevel: 4, baseCost: 700, growth: 1.6 },
  { id: "ac", name: "装空调", desc: "候餐耐心 +10%", maxLevel: 3, baseCost: 1200, growth: 1.8 },
  { id: "decor", name: "摆件装饰", desc: "进店客流 +6%", maxLevel: 5, baseCost: 800, growth: 1.5 },
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));
