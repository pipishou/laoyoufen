import type { GameState } from "../sim/state";

/**
 * 首局引导：5 步，绑在一天三态上（prep 四步 / open 一步）。
 *
 * 设计约束（来自 2026-11-14 玩家实测反馈 m03752 与决策卡「下一批做什么」）：
 * ① 引导必须跟着游戏进程走：准备阶段教「配方→浇头→定价→开门」，
 *    开门之后才教「卖够 20 碗」——原来是 4 步全挂在营业中，玩家一进来
 *    就在流失顾客，教程却在教改配方。
 * ② 必须能自己走：有「下一步」可以跳过当前那条，不用非得把动作做完。
 * ③ 必须能收起来：有「暂时关掉」，关掉后右下角留一个「? 引导」可以再打开；
 *    另有「不用教了」永久关闭。
 * ④ 可整块摘除：删掉 mountGuide 调用即回到无引导状态。
 */

const KEY = "laoyou.guide.v2";

type Action = "recipe" | "topping" | "price" | "open";

interface Step {
  id: string;
  /** 这一步属于哪个阶段；阶段不符就不显示 */
  phase: "prep" | "open";
  title: string;
  body: string;
  /** 玩家做过某类动作即算过 */
  action?: Action;
  /** 状态条件也算过（与 action 并用） */
  done?: (s: GameState) => boolean;
  /** 高亮哪个元素，帮玩家找到点哪里 */
  anchor?: string;
}

const STEPS: Step[] = [
  {
    id: "taste",
    phase: "prep",
    title: "① 先把味道调起来",
    body: "现在还没开门，时间不会走。点左下「配方」，把汤和粉的滑杆往右拨——味道分决定来多少人、也决定他们肯出多少钱。",
    action: "recipe",
    anchor: '[data-tab="recipe"]',
  },
  {
    id: "topping",
    phase: "prep",
    title: "② 加两样浇头",
    body: "最下一排点「酸笋」「豆豉」，各加一份进这碗。浇头是味道的一部分，也占成本。",
    action: "topping",
    done: (s) => s.recipe.toppings.length >= 2,
  },
  {
    id: "price",
    phase: "prep",
    title: "③ 定个价：先卖 ¥9",
    body: "售价在「配方」面板里。¥9 是南宁的常见价；超过街坊钱包，他们会看价牌走人。",
    action: "price",
    done: (s) => s.price !== 9,
    anchor: '[data-tab="recipe"]',
  },
  {
    id: "open",
    phase: "prep",
    title: "④ 开门营业",
    body: "右上角「● 开门营业」按下去，时间才开始走，客人陆续进店。营业时间 06:00–14:00。",
    action: "open",
    done: (s) => s.phase === "open",
    anchor: "[data-openpill]",
  },
  {
    id: "first20",
    phase: "open",
    title: "⑤ 今天卖够 20 碗",
    body: "客人落座后灶台自己出餐，14:00 自动打烊并报数。卖不动就趁明天开门前回去调味道和价格。",
    done: (s) => s.flow.servedToday >= 20,
  },
];

interface Save {
  done: boolean;
  passed: string[];
  /** 玩家点了「暂时关掉」：保留进度，右下角留恢复入口 */
  hidden: boolean;
}

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("laoyou.guide.v1");
    if (raw) {
      const v = JSON.parse(raw) as Partial<Save>;
      if (typeof v.done === "boolean" && Array.isArray(v.passed)) {
        return { done: v.done, passed: v.passed, hidden: v.hidden === true };
      }
    }
  } catch {
    /* 坏档当新档 */
  }
  return { done: false, passed: [], hidden: false };
}

export interface Guide {
  render(state: GameState): void;
  /** 玩家做了某类动作 */
  notify(action: Action): void;
  /** 永久关掉：以后不再出现 */
  dismiss(): void;
  /** 收起面板（保留进度），右下角出现恢复入口 */
  hide(): void;
  /** 恢复面板 */
  show(): void;
}

export function mountGuide(root: HTMLElement, onFinish?: () => void): Guide {
  const save = load();
  const wrap = document.createElement("div");
  wrap.className = "guide";
  wrap.hidden = true;
  wrap.innerHTML =
    `<div class="ghead"><span class="gtitle"></span><span class="gstep"></span></div>` +
    `<div class="gbody"></div>` +
    `<div class="gfoot">` +
    `<button type="button" class="gbtn ghost" data-guide-hide>先关掉</button>` +
    `<button type="button" class="gbtn ghost" data-guide-skip>不用教了</button>` +
    `<button type="button" class="gbtn main" data-guide-next>下一步 ›</button>` +
    `</div>`;
  root.appendChild(wrap);

  // 收起后的恢复入口：不占地方，只在玩家主动收起来时出现
  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "guiderestore";
  restore.textContent = "? 引导";
  restore.title = "重新打开新手引导";
  restore.hidden = true;
  root.appendChild(restore);

  const elTitle = wrap.querySelector(".gtitle") as HTMLElement;
  const elBody = wrap.querySelector(".gbody") as HTMLElement;
  const elStep = wrap.querySelector(".gstep") as HTMLElement;
  let marked: HTMLElement | null = null;
  /** 「下一步」需知道当前在哪个阶段，才能决定跳过哪一条 */
  let lastState: GameState | null = null;

  const persist = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      /* 存不下不影响玩 */
    }
  };

  const current = (state: GameState): Step | undefined =>
    STEPS.find((s) => !save.passed.includes(s.id) && s.phase === state.phase);

  /** 高亮当前步要点的那个按钮，换步就撤掉上一个 */
  function mark(sel?: string): void {
    if (marked) marked.classList.remove("guide-target");
    marked = null;
    if (!sel) return;
    const el = root.querySelector<HTMLElement>(sel);
    if (el) {
      el.classList.add("guide-target");
      marked = el;
    }
  }

  function finish(): void {
    save.done = true;
    save.hidden = false;
    persist();
    wrap.hidden = true;
    restore.hidden = true;
    mark();
    onFinish?.();
  }

  function paint(state: GameState): void {
    if (save.done) {
      wrap.hidden = true;
      restore.hidden = true;
      return;
    }
    // 状态条件先划掉（玩家直接加了浇头，不必等他再点一次）
    let changed = false;
    for (const s of STEPS) {
      if (save.passed.includes(s.id)) continue;
      if (s.done && s.done(state)) {
        save.passed.push(s.id);
        changed = true;
      }
    }
    if (changed) persist();

    const step = current(state);
    if (!step) {
      // 本阶段没有剩余步：营业中就等打烊，准备阶段说明都做完了
      const left = STEPS.filter((s) => !save.passed.includes(s.id));
      if (left.length === 0) {
        finish();
        return;
      }
      wrap.hidden = true;
      restore.hidden = true;
      mark();
      return;
    }
    // 面板正在显示时，右下角不该再挂一个「? 引导」
    restore.hidden = true;
    wrap.hidden = false;
    if (save.hidden) {
      wrap.hidden = true;
      restore.hidden = false;
      mark();
      return;
    }
    elTitle.textContent = step.title;
    elBody.textContent = step.body;
    const total = STEPS.length;
    elStep.textContent = `${save.passed.length + 1}/${total}`;
    mark(step.anchor);
  }

  wrap.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-guide-next]")) {
      const step = lastState ? current(lastState) : STEPS.find((s) => !save.passed.includes(s.id));
      if (step) save.passed.push(step.id);
      persist();
      if (lastState) paint(lastState);
      return;
    }
    if (t.closest("[data-guide-hide]")) {
      save.hidden = true;
      persist();
      wrap.hidden = true;
      restore.hidden = false;
      mark();
      return;
    }
    if (t.closest("[data-guide-skip]")) {
      finish();
    }
  });

  restore.addEventListener("click", () => {
    save.hidden = false;
    persist();
    restore.hidden = true;
    if (lastState) paint(lastState);
  });

  return {
    render(state: GameState) {
      lastState = state;
      paint(state);
    },
    notify(action: Action) {
      if (save.done) return;
      const step = lastState ? current(lastState) : STEPS.find((s) => !save.passed.includes(s.id));
      if (step && step.action === action && !save.passed.includes(step.id)) {
        save.passed.push(step.id);
        persist();
        if (lastState) paint(lastState);
      }
    },
    dismiss() {
      finish();
    },
    hide() {
      save.hidden = true;
      persist();
      wrap.hidden = true;
      restore.hidden = false;
      mark();
    },
    show() {
      save.done = false;
      save.hidden = false;
      persist();
      restore.hidden = true;
      if (lastState) paint(lastState);
    },
  };
}

/** 给验收脚本用：当前引导状态快照 */
export function guideState(): Save {
  return load();
}
