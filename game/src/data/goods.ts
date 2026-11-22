/**
 * 杂货铺（批 B′）：花人情，买一天的方便。
 *
 * 与「街上的门路」分开的理由：门路花**钱**，杂货花**人情**。
 * 人情是本作已有的第二种货币（`game/src/data/favor.ts`），攒得慢、用处少；
 * 这里给它添三个「身边就能办到」的出口：多备一筐粉、借几台电扇、现炸一筐油条。
 *
 * 纪律同前：只买一天的量与概率，不改任何乘数；每条都要有南宁出处，
 * 查不到的不进表（`source` 里是原文摘句，面板 title 会露出来）。
 *
 * 与开罗对照：开罗「道具店 / 食材店」卖的是库存与消耗品；
 * 本作没有库存（P205），所以杂货买的是**当天的状态**，第二天自动失效。
 */

export type GoodId = "noodle_pile" | "fan" | "dough";

export interface GoodSource {
  label: string;
  url: string;
  quote: string;
}

export interface GoodDef {
  id: GoodId;
  name: string;
  /** 面板上一行说明 */
  what: string;
  favorCost: number;
  /** 当天产能 +N 碗 */
  capacity?: number;
  /** 当天耐心 ×(1 + N) */
  patiencePct?: number;
  /** 当天加购概率 ×N */
  sideMult?: number;
  line: string;
  why: string;
  kairo: string;
  source: readonly GoodSource[];
}

export const GOODS: readonly GoodDef[] = [
  {
    id: "noodle_pile",
    name: "多备一筐粉",
    what: "让切粉行多送一筐过来，今天卖到收摊都不缺",
    favorCost: 6,
    capacity: 15,
    line: "切粉行答应多送一筐，今天就别再省着卖了。",
    why: "农贸市场里有专门按斤卖切粉的摊子；南宁试销糙米米粉那天，半小时就卖空了 —— 缺的是货，不是人。",
    kairo: "itemdata / 食材店：当天多一份库存",
    source: [
      {
        label: "天眼查《南宁市苏金娟粉斤摊》",
        url: "https://www.tianyancha.com/company/3317778433",
        quote:
          "南宁市苏金娟粉斤摊……仙葫农贸市场切粉行第264号摊位，按斤零售",
      },
      {
        label: "广西新闻网《南宁试销糙米米粉 半小时卖完》",
        url: "https://v.gxnews.com.cn/a/10125167",
        quote: "南宁10家农贸市场昨起试销糙米米粉……半小时卖完！",
      },
    ],
  },
  {
    id: "fan",
    name: "借三台电扇过来",
    what: "灶边和门口各摆一台，等的人不急着走",
    favorCost: 8,
    patiencePct: 0.2,
    line: "三台电扇搬来了，门口等位的人不再扇扇子骂天。",
    why: "南宁的夏天，炉灶边上五十度往上；报道里那家老店的煮粉工说「要是没有风扇根本受不了」。",
    kairo: "storeparts / 内装：买风扇那类，但按天借",
    source: [
      {
        label: "广西新闻网《持续高温不减食客热情，老友粉店里寻找南宁味道》",
        url: "http://food.gxnews.com.cn/staticpages/20120803/newgx501b3042-5789448.shtml",
        quote:
          "3台电扇朝着煮粉工不停地吹风……靠近炉灶的温度却超过记者所带温度计的最大值50℃。正在作业的煮粉工说：“手在炉灶上烤得都发烫，要是没有风扇根本受不了。”",
      },
      {
        label: "同上（客人照旧来）",
        url: "http://food.gxnews.com.cn/staticpages/20120803/newgx501b3042-5789448.shtml",
        quote:
          "虽然店里没有空调，在那么炎热的天气吃老友煮粉还会全身冒汗，但是依然抵挡不住美味的诱惑。",
      },
    ],
  },
  {
    id: "dough",
    name: "现炸一筐油条",
    what: "门口支个油锅，配粉的人顺手就加一根",
    favorCost: 12,
    sideMult: 1.5,
    line: "门口支起油锅，油条一炸，配粉的人就多点了。",
    why: "南宁的老友粉店门口常炸油条，有的店干脆赠送；「油条 2 元一根」是价目表上的常见一行。",
    kairo: "topping / itemdata：加购品",
    source: [
      {
        label: "微信《这家老友粉是真的正宗》",
        url: "http://mp.weixin.qq.com/s?__biz=MzY5MjI2MzAyNA==&mid=2247483654&idx=1&sn=6a681f073fa4be269f2acef78675e7d2",
        quote: "这家老友粉是真的正宗……“没有番茄的”“赠送油条”“超爱葱花”（本地食客的评论）",
      },
      {
        label: "微信《藏在南宁亭洪路…芳姐粉店》",
        url: "http://mp.weixin.qq.com/s?__biz=Mzk1NzY0OTkyMg==&mid=2247484967&idx=1&sn=12d5ea94330936b7b7b0f61f30874453",
        quote: "加肉 4 元，加蛋 1.5 元，油条 2 元一根",
      },
    ],
  },
];

export const GOOD_TOTAL = GOODS.length;

export const GOOD_BY_ID: ReadonlyMap<string, GoodDef> = new Map(
  GOODS.map((d) => [d.id, d]),
);

export function goodById(id: string): GoodDef | undefined {
  return GOOD_BY_ID.get(id);
}
