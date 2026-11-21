import Phaser from "phaser";
import { fetchEventNarrative, localNarrative, localReaction } from "./ai/director";
import { fetchLine, getLine, localLine, type LineAsk } from "./ai/lines";
import { TOURNEY_BY_ID } from "./data/tourneys";
import { FLAVOR_BY_ID } from "./data/flavor";
import { enterTourney as enterTourneyImpl, tourneyGate } from "./sim/tourneys";
import { startBgm } from "./audio/bgm";
import { isMuted, toggleMuted, unlockAudio } from "./audio/engine";
import { playSfx } from "./audio/sfx";
import { EVENTS_BY_ID } from "./data/events";
import { createGameConfig } from "./render/world";
import { canEnter, enterContest } from "./sim/contest";
import { applyGrade } from "./sim/grade";
import { districtOptions, moveShop } from "./sim/district";
import { closeBranch, openBranch } from "./sim/branches";
import { branchSizeById } from "./data/branches";
import { districtNameOf } from "./data/nanning";
import { takeOverShop } from "./sim/rivals";
import { RIVAL_BY_ID } from "./data/rivals";
import { buyStreet, nextRequest } from "./sim/streets";
import { hookVoiceContext, nextHook } from "./sim/hook";
import { TROPHY_BY_ID } from "./data/trophies";
import { checkTrophies, trophyVoiceContext } from "./sim/trophies";
import { buyGear } from "./sim/gear";
import { buyStyle, setStyle } from "./sim/style";
import { styleById } from "./data/style";
import { buyBowl as buyBowlImpl, setBowl as setBowlImpl } from "./sim/bowl";
import { bowlById } from "./data/bowl";
import { setBone as setBoneImpl, setRice as setRiceImpl } from "./sim/materials";
import { boneById, riceById } from "./data/grades";
import type { ContestTypeId } from "./data/contest";
import { resolveEvent } from "./sim/events";
import { deserialize, serialize, SAVE_STORAGE_KEY } from "./sim/save";
import { guideState, mountGuide, type Guide } from "./ui/guide";
import {
  beaconPlaytest,
  deviceId,
  downloadPlaytest,
  flushTelemetry,
  getDays,
  getSamples,
  loadTelemetry,
  recordSample,
  summarize,
  uploadEnabled,
  uploadPending,
  uploadPlaytest,
} from "./sim/telemetry";
import {  } from "./sim/score";
import { buyUpgrade } from "./sim/shop";
import { buyEquipment } from "./sim/equipment";
import { buyExpansion } from "./sim/expansion";
import { drinkTempSummary, setDrinkTemp, sideSummary, toggleMealDeal, toggleSide } from "./sim/sides";
import { noodleSummary, setNoodleKind } from "./sim/noodles";
import { dishNameOfItem, scoreOf } from "./sim/dish";
import { addFavorFree, useFavor as useFavorImpl } from "./sim/favor";
import { mainSummary, portionSummary, setMain, setPortion } from "./sim/mains";
import { addDish, removeDish, selectDish, sellRecipe, syncEditing, toggleDish } from "./sim/menu";
import { fire, hire, toggleRest } from "./sim/staff";
import { ackDayReport, createInitialState, openShop, tickMinute, type GameState } from "./sim/state";
import { openForBusiness } from "./sim/setup";
import { mountSetup, type SetupScreen } from "./ui/setup";
import { mountArena, type ArenaUi } from "./ui/arena";
import { COMMAND_BY_ID, COMMAND_KEY_MAP, arenaById } from "./data/arena";
import { startArena } from "./sim/arena";
import { mountHud } from "./ui/hud";
import { applyPalette } from "./ui/palette";
import { mountIcons } from "./ui/icons";
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
let score = scoreOf(state);
/** 默认 ×4：一天 30 秒，一月 15 分钟，三年约 9 小时 */
// 默认 1 倍（I-16）：开局就 ×4，玩家还没看懂一天怎么过，日结单已经弹了两次。
let speed = 1;
let panels!: Panels;

// 埋点：先读回历史采样（跨刷新保留），再开始记这一局
loadTelemetry();

/**
 * 引导必须挂在 mountHud 之后：mountHud 会重写 #hud 的 innerHTML，
 * 先挂会被整块抹掉（第一版就是这么消失的）。
 */
let guide: Guide;

// 像素化的两件启动活：先把 12 色板同步成 CSS 变量（画布与内联样式要读），
// 再把 24×24 图标图集插进 body —— hud 会重写 #hud 的 innerHTML，所以图集只能挂在 body 上。
applyPalette();
mountIcons();

const hud = mountHud(hudRoot, {
  onToggleTopping,
  onOpenTab: (tab) => {
    playSfx("ui");
    if (tab === "recipe") guide.notify("recipe");
    panels.open(tab as PanelTab);
    // 面板内容是在 render 里填的，而 render 跟着游戏 tick 走 ——
    // 准备阶段时间不推进，没有 tick，于是刚打开的面板是空的（真 bug）。
    refresh();
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
  // 开门营业：一天三态里唯一能把时间放走的动作
  onOpenShop: () => {
    if (openShop(state)) {
      guide.notify("open");
      playSfx("ui");
      hud.showToast("开门了，客人陆续进店", "like");
    }
    refresh();
    tickFeedback();
  },
  // 日结单「明天继续」：清日结，回到次日准备
  onNextDay: () => {
    if (ackDayReport(state)) {
      playSfx("ui");
      hud.showToast("新的一天，先看看配方和价牌", "info");
    }
    refresh();
    tickFeedback();
  },
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

guide = mountGuide(hudRoot, () => {
  hud.showToast("引导完成，接下来看你自己", "info");
});

/**
 * 建店界面（S0）挂在 document.body 上，不挂 #hud：
 *   - `#hud` 会被 mountHud 重写 innerHTML（挂在里面会被抹掉）；
 *   - `#stage` 带 transform 缩放，`position:fixed` 的子元素会跟着缩放，
 *     在手机上小到看不清。挂 body 才是真正的视口定位。
 */
const setupScreen: SetupScreen = mountSetup(document.body, {
  onOpen: (siteId, shopName) => {
    const r = openForBusiness(state, siteId, shopName);
    if (!r.ok) {
      hud.showToast(r.reason ?? "开张失败", "info");
      return false;
    }
    playSfx("upgrade");
    hud.showToast(`${shopName} 开张了，先调好一碗粉的味道`, "like");
    score = scoreOf(state);
    refresh();
    tickFeedback();
    return true;
  },
});

const arenaUi: ArenaUi = mountArena(document.body, {
  getState: () => state,
  onDone: () => {
    refresh();
  },
  onReplay: () => {
    if (!lastArenaId) return;
    const r = startArena(state, lastArenaId);
    if (!r.ok) hud.showToast(r.reason ?? "今天落不了了", "info");
    refresh();
  },
});


panels = mountPanels(hudRoot, {
  setParam(group, index, value) {
    state.recipe[group][index] = value;
    // 配方是「这一款」的属性（P47）：改完立刻落笔，否则切到另一款时这一款的滑块白调
    syncEditing(state);
    refresh();
  },
  setPrice(value) {
    state.price = Math.max(1, Math.min(99, Math.round(value)));
    syncEditing(state);
    guide.notify("price");
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
  buyEquip(id) {
    const r = buyEquipment(state, id);
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(r.line ?? "设备换了，明天出碗更快", "info");
    playSfx("upgrade");
    refresh();
  },
  buyExpand() {
    const r = buyExpansion(state);
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(`扩好了：座位 ${state.venue.seats} · 灶 ${state.venue.stoves}`, "info");
    playSfx("upgrade");
    refresh();
  },
  toggleSide(id) {
    const r = toggleSide(state, String(id));
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(sideSummary(state), "info");
    playSfx("ui");
    refresh();
  },
  setNoodle(id) {
    const r = setNoodleKind(state, String(id));
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(`换粉了：${noodleSummary(state)}`, "info");
    playSfx("ui");
    refresh();
  },
  setMain(id) {
    const r = setMain(state, String(id));
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(`换主料了：${mainSummary(state)}`, "info");
    playSfx("ui");
    refresh();
  },
  setPortion(size) {
    const r = setPortion(state, Number(size));
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(portionSummary(state), "info");
    // 份量是「这一款」的属性，改完要落笔（P47）
    syncEditing(state);
    playSfx("ui");
    refresh();
  },
  pickDish(index) {
    const r = selectDish(state, Number(index));
    if (!r.ok) hud.showToast(r.reason ?? "换不了这款", "info");
    playSfx("ui");
    refresh();
  },
  addDish() {
    const r = addDish(state);
    if (!r.ok) hud.showToast(r.reason ?? "加不了新款", "info");
    else hud.showToast("加了一款，照着这碗改改就能卖", "like");
    playSfx("upgrade");
    refresh();
  },
  removeDish(index) {
    const r = removeDish(state, Number(index));
    if (!r.ok) hud.showToast(r.reason ?? "删不掉这款", "info");
    playSfx("ui");
    refresh();
  },
  toggleDish(index) {
    const r = toggleDish(state, Number(index));
    if (!r.ok) hud.showToast(r.reason ?? "改不了上下架", "info");
    playSfx("ui");
    refresh();
  },
  sellRecipe(index) {
    const item = state.menu[Number(index)];
    const name = item ? dishNameOfItem(state, item) : "这一款";
    const r = sellRecipe(state, Number(index));
    if (!r.ok) {
      hud.showToast(r.reason ?? "转不了手", "info");
    } else {
      const got = addFavorFree(state, r.favor ?? 0, `「${name}」转手了`);
      hud.showToast(`把「${name}」转手，换来 ${got} 点人情`, "like");
      playSfx("upgrade");
      // 落点③：收配方那人说一句。异步补一条 toast，不挡手的动作；拿不到就只留上面那句
      void fetchLine({
        kind: "recipe_buyer",
        key: item ? `${item.noodle}-${item.main}` : "unknown",
        context: { 粉: name, 街: districtNameOf(state.district) },
        month: state.month,
        day: state.day,
      }).then((line) => {
        if (line) hud.showToast(`收配方的人说：「${line}」`, "info");
      });
    }
    refresh();
  },
  useFavor(id) {
    const r = useFavorImpl(state, String(id));
    if (!r.ok) hud.showToast(r.reason ?? "人情不够", "info");
    else hud.showToast(r.line ?? "街坊帮了一把", "like");
    playSfx(r.ok ? "upgrade" : "ui");
    refresh();
  },
  toggleMealDeal() {
    toggleMealDeal(state);
    hud.showToast(state.sides.mealDeal ? "套餐开了：饮料少收 ¥1，客人觉得划算" : "套餐关了", "info");
    playSfx("ui");
    refresh();
  },
  setDrinkTemp(temp) {
    const r = setDrinkTemp(state, String(temp) === "hot" ? "hot" : "ice");
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(drinkTempSummary(state), "info");
    playSfx("ui");
    refresh();
  },
  enterContest(type) {
    const r = enterContest(state, type as ContestTypeId);
    if (!r) {
      hud.showToast(canEnter(state).reason || "现在报不了名", "info");
    } else {
      hud.showToast(
        `${type === "staff" ? "后厨擂台" : type === "customers" ? "街坊口碑赛" : "招牌评比"} 第 ${r.rank} 名 · 奖金 ¥${r.prize.toLocaleString("zh-CN")}`,
        r.rank <= 3 ? "like" : "info",
      );
    }
    playSfx("contest");
    refresh();
  },
  enterTourney(id) {
    const def = TOURNEY_BY_ID.get(String(id));
    if (!def) {
      refresh();
      return;
    }
    const gate = tourneyGate(state, def);
    const r = gate.ok ? enterTourneyImpl(state, def.id) : null;
    if (!r) {
      hud.showToast(gate.reason || "现在报不上", "info");
    } else {
      const tone = r.rank <= 3 ? "like" : "info";
      hud.showToast(`${def.name} 第 ${r.rank} 名 · 奖金 ¥${r.prize.toLocaleString("zh-CN")}`, tone);
      // AI 第 7 落点：主办方在开场时说的那句话（本地先给，远端异步换）
      const ask = {
        kind: "tourney_open" as const,
        key: def.id,
        context: { 场: def.name, 主办: def.host },
        month: state.month,
        day: state.day,
      };
      const first = getLine(ask, localLine(ask));
      if (first) hud.showToast(`主持：「${first}」`, "info");
      void fetchLine(ask).then((line) => {
        if (line) hud.showToast(`主持：「${line}」`, "info");
      });
    }
    playSfx("contest");
    refresh();
  },
  applyGrade() {
    const r = applyGrade(state);
    hud.showToast(r.reason, r.ok ? "like" : "info");
    if (r.ok) playSfx("upgrade");
    refresh();
  },
  moveDistrict(id) {
    const r = moveShop(state, id);
    if (r.ok) {
      const d = districtOptions(state).find((o) => o.id === id);
      hud.showToast(`搬到${d?.name ?? id}：转让费 ¥${r.paid?.toLocaleString("zh-CN")}，日客流 ${d?.effective ?? "?"}`, "like");
      playSfx("upgrade");
    } else if (r.reason) {
      hud.showToast(r.reason, "info");
    }
    refresh();
  },
  pickBranchDistrict(id) {
    // 只是界面状态：选中哪个区（真正开张在 openBranch）
    const d = districtNameOf(String(id));
    if (d) hud.showToast(`分店选址：${d}`, "info");
    refresh();
  },
  openBranch(size, district) {
    const def = branchSizeById(String(size));
    const r = openBranch(state, String(district), String(size));
    if (r.ok) {
      const d = districtNameOf(String(district));
      hud.showToast(`在${d || "外区"}开了${def?.name ?? "分店"}：转让费 ¥${(def?.openFeeYuan ?? 0).toLocaleString("zh-CN")}`, "like");
      playSfx("upgrade");
    } else if (r.reason) {
      hud.showToast(r.reason, "info");
    }
    refresh();
  },
  restart() {
    if (!window.confirm("新开一局？现在的存档会被清掉，从选铺位重新开始。")) return;
    localStorage.removeItem(SAVE_STORAGE_KEY);
    localStorage.removeItem("laoyou.guide.v2");
    location.reload();
  },
  buyGear(id) {
    const r = buyGear(state, String(id));
    if (r.ok) {
      playSfx("upgrade");
      hud.showToast(r.line ?? "搬进来了", "like");
    } else if (r.reason) {
      hud.showToast(r.reason, "info");
    }
    refresh();
  },
  buyStyle(id) {
    const r = buyStyle(state, String(id));
    if (!r.ok) {
      if (r.reason) hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    playSfx("upgrade");
    hud.showToast(r.line ?? "装修好了", "like");
    speakStyle(String(id));
    refresh();
  },
  setStyle(id) {
    const r = setStyle(state, String(id));
    if (!r.ok) {
      if (r.reason) hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    playSfx("upgrade");
    hud.showToast(r.line ?? "换好了", "like");
    refresh();
  },
  buyBowl(id) {
    const r = buyBowlImpl(state, String(id));
    if (!r.ok) {
      if (r.reason) hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    playSfx("upgrade");
    hud.showToast(r.line ?? "碗换好了", "like");
    speakBowl(String(id));
    refresh();
  },
  setBowl(id) {
    const r = setBowlImpl(state, String(id));
    if (!r.ok) {
      if (r.reason) hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    playSfx("upgrade");
    hud.showToast(r.line ?? "换好了", "like");
    refresh();
  },
  setRice(id) {
    const rid = String(id);
    if (!setRiceImpl(state, rid)) {
      refresh();
      return;
    }
    const def = riceById(rid);
    playSfx("upgrade");
    hud.showToast(`换成${def?.name ?? "新米"}：${def?.look ?? ""}`, "info");
    refresh();
  },
  setBone(id) {
    const bid = String(id);
    if (!setBoneImpl(state, bid)) {
      refresh();
      return;
    }
    const def = boneById(bid);
    playSfx("upgrade");
    hud.showToast(`换成${def?.name ?? "新骨"}：${def?.look ?? ""}`, "info");
    refresh();
  },
  startArena(id) {
    const r = startArena(state, String(id));
    if (!r.ok) {
      hud.showToast(r.reason ?? "今天落不了场", "info");
    } else {
      lastArenaId = String(id);
      playSfx("upgrade");
      // 落点④：局内的三声喊，开局前一次性预取。局里只读缓存，绝不卡帧
      const arenaDef = arenaById(String(id));
      for (let i = 0; i < 3; i++) {
        void fetchLine({
          kind: "arena_call",
          key: `${String(id)}:${i}`,
          context: { 场: arenaDef ? arenaDef.name : "落场" },
          month: state.month,
          day: state.day,
        });
      }
    }
    refresh();
  },
  buyStreet(id) {
    const r = buyStreet(state, String(id));
    if (r.ok) {
      playSfx("upgrade");
      hud.showToast(r.line ?? "修好了", "like");
    } else if (r.reason) {
      hud.showToast(r.reason, "info");
    }
    refresh();
  },
  takeOver(id) {
    const r = takeOverShop(state, String(id));
    if (r.ok) {
      playSfx("upgrade");
      hud.showToast(r.line ?? "铺子盘下来了", "info");
    } else if (r.reason) {
      hud.showToast(r.reason, "info");
    }
    refresh();
  },
  closeBranch(id) {
    const r = closeBranch(state, String(id));
    if (r.ok) {
      hud.showToast(`关掉一家分店，退回押金 ¥${(r.refund ?? 0).toLocaleString("zh-CN")}`, "info");
    } else if (r.reason) {
      hud.showToast(r.reason, "info");
    }
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
  guide.notify("topping");
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
let prevLostReason: string | null = null;

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

  // 「看价牌走了」必须被玩家看见——否则涨价像白捡钱，是体验谎言
  const reason = s.flow.lastLostReason;
  if (reason && reason !== prevLostReason) {
    prevLostReason = reason;
    hud.showToast(reason, "info");
  }

  // 热卖开始要报喜：这是玩家自己经营出来的（排队＋满意），必须让 ta 知道成了
  if (s.flow.lastFrenzy) {
    hud.showToast(s.flow.lastFrenzy, "like");
    s.flow.lastFrenzy = null;
  }

  // 凑出加料组合（老友味/酸辣开胃）—— 客人自己点的，报一句就够，不刷屏
  if (s.flow.lastSides) {
    hud.showToast(s.flow.lastSides, "like");
    s.flow.lastSides = null;
  }

  // 人情（M3b）：吃到底 / 回礼 / 转手 / 比赛名次攒到点数时报一句
  // 味道层（B1）：第一次凑成某条成型吃法 —— 本地先说清是哪条，AI 只补一句街坊的话
  if (s.flow.lastFlavor) {
    const def = FLAVOR_BY_ID.get(s.flow.lastFlavor);
    s.flow.lastFlavor = null;
    if (def) {
      hud.showToast(`味道 · ${def.name}：${def.line}`, "like");
      playSfx("upgrade");
      void fetchLine({
        kind: "flavor_voice",
        key: def.id,
        context: { 名: def.name, 时: def.when },
        month: s.month,
        day: s.day,
      }).then((line) => {
        if (line) hud.showToast(`街坊说：「${line}」`, "info");
      });
    }
  }

  if (s.flow.lastFavor) {
    hud.showToast(s.flow.lastFavor, "like");
    s.flow.lastFavor = null;
  }

  // 同条街的动静（有人关门 / 有人服气 / 街坊送食材）：一个月一句，不能刷屏
  if (s.flow.lastStreet) {
    hud.showToast(s.flow.lastStreet, "info");
    s.flow.lastStreet = null;
  }

  // 成就（B 批）：日结一次可能同时拿几枚，一帧弹一条，弹完清队列。
  // 名字、条件、奖励全部本地算；AI 只补一句街坊的话（trophy_voice）。
  if ((s.pendingTrophies ?? []).length > 0) {
    const id = s.pendingTrophies[0];
    const def = id ? TROPHY_BY_ID.get(id) : undefined;
    s.pendingTrophies.shift();
    if (def) {
      const reward = [
        def.reward.favor ? `人情 +${def.reward.favor}` : "",
        def.reward.cash ? `¥${def.reward.cash}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      hud.showToast(`成就 · ${def.name}${reward ? `（${reward}）` : ""}：${def.hint}`, "like");
      playSfx("upgrade");
      const ask: LineAsk = {
        kind: "trophy_voice",
        key: def.id,
        context: trophyVoiceContext(def),
        month: s.month,
        day: s.day,
      };
      void fetchLine(ask).then((line) => {
        if (line) hud.showToast(`街坊说：「${line}」`, "info");
      });
    }
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
  score = scoreOf(state);
  hud.render(state, score);
  panels.render(state, score);
  guide.render(state);
  setupScreen.render(state);
  arenaUi.render();
  // 打烊单一出就补那句口吻（内部按「钩子键:月:日」节流，一天最多一次）
  prefetchHookLine();
  scheduleSave();
}

let lastArenaId = "";
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
  // 一天三态：只在「营业中」走时间。开门前、打烊后的日结单没确认时，时钟不动
  if (!tickMinute(state)) return;
  const monthsBefore = state.months.length;
  recordSample(state, score.total);
  if (state.months.length > monthsBefore) flushTelemetry();
  // 飞轮自动运转：不再依赖玩家按 Shift+E / Shift+U。
  // 每分钟问一次，节流在 uploadPlaytest 内部（≥10 分钟才传、间隔≥2 分钟、每推进 15 分钟补一次）。
  void uploadPlaytest();
  void prefetchLines();
  refresh();
  tickFeedback();
}

/**
 * AI 文案预取（落点 ①②）：每天最多问一次代理，回来就 refresh 换字。
 *
 * 只预取「会被看到的那几条」：街坊今天提的那件事 + 本区抢得最凶的两家同行传闻。
 * 拿不到就一直是本地句，界面上不留痕迹；也绝不因为等文案而卡钟。
 */
let lastLineDay = -1;
async function prefetchLines(): Promise<void> {
  const dayKey = state.month * 100 + state.day;
  if (dayKey === lastLineDay) return;
  lastLineDay = dayKey;

  const req = nextRequest(state);
  const mine = state.district || "xingning";
  const hot = (state.rivals ?? [])
    .filter((r) => !r.closed && RIVAL_BY_ID.get(r.id)?.district === mine)
    .slice(0, 2);

  const asks: LineAsk[] = [];
  if (req) {
    asks.push({ kind: "street_request", key: req.id, context: { 街: req.name }, month: state.month, day: state.day });
  }
  for (const r of hot) {
    const def = RIVAL_BY_ID.get(r.id);
    if (!def) continue;
    asks.push({ kind: "rival_rumor", key: def.id, context: { 店: def.name }, month: state.month, day: state.day });
  }
  if (asks.length === 0) return;

  let got = false;
  await Promise.all(
    asks.map((ask) =>
      fetchLine(ask).then((line) => {
        if (line) got = true;
      }),
    ),
  );
  if (got) refresh();
}

/**
 * 打烊单上「明天 · …」下面那句口吻：打烊之后才算得出来，所以单独预取一次。
 *
 * 数字在上面那行（本地算的），这里只要一句「为什么该这么干」，
 * 拿不到就一直用本地池那句 —— 打烊单不会因为 AI 挂了而空着。
 */
let lastHookKey = "";
function prefetchHookLine(): void {
  if (!state.dayReport) return;
  const plan = nextHook(state);
  if (plan.kind === "none") return;
  const id = `${plan.key}:${state.month}:${state.day}`;
  if (id === lastHookKey) return;
  lastHookKey = id;
  void fetchLine({
    kind: "hook_voice",
    key: plan.key,
    context: hookVoiceContext(plan),
    month: state.month,
    day: state.day,
  }).then((line) => {
    // 试玩二轮 F4：拿到在线句**不要整块 refresh()**。
    // 重渲染会把打烊单其他行也重画一遍，玩家看到的是「字自己变了」；
    // 这里只把副行那一格原地换掉，一次、不来回。
    if (!line) return;
    const node = document.querySelector<HTMLElement>("[data-hook-line]");
    if (node) node.textContent = line;
  });
}

/**
 * A1 店的样子的 AI 落点（第 9 个 `style_voice`）：换上新门面时街坊顺口一句。
 * 只用在线句替换 toast，本地句已经在 `buyStyle` 的 `line` 里说过了，
 * 所以拿不到就什么都不做 —— 不重复说同一件事。
 */
function speakStyle(id: string): void {
  const def = styleById(id);
  if (!def) return;
  const ask: LineAsk = {
    kind: "style_voice",
    key: id,
    context: { 店: def.name, 门头: def.parts.entrance },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((line) => {
    if (line) hud.showToast(`街坊说：「${line}」`, "info");
  });
}

/**
 * A4 碗的 AI 落点（第 10 个 `bowl_voice`）：换上新碗时客人端着说一句。
 * 与 `style_voice` 同一个规矩：本地句已经由 `buyBowl` 的 `line` 说过，
 * 在线句只用来补一句「端着这只碗的人怎么说」，拿不到就不说。
 */
function speakBowl(id: string): void {
  const def = bowlById(id);
  if (!def) return;
  const ask: LineAsk = {
    kind: "bowl_voice",
    key: id,
    context: { 碗: def.name, 样子: def.look.slice(0, 24) },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((line) => {
    if (line) hud.showToast(`客人说：「${line}」`, "info");
  });
}

refresh();
recordSample(state, score.total);
// 埋点兜底落盘：关页/切后台/每分钟都可能来不及走月结
window.addEventListener("pagehide", () => {
  flushTelemetry();
  beaconPlaytest();
});
window.addEventListener("beforeunload", flushTelemetry);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushTelemetry();
    void uploadPlaytest();
  }
});
// 断网时攒着，回网立刻补传（uploadPlaytest 内部有 pending 标记）
window.addEventListener("online", () => {
  void uploadPlaytest(true);
});
// 落场（M4）：擂台上按 1 / 2 / 3 出招，Esc 收摊。擂台不在的时候这几个键什么都不做
window.addEventListener("keydown", (e) => {
  if (!arenaUi.isOpen()) return;
  if (e.key === "Escape") {
    arenaUi.flee();
    e.preventDefault();
    return;
  }
  const cmd = COMMAND_BY_ID.get(COMMAND_KEY_MAP[e.key] ?? "");
  if (!cmd) return;
  arenaUi.strike(cmd.id);
  e.preventDefault();
});
// 试玩记录一键导出：Shift+E 下载 playtest-YYYYMMDD.json（放到 game/data/playtest/ 我就能读）
// 在线模式还会自动上传；Shift+U 手动催一次上传
window.addEventListener("keydown", (e) => {
  if (e.shiftKey && (e.key === "E" || e.key === "e")) {
    const name = downloadPlaytest();
    hud.showToast(`试玩记录已导出：${name}`, "like");
  }
  if (e.shiftKey && (e.key === "U" || e.key === "u")) {
    void uploadPlaytest(true).then((r) => {
      hud.showToast(r.ok ? `试玩记录已上传（${r.id ?? "ok"}）` : `未上传：${r.skipped ?? r.error ?? "?"}`, r.ok ? "like" : "info");
    });
  }
});

// 验收/复盘用的只读出口：不参与游戏逻辑，纯观测
declare global {
  interface Window {
    __laoyou?: {
      state: GameState;
      samples: typeof getSamples;
      days: typeof getDays;
      summary: typeof summarize;
      guide: typeof guideState;
      export: typeof downloadPlaytest;
      upload: typeof uploadPlaytest;
      online: typeof uploadEnabled;
      flush: typeof flushTelemetry;
      pending: typeof uploadPending;
      device: typeof deviceId;
      refresh: () => void;
      prefetch: () => Promise<void>;
      hook: () => void;
      /** 手动跑一次成就判定（验收用；正常时机是 endDay） */
      trophies: () => number;
      /** 手动跑一次反馈消费（验收用；正常时机是下一分钟推进） */
      feedback: () => void;
    };
  }
}
window.__laoyou = {
  state,
  samples: getSamples,
  days: getDays,
  summary: summarize,
  guide: guideState,
  export: downloadPlaytest,
  upload: uploadPlaytest,
  online: uploadEnabled,
  flush: flushTelemetry,
  pending: uploadPending,
  device: deviceId,
  refresh: () => refresh(),
  prefetch: () => prefetchLines(),
  hook: () => prefetchHookLine(),
  trophies: () => checkTrophies(state).length,
  feedback: () => tickFeedback(),
};

new Phaser.Game(createGameConfig(onMinute, () => speed, () => state));


