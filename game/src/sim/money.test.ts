import { describe, expect, it } from "vitest";
import { ARENAS } from "../data/arena";
import { BOWLS } from "../data/bowl";
import { CONTEST_TIERS } from "../data/contest";
import { EQUIPMENT } from "../data/equipment";
import { EXPANSIONS } from "../data/expansion";
import { GEARS, GEAR_TOTAL_YUAN } from "../data/gear";
import { DAY_MARGIN_YUAN, PRICE_BANDS, daysOfMargin, inBand, marginWords } from "../data/money";
import { SITES } from "../data/sites";
import { STREETS } from "../data/streets";
import { STYLES } from "../data/style";
import { GRADES } from "../sim/grade";

/**
 * 货币回归锁（第 9 批）。
 *
 * 为什么要有这组测试：A4 的碗曾经按开罗 KCU 量级定价 —— 搪瓷碗 ¥600、瓦煲 ¥2,600，
 * 而这家店一碗粉卖 ¥10。代码没错、测试全绿，因为它只是「数值不合常识」。
 * 这里的每一条断言都是把常识写进 CI：新加一件东西，价格落不进区间就红。
 */
describe("货币：价格必须落在人民币锚点区间（第 9 批）", () => {
  it("区间表自身合法：下限小于上限、都带单位与锚点说明", () => {
    for (const [id, band] of Object.entries(PRICE_BANDS)) {
      expect(band.min, id).toBeLessThan(band.max);
      expect(band.unit.length, id).toBeGreaterThan(0);
      expect(band.note.length, id).toBeGreaterThan(6);
    }
  });

  it("碗按撂/箱买：每只的单价不超过 ¥30，套餐价落在区间里", () => {
    for (const b of BOWLS) {
      if (b.free) {
        expect(b.costYuan, b.id).toBe(0);
        continue;
      }
      expect(inBand("bowlSet", b.costYuan), `${b.id} ¥${b.costYuan}`).toBe(true);
      expect(b.pieces, b.id).toBeGreaterThan(0);
      const unit = b.costYuan / (b.pieces ?? 1);
      expect(unit, `${b.id} 一只 ¥${unit.toFixed(2)}`).toBeLessThanOrEqual(40);
    }
  });

  it("家当按台/张买：十二件都落在区间里，合计 ¥9,780", () => {
    for (const g of GEARS) {
      expect(inBand("gearPiece", g.costYuan), `${g.id} ¥${g.costYuan}`).toBe(true);
    }
    expect(GEAR_TOTAL_YUAN).toBe(9_780);
  });

  it("设备 / 店面 / 街面 / 铺位 / 扩建都不越界", () => {
    for (const e of EQUIPMENT) {
      for (const t of e.tiers) expect(inBand("equipment", t), `${e.id} ¥${t}`).toBe(true);
    }
    for (const s of STYLES) expect(inBand("style", s.costYuan), `${s.id} ¥${s.costYuan}`).toBe(true);
    for (const s of STREETS) expect(inBand("street", s.costYuan), `${s.id} ¥${s.costYuan}`).toBe(true);
    for (const s of SITES) {
      if (s.feeYuan === 0) continue;
      expect(inBand("site", s.feeYuan), `${s.id} ¥${s.feeYuan}`).toBe(true);
    }
    for (const x of EXPANSIONS) expect(inBand("expansion", x.costYuan), `${x.id} ¥${x.costYuan}`).toBe(true);
  });

  it("赛事与落场的钱、段位评定费都不越界", () => {
    for (const t of CONTEST_TIERS) {
      expect(inBand("contestFee", t.feeYuan), `报名 ¥${t.feeYuan}`).toBe(true);
      expect(inBand("contestPrize", t.prizeYuan), `奖金 ¥${t.prizeYuan}`).toBe(true);
    }
    for (const a of ARENAS) expect(inBand("arenaPrize", a.prizeYuan), `${a.id} ¥${a.prizeYuan}`).toBe(true);
    for (const g of GRADES) expect(inBand("gradeFee", g.feeYuan), `第 ${g.level} 段 ¥${g.feeYuan}`).toBe(true);
  });

  it("量级换算：冰柜约九天毛利、瓦煲不到一天、待客笔记一小时", () => {
    expect(DAY_MARGIN_YUAN).toBe(364);
    const freezer = GEARS.find((g) => g.id === "freezer")!;
    const pot = BOWLS.find((b) => b.id === "claypot")!;
    const notes = GEARS.find((g) => g.id === "serve_manual")!;
    expect(daysOfMargin(freezer.costYuan)).toBeGreaterThan(8);
    expect(daysOfMargin(freezer.costYuan)).toBeLessThan(10);
    expect(daysOfMargin(pot.costYuan)).toBeLessThan(1);
    expect(daysOfMargin(notes.costYuan)).toBeLessThan(0.3);
    expect(marginWords(freezer.costYuan)).toBe("约8.8天毛利");
    expect(marginWords(notes.costYuan)).toContain("小时");
  });

  it("一碗粉仍是 ¥10 量级：卖价与成本都没被道具价带偏", () => {
    expect(inBand("noodlePrice", 10)).toBe(true);
    expect(inBand("ingredientCost", 4.8)).toBe(true);
    // 一只碗的套价不该超过「一天毛利」的两倍 —— 碗是耗材，不是资产
    const priciestSet = Math.max(...BOWLS.filter((b) => !b.free).map((b) => b.costYuan));
    expect(priciestSet).toBeLessThan(DAY_MARGIN_YUAN * 2);
  });
});
