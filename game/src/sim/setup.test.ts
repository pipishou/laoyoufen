import { describe, expect, it } from "vitest";
import { GUANGXI, monthTargetFor, rentFor } from "../data/balance";
import { CAPITAL, BOWL, bowls, monthsOf, RENT, totalCapital, totalGradeFee } from "../data/anchors";
import { nameCandidates, validShopName } from "../data/shop-names";
import { SITES, affordableSites, siteById } from "../data/sites";
import { canTakeSite, openForBusiness, rentFactorOf } from "./setup";
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
    expect(rentFactorOf(s)).toBe(alley.rentFactor);
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
    const rents = SITES.map((x) => rentFactorOf({ site: x.id } as never));
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
    expect(rentFactorOf(s)).toBe(0.33);
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

  it("段位费合计 ≈ 三年营收的 1/3（钱必须真有去处）", () => {
    const fee = totalGradeFee();
    expect(fee).toBe(333_000);
    const threeYears = monthTargetFor(1) * 36;
    expect(fee / threeYears).toBeGreaterThan(0.3);
    expect(fee / threeYears).toBeLessThan(0.55);
  });

  it("资本品总量与三年现金同阶（不是零头）", () => {
    const cap = totalCapital();
    expect(cap).toBeGreaterThan(totalGradeFee() / 2);
    expect(cap).toBeLessThan(totalGradeFee() * 2);
  });

  it("房租落在现实区间：街边摊 ¥1,500 / 社区店 ¥4,600 / 临街 ¥7,600（2025 实测）", () => {
    const base = rentFor(monthTargetFor(1));
    expect(base).toBe(4_620);
    expect(Math.round(base * 0.33)).toBe(1_525);
    expect(Math.round(base * 1.65)).toBe(7_623);
    expect(GUANGXI.rentYuan).toBe(4_600);
    expect(RENT.streetMonthly).toBe(7_600);
  });
});
