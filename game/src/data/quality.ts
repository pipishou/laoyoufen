/**
 * 配料品质档（批次五）
 *
 * 开罗没有这一层；它来自南宁粉店每天都在做的判断：**同样的浇头，进货有两种买法**。
 *
 * 出处（每一条都核过原文）：
 *   ① 新华网《南宁老友粉：人因此味「粉」邕州》——「老友粉的灵魂在于酸笋、豆豉、辣椒酱、蒜米四味主料」，
 *      同一篇里老师傅谢胡春盯着坛中酸笋叮嘱徒弟：「如果酸笋发酵过久，酸度超标，会盖过豆豉的醇厚。」
 *      → 酸笋有发酵的度，过老的坛子会盖味，这不是「多一点就更好」。
 *   ② 百度百科《南宁老友粉》——「所用酸笋、酸辣椒、豆豉等原料都必须用传统的腌制方法腌制」。
 *   ③ 蜗食记《南宁老友粉》——「粉肠需后放以保持脆嫩」「炒干酸笋水分」。
 *      → 头手货不是玄学，是「拿到什么、怎么处理」的差别。
 *
 * 三条纪律（和前几批一样）：
 *   1. 只落在已有的两个出口：**魅力（相）**与**料钱**。不开新维度；
 *   2. 默认档（平常货）两个乘数都是 1 / 0，所以历史回归锁一分不动；
 *   3. 没有「又便宜又好吃」的一档 —— 每上一档，料钱都贵得多（1 → 1.8 → 2.6 倍）。
 */

export type QualityId = "plain" | "good" | "top";

export interface QualitySource {
  label: string;
  url: string;
  quote: string;
}

export interface QualityDef {
  id: QualityId;
  name: string;
  /** 一行字：进货时怎么跟档口说 */
  word: string;
  /** 魅力（相）超出 30 那一部分抬高多少：0 / 0.25 / 0.55 */
  charmBoost: number;
  /** 配料料钱乘数：1 / 1.8 / 2.6 */
  costMult: number;
  /** 选定这一档时老板自己说的一句话 */
  line: string;
  why: string;
  source: QualitySource;
}

export const QUALITIES: readonly QualityDef[] = [
  {
    id: "plain",
    name: "平常货",
    word: "档口送什么就用什么",
    charmBoost: 0,
    costMult: 1,
    line: "平常货也做得成老友粉，就是别指望客人记得住。",
    why: "最省料钱的一档。酸笋是当天大桶里捞的，猪杂是拼盘的，处理得干净但不出彩。",
    source: {
      label: "蜗食记《南宁老友粉》",
      url: "https://www.woshiji.cn/show-14-1109-1.html",
      quote: "粉肠需后放以保持脆嫩",
    },
  },
  {
    id: "good",
    name: "靓货",
    word: "清早自己去挑，不将就",
    charmBoost: 0.25,
    costMult: 1.8,
    line: "自己站在档口挑过的，眼睛看得出，舌头也吃得出。",
    why: "自己起早去市场挑：酸笋挑坛子清的，猪杂挑当天的。料钱接近翻倍，卖相与分量感明显起来。",
    source: {
      label: "百度百科《南宁老友粉》",
      url: "https://baike.baidu.com/item/%E5%8D%97%E5%AE%81%E8%80%81%E5%8F%8B%E7%B2%89/1455207",
      quote: "所用酸笋、酸辣椒、豆豉等原料都必须用传统的腌制方法腌制",
    },
  },
  {
    id: "top",
    name: "头手货",
    word: "托熟人留的那一份",
    charmBoost: 0.55,
    costMult: 2.6,
    line: "头手的东西不常有，留得住才算本事。",
    why: "托熟人从档口留头一份：粉肠要脆、猪肝要黄沙、酸笋要新坛。料钱接近三倍，但端出去那一碗不一样。",
    source: {
      label: "新华网《南宁老友粉：人因此味「粉」邕州》",
      url: "http://gx.xinhuanet.com/20260423/e911110a855f4dc9ba14f29617d490ca/c.html",
      quote: "如果酸笋发酵过久，酸度超标，会盖过豆豉的醇厚",
    },
  },
];

export const QUALITY_BY_ID: ReadonlyMap<string, QualityDef> = new Map(
  QUALITIES.map((q) => [q.id, q]),
);

export const QUALITY_TOTAL = QUALITIES.length;
export const DEFAULT_QUALITY: QualityId = "plain";

export function qualityById(id?: string | null): QualityDef {
  return (id ? QUALITY_BY_ID.get(id) : undefined) ?? QUALITY_BY_ID.get(DEFAULT_QUALITY)!;
}
