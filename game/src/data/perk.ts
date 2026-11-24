/**
 * 手艺点（批 K′，解 P0-3「没有点数树」）。
 *
 * 开罗 `rank` 是 17 项点数树：最大含水量、最小湿度、最厚/最薄、多一种面型、
 * 更多汤料、更多浇头、战术值、同时道具数，还有拉面馆扩建/道路/买店 —— 打烊给点数，
 * 玩家自己在树上点。
 *
 * 本作没有「面型 / 汤料位 / 拉面馆地块」这些结构（`Recipe.soup` 是定长元组，
 * 全仓 `soupSlot` 命中 0；也没有街区建造层），所以按**已有的四个杠杆**重排 16 项：
 *
 *   - `taste`   口味末段 +N（与浇头熟练度同一个夹子，封顶 +6）
 *   - `topping` 加购时能多加一份浇头（封顶 +2）
 *   - `serve`   出碗三段各 −N 分（封顶 −0.3，与 `SKILL_CAP` 同一处夹）
 *   - `favor`   人情日上限 +N（`FAVOR_GAIN.dailyCapByBowls` 起）
 *
 * 二次确认（R-11）撤掉了「汤料位 +1」：没有那个上限，就写不出那个奖励。
 *
 * 手艺点从段位来，不由钱买：段位晋升发点，树上花点。段位费（¥660,800）仍是
 * 现金的主去处，两条不抢同一笔钱（R-2）。
 */

export type PerkFamily = "heat" | "knife" | "memory" | "human";

export type PerkEffectKind = "taste" | "topping" | "serve" | "favor";

export interface PerkEffect {
  kind: PerkEffectKind;
  amount: number;
}

export interface PerkDef {
  id: string;
  family: PerkFamily;
  name: string;
  /** 面板上的一行说明 */
  what: string;
  /** 花几点手艺点 */
  cost: number;
  /**
   * 必须先点的那一项（批 X′，解「十六项之间没有先后」）。
   *
   * 开罗 `rank` 是一棵树，不是一个篮子 —— 先点得出「最大含水量」，才点得出下一档。
   * 我们这十六项按族串成四根链，每族从最便宜那一项起手；没点前置时按钮上写
   * 「先点「X」」，不扣点也不消耗。
   */
  prev?: string;
  effect: PerkEffect;
  /** 一句人话：为什么这一项值 */
  why: string;
  kairo: string;
}

export const PERK_FAMILY_NAMES: Readonly<Record<PerkFamily, string>> = {
  heat: "镬气",
  knife: "刀工",
  memory: "记性",
  human: "人情",
};

/** 段位 → 手艺点：第 1 段起每晋一段发一次（合计 64 点，正好点满 16 项） */
export const PERK_AWARD_BY_LEVEL: readonly number[] = [2, 4, 6, 8, 8, 8, 8, 8, 7, 5];

export const PERK_POINT_TOTAL = PERK_AWARD_BY_LEVEL.reduce((a, b) => a + b, 0);

export const PERKS: readonly PerkDef[] = [
  // ── 镬气：火上的手艺，落「味道末段」与「出碗」──
  {
    id: "heat_taste_1",
    family: "heat",
    name: "爆得透",
    what: "蒜末豆豉在锅里多爆半分钟，味道的末段抬一点",
    cost: 3,
    effect: { kind: "taste", amount: 2 },
    why: "「整个煮粉过程要大火候、快手脚，一气呵成」—— 爆得透不透，吃的人一口就知道。",
    kairo: "rank：Ramen Quality 一类（抬成品上限）",
  },
  {
    id: "heat_taste_2",
    prev: "heat_taste_1",
    family: "heat",
    name: "锅气不散",
    what: "起锅前那一下不犹豫，末段再抬一点",
    cost: 4,
    effect: { kind: "taste", amount: 2 },
    why: "人们夸一碗老友粉，会说它很有锅气 —— 一口锅与厨师、食材、火影之间的对话。",
    kairo: "rank：同上（第二档）",
  },
  {
    id: "heat_serve_1",
    prev: "heat_taste_2",
    family: "heat",
    name: "两锅轮着来",
    what: "炒料与煮粉交替着走，出碗快一点",
    cost: 4,
    effect: { kind: "serve", amount: 0.1 },
    why: "「不过两分钟，一碗热气腾腾的老友粉便出锅了」—— 手快是靠换手，不是靠赶。",
    kairo: "rank：Tactics / Speed 一类（缩时间）",
  },
  {
    id: "heat_serve_2",
    prev: "heat_serve_1",
    family: "heat",
    name: "火不熄",
    what: "灶上一直有火，不用重新热锅",
    cost: 5,
    effect: { kind: "serve", amount: 0.2 },
    why: "忙的时候最贵的是「重新起锅」：火一断，锅气就散了，客人也等散了（P164）。",
    kairo: "rank：同上（第二档）",
  },

  // ── 刀工：案子上的手艺，落「浇头位」与「味道」──
  {
    id: "knife_slot_1",
    family: "knife",
    name: "切得薄",
    what: "一份肉切得更薄，能多配一样",
    cost: 3,
    effect: { kind: "topping", amount: 1 },
    why: "生料自选里「瘦肉+猪肝+粉肠」是经典三样 —— 能多配一样，一碗就丰盛一层。",
    kairo: "rank：More Toppings（增加可选浇头数）",
  },
  {
    id: "knife_taste_1",
    prev: "knife_slot_1",
    family: "knife",
    name: "丝切得匀",
    what: "酸笋丝粗细一致，入口的层次更整",
    cost: 3,
    effect: { kind: "taste", amount: 2 },
    why: "老友粉的灵魂在酸笋、豆豉、辣椒酱 —— 笋丝切得匀不匀，决定酸得顺不顺。",
    kairo: "rank：Ramen Quality 一类",
  },
  {
    id: "knife_serve_1",
    prev: "knife_taste_1",
    family: "knife",
    name: "粉抖得开",
    what: "下锅前把粉抖散，煮的时间短一截",
    cost: 4,
    effect: { kind: "serve", amount: 0.1 },
    why: "粉一坨下去，中间那截永远不熟 —— 抖开是省时间的第一步。",
    kairo: "rank：Speed 一类",
  },
  {
    id: "knife_slot_2",
    prev: "knife_serve_1",
    family: "knife",
    name: "码得齐",
    what: "案板上分区摆好，再多配一样不慌",
    cost: 5,
    effect: { kind: "topping", amount: 1 },
    why: "「案板靠墙，转身就到」—— 案子顺不顺，决定忙时还能不能多配一样。",
    kairo: "rank：同上（第二档）",
  },

  // ── 记性：柜台上的手艺，落「人情日上限」──
  {
    id: "memory_favor_1",
    family: "memory",
    name: "记得住脸",
    what: "常客不用开口你就知道他要什么，人情攒得快一点",
    cost: 3,
    effect: { kind: "favor", amount: 2 },
    why: "「友仔」「友女」—— 南宁人把朋友叫得亲，粉店里认得脸就是交情。",
    kairo: "rank：本作没有对应项，按本地「认脸」补",
  },
  {
    id: "memory_taste_1",
    prev: "memory_favor_1",
    family: "memory",
    name: "记得住火候",
    what: "哪一锅该多大火，手上有数",
    cost: 3,
    effect: { kind: "taste", amount: 2 },
    why: "老友粉讲究「少一分醋则不酸，多一分酱则过咸」—— 差的就是这一点记性。",
    kairo: "rank：Ramen Quality 一类",
  },
  {
    id: "memory_favor_2",
    prev: "memory_taste_1",
    family: "memory",
    name: "记得住口味",
    what: "谁不要葱、谁要加辣，记在心上",
    cost: 4,
    effect: { kind: "favor", amount: 2 },
    why: "点单靠喊，回头客靠记 —— 「二两猪杂老友加煎蛋」这种话说一遍就该记住。",
    kairo: "rank：同上（第二档）",
  },
  {
    id: "memory_slot_1",
    prev: "memory_favor_2",
    family: "memory",
    name: "记得住搭法",
    what: "哪两样配一起好吃，心里有本账",
    cost: 5,
    effect: { kind: "topping", amount: 1 },
    why: "搭配不是玄学：酸笋配生菜、猪肉配煎蛋 —— 记住组合的人配得更准。",
    kairo: "rank：More Toppings（换成本地搭配）",
  },

  // ── 人情：街上的手艺，落「人情日上限」与「出碗」──
  {
    id: "human_favor_1",
    family: "human",
    name: "门口有张熟脸",
    what: "街坊路过会进来打个招呼，人情攒得快",
    cost: 4,
    effect: { kind: "favor", amount: 2 },
    why: "老友粉是「街坊生意」：一天里一半的客人是抬头就认得的。",
    kairo: "rank：本作没有对应项，按「街坊」补",
  },
  {
    id: "human_taste_1",
    prev: "human_favor_1",
    family: "human",
    name: "肯听劝",
    what: "客人说咸了淡了，第二天就改",
    cost: 4,
    effect: { kind: "taste", amount: 2 },
    why: "老友粉的口味是街坊一口一口调出来的，不是师傅一个人定的。",
    kairo: "rank：Ramen Quality 一类",
  },
  {
    id: "human_favor_2",
    prev: "human_taste_1",
    family: "human",
    name: "肯赊一碗",
    what: "手头紧的熟客先吃着，回头加倍还",
    cost: 5,
    effect: { kind: "favor", amount: 2 },
    why: "「老友」两个字本来就带点义气 —— 赊一碗的人，下次带三个人来。",
    kairo: "rank：同上（第二档）",
  },
  {
    id: "human_serve_1",
    prev: "human_favor_2",
    family: "human",
    name: "帮手肯搭手",
    what: "忙的时候有人递碗递料，手上快一点",
    cost: 5,
    effect: { kind: "serve", amount: 0.2 },
    why: "传承基地「传帮带」出来的那批师傅，快的不是手，是配合。",
    kairo: "rank：Speed 一类（人多手快）",
  },
];

export const PERK_TOTAL = PERKS.length;

export const PERK_BY_ID: ReadonlyMap<string, PerkDef> = new Map(PERKS.map((p) => [p.id, p]));

export function perkById(id: string): PerkDef | undefined {
  return PERK_BY_ID.get(id);
}

export function perksOfFamily(family: PerkFamily): readonly PerkDef[] {
  return PERKS.filter((p) => p.family === family);
}

/** 单项效果封顶：不多给，也不叠第六层 */
export const PERK_CAP: Readonly<Record<PerkEffectKind, number>> = {
  taste: 6,
  topping: 2,
  serve: 0.3,
  favor: 8,
};

export function perkEffectWords(e: PerkEffect): string {
  if (e.kind === "taste") return `味道末段 +${e.amount}`;
  if (e.kind === "topping") return `浇头位 +${e.amount}`;
  if (e.kind === "serve") return `出碗 −${e.amount.toFixed(1)} 分`;
  return `人情日上限 +${e.amount}`;
}
