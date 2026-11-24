/**
 * 店里的九十六格（批次十）。
 *
 * 开罗 `casket.txt` 是 14 行 × 227 列的**家具摆放预设表** —— 它给每一套店面
 * 准备好「哪里放灶、哪里摆桌」的坐标，玩家买来的东西自动落到格子里。
 *
 * 我们此前没有坐标：家当按 `GEAR_SLOTS` 写死位置，买新件不挪窝（P112）。
 * 这一批给六套门面各一张槽位表，共用一张 12×8 的格子（96 格）：
 *
 *   - 灶 4 格（沿后墙）—— 对应设备 `stove`
 *   - 桌 12 格（中间三排）—— 对应座位数
 *   - 备料 6 格（右墙）—— 对应案台 `bench`
 *   - 门面 4 格（临街）—— 对应招牌 / 锦旗 / 灯箱这类
 *
 * 三条纪律：
 *   1. **只画不玩**：格子不改数值，座位数与设备口数仍然由 `venue` / `equipment` 决定。
 *   2. **每套门面同一张 12×8**：换门面只换配色与槽位，不换尺寸。
 *   3. **槽位够用**：26 个槽 > 目前最多能买的件数，宁可空着也不挤。
 */

export const STAGE_W = 12;
export const STAGE_H = 8;
export const STAGE_CELLS = STAGE_W * STAGE_H;

export type SlotKind = "stove" | "table" | "prep" | "front";

export interface Slot {
  kind: SlotKind;
  x: number;
  y: number;
}

export const SLOT_NAMES: Readonly<Record<SlotKind, string>> = {
  stove: "灶",
  table: "桌",
  prep: "备料",
  front: "门面",
};

/** 四类槽位每套门面都一样 —— 换门面换的是配色，不是格局（格局一改，老玩家会不认识自己店） */
const BASE_SLOTS: readonly Slot[] = [
  // 灶：后墙四个（y=0），从左到右
  { kind: "stove", x: 2, y: 0 },
  { kind: "stove", x: 4, y: 0 },
  { kind: "stove", x: 6, y: 0 },
  { kind: "stove", x: 8, y: 0 },
  // 桌：中间三排，每排四个
  { kind: "table", x: 2, y: 2 },
  { kind: "table", x: 5, y: 2 },
  { kind: "table", x: 8, y: 2 },
  { kind: "table", x: 10, y: 2 },
  { kind: "table", x: 2, y: 4 },
  { kind: "table", x: 5, y: 4 },
  { kind: "table", x: 8, y: 4 },
  { kind: "table", x: 10, y: 4 },
  { kind: "table", x: 2, y: 6 },
  { kind: "table", x: 5, y: 6 },
  { kind: "table", x: 8, y: 6 },
  { kind: "table", x: 10, y: 6 },
  // 备料：右墙六个
  { kind: "prep", x: 11, y: 1 },
  { kind: "prep", x: 11, y: 2 },
  { kind: "prep", x: 11, y: 3 },
  { kind: "prep", x: 11, y: 4 },
  { kind: "prep", x: 11, y: 5 },
  { kind: "prep", x: 11, y: 6 },
  // 门面：临街四个（y=7）
  { kind: "front", x: 1, y: 7 },
  { kind: "front", x: 4, y: 7 },
  { kind: "front", x: 7, y: 7 },
  { kind: "front", x: 10, y: 7 },
] as const;

export const SLOTS: readonly Slot[] = BASE_SLOTS;

export const SLOT_COUNT: Readonly<Record<SlotKind, number>> = {
  stove: BASE_SLOTS.filter((s) => s.kind === "stove").length,
  table: BASE_SLOTS.filter((s) => s.kind === "table").length,
  prep: BASE_SLOTS.filter((s) => s.kind === "prep").length,
  front: BASE_SLOTS.filter((s) => s.kind === "front").length,
};

/**
 * 成套度（批 J′，解 P290「96 格只画不玩」）。
 *
 * 开罗 `storepattern` 是「成套内装」：一套配齐了有整套加成，散着买没有。
 * 本作的格子此前纯装饰，这一批只给**两个**出口 —— 二次确认时把
 * 「每格 0.5%、满格 +48%」这一版撤掉了（`capacityOf` / `stageMinutes` 各自
 * 已经叠了四五层，再加一层就是第六层，P154 的上限没人验过）。
 *
 * 所以只剩：
 *   - `room_done`（店里坐得下）→ **耐心 +12%，常驻**；
 *   - `front_done`（门面齐了）→ 进店率 +4%，**常驻**（门面件不会被卖掉）。
 *
 * 改过一版（批 P′，解 P301）：`room_done` 原来白送座位 +1。座位是本作唯一的
 * 真瓶颈（`EAT_MINUTES = 6`），白送一个座位等于白送一天十碗，替身四种子因此多赚
 * 两成。开罗那边座位在 `storeequip` 的柜台行（0 / 700 / 1750 / 7800 换 4/6/8/12 位）
 * 是要花钱买的设备，内装成套（`storeparts` + `storepattern`）只管气氛。
 * 所以这一条改回「气氛」：桌与桌之间让开，坐着不挤，愿意多等一会儿；
 * 「多坐一位」交回 `plastic_stool` / `bamboo_chair`（各 ¥150）。
 *
 * 两个都不改料钱、不改出碗时间 —— 那是别的批已经占了的位置。
 */
export interface SlotSetDef {
  id: "room_done" | "front_done";
  name: string;
  /** 凑齐条件：各类槽位至少摆满几个 */
  need: Readonly<Partial<Record<SlotKind, number>>>;
  /** 凑齐之后常驻的耐心加成（桌子让开了，坐着不挤） */
  patiencePct?: number;
  /** 凑齐之后常驻的进店加成 */
  attractPct?: number;
  line: string;
  why: string;
  kairo: string;
}

export const SLOT_SETS: readonly SlotSetDef[] = [
  {
    id: "room_done",
    name: "店里坐得下了",
    need: { table: 6 },
    patiencePct: 0.12,
    line: "桌子摆开六张，桌与桌之间还能侧身过 —— 坐着的人不挤，等的人也不催。",
    why: "散着摆是挤，六张摆开才叫坐下来吃。多一个人坐还是得多一张凳，那是要另外买的；成套买的是这一口气。",
    kairo: "storepattern：成套内装给成套效果",
  },
  {
    id: "front_done",
    name: "门面齐了",
    need: { front: 4 },
    attractPct: 0.04,
    line: "招牌、锦旗、灯箱、风扇都到位了，巷口一眼就看得见这家。",
    why: "招牌管远看、灯箱管夜里、锦旗管抬头、风扇管路过的人肯不肯停 —— 四样各管一头，齐了才成个门面。",
    kairo: "storeparts / 招牌类：成套的门面",
  },
];

export const SLOT_SET_TOTAL = SLOT_SETS.length;

export function slotSetById(id: string): SlotSetDef | undefined {
  return SLOT_SETS.find((s) => s.id === id);
}
