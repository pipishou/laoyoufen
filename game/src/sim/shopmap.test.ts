import { describe, expect, it } from "vitest";
import { createInitialState, type QueueCustomer, type StaffMember } from "./state";
import { shopMap, shopMapSummary } from "./shopmap";

function fresh() {
  return createInitialState("p1", 1);
}

function cust(id: number): QueueCustomer {
  return {
    id,
    archetypeId: "worker",
    dishId: 1,
    status: "waiting",
    elapsed: 0,
    waited: 0,
    patience: 40,
    satisfaction: -1,
    regular: false,
  } as unknown as QueueCustomer;
}

function staff(role: StaffMember["role"], i: number, resting = false): StaffMember {
  return {
    uid: `u${i}`,
    templateId: "t",
    name: `员工${i}`,
    role,
    skill: 2,
    wage: 100,
    fatigue: 0,
    resting,
  };
}

function count(map: ReturnType<typeof shopMap>, mark: string): number {
  return map.flat().filter((c) => c === mark).length;
}

describe("店内小图（P57 客人与员工）", () => {
  it("新局是一张 12×8 的空店", () => {
    const map = shopMap(fresh());
    expect(map).toHaveLength(8);
    expect(map[0]).toHaveLength(12);
    expect(map.flat().every((c) => c === null)).toBe(true);
  });

  it("买了家当就摆进对应的格子", () => {
    const s = fresh();
    s.gear = ["plastic_stool", "wash_sink"];
    const map = shopMap(s);
    expect(count(map, "seat")).toBe(1);
    expect(count(map, "decor")).toBe(1);
  });

  it("排队的人从门口往里站，不站到后厨去", () => {
    const s = fresh();
    s.flow.customers = [cust(1), cust(2), cust(3)];
    const map = shopMap(s);
    expect(count(map, "cust")).toBe(3);
    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        if (map[y]![x] === "cust") expect(x).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("掌勺画在后厨，跑堂画在堂食", () => {
    const s = fresh();
    s.staff.roster = [staff("cook", 1), staff("server", 2)];
    const map = shopMap(s);
    expect(count(map, "staff")).toBe(2);
    const chefStops: number[] = [];
    const serverStops: number[] = [];
    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < 12; x += 1) if (map[y]![x] === "staff") chefStops.push(x);
    }
    // 第一个（掌勺）在后厨四列里，第二个（跑堂）排在它后面
    expect(Math.min(...chefStops)).toBeLessThanOrEqual(3);
    expect(chefStops.length + serverStops.length).toBe(2);
  });

  it("人不会把家当顶掉，格子总数永远是 96", () => {
    const s = fresh();
    s.gear = ["wash_sink", "wall_fan", "plastic_stool"]
    s.staff.roster = [staff("cook", 1), staff("server", 2), staff("server", 3)];
    s.flow.customers = Array.from({ length: 12 }, (_, i) => cust(i + 1));
    const map = shopMap(s);
    expect(map.flat()).toHaveLength(96);
    expect(count(map, "decor")).toBe(1);
    expect(count(map, "wall")).toBe(1);
    expect(count(map, "seat")).toBe(1);
    expect(count(map, "staff")).toBe(3);
    expect(count(map, "cust")).toBe(12);
  });

  it("客人再多也只画 12 个", () => {
    const s = fresh();
    s.flow.customers = Array.from({ length: 30 }, (_, i) => cust(i + 1));
    expect(count(shopMap(s), "cust")).toBe(12);
  });

  it("今天休息的人不在店里", () => {
    const s = fresh();
    s.staff.roster = [staff("cook", 1, true), staff("server", 2)];
    expect(count(shopMap(s), "staff")).toBe(1);
  });

  it("同一份存档画出来一模一样（不消耗随机数）", () => {
    const s = fresh();
    s.gear = ["bamboo_chair"];
    s.staff.roster = [staff("server", 1)];
    s.flow.customers = [cust(1), cust(2)];
    expect(shopMap(s)).toEqual(shopMap(s));
  });

  it("标题那句话报出排队与在店人数", () => {
    const s = fresh();
    s.staff.roster = [staff("cook", 1)];
    s.flow.customers = [cust(1), cust(2)];
    const line = shopMapSummary(s);
    expect(line).toContain("排队 2 人");
    expect(line).toContain("店里 1 人");
  });
});
