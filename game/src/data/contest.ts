/**
 * 全国竞赛：34 个省级行政区各一位代表。
 *
 * 结构溯源：REA 有「全国大赛」系统，但对手表未在取证报告里出现完整表名，
 * 所以这里**不声称**结构对应，只做本项目需要的三列：省 / 招牌 / 实力。
 *
 * 玩法：玩家用 `recipe.total`（口味分）参赛，NPC 用「实力 + 确定性噪声」，
 * 名单一轮到底、可复算。广西代表最强——在南宁开店，先过本地这关。
 */

export interface ContestRival {
  id: string;
  province: string;
  city: string;
  signature: string;
  /** 对手口味分基准，约 66-94 */
  strength: number;
}

export const CONTEST_RIVALS: readonly ContestRival[] = [
  { id: "bj", province: "北京", city: "东城", signature: "炸酱面", strength: 78 },
  { id: "tj", province: "天津", city: "和平", signature: "煎饼果子", strength: 72 },
  { id: "he", province: "河北", city: "保定", signature: "驴肉火烧", strength: 70 },
  { id: "sx", province: "山西", city: "太原", signature: "刀削面", strength: 76 },
  { id: "nm", province: "内蒙古", city: "呼和浩特", signature: "羊肉稍麦", strength: 74 },
  { id: "ln", province: "辽宁", city: "沈阳", signature: "鸡架拌面", strength: 73 },
  { id: "jl", province: "吉林", city: "延吉", signature: "冷面", strength: 75 },
  { id: "hl", province: "黑龙江", city: "哈尔滨", signature: "锅包肉", strength: 71 },
  { id: "sh", province: "上海", city: "黄浦", signature: "生煎", strength: 82 },
  { id: "js", province: "江苏", city: "扬州", signature: "蟹粉汤包", strength: 84 },
  { id: "zj", province: "浙江", city: "杭州", signature: "片儿川", strength: 83 },
  { id: "ah", province: "安徽", city: "阜阳", signature: "牛肉板面", strength: 79 },
  { id: "fj", province: "福建", city: "厦门", signature: "沙茶面", strength: 81 },
  { id: "jx", province: "江西", city: "南昌", signature: "拌粉", strength: 86 },
  { id: "sd", province: "山东", city: "临沂", signature: "糁汤", strength: 77 },
  { id: "ha", province: "河南", city: "郑州", signature: "烩面", strength: 80 },
  { id: "hb", province: "湖北", city: "武汉", signature: "热干面", strength: 85 },
  { id: "hn", province: "湖南", city: "长沙", signature: "米粉", strength: 89 },
  { id: "gd", province: "广东", city: "广州", signature: "肠粉", strength: 88 },
  { id: "gx", province: "广西", city: "南宁", signature: "老友粉", strength: 94 },
  { id: "hi", province: "海南", city: "海口", signature: "海南粉", strength: 76 },
  { id: "cq", province: "重庆", city: "渝中", signature: "小面", strength: 90 },
  { id: "sc", province: "四川", city: "成都", signature: "担担面", strength: 88 },
  { id: "gz", province: "贵州", city: "贵阳", signature: "酸汤粉", strength: 87 },
  { id: "yn", province: "云南", city: "蒙自", signature: "过桥米线", strength: 86 },
  { id: "xz", province: "西藏", city: "拉萨", signature: "藏面", strength: 68 },
  { id: "sn", province: "陕西", city: "西安", signature: "油泼面", strength: 85 },
  { id: "gs", province: "甘肃", city: "兰州", signature: "牛肉面", strength: 92 },
  { id: "qh", province: "青海", city: "西宁", signature: "酿皮", strength: 70 },
  { id: "nx", province: "宁夏", city: "银川", signature: "羊肉臊子面", strength: 73 },
  { id: "xj", province: "新疆", city: "乌鲁木齐", signature: "拌面", strength: 78 },
  { id: "hk", province: "香港", city: "中环", signature: "云吞面", strength: 86 },
  { id: "mo", province: "澳门", city: "半岛", signature: "猪扒包", strength: 74 },
  { id: "tw", province: "台湾", city: "台北", signature: "牛肉面", strength: 85 },
];

/** 报名费（元）：一档免费让人先尝到甜头，往上才收钱 */
export const CONTEST_PRIZE: readonly number[] = [5000, 3000, 2000];
export const CONTEST_TOP10_PRIZE = 800;

// ───────────────────── 三种比赛（开罗 Contest 1-2 原文） ─────────────────────

/**
 * 开罗原文 `help.txt`：
 * - 「Contests 1 … You can choose the contest you want to participate in from 3 different types.」
 * - 「Contests 2  Staff: Based on your staff's total cooking, speed and service stats /
 *    Customers: Based on total levels for all customers / Shop: Based on total popularity
 *    and charisma for all shops.」
 * - 「Grading Tests … There are some arenas that you cannot enter unless you are a certain grade.」
 *
 * 于是三件事必须同时成立，中期才有决策：
 *   ① 一年只有两次（见 `sim/calendar.ts` 的六月/十二月）；
 *   ② 三条不同的备战路线（练人 / 养客 / 立招牌）；
 *   ③ 档位由段位卡着 —— 段位不升，只能报低档，奖金封顶。
 */
export type ContestTypeId = "staff" | "customers" | "shop";

export interface ContestType {
  id: ContestTypeId;
  name: string;
  /** 比什么（给 UI 的副标题） */
  basis: string;
  /** 怎么练（给玩家的备战提示） */
  prep: string;
}

export const CONTEST_TYPES: readonly ContestType[] = [
  {
    id: "staff",
    name: "后厨擂台",
    basis: "在职员工的厨艺、速度、服务总和",
    prep: "雇人、别让人累跑、扩建灶位让人手使得上",
  },
  {
    id: "customers",
    name: "街坊口碑赛",
    basis: "累计接待人次、常客数、出碗总数",
    prep: "稳客流：味道、定价、座位翻台",
  },
  {
    id: "shop",
    name: "招牌评比",
    basis: "口碑、门店魅力、味道分、现有段位",
    prep: "换招牌摆件、把味道做到 70 分以上、先评段位",
  },
];

export const CONTEST_TYPE_BY_ID: ReadonlyMap<ContestTypeId, ContestType> = new Map(
  CONTEST_TYPES.map((t) => [t.id, t]),
);

/**
 * 五档（开罗每类比赛也是 5 档门槛）。段位卡档，跟开罗「certain grade 才能进某些 arena」同构。
 * 门槛是「竞技分」，不是营业额：低于门槛的档位连报名都不给。
 */
export interface ContestTier {
  /** 1-5 */
  tier: number;
  /** 报名费（元） */
  feeYuan: number;
  /** 报名需要的段位（0 = 没评过也能报最低档） */
  minGrade: number;
  /** 冠军奖金（元），2/3 名按 60%/40% */
  prizeYuan: number;
  /** 对手基准分（实际 ±12% 噪声） */
  rivalScore: number;
}

export const CONTEST_TIERS: readonly ContestTier[] = [
  { tier: 1, feeYuan: 0, minGrade: 0, prizeYuan: 1_200, rivalScore: 70 },
  { tier: 2, feeYuan: 300, minGrade: 2, prizeYuan: 3_000, rivalScore: 130 },
  { tier: 3, feeYuan: 800, minGrade: 4, prizeYuan: 8_000, rivalScore: 210 },
  { tier: 4, feeYuan: 2_000, minGrade: 6, prizeYuan: 20_000, rivalScore: 310 },
  { tier: 5, feeYuan: 5_000, minGrade: 8, prizeYuan: 50_000, rivalScore: 430 },
] as const;

export function tierOf(tier: number): ContestTier {
  return CONTEST_TIERS[Math.min(CONTEST_TIERS.length, Math.max(1, tier)) - 1] as ContestTier;
}

/** 名次奖金：1 名全额，2 名 60%，3 名 40%，4-10 名固定 1/10 */
export function prizeOf(tier: number, rank: number): number {
  const t = tierOf(tier);
  if (rank === 1) return t.prizeYuan;
  if (rank === 2) return Math.round(t.prizeYuan * 0.6);
  if (rank === 3) return Math.round(t.prizeYuan * 0.4);
  if (rank <= 10) return Math.round(t.prizeYuan * 0.1);
  return 0;
}
