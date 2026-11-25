// 生成器这一侧（批 AL′，解 P344 / 补第六条机制）：把「代码里到底有多少条」写成一份清单。
// 跑 `npm run -s gen:server` 会顺带跑到这里；entry-counts.test.ts 只读对账，两边对不上就红。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENTRY_COUNTS_PATH, diffCounts, entryCounts } from "./entry-counts.rows";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, ENTRY_COUNTS_PATH);

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

describe("条目条数清单（entries manifest）", () => {
  it("代码里的条数与 game/data/entry-counts.json 一致", () => {
    const got = entryCounts();
    let want: Record<string, number> = {};
    let raw = "";
    try {
      raw = stripBom(readFileSync(OUT, "utf8"));
    } catch {
      raw = "";
    }
    if (raw.trim() !== "") want = JSON.parse(raw) as Record<string, number>;

    const diff = diffCounts(want, got);
    if (diff.length > 0) {
      writeFileSync(OUT, `${JSON.stringify(got, null, 2)}\n`, "utf8");
      const back = JSON.parse(stripBom(readFileSync(OUT, "utf8"))) as Record<string, number>;
      expect(diffCounts(back, got)).toEqual([]);
      // 首跑会走到这里：清单刚写出来。有 diff 本身就是要被看见的事，所以打印出来。
      // eslint-disable-next-line no-console
      console.log(`[entries] 清单已按代码重写，变更 ${diff.length} 项：\n${diff.join("\n")}`);
    }
    expect(Object.keys(got).length).toBeGreaterThan(40);
  });
});
