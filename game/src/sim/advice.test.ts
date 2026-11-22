import { describe, expect, it } from "vitest";
import { createInitialState, advanceMinute } from "./state";
import { appetiteLineOf, lossWhyOf, markAppetiteSaid, menuLineOf } from "./advice";
import { addDish, activeDishes } from "./menu";
import { DAY_MINUTES } from "./customer";

function fresh() {
  return createInitialState("advice-test", 11);
}

describe("解读层（批 C′）：打烊单上那两行", () => {
  it("一个都没走时不开口 —— 没有可说之处就别说话", () => {
    const s = fresh();
    expect(lossWhyOf(s)).toBeNull();
  });

  it("队满主因：那句本地话带人数、说的是门口", () => {
    const s = fresh();
    s.flow.lostQueue = 7;
    s.flow.lostPrice = 1;
    s.flow.lostWait = 0;
    const got = lossWhyOf(s)!;
    expect(got.text).toContain("7");
    expect(got.text).toContain("门口");
    expect(got.ask.key).toBe("queue");
  });

  it("看价牌主因：说的是价签，不是味道", () => {
    const s = fresh();
    s.flow.lostQueue = 2;
    s.flow.lostPrice = 9;
    const got = lossWhyOf(s)!;
    expect(got.ask.key).toBe("price");
    expect(got.text).toContain("9");
    expect(got.text).toContain("价牌");
  });

  it("等不及主因：说的是出碗速度", () => {
    const s = fresh();
    s.flow.lostQueue = 1;
    s.flow.lostPrice = 0;
    s.flow.lostWait = 6;
    const got = lossWhyOf(s)!;
    expect(got.ask.key).toBe("wait");
    expect(got.text).toContain("等不及");
  });

  it("走的人太少就闭嘴（少于三位不算一件事）", () => {
    const s = fresh();
    s.flow.lostQueue = 2;
    s.flow.lostWait = 0;
    s.flow.lostPrice = 0;
    expect(lossWhyOf(s)).toBeNull();
  });

  it("菜单：只有一款时没得比，不说话", () => {
    const s = fresh();
    s.days.push({
      month: s.month,
      day: s.day,
      revenue: 0,
      served: 0,
      lost: 0,
      avgSat: -1,
      price: s.price,
      taste: 0,
      cash: s.cash,
      menuSold: { [String(activeDishes(s)[0]!.id)]: 4 },
    });
    expect(menuLineOf(s)).toBeNull();
  });

  it("菜单：一款有人点、一款一碗没动，两句都说出来", () => {
    const s = fresh();
    // 第 0 段只能挂一款，先把段位抬到能挂两款
    s.gradeLevel = 6;
    addDish(s);
    const dishes = activeDishes(s);
    expect(dishes.length).toBe(2);
    const sold: Record<string, number> = {};
    sold[String(dishes[0]!.id)] = 9;
    sold[String(dishes[1]!.id)] = 0;
    s.days.push({
      month: s.month,
      day: s.day,
      revenue: 0,
      served: 9,
      lost: 0,
      avgSat: 70,
      price: s.price,
      taste: 60,
      cash: s.cash,
      menuSold: sold,
    });
    const got = menuLineOf(s)!;
    expect(got.text).toContain("走得最多");
    expect(got.text).toContain("一碗没动");
    expect(got.ask.context["冷的"]).toBeTruthy();
  });

  it("菜单：每款都有人点就不提「没人动」", () => {
    const s = fresh();
    // 第 0 段只能挂一款，先把段位抬到能挂两款
    s.gradeLevel = 6;
    addDish(s);
    const dishes = activeDishes(s);
    const sold: Record<string, number> = {};
    for (const d of dishes) sold[String(d.id)] = 3;
    s.days.push({
      month: s.month,
      day: s.day,
      revenue: 0,
      served: 6,
      lost: 0,
      avgSat: 70,
      price: s.price,
      taste: 60,
      cash: s.cash,
      menuSold: sold,
    });
    expect(menuLineOf(s)!.text).not.toContain("一碗没动");
  });

  it("菜单：没有日结就没有这句话", () => {
    expect(menuLineOf(fresh())).toBeNull();
  });

  it("胃口：新局不开口；吃腻了才开口，且一个月只说一次", () => {
    const s = fresh();
    expect(appetiteLineOf(s)).toBeNull();
    // 把「搬进来」往前推十八个月，胃口掉到 0.76 一档
    s.districtSince = s.month - 18;
    const got = appetiteLineOf(s)!;
    expect(got.text.length).toBeGreaterThan(6);
    expect(got.text).not.toMatch(/[0-9]/);
    markAppetiteSaid(s);
    expect(appetiteLineOf(s)).toBeNull();
    s.month += 1;
    expect(appetiteLineOf(s)).not.toBeNull();
  });

  it("日结会把每款今天的差分写进 DayRecord（解 R7）", () => {
    const s = fresh();
    const first = activeDishes(s)[0]!;
    first.sold = 0;
    s.flow.minuteOfDay = DAY_MINUTES - 1;
    advanceMinute(s);
    const rec = s.days[s.days.length - 1]!;
    expect(rec.menuSold).toBeTruthy();
    first.sold = 5;
    s.flow.minuteOfDay = DAY_MINUTES - 1;
    advanceMinute(s);
    const rec2 = s.days[s.days.length - 1]!;
    expect(rec2.menuSold![String(first.id)]).toBe(5);
  });

  it("菜单：两款同名时说「第 N 款」，不念成「老友粉走得最多，老友粉一碗没动」", () => {
    const s = fresh();
    s.gradeLevel = 6;
    addDish(s);
    const dishes = activeDishes(s);
    // 第二款做成第一款的样子（同主料同粉型同配方 → 名字一样）
    dishes[1]!.main = dishes[0]!.main;
    dishes[1]!.noodle = dishes[0]!.noodle;
    dishes[1]!.recipe = dishes[0]!.recipe;
    s.dayReport = {
      month: s.month,
      day: s.day,
      revenue: 300,
      served: 30,
      lost: 0,
      avgSat: 60,
      price: s.price,
      taste: 60,
      cash: s.cash,
      menuSold: { [String(dishes[0]!.id)]: 18, [String(dishes[1]!.id)]: 0 },
    };
    const line = menuLineOf(s);
    expect(line).not.toBeNull();
    const text = line!.text;
    expect(text).toContain("一碗没动");
    expect(text).toContain("第 1 款");
    expect(text).toContain("第 2 款");
  });
});
