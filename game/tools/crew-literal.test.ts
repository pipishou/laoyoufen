/**
 * 批 AT′（解 P462）：灶位那几句话只许有一个出处。
 *
 * 批 AR′ 给店面页写了一句、批 AS′ 给打烊单又写了一短句 —— 两处字不同、意思相同，
 * 明天改一处忘一处就是 P451 复发。这一组测试扫源码，盯着四件事：
 *
 * ① 「口起没人看」只许在 `src/data/crew.ts` 出现（模板给了参数，别处只能调）；
 * ② 「每一口灶都烧得上」同理；
 * ③ 打烊单短句与面板长句**共用同一个模板**（把 `short=true` 的那句去掉尾巴就相等，
 *    不是两段各自写死的字符串）；
 * ④ 这三句都不带阿拉伯数字以外的价钱（数字只来自确定性模拟，文案不产数字）。
 *
 * 放在 `tools/` 而不是 `src/`：要读盘就得用 `node:fs`，本仓没装 `@types/node`，
 * `tsc` 盯 `src` 会报 TS2591（`demand-literal.test.ts` 踩过同一个坑）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { crewFitWords, crewGapWords } from "../src/data/crew";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "src");
const SELF = resolve(SRC, "data", "crew.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".css")) out.push(p);
  }
  return out;
}

/** 去掉注释（注释里写「这一句和打烊单那句说的是同一件事」是给人看的，不算抄写） */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

const FILES = walk(SRC).filter((p) => p !== SELF && !p.endsWith(".test.ts"));

describe("灶位那句话只有一个出处（P462）", () => {
  it("缺口句与富余句各只有一份模板", () => {
    const gap = FILES.filter((p) => codeOnly(readFileSync(p, "utf8")).includes("口起没人看"));
    const fit = FILES.filter((p) => codeOnly(readFileSync(p, "utf8")).includes("每一口灶都烧得上"));
    expect(gap.map((p) => relative(SRC, p)), "这几处又抄了一遍「第 N 口起没人看」").toEqual([]);
    expect(fit.map((p) => relative(SRC, p)), "这几处又抄了一遍「每一口灶都烧得上」").toEqual([]);
  });

  it("打烊单短句与面板长句共用同一个核心，只是头尾不同", () => {
    const long = crewGapWords(3, 1);
    const short = crewGapWords(3, 1, true);
    expect(short).not.toBe(long);
    // 两句都带同一截核心（第 N 口起没人看）—— 这一截只写了一次
    const core = "—— 第 2 口起没人看";
    expect(long).toContain(core);
    expect(short).toContain(core);
    // 只有面板那句带尾巴；打烊单那一行放不下
    expect(long.endsWith("，火开不起来")).toBe(true);
    expect(short.includes("火开不起来")).toBe(false);
  });

  it("数字由调用方给：换一组数字句子跟着变", () => {
    expect(crewGapWords(4, 2, true)).toBe("灶 4 口，只有 2 个人掌勺 —— 第 3 口起没人看");
    expect(crewFitWords(2, 2)).toBe("灶位 2 口，能开火 2 口 —— 人手够，每一口灶都烧得上");
  });

  it("这几句都不带价钱（价钱只在 crewFacts 的 cost 里）", () => {
    for (const text of [crewGapWords(3, 1), crewGapWords(3, 1, true), crewFitWords(3, 3)]) {
      expect(text).not.toMatch(/¥|元|买|推荐|建议|划算/);
    }
  });

  it("打烊单前缀与 hud.css 对得上（那一行确实存在）", () => {
    const css = readFileSync(resolve(SRC, "ui", "hud.css"), "utf8");
    expect(css).toContain('[data-crew-line]::before{content:"灶位 · "}');
  });
});
