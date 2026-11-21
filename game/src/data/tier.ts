/**
 * 四维九档：把「一碗粉好不好」拆成客人真会说的四件事。
 *
 * 为什么不是开罗的 味/香/量/气：那四个是**拉面**的感知维（香是豚骨，
 * 量是面量，气是碗的热气）。南宁人评价一碗老友粉只说四句——
 * 「够不够味」「镬气有没有」「够不够饱」「好不好看」。名字换掉不是翻译，
 * 是因为维度本身不同：老友粉的香是**镬气**（爆炒出来的锅边香），
 * 不是汤头蒸出来的香。
 *
 * 为什么不直接用现有分数：`score.ts` 的三个数（soup / noodle / charm）
 * 是**原料维**——汤好不好、粉好不好、料多不多。原料维玩家看着会算账，
 * 但看不出「差在哪」。九档是把原料维换算成客人能说出口的判断，
 * 是**读法**，不是新分数：`score.ts` 一个数都不改。
 *
 * 三条纪律：
 *   ① 四维各九档，档位由 0–100 的分数落桶，桶边界不平均（中间宽两头窄）；
 *   ② 九档只用来「说」，不用来「算」——任何加成都不许乘在档位上；
 *   ③ 评语里不许出现数字，玩家听到的是话，不是分数。
 */

export type DimId = "taste" | "wok" | "fill" | "look";

/** 四维固定顺序：味 → 镬 → 饱 → 相（评价一碗粉的自然语序） */
export const DIM_ORDER: readonly DimId[] = ["taste", "wok", "fill", "look"];

export interface DimDef {
  id: DimId;
  name: string;
  /** 一句话说明这一维看什么（图鉴图例用） */
  what: string;
  /** 这一维在哪个分数上落（文档用，不参与计算） */
  from: string;
}

export const DIMS: readonly DimDef[] = [
  { id: "taste", name: "味", what: "够不够味：酸、辣、咸、鲜压不压得住粉味", from: "汤分（含味道层与配料组合）" },
  { id: "wok", name: "镬", what: "镬气有没有：爆炒出来的锅边香，粉身挂不挂汤", from: "粉分（含粉型契合度）" },
  { id: "fill", name: "饱", what: "够不够饱：份量、主料、配料加起来压不压得住饿", from: "份量 + 主料 + 配料件数" },
  { id: "look", name: "相", what: "好不好看：碗里分不分得清主次，端上桌有没有样子", from: "魅力分（含配料组合）" },
];

export const DIM_BY_ID: ReadonlyMap<DimId, DimDef> = new Map(DIMS.map((d) => [d.id, d]));

export function dimById(id: string): DimDef | undefined {
  return DIM_BY_ID.get(id as DimId);
}

/**
 * 八条桶边界（0–100 上切九段）。
 *
 * 不平均，是因为客人对「刚好」不敏感、对「差一点」和「太过」敏感：
 * 中间五段各十几分宽，两头各只有十五分——
 * 也就是说，从「家常」升到「稳」要跨过十几分，从「寡淡」掉到「没味」只要几分。
 * 这是 `eat_comment` 4×9 的结构（九档评语），我们只借结构，边界自己推。
 */
export const TIER_CUTS: readonly number[] = [15, 28, 40, 52, 64, 76, 86, 95];

export const TIER_TOTAL = 9;

/** 0–100 → 第 1…9 档 */
export function tierOf(value: number): number {
  const v = Number.isFinite(value) ? value : 0;
  let tier = 1;
  for (const cut of TIER_CUTS) {
    if (v >= cut) tier += 1;
  }
  return tier;
}

/** 第 1…9 档 → 一段 0–100 的区间文字（图例用，不是分数） */
export function tierRange(tier: number): string {
  const t = Math.min(TIER_TOTAL, Math.max(1, Math.round(tier)));
  const low = t === 1 ? 0 : TIER_CUTS[t - 2]!;
  const high = t === TIER_TOTAL ? 100 : TIER_CUTS[t - 1]!;
  return `${low}–${high}`;
}

/**
 * 每维九档的评语（四维 × 九档 = 三十六句）。
 *
 * 写法上刻意让四维的用词不重叠：
 *   味用「酸、辣、咸、压不住」；镬用「火、锅、烟、粉身」；
 *   饱用「几口、垫肚子、晚饭」；相用「端、摆、拍、探头」。
 * 同一档四个维度的句子换着看，不该有两句像同一句。
 */
export const TIER_WORDS: Readonly<Record<DimId, readonly string[]>> = {
  taste: [
    "没什么味，像白水泡粉。",
    "淡，酸笋和豆豉都没出来。",
    "有一点意思了，还压不住粉味。",
    "家常味道，说不上好也不差。",
    "味道正，街坊天天吃那种。",
    "酸辣都够，汤也跟得上。",
    "这口够味，嗦完还想喝两口汤。",
    "老南宁的味道，酸笋的香压得稳。",
    "味道是定住了，谁来都挑不出错。",
  ],
  wok: [
    "没镬气，闻着像焖出来的。",
    "火不够，粉身软塌塌。",
    "有点锅边香，可惜没进去。",
    "普普通通，热是热的。",
    "镬气有了，粉挂得住汤。",
    "锅够热，粉身爽口。",
    "一开锅那股香就冲上来了。",
    "镬气足，粉身弹，凉了也不坨。",
    "这一锅的火候，是要拿命换的。",
  ],
  fill: [
    "三口就没了，当零食吃。",
    "少，后生仔吃完还要加个包。",
    "勉强半饱，做力气活的嫌不够。",
    "二两的分量，垫垫肚子。",
    "吃得饱，刚刚好。",
    "分量实在，不用再点别的。",
    "一大碗下去，晚饭都能省。",
    "实在，肉给得也足。",
    "这一碗端上来，客人先笑。",
  ],
  look: [
    "端上来像剩的，没个样子。",
    "乱，配料压成一团。",
    "摆得潦草，看得出生手。",
    "平常卖相，端得出手。",
    "清清爽爽，一眼看出是酸笋豆豉。",
    "有红有绿，端上桌有面子。",
    "碗里分得清主次，卖相好。",
    "拿手机先拍一张那种。",
    "这一碗端出去，隔壁都要探头。",
  ],
};

/** 某维某档的评语；档位越界夹回 1–9，坏维度返回空串 */
export function tierWords(dim: string, tier: number): string {
  const def = dimById(dim);
  if (!def) return "";
  const words = TIER_WORDS[def.id];
  const t = Math.min(TIER_TOTAL, Math.max(1, Math.round(tier)));
  return words[t - 1] ?? "";
}

/** 档位的短说法（「第五档」这种写进 tooltip 的），不带阿拉伯数字 */
const TIER_CN = ["一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

export function tierWord(tier: number): string {
  const t = Math.min(TIER_TOTAL, Math.max(1, Math.round(tier)));
  return `第${TIER_CN[t - 1]}档`;
}
