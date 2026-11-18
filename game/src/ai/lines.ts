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

export type LineKind = "street_request" | "rival_rumor" | "recipe_buyer" | "arena_call";

export interface LineAsk {
  kind: LineKind;
  /** 稳定键：街面 id / 同行 id / 粉名 / 场地 id —— 只用名词，不用数字 */
  key: string;
  /** 给模型的上下文，只放名词；服务端还有一份白名单 */
  context: Record<string, string>;
  month: number;
  day: number;
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
  const pool = LOCAL[ask.kind];
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
          context: ask.context,
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
      // 红线：含任何阿拉伯数字的句子整句作废（服务端也拦，这里双保险）
      if (body.length === 0 || /\d/.test(body)) return null;
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
