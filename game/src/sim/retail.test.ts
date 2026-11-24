import { describe, expect, it } from "vitest";
import { CHANNELS, PRICE_CEIL, PRICE_FLOOR, RETAILS, RETAIL_TOTAL } from "../data/retail";
import { createInitialState, SAVE_VERSION } from "./state";
import { deserialize, serialize } from "./save";
import {
  channelOf,
  demandFactor,
  firstRetailMilestone,
  markRetailVoice,
  priceOf,
  retailBowlLoad,
  retailLines,
  retailOf,
  setChannel,
  setPrice,
  settleRetail,
  unitsOf,
} from "./retail";

function fresh(seed = 9) {
  return createInitialState("p1", seed);
}


describe("零售线（批次七）", () => {
  it("八款货齐全，每款都有出处与出厂价低于零售价", () => {
    expect(RETAILS).toHaveLength(RETAIL_TOTAL);
    for (const def of RETAILS) {
      expect(def.name.length).toBeGreaterThan(1);
      expect(def.costYuan).toBeGreaterThan(0);
      expect(def.suggestYuan).toBeGreaterThan(def.costYuan);
      expect(def.source.length).toBeGreaterThan(0);
      for (const src of def.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.quote.length).toBeGreaterThan(4);
      }
      expect(def.load).toBeGreaterThan(0);
    }
  });

  it("三条渠道：门口免抽成免门槛，便利店与电商都抽成、且门槛递增", () => {
    expect(CHANNELS).toHaveLength(3);
    const [door, shop, online] = CHANNELS;
    expect(door!.cut).toBe(0);
    expect(door!.gradeGate).toBe(0);
    expect(shop!.cut).toBeGreaterThan(0);
    expect(online!.cut).toBeGreaterThan(0);
    expect(shop!.gradeGate).toBeLessThan(online!.gradeGate);
    expect(online!.volume).toBeGreaterThan(shop!.volume);
    expect(online!.returnRate).toBeGreaterThan(0);
  });

  it("新局走门口渠道，价位是建议零售价", () => {
    const s = fresh();
    expect(channelOf(s).id).toBe("door");
    for (const def of RETAILS) expect(priceOf(s, def.id)).toBe(def.suggestYuan);
  });

  it("段位不够时换不了便利店与电商", () => {
    const s = fresh();
    expect(setChannel(s, "shop")).toBe(false);
    expect(setChannel(s, "online")).toBe(false);
    expect(channelOf(s).id).toBe("door");
    s.gradeLevel = 7;
    expect(setChannel(s, "online")).toBe(true);
    expect(channelOf(s).id).toBe("online");
    expect(setChannel(s, "nope")).toBe(false);
  });

  it("定价夹在七成到一成三倍之间", () => {
    const s = fresh();
    const def = RETAILS[0]!;
    const base = def.suggestYuan;
    expect(setPrice(s, def.id, base * 10)).toBe(true);
    expect(priceOf(s, def.id)).toBeCloseTo(base * PRICE_CEIL, 5);
    expect(setPrice(s, def.id, 0)).toBe(true);
    expect(priceOf(s, def.id)).toBeCloseTo(base * PRICE_FLOOR, 5);
  });

  it("价格越高需求越低", () => {
    const def = RETAILS[2]!;
    expect(demandFactor(def, def.suggestYuan * 0.8)).toBeGreaterThan(
      demandFactor(def, def.suggestYuan * 1.2),
    );
  });

  it("调价会真的让件数下降", () => {
    const s = fresh();
    s.gradeLevel = 7;
    setChannel(s, "shop");
    const def = RETAILS[0]!;
    const cheap = unitsOf(s, def.id);
    setPrice(s, def.id, def.suggestYuan * 1.28);
    const dear = unitsOf(s, def.id);
    expect(dear).toBeLessThan(cheap);
  });

  it("做货会占掉当天的碗", () => {
    const s = fresh();
    s.gradeLevel = 7;
    setChannel(s, "online");
    expect(retailBowlLoad(s)).toBeGreaterThan(0);
    expect(retailBowlLoad(s)).toBeLessThanOrEqual(unitsOf(s, RETAILS[0]!.id) * 4 + 1);
    setPrice(s, RETAILS[0]!.id, RETAILS[0]!.suggestYuan * PRICE_FLOOR);
    const before = retailBowlLoad(s);
    expect(before).toBeGreaterThan(0);
  });

  it("结算只结一次：净额进现金，件数进当天流水", () => {
    const s = fresh();
    s.gradeLevel = 7;
    setChannel(s, "shop");
    const cashBefore = s.cash;
    const lines = retailLines(s);
    expect(lines.length).toBe(RETAILS.length);
    const rt = settleRetail(s);
    expect(rt.units).toBeGreaterThan(0);
    expect(rt.net).toBeGreaterThan(0);
    expect(s.cash).toBeGreaterThan(cashBefore);
    expect(s.tally.retailSold ?? 0).toBe(rt.units);
  });

  it("某款卖到五十件时点名一次，之后不再点", () => {
    const s = fresh();
    const def = RETAILS[0]!;
    const stock = retailOf(s);
    stock.sold[def.id] = 49;
    expect(firstRetailMilestone(s)).toBeNull();
    stock.sold[def.id] = 52;
    const goods = firstRetailMilestone(s);
    expect(goods?.id).toBe(def.id);
    markRetailVoice(s, def.id);
    expect(firstRetailMilestone(s)).toBeNull();
  });

  it("存档是 34，旧档迁移后渠道退门口、价位回建议价", () => {
    const s = fresh();
    expect(SAVE_VERSION).toBe(37);
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 33;
    raw.retail = { channel: "nope", prices: { dry_noodle: 999 }, sold: { dry_noodle: -3 } };
    const back = deserialize(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(channelOf(back!)).toBeDefined();
    expect(channelOf(back!).id).toBe("door");
    const back9 = priceOf(back!, "dry_noodle");
    expect(back9).toBeGreaterThanOrEqual(RETAILS[0]!.suggestYuan * PRICE_FLOOR);
    expect(back9).toBeLessThanOrEqual(RETAILS[0]!.suggestYuan * PRICE_CEIL);
    expect(retailOf(back!).sold.dry_noodle ?? 0).toBe(0);
  });
});
