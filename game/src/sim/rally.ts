import { RALLIES, rallyById, type RallyDef } from "../data/rally";
import { dayIndex } from "./calendar";
import { favorOf } from "./favor";
import type { GameState, StaffMember } from "./state";

/**
 * 店员劝留（批 V′）。
 *
 * 原来只有一条路：体力到顶 → 第二天自己走。玩家连一句挽留都说不出口，
 * 而开罗的 `rally` 表 54 行全是「店员开口要东西，玩家当场答复」。
 *
 * 现在：**第一次到顶不立刻走人**，先在 `state.staff.rally` 挂一次，
 * 玩家选一条路（人情 / 加薪 / 放假）。劝过之后如果第二天还是顶到门槛，
 * 那就是真的留不住 —— 走人（不给无限续命）。
 *
 * 读的都是可选字段，老档没有就当没闹过，不升存档版本。
 */

export interface RallyView {
  def: RallyDef;
  /** 这条路的实际价钱（加薪那条按日薪算出来） */
  costText: string;
  affordable: boolean;
  reason: string;
}

/** 正在闹的那位（没有就是 null）。 */
export function rallyMember(state: GameState): StaffMember | null {
  const box = state.staff.rally;
  if (!box) return null;
  const m = state.staff.roster.find((x) => x.uid === box.uid);
  if (!m) {
    state.staff.rally = undefined;
    return null;
  }
  return m;
}

export function rallyRaiseCash(m: StaffMember): number {
  return Math.round(m.wage * 3);
}

export function rallyViews(state: GameState): RallyView[] {
  const m = rallyMember(state);
  if (!m) return [];
  return RALLIES.map((def) => {
    if (def.favor !== undefined) {
      const left = Math.floor(favorOf(state));
      return {
        def,
        costText: `人情 ${def.favor} 点`,
        affordable: left >= def.favor,
        reason: left >= def.favor ? `现有 ${left} 点` : `人情还差 ${def.favor - left} 点`,
      };
    }
    if (def.cashMult !== undefined) {
      const cash = rallyRaiseCash(m);
      return {
        def,
        costText: `¥${cash}，日薪 +${Math.round((def.wagePct ?? 0) * 100)}%`,
        affordable: state.cash >= cash,
        reason: state.cash >= cash ? `日薪跟着涨` : `还差 ¥${cash - Math.round(state.cash)}`,
      };
    }
    return {
      def,
      costText: "两天少一个人",
      affordable: !m.resting,
      reason: m.resting ? "他已经在歇了" : "出碗会慢一点",
    };
  });
}

export interface RallyResult {
  ok: boolean;
  line: string;
  reason: string;
}

/** 玩家选了一条路。不合法（没钱/没到）什么都不改，只回理由。 */
export function resolveRally(state: GameState, id: string): RallyResult {
  const m = rallyMember(state);
  if (!m) return { ok: false, line: "", reason: "现在没人闹" };
  const def = rallyById(id);
  if (!def) return { ok: false, line: "", reason: "没有这条路" };
  const view = rallyViews(state).find((v) => v.def.id === def.id);
  if (view && !view.affordable) return { ok: false, line: "", reason: view.reason };

  if (def.favor !== undefined) {
    state.favor = Math.max(0, favorOf(state) - def.favor);
  }
  if (def.cashMult !== undefined) {
    state.cash -= rallyRaiseCash(m);
    const pct = def.wagePct ?? 0;
    m.wage = Math.round(m.wage * (1 + pct));
  }
  if (def.id === "rest") m.resting = true;

  m.fatigue = Math.max(0, m.fatigue - def.relief);
  m.ralliedAt = dayIndex(state.month, state.day);
  state.staff.rally = undefined;
  state.staff.lastEvent = `${m.name} 留下了：${def.name}`;
  return { ok: true, line: `「${def.line.replace(/^「|」$/g, "")}」 ${m.name} 留下了。`, reason: "" };
}

/**
 * 日结时给「顶到门槛」的人一次机会。
 *
 * 返回要真走的那几位。**不能劝第二次**：`ralliedAt` 等于今天或昨天还顶在门槛上，
 * 那就说明话已经说过了，人还是留不住 —— 这时候走，玩家心里有数。
 */
export function rallyCheck(state: GameState, quitAt: number, today: number): StaffMember[] {
  const leaving: StaffMember[] = [];
  for (const m of state.staff.roster) {
    if (m.fatigue < quitAt) continue;
    /**
     * 挂着没人答话也算数：昨天挂的那次到今天还没选，人就自己走了。
     * 不然「闹一次 → 玩家不管 → 明天还闹」就是无限续命。
     */
    const open = state.staff.rally;
    if (open && open.uid === m.uid && open.at < today) {
      leaving.push(m);
      continue;
    }
    const last = m.ralliedAt;
    if (last !== undefined && today - last <= 1) {
      leaving.push(m);
      continue;
    }
    // 第一次到顶：先挂一次，疲劳卡在门槛上不继续涨
    m.fatigue = quitAt;
    if (!state.staff.rally) state.staff.rally = { uid: m.uid, at: today };
  }
  return leaving;
}

/** 有人在闹时打烊单/HUD 用的那一句。 */
export function rallyWords(state: GameState): string {
  const m = rallyMember(state);
  if (!m) return "";
  return `${m.name} 撑不住了，问你要句话`;
}
