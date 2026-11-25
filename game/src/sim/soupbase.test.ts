import { describe, it, expect } from "vitest";
import {
  DEFAULT_SOUP_BASE,
  SOUP_BASES,
  SOUP_BASE_TOTAL,
  SOUP_BROTH,
  SOUP_PIPELINE,
  soupBaseById,
} from "../data/soupbase";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { scoreDish, selectDish, syncEditing } from "./menu";
import { setSoupBase, soupBaseSummary, soupBaseViews, soupBrothWords, soupDeltaWords } from "./soupbase";

function fresh() {
  const s = createInitialState("test-soupbase", 7);
  s.totalCustomers = 0;
  return s;
}

describe("汤底三底（批 Z′）", () => {
  it("三条底、id 唯一、都有说法与出处", () => {
    expect(SOUP_BASE_TOTAL).toBe(3);
    expect(new Set(SOUP_BASES.map((b) => b.id)).size).toBe(3);
    for (const b of SOUP_BASES) {
      expect(b.name.length).toBeGreaterThanOrEqual(2);
      expect(b.look.length).toBeGreaterThanOrEqual(8);
      expect(b.line.length).toBeGreaterThanOrEqual(8);
      expect(b.why.length).toBeGreaterThanOrEqual(12);
      expect(b.kairo.length).toBeGreaterThanOrEqual(4);
      expect(b.source.length).toBeGreaterThanOrEqual(1);
      for (const src of b.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.quote.length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("默认底是零偏移（老档与没选过的碗都不动数）", () => {
    const def = soupBaseById(undefined);
    expect(def.id).toBe(DEFAULT_SOUP_BASE);
    expect(def.costDelta).toBe(0);
    expect(def.soupDelta).toBe(0);
    // 脏 id 也回默认底，不炸
    expect(soupBaseById("nope").id).toBe(DEFAULT_SOUP_BASE);
  });

  it("没有「又便宜又好喝」的一底", () => {
    for (const b of SOUP_BASES) {
      if (b.costDelta <= 0) expect(b.soupDelta).toBeLessThanOrEqual(0);
      if (b.soupDelta > 0) expect(b.costDelta).toBeGreaterThan(0);
    }
  });

  it("换番茄底：汤底分 +3、料钱贵五毛", () => {
    const s = fresh();
    s.totalCustomers = 500;
    const before = scoreDish(s.menu[0], s);
    expect(setSoupBase(s, "tomato").ok).toBe(true);
    syncEditing(s);
    const after = scoreDish(s.menu[0], s);
    const tomato = soupBaseById("tomato");
    // 汤底分到 100 封顶，所以按封顶后的差算（默认碗本来就接近满）
    expect(after.soup - before.soup).toBe(Math.min(100, before.soup + tomato.soupDelta) - before.soup);
    expect(Math.round((after.cost - before.cost) * 100) / 100).toBe(tomato.costDelta);
    // 不碰任何乘数侧的出口
    expect(after.total).toBeGreaterThanOrEqual(before.total);
    expect(after.grade).toBeTruthy();
  });

  it("客人不够时点不动，理由写差几位", () => {
    const s = fresh();
    s.totalCustomers = 10;
    const r = setSoupBase(s, "piglioo");
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toContain("还差");
    expect(r.reason ?? "").toContain("390");
    expect(s.recipe.base).toBeUndefined();
  });

  it("点了就是在用的那一底，再点一次说「本来就是」", () => {
    const s = fresh();
    s.totalCustomers = 500;
    expect(setSoupBase(s, "tomato").ok).toBe(true);
    expect(soupBaseViews(s).find((v) => v.on)?.def.id).toBe("tomato");
    const again = setSoupBase(s, "tomato");
    expect(again.ok).toBe(false);
    expect(again.reason ?? "").toContain("本来就是");
  });

  it("换底要落笔：切到别的款再切回来还在", () => {
    const s = fresh();
    s.totalCustomers = 500;
    // 加第二款
    s.menu.push({ ...s.menu[0], id: 2, price: 13 });
    setSoupBase(s, "piglioo");
    syncEditing(s);
    expect(s.menu[0].recipe.base).toBe("piglioo");
    selectDish(s, 1);
    expect(s.recipe.base).toBeUndefined();
    selectDish(s, 0);
    expect(s.recipe.base).toBe("piglioo");
  });

  it("摘要写得出「骨汤 + 哪一味」与两个偏移", () => {
    const s = fresh();
    s.totalCustomers = 500;
    expect(soupBaseSummary(s)).toContain("骨头汤 + 酸笋");
    setSoupBase(s, "piglioo");
    const words = soupBaseSummary(s);
    expect(words).toContain("骨头汤 + 猪脚卤水");
    expect(words).toContain("汤底 +5");
    expect(words).toContain("料钱 +¥1.2");
  });

  it("骨汤是共同底，三道工序固定不随选哪一底变（批 Z″）", () => {
    expect(SOUP_BROTH).toBe("骨头汤");
    expect(SOUP_PIPELINE.map((x) => x.name)).toEqual(["吊骨汤", "爆香", "冲汤下粉"]);
    // 爆香那一步必须点明四样料（用户给的老友粉工序）
    const fry = SOUP_PIPELINE[1].what;
    for (const w of ["酸笋", "豆豉", "蒜末", "辣椒"]) expect(fry).toContain(w);
    // 汤是「第三步才冲进去的」，不是拿别的东西换掉骨汤
    expect(SOUP_PIPELINE[2].what).toContain("骨汤");
    // 每一底的 look 都不写「换掉骨汤」
    for (const b of SOUP_BASES) expect(b.look).not.toContain("换骨汤");
    expect(soupBrothWords()).toContain("骨头汤打底");
    expect(soupBrothWords()).toContain("爆香");
  });

  it("底只写「骨汤之外另加的那一味」，默认底加的是酸笋", () => {
    expect(SOUP_BASES.map((b) => b.extra)).toEqual(["酸笋", "番茄", "猪脚卤水"]);
    expect(soupBaseById(DEFAULT_SOUP_BASE).extra).toBe("酸笋");
    for (const b of SOUP_BASES) expect(b.extra.length).toBeGreaterThan(0);
  });

  it("汤底分那几点说得清是谁给的（解 P390）", () => {
    const s = fresh();
    s.totalCustomers = 500;
    // 默认底不加分，也不写话
    expect(soupDeltaWords(s)).toBe("");
    setSoupBase(s, "tomato");
    expect(soupDeltaWords(s)).toContain("+3");
    expect(soupDeltaWords(s)).toContain("番茄底");
    expect(soupDeltaWords(s)).toContain("番茄");
  });

  it("一分汤底换多少料钱：三底都在两毛上下，没有白送的（解 P393）", () => {
    for (const b of SOUP_BASES) {
      if (b.soupDelta === 0) continue;
      const perPoint = b.costDelta / b.soupDelta;
      expect(perPoint).toBeGreaterThan(0.12);
      expect(perPoint).toBeLessThan(0.3);
    }
  });

  it("存档往返带着底，老档没有底也读得回来", () => {
    const s = fresh();
    s.totalCustomers = 500;
    setSoupBase(s, "tomato");
    syncEditing(s);
    const back = deserialize(serialize(s))!;
    expect(back.menu[0].recipe.base).toBe("tomato");
    // 老档：删掉两处 base
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    const menu = raw.menu as Array<{ recipe: Record<string, unknown> }>;
    delete menu[0].recipe.base;
    delete (raw.recipe as Record<string, unknown>).base;
    const old = deserialize(JSON.stringify(raw))!;
    expect(old.menu[0].recipe.base).toBeUndefined();
    expect(soupBaseById(old.recipe.base).id).toBe(DEFAULT_SOUP_BASE);
  });
});
