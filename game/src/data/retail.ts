/**
 * 零售线（批次七）：把店里的手艺做成「货」。
 *
 * 开罗 `instant_noodles` 20 行 + `instant_soup` 22 行是**商品表**，不是机器参数：
 * 价格跨 24 倍与 58 倍，同一张表既喂店内也喂外销。我们不做 42 个没有来历的名字，
 * 借它的**形状**：价格分层 × 渠道分层 × 品质三档，货色收到八款。
 *
 * 三条纪律：
 *  1. **每一款都要有出处**（南宁真实在卖的东西）。补不到出处的款就砍掉，不编。
 *  2. 货与碗**抢同一份产能**：做货就少卖碗 —— 这是这条线唯一的取舍，不能免费。
 *  3. 出厂价与建议零售价取「现实里能查到的量级」；具体数可以微调，形态不能编。
 */

export type RetailId =
  | "dry_noodle"
  | "dry_round"
  | "sour_pack"
  | "douchi_jar"
  | "soup_base"
  | "ready_bowl"
  | "gift_box"
  | "shop_batch";

export interface RetailSource {
  label: string;
  url: string;
  quote: string;
}

export interface RetailDef {
  id: RetailId;
  name: string;
  /** 形态：干粉条 / 腌菜小包 / 调味酱 / 浓缩汤料 / 成品 / 组合 / 渠道货 */
  form: string;
  /** 出厂价（我们这边的成本） */
  costYuan: number;
  /** 建议零售价（定价滑条的起点） */
  suggestYuan: number;
  /** 一件货顶几碗的产能 —— 越大的货越费事 */
  load: number;
  /** 为什么是这个价、为什么卖得出去 */
  why: string;
  source: RetailSource[];
}

/** 每件货的产能占用换算成一碗：粉斤摊称一斤粉，约等于少煮三分之一碗。 */
export const RETAIL_LOAD_BOWL = 0.35;

export const RETAILS: readonly RetailDef[] = [
  {
    id: "dry_noodle",
    name: "干切粉（一斤装）",
    form: "干粉条",
    costYuan: 6,
    suggestYuan: 9,
    load: 1,
    why: "南宁菜市里本来就有一行「切粉行」，按斤称着卖；店里现煮的粉晾干打成一斤装，是最不用解释的一款货。",
    source: [
      {
        label: "天眼查 · 南宁市苏金娟粉斤摊",
        url: "https://www.tianyancha.com/company/3317778433",
        quote: "注册地址：南宁市青秀区仙葫盘古路4号仙葫农贸市场切粉行第264号摊位……食品零售。",
      },
      {
        label: "淘宝 · 邕州老街南宁老友粉（干切粉宽扁粉）",
        url: "https://www.taobao.com/list/product/%E5%8D%97%E5%AE%81%E7%89%B9%E4%BA%A7.htm",
        quote: "邕州老街南宁老友粉广西特产酸笋米线米粉干切粉宽扁粉……￥16.8。",
      },
    ],
  },
  {
    id: "dry_round",
    name: "干圆粉（一斤装）",
    form: "干粉条",
    costYuan: 6.5,
    suggestYuan: 10,
    load: 1,
    why: "同一个粉斤摊也卖圆粉；圆粉更耐煮，寄得远，是外地客人最常问的那一种。",
    source: [
      {
        label: "天眼查 · 南宁市苏金娟粉斤摊",
        url: "https://www.tianyancha.com/company/3317778433",
        quote: "仙葫农贸市场切粉行第264号摊位……食品零售（干粉按斤称）。",
      },
      {
        label: "淘宝 · 邕州老街 252g×10 袋",
        url: "https://www.taobao.com/list/product/%E5%8D%97%E5%AE%81%E7%89%B9%E4%BA%A7.htm",
        quote: "邕州老街南宁老友粉252g*10袋 正宗广西特产速食食品河粉扁粉切粉 …… ￥25.64。",
      },
    ],
  },
  {
    id: "sour_pack",
    name: "酸笋包",
    form: "腌菜小包",
    costYuan: 2.4,
    suggestYuan: 4,
    load: 0.6,
    why: "酸笋是老友粉的魂，单卖一包最便宜也最容易被顺手带走；A7 的袋装线已经证明了这条路。",
    source: [
      {
        label: "南宁日报 · 一碗老友粉 嗍出「创新味」",
        url: "http://nnrb.nnnews.net:8080/nnrb/20260414/html/e4da3b7fbbce2345d7772b0674a318d5.pdf",
        quote: "打开酱料包……约 2 分钟后一碗就好（袋装配料已成体系）。",
      },
      {
        label: "淘宝 · 老友粉袋装配料（含酸笋）",
        url: "https://world.taobao.com/item/640647680755.htm",
        quote: "廣西復記老友粉即食米粉手工風味袋裝速食 ¥16.80（255g×5 袋+送 2 袋）。",
      },
    ],
  },
  {
    id: "douchi_jar",
    name: "豆豉辣椒酱（瓶）",
    form: "调味酱",
    costYuan: 7,
    suggestYuan: 12,
    load: 1.2,
    why: "离了南宁的人靠一瓶酱「煮出七八成老友粉的感觉」，这是老友酱在电商上真实存在的理由。",
    source: [
      {
        label: "淘宝 · 正厨商用老友粉酱（酸笋豆豉辣椒）",
        url: "https://vn.world.taobao.com/product/%E9%9D%92%E8%89%B2%E8%BE%A3%E6%A4%92.htm",
        quote: "正厨商用老友粉酱南宁老友酱酸笋汤粉调料酸笋豆豉辣椒……￥32。",
      },
      {
        label: "双合食品 · 老友酱（瓶装）",
        url: "https://www.sanwenwang.com/ba/oizzvfqf.html",
        quote: "在外省很难以下咽到老友粉，贪吃的朋友们只能依靠这老友酱过瘾了……能煮出七八成老友粉的感觉。",
      },
    ],
  },
  {
    id: "soup_base",
    name: "老友汤底包",
    form: "浓缩汤料",
    costYuan: 5,
    suggestYuan: 10,
    load: 1.5,
    why: "「冲泡即成」是这门生意真正的技术难点（风味还原 + 米粉口感保持），也正因为难，才值这个价。",
    source: [
      {
        label: "南宁日报 · 从街头烟火到全国爆款 一碗粉激活大产业",
        url: "http://nnrb.nnnews.net:8080/nnrb/20260414/html/e4da3b7fbbce2345d7772b0674a318d5.pdf",
        quote: "广西大饭桌还推出「冲泡即成」的预包装老友粉，开水冲泡 4 分钟，就能还原一碗地道「老友味」。",
      },
    ],
  },
  {
    id: "ready_bowl",
    name: "自热老友粉",
    form: "成品",
    costYuan: 11,
    suggestYuan: 18,
    load: 2,
    why: "连粉带汤一盒寄走，最贵也最像「外面的人想吃的那个东西」；退货运费高，所以退货率要算进去。",
    source: [
      {
        label: "南宁日报 · 从街头烟火到全国爆款",
        url: "http://nnrb.nnnews.net:8080/nnrb/20260414/html/e4da3b7fbbce2345d7772b0674a318d5.pdf",
        quote: "「大饭桌老友」品牌预包装产品已覆盖广西各地及广东、湖南、河南部分地市。",
      },
      {
        label: "淘宝 · 万国酒家老友粉 205g×4 袋",
        url: "https://www.taobao.com/list/product/%E5%8D%97%E5%AE%81%E7%89%B9%E4%BA%A7.htm",
        quote: "广西特产南宁万国酒家老友粉205g*4袋方便速食干米粉水煮非螺蛳粉 ￥39.9。",
      },
    ],
  },
  {
    id: "gift_box",
    name: "老友礼盒（四包装）",
    form: "组合",
    costYuan: 28,
    suggestYuan: 45,
    load: 2.4,
    why: "四袋装礼盒是年货档口最常见的样子，出厂价与零售价都能在货架上对得到。",
    source: [
      {
        label: "淘宝 · 万国酒家老友粉四袋装",
        url: "https://www.taobao.com/list/product/%E5%8D%97%E5%AE%81%E7%89%B9%E4%BA%A7.htm",
        quote: "广西特产南宁万国酒家老友粉205g*4袋……广西特产老友粉四袋装速食 ￥39.9。",
      },
    ],
  },
  {
    id: "shop_batch",
    name: "整箱批发（24 包）",
    form: "渠道货",
    costYuan: 120,
    suggestYuan: 168,
    load: 4,
    why: "整箱走的是渠道不是客人：一箱二十四包，只有便利店与电商吃得下，门口摆不出这个量。",
    source: [
      {
        label: "淘宝 · 邕州老街 252g×10 袋",
        url: "https://www.taobao.com/list/product/%E5%8D%97%E5%AE%81%E7%89%B9%E4%BA%A7.htm",
        quote: "邕州老街南宁老友粉252g*10袋……￥25.64（成箱走量是这门生意的常态）。",
      },
    ],
  },
];

export const RETAIL_BY_ID = new Map<string, RetailDef>(RETAILS.map((r) => [r.id, r]));
export const RETAIL_TOTAL = RETAILS.length;
export function retailById(id: string): RetailDef | undefined {
  return RETAIL_BY_ID.get(id);
}

/** 渠道三层：单价与量反向（开罗同形）。 */
export type ChannelId = "door" | "shop" | "online";

export interface ChannelDef {
  id: ChannelId;
  name: string;
  /** 抽成 */
  cut: number;
  /** 退货率 */
  returnRate: number;
  /** 需要的段位 */
  gradeGate: number;
  /** 走量倍数 */
  volume: number;
  note: string;
}

export const CHANNELS: readonly ChannelDef[] = [
  {
    id: "door",
    name: "自己门口",
    cut: 0,
    returnRate: 0,
    gradeGate: 0,
    volume: 1,
    note: "摆在柜台上卖给熟客，量小、价实，不用分给别人",
  },
  {
    id: "shop",
    name: "便利店代销",
    cut: 0.25,
    returnRate: 0.02,
    gradeGate: 4,
    volume: 2.2,
    note: "进别人的货架，抽两成半；卖得动，但要给人留利",
  },
  {
    id: "online",
    name: "电商",
    cut: 0.18,
    returnRate: 0.06,
    gradeGate: 7,
    volume: 4,
    note: "寄到外省去，量大抽成少，退货与运费自己扛",
  },
];

export const CHANNEL_BY_ID = new Map<string, ChannelDef>(CHANNELS.map((c) => [c.id, c]));
export const CHANNEL_TOTAL = CHANNELS.length;

/** 定价滑条的范围：建议零售价的 70%–130%。 */
export const PRICE_FLOOR = 0.7;
export const PRICE_CEIL = 1.3;
