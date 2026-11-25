/**
 * 服务端事件表只读对账（批 AJ′，解 P424）。
 *
 * 批 AH′ 的生成器只在 `npm run -s gen:server` 和部署脚本里跑 ——
 * 也就是说：命令行的测试全绿，表照样能走散，只有发布那一刻才会炸。
 * 这一份是**只读**的（不写盘），所以 `npm test` 里就会把走散抓出来，
 * 红的时候按提示跑一次 `npm run -s gen:server` 就好。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENTS } from "../src/data/events";
import { SERVER_EVENTS_PATH, serverRows, stripBom } from "./server-events.rows";

describe("服务端事件表与游戏一致（批 AJ′，解 P424）", () => {
  it("`server/events.json` 里的行与 EVENTS 逐行相同（只读）", () => {
    const rows = serverRows();

    let raw = "";
    try {
      raw = readFileSync(SERVER_EVENTS_PATH, "utf8");
    } catch {
      throw new Error(`${SERVER_EVENTS_PATH} 不存在 —— 跑一次 \`npm run -s gen:server\``);
    }

    let disk: unknown;
    try {
      disk = JSON.parse(stripBom(raw));
    } catch {
      throw new Error(`${SERVER_EVENTS_PATH} 不是合法 JSON —— 跑一次 \`npm run -s gen:server\``);
    }

    // 先把最容易看懂的差异说清楚：条数
    const list = Array.isArray(disk) ? (disk as { id?: string }[]) : [];
    expect(
      list.length,
      `服务端那张表有 ${list.length} 条，游戏里 ${rows.length} 条 —— 跑一次 \`npm run -s gen:server\``,
    ).toBe(rows.length);

    // 再逐行比：内容改了但没重导，这里会指出是哪一件
    const drifted: string[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const a = JSON.stringify(rows[i]);
      const b = JSON.stringify(list[i]);
      if (a !== b) drifted.push(rows[i].id);
    }
    expect(
      drifted,
      `这些事件在服务端那份表里与游戏不同：${drifted.join("、")} —— 跑一次 \`npm run -s gen:server\``,
    ).toEqual([]);

    expect(EVENTS.length).toBe(rows.length);
  });
});
