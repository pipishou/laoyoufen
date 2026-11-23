import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { GEARS } from "../data/gear";
import { EQUIPMENT } from "../data/equipment";
import { buyGear } from "./gear";
import {
  equipRowOf,
  gearRowOf,
  marginPerBowl,
  paybackDays,
  paybackRange,
  paybackWords,
  todayLine,
  todayVoiceContext,
} from "./today";

/**
 * 批 F′：店铺页「今天」那一条 —— 主句照钩子，副句给回本与位置。
 * 判据只有三条：数字在本地算（模型不许改）、位置是第几行（不是「在某一段」）、
 * 没什么可说的时候闭嘴。
 */
function fresh() {
  const s = createInitialState("today-test", 11);
  s.cash = 400_000;
  return s;
}

/** 造一份打烊单：今天走了 lost 位、卖出 served 碗 */
function report(s: ReturnType<typeof fresh>, lost: number, served: number): void {
  s.days.push({
    month: s.month,
    day: s.day,
    revenue: served * s.price,
    served,
    lost,
    avgSat: 55,
    price: s.price,
    taste: 60,
    cash: s.cash,
  });
}

describe("今天那一条（批 F′，试玩 11-22-2109 第 5 条）", () => {
  it("回本天数：只多卖几碗也要至少一天，卖不动就是零", () => {
    // 白送的东西也算「一天」——不写 0，免得界面出现「0 天回本」
    expect(paybackDays(0, 10, 4)).toBe(1);
    // 一点也多卖不出来的东西不给天数（0 就是「算了别买」）
    expect(paybackDays(150, 0, 4)).toBe(0);
    expect(paybackDays(150, 10, 0.5)).toBe(30);
    expect(paybackDays(150, 10, 4)).toBe(4);
    expect(paybackDays(150, 200, 4)).toBe(1);
  });

  it("行号是 1 起，表外的东西给 0（不骗人「在第 0 行」）", () => {
    expect(gearRowOf(GEARS[0].id)).toBe(1);
    expect(gearRowOf("no_such_gear")).toBe(0);
    expect(equipRowOf(EQUIPMENT[0].id)).toBe(1);
    expect(equipRowOf("no_such_equip")).toBe(0);
  });

  it("一碗能赚多少：价签减料钱，且不会算出负数", () => {
    const s = fresh();
    s.price = 9;
    expect(marginPerBowl(s)).toBeGreaterThan(0);
    s.price = 0.2;
    expect(marginPerBowl(s)).toBe(0.5);
  });

  it("座位紧的时候指到「家当」那一行，并给回本天数", () => {
    const s = fresh();
    s.venue.seats = 2;
    report(s, 60, 40);
    const line = todayLine(s);
    expect(line).not.toBeNull();
    expect(line!.main).toContain("矮凳");
    expect(line!.detail).toContain("天回本");
    expect(line!.detail).toContain("家当");
    expect(line!.gearId).toBeTruthy();
    expect(line!.detail).toContain(`第 ${gearRowOf(line!.gearId!)} 行`);
  });

  it("灶紧的时候指到「设备」那一行，并带上那一段的名字", () => {
    const s = fresh();
    s.venue.seats = 24;
    report(s, 70, 30);
    const line = todayLine(s);
    expect(line).not.toBeNull();
    expect(line!.equipId ?? line!.gearId).toBeTruthy();
    expect(line!.detail).toMatch(/设备|家当/);
  });

  it("给模型的上下文只有名词、没有数字，也没有钱", () => {
    const s = fresh();
    s.venue.seats = 2;
    report(s, 60, 40);
    const ctx = todayVoiceContext(todayLine(s)!);
    const text = JSON.stringify(ctx);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/¥|元|回本/);
    expect(Object.keys(ctx).length).toBeGreaterThan(0);
  });

  it("装备都置齐之后，仍然只给一件事（不会一次列好几件）", () => {
    const s = fresh();
    s.venue.seats = 40;
    s.capacity = 9_999;
    s.equipment = { stove: 4, pot: 4, strainer: 4, bench: 4 };
    s.gradeLevel = 11;
    for (const g of GEARS) if (s.cash > g.costYuan) buyGear(s, g.id);
    const line = todayLine(s);
    // 这时候轮到落场 / 街面之类的收尾内容：仍然是一句主句 + 一句副句
    if (line) {
      expect(line.main.length).toBeGreaterThan(6);
      // 主句是本地算的，带钱；只有给模型的那份上下文不许有数字
      expect(line.detail.length).toBeGreaterThan(4);
      expect(Object.keys(todayVoiceContext(line)).length).toBeGreaterThan(0);
    }
  });
});

describe("pointer 上下文（批 F′ 补）：服务端会把带数量词的整句丢掉", () => {
  it("座位紧时，「事」里不留「一位」「几碗」「两天」这类片段", () => {
    const s = fresh();
    s.venue.seats = 2;
    const line = todayLine(s)!;
    const ctx = todayVoiceContext(line);
    const QTY = /[一二两三四五六七八九十百千万]+(?:几|多)?(?:位|碗|元|块|天|人|张|个|家|份|次|名|斤)/;
    expect(ctx["事"]).not.toMatch(QTY);
    expect(ctx["事"]).not.toMatch(/[0-9¥]/);
  });
});

describe("回本给区间（批 H′，P273 / P275）", () => {
  it("区间下界不快于上界，下界按七五折的赚头算", () => {
    const [lo, hi] = paybackRange(150, 6, 4);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThanOrEqual(lo);
    expect(hi).toBe(paybackDays(150, 6, 3));
  });

  it("赚头足够好时区间收成一个数", () => {
    expect(paybackRange(100, 100, 9.99)).toEqual([1, 1]);
    expect(paybackWords(100, 100, 9.99)).toContain("约 1 天回本");
  });

  it("句子里一定带口径「按今天这碗算」", () => {
    const words = paybackWords(150, 6, 4);
    expect(words).toContain("按今天这碗算");
    expect(/约 \d+–\d+ 天回本|约 \d+ 天回本/.test(words)).toBe(true);
  });

  it("白送的东西不说回本天数", () => {
    expect(paybackWords(0, 6, 4)).toBe("不花钱，当天就见效");
  });

  it("卖不动（gain 为 0）时不说几天，改说看不清", () => {
    expect(paybackRange(150, 0, 4)).toEqual([0, 0]);
    expect(paybackWords(150, 0, 4)).toBe("看不清几天回本");
  });
});
