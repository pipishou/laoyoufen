/**
 * 分店经营（S6）—— 照开罗的「主店 + 别处买店」节奏。
 *
 * 三条规则（都是为了让它成为**引擎**而不是白给的钱）：
 * 1. **门槛**：第 10 段才准开第一家（对齐 `rank.txt` 的 Buy Small Shop），
 *    大店/旗舰店还要第 11 段，而且最多 4 家。
 * 2. **口碑要养**：新店 `warmth` 从 0.45 起，每天 +0.03，约 18 天养满；
 *    没养熟之前它只能做一半的碗。这是「开新店第一个月不赚钱」的来源。
 * 3. **同区会互相抢客**：一个区县的客流池是固定的，同区第 N 家分到的池子要除以 N。
 *    所以在兴宁连开四家大店是亏的，得去青秀/江南这种池子大的区。
 *
 * 日结（`runBranchDay`）在 `recordDay` 里调，月结（`branchMonthlyCost`）在 `closeMonth` 里扣。
 */
import { BOWL } from "../data/anchors";
import {
  BRANCH_TRAFFIC_SHARE,
  BRANCH_SIZES,
  MAX_BRANCHES,
  MANAGER_MONTHLY,
  branchSizeById,
  monthNetOf,
  paybackMonthsOf,
  type BranchSizeDef,
  type BranchSizeId,
} from "../data/branches";
import { districtNameOf, findDistrict } from "../data/nanning";
import { demandCapAtFullEnergy } from "./district";
import type { GameState } from "./state";

/** 新店刚开张的口碑系数（最高 1.0） */
export const BRANCH_WARMTH_START = 0.45;
/** 每天养多少口碑 */
export const BRANCH_WARMTH_STEP = 0.03;

export interface BranchState {
  /** 稳定 id：`b<序号>`，关店不复用 */
  id: string;
  /** 所在区县（`data/nanning.ts` 的 DistrictId） */
  district: string;
  /** 店面档位 */
  size: string;
  /** 开业时是第几个月（0 基） */
  since: number;
  /** 口碑 0.45 → 1 */
  warmth: number;
  /** 累计卖出碗数（统计用） */
  bowlsTotal: number;
}

export interface BranchView {
  branch: BranchState;
  def: BranchSizeDef;
  districtName: string;
  /** 今天预计能卖多少碗 */
  dayBowls: number;
  /** 这份店一个月大概的净利（按当前口碑折算） */
  monthNet: number;
  /** 关店能退多少（转让费不退，只退半个月租的押金） */
  refundYuan: number;
}

export interface BranchOpenResult {
  ok: boolean;
  reason?: string;
  branch?: BranchState;
}

export interface BranchDayResult {
  /** 分店今天一共做了多少碗 */
  bowls: number;
  /** 分店今天的毛营收 */
  revenue: number;
  /** 分店的料钱 */
  cost: number;
  /** 净进账（revenue − cost） */
  net: number;
  /** 今天有没有分店在营 */
  active: boolean;
}

export function branchCount(state: GameState): number {
  return state.branches.length;
}

/** 同区已有几家（含当前这家自己） */
function sameDistrictCount(state: GameState, district: string): number {
  return state.branches.filter((b) => b.district === district).length;
}

/**
 * 这家店今天的碗数：`min(店的产能, 该区能分到的客流) × 口碑系数`。
 * 池子按「同区店数」均分 —— 同区第二家只能拿一半的新客。
 */
export function branchDayBowls(state: GameState, branch: BranchState): number {
  const def = branchSizeById(branch.size);
  if (!def) return 0;
  const pool = demandCapAtFullEnergy(branch.district) * BRANCH_TRAFFIC_SHARE;
  const rivals = Math.max(1, sameDistrictCount(state, branch.district));
  const reachable = pool / rivals;
  const cap = Math.max(0, Math.round(Math.min(def.dayBowls, reachable)));
  return Math.round(cap * branch.warmth);
}

/** 这家店按当前口碑一个月大概净赚多少（满月 30 天估） */
function monthNetOfBranch(state: GameState, branch: BranchState): number {
  const def = branchSizeById(branch.size);
  if (!def) return 0;
  return Math.round(branchDayBowls(state, branch) * 30 * BOWL.marginYuan) - def.rentMonthly - MANAGER_MONTHLY;
}

export function branchViews(state: GameState): BranchView[] {
  return state.branches.map((branch) => {
    const def = branchSizeById(branch.size);
    return {
      branch,
      def: def!,
      districtName: districtNameOf(branch.district),
      dayBowls: branchDayBowls(state, branch),
      monthNet: monthNetOfBranch(state, branch),
      refundYuan: def ? Math.round(def.rentMonthly / 2) : 0,
    };
  });
}

/** 分店的月固定成本：房租 + 店长工资（不含料钱，料钱在日结里按碗扣） */
export function branchMonthlyCost(state: GameState): number {
  return state.branches.reduce((sum, b) => {
    const def = branchSizeById(b.size);
    return sum + (def ? def.rentMonthly : 0) + MANAGER_MONTHLY;
  }, 0);
}

/** 分店每天固定的一部分（房租与店长工资摊到 30 天），日结时一起扣，账才平 */
function branchDailyOverhead(state: GameState): number {
  return Math.round(branchMonthlyCost(state) / 30);
}

export function canOpenBranch(
  state: GameState,
  district: string,
  sizeId: BranchSizeId | string
): { ok: boolean; reason?: string; def?: BranchSizeDef } {
  const def = branchSizeById(sizeId);
  if (!def) return { ok: false, reason: "没有这种店面" };
  if (state.branches.length >= MAX_BRANCHES) {
    return { ok: false, reason: `最多开 ${MAX_BRANCHES} 家分店，先把不赚钱的关掉`, def };
  }
  if (state.gradeLevel < def.minGrade) {
    return {
      ok: false,
      reason: `要评到第 ${def.minGrade} 段才准开分店（现在第 ${state.gradeLevel} 段）`,
      def,
    };
  }
  if (!findDistrict(district)) return { ok: false, reason: "没有这个区", def };
  if (state.cash < def.openFeeYuan) {
    return {
      ok: false,
      reason: `转让费还差 ¥${Math.round(def.openFeeYuan - state.cash).toLocaleString("zh-CN")}`,
      def,
    };
  }
  // 判「这个区养不养得活」要按养熟之后（口碑 100%）算，不能按开张那天的 45% ——
  // 否则每家新店第一月都亏，等于永远开不了（第一版就是这么写的）。
  if (monthNetOfBranch(state, { id: "x", district, size: def.id, since: 0, warmth: 1, bowlsTotal: 0 }) < 0) {
    return { ok: false, reason: "这个区分到的客人太少，这家店开不活", def };
  }
  return { ok: true, def };
}

export function openBranch(
  state: GameState,
  district: string,
  sizeId: BranchSizeId | string
): BranchOpenResult {
  const check = canOpenBranch(state, district, sizeId);
  if (!check.ok || !check.def) return { ok: false, reason: check.reason };
  const def = check.def;
  state.cash -= def.openFeeYuan;
  const seq = state.branches.length + 1;
  const branch: BranchState = {
    id: `b${seq}`,
    district,
    size: def.id,
    since: state.month,
    warmth: BRANCH_WARMTH_START,
    bowlsTotal: 0,
  };
  state.branches.push(branch);
  return { ok: true, branch };
}

export function closeBranch(state: GameState, id: string): { ok: boolean; reason?: string; refund?: number } {
  const idx = state.branches.findIndex((b) => b.id === id);
  if (idx < 0) return { ok: false, reason: "没有这家分店" };
  const branch = state.branches[idx]!;
  const def = branchSizeById(branch.size);
  const refund = def ? Math.round(def.rentMonthly / 2) : 0;
  state.branches.splice(idx, 1);
  state.cash += refund;
  return { ok: true, refund };
}

/**
 * 日结：每家分店做自己那份碗、进账、涨口碑。
 * 由 `recordDay` 调（在写日结单之前），这样日结单与账本都能看到分店那一行。
 */
export function runBranchDay(state: GameState): BranchDayResult {
  const empty: BranchDayResult = { bowls: 0, revenue: 0, cost: 0, net: 0, active: false };
  if (state.branches.length === 0) return empty;

  const overhead = branchDailyOverhead(state);
  let bowls = 0;
  for (const branch of state.branches) {
    const made = branchDayBowls(state, branch);
    branch.bowlsTotal += made;
    branch.warmth = Math.min(1, Math.round((branch.warmth + BRANCH_WARMTH_STEP) * 1000) / 1000);
    bowls += made;
  }
  const revenue = Math.round(bowls * state.price * 0.9); // 分店按主店价牌打九折（店长自己让价）
  const cost = Math.round(bowls * BOWL.costYuan) + overhead;

  state.cash += revenue - cost;
  state.monthRevenue += revenue;
  state.flow.revenueToday += revenue;
  // 分店的碗记在 branchBowls 里：主店的 tally.bowls / totalCustomers 只算走进门的人，
  // 否则月报的 customers 与累计碗数对不上（测试员 T7）。
  state.tally.branchBowls += bowls;

  return { bowls, revenue, cost, net: revenue - cost, active: true };
}

export function branchSummary(state: GameState): string {
  if (state.branches.length === 0) return "还没开分店";
  const rows = branchViews(state);
  const bowls = rows.reduce((s, r) => s + r.dayBowls, 0);
  const net = rows.reduce((s, r) => s + r.monthNet, 0);
  const names = rows.map((r) => `${r.districtName}·${r.def.name}`).join("、");
  return `${rows.length} 家（${names}）· 今天约 ${bowls} 碗 · 一个月约 ${net >= 0 ? "+" : ""}¥${net.toLocaleString("zh-CN")}`;
}

/** 分店档位表（给 UI 用，带「能不能开」的判断） */
export function branchSizeOptions(state: GameState): {
  def: BranchSizeDef;
  locked: boolean;
  short: string;
  monthNet: number;
  payback: number;
}[] {
  return BRANCH_SIZES.map((def) => ({
    def,
    locked: state.gradeLevel < def.minGrade,
    short: state.gradeLevel < def.minGrade ? `还差 ${def.minGrade - state.gradeLevel} 段` : "",
    monthNet: monthNetOf(def),
    payback: paybackMonthsOf(def),
  }));
}
