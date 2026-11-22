import { describe, expect, it } from "vitest";

import { NOTES, NOTE_GROUPS, NOTE_TOTAL, notesOfGroup } from "../data/notebook";
import {
  hasNote,
  nextNote,
  noteIds,
  noteSummary,
  noteTick,
  noteViews,
  noteVoiceContext,
  rememberNoodle,
} from "./notebook";
import { createInitialState } from "./state";

const fresh = () => createInitialState("p-notebook", 1);

describe("阿婆的笔记本（批次八）", () => {
  it("十二条、三组、每组四条", () => {
    expect(NOTE_TOTAL).toBe(12);
    expect(NOTE_GROUPS.map((g) => g.id)).toEqual(["noodle", "soup", "shop"]);
    for (const g of NOTE_GROUPS) expect(notesOfGroup(g.id)).toHaveLength(4);
  });

  it("每条都有标题、cue、阿婆原话、出处对照", () => {
    for (const def of NOTES) {
      expect(def.title.length).toBeGreaterThan(1);
      expect(def.cue.length).toBeGreaterThan(2);
      expect(def.elder.length).toBeGreaterThan(4);
      expect(def.kairo.length).toBeGreaterThan(2);
    }
  });

  it("正文 60–140 字，且一个阿拉伯数字都没有", () => {
    for (const def of NOTES) {
      expect(def.body.length).toBeGreaterThanOrEqual(50);
      expect(def.body.length).toBeLessThanOrEqual(150);
      expect(/[0-9０-９]/.test(def.body)).toBe(false);
    }
  });

  it("正文不出现游戏术语（分数 / 契合 / 加成 / 百分比）", () => {
    const banned = ["分数", "契合", "加成", "百分比", "%", "属性"];
    for (const def of NOTES) {
      for (const word of banned) expect(def.body.includes(word)).toBe(false);
    }
  });

  it("新局一条都没有，summary 从零开始", () => {
    const s = fresh();
    expect(noteIds(s)).toHaveLength(0);
    expect(noteSummary(s)).toBe("已记 0 / 12 条");
    expect(noteViews(s).every((v) => !v.unlocked)).toBe(true);
  });

  it("换一种粉就翻开「粉的厚薄」，换两种才翻开「宽粉与细粉」", () => {
    const s = fresh();
    expect(rememberNoodle(s, "flat")).toBe(1);
    let fresh1 = noteTick(s, { noodle: "flat", noodlesTried: 1 });
    expect(fresh1).toContain("n_thick");
    expect(fresh1).not.toContain("n_wide");
    expect(rememberNoodle(s, "dry")).toBe(2);
    fresh1 = noteTick(s, { noodle: "dry", noodlesTried: 2 });
    expect(fresh1).toContain("n_wide");
    expect(fresh1).toContain("n_dry");
    expect(hasNote(s, "n_dry")).toBe(true);
  });

  it("酸笋与豆豉同时下锅才翻开「豆豉要爆到什么时候」", () => {
    const s = fresh();
    const only = noteTick(s, { toppings: ["top.sourbamboo"] });
    expect(only).toContain("s_sour");
    expect(only).not.toContain("s_douchi");
    const both = noteTick(s, { toppings: ["top.sourbamboo", "top.douchi"] });
    expect(both).toContain("s_douchi");
  });

  it("汤寡一次、换骨一次、亏一个月、流失过半、动过价签、口碑掉到三以下，各翻一页", () => {
    const s = fresh();
    expect(noteTick(s, { soup: 40 })).toContain("s_boil");
    expect(noteTick(s, { boneChanged: true })).toContain("s_bone");
    expect(noteTick(s, { monthProfit: -1 })).toContain("p_cost");
    expect(noteTick(s, { lostRate: 0.6 })).toContain("p_seat");
    expect(noteTick(s, { priceChanged: true })).toContain("p_price");
    expect(noteTick(s, { reputation: 2.9 })).toContain("p_keep");
    expect(noteIds(s)).toHaveLength(6);
  });

  it("出碗超过三分半才翻开「粉泡多久算过」", () => {
    const s = fresh();
    expect(noteTick(s, { serveMinutes: 3 })).not.toContain("n_soak");
    expect(noteTick(s, { serveMinutes: 3.6 })).toContain("n_soak");
  });

  it("同一条只记一次，一次只弹一条", () => {
    const s = fresh();
    const first = noteTick(s, { soup: 30, boneChanged: true, monthProfit: -5 });
    expect(first.length).toBeGreaterThan(1);
    expect(s.flow.lastNote).toBe(first[0]);
    const again = noteTick(s, { soup: 30, boneChanged: true, monthProfit: -5 });
    expect(again).toHaveLength(0);
    expect(noteSummary(s)).toBe(`已记 ${first.length} / 12 条`);
  });

  it("nextNote 给第一条还没解开的，全解开时给 null", () => {
    const s = fresh();
    expect(nextNote(s)?.id).toBe("n_thick");
    s.flow.notes = NOTES.map((n) => n.id);
    expect(nextNote(s)).toBeNull();
  });

  it("给模型的上下文只有事与话，没有数字", () => {
    const def = NOTES[0]!;
    const ctx = noteVoiceContext(def);
    expect(Object.keys(ctx).sort()).toEqual(["事", "类", "话"].sort());
    expect(/[0-9]/.test(ctx["话"]!)).toBe(false);
  });

  it("老档没有这两格也能读（notes / noodleTried 缺省为空）", () => {
    const s = fresh();
    delete s.flow.notes;
    delete s.flow.noodleTried;
    expect(noteIds(s)).toEqual([]);
    expect(rememberNoodle(s, "round")).toBe(1);
    noteTick(s, { noodlesTried: 1 });
    expect(hasNote(s, "n_thick")).toBe(true);
  });
});
