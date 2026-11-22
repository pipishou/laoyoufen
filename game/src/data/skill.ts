/**
 * 手上的功夫（批次 6）：十二支技法，每支三级，一共三十六个节点。
 *
 * 开罗 `ramen_skill.txt` 45 行 + `finishskill.txt` 11 行，是「经营中一点点练出来的手艺」：
 * 每一条都挂在具体动作上（煮、切、汆、摆、招呼），练满了给一个固定加成。
 * 我们原来的「研究改良」是四条一次性决断（A6 老师傅的方子），管的是**某一款的一口锅**；
 * 这一层管的是**老板自己的手**，与店员专精（A9）分开：店员走了手艺还在，这是你的。
 *
 * 三条纪律：
 * 1. 一支只落**已有出口**（出碗 / 料钱 / 耐心 / 满意 / 抢客），不新开机制；
 * 2. **必须一级一级练**，不能跳级 —— 火候这回事就是如此；
 * 3. 十二支的加成上限由 `sim/skill.ts` 统一夹住（`SKILL_CAP`），不然三十六节点能把乘数拉到失真。
 *
 * 为什么不做成「改良扩五级」：开罗的改良是「同一件事加五档数字」，
 * 玩家只看到价格涨；技法树是「十二件不同的事各自三级」，玩家能选自己缺哪一手。
 */

export type SkillFamily = "heat" | "knife" | "host" | "trade";

export interface SkillEffect {
  /** 出碗快 */
  servePct?: number;
  /** 料钱省 */
  costPct?: number;
  /** 客人耐心 */
  patiencePct?: number;
  /** 每碗满意 */
  satBonus?: number;
  /** 进店（抢客） */
  attractPct?: number;
}

export interface SkillLevel {
  /** 学会这一级时，老师傅说的一句人话 */
  line: string;
  favorCost: number;
  costYuan: number;
  effect: SkillEffect;
}

export interface SkillBranch {
  id: string;
  name: string;
  family: SkillFamily;
  /** 这一支练的是什么 */
  what: string;
  /** 同一门里要先练出来的那一支（一级即可）；没有就是这一门的头一支 */
  prev?: string;
  /** 三级：下标 0 是一级 */
  levels: readonly [SkillLevel, SkillLevel, SkillLevel];
  /** 开罗出处 */
  kairo: string;
}

export const FAMILY_NAMES: Record<SkillFamily, string> = {
  heat: "火候",
  knife: "刀工",
  host: "待客",
  trade: "生意",
};

export const SKILL_BRANCHES: readonly SkillBranch[] = [
  {
    id: "wok_fire",
    name: "看火",
    family: "heat",
    what: "锅一直是热的，下粉不用等",
    kairo: "开罗 ramen_skill：調理・火加減",
    levels: [
      { line: "火苗别让它趴下，锅边一直有响。", favorCost: 8, costYuan: 200, effect: { servePct: 0.03 } },
      { line: "两锅换着来，前一碗起锅，后一碗就下。", favorCost: 10, costYuan: 400, effect: { servePct: 0.04 } },
      { line: "听声就知道水开没开，不用回头看。", favorCost: 14, costYuan: 700, effect: { servePct: 0.05 } },
    ],
  },
  {
    id: "sear",
    name: "爆香",
    family: "heat",
    prev: "wok_fire",
    what: "酸笋豆豉下锅那一下，屋里屋外都闻得到",
    kairo: "开罗 ramen_skill：調理・香り",
    levels: [
      { line: "油热到冒青烟再下笋，那股酸香才出得来。", favorCost: 8, costYuan: 200, effect: { satBonus: 1 } },
      { line: "蒜末后放，别让它焦。", favorCost: 10, costYuan: 400, effect: { satBonus: 1 } },
      { line: "一勺热油淋上去，香先到桌，粉后到。", favorCost: 14, costYuan: 700, effect: { satBonus: 2 } },
    ],
  },
  {
    id: "soup_skim",
    name: "撇沫",
    family: "heat",
    what: "汤清不浑，料不白费",
    kairo: "开罗 ramen_skill：調理・灰汁取り",
    levels: [
      { line: "浮沫一撇，汤就清了一半。", favorCost: 8, costYuan: 200, effect: { costPct: 0.02 } },
      { line: "猪骨先飞水再熬，腥味不留。", favorCost: 10, costYuan: 400, effect: { costPct: 0.03 } },
      { line: "两小时补一次水，汤不干，骨不废。", favorCost: 14, costYuan: 700, effect: { costPct: 0.03 } },
    ],
  },
  {
    id: "slice",
    name: "切片",
    family: "knife",
    what: "肉切得薄，熟得快，也少出边角料",
    kairo: "开罗 ramen_skill：仕込み・包丁",
    levels: [
      { line: "肉冻半小时再切，片就齐了。", favorCost: 8, costYuan: 200, effect: { costPct: 0.02 } },
      { line: "逆纹下刀，咬起来才不柴。", favorCost: 10, costYuan: 400, effect: { costPct: 0.03 } },
      { line: "边角料留着做肉末，一样卖得掉。", favorCost: 14, costYuan: 700, effect: { costPct: 0.03 } },
    ],
  },
  {
    id: "sour_cut",
    name: "笋丝",
    family: "knife",
    prev: "slice",
    what: "酸笋切得匀，酸味才不忽轻忽重",
    kairo: "开罗 ramen_skill：仕込み・切り方",
    levels: [
      { line: "斜刀切丝，比切段入味。", favorCost: 8, costYuan: 200, effect: { satBonus: 1 } },
      { line: "笋头笋尾分开放，先后下锅。", favorCost: 10, costYuan: 400, effect: { satBonus: 1 } },
      { line: "一坛用多少取多少，坛口别常开。", favorCost: 14, costYuan: 700, effect: { satBonus: 1 } },
    ],
  },
  {
    id: "offal_clean",
    name: "洗杂",
    family: "knife",
    what: "猪杂洗得干净，客人等得安心",
    kairo: "开罗 ramen_skill：仕込み・下処理",
    levels: [
      { line: "粉肠翻过来用盐搓两遍。", favorCost: 8, costYuan: 200, effect: { patiencePct: 0.03 } },
      { line: "肝别泡太久，泡久了发白。", favorCost: 10, costYuan: 400, effect: { patiencePct: 0.03 } },
      { line: "现处理的杂才脆，隔夜的不留。", favorCost: 14, costYuan: 700, effect: { patiencePct: 0.04 } },
    ],
  },
  {
    id: "greet",
    name: "招呼",
    family: "host",
    what: "人还在门口，话就先到",
    kairo: "开罗 ramen_skill：接客・声かけ",
    levels: [
      { line: "“食咩？先坐。” 一句话抵半张凳子。", favorCost: 8, costYuan: 200, effect: { attractPct: 0.03 } },
      { line: "过路的也点个头，下回他就进来了。", favorCost: 10, costYuan: 400, effect: { attractPct: 0.04 } },
      { line: "熟客的名字叫得出来，他就带人来了。", favorCost: 14, costYuan: 700, effect: { attractPct: 0.04 } },
    ],
  },
  {
    id: "memory",
    name: "记脸",
    family: "host",
    prev: "greet",
    what: "谁来吃过、要什么口味，不用问第二遍",
    kairo: "开罗 ramen_skill：接客・気配り",
    levels: [
      { line: "少辣的、加酸的，心里挂个号。", favorCost: 8, costYuan: 200, effect: { patiencePct: 0.03 } },
      { line: "他上次嫌咸，这次少放半勺。", favorCost: 10, costYuan: 400, effect: { patiencePct: 0.04 } },
      { line: "隔了半个月再来，你还记得他要二两。", favorCost: 14, costYuan: 700, effect: { patiencePct: 0.04 } },
    ],
  },
  {
    id: "tea",
    name: "递茶",
    family: "host",
    what: "等位的人有杯茶，火气就下去了",
    kairo: "开罗 ramen_skill：接客・お茶",
    levels: [
      { line: "排队的人先倒一杯山楂茶。", favorCost: 8, costYuan: 200, effect: { satBonus: 1 } },
      { line: "带小孩的多给一只小碗。", favorCost: 10, costYuan: 400, effect: { satBonus: 1 } },
      { line: "下雨天门口备几张纸巾。", favorCost: 14, costYuan: 700, effect: { satBonus: 1 } },
    ],
  },
  {
    id: "ledger",
    name: "记账",
    family: "trade",
    what: "每天收多少、花多少，心里有本账",
    kairo: "开罗 ramen_skill：経営・帳簿",
    levels: [
      { line: "当天记当天，别等月底想。", favorCost: 8, costYuan: 200, effect: { costPct: 0.02 } },
      { line: "哪一样料剩得多，第二天就少进。", favorCost: 10, costYuan: 400, effect: { costPct: 0.02 } },
      { line: "一周对一次秤，多的少的都看得出来。", favorCost: 14, costYuan: 700, effect: { costPct: 0.03 } },
    ],
  },
  {
    id: "queue",
    name: "排队",
    family: "trade",
    prev: "ledger",
    what: "队排得顺，人就不觉得久",
    kairo: "开罗 ramen_skill：経営・行列",
    levels: [
      { line: "先收钱后出碗，队走得快。", favorCost: 8, costYuan: 200, effect: { patiencePct: 0.03 } },
      { line: "一个人专管叫号，别让煮粉的分心。", favorCost: 10, costYuan: 400, effect: { patiencePct: 0.03 } },
      { line: "队尾挂块牌，让人知道还要几个。", favorCost: 14, costYuan: 700, effect: { patiencePct: 0.03 } },
    ],
  },
  {
    id: "street_sign",
    name: "摆摊",
    family: "trade",
    what: "摊子摆得让人一眼看见",
    kairo: "开罗 ramen_skill：経営・見せ方",
    levels: [
      { line: "价牌写大点，站对面也看得清。", favorCost: 8, costYuan: 200, effect: { attractPct: 0.03 } },
      { line: "锅就摆在门口，香味替你招呼。", favorCost: 10, costYuan: 400, effect: { attractPct: 0.03 } },
      { line: "灯拉到棚子外面，晚上也看得见。", favorCost: 14, costYuan: 700, effect: { attractPct: 0.03 } },
    ],
  },
];

export const SKILL_TOTAL = SKILL_BRANCHES.length * 3;

export const SKILL_BY_ID = new Map(SKILL_BRANCHES.map((b) => [b.id, b]));

export function skillById(id: string): SkillBranch | undefined {
  return SKILL_BY_ID.get(id);
}

export function branchesOfFamily(family: SkillFamily): readonly SkillBranch[] {
  return SKILL_BRANCHES.filter((b) => b.family === family);
}
