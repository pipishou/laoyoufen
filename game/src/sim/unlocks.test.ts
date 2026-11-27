import { describe, expect, it } from "vitest";
import { FLOW } from "../data/balance";
import { EXPANSIONS, EXPANSION_BY_ID, EXPANSION_ORDER } from "../data/expansion";
import { LIVE_UNLOCK_IDS, UNLOCKS } from "../data/unlocks";
import { createInitialState } from "./state";
import { gradeOf, isUnlocked, nextUnlock, queueMaxOf, roadworkBoostOf, unlockViews } from "./unlocks";

function fresh(): ReturnType<typeof createInitialState> {
  const s = createInitialState("unlock-1", 7);
  s.gradeLevel = 0;
  return s;
}

describe("手艺树（P39，对齐开罗 rank.txt）", () => {
  it("表本身：段位门槛升序、每项都有开罗对应行与南宁话", () => {
    expect(UNLOCKS.length).toBe(12);
    const grades = UNLOCKS.map((u) => u.grade);
    expect(grades).toEqual([...grades].sort((a, b) => a - b));
    expect(new Set(UNLOCKS.map((u) => u.id)).size).toBe(UNLOCKS.length);
    for (const u of UNLOCKS) {
      expect(u.kairo.length).toBeGreaterThan(2);
      expect(u.line.length).toBeGreaterThan(4);
      expect(u.grade).toBeGreaterThanOrEqual(2);
      expect(u.grade).toBeLessThanOrEqual(11);
    }
    // 开罗那 17 行里最能改变玩法的几类必须出现（批 BC′ 加进 More Investments）
    const kairo = UNLOCKS.map((u) => u.kairo).join("|");
    expect(kairo).toContain("Ramen Hall Expansion");
    expect(kairo).toContain("More Line Tiles");
    expect(kairo).toContain("Buy Big Shop");
    expect(kairo).toContain("More Investments");
  });

  it("初始 0 段：一件都没解锁，排队位就是 FLOW.queueMax", () => {
    const s = fresh();
    expect(gradeOf(s)).toBe(0);
    for (const id of LIVE_UNLOCK_IDS) expect(isUnlocked(s, id)).toBe(false);
    expect(queueMaxOf(s)).toBe(FLOW.queueMax);
    expect(roadworkBoostOf(s)).toBe(1);
    const next = nextUnlock(s);
    expect(next?.id).toBe("queue2");
    expect(next?.short).toBe(2);
  });

  it("第 2 段开排队位（12→14），第 7 段再 +4（→18）", () => {
    const s = fresh();
    s.gradeLevel = 2;
    expect(isUnlocked(s, "queue2")).toBe(true);
    expect(queueMaxOf(s)).toBe(FLOW.queueMax + 2);
    s.gradeLevel = 6;
    expect(queueMaxOf(s)).toBe(FLOW.queueMax + 2);
    s.gradeLevel = 7;
    expect(queueMaxOf(s)).toBe(FLOW.queueMax + 6);
  });

  it("第 5 段的巷口灯箱：本区客流 ×1.15", () => {
    const s = fresh();
    s.gradeLevel = 4;
    expect(roadworkBoostOf(s)).toBe(1);
    s.gradeLevel = 5;
    expect(roadworkBoostOf(s)).toBeGreaterThan(1.1);
    expect(roadworkBoostOf(s)).toBeLessThan(1.2);
  });

  it("十二条全部接进了模拟：没有一条还挂着「预告」（批 AZ′ 十条 + 批 BC′ 两条门路位）", () => {
    const s = fresh();
    // 评到第 11 段（最后一条 `legend` 的门槛）才谈得上「全都亮」
    s.gradeLevel = 11;
    const views = unlockViews(s);
    // 批 AZ′ 之前这里断言「pending 全都 unlocked === false」。四条 pending 接完之后
    // 一格都不剩，断言跟着翻过来：**再出现 pending 就说明又有人写了个假承诺**。
    const pending = views.filter((v) => v.pending);
    expect(pending).toHaveLength(0);
    for (const v of views.filter((v) => !v.pending)) expect(v.unlocked).toBe(true);
    // 第 10 段：分店与打包都已接上（批 AZ′ 之前这两条是 false）
    expect(isUnlocked(s, "branch")).toBe(true);
    expect(isUnlocked(s, "takeaway")).toBe(true);
  });

  it("扩建四档的段位门槛与解锁表对得上（第 3 段后巷、第 6 段二楼）", () => {
    expect(EXPANSION_ORDER).toEqual(["hall", "kitchen", "backyard", "upstairs"]);
    expect(EXPANSIONS).toHaveLength(4);
    expect(EXPANSION_BY_ID.get("backyard")?.minGrade).toBe(3);
    expect(EXPANSION_BY_ID.get("upstairs")?.minGrade).toBe(6);
    expect(EXPANSION_BY_ID.get("backyard")?.costYuan).toBe(60_000);
    expect(EXPANSION_BY_ID.get("upstairs")?.costYuan).toBe(110_000);
    // 前半两档不设门槛，否则新玩家第一天就卡死
    expect(EXPANSION_BY_ID.get("hall")?.minGrade).toBe(0);
    expect(EXPANSION_BY_ID.get("kitchen")?.minGrade).toBe(0);
  });
});
