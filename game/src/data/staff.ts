/**
 * 员工表。
 *
 * 结构溯源：REA 没有独立的「员工」表可直接对应（取证报告里 `staff` 相关字段散在
 * defParam 里，未见完整表），所以这里不声称任何原作结构，只按本项目需要立三列：
 * 角色 / 技能 1-5 / 日薪。三种角色各自影响一个**可感知**的数值，不做纯数值皮肤：
 * - cook（煮粉）   → 出碗速度
 * - prep（备料）   → 食材成本
 * - server（跑堂） → 顾客耐心
 *
 * 数值口径：**玩具尺度**，不是南宁 2026 年真实日薪。真实帮工日薪 150-200 元
 * [GUESS, LOW]，但本作一碗粉卖 12 元、单碗毛利约 5.6 元、无干预日营收 200-300 元，
 * 真实工资会直接吃掉全部利润，雇人永远负收益（120 天实测：雇厨师现金低于不雇）。
 * 因此日薪按约 1/10 压低到 6-18，保留技能排序，使「雇人换产能」在玩具经济里成立。
 */

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

export const STAFF_POOL: readonly StaffTemplate[] = [
  { id: "st.aqiang", name: "阿强", role: "cook", skill: 3, wage: 12, note: "炒锅十年，粉不糊" },
  { id: "st.azhen", name: "阿珍", role: "prep", skill: 2, wage: 8, note: "刀工慢，但仔细" },
  { id: "st.xiaolu", name: "小陆", role: "server", skill: 2, wage: 7, note: "记性好，不用写单" },
  { id: "st.huang", name: "黄师傅", role: "cook", skill: 5, wage: 18, note: "老友粉比赛拿过名次" },
  { id: "st.alan", name: "阿兰", role: "prep", skill: 4, wage: 11, note: "一个人备完整个午市" },
  { id: "st.ajie", name: "阿杰", role: "server", skill: 3, wage: 9, note: "嗓门大，插队的人怕他" },
  { id: "st.huangmao", name: "黄毛", role: "cook", skill: 1, wage: 6, note: "刚出师，火候还飘" },
  { id: "st.sanjie", name: "三姐", role: "prep", skill: 5, wage: 13, note: "菜市场熟客，拿货便宜" },
  { id: "st.afen", name: "阿芬", role: "server", skill: 5, wage: 12, note: "阿姨们的定心丸" },
  { id: "st.laoli", name: "老李", role: "cook", skill: 4, wage: 15, note: "手快，话少" },
  { id: "st.aming", name: "阿明", role: "prep", skill: 3, wage: 10, note: "粉肠洗得干净" },
  { id: "st.xiaowei", name: "小韦", role: "server", skill: 1, wage: 6, note: "暑假工，还在学" },
];

/** 最多同时雇几个 */
export const MAX_STAFF = 4;
/** 介绍费 = 日薪 × 2 */
export const HIRE_FEE_RATE = 2;
/** 每天候选池大小 */
export const CANDIDATE_COUNT = 3;

export const STAFF_BY_ID: ReadonlyMap<string, StaffTemplate> = new Map(STAFF_POOL.map((s) => [s.id, s]));
