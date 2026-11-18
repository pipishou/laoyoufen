import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLine, getLine, lineId, localLine, remoteLineCount, resetLines, setProxyUrl, type LineAsk } from "./lines";

const KINDS = ["street_request", "rival_rumor", "recipe_buyer", "arena_call"] as const;

function ask(kind: LineAsk["kind"] = "street_request", key = "lane_lamp", day = 3): LineAsk {
  return { kind, key, context: { 街: "明秀路" }, month: 0, day };
}

afterEach(() => {
  resetLines();
  setProxyUrl(null);
  vi.unstubAllGlobals();
});

describe("ai/lines 本地兜底", () => {
  it("四个落点都有本地句，且都不含阿拉伯数字", () => {
    for (const kind of KINDS) {
      const line = localLine(ask(kind));
      expect(line.length).toBeGreaterThan(4);
      expect(/\d/.test(line)).toBe(false);
    }
  });

  it("同一个键永远同一句（确定性，不碰 state.rng）", () => {
    expect(localLine(ask())).toBe(localLine(ask()));
  });

  it("换了日期或换个对象，可能换一句", () => {
    const a = new Set([localLine(ask("rival_rumor", "laogan", 1)), localLine(ask("rival_rumor", "laogan", 2))]);
    const b = new Set([localLine(ask("rival_rumor", "laogan", 1)), localLine(ask("rival_rumor", "sanjie", 1))]);
    expect(a.size + b.size).toBeGreaterThanOrEqual(3);
  });

  it("缓存键是 kind:key:month:day", () => {
    expect(lineId(ask())).toBe("street_request:lane_lamp:0:3");
  });

  it("没换到在线句时 getLine 用的是调用处给的本地句", () => {
    expect(getLine(ask(), "本地兜底")).toBe("本地兜底");
    expect(remoteLineCount()).toBe(0);
  });
});

describe("ai/lines 在线通道", () => {
  it("没配代理地址就直接返回 null，不发请求", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchLine(ask())).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("配了代理：正常句会进缓存，同一条不会请求第二次", async () => {
    setProxyUrl("http://127.0.0.1:8767/line");
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ body: "这条巷子晚上黑，娃娃放学走这儿我不放心。", source: "remote" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", spy);

    const line = await fetchLine(ask());
    expect(line).toBe("这条巷子晚上黑，娃娃放学走这儿我不放心。");
    expect(getLine(ask(), "本地")).toBe(line);
    expect(remoteLineCount()).toBe(1);

    await fetchLine(ask());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("回来的句子含阿拉伯数字 → 整句作废，保持本地", async () => {
    setProxyUrl("http://127.0.0.1:8767/line");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ body: "这条街现在有 3 家粉店。" }), { status: 200 })),
    );
    expect(await fetchLine(ask())).toBeNull();
    expect(getLine(ask(), "本地句")).toBe("本地句");
    expect(remoteLineCount()).toBe(0);
  });

  it("服务端报错 / 结构不对 / 空串，一律回落", async () => {
    setProxyUrl("http://127.0.0.1:8767/line");
    const bodies = [
      () => new Response("boom", { status: 503 }),
      () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }),
      () => new Response(JSON.stringify({ body: "   " }), { status: 200 }),
    ];
    for (const make of bodies) {
      resetLines();
      vi.stubGlobal("fetch", vi.fn(async () => make()));
      expect(await fetchLine(ask())).toBeNull();
    }
  });

  it("网络抛错不会把游戏带崩", async () => {
    setProxyUrl("http://127.0.0.1:1/line");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(fetchLine(ask())).resolves.toBeNull();
  });
});
