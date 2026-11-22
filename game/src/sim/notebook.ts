/**
 * 阿婆的笔记本：解锁判定（批次八）。
 *
 * 设计要点：**不新建一套进度系统**。所有解锁信号都来自玩家已经在做的事
 * （换粉、配料、汤寡了、亏了、动价签、口碑掉了），在这里汇总成一个 `NoteEvent`，
 * 谁手里有信号谁就调一次 `noteTick`。
 *
 * 为什么不给每条笔记一个 `if` 埋在各自的模块里：那样十二个条件散在八个文件，
 * 以后想加一条就得翻遍全工程。**条件表只在这一处**。
 *
 * 存档：只用一个可选数组 `flow.notes`（已解锁的 id）+ `flow.noodleTried`
 * （换过哪些粉，用来数「三种都上过手」），**不升 SAVE_VERSION** —— 老档读进来
 * 这两格是 undefined，按空处理，玩家继续玩就会从当前进度开始记。
 */

import { NOTES, NOTE_BY_ID, NOTE_TOTAL, noteById, notesOfGroup, type NoteDef, type NoteGroup } from "../data/notebook";
import type { GameState } from "./state";

/** 一次观察到的信号。谁有什么就给什么，缺的字段当「这次没这条信息」。 */
export interface NoteEvent {
  /** 这一碗用的粉型 */
  noodle?: string;
  /** 换过几种粉（含当前这种） */
  noodlesTried?: number;
  /** 这一碗的汤分 */
  soup?: number;
  /** 这一碗的配料 id */
  toppings?: readonly string[];
  /** 现在一碗要几分钟 */
  serveMinutes?: number;
  /** 当天流失率 0–1（只在客流够看时传） */
  lostRate?: number;
  /** 上月净利（负数是亏） */
  monthProfit?: number;
  /** 这一次动了价签 */
  priceChanged?: boolean;
  /** 换过骨档 */
  boneChanged?: boolean;
  /** 现在口碑 */
  reputation?: number;
}

/**
 * 十二条解锁条件（顺序与 `NOTES` 一致，测试会锁）。
 * 全是「发生过一次就够」，不累计、不回退。
 */
const TRIGGERS: Readonly<Record<string, (ev: NoteEvent) => boolean>> = {
  n_thick: (ev) => (ev.noodlesTried ?? 0) >= 1,
  n_wide: (ev) => (ev.noodlesTried ?? 0) >= 2,
  n_dry: (ev) => ev.noodle === "dry",
  n_soak: (ev) => (ev.serveMinutes ?? 0) >= 3.5,
  s_sour: (ev) => (ev.toppings?.length ?? 0) >= 1,
  s_douchi: (ev) => {
    const t = ev.toppings ?? [];
    return t.includes("top.sourbamboo") && t.includes("top.douchi");
  },
  s_boil: (ev) => (ev.soup ?? 100) < 50,
  s_bone: (ev) => ev.boneChanged === true,
  p_cost: (ev) => (ev.monthProfit ?? 0) < 0,
  p_seat: (ev) => (ev.lostRate ?? 0) > 0.5,
  p_price: (ev) => ev.priceChanged === true,
  p_keep: (ev) => (ev.reputation ?? 5) < 3,
};

/** 已解锁的 id（老档没有这一格时按空） */
export function noteIds(state: GameState): string[] {
  const raw = state.flow.notes;
  return Array.isArray(raw) ? raw.filter((id) => NOTE_BY_ID.has(id)) : [];
}

export function hasNote(state: GameState, id: string): boolean {
  return noteIds(state).includes(id);
}

/** 换过哪些粉（去重，老档按空） */
export function noodleTried(state: GameState): string[] {
  const raw = state.flow.noodleTried;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
}

/** 记下一种粉，返回累计换过几种 */
export function rememberNoodle(state: GameState, noodle: string): number {
  const tried = noodleTried(state);
  if (!tried.includes(noodle)) tried.push(noodle);
  state.flow.noodleTried = tried;
  return tried.length;
}

/**
 * 观察一次信号，把新解锁的条目记进存档，并留下「最近解锁的那条」让界面去弹。
 * 返回这一次新解锁的 id 列表（通常 0 或 1 条）。
 */
export function noteTick(state: GameState, ev: NoteEvent): string[] {
  const fresh: string[] = [];
  const known = noteIds(state);
  for (const def of NOTES) {
    if (known.includes(def.id)) continue;
    const trigger = TRIGGERS[def.id];
    if (!trigger || !trigger(ev)) continue;
    fresh.push(def.id);
  }
  if (fresh.length === 0) return fresh;
  state.flow.notes = [...known, ...fresh];
  // 一次只弹一条：册子翻一页就够，一次弹三条会盖住打烊单
  state.flow.lastNote = fresh[0] ?? null;
  return fresh;
}

export interface NoteView {
  def: NoteDef;
  unlocked: boolean;
}

export function noteViews(state: GameState): NoteView[] {
  const known = noteIds(state);
  return NOTES.map((def) => ({ def, unlocked: known.includes(def.id) }));
}

export function noteViewsOf(state: GameState, group: NoteGroup): NoteView[] {
  const known = noteIds(state);
  return notesOfGroup(group).map((def) => ({ def, unlocked: known.includes(def.id) }));
}

/** 「已记 三条 / 12 条」—— 中文数字，不用阿拉伯数字，册子不该有报表味 */
export function noteSummary(state: GameState): string {
  const n = noteIds(state).length;
  return `已记 ${n} / ${NOTE_TOTAL} 条`;
}

/** 下一条还没解开的（按册子顺序），全记满时 null */
export function nextNote(state: GameState): NoteDef | null {
  const known = noteIds(state);
  return NOTES.find((def) => !known.includes(def.id)) ?? null;
}

/** 解锁那一刻给模型的名词（只有事与类别，不给数值） */
export function noteVoiceContext(def: NoteDef): Record<string, string> {
  const group = def.group === "noodle" ? "粉" : def.group === "soup" ? "汤" : "店";
  return { 事: def.title, 类: group, 话: def.body };
}

export { noteById };
