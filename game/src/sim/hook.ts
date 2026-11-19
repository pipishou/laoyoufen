/**
 * 「明天做点什么」—— 打烊单底部那一行（P69 / 账本行 50 的方案 A3；P70 的产能引导）。
 *
 * 为什么需要这一行：试玩报告里两个真人都在第 2 天打烊后就没再开第三天。
 * 他们不是被难度劝退 —— 是**当天结算完，不知道该期待什么**。
 * 开罗不会让人空手打烊：rank 条永远差一点点、街区永远有个东西能修、
 * 明天永远有人要来。我们缺的不是内容，是「明天」这个念头。
 *
 * 规则五条：
 * 1. **数字与规则在本地**：这一行里的「¥8,000」「32 位」全部由本地算；
 *    隔壁 `ai/lines.ts` 只负责给它配一句口吻（不含任何数字），AI 挂了也不影响这条钩子的对错。
 * 2. **只挑一件**，按「离达成最近」排序 —— 一天给五个目标等于没有目标。
 * 3. **产能优先于段位**：当天流失超过 45% 时，段位评了也接不住客，
 *    先把「灶台 / 座位 / 案台」摆到第一位（P70 的病灶就在这里）。
 * 4. **产能件要真能接客**：粉篓与汤勺降的是单碗成本（一碗省 ¥0.14），对「一天最多出多少碗」
 *    没有任何帮助，所以不参与产能推荐（二轮试玩 F2：四个玩家都被指去买了粉篓，流失一点没降）。
 * 5. **时间前缀只在一处说**：「明天」由 CSS 的 `::before` 加，正文本里不许再出现一次
 *    （二轮试玩 F3：曾出现「明天先处理 · 明天先把…」叠两个明天）。
 */

import type { GameState } from "./state";
import { checkGrade } from "./grade";
import { arenaViews } from "./arena";
import { gearViews } from "./gear";
import { streetViews } from "./streets";
import { EQUIPMENT, MAX_EQUIP_LEVEL, type EquipId } from "../data/equipment";
import { equipLevel, equipNextCost } from "./equipment";
import { expansionLockReason, expansionNextCost, nextExpansion } from "./expansion";

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

/**
 * 判断流失率时至少要看几个人。
 * 营业头几分钟只有两三个人走，那个比例噪声太大，不如接着用昨天的数字。
 */
const MIN_SAMPLE = 5;

/** 座位少于这个数，就认为「坐不下」是第一瓶颈，优先推荐能加座的扩建 */
const SEAT_TIGHT = 4;

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

interface LostSample {
  lost: number;
  served: number;
  /** 0–1 */
  rate: number;
  /**
   * 这份数字是不是「今天」的。
   * true → 打烊单上写「今天走了 N 位」；false → 次日早上写「昨天走了 N 位」。
   */
  live: boolean;
}

function sampleOf(lost: number, served: number, live: boolean): LostSample {
  const visited = lost + served;
  return { lost, served, rate: visited > 0 ? lost / visited : 0, live };
}

/**
 * 最近一份能用的流失数据。
 *
 * 顺序：打烊单快照 → 今天的实时计数（样本够大）→ 昨天那一场。
 * 第三档是二轮试玩 F1 的病灶：玩家点「明天继续」后 `dayReport` 被清空、
 * `flow.lostToday/servedToday` 也归零，于是第二天一早流失率恒为 0，
 * 产能钩子从那天起再也不会出现，店铺页的红标也一次都亮不起来。
 * `state.days` 里存着最近 120 天的记录，直接读末条即可，不用改存档结构。
 */
export function lostSampleOf(state: GameState): LostSample {
  const rep = state.dayReport;
  if (rep) return sampleOf(rep.lost, rep.served, true);

  const liveVisited = state.flow.lostToday + state.flow.servedToday;
  const live = sampleOf(state.flow.lostToday, state.flow.servedToday, true);
  if (liveVisited >= MIN_SAMPLE) return live;

  const days = state.days ?? [];
  const last = days[days.length - 1];
  if (last) return sampleOf(last.lost, last.served, false);

  return live;
}

/**
 * 今天的流失率：走掉的人 / （走掉 + 坐下吃到）。
 * 打烊时看当天，第二天早上看昨天（见 `lostSampleOf`）。
 */
export function lostRateOf(state: GameState): number {
  return lostSampleOf(state).rate;
}

/** 产能件的三六九等：座位 > 出碗速度 > 日上限 > 料钱 */
type CapKind = "seat" | "speed" | "cap" | "cost";

interface CapPick {
  what: string;
  cost: number;
  kind: CapKind;
}

/**
 * 三件设备各自管什么（对应 `data/equipment.ts` 的 `effects`）：
 * 猛火灶＝同样的分钟数能多出几碗；案台＝一天的总量上限；粉篓＝单碗料钱。
 * 只有前两个跟「客人等不到就走了」有关。
 */
const EQUIP_KIND: Record<EquipId, CapKind> = {
  stove: "speed",
  bench: "cap",
  strainer: "cost",
};

/** 一件「真能把人接住」的东西：能加座的扩建，或设备里的出碗/上限件 */
function capacityPick(state: GameState): CapPick | null {
  const picks: CapPick[] = [];

  for (const eq of EQUIPMENT) {
    const lv = equipLevel(state, eq.id);
    if (lv < MAX_EQUIP_LEVEL) {
      picks.push({
        what: `${eq.name}（第 ${lv + 1} 档）`,
        cost: equipNextCost(state, eq.id),
        kind: EQUIP_KIND[eq.id],
      });
    }
  }

  const ex = nextExpansion(state);
  if (ex && !expansionLockReason(state)) {
    picks.push({ what: ex.name, cost: expansionNextCost(state), kind: ex.seats > 0 ? "seat" : "speed" });
  }

  // 先排掉「只省钱」的那类 —— 省钱救不了排队
  const helpful = picks.filter((p) => p.kind !== "cost");
  const pool = helpful.length > 0 ? helpful : picks;
  if (pool.length === 0) return null;

  // 座位紧张时，能加座的那一项优先于任何设备档位
  if (state.venue.seats <= SEAT_TIGHT) {
    const seat = pool.filter((p) => p.kind === "seat").sort((a, b) => a.cost - b.cost)[0];
    if (seat) return seat;
  }

  return pool.sort((a, b) => a.cost - b.cost)[0] ?? null;
}

/** 明天的期待：文字 + 种类 + 口吻键；没有就给 kind "none" */
export function nextHook(state: GameState): HookPlan {
  // ⓪ 产能：今天走掉太多人时，这是唯一值得提的事（P70）
  const sample = lostSampleOf(state);
  if (sample.rate >= CAPACITY_LOST_RATE) {
    const pick = capacityPick(state);
    if (pick) {
      const head = state.cash >= pick.cost ? `先把「${pick.what}」加上` : `卖了钱先添「${pick.what}」`;
      const dayWord = sample.live ? "今天" : "昨天";
      const tail = sample.lost > 0 ? ` —— ${dayWord}走了 ${sample.lost} 位` : "";
      return {
        text: `${head}（${yuan(pick.cost)}）${tail}`,
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
    if (g.ready) return { text: `去评「${g.next.title}」，交 ${yuan(g.next.feeYuan)}`, kind: "grade", key, urgency: "normal" };
    if (g.shortCustomers > 0 && g.shortCustomers <= HOOK_CUSTOMER_GAP) {
      return {
        text: `再来 ${g.shortCustomers} 位客人，就能评「${g.next.title}」`,
        kind: "grade",
        key,
        urgency: "normal",
      };
    }
    if (g.shortCustomers === 0 && g.shortCash > 0) {
      return {
        text: `把钱凑到 ${yuan(g.next.feeYuan)}，就能评「${g.next.title}」`,
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
      text: `添一件「${gear.def.name}」（${yuan(gear.def.costYuan)}）`,
      kind: "gear",
      key: `gear:${gear.def.id}`,
      urgency: "normal",
    };
  }

  // ③ 街面：买不起也给一句，让人知道街上还有东西可修
  const street = streetViews(state).find((v) => !v.built && v.affordable);
  if (street) {
    return {
      text: `修「${street.def.name}」（${yuan(street.def.costYuan)}）`,
      kind: "street",
      key: `street:${street.def.id}`,
      urgency: "normal",
    };
  }

  // ④ 落场：一天一场，能打就提
  const arena = arenaViews(state).find((v) => v.open.ok);
  if (arena) {
    return { text: `再去落一场（${arena.def.name}）`, kind: "arena", key: `arena:${arena.def.id}`, urgency: "normal" };
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
