/**
 * 老师傅的方子（A6）——一次买断、永久生效、每款只定一条。
 *
 * 为什么不照抄开罗的 `custom`（4 类 × 5 级）：
 * 那套是「花钱把数值一级一级往上堆」，堆到第五级这碗粉就没有变化的余地了，
 * 而本作的乐趣在「调这一锅的味道」。所以我们把它反过来 ——
 * **不是把上限堆高，是把某一项当场定死**：这一款以后就按师傅的方子做，
 * 滑条再动也不影响它。代价是每款只能选一条，选错了只能换一款重来。
 *
 * 钱与人情一起收：人情是「师傅肯教你」的门槛，钱是「跑一趟料」的成本。
 */

export type MasterId = "taste_set" | "cost_set" | "serve_set" | "price_set";

export interface MasterDef {
  id: MasterId;
  /** 方子的名字，用老友粉店的口气 */
  name: string;
  /** 印章上的一个字（像素小图用） */
  seal: string;
  /** 师傅说的话 */
  line: string;
  /** 这一条锁住什么 —— 面板一行说明 */
  what: string;
  /** 要多少人情 */
  favorCost: number;
  /** 要多少钱 */
  costYuan: number;
  /** 开罗出处 */
  kairo: string;
}

export const MASTERS: readonly MasterDef[] = [
  {
    id: "taste_set",
    name: "火候定死",
    seal: "火",
    line: "爆香就十二秒，多一秒苦，少一秒寡。以后都按这个来。",
    what: "这款的味道锁在今天这个分数，滑条再动也不影响它",
    favorCost: 8,
    costYuan: 0,
    kairo: "custom 1 品質UP：把成品品质往上顶；我们是把当下的手感钉住",
  },
  {
    id: "cost_set",
    name: "料钱定死",
    seal: "料",
    line: "一两粉配多少肉，拿秤称，别拿手抓。抓多抓少都是钱。",
    what: "这款每碗料钱 −8%",
    favorCost: 12,
    costYuan: 200,
    kairo: "custom 4 材料費DOWN",
  },
  {
    id: "serve_set",
    name: "出碗定死",
    seal: "碗",
    line: "汤开了下粉，数三十下就起，别等它软。",
    what: "这款每锅出碗快 6%",
    favorCost: 12,
    costYuan: 300,
    kairo: "custom 2 難しさDOWN：让这碗更好做",
  },
  {
    id: "price_set",
    name: "售价顶住",
    seal: "价",
    line: "这碗值这个价，客人问你就这么答，别自己先虚。",
    what: "这款卖贵两块钱也不容易被嫌",
    favorCost: 10,
    costYuan: 0,
    kairo: "custom 3 価格UP",
  },
];

export const MASTER_BY_ID: ReadonlyMap<string, MasterDef> = new Map(MASTERS.map((m) => [m.id, m]));

export function masterById(id: string | null | undefined): MasterDef | null {
  if (!id) return null;
  return MASTER_BY_ID.get(id) ?? null;
}

/** 售价顶住给多少「白送的价格空间」（元） */
export const PRICE_SET_BONUS = 2;
