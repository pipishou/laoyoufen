/**
 * 批 AQ′（解 P451）：来客封顶那句话，只有一个出处。
 *
 * 批 AP′ 把「抬了也卖不动」铺到了四处，但每处各写一段差不多的字符串 ——
 * 打烊单一句、店铺页设备段一句、`todayLine` 副句一句。改一处忘一处，
 * 就会退回 P448 的病根（同一天两处说反话）。这一份是唯一出处：
 *
 * - `DEMAND_WHERE`：真正能让街上更热闹的四条路（**只在这里列一次**）；
 * - `DEMAND_HEAD`   ：打烊单主句 / 钩子的 `text`；
 * - `DEMAND_PANEL`  ：店铺页设备段那一句（`[data-demand-blocked]`）；
 * - `DEMAND_DAY`    ：打烊单「为什么」区那一行（`[data-demand-line]`）;
 * - `DEMAND_TAG`    ：打烊单那一行的前缀（`hud.css` 里的 `::before` 也是这三个字，
 *   由 `tools/gate/demand_probe.py` 盯着两边一致）。
 *
 * 纪律：谁要再写一句「卖不动」，从这里拼，不许自己抄一遍
 * （`game/tools/demand-literal.test.ts` 会扫源码，抓到抄写就把测试弄红）。
 */

/** 能让街上更热闹的四条路 —— 全项目只在这里列一次 */
export const DEMAND_WHERE = "修街面、比赛赢过同行、把口碑养起来、换个人多的区";

/** 打烊单主句（钩子的 `text` 也用它）：不点名任何一件东西、不带价钱 */
export const DEMAND_HEAD = "街上就这么多人 —— 店里再添什么也卖不动";

/** 店铺页设备段：说清卡在哪，并把人往街上指 */
export const DEMAND_PANEL = `今天这三段再添也卖不动 —— 灶、座位、备料都还有富余，卡在街上进来的人就这么多。想多卖，得让街上更热闹：${DEMAND_WHERE}。`;

/** `todayLine` 的副句：同样的四件事，口气短一些（店铺页「今天这一句」下面） */
export const DEMAND_DETAIL = `店里再抬也卖不出去 · 想多卖，得让街上更热闹：${DEMAND_WHERE}`;

/** 打烊单「为什么」区那一行 */
export const DEMAND_DAY = `店里这三段再添也卖不动 —— 卡在街上进来的人，想让街上更热闹：${DEMAND_WHERE}`;

/** 打烊单那一行的前缀（与 `hud.css` 的 `::before` 同源） */
export const DEMAND_TAG = "卖不动";

/** 「今天先不动」里那一句的短版（句子后面还要接「（街上就这么多人），今天先不添」） */
export const DEMAND_SHORT = "店里再添也卖不动";
