import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { alignMarks, demotedWords, focusWords } from "./align";
import { slowestStation } from "./equipment";
import { STATION_EQUIP } from "../data/equipment";

/**
 * 批 AK′（解 P430）：同一天只允许一处喊「现在做这个」。
 *
 * 试玩 1619 三局两周的病灶是四处各算各的：打烊单、面板红标、设备段「最慢」、
 * 段位那颗「交费评定」（外加 HUD 那枚小牌）。这里的判据就是「只有一处红」。
 *
 * 纪律：这一批只改说法与红标，不动数值 —— 四种子必须逐位不变。
 */

/** 造一份「昨天走掉一堆人」的打烊记录（`lostSampleOf` 读 `state.days` 末条） */
function withYesterdayVisit(s: ReturnType<typeof createInitialState>, served: number, lost: number, queueOnly = true) {
  s.dayReport = null;
  s.days.push({
    month: 1,
    day: 1,
    revenue: 0,
    served,
    lost,
    avgSat: 60,
    price: 10,
    taste: 60,
    cash: 0,
    lostQueue: queueOnly ? lost : 0,
    lostPrice: queueOnly ? 0 : lost,
  } as never);
  return s;
}

function hotCount(m: ReturnType<typeof alignMarks>): number {
  return [m.seatHot, m.equipHot, m.expandHot, m.gearHot, m.gradeHot].filter(Boolean).length;
}

describe("今天只动这一件（批 AK′）", () => {
  it("开局：钩子落在能当天见效的家当上，其余三处都不亮", () => {
    const s = createInitialState("align-a", 1);
    const m = alignMarks(s);
    expect(m.focus.sec).toBe("gear");
    expect(m.gearHot).toBe(true);
    expect(hotCount(m)).toBe(1);
    expect(m.slowHot).toBe(false);
    expect(m.gradeHot).toBe(false);
    expect(m.hudGradeChip).toBe(false);
    // 设备段那行「最慢」是参考值，必须有一句灰字说明今天不动它
    expect(demotedWords(m)).toContain("最慢");
  });

  it("走的人全是排不下队：红标只落在产能那一处，家当段不跟着亮", () => {
    // 注：点座位还是点灶（P70）是另一条账，这里只管「只亮一处」。
    // 开局四座时 `capacityGain().seat(1)` 仍是 0，钩子会落到设备上 —— 这是既有事实，
    // 改它等于改替身会买什么，不属于只改说法的批次。
    const s = createInitialState("align-b", 1);
    withYesterdayVisit(s, 10, 30, true);
    const m = alignMarks(s);
    expect(m.focus.kind).toBe("capacity");
    expect(m.gearHot).toBe(false);
    expect(m.seatHot !== m.equipHot || m.expandHot).toBeTruthy();
    expect(hotCount(m)).toBe(1);
  });

  it("段位够格但今天该先接客：评定降级成灰字，HUD 那枚小牌也不出现", () => {
    const s = createInitialState("align-c", 1);
    s.totalCustomers = 400;
    s.cash = 30_000;
    withYesterdayVisit(s, 10, 30, true);
    const m = alignMarks(s);
    expect(m.focus.sec).not.toBe("grade");
    expect(m.gradeHot).toBe(false);
    expect(m.hudGradeChip).toBe(false);
    expect(demotedWords(m)).toContain("够格");
  });

  it("客人没走、段位够格：今天就是去评，设备段与家当都不亮", () => {
    const s = createInitialState("align-d", 1);
    s.totalCustomers = 400;
    s.cash = 30_000;
    s.dayReport = null;
    const m = alignMarks(s);
    expect(m.focus.sec).toBe("grade");
    expect(m.gradeHot).toBe(true);
    expect(m.hudGradeChip).toBe(true);
    expect(hotCount(m)).toBe(1);
    expect(demotedWords(m)).not.toContain("够格");
  });

  it("「最慢」只在今天这一件说的就是那一段设备时才高亮", () => {
    const s = createInitialState("align-e", 1);
    const slow = slowestStation(s);
    s.equipment.wok = 4;
    s.equipment.pot = 0;
    withYesterdayVisit(s, 10, 30, true);
    const m = alignMarks(s);
    const slowNow = slowestStation(s);
    if (m.focus.sec === "equip") {
      expect(m.slowHot).toBe(m.focus.equipId === STATION_EQUIP[slowNow.station]);
    } else {
      expect(m.slowHot).toBe(false);
    }
    expect(slow).toBeTruthy();
  });

  it("任何时候都只有一处红；两个出口的话术不为空", () => {
    const s = createInitialState("align-f", 1);
    const m = alignMarks(s);
    expect(hotCount(m)).toBeLessThanOrEqual(1);
    expect(focusWords(m.focus).length).toBeGreaterThan(0);
    expect(demotedWords(m)).not.toMatch(/\d+\s*元/);
    // 「没有该做的事」时抬头是空串，界面据此不写那一行
    const quiet = alignMarks({ ...s, cash: 0 } as typeof s);
    expect(typeof focusWords(quiet.focus)).toBe("string");
  });
});
