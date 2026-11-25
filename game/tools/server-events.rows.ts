/**
 * 服务端事件表的行工厂（批 AH′ 起，批 AJ′ 拆出来解 P424）。
 *
 * 为什么单独一个文件：`server/app.py` 的 `deepseek_narrative()` 读的是**服务端自己那份**
 * `server/events.json`，要的是事件的 `title` / `body`。游戏里的 `EVENTS` 涨到八十三件时，
 * 那份副本还停在批 N′ 之前的三十二件（线上 health 的 `"events": 32` 就是这么发现的）。
 *
 * 三个地方共用这一份「怎么把 EVENTS 摊成服务端的行」：
 * - `tools/server-events.gen.ts` —— 写盘（`npm run -s gen:server`，部署脚本打包前也跑）
 * - `tools/server-events.test.ts` —— 只读对账（`npm test` 里就会跑，走散直接红）
 * - 以后要加别的出口，也只改这里
 *
 * 这个文件**不碰 `node:fs`**，所以 `tools/` 下的测试文件不会被 `tsc` 的 `@types/node` 绊住。
 */
import { EVENTS } from "../src/data/events";

/** 服务端那份表的路径（相对 `game/`，因为脚本都在 `game/` 下跑）。 */
export const SERVER_EVENTS_PATH = "../server/events.json";

export interface ServerRow {
  id: string;
  source: string;
  title: string;
  body: string;
  weight: number;
  cooldownDays: number;
  choices: { label: string; summary: string; result: string }[];
}

/** 把游戏里的 `EVENTS` 摊成服务端认的行（顺序即文件顺序，别在这里排序）。 */
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

/** 去掉可能的 BOM —— PowerShell 的 `Set-Content -Encoding utf8` 会加，`JSON.parse` 会炸。 */
export function stripBom(raw: string): string {
  return raw.replace(/^\uFEFF/, "");
}
