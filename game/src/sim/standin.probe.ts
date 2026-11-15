import { describe, it } from "vitest";
import { FLOW } from "../data/balance";
import { nextStaffNeed, staffSlots } from "../data/staff";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";
import { scoreRecipe } from "./score";
import { buyExpansion, nextExpansion } from "./expansion";
import { refreshCandidates, hire, dailyWage, toggleRest } from "./staff";
import { canEnter, contestScore, enterContest, maxTierOf } from "./contest";
import { applyGrade, checkGrade } from "./grade";
import { districtOptions, homeEnergyOf, moveShop } from "./district";

/**
 * 「替身」记录：一个按规矩办事的假玩家，完整玩 36 个月。
 *
 * 它**不是**人类证据（我知道答案，会走捷径）——它只是把「一局完整流程」跑一遍，
 * 用来回答三件事：
 *  ① 36 个月里每个月的营收/流失/现金长什么样；
 *  ② 只做「调价 + 扩建 + 雇人」这三件最朴素的操作，能不能活得下去；
 *  ③ 哪个月开始现金吃紧（也就是玩家第一次会卡住的地方）。
 *
 * 策略（刻意朴素，不用最优解）：
 *  - 满意 < 55 → 降价 1 元（最低 8）；满意 ≥ 70 且流失 > 25% → 涨价 1 元（最高 12）；
 *  - 现金 ≥ 下一档扩建价 + ¥8,000 缓冲 → 扩建（S5，两档 ¥12,000/¥35,000）；
 *  - 有空坑（累计接待解锁的人手）且现金 ≥ 介绍费 + ¥6,000 缓冲 → 雇最便宜的那个（S2）；
 *  - 事件一律选第一项。
 *
 * 为什么要加缓冲：旧版「现金 > 25,000 就扩建」会在扩建后立刻现金见底，
 * 遇到涨价事件就破产；缓冲是替身自己的谨慎，不代表游戏规则。
 */
function play(seed: number): GameState {
  const s = createInitialState("standin", seed);
  let lastMonth = 0;
  let guard = 0;
  const log: string[] = [];
  let expands = 0;
  let hires = 0;

  while (!s.finished && s.months.length < 36 && guard < 5_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard += 1;

    // 每天开门那一刻排班：疲劳过 70 就让他今天休（半薪），别等到 100 辞职
    if (s.flow.minuteOfDay === 0) {
      for (const m of s.staff.roster) {
        if (m.fatigue >= 70 && !m.resting) toggleRest(s, m.uid);
      }
    }

    if (s.months.length !== lastMonth) {
      lastMonth = s.months.length;
      const m = s.months[s.months.length - 1];
      if (!m) continue;
      const sat = s.flow.lastSatisfaction;
      const lostRate = m.lost / Math.max(1, m.customers + m.lost);

      // 决策点：一个月看一次
      // 定价贴着南宁现实（老友粉主力价 10 元）：只有「卖出去的人不满意」才降价，
      // 只有「人人满意且几乎没人走」才敢涨。流失多不等于需求旺 —— 也可能是价太高把人吓走，
      // 所以流失率高时不许涨价（这条是替身自己踩过的坑：一路涨到 12，流失 77%、日均掉到 30 碗）。
      if (sat >= 0 && sat < 50 && s.price > 8) s.price -= 1;
      else if (s.price < 11 && sat >= 75 && lostRate < 0.05) s.price += 1;

      const exp = nextExpansion(s);
      if (exp && s.cash >= exp.costYuan + 8_000) {
        if (buyExpansion(s).ok) expands += 1;
      }

      const slots = staffSlots(s.totalCustomers);
      const onDutyCooks = s.staff.roster.filter((m) => m.role === "cook").length;
      // 只补「掌勺」：灶位是上限、人手是实际开火数（见 staff.ts 的 cookSlots）。
      // 跑堂/备料对小店是薄利，替身不雇 —— 这是真实小店的算术，不是刻意摆烂。
      if (slots > s.staff.roster.length && onDutyCooks + 1 < s.venue.stoves) {
        refreshCandidates(s);
        const cookCand = s.staff.candidates.filter((m) => m.role === "cook").sort((a, b) => a.wage - b.wage)[0];
        if (cookCand && s.cash >= cookCand.wage * 2 + 6_000) {
          if (hire(s, cookCand.uid).ok) hires += 1;
        }
      }
      // 排班：疲劳过 70 就让他今天休（半薪），别等到 100 辞职
      // （每天开门那一刻统一处理，见上面的 minuteOfDay === 0 分支）
      const need = nextStaffNeed(s.totalCustomers);

      // ── 开罗式中期三件事：评段位 → 报比赛 → 该换区就换区 ──
      // 段位能评就评（升了才能报更高档比赛）
      const gc = checkGrade(s);
      if (gc.ready) {
        const g = applyGrade(s);
        if (g.ok) log.push(`  ↳ 升段：${g.level} 段（花 ¥${g.spentYuan}，奖 ¥${g.rewardYuan}）`);
      }

      // 比赛月就报最擅长的那一类，用段位允许的最高档
      let contestNote = "";
      if (canEnter(s, maxTierOf(s)).ok) {
        const types: Array<"staff" | "customers" | "shop"> = ["staff", "customers", "shop"];
        const best = types
          .map((t) => ({ t, score: contestScore(s, t) }))
          .sort((a, b) => b.score - a.score)[0]!;
        const r = enterContest(s, best.t, maxTierOf(s));
        if (r) contestNote = ` · 比赛 ${best.t} 第 ${r.rank} 名 奖 ¥${r.prize}`;
      }

      // 本区能量掉到 0.85 以下，且有个买得起、有效客流至少高 25% 的区，就搬
      let moveNote = "";
      if (homeEnergyOf(s) < 0.85) {
        const cur = districtOptions(s).find((o) => o.current)!;
        const target = districtOptions(s)
          .filter((o) => !o.current && o.affordable && o.effective > cur.effective * 1.25)
          .sort((a, b) => b.effective - a.effective)[0];
        if (target) {
          const mv = moveShop(s, target.id);
          if (mv.ok) moveNote = ` · 搬到 ${target.name}（¥${mv.paid}，日客流 ${target.effective}）`;
        }
      }

      log.push(
        `M${String(m.month).padStart(2, "0")} 现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}` +
          ` · 营收 ¥${m.revenue.toLocaleString("zh-CN")}` +
          ` · 客 ${m.customers} · 流失 ${(lostRate * 100).toFixed(0)}%` +
          ` · 价 ¥${s.price} · 座 ${s.venue.seats}/灶 ${s.venue.stoves}` +
          ` · 工 ${s.staff.roster.length}/${slots}（日薪 ¥${dailyWage(s)}）` +
          ` · 段 ${s.gradeLevel} · 区能量 ${(homeEnergyOf(s) * 100).toFixed(0)}%` +
          (need ? ` · 下一个还差 ${need.short} 位` : "") +
          contestNote +
          moveNote,
      );
    }
  }

  const sc = scoreRecipe(s.recipe, s.price);
  console.log(
    `\n=== 种子 ${seed} · 味道 ${sc.total} · 期末现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}` +
      ` · 扩建 ${expands} 次 · 雇人 ${hires} 人 ===`,
  );
  for (const line of log) console.log(line);
  return s;
}

describe("替身 36 个月", () => {
  it("按朴素策略完整玩 3 年", () => {
    FLOW.spawnScale = 6;
    FLOW.serveMinutes = 1;
    FLOW.eatScale = 1;
    FLOW.patienceScale = 1.5;
    FLOW.queueMax = 12;

    for (const seed of [1, 2]) {
      const s = play(seed);
      const months = s.months.length;
      const rev = s.months.reduce((n, m) => n + m.revenue, 0);
      const lost = s.months.reduce((n, m) => n + m.lost, 0);
      const cust = s.months.reduce((n, m) => n + m.customers, 0);
      const wages = s.months.reduce((n, m) => n + m.wages, 0);
      console.log(
        `\n[替身 ${seed}] ${months} 个月 · 月均营收 ¥${Math.round(rev / months).toLocaleString("zh-CN")}` +
          ` · 月均工资 ¥${Math.round(wages / months).toLocaleString("zh-CN")}` +
          ` · 日均 ${(cust / (months * 30)).toFixed(1)} 碗 · 总流失率 ${((lost / (cust + lost)) * 100).toFixed(0)}%` +
          ` · 热卖 ${s.frenzy.count} 次` +
          ` · 期末现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}`,
      );
    }
  }, 900_000);
});
