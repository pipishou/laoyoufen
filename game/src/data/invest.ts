/**
 * 街上的门路（批 B′）：花一次钱，买一天（或三天）的「量」。
 *
 * 三条纪律（与浇头出处审计同一条）：
 *
 * 1. **只买量，不买乘数**。开罗 `investment` 111 条是限时 buff，本作若照抄成乘数，
 *    料钱会叠到第五层（品质档 ×1.0/1.8/2.6 × 行情 ±14% × 物产 −2% × 技法 −6~12%），
 *    上限从没验过（P154）。所以这三条只动**碗数、分钟数、进店率**，一个乘法都不加。
 * 2. **同类同时只能有一条**。`cls: "make"`（多做出几碗）与 `cls: "voice"`（多进来几个人）
 *    各自只能挂一条，避免「花钱堆到底」变成无脑最优解。
 * 3. **每条都要有南宁的出处**。查不到出处的不进这张表 —— 出处写在 `source`，
 *    `why` 是给玩家看的人话，`quote` 是原文摘句（面板 title 里会露出来）。
 *
 * 开罗对照：`investment` 111 行（单笔 5,760–20,250 KCU，约 5–20 碗价），
 * 本作按「一碗 ¥10」折算成 ¥50/¥120/¥400 三档。
 */

export type InvestId =
  | "supplier"
  | "master"
  | "press"
  | "night_market"
  | "central_kitchen"
  | "tourism"
  | "expo"
  | "livestream";

/** 门路的类别：make = 今天能多做出几碗；voice = 今天街上多几个人知道你 */
export type InvestClass = "make" | "voice";

export interface InvestSource {
  label: string;
  url: string;
  quote: string;
}

export interface InvestDef {
  id: InvestId;
  name: string;
  cls: InvestClass;
  /** 面板上的一行说明 */
  what: string;
  costYuan: number;
  /** 买一次管几天（当天算第一天） */
  days: number;
  /** 当天产能 +N 碗 */
  capacity?: number;
  /** 最慢那一段减去 N 分钟（只治瓶颈，见 P242） */
  slowestMinutes?: number;
  /** 这几天进店率 +N% */
  attractPct?: number;
  line: string;
  why: string;
  kairo: string;
  source: readonly InvestSource[];
}

export const INVESTS: readonly InvestDef[] = [
  {
    id: "supplier",
    name: "跟料商多留一筐",
    cls: "make",
    what: "今天多备一筐切粉，卖到收摊都不缺",
    costYuan: 50,
    days: 1,
    capacity: 20,
    line: "料商答应多留一筐，今天的粉管够。",
    why: "南宁试销糙米米粉那天，10 家农贸市场半小时就卖完 —— 缺货不是卖不动，是没货卖。",
    kairo: "investment：材料/进货一类（限时买货）",
    source: [
      {
        label: "广西新闻网《南宁试销糙米米粉 半小时卖完实现屌丝逆袭》",
        url: "https://v.gxnews.com.cn/a/10125167",
        quote:
          "南宁10家农贸市场昨起试销糙米米粉……半小时卖完！糙米米粉实现屌丝逆袭",
      },
      {
        label: "八方资源网《南宁经典桂林米粉卤水、螺蛳粉汤料批发零售》",
        url: "https://info.b2b168.com/s168-73807540.html",
        quote: "南宁经典桂林米粉卤水、螺蛳粉汤料批发零售，送货上门，欢迎订购！",
      },
    ],
  },
  {
    id: "master",
    name: "请老师傅来看一天",
    cls: "make",
    what: "老师傅站在灶边，最慢那一段的手脚会快一些",
    costYuan: 120,
    days: 1,
    slowestMinutes: 0.5,
    line: "老师傅在灶边站了一天，最慢那一段的手脚快了半个钟点（0.5 分）。",
    why: "「培训一个煮粉师傅，至少要一两个月才能出师」—— 手是花钱也买不来的，但可以请人来借一天。",
    kairo: "investment：人手/技术一类（开罗 clerk 与 clerk_skill 的短租）",
    source: [
      {
        label: "广西新闻网《保住正宗「老友」 南宁老友粉传承基地正式挂牌成立》",
        url: "http://sub.gxnews.com.cn/staticpages/20200325/newgx5e7ac2ff-19389663.shtml",
        quote:
          "该基地将“传帮带”一批技术过硬的煮粉师傅，解决老友粉的传承问题。",
      },
      {
        label: "同上（陈大培谈出师）",
        url: "http://sub.gxnews.com.cn/staticpages/20200325/newgx5e7ac2ff-19389663.shtml",
        quote:
          "“培训一个煮粉师傅，至少要一两个月才能出师，还要看个人天分和掌握程度。”……整个煮粉过程要大火候、快手脚，一气呵成。",
      },
    ],
  },
  {
    id: "press",
    name: "请美食号写一篇",
    cls: "voice",
    what: "三天里街上会多些生面孔，第四天回到原样",
    costYuan: 400,
    days: 3,
    attractPct: 0.3,
    line: "美食号那篇发出去了，接下来三天来的人会杂一些。",
    why: "一篇探店能带来外地客与尝鲜客，但热乎劲只有几天 —— 老友粉的直播系列也是这么一阵一阵的。",
    kairo: "investment：宣传/媒体一类（限时引流）",
    source: [
      {
        label: "老友网（南宁网络广播电视台）《「寻味南宁·老友粉」系列新媒体直播》",
        url: "http://www.nntv.cn/news/m/2024-7-25/1721872548263.shtml",
        quote: "直播回放：“寻味南宁·老友粉”系列新媒体直播",
      },
      {
        label: "网易号《南宁好吃的老友粉，都在西乡塘？》（来源：吃遍南宁）",
        url: "https://www.163.com/dy/article/IRVOIGLI0522BBNM.html",
        quote: "来源: 吃遍南宁……南宁好吃的老友粉，都在西乡塘？",
      },
    ],
  },
  {
    id: "night_market",
    name: "夜市摆到十点",
    cls: "voice",
    what: "灯亮着、锅开着，夜里路过的人也接得住",
    costYuan: 300,
    days: 2,
    attractPct: 0.18,
    line: "灯亮到十点，夜里回家的人也有得吃。",
    why: "中山路、埌西、农院路三个夜市里，老友粉是从清晨忙到深夜的那一口；有的粉店干脆二十四小时开着。",
    kairo: "investment：营业时间一类（限时延时）",
    source: [
      {
        label: "解放日报《“老友”情牵话南宁》",
        url: "https://www.jfdaily.com/wx/detail.do?id=880997",
        quote:
          "老友粉成为中山路夜市、埌西夜市、农院路夜市的美味担当。从清晨一直延续到深夜",
      },
      {
        label: "人民日报《一碗老友粉（多味斋）》",
        url: "https://paper.people.com.cn/rmrb/pc/content/202510/11/content_30108793.html",
        quote:
          "以我的小区为原点放射出去，每个方向都能找到好几家粉店，甚至，有的粉店还是24小时营业。",
      },
    ],
  },
  {
    id: "central_kitchen",
    name: "跟中央厨房订一批",
    cls: "make",
    what: "清早送到门口的半成品，今天能多做出几十碗",
    costYuan: 260,
    days: 1,
    capacity: 45,
    line: "中央厨房的车清早停在门口，一筐一筐往下卸。",
    why: "南宁的连锁粉店靠中央厨房配送：一家企业的生产车间，每天有十余吨原料送到全市各店。",
    kairo: "investment：材料/供应链一类（开罗是买库存，本作买当天产能）",
    source: [
      {
        label: "解放日报《“老友”情牵话南宁》",
        url: "https://www.jfdaily.com/wx/detail.do?id=880997",
        quote:
          "广西复记食品科技有限公司生产车间，每天有10余吨原料从中央厨房配送到全市各老友粉店",
      },
      {
        label: "同上（全市产业规模）",
        url: "https://www.jfdaily.com/wx/detail.do?id=880997",
        quote: "全国共有1500多家“老友味”的米粉店……南宁市有老友粉生产企业110家",
      },
    ],
  },
  {
    id: "tourism",
    name: "上文旅线路",
    cls: "voice",
    what: "线路单上印了你的店名，五天里来的多是外地客",
    costYuan: 800,
    days: 5,
    attractPct: 0.35,
    line: "名字印进线路单，往后几天来的多是拎着行李的客人。",
    why: "南宁把老友粉的故事搬上话剧舞台，还串出「老友游南宁」「老友味道」几条文旅线路 —— 一碗粉能被当成一站。",
    kairo: "investment：宣传一类（长期一点的引流，开罗最长 10 天）",
    source: [
      {
        label: "新华网转广西日报《南宁老友粉：人因此味“粉”邕州》",
        url: "http://gx.xinhuanet.com/20260423/e911110a855f4dc9ba14f29617d490ca/c.html",
        quote:
          "南宁将这碗粉的故事搬上话剧舞台，推出“老友游南宁”“老友味道”等精品文旅线路，推动“演唱会+文旅体商”深度融合发展",
      },
    ],
  },
  {
    id: "expo",
    name: "去展销会摆个摊",
    cls: "voice",
    what: "三天里会有外面的人拿着照片找过来",
    costYuan: 500,
    days: 3,
    attractPct: 0.25,
    line: "展销会上支了个小摊，回来时手机上多了十几个好友。",
    why: "南宁老友粉产业学院开的课里就有包装设计、周边产品与国内外营销推广 —— 这门生意早就开始往外走了。",
    kairo: "investment：宣传一类（开罗的「产地直送」「名店认证」那一路）",
    source: [
      {
        label: "解放日报《“老友”情牵话南宁》",
        url: "https://www.jfdaily.com/wx/detail.do?id=880997",
        quote:
          "南宁老友粉产业学院，通过老友粉包装设计、周边产品设计、国内外营销推广等课程来完善老友粉上下游产业链",
      },
      {
        label: "同上（走出去）",
        url: "https://www.jfdaily.com/wx/detail.do?id=880997",
        quote: "2025年，本土品牌“复记老友”走出国门，落户柬埔寨金边",
      },
    ],
  },
  {
    id: "livestream",
    name: "开一场直播",
    cls: "voice",
    what: "今晚播一场，明天人会多一阵，后天就散了",
    costYuan: 180,
    days: 1,
    attractPct: 0.45,
    line: "手机架在锅边播了一场，弹幕里全是问地址的。",
    why: "「寻味南宁·老友粉」这种新媒体直播，来的是一阵阵的尝鲜客：当天最热，隔天就冷。",
    kairo: "investment：宣传一类（最短的一档脉冲）",
    source: [
      {
        label: "老友网（南宁网络广播电视台）《「寻味南宁·老友粉」系列新媒体直播》",
        url: "http://www.nntv.cn/news/m/2024-7-25/1721872548263.shtml",
        quote: "直播回放：“寻味南宁·老友粉”系列新媒体直播",
      },
    ],
  },
];

export const INVEST_TOTAL = INVESTS.length;

export const INVEST_BY_ID: ReadonlyMap<string, InvestDef> = new Map(
  INVESTS.map((d) => [d.id, d]),
);

export function investById(id: string): InvestDef | undefined {
  return INVEST_BY_ID.get(id);
}

export function investsOfClass(cls: InvestClass): readonly InvestDef[] {
  return INVESTS.filter((d) => d.cls === cls);
}
