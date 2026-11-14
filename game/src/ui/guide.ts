import type { GameState } from "../sim/state";

/**
 * 首局引导：4 步，条件驱动，不锁操作。
 *
 * 设计约束（来自决策卡 2026-11-14「下一批做什么」）：
 * ① 只 3–4 条、不做强制教学 —— 引导层过重会污染「第一印象」这个被测对象；
 * ② 完成条件尽量由玩家动作或既有状态判定，不额外加模拟字段；
 * ③ 可整块摘除：删掉 mountGuide 调用即回到无引导状态。
 */

const KEY = "laoyou.guide.v1";

type Action = "recipe" | "topping" | "price";

interface Step {
  id: string;
  title: string;
  body: string;
  /** 玩家做过某类动作即算过 */
  action?: Action;
  /** 状态条件也算过（与 action 二选一或并用） */
  done?: (s: GameState) => boolean;
}

const STEPS: Step[] = [
  {
    id: "taste",
    title: "① 先把味道调起来",
    body: "点左下「配方」，把汤和粉的滑杆往右拨。味道分上去，来的人才会多，也才敢涨价。",
    action: "recipe",
  },
  {
    id: "topping",
    title: "② 加两个浇头",
    body: "最下一排点「酸笋」「豆豉」——各加一份进这碗。浇头是味道的一部分，也占成本。",
    action: "topping",
    done: (s) => s.recipe.toppings.length >= 2,
  },
  {
    id: "price",
    title: "③ 第一碗先卖 ¥9",
    body: "售价在「配方」面板里。¥9 是南宁的常见价；超过街坊钱包，他们会看价牌走人。",
    action: "price",
    done: (s) => s.price !== 9,
  },
  {
    id: "first20",
    title: "④ 今天卖够 20 碗",
    body: "客人落座后灶台自己出餐。卖够 20 碗，今天就站住了——卖不动就回去调味道和价格。",
    done: (s) => s.flow.servedToday >= 20 || s.day > 1,
  },
];

interface Save {
  done: boolean;
  passed: string[];
}

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Save;
      if (v && typeof v.done === "boolean" && Array.isArray(v.passed)) return v;
    }
  } catch {
    /* 坏档当新档 */
  }
  return { done: false, passed: [] };
}

export interface Guide {
  render(state: GameState): void;
  /** 玩家做了某类动作 */
  notify(action: Action): void;
  /** 直接关掉全部引导 */
  dismiss(): void;
}

export function mountGuide(root: HTMLElement, onDismiss?: () => void): Guide {
  const save = load();
  const wrap = document.createElement("div");
  wrap.className = "guide";
  wrap.hidden = true;
  wrap.innerHTML =
    `<div class="gtitle"></div>` +
    `<div class="gbody"></div>` +
    `<div class="gfoot"><span class="gstep"></span>` +
    `<button type="button" class="gbtn" data-guide-skip>不用教了</button></div>`;
  root.appendChild(wrap);

  const elTitle = wrap.querySelector(".gtitle") as HTMLElement;
  const elBody = wrap.querySelector(".gbody") as HTMLElement;
  const elStep = wrap.querySelector(".gstep") as HTMLElement;

  const persist = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      /* 存不下不影响玩 */
    }
  };

  const current = (): Step | undefined => STEPS.find((s) => !save.passed.includes(s.id));

  function paint(state: GameState): void {
    if (save.done) {
      wrap.hidden = true;
      return;
    }
    // 先把状态能判定的步骤划掉（比如玩家直接加了浇头，不必等他点第二次）
    let changed = false;
    for (const s of STEPS) {
      if (save.passed.includes(s.id)) continue;
      if (s.done && s.done(state)) {
        save.passed.push(s.id);
        changed = true;
      }
    }
    if (changed) persist();

    const step = current();
    if (!step) {
      save.done = true;
      persist();
      wrap.hidden = true;
      onDismiss?.();
      return;
    }
    wrap.hidden = false;
    elTitle.textContent = step.title;
    elBody.textContent = step.body;
    elStep.textContent = `${save.passed.length + 1}/${STEPS.length}`;
  }

  wrap.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-guide-skip]")) {
      save.done = true;
      save.passed = STEPS.map((s) => s.id);
      persist();
      wrap.hidden = true;
      onDismiss?.();
    }
  });

  return {
    render: paint,
    notify(action: Action) {
      if (save.done) return;
      const step = current();
      if (step && step.action === action && !save.passed.includes(step.id)) {
        save.passed.push(step.id);
        persist();
      }
    },
    dismiss() {
      save.done = true;
      save.passed = STEPS.map((s) => s.id);
      persist();
      wrap.hidden = true;
    },
  };
}

/** 给验收脚本用：当前引导状态快照 */
export function guideState(): Save {
  return load();
}
