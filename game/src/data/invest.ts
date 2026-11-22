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

export type InvestId = "supplier" | "master" | "press";

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
