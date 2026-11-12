/**
 * 段位评定（K1 目标换骨的第二根轴）。
 *
 * 开罗原文 `grade_review.txt` 11 级：判定费 5,000 → 2,000,000 KCU，
 * 条件列 4/7/10/15/20/24/30/34/40/50，奖励 100 → 6,000。
 * 按 1 KCU = 0.01 元换算后，费是 ¥50 → ¥20,000 —— 但 2,000,000 KCU 那档
 * 换算成 ¥20,000 仍嫌太大（我们 36 月末现金约 22 万），故按卡里的口径保留
 * 原序列形状、把最后一档按比例收到 ¥20,000（已在账本行 18 备注待实跑校准）。
 *
 * 条件列在开罗里是「累计顾客」之类的门槛，我们统一用累计接待人次（千人）。
 * 判定费进 sink（现金出口），奖励进 cash —— 这样段位同时是目标与钱去处。
 */

import type { GameState } from "./state";

export interface GradeDef {
  /** 1-11 */
  level: number;
  title: string;
  /** 判定费（元），从现金扣 */
  feeYuan: number;
  /** 门槛：累计接待人次（人） */
  minCustomers: number;
  /** 通过奖励（元） */
  rewardYuan: number;
  /** 一句话要求，给 UI 显示 */
  note: string;
}

export const GRADES: readonly GradeDef[] = [
  { level: 1, title: "摆摊仔", feeYuan: 50, minCustomers: 400, rewardYuan: 1, note: "街边支一口锅，先让人知道有你这家" },
  { level: 2, title: "街边小店", feeYuan: 150, minCustomers: 700, rewardYuan: 1, note: "有两张桌子，坐得下四个人" },
  { level: 3, title: "巷口老铺", feeYuan: 300, minCustomers: 1_000, rewardYuan: 1, note: "街坊开始记得你的招牌" },
  { level: 4, title: "街知巷闻", feeYuan: 500, minCustomers: 1_500, rewardYuan: 2, note: "隔壁街的人也过来吃" },
  { level: 5, title: "区级名店", feeYuan: 800, minCustomers: 2_000, rewardYuan: 2, note: "本区的老友粉，数得上你一家" },
  { level: 6, title: "市级名店", feeYuan: 1_500, minCustomers: 2_400, rewardYuan: 3, note: "市里的美食号开始写你" },
  { level: 7, title: "老友粉传人", feeYuan: 2_000, minCustomers: 3_000, rewardYuan: 4, note: "有人专程来问你的酸笋怎么发" },
  { level: 8, title: "八桂名厨", feeYuan: 3_000, minCustomers: 3_400, rewardYuan: 5, note: "广西台来拍过一次" },
  { level: 9, title: "桂系食神", feeYuan: 5_000, minCustomers: 4_000, rewardYuan: 6, note: "同行拿你的汤底当参照" },
  { level: 10, title: "老友粉大王", feeYuan: 20_000, minCustomers: 5_000, rewardYuan: 8, note: "全区开分店，名字就是招牌" },
  { level: 11, title: "广西老友粉非遗传承人", feeYuan: 0, minCustomers: 6_000, rewardYuan: 0, note: "37 个月跑完，账本翻到最后一页" },
];

export const MAX_GRADE = GRADES.length;

export function gradeOf(level: number): GradeDef | null {
  return GRADES.find((g) => g.level === level) ?? null;
}

export interface GradeCheck {
  /** 下一个可评的等级 */
  next: GradeDef | null;
  /** 当前已得段位 */
  current: number;
  /** 能否现在评（钱够 + 人次够） */
  ready: boolean;
  /** 差多少人 */
  shortCustomers: number;
  /** 差多少钱 */
  shortCash: number;
}

export function checkGrade(s: GameState): GradeCheck {
  const current = s.gradeLevel;
  const next = gradeOf(current + 1);
  if (!next) {
    return { next: null, current, ready: false, shortCustomers: 0, shortCash: 0 };
  }
  const shortCustomers = Math.max(0, next.minCustomers - s.totalCustomers);
  const shortCash = Math.max(0, next.feeYuan - s.cash);
  return { next, current, ready: shortCustomers === 0 && shortCash === 0, shortCustomers, shortCash };
}

export interface GradeResult {
  ok: boolean;
  /** 通过后的等级；不通过时等于原等级 */
  level: number;
  spentYuan: number;
  rewardYuan: number;
  /** 失败原因，给 HUD/日志用 */
  reason: string;
}

/**
 * 交费评级。失败不扣钱（开罗原版是「不达标不能申请」，不是「申请了扣钱没通过」）。
 */
export function applyGrade(s: GameState): GradeResult {
  const check = checkGrade(s);
  if (!check.next) {
    return { ok: false, level: s.gradeLevel, spentYuan: 0, rewardYuan: 0, reason: "已经是最高段位" };
  }
  if (!check.ready) {
    const parts: string[] = [];
    if (check.shortCustomers > 0) parts.push(`还差 ${check.shortCustomers} 位客人`);
    if (check.shortCash > 0) parts.push(`还差 ¥${check.shortCash}`);
    return {
      ok: false,
      level: s.gradeLevel,
      spentYuan: 0,
      rewardYuan: 0,
      reason: `不够格评定「${check.next.title}」：${parts.join("，")}`,
    };
  }
  const g = check.next;
  s.cash -= g.feeYuan;
  s.gradeLevel = g.level;
  // 段位越高，名声涨得越快（开罗原版是奖励道具，我们换成口碑 + 现金）
  s.reputation = Math.min(5, s.reputation + 0.15 + g.level * 0.02);
  s.cash += g.rewardYuan;
  return { ok: true, level: g.level, spentYuan: g.feeYuan, rewardYuan: g.rewardYuan, reason: `评定通过：${g.title}` };
}
