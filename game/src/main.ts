import Phaser from "phaser";
import { fetchEventNarrative, localNarrative, localReaction } from "./ai/director";
import { fetchLine, getLine, localLine, type LineAsk } from "./ai/lines";
import { TOURNEY_BY_ID } from "./data/tourneys";
import { FLAVOR_BY_ID } from "./data/flavor";
import { dimById, tierWord, tierWords } from "./data/tier";
import { tierById } from "./data/guest-tier";
import { tierVoiceContext } from "./sim/guest-tier";
import { todayLine, todayVoiceContext } from "./sim/today";
import { appetiteLineOf, lossWhyOf, markAppetiteSaid, menuLineOf } from "./sim/advice";
import { marketOf, pairedMarketOf } from "./sim/market";
import { learnSpecialty as learnSpecialtyImpl } from "./sim/specialty";
import { enterTourney as enterTourneyImpl, tourneyGate } from "./sim/tourneys";
import { startBgm } from "./audio/bgm";
import { isMuted, toggleMuted, unlockAudio } from "./audio/engine";
import { applyPrefs, loadPrefs } from "./ui/prefs";
import { playSfx } from "./audio/sfx";
import { EVENTS_BY_ID } from "./data/events";
import { createGameConfig } from "./render/world";
import { canEnter, enterContest } from "./sim/contest";
import { applyGrade, gradeOf } from "./sim/grade";
import { districtOptions, moveShop } from "./sim/district";
import { closeBranch, openBranch } from "./sim/branches";
import { branchSizeById } from "./data/branches";
import { districtNameOf } from "./data/nanning";
import { ringDef, visibleRingOf } from "./data/map";
import { takeOverShop } from "./sim/rivals";
import { RIVAL_BY_ID } from "./data/rivals";
import { buyStreet, nextRequest } from "./sim/streets";
import { hookVoiceContext, hookVoiceKeyFor, nextHook } from "./sim/hook";
import { TROPHY_BY_ID } from "./data/trophies";
import { checkTrophies, trophyVoiceContext } from "./sim/trophies";
import { applyMaster as applyMasterImpl } from "./sim/master";
import { buyPack as buyPackImpl } from "./sim/pack";
import { priceOf, setChannel as setChannelImpl, setPrice as setPriceImpl, channelOf, firstRetailMilestone, markRetailVoice } from "./sim/retail";
import { buyGood as buyGoodImpl } from "./sim/goods";
import { PERKS } from "./data/perk";
import { buyPerk as buyPerkImpl } from "./sim/perk";
import { buyInvest as buyInvestImpl } from "./sim/invest";
import { renameDish as renameDishImpl } from "./sim/dish";
import { buyGear } from "./sim/gear";
import { buyStyle, setStyle } from "./sim/style";
import { styleById } from "./data/style";
import { buyBowl as buyBowlImpl, setBowl as setBowlImpl } from "./sim/bowl";
import { qualityOf, setQuality as setQualityImpl } from "./sim/quality";
import { learnSkill as learnSkillImpl } from "./sim/skill";
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
import { buyCustom } from "./sim/custom";
import { buyExpansion } from "./sim/expansion";
import { drinkTempSummary, setDrinkTemp, sideSummary, toggleMealDeal, toggleSide } from "./sim/sides";
import { noodleSummary, setNoodleKind } from "./sim/noodles";
import { setSoupBase as setSoupBaseImpl, soupBaseSummary, thickContext } from "./sim/soupbase";
import { noteById, noteTick, noteVoiceContext, rememberNoodle } from "./sim/notebook";
import { dishNameOfItem, scoreOf } from "./sim/dish";
import { addFavorFree, useFavor as useFavorImpl } from "./sim/favor";
import { mainSummary, portionSummary, setMain, setPortion } from "./sim/mains";
import { addDish, removeDish, selectDish, sellRecipe, syncEditing, toggleDish } from "./sim/menu";
import { rallyMember, resolveRally } from "./sim/rally";
import { fire, hire, toggleRest } from "./sim/staff";
import { ackDayReport, createInitialState, openShop, tickMinute, type GameState } from "./sim/state";
import { openForBusiness, renameShop as renameShopImpl } from "./sim/setup";
import { markManualRead } from "./sim/manual";
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
  // 设置里「操作一览」点开一页也算翻过（批 AG′，解 P413）
  onManualRead: (id: string) => {
    if (markManualRead(state, String(id))) refresh();
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
    const before = state.price;
    state.price = Math.max(1, Math.min(99, Math.round(value)));
    syncEditing(state);
    guide.notify("price");
    // 阿婆的笔记本（批次八）：价签动过就记一笔（涨跌都算，话里说的是怎么动）
    if (state.price !== before) noteTick(state, { priceChanged: true });
    refresh();
  },
  hire(uid) {
    hire(state, uid);
    playSfx("ui");
    refresh();
  },
  learnSpecialty(uid, id) {
    const r = learnSpecialtyImpl(state, uid, id);
    if (!r.ok) {
      hud.showToast(r.reason ?? "学不成", "info");
      return;
    }
    hud.showToast(`${r.def?.name ?? "手艺"}学成了：${r.line ?? ""}`, "like");
    playSfx("upgrade");
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
  rally(id) {
    const r = resolveRally(state, id);
    hud.showToast(r.ok ? r.line : r.reason, r.ok ? "like" : "info");
    if (r.ok) playSfx("upgrade");
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
  buyCustom(id) {
    const r = buyCustom(state, id);
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else hud.showToast(r.line ?? "置办好了", "info");
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
    else {
      hud.showToast(`换粉了：${noodleSummary(state)}`, "info");
      // 阿婆的笔记本（批次八）：换粉是「粉的厚薄」那一页的钥匙
      const tried = rememberNoodle(state, state.noodle);
      noteTick(state, { noodle: state.noodle, noodlesTried: tried });
    }
    playSfx("ui");
    refresh();
  },
  setSoupBase(id) {
    const r = setSoupBaseImpl(state, String(id));
    if (!r.ok && r.reason) hud.showToast(r.reason, "info");
    else {
      // 汤底是「这一款」的属性，改完要落笔（同份量 P47）
      syncEditing(state);
      hud.showToast(r.line ?? `打底换了：${soupBaseSummary(state)}`, "info");
    }
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
  /**
   * 老师傅的方子（A6）：定了就说一句师傅的原话。
   * 话说在 toast 里、不停营业 —— 这是「请人」，不是「装修」。
   */
  /** 袋装线（A7）：一次置办包装机，之后每天按口碑出货 */
  buyPack() {
    const r = buyPackImpl(state);
    if (!r.ok) {
      hud.showToast(r.reason ?? "包装机置办不下来", "info");
      return;
    }
    hud.showToast("包装机转起来了：每天出的那点货，明天打烊就结", "like");
    playSfx("upgrade");
    refresh();
  },
  /** 货架（批次七）：换渠道 —— 量大的渠道抽成多、门槛高 */
  setRetailChannel(id) {
    const ok = setChannelImpl(state, String(id));
    if (!ok) {
      hud.showToast("这条渠道还走不了（要段位或已经在走这条）", "info");
      refresh();
      return;
    }
    const ch = channelOf(state);
    hud.showToast(`改走${ch.name}：${ch.note}`, "like");
    playSfx("upgrade");
    refresh();
  },
  /** 货架（批次七）：每款货的定价，上下各一档 ¥1 */
  stepRetailPrice(id, dir) {
    const base = priceOf(state, String(id));
    const ok = setPriceImpl(state, String(id), base + (dir >= 0 ? 1 : -1));
    if (ok) playSfx("ui");
    refresh();
  },
  /** 街上的门路（批 B′）：花一次钱，买一天的量 */
  renameShop(name) {
    const r = renameShopImpl(state, name);
    if (!r.ok) {
      hud.showToast(r.reason, "info");
    } else {
      hud.showToast(r.line, "like");
      playSfx("ui");
    }
    refresh();
  },
  /** 手册读完一页（批 AD′，解 P387）：只留个印，不弹提示不给奖励 */
  readManual(id) {
    if (markManualRead(state, String(id))) refresh();
  },
  renameDish(itemId, name) {
    const r = renameDishImpl(state, Number(itemId), String(name ?? ""));
    if (!r.ok) {
      hud.showToast(r.reason, "info");
      return;
    }
    playSfx(r.line.includes("改回") ? "ui" : "upgrade");
    hud.showToast(r.line, r.line.includes("改回") ? "info" : "like");
    refresh();
  },
  buyInvest(id) {
    const r = buyInvestImpl(state, String(id));
    if (!r.ok) {
      hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    hud.showToast(r.line, "like");
    playSfx("upgrade");
    speakItem("invest", String(id), r.line);
    refresh();
  },
  /** 手艺点树（批 K′）：花段位给的份量，点一门手上的功夫 */
  buyPerk(id) {
    const r = buyPerkImpl(state, String(id));
    if (!r.ok) {
      hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    hud.showToast(r.line, "like");
    playSfx("upgrade");
    speakPerk(String(id));
    refresh();
  },

  buyGood(id) {
    const r = buyGoodImpl(state, String(id));
    if (!r.ok) {
      hud.showToast(r.reason, "info");
      refresh();
      return;
    }
    hud.showToast(r.line, "like");
    playSfx("upgrade");
    speakItem("good", String(id), r.line);
    refresh();
  },
  applyMaster(index, id) {
    const r = applyMasterImpl(state, Number(index), String(id));
    if (!r.ok) {
      hud.showToast(r.reason ?? "这条方子定不下来", "info");
      return;
    }
    hud.showToast(`${r.def?.name ?? "方子"}：${r.line ?? ""}`, "like");
    playSfx("upgrade");
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
    if (r.ok) {
      playSfx("upgrade");
      // 批次四：评委收笔时抬头说一句（牌子上那句是死的，人是活的）
      const g = gradeOf(state.gradeLevel);
      if (g) {
        hud.showToast(`评委：「${g.remark}」`, "info");
        void fetchLine({
          kind: "grade_voice",
          key: String(g.level),
          context: { 段: g.title, 评: g.remark },
          month: state.month,
          day: state.day,
        }).then((line) => {
          if (line) hud.showToast(`评委说：「${line}」`, "info");
        });
      }
    }
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
  learnSkill(id) {
    const r = learnSkillImpl(state, String(id));
    if (!r.ok) {
      hud.showToast(r.reason ?? "现在练不了", "info");
      refresh();
      return;
    }
    playSfx("upgrade");
    hud.showToast(`手上的功夫：${r.line ?? ""}`, "like");
    refresh();
  },
  setQuality(id) {
    const ok = setQualityImpl(state, String(id));
    if (!ok) {
      refresh();
      return;
    }
    const q = qualityOf(state);
    playSfx("upgrade");
    hud.showToast(`${q.name}：${q.line}`, "like");
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
    // 阿婆的笔记本（批次八）：换过骨档，「猪骨与筒骨」那一页就翻开了
    noteTick(state, { boneChanged: true });
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
/**
 * 批 G′：设置页存的音量/音乐开关要在**第一次出声之前**落到总线上，
 * 否则「上次关了音乐」开局还是会响一声（`startBgm` 的守卫看的是引擎里的开关）。
 */
applyPrefs(loadPrefs());
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
/** 今天街上的事（批次三）说过哪一句 —— 一天只说一次，换天再说 */
let lastMarketDay = "";
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

  // 顾客等级（A8）：识食的挑了一次刺。本地先说「谁、为什么」，
  // 在线句只补他嘴里那一句 —— 数字与判定都在本地。
  if (s.flow.lastTier) {
    const def = tierById(s.flow.lastTier);
    s.flow.lastTier = null;
    if (def && def.id === "picky") {
      const ask = {
        kind: "guest_voice" as const,
        key: def.id,
        context: tierVoiceContext(def),
        month: s.month,
        day: s.day,
      };
      hud.showToast(`识食的：「${localLine(ask)}」`, "info");
      void fetchLine(ask).then((line) => {
        if (line) hud.showToast(`识食的：「${line}」`, "info");
      });
    }
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

  /**
   * 四维九档（批次一）：客人对极端的某一维说一句。
   * 本地句先说（`tierWords` 是这一维这一档的定评），AI 只把它换成更有口气的说法；
   * 拿不到线上句就留着本地那句 —— 评语这一层永远有话说。
   */
  if (s.flow.lastTierVoice) {
    const [dimId, tierText] = s.flow.lastTierVoice.split(":");
    s.flow.lastTierVoice = null;
    const dim = dimId ? dimById(dimId) : null;
    const tier = Number(tierText);
    if (dim && Number.isFinite(tier)) {
      const words = tierWords(dim.id, tier);
      hud.showToast(`${dim.name} ${tierWord(tier)}：${words}`, "info");
      void fetchLine({
        kind: "tier_voice",
        key: `${dim.id}:${tier}`,
        context: { 维: dim.name, 档: tierWord(tier), 看法: dim.what },
        month: s.month,
        day: s.day,
      }).then((line) => {
        if (line) hud.showToast(`客人说：「${line}」`, "info");
      });
    }
  }

  /**
   * 南宁行情（批次三）：一天一句。街坊说的是天气和街上，乘数在本地算，句子不报数。
   */
  {
    /**
     * 阿婆的笔记本（批次八）：翻到新的一页就先弹那句册子上的话，
     * 再让阿婆自己说一句（落点 17 notebook_voice）—— 册子死、口气活。
     */
    if (s.flow.lastNote) {
      const def = noteById(s.flow.lastNote);
      s.flow.lastNote = null;
      if (def) {
        hud.showToast(`阿婆的笔记本 · ${def.title}：${def.body}`, "info");
        void fetchLine({
          kind: "notebook_voice",
          key: def.id,
          context: noteVoiceContext(def),
          month: s.month,
          day: s.day,
        }).then((line) => {
          if (line) hud.showToast(`阿婆说：「${line}」`, "info");
        });
      }
    }
    // 又看得见一圈（批次九）：地图上多揭开一片，街坊提一句
    {
      const ring = visibleRingOf(s.gradeLevel ?? 0);
      const seen = s.flow.lastRing ?? 1;
      if (ring > seen) {
        s.flow.lastRing = ring;
        const def = ringDef(ring);
        hud.showToast(`又看得见一片：${def.name}`, "like");
        void fetchLine({
          kind: "district_voice",
          key: `ring${ring}`,
          context: { 圈: def.name, 事: def.note, 区: districtNameOf(s.district) },
          month: s.month,
          day: s.day,
        }).then((line) => {
          if (line) hud.showToast(`街坊说：「${line}」`, "info");
        });
      }
    }
    const mk = marketOf(s);
    const mKey = mk ? `${mk.id}:${s.month}:${s.day}` : "";
    if (mk && mKey !== lastMarketDay) {
      lastMarketDay = mKey;
      hud.showToast(`${mk.name}：${mk.line}`, "info");
      void fetchLine({
        kind: "market_voice",
        key: mk.id,
        context: { 天: mk.name, 时: mk.when, 事: mk.line },
        month: s.month,
        day: s.day,
      }).then((line) => {
        if (line) hud.showToast(`街坊说：「${line}」`, "info");
      });
    }
  }

  {
    // 零售落点（16）：某款货第一次卖到五十件 —— 买的人不是街坊，是「外面的人」
    const goods = firstRetailMilestone(s);
    if (goods) {
      markRetailVoice(s, goods.id);
      const ch = channelOf(s);
      hud.showToast(`${goods.name}卖过五十件了（${ch.name}）`, "like");
      void fetchLine({
        kind: "retail_voice",
        key: goods.id,
        context: { 货: goods.name, 渠道: ch.name, 买的人: "外面的人" },
        month: s.month,
        day: s.day,
      }).then((line) => {
        if (line) hud.showToast(`外面的人说：「${line}」`, "info");
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
  // 解读层两行（批 C′）：为什么掉人、菜单上哪款不动
  prefetchDayLines();
  speakToday();
  // 胃口这句跟着打烊走：一个月最多一次，白天不打扰
  if (state.dayReport) speakAppetite();
  speakStaffGrow();
  speakSet();
  speakRally();
  speakMarket();
  speakThick();
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
  // 键按天取模：同一个键在服务端缓存里永远是同一句，相邻两天要换说法（试玩 11-22-2109 第 4 条）
  const voiceKey = hookVoiceKeyFor(plan, state.day);
  const id = `${voiceKey}:${state.month}:${state.day}`;
  if (id === lastHookKey) return;
  lastHookKey = id;
  void fetchLine({
    kind: "hook_voice",
    key: voiceKey,
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
 * 解读层的两个落点（批 C′ 第 19、20 个）：`loss_explain` 与 `menu_advice`。
 *
 * 规矩与 `hook_voice` 一样：本地句已经写在打烊单上（带数字、带菜名），
 * 在线句只**原地替换那一格**，不整块 `refresh()` —— 否则玩家看见字自己在变。
 * 键用主因 / 菜名的组合，同一天同一件事只问一次。
 */
let lastWhyKey = "";
/**
 * 批 F′（试玩 11-22-2109 第 5 条）：店铺页「今天」那一条后面跟一句街坊口气。
 * 账是 `sim/today.ts` 算好的，模型只写人味，不许报价、不许算回本。
 * 同一天同一件事只打一次；在线句回来原地替换 `[data-todaybox-voice]`，不整块 refresh。
 */
let lastTodayKey = "";
function speakToday(): void {
  const line = todayLine(state);
  if (!line) return;
  const ask = {
    kind: "pointer_voice" as const,
    key: line.key,
    context: todayVoiceContext(line),
    month: state.month,
    day: state.day,
  };
  const id = `${ask.kind}:${ask.key}:${ask.month}:${ask.day}`;
  if (id === lastTodayKey) return;
  lastTodayKey = id;
  void fetchLine(ask).then((got) => {
    if (!got) return;
    for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-todaybox-voice]"))) {
      node.textContent = `街坊：「${got}」`;
    }
  });
}

let lastGrowLine = "";

/**
 * 店员长进（落点 20）：日结时谁学会了一手，街坊看见会说一句。
 *
 * 只用 `state.staff.lastEvent` 这一行当触发 —— 它由 `settleStaffDay` 写，
 * 没长进的日子是空串，所以这里天然不会天天响。
 */
function speakStaffGrow(): void {
  const said = state.staff?.lastEvent ?? "";
  if (!said || said === lastGrowLine) return;
  lastGrowLine = said;
  const first = state.staff.roster[0];
  if (!first) return;
  const ask: LineAsk = {
    kind: "staff_grow_voice",
    key: first.uid,
    context: { 谁: first.name, 会: said.split("·")[0]?.trim() ?? said },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((line) => {
    if (line) hud.showToast(`街坊说：「${line}」`, "info");
  });
}

let lastSetLine = "";

/**
 * 成套凑齐（落点 23，批 P′，解 P301 之后的那句人话）。
 *
 * 触发只认 `state.dayReport.slotSet` —— 打烊时 `announceSlotSets` 写的，
 * 同一套只写一次，所以这条不会天天响。
 */
let lastRallyKey = "";

/**
 * 批 V′：店员想走那天，街坊在门口说一句。
 * 同一个人同一天只说一次 —— 挂在 `rally.uid + day` 上。
 */
function speakRally(): void {
  const who = rallyMember(state);
  if (!who) return;
  const key = `rally:${who.uid}:${state.month}:${state.day}`;
  if (key === lastRallyKey) return;
  lastRallyKey = key;
  void fetchLine({
    kind: "rally_voice",
    key,
    context: { 人: who.name, 事: "连着几天没歇" },
    month: state.month,
    day: state.day,
  }).then((got) => {
    if (got) hud.showToast(`街坊说：「${got}」`, "info");
  });
}

let lastThickKey = "";

/**
 * 挂汤（落点 29，批 AB′，解 P397）。
 *
 * 猪脚卤水的胶质没有格子可落 —— 不打分、不进乘数，只在打烊那天说一句口感。
 * 同一天只说一次，挂在「碗数 + 日期」上。
 */
function speakThick(): void {
  const bowls = Math.max(0, Math.round(state.dayReport?.thick ?? 0));
  if (bowls <= 0) return;
  const key = `thick:${bowls}:${state.month}:${state.day}`;
  if (key === lastThickKey) return;
  lastThickKey = key;
  void fetchLine({
    kind: "broth_thick_voice",
    key,
    context: thickContext(state),
    month: state.month,
    day: state.day,
  }).then((got) => {
    if (got) hud.showToast(`街坊说：「${got}」`, "info");
  });
}

function speakSet(): void {
  const said = state.dayReport?.slotSet ?? "";
  if (!said || said === lastSetLine) return;
  lastSetLine = said;
  const ask: LineAsk = {
    kind: "set_voice",
    key: said,
    context: { 事: said, 在: "店里的摆设" },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((line) => {
    if (line) hud.showToast(`街坊说：「${line}」`, "info");
  });
}

let lastMarketKey = "";

/**
 * 坏行情撞上好事（落点 24，批 B″，解 P320）。
 *
 * 只在「今天有坏事 + 今天配上了一件好事」时说一句；同一天说一次。
 */
function speakMarket(): void {
  const m = marketOf(state);
  const pair = pairedMarketOf(state);
  if (!m || !pair || !m.pair) return;
  const id = `${m.id}:${pair.id}:${state.month}:${state.day}`;
  if (id === lastMarketKey) return;
  lastMarketKey = id;
  const ask: LineAsk = {
    kind: "market_answer_voice",
    key: `${m.id}:${pair.id}`,
    context: { 事: `街上${m.name}`, 好在: `刚${pair.name}` },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((line) => {
    if (line) hud.showToast(`街坊说：「${line}」`, "info");
  });
}

/** 点了一门手艺（落点 21）：老手艺人看见会搭一句 */
function speakPerk(id: string): void {
  const def = PERKS.find((p) => p.id === id);
  const ask: LineAsk = {
    kind: "perk_voice",
    key: id,
    context: { 族: def?.name ?? "手上的功夫", 事: def?.why ?? "" },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((line) => {
    if (line) hud.showToast(`老师傅说：「${line}」`, "info");
  });
}

/** 买了门路或杂货（落点 22）：旁边有人看见会讲一句 */
function speakItem(where: "invest" | "good", id: string, line: string): void {
  const ask: LineAsk = {
    kind: "item_voice",
    key: `${where}:${id}`,
    context: { 事: line.split("，")[0] ?? line, 在哪: where === "invest" ? "街上的门路" : "店里的杂货" },
    month: state.month,
    day: state.day,
  };
  void fetchLine(ask).then((got) => {
    if (got) hud.showToast(`有人讲：「${got}」`, "info");
  });
}

function prefetchDayLines(): void {
  if (!state.dayReport) return;
  const why = lossWhyOf(state);
  if (why) {
    const ask = {
      kind: "loss_explain" as const,
      key: why.ask.key,
      context: why.ask.context,
      month: state.month,
      day: state.day,
    };
    const id = `${ask.kind}:${ask.key}:${ask.month}:${ask.day}`;
    if (id !== lastWhyKey) {
      lastWhyKey = id;
      void fetchLine(ask).then((line) => {
        if (!line) return;
        const node = document.querySelector<HTMLElement>("[data-loss-line]");
        if (node) node.textContent = line;
      });
    }
  }
  const menuTalk = menuLineOf(state);
  if (menuTalk) {
    const ask = {
      kind: "menu_advice" as const,
      key: menuTalk.ask.key,
      context: menuTalk.ask.context,
      month: state.month,
      day: state.day,
    };
    const id = `${ask.kind}:${ask.key}:${ask.month}:${ask.day}`;
    if (id !== lastMenuKey) {
      lastMenuKey = id;
      void fetchLine(ask).then((line) => {
        if (!line) return;
        const node = document.querySelector<HTMLElement>("[data-menu-line]");
        if (node) node.textContent = line;
      });
    }
  }
}
let lastMenuKey = "";

/**
 * 21 个落点里最后一个：`appetite_voice`（批 C′，解 P247）。
 *
 * 胃口原来只在数值里（加购概率与份量权重），界面上一个字都没有。
 * 这里让它一个月最多说一次，而且**只说感受、不报数字**；
 * 同一句话说完就记月，跨月才可能再说。
 */
function speakAppetite(): void {
  const line = appetiteLineOf(state);
  if (!line) return;
  markAppetiteSaid(state);
  const ask = {
    kind: "appetite_voice" as const,
    key: line.ask.key,
    context: line.ask.context,
    month: state.month,
    day: state.day,
  };
  hud.showToast(`街坊说：「${getLine(ask, localLine(ask))}」`, "info");
  void fetchLine(ask).then((got) => {
    if (!got) return;
    hud.showToast(`街坊说：「${got}」`, "info");
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


