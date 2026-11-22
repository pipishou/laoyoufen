import { describe, expect, it } from "vitest";
import { ARENAS, COMMANDS, COMMAND_BY_ID, COMMAND_KEY_MAP, arenaById } from "../data/arena";
import { SAVE_VERSION, createInitialState, tickMinute, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import { ARENA_PER_DAY, ARENA_RETRY_FAVOR, RIVAL_RATE_PER_SEC } from "../data/arena";
import {
  
  arenaAdvance,
  arenaOpen,
  arenaRivalEntryOf,
  arenaRunsToday,
  arenaStrike,
  arenaSummary,
  arenaViews,
  startArena,
} from "./arena";

function fresh(): GameState {
  const s = createInitialState("arena-player", 7);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.gradeLevel = 6;
  s.cash = 50_000;
  return s;
}

/** 把一局打完（每帧 100ms，与真实 UI 同频） */
function runToEnd(s: GameState, onTick?: () => void): ReturnType<typeof arenaAdvance> {
  for (let i = 0; i < 900; i += 1) {
    const step = arenaAdvance(s, 100);
    onTick?.();
    if (step.finished) return step;
  }
  throw new Error("一局没在 90 秒内打完");
}

describe("落场：场地与命令", () => {
  it("三块场地权重各自和为 1，门槛与奖金都更严", () => {
    expect(ARENAS).toHaveLength(3);
    for (const a of ARENAS) {
      const w = a.weight;
      expect(w.taste + w.aroma + w.volume + w.charm).toBeCloseTo(1, 6);
      expect(a.prizeYuan).toBeGreaterThan(0);
    }
    expect(ARENAS.map((a) => a.minGrade)).toEqual([0, 3, 6]);
    const prizes = ARENAS.map((a) => a.prizeYuan);
    expect(prizes).toEqual([...prizes].sort((x, y) => x - y));
  });

  it("菜市口认份量、江边认香气、擂台四样都要", () => {
    expect(arenaById("market")!.weight.volume).toBeGreaterThan(arenaById("market")!.weight.aroma);
    expect(arenaById("river")!.weight.aroma).toBeGreaterThan(arenaById("river")!.weight.volume);
    const ring = arenaById("ring")!.weight;
    const spread = Math.max(ring.taste, ring.aroma, ring.volume, ring.charm) - Math.min(ring.taste, ring.aroma, ring.volume, ring.charm);
    expect(spread).toBeLessThan(0.15);
  });

  it("三条命令按 1 / 2 / 3 触发，冷却越长分越高", () => {
    expect(COMMANDS).toHaveLength(3);
    expect(COMMAND_KEY_MAP["1"]).toBe("holler");
    expect(COMMAND_KEY_MAP["2"]).toBe("show");
    expect(COMMAND_KEY_MAP["3"]).toBe("pot");
    const sorted = [...COMMANDS].sort((a, b) => a.cdMs - b.cdMs);
    expect(sorted.map((c) => c.base)).toEqual([...sorted.map((c) => c.base)].sort((x, y) => x - y));
    expect(COMMAND_BY_ID.get("pot")!.base).toBeGreaterThan(COMMAND_BY_ID.get("holler")!.base);
  });
});

describe("落场：一天几场", () => {
  it("新局没落过场，也没在场", () => {
    const s = fresh();
    expect(s.arena).toBeNull();
    expect(s.arenaDay).toBe(-1);
    expect(s.arenaRuns).toBe(0);
    expect(arenaRunsToday(s)).toBe(0);
    expect(arenaSummary(s)).toBe("今天还没落场");
  });

  it("段位不够进不去，理由点名要第几段", () => {
    const s = fresh();
    s.gradeLevel = 2;
    const r = arenaOpen(s, "river");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("第 3 段");
    expect(startArena(s, "river").ok).toBe(false);
    expect(s.arena).toBeNull();
  });

  it("第一条命免费，第二条要人情，第三条不让上", () => {
    const s = fresh();
    s.favor = 0;
    expect(startArena(s, "market").ok).toBe(true);
    expect(arenaRunsToday(s)).toBe(ARENA_PER_DAY);
    s.arena = null; // 直接清掉，模拟打完

    const second = arenaOpen(s, "market");
    expect(second.ok).toBe(false);
    expect(second.reason).toContain(`${ARENA_RETRY_FAVOR} 点人情`);

    s.favor = 20;
    expect(startArena(s, "market").ok).toBe(true);
    expect(s.favor).toBe(20 - ARENA_RETRY_FAVOR);
    expect(arenaRunsToday(s)).toBe(2);
    s.arena = null;

    const third = arenaOpen(s, "market");
    expect(third.ok).toBe(false);
    expect(third.reason).toContain("两回");
  });

  it("换一天又有一场", () => {
    const s = fresh();
    expect(startArena(s, "market").ok).toBe(true);
    s.arena = null;
    s.day += 1;
    expect(arenaRunsToday(s)).toBe(0);
    expect(startArena(s, "market").ok).toBe(true);
  });
});

describe("落场：出招与推进", () => {
  it("不在场上出不了招", () => {
    const s = fresh();
    expect(arenaStrike(s, "holler").ok).toBe(false);
  });

  it("出招加分，同一条命令要等冷却", () => {
    const s = fresh();
    startArena(s, "market");
    const first = arenaStrike(s, "holler");
    expect(first.ok).toBe(true);
    expect(s.arena!.mine).toBeGreaterThan(0);
    expect(s.arena!.hits).toBe(1);

    const again = arenaStrike(s, "holler");
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("还没缓过来");

    arenaAdvance(s, 500);
    arenaAdvance(s, 500);
    arenaAdvance(s, 500);
    arenaAdvance(s, 500);
    arenaAdvance(s, 500);
    expect(arenaStrike(s, "holler").ok).toBe(true);
  });

  it("对手每秒涨分，钟在往下走", () => {
    const s = fresh();
    startArena(s, "market");
    const before = s.arena!.msLeft;
    const rival0 = s.arena!.rival;
    arenaAdvance(s, 500);
    expect(s.arena!.msLeft).toBe(before - 500);
    expect(s.arena!.rival).toBeGreaterThan(rival0);
    // 500ms 按 RIVAL_RATE_PER_SEC 匀速涨
    expect(s.arena!.rival - rival0).toBeCloseTo(RIVAL_RATE_PER_SEC / 2, 4);
  });

  it("打完六十秒就结算，局被清掉，账上留痕", () => {
    const s = fresh();
    const cash0 = s.cash;
    startArena(s, "market");
    const step = runToEnd(s);
    expect(step.finished).toBe(true);
    expect(s.arena).toBeNull();
    expect(s.tally.arenaRuns).toBe(1);
    expect(step.result!.line).toContain("菜市口早场");

    if (step.result!.win) {
      expect(s.tally.arenaWins).toBe(1);
      expect(s.cash).toBe(cash0 + step.result!.cashGain);
      expect(step.result!.cashGain).toBe(arenaById("market")!.prizeYuan);
    } else {
      expect(s.tally.arenaWins).toBe(0);
      expect(s.cash).toBe(cash0);
      expect(step.result!.cashGain).toBe(0);
    }
    expect(s.reputation).toBeGreaterThan(0);
    expect(s.flow.lastFavor).toBeTruthy();
  });

  it("一直出大招就能赢，光站着就输", () => {
    const s = fresh();
    startArena(s, "market");
    const step = runToEnd(s, () => {
      for (const id of ["holler", "show", "pot"]) arenaStrike(s, id);
    });
    expect(step.result!.mine).toBeGreaterThan(300);
    expect(step.result!.win).toBe(true);

    const t = fresh();
    startArena(t, "market");
    const idle = runToEnd(t);
    expect(idle.result!.win).toBe(false);
  });

  it("落场时店里的钟停住", () => {
    const s = fresh();
    s.phase = "open";
    startArena(s, "market");
    const minute0 = s.flow.minuteOfDay;
    expect(tickMinute(s)).toBe(false);
    expect(s.flow.minuteOfDay).toBe(minute0);
  });
});

describe("落场：面板与存档", () => {
  it("三块场地的视图都带对手与门槛", () => {
    const s = fresh();
    const views = arenaViews(s);
    expect(views).toHaveLength(3);
    expect(views.every((v) => v.rival.name.length > 0)).toBe(true);
    // 对手门槛随场地抬（rivalEdge），擂台最高
  expect(views[2]!.rivalTarget).toBeGreaterThan(views[0]!.rivalTarget);
  });

  it("进行中的局不落盘，场次与日期要存", () => {
    const s = fresh();
    startArena(s, "market");
    expect(s.arena).not.toBeNull();
    const blob = serialize(s);
    const back = deserialize(blob)!;
    expect(back.arena).toBeNull();
    expect(back.arenaDay).toBe(s.arenaDay);
    expect(back.arenaRuns).toBe(1);
    expect(SAVE_VERSION).toBe(34);
  });

  it("老档没有这些字段也能读，坏值归零", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 21;
    delete raw.arena;
    delete raw.arenaDay;
    delete raw.arenaRuns;
    (raw.tally as Record<string, unknown>).arenaRuns = -3;
    delete (raw.tally as Record<string, unknown>).arenaWins;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.arena).toBeNull();
    expect(back.arenaDay).toBe(-1);
    expect(back.arenaRuns).toBe(0);
    expect(back.tally.arenaRuns).toBe(0);
    expect(back.tally.arenaWins).toBe(0);
  });
});

describe("落场：赢了会压同条街", () => {
  it("赢一场：对面记一次胜、名气压一格", () => {
    const s = fresh();
    const target = arenaRivalEntryOf(s);
    expect(target).not.toBeNull();
    const before = s.rivals.find((r) => r.id === target!.id)!;
    const fame0 = before.fame;
    const wins0 = before.wins;
    expect(startArena(s, "market").ok).toBe(true);
    if (s.arena) s.arena.mine = 9_999;
    const step = runToEnd(s);
    expect(step.finished).toBe(true);
    const after = s.rivals.find((r) => r.id === target!.id)!;
    expect(after.wins).toBe(wins0 + 1);
    expect(after.fame).toBe(Math.max(0, fame0 - 1));
  });

  it("连赢三场：对面服气，结算文案里说出来", () => {
    const s = fresh();
    const target = arenaRivalEntryOf(s)!;
    let last = "";
    for (let i = 0; i < 3; i += 1) {
      s.arenaDay = -1;
      s.arenaRuns = 0;
      expect(startArena(s, "market").ok).toBe(true);
      if (s.arena) s.arena.mine = 9_999;
      last = runToEnd(s).result!.line;
    }
    const rs = s.rivals.find((r) => r.id === target.id)!;
    expect(rs.pacified).toBe(true);
    expect(last).toContain("服气了");
  });

  it("输一场：不动对面的战绩", () => {
    const s = fresh();
    const target = arenaRivalEntryOf(s)!;
    const rs0 = s.rivals.find((r) => r.id === target.id)!;
    const wins0 = rs0.wins;
    const fame0 = rs0.fame;
    expect(startArena(s, "market").ok).toBe(true);
    // 一招不出，站着必输
    runToEnd(s);
    const rs = s.rivals.find((r) => r.id === target.id)!;
    expect(rs.wins).toBe(wins0);
    expect(rs.fame).toBe(fame0);
  });
});
