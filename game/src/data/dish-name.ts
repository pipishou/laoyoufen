/**
 * 这碗粉叫什么 —— 开罗 `ramen_name.txt` 的本土化替代。
 *
 * ## 开罗的做法
 * `English.lproj__ramen_name.txt` 是 4 行（轴）× 9 档，每档一组同义形容词：
 *   轴 0 风味  Weak / Light / Simple … → Ultimate / Lovely / Prime / Flavorful / Yummy
 *   轴 1 口感  Velvety / Soft / Gentle … → Dazzling / Phantom / Galactic / Heavenly
 *   轴 2 份量  Mini / Small / Healthy … → Towering / Galactic / Ultra / Titanic / Infinite
 *   轴 3 修饰  Smiley / Everyday / Normal … → Legendary / Gods' / Optimal / Next-Gen
 * 本质是「按品质分档，越好的碗形容词越夸张」——拼出来是
 * 「Ultimate Heavenly Titanic Legendary ramen」这种招牌名。
 *
 * ## 为什么不照抄
 * 南宁粉店不这么命名：没有「浓汤/清汤」之分（老友粉的汤底就是酸笋+豆豉+猪骨那一锅），
 * 也不会给一碗粉堆四个夸张形容词。真实点单是**四个实轴**：
 *
 *   做法（汤粉 / 干捞 / 砂锅）× 主料（碎肉 / 猪杂 / 牛肉 …）× 粉型（切粉 / 圆粉 / 伊面 / 湿面）× 加料（加蛋 / 加腐竹 …）
 *
 * 而且默认项要省掉——你说「一碗老友粉」，老板默认就是汤粉、切粉、碎肉；
 * 要干捞才说「干捞老友粉」，要猪杂才说「老友猪杂粉」。
 *
 * 所以这里的 4 轴是：`method`（做法）× `main`（主料）× `noodle`（粉型）× `extras`（另外加的）。
 * 开罗那套「形容词随品质升级」搬到**评语**里（`dishNoteOf`），按分数 5 档，用南宁话讲。
 */

import type { NoodleId } from "./noodles";

/** 做法：汤粉是默认，不写进名字 */
export type MethodId = "soup" | "dry" | "sandpot";

/** 主料：碎肉是默认（最基础的老友粉就是碎肉），其余靠加料台解锁 */
export type MainId = "pork" | "offal" | "egg" | "fuzhu" | "youtiao" | "greens";

export interface MainDef {
  id: MainId;
  /** 写进品名的词；空字符串＝默认项，名字里省掉 */
  word: string;
  /** 对应哪件加料（默认项没有） */
  side: string | null;
  line: string;
}

export const MAINS: MainDef[] = [
  { id: "pork", word: "", side: null, line: "老友粉的本分——碎肉、酸笋、豆豉一起下锅爆。" },
  { id: "offal", word: "猪杂", side: "zhuzai", line: "粉肠、猪肝、生肠，南宁人点得最多的一碗。" },
  { id: "egg", word: "加蛋", side: "ludan", line: "卤蛋切开泡在汤里，蛋黄的油会化进汤。" },
  { id: "fuzhu", word: "腐竹", side: "fuzhu", line: "腐竹先炸后泡，吸汤。" },
  { id: "youtiao", word: "油条", side: "youtiao", line: "油条掰段泡汤，脆的软的都有人爱。" },
  { id: "greens", word: "青菜", side: "qingcai", line: "一把青菜下去，汤立刻清一点。" },
];

export const MAIN_BY_ID = new Map<MainId, MainDef>(MAINS.map((m) => [m.id, m]));

/** 做法 → 品名前缀（汤粉是默认，不写） */
export const METHOD_WORD: Record<MethodId, string> = {
  soup: "",
  dry: "干捞",
  sandpot: "砂锅",
};

/** 粉型 → 品名尾词（切粉是默认，写「粉」） */
export const NOODLE_WORD: Record<NoodleId, string> = {
  flat: "粉",
  round: "圆粉",
  yifu: "伊面",
  wetchow: "湿面",
  dry: "粉",
  claypot: "粉",
};

/** 粉型 → 做法（干捞粉 / 砂锅粉本身就把做法写进品名了） */
export function methodOfNoodle(kind: NoodleId): MethodId {
  if (kind === "dry") return "dry";
  if (kind === "claypot") return "sandpot";
  return "soup";
}

export interface DishParts {
  method: MethodId;
  main: MainId;
  noodle: NoodleId;
  /** 除主料之外的加料（写「+加腐竹」这种尾巴） */
  extras: string[];
  /** 是否配了粉+饮料套餐 */
  meal: boolean;
}

/**
 * 拼出这碗粉的名字。
 *
 * - 汤粉 + 切粉 + 碎肉 → 「老友粉」（一个字都不多，跟店里一样）
 * - 干捞 + 切粉 + 猪杂 → 「干捞老友猪杂粉」
 * - 汤粉 + 伊面 + 碎肉 → 「老友伊面」
 * - 砂锅 + 切粉 + 碎肉 + 套餐 → 「砂锅老友粉（配豆浆）」
 */
export function dishName(parts: DishParts): string {
  const method = METHOD_WORD[parts.method] ?? "";
  const main = MAIN_BY_ID.get(parts.main)?.word ?? "";
  const tail = NOODLE_WORD[parts.noodle] ?? "粉";
  // 「老友」是味型，永远在中间；做法在内层最前，主料紧跟
  let name = `${method}老友${main}${tail}`;
  // 圆粉/伊面/湿面已经带「粉/面」字，不再补「粉」
  if (parts.extras.length > 0) name += `＋${parts.extras.join("＋")}`;
  if (parts.meal) name += "（配饮料）";
  return name;
}

/** 评语档：把开罗「形容词随品质升级」搬到这里（5 档，南宁话） */
export interface DishNote {
  min: number;
  word: string;
  line: string;
}

export const DISH_NOTES: DishNote[] = [
  { min: 85, word: "镇店之宝", line: "这条街做不出第二碗，熟客进门只点这个。" },
  { min: 75, word: "街坊都识", line: "坐下来不用看牌子，老板自己知道你要哪碗。" },
  { min: 65, word: "酸笋够镬气", line: "锅气足，酸笋的酸是炒出来的，不是泡出来的。" },
  { min: 55, word: "老友味正", line: "该有的都有，就是还差一点火候。" },
  { min: 0, word: "家常水平", line: "自己吃得下，拿出去卖要再练。" },
];

export function dishNoteOf(total: number): DishNote {
  return DISH_NOTES.find((n) => total >= n.min) ?? DISH_NOTES[DISH_NOTES.length - 1]!;
}
