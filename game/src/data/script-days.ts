/**
 * 前三十天的十二幕（批 U′，解 GAP 三轮第 ⑥ 条）。
 *
 * 开罗的 `fixevent` 五百行**行号即顺序**，前段当教程：先教你煮面，再教你摆桌，
 * 然后才放你去跟人抢生意。我们是随机事件（每七天一件事、池子按重量抽），
 * 新手前一个月看到什么全凭运气 —— 这件事在试玩报告里就露过：第三天还在问「座位要怎么加」。
 *
 * 这一批补的是**顺序**，不是数量：一个月里挑十二天，各给一句话，
 * 其中有几天顺手指一件同名的街头事（`eventId`），让那件事当天一定来。
 *
 * 三条纪律（写死在这里，改的时候先读一遍）：
 *
 * 1. **不写阿拉伯数字**。这一页是阿婆在讲，不是系统在报账。
 * 2. **不加任何数值**。十二幕只改「今天说什么、来哪件事」，不碰客流、价钱、产能。
 *    客流已经叠了五层乘数（见 P301），再叠一层就没人算得清了。
 * 3. **做完就忘**。`state.script.seen` 记已经讲过哪几幕，同一幕不会讲第二次；
 *    三十天后一幕都没有，之后是纯自由局。
 *
 * 指到的事件必须真存在（`script-days.test.ts` 会逐条核 `EVENTS_BY_ID`）。
 */

export interface ScriptAct {
  /** 落到第几天（一个月内的日号，不是绝对天数） */
  day: number;
  id: string;
  /** 一句话标题：打烊单上「功课 · 」后面那半句 */
  title: string;
  /** 阿婆的原话 */
  body: string;
  /** 顺手指的那件街头事：这一天一定来（过了门槛才来） */
  eventId?: string;
}

export const SCRIPT_ACTS: readonly ScriptAct[] = [
  {
    day: 1,
    id: "a_open",
    title: "先把锅烧热",
    body: "头一天，别急着招呼人。锅烧到冒青烟，油一泼下去才香；粉下晚了，酸笋就只会在汤里飘着。",
  },
  {
    day: 2,
    id: "a_wait",
    title: "一碗要有人等",
    body: "有人肯在门口站着等，这店才算开张。让人等不要紧，要紧的是别让他等得不明不白。",
  },
  {
    day: 3,
    id: "a_suan",
    title: "酸笋先下锅",
    body: "酸笋要挑脆的，闻着有点冲才对。冲劲一进锅就散了，剩下的才是老友味。",
    eventId: "bamboo_press",
  },
  {
    day: 5,
    id: "a_noodle",
    title: "粉的粗细",
    body: "粉粗一分，汤就少进一分。客人牙口各有各的，你得先让人挑，再想着要不要替他挑。",
  },
  {
    day: 7,
    id: "a_seat",
    title: "坐得下才算店",
    body: "站着吃是摊，坐下吃才是店。桌子小不要紧，别让人端着碗等你收。",
  },
  {
    day: 9,
    id: "a_face",
    title: "街坊会认人",
    body: "熟客进门不用开口，你就该知道他要什么。记不住的时候，先记他坐哪。",
    eventId: "regular_gift",
  },
  {
    day: 12,
    id: "a_rain",
    title: "雨天",
    body: "回南天地上滑，擦了又湿。这种日子客人少，正好把该修的都修了。",
    eventId: "damp_floor",
  },
  {
    day: 15,
    id: "a_rival",
    title: "别家也在做",
    body: "街上不止你一家。别盯着人家的价钱看，先想清楚自己那锅汤跟人家差在哪。",
    eventId: "rival_shop",
  },
  {
    day: 18,
    id: "a_cash",
    title: "钱要留着",
    body: "挣钱的手别太快。锅漏了要换，屋顶漏了要修，钱花在能再生回来的地方。",
  },
  {
    day: 21,
    id: "a_night",
    title: "夜里也有人",
    body: "夜里出来的不比白天少。灯亮一点，人就敢往巷子里多走两步。",
    eventId: "night_market",
  },
  {
    day: 25,
    id: "a_note",
    title: "记一笔",
    body: "一天做了多少碗、走了多少人、哪一碗没人动，都记下来。记不住的店，做不大。",
  },
  {
    day: 28,
    id: "a_month",
    title: "满月",
    body: "开了一个月，回头看，最难的不是煮粉，是天天早上照样把火点起来。",
  },
];

export const SCRIPT_TOTAL = SCRIPT_ACTS.length;

/** 剧本管到第几天为止（含）。之后是纯自由局。 */
export const SCRIPT_LAST_DAY = 30;

const BY_ID = new Map(SCRIPT_ACTS.map((a) => [a.id, a] as const));

export function scriptActById(id: string): ScriptAct | null {
  return BY_ID.get(id) ?? null;
}
