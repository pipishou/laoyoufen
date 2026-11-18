/**
 * 街面（M2）：这条街上属于「大家」的东西，你出钱修，客人顺着这些路走进你店里。
 *
 * 为什么做这一层：M1 让「街上有谁」进了算术（同行抢客流），但玩家能动的只有自己那间店。
 * 开罗的中期有一半在「店外」——`help.txt` 的 Construction 与 rank.txt 的 Road Work 都是
 * 把街区当成可投资对象；我们把它本土化成 12 件南宁街坊的事：路灯、雨棚、凉茶铺、斑马线。
 *
 * 两条规矩：
 *   ① 每一项都必须落在一个**已经在用的乘数入口**上（进店率 / 客流池 / 排队位 / 候餐耐心 /
 *      饮料加购 / 熟客回礼 / 时段），不新开一套引擎；
 *   ② 每一项都带一句居民请求与一句到店台词，第一次买下来播一次，之后不再刷屏。
 *
 * 效果字段全是「增量百分比」，由 `sim/streets.ts` 汇总成乘数。
 */

/** 一天四段（每段 1/4 天）：0 早市 / 1 上午 / 2 午后 / 3 傍晚 */
export type DayPart = 0 | 1 | 2 | 3;

export type StreetId =
  | "lane_lamp"
  | "market_canopy"
  | "tea_shop"
  | "crosswalk"
  | "court"
  | "banyan_bench"
  | "toilet_sign"
  | "billboard"
  | "charger"
  | "notice_board"
  | "market_back"
  | "mahjong";

export interface StreetDef {
  id: StreetId;
  name: string;
  costYuan: number;
  /** 一句话效果（面板上直接给玩家看） */
  effect: string;
  /** 居民当初怎么提的这件事（第一次买之前的请求文案） */
  request: string;
  /** 修好之后，客人会说的那句话（买下来播一次） */
  line: string;
  /** 进店率增量（0.08 = +8%） */
  attractPct?: number;
  /** 客流池增量 */
  poolPct?: number;
  /** 排队位 +N */
  queuePlus?: number;
  /** 候餐耐心增量 */
  patiencePct?: number;
  /** 饮料加购概率增量 */
  drinkPct?: number;
  /** 熟客回礼增量 */
  giftPct?: number;
  /** 只在这个时段生效 */
  daypart?: DayPart;
}

export const STREETS: readonly StreetDef[] = [
  {
    id: "lane_lamp",
    name: "巷口路灯",
    costYuan: 6_000,
    effect: "进店 +8%（看得见招牌）",
    request: "巷子里黑，晚上收摊的人老踢到台阶。",
    line: "灯亮起那条巷，远远就看见你家招牌。",
    attractPct: 0.08,
  },
  {
    id: "market_canopy",
    name: "菜市雨棚",
    costYuan: 9_000,
    effect: "候餐耐心 +15%（下雨也有地方站）",
    request: "下雨天排队的人贴着墙站，衣服都湿了。",
    line: "棚子底下能站人了，落雨也不慌。",
    patiencePct: 0.15,
  },
  {
    id: "tea_shop",
    name: "凉茶铺",
    costYuan: 12_000,
    effect: "饮料加购 +30%（吃完想喝口凉的）",
    request: "吃完粉想喝口凉的，还得走两条街。",
    line: "隔壁凉茶铺开张，嗦完粉顺手来一杯。",
    drinkPct: 0.3,
  },
  {
    id: "crosswalk",
    name: "小学斑马线",
    costYuan: 15_000,
    effect: "早市那一段客流 +12%",
    request: "小孩过马路全靠车让人，家长不放心。",
    line: "画了斑马线，送完孩子的家长敢在门口停了。",
    attractPct: 0.12,
    daypart: 0,
  },
  {
    id: "court",
    name: "社区球场",
    costYuan: 20_000,
    effect: "午后那一段客流 +10%",
    request: "球场的水泥地裂了，年轻人跑去别处打球。",
    line: "球场一修，打完球的一身汗就往粉店跑。",
    attractPct: 0.1,
    daypart: 2,
  },
  {
    id: "banyan_bench",
    name: "榕树石凳",
    costYuan: 8_000,
    effect: "排队位 +2（有地方坐）",
    request: "榕树底下连个坐的地方都没有，老人站着等。",
    line: "石凳上坐满等位的人，看着就热闹。",
    queuePlus: 2,
  },
  {
    id: "toilet_sign",
    name: "公厕指示牌",
    costYuan: 5_000,
    effect: "候餐耐心 +10%（不用干着急）",
    request: "外头来的人找不到公厕，急得直转。",
    line: "牌子立起来，过路的也肯停下来吃一碗。",
    patiencePct: 0.1,
  },
  {
    id: "billboard",
    name: "街口广告牌",
    costYuan: 25_000,
    effect: "进店 +12%",
    request: "路口那块牌子空了三年，谁家店都没写。",
    line: "路口的大牌子写上你家名字，一整天都有人抬头看。",
    attractPct: 0.12,
  },
  {
    id: "charger",
    name: "充电桩",
    costYuan: 18_000,
    effect: "熟客回礼 +50%（骑手愿意多停一会）",
    request: "骑手等单没地方充电，蹲在墙根。",
    line: "骑手一边充电一边嗦粉，走的时候还带一碗。",
    giftPct: 0.5,
  },
  {
    id: "notice_board",
    name: "公告栏",
    costYuan: 4_000,
    effect: "进店 +4%",
    request: "停水停电的通知贴电线杆上，一阵风就没了。",
    line: "公告栏下面围一圈人，顺手就看见你家价牌。",
    attractPct: 0.04,
  },
  {
    id: "market_back",
    name: "菜市后门",
    costYuan: 30_000,
    effect: "客流池 +20%（买菜的人顺路进来）",
    request: "从菜市买完菜的人，得绕一大圈才到你这头。",
    line: "后门一开，提菜篮的直接从菜市走到你门口。",
    poolPct: 0.2,
  },
  {
    id: "mahjong",
    name: "棋牌室",
    costYuan: 22_000,
    effect: "傍晚那一段客流 +10%",
    request: "老人家下午没处去，蹲在骑楼下打牌。",
    line: "牌局散了正好来吃碗粉，一桌一桌地来。",
    attractPct: 0.1,
    daypart: 3,
  },
];

export const STREET_BY_ID: ReadonlyMap<string, StreetDef> = new Map(
  STREETS.map((s) => [s.id, s]),
);

/** 全部修完要多少钱（面板上给个总账） */
export const STREET_TOTAL_YUAN = STREETS.reduce((sum, s) => sum + s.costYuan, 0);

export function streetById(id: string): StreetDef | null {
  return STREET_BY_ID.get(id) ?? null;
}

export const DAYPART_WORD: Record<DayPart, string> = {
  0: "早市",
  1: "上午",
  2: "午后",
  3: "傍晚",
};
