/**
 * 「明天做点什么」—— 打烊单底部那一行（P69 / 账本行 50 的方案 A3）。
 *
 * 为什么需要这一行：试玩报告里两个真人都在第 2 天打烊后就没再开第三天。
 * 他们不是被难度劝退 —— 是**当天结算完，不知道该期待什么**。
 * 开罗不会让人空手打烊：rank 条永远差一点点、街区永远有个东西能修、
 * 明天永远有人要来。我们缺的不是内容，是「明天」这个念头。
 *
 * 规则三条：
 * 1. **只读本地模板，不接 AI**（守 AI 四铁律：语声层不碰机制，机制层不碰 AI）。
 * 2. **只挑一件**，按「离达成最近」排序 —— 一天给五个目标等于没有目标。
 * 3. 说不出话就返回空串（宁可不显示，也不许编一个玩家做不到的期待）。
 */

import type { GameState } from "./state";
import { checkGrade } from "./grade";
import { arenaViews } from "./arena";
import { gearViews } from "./gear";
import { streetViews } from "./streets";

/** 元 → 「¥4,000」（sim 层不 import UI 的格式化函数，避免依赖方向倒过来） */
const yuan = (n: number): string => `¥${n.toLocaleString("zh-CN")}`;

/**
 * 差多少客人以内才值得当「明天」的目标。
 * 80 接近一天的量：说「明天再来 300 位客人」不是钩子，是废话。
 */
const HOOK_CUSTOMER_GAP = 80;

/** 明天的期待，一句话；没有就给空串 */
export function nextHookOf(state: GameState): string {
  // ① 段位：最先给，因为它是唯一「一次性换阶段」的目标
  const g = checkGrade(state);
  if (g.next) {
    if (g.ready) return `明天去评「${g.next.title}」，交 ${yuan(g.next.feeYuan)}`;
    if (g.shortCustomers > 0 && g.shortCustomers <= HOOK_CUSTOMER_GAP) {
      return `明天再来 ${g.shortCustomers} 位客人，就能评「${g.next.title}」`;
    }
    if (g.shortCustomers === 0 && g.shortCash > 0) {
      return `明天把钱凑到 ${yuan(g.next.feeYuan)}，就能评「${g.next.title}」`;
    }
  }

  // ② 家当：便宜、当天见效，新手第一笔「花出去的钱」
  const gear = gearViews(state).find((v) => !v.owned && v.affordable);
  if (gear) return `明天添一件「${gear.def.name}」（${yuan(gear.def.costYuan)}）`;

  // ③ 街面：买不起也给一句，让人知道街上还有东西可修
  const street = streetViews(state).find((v) => !v.built && v.affordable);
  if (street) return `明天修「${street.def.name}」（${yuan(street.def.costYuan)}）`;

  // ④ 落场：一天一场，能打就提
  const arena = arenaViews(state).find((v) => v.open.ok);
  if (arena) return `明天再去落一场（${arena.def.name}）`;

  // ⑤ 什么都不缺：给一句「接着做」，不编目标
  return "";
}
