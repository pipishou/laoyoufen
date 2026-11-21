/**
 * 段位评定（K1 目标换骨的第二根轴，六阶里「钱有去处」的主 sink）。
 *
 * 开罗原文 `grade_review.txt` 11 级：判定费 5,000 → 2,000,000 KCU，
 * 条件列 4/7/10/15/20/24/30/34/40/50，奖励 100 → 6,000。
 *
 * **2026-11-14 改口径（账本行 27 / 决策卡「节奏对齐」P2）**：开罗的 KCU 不能按
 * `kcuToYuan` 直折进我们的账 —— 我们一碗 ¥10，开罗一碗约 1,000 KCU，直折会把
 * 门槛折成零头（旧表 ¥50–¥20,000，等于三个月就买通全部段位）。现在费一律走
 * `data/anchors.ts` 的 `CAPITAL.gradeFeeYuan`（¥500 → ¥120,000，合计 ¥33.3 万，
 * 约三年营收的 1/3），形状仍是开罗的递增曲线，量级是南宁现实。
 *
 * 条件列在开罗里是「累计顾客」之类的门槛，我们统一用累计接待人次（百人）。
 * 判定费进 sink（现金出口），奖励进 cash —— 这样段位同时是目标与钱去处。
 *
 * **2026-11-18 改前两级门槛（账本行 51 / P69）**：原来第一段要 400 位客人
 * （首日 68–73 碗 → 第 6 个游戏日），第二段 700（第 10 天）—— 前 30 分钟里
 * 玩家拿不到任何「段位级」奖励，而开罗 rank 前几级几分钟就一级。
 * 前两级改成 150 / 350，**第三级起一律不动**：中期节奏不受影响，
 * 变化只发生在「玩家第一次觉得自己升级了」的那十分钟。
 */

import { CAPITAL } from "../data/anchors";
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
  /** 评委在牌子上写的一句话（开罗 grade_review 的评语列） */
  remark: string;
  /** 一句话要求，给 UI 显示 */
  note: string;
}

export const GRADES: readonly GradeDef[] = [
  { level: 1, title: "摆摊仔", feeYuan: CAPITAL.gradeFeeYuan[0], minCustomers: 110, rewardYuan: 500, note: "街边支一口锅，先让人知道有你这家", remark: "锅气有点意思，就是还没个正经落脚的地方。" },
  { level: 2, title: "街边小店", feeYuan: CAPITAL.gradeFeeYuan[1], minCustomers: 350, rewardYuan: 800, note: "有两张桌子，坐得下四个人", remark: "桌子摆开了，看得出你打算做久。" },
  { level: 3, title: "巷口老铺", feeYuan: CAPITAL.gradeFeeYuan[2], minCustomers: 1_000, rewardYuan: 1_200, note: "街坊开始记得你的招牌", remark: "巷子里的人都认你的门牌，这比什么招牌都硬。" },
  { level: 4, title: "街知巷闻", feeYuan: CAPITAL.gradeFeeYuan[3], minCustomers: 1_500, rewardYuan: 2_000, note: "隔壁街的人也过来吃", remark: "隔壁街的人愿意走过来，味道已经替你走了半条街。" },
  { level: 5, title: "区级名店", feeYuan: CAPITAL.gradeFeeYuan[4], minCustomers: 2_000, rewardYuan: 3_000, note: "本区的老友粉，数得上你一家", remark: "本区提起老友粉，绕不过你这家。" },
  { level: 6, title: "市级名店", feeYuan: CAPITAL.gradeFeeYuan[5], minCustomers: 2_400, rewardYuan: 5_000, note: "市里的美食号开始写你", remark: "市里的美食号写你，笔头比我们评委管用。" },
  { level: 7, title: "老友粉传人", feeYuan: CAPITAL.gradeFeeYuan[6], minCustomers: 3_000, rewardYuan: 8_000, note: "有人专程来问你的酸笋怎么发", remark: "酸笋发得干净，汤底有底子，这手艺该往下传。" },
  { level: 8, title: "八桂名厨", feeYuan: CAPITAL.gradeFeeYuan[7], minCustomers: 3_400, rewardYuan: 12_000, note: "广西台来拍过一次", remark: "台里来拍过一次不算什么，你那口汤才是真东西。" },
  { level: 9, title: "桂系食神", feeYuan: CAPITAL.gradeFeeYuan[8], minCustomers: 4_000, rewardYuan: 18_000, note: "同行拿你的汤底当参照", remark: "同行拿你的汤底当参照，这就不是生意了，是手艺。" },
  { level: 10, title: "老友粉大王", feeYuan: CAPITAL.gradeFeeYuan[9], minCustomers: 5_000, rewardYuan: 30_000, note: "全区开分店，名字就是招牌", remark: "名字成了招牌，往后要守的是这个名字。" },
  { level: 11, title: "广西老友粉非遗传承人", feeYuan: CAPITAL.gradeFeeYuan[10], minCustomers: 6_000, rewardYuan: 0, note: "37 个月跑完，账本翻到最后一页", remark: "这一锅，从巷口煮到了纸上。" },
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
    if (check.shortCustomers > 0) {
      /**
       * 试玩二轮 F11：光说「还差 320 位客人」，玩家没法判断这是三天还是三周。
       * 用最近一天的出碗数折算成天数 —— 铺位不同（街边摊 35 碗/日 vs 临街 100 碗/日），
       * 同一个门槛对应的等待时间差三倍，这句话必须自己跟着铺位变。
       */
      const lastDay = s.days[s.days.length - 1];
      const perDay = lastDay && lastDay.served > 0 ? lastDay.served : 0;
      const etd = perDay > 0 ? Math.ceil(check.shortCustomers / perDay) : 0;
      parts.push(
        etd > 0
          ? `还差 ${check.shortCustomers} 位客人（按昨天卖了 ${perDay} 碗算，约 ${etd} 天）`
          : `还差 ${check.shortCustomers} 位客人`,
      );
    }
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
