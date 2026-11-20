/**
 * 家当（M3）：店里那些不值钱、但天天用得上的旧东西。
 *
 * 开罗 `storeequip.txt` 的 24 件里，前 12 件是灶/锅/柜台（= 我们的 `data/equipment.ts` 三件四档），
 * 后 12 件是「设施」——折叠椅、长凳、水龙头、服务手册、饮水机、雕像、净化器、砧板、
 * 排气扇、风扇、冰箱、工匠像。它们的共同点：**单件、一次买断、效果都很小**，
 * 但十二件叠起来就是开罗那种「店越开越顺手」的手感。
 *
 * 注意开罗那 12 件里有一半写的是 "Temporarily boosts …"（限时增益，靠 aura 触发）。
 * 我们这里不做限时 aura（一局 120 分钟的游戏分钟，限时增益玩家根本感知不到），
 * 一律改成**常驻小加成**，并落进已经在用的乘数入口——理由与 `data/streets.ts` 相同。
 *
 * 名字全部本土化：南宁人店里真有的东西（塑料矮凳、竹躺椅、巷口洗碗池、酸梅汤桶、街坊锦旗）。
 *
 * 定价（第 9 批货币校准）：十二件按「一台 / 一张 / 一撂」的真实零售价买，不再乘开罗的 KCU 比例尺。
 * 塑料凳十只一撂 ¥150、冰柜 ¥3,200、抽油烟机 ¥1,800、酸梅汤桶 ¥360、待客笔记 ¥60。
 * 合计 ¥9,780，约等于一家小店二十七天毛利 —— 现实里配齐这些也要攒近一个月。口径见 `data/money.ts`。
 */

export type GearId =
  | "plastic_stool"
  | "bamboo_chair"
  | "wash_sink"
  | "serve_manual"
  | "sour_plum"
  | "lucky_statue"
  | "hood"
  | "big_board"
  | "aroma_fan"
  | "wall_fan"
  | "freezer"
  | "banner";

export interface GearDef {
  id: GearId;
  name: string;
  costYuan: number;
  /** 面板上给玩家看的一句话 */
  effect: string;
  /** 开罗对应的那一件（只在 ?dev=1 时显示，给开发看） */
  kairo: string;
  /** 南宁话小注 */
  line: string;
  /** 座位 +N（买下时直接加到 venue.seats） */
  seats?: number;
  /** 出碗时间 −N%（0.06 = 快 6%） */
  servePct?: number;
  /** 料钱 −N% */
  costPct?: number;
  /** 每碗满意 +N */
  satBonus?: number;
  /** 候餐耐心 +N% */
  patiencePct?: number;
  /** 进店率 +N% */
  attractPct?: number;
  /** 饮料加购 +N% */
  drinkPct?: number;
  /** 员工疲劳 −N% */
  fatiguePct?: number;
  /** 同行抢客 −N%（只作用在本区份额上） */
  rivalShieldPct?: number;
}

export const GEARS: readonly GearDef[] = [
  {
    id: "serve_manual",
    name: "待客笔记",
    costYuan: 60,
    effect: "每碗满意 +1、耐心 +5%",
    kairo: "Service Manual「Temporarily boosts service.」",
    line: "阿婆传下来的小本子，谁爱多辣、谁不要葱，都写着。",
    satBonus: 1,
    patiencePct: 0.05,
  },
  {
    id: "plastic_stool",
    name: "塑料矮凳",
    costYuan: 150,
    effect: "多坐一个人",
    kairo: "Folding Chair「Sit down for a short rest.」",
    line: "红色塑料凳，一叠十个，门口一摆就有人坐。",
    seats: 1,
  },
  {
    id: "bamboo_chair",
    name: "竹躺椅",
    costYuan: 150,
    effect: "多坐一个人、耐心 +8%",
    kairo: "Bench「Lie down and take a good rest.」",
    line: "竹躺椅摆在骑楼下，等位的人愿意多等一会。",
    seats: 1,
    patiencePct: 0.08,
  },
  {
    id: "big_board",
    name: "大砧板",
    costYuan: 220,
    effect: "料钱省 4%（切得干净，少浪费）",
    kairo: "Cutting Board「Helps when finishing up ramen.」",
    line: "整块铁木砧板，剁肉不跑刀，边角料都收得住。",
    costPct: 0.04,
  },
  {
    id: "wall_fan",
    name: "壁扇",
    costYuan: 300,
    effect: "员工没那么容易累（疲劳 −20%）",
    kairo: "Fan「Stamina goes down more slowly.」",
    line: "墙上那台老壁扇一开，后厨的人能多撑两个钟。",
    fatiguePct: 0.2,
  },
  {
    id: "aroma_fan",
    name: "排风扇",
    costYuan: 320,
    effect: "进店 +5%（香味飘到街上）",
    kairo: "Exhaust Fan「Aroma's effect on line +N%.」",
    line: "排风扇往外一吹，半条巷都闻见酸笋味。",
    attractPct: 0.05,
  },
  {
    id: "sour_plum",
    name: "酸梅汤桶",
    costYuan: 360,
    effect: "饮料加购 +15%、耐心 +5%",
    kairo: "Drinking Fountain「Temporarily boosts walk speed.」",
    line: "冰桶里镇着酸梅汤，嗦完粉自己舀一碗。",
    drinkPct: 0.15,
    patiencePct: 0.05,
  },
  {
    id: "wash_sink",
    name: "巷口洗碗池",
    costYuan: 420,
    effect: "出碗快 6%（不用端着碗去后巷）",
    kairo: "Faucet「Temporarily boosts cooking.」",
    line: "巷口接条水管，碗当场冲，碗不用堆到收摊。",
    servePct: 0.06,
  },
  {
    id: "banner",
    name: "街坊锦旗",
    costYuan: 600,
    effect: "同行抢客 −25%（街坊认你家）",
    kairo: "Artisan Statue「Cuts rival effects by 50%.」",
    line: "「老友味正」的锦旗挂在墙上，客人抬头就看见。",
    rivalShieldPct: 0.25,
  },
  {
    id: "hood",
    name: "抽油烟机",
    costYuan: 1_800,
    effect: "耐心 +10%（店里不呛人）",
    kairo: "Air Purifier「Helps trigger auras.」",
    line: "抽油烟机一装，店里不再烟雾缭绕，客人坐得住。",
    patiencePct: 0.1,
  },
  {
    id: "lucky_statue",
    name: "老友粉祖师像",
    costYuan: 2_200,
    effect: "进店 +6%、每碗满意 +2",
    kairo: "Chimpan Z Statue「Temporary cook/serv/spd boost.」",
    line: "玻璃柜里一尊小像，逢年过节都要上炷香。",
    attractPct: 0.06,
    satBonus: 2,
  },
  {
    id: "freezer",
    name: "冰柜",
    costYuan: 3_200,
    effect: "料钱省 6%、每碗满意 +1",
    kairo: "Refrigerator「Fresher=better customer scores.」",
    line: "二手冰柜，猪杂冻得实在，第二天也不变味。",
    costPct: 0.06,
    satBonus: 1,
  },
];

export const GEAR_BY_ID: ReadonlyMap<string, GearDef> = new Map(GEARS.map((g) => [g.id, g]));

/** 全买齐要多少钱 */
export const GEAR_TOTAL_YUAN = GEARS.reduce((sum, g) => sum + g.costYuan, 0);

export function gearById(id: string): GearDef | null {
  return GEAR_BY_ID.get(id) ?? null;
}

/**
 * 家当摆在店里的位置（P53）。
 *
 * 开罗的设施是真摆在店内的：椅子在座位、灶在厨房、雕像在门口 —— 玩家一进店就看得见
 * 自己添了什么。我们没有 3D 店面，就在店铺页给一块 12×8 的俯视格：买下一件，
 * 它就在格子里出现，从此「店变了样」这件事是看得见的。
 *
 * 坐标是 (列, 行)，原点在左上；0–3 列是后厨，4–9 列是堂食，10–11 列靠门口。
 */
export type GearSpot = "seat" | "kitchen" | "wall" | "counter" | "decor";

/** 图例文字（面板上逐项标明颜色含义） */
export const GEAR_SPOT_LABEL: Record<GearSpot, string> = {
  seat: "座位",
  kitchen: "后厨",
  wall: "墙面",
  counter: "柜台",
  decor: "摆设",
};

export interface GearSlot {
  x: number;
  y: number;
  spot: GearSpot;
}

export const SHOP_GRID_W = 12;
export const SHOP_GRID_H = 8;

/** 每件家当在店里的位置 */
export const GEAR_SLOTS: Record<GearId, GearSlot> = {
  wall_fan: { x: 0, y: 0, spot: "wall" },
  hood: { x: 1, y: 0, spot: "kitchen" },
  big_board: { x: 2, y: 0, spot: "kitchen" },
  freezer: { x: 3, y: 0, spot: "kitchen" },
  banner: { x: 5, y: 0, spot: "wall" },
  aroma_fan: { x: 9, y: 0, spot: "wall" },
  serve_manual: { x: 6, y: 2, spot: "counter" },
  lucky_statue: { x: 7, y: 2, spot: "counter" },
  sour_plum: { x: 10, y: 2, spot: "counter" },
  plastic_stool: { x: 4, y: 4, spot: "seat" },
  bamboo_chair: { x: 6, y: 4, spot: "seat" },
  wash_sink: { x: 10, y: 6, spot: "decor" },
};

/** 面板上「店里」那一块的格子里放什么：空地板 / 已买家当的 spot */
export function shopGrid(state: { gear?: string[] }): (GearSpot | null)[][] {
  const grid: (GearSpot | null)[][] = Array.from({ length: SHOP_GRID_H }, () =>
    Array.from({ length: SHOP_GRID_W }, () => null),
  );
  for (const id of state.gear ?? []) {
    const slot = GEAR_SLOTS[id as GearId];
    if (!slot) continue;
    grid[slot.y]![slot.x] = slot.spot;
  }
  return grid;
}
