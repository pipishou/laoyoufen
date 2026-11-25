/**
 * 灶位与掌勺的人 —— **这几句话只有这一处出处**（批 AT′ 解 P462；批 AU′ 解 P465 / P467）。
 *
 * 批 AR′ 只给店面页写了一句，批 AS′ 又给打烊单写了一句：同一个事实、两套字
 * （长句给面板、短句给打烊单），谁也保证不了明天改一处忘一处 —— 与 P451
 * 「卖不动」四处硬编码一模一样。这里收成一份：
 *
 *   ① 头（`headWords`）—— 数字只在这里拼一次，长短两种语体共用（P465）
 *   ② 核（`gapCore`）—— `第 N 口起没人看`，两种长度都带
 *   ③ 尾（`，火开不起来`）—— 只有面板那句要（打烊单只占一行，放不下）
 *   ④ 副句与价钱句（`crewWhyWords` / `crewCostWords` / `crewGateWords` / `crewNoneWords`）
 *      —— 批 AU′ 从 `sim/crew.ts` 搬进来，原先只有主句同源、这两句还在手写（P467）
 *
 * 数字（几口灶、几个人、多少钱）由调用方给，模板只管语法 —— 数字永远来自确定性模拟，
 * 文案不产数字（AGENTS.md 三、数值纪律）。
 *
 * 配 `game/tools/crew-literal.test.ts` 扫源码：除了本文件，别处不许再写
 * 「口起没人看」「每一口灶都烧得上」「今天卡的不是灶」「今天有人来问工」。
 */

/** 核心那一截：第 N 口起没人看（长句短句共用） */
function gapCore(slots: number): string {
  return `第 ${slots + 1} 口起没人看`;
}

/**
 * 头：几口灶、几个人掌勺。
 *
 * 两种语体（面板是句子、打烊单是电报），但**数字只在这里拼一次**：
 * 面板 `灶位 3 口，眼下只有 1 个人掌勺`，打烊单 `灶 3 口，只有 1 个人掌勺`。
 */
function headWords(stoves: number, slots: number, short: boolean): string {
  const noun = short ? "灶" : "灶位";
  const lead = short ? `只有 ${slots} 个人掌勺` : `眼下只有 ${slots} 个人掌勺`;
  return `${noun} ${stoves} 口，${lead}`;
}

/** 有人手缺口：第 N 口起没人看。`short` 给打烊单用（那一行只能占一行） */
export function crewGapWords(stoves: number, slots: number, short = false): string {
  const head = headWords(stoves, slots, short);
  return short ? `${head} —— ${gapCore(slots)}` : `${head} —— ${gapCore(slots)}，火开不起来`;
}

/** 人手够：每一口灶都烧得上 */
export function crewFitWords(stoves: number, slots: number): string {
  return `灶位 ${stoves} 口，能开火 ${slots} 口 —— 人手够，每一口灶都烧得上`;
}

/** 副句：多开一口火到底有没有用 —— 只看厨房今天是不是四道闸里最紧的那道 */
export function crewWhyWords(kitchenBinds: boolean): string {
  return kitchenBinds
    ? "今天卡的就是灶 —— 补齐人手这口灶才烧得上。"
    : "不过今天卡的不是灶：座位和街上的人先顶着天花板，多开一口火也不会多卖。";
}

/** 价钱句的尾巴：厨房不是最紧那道时，把「雇了也不涨碗」这个前提说出来（批 AU′ 解 P466） */
export function crewCostPremiseWords(): string {
  return "（不过今天厨房不是最紧那道，换个人也换不来更多的碗）";
}

/** 价钱句：一个人日薪多少、介绍费多少（**一次性**）、一个月约多少 */
export function crewCostWords(
  hire: {
    name: string;
    skill: number;
    wage: number;
    fee: number;
    monthly: number;
  },
  kitchenBinds = true,
): string {
  const line =
    `今天有人来问工：${hire.name}（技能 ${hire.skill}）日薪 ¥${hire.wage}` +
    ` · 介绍费 ¥${hire.fee}（一次）· 月薪约 ¥${hire.monthly}`;
  return kitchenBinds ? line : `${line}${crewCostPremiseWords()}`;
}

/** 招不进来时说的话：还得忙到多少位累计接待才有人来问 */
export function crewGateWords(gate: { need: number; short: number }): string {
  return `人手槽还差 ${gate.short} 位累计接待（到 ${gate.need} 位才有人肯来）`;
}

/** 今天没人来问工 */
export function crewNoneWords(): string {
  return "今天没有煮粉的来问工";
}
