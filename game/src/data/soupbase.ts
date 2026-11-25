/**
 * 汤底：骨头汤打底，再定「加哪一味」（批 Z′ / Z″）。
 *
 * ## 老友粉的底层逻辑（这一版的出发点）
 *
 * 锅底不是三选一，是**两层**：
 *
 *   1. **骨头汤是共同底** —— 猪骨焯水、小火吊着，汤面不滚，吊到发白。这一层不给玩家选，
 *      它只是一口锅在哪儿；没吊骨汤就没有「汤底」这回事。
 *   2. **骨汤之外另加的那一味** —— 酸笋（老友标配）／番茄／猪脚卤水。
 *      选的是「这一锅汤最后落脚在哪一味上」，不是「把骨汤换掉」。
 *
 * 之后的工序是**固定的三道**，不随底变（`SOUP_PIPELINE`）：
 * 吊骨汤 → 热油爆酸笋、豆豉、蒜末与辣椒 → 冲汤下粉。
 *
 * ## 为什么不做「清汤底」
 *
 * `data/dish-name.ts` 里我们已经核过一句：南宁粉店没有浓汤清汤之分。再加一档清汤，
 * 等于拿自己核过的说法打自己 —— 所以这一层只有「加哪一味」，没有「要不要浓」。
 *
 * ## 纪律（三条）
 *
 *   1. 只落**两个**已有出口 —— 汤底分（`soup`）与料钱（`cost`），**不碰任何乘数**；
 *   2. 默认档（酸笋老友底）必须零偏移，否则所有历史回归锁一起动；
 *   3. 不许「又便宜又好喝」：`costDelta <= 0` 的底，`soupDelta` 必须 `<= 0`。
 *
 * 出处都核过原文，`quote` 是原句，链接留着。
 */

export type SoupBaseId = "laoyou" | "tomato" | "piglioo";

export interface SoupBaseSource {
  label: string;
  url: string;
  quote: string;
}

/** 共同底：骨头汤。不给玩家选，只写在界面上一句话。 */
export const SOUP_BROTH = "骨头汤";

/** 固定三道工序（不随底变） */
export interface SoupStep {
  /** 第几步 */
  order: number;
  name: string;
  what: string;
}

export const SOUP_PIPELINE: readonly SoupStep[] = [
  {
    order: 1,
    name: "吊骨汤",
    what: "猪骨先焯水去浮沫，再小火吊着，汤面不滚，吊到发白",
  },
  {
    order: 2,
    name: "爆香",
    what: "热油先下酸笋、豆豉、蒜末与辣椒，爆到呛鼻",
  },
  {
    order: 3,
    name: "冲汤下粉",
    what: "爆好的料里冲进骨汤，滚起来再下粉，起锅前补盐",
  },
];

export interface SoupBaseDef {
  id: SoupBaseId;
  name: string;
  /** 骨汤之外另加的那一味（面板卡上写「加 X」） */
  extra: string;
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
    extra: "酸笋",
    look: "吊好的骨汤，爆香时下酸笋、豆豉、蒜末与辣椒，冲汤就是这一锅",
    costDelta: 0,
    soupDelta: 0,
    needCustomers: 0,
    line: "这才是老友粉该有的那股呛香，闻见就晓得是巷口那家。",
    why: "老友粉的立身之本就在那一爆：酸笋、豆豉、蒜、辣椒下热油，再冲骨汤下粉。酸笋是标配，所以零偏移。",
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
    extra: "番茄",
    look: "骨汤照吊，番茄先炒到出沙再并进汤里，酸笋最后压一勺",
    costDelta: 0.5,
    soupDelta: 3,
    needCustomers: 120,
    line: "酸里带一点点甜，天热没胃口的时候，这碗才开得了口。",
    why: "南宁有些老店在骨汤之外再加番茄：多一道番茄要钱也要火候，换来的是开胃 —— 所以贵五毛、汤底分高三点。",
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
    extra: "猪脚卤水",
    look: "骨汤里再吊一锅猪脚卤水，汤面挂一层胶质，爆香照旧",
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

/** 默认底（酸笋老友底）：配方里没写 `base` 时就是它，零偏移 */
export const DEFAULT_SOUP_BASE: SoupBaseId = "laoyou";

/** 查底；查不到就回默认底 —— 老档、脏档都不炸 */
export function soupBaseById(id: string | null | undefined): SoupBaseDef {
  const hit = id ? SOUP_BASE_BY_ID.get(id) : undefined;
  return hit ?? SOUP_BASE_BY_ID.get(DEFAULT_SOUP_BASE)!;
}

/** 三道工序压成一句话（面板用） */
export function soupPipelineWords(): string {
  return SOUP_PIPELINE.map((s) => s.name).join(" → ");
}
