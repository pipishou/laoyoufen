/**
 * 店铺扩建（六阶 S5）—— 对应开罗 `rank.txt` 的 Ramen Hall Expansion / More Line Tiles 两行奖励。
 *
 * 为什么改成只有两档、且这么贵：
 * 旧实现是 `data/shop.ts` 里「扩建店面 ¥1,500 → 日上限 +10」这种量级，六个升级全买完
 * 不到 ¥7,500，而一间 4 座店月营收就有 ¥21,000 —— 钱没有去处（账本行 22 的 B8/P32）。
 * 现实里粉店扩一次店是：打通隔墙、再加两张桌、后厨换一台双眼灶，
 * 一次性三四万，等于一个半月的净利。所以这里按 `CAPITAL.expansionYuan` 定两档：
 *   L1 ¥12,000 = 把隔墙打通，多摆两张桌（≈ 两个月净利）
 *   L2 ¥35,000 = 后厨扩容 + 加一口灶（≈ 半年净利）
 *
 * 效果只做三件玩家看得见的事：座位、灶位、日上限兜底闸。
 * 不做「氛围 +5%」这类看不见的数值 —— 扩建的意义就是能同时接更多人。
 */

import { CAPITAL } from "./anchors";

export type ExpansionId = "hall" | "kitchen";

export interface ExpansionDef {
  id: ExpansionId;
  name: string;
  /** 现实里这一步在干什么 */
  desc: string;
  /** 一次性费用（元），与 CAPITAL.expansionYuan 对齐 */
  costYuan: number;
  /** 座位 +N */
  seats: number;
  /** 灶位 +N */
  stoves: number;
  /** 日上限兜底闸 +N（真正天花板仍是座位翻台与出餐速度） */
  capacity: number;
}

export const EXPANSIONS: readonly ExpansionDef[] = [
  {
    id: "hall",
    name: "打通隔墙，多摆两张桌",
    desc: "把隔壁那间杂物房吃下来，墙面重刷，加两张四人桌",
    costYuan: CAPITAL.expansionYuan[0]!,
    seats: 2,
    stoves: 0,
    capacity: 60,
  },
  {
    id: "kitchen",
    name: "后厨扩容，加一口灶",
    desc: "案台加长、抽油烟管换粗，多接一台双眼灶，午市不再排队等锅",
    costYuan: CAPITAL.expansionYuan[1]!,
    seats: 2,
    stoves: 1,
    capacity: 140,
  },
] as const;

export const EXPANSION_BY_ID: ReadonlyMap<string, ExpansionDef> = new Map(
  EXPANSIONS.map((e) => [e.id, e]),
);

/** 扩建两档要按顺序买：先打隔墙，再动后厨 */
export const EXPANSION_ORDER: readonly ExpansionId[] = ["hall", "kitchen"];
