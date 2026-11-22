import { describe, expect, it } from "vitest";
import { GUANGXI, monthTargetFor, rentMonthlyOf } from "../data/balance";
import { CAPITAL, BOWL, bowls, monthsOf, RENT, totalCapital, totalGradeFee } from "../data/anchors";
import { nameCandidates, validShopName } from "../data/shop-names";
import { SITES, affordableSites, siteById } from "../data/sites";
import { canTakeSite, monthlyRentOf, openForBusiness } from "./setup";
import { createInitialState, tickMinute } from "./state";

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

  it("资本阶梯有份量：单件设备最贵 3 万元 = 3,000 碗，远高于旧值 2,400 元", () => {
    const top = Math.max(...CAPITAL.equipmentYuan);
    expect(top).toBe(30_000);
    expect(bowls(top)).toBe(3_000);
    expect(CAPITAL.equipmentYuan[0]).toBeLessThan(top / 10); // 档间级差 ≥ 10 倍
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
    // 单看设备（不含转让费与扩建）更是零头
    const equip = CAPITAL.equipmentYuan.reduce((a, b) => a + b, 0);
    expect(equip).toBeLessThan(fee * 0.1);
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
