/**
 * 员工表（六阶 S2 招人）。
 *
 * 结构溯源：REA 没有独立的「员工」表可直接对应（取证报告里 `staff` 相关字段散在
 * defParam 里，未见完整表），所以不声称任何原作结构，只按本项目需要立三列：
 * 角色 / 技能 1-5 / 日薪。三种角色各自影响一个**可感知**的数值：
 * - cook（煮粉）   → 出碗速度 + 每口锅能下几份
 * - prep（备料衣） → 食材成本
 * - server（跑堂） → 顾客耐心 + 问口味速度 + 上菜段
 *
 * **数值口径（2026-11 起改为现实尺度）**：原来日薪是玩具值 6–18 元（文件头自认
 * 「按约 1/10 压低」），与 `anchors.ts` 的南宁最低工资 2200 元/月、22.4 元/小时
 * 完全脱节，玩家看到「阿强日薪 12 元」会立刻出戏。
 * 现在按 `LABOR` 标定：
 *   - 最低工资折日薪 = 2200 / 21.75 ≈ 101 元/日（技能 1 的暑假工贴着这条线）
 *   - 熟手帮工 130–180 元/日（技能 2–4）
 *   - 老师傅 220 元/日（技能 5，等于月薪 ¥4,785，南宁老友粉师傅的中上水平）
 * 换算规则写死在 `WAGE_BY_SKILL`，池子里的 `wage` 必须与它一致（有测试兜底）。
 *
 * 为什么敢把工资抬到现实值：一碗粉毛利 ¥5.2（`BOWL.marginYuan`），
 * 雇一个熟手 ¥150/日 ≈ 29 碗/日的盈亏平衡线。4 座小店日销 71 碗撑得起 1 个人，
 * 想雇第二个必须先扩建（座位与灶位），这就把「招人」和「扩建」串成了同一条节奏，
 * 而不是「有钱就全雇」。
 */

import { LABOR } from "./anchors";

export type StaffRole = "cook" | "prep" | "server";

export const ROLE_LABEL: Record<StaffRole, string> = {
  cook: "煮粉",
  prep: "备料",
  server: "跑堂",
};

export interface StaffTemplate {
  id: string;
  name: string;
  role: StaffRole;
  /** 1-5 */
  skill: number;
  /** 日薪（元） */
  wage: number;
  note: string;
}

/** 技能 → 日薪（元）。技能 1 贴最低工资折算线，技能 5 是老师傅价 */
export const WAGE_BY_SKILL: readonly number[] = [110, 130, 150, 180, 220];

export function wageOf(skill: number): number {
  const i = Math.max(1, Math.min(5, Math.round(skill))) - 1;
  return WAGE_BY_SKILL[i]!;
}

export const STAFF_POOL: readonly StaffTemplate[] = [
  { id: "st.aqiang", name: "阿强", role: "cook", skill: 3, wage: wageOf(3), note: "炒锅十年，粉不糊" },
  { id: "st.azhen", name: "阿珍", role: "prep", skill: 2, wage: wageOf(2), note: "刀工慢，但仔细" },
  { id: "st.xiaolu", name: "小陆", role: "server", skill: 2, wage: wageOf(2), note: "记性好，不用写单" },
  { id: "st.huang", name: "黄师傅", role: "cook", skill: 5, wage: wageOf(5), note: "老友粉比赛拿过名次" },
  { id: "st.alan", name: "阿兰", role: "prep", skill: 4, wage: wageOf(4), note: "一个人备完整个午市" },
  { id: "st.ajie", name: "阿杰", role: "server", skill: 3, wage: wageOf(3), note: "嗓门大，插队的人怕他" },
  { id: "st.huangmao", name: "黄毛", role: "cook", skill: 1, wage: wageOf(1), note: "刚出师，火候还飘" },
  { id: "st.sanjie", name: "三姐", role: "prep", skill: 5, wage: wageOf(5), note: "菜市场熟客，拿货便宜" },
  { id: "st.afen", name: "阿芬", role: "server", skill: 5, wage: wageOf(5), note: "阿姨们的定心丸" },
  { id: "st.laoli", name: "老李", role: "cook", skill: 4, wage: wageOf(4), note: "手快，话少" },
  { id: "st.aming", name: "阿明", role: "prep", skill: 3, wage: wageOf(3), note: "粉肠洗得干净" },
  { id: "st.xiaowei", name: "小韦", role: "server", skill: 1, wage: wageOf(1), note: "暑假工，还在学" },
];

/** 最多同时雇几个（S2 的上限，实际能雇几个还要看下面的解锁门槛） */
export const MAX_STAFF = 4;

/**
 * 第 N 个人要多少累计接待量才肯来（对应开罗 rank 里把「加人手」当奖励发放：
 * 你先把店做起来，才有人愿意来打工）。位置 i 对应第 i+1 个人。
 */
export const STAFF_UNLOCK: readonly number[] = [300, 800, 1600, 2600];

/** 当前累计接待量下能雇几个人（0–4） */
export function staffSlots(totalCustomers: number): number {
  let n = 0;
  for (const need of STAFF_UNLOCK) {
    if (totalCustomers >= need) n += 1;
  }
  return Math.min(MAX_STAFF, n);
}

/** 下一个人还差多少累计接待量；已全开返回 null */
export function nextStaffNeed(totalCustomers: number): { slot: number; need: number; short: number } | null {
  const slots = staffSlots(totalCustomers);
  if (slots >= MAX_STAFF) return null;
  const need = STAFF_UNLOCK[slots] ?? 0;
  return { slot: slots + 1, need, short: Math.max(0, need - totalCustomers) };
}

/** 介绍费 = 日薪 × 2（现实里请人吃饭递烟的那点人情） */
export const HIRE_FEE_RATE = 2;
/** 每天候选池大小 */
export const CANDIDATE_COUNT = 3;

export const STAFF_BY_ID: ReadonlyMap<string, StaffTemplate> = new Map(STAFF_POOL.map((s) => [s.id, s]));

/** 一个月按 21.75 个工作日折算的工资总额（给玩家看「雇这个人一个月要多少」） */
export function monthlyWageOf(wage: number): number {
  return Math.round(wage * LABOR.workDaysPerMonth);
}
