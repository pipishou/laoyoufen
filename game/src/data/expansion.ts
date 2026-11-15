/**
 * 店铺扩建（六阶 S5 / P39 手艺树）—— 对应开罗 `rank.txt` 里 Ramen Hall Expansion、
 * Buy Big Shop、More Line Tiles 这三类奖励。
 *
 * 为什么改成两档起步、且这么贵：
 * 旧实现是 `data/shop.ts` 里「扩建店面 ¥1,500 → 日上限 +10」这种量级，六个升级全买完
 * 不到 ¥7,500，而一间 4 座店月营收就有 ¥21,000 —— 钱没有去处（账本行 22 的 B8/P32）。
 * 现实里粉店扩一次店是：打通隔墙、再加两张桌、后厨换一台双眼灶，
 * 一次性三四万，等于一个半月的净利。所以前两档按 `CAPITAL.expansionYuan` 定：
 *   L1 ¥12,000 = 把隔墙打通，多摆两张桌（≈ 两个月净利）
 *   L2 ¥35,000 = 后厨扩容 + 加一口灶（≈ 半年净利）
 *
 * P39 起照开罗的排版再加两档，并且**挂段位门槛**（开罗的 rank 门槛）：
 *   L3 ¥60,000 = 后巷搭雨棚，多摆三张台（第 3 段解锁）
 *   L4 ¥110,000 = 二楼清出来摆四张台 + 一口灶（第 6 段解锁）
 * 这样「钱攒够了但段位没评」也是一道门 —— 段位不再只是收费口。
 *
 * 效果只做三件玩家看得见的事：座位、灶位、日上限兜底闸。
 * 不做「氛围 +5%」这类看不见的数值 —— 扩建的意义就是能同时接更多人。
 */

import { CAPITAL } from "./anchors";

export type ExpansionId = "hall" | "kitchen" | "backyard" | "upstairs";

export interface ExpansionDef {
  id: ExpansionId;
  name: string;
  /** 现实里这一步在干什么 */
  desc: string;
  /** 一次性费用（元），与 CAPITAL.expansionYuan 对齐 */
  costYuan: number;
  /** 需要评到第几段才准动工（0 = 无门槛） */
  minGrade: number;
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
    minGrade: 0,
    seats: 2,
    stoves: 0,
    capacity: 60,
  },
  {
    id: "kitchen",
    name: "后厨扩容，加一口灶",
    desc: "案台加长、抽油烟管换粗，多接一台双眼灶，午市不再排队等锅",
    costYuan: CAPITAL.expansionYuan[1]!,
    minGrade: 0,
    seats: 2,
    stoves: 1,
    capacity: 140,
  },
  {
    id: "backyard",
    name: "后巷搭雨棚，多摆三张台",
    desc: "后巷原来堆煤渣，清干净搭铁皮棚，落雨也能坐人",
    costYuan: 60_000,
    minGrade: 3,
    seats: 3,
    stoves: 0,
    capacity: 120,
  },
  {
    id: "upstairs",
    name: "二楼清出来，摆四张台",
    desc: "楼上原先是房东放杂物，铺地砖、装吊扇，午市不用在门口等",
    costYuan: 110_000,
    minGrade: 6,
    seats: 4,
    stoves: 1,
    capacity: 160,
  },
] as const;

export const EXPANSION_BY_ID: ReadonlyMap<string, ExpansionDef> = new Map(
  EXPANSIONS.map((e) => [e.id, e]),
);

/** 四档要按顺序买：先打隔墙 → 后厨 → 后巷 → 二楼 */
export const EXPANSION_ORDER: readonly ExpansionId[] = [
  "hall",
  "kitchen",
  "backyard",
  "upstairs",
];
