import { describe, expect, it } from "vitest";
import { GUANGXI, monthTargetFor, rentMonthlyOf } from "../data/balance";
import { CAPITAL, BOWL, bowls, monthsOf, RENT, totalCapital, totalGradeFee } from "../data/anchors";
import { nameCandidates, validShopName } from "../data/shop-names";
import { SITES, affordableSites, dailyBowlCeiling, siteById } from "../data/sites";
import { canTakeSite, monthlyRentOf, openForBusiness } from "./setup";
import { createInitialState, advanceMinute, tickMinute } from "./state";
import { resolveEvent } from "./events";
import { spawnScaleByDay, spawnSeatFactor } from "./customer";

/**
 * S0 建店（选铺位 + 起店名）与「钱/碗」坐标系的守门测试。
 *
 * 这两块放在一个文件里，因为它们是一件事：**钱必须先换算成碗，才允许写进游戏**。
 */

const fresh = () => createInitialState("p-setup", 20261114);

describe("建店 S0", () => {
  it("全新存档在 setup 阶段：没铺位、没店名、时间不走", () => {
    const s = fresh();
    expect(s.phase).toBe("setup");
    expect(s.site).toBe("");
    expect(s.shopName).toBe("");
    tickMinute(s);
    expect(s.flow.minuteOfDay).toBe(0);
  });

  it("开张扣转让费、换座位灶台日上限、进入准备阶段", () => {
    const s = fresh();
    const cashBefore = s.cash;
    const alley = siteById("alley")!;
    const r = openForBusiness(s, "alley", "建政老友粉");
    expect(r.ok).toBe(true);
    expect(s.phase).toBe("prep");
    expect(s.site).toBe("alley");
    expect(s.shopName).toBe("建政老友粉");
    expect(s.cash).toBe(cashBefore - alley.feeYuan);
    expect(s.venue.seats).toBe(alley.seats);
    expect(s.venue.stoves).toBe(alley.stoves);
    expect(s.capacity).toBe(alley.capacity);
    expect(monthlyRentOf(s)).toBe(alley.rentMonthly);
  });

  it("店名不合法、铺位不存在、已开张：都拒绝且不扣钱", () => {
    const s = fresh();
    const cash = s.cash;
    expect(openForBusiness(s, "alley", "粉").ok).toBe(false); // 1 个字
    expect(openForBusiness(s, "nope", "建政老友粉").ok).toBe(false);
    expect(s.cash).toBe(cash);
    expect(s.phase).toBe("setup");
    expect(openForBusiness(s, "stall", "阿婆老友粉").ok).toBe(true);
    expect(openForBusiness(s, "alley", "三姐粉店").ok).toBe(false); // 已经开过了
    expect(s.site).toBe("stall");
  });

  it("三档铺位都能在起始现金内拿下，且越贵天花板越高", () => {
    const s = fresh();
    expect(s.cash).toBe(GUANGXI.startCashYuan);
    expect(affordableSites(s.cash).map((x) => x.id)).toEqual(["stall", "alley", "streetfront"]);
    const seats = SITES.map((x) => x.seats);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
    const rents = SITES.map((x) => x.rentMonthly);
    expect(rents).toEqual([...rents].sort((a, b) => a - b));
    // 最贵的铺位要花掉起始现金的大部分，剩下不到两个月房租
    const street = siteById("streetfront")!;
    expect(street.feeYuan / s.cash).toBeGreaterThan(0.85);
    expect(canTakeSite(s, "streetfront").ok).toBe(true);
  });

  it("街边摊最低门槛：0 转让费，2 座 1 灶", () => {
    const s = fresh();
    expect(openForBusiness(s, "stall", "街边老友粉").ok).toBe(true);
    expect(s.cash).toBe(GUANGXI.startCashYuan);
    expect(s.venue.seats).toBe(2);
    expect(s.venue.stoves).toBe(1);
    expect(monthlyRentOf(s)).toBe(1_500);
  });
});

describe("店名", () => {
  it("同一批次确定性可复现，最多 5 个且互不重复", () => {
    const a = nameCandidates("seed-1", 0);
    const b = nameCandidates("seed-1", 0);
    expect(a).toEqual(b);
    expect(a.length).toBe(5);
    expect(new Set(a).size).toBe(5);
    expect(nameCandidates("seed-1", 1)).not.toEqual(a);
  });

  it("合法性：2–12 字，允许中文数字与 ·，拒绝空白与超长", () => {
    expect(validShopName("建政老友粉")).toBe(true);
    expect(validShopName("  粉  ")).toBe(false);
    expect(validShopName("一二三四五六七八九十一二三")).toBe(false);
    expect(validShopName("")).toBe(false);
    expect(validShopName("阿婆·老友粉")).toBe(true);
  });
});

describe("坐标系（钱 / 碗 / 月营收）", () => {
  it("一碗的构成加总等于锚点成本 4.8 元（粉 0.6＋猪杂 1.2＋料 0.9＋汤 0.7＋能耗 0.8＋损耗 0.6），售价 10 元", () => {
    expect(BOWL.costYuan).toBeCloseTo(GUANGXI.bowlCostYuan, 6);
    expect(BOWL.costYuan).toBe(4.8);
    expect(BOWL.priceYuan).toBe(GUANGXI.bowlPriceYuan);
    expect(BOWL.marginYuan).toBeCloseTo(5.2, 6);
    expect(BOWL.marginYuan / BOWL.priceYuan).toBeGreaterThan(0.5);
    expect(BOWL.marginYuan / BOWL.priceYuan).toBeLessThan(0.55);
  });

  it("bows() 把元折成碗：月营收 21,000 ≈ 2,100 碗", () => {
    expect(monthTargetFor(1)).toBe(21_000);
    expect(bowls(21_000)).toBe(2_100);
    expect(monthsOf(21_000)).toBe(1);
    expect(monthsOf(120_000)).toBe(5.7);
  });

  it("资本阶梯有份量：第四档 3 万元 = 3,000 碗；第五档（黄金灶，第 8 段才开）6.8 万元 = 6,800 碗", () => {
    // 批 AZ′（解 GAP 四轮 A 条）：设备从四档变成五档，第五档是开罗的 Golden 系列，
    // 价差故意拉成 6,800 碗 —— 那是给「段位费之外还剩一大笔钱」准备的出口，
    // 所以这里不能再用 `Math.max(...)` 当「顶档」的判据，得按档位分开断言。
    expect(CAPITAL.equipmentYuan).toHaveLength(5);
    const tier4 = CAPITAL.equipmentYuan[3]!;
    const tier5 = CAPITAL.equipmentYuan[4]!;
    expect(tier4).toBe(30_000);
    expect(bowls(tier4)).toBe(3_000);
    expect(tier5).toBe(68_000);
    expect(bowls(tier5)).toBe(6_800);
    expect(CAPITAL.equipmentYuan[0]).toBeLessThan(tier5 / 10); // 档间级差 ≥ 10 倍（首档对顶档）
    // 前四档仍是老阶梯：每一档都不少于上一档的两倍不到（1,500 → 3,800 → 9,000 → 30,000）
    for (let i = 1; i < 4; i += 1) expect(CAPITAL.equipmentYuan[i]!).toBeGreaterThan(CAPITAL.equipmentYuan[i - 1]!);
  });

  it("段位费是主出口：合计约六万六千碗（全程碗数的三成），照开罗 grade_review 的形状", () => {
    const fee = totalGradeFee();
    // 数值校准：批次四的 ¥82,600（≈8,260 碗）是照旧口径算的；钱包地板之后
    // 全程碗数约 24 万，段位费必须跟着抬，否则期末现金堆成 ¥1M+ 无处可去（P173）。
    expect(fee).toBe(660_800);
    expect(bowls(fee)).toBeGreaterThan(60_000);
    expect(bowls(fee)).toBeLessThan(72_000);
  });

  it("段位费比全部资本品加起来还贵（开罗 storeequip 8,000 对段位费 8.33M）", () => {
    const cap = totalCapital();
    const fee = totalGradeFee();
    expect(cap).toBeGreaterThan(30_000);
    expect(cap).toBeLessThan(fee);
    // 单看设备（不含转让费与扩建）仍是零头。
    // 批 AZ′：设备多了一档黄金灶（¥68,000），四件合计从 ¥43,300 涨到 ¥112,300，
    // 占比从 6.5% 涨到 17% —— 但「段位费是主出口」这条结构没变，所以阈值从 10% 放到 20%，
    // 并额外钉住「设备加总 < 段位费的四分之一」，防止以后有人靠抬设备价绕开段位费。
    const equip = CAPITAL.equipmentYuan.reduce((a, b) => a + b, 0);
    expect(equip).toBeLessThan(fee * 0.2);
    expect(equip).toBeLessThan(fee * 0.25);
  });

  it("月租是铺位固定值（2025 实测）：摊位 ¥1,500 / 社区店 ¥4,600 / 临街 ¥7,600，每年 +3%", () => {
    const stall = siteById("stall")!;
    const alley = siteById("alley")!;
    const street = siteById("streetfront")!;
    expect(stall.rentMonthly).toBe(RENT.stallMonthly);
    expect(alley.rentMonthly).toBe(RENT.communityMonthly);
    expect(street.rentMonthly).toBe(RENT.streetMonthly);
    expect(GUANGXI.rentYuan).toBe(4_600);
    // 第 1 个月不涨；第 13 个月起 +3%；第 25 个月再 +3%
    expect(rentMonthlyOf(RENT.communityMonthly, 1)).toBe(4_600);
    expect(rentMonthlyOf(RENT.communityMonthly, 12)).toBe(4_600);
    expect(rentMonthlyOf(RENT.communityMonthly, 13)).toBe(4_738);
    expect(rentMonthlyOf(RENT.communityMonthly, 25)).toBe(4_880);
  });
});

/**
 * 「2 座档不再是陷阱」（批 BH′，解 P545 + P547 + P548）。
 *
 * 线上 97 局真实试玩：**48 局**选了免费的 2 座街边摊，中位只活 2 天、0 局活过第 5 天；
 * 4 座 39 局中位 5 天、6 座 10 局 70% 活过 5 天。2 座的理论产能 32.7 碗/天，
 * 而旧配平按 4 座的客流放人进来 —— 首日到店 58 人、只能卖 36 碗，**22 个人当场掉头走**（38%）。
 *
 * 这三条断言就是这一批的判据：
 *   ① 2 座首日流失 ≤25%（旧 38%），4 座 / 6 座仍然是 0%；
 *   ② 4 座及以上座位系数**恒等于 1.0**（替身全程 4 座 ⇒ 四种子必须逐位不变）；
 *   ③ 建店卡上的日产能和模型同一算式（见 `data/sites.test.ts`）。
 */
describe("2 座档不再是陷阱（批 BH′）", () => {
  /** 开张 + 跑完一整天，取打烊单上的「卖出 / 走掉」 */
  function oneDay(siteId: string, seed: number): { served: number; lost: number } {
    const s = createInitialState("p-bh", seed);
    expect(openForBusiness(s, siteId, "探针老友粉").ok).toBe(true);
    let guard = 0;
    while (!s.dayReport && guard < 50_000) {
      if (s.events.pending) {
        resolveEvent(s, 0);
        continue;
      }
      advanceMinute(s);
      guard += 1;
    }
    const rep = s.dayReport;
    expect(rep).not.toBeNull();
    return { served: rep!.served, lost: rep!.lost };
  }

  const churn = (x: { served: number; lost: number }): number =>
    x.lost + x.served > 0 ? (x.lost / (x.lost + x.served)) * 100 : 0;

  it("首日流失：2 座从 38% 降到 20% 上下（判据 ≤25%），4 座与 6 座仍是 0%", () => {
    const seeds = [1, 2, 3];
    const stall = seeds.map((seed) => churn(oneDay("stall", seed)));
    const avg = stall.reduce((a, b) => a + b, 0) / stall.length;
    expect(avg).toBeLessThanOrEqual(25);
    // 单种子有波动（探针实测 27.1 / 26.4 / 0.0），但不许某一颗回到旧值附近
    for (const v of stall) expect(v).toBeLessThan(30);
    for (const seed of seeds) expect(oneDay("alley", seed).lost).toBe(0);
    expect(oneDay("streetfront", 1).lost).toBe(0);
  }, 120_000);

  it("座位系数：4 座及以上恒等于 1.0 —— 替身全程 4 座，四种子一个字节都不许动", () => {
    for (const seats of [4, 5, 6, 8, 12]) expect(spawnSeatFactor(seats)).toBe(1);
    expect(spawnSeatFactor(2)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(spawnSeatFactor(3)).toBeCloseTo(Math.sqrt(0.75), 12);
    expect(spawnSeatFactor(1)).toBeCloseTo(0.5, 12);
    // 越少越少，且单调
    expect(spawnSeatFactor(1)).toBeLessThan(spawnSeatFactor(2));
    expect(spawnSeatFactor(2)).toBeLessThan(spawnSeatFactor(3));
    expect(spawnSeatFactor(3)).toBeLessThan(spawnSeatFactor(4));
  });

  it("4 座时 spawnScaleByDay 与批 P67 的老分档逐位相同（0.55 / 0.85 / 1）", () => {
    const s = createInitialState("p-bh-scale", 1);
    expect(openForBusiness(s, "alley", "建政老友粉").ok).toBe(true);
    s.month = 0;
    for (const [day, want] of [[1, 0.55], [2, 0.85], [7, 0.85], [8, 1]] as const) {
      s.day = day;
      expect(spawnScaleByDay(s)).toBe(want);
    }
    s.month = 1;
    s.day = 1;
    expect(spawnScaleByDay(s)).toBe(1);
  });

  it("2 座从第 1 天起就压客流：0.55×0.707 ≈ 0.389，第 8 天起停在 0.707", () => {
    const s = createInitialState("p-bh-scale", 1);
    expect(openForBusiness(s, "stall", "街边老友粉").ok).toBe(true);
    s.month = 0;
    s.day = 1;
    expect(spawnScaleByDay(s)).toBeCloseTo(0.55 * Math.SQRT1_2, 12);
    expect(spawnScaleByDay(s)).toBeLessThan(0.4); // 首日到店约 41 人，仍会排一点队
    s.day = 8;
    expect(spawnScaleByDay(s)).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("建店卡把日产能写出来：2 座 33 碗，是 4 座（65 碗）的一半", () => {
    expect(dailyBowlCeiling(siteById("stall")!)).toBe(33);
    expect(dailyBowlCeiling(siteById("alley")!)).toBe(65);
  });
});
