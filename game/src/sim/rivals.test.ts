import { describe, expect, it } from "vitest";
import { RIVALS, RIVAL_BY_ID, PACIFY_WINS, SHARE_CAP, TAKEOVER_MIN_GRADE } from "../data/rivals";
import { DISTRICTS } from "../data/nanning";
import { createInitialState, type GameState } from "./state";
import { openForBusiness, monthlyRentOf } from "./setup";
import { deserialize, serialize } from "./save";
import {
  initRivals,
  noteWin,
  pacifyGiftOf,
  rivalMonthTick,
  rivalShareOf,
  rivalViews,
  shareOfOne,
  standingOf,
  streetSummary,
  strongestRival,
  takeOverShop,
  takeoverPoolBoostOf,
  takeoverRentFactor,
} from "./rivals";

function fresh(): GameState {
  const s = createInitialState("rivals-test", 7);
  const r = openForBusiness(s, "alley", "测试老友粉");
  if (!r.ok) throw new Error("建店失败：" + r.reason);
  return s;
}

describe("同条街（M1/M′）：16 家同行", () => {
  it("十六家、十二区、id 唯一、tier 1—3、district 合法", () => {
    expect(RIVALS.length).toBe(16);
    const ids = new Set(RIVALS.map((r) => r.id));
    expect(ids.size).toBe(16);
    const districtIds = new Set(DISTRICTS.map((d) => d.id));
    for (const r of RIVALS) {
      expect(districtIds.has(r.district as never)).toBe(true);
      expect([1, 2, 3]).toContain(r.tier);
      expect(r.signature.taste).toBeGreaterThan(0);
      expect(r.signature.price).toBeGreaterThan(0);
      expect(r.takeoverFeeYuan).toBeGreaterThan(0);
      expect(r.lines.length).toBeGreaterThan(0);
    }
    expect(RIVAL_BY_ID.size).toBe(16);
  });

  it("新局每家名气都是初始值，兴宁这条街份额 > 0 且不超过上限", () => {
    const s = fresh();
    const states = initRivals();
    expect(s.rivals.length).toBe(states.length);
    for (const rs of s.rivals) {
      expect(rs.fame).toBe(RIVAL_BY_ID.get(rs.id)!.fame);
      expect(rs.closed).toBe(false);
      expect(rs.pacified).toBe(false);
    }
    // 默认在兴宁：老甘 + 三姐两家
    const share = rivalShareOf(s);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(SHARE_CAP);
  });

  it("服气之后单家份额砍半", () => {
    const s = fresh();
    const rs = s.rivals.find((r) => r.id === "laogan")!;
    const before = shareOfOne(rs);
    rs.pacified = true;
    expect(shareOfOne(rs)).toBeCloseTo(before / 2, 6);
  });

  it("名气归零 = 关门，份额为 0", () => {
    const s = fresh();
    const rs = s.rivals.find((r) => r.id === "laogan")!;
    rs.fame = 0;
    rs.closed = true;
    expect(shareOfOne(rs)).toBe(0);
  });

  it("赢满三次才算服气，noteWin 第三次返回 true", () => {
    const s = fresh();
    expect(noteWin(s, "laogan")).toBe(false);
    expect(noteWin(s, "laogan")).toBe(false);
    expect(noteWin(s, "laogan")).toBe(true);
    const rs = s.rivals.find((r) => r.id === "laogan")!;
    expect(rs.wins).toBe(PACIFY_WINS);
    expect(rs.pacified).toBe(true);
    // 已服气之后再赢不重复报喜
    expect(noteWin(s, "laogan")).toBe(false);
  });

  it("不认识的名字不记胜负", () => {
    const s = fresh();
    expect(noteWin(s, "no-such-shop")).toBe(false);
  });
});

describe("同条街（M1）：视角与街区自述", () => {
  it("rivalViews 只列本区、能看出还差几场才服气", () => {
    const s = fresh();
    const views = rivalViews(s);
    expect(views.length).toBe(2);
    for (const v of views) {
      expect(v.def.district).toBe(s.district);
      expect(v.toPacify).toBe(PACIFY_WINS - v.state.wins);
      expect(v.tierWord.length).toBeGreaterThan(0);
    }
  });

  it("搬到青秀就换成青秀那两家", () => {
    const s = fresh();
    s.district = "qingxiu";
    const names = rivalViews(s).map((v) => v.def.id);
    expect(names).toContain("nanhu");
    expect(names).toContain("fengling");
    expect(names).not.toContain("laogan");
  });

  it("口碑越高压得越狠；streetSummary 有份额与服气数", () => {
    const s = fresh();
    const low = standingOf(s);
    s.reputation = 4.5;
    expect(standingOf(s)).toBeGreaterThan(low);
    const top = strongestRival(s);
    expect(top).not.toBeNull();
    const text = streetSummary(s);
    expect(text).toContain("服气");
    expect(text).toContain("抢");
  });
});

describe("同条街（M1）：月初结算与接手铺面", () => {
  it("月初名气自己涨 1；玩家口碑高就往下压", () => {
    const s = fresh();
    s.reputation = 0.6;
    const rs = s.rivals.find((r) => r.id === "laogan")!;
    const fame0 = rs.fame;
    rivalMonthTick(s);
    expect(rs.fame).toBe(fame0 + 1);

    s.reputation = 4.2;
    const fame1 = rs.fame;
    rivalMonthTick(s);
    // 口碑 4.2：先 −2 再额外 −1，再 +1 = 净 −2
    expect(rs.fame).toBe(fame1 - 2);
  });

  it("名气被压到 0 就关门，并留一句台词", () => {
    const s = fresh();
    s.reputation = 4.5;
    const rs = s.rivals.find((r) => r.id === "sanjie")!;
    rs.fame = 1;
    const out = rivalMonthTick(s);
    expect(rs.closed).toBe(true);
    expect(out.closed.some((n) => n.includes("三姐"))).toBe(true);
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it("服气之后每月送食材，最多三家", () => {
    const s = fresh();
    expect(pacifyGiftOf(s)).toBe(0);
    for (const rs of s.rivals.slice(0, 4)) rs.pacified = true;
    expect(pacifyGiftOf(s)).toBe(3);
  });

  it("没关门接不了；段位不够接不了；钱不够接不了", () => {
    const s = fresh();
    expect(takeOverShop(s, "laogan").ok).toBe(false);
    const rs = s.rivals.find((r) => r.id === "laogan")!;
    rs.closed = true;
    expect(takeOverShop(s, "laogan").reason).toContain(String(TAKEOVER_MIN_GRADE));
    s.gradeLevel = TAKEOVER_MIN_GRADE;
    s.cash = 10;
    expect(takeOverShop(s, "laogan").reason).toContain("转让费");
    expect(s.takenOver.length).toBe(0);
  });

  it("接手成功：扣转让费、记进 takenOver、租金打折、池子变大", () => {
    const s = fresh();
    const rs = s.rivals.find((r) => r.id === "laogan")!;
    rs.closed = true;
    s.gradeLevel = TAKEOVER_MIN_GRADE;
    s.cash = 100_000;
    const rentBefore = monthlyRentOf(s);
    const r = takeOverShop(s, "laogan");
    expect(r.ok).toBe(true);
    expect(r.feeYuan).toBe(RIVAL_BY_ID.get("laogan")!.takeoverFeeYuan);
    expect(s.cash).toBe(100_000 - r.feeYuan!);
    expect(s.takenOver).toContain("laogan");
    expect(takeoverRentFactor(s)).toBeLessThan(1);
    expect(monthlyRentOf(s)).toBeLessThan(rentBefore);
    expect(takeoverPoolBoostOf(s)).toBeGreaterThan(0);
    // 同一间不能接两次
    expect(takeOverShop(s, "laogan").ok).toBe(false);
  });

  it("接两家租金更低，但有下限", () => {
    const s = fresh();
    s.gradeLevel = TAKEOVER_MIN_GRADE;
    s.cash = 200_000;
    for (const id of ["laogan", "sanjie"]) s.rivals.find((r) => r.id === id)!.closed = true;
    const one = takeOverShop(s, "laogan");
    expect(one.ok).toBe(true);
    const f1 = takeoverRentFactor(s);
    expect(takeOverShop(s, "sanjie").ok).toBe(true);
    const f2 = takeoverRentFactor(s);
    expect(f2).toBeLessThan(f1);
    expect(f2).toBeGreaterThanOrEqual(0.65);
  });
});

describe("同条街（M1）：存档", () => {
  it("v19 存得住同行状态与接手的铺子", () => {
    const s = fresh();
    s.rivals.find((r) => r.id === "laogan")!.wins = 2;
    s.rivals.find((r) => r.id === "sanjie")!.pacified = true;
    s.takenOver = ["wuxiang"];
    const back = deserialize(serialize(s))!;
    expect(back.rivals.find((r) => r.id === "laogan")!.wins).toBe(2);
    expect(back.rivals.find((r) => r.id === "sanjie")!.pacified).toBe(true);
    expect(back.takenOver).toEqual(["wuxiang"]);
  });

  it("老档没有 rivals 就按初始名气补齐", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete raw.rivals;
    delete raw.takenOver;
    raw.saveVersion = 18;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.rivals.length).toBe(16);
    expect(back.takenOver).toEqual([]);
    expect(back.flow.lastStreet).toBeNull();
  });
});
