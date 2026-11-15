import {
  NOODLES,
  NOODLE_BY_ID,
  START_NOODLE,
  noodleById,
  seasonOf,
  type NoodleDef,
  type NoodleId,
  type SeasonId,
} from "../data/noodles";
import type { GameState, SoupParams } from "./state";

export interface NoodleView {
  def: NoodleDef;
  on: boolean;
  unlocked: boolean;
  short: number;
  /** 当季 = 1.15、反季 = 0.85、全年 = 1 */
  seasonFactor: number;
  /** 当前汤底下的契合度 0–100 */
  fit: number;
  inSeason: boolean;
}

export function noodleKindOf(state: GameState): NoodleId {
  const id = state.noodle;
  return id && NOODLE_BY_ID.has(id) ? (id as NoodleId) : START_NOODLE;
}

export function noodleUnlocked(state: GameState, id: string): boolean {
  const def = noodleById(id);
  if (!def) return false;
  return state.totalCustomers >= def.needCustomers;
}

export function currentSeason(state: GameState): SeasonId | null {
  return seasonOf(state.month);
}

function seasonFactorOf(state: GameState, def: NoodleDef): number {
  if (!def.season) return 1;
  const s = currentSeason(state);
  if (!s) return 1;
  return s === def.season ? 1.15 : 0.85;
}

/**
 * 粉型 × 汤 的契合度（对应 REA `soupaffinity` 的协同矩阵）。
 *
 * 切粉恒 100 —— 它是基准，这样所有既有回归锁（分数、测试）在默认粉型下不变。
 * 关键：契合度可以超过 100（上限 125）。100 是「切粉，谁都能吃」，
 * 125 是「这锅汤正好是它的菜」—— 否则切粉永远最优，玩家没有理由换粉。
 */
export function noodleFit(kind: NoodleId, soup: SoupParams): number {
  const [sour, douchi, depth, salt, umami, chili, garlic] = soup;
  switch (kind) {
    case "flat":
      return 100;
    case "round":
      // 圆粉吸汤少：汤淡（咸/鲜不够）就没味
      return clamp(90 + (salt - 45) * 0.8 + (umami - 50) * 0.6);
    case "yifu":
      // 伊面吸汤猛：汤厚才不寡
      return clamp(50 + depth * 0.9);
    case "wetchow":
      // 碱水压酸：酸太猛会打架；配辣反而顺
      return clamp(92 - Math.max(0, sour - 60) * 1.2 + Math.max(0, chili - 40) * 0.4);
    case "dry":
      // 干捞没汤：全靠豆豉与辣提味，咸一点才对
      return clamp(80 + (douchi - 50) * 0.7 + (chili - 45) * 0.5 + (salt - 45) * 0.4);
    case "claypot":
      // 砂锅汤要浓、蒜要香
      return clamp(55 + depth * 0.6 + garlic * 0.4);
    default:
      return 100;
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(125, Math.round(v)));
}

export function noodleFitOf(state: GameState): number {
  return noodleFit(noodleKindOf(state), state.recipe.soup);
}

/** 出碗时间系数：伊面要过油、砂锅要现煮 */
export function noodleServeFactor(state: GameState): number {
  return noodleById(noodleKindOf(state))?.serveFactor ?? 1;
}

/** 一碗粉本身的成本系数 */
export function noodleCostFactor(state: GameState): number {
  return noodleById(noodleKindOf(state))?.costFactor ?? 1;
}

/** 当季满意度加成（干捞夏天 +3、砂锅冬天 +3；反季 −3） */
export function noodleSeasonBonus(state: GameState): number {
  const def = noodleById(noodleKindOf(state));
  if (!def?.season) return 0;
  const f = seasonFactorOf(state, def);
  if (f > 1) return 3;
  if (f < 1) return -3;
  return 0;
}

export interface SwitchResult {
  ok: boolean;
  reason?: string;
}

export function setNoodleKind(state: GameState, id: string): SwitchResult {
  const def = noodleById(id);
  if (!def) return { ok: false, reason: "没有这种粉" };
  if (!noodleUnlocked(state, id)) {
    return {
      ok: false,
      reason: `还差 ${def.needCustomers - state.totalCustomers} 位客人`,
    };
  }
  state.noodle = def.id;
  return { ok: true };
}

export function noodleViews(state: GameState): NoodleView[] {
  const cur = noodleKindOf(state);
  return NOODLES.map((def) => ({
    def,
    on: def.id === cur,
    unlocked: noodleUnlocked(state, def.id),
    short: Math.max(0, def.needCustomers - state.totalCustomers),
    seasonFactor: seasonFactorOf(state, def),
    fit: noodleFit(def.id, state.recipe.soup),
    inSeason: !!def.season && def.season === currentSeason(state),
  }));
}

/** 面板摘要：现在卖什么粉 */
export function noodleSummary(state: GameState): string {
  const def = noodleById(noodleKindOf(state));
  const fit = noodleFitOf(state);
  const tail = def?.season
    ? seasonFactorOf(state, def) > 1
      ? " · 当季"
      : seasonFactorOf(state, def) < 1
        ? " · 反季"
        : ""
    : "";
  return `${def?.name ?? "切粉"} · 契合 ${fit}%${tail}`;
}
