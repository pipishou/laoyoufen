import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLine,
  getLine,
  isCleanLine,
  lineId,
  localLine,
  remoteLineCount,
  resetLines,
  setProxyUrl,
  type LineAsk,
} from "./lines";

const KINDS = [
  "street_request",
  "rival_rumor",
  "recipe_buyer",
  "arena_call",
  "hook_voice",
  "tourney_open",
  "trophy_voice",
  "flavor_voice",
  "style_voice",
  "bowl_voice",
] as const;

function ask(kind: LineAsk["kind"] = "street_request", key = "lane_lamp", day = 3): LineAsk {
  return { kind, key, context: { 街: "明秀路" }, month: 0, day };
}

afterEach(() => {
  resetLines();
  setProxyUrl(null);
  vi.unstubAllGlobals();
});

describe("ai/lines 本地兜底", () => {
  it("每个落点都有本地句，且都不含阿拉伯数字", () => {
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

describe("一句话的数字红线（含中文数量词）", () => {
  it("阿拉伯数字、中文数量词都拦；「一口锅」「两口子」这种正常话放行", () => {
    expect(isCleanLine("这条街现在有 3 家粉店。")).toBe(false);
    expect(isCleanLine("今天走了三十几位客人。")).toBe(false);
    expect(isCleanLine("再添两件家当就够用了。")).toBe(false);
    expect(isCleanLine("灶台不趁手，再好的手也伸不开。")).toBe(true);
    expect(isCleanLine("一口气把汤熬出来。")).toBe(true);
    expect(isCleanLine("他们两口子守着这个摊十几年了。")).toBe(true);
    expect(isCleanLine("   ")).toBe(false);
  });

  it("打烊单那句口吻也有本地池，且每一句都过红线", () => {
    for (let day = 1; day <= 12; day++) {
      const line = localLine(ask("hook_voice", "capacity", day));
      expect(line.length).toBeGreaterThan(6);
      expect(isCleanLine(line)).toBe(true);
    }
  });

  it("在线句带中文数量词时整句作废（不只是阿拉伯数字）", async () => {
    setProxyUrl("http://127.0.0.1:8767/line");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ body: "今天走了三十几位客人，得加灶了。" }), { status: 200 })),
    );
    expect(await fetchLine(ask("hook_voice", "capacity"))).toBeNull();
    expect(remoteLineCount()).toBe(0);
  });
});

/**
 * 试玩二轮 F5：副行原来六个档位共用一个池，
 * 于是出现「主句说加灶、副行说街上的事」——副行是在解释主句，说的得是同一件事。
 */
describe("打烊单副行按用途分池", () => {
  const HOOK_KINDS = ["capacity", "grade", "gear", "street", "arena", "none"];
  const withKind = (kind: string, day: number) => ({
    kind: "hook_voice" as const,
    key: "k",
    context: { 类型: kind, 事: "灶台与座位" },
    month: 0,
    day,
  });

  it("六档合起来 26 句，且每句都过数字红线", () => {
    const all = new Set<string>();
    for (const k of HOOK_KINDS) {
      for (let d = 1; d <= 30; d++) {
        const line = localLine(withKind(k, d));
        expect(isCleanLine(line)).toBe(true);
        all.add(line);
      }
    }
    expect(all.size).toBe(26);
  });

  it("加灶与街面两池没有交集", () => {
    const a = new Set<string>();
    const b = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      a.add(localLine(withKind("capacity", d)));
      b.add(localLine(withKind("street", d)));
    }
    for (const line of a) expect(b.has(line)).toBe(false);
  });

  it("没给类型时退回加灶那一档，不会没词", () => {
    const line = localLine({ kind: "hook_voice", key: "x", context: {}, month: 0, day: 1 });
    expect(line.length).toBeGreaterThan(6);
    expect(isCleanLine(line)).toBe(true);
  });

  it("发请求时剔掉只给本地选池的 `类型`", async () => {
    setProxyUrl("http://127.0.0.1:8767/line");
    const spy = vi.fn(
      async (_url: string, _init?: { body?: string }) =>
        new Response(JSON.stringify({ body: "灶台不趁手，再好的手也伸不开。" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", spy);
    await fetchLine(withKind("street", 3));
    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.context).toEqual({ 事: "灶台与座位" });
    expect(body.context.类型).toBeUndefined();
  });
});
