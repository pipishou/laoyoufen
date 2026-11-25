/**
 * 批 AQ′（解 P451）：这句话只许有一个出处。
 *
 * 批 AP′ 把「抬了也卖不动」铺到四处时，每处各抄了一遍字符串 —— 改一处忘一处
 * 就是 P448 复发。这一组测试扫 `game/src` 的源码与样式，盯着三件事：
 *
 * ① 那四条路（`DEMAND_WHERE`）只许在 `src/data/demand.ts` 里出现一次；
 * ② 别处不许再硬编码「再添也卖不动」这一串（抄写即复发）；
 * ③ `hud.css` 那个 `::before` 前缀与 `DEMAND_TAG` 同源。
 *
 * 放在 `tools/` 而不是 `src/`：要读盘就得用 `node:fs`，而本仓没装 `@types/node`，
 * `tsc` 盯 `src` 会报 TS2591（批 AH′ 的 `server-events.gen.ts` 踩过同一个坑）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEMAND_DAY,
  DEMAND_DETAIL,
  DEMAND_HEAD,
  DEMAND_PANEL,
  DEMAND_SHORT,
  DEMAND_TAG,
  DEMAND_WHERE,
} from "../src/data/demand";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "src");
const SELF = resolve(SRC, "data", "demand.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".css")) out.push(p);
  }
  return out;
}

/**
 * 去掉注释、只留可能被玩家看见的代码。
 * 注释里写「这一句和店铺页那句说的是同一件事」是给人看的说明，不算抄写；
 * 测试文件里为了断言而出现的字面量也不算（它们断言的正是 `DEMAND_*` 常量）。
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

const FILES = walk(SRC).filter((p) => p !== SELF && !p.endsWith(".test.ts"));

describe("来客封顶那句话只有一个出处（P451）", () => {
  it("三条要指路的句子都带那四条路", () => {
    for (const [name, text] of Object.entries({ DEMAND_PANEL, DEMAND_DAY, DEMAND_DETAIL })) {
      expect(text, `${name} 少了那四条路`).toContain(DEMAND_WHERE);
    }
  });

  it("那四条路只在 data/demand.ts 里列一次", () => {
    const copiers = FILES.filter((p) => codeOnly(readFileSync(p, "utf8")).includes(DEMAND_WHERE));
    expect(
      copiers.map((p) => relative(SRC, p)),
      "这几处又抄了一遍「修街面、比赛赢过同行…」—— 改成从 `data/demand.ts` 拼",
    ).toEqual([]);
  });

  it("别处不许再硬编码「再添也卖不动」", () => {
    const copiers = FILES.filter((p) => codeOnly(readFileSync(p, "utf8")).includes("再添也卖不动"));
    expect(copiers.map((p) => relative(SRC, p)), "这几处硬编码了那一句，改成 DEMAND_* 常量").toEqual([]);
  });

  it("主句不点名任何一件东西、不带价钱", () => {
    expect(DEMAND_HEAD).not.toMatch(/凳|灶|锅|案台|备料|¥|\d/);
    expect(DEMAND_HEAD).toContain("卖不动");
  });

  it("打烊单前缀与 hud.css 的 ::before 同源", () => {
    const css = readFileSync(resolve(SRC, "ui", "hud.css"), "utf8");
    expect(css, "hud.css 里 [data-demand-line] 的前缀与 DEMAND_TAG 不一致").toContain(
      `[data-demand-line]::before{content:"${DEMAND_TAG} · "}`,
    );
  });

  it("五句都不带阿拉伯数字（服务端会丢带数量词的整句）", () => {
    const all = { DEMAND_HEAD, DEMAND_PANEL, DEMAND_DAY, DEMAND_DETAIL, DEMAND_SHORT };
    for (const [name, text] of Object.entries(all)) {
      expect(text, `${name} 里出现了数字`).not.toMatch(/[0-9]/);
    }
  });
});
