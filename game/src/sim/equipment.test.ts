import { describe, expect, it } from "vitest";
import { BENCH_CAPACITY_STEP, EQUIPMENT, MAX_EQUIP_LEVEL, STOVE_SERVE_FACTOR } from "../data/equipment";
import { CAPITAL, bowls } from "../data/anchors";
import { SERVE_MINUTES } from "./customer";
import {
  buyEquipment,
  effectiveServeMinutes,
  equipCostMultiplier,
  equipLevel,
  equipNextCost,
  equipServeMultiplier,
} from "./equipment";
import { createInitialState, SAVE_VERSION } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";

const fresh = () => {
  const s = createInitialState("p-equip", 20261115);
  openForBusiness(s, "alley", "测试老友粉");
  return s;
};

describe("设备 S4：三件主线设备", () => {
  it("三件设备、每件四档，价格与 CAPITAL.equipmentYuan 一致（¥1,500→¥30,000）", () => {
    expect(EQUIPMENT.map((e) => e.id)).toEqual(["stove", "strainer", "bench"]);
    for (const e of EQUIPMENT) {
      expect(e.tiers).toEqual([...CAPITAL.equipmentYuan]);
      expect(e.tiers.length).toBe(MAX_EQUIP_LEVEL);
      expect(e.effects.length).toBe(MAX_EQUIP_LEVEL);
    }
    expect(bowls(CAPITAL.equipmentYuan[3]!)).toBe(3_000);
  });

  it("新局三件都是 0 档，第一档要 ¥1,500", () => {
    const s = fresh();
    expect(equipLevel(s, "stove")).toBe(0);
    expect(equipNextCost(s, "stove")).toBe(1_500);
  });

  it("钱不够：拒绝且一分不扣，档位不动", () => {
    const s = fresh();
    s.cash = 1_000;
    const r = buyEquipment(s, "stove");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    expect(s.cash).toBe(1_000);
    expect(equipLevel(s, "stove")).toBe(0);
  });

  it("钱够：扣钱升档，下一档价格跳到 ¥3,800", () => {
    const s = fresh();
    s.cash = 20_000;
    expect(buyEquipment(s, "stove").ok).toBe(true);
    expect(s.cash).toBe(18_500);
    expect(equipLevel(s, "stove")).toBe(1);
    expect(equipNextCost(s, "stove")).toBe(3_800);
  });

  it("满级后拒绝，且下一档返回 Infinity", () => {
    const s = fresh();
    s.cash = 1_000_000;
    for (let i = 0; i < MAX_EQUIP_LEVEL; i += 1) expect(buyEquipment(s, "bench").ok).toBe(true);
    expect(equipLevel(s, "bench")).toBe(4);
    expect(equipNextCost(s, "bench")).toBe(Infinity);
    const cash = s.cash;
    const r = buyEquipment(s, "bench");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("顶档");
    expect(s.cash).toBe(cash);
  });

  it("不认识的设备：拒绝，不抛异常", () => {
    const s = fresh();
    const r = buyEquipment(s, "oven");
    expect(r.ok).toBe(false);
    expect(s.cash).toBe(15_000);
  });

  it("猛火灶降出碗时间：0.85^n 倍，四档 6→5.1→4.3→3.7→3.1 分/碗", () => {
    const s = fresh();
    s.cash = 1_000_000;
    const seen: number[] = [effectiveServeMinutes(s, SERVE_MINUTES, 1)];
    for (let i = 0; i < MAX_EQUIP_LEVEL; i += 1) {
      buyEquipment(s, "stove");
      seen.push(effectiveServeMinutes(s, SERVE_MINUTES, 1));
    }
    expect(seen[0]).toBeCloseTo(6, 6);
    expect(seen[1]).toBeCloseTo(5.1, 6);
    expect(seen[4]).toBeCloseTo(6 * Math.pow(STOVE_SERVE_FACTOR, 4), 6);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]!).toBeLessThan(seen[i - 1]!);
    expect(equipServeMultiplier(s)).toBeCloseTo(Math.pow(STOVE_SERVE_FACTOR, 4), 6);
  });

  it("粉篓降食材成本：0.97^n，四档一碗省 ¥0.56 左右", () => {
    const s = fresh();
    s.cash = 1_000_000;
    expect(equipCostMultiplier(s)).toBe(1);
    for (let i = 0; i < MAX_EQUIP_LEVEL; i += 1) buyEquipment(s, "strainer");
    expect(equipCostMultiplier(s)).toBeCloseTo(Math.pow(0.97, 4), 6);
    expect(4.8 * (1 - equipCostMultiplier(s))).toBeCloseTo(0.56, 1);
  });

  it("案台当场加日上限：每档 +40，四档 +160", () => {
    const s = fresh();
    s.cash = 1_000_000;
    const cap0 = s.capacity;
    buyEquipment(s, "bench");
    expect(s.capacity).toBe(cap0 + BENCH_CAPACITY_STEP);
    for (let i = 1; i < MAX_EQUIP_LEVEL; i += 1) buyEquipment(s, "bench");
    expect(s.capacity).toBe(cap0 + BENCH_CAPACITY_STEP * MAX_EQUIP_LEVEL);
  });

  it("存档 v9：设备档位能存能读，v8 老档补空对象", () => {
    const s = fresh();
    s.cash = 1_000_000;
    buyEquipment(s, "stove");
    buyEquipment(s, "bench");
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back!.saveVersion).toBe(SAVE_VERSION);
    expect(back!.equipment).toEqual({ stove: 1, bench: 1 });

    const old = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete old.equipment;
    old.saveVersion = 8;
    const migrated = deserialize(JSON.stringify(old));
    expect(migrated).not.toBeNull();
    expect(migrated!.equipment).toEqual({});
    expect(migrated!.saveVersion).toBe(SAVE_VERSION);
  });

  it("买成之后要交代这一档到底换了什么（试玩二轮 F8）", () => {
    const s = createInitialState("p1", 1);
    openForBusiness(s, "alley", "测试店");
    s.cash = 200_000;

    const stove = buyEquipment(s, "stove");
    expect(stove.ok).toBe(true);
    expect(stove.line).toContain("出碗时间");
    expect(stove.line).toContain("第 1 档");

    const bench = buyEquipment(s, "bench");
    expect(bench.line).toContain("每天多备");
    expect(bench.line).toContain(String(BENCH_CAPACITY_STEP));

    const strainer = buyEquipment(s, "strainer");
    expect(strainer.line).toContain("料钱");

    // 失败时不给 line，免得 toast 说「换了」其实没换
    s.cash = 0;
    const poor = buyEquipment(s, "stove");
    expect(poor.ok).toBe(false);
    expect(poor.line).toBeUndefined();
  });
})
