import { describe, expect, it } from "vitest";
import { SKILL_BRANCHES, SKILL_TOTAL, FAMILY_NAMES, branchesOfFamily, skillById } from "../data/skill";
import { SAVE_VERSION, createInitialState } from "./state";
import { deserialize, serialize } from "./save";
import {
  SKILL_CAP,
  branchMastered,
  learnSkill,
  skillAttractMult,
  skillBonus,
  skillCostFactor,
  skillCount,
  skillEffectWords,
  skillLevelOf,
  skillPatienceMult,
  skillSatBonus,
  skillServeFactor,
  skillSummary,
  skillViews,
} from "./skill";

function fresh() {
  return createInitialState("p1", 7);
}

describe("手上的功夫（批次 6）", () => {
  it("十二支、每支三级、四个门派各三支", () => {
    expect(SKILL_BRANCHES).toHaveLength(12);
    expect(SKILL_TOTAL).toBe(36);
    expect(Object.keys(FAMILY_NAMES)).toHaveLength(4);
    for (const fam of ["heat", "knife", "host", "trade"] as const) {
      expect(branchesOfFamily(fam)).toHaveLength(3);
    }
    for (const b of SKILL_BRANCHES) expect(b.levels).toHaveLength(3);
    expect(skillById("wok_fire")?.name).toBe("看火");
    expect(skillById("nope")).toBeUndefined();
  });

  it("每一级的门槛逐级变贵、每支都有一句人话", () => {
    for (const b of SKILL_BRANCHES) {
      for (let i = 0; i < 3; i += 1) {
        const lv = b.levels[i]!;
        expect(lv.line.length).toBeGreaterThan(6);
        expect(lv.favorCost).toBeGreaterThan(0);
        expect(lv.costYuan).toBeGreaterThan(0);
        if (i > 0) {
          expect(lv.favorCost).toBeGreaterThanOrEqual(b.levels[i - 1]!.favorCost);
          expect(lv.costYuan).toBeGreaterThanOrEqual(b.levels[i - 1]!.costYuan);
        }
      }
    }
  });

  it("新局一个节点都没练，五条乘数都是原值", () => {
    const s = fresh();
    expect(skillCount(s)).toBe(0);
    expect(skillSummary(s)).toBe("0 / 36 节点");
    expect(skillBonus(s)).toEqual({ servePct: 0, costPct: 0, patiencePct: 0, satBonus: 0, attractPct: 0 });
    expect(skillServeFactor(s)).toBe(1);
    expect(skillCostFactor(s)).toBe(1);
    expect(skillPatienceMult(s)).toBe(1);
    expect(skillSatBonus(s)).toBe(0);
    expect(skillAttractMult(s)).toBe(1);
  });

  it("人情不够就练不了，理由里带数", () => {
    const s = fresh();
    s.favor = 0;
    s.cash = 100_000;
    const r = learnSkill(s, "wok_fire");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("人情");
    expect(skillLevelOf(s, "wok_fire")).toBe(0);
  });

  it("钱不够也练不了", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 0;
    const r = learnSkill(s, "wok_fire");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("¥");
  });

  it("练一级扣人情扣钱，写进 state.skills", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    const r = learnSkill(s, "wok_fire");
    expect(r.ok).toBe(true);
    expect(r.level).toBe(1);
    expect(r.line).toBe("火苗别让它趴下，锅边一直有响。");
    expect(skillLevelOf(s, "wok_fire")).toBe(1);
    expect(s.favor).toBe(92);
    expect(s.cash).toBe(9_800);
    expect(skillServeFactor(s)).toBeCloseTo(0.97, 5);
  });

  it("必须一级一级练，练满了再练会被拒", () => {
    const s = fresh();
    s.favor = 500;
    s.cash = 100_000;
    for (let i = 0; i < 3; i += 1) expect(learnSkill(s, "wok_fire").ok).toBe(true);
    expect(branchMastered(s, "wok_fire")).toBe(true);
    const r = learnSkill(s, "wok_fire");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("练满");
  });

  it("依次练三级，效果逐级叠加（不是只认最后一级）", () => {
    const s = fresh();
    s.favor = 1_000;
    s.cash = 100_000;
    learnSkill(s, "wok_fire");
    const lv1 = skillBonus(s).servePct;
    learnSkill(s, "wok_fire");
    const lv2 = skillBonus(s).servePct;
    learnSkill(s, "wok_fire");
    const lv3 = skillBonus(s).servePct;
    expect(lv1).toBeCloseTo(0.03, 5);
    expect(lv2).toBeCloseTo(0.07, 5);
    expect(lv3).toBeCloseTo(0.12, 5);
    expect(skillServeFactor(s)).toBeCloseTo(0.88, 5);
  });

  it("三十六节点全练满时五条出口都被 SKILL_CAP 夹住", () => {
    const s = fresh();
    s.favor = 100_000;
    s.cash = 10_000_000;
    for (const b of SKILL_BRANCHES) for (let i = 0; i < 3; i += 1) learnSkill(s, b.id);
    expect(skillCount(s)).toBe(36);
    const bonus = skillBonus(s);
    expect(bonus.servePct).toBeLessThanOrEqual(SKILL_CAP.servePct);
    expect(bonus.costPct).toBeLessThanOrEqual(SKILL_CAP.costPct);
    expect(bonus.patiencePct).toBeLessThanOrEqual(SKILL_CAP.patiencePct);
    expect(bonus.satBonus).toBeLessThanOrEqual(SKILL_CAP.satBonus);
    expect(bonus.attractPct).toBeLessThanOrEqual(SKILL_CAP.attractPct);
    // 至少有两项真的撞到上限，否则封顶形同虚设
    expect(bonus.costPct).toBeCloseTo(SKILL_CAP.costPct, 5);
    expect(bonus.satBonus).toBe(SKILL_CAP.satBonus);
    expect(skillCostFactor(s)).toBeCloseTo(0.88, 5);
  });

  it("视图：没练的给下一级文案，练满的没有下一级", () => {
    const s = fresh();
    s.favor = 1_000;
    s.cash = 100_000;
    const before = skillViews(s);
    expect(before).toHaveLength(12);
    expect(before[0]!.level).toBe(0);
    expect(before[0]!.affordable).toBe(true);
    expect(before[0]!.next?.favorCost).toBe(8);
    for (let i = 0; i < 3; i += 1) learnSkill(s, "wok_fire");
    const after = skillViews(s).find((v) => v.branch.id === "wok_fire")!;
    expect(after.level).toBe(3);
    expect(after.next).toBeNull();
    expect(after.affordable).toBe(false);
  });

  it("穷的时候视图说清缺什么", () => {
    const s = fresh();
    s.favor = 0;
    s.cash = 100_000;
    const v = skillViews(s)[0]!;
    expect(v.affordable).toBe(false);
    expect(v.reason).toContain("人情");
  });

  it("效果写成中文人话，不出现阿拉伯数字以外的符号", () => {
    expect(skillEffectWords({ servePct: 0.03 })).toBe("出碗快 3%");
    expect(skillEffectWords({ costPct: 0.02, satBonus: 1 })).toBe("料钱省 2% · 满意 +1");
    expect(skillEffectWords({ attractPct: 0.05, patiencePct: 0.04 })).toBe("耐心 +4% · 进店 +5%");
    expect(skillEffectWords({})).toBe("");
  });

  it("坏 id 不写状态", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 100_000;
    const r = learnSkill(s, "not_a_branch");
    expect(r.ok).toBe(false);
    expect(skillCount(s)).toBe(0);
  });

  it("存档版本 33 与老档迁移：坏支与越界等级被丢掉", () => {
    const s = fresh();
    expect(SAVE_VERSION).toBe(33);
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.skills = { wok_fire: 2, not_a_branch: 3, sear: 9, slice: 0 };
    raw.saveVersion = 32;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.skills).toEqual({ wok_fire: 2 });
  });
});
