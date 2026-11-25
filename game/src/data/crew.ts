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

/**
 * 多卖几碗的那句话 —— **全项目只有这一处**（批 AW′ 解 P473）。
 *
 * 原来直接 `Math.round(cookGain)`，于是 5.4 与 5.45 都写「5 碗」：技能高一级带来的那点差别
 * 在文案上凭空消失，玩家看不出「为什么这个人更贵」。
 *
 * 规则（只有一条，也只在这里）：
 *   ① 不到一碗 → 「不到 1 碗」（0.6 碗写成「1 碗」是假话，写成「0.6 碗」又太啰嗦）；
 *   ② 十碗以内 → 保留一位小数（5.4 →「5.4 碗」，5.45 →「5.5 碗」，差别看得见）；
 *   ③ 十碗以上 → 取整（30.2 →「30 碗」；这个量级差半碗没人计较）。
 *
 * 数字仍由调用方从确定性模拟算好传进来，这里只管语法与取整（AGENTS.md 三、数值纪律）。
 */
export function bowlGainWords(gain: number): string {
  const n = Math.max(0, gain);
  if (n < 1) return "不到 1 碗";
  if (n >= 9.95) return `${Math.round(n)} 碗`;
  const tenth = Math.round(n * 10) / 10;
  return Number.isInteger(tenth) ? `${tenth} 碗` : `${tenth.toFixed(1)} 碗`;
}

/**
 * 副句：多开一口火到底有没有用（批 AV′ 解 P470；批 AW′ 解 P472 / P473）。
 *
 * 两档，判据是**模型算出来的 `cookGain`**（多一个人掌勺当天上限能抬几碗），不是 `tight` 反推：
 *   ① 灶真是紧的那道 —— 直说「补齐人手这口灶才烧得上」，并把这口火**值几碗**说出来；
 *      差一点（多卖 5 碗）与差很远（多卖 30 碗）从此不是同一句话。
 *   ② 灶根本不是紧的那道 —— 说清「多开一口火也不会多卖」。
 *
 * `cookSkill` 是「补进来的这个人」的技能（批 AW′ 解 P472）：`cookGain` 本来就是按某个具体的人
 * 算出来的（技能越高，同一口灶出得越快）；这里不带技能，玩家会以为「换谁都一样」，而实际
 * 差一个等级就是一千多块的工钱差。今天没人在问工时传 `null`，落回「多一个人」的说法。
 */
export function crewWhyWords(
  kitchenBinds: boolean,
  cookGain: number,
  cookSkill: number | null = null,
): string {
  if (!kitchenBinds) {
    return "不过今天卡的不是灶：座位和街上的人先顶着天花板，多开一口火也不会多卖。";
  }
  const bowls = bowlGainWords(cookGain);
  if (cookSkill === null) {
    return `今天卡的就是灶 —— 补齐人手这口灶才烧得上（多一个人约多卖 ${bowls}）。`;
  }
  return `今天卡的就是灶 —— 补一个技能 ${cookSkill} 的师傅，这口灶就烧得上了（约多卖 ${bowls}）。`;
}


/** 价钱句的尾巴：补人换不来碗时，把这个前提说出来（批 AU′ 解 P466） */
export function crewCostPremiseWords(): string {
  return "（不过今天厨房不是最紧那道，换个人也换不来更多的碗）";
}

/**
 * 价钱句：一个人日薪多少、介绍费多少（**一次性**）、一个月约多少。
 *
 * 第二个参数**必须传**（批 AV′ 解 P471）：原来默认 `kitchenBinds = true`，
 * 调用方忘传就把「雇了也换不来碗」这句前提静默吞掉 —— 一句假话比一句废话伤人。
 * 现在由类型系统挡住：`cookAddsBowls` 是模型算出来的（`cookGain > COOK_GAIN_NOISE`），
 * 不是猜的。
 */
export function crewCostWords(
  hire: {
    name: string;
    skill: number;
    wage: number;
    fee: number;
    monthly: number;
  },
  cookAddsBowls: boolean,
): string {
  const line =
    `今天有人来问工：${hire.name}（技能 ${hire.skill}）日薪 ¥${hire.wage}` +
    ` · 介绍费 ¥${hire.fee}（一次）· 月薪约 ¥${hire.monthly}`;
  return cookAddsBowls ? line : `${line}${crewCostPremiseWords()}`;
}

/** 招不进来时说的话：还得忙到多少位累计接待才有人来问 */
export function crewGateWords(gate: { need: number; short: number }): string {
  return `人手槽还差 ${gate.short} 位累计接待（到 ${gate.need} 位才有人肯来）`;
}

/** 今天没人来问工 */
export function crewNoneWords(): string {
  return "今天没有煮粉的来问工";
}
