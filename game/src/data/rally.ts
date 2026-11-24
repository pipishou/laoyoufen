/**
 * 店员闹情绪时的三条路（批 V′，解 GAP 三轮第 ③ 条）。
 *
 * 开罗 `rally` 表 54 行全是**店员开口要东西**：要涨薪、要休息、说自己想走，
 * 玩家得当场给个答复。我们原来只有一条路——体力透支，第二天自己走人，
 * 玩家连一句挽留都没有机会说。人手是这家店最贵的资产：
 * 培训一个煮粉师傅「至少要一两个月才能出师」（广西新闻网 2020-03-25
 * 《保住正宗「老友」 南宁老友粉传承基地正式挂牌成立》
 * http://sub.gxnews.com.cn/staticpages/20200325/newgx5e7ac2ff-19389663.shtml），
 * 所以「走人」这件事该有一次讨价还价。
 *
 * 三条路的钱与情分开算（纪律同批 B′：一条出口一件事）：
 * - 花人情：不动钱，动的是攒了半天的街坊情面；
 * - 加薪：动钱，而且以后天天多花（日薪涨一成）；
 * - 放两天假：不花钱不动人情，但这两天少一个人手。
 */

export type RallyId = "favor" | "raise" | "rest";

export interface RallySource {
  label: string;
  url: string;
  quote: string;
}

export interface RallyDef {
  id: RallyId;
  name: string;
  /** 一句话说清这条路的代价 */
  what: string;
  /** 人情点 */
  favor?: number;
  /** 一次性掏现钱（按日薪倍数算时用 mult） */
  cashMult?: number;
  /** 日薪永久上涨比例 */
  wagePct?: number;
  /** 立刻卸掉多少疲劳 */
  relief: number;
  /** 走这条路时店员说的那句话（街坊口气） */
  line: string;
  why: string;
  kairo: string;
  source: readonly RallySource[];
}

const SRC = {
  base: {
    label: "广西新闻网《保住正宗「老友」 南宁老友粉传承基地正式挂牌成立》",
    url: "http://sub.gxnews.com.cn/staticpages/20200325/newgx5e7ac2ff-19389663.shtml",
    quote: "该基地将“传帮带”一批技术过硬的煮粉师傅，解决老友粉的传承问题。",
  },
  slow: {
    label: "同上（出师要多久）",
    url: "http://sub.gxnews.com.cn/staticpages/20200325/newgx5e7ac2ff-19389663.shtml",
    quote: "培训一个煮粉师傅，至少要一两个月才能出师。",
  },
} as const;

export const RALLIES: readonly RallyDef[] = [
  {
    id: "favor",
    name: "卖个人情",
    what: "不花钱，动人情",
    favor: 12,
    relief: 30,
    line: "「阿强，这几天辛苦你。街坊都看着的。」",
    why: "这条街认人情。工钱一时加不上去，话要说到，让人知道你记着他的好。",
    kairo: "rally.txt 第 3–9 行（Staff ask for a favor, not money）",
    source: [SRC.base],
  },
  {
    id: "raise",
    name: "加点工钱",
    what: "今天掏一笔，以后天天多花",
    cashMult: 3,
    wagePct: 0.1,
    relief: 20,
    line: "「钱不多，先拿着。往后看你手艺再添。」",
    why: "钱是最快的答复，也是最贵的——日薪涨上去就下不来，一个月三十天都在付。",
    kairo: "rally.txt 第 12–20 行（Raise wages）",
    source: [SRC.slow],
  },
  {
    id: "rest",
    name: "让他歇两天",
    what: "不花钱，这两天少一个人",
    relief: 10,
    line: "「歇两天，铺子里我顶着。」",
    why: "人是累出来的不是气出来的。放两天假，回来手脚也快。只是这两天出碗会慢。",
    kairo: "rally.txt 第 21–27 行（Let them rest）",
    source: [SRC.slow],
  },
];

export const RALLY_TOTAL = RALLIES.length;

const BY_ID = new Map<string, RallyDef>(RALLIES.map((r) => [r.id, r] as const));

export function rallyById(id: string): RallyDef | null {
  return BY_ID.get(id) ?? null;
}
