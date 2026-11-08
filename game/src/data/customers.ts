/**
 * 顾客原型表。
 *
 * 结构溯源（逆向取证 TheRamenSensei/dump.cs，HIGH）：
 *   data.Customer.ramen_ 是 int[3]，下标常量 RAMEN_N_THICK=0 / RAMEN_N_SHAPE=1 / RAMEN_S_TYPE=2；
 *   判定入口是 IsLikeNoodles(int thick, int shape) 与 IsLikeSoup(int soup)
 *   —— 开罗的「喜好」是**三个整数键逐项相等**，不是几条连续风味轴。
 *
 * 三维落到老友粉：
 *   粉宽 thick 0-4 ← NoodlesRecipe.thickType_（EX_THIN/THIN/NORMAL/THICK/EX_THICK，5 档）[KNOWN]
 *   粉型 shape 0-2 ← NoodlesRecipe.shapeType_（开罗 4 档直/波/卷/强波；REA 配方 n6 只有 3 档）[INFERRED]
 *   汤种 soup  0-7 ← SoupRecipe 的 8 个参数里取占优的一维（GetFeatureIndex/GetFeatureName 口径）[INFERRED, MED]
 *
 * 迁移说明：旧版「酸/辣/浓/淡」四维是移植时自造的连续风味轴，本轮删除。
 * 24 个原型的三维赋值按南宁骑楼夜市客群重推 [GUESS, LOW]，只保证相对关系。
 */

/** 三个喜好维度，顺序固定：图鉴、HUD、测试都按这个顺序用 */
export type LikeDim = "thick" | "shape" | "soup";

export const LIKE_DIMS_ORDER: readonly LikeDim[] = ["thick", "shape", "soup"];

export const LIKE_LABELS: Readonly<Record<LikeDim, string>> = {
  thick: "粉宽",
  shape: "粉型",
  soup: "汤种",
};

/** 粉宽 5 档，对齐 NoodlesRecipe.THICK_TYPE_* */
export const NOODLE_THICK_LABELS = ["超细", "细", "正常", "粗", "超粗"] as const;
/** 粉型 3 档，对齐 REA 配方 n6（0 切粉 / 1 圆粉 / 2 细切粉） */
export const NOODLE_SHAPE_LABELS = ["切粉", "圆粉", "细切粉"] as const;
/** 汤种 8 档，对齐汤底 8 参 s0-s7 的下标 */
export const SOUP_TYPE_LABELS = ["酸笋", "豆豉", "猪骨", "咸鲜", "鲜甜", "酸辣", "蒜香", "浓浊"] as const;

export interface CustomerPrefs {
  /** 粉宽 0-4，对应配方 n5 */
  thick: number;
  /** 粉型 0-2，对应配方 n6 */
  shape: number;
  /** 汤种 0-7，对应汤底 8 参里占优的那一维 */
  soup: number;
}

export interface CustomerArchetype {
  id: string;
  name: string;
  /** REA 原表对应行，仅结构溯源 */
  reaRef: string;
  /** 客单价预算（元），超了会嫌贵 */
  budget: number;
  /** 吃一碗要几分钟（游戏分钟） */
  eatSpeed: number;
  /** 最多容忍前面排几个人 */
  lineLimit: number;
  prefs: CustomerPrefs;
  /** 出现权重（相对值，不必归一） */
  weight: number;
  /** 一句人设，HUD 候餐区显示 */
  note: string;
}

/** 图鉴/飘字用：把某一维的偏好翻成人话 */
export function likeValueLabel(prefs: CustomerPrefs, dim: LikeDim): string {
  if (dim === "thick") return NOODLE_THICK_LABELS[prefs.thick] ?? "?";
  if (dim === "shape") return NOODLE_SHAPE_LABELS[prefs.shape] ?? "?";
  return SOUP_TYPE_LABELS[prefs.soup] ?? "?";
}

export const CUSTOMER_ARCHETYPES: readonly CustomerArchetype[] = [
  { id: "student", name: "学生仔", reaRef: "Student", budget: 8, eatSpeed: 4, lineLimit: 2, prefs: { thick: 1, shape: 2, soup: 0 }, weight: 14, note: "放学路上，边吃边写作业" },
  { id: "office", name: "上班族", reaRef: "Businessman", budget: 12, eatSpeed: 6, lineLimit: 2, prefs: { thick: 2, shape: 0, soup: 3 }, weight: 12, note: "午休一小时，赶时间" },
  { id: "neighbor", name: "街坊阿叔", reaRef: "Dept. Head", budget: 10, eatSpeed: 7, lineLimit: 4, prefs: { thick: 3, shape: 0, soup: 0 }, weight: 10, note: "天天来，认准这口酸" },
  { id: "grandma", name: "阿婆", reaRef: "Landlady", budget: 9, eatSpeed: 9, lineLimit: 3, prefs: { thick: 2, shape: 2, soup: 4 }, weight: 6, note: "要少辣，汤要鲜" },
  { id: "auntie", name: "骑楼阿姨", reaRef: "Florist", budget: 10, eatSpeed: 7, lineLimit: 3, prefs: { thick: 2, shape: 0, soup: 1 }, weight: 7, note: "买菜顺路，加青菜" },
  { id: "taxi", name: "的士司机", reaRef: "Trader", budget: 11, eatSpeed: 5, lineLimit: 2, prefs: { thick: 3, shape: 0, soup: 5 }, weight: 5, note: "交班前扒一碗" },
  { id: "nightowl", name: "夜宵党", reaRef: "Gamer", budget: 13, eatSpeed: 6, lineLimit: 3, prefs: { thick: 3, shape: 1, soup: 5 }, weight: 6, note: "越辣越醒神" },
  { id: "tourist", name: "外地游客", reaRef: "Adventurer", budget: 15, eatSpeed: 8, lineLimit: 5, prefs: { thick: 2, shape: 0, soup: 0 }, weight: 6, note: "第一次吃，先拍照" },
  { id: "blogger", name: "美食博主", reaRef: "Gourmet", budget: 15, eatSpeed: 9, lineLimit: 5, prefs: { thick: 2, shape: 1, soup: 6 }, weight: 3, note: "挑剔，但一发就爆" },
  { id: "worker", name: "工地大哥", reaRef: "Sumo Wrestl.", budget: 12, eatSpeed: 4, lineLimit: 2, prefs: { thick: 4, shape: 1, soup: 7 }, weight: 5, note: "要加肉，汤要顶饱" },
  { id: "sanitation", name: "早班环卫", reaRef: "Gardener", budget: 8, eatSpeed: 5, lineLimit: 3, prefs: { thick: 1, shape: 2, soup: 1 }, weight: 4, note: "天没亮就来" },
  { id: "parent", name: "带娃家长", reaRef: "Chimp. Fam.", budget: 11, eatSpeed: 8, lineLimit: 2, prefs: { thick: 2, shape: 2, soup: 4 }, weight: 5, note: "小孩不吃辣，也别太咸" },
  { id: "rider", name: "外卖骑手", reaRef: "Assistant", budget: 9, eatSpeed: 3, lineLimit: 1, prefs: { thick: 0, shape: 2, soup: 3 }, weight: 4, note: "三分钟解决" },
  { id: "college", name: "大学生", reaRef: "Good Stud.", budget: 10, eatSpeed: 5, lineLimit: 2, prefs: { thick: 2, shape: 0, soup: 0 }, weight: 5, note: "加蛋加腐竹" },
  { id: "boss", name: "批发老板", reaRef: "CEO", budget: 14, eatSpeed: 6, lineLimit: 3, prefs: { thick: 3, shape: 0, soup: 2 }, weight: 3, note: "不差钱，要猪杂" },
  { id: "teacher", name: "退休教师", reaRef: "Poet", budget: 10, eatSpeed: 9, lineLimit: 4, prefs: { thick: 1, shape: 2, soup: 4 }, weight: 3, note: "慢慢吃，看报纸" },
  { id: "ktv", name: "KTV 下班", reaRef: "Comedian", budget: 13, eatSpeed: 5, lineLimit: 3, prefs: { thick: 3, shape: 1, soup: 5 }, weight: 4, note: "凌晨两点，要重口" },
  { id: "vendor", name: "夜市摊主", reaRef: "Chef", budget: 11, eatSpeed: 5, lineLimit: 3, prefs: { thick: 2, shape: 1, soup: 6 }, weight: 3, note: "同行，嘴最刁" },
  { id: "tripper", name: "外地出差", reaRef: "Office Clerk", budget: 14, eatSpeed: 6, lineLimit: 3, prefs: { thick: 2, shape: 0, soup: 2 }, weight: 4, note: "问有没有不辣的" },
  { id: "couple", name: "情侣", reaRef: "Model", budget: 13, eatSpeed: 8, lineLimit: 4, prefs: { thick: 1, shape: 0, soup: 4 }, weight: 4, note: "一碗分着吃" },
  { id: "fitness", name: "健身党", reaRef: "Boxer", budget: 12, eatSpeed: 4, lineLimit: 2, prefs: { thick: 1, shape: 2, soup: 4 }, weight: 3, note: "不要油条，少盐" },
  { id: "streamer", name: "网红主播", reaRef: "Announcer", budget: 15, eatSpeed: 7, lineLimit: 5, prefs: { thick: 2, shape: 1, soup: 6 }, weight: 2, note: "架着手机进来" },
  { id: "regular", name: "老友常客", reaRef: "Aristocrat", budget: 11, eatSpeed: 6, lineLimit: 5, prefs: { thick: 3, shape: 0, soup: 0 }, weight: 5, note: "不用问，老样子" },
  { id: "shelter", name: "避雨路人", reaRef: "Adventurer", budget: 8, eatSpeed: 6, lineLimit: 5, prefs: { thick: 2, shape: 0, soup: 3 }, weight: 3, note: "回南天，进来躲雨" },
];

export const ARCHETYPE_BY_ID: ReadonlyMap<string, CustomerArchetype> = new Map(
  CUSTOMER_ARCHETYPES.map((c) => [c.id, c]),
);
