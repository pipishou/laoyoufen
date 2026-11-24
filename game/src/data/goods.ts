/**
 * 杂货铺（批 B′，批 J′ 扩到九件）：花人情，买一天的方便。
 *
 * 与「街上的门路」分开的理由：门路花**钱**，杂货花**人情**。
 * 人情是本作已有的第二种货币（`game/src/data/favor.ts`），攒得慢、用处少；
 * 这里给它添九个「身边就能办到」的出口。
 *
 * 纪律同前：只买一天的量与概率，不改任何乘数；每条都要有南宁出处，
 * 查不到的不进表（`source` 里是原文摘句，面板 title 会露出来）。
 *
 * 批 J′ 的取舍：计划里的「打包饭盒 / 电蚊香 / 遮雨棚」三件，取证阶段
 * 找不到能引原文的南宁出处，**没有进表**（见 `docs/三维度改造方案-2026-11-24.md`
 * 第八节的判据与账本行 112 的记录）。宁少三件，不凑数。
 *
 * 与开罗对照：开罗「道具店 / 食材店」卖的是库存与消耗品；
 * 本作没有库存（P205），所以杂货买的是**当天的状态**，第二天自动失效。
 */

export type GoodId =
  | "noodle_pile"
  | "fan"
  | "dough"
  | "soymilk"
  | "mung_bean"
  | "lamp"
  | "stool_row"
  | "chalkboard"
  | "helper";

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
  /** 当天进店率 +N（门口多亮一盏灯那种） */
  attractPct?: number;
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
  {
    id: "soymilk",
    name: "冰一箱豆奶",
    what: "柜子里塞满冰豆奶，吃着辣的人顺手来一支",
    favorCost: 7,
    sideMult: 1.3,
    line: "冰豆奶搬进柜子，吃辣的人一口粉一口奶。",
    why: "老南宁吃老友粉的标准搭子是油条配豆奶 —— 本地食客的原话：「配上油条和豆奶就更完美了」。",
    kairo: "topping / itemdata：饮料类加购",
    source: [
      {
        label: "Tripadvisor《复记老友粉（中山路店）》食客点评",
        url: "https://cn.tripadvisor.com/Restaurant_Review-g317092-d4677122-Reviews-Fuji_Laoyoufen_Zhongshan_Road-Nanning_Guangxi.html",
        quote:
          "复记中山路店虽然简陋，却是南宁人心中的老友味道。味道比七星路的舒记要重些，经常去吃的。配上油条和豆奶就更完美了！！！",
      },
    ],
  },
  {
    id: "mung_bean",
    name: "熬一锅绿豆沙",
    what: "门口摆个冰桶，吃完粉的人来一碗甜的",
    favorCost: 9,
    sideMult: 1.25,
    line: "绿豆沙镇在冰水里，吃完辣的人总要来一碗。",
    why: "南宁的糖水铺就开在粉店旁边：绿豆沙、马蹄爽，是嗦完粉之后的第二口。",
    kairo: "itemdata：甜品类加购（开罗没有对应表，本作按本地糖水补）",
    source: [
      {
        label: "知乎《南宁美食，不仅仅只是嗦粉》",
        url: "https://zhuanlan.zhihu.com/p/554668325",
        quote:
          "南宁除了老友粉，还有极富特色的生榨粉……绿豆沙、马蹄爽……多张几张嘴才吃得过来。",
      },
    ],
  },
  {
    id: "lamp",
    name: "门口多亮一盏灯",
    what: "天擦黑就把灯打开，走过巷口的人能看见招牌",
    favorCost: 5,
    attractPct: 0.08,
    line: "巷口那盏灯一亮，晚归的人就晓得这边还开着。",
    why: "新阳路巷子里那个摆了三十多年的摊位，每晚十点准时亮灯，成了夜归人「默认的暖胃一站」。",
    kairo: "economy / 夜间一类（本作没有时段，折成进店率）",
    source: [
      {
        label: "新华网转广西日报《南宁老友粉：人因此味“粉”邕州》",
        url: "http://gx.xinhuanet.com/20260423/e911110a855f4dc9ba14f29617d490ca/c.html",
        quote:
          "每晚10时，新阳路巷子里，黄均梅经营了30多年的“梅姐美食”摊位便会准时亮灯，成为无数夜归人心中默认的暖胃一站。",
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
    id: "stool_row",
    name: "门口铺两张矮凳",
    what: "沿墙铺两张矮凳，等位的人不用蹲着吃",
    favorCost: 4,
    patiencePct: 0.12,
    line: "墙边铺开两张矮凳，端着碗的人总算有个坐处。",
    why: "中山路那家人气粉店，常有人端着碗蹲在墙边「哧溜」 —— 有凳子，等的人就不那么烦。",
    kairo: "storeparts / 内装：座位类（按天借，不进永久加座）",
    source: [
      {
        label: "解放日报《“老友”情牵话南宁》",
        url: "https://www.jfdaily.com/wx/detail.do?id=880997",
        quote: "在中山路的一家人气老粉店，常有人端着碗蹲在墙边“哧溜”。",
      },
    ],
  },
  {
    id: "chalkboard",
    name: "门口挂块价牌",
    what: "手写价目挂在门边，路过的人先看价再进门",
    favorCost: 6,
    attractPct: 0.05,
    sideMult: 1.1,
    line: "价牌挂出去了，路过的人先在门口站一站再进来。",
    why: "南宁粉店的加料价目都是明写在墙上或牌上的：加猪杂、加猪三脆、加鸭脚，一行一行写清楚。",
    kairo: "storeparts / 招牌类（本作折成进店与加购）",
    source: [
      {
        label: "微信《金鹏南宁老友粉》加料价目",
        url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
        quote:
          "配料选择更多：猪杂、瘦肉、牛肉都是常驻嘉宾……加猪杂6元、加猪三脆7元、加猪肉片7元、加虎皮鸭脚3元、加鹌鹑蛋3元、加生菜5元、加酸笋2元",
      },
    ],
  },
  {
    id: "helper",
    name: "请人帮半天",
    what: "叫个熟人来看灶，半天里多出几碗的量",
    favorCost: 10,
    capacity: 12,
    line: "熟人系上围裙站了半天灶边，手上总算不堵了。",
    why: "老友粉这行当靠「传帮带」：传承基地专门带一批煮粉师傅出来，学一两个月才出师。",
    kairo: "clerk / clerk_skill：短时人手（开罗是雇人，本作按半天借）",
    source: [
      {
        label: "广西新闻网《保住正宗「老友」 南宁老友粉传承基地正式挂牌成立》",
        url: "http://sub.gxnews.com.cn/staticpages/20200325/newgx5e7ac2ff-19389663.shtml",
        quote:
          "该基地将“传帮带”一批技术过硬的煮粉师傅，解决老友粉的传承问题。",
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
