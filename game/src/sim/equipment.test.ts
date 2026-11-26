import { describe, expect, it } from "vitest";
import { BENCH_CAPACITY_STEP, EQUIPMENT, MAX_EQUIP_LEVEL, MAX_EQUIP_LEVEL_UNLOCKED, STAGE_MINUTES, STATION_ORDER } from "../data/equipment";
import { CAPITAL, bowls } from "../data/anchors";
import { SERVE_MINUTES } from "./customer";
import {
  buyEquipment,
  effectiveServeMinutes,
  equipCostMultiplier,
  equipLevel,
  equipMaxLevel,
  equipNextCost,
  equipServeMultiplier,
  slowestStation,
  stageMinutes,
  stationCount,
  stationServeFactor,
} from "./equipment";
import { createInitialState, SAVE_VERSION } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";

const fresh = () => {
  const s = createInitialState("p-equip", 20261115);
  openForBusiness(s, "alley", "测试老友粉");
  return s;
};

describe("设备 S4：四件设备，三段并行", () => {
  it("四件设备、每件五档（第五档要第 8 段才开），价格与 CAPITAL.equipmentYuan 一致（¥1,500→¥68,000）", () => {
    expect(EQUIPMENT.map((e) => e.id)).toEqual(["stove", "pot", "strainer", "bench"]);
    for (const e of EQUIPMENT) {
      expect(e.tiers).toEqual([...CAPITAL.equipmentYuan]);
      // 批 AZ′（解 GAP 四轮 A 条）：表里一直是五档的并口数，但 `MAX_EQUIP_LEVEL` 卡在 4
      // —— 第五档的「黄金灶」玩家永远换不到。现在档数跟数据结构一致，能不能买由段位说了算。
      expect(e.tiers.length).toBe(MAX_EQUIP_LEVEL_UNLOCKED);
      expect(e.effects.length).toBe(MAX_EQUIP_LEVEL_UNLOCKED);
      // 不用段位就能买到的那四档仍是老价钱
      expect(e.tiers[MAX_EQUIP_LEVEL - 1]).toBe(30_000);
    }
    expect(MAX_EQUIP_LEVEL).toBe(4);
    expect(MAX_EQUIP_LEVEL_UNLOCKED).toBe(5);
    expect(bowls(CAPITAL.equipmentYuan[3]!)).toBe(3_000);
  });

  it("三段的基准分钟数加起来正好是一碗的 6 分钟", () => {
    expect(STAGE_MINUTES.wok + STAGE_MINUTES.pot + STAGE_MINUTES.basket).toBeCloseTo(SERVE_MINUTES, 6);
    expect(STATION_ORDER).toEqual(["wok", "pot", "basket"]);
  });

  it("新局四件都是 0 档，第一档要 ¥1,500", () => {
    const s = fresh();
    expect(equipLevel(s, "stove")).toBe(0);
    expect(equipLevel(s, "pot")).toBe(0);
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

  it("段位没到时第五档拒绝并说明原因，评到第 8 段就能买到，之后再拒绝说顶档（批 AZ′）", () => {
    const s = fresh();
    s.cash = 1_000_000;
    for (let i = 0; i < MAX_EQUIP_LEVEL; i += 1) expect(buyEquipment(s, "bench").ok).toBe(true);
    expect(equipLevel(s, "bench")).toBe(4);
    // 四档买满，第五档还锁着：不是「顶档」，是「段位没到」
    expect(equipMaxLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL);
    expect(equipNextCost(s, "bench")).toBe(Infinity);
    const cash = s.cash;
    const blocked = buyEquipment(s, "bench");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain("第 8 段");
    expect(blocked.reason).not.toContain("顶档");
    expect(s.cash).toBe(cash);
    expect(equipLevel(s, "bench")).toBe(4);

    // 评到第 8 段：第五档开了，价钱是真价钱，买得动
    s.gradeLevel = 8;
    expect(equipMaxLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL_UNLOCKED);
    expect(equipNextCost(s, "bench")).toBe(CAPITAL.equipmentYuan[4]);
    expect(buyEquipment(s, "bench").ok).toBe(true);
    expect(equipLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL_UNLOCKED);

    // 五档买满：这次才是真的顶档
    expect(equipNextCost(s, "bench")).toBe(Infinity);
    const top = buyEquipment(s, "bench");
    expect(top.ok).toBe(false);
    expect(top.reason).toContain("顶档");
  });

  it("不认识的设备：拒绝，不抛异常", () => {
    const s = fresh();
    const r = buyEquipment(s, "oven");
    expect(r.ok).toBe(false);
    expect(s.cash).toBe(15_000);
  });

  it("猛火灶是「多开一口炒锅」：档位越高，炒锅那一段摊得越薄", () => {
    const s = fresh();
    s.cash = 1_000_000;
    expect(stationCount(s, "wok")).toBe(1);
    const wok: number[] = [stageMinutes(s).wok];
    for (let i = 0; i < MAX_EQUIP_LEVEL; i += 1) {
      buyEquipment(s, "stove");
      wok.push(stageMinutes(s).wok);
    }
    expect(wok[1]).toBeCloseTo(STAGE_MINUTES.wok / 2, 6);
    expect(wok[4]).toBeCloseTo(STAGE_MINUTES.wok / 5, 6);
    for (let i = 1; i < wok.length; i += 1) expect(wok[i]!).toBeLessThan(wok[i - 1]!);
  });

  it("第五档「黄金灶」买得到之后，炒锅真开到 6 口、案台真加 200 碗（批 AZ′）", () => {
    const s = fresh();
    s.cash = 1_000_000;
    s.gradeLevel = 8;
    for (let i = 0; i < MAX_EQUIP_LEVEL_UNLOCKED; i += 1) expect(buyEquipment(s, "stove").ok).toBe(true);
    expect(stationCount(s, "wok")).toBe(6);
    expect(stageMinutes(s).wok).toBeCloseTo(STAGE_MINUTES.wok / 6, 6);

    const cap0 = s.capacity;
    for (let i = 0; i < MAX_EQUIP_LEVEL_UNLOCKED; i += 1) expect(buyEquipment(s, "bench").ok).toBe(true);
    // 前四档各 +40，第五档 +200（数据表里那句「日上限 +200 碗」不是文案）
    expect(s.capacity).toBe(cap0 + BENCH_CAPACITY_STEP * MAX_EQUIP_LEVEL + 200);
  });

  it("三段合计分钟数逐档下降，stationServeFactor 同步递减且永远小于 1", () => {
    const s = fresh();
    s.cash = 1_000_000;
    expect(stationServeFactor(s)).toBeCloseTo(1, 6);
    expect(effectiveServeMinutes(s, SERVE_MINUTES, 1)).toBeCloseTo(6, 6);
    const seen: number[] = [stationServeFactor(s)];
    for (const id of ["stove", "pot", "strainer", "stove", "pot"] as const) {
      buyEquipment(s, id);
      seen.push(stationServeFactor(s));
    }
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeLessThan(seen[i - 1]!);
      expect(seen[i]!).toBeLessThan(1);
    }
    expect(equipServeMultiplier(s)).toBeCloseTo(stationServeFactor(s), 6);
    expect(effectiveServeMinutes(s, SERVE_MINUTES, 1)).toBeLessThan(6);
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

  it("最慢的一段会跟着买的东西换（新局是炒锅与汤锅并列，先买哪边另一边就成瓶颈）", () => {
    const s = fresh();
    s.cash = 1_000_000;
    const first = slowestStation(s);
    expect(first.minutes).toBeCloseTo(Math.max(STAGE_MINUTES.wok, STAGE_MINUTES.pot, STAGE_MINUTES.basket), 6);
    buyEquipment(s, "stove");
    expect(slowestStation(s).station).not.toBe("wok");
    buyEquipment(s, "pot");
    buyEquipment(s, "pot");
    buyEquipment(s, "pot");
    expect(["wok", "pot", "basket"]).toContain(slowestStation(s).station);
  });

  it("存档：设备档位能存能读，老档补空对象", () => {
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

  it("买成之后要交代这一档到底换了什么（F8：说口数，不说分钟）", () => {
    const s = createInitialState("p1", 1);
    openForBusiness(s, "alley", "测试店");
    s.cash = 200_000;

    const stove = buyEquipment(s, "stove");
    expect(stove.ok).toBe(true);
    expect(stove.line).toContain("炒锅");
    expect(stove.line).toContain("第 1 档");
    expect(stove.line).toContain("2 口");

    const pot = buyEquipment(s, "pot");
    expect(pot.line).toContain("汤锅");
    expect(pot.line).toContain("口");

    const bench = buyEquipment(s, "bench");
    expect(bench.line).toContain("每天多备");
    expect(bench.line).toContain(String(BENCH_CAPACITY_STEP));

    const strainer = buyEquipment(s, "strainer");
    expect(strainer.line).toContain("粉篓");
    expect(strainer.line).toContain("筒");

    s.cash = 0;
    const poor = buyEquipment(s, "stove");
    expect(poor.ok).toBe(false);
    expect(poor.line).toBeUndefined();
  });
});
