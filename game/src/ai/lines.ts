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
  | "tourney_open";

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
  /** 0. 加灶、扩座 */
  capacity: [
    "灶台不趁手，再好的手也伸不开。",
    "人多起来是好事，接不住就成了坏事。",
    "客人站在门口等，等久了就不来了。",
    "锅烧不热，粉就出得慢；出得慢，人就走了。",
    "桌椅不够，生意越好越亏心。",
    "先把能接的接住，再想别的。",
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

/** 发请求前剔掉只供本地选池的字段 */
function stripKind(ctx: Record<string, string>): Record<string, string> {
  const { 类型: _omit, ...rest } = ctx;
  return rest;
}

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
  trophy_voice: [
    "这条街的人都看在眼里。",
    "做买卖做到这份上，不容易。",
    "以后路过的人，会先想起你这家。",
    "你忙你的，我们都替你高兴。",
    "老友粉这东西，讲究的就是个实在。",
    "慢慢来，日子还长。",
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
  const pool = ask.kind === "hook_voice" ? hookPool(ask) : LOCAL[ask.kind];
  return pool[hash(lineId(ask)) % pool.length] ?? pool[0]!;
}

/* ────────────────────────── 会话内缓存 ────────────────────────── */

const CACHE = new Map<string, string>();
const INFLIGHT = new Map<string, Promise<string | null>>();

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
