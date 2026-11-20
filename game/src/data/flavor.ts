/**
 * 味道组合（B1 味道层）—— 「这几味凑一块，才是那一口」。
 *
 * 来源：开罗 `soupaffinity.txt`（28 行「位掩码 + 加成」，`-1` 是惩罚）与
 * `topping_combo.txt`（38 行配料两两/三三组合）。原作做的是**矩阵**：
 * 任意两味的组合都有一行，玩家要试几十次才知道哪两味相冲。
 *
 * 我们不照抄矩阵，只做 6 条 —— 每一条都必须是**南宁真的有人这么做**，
 * 而且能指出出处（`source` 里带链接与原话）。理由：
 *   1. 老友粉的味不是「任意配对的化学反应」，是几套成型的吃法：
 *      三味爆香、番茄入汤、豆芽垫底、猪杂三样、夏天干捞、冬天砂锅；
 *   2. 矩阵的价值在「试出来的惊喜」，可我们的顾客只有 24 类、一天 2 分钟，
 *      试错成本比开罗高一个数量级 —— 矩阵在这个节奏下等于噪声；
 *   3. 每一条都**绑一个场景**（时间段 / 季节 / 客群），玩家凑齐后知道
 *      「什么时候端这碗」，而不是「+2 满意，收工」。
 *
 * 纪律（与 `data/combo.ts` 同一条）：只吃**已经存在**的浇头与粉型，
 * 不新增可买件；加成只落在已经生效的乘数上，并且总量封顶
 * （见 `sim/flavor.ts` 的 `FLAVOR_CAP`）。
 *
 * 出处都查过原文，摘句照抄，链接留着 —— 谁觉得哪条不对，点开就能核。
 */

import type { NoodleId } from "./noodles";

export type FlavorId =
  | "classic"
  | "tomato_sour"
  | "sprout_offal"
  | "offal_three"
  | "dry_mince"
  | "claypot_offal";

/** 一条味道组合的加成。只允许落在已有乘数上。 */
export interface FlavorEffect {
  /** 味道分（汤底那一半），0-100 制里的点数 */
  soup?: number;
  /** 魅力（看相 + 配料组合），0-100 制里的点数 */
  charm?: number;
  /** 满意度点数（进 settle 的 bonus 链） */
  sat?: number;
  /** 耐心百分比（+0.05 = 多等 5%） */
  patiencePct?: number;
  /** 料钱百分比（−0.04 = 省 4%） */
  costPct?: number;
  /** 出碗时间百分比（−0.05 = 快 5%） */
  servePct?: number;
}

/** 一条出处：从哪看到的、原话怎么说的 */
export interface FlavorSource {
  label: string;
  url: string;
  quote: string;
}

export interface FlavorDef {
  id: FlavorId;
  name: string;
  /** 什么时候最有用 —— 场景绑定，面板上就写这句 */
  when: string;
  /** 触发：这些浇头**都要有**（`top.*`，见 data/ingredients.ts） */
  toppings: readonly string[];
  /** 触发：粉型（不写 = 任何粉型都成立） */
  noodle?: NoodleId;
  effect: FlavorEffect;
  /** 成立后的一句南宁话 */
  line: string;
  /** 这为什么是老友粉的吃法（一句） */
  why: string;
  source: readonly FlavorSource[];
}

export const FLAVORS: readonly FlavorDef[] = [
  {
    id: "classic",
    name: "老友三味",
    when: "全年基本盘",
    toppings: ["top.sourbamboo", "top.douchi", "top.chili"],
    effect: { soup: 3 },
    line: "酸笋、豆豉、辣椒一下锅，半条巷子都晓得你在炒什么。",
    why: "老友粉之所以叫老友，就是这三味在热油里爆出来的那股香。",
    source: [
      {
        label: "南宁日报《把冬天酿成暖暖的甜》",
        url: "http://nnrb.nnnews.net:8080/nnrb/20251222/html/page_05_content_000.htm",
        quote: "老板正挥舞长勺炒料——将酸笋、豆豉、蒜末在热油里爆炒出浓香。",
      },
      {
        label: "《秋天的第一碗老友粉，还有驱寒的作用？》",
        url: "http://mp.weixin.qq.com/s?__biz=MzkzOTg3Nzg0Mg==&mid=2247489800&idx=1&sn=c6a6c7d89d07f1845db2b649682ae2f4",
        quote: "辣椒、酸笋、豆豉、肉片，猛火爆炒，滚汤入粉，夏天开胃，秋冬驱寒。",
      },
    ],
  },
  {
    id: "tomato_sour",
    name: "番茄入汤",
    when: "天热没胃口的时候",
    toppings: ["top.tomato", "top.sourbamboo", "top.douchi"],
    effect: { sat: 2, patiencePct: 0.05 },
    line: "番茄要炒到化进汤里，酸里带一点点甜，人才开胃。",
    why: "南宁有些老店的老友粉底就是番茄配酸笋，酸甜开胃，夏天最好卖。",
    source: [
      {
        label: "搜狐《南宁的人气砂锅粉……灵魂酸辣椒》",
        url: "https://www.sohu.com/a/627255384_121609000",
        quote: "老友粉是店里最贵但是最受欢迎的，汤底是番茄和酸笋，酸酸甜甜很开胃。",
      },
      {
        label: "下厨房《猪杂老友粉》",
        url: "https://www.xiachufang.com/recipe/104225502/",
        quote: "广西老友粉～搭配独特的酸笋豆豉番茄，味道鲜美，让人回味无穷。",
      },
    ],
  },
  {
    id: "sprout_offal",
    name: "豆芽垫底",
    when: "早市与平价客",
    toppings: ["top.douya", "top.offal"],
    effect: { costPct: 0.04, sat: 1 },
    line: "碗底垫一把豆芽，汤不腻，成本也压得住。",
    why: "豆芽是老友粉的标配底菜，猪杂粉尤其要有它压住油气。",
    source: [
      {
        label: "《北山｜正宗老友粉，宠粉价⑦元》",
        url: "http://mp.weixin.qq.com/s?__biz=MzA3MDEyMjE4OA==&mid=2653447021&idx=2&sn=e08d616b0edb788207cae7089cae0924",
        quote: "每碗老友粉标配香菇、鹌鹑蛋和绿豆芽，配料管够。",
      },
      {
        label: "下厨房《南宁老友粉》",
        url: "https://m.xiachufang.com/recipe/103856948/",
        quote: "吃的时候加点葱和香菜更好吃哦，还有豆芽，感觉豆芽太百搭。",
      },
    ],
  },
  {
    id: "offal_three",
    name: "猪杂三样",
    when: "晚市与宵夜，客人要重口",
    toppings: ["top.pigliver", "top.pigchitterling", "top.offal"],
    effect: { sat: 3, charm: 4 },
    line: "肝要嫩、粉肠要爽，猪杂别煮老，这三样凑齐才叫一碗。",
    why: "老友猪杂粉就是猪肝、粉肠、瘦肉一起下，南宁人认这个料足。",
    source: [
      {
        label: "《北山｜正宗老友粉，宠粉价⑦元》",
        url: "http://mp.weixin.qq.com/s?__biz=MzA3MDEyMjE4OA==&mid=2653447021&idx=2&sn=e08d616b0edb788207cae7089cae0924",
        quote: "满满一碗「猪杂老友粉」，有猪肝、粉肠、瘦肉和少见的竹肠。",
      },
      {
        label: "下厨房《南宁老友粉》",
        url: "https://m.xiachufang.com/recipe/103856948/",
        quote: "锅热下猪杂炒至变色，加入葱姜蒜末炒匀，再加入豆豉和酸笋。",
      },
    ],
  },
  {
    id: "dry_mince",
    name: "干捞肉末",
    when: "夏天 6–9 月，越热越好卖",
    toppings: ["top.mince"],
    noodle: "dry",
    effect: { servePct: 0.05, sat: 2 },
    line: "干捞不掺汤，肉末一拌，酸辣全挂在粉上。",
    why: "天热没人想喝滚汤，粉过冷水一捞，靠肉末跟豆豉把味提起来。",
    source: [
      {
        label: "大众点评《南宁老友粉》",
        url: "http://www.dianping.com/discovery/658732405",
        quote: "干捞的粉不会像汤粉那样的软烂，浇头也没有被汤稀释更加酸辣……加上各种肉沫就更香了。",
      },
      {
        label: "《秋天的第一碗老友粉……》",
        url: "http://mp.weixin.qq.com/s?__biz=MzkzOTg3Nzg0Mg==&mid=2247489800&idx=1&sn=c6a6c7d89d07f1845db2b649682ae2f4",
        quote: "可以选择这里的老友干捞粉，味道也很赞，干捞粉几乎不辣，宽粉口感很爽滑。",
      },
    ],
  },
  {
    id: "claypot_offal",
    name: "砂锅猪杂",
    when: "冬天 11–2 月，冷到发抖的日子",
    toppings: ["top.offal"],
    noodle: "claypot",
    effect: { patiencePct: 0.08, sat: 2 },
    line: "滚着端上桌，吃到最后一口还是烫的，这才叫过冬。",
    why: "南宁一入冬，砂锅粉就是刚需 —— 砂锅能保温，一碗吃到出汗。",
    source: [
      {
        label: "今日头条《在南宁，每年入冬必吃的砂锅粉》",
        url: "https://www.toutiao.com/article/7181645200844980740/",
        quote: "砂锅粉有简单的湿粉，也有红薯粉，煮得滚烫再端上来……吃到一半就能出汗。",
      },
      {
        label: "南国早报《10℃ 以下的冬天，南宁人都靠这些东西御寒》",
        url: "https://www.ngzb.com.cn/news/32482.html",
        quote: "因为砂锅可以保持温度的特性，让吃粉的整个过程都是热乎乎的。",
      },
    ],
  },
];

export const FLAVOR_BY_ID = new Map<string, FlavorDef>(FLAVORS.map((f) => [f.id, f]));
export const FLAVOR_TOTAL = FLAVORS.length;

export function flavorById(id: string): FlavorDef | undefined {
  return FLAVOR_BY_ID.get(id);
}
