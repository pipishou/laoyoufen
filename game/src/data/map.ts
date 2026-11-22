/**
 * 南宁轻地图（A10）：十二个区县按真实相对方位摆在一张 6×4 的格子上。
 *
 * 开罗 `mapchip.txt` 218 行是逐格贴图，我们不做可走的地图 —— 一局两分钟，
 * 玩家不会去逛地图。这里的图只回答三个问题：
 *   1. 我现在在哪个区；
 *   2. 哪些区我已经开过店（含分店）；
 *   3. 哪个区还有别家的粉店在抢客。
 *
 * 方位按现实简化（上北下南）：
 *   北：马山（西北）、武鸣、上林（东北）
 *   西：隆安；东：宾阳、横州；中心：兴宁
 *   南：江南、良庆、邕宁、青秀（东南）
 */

export interface MapCell {
  id: string;
  /** 全名：兴宁区 */
  name: string;
  /** 格子上的短名：兴宁 */
  short: string;
  x: number;
  y: number;
  /** 第几圈（批次九） */
  ring: MapRing;
  /** 看见这一圈要的段位 */
  gate: number;
  /** 还没揭开 */
  locked: boolean;
  /** 这一片出的物产名（没有就 null） */
  local: string | null;
  /** 玩家现在就在这个区 */
  here: boolean;
  /** 这个区有你的分店 */
  branch: boolean;
  /** 这个区还有几家同行在营业 */
  rivals: number;
  /** 每天大约多少人流（取整） */
  traffic: number;
}

export const MAP_W = 6;
export const MAP_H = 4;

interface Spot {
  id: string;
  x: number;
  y: number;
}

/** 手工摆位：只保证相对方位对，不是等比例投影 */
export const MAP_SPOTS: readonly Spot[] = [
  { id: "mashan", x: 0, y: 0 },
  { id: "wuming", x: 2, y: 0 },
  { id: "shanglin", x: 4, y: 0 },
  { id: "xixiangtang", x: 1, y: 1 },
  { id: "binyang", x: 5, y: 1 },
  { id: "longan", x: 0, y: 2 },
  { id: "xingning", x: 2, y: 2 },
  { id: "liangqing", x: 3, y: 2 },
  { id: "qingxiu", x: 4, y: 2 },
  { id: "hengzhou", x: 5, y: 2 },
  { id: "jiangnan", x: 1, y: 3 },
  { id: "yongning", x: 3, y: 3 },
] as const;

export function shortNameOf(name: string): string {
  return name.replace(/[区县市]$/, "");
}

/**
 * 四圈（批次九）。
 *
 * 开罗 `hidearea.txt` 只有 `Lv1..Lv14` 十四行、没有坐标 —— 它做的事是
 * **按段位一块一块把地图揭开**，而不是一次给你十二个区看。
 *
 * 我们照这个形状做四圈：先是脚下这一圈（起步就在兴宁），一评、二评、三评
 * 各开一圈。圈不是正圆，是按转让费排的 —— 越远的区越贵，也越晚看得见。
 *
 * 注意：**锁住的格子仍占位**，只是写「第 N 段能看到这一片」。
 * 直接不画会让地图缺角，看不出这城有多大。
 */
export type MapRing = 1 | 2 | 3 | 4;

export interface RingDef {
  ring: MapRing;
  /** 看到这一圈需要的段位（gradeLevel，0 起算） */
  gate: number;
  /** 这一圈怎么叫 */
  name: string;
  note: string;
}

export const MAP_RINGS: readonly RingDef[] = [
  { ring: 1, gate: 0, name: "脚下这一圈", note: "起步就在这儿，街坊都认得你的门牌。" },
  { ring: 2, gate: 2, name: "城外一圈", note: "县城与老镇，客流不大但事少。" },
  { ring: 3, gate: 4, name: "新区一圈", note: "大学城与五象，年轻人多、租金贵。" },
  { ring: 4, gate: 6, name: "城心一圈", note: "机场、商务区，客单价最高，同行也最狠。" },
] as const;

export const RING_BY_SPOT: Readonly<Record<string, MapRing>> = {
  xingning: 1,
  yongning: 1,
  mashan: 1,
  shanglin: 1,
  longan: 2,
  binyang: 2,
  hengzhou: 2,
  wuming: 3,
  liangqing: 3,
  jiangnan: 4,
  xixiangtang: 4,
  qingxiu: 4,
} as const;

export function ringOfSpot(id: string): MapRing {
  return RING_BY_SPOT[id] ?? 1;
}

export function ringDef(ring: MapRing): RingDef {
  return MAP_RINGS.find((r) => r.ring === ring) ?? MAP_RINGS[0]!;
}

/** 这个段位能看见第几圈 */
export function visibleRingOf(gradeLevel: number): MapRing {
  let ring: MapRing = 1;
  for (const r of MAP_RINGS) if (gradeLevel >= r.gate) ring = r.ring;
  return ring;
}
