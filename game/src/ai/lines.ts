/**
 * AI 文案通道（通用版）：四个落点共用一套「先本地、再异步换」的规矩。
 *
 * 四个落点，按风险从低到高接：
 *   1. street_request  街坊来提的事（纯展示，玩家看不看都不影响机制）
 *   2. rival_rumor     同条街的传闻（纯展示，月结后一句）
 *   3. recipe_buyer    转手时收配方那人说的话（有交互时点，异步补一句）
 *   4. arena_call      落场里的一声喊（时序最紧，只预取、绝不在局内等网络）
 *
 * 四条铁律（与 server/app.py 一致，两边都查一遍）：
 *   - 只出文字：正文里出现阿拉伯数字 → 整句丢弃，回落本地；
 *   - 每句都有本地备选：`localLine()` 是确定性的（哈希，不碰 state.rng）；
 *   - 缓存键 `kind:key:month:day`：同一天同一件事只请求一次；
 *   - 不碰机制名与数值：context 只放名词（街名、同行名、粉名、场地名）。
 *
 * 没有配 `VITE_AI_PROXY_URL` 时整条通道是关的，游戏离线可完整通关。
 */

export type LineKind =
  | "street_request"
  | "rival_rumor"
  | "recipe_buyer"
  | "arena_call"
  | "hook_voice"
  | "trophy_voice"
  | "tourney_open"
  | "flavor_voice"
  | "style_voice"
  | "bowl_voice"
  | "guest_voice"
  | "guest_talk"
  | "tier_voice"
  | "market_voice"
  | "retail_voice"
  | "grade_voice"
  | "notebook_voice"
  | "district_voice"
  | "loss_explain"
  | "menu_advice"
  | "appetite_voice";

export interface LineAsk {
  kind: LineKind;
  /** 稳定键：街面 id / 同行 id / 粉名 / 场地 id —— 只用名词，不用数字 */
  key: string;
  /** 给模型的上下文，只放名词；服务端还有一份白名单 */
  context: Record<string, string>;
  month: number;
  day: number;
}

/**
 * 打烊单副行按「明天该干什么」分池（试玩二轮 F5）。
 *
 * 原来六个档位共用一个六句池，于是出现「主句说加灶、副行说街上的事」——
 * 副行是在给主句解释理由，说的不是同一件事就成了噪音。
 * 现在每档各说各的，句子本身仍然不许出现任何数量（数字归本地规则）。
 */
const HOOK_VOICE: Record<string, readonly string[]> = {
  /** 0. 加灶、扩座（旧键，兜底用） */
  capacity: [
    "灶台不趁手，再好的手也伸不开。",
    "人多起来是好事，接不住就成了坏事。",
    "客人站在门口等，等久了就不来了。",
    "锅烧不热，粉就出得慢；出得慢，人就走了。",
    "先把能接的接住，再想别的。",
  ],
  /**
   * 0a. 卡在灶上 —— 主句说「猛火灶」时只能接这一档。
   * 试玩 11-20 第 ②：主句指灶、副行却说「桌椅不够」，玩家不知道跟哪句。
   */
  "capacity:stove": [
    "火不旺，手再快也是白站。",
    "火眼通利了，粉才出得快。",
    "锅底那点火，最耽误人。",
    "灶是店的心口，心口不畅，什么都慢。",
  ],
  /** 0b. 卡在座位 */
  "capacity:seat": [
    "桌子不够，人来了也留不住。",
    "先让人坐下，再谈卖多少。",
    "门口站着的人，看着就心疼。",
  ],
  /** 0c. 卡在备料总闸 */
  "capacity:cap": [
    "备料跟不上，卖到一半就得收摊。",
    "案台上摆得开，锅里才跟得上。",
  ],
  /**
   * 0d. 卡在价牌 —— 主句说「把某款降到 ¥N」时只能接这一档。
   * 试玩 11-21：三家连买三档猛火灶，流失一动不动，因为走掉的人多是看价牌走的。
   * 这一档不劝人省钱，只劝人「别把门槛立在街坊的钱包之上」。
   */
  price: [
    "街坊掏钱的时候，手是要停一下的。",
    "价钱压在人家心口上，味道再好也白搭。",
    "少赚一块，多留一个人，这笔账划得来。",
    "门口那价牌，写的是你这家店认不认得这条街。",
  ],
  /** 1. 评段位 */
  grade: [
    "门口的牌子亮一点，路过的人才认得出你。",
    "干了这么久，该让人知道你叫什么。",
    "评上去不是为了好看，是为了让人敢进门。",
    "招牌是给别人看的，手艺是给自己留的。",
  ],
  /** 2. 家当 */
  gear: [
    "工具趁手，收工的时候腰杆子少受点罪。",
    "旧的用惯了，可该换还得换。",
    "小店的家当，样样都得趁手。",
    "别人看不出你换了什么，你自己知道顺手了。",
    "花钱添东西，图的是每天少费点劲。",
  ],
  /** 3. 街面 */
  street: [
    "这条街好起来，你的生意才会好。",
    "街坊天天走这条路，路顺了他们才愿意停。",
    "修的是街，收的是人心。",
    "别人都在添置，你不添就显得旧了。",
    "巷口亮堂了，晚上回来的人也多了。",
    "街面上的事，做成一桩就算一桩。",
  ],
  /** 4. 落场 */
  arena: [
    "上场就别想输，手上有东西才有底气。",
    "赢一场，街坊记你一整年。",
    "落场讲的是当下那口气。",
  ],
  /** 5. 什么也不缺 */
  none: ["日子还长，慢慢做。", "明天再说也不迟。"],
};

/** 选池：`类型` 由 sim/hook.ts 的 hookVoiceContext 放进 context */
function hookPool(ask: LineAsk): readonly string[] {
  const kind = ask.context["类型"];
  return (kind ? HOOK_VOICE[kind] : undefined) ?? HOOK_VOICE.capacity!;
}

/** 选池：`key` 写成 `维度:档位`，只用维度那一段（taste / wok / fill / look） */
function tierPool(ask: LineAsk): readonly string[] {
  const dim = ask.key.split(":")[0] ?? "";
  return TIER_VOICE_POOL[dim] ?? TIER_VOICE_POOL.taste!;
}

/** 发请求前剔掉只供本地选池的字段 */
function stripKind(ctx: Record<string, string>): Record<string, string> {
  const { 类型: _omit, ...rest } = ctx;
  return rest;
}

/**
 * 四维各自的本地句（批次一）。维度 id 与 data/tier.ts 的 `DimId` 对齐：
 * 味 taste / 镬 wok / 饱 fill / 相 look。key 写成 `维度:档位`，这里只取维度那一段。
 */
const TIER_VOICE_POOL: Record<string, readonly string[]> = {
  taste: [
    "汤头这个事情做不得假，喝一口就晓得。",
    "这个味有心思，不是随便下盐的。",
    "味道稳当，跟上次来一个样。",
    "酸辣是够的，就是汤底还差一点厚。",
  ],
  wok: [
    "有镬气，一闻就晓得是猛火里翻出来的。",
    "火候过得去，粉条没糊，也没有生味。",
    "这碗粉是热的，热气从底下往上冒。",
    "炒得急了点，酸笋的香还没出来。",
  ],
  fill: [
    "量给得实在，这碗下去顶得到晚饭。",
    "吃完这碗，肚子是踏实的。",
    "料铺得满，一眼看下去不像偷工减料。",
    "汤水多了些，捞两筷子就剩粉了。",
  ],
  look: [
    "端上来就好看，隔壁桌都探头过来看。",
    "碗里配色干净，青菜绿得精神。",
    "这一碗摆在桌上，拍照都好看。",
    "卖相上还差点，料都堆一边去了。",
  ],
};

const LOCAL: Record<LineKind, readonly string[]> = {
  street_request: [
    "这条巷子一到晚上就黑，娃娃放学走这儿我不放心。",
    "落雨天买个菜要淋一路，搭个棚就方便多了。",
    "老人家走累了没处坐，路边摆两张凳也好。",
    "街口那块地方空着可惜，做点什么街坊都受益。",
    "后生仔晚上回来摸黑，有盏灯总是好的。",
    "这条街热闹是热闹，就是连个坐的地方都冇。",
  ],
  rival_rumor: [
    "隔壁那家最近换了新汤底，队伍排到巷口去了。",
    "听说他们家的猪杂是清早从五里亭拿回来的。",
    "老板脾气是大，可人家那碗粉是真的香。",
    "他们家最近涨了价，老街坊嘴上不说，心里记账。",
    "那家铺子下午就收摊，说是料卖完了。",
    "有人说他们请了个老师傅，手脚快得很。",
  ],
  recipe_buyer: [
    "这方子我拿回去改改，兴许能在我那摊上用。",
    "你这配比有意思，我记下了。",
    "做得细，难怪街坊认你这一口。",
    "酸笋下得准，这个火候不好学。",
    "我出这个价，是买你这几年的弯路。",
  ],
  arena_call: [
    "锅气起来了！",
    "这一勺下去，评委抬头了。",
    "稳住，火还在，别急。",
    "香气压过去了，趁势再来一记。",
    "手别停，节奏在你这边。",
  ],
  /**
   * 打烊单副行的兜底池（默认取「加灶扩座」那一档）。
   * 真正的选池在 `hookPool()`：按 `context.类型` 走 HOOK_VOICE 里对应那档。
   */
  hook_voice: HOOK_VOICE.capacity!,
  /**
   * 成就达成时街坊补的那一句（B 批）。
   * 上面那行「成就 · 名字（奖励）」是本地算的，这句只负责像人说话。
   * 所以同样不许出现数量与机制词 —— 模型很容易写成「你终于卖出一千碗了」。
   */
  /**
   * 第一次凑成某条成型吃法（B1 味道层）。说的是「这一口对了」，
   * 不是数值 —— 几味、加多少分全由本地面板说，这里只给人声。
   */
  flavor_voice: [
    "这个味道对了，就是这个味道。",
    "我阿婆以前也是这么煮的。",
    "闻着就晓得你今天下了功夫。",
    "以后我就认这一口了。",
    "街上那么多家，就你家有这个味。",
    "天冷的时候来这一口，整个人都活过来。",
  ],
  trophy_voice: [
    "这条街的人都看在眼里。",
    "做买卖做到这份上，不容易。",
    "以后路过的人，会先想起你这家。",
    "你忙你的，我们都替你高兴。",
    "老友粉这东西，讲究的就是个实在。",
    "慢慢来，日子还长。",
  ],
  /**
   * 8. style_voice    换上新门面时，街坊顺口一句（A1 店的样子）
   *
   * 换店面在别处是纯数值与贴图，我们让它带一句人声：骑楼、排档、糖水铺、
   * 夜市摊、老铺、新城小店，街坊的口气各自不同。只出文字，不提价钱
   * （花钱的事本地 toast 已经说了）。
   */
  style_voice: [
    "喔，你这个门面换得不错，一眼就认得出。",
    "讲过几多次，收拾干净自然有人来。",
    "坐喺你呢度，比企喺街边食舒服多了。",
    "有点旧时候嗰种味道，我中意。",
    "门口一通风，整条巷子都凉快。",
    "新是新，就唔好贵到街坊食唔起。",
  ],
  /**
   * 9. bowl_voice     换上新碗时，端着这只碗的客人说一句（A4 碗）
   *
   * 碗在别处是纯加成道具，我们让它带一句人声 —— 不锈钢碗、搪瓷碗、大盆、
   * 瓦煲、打包碗，客人真正说出口的话也不一样。只出文字：不提加成的百分数，
   * 也不提价钱（那些本地面板已经写清楚了）。
   */
  /**
   * 顾客等级（A8）：识食的那位当场挑刺，说的就是这一句。
   * 三句各对应一种毛病，都不带数量 —— 数字归本地规则。
   */
  /**
   * 客人长对白（A12）：点开他听到的那一句。比 guest_voice 长，像街坊聊天。
   */
  guest_talk: [
    "我唔系赶时间，就是行过闻到味，脚就停低咗。",
    "呢条街变化好大，就你家锅气仲系老样子。",
    "做粉辛苦啊，天未光就要起身备料。",
    "我细个嗰阵，阿爸带我来食粉，就系呢个味。",
  ],
  guest_voice: [
    "汤头薄了点，今天是不是赶时间了？",
    "酸笋下少了，老友味出唔来。",
    "粉煮过气了，一夹就断。",
    "火候差一口气，闻着香，吃着寡。",
    "唔系话你，不过这碗同上次差远了。",
    "街坊生意我撑你，但你要自己食一碗试试。",
  ],
  bowl_voice: [
    "这种碗看着就干净，食得放心。",
    "碗够大，汤才装得下，嗦得过瘾。",
    "搪瓷碗啊，我细个嗰阵都系用呢种。",
    "瓦煲好，端到手上还滚着，慢慢食都唔怕凉。",
    "打包走，赶时间也能食一口热的。",
    "碗边冇缺口，看着就舒服。",
  ],
  /**
   * 5. tourney_open    具名赛事开场，主持人在话筒里说的那句话（C 批，见 data/tourneys.ts）
   *
   * 开罗 `rally.txt` 的每场赛事只换名字与门槛，开场白是空的；我们把它交给 AI：
   * 主办方是街道办还是非遗中心，说话的口气完全不同 —— 这正是本土化最容易立住的地方。
   * 同样只出文字：不许报门槛、奖金、名次（规则在本地算，见 data/contest.ts 的 CONTEST_TIERS）。
   */
  tourney_open: [
    "各组准备，先看汤，再看粉。",
    "今天来的人多，灶别慌，手别抖。",
    "评委都在后面站着，按平时的来就行。",
    "街坊都看着呢，把这碗粉做好。",
    "别紧张，你就是来露一手的。",
    "时间到就收，做慢了也算输。",
  ],
  /**
   * 13. tier_voice    客人对「这一碗」的一句评价（批次一 · 四维九档）
   *
   * 开罗 `eat_comment.txt` 是 4 维 × 9 档的固定评语表，玩家读到的是同一套句子。
   * 我们把它交给 AI 说一遍，但**只在高档或低档才开口**（见 sim/tier.ts 的 tierRemark）——
   * 中间几档是家常，客人不会特意评价。这里的池子按维度分，让本地兜底也贴合维度。
   * 照例不许出现数字：档位是本地算的，句子只说感受。
   */
  tier_voice: TIER_VOICE_POOL.taste!,
  /**
   * 14. market_voice   今天街上的事（批次三 · 南宁行情）
   *
   * 开罗 `economy` 表里有二十多条「今天全场材料费 +」「今天客流 −」的限时条件，
   * 落到界面上只有一枚小图标。我们让它由街坊说一句 —— 说的是天气与街上，
   * **不许报数字**（乘数是本地算的，报出来就变成算账）。
   */
  market_voice: [
    "这鬼天气，出门一趟鞋就废了。",
    "今天街上没什么人，倒是清静。",
    "这种天，还是你这里坐得住。",
    "街上人挤人，我绕了两条巷才过来。",
  ],
  /**
   * 又看得见一圈（批次九）。
   *
   * 开罗 `hidearea` 揭开一格什么都不说；我们让街坊提一句 ——
   * 但这句**不报段位数字**，说的是「城还有多大」。
   */
  district_voice: [
    "听说北边山里也开得下去，就是要熬得住冷清。",
    "我外家就在那边，赶圩那天人多得挤不过去。",
    "你这门牌要是挂到那边去，得先认认路。",
    "城心那些写字楼，中午排队排到马路上。",
  ],
  notebook_voice: [
    "嗱，粉厚了就要多烫一阵，唔好急。",
    "汤要滚，滚到翻花，粉落去先熟得透。",
    "酸笋先落，豆豉后落，两样都要过油。",
    "钱要省在客人看不见的地方，唔好省在碗里。",
  ],
  retail_voice: [
    "你那个汤包，我带到深圳给同事试了，他们问哪里买的。",
    "上回买的两包酸笋，我妈拿来煮鱼，说比菜市的香。",
    "寄外省的东西，包装得再结实点，路上颠得厉害。",
    "我在网上看到有人拍你家的粉，评论里一堆人问地址。",
  ],
  /**
   * 15. grade_voice   评委收笔时抬头说的那句（批次四 · 段位评定）
   *
   * 开罗 `grade_review` 十一级只有费用与门槛，评语只在牌子上写一行死字。
   * 我们让评委当场开口：说的是这一碗做到什么份上，**不许提费用、段位数字与比赛**。
   */
  grade_voice: [
    "这口汤有底子，不是靠调料堆出来的。",
    "你这个火候，再练两年就更稳了。",
    "牌子上我写的是实话，你自己心里也清楚。",
    "手艺到了这一步，剩下的是守不守得住。",
  ],
  /**
   * 19. loss_explain  打烊单上「今天这批人为什么走」下面那句口气（批 C′）
   *
   * 数字在本地那行（「今天有 N 位是…」），这里只说一句人话。
   * 三档各说各的：门口挤 / 价签挡 / 等不及，**不许劝玩家该怎么干**。
   */
  loss_explain: [
    "门口那条队，排到别人家门口去了。",
    "有人掀了价牌看了一下，转身就走。",
    "等的人脚尖一直在点地，你没看见。",
    "锅里的水滚得再急，也追不上人的耐性。",
  ],
  /**
   * 20. menu_advice  打烊单上「菜单上的一句话」下面那句口气（批 C′）
   *
   * 说的是「哪款有人点、哪款没人动」，不报碗数、不给经营建议。
   */
  menu_advice: [
    "客人进门先看的还是那碗老的。",
    "新添的那款，摆了一天没人问。",
    "菜单越写越长，人反倒不晓得点什么。",
    "有一款突然就有人认了，说不上为什么。",
  ],
  /**
   * 21. appetite_voice  这一片吃腻了时街坊说的一句（批 C′，解 P247）
   *
   * 胃口这件事原来只在数值里（加购与份量），界面上一个字都没有。
   */
  appetite_voice: [
    "最近不太吃得下大碗了，来一碗小的就好。",
    "天天吃也不腻，就是吃不了那么多了。",
    "这条街的粉我都吃遍了，嘴有点刁。",
    "份量给少一点也没事，我主要是来喝口汤。",
  ],
};

/** FNV-1a，和事件导演那边同一套，保证同键同句 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function lineId(ask: LineAsk): string {
  return `${ask.kind}:${ask.key}:${ask.month}:${ask.day}`;
}

/** 本地兜底句：确定性，不消耗 state.rng，所以「同种子同文案」 */
export function localLine(ask: LineAsk): string {
  const pool =
    ask.kind === "hook_voice"
      ? hookPool(ask)
      : ask.kind === "tier_voice"
        ? tierPool(ask)
        : LOCAL[ask.kind];
  return pool[hash(lineId(ask)) % pool.length] ?? pool[0]!;
}

/* ────────────────────────── 会话内缓存 ────────────────────────── */

const CACHE = new Map<string, string>();
const INFLIGHT = new Map<string, Promise<string | null>>();

/**
 * 一局里最多换 **200 个不同的键**（批 C′，解 R6）。
 *
 * 二次评估里把预算算错过一次：`fetchLine` 有 49 个调用点，但键全是名词
 * （`${dim}:${tier}`、`ring${ring}`、货名、街面 id），同键命中缓存就永不重复，
 * 所以真正的成本上限是**键空间**，实测约 170。留 200 的余量。
 *
 * 超了不是报错，是**静默改走本地句** —— 玩家不该因为预算用完而看见界面变样。
 */
export const LINE_BUDGET = 200;

/** 已换到的在线句；没换到就用调用处给的本地句 */
export function getLine(ask: LineAsk, fallback: string): string {
  return CACHE.get(lineId(ask)) ?? fallback;
}

/** 调试/测试用：清空会话缓存 */
export function resetLines(): void {
  CACHE.clear();
  INFLIGHT.clear();
}

/** 调试/测试用：看这一局到底有几条是线上来的 */
export function remoteLineCount(): number {
  return CACHE.size;
}

/** 还剩几个键的预算（界面不显示，只给测试与探针看） */
export function lineBudgetLeft(): number {
  return Math.max(0, LINE_BUDGET - CACHE.size);
}

/**
 * 运行期覆盖代理地址（传空串＝强制关掉在线文案）。
 * 给测试与本地联调用：不用重新打包就能验证「拿不到就回落」。
 */
let proxyOverride: string | null = null;
export function setProxyUrl(url: string | null): void {
  proxyOverride = url;
}

function proxyUrl(): string | undefined {
  if (proxyOverride !== null) return proxyOverride || undefined;
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  // 一句话通道走 /line；没单独配就把事件那条 /event 的尾巴换成 /line
  const line = env?.VITE_AI_LINE_URL;
  if (line) return line;
  const evt = env?.VITE_AI_PROXY_URL;
  if (!evt) return undefined;
  return evt.replace(/\/event\/?$/, "/line");
}

/**
 * 红线两条：阿拉伯数字，和「三十五位」「两百块」这类**中文数量词**。
 *
 * 中文数字单独出现是正常的（「一口锅」「两口子」），只有后面跟量词才算数。
 * 宁可偶尔误杀（回落本地句），也不让模型把玩家不该看见的数字带进界面 ——
 * 数字归本地规则，语声归 AI，这条界线不能松。
 */
const CN_QUANTITY =
  /[一二三四五六七八九十百千万两][十百千万]?(?:几|多|余|来)?\s*(位|碗|元|块|天|人|件|张|个|家|份|次|名|斤)/;

/** 这句能不能上屏：空串、阿拉伯数字、中文数量词一律不行 */
export function isCleanLine(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (/\d/.test(t)) return false;
  if (CN_QUANTITY.test(t)) return false;
  return true;
}

/**
 * 取一条在线文案。任何异常、超时（800ms）、含数字、结构不对 → null，
 * 调用方继续用本地句，界面上不留痕迹。
 */
export async function fetchLine(ask: LineAsk, timeoutMs = 800): Promise<string | null> {
  const id = lineId(ask);
  const hit = CACHE.get(id);
  if (hit) return hit;
  // 预算用完了就到此为止：后面的键一律本地句，不记日志、不报错
  if (CACHE.size >= LINE_BUDGET) return null;
  const url = proxyUrl();
  if (!url) return null;
  const running = INFLIGHT.get(id);
  if (running) return running;

  const job = (async (): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: ask.kind,
          key: ask.key,
          // `类型` 只给本地选池用，别递给模型（见下方 HOOK_VOICE）
          context: ask.kind === "hook_voice" ? stripKind(ask.context) : ask.context,
          month: ask.month,
          day: ask.day,
          forbidNumbers: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { body?: unknown };
      if (typeof data.body !== "string") return null;
      const body = data.body.trim();
      // 红线：含数字（阿拉伯或中文数量词）的句子整句作废（服务端也拦，这里双保险）
      if (!isCleanLine(body)) return null;
      const line = body.slice(0, 160);
      CACHE.set(id, line);
      return line;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      INFLIGHT.delete(id);
    }
  })();

  INFLIGHT.set(id, job);
  return job;
}
