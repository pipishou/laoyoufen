import type { EventNarrative } from "../ai/director";
import { ARCHETYPE_BY_ID } from "../data/customers";
import { EVENTS_BY_ID } from "../data/events";
import { TOPPINGS } from "../data/ingredients";
import { LIKES_TOTAL } from "../sim/collection";
import { priceTolerance, SERVE_MINUTES } from "../sim/customer";
import { favoriteArchetypes } from "../sim/regulars";
import type { GameState } from "../sim/state";
import { nextThree } from "../sim/achievements";

/** 成就进度显示：上万用「1.2万」，避免长串数字把成就条挤爆 */
function fmtProgress(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}万`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}千`;
  return String(Math.round(n));
}
import type { RecipeScore } from "../sim/score";
import { serveMultiplier } from "../sim/staff";

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

const ICONS: Record<string, string> = {
  book: '<rect x="3" y="2" width="10" height="12" fill="#fdf6e3" stroke="#3b2b1d" stroke-width="1"/><rect x="6" y="1" width="4" height="2" fill="#8a5a3b"/><g fill="#3b2b1d"><rect x="5" y="5" width="6" height="1"/><rect x="5" y="8" width="6" height="1"/><rect x="5" y="11" width="4" height="1"/></g>',
  bowl: '<g fill="#3b2b1d"><rect x="1" y="7" width="14" height="1"/><rect x="2" y="8" width="12" height="1"/><rect x="3" y="9" width="10" height="2"/><rect x="5" y="11" width="6" height="1"/></g><g fill="#ffc845"><rect x="4" y="6" width="2" height="1"/><rect x="9" y="5" width="2" height="1"/></g>',
  crate:
    '<rect x="2" y="6" width="12" height="7" fill="#f2a33c" stroke="#3b2b1d" stroke-width="1"/><path d="M4 6 L6 2 h4 l2 4" fill="none" stroke="#3b2b1d" stroke-width="1"/><g fill="#3b2b1d"><rect x="5" y="8" width="1" height="3"/><rect x="8" y="8" width="1" height="3"/><rect x="11" y="8" width="1" height="3"/></g>',
  staff:
    '<g fill="#3b2b1d"><rect x="6" y="2" width="4" height="4"/><rect x="4" y="7" width="8" height="7"/></g><g fill="#fdf6e3"><rect x="7" y="8" width="2" height="5"/></g>',
  shop:
    '<path d="M2 7 L4 3 h8 l2 4 z" fill="#d05b4f" stroke="#3b2b1d" stroke-width="1"/><rect x="3" y="7" width="10" height="7" fill="#fff8e6" stroke="#3b2b1d" stroke-width="1"/><rect x="6" y="10" width="4" height="4" fill="#8a5a3b"/>',
  cup: '<path d="M4 3 h8 v5 a4 4 0 0 1 -8 0 z" fill="#ffc845" stroke="#3b2b1d" stroke-width="1"/><rect x="6" y="11" width="4" height="2" fill="#3b2b1d"/><rect x="4" y="13" width="8" height="1" fill="#3b2b1d"/>',
};

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
      `<svg class="ico" viewBox="0 0 16 16" shape-rendering="crispEdges">${ICONS[m.icon] ?? ""}</svg>${m.label}</button>`,
  ).join("");

  const speedBtns = SPEEDS.map(
    (s) => `<button type="button" class="spd" data-speed="${s}">×${s}</button>`,
  ).join("");

  const chips = TOPPINGS.map(
    (t) =>
      `<button type="button" class="chip" data-top="${t.id}" title="${t.tags.join("/")} · ¥${t.cost}">${t.name}</button>`,
  ).join("");

  root.innerHTML = `
  <div id="topbar">
    <div class="logo">老友粉店</div>
    <div class="date">第 <b data-year>1</b> 年 · <b data-month>1</b> 月 · <b data-day>1</b> 日</div>
    <div class="stat"><span class="k">现金</span><span class="v" data-cash>¥0</span></div>
    <div class="stat"><span class="k">评价</span><span class="stars" data-stars>☆☆☆☆☆</span><span class="v" data-rep>0.0</span></div>
    <div class="stat"><span class="k">今日客流</span><span class="v" data-today>0</span><span class="k" data-cap>/40</span><span class="bar-mini"><i data-flowbar></i></span></div>
    <div class="stat" title="顾客的酸 / 辣 / 浓 / 淡偏好，对上几维就记几维；偏好发现得越多，常客回访越勤"><span class="k">常客</span><span class="v" data-regs>0</span><span class="k">喜好</span><span class="v" data-likes>0/${LIKES_TOTAL}</span></div>
    <div class="stat"><span class="k">员工</span><span class="v" data-staffn>0</span></div>
    <div class="spacer"></div>
    <button type="button" class="audio" data-audio title="开罗风 BGM 与音效开关">音乐</button>
    <div class="pill" data-openpill>● 营业中</div>
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
    <div class="caprow" data-caprow title="产能 = 座位数 × 每碗出餐时间；扩充座位或换灶才提得上去">座位 4 · 出餐 6 分/碗</div>
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
      <div class="evtsrc" data-evt-src>AI 导演 · 离线模板</div>
      <div class="eventchoices" data-evt-choices></div>
    </div>`;
  root.appendChild(evtWrap);

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
    queue: q("[data-queue]"),
    queuebar: q("[data-queuebar]"),
    sat: q("[data-sat]"),
    satbar: q("[data-satbar]"),
    caprow: q("[data-caprow]"),
    econ: q("[data-econ]"),
    code: q("[data-code]"),
    total: q("[data-total]"),
    subs: q("[data-subs]"),
    trendBars: TREND_ROWS.map((_, i) => q(`[data-trend="${i}"]`)),
    trendPcts: TREND_ROWS.map((_, i) => q(`[data-trendpct="${i}"]`)),
    cookSteps: COOK_STAGES.map((_, i) => q(`[data-cook-step="${i}"]`)),
    cookbar: q("[data-cookbar]"),
    cooknow: q("[data-cooknow]"),
    audio: q<HTMLButtonElement>("[data-audio]"),
  };

  let lastToday = -1;
  let lastCustKey = "";

  const chipEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".chip"));
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

  const render = (s: GameState, score: RecipeScore): void => {
    el.year.textContent = String(Math.floor(s.month / 12) + 1);
    el.month.textContent = String((s.month % 12) + 1);
    el.day.textContent = String(s.day);
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
    // K1 目标换骨：成就条取代「月度目标」成为主推力（见 sim/achievements.ts）
    el.grade.textContent = `${s.gradeLevel}`;
    const ach = nextThree(s).slice(0, 2); // 左栏只有 176px 宽，两行刚好不压到灶台卡
    el.achlist.innerHTML = ach
      .map(
        (v) => `<div class="achrow" title="${v.hint}">
          <span class="an">${v.name}</span>
          <span class="av">${fmtProgress(v.progress)}${v.unit} / ${v.next === null ? "满" : fmtProgress(v.next)}${v.unit}</span>
          <span class="abar"><i style="width:${Math.round(v.ratio * 100)}%"></i></span>
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
    el.queue.textContent = `${queueLen}/8`;
    el.queuebar.style.width = `${Math.min(100, (queueLen / 8) * 100)}%`;

    const sat = s.flow.lastSatisfaction;
    el.sat.textContent = sat < 0 ? "--" : String(sat);
    el.satbar.style.width = sat < 0 ? "0%" : `${sat}%`;
    el.satbar.className = sat < 40 ? "hot" : sat < 60 ? "warm" : "";
    el.caprow.textContent = `座位 ${s.venue.seats} · 出餐 ${SERVE_MINUTES} 分/碗 · 日上限 ${s.capacity} 碗`;

    const custKey = s.flow.customers.map((c) => `${c.id}${c.status[0]}${c.elapsed}${c.regular ? "R" : ""}`).join("|");
    if (custKey !== lastCustKey) {
      lastCustKey = custKey;
      // 顾客行带「钱包」：定价是否偏高必须让玩家看得见，否则涨价像白捡钱
      const tol = priceTolerance(score.total);
      const rows = [...eatingList, ...waitingList].slice(0, 6).map((c) => {
        const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
        const name = arch?.name ?? "顾客";
        const tag = c.status === "eating" ? "吃" : "等";
        const note = arch?.note ?? "";
        const wallet = arch ? Math.round(arch.budget * tol) : 0;
        const short = arch ? wallet < s.price : false;
        return (
          `<div class="cust${short ? " short" : ""}">` +
          `<span class="tag ${c.status}${c.regular ? " reg" : ""}">${c.regular ? "常" : tag}</span>` +
          `<span class="cn">${name}</span>` +
          `<span class="cw" title="这一位愿意出到多少钱（含味道带来的溢价）">¥${wallet}</span>` +
          `<span class="cd">${short ? "嫌贵" : note}</span>` +
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
        evtSrc.textContent = "AI 导演 · 离线模板";
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
    const bowlMinutes = Math.max(1, SERVE_MINUTES * serveMultiplier(s));
    const cool = s.flow.serveCooldown;
    const cooking = cool > 0;
    const progress = cooking ? Math.min(1, Math.max(0, 1 - cool / bowlMinutes)) : 0;
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
      ? `等客落座 · 一碗约 ${bowlMinutes.toFixed(1)} 分钟`
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
    evtSrc.textContent = remote ? "AI 导演 · 在线生成" : "AI 导演 · 离线模板";
    evtSrc.classList.toggle("remote", remote);
  };

  return { render, setEventNarrative, showToast };
}
