import { describe, expect, it } from "vitest";
import { MANUAL_PAGES, MANUAL_TOTAL, manualPageById, manualSections } from "../data/manual";

describe("店里的手册（批 N′）", () => {
  it("十二页、四个分章，一页一件事", () => {
    expect(MANUAL_TOTAL).toBe(12);
    expect(MANUAL_PAGES).toHaveLength(12);
    expect(new Set(MANUAL_PAGES.map((p) => p.id)).size).toBe(12);
    const secs = manualSections();
    expect(secs.map((g) => g.section)).toEqual(["一天的生意", "这一碗", "这条街", "手里的牌"]);
    expect(secs.reduce((n, g) => n + g.pages.length, 0)).toBe(12);
  });

  it("每页都指得到一张真表或一个真函数", () => {
    for (const p of MANUAL_PAGES) {
      expect(p.title.length).toBeGreaterThan(1);
      expect(p.gist.length).toBeGreaterThan(4);
      expect(p.body.length).toBeGreaterThan(20);
      // where 要写成 `文件 的 函数 / 常量` 这种能 grep 到的样子
      expect(p.where).toMatch(/^(data|sim)\//);
    }
  });

  it("正文不写阿拉伯数字（手册讲道理，不报数）", () => {
    for (const p of MANUAL_PAGES) {
      expect(/[0-9]/.test(p.body)).toBe(false);
      expect(/[0-9]/.test(p.gist)).toBe(false);
    }
  });

  it("查不到就是 null", () => {
    expect(manualPageById("m.seats")?.title).toBe("座位才是真的瓶颈");
    expect(manualPageById("nope")).toBeNull();
    expect(manualPageById(null)).toBeNull();
  });
});
