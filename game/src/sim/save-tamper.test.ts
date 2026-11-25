import { describe, expect, it } from "vitest";
import { advanceMinute, createInitialState, SAVE_VERSION, type GameState } from "./state";
import { deserialize, serialize } from "./save";
import { perkTasteCap } from "./perk";

/**
 * 存档篡改五路（批 AL′，2026-11-25）。
 *
 * 来历：读三个「游戏工作室」移植版的 `/security-audit` 清单时发现，
 * 我们的 `save.ts` 有 v36→v37 的白名单清洗，但**只测过 perk 脏值**，
 * 真正的五种篡改（浏览器里直接改 localStorage、类型翻转、超长串、负数、跨档复制）
 * 一条都没进过 `vitest`。这份文件就是那五条。
 *
 * 判据不是「一律拒收」——单机离线游戏改自己的档不算作弊，
 * 判据是**改坏了也不能把游戏带进 NaN 或崩掉**：
 *   ① 形状不对 → 拒收（返回 null），让调用方去开新档；
 *   ② 形状对但数值离谱 → 收下，但派生量必须仍是有限数，存档必须还能再存再读；
 *   ③ 未知 id → 收下但不生效（认不出来的键不计入任何加成）。
 */

function freshState(): GameState {
  const s = createInitialState("probe-tamper", 7);
  s.phase = "prep";
  return s;
}

/** 拿一份干净档，按 fn 改坏，再序列化成字符串（模拟在 localStorage 里手改） */
function tampered(fn: (blob: Record<string, any>) => void): string {
  const blob = JSON.parse(serialize(freshState())) as Record<string, any>;
  fn(blob);
  return JSON.stringify(blob);
}

/** 收下之后必须仍能算钱、仍能开工 */
function assertPlayable(s: GameState): void {
  expect(Number.isFinite(s.cash)).toBe(true);
  expect(Number.isFinite(s.price)).toBe(true);
  expect(Number.isFinite(s.reputation)).toBe(true);
  expect(Number.isFinite(s.venue.seats)).toBe(true);
  s.phase = "open";
  s.flow.minuteOfDay = 60;
  for (let i = 0; i < 12; i += 1) advanceMinute(s);
  expect(Number.isFinite(s.flow.revenueToday)).toBe(true);
  expect(Number.isFinite(s.flow.servedToday)).toBe(true);
  expect(Number.isFinite(s.flow.lostToday)).toBe(true);
  expect(Number.isFinite(s.flow.minuteOfDay)).toBe(true);
  expect(Number.isNaN(s.flow.revenueToday)).toBe(false);
}

describe("存档篡改五路（批 AL′）", () => {
  it("① 类型翻转：把数字改成字符串 / null → 整份拒收", () => {
    expect(deserialize(tampered((b) => { b.cash = "99999"; }))).toBeNull();
    expect(deserialize(tampered((b) => { b.venue.seats = "6"; }))).toBeNull();
    expect(deserialize(tampered((b) => { b.price = null; }))).toBeNull();
    expect(deserialize(tampered((b) => { b.flow.customers = [{ id: "x" }]; }))).toBeNull();
    // 不是对象、不是合法 JSON 也一样
    expect(deserialize("[]")).toBeNull();
    expect(deserialize("not json at all")).toBeNull();
    expect(deserialize("")).toBeNull();
  });

  it("② 负数与极端值：收下，但不许算出 NaN", () => {
    const raw = tampered((b) => {
      b.venue.seats = -5;
      b.cash = -1_000_000_000_000;
      b.price = 0;
      b.reputation = 0;
    });
    const s = deserialize(raw);
    // 目前这几种都能进得来（`isGameState` 只要求「有限数」）。
    // 负座位是 P436：修好之后这里应改成 `toBeNull()`，这条断言就是那笔账。
    expect(s, "P436：负数座位目前进得来").not.toBeNull();
    assertPlayable(s as GameState);
    // 收下之后仍必须能再存再读
    expect(deserialize(serialize(s as GameState))).not.toBeNull();
  });

  it("③ 未知 id：收下但不生效", () => {
    const raw = tampered((b) => {
      // 认不出来的手艺不该加任何点数；认得出的那条照常算（heat_taste_1 = 味道末段 +2）
      b.perks = { hack_all_might: 1, heat_taste_1: 1 };
      b.collection.toppings = ["top.nope", "top.friedegg"];
      b.menuAlias = { "9999": "不存在的款" };
    });
    const s = deserialize(raw);
    expect(s).not.toBeNull();
    const loaded = s as GameState;
    expect(perkTasteCap(loaded)).toBe(2);
    assertPlayable(loaded);
    // 未知浇头不会凭空出现成已解锁的条目
    expect(loaded.collection.toppings.filter((id) => id === "top.nope")).toHaveLength(1);
  });

  it("④ 跨档复制：别人的档能读（无设备绑定），未来版本号拒收", () => {
    const copied = tampered((b) => {
      b.playerId = "someone-else";
      b.shopName = "别人的店";
    });
    const s = deserialize(copied);
    expect(s, "单机离线：档不绑设备，换台机器也读得动").not.toBeNull();
    expect((s as GameState).shopName).toBe("别人的店");
    // 版本号来自未来 → 不知道它多了什么字段，只能拒收
    expect(deserialize(tampered((b) => { b.saveVersion = SAVE_VERSION + 1; }))).toBeNull();
    expect(deserialize(tampered((b) => { b.saveVersion = "37"; }))).toBeNull();
    // 老版本号（v36）仍要能读：迁移只认真正点过的 perk
    const old = tampered((b) => {
      b.saveVersion = 36;
      b.perks = { heat_taste_1: 1, heat_taste_2: 7, heat_serve_1: true, bogus: 1 };
    });
    const migrated = deserialize(old);
    expect(migrated).not.toBeNull();
    expect(Object.keys((migrated as GameState).perks ?? {}).sort()).toEqual(["heat_serve_1", "heat_taste_1"]);
  });

  it("⑤ 超长串：收下，且再存再读不炸", () => {
    const raw = tampered((b) => {
      b.shopName = "长".repeat(4000);
      b.staff.roster = [
        {
          uid: "u1",
          templateId: "st.aqiang",
          name: "名".repeat(4000),
          role: "cook",
          skill: 3,
          wage: 150,
          fatigue: 0,
          resting: false,
        },
      ];
      b.collection.toppings = Array.from({ length: 2000 }, (_, i) => `top.nope_${i}`);
    });
    const s = deserialize(raw);
    expect(s).not.toBeNull();
    assertPlayable(s as GameState);
    const again = serialize(s as GameState);
    expect(deserialize(again), "超长串不能让档变成读不回来的那种").not.toBeNull();
    // 目前长度不设上限（P437）。修好后把这条改成 `expect(loaded.shopName.length).toBeLessThanOrEqual(12)`。
    expect((s as GameState).shopName.length).toBe(4000);
  });
});
