/**
 * 「明天做点什么」—— 打烊单底部那一行（P69 / 账本行 50 的方案 A3；P70 的产能引导）。
 *
 * 为什么需要这一行：试玩报告里两个真人都在第 2 天打烊后就没再开第三天。
 * 他们不是被难度劝退 —— 是**当天结算完，不知道该期待什么**。
 * 开罗不会让人空手打烊：rank 条永远差一点点、街区永远有个东西能修、
 * 明天永远有人要来。我们缺的不是内容，是「明天」这个念头。
 *
 * 规则四条：
 * 1. **数字与规则在本地**：这一行里的「¥8,000」「32 位」全部由本地算；
 *    隔壁 `ai/lines.ts` 只负责给它配一句口吻（不含任何数字），AI 挂了也不影响这条钩子的对错。
 * 2. **只挑一件**，按「离达成最近」排序 —— 一天给五个目标等于没有目标。
 * 3. **产能优先于段位**：当天流失超过 45% 时，段位评了也接不住客，
 *    先把「灶台 / 座位 / 案台」摆到第一位（P70 的病灶就在这里）。
 * 4. 说不出话就给 `kind: "none"`（宁可不显示，也不许编一个玩家做不到的期待）。
 */

import type { GameState } from "./state";
import { checkGrade } from "./grade";
import { arenaViews } from "./arena";
import { gearViews } from "./gear";
import { streetViews } from "./streets";
import { EQUIPMENT, MAX_EQUIP_LEVEL } from "../data/equipment";
import { equipLevel, equipNextCost } from "./equipment";
import { expansionNextCost, nextExpansion } from "./expansion";

/** 元 → 「¥4,000」（sim 层不 import UI 的格式化函数，避免依赖方向倒过来） */
const yuan = (n: number): string => `¥${n.toLocaleString("zh-CN")}`;

/**
 * 差多少客人以内才值得当「明天」的目标。
 * 80 接近一天的量：说「明天再来 300 位客人」不是钩子，是废话。
 */
const HOOK_CUSTOMER_GAP = 80;

/**
 * 当天流失到这个比例，就认为「产能跟不上需求」。
 * 0.45 略高于试玩里「站住了」的那条线（0.3），刚好卡在 D2 起爬升的位置。
 */
export const CAPACITY_LOST_RATE = 0.45;

export type HookKind = "capacity" | "grade" | "gear" | "street" | "arena" | "none";

export interface HookPlan {
  /** 打烊单上那一行字（含本地算出的数字） */
  text: string;
  kind: HookKind;
  /** 给 AI 那条口吻用的稳定键：只用名词 + 种类，不含数字 */
  key: string;
  /** 高：今天已经吃亏了，明天必须先处理 */
  urgency: "high" | "normal";
}

/**
 * 今天的流失率：走掉的人 / （走掉 + 坐下吃到）。
 * 优先读打烊单快照（`endDay` 会把 `flow.lostToday` 清零），没有快照就读实时计数。
 */
export function lostRateOf(state: GameState): number {
  const rep = state.dayReport;
  const lost = rep ? rep.lost : state.flow.lostToday;
  const served = rep ? rep.served : state.flow.servedToday;
  const visited = lost + served;
  if (visited <= 0) return 0;
  return lost / visited;
}

/** 最便宜的一件「能把人接住」的东西：设备下一档，或下一档扩建 */
function capacityPick(state: GameState): { what: string; cost: number } | null {
  const picks: { what: string; cost: number }[] = [];
  for (const eq of EQUIPMENT) {
    const lv = equipLevel(state, eq.id);
    if (lv < MAX_EQUIP_LEVEL) picks.push({ what: `${eq.name}（第 ${lv + 1} 档）`, cost: equipNextCost(state, eq.id) });
  }
  const ex = nextExpansion(state);
  if (ex) picks.push({ what: ex.name, cost: expansionNextCost(state) });
  return picks.sort((a, b) => a.cost - b.cost)[0] ?? null;
}

/** 明天的期待：文字 + 种类 + 口吻键；没有就给 kind "none" */
export function nextHook(state: GameState): HookPlan {
  // ⓪ 产能：今天走掉太多人时，这是唯一值得提的事（P70）
  const lostRate = lostRateOf(state);
  if (lostRate >= CAPACITY_LOST_RATE) {
    const pick = capacityPick(state);
    const lost = state.dayReport ? state.dayReport.lost : state.flow.lostToday;
    if (pick) {
      const head = state.cash >= pick.cost ? `明天先把「${pick.what}」加上` : `明天卖了钱先添「${pick.what}」`;
      return {
        text: `${head}（${yuan(pick.cost)}）—— 今天走了 ${lost} 位`,
        kind: "capacity",
        key: "capacity",
        urgency: "high",
      };
    }
  }

  // ① 段位：唯一「一次性换阶段」的目标
  const g = checkGrade(state);
  if (g.next) {
    const key = `grade:${g.next.level}`;
    if (g.ready) return { text: `明天去评「${g.next.title}」，交 ${yuan(g.next.feeYuan)}`, kind: "grade", key, urgency: "normal" };
    if (g.shortCustomers > 0 && g.shortCustomers <= HOOK_CUSTOMER_GAP) {
      return {
        text: `明天再来 ${g.shortCustomers} 位客人，就能评「${g.next.title}」`,
        kind: "grade",
        key,
        urgency: "normal",
      };
    }
    if (g.shortCustomers === 0 && g.shortCash > 0) {
      return {
        text: `明天把钱凑到 ${yuan(g.next.feeYuan)}，就能评「${g.next.title}」`,
        kind: "grade",
        key,
        urgency: "normal",
      };
    }
  }

  // ② 家当：便宜、当天见效，新手第一笔「花出去的钱」
  const gear = gearViews(state).find((v) => !v.owned && v.affordable);
  if (gear) {
    return {
      text: `明天添一件「${gear.def.name}」（${yuan(gear.def.costYuan)}）`,
      kind: "gear",
      key: `gear:${gear.def.id}`,
      urgency: "normal",
    };
  }

  // ③ 街面：买不起也给一句，让人知道街上还有东西可修
  const street = streetViews(state).find((v) => !v.built && v.affordable);
  if (street) {
    return {
      text: `明天修「${street.def.name}」（${yuan(street.def.costYuan)}）`,
      kind: "street",
      key: `street:${street.def.id}`,
      urgency: "normal",
    };
  }

  // ④ 落场：一天一场，能打就提
  const arena = arenaViews(state).find((v) => v.open.ok);
  if (arena) {
    return { text: `明天再去落一场（${arena.def.name}）`, kind: "arena", key: `arena:${arena.def.id}`, urgency: "normal" };
  }

  // ⑤ 什么都不缺：给一句「接着做」，不编目标
  return { text: "", kind: "none", key: "none", urgency: "normal" };
}

/** 兼容旧调用：只要那一行字 */
export function nextHookOf(state: GameState): string {
  return nextHook(state).text;
}

/** 给 AI 那条口吻用的键（种类 + 名词，不含数字） */
export function hookVoiceKey(plan: HookPlan): string {
  return plan.kind === "none" ? "none" : plan.key;
}

/**
 * 给 AI 的上下文：**只放名词，不放数字**。
 * 用「灶台与座位」这类店里能看见的东西，避免把「段位」「口碑」这类机制词递过去
 * （服务端 `MECH_WORD` 会拦，但拦在源头更省一次请求）。
 */
const VOICE_HINT: Record<HookKind, string> = {
  capacity: "灶台与座位",
  grade: "门口的招牌",
  gear: "店里的旧家当",
  street: "街上的事",
  arena: "落场",
  none: "",
};

export function hookVoiceContext(plan: HookPlan): Record<string, string> {
  const hint = VOICE_HINT[plan.kind];
  return hint ? { 事: hint } : {};
}
