import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLine,
  lineCooldownLeft,
  lineFailStreak,
  resetLines,
  setProxyUrl,
  type LineAsk,
} from "./lines";

/**
 * 一句话通道的失败冷却（批 AL′，解 P429）。
 *
 * 债是怎么记下来的：`tools/gate/playthrough_gate.py` 连跑 5 分钟（37 个游戏日）时
 * 实测 `/laoyou-api/line` 被打了 **389 次**（约 10.5 次/天），全是 404 ——
 * 原来失败既不记缓存也不记「别再试了」，每句都吃满 800ms 超时。
 *
 * 修法判据（这条测试守着的就是它）：**失败之后不许立刻再发**。
 */

const URL = "http://127.0.0.1:8767/line";

function ask(kind: LineAsk["kind"] = "street_request", key = "lane_lamp", day = 3): LineAsk {
  return { kind, key, context: { 街: "明秀路" }, month: 0, day };
}

function spyFail() {
  const spy = vi.fn(async () => {
    throw new Error("offline");
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function spyOk(body = "老友，今天这锅汤够味，粉也滑。") {
  const spy = vi.fn(async () => ({ ok: true, json: async () => ({ body }) }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.useRealTimers();
  resetLines();
  setProxyUrl(null);
  vi.unstubAllGlobals();
});

describe("一句话通道的失败冷却（批 AL′）", () => {
  it("失败一次就静默，下一句连请求都不发", async () => {
    setProxyUrl(URL);
    const spy = spyFail();
    expect(await fetchLine(ask())).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lineFailStreak()).toBe(1);
    expect(lineCooldownLeft()).toBeGreaterThan(50_000);

    // 换一句（不同键），仍然不该发出去
    expect(await fetchLine(ask("street_request", "lane_awning", 4))).toBeNull();
    expect(spy, "冷却期内不该再打接口").toHaveBeenCalledTimes(1);
  });

  it("连败就翻倍：60s → 120s，封顶十分钟", async () => {
    vi.useFakeTimers();
    setProxyUrl(URL);
    spyFail();
    await fetchLine(ask());
    const first = lineCooldownLeft();
    expect(first).toBeGreaterThan(50_000);
    expect(first).toBeLessThanOrEqual(60_000);

    // 时间往前走一分钟（不是调 resetLineCooldown —— 那等于「重连」，会清掉连败次数）
    vi.advanceTimersByTime(61_000);
    expect(lineCooldownLeft()).toBe(0);
    await fetchLine(ask("street_request", "lane_awning", 4));
    const second = lineCooldownLeft();
    expect(lineFailStreak()).toBe(2);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThanOrEqual(120_000);

    // 一路败到封顶
    for (let i = 0; i < 8; i += 1) {
      vi.advanceTimersByTime(11 * 60_000);
      await fetchLine(ask("street_request", `k${i}`, 5 + i));
    }
    expect(lineCooldownLeft()).toBeLessThanOrEqual(10 * 60_000);
  });

  it("成功一次立刻清零：后面再败也从头退避", async () => {
    vi.useFakeTimers();
    setProxyUrl(URL);
    spyFail();
    await fetchLine(ask());
    expect(lineFailStreak()).toBe(1);

    vi.advanceTimersByTime(61_000);
    spyOk();
    const line = await fetchLine(ask("street_request", "lane_lantern", 6));
    expect(line).not.toBeNull();
    expect(lineFailStreak()).toBe(0);
    expect(lineCooldownLeft()).toBe(0);

    // 再败一次 → 又只退 60 秒，而不是接着翻倍
    spyFail();
    await fetchLine(ask("street_request", "lane_poster", 7));
    expect(lineCooldownLeft()).toBeLessThanOrEqual(60_000);
  });

  it("服务端回 404 也算失败（不是只有抛异常才算）", async () => {
    setProxyUrl(URL);
    const spy = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    vi.stubGlobal("fetch", spy);
    expect(await fetchLine(ask())).toBeNull();
    expect(lineFailStreak()).toBe(1);
    expect(lineCooldownLeft()).toBeGreaterThan(0);
  });

  it("resetLines 把退避一起清掉（换局不该带着上一局的账）", async () => {
    setProxyUrl(URL);
    spyFail();
    await fetchLine(ask());
    expect(lineCooldownLeft()).toBeGreaterThan(0);
    resetLines();
    expect(lineCooldownLeft()).toBe(0);
    expect(lineFailStreak()).toBe(0);
  });
});
