/**
 * 汤底三底（批 Z′）—— 读状态那一侧。
 *
 * 与「骨两档」「碗五只」一样，只在**两个已有出口**上加钱加味：
 * `soup`（汤底分）与 `cost`（每碗料钱）。不碰客流、耐心、出碗、满意度。
 */

import type { GameState } from "./state";
import { slowestStation, stageMinutes, stationCount } from "./equipment";
import { STATION_NAMES, STATION_ORDER, type StationId } from "../data/equipment";
import {
  DEFAULT_SOUP_BASE,
  SOUP_BASES,
  SOUP_BROTH,
  soupBaseById,
  soupPipelineWords,
  type SoupBaseDef,
} from "../data/soupbase";

export interface SoupBaseView {
  def: SoupBaseDef;
  /** 现在这一款就在用这一底 */
  on: boolean;
  /** 客人够不够 */
  unlocked: boolean;
  /** 还差几位客人 */
  short: number;
}

/** 现在这一款用的是哪一底 */
export function soupBaseOf(state: GameState): SoupBaseDef {
  return soupBaseById(state.recipe?.base);
}

export function soupBaseViews(state: GameState): SoupBaseView[] {
  const cur = soupBaseOf(state).id;
  return SOUP_BASES.map((def) => ({
    def,
    on: def.id === cur,
    unlocked: state.totalCustomers >= def.needCustomers,
    short: Math.max(0, def.needCustomers - state.totalCustomers),
  }));
}

export interface SoupBaseResult {
  ok: boolean;
  reason?: string;
  /** 成功时回一句（面板给 toast 用） */
  line?: string;
}

/** 换底：改编辑缓冲；落笔由调用方 `syncEditing()` 负责 */
export function setSoupBase(state: GameState, id: string): SoupBaseResult {
  const def = SOUP_BASES.find((b) => b.id === id);
  if (!def) return { ok: false, reason: "没有这一底" };
  if (state.totalCustomers < def.needCustomers) {
    return { ok: false, reason: `还差 ${def.needCustomers - state.totalCustomers} 位客人` };
  }
  if (soupBaseOf(state).id === def.id) return { ok: false, reason: `本来就是${def.name}` };
  state.recipe.base = def.id;
  return { ok: true, line: `换成${def.name}：${def.look}。` };
}

/** 面板摘要：现在拿什么打底（骨汤是共同底，写在前头） */
export function soupBaseSummary(state: GameState): string {
  const def = soupBaseOf(state);
  const parts: string[] = [`${SOUP_BROTH} + ${def.extra}`];
  if (def.soupDelta !== 0) parts.push(`汤底 ${def.soupDelta > 0 ? "+" : ""}${def.soupDelta}`);
  if (def.costDelta !== 0) parts.push(`料钱 ${def.costDelta > 0 ? "+" : ""}¥${def.costDelta}`);
  return parts.join(" · ");
}

/** 共同底 + 固定工序压一句（配方页抬头用，不随选哪一底变） */
export function soupBrothWords(): string {
  return `${SOUP_BROTH}打底 · ${soupPipelineWords()}`;
}

/**
 * 汤底分那几点到底是谁给的（解 P390）。
 *
 * 八参分组是合成值，换底之后那行数字不一定动 —— 所以单独写一句因果，
 * 让玩家在面板上直接看见「+3 来自番茄底」。
 */
export function soupDeltaWords(state: GameState): string {
  const def = soupBaseOf(state);
  if (def.soupDelta === 0) return "";
  return `汤底 ${def.soupDelta > 0 ? "+" : ""}${def.soupDelta} 来自${def.name}（骨汤之外多加了${def.extra}）`;
}

/**
 * 三道工序里眼下最吃手的是哪一步（解 P398：工序要有「哪步卡着」的反馈）。
 *
 * 这条不新增任何系统：工序本来就要占灶、占汤锅、占粉篓，谁最慢就是谁卡着 ——
 * 读的是 `stageMinutes` 里那三段，与出碗速度共用同一个事实。
 */
const STEP_BY_STATION: Record<StationId, string> = {
  wok: "爆香",
  pot: "吊骨汤",
  basket: "冲汤下粉",
};

export interface SoupStepHeld {
  /** 工序名（爆香 / 吊骨汤 / 冲汤下粉） */
  step: string;
  /** 站名（炒锅 / 汤锅 / 粉篓） */
  station: string;
  /** 这一段一段要几分钟 */
  minutes: number;
  /** 这一站有几口 */
  count: number;
}

export function soupStepHeld(state: GameState): SoupStepHeld {
  const slow = slowestStation(state);
  return {
    step: STEP_BY_STATION[slow.station],
    station: STATION_NAMES[slow.station],
    minutes: slow.minutes,
    count: stationCount(state, slow.station),
  };
}

export interface SoupStage {
  station: StationId;
  /** 工序名（爆香 / 吊骨汤 / 冲汤下粉） */
  step: string;
  /** 站名（炒锅 / 汤锅 / 粉篓） */
  name: string;
  /** 这一段一碗要几分钟 */
  minutes: number;
  /** 这一站有几口（粉篓论筒） */
  count: number;
  /** 是不是眼下最慢的那一段 */
  slow: boolean;
}

/**
 * 三段全列（解 P408：AC′ 只指了最慢那一段，另外两段卡了也看不出来）。
 *
 * 顺带解 P409：配方页与设备页原来各说一半 —— 配方页说「最吃手的是爆香」，
 * 设备页说「炒锅 1.6 分/1」，两张嘴。现在两页都调 `soupStagesWords`，
 * 一处写、两处读，字面一模一样。
 */
export function soupStages(state: GameState): SoupStage[] {
  const st = stageMinutes(state);
  const slow = slowestStation(state);
  return STATION_ORDER.map((k) => ({
    station: k,
    step: STEP_BY_STATION[k],
    name: STATION_NAMES[k],
    minutes: st[k],
    count: stationCount(state, k),
    slow: k === slow.station,
  }));
}

const STAGE_UNIT: Record<StationId, string> = { wok: "口", pot: "口", basket: "筒" };

/** 一句人话：三段全列 + 末尾点名卡在哪一段；不劝买什么 */
/**
 * 挂汤那句该带着什么料（批 AH′，解 P405）。
 *
 * 原来写死 `{ 汤: "挂得住", 嘴: "黏" }` —— 模型只知道「稠」，不知道垫底的是猪脚卤水，
 * 也不知道今天这碗多不多，出来的一律是同一句「这汤厚得挂勺」。
 * 这里按当天真发生的事给料：哪一味垫底、多少碗走了这条路、当天口碑在什么档。
 * **一个数字都不给** —— 服务端 `CN_QUANTITY` 会把带数量词的整句丢掉。
 */
export function thickContext(state: GameState): Record<string, string> {
  const bowls = Math.max(0, Math.round(state.dayReport?.thick ?? 0));
  const served = Math.max(1, Math.round(state.dayReport?.served ?? bowls));
  const share = bowls / served;
  const much =
    share >= 0.6 ? "大半碗都走的这条路" : share >= 0.3 ? "有几碗走这条路" : "只出了一两碗";
  const taste = state.dayReport?.taste ?? 0;
  const mouth = taste >= 70 ? "回头客说这口味正" : taste >= 45 ? "客人吃得下" : "有人说口重了";
  return {
    底: "猪脚卤水",
    汤: "挂得住",
    嘴: "黏",
    多: much,
    味: mouth,
  };
}

export function soupStagesWords(state: GameState): string {
  const rows = soupStages(state);
  const parts = rows.map(
    (r) => `${r.step} ${r.count} ${STAGE_UNIT[r.station]} ${r.minutes.toFixed(1)} 分`,
  );
  const slow = rows.find((r) => r.slow);
  return `${parts.join(" · ")} —— 卡在「${slow ? slow.step : "出碗"}」`;
}

/** 三底里还没解锁的那几档，写一句「还差几位客人」 */
export function soupBaseLockWords(state: GameState): string {
  const locked = soupBaseViews(state).filter((v) => !v.unlocked);
  if (locked.length === 0) return "三底都开得了";
  return locked.map((v) => `${v.def.name}还差 ${v.short} 位`).join("、");
}

export { DEFAULT_SOUP_BASE };
