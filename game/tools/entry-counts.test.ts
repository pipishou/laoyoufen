// 只读对账这一侧（批 AL′）：`npm test` 里跑到，一旦代码里的条数与清单不一致就红。
// 不要在这里写盘 —— 要改清单请跑 `npm run -s gen:server`。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENTRY_COUNTS_PATH, diffCounts, entryCounts } from "./entry-counts.rows";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, ENTRY_COUNTS_PATH);

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

describe("条目条数清单：代码与清单不许走散", () => {
  it("game/data/entry-counts.json 与各表的权威条数一致", () => {
    const got = entryCounts();
    const raw = stripBom(readFileSync(OUT, "utf8"));
    const want = JSON.parse(raw) as Record<string, number>;
    const diff = diffCounts(want, got);
    expect(diff, `这些条目与清单不同（跑一次 \`npm run -s gen:server\` 重写清单）：\n${diff.join("\n")}`).toEqual([]);
  });

  it("清单里不写零、不写小数", () => {
    const got = entryCounts();
    for (const [k, v] of Object.entries(got)) {
      expect(Number.isInteger(v), `${k} 不是整数：${v}`).toBe(true);
      expect(v, `${k} 是 0 条，要么真没有、要么读错了出口`).toBeGreaterThan(0);
    }
  });
});
