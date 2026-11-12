/**
 * 南宁本地化：行政区 → 客流，顾客原型 → 钱包。
 *
 * 对照的是开罗原版的两张表：
 *   `region.txt`   区域人口 500 → 2,000（解锁费 0 → 30,000）
 *   `customer.txt` 90 种顾客原型的钱包 840 → 1,400（≈ 8.4 → 14 元）
 *
 * 我们改成「GDP 决定客流」：GDP 是南宁各区最容易被玩家认出来的量，
 * 而且数据可查（《广西统计年鉴》口径，2024 年初核）。
 * 换算系数取 0.16 客/日/亿元，让起始区兴宁区落在 71 客/日 ——
 * 正好等于现测 4 座店的产能（71.2 碗/日），于是「起步区刚好喂饱一间小店，
 * 想长大必须换区」这条曲线不用编，是算出来的。
 *
 * 数据来源（2024 年地区生产总值，亿元，12 区县合计 5,995.36 = 南宁全市）：
 *   青秀 1512.66 ｜ 西乡塘 1053.45 ｜ 江南 692.83 ｜ 良庆 534.78 ｜ 武鸣 463.94
 *   兴宁 442.63 ｜ 横州 401.61 ｜ 宾阳 312.35 ｜ 邕宁 200.90 ｜ 隆安 141.68
 *   上林 122.30 ｜ 马山 116.23
 */

export type DistrictId =
  | "xingning"
  | "xixiangtang"
  | "jiangnan"
  | "qingxiu"
  | "liangqing"
  | "wuming"
  | "yongning"
  | "hengzhou"
  | "binyang"
  | "longan"
  | "shanglin"
  | "mashan";

export interface District {
  id: DistrictId;
  name: string;
  /** 2024 年地区生产总值（亿元，初核） */
  gdpYi: number;
  /** 到本区开店要交的门面转让费（元）；0 = 祖传铺面 */
  transferFeeYuan: number;
  /** 一句话卖点，给玩家看 */
  pitch: string;
}

/** 客/日/亿元。0.16 是把兴宁区（442.63 亿）对齐到 71 客/日 得出的。 */
export const TRAFFIC_PER_GDP_YI = 0.16;

export const DISTRICTS: readonly District[] = [
  { id: "xingning", name: "兴宁区", gdpYi: 442.63, transferFeeYuan: 0, pitch: "老城区，朝阳广场人流；祖传铺面，起步就在这" },
  { id: "yongning", name: "邕宁区", gdpYi: 200.9, transferFeeYuan: 20_000, pitch: "蒲庙老镇，租金便宜，街坊生意" },
  { id: "mashan", name: "马山县", gdpYi: 116.23, transferFeeYuan: 18_000, pitch: "山里县城，客流小但竞争也小" },
  { id: "shanglin", name: "上林县", gdpYi: 122.3, transferFeeYuan: 20_000, pitch: "大明山脚，周末游客多" },
  { id: "longan", name: "隆安县", gdpYi: 141.68, transferFeeYuan: 24_000, pitch: "右江边，工业园工人饭点集中" },
  { id: "binyang", name: "宾阳县", gdpYi: 312.35, transferFeeYuan: 32_000, pitch: "炮龙节老家，节庆生意爆" },
  { id: "hengzhou", name: "横州市", gdpYi: 401.61, transferFeeYuan: 38_000, pitch: "茉莉花都，早市客流稳" },
  { id: "wuming", name: "武鸣区", gdpYi: 463.94, transferFeeYuan: 48_000, pitch: "大学城 + 新工厂，年轻人多" },
  { id: "liangqing", name: "良庆区", gdpYi: 534.78, transferFeeYuan: 62_000, pitch: "五象新区，写字楼白领" },
  { id: "jiangnan", name: "江南区", gdpYi: 692.83, transferFeeYuan: 72_000, pitch: "机场 + 工业，客流最杂" },
  { id: "xixiangtang", name: "西乡塘区", gdpYi: 1053.45, transferFeeYuan: 92_000, pitch: "大学城，学生党钱包薄但人多" },
  { id: "qingxiu", name: "青秀区", gdpYi: 1512.66, transferFeeYuan: 120_000, pitch: "东盟商务区，客单价最高" },
] as const;

export const DISTRICT_BY_ID: ReadonlyMap<DistrictId, District> = new Map(
  DISTRICTS.map((d) => [d.id, d]),
);

export function districtById(id: DistrictId): District {
  const d = DISTRICT_BY_ID.get(id);
  if (!d) throw new Error(`没有这个区：${id}`);
  return d;
}

/** 该区的日潜在客流（人次）。开罗用区域人口，我们用 GDP×0.16。 */
export function dailyTrafficOf(id: DistrictId): number {
  return Math.round(districtById(id).gdpYi * TRAFFIC_PER_GDP_YI);
}

/** 按客流排序（小的在前），用于「去哪开店」的选择界面 */
export function districtsByTraffic(): District[] {
  return [...DISTRICTS].sort((a, b) => a.gdpYi - b.gdpYi);
}

// ─────────────────────────── 顾客钱包 ───────────────────────────

export type WalletArchetypeId =
  | "student"
  | "college"
  | "office"
  | "worker"
  | "auntie"
  | "boss"
  | "tourist"
  | "nightowl"
  | "delivery"
  | "kid";

export interface WalletArchetype {
  id: WalletArchetypeId;
  name: string;
  /** 一碗能吃下的上限（元）。开罗原文 840–1400 → 广西 8.4–14 元 */
  walletYuan: number;
  /** 在游戏里怎么认出来（给文案用） */
  tell: string;
}

/**
 * 钱包就是开罗的 `customer.txt` 预算列，按 1 单位 = 0.01 元 换算后取整到角。
 * 南宁现实：一碗老友粉 8–12 元，加肉加蛋 14 元封顶，所以 14 是老板的上限。
 */
export const WALLETS: readonly WalletArchetype[] = [
  { id: "kid", name: "细蚊仔", walletYuan: 8.4, tell: "牵着大人的手，只点二两不要辣" },
  { id: "student", name: "中学生", walletYuan: 8.4, tell: "校服，掏零钱数半天" },
  { id: "auntie", name: "街坊阿婆", walletYuan: 9.0, tell: "自带饭盒，问能不能少五毛" },
  { id: "college", name: "大学生", walletYuan: 9.5, tell: "背电脑包，加个蛋要犹豫" },
  { id: "delivery", name: "外卖骑手", walletYuan: 9.5, tell: "头盔不摘，站着三口吃完" },
  { id: "worker", name: "工地师傅", walletYuan: 10.0, tell: "要加粉，说下午还要上工" },
  { id: "nightowl", name: "夜宵粉仔", walletYuan: 10.0, tell: "凌晨两点，嗓子哑了要重辣" },
  { id: "tourist", name: "外地游客", walletYuan: 11.0, tell: "举着手机拍招牌，问什么是酸笋" },
  { id: "office", name: "写字楼白领", walletYuan: 12.0, tell: "看表，要快，加卤蛋不还价" },
  { id: "boss", name: "老板 / 领导", walletYuan: 14.0, tell: "不看价目表，只说「照旧，加料」" },
] as const;

export const WALLET_BY_ID: ReadonlyMap<WalletArchetypeId, WalletArchetype> = new Map(
  WALLETS.map((w) => [w.id, w]),
);

export function walletOf(id: WalletArchetypeId): number {
  const w = WALLET_BY_ID.get(id);
  if (!w) throw new Error(`没有这个原型：${id}`);
  return w.walletYuan;
}

/**
 * 该区的原型分布（权重，和为 1）。
 * 这是「GDP 决定客流」的另一半：客流大不等于客单价高，
 * 西乡塘人多但学生多、青秀人略少但白领多 —— 涨价的风险不一样。
 */
export const DISTRICT_MIX: Readonly<Record<DistrictId, Partial<Record<WalletArchetypeId, number>>>> = {
  xingning: { auntie: 0.22, student: 0.18, office: 0.18, tourist: 0.14, boss: 0.08, kid: 0.12, worker: 0.08 },
  yongning: { auntie: 0.3, worker: 0.22, student: 0.18, kid: 0.1, delivery: 0.1, office: 0.1 },
  mashan: { auntie: 0.32, worker: 0.24, kid: 0.12, student: 0.16, delivery: 0.08, office: 0.08 },
  shanglin: { tourist: 0.24, auntie: 0.26, student: 0.16, worker: 0.14, kid: 0.1, office: 0.1 },
  longan: { worker: 0.34, auntie: 0.24, delivery: 0.12, student: 0.12, kid: 0.1, office: 0.08 },
  binyang: { auntie: 0.26, worker: 0.2, student: 0.16, tourist: 0.12, delivery: 0.12, office: 0.14 },
  hengzhou: { auntie: 0.28, worker: 0.2, tourist: 0.14, student: 0.14, delivery: 0.12, office: 0.12 },
  wuming: { college: 0.34, student: 0.2, worker: 0.16, office: 0.12, auntie: 0.1, delivery: 0.08 },
  liangqing: { office: 0.4, tourist: 0.12, college: 0.12, boss: 0.1, auntie: 0.1, delivery: 0.1, student: 0.06 },
  jiangnan: { worker: 0.28, office: 0.18, delivery: 0.14, auntie: 0.14, tourist: 0.1, college: 0.08, student: 0.08 },
  xixiangtang: { college: 0.36, student: 0.22, auntie: 0.12, delivery: 0.1, worker: 0.1, office: 0.1 },
  qingxiu: { office: 0.34, boss: 0.18, tourist: 0.14, college: 0.1, delivery: 0.1, nightowl: 0.06, student: 0.08 },
};

/** 该区的加权平均钱包（元）—— 定价时直接看这个数 */
export function avgWalletOf(id: DistrictId): number {
  const mix = DISTRICT_MIX[id];
  let sum = 0;
  let weight = 0;
  for (const [k, v] of Object.entries(mix)) {
    sum += walletOf(k as WalletArchetypeId) * (v ?? 0);
    weight += v ?? 0;
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * 定价能不能被这个区接住。
 * 开罗原版是「钱包 < 价格 → 买不起 → 走人」，这里给出同一口径的判定，
 * 但返回还差多少，方便 UI 提示「这个价在本区只有 X% 的人买得起」。
 */
export function priceVerdict(
  id: DistrictId,
  price: number,
): { shareCanAfford: number; shortageYuan: number } {
  const mix = DISTRICT_MIX[id];
  let afford = 0;
  let weight = 0;
  for (const [k, v] of Object.entries(mix)) {
    const w = v ?? 0;
    weight += w;
    if (walletOf(k as WalletArchetypeId) >= price) afford += w;
  }
  const shareCanAfford = weight > 0 ? afford / weight : 0;
  return { shareCanAfford, shortageYuan: Math.max(0, price - avgWalletOf(id)) };
}
