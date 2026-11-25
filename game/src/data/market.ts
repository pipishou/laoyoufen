export type MarketId =
  | "huiNanTian"
  | "storm"
  | "heat"
  | "coldSnap"
  | "marketRush"
  | "inspection"
  | "porkUp"
  | "schoolOpen"
  | "qingming"
  | "dragonBoat"
  | "summerBreak"
  | "payday"
  | "waterCut"
  | "gasUp"
  | "roadWork"
  | "expoSeason";

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
  /**
   * 对冲的那一条（批 B″，解 P320）：这条是坏的，可同一天街上还有一件好事。
   *
   * 只给「坏的那几条」填；好事那几条不填 —— 于是「停水」撞上「发薪日」
   * 的时候，进店不会一路掉到底。配对只按六成算（见 `sim/market.ts` 的
   * `PAIR_WEIGHT`），免得好事把坏事全抹平。
   */
  pair?: MarketId;
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
  {
    id: "qingming",
    name: "清明",
    when: "四月初那几天，出城扫墓的人多",
    line: "早上巷子里静得不像话，中午一波人回来，先吃碗粉再进门。",
    effect: { attractPct: -0.045, walletPct: 0.06, patiencePct: 0.04 },
    why: "清明当天街上人少；但从墓园回来的人又累又饿，愿意点得实在，也坐得住。",
    kairo: "对应 `economy` 的节日类（客流 −、钱包 +）",
  },
  {
    id: "dragonBoat",
    name: "端午",
    when: "五六月，江边赛龙舟那天",
    line: "江边锣鼓一响，回来的人一身的汗，坐下就要冰的。",
    effect: { attractPct: 0.12, walletPct: -0.08 },
    why: "看龙舟的人流回来，但家家都吃了粽子，点得少 —— 人数涨、客单价掉。",
    kairo: "对应 `economy` 的节日类（客流 +、钱包 −）",
  },
  {
    id: "summerBreak",
    name: "放暑假",
    when: "七八月，学校空了，学生回了老家",
    line: "学生走了，游客来了，问路的比点单的多。",
    effect: { attractPct: 0.14, patiencePct: -0.075, walletPct: 0.05 },
    why: "暑假外地游客多、本地学生回家，总客流涨；游客急着赶下一站，等不起。",
    kairo: "对应 `economy` 的夏季「客流 +、耐心 −」",
  },
  {
    id: "payday",
    name: "发薪日",
    when: "每月十号前后，厂里和公司都在这几天发钱",
    line: "发钱那两天，桌上多出来的都是加菜，问价的少了。",
    effect: { walletPct: 0.16, patiencePct: -0.06 },
    why: "刚发钱的人舍得点，但也急 —— 拿了钱要去办别的事，等不了三分钟。",
    kairo: "对应 `economy` 的「钱包 +、耐心 −」",
  },
  {
    id: "waterCut",
    name: "停水",
    when: "说不准，老城区管网一修就停半天",
    line: "水龙头只有气声，洗碗的水要去隔壁借。",
    effect: { attractPct: -0.16, costPct: 0.05 },
    pair: "payday",
    why: "没水洗不了碗、烫不了粉，出碗被卡死；临时买桶装水、借水，料钱也上去。街上刚发薪，手里有钱的人还是照来。",
    kairo: "对应 `economy` 的「营业受阻」类",
  },
  {
    id: "gasUp",
    name: "气价上调",
    when: "说不准，一调就是整个季度",
    line: "灌气的三轮车来了，说这个月涨了，往后还得涨。",
    effect: { costPct: 0.1, patiencePct: -0.03 },
    pair: "marketRush",
    why: "老友粉全靠猛火，气贵了就得上成本；火小了出碗慢，客人等得心烦。赶上赶圩那天，人气能抵一抵。",
    kairo: "对应 `economy` 的「材料费 +」",
  },
  {
    id: "roadWork",
    name: "修路围挡",
    when: "常年都有，家门口那条路说挖就挖",
    line: "蓝铁皮把路口围掉一半，老客要绕两条巷子才看得见招牌。",
    effect: { attractPct: -0.135, patiencePct: 0.06 },
    pair: "schoolOpen",
    why: "围挡挡掉路过的客流；能绕进来的都是认门的老客，不催不赶。开学那天家长带小孩绕路来吃，多少补回来一点。",
    kairo: "对应 `economy` 的「位置受阻」（客流 −）",
  },
  {
    id: "expoSeason",
    name: "东博会",
    when: "九月，会展中心那边一开就是几天",
    line: "讲普通话和讲外语的都来了，一桌人拿着手机拍碗。",
    effect: { attractPct: 0.2, walletPct: 0.1, patiencePct: -0.06 },
    why: "会展期间外地客商涌进来，出手大方；但他们按日程走，等久了直接走人。",
    kairo: "对应 `economy` 的「全场客流 +、钱包 +」",
  },
];

export const MARKET_BY_ID = new Map<string, MarketDef>(MARKETS.map((m) => [m.id, m]));

export function marketById(id: string): MarketDef | undefined {
  return MARKET_BY_ID.get(id);
}

export const MARKET_TOTAL = MARKETS.length;
