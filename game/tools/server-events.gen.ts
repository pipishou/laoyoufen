/**
 * 服务端事件表写盘（批 AH′ 起，批 AJ′ 拆薄）。
 *
 * 跑法：`npm run -s gen:server`（在 `game/` 下）；`deploy/deploy-cli.ps1` 在打包前也会跑它。
 * **只在内容真的变了的时候才写文件**，所以反复跑不会造成假 diff。
 *
 * 只读对账在 `tools/server-events.test.ts`（`npm test` 里就会跑）——
 * 那一份不加 `node:fs` 的写权限，走散了只会红、不会偷偷改文件。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENTS } from "../src/data/events";
import { SERVER_EVENTS_PATH, serverRows, stripBom } from "./server-events.rows";

describe("服务端事件表（批 AH′）", () => {
  it("`server/events.json` 与游戏里的 EVENTS 一致（不一致就重写）", () => {
    const rows = serverRows();
    expect(rows.length).toBe(EVENTS.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.body.length).toBeGreaterThan(0);
      expect(r.choices.length).toBeGreaterThan(0);
    }

    let existed = "";
    try {
      existed = readFileSync(SERVER_EVENTS_PATH, "utf8");
    } catch {
      existed = "";
    }
    let same = false;
    try {
      same = JSON.stringify(JSON.parse(stripBom(existed))) === JSON.stringify(rows);
    } catch {
      same = false;
    }
    if (!same) writeFileSync(SERVER_EVENTS_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

    // 真判据：写完之后再从磁盘读回来，行数与游戏一致
    const back = JSON.parse(stripBom(readFileSync(SERVER_EVENTS_PATH, "utf8"))) as unknown[];
    expect(back.length).toBe(EVENTS.length);
  });
});
