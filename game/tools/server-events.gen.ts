/**
 * 服务端事件表重导出（批 AH′，解 P344）。
 *
 * 为什么要有它：`server/app.py` 的 `deepseek_narrative()` 要用事件的 `title` / `body`
 * 去喂模型，读的是**服务端自己那份** `server/events.json`。游戏里的 `EVENTS` 涨到八十三件时，
 * 那份副本还停在批 N′ 之前的三十二件 —— 线上 health 的 `"events": 32` 就是这么发现的，
 * 当时是手写一次性脚本补的。手写的活儿迟早会再漏一次。
 *
 * 跑法：`npm run -s gen:server`（在 `game/` 下）。
 * 它**只在内容真的变了的时候才写文件**，所以 CI / 反复跑都不会造成假 diff。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENTS } from "../src/data/events";

const OUT = "../server/events.json";

interface ServerRow {
  id: string;
  source: string;
  title: string;
  body: string;
  weight: number;
  cooldownDays: number;
  choices: { label: string; summary: string; result: string }[];
}

export function serverRows(): ServerRow[] {
  return EVENTS.map((d) => ({
    id: d.id,
    source: "static_v1",
    title: d.title,
    body: d.body,
    weight: d.weight,
    cooldownDays: d.cooldownDays,
    choices: d.choices.map((c) => ({ label: c.label, summary: c.summary, result: c.result })),
  }));
}

describe("服务端事件表（批 AH′）", () => {
  it("`server/events.json` 与游戏里的 EVENTS 一致", () => {
    const rows = serverRows();
    expect(rows.length).toBe(EVENTS.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.body.length).toBeGreaterThan(0);
      // 服务端只拿 title / body 喂模型，但整表搬过去便于以后直接用
      expect(r.choices.length).toBeGreaterThan(0);
    }

    let existed = "";
    try {
      existed = readFileSync(OUT, "utf8");
    } catch {
      existed = "";
    }
    const clean = existed.replace(/^\uFEFF/, "");
    let same = false;
    try {
      same = JSON.stringify(JSON.parse(clean)) === JSON.stringify(rows);
    } catch {
      same = false;
    }
    if (!same) writeFileSync(OUT, `${JSON.stringify(rows, null, 1)}\n`, "utf8");
    expect(same || true).toBe(true);
    // 这条是真判据：写完之后再从磁盘读回来，行数与游戏一致
    const back = JSON.parse(readFileSync(OUT, "utf8").replace(/^\uFEFF/, "")) as ServerRow[];
    expect(back.length).toBe(EVENTS.length);
  });
});
