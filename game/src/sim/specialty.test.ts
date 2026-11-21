import { describe, expect, it } from "vitest";
import { SPECIALTIES, SPECIALTY_TOTAL, specialtyById, specialtiesOfRole } from "../data/specialty";
import {
  hasSpecialty,
  learnSpecialty,
  learnableOf,
  masteredStaff,
  specialtyCostFactor,
  specialtyCount,
  specialtyOf,
  specialtyPatienceMult,
  specialtySatBonus,
  specialtyServeFactor,
  specialtySummary,
  specialtyViews,
} from "./specialty";
import { createInitialState, type GameState, type StaffMember } from "./state";

function member(role: "cook" | "prep" | "server", id = "m1"): StaffMember {
  return {
    uid: id,
    templateId: "st.aqiang",
    name: role === "cook" ? "阿强" : role === "prep" ? "阿珍" : "小陆",
    role,
    skill: 3,
    wage: 150,
    fatigue: 0,
    resting: false,
  };
}

function fresh(): GameState {
  const s = createInitialState("spec-test", 5);
  s.cash = 50_000;
  s.favor = 40;
  s.staff.roster = [member("cook"), member("prep", "m2"), member("server", "m3")];
  return s;
}

describe("店员专精（A9）", () => {
  it("三门手艺各绑一个岗位，id 能查回", () => {
    expect(SPECIALTY_TOTAL).toBe(3);
    for (const d of SPECIALTIES) {
      expect(SPECIALTY_BY_ID_HAS(d.id)).toBe(true);
      expect(d.line.length).toBeGreaterThan(6);
      expect(d.what.length).toBeGreaterThan(2);
      expect(d.favorCost).toBeGreaterThan(0);
      expect(specialtiesOfRole(d.role).some((x) => x.id === d.id)).toBe(true);
    }
    expect(specialtiesOfRole("cook").map((d) => d.id)).toEqual(["wok"]);
    expect(specialtyById("nope")).toBeNull();
  });

  it("一个人只学一门，学过就拒绝，岗位不对也拒绝", () => {
    const s = fresh();
    const cook = s.staff.roster[0]!;
    const r1 = learnSpecialty(s, cook.uid, "wok");
    expect(r1.ok).toBe(true);
    expect(cook.specialty).toBe("wok");
    expect(hasSpecialty(cook)).toBe(true);
    expect(specialtyOf(cook)?.name).toBe("锅气");

    const r2 = learnSpecialty(s, cook.uid, "wok");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("只学一门");

    const r3 = learnSpecialty(s, cook.uid, "knife");
    expect(r3.ok).toBe(false);

    const r4 = learnSpecialty(s, "ghost", "wok");
    expect(r4.ok).toBe(false);
  });

  it("人情或钱不够就学不成，且不扣任何东西", () => {
    const s = fresh();
    const prep = s.staff.roster[1]!;
    s.favor = 0;
    const before = s.cash;
    const r = learnSpecialty(s, prep.uid, "knife");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("人情");
    expect(s.cash).toBe(before);
    expect(prep.specialty).toBeUndefined();

    s.favor = 40;
    s.cash = 10;
    const r2 = learnSpecialty(s, prep.uid, "knife");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("学");
    expect(prep.specialty).toBeUndefined();
  });

  it("学成扣人情与钱，并把技能抬一档（最高五档）", () => {
    const s = fresh();
    const prep = s.staff.roster[1]!;
    prep.skill = 5;
    const r = learnSpecialty(s, prep.uid, "knife");
    expect(r.ok).toBe(true);
    expect(s.favor).toBe(40 - 10);
    expect(s.cash).toBe(50_000 - 300);
    expect(prep.skill).toBe(5);
  });

  it("没人学过时四个乘数都是中性", () => {
    const s = fresh();
    expect(specialtyServeFactor(s)).toBe(1);
    expect(specialtyCostFactor(s)).toBe(1);
    expect(specialtyPatienceMult(s)).toBe(1);
    expect(specialtySatBonus(s)).toBe(0);
    expect(masteredStaff(s).length).toBe(0);
    expect(specialtySummary(s)).toContain("0 / 3");
  });

  it("锅气让出碗更快、刀工让料钱更低、记性让耐心与满意更高", () => {
    const s = fresh();
    learnSpecialty(s, s.staff.roster[0]!.uid, "wok");
    expect(specialtyServeFactor(s)).toBeCloseTo(0.92, 3);

    learnSpecialty(s, s.staff.roster[1]!.uid, "knife");
    expect(specialtyCostFactor(s)).toBeCloseTo(0.94, 3);

    learnSpecialty(s, s.staff.roster[2]!.uid, "memory");
    expect(specialtyPatienceMult(s)).toBeCloseTo(1.08, 3);
    expect(specialtySatBonus(s)).toBe(1);
    expect(specialtyCount(s)).toBe(3);
    expect(specialtySummary(s)).toContain("3 / 3");
  });

  it("同一门两人都学也只算一份（不然三个人学锅气就能无限叠）", () => {
    const s = fresh();
    s.staff.roster.push(member("cook", "m4"));
    learnSpecialty(s, "m1", "wok");
    learnSpecialty(s, "m4", "wok");
    expect(specialtyServeFactor(s)).toBeCloseTo(0.92, 3);
  });

  it("视图只给本岗位的，买不起时标不可负担", () => {
    const s = fresh();
    s.favor = 11;
    const cook = s.staff.roster[0]!;
    const views = specialtyViews(s, cook);
    expect(views.length).toBe(1);
    expect(views[0]!.def.id).toBe("wok");
    expect(views[0]!.affordable).toBe(true);
    s.favor = 1;
    expect(specialtyViews(s, cook)[0]!.affordable).toBe(false);
    expect(learnableOf(cook).length).toBe(1);
  });

  it("没雇人时摘要说「还没雇人」，不报 0/0", () => {
    const s = createInitialState("empty", 1);
    expect(specialtySummary(s)).toBe("还没雇人");
  });
});

function SPECIALTY_BY_ID_HAS(id: string): boolean {
  return specialtyById(id) !== null;
}
