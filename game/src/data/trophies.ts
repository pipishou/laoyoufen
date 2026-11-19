import type { GameState } from "../sim/state";
import { SIDES } from "./sides";

/**
 * 成就（B 批）。
 *
 * 三条设计原则，写在这里免得后来人照抄别的游戏的表：
 *
 * 一、**只挂本作真的有的数**。每一条的 `goal` 都直接读 `GameState` 上现成的字段
 *     （`tally.bowls` / `maxQueue` / `sides.sold` / `rivals.pacified` …），
 *     没有一条是"为了凑 30 条"编出来的指标。开罗 `trophy.txt` 39 条几乎全是
 *     "累计到 N"，那是因为它的中期循环靠数字堆；我们的中期循环靠**动作**
 *     （换粉型、加份量、修街、让同行服气），成就就该记动作。
 *
 * 二、**前五条必须在头两天拿到**。试玩报告里两个真人都在第 2 天打烊后停，
 *     不是因为难，是因为没人告诉他们"已经做到了什么"。所以 `start` 组
 *     的五条门槛全部落在首周的真实曲线上（首日 51 碗、D2 评第一段）。
 *
 * 三、**奖励给人情多于给钱**。人情是本作的第二货币（P52），给钱会直接推高
 *     现金流、让替身的成长曲线失真；人情只在"想少花点钱"时才有用。
 *     只有长期组给现金，而且额度都低于同期一次分店转让费。
 *
 * 评语（`hint`）是本地备选：AI 占位见 `data/trophies.ts` 里的 `voiceHint`，
 * 服务端落点 `trophy_voice` 只写口吻，条件与金额一律本地判定。
 */
export type TrophyGroup = "start" | "craft" | "business" | "street" | "rival" | "long";

export const TROPHY_GROUP_LABEL: Record<TrophyGroup, string> = {
  start: "开张头几天",
  craft: "一碗粉的手艺",
  business: "这条街的生意",
  street: "街面与人情",
  rival: "同条街的对手",
  long: "三年之后",
};

export const TROPHY_GROUP_ORDER: TrophyGroup[] = [
  "start",
  "craft",
  "business",
  "street",
  "rival",
  "long",
];

export interface TrophyReward {
  /** 人情点数（多数成就是给这个） */
  favor?: number;
  /** 现金（只给长期成就，额度都低于一次分店转让费） */
  cash?: number;
}

export interface TrophyDef {
  id: string;
  group: TrophyGroup;
  name: string;
  /** 达成条件的人话 */
  note: string;
  /** 达成瞬间的本地评语（AI 的备选） */
  hint: string;
  /** 这条对应开罗哪一处（只在开发注记里出现，玩家看不到） */
  kairo: string;
  reward: TrophyReward;
  goal: (s: GameState) => boolean;
  /** [现在, 目标] —— 图鉴里画进度用，必须与 goal 同源 */
  progress: (s: GameState) => [number, number];
}

const activeToppings = (s: GameState): number =>
  SIDES.filter((d) => d.kind === "topping" && (s.sides?.active ?? []).includes(d.id)).length;

export const TROPHIES: TrophyDef[] = [
  // ── 开张头几天：五条门槛都落在首周真实曲线上 ──────────────────────────
  {
    id: "first_bowl",
    group: "start",
    name: "第一碗",
    note: "端出第一碗粉",
    hint: "头一碗端出去，手都是抖的。",
    kairo: "Trophy: Get <0> customers!",
    reward: { favor: 3 },
    goal: (s) => s.tally.bowls >= 1,
    progress: (s) => [Math.min(s.tally.bowls, 1), 1],
  },
  {
    id: "hundred_guests",
    group: "start",
    name: "一百位街坊",
    note: "累计来过一百位客人",
    hint: "一百个人吃过你煮的粉了。",
    kairo: "Trophy: Get 100 customers!",
    reward: { favor: 5 },
    goal: (s) => s.totalCustomers >= 100,
    progress: (s) => [Math.min(s.totalCustomers, 100), 100],
  },
  {
    id: "first_grade",
    group: "start",
    name: "第二块牌子",
    note: "评上第 1 段",
    hint: "门口多挂一块牌子，路过的人会多看一眼。",
    kairo: "Rank up",
    reward: { cash: 500 },
    goal: (s) => s.gradeLevel >= 1,
    progress: (s) => [Math.min(s.gradeLevel, 1), 1],
  },
  {
    id: "first_gear",
    group: "start",
    name: "添了第一件",
    note: "店里添第一件家当",
    hint: "哪怕只是两张塑料凳，坐着总比站着强。",
    kairo: "Item Shop",
    reward: { favor: 5 },
    goal: (s) => (s.gear ?? []).length >= 1,
    progress: (s) => [Math.min((s.gear ?? []).length, 1), 1],
  },
  {
    id: "first_street",
    group: "start",
    name: "街上第一件",
    note: "街上修第一件东西",
    hint: "巷口那盏灯亮起来，晚上收摊不用摸黑。",
    kairo: "Investment",
    reward: { favor: 5 },
    goal: (s) => (s.streets ?? []).length >= 1,
    progress: (s) => [Math.min((s.streets ?? []).length, 1), 1],
  },

  // ── 一碗粉的手艺：记动作，不记数字 ───────────────────────────────────
  {
    id: "laoyou_combo",
    group: "craft",
    name: "老友味凑齐",
    note: "凑出第一份「老友味」组合",
    hint: "酸笋、豆豉、辣椒一齐下，那才是老友味。",
    kairo: "Topping combo",
    reward: { favor: 8 },
    goal: (s) => s.tally.comboHits >= 1,
    progress: (s) => [Math.min(s.tally.comboHits, 1), 1],
  },
  {
    id: "side_menu",
    group: "craft",
    name: "加料台摆开",
    note: "加料台上同时挂五样以上",
    hint: "台面摆开，客人才知道能吃出花来。",
    kairo: "More Toppings: Increase max toppings.",
    reward: { favor: 8 },
    goal: (s) => activeToppings(s) >= 5,
    progress: (s) => [Math.min(activeToppings(s), 5), 5],
  },
  {
    id: "big_bowl",
    group: "craft",
    name: "有人要三两",
    note: "菜单上挂一款「三两」",
    hint: "工地上的人一来就喊三两，二两不顶事。",
    kairo: "Customer Fullness (volume)",
    reward: { favor: 8 },
    goal: (s) => s.menu.some((d) => d.portion >= 3),
    progress: (s) => [s.menu.some((d) => d.portion >= 3) ? 1 : 0, 1],
  },
  {
    id: "dry_summer",
    group: "craft",
    name: "夏天干捞",
    note: "菜单上挂一款干捞老友粉",
    hint: "热得没胃口的时候，干捞最开胃。",
    kairo: "Noodle types",
    reward: { favor: 10 },
    goal: (s) => s.menu.some((d) => d.noodle === "dry"),
    progress: (s) => [s.menu.some((d) => d.noodle === "dry") ? 1 : 0, 1],
  },
  {
    id: "claypot_winter",
    group: "craft",
    name: "冬天砂锅",
    note: "菜单上挂一款砂锅老友粉",
    hint: "天冷时砂锅端上来还咕嘟响，人就坐住了。",
    kairo: "Noodle types",
    reward: { favor: 10 },
    goal: (s) => s.menu.some((d) => d.noodle === "claypot"),
    progress: (s) => [s.menu.some((d) => d.noodle === "claypot") ? 1 : 0, 1],
  },
  {
    id: "combo_fifty",
    group: "craft",
    name: "五十份组合",
    note: "累计凑出五十份组合",
    hint: "客人开始认你这套配法了。",
    kairo: "Topping combo",
    reward: { favor: 20 },
    goal: (s) => s.tally.comboHits >= 50,
    progress: (s) => [Math.min(s.tally.comboHits, 50), 50],
  },

  // ── 这条街的生意 ────────────────────────────────────────────────────
  {
    id: "day_thousand",
    group: "business",
    name: "单日过千",
    note: "一天卖出 ¥1,000",
    hint: "收摊数钱的时候手都热了。",
    kairo: "Trophy: Earn <0>",
    reward: { cash: 800 },
    goal: (s) => s.tally.bestDayRevenue >= 1000,
    progress: (s) => [Math.min(Math.round(s.tally.bestDayRevenue), 1000), 1000],
  },
  {
    id: "day_three_thousand",
    group: "business",
    name: "单日过三千",
    note: "一天卖出 ¥3,000",
    hint: "一天的钱够交好几天房租了。",
    kairo: "Trophy: Earn <0>",
    reward: { cash: 2500 },
    goal: (s) => s.tally.bestDayRevenue >= 3000,
    progress: (s) => [Math.min(Math.round(s.tally.bestDayRevenue), 3000), 3000],
  },
  {
    id: "queue_ten",
    group: "business",
    name: "排到十位",
    note: "门口同时排十个人",
    hint: "队伍拐了个弯，隔壁摊都看过来。",
    kairo: "Ramen Frenzy / queue",
    reward: { favor: 10 },
    goal: (s) => s.tally.maxQueue >= 10,
    progress: (s) => [Math.min(s.tally.maxQueue, 10), 10],
  },
  {
    id: "rep_four",
    group: "business",
    name: "口碑 4.0",
    note: "口碑到 4.0",
    hint: "街坊开始主动带人来。",
    kairo: "Shop reputation",
    reward: { favor: 15 },
    goal: (s) => s.reputation >= 4,
    progress: (s) => [Math.min(Math.round(s.reputation * 10) / 10, 4), 4],
  },
  {
    id: "rep_five",
    group: "business",
    name: "口碑 4.8",
    note: "口碑到 4.8",
    hint: "这一带提起老友粉，头一个说你。",
    kairo: "Shop reputation",
    reward: { cash: 5000 },
    goal: (s) => s.reputation >= 4.8,
    progress: (s) => [Math.min(Math.round(s.reputation * 10) / 10, 4.8), 4.8],
  },
  {
    id: "grade_six",
    group: "business",
    name: "第六段",
    note: "评到第 6 段",
    hint: "牌子挂到第六块，走过的人都会停一下。",
    kairo: "Rank up",
    reward: { cash: 6000 },
    goal: (s) => s.gradeLevel >= 6,
    progress: (s) => [Math.min(s.gradeLevel, 6), 6],
  },

  // ── 街面与人情 ──────────────────────────────────────────────────────
  {
    id: "street_six",
    group: "street",
    name: "半条街",
    note: "街上修满六件",
    hint: "半条街都是你张罗起来的。",
    kairo: "Investment",
    reward: { favor: 20 },
    goal: (s) => (s.streets ?? []).length >= 6,
    progress: (s) => [Math.min((s.streets ?? []).length, 6), 6],
  },
  {
    id: "gear_all",
    group: "street",
    name: "十二件家当",
    note: "家当买齐十二件",
    hint: "从一张矮凳到一口冰柜，这店总算有个样子。",
    kairo: "Item Shop",
    reward: { cash: 8000 },
    goal: (s) => (s.gear ?? []).length >= 12,
    progress: (s) => [Math.min((s.gear ?? []).length, 12), 12],
  },
  {
    id: "favor_hundred",
    group: "street",
    name: "一百点人情",
    note: "累计攒过 100 点人情",
    hint: "这条街欠你的人情，都记在账上。",
    kairo: "Spirit Points",
    reward: { cash: 1000 },
    goal: (s) => (s.favorTotal ?? 0) >= 100,
    progress: (s) => [Math.min(Math.round(s.favorTotal ?? 0), 100), 100],
  },
  {
    id: "sell_recipe",
    group: "street",
    name: "转过一份方子",
    note: "把一份多余的配方转手出去",
    hint: "方子给了别人，人情落在你手里。",
    kairo: "Ramen Lab: sell unneeded recipes",
    reward: { favor: 10 },
    goal: (s) => (s.tally.recipesSold ?? 0) >= 1,
    progress: (s) => [Math.min(s.tally.recipesSold ?? 0, 1), 1],
  },
  {
    id: "takeover",
    group: "street",
    name: "接了别人的铺子",
    note: "接手一家关门的同行铺子",
    hint: "那间空铺子亮起灯的时候，街坊都过来看。",
    kairo: "Buy Shop",
    reward: { cash: 3000 },
    goal: (s) => (s.takenOver ?? []).length >= 1,
    progress: (s) => [Math.min((s.takenOver ?? []).length, 1), 1],
  },

  // ── 同条街的对手 ────────────────────────────────────────────────────
  {
    id: "pacify_one",
    group: "rival",
    name: "一家服气",
    note: "让一家同行服气",
    hint: "老甘今天没在门口站着，进店去了。",
    kairo: "Artisan Statue: Cuts rival effects",
    reward: { favor: 25 },
    goal: (s) => (s.rivals ?? []).some((r) => r.pacified),
    progress: (s) => [(s.rivals ?? []).filter((r) => r.pacified).length > 0 ? 1 : 0, 1],
  },
  {
    id: "close_one",
    group: "rival",
    name: "一间关了门",
    note: "看着一家同行关门",
    hint: "卷闸门拉下来那天，你站了很久。",
    kairo: "Rival shops close",
    reward: { favor: 15 },
    goal: (s) => (s.rivals ?? []).some((r) => r.closed),
    progress: (s) => [(s.rivals ?? []).some((r) => r.closed) ? 1 : 0, 1],
  },
  {
    id: "arena_first",
    group: "rival",
    name: "落场第一胜",
    note: "在落场赢第一场",
    hint: "六十秒下来，你手心里全是汗。",
    kairo: "Ramen Arena",
    reward: { favor: 10 },
    goal: (s) => s.tally.arenaWins >= 1,
    progress: (s) => [Math.min(s.tally.arenaWins, 1), 1],
  },
  {
    id: "contest_top",
    group: "rival",
    name: "进过前三",
    note: "比赛进过一次前三",
    hint: "奖状贴在收银台后面，进门就能看见。",
    kairo: "Contest",
    reward: { cash: 3000 },
    goal: (s) => s.contest.wins >= 1,
    progress: (s) => [Math.min(s.contest.wins, 1), 1],
  },

  // ── 三年之后 ────────────────────────────────────────────────────────
  {
    id: "branch_first",
    group: "long",
    name: "第二家店",
    note: "在别处开第一家分店",
    hint: "第二家店开张那天，你在门口站到天黑。",
    kairo: "Buy Normal Shop",
    reward: { cash: 4000 },
    goal: (s) => (s.branches ?? []).length >= 1,
    progress: (s) => [Math.min((s.branches ?? []).length, 1), 1],
  },
  {
    id: "menu_six",
    group: "long",
    name: "菜单挂满",
    note: "菜单上同时挂六款",
    hint: "一块牌子写不下那么多粉名了。",
    kairo: "Ramen Lab / menu",
    reward: { favor: 30 },
    goal: (s) => s.menu.length >= 6,
    progress: (s) => [Math.min(s.menu.length, 6), 6],
  },
  {
    id: "district_two",
    group: "long",
    name: "走过两个区",
    note: "在两个区开过店",
    hint: "从兴宁到青秀，南宁跑了个来回。",
    kairo: "Region",
    reward: { cash: 4000 },
    goal: (s) => (s.tally.districts ?? []).length >= 2,
    progress: (s) => [Math.min((s.tally.districts ?? []).length, 2), 2],
  },
  {
    id: "bowls_thousand",
    group: "long",
    name: "一千碗",
    note: "累计端出一千碗粉",
    hint: "一千碗，够从巷口摆到江边。",
    kairo: "Trophy: Serve <0>",
    reward: { cash: 5000 },
    goal: (s) => s.tally.bowls >= 1000,
    progress: (s) => [Math.min(s.tally.bowls, 1000), 1000],
  },
];

export const TROPHY_BY_ID = new Map(TROPHIES.map((t) => [t.id, t]));
export const TROPHY_TOTAL = TROPHIES.length;

export function trophiesOfGroup(group: TrophyGroup): TrophyDef[] {
  return TROPHIES.filter((t) => t.group === group);
}
