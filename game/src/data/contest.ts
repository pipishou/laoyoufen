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

/** 报名费（元） */
export const CONTEST_ENTRY_FEE = 300;
/** 每月只能报一次 */
export const CONTEST_PRIZE: readonly number[] = [5000, 3000, 2000];
export const CONTEST_TOP10_PRIZE = 800;
