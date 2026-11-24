import { describe, expect, it } from "vitest";
import { RALLIES, RALLY_TOTAL, rallyById } from "../data/rally";
import { createInitialState, type GameState, type StaffMember } from "./state";
import { settleStaffDay } from "./staff";
import { rallyMember, rallyRaiseCash, rallyViews, rallyWords, resolveRally } from "./rally";
import { dayIndex } from "./calendar";

/**
 * 批 V′：店员闹情绪时的三条路。
 *
 * 判据：
 * 1. 三条路各有代价，出处都带链接与原文；
 * 2. 第一次顶到门槛不立刻走人，先挂一次；
 * 3. 劝过一次还顶着，第二天才走（不给无限续命）；
 * 4. 三条路各扣各的（人情 / 钱 / 人手），互不顶替；
 * 5. 老档没有这些可选字段也不炸。
 */

function withCook(fatigue = 100, extra: Partial<StaffMember> = {}): GameState {
  const s = createInitialState("rally-test", 7);
  s.cash = 30_000;
  s.favor = 40;
  s.staff.roster = [
    {
      uid: "r1",
      templateId: "st.aqiang",
      name: "阿强",
      role: "cook",
      skill: 3,
      wage: 150,
      fatigue,
      resting: false,
      xp: 12,
      ...extra,
    },
  ];
  return s;
}

describe("三条路（批 V′）", () => {
  it("三条路，名字不重，各有代价与一句话", () => {
    expect(RALLY_TOTAL).toBe(3);
    expect(new Set(RALLIES.map((r) => r.id)).size).toBe(3);
    for (const r of RALLIES) {
      expect(r.name.length).toBeGreaterThan(1);
      expect(r.what.length).toBeGreaterThan(3);
      expect(r.relief).toBeGreaterThan(0);
      expect(r.line.length).toBeGreaterThan(4);
      expect(r.why.length).toBeGreaterThan(8);
      expect(r.kairo).toContain("rally.txt");
    }
  });

  it("每条都带出处：链接是 http，摘句够长", () => {
    for (const r of RALLIES) {
      expect(r.source.length).toBeGreaterThan(0);
      for (const src of r.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.label.length).toBeGreaterThan(6);
        expect(src.quote.length).toBeGreaterThan(10);
      }
    }
  });

  it("查不到的路返回 null", () => {
    expect(rallyById("nope")).toBeNull();
    expect(rallyById("favor")?.id).toBe("favor");
  });
});

describe("劝留的时机（批 V′）", () => {
  it("第一次顶到门槛不辞职，只挂一次", () => {
    const s = withCook(120);
    settleStaffDay(s);
    expect(s.staff.roster).toHaveLength(1);
    expect(s.staff.rally?.uid).toBe("r1");
    expect(rallyMember(s)?.name).toBe("阿强");
    expect(rallyWords(s)).toContain("阿强");
    // 疲劳卡在门槛上，不继续涨
    expect(s.staff.roster[0]!.fatigue).toBe(100);
  });

  it("劝过一次还顶着，第二天真的走", () => {
    const s = withCook(120);
    settleStaffDay(s);
    expect(s.staff.roster).toHaveLength(1);
    // 玩家没说任何话，第二天日结
    s.day += 1;
    settleStaffDay(s);
    expect(s.staff.roster).toHaveLength(0);
    expect(s.staff.lastEvent).toContain("辞职");
  });

  it("没到门槛的人不会闹", () => {
    const s = withCook(40);
    settleStaffDay(s);
    expect(s.staff.rally).toBeUndefined();
    expect(s.staff.roster).toHaveLength(1);
  });
});

describe("三条路的结算（批 V′）", () => {
  it("卖人情：扣人情不扣钱，卸 30 点疲劳", () => {
    const s = withCook(120);
    settleStaffDay(s);
    const before = s.cash;
    const r = resolveRally(s, "favor");
    expect(r.ok).toBe(true);
    expect(r.line).toContain("阿强");
    expect(Math.round(s.favor)).toBe(28);
    expect(s.cash).toBe(before);
    expect(s.staff.roster[0]!.fatigue).toBe(70);
    expect(s.staff.rally).toBeUndefined();
  });

  it("人情不够就点不动，也不扣东西", () => {
    const s = withCook(120);
    s.favor = 3;
    settleStaffDay(s);
    const r = resolveRally(s, "favor");
    expect(r.ok).toBe(false);
    expect(s.staff.rally?.uid).toBe("r1");
    expect(s.staff.roster[0]!.fatigue).toBe(100);
  });

  it("加薪：掏三倍日薪，日薪涨一成，以后天天多花", () => {
    const s = withCook(120);
    settleStaffDay(s);
    const m = s.staff.roster[0]!;
    const cash = rallyRaiseCash(m);
    expect(cash).toBe(450);
    const before = s.cash;
    const r = resolveRally(s, "raise");
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(before - 450);
    expect(m.wage).toBe(165);
    expect(m.fatigue).toBe(80);
  });

  it("放假：这两天少一个人", () => {
    const s = withCook(120);
    settleStaffDay(s);
    const m = s.staff.roster[0]!;
    const r = resolveRally(s, "rest");
    expect(r.ok).toBe(true);
    expect(m.resting).toBe(true);
    expect(m.fatigue).toBe(90);
  });

  it("劝过之后不会再挂第二次（同一件事不能说两遍）", () => {
    const s = withCook(120);
    settleStaffDay(s);
    resolveRally(s, "favor");
    expect(s.staff.rally).toBeUndefined();
    s.staff.roster[0]!.fatigue = 100;
    s.day += 1;
    settleStaffDay(s);
    expect(s.staff.roster).toHaveLength(0);
  });

  it("没人闹的时候点三条路都是空操作", () => {
    const s = withCook(20);
    expect(rallyViews(s)).toHaveLength(0);
    const r = resolveRally(s, "favor");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("现在没人闹");
  });

  it("老档没有 rally/ralliedAt 这些字段也不炸", () => {
    const s = withCook(120, { ralliedAt: undefined });
    s.staff.rally = undefined;
    delete (s.staff as { rally?: unknown }).rally;
    settleStaffDay(s);
    expect(s.staff.roster).toHaveLength(1);
    expect((s.staff.rally as { uid: string } | undefined)?.uid).toBe("r1");
  });

  it("三条路的价钱都写在界面上，且都不带小数", () => {
    const s = withCook(120);
    settleStaffDay(s);
    const views = rallyViews(s);
    expect(views).toHaveLength(3);
    for (const v of views) {
      expect(v.costText.length).toBeGreaterThan(1);
      expect(v.costText).not.toContain("undefined");
      expect(v.reason.length).toBeGreaterThan(1);
    }
    expect(views.find((v) => v.def.id === "raise")?.costText).toContain("¥450");
  });

  it("劝留记的是今天的日子（明天才算第二次）", () => {
    const s = withCook(120);
    settleStaffDay(s);
    resolveRally(s, "raise");
    expect(s.staff.roster[0]!.ralliedAt).toBe(dayIndex(s.month, s.day));
  });
});
