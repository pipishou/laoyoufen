import { describe, expect, it } from "vitest";
import { CAPITAL } from "../data/anchors";
import { BENCH_CAPACITY_UNLOCKED_STEP, BENCH_CAPACITY_STEP, MAX_EQUIP_LEVEL, MAX_EQUIP_LEVEL_UNLOCKED } from "../data/equipment";
import { UNLOCKS } from "../data/unlocks";
import { buyEquipment, equipLevel, equipMaxLevel, equipNextCost } from "./equipment";
import { homeEnergyOf } from "./district";
import { isUnlocked } from "./unlocks";
import { ackDayReport, advanceMinute, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { DAY_MINUTES, isTakeawayGuest } from "./customer";

/**
 * 批 AZ′：四条「预告」全部接进模拟（解 `docs/GAP四轮-2026-11-26.md` A 条）。
 *
 * 这一批之前，`data/unlocks.ts` 里 `stove5` / `takeaway` / `branch` / `legend` 四条挂着
 * `pending: true` —— 评到第 8–11 段的玩家会在「手艺树」里看到四张写着效果的牌，
 * 而模拟里一行都没有。界面上标着「预告」，看着诚实，实际是「做得比说的少」。
 *
 * 四条各自的判据写在这里，一条一条钉住：
 *   ① `stove5`：第 8 段前 `equipMaxLevel === 4`、第 5 档买不到；评到之后能买、真加碗。
 *   ② `takeaway`：第 9 段前打包客不算数；评到之后同一配平卖得更多、队满流失更少、**座位不变**。
 *   ③ `branch`：第 10 段亮（`sim/branches.ts` 早就在跑，`pending` 一直是过期的）。
 *   ④ `legend`：第 11 段前本区能量随住得久衰减；评到之后停在 1，且**胃口照旧衰减**。
 */

function shop(seed = 1): GameState {
  const s = createInitialState("p-az", seed);
  openForBusiness(s, "alley", "测试老友粉");
  s.cash = 1_000_000;
  return s;
}

/** 评到某一段（直接摆 `gradeLevel`：本批只关心「段位到了之后有什么不一样」） */
function atGrade(s: GameState, level: number): GameState {
  s.gradeLevel = level;
  return s;
}

describe("批 AZ′ · 四条预告接进模拟", () => {
  it("四条 pending 全部删掉了（再挂 pending 就等于又写了个假承诺）", () => {
    expect(UNLOCKS.filter((u) => u.pending)).toHaveLength(0);
    expect(UNLOCKS).toHaveLength(10);
    for (const id of ["stove5", "takeaway", "branch", "legend"]) {
      expect(UNLOCKS.find((u) => u.id === id)?.pending).toBeUndefined();
    }
  });

  it("① stove5：第 8 段之前第五档买不到，评到之后买得到且真加日上限（P-AZ-1）", () => {
    const s = shop();
    // 第 7 段：四档就是顶，第五档的钱问都问不出来
    atGrade(s, 7);
    expect(isUnlocked(s, "stove5")).toBe(false);
    expect(equipMaxLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL);
    for (let i = 0; i < MAX_EQUIP_LEVEL; i += 1) expect(buyEquipment(s, "bench").ok).toBe(true);
    expect(equipLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL);
    expect(equipNextCost(s, "bench")).toBe(Infinity);
    const blocked = buyEquipment(s, "bench");
    expect(blocked.ok).toBe(false);
    // 拒绝的理由要说「段位没到」，不能笼统说「顶档」—— 否则玩家以为这条路走到头了
    expect(blocked.reason).toContain("第 8 段");

    // 第 8 段：第五档开了
    atGrade(s, 8);
    expect(isUnlocked(s, "stove5")).toBe(true);
    expect(equipMaxLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL_UNLOCKED);
    expect(equipNextCost(s, "bench")).toBe(CAPITAL.equipmentYuan[4]);
    const capBefore = s.capacity;
    expect(buyEquipment(s, "bench").ok).toBe(true);
    expect(equipLevel(s, "bench")).toBe(MAX_EQUIP_LEVEL_UNLOCKED);
    // 「日上限 +200 碗」不是文案：第五档一次性加 200，不是第四档那种 +40
    expect(s.capacity).toBe(capBefore + BENCH_CAPACITY_UNLOCKED_STEP);
    expect(BENCH_CAPACITY_UNLOCKED_STEP).toBeGreaterThan(BENCH_CAPACITY_STEP * 4);
  });

  it("② takeaway：第 9 段之后同一配平卖得更多、队满流失更少，座位一个没加（P-AZ-2）", () => {
    const run = (gradeLevel: number): { served: number; lostQueue: number; seats: number } => {
      const s = createInitialState("p-az-take", 1);
      s.venue.seats = 4;
      s.capacity = 9999;
      s.reputation = 500;
      s.totalCustomers = 5000;
      s.gradeLevel = gradeLevel;
      let guard = 0;
      while (s.days.length < 6 && guard < 200_000) {
        guard += 1;
        advanceMinute(s);
        if (s.events.pending) {
          s.events.pending = null;
          continue;
        }
        if (s.dayReport) ackDayReport(s);
      }
      const tail = s.days.slice(-3);
      const served = tail.reduce((n, d) => n + d.served, 0) / tail.length;
      const lostQueue = tail.reduce((n, d) => n + (d.lostQueue ?? 0), 0) / tail.length;
      return { served, lostQueue, seats: s.venue.seats };
    };

    const off = run(8);
    const on = run(9);
    // 座位一点没动：第 9 段不是偷偷给座位，是让一部分人不占座
    expect(on.seats).toBe(off.seats);
    expect(on.seats).toBe(4);
    // 同一天卖得更多（实测 72.3 → 87.0 碗，+20%）
    expect(on.served).toBeGreaterThan(off.served * 1.05);
    // 队满流失更少
    expect(on.lostQueue).toBeLessThan(off.lostQueue);
  });

  it("②' takeaway 的判定是「每十位一位」，且没解锁时一位都不算（P-AZ-2）", () => {
    const s = shop();
    const guest = (id: number) =>
      ({ id, archetypeId: "student", dishId: s.menu[0]!.id, status: "waiting", elapsed: 0, waited: 0, patience: 10, satisfaction: -1, regular: false, survey: 0 }) as const;
    atGrade(s, 8);
    expect(isTakeawayGuest(s, guest(10))).toBe(false);
    atGrade(s, 9);
    expect(isTakeawayGuest(s, guest(10))).toBe(true);
    expect(isTakeawayGuest(s, guest(20))).toBe(true);
    expect(isTakeawayGuest(s, guest(11))).toBe(false);
    // 一成：1–100 里正好十位
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(ids.filter((id) => isTakeawayGuest(s, guest(id))).length).toBe(10);
  });

  it("③ branch：第 10 段亮，且分店那天真的记进了日结（`runBranchDay` 早就接在 recordDay 里）", () => {
    const s = shop();
    atGrade(s, 9);
    expect(isUnlocked(s, "branch")).toBe(false);
    atGrade(s, 10);
    expect(isUnlocked(s, "branch")).toBe(true);
  });

  it("④ legend：第 11 段之前本区能量随住得久往下掉，评到之后停在 1（P-AZ-3）", () => {
    const s = shop();
    atGrade(s, 10);
    s.districtSince = 0;
    s.month = 0;
    const fresh = homeEnergyOf(s);
    s.month = 12; // 住满一年（4 个季度）
    const aged = homeEnergyOf(s);
    expect(fresh).toBeCloseTo(1, 6);
    expect(aged).toBeLessThan(fresh);
    // 第 11 段：不再衰减
    atGrade(s, 11);
    expect(isUnlocked(s, "legend")).toBe(true);
    expect(homeEnergyOf(s)).toBe(1);
    s.month = 36;
    expect(homeEnergyOf(s)).toBe(1);
  });

  it("④' legend 只停能量、不停胃口：另一条通道照旧衰减（开罗 help.txt 把两条分开）", () => {
    const s = shop();
    atGrade(s, 11);
    s.districtSince = 0;
    s.month = 0;
    const a = homeEnergyOf(s);
    s.month = 24;
    // 能量被第 11 段钉死在 1，不会再掉
    expect(homeEnergyOf(s)).toBe(a);
    expect(a).toBe(1);
  });
});

/** 让 `DAY_MINUTES` 的引用不被摇掉（本文件用真实分钟数跑整天，不改它） */
void DAY_MINUTES;
