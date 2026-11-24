/**
 * 店员成长（批 L'）：四属性 + 二十一项手艺 + 六门毕业技。
 *
 * 结构溯源（REA 逆向原文，`TheRamenSensei/取证/textassets/xls_out/`）：
 * - `English.lproj__help.txt` 的「Staff 1」原文三项：**Cooking / Service / Speed** ——
 *   「Cooking: It's easier to make mistakes if this stat is lower than the ramen's
 *   difficulty」「Service: Affects staff members' attempts to discover a customer's
 *   preferences」「Speed: Movement speed」；「Staff 2」再加一句「When a staff member's
 *   cooking skill increases, they will be able to **boil more noodles at once**.
 *   When service increases, they will be able to **carry more at once**」。
 * - `English.lproj__clerk_skill.txt` 共 **21 行**（0–20，tier 1–5），例如
 *   #3 麺のささやき「麺のゆで時間短縮」、#5 小金の舞「ゆで麺機に一度に入れる量アップ」、
 *   #7 頑強「体力が減りづらくなる」、#19 努力家「店員の経験値アップ」。
 * - `English.lproj__finishskill.txt` 共 **11 行**，「Staff Finishing Skills」原文：每位店员
 *   有一门收尾时用的本事，「When the corresponding stat increases, the skill also
 *   increases in effectiveness」。
 *
 * 本土化：开罗三项（Cooking/Service/Speed）在南宁粉店里对应的是「火候」「待客」「脚力」，
 * 另按 #7「頑強」与 #19「努力家」补第四项**耐磨**（熬得住、不误工）—— 四项都用粉店里的
 * 白话，不用「属性值」这类词。
 *
 * 三条纪律（照三维度方案 R-3）：
 * 1. **只落稳定性与已有出口**：疲劳增速、休息恢复、辞职门槛、练手速度、每锅份数
 *    （后者仍在原来 `Math.min(2, …)` 的封顶里）、问口味速率。不新开乘数层。
 * 2. 没有「一学就变强很多」的项：每一项都是小步，四属性满 8 也只有几碗的事。
 * 3. 手艺按属性门槛**自动学会**（打工打出来的），玩家不需要点树 —— 点树留给老板自己
 *    （批 K' 的 `perk.ts`），两边不抢同一个注意力。
 */

export type StaffAttr = "fire" | "serve" | "feet" | "grit";

export const STAFF_ATTR_ORDER: readonly StaffAttr[] = ["fire", "serve", "feet", "grit"];

export const STAFF_ATTR_LABEL: Record<StaffAttr, string> = {
  fire: "火候",
  serve: "待客",
  feet: "脚力",
  grit: "耐磨",
};

/** 开罗 `SKILL_LV_MAX = 8`；四属性同顶 */
export const ATTR_MAX = 8;

/** 每个岗位先长哪一项（另外两项按顺序补） */
export const ATTR_BY_ROLE: Record<"cook" | "prep" | "server", StaffAttr> = {
  cook: "fire",
  prep: "grit",
  server: "serve",
};

/** 升一级要多少「手上的活」（十二级封顶；派满正好主项 7、其余各 3 —— 四属性 3 级的毕业技在 168 天前后到手） */
export const XP_STEPS: readonly number[] = [3, 8, 15, 24, 35, 48, 63, 80, 99, 120, 143, 168];

export type StaffSkillKind = "noodle" | "survey" | "fatigue" | "rest" | "xp" | "keep";

export interface StaffSkillEffect {
  kind: StaffSkillKind;
  amount: number;
}

export interface StaffSkillDef {
  id: string;
  name: string;
  attr: StaffAttr;
  /** 这一项属性到几级学会 */
  need: number;
  effect: StaffSkillEffect;
  /** 一句白话：学了以后能感觉到什么 */
  why: string;
  /** 开罗出处（表名 + 行号 + 原文） */
  kairo: string;
}

export const STAFF_SKILLS: readonly StaffSkillDef[] = [
  // ── 火候（per锅下几份，封顶仍在 inNoodlesNum 的 min(2, …) 里）──
  {
    id: "sk.watchfire",
    name: "看火",
    attr: "fire",
    need: 2,
    effect: { kind: "noodle", amount: 0.4 },
    why: "火大水少看得出来，一锅能多下一份不糊。",
    kairo: "clerk_skill #0 調理の心得（調理パラメータ +%）",
  },
  {
    id: "sk.baoxiang",
    name: "爆香",
    attr: "fire",
    need: 3,
    effect: { kind: "noodle", amount: 0.4 },
    why: "酸笋豆豉下锅那一下不慌，手上就快得出来。",
    kairo: "clerk_skill #4 絶妙火加減（スープ作成時間短縮）",
  },
  {
    id: "sk.laonoodle",
    name: "捞面",
    attr: "fire",
    need: 4,
    effect: { kind: "noodle", amount: 0.5 },
    why: "粉篓一抬一抖，几份一起起锅也不粘连。",
    kairo: "clerk_skill #5 小金の舞（ゆで麺機に一度に入れる量アップ）",
  },
  {
    id: "sk.onepot",
    name: "一锅下",
    attr: "fire",
    need: 5,
    effect: { kind: "noodle", amount: 0.5 },
    why: "同一口锅排得开，午市不用一份一份等。",
    kairo: "clerk_skill #6 テクニシャン（麺,ｽｰﾌﾟをどんぶりに一度に入れる量アップ）",
  },
  {
    id: "sk.soupwatch",
    name: "控汤",
    attr: "fire",
    need: 6,
    effect: { kind: "noodle", amount: 0.3 },
    why: "汤滚着也不溢，锅边不用一直守着。",
    kairo: "clerk_skill #3 麺のささやき（麺のゆで時間短縮）",
  },
  {
    id: "sk.pullfire",
    name: "收火",
    attr: "fire",
    need: 8,
    effect: { kind: "noodle", amount: 0.5 },
    why: "起锅就收火，下一轮升温不用等。",
    kairo: "help「Staff 2」：cooking 越高一次能煮的份数越多",
  },

  // ── 待客（问口味速率，接 help「Staff 3」）──
  {
    id: "sk.greet",
    name: "招呼",
    attr: "serve",
    need: 2,
    effect: { kind: "survey", amount: 2 },
    why: "客人一坐下就问得出来，不用等他自己开口。",
    kairo: "help「Staff 3」：service 越高，问出偏好越快",
  },
  {
    id: "sk.accent",
    name: "听口音",
    attr: "serve",
    need: 3,
    effect: { kind: "survey", amount: 2 },
    why: "平话、白话、壮话的客人，一开口就知道要辣还是不要。",
    kairo: "clerk_skill #1 スマイル（接客パラメータ +%）",
  },
  {
    id: "sk.face",
    name: "记脸",
    attr: "serve",
    need: 4,
    effect: { kind: "survey", amount: 3 },
    why: "来第二回的不用问，直接照上次的做。",
    kairo: "clerk_skill #11 笑顔の伝道師（所属店舗の人気 +%）",
  },
  {
    id: "sk.askmore",
    name: "多问一句",
    attr: "serve",
    need: 5,
    effect: { kind: "survey", amount: 3 },
    why: "「今日想食咩？」一句话，客人自己也说清楚了。",
    kairo: "clerk_skill #15 接客の達人（渡したお客様の評価点アップ）",
  },
  {
    id: "sk.keepguest",
    name: "留客",
    attr: "serve",
    need: 6,
    effect: { kind: "survey", amount: 4 },
    why: "等位的人被搭两句话，就不急着走。",
    kairo: "clerk_skill #14 引きとめ（所属店舗のお客様の忍耐 +%）",
  },

  // ── 脚力（休息恢复）──
  {
    id: "sk.fastfeet",
    name: "腿脚快",
    attr: "feet",
    need: 2,
    effect: { kind: "rest", amount: 6 },
    why: "端碗来回不拖步，歇一天就缓过来了。",
    kairo: "clerk_skill #2 早歩き（速さパラメータ +%）",
  },
  {
    id: "sk.nostop",
    name: "不歇脚",
    attr: "feet",
    need: 3,
    effect: { kind: "rest", amount: 6 },
    why: "别人喘三回他还在走，收市了也不像散了架。",
    kairo: "help「Staff 1」：Speed = Movement speed",
  },
  {
    id: "sk.threebowls",
    name: "一趟端三碗",
    attr: "feet",
    need: 4,
    effect: { kind: "rest", amount: 8 },
    why: "托盘端得稳，冤枉路少走一半。",
    kairo: "clerk_skill #6 テクニシャン（一度に入れる量アップ）",
  },
  {
    id: "sk.lightfeet",
    name: "脚不沾地",
    attr: "feet",
    need: 5,
    effect: { kind: "rest", amount: 8 },
    why: "午市两个小时像没走过路。",
    kairo: "clerk_skill #17 職人（調理・接客・速さ +%）",
  },
  {
    id: "sk.nightowl",
    name: "夜里也精神",
    attr: "feet",
    need: 6,
    effect: { kind: "rest", amount: 10 },
    why: "夜市收摊再来一轮，也还站得直。",
    kairo: "clerk_skill #7 頑強（体力が減りづらくなる）",
  },

  // ── 耐磨（疲劳增速 / 辞职门槛 / 练手速度）──
  {
    id: "sk.endure",
    name: "熬得住",
    attr: "grit",
    need: 2,
    effect: { kind: "fatigue", amount: 0.06 },
    why: "同样一天，他累得比别人慢一点。",
    kairo: "clerk_skill #7 頑強（体力が減りづらくなる）",
  },
  {
    id: "sk.early",
    name: "早起",
    attr: "grit",
    need: 3,
    effect: { kind: "xp", amount: 1 },
    why: "天没亮就来备料，一年下来多学不少。",
    kairo: "clerk_skill #19 努力家（店員の経験値アップ）",
  },
  {
    id: "sk.nocomplain",
    name: "不喊累",
    attr: "grit",
    need: 4,
    effect: { kind: "fatigue", amount: 0.08 },
    why: "嘴上不说，手上也不慢。",
    kairo: "clerk_skill #7 頑強 / #17 職人",
  },
  {
    id: "sk.tenyears",
    name: "十年老手",
    attr: "grit",
    need: 5,
    effect: { kind: "keep", amount: 10 },
    why: "再忙也不至于当场说不干。",
    kairo: "help「Staff 1」：stats 越高越不容易出错",
  },
  {
    id: "sk.nosick",
    name: "不误工",
    attr: "grit",
    need: 6,
    effect: { kind: "fatigue", amount: 0.06 },
    why: "连着上十天，脸还是那个脸色。",
    kairo: "clerk_skill #8 味責任者（所属店舗の品質アップ）",
  },
];

export const STAFF_SKILL_TOTAL = STAFF_SKILLS.length;

const SKILL_BY_ID = new Map<string, StaffSkillDef>(STAFF_SKILLS.map((d) => [d.id, d]));

export function staffSkillById(id: string): StaffSkillDef | null {
  return SKILL_BY_ID.get(id) ?? null;
}

export function staffSkillsOfAttr(attr: StaffAttr): readonly StaffSkillDef[] {
  return STAFF_SKILLS.filter((d) => d.attr === attr);
}

/** 四属性全到几级可以出毕业技（7 级老人：主项 5、其余各 3，刚好够） */
export const FINISH_ATTR_NEED = 3;

export interface FinishSkillDef {
  id: string;
  name: string;
  /** 交给玩家看的一句「做完最后这一下」 */
  what: string;
  effect: StaffSkillEffect;
  why: string;
  kairo: string;
}

/**
 * 六门毕业技（开罗 `finishskill` 有 11 行，本作取其中能对上「收尾这一下」的六门）。
 * 门槛统一：四属性都到 3 级（干满 7 级就到），学成一门，钉死。
 */
export const FINISH_SKILLS: readonly FinishSkillDef[] = [
  {
    id: "fs.scallion",
    name: "最后一把葱",
    what: "收市前还能多站两个钟",
    effect: { kind: "rest", amount: 10 },
    why: "碗端出去之前撒那把葱，是他一直在做的最后一下。",
    kairo: "finishskill #8 Flavor Saver（Increase flavor to boost customer visitation rate）",
  },
  {
    id: "fs.soupspoon",
    name: "最后一勺汤",
    what: "一天下来累得慢",
    effect: { kind: "fatigue", amount: 0.1 },
    why: "汤面那一勺补得平，客人走得快，他也省力。",
    kairo: "finishskill #0 Boost Richness（Boost depth of flavor to increase score after eating）",
  },
  {
    id: "fs.wipebowl",
    name: "碗边擦净",
    what: "问口味问得更快",
    effect: { kind: "survey", amount: 4 },
    why: "擦碗那两秒顺手就把话递过去了。",
    kairo: "finishskill #9 Boost Appeal（Boost appeal to boost aura chance）",
  },
  {
    id: "fs.fewwords",
    name: "话不多",
    what: "再忙也不当场说不干",
    effect: { kind: "keep", amount: 10 },
    why: "一句废话都没有，事都在手上。",
    kairo: "finishskill #5 Recipe Memo（Reduce difficulty to increase ramen quality）",
  },
  {
    id: "fs.handsbusy",
    name: "手上不停",
    what: "一年下来多学一手",
    effect: { kind: "xp", amount: 2 },
    why: "空下来就收拾，收拾里全是门道。",
    kairo: "clerk_skill #19 努力家（店員の経験値アップ）",
  },
  {
    id: "fs.onemore",
    name: "多下一份",
    what: "一锅能多下一份",
    effect: { kind: "noodle", amount: 0.5 },
    why: "锅边那一份是他给自己留的位置。",
    kairo: "finishskill #2 Boost Volume / #3 Cut Volume（一碗的分量与吃的时间）",
  },
];

export const FINISH_SKILL_TOTAL = FINISH_SKILLS.length;

const FINISH_BY_ID = new Map<string, FinishSkillDef>(FINISH_SKILLS.map((d) => [d.id, d]));

export function finishSkillById(id: string): FinishSkillDef | null {
  return FINISH_BY_ID.get(id) ?? null;
}

/** 这个岗位毕业时挑哪一门（cook 打锅、prep 收拾、server 递话） */
export const FINISH_BY_ROLE: Record<"cook" | "prep" | "server", string> = {
  cook: "fs.onemore",
  prep: "fs.handsbusy",
  server: "fs.wipebowl",
};

export function staffSkillWords(e: StaffSkillEffect): string {
  switch (e.kind) {
    case "noodle":
      return "一锅多下半份";
    case "survey":
      return "问口味快一点";
    case "fatigue":
      return "累得慢一点";
    case "rest":
      return "歇一天缓得回来";
    case "xp":
      return "学得更快";
    case "keep":
      return "不轻易说不干";
  }
}
