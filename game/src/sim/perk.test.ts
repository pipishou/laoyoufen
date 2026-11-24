import { describe, expect, it } from "vitest";
import {
  PERK_AWARD_BY_LEVEL,
  PERK_CAP,
  PERK_FAMILY_NAMES,
  PERK_POINT_TOTAL,
  PERKS,
  perkById,
} from "../data/perk";
import {
  buyPerk,
  perkEarned,
  perkFamilies,
  perkFavorCapBonus,
  perkOwned,
  perkPoints,
  perkServeDelta,
  perkSpent,
  perkSummary,
  perkTasteCap,
  perkToppingBonus,
  perkViews,
} from "./perk";
import { SAVE_VERSION, createInitialState } from "./state";
import { deserialize, serialize } from "./save";

const fresh = () => createInitialState("perk-test", 7);

describe("手艺点树（批 K′）", () => {
  it("十六项、四族各四、点数合计正好六十四", () => {
    expect(PERKS).toHaveLength(16);
    expect(Object.keys(PERK_FAMILY_NAMES)).toHaveLength(4);
    for (const fam of Object.keys(PERK_FAMILY_NAMES)) {
      expect(PERKS.filter((p) => p.family === fam)).toHaveLength(4);
    }
    expect(PERKS.reduce((n, p) => n + p.cost, 0)).toBe(64);
    expect(PERK_POINT_TOTAL).toBe(64);
    expect(PERK_AWARD_BY_LEVEL.reduce((n, v) => n + v, 0)).toBe(PERK_POINT_TOTAL);
  });

  it("点数按段位累加，封顶 64", () => {
    const s = fresh();
    s.gradeLevel = 0;
    expect(perkEarned(s)).toBe(0);
    s.gradeLevel = 1;
    expect(perkEarned(s)).toBe(PERK_AWARD_BY_LEVEL[0]);
    s.gradeLevel = 3;
    expect(perkEarned(s)).toBe((PERK_AWARD_BY_LEVEL[0] ?? 0) + (PERK_AWARD_BY_LEVEL[1] ?? 0) + (PERK_AWARD_BY_LEVEL[2] ?? 0));
    s.gradeLevel = 99;
    expect(perkEarned(s)).toBe(PERK_POINT_TOTAL);
  });

  it("点数不够就点不动，说还差几点", () => {
    const s = fresh();
    s.gradeLevel = 0;
    const first = PERKS[0]!;
    const r = buyPerk(s, first.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    expect(perkOwned(s, first.id)).toBe(false);
    const view = perkViews(s).find((v) => v.def.id === first.id);
    expect(view?.affordable).toBe(false);
  });

  it("点下一项：扣点、记上、不能重复点", () => {
    const s = fresh();
    s.gradeLevel = 2;
    const first = PERKS[0]!;
    const before = perkPoints(s);
    expect(buyPerk(s, first.id).ok).toBe(true);
    expect(perkOwned(s, first.id)).toBe(true);
    expect(perkPoints(s)).toBe(before - first.cost);
    const again = buyPerk(s, first.id);
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("点过");
  });

  it("四条出口各自封顶：味道 ≤6、浇头位 ≤2、出碗 ≤0.3 分、人情 ≤8", () => {
    const s = fresh();
    s.gradeLevel = 99;
    for (const p of PERKS) buyPerk(s, p.id);
    expect(perkSpent(s)).toBe(64);
    expect(perkTasteCap(s)).toBeLessThanOrEqual(PERK_CAP.taste);
    expect(perkToppingBonus(s)).toBeLessThanOrEqual(PERK_CAP.topping);
    expect(perkServeDelta(s)).toBeLessThanOrEqual(PERK_CAP.serve);
    expect(perkFavorCapBonus(s)).toBeLessThanOrEqual(PERK_CAP.favor);
    // 点满不等于全封顶：每条线只够一半多一点，靠玩家取舍
    expect(perkTasteCap(s)).toBeGreaterThan(0);
    expect(perkToppingBonus(s)).toBeGreaterThan(0);
  });

  it("抬头与分族视图", () => {
    const s = fresh();
    s.gradeLevel = 3;
    expect(perkSummary(s)).toContain("16");
    const fams = perkFamilies(s);
    expect(fams).toHaveLength(4);
    for (const f of fams) {
      expect(f.rows).toHaveLength(4);
      expect(f.total).toBe(4);
      expect(f.owned).toBe(0);
    }
  });

  it("每条都有白话：名字、效果、出处式说明", () => {
    for (const p of PERKS) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(p.why.length).toBeGreaterThan(6);
      expect(perkById(p.id)?.id).toBe(p.id);
    }
  });

  it("存档 37 往返：点过的项目跟着走", () => {
    expect(SAVE_VERSION).toBe(37);
    const s = fresh();
    s.gradeLevel = 2;
    buyPerk(s, PERKS[0]!.id);
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(perkOwned(back!, PERKS[0]!.id)).toBe(true);
    expect(back!.saveVersion).toBe(37);
  });

  it("v36 老档没有 perks：读进来当「一项没点」，脏值丢掉", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 36;
    delete raw.perks;
    const back = deserialize(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(Object.keys(back!.perks ?? {})).toHaveLength(0);

    const raw2 = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw2.saveVersion = 36;
    raw2.perks = { [PERKS[0]!.id]: 1, [PERKS[1]!.id]: 7, bad: true };
    const back2 = deserialize(JSON.stringify(raw2));
    expect(back2!.perks?.[PERKS[0]!.id]).toBe(1);
    expect(back2!.perks?.[PERKS[1]!.id]).toBeUndefined();
    expect(back2!.perks?.bad).toBe(1);
  });
});
