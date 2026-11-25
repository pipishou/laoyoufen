/**
 * 灶位与掌勺的人 —— **这几句话只有这一处出处**（批 AT′，解 P462）。
 *
 * 批 AR′ 只给店面页写了一句，批 AS′ 又给打烊单写了一句：同一个事实、两套字
 * （长句给面板、短句给打烊单），谁也保证不了明天改一处忘一处 —— 与 P451
 * 「卖不动」四处硬编码一模一样。这里收成一份，而且**核心那一截只有一处**：
 *
 *   `第 N 口起没人看`          ← 两种长度都带，改口径只改这一处
 *   `，火开不起来`             ← 只有面板那句要（打烊单只占一行，放不下）
 *
 * 数字（几口灶、几个人）由调用方给，模板只管语法 —— 数字永远来自确定性模拟，
 * 文案不产数字（AGENTS.md 三、数值纪律）。
 *
 * 配 `game/tools/crew-literal.test.ts` 扫源码：除了本文件，别处不许再写
 * 「口起没人看」与「每一口灶都烧得上」。
 */

/** 核心那一截：第 N 口起没人看（长句短句共用） */
function gapCore(slots: number): string {
  return `第 ${slots + 1} 口起没人看`;
}

/** 有人手缺口：第 N 口起没人看。`short` 给打烊单用（那一行只能占一行） */
export function crewGapWords(stoves: number, slots: number, short = false): string {
  const head = short
    ? `灶 ${stoves} 口，只有 ${slots} 个人掌勺`
    : `灶位 ${stoves} 口，眼下只有 ${slots} 个人掌勺`;
  return short ? `${head} —— ${gapCore(slots)}` : `${head} —— ${gapCore(slots)}，火开不起来`;
}

/** 人手够：每一口灶都烧得上 */
export function crewFitWords(stoves: number, slots: number): string {
  return `灶位 ${stoves} 口，能开火 ${slots} 口 —— 人手够，每一口灶都烧得上`;
}
