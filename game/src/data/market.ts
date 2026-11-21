export type MarketId =
  | "huiNanTian"
  | "storm"
  | "heat"
  | "coldSnap"
  | "marketRush"
  | "inspection"
  | "porkUp"
  | "schoolOpen";

/**
 * 南宁的天气与街面（批次三）。
 *
 * 开罗 `economy` 表是 26 条**限时全局 buff**：钱包 ±、移动 ±、吃速 ±、
 * 全品味道 / 魅力 / 价格 ±、材料费 ±、四季天气、四流派热潮、全场狂热。
 * 本作原来 32 条事件全是叙事选项，一个全局乘数都没有 —— 也就是说
 * 「今天下雨」对本作的数字**毫无影响**，只影响一句文案。
 *
 * 这一批补上八条，全部是南宁一年里真会发生的事，乘数只落在已有的四个出口：
 *   进店（attractPct）／耐心（patiencePct）／钱包（walletPct）／料钱（costPct）
 *
 * 三条纪律：
 * 1. **只落已有出口** —— 不新增「心情」「湿度」这类没有消费方的字段；
 * 2. **乘数相加后再夹一道** —— 见 `sim/market.ts` 的 `MARKET_CAP`（±35%），
 *    不然八条里撞上三条同向就会把一天推到极端；
 * 3. **没有「全是好处」的一条** —— 每条至少有一个出口是负的，或者有代价。
 */
export interface MarketEffect {
  /** 进店人数（相对基准的百分比增减，0.12 = 多一成二） */
  attractPct?: number;
  /** 客人耐心 */
  patiencePct?: number;
  /** 客人的钱包（决定他点几两、加不加料） */
  walletPct?: number;
  /** 一碗的料钱 */
  costPct?: number;
}

export interface MarketDef {
  id: MarketId;
  name: string;
  /** 什么时候会来（给玩家看的时机，也给 AI 当语境） */
  when: string;
  /** 老板视角的一句解释 */
  line: string;
  effect: MarketEffect;
  /** 为什么是这几个数（写给后来的人看，不进游戏） */
  why: string;
  /** 开罗那张表里对应什么 */
  kairo: string;
}

export const MARKETS: readonly MarketDef[] = [
  {
    id: "huiNanTian",
    name: "回南天",
    when: "二三月，墙在冒水的那几天",
    line: "地砖一天到晚不干，进来的人先找纸擦凳子。",
    effect: { attractPct: -0.12, patiencePct: 0.1, costPct: 0.06 },
    why: "回南天没人愿意在街上走，进店少；但进来的人多半是躲潮气的，坐得住；菜和粉受潮损耗大，料钱上去。",
    kairo: "对应 `economy` 里的天气类减益（进店 −、材料费 +）",
  },
  {
    id: "storm",
    name: "台风外围",
    when: "七到九月，气象台挂黄色预警的日子",
    line: "雨横着打，棚子压不住，街上只剩赶路的人。",
    effect: { attractPct: -0.22, patiencePct: -0.08, walletPct: 0.05 },
    why: "台风天客流断崖，进来的人多半是就近避雨的，等不起；但避雨的人会多点一样东西坐着。",
    kairo: "对应 `economy` 的「全场客流 −」+「钱包 +」组合",
  },
  {
    id: "heat",
    name: "高温天",
    when: "六到八月，午后三十七度",
    line: "中午的太阳把招牌晒得发烫，谁都不想出门。",
    effect: { attractPct: -0.1, patiencePct: -0.12, walletPct: -0.06 },
    why: "热天食欲差，客人点得少、等得急；这时候一碗酸辣的干捞比滚汤好卖。",
    kairo: "对应 `economy` 的夏季「食欲 −、耐心 −」",
  },
  {
    id: "coldSnap",
    name: "寒潮",
    when: "十二到二月，北方下来的那几股冷空气",
    line: "风一起，来的人都点滚汤的，砂锅一天要洗几十个。",
    effect: { attractPct: -0.04, patiencePct: 0.12, walletPct: 0.08, costPct: 0.08 },
    why: "冷天喝热汤的人舍得点，也愿意等砂锅慢慢滚；可街上真冷，路过的人少了，烧的燃料与砂锅损耗也贵。",
    kairo: "对应 `economy` 的冬季「客流 +、钱包 +」",
  },
  {
    id: "marketRush",
    name: "赶圩日",
    when: "逢圩的日子，早市那条街挤不进人",
    line: "天没亮就有人在巷口排队，赶完圩才想起吃粉。",
    effect: { attractPct: 0.28, patiencePct: -0.14, walletPct: -0.04 },
    why: "圩日人流翻倍，但都是赶时间的，耐心差；赶圩的人兜里刚花过钱，点得省。",
    kairo: "对应 `economy` 的「全场客流大幅 +、耐心 −」",
  },
  {
    id: "inspection",
    name: "创城检查",
    when: "不定期的两三天，街口站着戴红袖章的",
    line: "桌子不敢摆到街上，油烟机要开着，垃圾桶得盖好。",
    effect: { attractPct: -0.08, costPct: -0.05, patiencePct: 0.04 },
    why: "不能外摆，位置少了一截；但这几天查得紧，卫生做得好，老客反而觉得干净；集中备料不浪费，料钱省一点。",
    kairo: "对应 `economy` 的「规则类」事件（客流 −、成本 −）",
  },
  {
    id: "porkUp",
    name: "猪肉起价",
    when: "说不准，猪价一动就是半个月",
    line: "肉行的价牌一天换一次，猪杂比肉还贵。",
    effect: { costPct: 0.14, walletPct: -0.02 },
    why: "料钱直接上去，玩家要么提价、要么改配方用便宜的部位 —— 这是本作唯一一条纯成本行情。",
    kairo: "对应 `economy` 的「材料费 +」",
  },
  {
    id: "schoolOpen",
    name: "开学",
    when: "九月一号前后那两周",
    line: "背书包的又回来了，一下课就把门口堵满。",
    effect: { attractPct: 0.18, walletPct: -0.1, patiencePct: -0.06 },
    why: "学生客流回来得猛，但他们只点二两、不加料、还爱催 —— 人数涨、客单价掉。",
    kairo: "对应 `economy` 的「客流 +、钱包 −」",
  },
];

export const MARKET_BY_ID = new Map<string, MarketDef>(MARKETS.map((m) => [m.id, m]));

export function marketById(id: string): MarketDef | undefined {
  return MARKET_BY_ID.get(id);
}

export const MARKET_TOTAL = MARKETS.length;
