/**
 * 店的样子（A1 空间层）—— 换一套门面，客人一进门就感觉得到。
 *
 * 来源：开罗 `storeparts.txt` 34 件 + `storepattern.txt` 6 行。
 *   - `storeparts` 是 6 套风格 × 5 个部件（Floor / Wall / Entrance / Chair / Table）
 *     ＋ 4 件基础件（Line Floor / Kitchen Floor / Kitchen Wall / Vending Machine）；
 *     价格 50 / 100 / 500 / 50 / 150（小额那档）到 100 / 200 / 1000 / 100 / 150（高档），
 *     合起来一套 ¥250–¥1,550。
 *   - `storepattern` 六行把 5 个部件 id 绑成一套：Vintage / Chic / Amazing / Cafe / Retro / Natural。
 *   - `casket` 14 行 × 227 列是「每个店等级怎么摆这些部件」，我们不做格子编辑器，
 *     这一层只做「整套换」，不做「单件挪位置」。
 *
 * 本土化：开罗那六套是「Vintage / Chic / Amazing」这种没地名的形容词，
 * 我们换成南宁街上真实存在的六种店面。每一套都对应一种**看得见的老铺**，
 * 玩家一眼能认出「这是水街那种骑楼」「这是中山路夜市那种摊」。
 *
 * 纪律（与 `data/combo.ts` / `data/flavor.ts` 同一条）：
 *   1. 一套 = 5 件（地面 / 墙 / 门头 / 桌 / 凳），只换样子与三个小加成，
 *      不新增可买家当，也不和 `GEARS` 抢位置；
 *   2. 加成只落已有乘数：进店（spawnChance）、满意（satisfactionOf）、耐心（patienceScale）；
 *   3. 同一时间只有一套在店里生效，所以不需要像家当那样做封顶 —— 单套数值直接就是上限。
 */

export type StyleId = "qilou" | "dapaidang" | "tangshui" | "yeshi" | "shijia" | "xincheng";

/** 五个部件：和开罗 storeparts 的 Floor / Wall / Entrance / Table / Chair 一一对应 */
export type StylePart = "floor" | "wall" | "entrance" | "table" | "chair";

export const STYLE_PART_LABEL: Record<StylePart, string> = {
  floor: "地面",
  wall: "墙面",
  entrance: "门头",
  table: "桌子",
  chair: "凳子",
};

/** 五个部件的具体样子（本土化后的名字，面板上逐件写出来） */
export type StyleParts = Record<StylePart, string>;

/** 一套店面的加成。只允许落在已有乘数上。 */
export interface StyleEffect {
  /** 进店百分比（+0.04 = 路过的人多 4% 愿意进来） */
  attractPct?: number;
  /** 每碗满意度点数 */
  satBonus?: number;
  /** 耐心百分比（+0.05 = 愿意多等 5%） */
  patiencePct?: number;
}

export interface StyleDef {
  id: StyleId;
  name: string;
  /** 一眼认得出的画面（面板上用这一句） */
  look: string;
  /** 现实中长在哪（本土化依据：要能指到南宁哪条街哪类店） */
  where: string;
  parts: StyleParts;
  costYuan: number;
  effect: StyleEffect;
  /** 面板上一行效果文字 */
  effectText: string;
  /** 换上的时候店里的人会说的一句 */
  line: string;
  kairo: string;
}

export const STYLES: readonly StyleDef[] = [
  {
    id: "qilou",
    name: "骑楼老铺",
    look: "青砖地、灰砖墙、趟栊门，门口一道拱廊，下雨天客人顺着廊子走进来。",
    where: "水街、兴宁路一带的骑楼老铺",
    parts: { floor: "青砖地", wall: "灰砖墙", entrance: "趟栊门", table: "圆木桌", chair: "长条凳" },
    costYuan: 400,
    effect: { attractPct: 0.02, patiencePct: 0.02 },
    effectText: "进店 +2%、耐心 +2%",
    line: "门一开，像回到我细个时候那条街。",
    kairo: "storeparts「Line Floor / Vintage Wall / Vintage Entrance」＋ storepattern「Vintage」",
  },
  {
    id: "dapaidang",
    name: "大排档",
    look: "水泥地、蓝白格桌布、铁皮棚，塑料凳一摆就是一桌。",
    where: "中山路夜市那种排档",
    parts: { floor: "水泥地", wall: "蓝白格墙", entrance: "铁皮棚", table: "折叠圆桌", chair: "塑料凳" },
    costYuan: 900,
    effect: { attractPct: 0.03, patiencePct: 0.04 },
    effectText: "进店 +3%、耐心 +4%",
    line: "坐低就食，唔使讲究，热天最舒服。",
    kairo: "storeparts「Chic Floor / Chic Table」＋ storepattern「Chic」",
  },
  {
    id: "tangshui",
    name: "糖水铺",
    look: "黄绿马赛克地、半墙瓷砖、玻璃柜，吊扇一转整间都凉。",
    where: "老城区那种开了二十年的糖水铺",
    parts: { floor: "马赛克地", wall: "黄绿瓷砖", entrance: "玻璃柜门头", table: "小圆桌", chair: "塑胶靠背凳" },
    costYuan: 1_600,
    effect: { attractPct: 0.04, satBonus: 1, patiencePct: 0.03 },
    effectText: "进店 +4%、每碗满意 +1、耐心 +3%",
    line: "呢度坐下来食粉，比企喺街边舒服。",
    kairo: "storeparts「Cafe Floor / Cafe Wall / Cafe Entrance」＋ storepattern「Cafe」",
  },
  {
    id: "yeshi",
    name: "夜市摊",
    look: "沥青地、蓝布棚、一圈 LED 串灯，晚上亮得像过节。",
    where: "琅西夜市、望州岭那边的夜宵摊",
    parts: { floor: "沥青地", wall: "蓝布围挡", entrance: "串灯棚", table: "矮方桌", chair: "小马扎" },
    costYuan: 2_400,
    effect: { attractPct: 0.05, patiencePct: 0.05 },
    effectText: "进店 +5%、耐心 +5%",
    line: "灯一亮，整条街都晓得你开档了。",
    kairo: "storeparts「Amazing Entrance / Amazing Table」＋ storepattern「Amazing」",
  },
  {
    id: "shijia",
    name: "老友世家",
    look: "水磨石地、整墙木匾、铝皮灶台，墙角一口酸笋坛。",
    where: "解放路天福香、共和路共一老友面这种几十年老店",
    parts: { floor: "水磨石地", wall: "木匾墙", entrance: "黑漆木匾", table: "八仙桌", chair: "方木凳" },
    costYuan: 4_000,
    effect: { attractPct: 0.05, satBonus: 2, patiencePct: 0.02 },
    effectText: "进店 +5%、每碗满意 +2、耐心 +2%",
    line: "呢间铺睇落就有年头，食得放心。",
    kairo: "storeparts「Retro Floor / Retro Wall / Retro Entrance」＋ storepattern「Retro」",
  },
  {
    id: "xincheng",
    name: "新城小店",
    look: "白瓷砖地、不锈钢台面、玻璃门，扫码点单，亮得反光。",
    where: "青秀区新开的连锁粉店",
    parts: { floor: "白瓷砖地", wall: "白瓷墙面", entrance: "玻璃门", table: "白色餐桌", chair: "靠背椅" },
    costYuan: 6_500,
    effect: { attractPct: 0.07, satBonus: 2 },
    effectText: "进店 +7%、每碗满意 +2",
    line: "干净、凉快、出餐快，我日日来。",
    kairo: "storeparts「Natural Floor / Natural Wall / Natural Entrance」＋ storepattern「Natural」",
  },
];

export const STYLE_BY_ID: ReadonlyMap<string, StyleDef> = new Map(STYLES.map((s) => [s.id, s]));

/** 六套全买要多少钱 */
export const STYLE_TOTAL_YUAN = STYLES.reduce((sum, s) => sum + s.costYuan, 0);

export function styleById(id: string): StyleDef | undefined {
  return STYLE_BY_ID.get(id);
}
