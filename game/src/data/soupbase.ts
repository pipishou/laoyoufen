/**
 * 汤底三底（批 Z′）—— 「同一碗粉，锅底可以不一样」。
 *
 * 来历：开罗 `soupaffinity.txt` 是 28 行「位掩码 + 加成」的相性矩阵，我们上一批
 * 已经用 `data/flavor.ts` 的七条成型吃法与 `data/pairing.ts` 的二十条搭法
 * 接住了「哪几味凑一块」，所以这一层**不做矩阵**，只做一件事：
 * 让玩家在配方页选**这一款的汤是拿什么打底**。
 *
 * 为什么只有三底：
 *   1. 南宁粉店的汤底在报道里被点到名字的就这几种 —— 酸笋豆豉爆香的「老友底」、
 *      番茄炒沙的「番茄底」、骨头汤加猪脚卤水的「猪脚底」；
 *   2. 三种刚好构成「零偏移 / 贵一点更好喝 / 更贵更好喝」的取舍，再多就变成记忆负担；
 *   3. **不做「清汤底」**：`data/dish-name.ts` 已经写过「南宁粉店没有浓汤清汤之分」，
 *      再加一档清汤等于把我们自己核过的说法否掉。
 *
 * 纪律（三条，与骨三档、碗五只同一条）：
 *   1. 只落**两个**已有出口 —— 汤底分（`soup`）与料钱（`cost`），
 *      **不碰任何乘数**：客流、耐心、出碗、满意度一个都不动；
 *   2. 默认档（老友底）必须是零偏移，否则所有历史回归锁一起动；
 *   3. 不许出现「又便宜又好喝」的一档 —— 那等于没有选择。
 *
 * 出处都核过原文，`quote` 是原句，链接留着。
 */

export type SoupBaseId = "laoyou" | "tomato" | "piglioo";

export interface SoupBaseSource {
  label: string;
  url: string;
  quote: string;
}

export interface SoupBaseDef {
  id: SoupBaseId;
  name: string;
  /** 锅里在干什么（面板上一句） */
  look: string;
  /** 每碗料钱的增减（元），正数更贵 */
  costDelta: number;
  /** 汤底分增减（0-100 制里的点数，只进 soup） */
  soupDelta: number;
  /** 要卖出多少碗才解锁（0 = 一开始就能选） */
  needCustomers: number;
  /** 选这一底之后客人的一句 */
  line: string;
  /** 为什么这一底是这个数 */
  why: string;
  /** 开罗表名 + 行序（对照用，不抄数值） */
  kairo: string;
  source: readonly SoupBaseSource[];
}

export const SOUP_BASES: readonly SoupBaseDef[] = [
  {
    id: "laoyou",
    name: "老友底",
    look: "热油先爆酸笋、豆豉、蒜末与辣椒，香味起来了再冲骨汤",
    costDelta: 0,
    soupDelta: 0,
    needCustomers: 0,
    line: "这才是老友粉该有的那股呛香，闻见就晓得是巷口那家。",
    why: "老友粉的立身之本就在这一爆：酸笋、豆豉、蒜、辣椒下热油，再滚汤下粉。零偏移，因为这就是标准答案。",
    kairo: "soupaffinity.txt 第 1–7 行（掩码组合里最基础的那一组）",
    source: [
      {
        label: "南宁日报《把冬天酿成暖暖的甜》",
        url: "http://nnrb.nnnews.net:8080/nnrb/20251222/html/page_05_content_000.htm",
        quote: "老板正挥舞长勺炒料——将酸笋、豆豉、蒜末在热油里爆炒出浓香。",
      },
    ],
  },
  {
    id: "tomato",
    name: "番茄底",
    look: "番茄下锅炒到出沙、化进汤里，再压一勺酸笋",
    costDelta: 0.5,
    soupDelta: 3,
    needCustomers: 120,
    line: "酸里带一点点甜，天热没胃口的时候，这碗才开得了口。",
    why: "南宁有些老店的底就是番茄配酸笋：多一道番茄要钱也要火候，换来的是开胃 —— 所以贵五毛、汤底分高三点。",
    kairo: "soupaffinity.txt 第 8–14 行（番茄与酸笋同选的组合）",
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
    id: "piglioo",
    name: "猪脚底",
    look: "骨头汤里再吊一锅猪脚卤水，汤面挂一层胶质",
    costDelta: 1.2,
    soupDelta: 5,
    needCustomers: 400,
    line: "汤稠一点，挂在粉上不散，吃完嘴皮子是黏的 —— 这才叫浓。",
    why: "有的店拿骨头汤加猪脚卤水吊底，胶质让汤「厚」；代价是猪脚钱比骨头贵得多，所以一碗多一块二、汤底分高五点。",
    kairo: "soupaffinity.txt 第 15–21 行（骨 + 胶质同选的组合）",
    source: [
      {
        label: "大众点评《南宁老友粉》",
        url: "http://www.dianping.com/discovery/658732405",
        quote: "他家汤底浓郁，由骨头汤加猪脚卤水而成，胶质口感搭配青菜碎（或豆芽、当季蔬菜碎）绝妙。",
      },
    ],
  },
];

export const SOUP_BASE_TOTAL = SOUP_BASES.length;

export const SOUP_BASE_BY_ID: ReadonlyMap<string, SoupBaseDef> = new Map(
  SOUP_BASES.map((b) => [b.id, b]),
);

/** 默认底（老友底）：配方里没写 `base` 时就是它，零偏移 */
export const DEFAULT_SOUP_BASE: SoupBaseId = "laoyou";

/** 查底；查不到就回默认底 —— 老档、脏档都不炸 */
export function soupBaseById(id: string | null | undefined): SoupBaseDef {
  const hit = id ? SOUP_BASE_BY_ID.get(id) : undefined;
  return hit ?? SOUP_BASE_BY_ID.get(DEFAULT_SOUP_BASE)!;
}
