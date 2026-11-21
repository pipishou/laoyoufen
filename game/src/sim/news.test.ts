import { describe, expect, it } from "vitest";
import { NEWS, NEWS_TOTAL, NEWS_KEEP } from "../data/news";
import { latestNews, newsDate, newsKindOf, newsList, newsSummary, pushNews, todayNews } from "./news";
import { createInitialState, type GameState } from "./state";

function fresh(): GameState {
  return createInitialState("p1", 7);
}

describe("报纸表", () => {
  it("每一类都有话可说（兜底的日常至少三条）", () => {
    const kinds = new Set(NEWS.map((n) => n.kind));
    expect(kinds.has("plain")).toBe(true);
    expect(NEWS.filter((n) => n.kind === "plain").length).toBeGreaterThanOrEqual(3);
    expect(NEWS_TOTAL).toBeGreaterThanOrEqual(15);
  });

  it("每条都有出处备注，且不出现别的作品名", () => {
    for (const n of NEWS) {
      expect(n.kairo.length).toBeGreaterThan(2);
      expect(/开罗|Ramen|Kairo/.test(n.line + n.kairo)).toBe(false);
    }
  });

  it("模板里不写死数字（数字要看状态，写死就会撒谎）", () => {
    for (const n of NEWS) {
      expect(/\d/.test(n.line)).toBe(false);
    }
  });
});

describe("今天写哪一类", () => {
  it("刚开张、一碗都没卖过 → 开张稿", () => {
    const s = fresh();
    expect(newsKindOf(s)).toBe("open");
  });

  it("修过街面 → 街区稿；买过包装机 → 袋装稿", () => {
    const s = fresh();
    s.tally.bowls = 100;
    s.streets = ["lane_lamp"];
    expect(newsKindOf(s)).toBe("street");
    s.pack = true;
    expect(newsKindOf(s)).toBe("pack");
  });

  it("有同行关门 → 同行稿压过其它", () => {
    const s = fresh();
    s.tally.bowls = 100;
    s.streets = ["lane_lamp"];
    s.pack = true;
    s.rivals[0]!.closed = true;
    expect(newsKindOf(s)).toBe("rival");
  });
});

describe("写报", () => {
  it("同一天同一局，写出来是同一条（不消耗随机数）", () => {
    const s = fresh();
    s.tally.bowls = 100;
    s.streets = ["lane_lamp"];
    expect(todayNews(s).text).toBe(todayNews(s).text);
  });

  it("换一天会换一条（或者至少换一类）", () => {
    const s = fresh();
    s.tally.bowls = 80;
    s.streets = ["lane_lamp"];
    const a = todayNews(s);
    s.day = 9;
    const b = todayNews(s);
    expect(`${a.month}-${a.day}-${a.text}`).not.toBe(`${b.month}-${b.day}-${b.text}`);
  });

  it("店名与街名会被填进去，不留占位符", () => {
    const s = fresh();
    s.shopName = "阿强老友粉";
    s.tally.bowls = 200;
    s.streets = ["lane_lamp"];
    const t = todayNews(s).text;
    expect(t).not.toContain("{");
    expect(t.length).toBeGreaterThan(6);
  });

  it("只留最近几条，最新的在最后", () => {
    const s = fresh();
    for (let i = 0; i < NEWS_KEEP + 2; i += 1) {
      s.day = i + 1;
      pushNews(s);
    }
    expect(s.news.length).toBe(NEWS_KEEP);
    expect(latestNews(s)).not.toBeNull();
    expect(newsList(s)[0]).toBe(latestNews(s));
    expect(newsSummary(s)).toContain(String(NEWS_KEEP));
  });

  it("写一次多一条，日期跟着当天走", () => {
    const s = fresh();
    const before = s.news.length;
    s.day = 4;
    const item = pushNews(s);
    expect(s.news.length).toBe(before + 1);
    expect(item.day).toBe(4);
    expect(latestNews(s)).toBe(item);
  });
});

describe("日期写法", () => {
  it("写成「十一月二十一日」这种人话，不是 11-21", () => {
    // state.day 是 1 起算，直接照写，不加一
    expect(newsDate({ month: 10, day: 21, text: "", kind: "plain", kairo: "" })).toBe("十一月二十一日");
    expect(newsDate({ month: 0, day: 1, text: "", kind: "plain", kairo: "" })).toBe("一月一日");
    expect(newsDate({ month: 11, day: 9, text: "", kind: "plain", kairo: "" })).toBe("十二月九日");
  });
});
