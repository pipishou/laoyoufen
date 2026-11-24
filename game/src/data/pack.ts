/**
 * 袋装老友粉（A7）——本作的第二条收入线。
 *
 * 开罗有两条速食线（`instant_noodles` 20 / `instant_soup` 22）：袋装拉面与速食汤，
 * 不占餐位、跟口碑走，是「店里的手艺变成货」的那一步。
 *
 * 南宁这边这件事是真做成的（不是编的）：
 *  - 南宁日报《一碗老友粉 嗍出「创新味」》：复记 2020 年开始投预包装，
 *    「打开酱料包，倒入锅中简单加热出味，然后加入清水以及包装内备好的酸笋、米粉，
 *    约 2 分钟后，一碗酸辣可口的老友粉便做好了」，当时日产能 6 万包；
 *  - 同一篇写清了两大难点：**风味还原、米粉口感保持**；
 *  - 复记词条：2024 年新线日产 20 万包、自动化率 90% 以上；
 *  - 淘宝/1688 零售价：复记 4 袋 ¥39.9（≈¥10/袋）、邕州老街 252g×10 袋 ¥25.64（≈¥2.6/袋）。
 *
 * 所以本作不是「无限扩建的工厂」，是**一个铺子能做的那点量**：
 * 一次买断封口机与首批包装，每天按口碑与手艺出几十袋，卖到外地去。
 */

export interface PackSource {
  label: string;
  url: string;
  quote: string;
}

export const PACK_SETUP = {
  /** 封口机 + 首批包装（袋子、酱料包、干粉） */
  costYuan: 3_800,
  /** 第一天的底量（口碑 0、段位 0 时也能卖出去几袋） */
  basePacks: 6,
  /** 口碑每一点多几袋 */
  perRep: 4,
  /** 每段位多几袋 */
  perGrade: 2,
  /** 小铺子的天花板 —— 现实里工厂日产六万，但那是工厂 */
  capPacks: 40,
  /** 每袋卖多少（复记 4 袋 ¥39.9，折 ¥10） */
  priceYuan: 10,
  /** 每袋料钱（酱料包 + 酸笋 + 干粉 + 袋子） */
  costPerPack: 5,
  /** 风味还原度最低能给到几成（太差就没人回购） */
  floorRate: 0.6,
} as const;

/**
 * 三档货（批 W′）。
 *
 * 开罗有两条速食线（`instant_noodles` 20 / `instant_soup` 22），我们原来只有
 * 「袋装老友粉」一条。南宁这边现实里卖的也不止一种：整袋粉、单卖汤底、
 * 单卖酸笋（复记的预包装里酱料包与酸笋就是分开装的），再加上走亲戚的礼盒。
 *
 * 三条纪律：
 *  1. **不加新产能**：三档都从 `packDailyOf` 那点量里分，share 加起来不到四成；
 *  2. 礼盒要段位（走亲戚的东西，得先有点名气）；
 *  3. 每档都写清「这一袋是什么」，不写成「更贵的粉」。
 */
export interface PackSku {
  id: "soup" | "sour" | "gift";
  name: string;
  /** 占基础袋数的比例（三档加起来 < 0.4） */
  share: number;
  priceYuan: number;
  costPerPack: number;
  minGrade: number;
  line: string;
  why: string;
  source: readonly PackSource[];
}

export const PACK_SKUS: readonly PackSku[] = [
  {
    id: "soup",
    name: "汤底包",
    share: 0.18,
    priceYuan: 18,
    costPerPack: 8,
    minGrade: 0,
    line: "一包老友汤底，回家下粉下菜都行。",
    why: "预包装最难的是风味还原 —— 汤底单独装，是把最难那一段先卖给会煮的人。",
    source: [
      {
        label: "南宁日报《一碗老友粉 嗍出「创新味」》",
        url: "http://www.nnrb.com.cn/nnrb/20240515/html/index_content_001.htm",
        quote: "打开酱料包，倒入锅中简单加热出味，然后加入清水以及包装内备好的酸笋、米粉",
      },
    ],
  },
  {
    id: "sour",
    name: "酸笋包",
    share: 0.12,
    priceYuan: 6,
    costPerPack: 2.4,
    minGrade: 0,
    line: "酸笋单卖，拿回去配什么都行。",
    why: "酸笋是这碗粉的骨气，也是最好单独装的一件 —— 它不怕压、不怕放。",
    source: [
      {
        label: "广西新闻网《老友酱有了统一标准》",
        url: "https://www.ngzb.com.cn/news/2024/12/03/laoyou-youliao-tongyibiaozhun-fenhui-tongyige-weima.html",
        quote: "老友酱的四大用料——酸笋、大蒜、辣椒（或泡椒）、豆豉",
      },
    ],
  },
  {
    id: "gift",
    name: "礼盒",
    share: 0.06,
    priceYuan: 68,
    costPerPack: 30,
    minGrade: 3,
    line: "两袋粉、一包汤底、一包酸笋，扎成一盒送人。",
    why: "走亲戚要拿得出手的东西，所以得先有点名气 —— 摆摊仔的盒子没人接。",
    source: [
      {
        label: "南宁日报《一碗老友粉 嗍出「创新味」》",
        url: "http://www.nnrb.com.cn/nnrb/20240515/html/index_content_001.htm",
        quote: "预包装老友粉的生产存在两大难点：风味还原、米粉口感保持",
      },
    ],
  },
];

export const PACK_SKU_TOTAL = PACK_SKUS.length;

export function packSkuById(id: string): PackSku | null {
  return PACK_SKUS.find((k) => k.id === id) ?? null;
}

export const PACK_SOURCES: readonly PackSource[] = [
  {
    label: "南宁日报《一碗老友粉 嗍出「创新味」》",
    url: "http://www.nnrb.com.cn/nnrb/20240515/html/index_content_001.htm",
    quote: "打开酱料包，倒入锅中简单加热出味，然后加入清水以及包装内备好的酸笋、米粉，约 2 分钟后，一碗酸辣可口的老友粉便做好了",
  },
  {
    label: "同上（难点）",
    url: "http://www.nnrb.com.cn/nnrb/20240515/html/index_content_001.htm",
    quote: "预包装老友粉的生产存在两大难点：风味还原、米粉口感保持",
  },
  {
    label: "复记老友词条（产能与自动化率）",
    url: "https://baike.baidu.com/item/%E5%A4%8D%E8%AE%B0%E8%80%81%E5%8F%8B/5778014",
    quote: "2024 年，在南宁老友粉产业园新建面积近 1 万平方米的现代化生产线，日产能提升至 20 万包，自动化率超 90%",
  },
];
