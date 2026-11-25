import { describe, expect, it } from "vitest";
import { markManualRead, manualHasRead, manualRead, manualReadCount, manualReadWords } from "./manual";
import { MANUAL_TOTAL } from "../data/manual";
import { createInitialState } from "./state";

/**
 * 手册读过标记（批 AD′，解 P387）。
 *
 * 纪律：只记读没读、不给任何奖励、老档没有这个字段就当一页没读。
 */

describe("手册读过标记（批 AD′）", () => {
  it("开局一页没读", () => {
    const s = createInitialState("p", 1);
    expect(manualReadCount(s)).toBe(0);
    expect(manualReadWords(s)).toBe("还没翻过");
    expect(manualHasRead(s, "m.seats")).toBe(false);
  });

  it("读过的页记得住，同一页只记一次", () => {
    const s = createInitialState("p", 1);
    expect(markManualRead(s, "m.seats")).toBe(true);
    expect(markManualRead(s, "m.seats")).toBe(false);
    expect(manualRead(s)).toEqual(["m.seats"]);
    expect(manualHasRead(s, "m.seats")).toBe(true);
  });

  it("空 id 不记", () => {
    const s = createInitialState("p", 1);
    expect(markManualRead(s, "")).toBe(false);
    expect(manualReadCount(s)).toBe(0);
  });

  it("进度写得出，全读完换个说法，且封在总页数上", () => {
    const s = createInitialState("p", 1);
    markManualRead(s, "m.seats");
    markManualRead(s, "m.traffic");
    expect(manualReadWords(s)).toContain("翻过 2 页");
    expect(manualReadWords(s)).toContain(`还剩 ${MANUAL_TOTAL - 2} 页`);
    // 老档被人手改脏（多出来两页）也不显示超过总数
    s.manual = { read: new Array(MANUAL_TOTAL + 2).fill("x") };
    expect(manualReadCount(s)).toBe(MANUAL_TOTAL);
    expect(manualReadWords(s)).toBe("全翻过了");
  });

  it("老档没有 manual 字段也读得动", () => {
    const s = createInitialState("p", 1);
    delete (s as { manual?: unknown }).manual;
    expect(manualRead(s)).toEqual([]);
    expect(markManualRead(s, "m.taste")).toBe(true);
    expect(manualReadCount(s)).toBe(1);
  });
});
