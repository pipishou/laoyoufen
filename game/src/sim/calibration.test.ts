import { describe, expect, it } from "vitest";
import { BASE_COST, TOPPINGS } from "../data/ingredients";
import { cheapestPrice } from "./menu";
import { createInitialState } from "./state";
import { walletFloor } from "./customer";

/**
 * 数值校准（第一项）：配料价目与钱包地板。
 *
 * 依据是开罗的两条形状，不是它的数：
 * ① 加料是「一碗之上加一点」，不是「再造一碗」——开罗浇头 80/120 对一碗 800–1200，
 *    我们是一份肉，比例该更高，但**高不过半碗**。
 * ② 谁都吃得起一碗——开罗最穷的钱包 840 ≥ 最便宜那碗 800。
 */

const BOWL_PRICE = 10;

describe("配料价目：加价不过半碗，料钱不过半价", () => {
  it("二十一条加价都在 ¥0.5–5.0（一碗 ¥10 的一半以内）", () => {
    expect(TOPPINGS.length).toBe(21);
    for (const t of TOPPINGS) {
      expect(t.price).toBeGreaterThanOrEqual(0.5);
      expect(t.price).toBeLessThanOrEqual(BOWL_PRICE / 2);
    }
  });

  it("料钱不超过加价的一半：每卖一份加料至少留一半毛利", () => {
    for (const t of TOPPINGS) {
      expect(t.cost).toBeLessThanOrEqual(t.price * 0.5 + 0.001);
      const margin = (t.price - t.cost) / t.price;
      expect(margin).toBeGreaterThanOrEqual(0.45);
    }
  });

  it("最贵的加料不贵过一碗粉本身，也不便宜过最便宜那碗的基础料钱", () => {
    const top = Math.max(...TOPPINGS.map((t) => t.price));
    expect(top).toBeLessThanOrEqual(BOWL_PRICE / 2);
    expect(top).toBeGreaterThan(BASE_COST);
  });

  it("贵的档料钱也贵：三档里最高档的料钱不低于最低档", () => {
    const byTier = (tier: number) => TOPPINGS.filter((t) => t.tier === tier);
    const maxCost = (tier: number) => Math.max(...byTier(tier).map((t) => t.cost));
    expect(maxCost(3)).toBeGreaterThanOrEqual(maxCost(2));
    expect(maxCost(2)).toBeGreaterThanOrEqual(maxCost(1));
  });
});

describe("钱包地板：谁都吃得起一碗（开罗 840 ≥ 800）", () => {
  it("预算低于最便宜那款时，钱包被抬到刚好买得起", () => {
    const s = createInitialState("wallet-floor", 1);
    const cheap = cheapestPrice(s);
    expect(cheap).toBeGreaterThan(0);
    expect(walletFloor(s, cheap - 3)).toBe(cheap);
  });

  it("预算够的时候一分不动", () => {
    const s = createInitialState("wallet-floor", 1);
    const rich = cheapestPrice(s) + 5;
    expect(walletFloor(s, rich)).toBe(rich);
  });

  it("价签抬上去，地板跟着抬；价签降下来，地板跟着降", () => {
    const s = createInitialState("wallet-floor", 1);
    const before = cheapestPrice(s);
    s.menu[0]!.price = before + 4;
    const up = cheapestPrice(s);
    expect(up).toBeGreaterThanOrEqual(before);
    expect(walletFloor(s, 1)).toBe(up);
  });
});
