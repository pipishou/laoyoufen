/**
 * 区县的能量与换区（S6 的一半，对齐开罗 `help.txt` 的 Sales Areas 2）。
 *
 * 开罗原文：「The energy and appetite of your **current area will gradually decrease**,
 * while they will **increase in other areas**. Energy: Affects shop visitation rate.
 * Appetite: Affects how much ramen is eaten.」
 *
 * 我们把它落成「客流池的能量」：同一个区待久了两件事同时发生 ——
 *   ① 你所在的区，客人逐渐吃腻（energy 每季度 −9%，最低 0.55）；
 *   ② 别处的区在长（每季度 +6%，最高 1.25）。
 * 于是「什么时候搬家、搬到哪」变成每 6–9 个月必须算一次的事，
 * 而这正是 P24 里缺的那根「中期压力」。
 *
 * 换区不是免费：要付 `transferFeeYuan`（¥0–¥120,000），并且能量从 1.0 重新开始。
 */

import { DISTRICTS, dailyTrafficOf, districtById, type DistrictId } from "../data/nanning";
import type { GameState } from "./state";
import { roadworkBoostOf } from "./unlocks";
import { rivalShareOf, takeoverPoolBoostOf } from "./rivals";
import { streetPoolMult } from "./streets";

/** 待满一个季度，本区掉多少客流 */
export const HOME_DECAY_PER_QUARTER = 0.09;
/** 待满一个季度，别区长多少客流 */
export const AWAY_GROWTH_PER_QUARTER = 0.06;
export const ENERGY_MIN = 0.55;
export const ENERGY_MAX = 1.25;

/**
 * 同一句话的另一半：**appetite —— 客人还吃得下多少**。
 *
 * 2026-11-22 补：这份文件原先把开罗的「energy and appetite」只做了 energy 那一半，
 * 于是「这条街吃腻了」只能表现成「人变少」。开罗原意是两条通道：
 * energy 管**来不来**，appetite 管**点多少**。这里补上后面那条，
 * 并且刻意让它的出口与能量**不重叠** —— 只落加购与份量，不落进店。
 */
export const APPETITE_DECAY_PER_QUARTER = 0.04;
export const APPETITE_GROWTH_PER_QUARTER = 0.03;
export const APPETITE_MIN = 0.75;
export const APPETITE_MAX = 1.15;

function quarters(month: number): number {
  return Math.floor(Math.max(0, month) / 3);
}

/** 本区能量：按「住进这个区多久」衰减，不看全局月份 */
export function homeEnergyOf(state: GameState): number {
  const age = quarters(state.month - state.districtSince);
  return Math.max(ENERGY_MIN, 1 - HOME_DECAY_PER_QUARTER * age);
}

/** 某区此刻的能量（本区衰减、别区增长） */
export function energyOf(state: GameState, id: string): number {
  if (id === state.district) return homeEnergyOf(state);
  const age = quarters(state.month - state.districtSince);
  return Math.min(ENERGY_MAX, 1 + AWAY_GROWTH_PER_QUARTER * age);
}

/** 本区胃口：住得越久，客人越吃不下（封底 0.75） */
export function homeAppetiteOf(state: GameState): number {
  const age = quarters(state.month - state.districtSince);
  return Math.max(APPETITE_MIN, 1 - APPETITE_DECAY_PER_QUARTER * age);
}

/** 某区此刻的胃口（本区衰减、别区增长） */
export function appetiteOf(state: GameState, id: string): number {
  if (id === state.district) return homeAppetiteOf(state);
  const age = quarters(state.month - state.districtSince);
  return Math.min(APPETITE_MAX, 1 + APPETITE_GROWTH_PER_QUARTER * age);
}

/** 现在进店概率要乘的系数（本区能量） */
export function districtEnergy(state: GameState): number {
  return homeEnergyOf(state);
}

/** 现在「点多少」要乘的系数（本区胃口）。不用于进店，只用于加购与份量 */
export function districtAppetite(state: GameState): number {
  return homeAppetiteOf(state);
}

/** 一句人话：这一片还吃不吃得下你家的粉 */
export function appetiteWords(state: GameState): string {
  const a = homeAppetiteOf(state);
  if (a <= APPETITE_MIN + 1e-9) return "这一片吃你家的粉是真的吃腻了（点单已经掉到最省）";
  if (a < 0.9) return `这一片有点吃腻了（点单 ×${a.toFixed(2)}，换区能重新养回来）`;
  if (a >= 1.1) return `这一片正吃得下（点单 ×${a.toFixed(2)}）`;
  return "这一片还吃得下（点单 ×1.00）";
}

/**
 * 区客流池的放大系数。
 *
 * `dailyTrafficOf` 的 0.16 是当初拿「兴宁 71 客/日 = 4 座店产能」反解出来的，
 * 那是**店铺**的产能标定，不是**城区**的人流上限。开罗的人口是 500 起、30,000 封顶，
 * 一直远大于一家店的翻台量；所以这里把城区池子放大到 2.25 倍：
 * 兴宁满能量 ≈ 160 客/日（> 8 座满编 113），衰减到 55% ≈ 88 客/日（< 113）——
 * 于是「产能先顶住、能量衰减后池子反超」这个交替约束才真的成立。
 */
export const DEMAND_TRAFFIC_SCALE = 2.25;

/**
 * 这个区一天能喂饱多少人 = 区潜在客流 × 能量 × 放大系数。
 *
 * 开罗原文 Sales Areas 2：「Energy: Affects shop visitation rate. Appetite: Affects how
 * much ramen is eaten.」我们的「客流池」就是这一层：区池子比你的座位大，扩建才有意义；
 * 池子比你座位小，怎么加灶也没用 —— 这才是「什么时候搬家」这个决策的算术。
 */
export function demandCapOf(state: GameState): number {
  const district = state.district || "xingning";
  const base = dailyTrafficOf(district as DistrictId) * DEMAND_TRAFFIC_SCALE;
  // 巷口灯箱（手艺树 roadwork，第 5 段）：开罗 Road Work 同样是「修路 → 来的人多」
  // M1 同条街：这条街上的同行也在抢同一批人 —— 他们拿走 share，你能卖的就少这么多。
  // 接过铺子（同行倒闭后你盘下来）会把池子做大一点：你的门面变成了两个入口。
  const street =
    (1 - rivalShareOf(state)) * (1 + takeoverPoolBoostOf(state)) * streetPoolMult(state);
  return Math.max(
    8,
    Math.round(base * homeEnergyOf(state) * roadworkBoostOf(state) * street),
  );
}

/** 换区时给玩家看的「池子对比」用：满能量下这个区一天能喂饱多少人 */
export function demandCapAtFullEnergy(id: string): number {
  return Math.round(dailyTrafficOf(id as DistrictId) * DEMAND_TRAFFIC_SCALE);
}

/** 换区面板要的一行数据 */
export interface DistrictOption {
  id: DistrictId;
  name: string;
  pitch: string;
  /** 日潜在客流（未乘能量） */
  traffic: number;
  /** 此刻能量 */
  energy: number;
  /** 实际能指望的日客流 = traffic × energy */
  effective: number;
  /** 转让费（元） */
  feeYuan: number;
  affordable: boolean;
  /** 是不是现在待的区 */
  current: boolean;
}

export function districtOptions(state: GameState): DistrictOption[] {
  return DISTRICTS.map((d) => {
    const energy = energyOf(state, d.id);
    // 面板上的数字必须与顾客循环里真正用的那个池子同源（demandCapOf 乘了 DEMAND_TRAFFIC_SCALE），
    // 否则玩家看到「这个区 71 客」而引擎喂 160 客，换区判断全是错的。
    const traffic = Math.round(dailyTrafficOf(d.id) * DEMAND_TRAFFIC_SCALE);
    return {
      id: d.id,
      name: d.name,
      pitch: d.pitch,
      traffic,
      energy,
      effective: Math.round(traffic * energy),
      feeYuan: d.transferFeeYuan,
      affordable: state.cash >= d.transferFeeYuan,
      current: d.id === state.district,
    };
  }).sort((a, b) => b.effective - a.effective);
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
  paid?: number;
}

/**
 * 换区。只允许在「还没开门」时搬（开罗也是在营业窗口之间调区域），
 * 钱不够不扣钱；搬完能量从 1.0 重新开始。
 *
 * 转让费是**一次性解锁**：付过一次的区以后随时可以搬回去（`tally.districts` 记账），
 * 对齐开罗 `region.txt` 的「买个区就归你了」；否则从免费区搬出去再搬回来等于白嫖一个新池子。
 */
export function moveShop(state: GameState, id: string): MoveResult {
  if (state.phase !== "prep") return { ok: false, reason: "打烊后再搬" };
  if (id === state.district) return { ok: false, reason: "已经在这个区了" };
  const d = districtById(id as DistrictId);
  const unlocked = state.tally.districts.includes(d.id);
  const fee = unlocked ? 0 : d.transferFeeYuan;
  if (state.cash < fee) {
    return { ok: false, reason: `转让费还差 ¥${Math.ceil(fee - state.cash).toLocaleString("zh-CN")}` };
  }
  state.cash -= fee;
  state.district = d.id;
  state.districtSince = state.month;
  if (!state.tally.districts.includes(d.id)) state.tally.districts.push(d.id);
  return { ok: true, paid: fee };
}
