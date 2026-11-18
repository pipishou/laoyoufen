import { rivalShareOf } from "./rivals";
import type { GameState } from "./state";

/**
 * 「游戏测试员」判据表 —— 把 Claude Code Game Studios 的 QA 结构搬过来，用代码判。
 *
 * 来源：CCGS `.claude/skills/playtest-report/SKILL.md` 的报告骨架
 * （Quantitative Data + Top 3 Priorities）与本体论「四态 verdict」
 * （COMPLETE / COMPLETE WITH NOTES / NOT ASSESSED / BLOCKED），
 * 以及 `.claude/skills/soak-test/SKILL.md` 专抓的四类问题
 * （state accumulation / fun fatigue / content exhaustion / drift）。
 *
 * 本土化：每条判据都尽量挂回开罗拉面店的原文（help.txt），
 * 找不到原文依据的标 `kairo: null`，并写明「本地判断」。
 *
 * 这个文件只读 state、不写 state —— 它是量尺，不是玩家。
 */

export type Verdict = "PASS" | "PASS_WITH_NOTES" | "NOT_ASSESSED" | "BLOCKED";
export type Bucket = "design" | "balance" | "bug" | "polish";
export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  bucket: Bucket;
  severity: Severity;
  title: string;
  evidence: string;
  /** 开罗原文依据；null = 本地判断，没有上游出处 */
  kairo: string | null;
  fix: string | null;
}

export interface Quant {
  months: number;
  avgRevenue: number;
  revenueFirst6: number;
  revenueLast6: number;
  /** 后 6 月 / 前 6 月，1 = 没长 */
  growth: number;
  bowlsPerDay: number;
  lostRate: number;
  avgPrice: number;
  avgSat: number;
  cashEnd: number;
  /** 最长「营收几乎不动」的连续月数（相邻月变化 < 5% 算没动） */
  flatStreak: number;
  contestCount: number;
  championCount: number;
  gradeLevel: number;
  frenzyCount: number;
  /** 加购（加料/饮料）占营业额的比例，0–1 */
  sideShare: number;
  /** 凑出加料组合的次数 */
  comboHits: number;
  /** 菜单里在架的款数（P47） */
  menuCount: number;
  /** 在架却一碗没卖出去的款数（挂了没人点 = 白占菜单位） */
  deadDishCount: number;
  /** 同条街上同行合计抢走这个区多少客（0–0.35，M1） */
  rivalShare: number;
  /** 已经服气的同行家数（M1） */
  pacifiedCount: number;
}

export interface PlaytestReport {
  verdict: Verdict;
  quant: Quant;
  findings: Finding[];
  top3: Finding[];
}

const FLAT_EPS = 0.05;

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * 「无事可做」的连续月数。
 *
 * 只看营收会误判：攒钱准备开分店的那两三个月，营收本来就该不动
 * （钱在往账上堆，玩家在做「什么时候开第二家」的决策）。
 * 所以持平要三个条件同时成立：营收没动、利润没动、也没新开分店。
 */
function flatStreakOf(
  months: readonly { revenue: number; profit: number; branchCost?: number }[],
): number {
  let best = 0;
  let run = 1;
  for (let i = 1; i < months.length; i += 1) {
    const prev = months[i - 1]!;
    const cur = months[i]!;
    const ratio = prev.revenue === 0 ? 1 : Math.abs(cur.revenue - prev.revenue) / prev.revenue;
    const cashMove = Math.abs((cur.profit ?? 0) - (prev.profit ?? 0));
    const cashScale = Math.max(1, Math.abs(prev.revenue) * 0.15);
    const newBranch = (cur.branchCost ?? 0) !== (prev.branchCost ?? 0);
    if (ratio < FLAT_EPS && cashMove < cashScale && !newBranch) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

export function quantOf(s: GameState): Quant {
  const months = s.months;
  const revs = months.map((m) => m.revenue);
  const cust = months.reduce((n, m) => n + m.customers, 0);
  const lost = months.reduce((n, m) => n + m.lost, 0);
  const days = Math.max(1, months.length * 30);
  const records = s.days;
  const priced = records.filter((d) => d.served > 0);
  const sat = months.map((m) => m.avgSat).filter((v) => v > 0);
  const head = revs.slice(0, Math.min(6, revs.length));
  const tail = revs.slice(Math.max(0, revs.length - 6));

  return {
    months: months.length,
    avgRevenue: Math.round(avg(revs)),
    revenueFirst6: Math.round(avg(head)),
    revenueLast6: Math.round(avg(tail)),
    growth: head.length && avg(head) > 0 ? avg(tail) / avg(head) : 0,
    bowlsPerDay: Number((cust / days).toFixed(1)),
    lostRate: cust + lost === 0 ? 0 : Number((lost / (cust + lost)).toFixed(3)),
    avgPrice: priced.length ? Number(avg(priced.map((d) => d.price)).toFixed(1)) : s.price,
    avgSat: Number(avg(sat).toFixed(1)),
    cashEnd: Math.round(s.cash),
    flatStreak: flatStreakOf(months),
    contestCount: s.contest.results.length,
    championCount: s.contest.results.filter((r) => r.rank === 1).length,
    gradeLevel: s.gradeLevel,
    frenzyCount: s.frenzy?.count ?? 0,
    sideShare:
      s.monthRevenue + (s.tally?.sideRevenue ?? 0) > 0
        ? (s.tally?.sideRevenue ?? 0) / (s.monthRevenue + (s.tally?.sideRevenue ?? 0))
        : 0,
    comboHits: s.tally?.comboHits ?? 0,
    menuCount: (s.menu ?? []).filter((d) => d.on).length,
    deadDishCount: (s.menu ?? []).filter((d) => d.on && (d.sold ?? 0) === 0).length,
    rivalShare: rivalShareOf(s),
    pacifiedCount: (s.rivals ?? []).filter((r) => r.pacified).length,
  };
}

function fmtYuan(n: number): string {
  return `¥${Math.round(n).toLocaleString("zh-CN")}`;
}

/**
 * 跑完一局后的体检。判据只回答「这份 36 个月的成绩单是否合格」，
 * 不回答「游戏好玩不好玩」——后者只有真人能答。
 */
export function auditPlaytest(s: GameState): PlaytestReport {
  const q = quantOf(s);
  const out: Finding[] = [];

  // ── 完整性：跑不满 36 个月 → 无法评估（照 CCGS 的 NOT ASSESSED）──
  if (q.months < 36) {
    return {
      verdict: "NOT_ASSESSED",
      quant: q,
      findings: [
        {
          id: "T0",
          bucket: "bug",
          severity: "high",
          title: `只跑完 ${q.months}/36 个月`,
          evidence: `finish 标志 = ${s.finished}，月份记录 ${q.months} 条`,
          kairo: null,
          fix: "先查为什么提前结束（破产？异常？），再谈成绩",
        },
      ],
      top3: [],
    };
  }

  // ── T1 活得下去：期末现金为正，且最后 6 个月月月不亏 ──
  const tailProfit = s.months.slice(-6).map((m) => m.profit);
  const lossMonths = tailProfit.filter((p) => p <= 0).length;
  if (q.cashEnd <= 0 || lossMonths >= 3) {
    out.push({
      id: "T1",
      bucket: "balance",
      severity: "high",
      title: "最后半年在亏钱",
      evidence: `期末现金 ${fmtYuan(q.cashEnd)}，最后 6 个月里 ${lossMonths} 个月利润 ≤ 0`,
      kairo: "开罗没有「破产」这个失败态，但店租与月给是月月要付的（store_data.txt / clerk.txt）",
      fix: "先看是房租、工资还是料钱哪一项压过了毛利",
    });
  }

  // ── T2 有成长：后 6 月营收应该比前 6 月高 ──
  if (q.growth < 1.15) {
    out.push({
      id: "T2",
      bucket: "balance",
      severity: "high",
      title: "三年没有长大",
      evidence: `前 6 月月均 ${fmtYuan(q.revenueFirst6)} → 后 6 月 ${fmtYuan(q.revenueLast6)}（×${q.growth.toFixed(2)}）`,
      kairo: "Grade review 11 级、Region 7 区、trophy 39 条累计目标，都是「越做越大」的通道",
      fix: "看是产能封顶（座位/灶/人手）还是客流池封顶（区能量）",
    });
  }

  // ── T3 中期有决策点（P24）：不能出现「营收连着 4 个月几乎不动」──
  if (q.flatStreak >= 4) {
    out.push({
      id: "T3",
      bucket: "design",
      severity: "high",
      title: `有 ${q.flatStreak} 个月营收几乎不动`,
      evidence: `月营收最长持平段 ${q.flatStreak} 个月（相邻月变化 <5% 算没动）`,
      kairo: "开罗靠三件事撑中期：一年两场比赛（Contests 1）、11 级评定（Grading Tests）、区域能量转移（Sales Areas 2）",
      fix: "检查比赛/段位/换区是否真的在改变可选动作，而不是只改数字",
    });
  }

  // ── T4 内容别早早耗竭：三年至少要打下 4 场、升到 5 段 ──
  if (q.contestCount < 4 || q.gradeLevel < 5) {
    out.push({
      id: "T4",
      bucket: "design",
      severity: "medium",
      title: "中期内容没走完",
      evidence: `比赛 ${q.contestCount} 场（冠军 ${q.championCount}）、段位 ${q.gradeLevel}/11`,
      kairo: "Contests 1「June and December」；Grading Tests「reach the target, go up in rank」",
      fix: "看是门槛太高（钱/人次不够）还是入口没暴露给玩家",
    });
  }

  // ── T5 价格守得住：别掉到南宁主力价以下还回不来 ──
  if (q.avgPrice < 9) {
    out.push({
      id: "T5",
      bucket: "balance",
      severity: "medium",
      title: "均价掉到主力价以下",
      evidence: `成交均价 ${fmtYuan(q.avgPrice)}（南宁老友猪杂粉 10 元、碎肉粉 10 元）`,
      kairo: "开罗的价格是靠 Rarity（拉面售价 +%）往上抬的，不是靠降价换客流",
      fix: "查涨价条件是否太苛刻（满意/流失双闸），或成本曲线是否逼着降价",
    });
  }

  // ── T6 热卖不是白送（P38）──
  if (q.frenzyCount < 10) {
    out.push({
      id: "T6",
      bucket: "polish",
      severity: "low",
      title: "热卖几乎不触发",
      evidence: `三年只热卖 ${q.frenzyCount} 次（要求：有人排队 + 满意达标）`,
      kairo: "Ramen Frenzy 1「a line outside your shop and customers are eating ramen that they like」",
      fix: "看排队时长与满意度是否同时够得着",
    });
  }

  // ── T7 数据卫生（soak 的 state accumulation）：不许 NaN、不许负值、碗数必须单调 ──
  const bad: string[] = [];
  if (!Number.isFinite(q.cashEnd)) bad.push("现金 NaN");
  if (!Number.isFinite(q.bowlsPerDay)) bad.push("日均碗数 NaN");
  const bowls = s.tally.bowls;
  if (!Number.isFinite(bowls) || bowls < 0) bad.push(`累计碗数异常 ${bowls}`);
  const served = s.months.reduce((n, m) => n + m.customers, 0);
  if (bowls > 0 && served > 0 && Math.abs(bowls - served) / Math.max(bowls, served) > 0.02) {
    bad.push(`累计碗数 ${bowls} 与月报客人 ${served} 对不上`);
  }
  if (bad.length > 0) {
    out.push({
      id: "T7",
      bucket: "bug",
      severity: "high",
      title: "账本对不上",
      evidence: bad.join("；"),
      kairo: "开罗月底报数（Ingredients Costs deducted at the beginning of the month）",
      fix: "这类是代码缺陷，不是数值问题，先修再谈平衡",
    });
  }

  // ── T8 顾客满意度：三年平均不该在及格线以下 ──
  if (q.avgSat > 0 && q.avgSat < 60) {
    out.push({
      id: "T8",
      bucket: "polish",
      severity: "low",
      title: "顾客满意偏冷",
      evidence: `三年平均满意度 ${q.avgSat}`,
      kairo: "Customers 1「Taste / Patience / Speed」都会改满意度",
      fix: "看是配方太糙、还是排队太长把满意吃掉了",
    });
  }

  // ── T9 客单价结构：加料/饮料压根没人点 → 功能等于没做（P41）──
  if (q.months >= 6 && q.sideShare < 0.03) {
    out.push({
      id: "T9",
      bucket: "design",
      severity: "medium",
      title: "加料台没被用起来",
      evidence: `三年加购只占营业额 ${(q.sideShare * 100).toFixed(1)}%（组合 ${q.comboHits} 次）`,
      kairo: "Toppings「Toppings also get XP when they are sold individually」＋ Customers 1「钱包是上限」",
      fix: "先看是不是价开太高（每人钱包 8–15 元）、或者上架的加料太少；中期收入不能只靠碗数",
    });
  }

  // ── T10 多款菜单没被用起来：一年了还只卖一款 → 菜单系统等于没做（P47）──
  if (q.months >= 12 && q.menuCount < 2) {
    out.push({
      id: "T10",
      bucket: "design",
      severity: "medium",
      title: "一年下来菜单上只有一款",
      evidence: `在架 ${q.menuCount} 款`,
      kairo: "Staff 3「After a customer buys a ticket」＝售卖机上挂一排券；Shop Stats 人气按菜单聚合",
      fix: "菜单位跟段位走（第 2 段就能挂 2 款）—— 去看是不是段位没升、或者从没点过「加一款」",
    });
  }

  // ── T11 挂了没人点的款：白占菜单位，还摊薄客流（P47）──
  if (q.months >= 12 && q.deadDishCount > 0) {
    out.push({
      id: "T11",
      bucket: "polish",
      severity: "low",
      title: "有款挂上架却一碗没卖",
      evidence: `${q.deadDishCount} 款在架零销量`,
      kairo: "Ramen Lab「You can sell unneeded ramen recipes here」——卖不动的配方该下架",
      fix: "下架或降价；菜单不是越多越好，卖不动的那款只是在占位",
    });
  }

  // ── T12 这条街还是别人的：份额被同行吃掉一大块，三年下来一家都没服气（M1）──
  if (q.months >= 12 && q.rivalShare >= 0.25 && q.pacifiedCount === 0) {
    out.push({
      id: "T12",
      bucket: "design",
      severity: "medium",
      title: "这条街还是别人说了算",
      evidence: `同行抢走 ${(q.rivalShare * 100).toFixed(0)} 个点的客 · 服气 0 家`,
      kairo: "Sales Areas 2「energy and appetite ... decrease」——门前这条街的客流是有限的，同行吃掉的不会回来",
      fix: "赢比赛让最强的同行服气（3 次份额砍半），或者直接搬家到同行少的区；硬扛只会一直少卖那么多",
    });
  }

  out.sort((a, b) => {    const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id);
  });

  const hasBlocker = out.some((f) => f.severity === "high" && (f.bucket === "bug" || f.bucket === "balance"));
  const verdict: Verdict = hasBlocker ? "BLOCKED" : out.length > 0 ? "PASS_WITH_NOTES" : "PASS";

  return { verdict, quant: q, findings: out, top3: out.slice(0, 3) };
}

/** 给人看的短标签 */
export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "PASS":
      return "通过";
    case "PASS_WITH_NOTES":
      return "通过（有问题清单）";
    case "NOT_ASSESSED":
      return "无法评估";
    case "BLOCKED":
      return "不通过";
  }
}
