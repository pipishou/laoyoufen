import { describe, expect, it } from "vitest";
import { SOUP_PIPELINE, soupPipelineWords } from "../data/soupbase";
import { DAY_MINUTES } from "./customer";
import { advanceMinute, createInitialState, type GameState } from "./state";

/**
 * 批 AB′：猪脚卤水的「挂汤」窄出口（决策地图 B 的落地）。
 *
 * 纪律：只记账、只说一句 —— 不打分、不进乘数、不进存档版本。
 */

function runDayWithBase(base: string): GameState {
  const s = createInitialState("p", 5);
  s.menu[0]!.recipe.base = base;
  s.recipe.base = base;
  for (let i = 0; i < DAY_MINUTES; i++) advanceMinute(s);
  return s;
}

describe("挂汤（批 AB′）", () => {
  it("猪脚卤水出的碗记进当天，别的底不记", () => {
    // 注意：跑完一天后 `flow.thickToday` 已经翻篇清零，所以判据看当天记录
    const pig = runDayWithBase("piglioo");
    const lao = runDayWithBase("laoyou");
    expect(pig.days[pig.days.length - 1]!.thick ?? 0).toBeGreaterThan(0);
    expect(lao.days[lao.days.length - 1]!.thick ?? 0).toBe(0);
  });

  it("打烊单只记一次，且记的是猪脚卤水那几碗", () => {
    const pig = runDayWithBase("piglioo");
    const rec = pig.days[pig.days.length - 1]!;
    expect(rec.thick).toBeGreaterThan(0);
    // 挂汤那几碗本来就含在出碗里，不该比当天总碗数还多
    expect(rec.thick!).toBeLessThanOrEqual(rec.served);
  });

  it("番茄底不记挂汤", () => {
    const tomato = runDayWithBase("tomato");
    const rec = tomato.days[tomato.days.length - 1]!;
    expect(rec.thick ?? 0).toBe(0);
  });

  it("工序是三道上桌的：吊骨汤 → 爆香 → 冲汤下粉", () => {
    expect(SOUP_PIPELINE.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(SOUP_PIPELINE.map((p) => p.name)).toEqual(["吊骨汤", "爆香", "冲汤下粉"]);
    // 爆香那一步必须点名四样料 —— 这是老友粉的骨架
    const fry = SOUP_PIPELINE[1]!.what;
    for (const word of ["酸笋", "豆豉", "蒜", "辣椒"]) {
      expect(fry).toContain(word);
    }
    expect(soupPipelineWords()).toBe("吊骨汤 → 爆香 → 冲汤下粉");
  });
});
