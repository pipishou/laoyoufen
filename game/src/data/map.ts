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
