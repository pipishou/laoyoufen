/**
 * 材料分级：米与骨。
 *
 * 为什么做这一层（A5）：开罗把「面粉 7 档 + 碱水 7 档」「汤料 41 种」全做成可选料，
 * 玩家的中期决策是「今天进哪一档料」。我们原来把米与骨写死进 `BASE_COST`，
 * 于是成本只有一个数、味道只有滑块 —— 少了一整层「省钱还是好吃」的取舍。
 *
 * 只做两条线、每线三档，因为**分级的意义在于取舍，不在于数量**：
 * 三档刚好构成「便宜—标准—讲究」，再多玩家记不住，也不会改变他在两个之间选。
 *
 * 出处（都核过原文，见各条 `source`）：
 * - 早籼 / 晚籼 / 陈米的差别是**直链淀粉与支链淀粉**：
 *   早籼直链高 → 粉质硬、易断、易回生，但出粉率高、成本低、易成条；
 *   晚籼支链多 → 软、韧、不易断条，但不易成条、价格高；
 *   陈年老籼米水分低、更便宜，很多店在用。
 * - 骨：筒骨熬出来奶白浓稠但浮油多、腻；猪头骨清甜、成本最低；
 *   扇骨、脊椎骨都可以用，介于两者之间。
 *
 * 纪律：
 * 1. 只落两个已有出口 —— 米只动 `noodle` 分与料钱，骨只动 `soup` 分与料钱；
 * 2. 默认档必须是**零偏移**（晚籼米 / 脊骨），否则所有历史回归锁会一起动；
 * 3. 三档之间不许出现「又便宜又好吃」的一档 —— 那等于没有选择。
 */

export type RiceGradeId = "late" | "early" | "aged";
export type BoneGradeId = "spine" | "tube" | "head";

export interface GradeSource {
  label: string;
  url: string;
  quote: string;
}

export interface GradeDef<Id extends string> {
  id: Id;
  name: string;
  /** 一句话说清这档的脾气，面板上直接显示 */
  look: string;
  /** 每碗料钱的增减（元），负数是省 */
  costDelta: number;
  /** 汤底分增减（只有骨用） */
  soupDelta?: number;
  /** 米粉分增减（只有米用） */
  noodleDelta?: number;
  /** 为什么这一档是这个数 */
  why: string;
  source: GradeSource;
}

/** 米粉三档。默认晚籼米（零偏移）。 */
export const RICE_GRADES: readonly GradeDef<RiceGradeId>[] = [
  {
    id: "late",
    name: "晚籼米",
    look: "粉身软韧，断条少",
    costDelta: 0,
    noodleDelta: 0,
    why: "支链淀粉多，做出来的粉韧、不易断条，是鲜切粉最常用的一档；代价是出粉率低、米价高。",
    source: {
      label: "百家号《广西名小吃——生榨米粉制作工艺》",
      url: "https://baijiahao.baidu.com/s?id=1633945750335940567",
      quote: "灿米可要分早灿米，晚灿米的，一般来说晚灿米较软，大家用得多点。",
    },
  },
  {
    id: "early",
    name: "早籼米",
    look: "粉身偏硬，久煮不烂",
    costDelta: -0.35,
    noodleDelta: -3,
    why: "直链淀粉高，出粉率高、便宜、成条好，但粉质硬、易回生，嗦起来少了那口软滑。",
    source: {
      label: "米粉加工原理与技术（直链/支链淀粉对米粉品质的影响）",
      url: "http://www.smecqhc.com:8080/hcmfxf/up/upload/%E7%B1%B3%E7%B2%89%E5%8A%A0%E5%B7%A5%E5%8E%9F%E7%90%86%E4%B8%8E%E6%8A%80%E6%9C%AF.pdf",
      quote: "早籼含直链淀粉较高，生产出来的米粉容易老化（即回生），质硬且易断……但易成条。",
    },
  },
  {
    id: "aged",
    name: "陈米",
    look: "最便宜，容易断条",
    costDelta: -0.65,
    noodleDelta: -5,
    why: "放了一两年的老籼米，水分低、价最低，很多小店在用；断条多，口感也糙。",
    source: {
      label: "今日头条《做蒸米粉、肠粉选哪种大米？》",
      url: "https://m.toutiao.com/article/7084390927552348684/",
      quote: "市面上也有很多地方的人选用一些陈年老籼米，晚籼米做，也是可以的。效果各不同。",
    },
  },
];

/** 汤骨三档。默认脊骨（零偏移）。 */
export const BONE_GRADES: readonly GradeDef<BoneGradeId>[] = [
  {
    id: "spine",
    name: "脊骨",
    look: "汤清、带甜",
    costDelta: 0,
    soupDelta: 0,
    why: "脊骨（脊椎骨）汤清甜、不腻，是本作的基础档 —— 价格与效果都取中间，其余两档围着它上下。",
    source: {
      label: "今日头条《深剖猪杂、猪骨，火锅、粉面汤底的制作工艺与配方》",
      url: "https://www.toutiao.com/article/7177343283398803979/",
      quote: "其实汤师傅不是教大家非得用头骨，像扇骨、脊椎骨都是可以的。",
    },
  },
  {
    id: "tube",
    name: "筒骨",
    look: "汤色奶白、浓",
    costDelta: 0.5,
    soupDelta: 3,
    why: "筒骨胶原多，熬足四个小时汤色奶白，是最讲究的一档；贵，而且浮油多、偏腻。",
    source: {
      label: "微信《非遗的味道 | 老友粉》",
      url: "http://mp.weixin.qq.com/s?__biz=Mzk4ODE0MDgxOA==&mid=2247659094&idx=1&sn=4d4b3aa7cc8987dc4af1ae9131979760",
      quote: "猪筒骨与鸡架一同熬煮四小时，直至汤色呈奶白色。",
    },
  },
  {
    id: "head",
    name: "猪头骨",
    look: "最便宜，汤清但寡",
    costDelta: -0.35,
    soupDelta: -2,
    why: "头骨清甜、成本最低，开店的人天天算的就是这个账；缺点是骨油香不够，汤撑不起厚味。",
    source: {
      label: "今日头条《深剖猪杂、猪骨……》",
      url: "https://www.toutiao.com/article/7177343283398803979/",
      quote: "商用猪骨汤底，最好是选择猪头骨……最重要的是成本，毕竟开店，成本就是每天要头疼的问题之一！",
    },
  },
];

export const RICE_BY_ID: ReadonlyMap<string, GradeDef<RiceGradeId>> = new Map(RICE_GRADES.map((g) => [g.id, g]));
export const BONE_BY_ID: ReadonlyMap<string, GradeDef<BoneGradeId>> = new Map(BONE_GRADES.map((g) => [g.id, g]));

export const DEFAULT_RICE: RiceGradeId = "late";
export const DEFAULT_BONE: BoneGradeId = "spine";

export function riceById(id: string): GradeDef<RiceGradeId> | undefined {
  return RICE_BY_ID.get(id);
}
export function boneById(id: string): GradeDef<BoneGradeId> | undefined {
  return BONE_BY_ID.get(id);
}
