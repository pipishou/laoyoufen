/**
 * 店员专精（A9）：一位员工能多学一门手艺，学完永久生效。
 *
 * 开罗 `clerk_skill.txt` 21 行是「每个店员能练的技能」，练了涨数值。
 * 我们的店员只有三个岗位（煮粉 / 备料 / 跑堂），
 * 所以专精不做数值阶梯，改成**每个岗位一条看家本事** —— 学一次，钉死一个出口：
 *
 *   cook   锅气  → 出碗快 8%（同一口灶，手上有火气）
 *   prep   刀工  → 料钱省 6%（切得准，边角料少）
 *   server 记性  → 耐心 +8%、满意 +1（谁要少辣、谁加酸笋，不用问第二遍）
 *
 * 三条纪律：
 * 1. 一条只落**已有乘数**，不新开机制；
 * 2. 岗位必须对得上 —— 掌勺的去练刀工没有意义，表里直接不给；
 * 3. 学艺要人情 + 钱（人情是「街坊认你」，钱是「送他去学」），一次买断。
 */

export type SpecialtyId = "wok" | "knife" | "memory";

export interface SpecialtyEffect {
  servePct?: number;
  costPct?: number;
  patiencePct?: number;
  satBonus?: number;
}

export interface SpecialtyDef {
  id: SpecialtyId;
  name: string;
  /** 只有这个岗位能学 */
  role: "cook" | "prep" | "server";
  /** 学成时师傅/老师说的话 */
  line: string;
  /** 做什么 */
  what: string;
  favorCost: number;
  costYuan: number;
  effect: SpecialtyEffect;
  /** 开罗出处 */
  kairo: string;
}

export const SPECIALTIES: readonly SpecialtyDef[] = [
  {
    id: "wok",
    name: "锅气",
    role: "cook",
    line: "火要够猛，粉下锅就别停手，翻三下就起。",
    what: "出碗快 8%",
    favorCost: 10,
    costYuan: 300,
    effect: { servePct: 0.08 },
    kairo: "开罗 clerk_skill：煮粉岗练「調理」升出碗速度",
  },
  {
    id: "knife",
    name: "刀工",
    role: "prep",
    line: "肉要逆纹切，酸笋要斜刀，切得齐，锅里才受得匀。",
    what: "料钱省 6%",
    favorCost: 10,
    costYuan: 300,
    effect: { costPct: 0.06 },
    kairo: "开罗 clerk_skill：备料岗练「仕込み」降食材成本",
  },
  {
    id: "memory",
    name: "记性",
    role: "server",
    line: "哪桌少辣、哪桌加酸笋，记在脑里，别等人再讲一次。",
    what: "耐心 +8% · 满意 +1",
    favorCost: 12,
    costYuan: 400,
    effect: { patiencePct: 0.08, satBonus: 1 },
    kairo: "开罗 clerk_skill：跑堂岗练「接客」升耐心与满意度",
  },
];

export const SPECIALTY_BY_ID = new Map<string, SpecialtyDef>(SPECIALTIES.map((d) => [d.id, d]));
export const SPECIALTY_TOTAL = SPECIALTIES.length;

export function specialtyById(id: string | null | undefined): SpecialtyDef | null {
  if (!id) return null;
  return SPECIALTY_BY_ID.get(id) ?? null;
}

/** 这个岗位能学哪几门 */
export function specialtiesOfRole(role: string): readonly SpecialtyDef[] {
  return SPECIALTIES.filter((d) => d.role === role);
}
