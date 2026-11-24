/**
 * 配料 / 原料表。
 *
 * 结构溯源：REA 的 `topping`（44 行 × 42 列）与 `soupmaterial`（41 行 × 45 列）、
 * `noodlesmaterial`（14 行 × 31 列）三张表。这里只借**表的形状**：
 * 「一行 = 一个物料，带成本 + 魅力 + 风味标签」，不借行名、不借数值。
 * 原作 42 列里有一半是列语义未核实的参数对（报告 §2 风险 2 自认 46/49 张表没做逐列核对），
 * 照抄等于把猜测写进代码。
 *
 * 数值口径：南宁骑楼夜市粉店，2026 年零售价重推 [GUESS, LOW]。
 * 只对**相对关系**有把握（牛腩/牛杂 ≈ 猪杂 > 瘦肉 > 青菜 > 酸笋/豆豉），绝对值等采购单替换。
 */

import { GUANGXI } from "./balance";

export type FlavorTag = "酸" | "辣" | "鲜" | "咸" | "香" | "青菜" | "肉" | "杂" | "甜";

/** 荤素分档，给 UI 分组与「浇头三件套」计数用 */
export type IngredientKind = "offal" | "meat" | "veg" | "soy" | "egg" | "staple" | "seasoning";

export interface Ingredient {
  id: string;
  name: string;
  /** REA 原表里的对应行名，仅用于结构溯源；数值不取原作 */
  reaRef: string;
  kind: IngredientKind;
  /** 成本档 1-3，只用于 UI 排序，真实成本看 cost */
  tier: 1 | 2 | 3;
  /** 每碗成本（元） */
  cost: number;
  /** 菜单加价（元）。0 = 基础料，不单收费 */
  price: number;
  /** 魅力基础值 0-100，用于「这碗粉看起来值不值」 */
  charm: number;
  tags: readonly FlavorTag[];
  /**
   * 出处。**没有出处的不进这张表** —— 老友粉的浇头是有地方性的，
   * 牛腩、牛百叶、牛肉丸、腐竹、花生这些是「别的粉」的加料，
   * 混进来就是把螺蛳粉与牛腩粉的东西写进老友粉的菜单。
   */
  source?: readonly IngredientSource[];
  /** 给 UI 与文档看的补充说明（例如「属加菜，不是老友粉本体」） */
  note?: string;
}

/** 一条出处：本地标准、店铺价目表或做法实录。quote 为原文摘句 */
export interface IngredientSource {
  label: string;
  url: string;
  quote: string;
}

/**
 * 汤底基础料（每碗摊薄成本）。对应 REA `soupmaterial` 的「一次选多种、成本相加」形状。
 * 老友粉的主料**固定**是酸笋 + 蒜 + 豆豉 + 辣椒酱（地方标准 DB4501/T 0046—2024 §3.1），
 * 所以这四项不做成可选，直接进基础成本。
 */
export const SOUP_MATERIALS: readonly Ingredient[] = [
  { id: "soup.porkbone", name: "猪筒骨", reaRef: "Pig Thighbones", kind: "meat", tier: 2, cost: 1.4, price: 0, charm: 0, tags: ["鲜"] },
  { id: "soup.chickenbone", name: "鸡架", reaRef: "Chicken Bones", kind: "meat", tier: 1, cost: 0.6, price: 0, charm: 0, tags: ["鲜"] },
  { id: "soup.sourbamboo", name: "酸笋", reaRef: "Menma", kind: "veg", tier: 1, cost: 0.8, price: 0, charm: 0, tags: ["酸"] },
  { id: "soup.douchi", name: "豆豉", reaRef: "Red Miso", kind: "seasoning", tier: 1, cost: 0.4, price: 0, charm: 0, tags: ["咸", "鲜"] },
  { id: "soup.garlic", name: "蒜米", reaRef: "Garlic", kind: "seasoning", tier: 1, cost: 0.3, price: 0, charm: 0, tags: ["香"] },
  { id: "soup.chili", name: "辣椒酱", reaRef: "Chili Pepper", kind: "seasoning", tier: 1, cost: 0.4, price: 0, charm: 0, tags: ["辣"] },
  { id: "soup.ginger", name: "姜", reaRef: "Ginger", kind: "seasoning", tier: 1, cost: 0.2, price: 0, charm: 0, tags: ["香"] },
  { id: "soup.scallion", name: "葱花", reaRef: "Leek", kind: "veg", tier: 1, cost: 0.3, price: 0, charm: 0, tags: ["香"] },
];

/**
 * 米粉原料。对应 REA `noodlesmaterial`（6 面粉 + 8 碱水）。
 * 老友粉只有米没有碱，所以碱水那一半不映射；保留「一种主料决定成本档位」的列形状。
 */
export const NOODLE_MATERIALS: readonly Ingredient[] = [
  { id: "noodle.oldrice", name: "陈籼米", reaRef: "Normal Flour", kind: "staple", tier: 1, cost: 0.8, price: 0, charm: 0, tags: [] },
  { id: "noodle.freshcut", name: "本地鲜切粉", reaRef: "Good Flour", kind: "staple", tier: 2, cost: 1.1, price: 0, charm: 0, tags: [] },
];

/**
 * 20 种浇头。**每一条都带出处**（`source`），没有出处的不做 —— 这是本土化的底线。
 *
 * 2026-11-22 审计删掉 17 条，理由写在下面这段（保留痕迹，免得下次又凭想象加回来）：
 * - 紫苏 / 酸豆角 / 空心菜 / 油麦菜 / 菜心 / 西洋菜 / 木耳 / 黄花菜 / 萝卜干：
 *   老友粉的加菜实录里只有**生菜**与**豆芽**（金鹏「加生菜 ¥5」、潘晓君「素菜有豆芽、酸笋」），
 *   其余是螺蛳粉或别的粉店的加菜；而且老南宁的说法里「正宗老友粉本来就没有青菜」。
 * - 猪红 / 猪手 / 五花肉 / 牛百叶 / 牛肉丸 / 牛杂：查不到老友粉的做法或价目表出处。
 *   猪手是**猪脚粉**（独立品类），牛腩粉是玉林那一系，都不是老友粉的浇头。
 * - 腐竹 / 花生：螺蛳粉的标配，老友粉的菜单上没有。
 *
 * 留下 20 条的分布：老友基础 7（酸笋、豆豉、酸辣椒、西红柿、生菜、豆芽、葱花）、
 * 猪杂 5（猪杂、粉肠、花肠、猪肚、猪肝）、猪肉 3（猪肉片、瘦肉片、碎肉）、
 * 牛肉 1（牛肉片）、加菜 1（牛腩，见 `note`）、蛋与主食 3（煎蛋、鹌鹑蛋、油条）。
 * `top.brisket` 保留但标成**加菜**：施记老友粉的加菜单上确实有牛腩 ¥7，
 * 可它不是老友粉的本体配料，所以 `note` 写清楚，界面上不进「老友三件套」的推荐。
 */
export const TOPPINGS: readonly Ingredient[] = [
  // ---- 老友基础（酸笋、豆豉、蒜、辣椒是标准里的主料） ----
  {
    id: "top.sourbamboo", name: "酸笋", reaRef: "Menma", kind: "veg", tier: 1,
    cost: 0.8, price: 2, charm: 20, tags: ["酸"],
    source: [
      { label: "南宁市地方标准 DB4501/T 0046—2024《非物质文化遗产 南宁老友粉制作技艺》",
        url: "http://scjgj.nanning.gov.cn/xxgk/tzgg_6596/P020241224420922861862.pdf",
        quote: "以米粉、酸笋、大蒜、豆豉、辣椒酱、热汤等为主料" },
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加酸笋 —— 2元" },
    ],
  },
  {
    id: "top.douchi", name: "豆豉", reaRef: "Fermented Black Bean", kind: "seasoning", tier: 1,
    cost: 0.3, price: 1, charm: 12, tags: ["咸", "鲜"],
    source: [
      { label: "南宁市地方标准 DB4501/T 0046—2024",
        url: "http://scjgj.nanning.gov.cn/xxgk/tzgg_6596/P020241224420922861862.pdf",
        quote: "7.1.4 豆豉应无霉变，色泽均匀，并应符合 T/GXAS 889 的规定" },
      { label: "广西新闻网《老友酱有了统一标准》",
        url: "https://www.ngzb.com.cn/news/2024/12/03/laoyou-youliao-tongyibiaozhun-fenhui-tongyige-weima.html",
        quote: "老友酱一定是以南宁特定的酸笋、大蒜、辣椒（或泡椒）、豆豉为主要原料" },
    ],
  },
  {
    id: "top.chili", name: "酸辣椒", reaRef: "Shredded Chili", kind: "seasoning", tier: 1,
    cost: 0.4, price: 1, charm: 15, tags: ["酸", "辣"],
    source: [
      { label: "南宁市地方标准 DB4501/T 0046—2024",
        url: "http://scjgj.nanning.gov.cn/xxgk/tzgg_6596/P020241224420922861862.pdf",
        quote: "以米粉、酸笋、大蒜、豆豉、辣椒酱、热汤等为主料" },
    ],
  },
  {
    id: "top.tomato", name: "西红柿", reaRef: "Tomato", kind: "veg", tier: 1,
    cost: 0.6, price: 2, charm: 14, tags: ["酸", "甜"],
    source: [
      { label: "下厨房《经典广西南宁汤粉｜南宁老友粉》",
        url: "https://www.xiachufang.com/recipe/107211732/",
        quote: "番茄 3只" },
      { label: "大众点评《在广州……这家的老友粉我能一周嗦三次》",
        url: "https://www.dianping.com/discovery/1303671914",
        quote: "每一份里边的猪肝、猪肉、猪肠，酸笋、番茄等等都很丰富" },
    ],
    note: "放不放西红柿南宁本地有分歧，属于店家习惯，所以做成可选而不是基础料。",
  },
  {
    id: "top.shengcai", name: "生菜", reaRef: "Cabbage", kind: "veg", tier: 1,
    cost: 0.7, price: 2, charm: 9, tags: ["青菜"],
    source: [
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加生菜 —— 5元" },
      { label: "豆果美食《老友粉》食材清单",
        url: "http://mwx.douguo.com/cookbook/1269153.html",
        quote: "生菜 4片" },
    ],
  },
  {
    id: "top.douya", name: "豆芽", reaRef: "Bean Sprouts", kind: "veg", tier: 1,
    cost: 0.3, price: 1, charm: 7, tags: ["青菜"],
    source: [
      { label: "55haitao《打卡潘晓君广西粉友，吃了老友粉》",
        url: "https://post.55haitao.com/show/461744/",
        quote: "素菜有豆芽、酸笋等" },
    ],
  },
  {
    id: "top.scallion", name: "葱花", reaRef: "Chopped Scallion", kind: "veg", tier: 1,
    cost: 0.2, price: 0.5, charm: 5, tags: ["香"],
    source: [
      { label: "微信公众号《这家老友粉是真的正宗》",
        url: "http://mp.weixin.qq.com/s?__biz=MzY5MjI2MzAyNA==&mid=2247483654&idx=1&sn=6a681f073fa4be269f2acef78675e7d2",
        quote: "本人超爱葱花，喜欢让老板先在下面铺好底再浇粉上去" },
      { label: "小食弘毅《广西南宁这家火了10多年的小店》",
        url: "https://www.sohu.com/a/468396413_121110224",
        quote: "出餐台的左边是配料台，有辣椒油、葱花、辣椒酱、陈醋" },
    ],
    note: "葱花在店里是配料台自取，不单收钱，这里的 ¥0.5 只是它占的料钱。",
  },

  // ---- 猪杂线：老友粉的肉以猪杂为主，南宁「三大脆」= 花肠、粉肠、猪肚 ----
  {
    id: "top.offal", name: "猪杂", reaRef: "Stewed Pork", kind: "offal", tier: 3,
    cost: 2.5, price: 5, charm: 22, tags: ["肉", "杂", "鲜"],
    source: [
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加猪杂 —— 6元" },
      { label: "微信公众号《藏在南宁亭洪路的一家老牌宝藏小摊》",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247484967&idx=1&sn=12d5ea94330936b7b7b0f61f30874453",
        quote: "像鲜猪肉粉、牛杂粉、老友粉这些都有" },
    ],
  },
  {
    id: "top.pigchitterling", name: "猪粉肠", reaRef: "Pork Intestine", kind: "offal", tier: 3,
    cost: 2.5, price: 5, charm: 21, tags: ["肉", "杂"],
    source: [
      { label: "今日头条《广西三大名粉之一南宁老友粉》",
        url: "https://www.toutiao.com/article/7493023113438183988/",
        quote: "老友粉的肉类：你可以要猪杂（猪肝、粉肠、瘦肉）或纯瘦肉，或者牛肉" },
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加猪三脆 —— 7元" },
    ],
  },
  {
    id: "top.pigflower", name: "猪花肠", reaRef: "Pork Intestine", kind: "offal", tier: 3,
    cost: 2.5, price: 5, charm: 20, tags: ["肉", "杂"],
    source: [
      { label: "搜狐《广西人爱吃粉》",
        url: "https://m.sohu.com/a/392676707_548960/",
        quote: "腌制好的猪肉、花肠或者猪杂等，大火爆炒之后下入汤底煮开" },
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加猪三脆 —— 7元" },
    ],
    note: "「三大脆」之一，与粉肠、猪肚同列（见 data/flavor.ts 的 three_crisp）。",
  },
  {
    id: "top.pigstomach", name: "猪肚", reaRef: "Pork Intestine", kind: "offal", tier: 3,
    cost: 2.5, price: 5, charm: 19, tags: ["肉", "杂"],
    source: [
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加猪三脆 —— 7元（花肠、粉肠、猪肚）" },
    ],
  },
  {
    id: "top.pigliver", name: "猪肝", reaRef: "Pork Liver", kind: "offal", tier: 2,
    cost: 2.5, price: 5, charm: 17, tags: ["肉", "杂", "鲜"],
    source: [
      { label: "微信公众号《藏在南宁青秀区的这家自选生料老友粉》",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247484658&idx=1&sn=ca9b0b279ebb45108ff9aef1aedb263e",
        quote: "新手的话，推荐瘦肉 + 猪肝 + 粉肠是经典搭配，老熟客都爱这么选" },
    ],
  },

  // ---- 猪肉线：老友粉的肉是「生煮猪肉」 ----
  {
    id: "top.pork", name: "猪肉片", reaRef: "Sliced Pork", kind: "meat", tier: 2,
    cost: 2.5, price: 5, charm: 18, tags: ["肉"],
    source: [
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加猪肉片 —— 7元" },
      { label: "微信公众号《新阳路这碗，一开就是30多年的南宁老味道》（施记老友粉）",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247487940&idx=1&sn=594ef47f1c60f74e46a2eb64c1258a93",
        quote: "加菜的选择也多，牛腩、肉片、猪杂、叉烧，最贵的也才7块钱" },
    ],
  },
  {
    id: "top.lean", name: "瘦肉片", reaRef: "Thin Roast Pork", kind: "meat", tier: 2,
    cost: 2.5, price: 5, charm: 16, tags: ["肉"],
    source: [
      { label: "今日头条《广西三大名粉之一南宁老友粉》",
        url: "https://www.toutiao.com/article/7493023113438183988/",
        quote: "老友粉的肉类：你可以要猪杂（猪肝、粉肠、瘦肉）或纯瘦肉，或者牛肉" },
    ],
  },
  {
    id: "top.mince", name: "碎肉", reaRef: "Ground Pork", kind: "meat", tier: 2,
    cost: 2.4, price: 5, charm: 14, tags: ["肉"],
    source: [
      { label: "小食弘毅《广西南宁这家火了10多年的小店》",
        url: "https://www.sohu.com/a/468396413_121110224",
        quote: "有老友碎肉粉、老友猪杂粉、老友肉片粉、老友肠头粉、老友八珍粉、老友全家福等12个品类" },
    ],
  },

  // ---- 牛线：老友粉里能点的牛肉只有牛肉片；牛腩是加菜，不是本体 ----
  {
    id: "top.beef", name: "牛肉片", reaRef: "Roast Pork", kind: "meat", tier: 3,
    cost: 2.5, price: 5, charm: 24, tags: ["肉"],
    source: [
      { label: "今日头条《广西三大名粉之一南宁老友粉》",
        url: "https://www.toutiao.com/article/7493023113438183988/",
        quote: "你可以要猪杂（猪肝、粉肠、瘦肉）或纯瘦肉，或者牛肉" },
      { label: "南宁美食地图：老友粉柠檬鸭酸嘢与伴手礼全攻略",
        url: "https://www.029558.com/content/detail/19982",
        quote: "不吃内脏可点老友牛肉粉，味道一样正" },
    ],
  },
  {
    id: "top.brisket", name: "牛腩", reaRef: "Beef Brisket", kind: "meat", tier: 3,
    cost: 2.5, price: 5, charm: 25, tags: ["肉", "香"],
    source: [
      { label: "微信公众号《新阳路这碗，一开就是30多年的南宁老味道》（施记老友粉）",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247487940&idx=1&sn=594ef47f1c60f74e46a2eb64c1258a93",
        quote: "加菜的选择也多，牛腩、肉片、猪杂、叉烧，最贵的也才7块钱" },
    ],
    note: "加菜，不是老友粉本体：南宁老友粉的肉以猪杂为主，牛腩粉是玉林那一系的独立品类。这一条只作为「加菜」存在。",
  },

  // ---- 蛋 / 主食：加蛋与油条是老友粉最常见的两样加菜 ----
  {
    id: "top.friedegg", name: "煎蛋", reaRef: "Boiled Eggs", kind: "egg", tier: 1,
    cost: 1, price: 2, charm: 11, tags: ["鲜"],
    source: [
      { label: "小食弘毅《广西南宁这家火了10多年的小店》",
        url: "https://www.sohu.com/a/468396413_121110224",
        quote: "香葱蛋一定要加，真的是很好吃，在煎鸡蛋的时候加入葱花" },
      { label: "微信公众号《藏在南宁亭洪路的一家老牌宝藏小摊》",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247484967&idx=1&sn=12d5ea94330936b7b7b0f61f30874453",
        quote: "还能加肉加蛋，加肉4块钱，加蛋 1.5 块钱" },
    ],
  },
  {
    id: "top.egg", name: "生鸡蛋", reaRef: "Boiled Eggs", kind: "egg", tier: 1,
    cost: 0.9, price: 2, charm: 10, tags: ["鲜"],
    source: [
      { label: "下厨房《老友猪杂伊面》",
        url: "https://mip.xiachufang.com/recipe/104389389/",
        quote: "豆芽熟了就加入伊面煮……加蛋完全是我个人口味啦，打散后搅匀就可以出锅了" },
      { label: "16fan 食客点评《南宁老友粉》",
        url: "http://live.16fan.com/info/482981.html",
        quote: "新鲜的牛肉和猪杂直接生汆，所以会把鲜味溶到汤里，加上鸡蛋的厚度" },
    ],
    note: "打散进锅、汤一滚起花，不是煎的——所以它和「煎蛋」在表里各占一条。",
  },
  {
    id: "top.quail", name: "鹌鹑蛋", reaRef: "Quail Egg", kind: "egg", tier: 1,
    cost: 1.2, price: 3, charm: 10, tags: ["鲜"],
    source: [
      { label: "金鹏南宁老友粉 加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote: "加鹌鹑蛋 —— 3元" },
      { label: "小食弘毅《老友八珍粉 19元》",
        url: "https://www.sohu.com/a/468396413_121110224",
        quote: "里边有鱿鱼、蛤蜊、虾、鸡胗、鹌鹑蛋、金针菇、酸笋、青菜" },
    ],
  },
  {
    id: "top.youtiao", name: "油条", reaRef: "Fried Scallion", kind: "staple", tier: 1,
    cost: 0.8, price: 2, charm: 13, tags: ["香"],
    source: [
      { label: "微信公众号《藏在南宁亭洪路的一家老牌宝藏小摊》",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247484967&idx=1&sn=12d5ea94330936b7b7b0f61f30874453",
        quote: "油条也才2块钱一根，搭配着粉吃，那叫一个满足" },
      { label: "微信公众号《这家老友粉是真的正宗》",
        url: "http://mp.weixin.qq.com/s?__biz=MzY5MjI2MzAyNA==&mid=2247483654&idx=1&sn=6a681f073fa4be269f2acef78675e7d2",
        quote: "怕有些人吃不饱，店家赠送油条随便吃" },
    ],
  },
];

export const TOPPING_BY_ID: ReadonlyMap<string, Ingredient> = new Map(TOPPINGS.map((t) => [t.id, t]));

/**
 * 汤底 + 粉的基础成本（元/碗）。
 *
 * 旧实现把「全部汤料 + 全部粉料的单价加总」当一碗的成本（≈¥6.3），
 * 等于每碗都放了所有料 —— 这不是成本，这是清仓。
 * 按南宁现实一碗老友粉的料钱取 `GUANGXI.bowlCostYuan`（¥4.2），
 * 加料另计（`bowlCost()` 里逐项累加）。
 * 依据：docs/数值来源与换算-2026-11-12.md、docs/开罗设计哲学-扩张是否必需-2026-11-14.md
 */
export const BASE_COST = GUANGXI.bowlCostYuan;

/** 按 id 取配料；未知 id 返回 undefined，由调用方决定是否报错（存档可能带旧 id） */
export function findTopping(id: string): Ingredient | undefined {
  return TOPPING_BY_ID.get(id);
}

export function toppingsOfKind(kind: IngredientKind): readonly Ingredient[] {
  return TOPPINGS.filter((t) => t.kind === kind);
}
