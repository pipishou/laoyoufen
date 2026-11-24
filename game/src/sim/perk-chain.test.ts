import { describe, expect, it } from "vitest";
import { PERKS, PERK_BY_ID, perksOfFamily, type PerkFamily } from "../data/perk";
import { createInitialState } from "./state";
import { buyPerk, perkFamilies, perkOwned, perkPoints, perkViews } from "./perk";

const fresh = () => createInitialState("chain", 11);

const FAMILIES: PerkFamily[] = ["heat", "knife", "memory", "human"];

describe("手艺点树的前置链（批 X′，解「十六项之间没有先后」）", () => {
  it("每族四根链：第一项没有 prev，后三项各指向前一项，且不跨族", () => {
    for (const fam of FAMILIES) {
      const rows = perksOfFamily(fam);
      expect(rows).toHaveLength(4);
      expect(rows[0]!.prev).toBeUndefined();
      for (let i = 1; i < rows.length; i += 1) {
        const prev = PERK_BY_ID.get(rows[i]!.prev ?? "");
        expect(prev, `${rows[i]!.id} 的前置存在`).toBeTruthy();
        expect(prev!.family).toBe(fam);
        expect(prev!.id).toBe(rows[i - 1]!.id);
      }
    }
  });

  it("链条把 64 点串成一棵树：没点前置时写「先点「X」」，点不动也不扣点", () => {
    const s = fresh();
    s.gradeLevel = 99;
    const second = perksOfFamily("heat")[1]!;
    const view = perkViews(s).find((v) => v.def.id === second.id)!;
    expect(view.blocked).toBe(true);
    expect(view.affordable).toBe(false);
    expect(view.reason).toBe(`先点「${PERK_BY_ID.get(second.prev!)!.name}」`);

    const before = perkPoints(s);
    const got = buyPerk(s, second.id);
    expect(got.ok).toBe(false);
    expect(got.reason).toBe(`先点「${PERK_BY_ID.get(second.prev!)!.name}」`);
    expect(perkPoints(s)).toBe(before);
    expect(perkOwned(s, second.id)).toBe(false);
  });

  it("点上前置之后，后一项立刻可点，扣的是它自己的价", () => {
    const s = fresh();
    s.gradeLevel = 99;
    const [first, second] = perksOfFamily("knife") as [typeof PERKS[number], typeof PERKS[number]];
    expect(buyPerk(s, first.id).ok).toBe(true);
    const view = perkViews(s).find((v) => v.def.id === second.id)!;
    expect(view.blocked).toBe(false);
    expect(view.affordable).toBe(true);
    const before = perkPoints(s);
    expect(buyPerk(s, second.id).ok).toBe(true);
    expect(perkPoints(s)).toBe(before - second.cost);
  });

  it("「先点这个」只指向没被挡住的那一项（被挡的再便宜也不推）", () => {
    const s = fresh();
    s.gradeLevel = 99;
    const fam = perkFamilies(s).find((f) => f.family === "memory")!;
    const first = perksOfFamily("memory")[0]!;
    expect(fam.rec).toBe(first.id);
    buyPerk(s, first.id);
    const next = perkFamilies(s).find((f) => f.family === "memory")!;
    expect(next.rec).toBe(perksOfFamily("memory")[1]!.id);
  });

  it("点满一条链：四步都被认可，花掉这一族的全部点子", () => {
    const s = fresh();
    s.gradeLevel = 99;
    const rows = perksOfFamily("human");
    for (const r of rows) expect(buyPerk(s, r.id).ok).toBe(true);
    expect(rows.every((r) => perkOwned(s, r.id))).toBe(true);
    const sum = rows.reduce((n, r) => n + r.cost, 0);
    expect(sum).toBe(18);
    expect(perkPoints(s)).toBe(64 - sum);
  });

  it("四条链的第一项都是各族最便宜的那一档，不会一上来就要 5 点", () => {
    for (const fam of FAMILIES) {
      const rows = perksOfFamily(fam);
      const min = Math.min(...rows.map((r) => r.cost));
      expect(rows[0]!.cost).toBe(min);
    }
  });
});
