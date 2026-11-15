/**
 * 店铺摆件表（六阶 S3 的前半）。
 *
 * 溯源：对应开罗 `storeparts.txt`（6 套风格 × 5 部件）与 `storeequip.txt` 里
 * 与产能无关的那几件（招牌、空调、摆件、饮水机、净化器…），只借
 * 「一次性买断 + 等级 + 每级一个可感知效果」的形状。
 *
 * **本表不再管座位/灶位/日上限**：那三件是资本开支，走 `data/expansion.ts`
 * （两档 ¥12,000 / ¥35,000）。旧表里 seats ¥900 / stove ¥2,400 / hall ¥1,500
 * 与一间店月营收 ¥21,000 完全不匹配，等于「钱没有去处」（账本 P32）。
 *
 * 效果口径：每个都直接改顾客循环里的一个变量，不做「+5% 氛围」这类看不见的数值。
 */

export type UpgradeId = "sign" | "ac" | "decor";

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
  { id: "sign", name: "换招牌", desc: "魅力 +3（门店吸引力）", maxLevel: 4, baseCost: 700, growth: 1.6 },
  { id: "ac", name: "装空调", desc: "候餐耐心 +10%", maxLevel: 3, baseCost: 1200, growth: 1.8 },
  { id: "decor", name: "摆件装饰", desc: "进店客流 +6%", maxLevel: 5, baseCost: 800, growth: 1.5 },
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));
