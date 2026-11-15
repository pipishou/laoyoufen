import { describe, it } from "vitest";
import { FLOW } from "../data/balance";
import { nextStaffNeed, staffSlots } from "../data/staff";
import { ackDayReport, advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";
import {  } from "./score";
import { buyExpansion, nextExpansion } from "./expansion";
import { refreshCandidates, hire, dailyWage, toggleRest } from "./staff";
import { canEnter, contestScore, enterContest, maxTierOf } from "./contest";
import { applyGrade, checkGrade } from "./grade";
import { districtOptions, homeEnergyOf, moveShop } from "./district";
import { buyEquipment, equipLevel, equipNextCost } from "./equipment";
import { auditPlaytest, verdictLabel } from "./playtest";
import { nextFloat } from "./rng";
import { noodleKindOf, noodleViews, setNoodleKind, currentSeason } from "./noodles";
import { scoreOf } from "./dish";
import { mainViews, setMain, setPortion } from "./mains";
import { MAX_BRANCHES } from "../data/branches";
import { branchSizeOptions, branchViews, openBranch } from "./branches";
import { setDrinkTemp } from "./sides";

/**
 * 「替身」＝游戏测试员：一个按规矩办事的假玩家，完整玩 36 个月，跑完还要交体检单。
 *
 * 它**不是**人类证据（我知道答案，会走捷径）——它是一把量尺，用来回答三件事：
 *  ① 36 个月里每个月的营收/流失/现金长什么样；
 *  ② 只做「调价 + 买设备 + 扩建 + 雇人 + 评段 + 比赛 + 换区」这些朴素操作，能不能活得下去；
 *  ③ 哪个月开始现金吃紧、哪段路开始没有决策点。
 *
 * 跑完交给 `auditPlaytest()`（`sim/playtest.ts`）出四态裁决 + 问题四桶，
 * 判据骨架来自 Claude Code Game Studios 的 playtest-report / soak-test。
 *
 * 策略（刻意朴素，不用最优解；每一条都能在开罗的 help.txt 里找到对应动作）：
 *  - 定价贴着南宁现实价：满意 <50 且价 >9 → 降 1（下限 ¥9＝老友猪杂粉现实价）；
 *    价 <11、满意 ≥75、流失 <5% → 涨 1；
 *  - 流失 >40% 且现金 >设备下档价 +¥4,000 → 买设备（P36：旧版替身从不买设备，
 *    所以「热卖没用/扩建没收益」这类结论其实是替身自己造成的）；
 *  - 现金 ≥ 下一档扩建价 + ¥8,000 → 扩建（S5，两档 ¥12,000/¥35,000）；
 *  - 有空坑（累计接待解锁的人手）且现金 ≥ 介绍费 + ¥6,000 → 只补掌勺（S2）；
 *  - 能评段位就评、比赛月报最擅长类型、本区能量掉到 85% 且别区好 25% 就搬；
 *  - 每月先爬山调配方（P40），再按味道定价；
 *  - 事件一律选第一项。
 */

/**
 * 配方爬山（P40）——真人玩家最常做的事：试一勺汤、换一档粉，满意就留着。
 *
 * 替身原来从不碰配方，于是味道永远停在初始分，`priceTolerance()` 只有 1.0，
 * 价格卡在 ¥9，营收 = 碗数 × ¥9 = 产能曲线 —— 于是「产能一满营收就不动」，
 * 被 T3 判成「长期没有决策点」。真凶不是游戏没内容，是这把量尺不会做菜。
 *
 * 策略刻意笨：每月随机挑一个参数 ±4，满意分更高就留、否则回滚，试 6 次。
 */
function climbRecipe(s: GameState): void {
  let best = scoreOf(s).total;
  for (let i = 0; i < 6; i += 1) {
    const useSoup = nextFloat(s.rng) < 0.5;
    const arr: number[] = useSoup ? s.recipe.soup : s.recipe.noodle;
    const idx = Math.floor(nextFloat(s.rng) * arr.length);
    const before = arr[idx] ?? 0;
    const step = nextFloat(s.rng) < 0.5 ? -4 : 4;
    const after = Math.max(0, Math.min(100, before + step));
    if (after === before) continue;
    arr[idx] = after;
    const total = scoreOf(s).total;
    if (total > best) best = total;
    else arr[idx] = before;
  }
}

/**
 * 换粉型（P42）：在解锁过的粉里挑「契合度 × 季节系数」最高的。
 *
 * 粉型不是皮肤：砂锅要浓汤重蒜、干捞要豆豉辣、湿面怕酸。
 * 替身如果永远卖切粉，那 P42 等于没做 —— 量尺自己得会用新动词。
 */
function pickNoodle(s: GameState): void {
  const views = noodleViews(s).filter((v) => v.unlocked);
  let bestId = noodleKindOf(s);
  let bestScore = -1;
  for (const v of views) {
    // 反季的粉要打得过当季的才能选（×0.85 的惩罚已经在 seasonFactor 里）
    const score = v.fit * v.seasonFactor - (v.def.serveFactor - 1) * 20;
    if (score > bestScore) {
      bestScore = score;
      bestId = v.def.id;
    }
  }
  if (bestId !== noodleKindOf(s)) setNoodleKind(s, bestId);
}

/**
 * 选主料（P46）：牛肉贵但客人更满意，碎肉便宜但平。
 *
 * 量化口径 = 满意加成 − 料钱压力（料钱按「一个月卖多少碗」摊到每碗的毛利里）。
 * 替身只在解锁过的里面挑，挑不到更好的就维持现状 —— 和真人一样，不会为了换而换。
 */
/**
 * 研菜单（P47）：菜单没满就加一款，并让新款跟现有款错开。
 *
 * 量尺必须会用「多款」这个新动词（P40 的教训：不会用的系统等于没测过）。
 * 做法照真店：先抄一碗卖得好的，再换个主料 —— 老友粉店就是
 * 「老友粉 / 老友猪杂粉 / 老友牛肉粉」这样排出来的。
 */
function manageMenu(s: GameState): void {
  const cap = menuCap(s);
  if (s.menu.length >= cap) return;
  // 现金留点周转（开店初期别把钱全压在推新品上）
  if (s.cash < 2_000) return;
  const r = addDish(s);
  if (!r.ok) return;
  const idx = s.menu.length - 1;
  selectDish(s, idx);
  // 换一个菜单里还没有的主料 —— 不然几款长得一模一样，等于一款
  const used = new Set(s.menu.filter((_, i) => i !== idx).map((d) => d.main));
  const cand = mainViews(s)
    .filter((v) => v.unlocked && !used.has(v.def.id))
    .sort((a, b) => b.def.satBonus - a.def.satBonus);
  const pick = cand[0];
  if (pick) setMain(s, pick.def.id);
  syncEditing(s);
  // 回主款，别把编辑指针留在新款上影响后面的定价逻辑
  selectDish(s, 0);
}

function pickMain(s: GameState): void {
  const views = mainViews(s).filter((v) => v.unlocked);
  let bestId = s.main;
  let bestScore = -Infinity;
  for (const v of views) {
    // 每 +¥1 料钱扣 1.6 分（替身怕贵），满意加成直接加分
    const score = v.def.satBonus - v.def.costYuan * 1.6;
    if (score > bestScore) {
      bestScore = score;
      bestId = v.def.id;
    }
  }
  if (bestId !== s.main) setMain(s, bestId);
}

/**
 * 选份量（P46）：三两多 ¥2 但多一分满意、出碗慢一成。
 * 只在「产能还有余量」时上三两 —— 排队排到门口的时候，多卖二两更划算。
 */
function pickPortion(s: GameState): void {
  const waiting = s.flow.customers.filter((c) => c.status === "waiting").length;
  const want = waiting <= 1 ? 3 : 2;
  if (want !== s.portion) setPortion(s, want);
}

function play(seed: number): GameState {
  const s = createInitialState("standin", seed);
  let lastMonth = 0;
  let guard = 0;
  const log: string[] = [];
  let expands = 0;
  let hires = 0;
  let equips = 0;
  /** 上月试涨价时的价与营收（这月用来判断该不该退） */
  let trialPrice = 0;
  let trialRevenue = 0;

  while (!s.finished && s.months.length < 36 && guard < 5_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard += 1;

    // 每天开门那一刻：先点掉昨天的日结单（玩家会点「明天继续」），
    // 否则 phase 永远停在 closing —— 而 moveShop() 要求 phase === "prep"，
    // 换区就会被一直拒绝（这是替身自己踩过的坑：模拟器绕过状态机，测出来的是假世界）。
    if (s.dayReport) ackDayReport(s);

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
      // ── 先调味道，再定价 ──
      climbRecipe(s);
      // 换粉型（P42）：在已解锁的粉里挑「契合度 × 季节」最高的。
      // 量尺自己也得会用新动词，否则新系统永远测不出东西（P40 的教训）。
      pickNoodle(s);
      // 主料与份量（P46）：牛肉/牛腩比碎肉卖得贵也更受欢迎，三两比二两多卖 ¥2。
      // 量尺不会这两下，就等于这一期做的东西没被测过（P40 的老教训）。
      pickMain(s);
      pickPortion(s);
      // 菜单（P47）：够段位就多挂一款 —— 不然后面的定价/产能判断都只针对一碗
      manageMenu(s);
      // 饮料冰热（P43）：冬天上热的、其余上冰的 —— 量尺不跟着季节换，冬天冰绿豆沙就白扣分。
      const seasonNow = currentSeason(s);
      const wantTemp = seasonNow === "winter" ? "hot" : "ice";
      if (s.sides.drinkTemp !== wantTemp) setDrinkTemp(s, wantTemp);
      const tasteNow = scoreOf(s).total;

      // 定价三段（P40）：
      //  ① 上月试涨价 → 这月看营收：跌 5% 以上就退（比看流失准；高产能店流失永远几十个百分点）；
      //  ② 味道不行（满意 <50）且价还高于南宁现实价 ¥9 → 降回 ¥9；
      //  ③ 味道上来了（满意 ≥65）且忙不过来（有人被挡门外，流失 >25%）→ 涨 1 元试一个月。
      // 旧规则要求「流失 <5% 才敢涨」，可产能一满流失就到 60%+，于是价永远卡 ¥9。
      if (trialPrice > 0) {
        if (s.price === trialPrice && m.revenue < trialRevenue * 0.95) s.price -= 1;
        trialPrice = 0;
      }
      if (sat >= 0 && sat < 50 && s.price > 9) s.price -= 1;
      else if (sat >= 65 && s.price < 12 && lostRate > 0.25) {
        trialRevenue = m.revenue;
        s.price += 1;
        trialPrice = s.price;
      }
      // 价格与配方都是「这一款」的属性（P47）：不落笔，改的就是空气
      syncEditing(s);

      // 先买设备再扩建：一个灶/一档粉篓 ¥1,500 起，比 ¥12,000 的扩建便宜一个数量级，
      // 而且直接改「每轮几碗」。旧版替身从不买设备，于是所有「产能不够」的结论
      // 都被记到了扩建头上（P36）。
      if (lostRate > 0.4) {
        for (const id of ["stove", "strainer", "bench"] as const) {
          const cost = equipNextCost(s, id);
          if (!Number.isFinite(cost)) continue;
          if (s.cash < cost + 4_000) continue;
          if (buyEquipment(s, id).ok) {
            equips += 1;
            break;
          }
        }
      }

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

      // 开分店（S6）：主店到第 10 段后，续得上就再开一家 —— 这是中期唯一的
      // 「营收还能往上走」的出口（主店被座位/灶位/粉价三重封顶）。挑月净最高、
      // 且买得起那一档。**必须留够 ¥60,000 周转**：分店头 18 天只养口碑，
      // 不赚钱还要照付房租店长（第一版只留 ¥8,000，一个月连开四家直接现金链断）。
      let branchNote = "";
      if (s.branches.length < MAX_BRANCHES) {
        const allProfitable = branchViews(s).every((v) => v.monthNet > 0);
        const best = allProfitable
          ? branchSizeOptions(s)
              .filter((o) => !o.locked && s.cash >= o.def.openFeeYuan + 25_000)
              .sort((a, b) => b.monthNet - a.monthNet)[0]
          : undefined;
        if (best) {
          // 选区：优先挑「已经去过、有效客流最大、且这个区还没开过分店」的区
          const used = new Set(s.branches.map((b) => b.district));
          const spot = districtOptions(s)
            .filter((o) => !used.has(o.id) && o.effective >= 60)
            .sort((a, b) => b.effective - a.effective)[0];
          if (spot) {
            const br = openBranch(s, spot.id, best.def.id);
            if (br.ok) branchNote = ` · 开分店 ${spot.name}·${best.def.name}（¥${best.def.openFeeYuan.toLocaleString("zh-CN")}）`;
          }
        }
      }

      log.push(
        `M${String(m.month).padStart(2, "0")} 现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}` +
          ` · 营收 ¥${m.revenue.toLocaleString("zh-CN")}` +
          ` · 客 ${m.customers} · 流失 ${(lostRate * 100).toFixed(0)}%` +
          ` · 价 ¥${s.price} · 味 ${tasteNow} · 座 ${s.venue.seats}/灶 ${s.venue.stoves}` +
          ` · 工 ${s.staff.roster.length}/${slots}（日薪 ¥${dailyWage(s)}）` +
          ` · 设备 ${equipLevel(s, "stove")}/${equipLevel(s, "strainer")}/${equipLevel(s, "bench")}` +
          ` · 段 ${s.gradeLevel} · 区能量 ${(homeEnergyOf(s) * 100).toFixed(0)}%` +
          (need ? ` · 下一个还差 ${need.short} 位` : "") +
          contestNote +
          moveNote +
          branchNote,
      );
    }
  }

  const sc = scoreOf(s);
  console.log(
    `\n=== 种子 ${seed} · 味道 ${sc.total} · 粉 ${noodleKindOf(s)} · 期末现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}` +
      ` · 扩建 ${expands} 次 · 雇人 ${hires} 人 · 买设备 ${equips} 次 ===`,
  );
  for (const line of log) console.log(line);

  // 跑完交体检单（CCGS playtest-report 的四态裁决 + 问题四桶）
  const rep = auditPlaytest(s);
  console.log(
    `\n[测试员 · 种子 ${seed}] 裁决：${rep.verdict}（${verdictLabel(rep.verdict)}）` +
      ` · 日均 ${rep.quant.bowlsPerDay} 碗 · 流失 ${(rep.quant.lostRate * 100).toFixed(0)}%` +
      ` · 均价 ¥${rep.quant.avgPrice} · 成长 ×${rep.quant.growth.toFixed(2)}` +
      ` · 最长持平 ${rep.quant.flatStreak} 月 · 比赛 ${rep.quant.contestCount} 场 · 段 ${rep.quant.gradeLevel}`,
  );
  for (const f of rep.findings) {
    console.log(`  [${f.severity}/${f.bucket}] ${f.id} ${f.title} —— ${f.evidence}`);
  }
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
          ` · 加购 ¥${Math.round(s.tally.sideRevenue).toLocaleString("zh-CN")}（占 ${(s.tally.sideRevenue / Math.max(1, s.tally.sideRevenue + rev) * 100).toFixed(1)}%，组合 ${s.tally.comboHits} 次）` +
          ` · 期末现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}`,
      );
    }
  }, 900_000);
});import { addDish, menuCap, selectDish, syncEditing } from "./menu";

