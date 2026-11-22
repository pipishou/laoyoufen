/**
 * 阿婆的笔记本（批次八，对着开罗 `topics` 9 条做的）。
 *
 * 开罗那 9 条是**有排版的手册**（正文里带高亮标签与换行），挂在「Ramen Lab」里，
 * 玩家想知道「湿度干什么用」时自己去翻。它不是工具提示，是一本可以读的书。
 *
 * 我们做 12 条（比它多 3 条，多出来的是老友粉自己的三件事：干捞、酸笋豆豉、猪骨筒骨）。
 *
 * 三条纪律（写在这里，因为以后加条目的人会先看这段）：
 *
 * 1. **每条 60–120 字，一句人话开头，说完就停。** 这是阿婆的口吻，不是说明书。
 * 2. **不出现游戏术语。** 写「宽粉挂汤」，不写「+5% 契合度」；写「汤要滚」，不写「汤底分数」。
 *    玩家读这本册子是为了明白事，不是为了算数。
 * 3. **解锁条件必须是玩家真做过的事**（换过粉型、汤寡过一次、亏过一个月），
 *    不是「充值解锁」。没做过的事，册子上那一条就还是空白 —— 空白本身是提示。
 *
 * AI 只做口气，不做知识（落点 17 `notebook_voice`）：条目刚解锁时，让阿婆开口说一句，
 * 册子上的字一个字都不许模型改 —— 手册要稳定、可复核。
 */

export type NoteGroup = "noodle" | "soup" | "shop";

export interface NoteGroupDef {
  id: NoteGroup;
  name: string;
}

/** 三组：讲粉、讲汤、讲店。顺序就是玩家会撞上的顺序。 */
export const NOTE_GROUPS: readonly NoteGroupDef[] = [
  { id: "noodle", name: "讲粉" },
  { id: "soup", name: "讲汤" },
  { id: "shop", name: "讲店" },
];

export interface NoteDef {
  id: string;
  group: NoteGroup;
  /** 目录上那一行字 */
  title: string;
  /** 还没遇上时，册子上留的那句话（不写数值，只写「等你遇上」） */
  cue: string;
  /** 正文 60–120 字，阿婆口吻 */
  body: string;
  /** 阿婆原话（鼠标停在这条上才看得到，比正文更土一点） */
  elder: string;
  /** 这条对着开罗 `topics` 的哪一条 */
  kairo: string;
}

export const NOTES: readonly NoteDef[] = [
  {
    id: "n_thick",
    group: "noodle",
    title: "粉的厚薄",
    cue: "等你换过一回粉",
    body: "粉有厚有薄。薄的容易熟，一烫就软，挂在汤里不顶事；厚的要多烫一会儿，烫透了才弹牙。你头一回换粉那天就该明白：粉不是越细越好，是要配你今天这锅汤。",
    elder: "粉要摊开晾，唔好焗住。",
    kairo: "Noodle Shapes / Moisture",
  },
  {
    id: "n_wide",
    group: "noodle",
    title: "宽粉与细粉",
    cue: "等三种粉你都上过手",
    body: "宽粉吃的是挂汤，汤要浓，一口下去满嘴；细粉吃的是爽口，汤要清，嗦起来才利落。圆粉在中间，客人拿不定主意的时候点它最多。三种都换过，你心里就该有数了：不是粉好不好的事，是这碗给谁吃。",
    elder: "宽有宽的吃法，细有细的吃法。",
    kairo: "Noodle Making Hints",
  },
  {
    id: "n_dry",
    group: "noodle",
    title: "干捞为什么爽滑",
    cue: "等你做过一碗干捞",
    body: "干捞不带汤，粉一出锅就得拌，慢了就坨。它的好处是浇头不被汤冲淡，酸辣都留在粉上，吃着更冲。天热的时候客人爱点它，天冷就少 —— 这一点你做过一夏天就懂了。",
    elder: "干捞要快，慢一步就粘成一团。",
    kairo: "Making Tasty Noodles",
  },
  {
    id: "n_soak",
    group: "noodle",
    title: "粉泡多久算过",
    cue: "等哪天出锅特别慢",
    body: "粉在锅里泡过头，捞起来一夹就断，汤也浑。客人不说，下次就不来了。锅小、火弱、手上还忙着别的，都会让粉多泡那半分钟。宁可少下一把，也别让它在水里等。",
    elder: "宁少勿滥，粉在水里等着就废了。",
    kairo: "Moisture",
  },
  {
    id: "s_sour",
    group: "soup",
    title: "酸笋为什么先炒",
    cue: "等你往锅里丢第一样配料",
    body: "酸笋要先用热油爆，酸味才走得开，不然一股生酸浮在汤面上，闻着冲、喝着寡。爆到边上微微发干就对了，那时候的酸是老友的酸，不是坛子里的酸。",
    elder: "酸笋不爆，汤就没魂。",
    kairo: "Ingredient XP",
  },
  {
    id: "s_douchi",
    group: "soup",
    title: "豆豉要爆到什么时候",
    cue: "等你把酸笋和豆豉一起下锅",
    body: "豆豉比酸笋娇气，油温不够不出香，过了就发苦。看它在锅里跳、闻到那股咸香冲上来，就该下汤了。酸笋先、豆豉后，两样都要在油里过一遍 —— 老友粉的底子就在这一前一后。",
    elder: "豆豉一苦，整锅都救唔返。",
    kairo: "Ingredients & Broth",
  },
  {
    id: "s_boil",
    group: "soup",
    title: "汤为什么要滚",
    cue: "等哪天汤寡了",
    body: "汤不滚，粉下进去是泡熟的，不是烫熟的，吃到嘴里分不清汤和粉。要滚，滚到汤面翻花，粉一下去就熟，汤也被粉带得稠一点。汤寡的时候别急着加料，先把火看住。",
    elder: "汤唔滚，粉就唔香。",
    kairo: "Soup Types",
  },
  {
    id: "s_bone",
    group: "soup",
    title: "猪骨与筒骨",
    cue: "等你换过一回骨头",
    body: "脊骨便宜，汤清，做日常的底子够；筒骨贵些，骨髓一滚就化，汤才奶白、才厚。天冷、客人舍得点的时候用筒骨，平常日子脊骨就撑得住。什么时候用哪种，看天、看客人，不看账本。",
    elder: "筒骨贵，落雨天才舍得。",
    kairo: "Ingredients & Broth",
  },
  {
    id: "p_cost",
    group: "shop",
    title: "一碗粉的成本在哪",
    cue: "等哪个月账上见了红",
    body: "一碗粉的钱不在粉上，在肉和油上。粉一把没几个钱，酸笋豆豉也便宜，真正吃掉本钱的是猪杂、是骨头、是那一勺油。想省钱先看这三样，别去抠粉 —— 抠粉客人第一口就吃出来了。",
    elder: "省要省在看不见的地方。",
    kairo: "Ingredient XP（汤版）",
  },
  {
    id: "p_seat",
    group: "shop",
    title: "座位与灶哪个先加",
    cue: "等哪天门口站满了人还是走掉一半",
    body: "座位不够，人站着等，等不到就走；灶不够，人坐下了也吃不上。两样是配套的，先加哪样看哪个卡着：门口排长队、碗出得快，是座位的事；坐满了却半天不上粉，是灶的事。加错一样，钱就白花了。",
    elder: "凳子加了灶唔跟，一样坐唔住人。",
    kairo: "Tasty Combos",
  },
  {
    id: "p_price",
    group: "shop",
    title: "什么时候该涨价",
    cue: "等你动过一次价签",
    body: "价签动一次，老客心里都记着。想涨，挑人多、味道稳的时候，一次涨一块，别一次跳两块；想降，先想清楚是被人比下去了，还是自己手艺退步了。降价救不了难吃的东西，只会让难吃的东西卖得多。",
    elder: "降价钱易，降返个味难。",
    kairo: "Tasty Combos",
  },
  {
    id: "p_keep",
    group: "shop",
    title: "客人为什么不再来",
    cue: "等口碑掉下去过一回",
    body: "客人不来，很少是因为贵。多半是那一次等太久、那一次汤寡了、那一次给的肉少了两片。他不跟你说，只是不再进门。口碑掉下去容易，养回来要一家一家地请 —— 所以每天收工前想一想，今天有没有让谁难过。",
    elder: "客人唔会闹你，只会唔来。",
    kairo: "Ingredient XP",
  },
];

export const NOTE_TOTAL = NOTES.length;

export const NOTE_BY_ID = new Map(NOTES.map((n) => [n.id, n] as const));

export function noteById(id: string): NoteDef | null {
  return NOTE_BY_ID.get(id) ?? null;
}

export function notesOfGroup(group: NoteGroup): readonly NoteDef[] {
  return NOTES.filter((n) => n.group === group);
}
