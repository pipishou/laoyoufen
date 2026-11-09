import Phaser from "phaser";
import { fetchEventNarrative, localNarrative, localReaction } from "./ai/director";
import { startBgm } from "./audio/bgm";
import { isMuted, toggleMuted, unlockAudio } from "./audio/engine";
import { playSfx } from "./audio/sfx";
import { EVENTS_BY_ID } from "./data/events";
import { createGameConfig } from "./render/world";
import { enterContest } from "./sim/contest";
import { resolveEvent } from "./sim/events";
import { deserialize, serialize, SAVE_STORAGE_KEY } from "./sim/save";
import { scoreRecipe } from "./sim/score";
import { buyUpgrade } from "./sim/shop";
import { fire, hire, toggleRest } from "./sim/staff";
import { advanceMinute, createInitialState, type GameState } from "./sim/state";
import { mountHud } from "./ui/hud";
import { mountPanels, type Panels, type PanelTab } from "./ui/panels";
import { initViewport } from "./ui/viewport";

const hudRoot = document.getElementById("hud");
const gameRoot = document.getElementById("game");
if (!hudRoot || !gameRoot) throw new Error("页面缺 #hud / #game 容器");

// 双端骨架：算 --stage-scale 并挂 resize/横竖屏监听。必须在 Phaser 建游戏前跑，
// 否则首帧会以桌面尺寸渲染一帧再被缩放，手机上有可见的跳一下。
initViewport();

function newPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function loadOrCreate(): GameState {
  const raw = localStorage.getItem(SAVE_STORAGE_KEY);
  if (raw) {
    const loaded = deserialize(raw);
    if (loaded) return loaded;
  }
  // 存档种子取时间戳：同一次开局内所有随机都走 state.rng
  return createInitialState(newPlayerId(), Date.now() & 0x7fffffff);
}

const state = loadOrCreate();
let score = scoreRecipe(state.recipe, state.price);
/** 默认 ×4：一天 30 秒，一月 15 分钟，三年约 9 小时 */
let speed = 4;
let panels!: Panels;

const hud = mountHud(hudRoot, {
  onToggleTopping,
  onOpenTab: (tab) => {
    playSfx("ui");
    panels.open(tab as PanelTab);
  },
  onSpeed: (v) => {
    playSfx("ui");
    speed = v;
    refresh();
  },
  getSpeed: () => speed,
  onToggleAudio: () => {
    ensureAudio();
    toggleMuted();
    playSfx("ui");
  },
  getAudioMuted: () => isMuted(),
  onEventChoice: (index) => {
    const pending = state.events.pending;
    const def = pending ? EVENTS_BY_ID.get(pending.id) : undefined;
    const reaction = def ? localReaction(state, def, index) : "";
    resolveEvent(state, index);
    if (reaction) hud.showToast(reaction);
    playSfx("ui");
    refresh();
    tickFeedback();
  },
});

panels = mountPanels(hudRoot, {
  setParam(group, index, value) {
    state.recipe[group][index] = value;
    refresh();
  },
  setPrice(value) {
    state.price = Math.max(1, Math.min(99, Math.round(value)));
    refresh();
  },
  hire(uid) {
    hire(state, uid);
    playSfx("ui");
    refresh();
  },
  fire(uid) {
    fire(state, uid);
    playSfx("ui");
    refresh();
  },
  toggleRest(uid) {
    toggleRest(state, uid);
    playSfx("ui");
    refresh();
  },
  buy(id) {
    buyUpgrade(state, id);
    playSfx("upgrade");
    refresh();
  },
  enterContest() {
    enterContest(state, score.total);
    playSfx("contest");
    refresh();
  },
  dismissReport() {
    state.pendingReport = null;
    playSfx("ui");
    refresh();
  },
});

/** 点配料：增删一碗里的配料，立刻重算四维分并落盘 */
function onToggleTopping(id: string): void {
  const list = state.recipe.toppings;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  playSfx("ui");
  refresh();
}

/* ---------------- 音频 ---------------- */

/**
 * 浏览器要求先有用户手势才允许出声 [KNOWN, HIGH]。
 * 首次点击/按键时解锁并起 BGM；之后静音只影响主增益，不反复重建。
 */
let audioReady = false;
function ensureAudio(): void {
  if (audioReady) return;
  audioReady = true;
  unlockAudio();
  startBgm();
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", ensureAudio, { once: true });
  window.addEventListener("keydown", ensureAudio, { once: true });
}

/* ---------------- 逐分钟反馈 ---------------- */

let prevServed = state.flow.servedToday;
let prevLost = state.flow.lostToday;
let prevCooldown = state.flow.serveCooldown;
let prevMonths = state.months.length;
let prevContest = state.contest.results.length;
let prevEventKey: string | null = null;

/**
 * 音效与事件叙述都由「状态差值」驱动，不往模拟层塞回调：
 * 出餐→收银音、开新碗→下锅音、流失→可惜音、月结→钟声、比赛→号角。
 */
function tickFeedback(): void {
  const s = state;

  if (s.flow.servedToday < prevServed) prevServed = s.flow.servedToday;
  else if (s.flow.servedToday > prevServed) {
    prevServed = s.flow.servedToday;
    playSfx("coin");
  }

  if (s.flow.serveCooldown > prevCooldown) playSfx("bowl");
  prevCooldown = s.flow.serveCooldown;

  if (s.flow.lostToday < prevLost) prevLost = s.flow.lostToday;
  else if (s.flow.lostToday > prevLost) {
    prevLost = s.flow.lostToday;
    playSfx("sad");
  }

  if (s.months.length > prevMonths) {
    prevMonths = s.months.length;
    playSfx("month");
  }
  if (s.contest.results.length > prevContest) {
    prevContest = s.contest.results.length;
    playSfx("contest");
  }

  const pending = s.events.pending;
  const eventKey = pending ? `${pending.id}:${pending.absDay}` : null;
  if (eventKey !== null && eventKey !== prevEventKey) {
    playSfx("event");
    announce(eventKey);
  }
  prevEventKey = eventKey;

  // 喜好发现由 sim 层写一次性信号，这里消费掉并置空——UI 不反向依赖模拟逻辑
  if (s.flow.lastLikeFound) {
    hud.showToast(s.flow.lastLikeFound, "like");
    playSfx("event");
    s.flow.lastLikeFound = null;
  }
  // 熟客回礼同理：sim 层写信号，UI 消费
  if (s.flow.lastGift) {
    hud.showToast(s.flow.lastGift, "like");
    s.flow.lastGift = null;
  }
}

/**
 * 事件文案：先上本地模板（零延迟、离线可玩），
 * 配了 VITE_AI_PROXY_URL 时再异步换成在线叙述；过期事件不覆盖。
 */
function announce(key: string): void {
  const pending = state.events.pending;
  if (!pending) return;
  const def = EVENTS_BY_ID.get(pending.id);
  if (!def) return;

  hud.setEventNarrative(key, localNarrative(state, def));
  void fetchEventNarrative(state, def).then((narrative) => {
    if (!narrative) return;
    const now = state.events.pending;
    if (!now) return;
    if (`${now.id}:${now.absDay}` !== key) return;
    hud.setEventNarrative(key, narrative);
  });
}

/* ---------------- 主循环 ---------------- */

function refresh(): void {
  score = scoreRecipe(state.recipe, state.price);
  hud.render(state, score);
  panels.render(state, score);
  scheduleSave();
}

let saveTimer: number | null = null;
function scheduleSave(): void {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    localStorage.setItem(SAVE_STORAGE_KEY, serialize(state));
  }, 1000);
}

function onMinute(): void {
  // 事件弹窗期间停表：玩家读文案时不该有顾客流失，也不该偷偷推进营业
  const pending = state.events.pending;
  if (pending && EVENTS_BY_ID.has(pending.id)) return;
  advanceMinute(state);
  refresh();
  tickFeedback();
}

refresh();
new Phaser.Game(createGameConfig(onMinute, () => speed, () => state));
