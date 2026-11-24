import { describe, expect, it } from "vitest";
import { RIVALS } from "../data/rivals";
import { createInitialState } from "./state";
import { PRICE_WAR_CAP, TASTE_SHIELD, priceWarMult, priceWarWords, rivalPrices, shieldedBy } from "./price-war";

/**
 * 比价（批次 4.5）：同行菜单从一款变两款之后，
 * 「压价」才是一个有对手的决策，而不是唯一解。
 *
 * 这组测试锁四件事：
 *   ① 十六家同行都有第二款，价格落在真南宁的 ¥5–20；
 *   ② 比价只看「他家最便宜那碗」，而且只算还在开的；
 *   ③ 贵了扣、便宜了加，两边都有上限；
 *   ④ 味道领先一大截时，价牌不再算数（不然压价又变成唯一解）。
 */

const fresh = () => {
  const s = createInitialState("p-pricewar", 7);
  s.district = "xingning";
  return s;
};

function setPrice(s: ReturnType<typeof fresh>, price: number) {
  s.menu[0]!.price = price;
  s.price = price;
}

describe("同行菜单：每家有第二款", () => {
  it("十六家都有第二款，名字与价格都在真南宁的价位上", () => {
    expect(RIVALS).toHaveLength(16);
    for (const r of RIVALS) {
      expect(r.signature.name.length).toBeGreaterThan(1);
      expect(r.second.name.length).toBeGreaterThan(1);
      expect(r.second.name).not.toBe(r.signature.name);
      expect(r.second.price).toBeGreaterThanOrEqual(5);
      expect(r.second.price).toBeLessThanOrEqual(20);
      expect(r.second.taste).toBeGreaterThan(30);
      // 干榨（生榨米粉）也是南宁本地粉型，第二批同行里有三家卖它
      expect(["flat", "round", "wetchow", "claypot", "yifu", "dry"]).toContain(r.second.noodle);
    }
  });

  it("第二款不是主打的复制品：十六家里至少十二家的主料不同", () => {
    const diff = RIVALS.filter((r) => r.second.main !== r.signature.main).length;
    expect(diff).toBeGreaterThanOrEqual(6);
  });
});

describe("比价行：只看还在开的、按中间价比", () => {
  it("新局只有本区两家在卖，中间价是两款的平均", () => {
    const rows = rivalPrices(fresh());
    expect(rows.map((r) => r.id).sort()).toEqual(["laogan", "sanjie"]);
    const laogan = rows.find((r) => r.id === "laogan")!;
    // 猪杂粉 ¥9 ／ 牛腩粉 ¥12 → 中间价 ¥10.5
    expect(laogan.price).toBe(10.5);
    expect(laogan.dish).toContain("猪杂粉");
    const sanjie = rows.find((r) => r.id === "sanjie")!;
    // 瘦肉粉 ¥8 ／ 素粉 ¥6 → 中间价 ¥7
    expect(sanjie.price).toBe(7);
  });

  it("关门的同行不算比价", () => {
    const s = fresh();
    s.rivals = s.rivals.map((r) => (r.id === "sanjie" ? { ...r, closed: true } : r));
    expect(rivalPrices(s).map((r) => r.id)).toEqual(["laogan"]);
  });

  it("gap 是我减他：贵了正、便宜了负，最贵的排最前", () => {
    const s = fresh();
    setPrice(s, 10);
    const rows = rivalPrices(s);
    expect(rows[0]!.id).toBe("sanjie");
    expect(rows[0]!.gap).toBe(3);
    expect(rows.find((r) => r.id === "laogan")!.gap).toBe(-0.5);
    setPrice(s, 6);
    const cheap = rivalPrices(s);
    expect(cheap.every((r) => r.gap <= 0)).toBe(true);
  });
});

describe("比价乘数：两边都有上限，味道压得住时价牌不算数", () => {
  it("比同行贵时进店变少，且不低于 −12%", () => {
    const s = fresh();
    setPrice(s, 14);
    const m = priceWarMult(s);
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThanOrEqual(1 - PRICE_WAR_CAP);
  });

  it("比同行便宜时进店变多，且不超过 +6%", () => {
    const s = fresh();
    setPrice(s, 5);
    const m = priceWarMult(s);
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(1 + PRICE_WAR_CAP / 2 + 1e-9);
  });

  it("味道高出同行一大截才算压得住：门槛是 10 分", () => {
    // 老甘最好的一碗是 66 分：76 分以上就不看他的价牌，75 分还看
    expect(shieldedBy(76, 66)).toBe(true);
    expect(shieldedBy(75, 66)).toBe(false);
    expect(shieldedBy(66 + TASTE_SHIELD - 1, 66)).toBe(false);
    // 新局这碗味道还不够，价牌照算
    const s = fresh();
    setPrice(s, 14);
    expect(rivalPrices(s).every((r) => r.shielded)).toBe(false);
  });

  it("这条街没有同行时，乘数是 1，话也说得明白", () => {
    const s = fresh();
    s.rivals = s.rivals.map((r) => ({ ...r, closed: true }));
    expect(priceWarMult(s)).toBe(1);
    expect(priceWarWords(s)).toContain("没有同行");
  });
});

describe("比价那句话", () => {
  it("贵了说贵多少、便宜了说便宜多少，都带店名与价", () => {
    const s = fresh();
    setPrice(s, 10);
    const words = priceWarWords(s);
    expect(words).toContain("¥10");
    expect(words).toMatch(/三姐粉摊|老甘饮食店/);
    expect(words).toContain("贵");

    setPrice(s, 5);
    expect(priceWarWords(s)).toContain("便宜");
  });
});
