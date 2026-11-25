/**
 * 灶位那几句话只许有一个出处（批 AT′ 解 P462；批 AU′ 解 P465 / P467）。
 *
 * 批 AR′ 给店面页写了一句、批 AS′ 给打烊单又写了一短句 —— 两处字不同、意思相同，
 * 明天改一处忘一处就是 P451 复发。这一组测试扫源码，盯着六件事：
 *
 * ① 「口起没人看」只许在 `src/data/crew.ts` 出现（模板给了参数，别处只能调）；
 * ② 「每一口灶都烧得上」同理；
 * ③ **头也同源**（P465）：「个人掌勺」只在 `data/crew.ts` 出现一次，
 *    长短两种语体共用 `headWords`，不是两段手写的数字拼接；
 * ④ 打烊单短句与面板长句共用同一个核心（去掉尾巴就相等）；
 * ⑤ **副句与价钱句同样收进来**（P467）：`今天卡的不是灶` / `今天有人来问工` /
 *    `人手槽还差` / `今天没有煮粉的来问工` 四句只许在 `data/crew.ts`；
 * ⑥ 这些句子都不带「买 / 推荐 / 划算」这类劝购词，价钱只在 `cost` 里
 *    （数字只来自确定性模拟，文案不产数字）。
 *
 * 放在 `tools/` 而不是 `src/`：要读盘就得用 `node:fs`，本仓没装 `@types/node`，
 * `tsc` 盯 `src` 会报 TS2591（`demand-literal.test.ts` 踩过同一个坑）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  crewCostWords,
  crewFitWords,
  crewGapWords,
  crewGateWords,
  crewNoneWords,
  crewWhyWords,
} from "../src/data/crew";

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

/** 哪几个文件里出现了这句话（空数组 = 只有一处出处） */
function copiedElsewhere(sentence: string): string[] {
  return FILES.filter((p) => codeOnly(readFileSync(p, "utf8")).includes(sentence)).map((p) =>
    relative(SRC, p),
  );
}

describe("灶位那句话只有一个出处（P462 / P465 / P467）", () => {
  it("缺口句与富余句各只有一份模板", () => {
    expect(copiedElsewhere("口起没人看"), "这几处又抄了一遍「第 N 口起没人看」").toEqual([]);
    expect(copiedElsewhere("每一口灶都烧得上"), "这几处又抄了一遍「每一口灶都烧得上」").toEqual(
      [],
    );
  });

  it("头也同源：数字只在 data/crew.ts 里拼一次（P465）", () => {
    // 「个人掌勺」是头的后半截；两段手写时它会出现两次（面板一处、打烊单一处）
    expect(copiedElsewhere("个人掌勺"), "这几处又自己拼了一遍「几个人掌勺」").toEqual([]);
    // 长短两句的数字必须一致 —— 同源才可能一致
    const long = crewGapWords(5, 2);
    const short = crewGapWords(5, 2, true);
    expect(long).toContain("5 口");
    expect(short).toContain("5 口");
    expect(long).toContain("2 个人掌勺");
    expect(short).toContain("2 个人掌勺");
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

  it("副句与价钱句也只有一处出处（P467）", () => {
    expect(copiedElsewhere("今天卡的不是灶"), "这几处又抄了一遍「卡的不是灶」").toEqual([]);
    expect(copiedElsewhere("今天有人来问工"), "这几处又抄了一遍「今天有人来问工」").toEqual([]);
    expect(copiedElsewhere("人手槽还差"), "这几处又抄了一遍「人手槽还差」").toEqual([]);
    expect(copiedElsewhere("今天没有煮粉的来问工"), "这几处又抄了一遍「没人来问工」").toEqual(
      [],
    );
    // 模板本身还得真的能出这四句
    expect(crewWhyWords(false)).toContain("今天卡的不是灶");
    expect(crewGateWords({ need: 800, short: 500 })).toContain("人手槽还差 500 位累计接待");
    expect(crewNoneWords()).toBe("今天没有煮粉的来问工");
  });

  it("厨房不是最紧那道时，价钱后面带前提（P466）", () => {
    const hire = { name: "阿强", skill: 3, wage: 150, fee: 300, monthly: 3262 };
    const binds = crewCostWords(hire, true);
    const loose = crewCostWords(hire, false);
    expect(binds).toContain("日薪 ¥150");
    expect(binds).toContain("介绍费 ¥300（一次）");
    expect(binds).not.toContain("厨房不是最紧");
    expect(loose.startsWith(binds)).toBe(true);
    expect(loose).toContain("厨房不是最紧那道");
  });

  it("数字由调用方给：换一组数字句子跟着变", () => {
    expect(crewGapWords(4, 2, true)).toBe("灶 4 口，只有 2 个人掌勺 —— 第 3 口起没人看");
    expect(crewFitWords(2, 2)).toBe("灶位 2 口，能开火 2 口 —— 人手够，每一口灶都烧得上");
  });

  it("不劝购：主句与副句都不带钱和推荐词", () => {
    for (const text of [crewGapWords(3, 1), crewGapWords(3, 1, true), crewFitWords(3, 3)]) {
      expect(text).not.toMatch(/¥|元|买|推荐|建议|划算/);
    }
    for (const text of [crewWhyWords(true), crewWhyWords(false), crewNoneWords()]) {
      expect(text).not.toMatch(/¥|元|买|推荐|建议|划算/);
    }
  });

  it("打烊单前缀与 hud.css 对得上（那一行确实存在）", () => {
    const css = readFileSync(resolve(SRC, "ui", "hud.css"), "utf8");
    expect(css).toContain('[data-crew-line]::before{content:"灶位 · "}');
  });
});
