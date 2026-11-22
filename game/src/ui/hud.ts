import type { EventNarrative } from "../ai/director";
import { ARCHETYPE_BY_ID } from "../data/customers";
import { EVENTS_BY_ID } from "../data/events";
import { TOPPINGS } from "../data/ingredients";
import { LIKES_TOTAL } from "../sim/collection";
import { clockOf, minutesLeft, SHOP_CLOSE_LABEL, SHOP_OPEN_LABEL } from "../sim/shop-hours";
import { queueMaxOf } from "../sim/unlocks";
import { favorOf } from "../sim/favor";
import { hookVoiceContext, nextHook } from "../sim/hook";
import { tierBudgetPct } from "../sim/guest-tier";
import { tierById } from "../data/guest-tier";
import { checkGrade } from "../sim/grade";
import { talkFor, talkVoiceContext } from "../sim/talk";
import { tierBoard, tierCells } from "../sim/tier";
import { lossWhyOf, menuLineOf } from "../sim/advice";
import { fetchLine, getLine, localLine } from "../ai/lines";
import { priceTolerance, SERVE_MINUTES } from "../sim/customer";
import { favoriteArchetypes } from "../sim/regulars";
import type { DayRecord, GameState } from "../sim/state";
import { nextTrophies } from "../sim/trophies";
import { demandCapOf } from "../sim/district";
import { frenzyActive, frenzyLeftMinutes } from "../sim/frenzy";
import { isContestMonth, monthsToContest } from "../sim/calendar";

/** 成就进度显示：上万用「1.2万」，避免长串数字把成就条挤爆 */
function fmtProgress(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}万`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}千`;
  return String(Math.round(n));
}
import type { RecipeScore } from "../sim/score";
import { bowlMinutes, serveMultiplier } from "../sim/staff";
import { equipServeMultiplier, slowestStation, stageMinutes } from "../sim/equipment";
import { STATION_NAMES } from "../data/equipment";
import { marketOf, marketWords } from "../sim/market";
import { levelOf, nextStep, toppingXpOf, xpWords } from "../sim/topping-xp";
import { icon } from "./icons";

/**
 * 老友粉工序：炒料（煸酸笋、爆蒜米豆豉辣椒酱）与煮粉同步起锅，
 * 中途合煮（下高汤、放米粉），最后盛装。依据 DB4501/T 0046—2024。
 */
const COOK_STAGES = ["炒料", "煮粉", "合煮", "出餐"] as const;

const TREND_ROWS = [
  { key: "sourBamboo", label: "酸笋", hint: "越热，爱吃酸的客人来得越勤" },
  { key: "douchi", label: "豆豉", hint: "越热，偏好咸香的客人来得越勤" },
  { key: "porkOffal", label: "猪杂", hint: "越热，要浓汤重口的客人来得越勤" },
  { key: "broth", label: "老友汤", hint: "越热，认汤底的客人来得越勤" },
] as const;

const MENU_ITEMS = [
  { label: "配方", icon: "bowl", tab: "recipe" },
  { label: "员工", icon: "staff", tab: "staff" },
  { label: "店铺", icon: "shop", tab: "shop" },
  { label: "比赛", icon: "cup", tab: "contest" },
  { label: "图鉴", icon: "book", tab: "collection" },
  { label: "账本", icon: "crate", tab: "ledger" },
] as const;

const SPEEDS = [1, 4, 8, 16] as const;

function formatMoney(n: number): string {
  return `¥${Math.round(n).toLocaleString("zh-CN")}`;
}

function stars(reputation: number): string {
  const full = Math.max(0, Math.min(5, Math.round(reputation)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function pct(v: number): string {
  return `${Math.round(v)}%`;
}

export interface HudOptions {
  /** 点配料条上的芯片时回调，由 main 负责改 state 并重算分数 */
  onToggleTopping?: (id: string) => void;
  /** 底部菜单打开面板 */
  onOpenTab?: (tab: string) => void;
  /** 倍速 */
  onSpeed?: (speed: number) => void;
  /** 当前倍速 */
  getSpeed?: () => number;
  /** 事件弹窗里选了第几个选项 */
  onEventChoice?: (index: number) => void;
  /** 点顶栏音乐按钮 */
  onToggleAudio?: () => void;
  /** 当前是否静音 */
  getAudioMuted?: () => boolean;
  /** 顶栏「开门营业」：把 phase 从 prep 推到 open */
  onOpenShop?: () => void;
  /** 日结单「明天继续」：清掉日结、进次日准备 */
  onNextDay?: () => void;
}

export interface Hud {
  render(state: GameState, score: RecipeScore): void;
  /** 只有 key 仍是当前事件时才覆盖文案，避免异步晚到写错弹窗 */
  setEventNarrative(key: string, narrative: EventNarrative): void;
  /** 屏幕下方飘一条结果文案；kind=like 用开罗式「新发现」高亮 */
  showToast(text: string, kind?: "info" | "like"): void;
}

function trendClass(v: number): string {
  if (v >= 60) return "hot";
  if (v >= 40) return "warm";
  return "";
}

/** HUD 是 DOM 覆盖层，Canvas 里不画字（规范 §6）。模板只建一次，之后按 state 打补丁。 */
export function mountHud(root: HTMLElement, opts: HudOptions = {}): Hud {
  const trendRows = TREND_ROWS.map(
    (r, i) =>
      `<div class="row" title="${r.hint}"><span class="nm">${r.label}</span><span class="track"><i data-trend="${i}"></i></span><span class="pct" data-trendpct="${i}">0%</span></div>`,
  ).join("");

  const menuBtns = MENU_ITEMS.map(
    (m) =>
      `<button type="button" class="btn" data-tab="${m.tab}">` +
      `${icon(m.icon)}${m.label}</button>`,
  ).join("");

  const speedBtns = SPEEDS.map(
    (s) => `<button type="button" class="spd" data-speed="${s}">×${s}</button>`,
  ).join("");

  const chips = TOPPINGS.map(
    (t) =>
      `<button type="button" class="chip" data-top="${t.id}" title="${t.tags.join("/")} · ¥${t.cost}">${t.name}<b class="xl" data-xp="${t.id}"></b></button>`,
  ).join("");

  root.innerHTML = `
  <div id="topbar">
    <div class="logo" data-shopname>老友粉店</div>
    <div class="date">第 <b data-year>1</b> 年 · <b data-month>1</b> 月 · <b data-day>1</b> 日<span class="clock" data-clock>06:00</span></div>
    <div class="stat"><span class="k">现金</span><span class="v" data-cash>¥0</span></div>
    <div class="stat"><span class="k">评价</span><span class="stars" data-stars>☆☆☆☆☆</span><span class="v" data-rep>0.0</span></div>
    <div class="stat"><span class="k">今日客流</span><span class="v" data-today>0</span><span class="k" data-cap>/40</span><span class="bar-mini"><i data-flowbar></i></span></div>
    <div class="stat" title="顾客的酸 / 辣 / 浓 / 淡偏好，对上几维就记几维；偏好发现得越多，常客回访越勤"><span class="k">常客</span><span class="v" data-regs>0</span><span class="k">喜好</span><span class="v" data-likes>0/${LIKES_TOTAL}</span></div>
    <div class="stat"><span class="k">员工</span><span class="v" data-staffn>0</span></div>
    <div class="spacer"></div>
    <button type="button" class="audio" data-audio title="背景音乐与音效">音乐</button>
    <button type="button" class="pill prep" data-openpill title="营业时间 06:00–14:00，开门后才开始走时间">● 开门营业</button>
  </div>

  <div id="left" class="panel card">
    <div class="ttl">本 月 热 潮</div>
    ${trendRows}
    <div class="goal">
      <div class="lab">本 月 营 收 · 参 考 线（不 判 定 成 败）</div>
      <div class="num">¥<b data-rev>0</b> / <span data-target>¥0</span></div>
      <div class="track big"><i data-goalbar></i></div>
    </div>
    <div class="goal ach">
      <div class="lab">下 一 目 标 · 段 <span data-grade>0</span>/11</div>
      <div class="achlist" data-achlist></div>
    </div>
  </div>

  <div id="cook" class="card">
    <div class="cookttl">老 友 粉 · 现 炒 现 煮</div>
    <div class="cookstage">${COOK_STAGES.map((n, i) => `<span data-cook-step="${i}">${n}</span>`).join("")}</div>
    <div class="cookbar"><i data-cookbar></i></div>
    <div class="cooknow" data-cooknow>等客落座</div>
  </div>

  <div id="right" class="panel card">
    <div class="ttl">候 餐 顾 客</div>
    <div class="custlist" data-custlist>
      <div class="empty" data-waiting>开门后顾客会排到这里</div>
    </div>
    <div class="row queue">
      <span class="nm">排队</span>
      <span class="track"><i data-queuebar></i></span>
      <span class="pct" data-queue>0/8</span>
    </div>
    <div class="row queue sat">
      <span class="nm">满意</span>
      <span class="track"><i data-satbar></i></span>
      <span class="pct" data-sat>--</span>
    </div>
    <div class="caprow chips" data-caprow title="产能 = 座位数 × 每碗出餐时间；扩充座位或换灶才提得上去">座位 4 · 出餐 6 分/碗</div>
    <div class="frenzy" data-frenzy title="热卖：门口有人排队、客人又吃得满意，槽就往上走；出碗越慢的店攒得越吃力。涨满后来客翻倍半小时">
      <div class="fzbar"><i data-frenzybar></i></div>
      <div class="fztxt" data-frenzytxt>热卖槽 0%</div>
    </div>
  </div>

  <div id="float" class="card">
    <svg class="ico" width="26" height="26" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <g fill="#3b2b1d"><rect x="1" y="7" width="14" height="1"/><rect x="2" y="8" width="12" height="1"/><rect x="3" y="9" width="10" height="2"/><rect x="5" y="11" width="6" height="1"/></g>
      <g fill="#ffc845"><rect x="4" y="6" width="2" height="1"/><rect x="9" y="5" width="2" height="1"/></g>
    </svg>
    <div>
      <div class="t1">老友粉 · 口味 <b data-total>--</b></div>
      <div class="t2" data-subs>汤 -- · 粉 -- · 魅 --</div>
      <div class="t2" data-econ>售价 ¥-- · 成本 ¥--</div>
      <div class="tierrow" data-tiers></div>
      <div class="mktrow" data-market></div>
    </div>
  </div>

  <div id="tray" class="card">
    <div class="trayttl">浇头 · 点一下加进这碗 <span data-topcount>0/35</span></div>
    <div class="chips">${chips}</div>
  </div>

  <div id="bottombar">
    ${menuBtns}
    <div class="speedbox">
      <div class="speedttl">时间</div>
      <div class="speedbtns">${speedBtns}</div>
    </div>
    <div class="status">
      <div>存档 <b data-save>已保存</b></div>
      <div>接续码 <b data-code>------</b></div>
    </div>
  </div>`;

  const q = <T extends Element = HTMLElement>(sel: string): T => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`HUD 缺元素: ${sel}`);
    return el as T;
  };

  const evtWrap = document.createElement("div");
  evtWrap.className = "modal eventmodal";
  evtWrap.hidden = true;
  evtWrap.innerHTML = `
    <div class="eventbox card">
      <div class="eventtag">今日突发</div>
      <div class="eventtitle" data-evt-title></div>
      <div class="eventbody" data-evt-body></div>
      <div class="evtsrc" data-evt-src>街上听来的</div>
      <div class="eventchoices" data-evt-choices></div>
    </div>`;
  root.appendChild(evtWrap);

  /**
   * 日结单：打烊那一刻的数字，点「明天继续」才进次日。
   * 开罗的「打烊报数」就是这个位置——不看一眼今天卖了多少，
   * 玩家就没法把「味道/价格/座位」的改动和结果对上号。
   */
  const dayWrap = document.createElement("div");
  dayWrap.className = "modal dayreport";
  dayWrap.hidden = true;
  dayWrap.innerHTML = `
    <div class="daybox card">
      <div class="dayhd"><span class="dttl">今天打烊了</span><span class="ddate" data-day-date></span></div>
      <div class="daygrid">
        <div class="dcell"><span class="dk">营业额</span><span class="dv" data-day-rev>¥0</span></div>
        <div class="dcell"><span class="dk">卖出去</span><span class="dv" data-day-served>0 碗</span></div>
        <div class="dcell"><span class="dk">走了</span><span class="dv" data-day-lost>0 位</span></div>
        <div class="dcell"><span class="dk">平均满意</span><span class="dv" data-day-sat>--</span></div>
      </div>
      <div class="daynote" data-day-note></div>
      <div class="dayhook" data-day-hook><span class="hookmain" data-hook-main></span><span class="hookwhy" data-hook-why></span><span class="hookline" data-hook-line></span></div>
      <div class="daywhy"><span data-loss-line></span><span data-menu-line></span></div>
      <div class="dayfoot">
        <span class="dcash">现金 <b data-day-cash>¥0</b></span>
        <span class="dhint">现金变化含熟客回礼与事件，不总等于营业额减料钱</span>
        <button type="button" class="daybtn" data-day-next>明天继续 ›</button>
      </div>
    </div>`;
  root.appendChild(dayWrap);

  const dayRev = dayWrap.querySelector("[data-day-rev]") as HTMLElement;
  const dayServed = dayWrap.querySelector("[data-day-served]") as HTMLElement;
  const dayLost = dayWrap.querySelector("[data-day-lost]") as HTMLElement;
  const daySat = dayWrap.querySelector("[data-day-sat]") as HTMLElement;
  const dayDate = dayWrap.querySelector("[data-day-date]") as HTMLElement;
  const dayCash = dayWrap.querySelector("[data-day-cash]") as HTMLElement;
  const dayNote = dayWrap.querySelector("[data-day-note]") as HTMLElement;
  const dayHook = dayWrap.querySelector("[data-day-hook]") as HTMLElement;
  const hookMain = dayWrap.querySelector("[data-hook-main]") as HTMLElement;
  const hookWhy = dayWrap.querySelector("[data-hook-why]") as HTMLElement;
  const hookLine = dayWrap.querySelector("[data-hook-line]") as HTMLElement;
  const lossLine = dayWrap.querySelector("[data-loss-line]") as HTMLElement;
  const menuLine = dayWrap.querySelector("[data-menu-line]") as HTMLElement;

  dayWrap.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-day-next]")) opts.onNextDay?.();
  });

  const evtTitle = evtWrap.querySelector("[data-evt-title]") as HTMLElement;
  const evtBody = evtWrap.querySelector("[data-evt-body]") as HTMLElement;
  const evtSrc = evtWrap.querySelector("[data-evt-src]") as HTMLElement;
  const evtChoices = evtWrap.querySelector("[data-evt-choices]") as HTMLElement;

  const toastWrap = document.createElement("div");
  toastWrap.id = "toasts";
  root.appendChild(toastWrap);

  const showToast = (text: string, kind: "info" | "like" = "info"): void => {
    if (!text) return;
    const node = document.createElement("div");
    node.className = kind === "like" ? "toast like" : "toast";
    node.textContent = text;
    toastWrap.appendChild(node);
    while (toastWrap.children.length > 3) toastWrap.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 2800);
  };

  evtChoices.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-evt-choice]");
    if (!btn) return;
    const index = Number(btn.dataset.evtChoice);
    if (Number.isFinite(index)) opts.onEventChoice?.(index);
  });

  let lastEventKey = "";

  const el = {
    year: q("[data-year]"),
    month: q("[data-month]"),
    day: q("[data-day]"),
    cash: q("[data-cash]"),
    stars: q("[data-stars]"),
    rep: q("[data-rep]"),
    today: q("[data-today]"),
    cap: q("[data-cap]"),
    flowbar: q("[data-flowbar]"),
    regs: q("[data-regs]"),
    likes: q("[data-likes]"),
    staffn: q("[data-staffn]"),
    rev: q("[data-rev]"),
    target: q("[data-target]"),
    goalbar: q("[data-goalbar]"),
    grade: q("[data-grade]"),
    achlist: q("[data-achlist]"),
    waiting: q("[data-waiting]"),
    custlist: q("[data-custlist]"),

    // 点客人听一句（A12）：本地句立刻上屏，在线句异步替换
    
    queue: q("[data-queue]"),
    queuebar: q("[data-queuebar]"),
    sat: q("[data-sat]"),
    satbar: q("[data-satbar]"),
    caprow: q("[data-caprow]"),
    frenzy: q("[data-frenzy]"),
    frenzybar: q("[data-frenzybar]"),
    frenzytxt: q("[data-frenzytxt]"),
    econ: q("[data-econ]"),
    tiers: q("[data-tiers]"),
  market: q("[data-market]"),
    code: q("[data-code]"),
    total: q("[data-total]"),
    subs: q("[data-subs]"),
    trendBars: TREND_ROWS.map((_, i) => q(`[data-trend="${i}"]`)),
    trendPcts: TREND_ROWS.map((_, i) => q(`[data-trendpct="${i}"]`)),
    cookSteps: COOK_STAGES.map((_, i) => q(`[data-cook-step="${i}"]`)),
    cookbar: q("[data-cookbar]"),
    cooknow: q("[data-cooknow]"),
    audio: q<HTMLButtonElement>("[data-audio]"),
    clock: q("[data-clock]"),
    shopname: q("[data-shopname]"),
    openpill: q<HTMLButtonElement>("[data-openpill]"),
  };

  let lastToday = -1;
  let lastCustKey = "";
/** 四维九档的渲染缓存键：只在档位变了才重建（悬停提示否则会一直闪） */
let lastTierKey = "";
let lastMarketKey = "";

  const chipEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".chip"));
  /** 浇头熟练度（批 A′）：chip 是常量模板，等级只能每次渲染时贴上去 */
  const chipById = new Map<string, HTMLButtonElement>();
  chipEls.forEach((btn) => {
    const id = btn.dataset.top;
    if (id) chipById.set(id, btn);
  });
  const topById = new Map(TOPPINGS.map((t) => [t.id, t]));
  const syncChipXp = (game: GameState): void => {
    chipById.forEach((btn, id) => {
      const t = topById.get(id);
      if (!t) return;
      const xp = toppingXpOf(game, id);
      const level = levelOf(xp);
      const badge = btn.querySelector<HTMLElement>("[data-xp]");
      if (badge) badge.textContent = level > 0 ? `${level}` : "";
      const next = nextStep(xp);
      const src = t.source?.[0];
      btn.title =
        `${t.name}｜${t.tags.join("/")} · 料钱 ¥${t.cost}｜${xpWords(level)}（做过 ${xp} 碗` +
        `${next === null ? "，已经拿手" : `，再做 ${next} 碗升一级`}）` +
        `${src ? `｜出处：${src.label}「${src.quote}」` : ""}${t.note ? `｜${t.note}` : ""}`;
    });
  };
  const topCount = q("[data-topcount]");
  chipEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.top;
      if (id) opts.onToggleTopping?.(id);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) opts.onOpenTab?.(tab);
    });
  });

  const speedEls = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-speed]"));
  speedEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = Number(btn.dataset.speed);
      if (Number.isFinite(v) && v > 0) opts.onSpeed?.(v);
    });
  });

  el.audio.addEventListener("click", () => {
    opts.onToggleAudio?.();
    const muted = opts.getAudioMuted?.() ?? false;
    el.audio.textContent = muted ? "静音" : "音乐";
    el.audio.classList.toggle("off", muted);
  });

  el.openpill.addEventListener("click", () => {
    opts.onOpenShop?.();
  });

  let lastState: GameState | null = null;

  // 点一下排队里的人，他说一句（A12）：本地句立刻上屏，在线句随后替换
  el.custlist.addEventListener("click", (ev) => {
    const row = (ev.target as HTMLElement | null)?.closest?.("[data-uid]") as HTMLElement | null;
    const st = lastState;
    if (!row || !st) return;
    const uid = row.dataset.uid;
    const c = st.flow.customers.find((x) => String(x.id) === uid);
    if (!c) return;
    const got = talkFor(st, c);
    const who = ARCHETYPE_BY_ID.get(c.archetypeId)?.name ?? "顾客";
    showToast(`\u3010${who}\u3011${got.text}`, "info");
    const ask = {
      kind: "guest_talk" as const,
      key: `${c.archetypeId}:${got.def.id}`,
      context: talkVoiceContext(st, c, who),
      month: st.month,
      day: st.day,
    };
    void fetchLine(ask).then((line) => {
      if (line) showToast(`\u3010${who}\u3011${line}`, "info");
    });
  });

  /**
 * 打烊单底部那行日注。
 *
 * 试玩 11-21 第 1 条：四天三家读到的都是同一句「多半是嫌贵或者等太久」——
 * 一句哪边都不得罪的话，等于没说。现在按 `lostQueue / lostPrice / lostWait`
 * 里的主因分流，玩家当天就能对上「原来他们是这样走的」。
 */
function dayNoteOf(rep: DayRecord, margin: number): string {
  const visited = rep.served + rep.lost;
  if (rep.served === 0) {
    return "一碗都没卖出去：先回去把味道调上去、把价降到街坊掏得出的数，再开门。";
  }
  if (visited > 0 && rep.lost / visited > 0.3) {
    const q = rep.lostQueue ?? 0;
    const p = rep.lostPrice ?? 0;
    const w = rep.lostWait ?? 0;
    const top = p >= q && p >= w ? "price" : q >= w ? "queue" : "wait";
    if (top === "price") return `走了 ${rep.lost} 位：${p} 位是看价牌掉头的 —— 最便宜那款再低一块试试。`;
    if (top === "queue") return `走了 ${rep.lost} 位：${q} 位是门口站满了没进来 —— 座位和出碗两头看一眼。`;
    return `走了 ${rep.lost} 位：${w} 位是等不及 —— 出碗慢的时候，人站着就烦。`;
  }
  return `今天站住了：一碗毛利约 ¥${margin.toFixed(1)}，明天试试多卖几碗。`;
}

const render = (s: GameState, score: RecipeScore): void => {
    lastState = s;
    // 打烊后 endDay 已经换过日，顶栏要显示「刚过完的那天」，
    // 否则会出现顶栏 1 月 2 日、日结单写 1 月 1 日的自相矛盾
    const shown = s.dayReport ?? null;
    const month = shown ? shown.month : s.month;
    const day = shown ? shown.day : s.day;
    el.year.textContent = String(Math.floor(month / 12) + 1);
    el.month.textContent = String((month % 12) + 1);
    el.day.textContent = String(day);

    // 一天三态：钟面、开门按钮、日结单（对齐开罗「打烊报数」）
    const phase = s.phase;
    // 招牌：建店阶段先显示占位，开张后换成玩家起的店名
    el.shopname.textContent = s.shopName || "老友粉店";
    el.shopname.classList.toggle("unnamed", !s.shopName);
    // 打烊后 endDay 已把 minuteOfDay 归零，钟面得停在关门的时刻
    el.clock.textContent =
      phase === "prep" ? SHOP_OPEN_LABEL : phase === "closing" ? SHOP_CLOSE_LABEL : clockOf(s.flow.minuteOfDay);
    el.clock.classList.toggle("closed", phase !== "open");
    if (phase === "setup") {
      el.openpill.textContent = "● 还没开张";
      el.openpill.className = "pill done";
      el.openpill.disabled = true;
    } else if (phase === "prep") {
      el.openpill.textContent = "● 开门营业";
      el.openpill.className = "pill prep";
      el.openpill.disabled = false;
    } else if (phase === "open") {
      el.openpill.textContent = `● 营业中 · ${clockOf(s.flow.minuteOfDay)}（还剩 ${minutesLeft(s.flow.minuteOfDay)} 分）`;
      el.openpill.className = "pill live";
      el.openpill.disabled = true;
    } else {
      el.openpill.textContent = "○ 已打烊";
      el.openpill.className = "pill done";
      el.openpill.disabled = true;
    }

    const rep = s.dayReport;
    dayWrap.hidden = !rep;
    if (rep) {
      dayDate.textContent = `第 ${Math.floor(rep.month / 12) + 1} 年 · ${(rep.month % 12) + 1} 月 · ${rep.day} 日`;
      dayRev.textContent = formatMoney(rep.revenue);
      dayServed.textContent = `${rep.served} 碗`;
      dayLost.textContent = `${rep.lost} 位`;
      daySat.textContent = rep.avgSat < 0 ? "--" : String(rep.avgSat);
      dayCash.textContent = formatMoney(rep.cash);
      dayNote.textContent = dayNoteOf(rep, score.margin);
      // 「明天做点什么」：一笔账不看目标就只是数字（P69）；产能跟不上时它排第一（P70）
      const plan = nextHook(s);
      hookMain.textContent = plan.text;
      hookWhy.textContent = plan.why ?? "";
      dayHook.hidden = plan.text === "";
      dayHook.classList.toggle("bad", plan.urgency === "high");
      dayHook.dataset.hookKind = plan.kind;
      // 副行只给口吻，数字全在上面那行（本地算的），AI 挂了就留本地句
      const voiceAsk = {
        kind: "hook_voice" as const,
        key: plan.key,
        context: hookVoiceContext(plan),
        month: s.month,
        day: s.day,
      };
      hookLine.textContent = plan.kind === "none" ? "" : getLine(voiceAsk, localLine(voiceAsk));
      /**
       * 解读层（批 C′）：为什么掉人、菜单上哪款不动。
       * 本地句带数字，AI 只补一句口气；拿不到在线句就一直是本地句，
       * 所以打烊单永远不会因为 AI 挂了而空着一行。
       */
      const why = lossWhyOf(s);
      if (why) {
        const ask = { kind: "loss_explain" as const, key: why.ask.key, context: why.ask.context, month: s.month, day: s.day };
        lossLine.textContent = getLine(ask, why.text);
      } else {
        lossLine.textContent = "";
      }
      const menuLineOfDay = menuLineOf(s);
      if (menuLineOfDay) {
        const ask = { kind: "menu_advice" as const, key: menuLineOfDay.ask.key, context: menuLineOfDay.ask.context, month: s.month, day: s.day };
        menuLine.textContent = getLine(ask, menuLineOfDay.text);
      } else {
        menuLine.textContent = "";
      }
    }
    el.cash.textContent = formatMoney(s.cash);
    el.stars.textContent = stars(s.reputation);
    el.rep.textContent = s.reputation.toFixed(1);
    el.today.textContent = String(s.todayCustomers);
    el.cap.textContent = `/${s.capacity}`;
    el.flowbar.style.width = `${Math.min(100, (s.todayCustomers / Math.max(1, s.capacity)) * 100)}%`;
    el.regs.textContent = String(favoriteArchetypes(s).length);
    el.likes.textContent = `${s.collection.likes.length}/${LIKES_TOTAL}`;
    el.staffn.textContent = String(s.staff.roster.length);
    el.rev.textContent = Math.round(s.monthRevenue).toLocaleString("zh-CN");
    el.target.textContent = formatMoney(s.monthTarget);
    el.goalbar.style.width = `${Math.min(100, (s.monthRevenue / Math.max(1, s.monthTarget)) * 100)}%`;
    // F6 合并两套成就：左栏这一条与图鉴页共用 sim/trophies.ts 的 30 枚，
    // 老的 sim/achievements.ts（11 条、字段重叠、hint 里还留着别的作品名）已删。
    el.grade.textContent = `${s.gradeLevel}`;
    const ach = nextTrophies(s, 2); // 左栏只有 176px 宽，两行刚好不压到灶台卡
    el.achlist.innerHTML = ach
      .map(
        (v) => `<div class="achrow" title="${v.def.note}">
          <span class="an">${v.def.name}</span>
          <span class="av">${v.earned ? "已达成" : `${fmtProgress(v.cur)} / ${fmtProgress(v.target)}`}</span>
          <span class="abar"><i style="width:${Math.round(v.pct * 100)}%"></i></span>
        </div>`,
      )
      .join("");

    TREND_ROWS.forEach((r, i) => {
      const v = s.trend[r.key];
      const bar = el.trendBars[i];
      const label = el.trendPcts[i];
      if (bar) {
        bar.style.width = pct(v);
        bar.className = trendClass(v);
      }
      if (label) label.textContent = pct(v);
    });

    const waitingList = s.flow.customers.filter((c) => c.status === "waiting");
    const eatingList = s.flow.customers.filter((c) => c.status === "eating");
    const queueLen = waitingList.length;
    el.queue.textContent = `${queueLen}/${queueMaxOf(s)}`;
    el.queuebar.style.width = `${Math.min(100, (queueLen / queueMaxOf(s)) * 100)}%`;

    const sat = s.flow.lastSatisfaction;
    el.sat.textContent = sat < 0 ? "--" : String(sat);
    el.satbar.style.width = sat < 0 ? "0%" : `${sat}%`;
    el.satbar.className = sat < 40 ? "hot" : sat < 60 ? "warm" : "";
    const serveNow = bowlMinutes(s, SERVE_MINUTES, equipServeMultiplier(s));
    // 开罗 Sales Areas：本区越做越腻、别区越长肉。这几枚小牌就是「什么时候搬家／什么时候报比赛」的提示。
    const pool = demandCapOf(s);
    const contest = isContestMonth(s.month) ? "本月比赛" : `比赛 ${monthsToContest(s.month)} 个月后`;
    // 够格评段位时，这一枚直接写成「可评定」：评段位的按钮在店铺页最上面，
    // 但玩家不会为了找一个按钮把整页滚一遍（试玩 11-20：三个人都被钩子指着去评，
    // 都说找不到入口 —— 那个按钮其实在加购段下面，滚两屏才到）。
    const gc = checkGrade(s);
    const gradeChip = gc.ready
      ? `<span class="chip grade hot" title="够格了：去「店铺」页最上面交费评定">${icon("flag")}可评定「${gc.next?.title ?? ""}」</span>`
      : `<span class="chip grade">${icon("flag")}${contest}</span>`;
    // 五枚胶囊，各带一枚像素图标：数字靠 tabular-nums 对齐，扫一眼就能读出今天的产能与压力
    el.caprow.innerHTML = [
      `<span class="chip people">${icon("people")}座位 ${s.venue.seats} · ${serveNow.toFixed(1)} 分/碗</span>`,
      `<span class="chip bowl">${icon("bowl")}日上限 ${s.capacity} 碗</span>`,
      `<span class="chip flow">${icon("street")}客流 ${pool}/日</span>`,
      `<span class="chip favor">${icon("heart")}人情 ${favorOf(s)}</span>`,
      gradeChip,
    ].join("");
    // 热卖槽（开罗 Ramen Frenzy）：排队 + 吃得满意 → 槽涨；满了 30 分钟来客翻倍。
    // 放在 HUD 上是因为它是**可主动经营的**：想攒满就得留一点排队、又不能把满意度压下去。
    const live = frenzyActive(s);
    const fzLeft = frenzyLeftMinutes(s);
    el.frenzytxt.textContent = live
      ? `🔥 热卖中 · 还剩 ${fzLeft} 分（人比平时多一倍）`
      : `热卖槽 ${Math.round(s.frenzy.gauge)}%（有人排队且满意才涨）`;
    el.frenzybar.style.width = live ? "100%" : `${Math.round(s.frenzy.gauge)}%`;
    el.frenzy.className = `frenzy${live ? " live" : ""}`;
    const custKey = s.flow.customers.map((c) => `${c.id}${c.status[0]}${c.elapsed}${c.regular ? "R" : ""}${c.tier ?? ""}`).join("|");
    if (custKey !== lastCustKey) {
      lastCustKey = custKey;
      // 顾客行带「钱包」：定价是否偏高必须让玩家看得见，否则涨价像白捡钱
      const tol = priceTolerance(score.total);
      const rows = [...eatingList, ...waitingList].slice(0, 6).map((c) => {
        const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
        const name = arch?.name ?? "顾客";
        const tag = c.status === "eating" ? "吃" : "等";
        const note = arch?.note ?? "";
        // 顾客等级（A8）：钱包这一行必须是**这一档**的钱包，不然「识食的」看着跟路过的
        const tierDef = tierById(c.tier);
        const wallet = arch ? Math.round(arch.budget * tol * tierBudgetPct(tierDef)) : 0;
        const short = arch ? wallet < s.price : false;
        return (
          `<div class="cust t-${tierDef.id}${short ? " short" : ""}" data-uid="${c.id}" title="${tierDef.note}｜点一下听他说句话">` +
          `<span class="tag ${c.status}${c.regular ? " reg" : ""}">${c.regular ? "常" : tag}</span>` +
          `<span class="cn">${name}</span>` +
          `<span class="cw" title="这一位愿意出到多少钱（含味道带来的溢价）">¥${wallet}</span>` +
          `<span class="cd">${short ? "嫌贵" : note}</span>` +
          `<span class="ct">${tierDef.word}</span>` +
          `</div>`
        );
      });
      el.custlist.innerHTML =
        rows.length > 0
          ? rows.join("")
          : `<div class="empty">${s.todayCustomers > 0 ? `今日已接待 ${s.todayCustomers} 位` : "开门后顾客会排到这里"}</div>`;
    }

    el.code.textContent = s.connectCode;
    el.total.textContent = String(score.total);
    el.subs.textContent = `汤 ${score.soup} · 粉 ${score.noodle} · 魅 ${score.charm} · 门店 ${score.storeScore}`;
    el.econ.textContent = `售价 ¥${score.price} · 成本 ¥${score.cost.toFixed(1)} · 毛利 ¥${score.margin.toFixed(1)}`;
    // 三段并行的读法挂在 title 上：浮层不能变胖，但鼠标停一下要能看出卡在哪一段（批次二）
    {
      const sm = stageMinutes(s);
      const slow = slowestStation(s);
      el.econ.title = `一碗 ${(sm.total).toFixed(1)} 分：炒锅 ${sm.wok.toFixed(1)} · 汤锅 ${sm.pot.toFixed(1)} · 粉篓 ${sm.basket.toFixed(1)}｜最慢是${STATION_NAMES[slow.station]}（${slow.minutes.toFixed(1)} 分）`;
  syncChipXp(s);
    }
    /**
     * 四维九档（B1 批次一）：把「味 62 / 粉 55」换成客人会说的话。
     * 只在档位或评语变化时重建 DOM —— 每帧重写 innerHTML 会让悬停提示一直闪。
     */
    const board = tierBoard({ main: s.main ?? "pork", portion: s.portion ?? 2, recipe: s.recipe }, score);
    const boardKey = board.map((r) => `${r.id}${r.tier}`).join("|");
    if (boardKey !== lastTierKey) {
      lastTierKey = boardKey;
      el.tiers.innerHTML = board
        .map(
          (r) =>
            `<div class="trow" title="${r.name}：${r.words}">` +
            `<span class="tdim">${r.name}</span>` +
            `<span class="tcells">${tierCells(r.tier)
              .map((on, i) => `<i class="${on ? "on" : ""}${i === r.tier - 1 ? " top" : ""}"></i>`)
              .join("")}</span>` +
            `<span class="tword">${r.word}</span>` +
            `</div>`,
        )
        .join("");
    }

    // 今天街上的事（批次三）：回南天、赶圩、猪肉起价 —— 只有名字与四个数，点开才说细节
    {
      const mk = marketOf(s);
      const mKey = mk ? `${mk.id}:${s.month}:${s.day}` : "";
      if (mKey !== lastMarketKey) {
        lastMarketKey = mKey;
        el.market.textContent = mk ? `${mk.name} · ${marketWords(mk)}` : "";
        el.market.title = mk ? `${mk.when}｜${mk.line}` : "";
        el.market.className = mk ? "mktrow on" : "mktrow";
      }
    }

    const selected = new Set(s.recipe.toppings);
    chipEls.forEach((btn) => btn.classList.toggle("on", selected.has(btn.dataset.top ?? "")));
    topCount.textContent = `${selected.size}/${TOPPINGS.length}`;

    if (s.todayCustomers !== lastToday) {
      lastToday = s.todayCustomers;
      el.today.classList.remove("bump");
      void el.today.offsetWidth;
      el.today.classList.add("bump");
    }

    const pending = s.events.pending;
    const eventKey = pending ? `${pending.id}:${pending.absDay}` : "";
    if (eventKey !== lastEventKey) {
      lastEventKey = eventKey;
      const def = pending ? EVENTS_BY_ID.get(pending.id) : undefined;
      if (!def) {
        evtWrap.hidden = true;
      } else {
        evtTitle.textContent = def.title;
        evtBody.textContent = def.body;
        evtSrc.textContent = "街上听来的";
        evtSrc.classList.remove("remote");
        evtChoices.innerHTML = def.choices
          .map(
            (c, i) =>
              `<button type="button" class="evtbtn" data-evt-choice="${i}">` +
              `<b>${c.label}</b><span>${c.summary}</span></button>`,
          )
          .join("");
        evtWrap.hidden = false;
      }
    }

    // 工序：serveCooldown 从满值倒数，正好当一碗的进度条。
    // 前 55% 炒料与煮粉两口锅并行，55%–95% 合煮，95% 之后盛装出餐。
    const bowlSpan = Math.max(1, SERVE_MINUTES * serveMultiplier(s));
    const cool = s.flow.serveCooldown;
    const cooking = cool > 0;
    const progress = cooking ? Math.min(1, Math.max(0, 1 - cool / bowlSpan)) : 0;
    const half = progress >= 0.55;
    const done = progress >= 0.95;
    el.cookSteps.forEach((node, i) => {
      if (!cooking) {
        node.className = "";
        return;
      }
      // 0 炒料 / 1 煮粉：合煮前都亮着，合煮后算完成
      if (i <= 1) node.className = half ? "done" : "on";
      else if (i === 2) node.className = done ? "done" : half ? "on" : "";
      else node.className = done ? "on" : "";
    });
    el.cookbar.style.width = cooking ? `${Math.round(progress * 100)}%` : "0%";
    const left = Math.max(1, Math.ceil(cool));
    el.cooknow.textContent = !cooking
      ? `等客落座 · 一碗约 ${bowlSpan.toFixed(1)} 分钟`
      : done
        ? `盛装 · 撒葱花与酸料 · ${s.venue.stoves} 口灶`
        : half
          ? `合煮 · 高汤下锅 · 还要 ${left} 分钟`
          : `炒料 + 煮粉 双锅并行 · 还要 ${left} 分钟`;

    const muted = opts.getAudioMuted?.() ?? false;
    el.audio.textContent = muted ? "静音" : "音乐";
    el.audio.classList.toggle("off", muted);

    const speed = opts.getSpeed?.() ?? 4;
    speedEls.forEach((btn) => btn.classList.toggle("on", Number(btn.dataset.speed) === speed));
  };

  const setEventNarrative = (key: string, narrative: EventNarrative): void => {
    if (key !== lastEventKey) return;
    evtBody.textContent = narrative.body;
    const remote = narrative.source === "remote";
    evtSrc.textContent = remote ? "刚在巷口听人说" : "街上听来的";
    evtSrc.classList.toggle("remote", remote);
  };

  return { render, setEventNarrative, showToast };
}
