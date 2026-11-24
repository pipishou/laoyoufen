import { CONTEST_RIVALS, CONTEST_TIERS, CONTEST_TYPES, CONTEST_TYPE_BY_ID, tierOf } from "../data/contest";
import { retailLines, retailSummary, channelOf, retailThroughput, retailBowlLoad } from "../sim/retail";
import { goodsSummary, goodsViews, goodWords } from "../sim/goods";
import { perkFamilies, perkPoints, perkSummary, perkViews } from "../sim/perk";
import { investSummary, investViews, investWords } from "../sim/invest";
import { CHANNELS, PRICE_FLOOR, PRICE_CEIL } from "../data/retail";
import { BOWL } from "../data/anchors";
import { CUSTOMER_ARCHETYPES, LIKE_DIMS_ORDER, LIKE_LABELS, likeValueLabel } from "../data/customers";
import { TOPPINGS } from "../data/ingredients";
import { EQUIPMENT, STATION_EQUIP, STATION_NAMES, STATION_ORDER, type StationId } from "../data/equipment";
import { HIRE_FEE_RATE, MAX_STAFF, ROLE_LABEL, monthlyWageOf, nextStaffNeed, staffSlots } from "../data/staff";
import { UPGRADES } from "../data/shop";
import { collectionProgress, likeStats, LIKES_TOTAL } from "../sim/collection";
import { canEnter, contestScore, maxTierOf } from "../sim/contest";
import { arenaSummary, arenaViews } from "../sim/arena";
import { isContestMonth, monthsToContest } from "../sim/calendar";
import { appetiteWords, districtOptions, homeAppetiteOf, homeEnergyOf } from "../sim/district";
import { tightWords } from "../sim/bottleneck";
import { hasGear } from "../sim/gear";
import { GEARS } from "../data/gear";
import { checkGrade } from "../sim/grade";
import { equipLevel, equipNextCost, slowestStation, stageMinutes, stationCount } from "../sim/equipment";
import { EXPANSIONS, EXPANSION_ORDER } from "../data/expansion";
import { expansionLevel, expansionLockReason, nextExpansion } from "../sim/expansion";
import { gradeOf, unlockViews } from "../sim/unlocks";
import { kindLabel, drinkTempSummary, sideShareOf, sideSummary, sideViews } from "../sim/sides";
import { noodleSummary, noodleViews } from "../sim/noodles";
import { bowlPriceOf, mainSummary, mainViews, portionSummary } from "../sim/mains";
import { PORTIONS, portionOf, suggestPriceWithMain } from "../data/mains";
import { dishNameOf, dishNameOfItem, isHouseBowl } from "../sim/dish";
import { menuCap, menuSummary, menuViews } from "../sim/menu";
import { masterOf, masterViews } from "../sim/master";
import { tierLine } from "../sim/tier";
import { todayLine } from "../sim/today";
import { noteSummary, noteViews } from "../sim/notebook";
import { NOTE_GROUPS } from "../data/notebook";
import { PACK_SETUP } from "../data/pack";
import { packOwned, packRateWords, packSkuLines, packSkuWords, packSummary } from "../sim/pack";
import { newsDate, newsList, newsSummary } from "../sim/news";
import { MANUAL_TOTAL, manualSections } from "../data/manual";
import { placeLineOf, placeShortsOf } from "../data/places";
import { dishNoteOf } from "../data/dish-name";
import { branchSizeOptions, branchSummary, branchViews } from "../sim/branches";
import { MAX_BRANCHES, MANAGER_MONTHLY } from "../data/branches";
import { districtNameOf } from "../data/nanning";
import { rivalViews, standingOf, streetSummary } from "../sim/rivals";
import { priceWarWords } from "../sim/price-war";
import { FAMILY_NAMES, type SkillFamily } from "../data/skill";
import { skillEffectWords, skillLine, skillSummary, skillViews } from "../sim/skill";
import { qualitySummary, qualityViews, qualityWords } from "../sim/quality";
import { nextRequest, streetMap, streetSummary as blockSummary, streetViews } from "../sim/streets";
import { GEAR_EFFICIENCY_IDS, gearEfficiencyLeft, gearSummary, gearViews } from "../sim/gear";
import { comboSummary, comboViews } from "../sim/combo";
import { GEAR_BY_ID, GEAR_SPOT_LABEL } from "../data/gear";
import { shopMap, shopMapSummary } from "../sim/shopmap";
import { nextHook } from "../sim/hook";
import { favorSummary, favorViews } from "../sim/favor";
import { TROPHY_GROUP_LABEL, TROPHY_GROUP_ORDER } from "../data/trophies";
import { DIMS, TIER_WORDS, tierWord } from "../data/tier";
import { FLAVORS, FLAVOR_TOTAL, type FlavorEffect } from "../data/flavor";
import { noodleById } from "../data/noodles";
import { flavorSummary, flavorViews, nearlyFlavor } from "../sim/flavor";
import { PAIRING_TOTAL, type PairingEffect } from "../data/pairing";
import { pairingSummary, pairingViews } from "../sim/pairing";
import { type GradeDef } from "../data/grades";
import { boneViews, gradeSummary, riceViews } from "../sim/materials";
import { nextTrophy, trophySummary, trophyViews } from "../sim/trophies";
import { STYLES, STYLE_PART_LABEL } from "../data/style";
import { nextStyle, styleSummary, styleViews } from "../sim/style";
import { BOWLS, BOWL_BY_ID, BOWL_TOTAL } from "../data/bowl";
import { bowlSummary, bowlViews, currentBowl, nextBowl } from "../sim/bowl";
import { levelProgressOf, tourneySummary, tourneyViews } from "../sim/tourneys";
import { devNote } from "./dev";
import { getLine, remoteLineCount } from "../ai/lines";
import { icon, type IconName } from "./icons";
import { specialtiesOfRole } from "../data/specialty";
import { FINISH_SKILL_TOTAL, STAFF_SKILL_TOTAL } from "../data/staff-skill";
import { specialtySummary } from "../sim/specialty";
import { growWords } from "../sim/staff-grow";
import { rallyMember, rallyViews, rallyWords } from "../sim/rally";
import { mapCells, mapSize, mapSummary, districtPitchOf } from "../sim/map";
import { localSummary } from "../sim/local";
import { filledCount, layoutOf, layoutSummary, slotSetSummary, slotSetViews, slotSetWords, stageCells } from "../sim/slots";
import type { RecipeScore } from "../sim/score";
import { upgradeCost, upgradeLevel } from "../sim/shop";
import { bowlMinutes, dailyWage } from "../sim/staff";
import { SERVE_MINUTES } from "../sim/customer";
import { equipServeMultiplier } from "../sim/equipment";
import type { GameState, MenuItem } from "../sim/state";

export type PanelTab =
  | "recipe"
  | "staff"
  | "shop"
  | "perk"
  | "contest"
  | "collection"
  | "ledger";

const TAB_TITLE: Record<PanelTab, string> = {
  recipe: "配方研发 · 汤 / 粉 / 浇头",
  staff: "员工 · 招募与疲劳",
  shop: "店铺 · 门面与手艺",
  perk: "手艺 · 点数树",
  contest: "全国老友粉大赛",
  collection: "图鉴 · 收集进度",
  ledger: "账本 · 月度与年度结算",
};

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: "recipe", label: "配方" },
  { id: "staff", label: "员工" },
  { id: "shop", label: "店铺" },
  { id: "perk", label: "手艺" },
  { id: "contest", label: "比赛" },
  { id: "collection", label: "图鉴" },
  { id: "ledger", label: "账本" },
];

interface ParamDef {
  label: string;
  min: number;
  max: number;
  step: number;
}

const SOUP_DEFS: readonly ParamDef[] = [
  { label: "酸笋发酵", min: 0, max: 100, step: 1 },
  { label: "豆豉量", min: 0, max: 100, step: 1 },
  { label: "猪骨浓度", min: 0, max: 100, step: 1 },
  { label: "咸度", min: 0, max: 100, step: 1 },
  { label: "鲜度", min: 0, max: 100, step: 1 },
  { label: "辣度", min: 0, max: 100, step: 1 },
  { label: "蒜香", min: 0, max: 100, step: 1 },
  { label: "汤浊度", min: 0, max: 100, step: 1 },
];

const NOODLE_DEFS: readonly ParamDef[] = [
  { label: "米种陈度", min: 0, max: 100, step: 1 },
  { label: "发酵酸度", min: 0, max: 100, step: 1 },
  { label: "米香", min: 0, max: 100, step: 1 },
  { label: "韧性", min: 0, max: 100, step: 1 },
  { label: "汤水比", min: 20, max: 50, step: 1 },
];

function escAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface PanelActions {
  setParam(group: "soup" | "noodle", index: number, value: number): void;
  setPrice(value: number): void;
  hire(uid: string): void;
  fire(uid: string): void;
  learnSpecialty(uid: string, id: string): void;
  toggleRest(uid: string): void;
  rally(id: string): void;
  buy(id: string): void;
  buyEquip(id: string): void;
  buyExpand(): void;
  /** 加料/饮料上架或下架（P41） */
  toggleSide(id: string): void;
  /** 换粉型（P42）：flat / round / yifu / wetchow / dry / claypot */
  setNoodle(id: string): void;
  setMain(id: string): void;
  setPortion(size: number): void;
  /** 菜单（P47）：切到某一款编辑 / 加一款 / 删一款 / 上下架 */
  pickDish(index: number): void;
  addDish(): void;
  removeDish(index: number): void;
  /** M3b：把一款转手（换人情，开罗 Ramen Lab 的卖配方） */
  sellRecipe(index: number): void;
  /** 老师傅的方子（A6）：给第 index 款定一条方子 */
  applyMaster(index: number, id: string): void;
  /** 菜单改名（批 M′）：itemId 是菜单款的 id，不是 index */
  renameDish(itemId: number, name: string): void;
  /** 换招牌（批 Y′）：清洗规则与开张一致，不改任何数值 */
  renameShop(name: string): void;
  /** 袋装线（A7）：置办包装机 */
  buyPack(): void;
  /** 批次七：货架换渠道 / 调价 */
  setRetailChannel(id: string): void;
  stepRetailPrice(id: string, dir: number): void;
  /** 街上的门路（批 B′）：花一次钱买一天的量 */
  buyInvest(id: string): void;
  /** 杂货铺（批 B′）：花人情买一天的方便 */
  buyGood(id: string): void;
  buyPerk(id: string): void;
  /** M3b：花人情 */
  useFavor(id: string): void;
  toggleDish(index: number): void;
  /** 开关「粉 + 饮料」套餐（P42） */
  toggleMealDeal(): void;
  /** 饮料冰 / 热（P43）：ice / hot */
  setDrinkTemp(temp: string): void;
  /** 报名比赛：type = staff / customers / shop（见 data/contest.ts） */
  enterContest(type: string): void;
  startArena(id: string): void;
  /** 报一场具名赛事（C 批，见 data/tourneys.ts） */
  enterTourney(id: string): void;
  /** 交费评段位 */
  applyGrade(): void;
  /** 换区（付转让费） */
  moveDistrict(id: string): void;
  /** 在分店面板里选中一个区县（S6） */
  pickBranchDistrict(id: string): void;
  /** 在选中的区开一家分店，size = small / normal / big / amazing */
  openBranch(size: string, district: string): void;
  /** 关掉一家分店（退半个月租） */
  closeBranch(id: string): void;
  takeOver(id: string): void;
  buyStreet(id: string): void;
  buyGear(id: string): void;
  /** 装修一套门面（A1） */
  buyStyle(id: string): void;
  /** 换上已经装过的门面（免费） */
  setStyle(id: string): void;
  buyBowl(id: string): void;
  setBowl(id: string): void;
  /** 换进货档（批次五）：免费，代价在每碗料钱里 */
  setQuality(id: string): void;
  learnSkill(id: string): void;
  /** 进货档（A5）：换米 / 换骨，随时可换、代价进每碗料钱 */
  setRice(id: string): void;
  setBone(id: string): void;
  /** 新开一局：清存档、回建店界面（I-20） */
  restart(): void;
  dismissReport(): void;
}

export interface Panels {
  open(tab: PanelTab): void;
  close(): void;
  isOpen(): boolean;
  render(state: GameState, score: RecipeScore): void;
}

function money(n: number): string {
  return `¥${Math.round(n).toLocaleString("zh-CN")}`;
}

function sliderRows(group: "soup" | "noodle", defs: readonly ParamDef[]): string {
  return defs
    .map(
      (d, i) =>
        `<label class="sl"><span class="slk">${d.label}</span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" data-param="${group}:${i}">` +
        `<b data-slval="${group}:${i}">0</b></label>`,
    )
    .join("");
}

export function mountPanels(root: HTMLElement, actions: PanelActions): Panels {
  const wrap = document.createElement("div");
  wrap.className = "modal";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modalbox card">
      <div class="modalhd">
        <div class="mtitle" data-mtitle>配方研发</div>
        <div class="mtabs">${TABS.map((t) => `<button type="button" data-tab2="${t.id}">${t.label}</button>`).join("")}</div>
        <button type="button" class="mclose" data-mclose title="关闭">×</button>
      </div>
      <div class="modalbody">
        <section class="pane" data-pane="recipe">
          <div class="rgrid">
            <div class="rcol">
              <div class="sechd">${icon("bowl")}菜单 · 今天卖几款<span class="sechint" data-menusum></span></div>
              <div class="menucards" data-menu></div>
              <div class="sechd">${icon("pan")}汤底 · 8 参</div>
              <div class="sliders" data-sliders="soup">${sliderRows("soup", SOUP_DEFS)}</div>
              <div class="sechd">${icon("pan")}主料 · 这碗是什么肉<span class="sechint" data-mainsum></span></div>
              <div class="mains" data-mains></div>
              <div class="sechd">${icon("grade")}份量 · 二两还是三两<span class="sechint" data-portionsum></span></div>
              <div class="portions" data-portions></div>
              <div class="sechd">${icon("bowl")}粉型 · 卖哪种粉<span class="sechint" data-noodlesum></span></div>
              <div class="noodles" data-noodles></div>
              <div class="sechd">${icon("pan")}米粉 · 5 参</div>
              <div class="sliders" data-sliders="noodle">${sliderRows("noodle", NOODLE_DEFS)}</div>
              <div class="sechd">${icon("bowl")}进货 · 米与骨<span class="sechint" data-gradesum></span></div>
              <div class="grades" data-grades></div>
              <div class="sechd">${icon("coin")}售价 · 客单价</div>
              <label class="sl"><span class="slk">每碗</span><input type="range" min="6" max="25" step="1" data-price><b data-pricev>12</b></label>
            </div>
            <div class="rcol narrow">
              <div class="sechd">${icon("star")}实时评分</div>
              <div class="dishname" data-dishname>老友粉</div>
              <div class="dishnote" data-dishnote></div>
              <div class="scorebig"><b data-scorebig>--</b><span data-grade>B</span></div>
              <div class="subs" data-sub-list></div>
              <div class="econ2" data-econ2></div>
              <div class="qbox" data-quality></div>
              <div class="flavorbox" data-flavors></div>
              <div class="pairbox" data-pairs></div>
            </div>
          </div>
        </section>
        <section class="pane" data-pane="staff" hidden><div data-body="staff"></div></section>
        <section class="pane" data-pane="shop" hidden><div data-body="shop"></div></section>
        <section class="pane" data-pane="perk" hidden><div data-body="perk"></div></section>
        <section class="pane" data-pane="contest" hidden><div data-body="contest"></div></section>
        <section class="pane" data-pane="collection" hidden><div data-body="collection"></div></section>
        <section class="pane" data-pane="ledger" hidden><div data-body="ledger"></div></section>
      </div>
    </div>`;
  root.appendChild(wrap);

  const title = wrap.querySelector("[data-mtitle]") as HTMLElement;
  const priceInput = wrap.querySelector("[data-price]") as HTMLInputElement;
  const priceV = wrap.querySelector("[data-pricev]") as HTMLElement;
  const scoreBig = wrap.querySelector("[data-scorebig]") as HTMLElement;
  const gradeEl = wrap.querySelector("[data-grade]") as HTMLElement;
  const subList = wrap.querySelector("[data-sub-list]") as HTMLElement;
  const econ2 = wrap.querySelector("[data-econ2]") as HTMLElement;
  const flavorsEl = wrap.querySelector("[data-flavors]") as HTMLElement;
  const pairsEl = wrap.querySelector("[data-pairs]") as HTMLElement;
  const qualityEl = wrap.querySelector("[data-quality]") as HTMLElement;
  const gradesEl = wrap.querySelector("[data-grades]") as HTMLElement;
  const gradeSumEl = wrap.querySelector("[data-gradesum]") as HTMLElement;
  const noodlesEl = wrap.querySelector("[data-noodles]") as HTMLElement;
  const noodleSumEl = wrap.querySelector("[data-noodlesum]") as HTMLElement;
  const mainsEl = wrap.querySelector("[data-mains]") as HTMLElement;
  const mainSumEl = wrap.querySelector("[data-mainsum]") as HTMLElement;
  const menuEl = wrap.querySelector("[data-menu]") as HTMLElement;
  const menuSumEl = wrap.querySelector("[data-menusum]") as HTMLElement;
  const portionsEl = wrap.querySelector("[data-portions]") as HTMLElement;
  const portionSumEl = wrap.querySelector("[data-portionsum]") as HTMLElement;
  const dishNameEl = wrap.querySelector("[data-dishname]") as HTMLElement;
  const dishNoteEl = wrap.querySelector("[data-dishnote]") as HTMLElement;
  /** 品名 + 评语的缓存，避免每帧重写 DOM */
  let lastDishKey = "";
  /** 味道区（B1）的重绘缓存：只有浇头 / 粉型变了才重写 */
  let lastFlavorKey = "";
let lastQualityKey = "";
let lastGradeKey = "";

  let current: PanelTab = "recipe";
  let lastReportYear = -1;
  const keys: Partial<Record<PanelTab, string>> = {};
  /** 最近一次 render 的入参：切页签时要拿它就地重绘（见 show 里的注释） */
  let lastState: GameState | null = null;
  let lastScore: RecipeScore | null = null;
  /** 粉型卡片单独缓存（配方页里既有滑块又有卡片，不能共用一个 key） */
  let noodleKey = "";
  let mainKey = "";
  /** 菜单卡片缓存键（P47） */
  let menuKey = "";
  let portionKey = 0;
  /** 分店面板里选中的区县（不存档：纯粹是「我正要在这儿开」的界面状态） */
  let branchPick = "";

  const show = (tab: PanelTab): void => {
    current = tab;
    wrap.querySelectorAll<HTMLElement>("[data-pane]").forEach((p) => {
      p.hidden = p.dataset.pane !== tab;
    });
    wrap.querySelectorAll<HTMLElement>("[data-tab2]").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab2 === tab);
    });
    title.textContent = TAB_TITLE[tab];
    // 试玩 11-21：配方页留下的滚动位置会被店铺接着用，栏目标题（和红标）跑到视野外。
    // 换页签就是「重新看这一页」，滚动位置不该继承。
    const paneEl = wrap.querySelector<HTMLElement>(`[data-pane="${tab}"]`);
    if (paneEl) {
      paneEl.scrollTop = 0;
      paneEl.querySelectorAll<HTMLElement>("[data-body]").forEach((b) => {
        b.scrollTop = 0;
      });
    }
    // 切页签必须就地重绘。render() 只由外部 refresh()（每分钟 / 动作 / 底栏打开）驱动，
    // 顶栏切页签不触发 refresh —— 从未渲染过的页签就会是「标题对、正文空」。
    // 试玩报告 I-05 的四个空页签就是这么来的（底栏进入 18208 字符 / 顶栏切入 0 字符）。
    if (lastState && lastScore) {
      delete keys[tab];
      renderPane(lastState, lastScore);
    }
  };

  const open = (tab: PanelTab): void => {
    wrap.hidden = false;
    show(tab);
  };
  const close = (): void => {
    wrap.hidden = true;
  };

  // ---- 一次性绑定 ----
  wrap.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-mclose]")) {
      close();
      return;
    }
    const tabBtn = t.closest<HTMLElement>("[data-tab2]");
    if (tabBtn?.dataset.tab2) {
      show(tabBtn.dataset.tab2 as PanelTab);
      return;
    }
    const act = t.closest<HTMLElement>("[data-act]");
    if (!act) return;
    const id = act.dataset.id ?? "";
    switch (act.dataset.act) {
      case "hire":
        actions.hire(id);
        break;
      case "learn": {
        const [uid, sid] = String(id).split("|");
        actions.learnSpecialty(uid ?? "", sid ?? "");
        break;
      }
      case "fire":
        actions.fire(id);
        break;
      case "rest":
        actions.toggleRest(id);
        break;
      case "rally": {
        actions.rally(String(id));
        break;
      }
      case "buy":
        actions.buy(id);
        break;
      case "buyequip":
        actions.buyEquip(id);
        break;
      case "buildexpand":
        actions.buyExpand();
        break;
      case "contest":
        actions.enterContest(id);
        break;
      case "startarena":
        actions.startArena(id);
        break;
      case "tourney":
        actions.enterTourney(id);
        break;
      case "grade":
        actions.applyGrade();
        break;
      case "movedistrict":
        actions.moveDistrict(id);
        break;
      case "toggleside":
        actions.toggleSide(id);
        break;
      case "setnoodle":
        actions.setNoodle(id);
        break;
      case "setmain":
        actions.setMain(id);
        break;
      case "setportion":
        actions.setPortion(Number(id));
        break;
      case "mealdeal":
        actions.toggleMealDeal();
        break;
      case "drinktemp":
        actions.setDrinkTemp(id);
        break;
      case "pickdish":
        actions.pickDish(Number(id));
        break;
      case "adddish":
        actions.addDish();
        break;
      case "removedish":
        actions.removeDish(Number(id));
        break;
      case "sellrecipe":
        actions.sellRecipe(Number(id));
        break;
      case "buypack":
        actions.buyPack();
        break;
      case "rtchannel":
        actions.setRetailChannel(id);
        break;
      case "buyinvest":
        actions.buyInvest(String(id));
        break;
      case "buygood":
        actions.buyGood(String(id));
        break;
      case "buyperk":
        actions.buyPerk(String(id));
        break;
      case "rtprice": {
        const [goods, dir] = String(id).split("|");
        actions.stepRetailPrice(goods ?? "", Number(dir));
        break;
      }
      case "master": {
        // data-id 形如「0|cost_set」：款号 + 方子 id
        const [idx, mid] = String(id).split("|");
        actions.applyMaster(Number(idx), String(mid ?? ""));
        break;
      }
      case "usefavor":
        actions.useFavor(String(id));
        break;
      case "toggledish":
        actions.toggleDish(Number(id));
        break;
      case "pickbranch":
        branchPick = id;
        actions.pickBranchDistrict(id);
        break;
      case "openbranch":
        actions.openBranch(id, branchPick);
        break;
      case "buystreet":
      actions.buyStreet(id);
      break;
    case "buygear":
      actions.buyGear(id);
      break;
    case "buystyle":
      actions.buyStyle(id);
      break;
    case "setstyle":
      actions.setStyle(id);
      break;
    case "buybowl":
      actions.buyBowl(id);
      break;
    case "skill":
      actions.learnSkill(id);
      break;
    case "quality":
      actions.setQuality(id);
      break;
    case "setbowl":
      actions.setBowl(id);
      break;
    case "setrice":
      actions.setRice(id);
      break;
    case "setbone":
      actions.setBone(id);
      break;
    case "takeover":
      actions.takeOver(id);
      break;
    case "closebranch":
        actions.closeBranch(id);
        break;
      case "restart":
        actions.restart();
        break;
      case "dismiss":
        actions.dismissReport();
        break;
      default:
        break;
    }
  });

  // 改名用 change（离开输入框或按回车才生效）：input 每敲一个字就重渲染，光标会丢
  wrap.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.rename) actions.renameDish(Number(el.dataset.rename), el.value);
    else if (el.hasAttribute("data-rename-shop")) actions.renameShop(el.value);
  });

  wrap.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.param) {
      const [group, idx] = input.dataset.param.split(":");
      actions.setParam(group === "noodle" ? "noodle" : "soup", Number(idx), Number(input.value));
    } else if (input.hasAttribute("data-price")) {
      actions.setPrice(Number(input.value));
    }
  });

  // ---- 各面板 ----
  function staffHtml(s: GameState): string {
    const roster = s.staff.roster
      .map((m) => {
        const fatigueClass = m.fatigue >= 70 ? "hot" : m.fatigue >= 40 ? "warm" : "";
        return `<div class="lrow${m.resting ? " resting" : ""}">
          <div class="lname">${m.name}<span class="tag2">${ROLE_LABEL[m.role]}</span><span class="tag2">技能 ${m.skill}</span>${
            m.specialty ? `<span class="tag2 on">${specialtiesOfRole(m.role).find((d) => d.id === m.specialty)?.name ?? "专精"}</span>` : ""
          }</div>
          <div class="lmeta">日薪 ¥${m.wage}${m.resting ? " · 今天休息（半薪）" : ""}${
            m.specialty ? "" : ` · 能学：${specialtiesOfRole(m.role).map((d) => `${d.name}（${d.what}）`).join(" / ")}`
          }</div>
          <div class="lmeta grow" data-grow="${m.uid}">${growWords(m)}</div>
          <div class="fat"><i class="${fatigueClass}" style="width:${Math.min(100, m.fatigue)}%"></i></div>
          <div class="lbtns">${
            m.specialty
              ? ""
              : specialtiesOfRole(m.role)
                  .map(
                    (d) =>
                      `<button type="button" data-act="learn" data-id="${m.uid}|${d.id}" ${
                        s.favor < d.favorCost || s.cash < d.costYuan ? "disabled" : ""
                      } title="${d.line}">学${d.name}</button>`,
                  )
                  .join("")
          }
            <button type="button" data-act="rest" data-id="${m.uid}">${m.resting ? "复工" : "休息"}</button>
            <button type="button" class="danger" data-act="fire" data-id="${m.uid}">辞退</button>
          </div>
        </div>`;
      })
      .join("");

    /**
     * 批 V′（开罗 rally.txt：店员累了先闹一次）：顶到门槛不是立刻走人，
     * 先在这儿摆三条路 —— 卖个人情、加点工钱、让他歇两天。
     * 三条路的代价都写在同一行里，玩家不用去别处算。
     */
    const rallyWho = rallyMember(s);
    const rallyBlock = rallyWho
      ? `<div class="sec rallybox" data-rally="${rallyWho.uid}">
        <div class="sechd">${icon("staff")}${rallyWho.name} 想走了</div>
        <div class="sechint">${rallyWords(s)}</div>
        ${rallyViews(s)
          .map(
            (v) => `<div class="lrow${v.affordable ? "" : " locked"}">
            <div class="lname">${v.def.name}</div>
            <div class="lmeta">${v.def.what}｜${v.costText}${v.affordable ? "" : ` · ${v.reason}`}</div>
            <div class="lbtns"><button type="button" data-act="rally" data-id="${v.def.id}" ${
              v.affordable ? "" : "disabled"
            } title="${v.def.why}">${v.def.name}</button></div>
          </div>`,
          )
          .join("")}
        <div class="hint">今天不答话，人明天就走。</div>
      </div>`
      : "";

    const slots = staffSlots(s.totalCustomers);
    const nxt = nextStaffNeed(s.totalCustomers);
    const fullStaff = s.staff.roster.length >= slots;
    const cands = s.staff.candidates
      .map(
        (m) => `<div class="lrow">
          <div class="lname">${m.name}<span class="tag2">${ROLE_LABEL[m.role]}</span><span class="tag2">技能 ${m.skill}</span></div>
          <div class="lmeta">日薪 ¥${m.wage} · 介绍费 ¥${m.wage * HIRE_FEE_RATE} · 月薪约 ¥${monthlyWageOf(m.wage)}</div>
          <div class="lbtns"><button type="button" data-act="hire" data-id="${m.uid}" ${fullStaff ? "disabled" : ""}>雇佣</button></div>
        </div>`,
      )
      .join("");

    return `<div class="sec">
        <div class="sechd">${icon("staff")}在职 ${s.staff.roster.length}/${slots} · 日薪 ${money(dailyWage(s))} · ${specialtySummary(s)}</div>
        ${roster || `<div class="empty2">还没雇人。你自己一个人炒锅，出碗 6 分钟。</div>`}
        ${rallyBlock}
        <div class="hint">${s.staff.lastEvent || "疲劳到 100 会辞职，记得安排休息。"} 人是一天一天熟起来的：四属性到门槛就自动学会手艺，不用点。${STAFF_SKILL_TOTAL} 项手艺、${FINISH_SKILL_TOTAL} 门毕业技（四属性都到 3 级才有）。</div>
      </div>
      <div class="sec">
        <div class="sechd">${icon("staff")}今日候选 · 每天换一批</div>
        ${cands || `<div class="empty2">今天没人来问工。</div>`}
        <div class="hint">${
          nxt
            ? `下一个人要累计接待 ${nxt.need} 位才肯来（还差 ${nxt.short} 位）。店里越忙，越招得到人。`
            : `人手已经招满 ${MAX_STAFF} 人。`
        }</div>
      </div>`;
  }

  function shopHtml(s: GameState): string {
    // 批次二：出碗拆成三段（炒锅 / 汤锅 / 粉篓），面板要把「现在卡在哪一段」写出来 ——
    // 只写一个「几分/碗」的话，玩家不知道该买哪一件（这正是 P117 / P152 的病根）。
    const st = stageMinutes(s);
    const slow = slowestStation(s);
    // 批 D′（试玩 11-22）：真正卡住的往往不是灶，是座位 ——
    // 两座、吃一碗六分多，一天只接得住三十来碗，买灶再多也没用。这一行必须写出来。
    const tight = tightWords(s);
    const seatFix = GEARS.filter((g) => (g.seats ?? 0) > 0 && !hasGear(s, g.id)).sort(
      (a, b) => a.costYuan - b.costYuan,
    )[0];
    const tightLine =
      tight === "座位坐不下" && seatFix
        ? `今天卡在座位：${seatFix.name} ${money(seatFix.costYuan)} 就能多坐 ${seatFix.seats} 位（吃一碗要六分多钟，座位周转不过来）`
        : `今天卡在：${tight}`;
    const stageLine = STATION_ORDER.map(
      (k) => `${STATION_NAMES[k]} ${st[k].toFixed(1)} 分/${stationCount(s, k)}${k === "basket" ? " 筒" : " 口"}`,
    ).join(" · ");
    /**
     * 批 F′（试玩 11-22-2109 第 5 条）：这一页只留一条主提示。
     * 主句照钩子，副句由 `sim/today.ts` 算回本与位置 —— 开罗把「这件东西在哪一段」
     * 写进帮助（`Construction (Other)`），我们没有帮助页，就把它写在这一行里。
     */
    // 换招牌（批 Y′）：开张时填过名字，之后就没地方改了 —— 这一行补上
    const nameBox = `<div class="shopname" data-shopname-box>
      <label title="开张之后也能改，两个字到十二个字"><span>招牌</span><input type="text" maxlength="12" data-rename-shop value="${escAttr(s.shopName)}"></label>
      <span class="tag2">换名字不改任何数，只是街坊改口</span>
    </div>`;

    const today = todayLine(s);
    const todayBox = today
      ? `<div class="todaybox" data-todaybox>
        <div class="tmain" data-todaybox-main>${today.main}</div>
        <div class="tvoice" data-todaybox-voice></div>
        ${today.detail ? `<div class="tdetail" data-todaybox-detail>${today.detail}</div>` : ""}
      </div>`
      : "";

    const equipRows = EQUIPMENT.map((e) => {
      const lv = equipLevel(s, e.id);
      const cost = equipNextCost(s, e.id);
      const maxed = !Number.isFinite(cost);
      const next = maxed ? "已到顶档" : e.effects[lv] ?? "";
      const now =
        e.id === "bench"
          ? `现在日上限 ${s.capacity} 碗`
          : (() => {
              const k = (Object.keys(STATION_EQUIP) as StationId[]).find((x) => STATION_EQUIP[x] === e.id);
              if (!k) return "";
              return `现在 ${stationCount(s, k)} ${k === "basket" ? "筒" : "口"} · ${st[k].toFixed(1)} 分`;
            })();
      return `<div class="lrow${today?.equipId === e.id ? " hotrow" : ""}">
        <div class="lname">${e.name}<span class="tag2">Lv ${lv}/4</span><span class="tag2">${next}</span></div>
        <div class="lmeta">${now}｜${e.desc}</div>
        <div class="lbtns"><button type="button" data-act="buyequip" data-id="${e.id}" ${maxed ? "disabled" : ""}>${maxed ? "已到顶档" : money(cost)}</button></div>
      </div>`;
    }).join("");
    const serveNow = bowlMinutes(s, SERVE_MINUTES, equipServeMultiplier(s));
    // 流失超过 45%：这一页最该看的不是菜单，是「店面」和「设备」（P70）
    /**
   * 红标只标「钩子点名的那一段」。
   *
   * 试玩 11-21 第 5 条：走失高的日子店面和设备两处同时亮红，
   * 「← 现在最缺」既指着打通隔墙又指着猛火灶，玩家反而不知道该买哪件。
   * 钩子每天只说一件事，红标也只说这一件。
   */
  // 红标与打烊单的钩子必须是**同一句**（试玩 11-24 第 2 / 5 条：买完矮凳后红标移到竹躺椅，
  // 打烊钩子却改去评「摆摊仔」，两处各说一件）。旧版这里多一道 `lostRateOf >= 阈值` 的闸，
  // 而钩子那边用的是打烊样本的阈值 —— 两个口径一错开就分叉。现在两边都只问 `nextHook`。
  const hotPlan = nextHook(s);
  const hotSeat = hotPlan?.kind === "capacity" && hotPlan.key === "capacity:seat" ? " hot" : "";
  const hotEquip =
    hotPlan?.kind === "capacity" && (hotPlan.key === "capacity:stove" || hotPlan.key === "capacity:cap")
      ? " hot"
      : "";


    // 扩建：四档阶梯（data/expansion.ts + 开罗 store_data 的容量阶梯）。
    // 批 T′ 把它从「只写下一步」改成「四步都写出来」——玩家要看得到自己走到第几步、
    // 后面还有几步、每一步换到什么；数值仍然只由 buyExpansion 给。
    const nextExp = nextExpansion(s);
    const expLv = expansionLevel(s);
    const expLock = expansionLockReason(s);
    const expSteps = EXPANSION_ORDER.map((id) => EXPANSIONS.find((e) => e.id === id)!)
      .map((def, idx) => {
        const done = idx < expLv;
        const isNext = idx === expLv;
        const lockText = def.minGrade > 0 ? `需第 ${def.minGrade} 段` : "";
        const gain = `座位 +${def.seats}${def.stoves ? ` · 灶 +${def.stoves}` : ""} · 日上限 +${def.capacity}`;
        if (done) {
          return `<div class="lrow expdone"><div class="lname">${def.name}<span class="tag2">已扩建</span></div><div class="lmeta">${gain}</div></div>`;
        }
        if (isNext) {
          return `<div class="lrow${expLock ? " locked" : ""}">
          <div class="lname">${def.name}<span class="tag2">第 ${idx + 1}/4 步</span>${lockText ? `<span class="tag2">${lockText}</span>` : ""}</div>
          <div class="lmeta">${def.desc}</div>
          <div class="lmeta">${gain}</div>
          <div class="lbtns"><button type="button" data-act="buildexpand" ${s.cash < def.costYuan || expLock ? "disabled" : ""}>${expLock ? "段位不够" : money(def.costYuan)}</button></div>
        </div>`;
        }
        return `<div class="lrow locked"><div class="lname">${def.name}<span class="tag2">第 ${idx + 1}/4 步</span></div><div class="lmeta">先买上面那一步 · ${gain}</div></div>`;
      })
      .join("");
    const expRow =
      expSteps +
      (nextExp
        ? ""
        : `<div class="lmeta" data-exp-top>已经扩到顶了 —— 座位 ${s.venue.seats} · 灶 ${s.venue.stoves}。下一步是换区开分店。</div>`);

    // 加料台与饮料柜（P41 客单价结构）：照开罗 Toppings「可单独卖」+ Customers 1「钱包是上限」
    const sv = sideViews(s);
    const share = (sideShareOf(s) * 100).toFixed(1);
    const sidesSec = `<div class="sec">
        <div class="sechd">${icon("cup")}加料台与饮料柜 · ${sideSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">一碗粉之外再卖一件 —— 加料不占座、不占灶，只加客单价。客人钱包是硬上限，价钱开到钱包外头就没人点了。三样加料凑齐才算组合（老友味 / 全套加蛋），两样是本分，不稀奇。</div>
        ${sv
          .map(
            (v) => `<div class="lrow${v.unlocked ? "" : " locked"}">
              <div class="lname">${v.def.name}<span class="tag2">${kindLabel(v.def.kind)}</span>${
                v.on && v.unlocked
                  ? '<span class="tag2">在架</span>'
                  : v.unlocked
                    ? '<span class="tag2">下架</span>'
                    : `<span class="tag2">还差 ${v.short} 人</span>`
              }<span class="tag2">卖 ¥${v.def.priceYuan} / 本 ¥${v.def.costYuan}</span></div>
              <div class="lmeta">满意 +${v.def.satBonus}｜已卖 ${v.sold} 份｜${v.def.line}${devNote("开罗：" + v.def.kairo)}</div>
              <div class="lmeta" style="color:#8a7a63">「${v.def.line}」</div>
              <div class="lbtns"><button type="button" data-act="toggleside" data-id="${v.def.id}" ${v.unlocked ? "" : "disabled"}>${
                v.on && v.unlocked ? "下架" : v.unlocked ? "上架" : "还没解锁"
              }</button></div>
            </div>`,
          )
          .join("")}
        <div class="lrow">
          <div class="lname">粉 + 饮料套餐<span class="tag2">${s.sides.mealDeal ? "开着" : "关着"}</span><span class="tag2">饮料 −¥1</span></div>
          <div class="lmeta">打包一起卖，客人觉得划算（满意 +1），但饮料少收一块钱。客单价不是把粉卖贵，是多卖一件。</div>
          <div class="lbtns"><button type="button" data-act="mealdeal">${s.sides.mealDeal ? "关掉套餐" : "开套餐"}</button></div>
        </div>
        <div class="lrow">
          <div class="lname">饮料冰热<span class="tag2">${s.sides.drinkTemp === "ice" ? "冰" : "热"}</span></div>
          <div class="lmeta">${drinkTempSummary(s)}</div>
          <div class="lbtns">
            <button type="button" data-act="drinktemp" data-id="ice"${s.sides.drinkTemp === "ice" ? ' class="on"' : ""}>上冰的</button>
            <button type="button" data-act="drinktemp" data-id="hot"${s.sides.drinkTemp === "hot" ? ' class="on"' : ""}>上热的</button>
          </div>
        </div>
        <div class="lmeta" style="padding:6px 2px 0">累计加购 ${money(s.tally.sideRevenue)}（占营业额 ${share}%）· 凑出组合 ${s.tally.comboHits} 次</div>
      </div>`;

    // 段位评定（开罗 Grading Tests）：交费 + 累计人次达标才升段，升段才能报更高档比赛
    const gc = checkGrade(s);
    const gradeSec = `<div class="sec">
        <div class="sechd">${icon("grade")}段位评定 · 现在第 ${gc.current} 段</div>
        ${
          gc.next
            ? `<div class="lrow">
                 <div class="lname">评「${gc.next.title}」<span class="tag2">评定费 ${money(gc.next.feeYuan)}</span></div>
                 <div class="lmeta">${gc.next.note}｜门槛 ${gc.next.minCustomers.toLocaleString("zh-CN")} 位客人（已接待 ${s.totalCustomers.toLocaleString("zh-CN")}）｜通过奖励 ${money(gc.next.rewardYuan)}</div>
                 <div class="lmeta">评委：「${gc.next.remark}」</div>
                 <div class="lbtns"><button type="button" data-act="grade" ${gc.ready ? "" : "disabled"}>${gc.ready ? "交费评定" : gc.shortCustomers > 0 ? `还差 ${gc.shortCustomers.toLocaleString("zh-CN")} 位` : `还差 ¥${Math.ceil(gc.shortCash).toLocaleString("zh-CN")}`}</button></div>
               </div>`
            : `<div class="lrow"><div class="lname">已经是最高段位</div><div class="lmeta">非遗传承人 —— 账本翻到最后一页。</div></div>`
        }
      </div>`;

    // 手艺树（P39，对齐开罗 rank.txt）：升一段 → 多一件能做的事
    const views = unlockViews(s);
    const liveViews = views.filter((v) => !v.pending);
    const gotCount = liveViews.filter((v) => v.unlocked).length;
    const craftSec = `<div class="sec">
        <div class="sechd">${icon("grade")}手艺树 · 第 ${gradeOf(s)} 段 · 已会 ${gotCount}/${liveViews.length}</div>
        <div class="lmeta" style="padding:0 2px 8px">扩建、排队位、买更大的店 —— 升一段多一件能做的事，不是多一个数字。灰色的要先去评段位。</div>
        ${views
          .map(
            (v) => `<div class="lrow${v.unlocked ? "" : " locked"}">
              <div class="lname">第 ${v.grade} 段 · ${v.name}<span class="tag2">${v.unlocked ? (v.pending ? "预告" : "已会") : `还差 ${v.short} 段`}</span></div>
              <div class="lmeta">${v.effect}｜${v.line}${devNote("开罗：" + v.kairo)}</div>
              <div class="lmeta" style="color:#8a7a63">「${v.line}」</div>
            </div>`,
          )
          .join("")}
      </div>`;

    // 换区（开罗 Sales Areas 2）：本区客人吃腻、别处越长越旺
    const opts = districtOptions(s);
    const districtSec = `<div class="sec">
        <div class="sechd">${icon("street")}换区 · 现在 ${opts.find((o) => o.current)?.name ?? s.district}</div>
        <div class="lmeta" style="padding:0 2px 8px">本区客流每季度 −9%，别处每季度 +6%%。客人还吃得下多少也在变：本区每季度 −4%（最低 75%），搬完两条都从 100% 重新养。</div><div class="lmeta" style="padding:0 2px 8px">这一片：客流 ×${homeEnergyOf(s).toFixed(2)} · 胃口 ×${homeAppetiteOf(s).toFixed(2)} —— ${appetiteWords(s)}</div>
        ${opts
          .slice(0, 6)
          .map(
            (o) => `<div class="lrow">
              <div class="lname">${o.name}${o.current ? '<span class="tag2">当前</span>' : ""}<span class="tag2">日客流 ${o.effective}</span></div>
              <div class="lmeta">能量 ${(o.energy * 100).toFixed(0)}%% · 潜在 ${o.traffic} 客/日 · ${o.pitch}</div>
              ${
                o.current
                  ? ""
                  : `<div class="lbtns"><button type="button" data-act="movedistrict" data-id="${o.id}" ${o.affordable ? "" : "disabled"}>搬过去 ${money(o.feeYuan)}</button></div>`
              }
            </div>`,
          )
          .join("")}
      </div>`;

    // 分店（S6）：照开罗 Buy Small → Buy Amazing Shop 的四档店面
    const bv = branchViews(s);
    const bOpts = branchSizeOptions(s);
    const pickName = branchPick ? districtNameOf(branchPick) : "";
    const signed = (n: number): string => (n >= 0 ? `+${money(n)}` : `−${money(-n)}`);
    const openRows = bv
      .map(
        (v) => `<div class="lrow">
          <div class="lname">${v.districtName} · ${v.def.name}<span class="tag2">口碑 ${(v.branch.warmth * 100).toFixed(0)}%</span><span class="tag2">今天约 ${v.dayBowls} 碗</span></div>
          <div class="lmeta">月租 ${money(v.def.rentMonthly)} + 店长 ${money(MANAGER_MONTHLY)} · 一个月约 ${signed(v.monthNet)}${
            v.monthNet < 0 ? "（口碑还没养熟，满口碑后转正）" : ""
          } · 累计 ${v.branch.bowlsTotal} 碗</div>
          <div class="lbtns"><button type="button" class="danger" data-act="closebranch" data-id="${v.branch.id}">关店（退 ${money(v.refundYuan)}）</button></div>
        </div>`,
      )
      .join("");
    // M1 同条街：这条街不止你一家。同行抢同一批客，赢比赛能让他们服气，撑不住的可以接手。
    const rv = rivalViews(s);
    const standing = Math.round(standingOf(s) * 100);
    const streetRows = rv
      .map((v) => {
        const sig = v.def.signature;
        const state2 = v.state;
        const tags = [
          `<span class="tag2">${v.tierWord}</span>`,
          state2.closed ? `<span class="tag2">已关门</span>` : `<span class="tag2">抢走 ${v.sharePct} 个点</span>`,
          state2.pacified ? `<span class="tag2">服气</span>` : "",
        ].join("");
        const mine = (s.takenOver ?? []).includes(v.def.id);
        const meta = mine
          ? `这间铺子已经是你的 · 租金打折、门口多一个入口`
          : state2.closed
            ? `铺子空着 · 接手要 ${money(v.def.takeoverFeeYuan)}（租金打折、门口多一个入口）`
            : state2.pacified
              ? `招牌 ${sig.name} ¥${sig.price} · 实力 ${sig.taste} · 服气了，抢的人砍半`
              : `招牌 ${sig.name} ¥${sig.price} · 实力 ${sig.taste} · 再赢 ${v.toPacify} 场就服气`;
        // 菜单上的第二款：同行不是只有一个价，比价才是真有对手的决策（批次 4.5）
        const menuLine = `<div class="lmeta">菜单：${sig.name} ¥${sig.price} ／ ${v.def.second.name} ¥${v.def.second.price}</div>`;
        const btn = v.canTakeOver
          ? `<div class="lbtns"><button type="button" data-act="takeover" data-id="${v.def.id}">接手 ${money(v.def.takeoverFeeYuan)}</button></div>`
          : v.takeoverReason
            ? `<div class="lbtns"><button type="button" disabled>${v.takeoverReason}</button></div>`
            : "";
        const rumour = getLine(
          { kind: "rival_rumor", key: v.def.id, context: { 店: v.def.name, 档: v.tierWord }, month: s.month, day: s.day },
          state2.lastLine,
        );
        return `<div class="lrow">
          <div class="lname">${v.def.name}${tags}</div>
          <div class="lmeta">${meta}</div>
          ${menuLine}
          ${rumour ? `<div class="lmeta rumour">街坊说：${rumour}</div>` : ""}
          ${btn}
        </div>`;
      })
      .join("");
    const streetSec = `<div class="sec">
        <div class="sechd">${icon("people")}同条街 · ${streetSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">这条街不止你一家，客人是同一批人：他们抢走多少，你就少卖多少。比赛赢多了他们会服气（每家 3 次），服气后抢的人砍半；撑不下去关门的铺子可以接手，租金打折。</div>
        <div class="lmeta"><b>你在这条街的口碑 ${standing}</b>（跟这条街最强的同行比：越高越是你说了算）</div>
        <div class="lmeta" data-pricewar>${priceWarWords(s)}</div>
        ${streetRows || `<div class="empty2">这条街就你一家。</div>`}
      </div>`;
    // 街面（M2）：这条街上属于大家的东西，你出钱修，客人顺着这些路走进来
    const bViews = streetViews(s);
    const bNext = nextRequest(s);
    // 街坊提的事：本地有兜底句，配了代理时由 main.ts 预取换成在线版（只换文字，不动机制）
    const bAsk = bNext
      ? { kind: "street_request" as const, key: bNext.id, context: { 街: bNext.name }, month: s.month, day: s.day }
      : null;
    const bLine = bNext ? getLine(bAsk!, bNext.request) : "";
    const grid = streetMap(s);
    const miniTiles = grid
      .flat()
      .map((c) => `<i class="mc-${c === "." ? "e" : c}"></i>`)
      .join("");
    const blockRows = bViews
      .map(
        (v) => `<div class="lrow${v.built ? " locked" : ""}">
          <div class="lname">${v.def.name}<span class="tag2">${v.scope}</span>${v.built ? '<span class="tag2">已修</span>' : ""}</div>
          <div class="lmeta">${v.def.effect}${v.built ? "" : ` · ¥${v.def.costYuan.toLocaleString("zh-CN")}`}</div>
          ${
            v.built
              ? ""
              : `<div class="lbtns"><button type="button" data-act="buystreet" data-id="${v.def.id}" ${v.affordable ? "" : "disabled"}>${v.affordable ? `修 ${money(v.def.costYuan)}` : "钱不够"}</button></div>`
          }
        </div>`,
      )
      .join("");
    const blockSec = `<div class="sec">
        <div class="sechd">${icon("street")}街面 · ${blockSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">这条街不只有店：路灯、雨棚、斑马线修好了，别人才愿意走过来。修好了就一直是你这条街的。</div>
        <div class="minimap" title="本区俯视：红点是你，棕点是同行，绿点是修好的街面">${miniTiles}</div>
        ${bNext ? `<div class="lmeta" style="padding:6px 2px 8px">街坊来提：「${bLine}」</div>` : `<div class="lmeta" style="padding:6px 2px 8px">这条街该有的都修齐了。</div>`}
        ${blockRows}
      </div>`;
    const branchSec = `<div class="sec">
        <div class="sechd">${icon("shop")}分店 · 已开 ${bv.length}/${MAX_BRANCHES}${bv.length ? ` · ${branchSummary(s)}` : ""}</div>
        <div class="lmeta" style="padding:0 2px 8px">主店评到第 8 段就能在别处再开一家（标准店第 9 段、大店第 10 段、旗舰第 11 段）。分店自己养口碑：开张时只有 45%，每天涨 3%，大约 18 天熟。同一个区连开几家要分客流，池子小的区开不了。</div>
        ${openRows || `<div class="empty2">还没开分店。</div>`}
        <div class="sechd" style="margin-top:10px">在哪个区开 · 点一下选中</div>
        <div class="dpicks">${opts
          .map(
            (o) =>
              `<button type="button" class="dpick${branchPick === o.id ? " on" : ""}${o.current ? " here" : ""}" data-act="pickbranch" data-id="${o.id}"><b>${o.name}</b><span>日客流 ${o.effective}</span></button>`,
          )
          .join("")}</div>
        <div class="hint">${pickName ? `已选中 ${pickName}` : "先在上面点一个区，再挑店面大小。"}</div>
        ${bOpts
          .map(
            (o) => `<div class="lrow${o.locked ? " locked" : ""}">
              <div class="lname">${o.def.name}<span class="tag2">${money(o.def.openFeeYuan)}</span><span class="tag2">日做 ${o.def.dayBowls} 碗</span>${o.locked ? `<span class="tag2">需第 ${o.def.minGrade} 段</span>` : ""}</div>
              <div class="lmeta">${o.def.pitch} · 月租 ${money(o.def.rentMonthly)} + 店长 ${money(MANAGER_MONTHLY)} · 满负荷月净 ${signed(o.monthNet)} · 约 ${o.payback} 个月回本</div>
              <div class="lbtns"><button type="button" data-act="openbranch" data-id="${o.def.id}" ${
                o.locked || !pickName || s.cash < o.def.openFeeYuan ? "disabled" : ""
              }>${o.locked ? "段位不够" : pickName ? "在这里开" : "先选区"}</button></div>
            </div>`,
          )
          .join("")}
      </div>`;

    // 店里那 12×8 格：买下一件家当，它就在格子里出现（P53）
    const mapCells = shopMap(s)
      .flat()
      .map((c) => {
        if (c === "cust") return '<i class="sm sm-cust" title="等位的客人"></i>';
        if (c === "staff") return '<i class="sm sm-staff" title="店里帮忙的人"></i>';
        return c
          ? `<i class="sm sm-${c}" title="${GEAR_SPOT_LABEL[c]}"></i>`
          : '<i class="sm sm-e"></i>';
      })
      .join("");
    const gearCount = (s.gear ?? []).length;
    // 人情（M3b）：三样花法，用不了就写还差多少
    const fv = favorViews(s);
    const favorRows = fv
      .map(
        (v) => `<div class="lrow${v.affordable ? "" : " locked"}">
          <div class="lname">${v.def.name}<span class="tag2">${v.def.costPoints} 点</span></div>
          <div class="lbtns"><button type="button" data-act="usefavor" data-id="${v.def.id}" ${v.affordable ? "" : "disabled"}>${v.affordable ? "用掉" : v.reason}</button></div>
          <div class="lmeta">${v.def.effect}｜${v.def.line}${devNote("开罗：" + v.def.kairo)}</div>
        </div>`,
      )
      .join("");
    const gv = gearViews(s);
    /** 试玩二轮 F7：产能吃紧、而能提产能的家当还没买齐 → 家当这一段也标红 */
    const gearHot =
      (hotPlan?.kind === "gear" && gearEfficiencyLeft(s).length > 0) ||
      // 卡座位时钩子点的是塑料矮凳/竹躺椅，那两件摆在「店里 · 家当」这一段
      (hotPlan?.kind === "capacity" && hotPlan.key === "capacity:seat");
    /**
     * 袋装老友粉（A7）：一次买断的包装机 + 每天按口碑出的货。
     * 没买时只有一行按钮；买了显示「每天出 N 袋 · 约 ¥M/天」和风味还原度 ——
     * 还原度就是「店里的粉好不好吃」折算过来的，提醒玩家这件事吊在粉上。
     */
    const packSec = `
      <div class="sec">
      <div class="sechd">${icon("crate")}袋装老友粉 · ${packSummary(s)}</div>
      <div class="hint2">酱料包、酸笋、干粉分开装，客人拿回家煮两分钟 —— 这是南宁真做成的一条路子。不占餐位、不占人手，出货量看口碑，也看店里的粉到底好不好吃。</div>
      <div class="lrow${packOwned(s) ? " locked" : ""}">
        <div class="lbtns">${
          packOwned(s)
            ? `<span class="tag2 on">在卖</span>`
            : `<button type="button" class="pickbtn" data-act="buypack" ${s.cash >= PACK_SETUP.costYuan ? "" : "disabled"}>¥${PACK_SETUP.costYuan.toLocaleString("zh-CN")}</button>`
        }</div>
        <span class="lname">封口机与首批包装</span>
        <div class="lmeta">${packOwned(s) ? `${packRateWords(s)} · 每天出 ${packSummary(s).replace("每天出 ", "").replace(" 袋 · 约 ¥", " 袋，赚 ¥").replace("/天", "")}` : `一次置办，每天出几袋卖到外地；袋子、酱料包、干粉都算在里面`}</div>
      </div>
      ${
        packOwned(s)
          ? `<div class="lmeta" data-packsku>${packSkuWords(s)}</div>
        ${packSkuLines(s)
          .map(
            (l) => `<div class="lrow" data-sku="${l.def.id}">
          <span class="lname">${l.def.name}</span>
          <span class="tag2">${l.count} 件</span>
          <div class="lmeta">${l.def.line}｜一件 ¥${l.def.priceYuan}，赚 ¥${Math.round(l.def.priceYuan - l.def.costPerPack)}${
            l.count > 0 ? "" : " · 今天没分到量"
          }</div>
        </div>`,
          )
          .join("")}`
          : ""
      }
      </div>`;
    /**
   * 货架（批次七）：把店里的手艺做成货。
   *
   * 三层渠道 + 每款自己定价 + 与堂食抢产能。
   * 面板只写「渠道 / 每款价 / 今天约几件 / 要占掉几碗」，
   * 净值留给打烊单 —— 让玩家定的时候盯着取舍，不是盯着收益表。
   */
  const rtChannel = channelOf(s);
  const rtRows = retailLines(s)
    .map((l) => {
      return `<div class="lrow">
        <div class="lbtns">
          <button type="button" class="pickbtn" data-act="rtprice" data-id="${l.def.id}|-1">−</button>
          <button type="button" class="pickbtn" data-act="rtprice" data-id="${l.def.id}|1">+</button>
        </div>
        <span class="lname">${l.def.name}</span>
        <div class="lmeta">出厂 ¥${l.def.costYuan.toFixed(1)} ｜ 卖 ¥${l.price.toFixed(1)} ｜ 今天约 ${l.units} 件 ｜ 净 ¥${Math.round(l.net)}</div>
      </div>`;
    })
    .join("");
  const rtChannelRows = CHANNELS.map((c) => {
    const gate = (s.gradeLevel ?? 0) < c.gradeGate;
    const on = c.id === rtChannel.id;
    return `<div class="lrow${gate ? " locked" : ""}">
      <div class="lbtns">${
        on
          ? `<span class="tag2 on">在走</span>`
          : gate
            ? `<span class="tag2">第 ${c.gradeGate + 1} 段</span>`
            : `<button type="button" class="pickbtn" data-act="rtchannel" data-id="${c.id}">换这条</button>`
      }</div>
      <span class="lname">${c.name}</span>
      <div class="lmeta">${c.note}${c.cut > 0 ? `（抽 ${Math.round(c.cut * 100)}%）` : ""}</div>
    </div>`;
  }).join("");
  /**
   * 店里九十六格（批次十）：只画不玩。
   *
   * 开罗 `casket` 是家具摆放预设表；我们此前家当坐标写死（P112），买新件不挪窝。
   * 这一格图把「灶 / 桌 / 备料 / 门面」四类摆出来，换门面只换配色不换格局。
   */
  /**
   * 街上的门路（批 B′）：花一次钱，买一天的「量」。
   *
   * 三条都是「今天多做出几碗 / 今天多进来几个人」，一个乘数都不买 ——
   * 料钱已经叠了五层（品质档、行情、物产、技法），再叠就没人算得清了（P154）。
   */
  const investSec = `
  <div class="sec">
    <div class="sechd">${icon("crate")}街上的门路 · ${investSummary(s)}</div>
    <div class="hint2">钱能买到的是「今天多做出几碗」和「今天多进来几个人」，买不到乘数。同类只能走一条。</div>
    ${investViews(s)
      .map(
        (v) => `<div class="lrow${v.affordable || v.active ? "" : " locked"}">
      <div class="lbtns">${
        v.active
          ? `<span class="tag2 on">在走 · 还剩 ${v.leftDays} 天</span>`
          : v.affordable
            ? `<button type="button" class="pickbtn" data-act="buyinvest" data-id="${v.def.id}">${money(v.def.costYuan)}</button>`
            : `<span class="tag2">${v.reason}</span>`
      }</div>
      <span class="lname">${v.def.name}</span>
      <div class="lmeta">${v.def.what}｜${investWords(v.def)}${v.def.days > 1 ? `｜管 ${v.def.days} 天` : ""}</div>
      <div class="lmeta" title="${v.def.source.map((x) => `${x.label}（${x.url}）：${x.quote}`).join("  ／  ")}">${v.def.why}</div>
    </div>`,
      )
      .join("")}
  </div>`;
  /**
   * 杂货铺（批 B′）：花人情，买一天的方便。
   *
   * 三件都是「身边就能办到」的事 —— 多备一筐粉、借三台电扇、现炸一筐油条。
   * 没有库存（P205），所以买的不是货，是**今天的那个状态**，第二天自动失效。
   */
  const GOOD_ICON: Record<string, string> = {
    noodle_pile: "bowl",
    fan: "clock",
    dough: "pan",
    soymilk: "cup",
    mung_bean: "bean",
    lamp: "lamp",
    stool_row: "shop",
    chalkboard: "chalk",
    helper: "staff",
  water_bucket: "cup",
  };
  const goodsSec = `
  <div class="sec">
    <div class="sechd">${icon("shop")}杂货铺 · ${goodsSummary(s)}</div>
    <div class="hint2">这里花的是人情，不是钱。买了只管当天，第二天自动没了。</div>
    ${goodsViews(s)
      .map(
        (v) => `<div class="lrow${v.affordable || v.active ? "" : " locked"}">
      <div class="lbtns">${
        v.active
          ? `<span class="tag2 on">今天在用</span>`
          : v.affordable
            ? `<button type="button" class="pickbtn" data-act="buygood" data-id="${v.def.id}">用 ${v.def.favorCost} 点人情</button>`
            : `<span class="tag2">${v.reason}</span>`
      }</div>
      <span class="lname">${icon((GOOD_ICON[v.def.id] ?? "shop") as IconName)}${v.def.name}</span>
      <div class="lmeta">${v.def.what}｜${goodWords(v.def)}</div>
      <div class="lmeta" title="${v.def.source.map((x) => `${x.label}（${x.url}）：${x.quote}`).join("  ／  ")}">${v.def.why}</div>
    </div>`,
      )
      .join("")}
  </div>`;
  const lyt = layoutOf(s);
  const slotSets = slotSetViews(s);
  const layoutSec = `
  <div class="sec">
    <div class="sechd">${icon("shop")}店里 · ${layoutSummary(s)}</div>
    <div class="sechint" data-floor>铺开了 ${lyt.floor} / ${lyt.floorTotal} 格（第 ${lyt.level} 档 · ${lyt.storeName}）${lyt.upstairs > 0 ? `，另有楼上 ${lyt.upstairs} 格` : ""}</div>
    <div class="sechint">${filledCount(s)} / ${stageCells()} 格摆了东西；空槽是自己买得还不够，不是坏了。灰着的那几格还没铺开 —— 把隔墙打通就多一片。</div>
    <div class="g96" style="--gw:${lyt.w};--gh:${lyt.h}">${lyt.cells
      .map((c) => {
        const pos = `grid-column:${c.x + 1};grid-row:${c.y + 1}`;
        if (c.filled) {
          return `<span class="gc on ${c.kind}" style="${pos}" data-out="${c.floor ? "0" : "1"}" title="${c.label}">${c.label}</span>`;
        }
        if (c.kind) {
          return `<span class="gc slot ${c.kind}" style="${pos}" data-out="${c.floor ? "0" : "1"}" title="${c.floor ? "空槽位" : "空槽位（这一片还没铺开）"}"></span>`;
        }
        if (!c.floor) {
          const nextName = nextExpansion(s)?.name ?? "换区开分店";
          return `<span class="gc bare" style="${pos}" data-bare="1" title="还没铺开 —— 下一步「${nextName}」"></span>`;
        }
        return `<span class="gc" style="${pos}"></span>`;
      })
      .join("")}</div>
    <div class="sechint">成套 · ${slotSetSummary(s)}（配齐一类，坐着更松、门口更显眼；多坐一个人还是得另买凳子）</div>
    ${slotSets
      .map(
        (v) =>
          `<div class="lrow${v.done ? " setdone" : " locked"}"><div class="lname">${v.def.name}<span class="tag2">${v.done ? "已凑齐" : v.progress}</span></div><div class="lmeta">${slotSetWords(v)}｜${v.def.line}</div></div>`,
      )
      .join("")}
  </div>`;
  const retailSec = `
  <div class="sec">
    <div class="sechd">${icon("crate")}货架 · ${retailSummary(s)}</div>
    <div class="hint2">干粉、酸笋包、老友酱、汤底包、自热、礼盒、整箱 —— 八款都是南宁货架上真有的东西。做货占案台与手，<b>今天要做的件数会从当天的碗里扣掉 ${retailBowlLoad(s)} 碗</b>；产能 ${retailThroughput(s)} 件/天。</div>
    <div class="sechint">走哪条渠道</div>
    ${rtChannelRows}
    <div class="sechint">八款货 · 价能下调 ${Math.round((1 - PRICE_FLOOR) * 100)}%、上调 ${Math.round((PRICE_CEIL - 1) * 100)}%</div>
    ${rtRows}
  </div>`;
  /**
   * 手上的功夫（批次 6）：十二支技法，每支三级。
   * 与「店员专精」分开：这一层是老板自己的手，店员走了也还在。
   */
  const skv = skillViews(s);
  const skillRows = (["heat", "knife", "host", "trade"] as SkillFamily[])
    .map((fam) => {
      const rows = skv
        .filter((v) => v.branch.family === fam)
        .map((v) => {
          const pips = [1, 2, 3]
            .map((n) => `<i class="${n <= v.level ? "on" : ""}"></i>`)
            .join("");
          const eff = v.next ? skillEffectWords(v.next.effect) : "";
          return `<div class="lrow${v.level >= 3 ? " locked" : ""}" data-skill="${v.branch.id}">
          <div class="lbtns">${
            v.level >= 3
              ? `<span class="tag2 on">练满了</span>`
              : `<button type="button" class="pickbtn" data-act="skill" data-id="${v.branch.id}" ${
                  v.affordable ? "" : "disabled"
                }>练</button>`
          }</div>
          <span class="lname">${v.branch.name}<span class="skpips">${pips}</span></span>
          <div class="lmeta">${v.branch.what}${eff ? `　·　${eff}` : ""}<br>${skillLine(v)}</div>
        </div>`;
        })
        .join("");
      return `<div class="sechd" style="margin-top:6px">${FAMILY_NAMES[fam]}</div>${rows}`;
    })
    .join("");
  const skillSec = `
      <div class="sec">
        <div class="sechd">${icon("pan")}手上的功夫 · ${skillSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">你自己练出来的手艺：十二支，每支三级，一级一级往上练，练过就永久在身上。人情是街坊给的面子，钱是买料自己练。店员学的「专精」是别人的手，这一层是你自己的。</div>
        ${skillRows}
      </div>`;

  const gearRows = gv
      .map(
        (v) => `<div class="lrow${v.owned ? " locked" : ""}${!v.owned && today?.gearId === v.def.id ? " hotrow" : ""}">
          <div class="lname">${v.def.name}<span class="tag2">${v.owned ? "已买" : money(v.def.costYuan)}</span>${
            !v.owned && GEAR_EFFICIENCY_IDS.has(v.def.id) ? '<span class="tag2 hot2">省事</span>' : ""
          }</div>
          <div class="lbtns">${
            v.owned
              ? ""
              : `<button type="button" data-act="buygear" data-id="${v.def.id}" ${v.affordable ? "" : "disabled"}>${v.affordable ? "搬进来" : "钱不够"}</button>`
          }</div>
          <div class="lmeta">${v.def.effect}｜${v.def.line}</div>
        </div>`,
      )
      .join("");
    const comboRows = comboViews(s)
      .map((v) => {
        const pairText = v.def.pairs
          .map(([a, b]) => `${GEAR_BY_ID.get(a)?.name ?? a} + ${GEAR_BY_ID.get(b)?.name ?? b}`)
          .join(" ／ ");
        const tag = v.active ? "凑齐了" : v.missing.length === 1 ? "差 1 件" : "差 2 件";
        return `<div class="lrow${v.active ? "" : " locked"}">
          <div class="lname">${v.def.name}<span class="tag2">${tag}</span></div>
          <div class="lmeta">${pairText}｜${v.active ? v.def.line : v.def.note}</div>
        </div>`;
      })
      .join("");
    const styleRows = styleViews(s)
      .map((v) => {
        const parts = (Object.keys(v.def.parts) as (keyof typeof v.def.parts)[])
          .map((k) => `${STYLE_PART_LABEL[k]}${v.def.parts[k]}`)
          .join(" · ");
        const btn = v.active
          ? `<span class="tag2 on">正在用</span>`
          : v.owned
            ? `<button type="button" data-act="setstyle" data-id="${v.def.id}">换上</button>`
            : `<button type="button" data-act="buystyle" data-id="${v.def.id}" ${v.affordable ? "" : "disabled"}>${money(v.def.costYuan)}</button>`;
        return `<div class="lrow${v.owned ? "" : " locked"}">
          <div class="lbtns">${btn}</div>
          <div class="lname">${v.def.name}<span class="tag2">${v.def.effectText}</span></div>
          <div class="lmeta">${v.def.look}｜${parts}｜${v.def.where}</div>
        </div>`;
      })
      .join("");
    const bowlRows = bowlViews(s)
      .map((v) => {
        const btn = v.active
          ? `<span class="tag2 on">正在用</span>`
          : v.owned
            ? `<button type="button" data-act="setbowl" data-id="${v.def.id}">换上</button>`
            : `<button type="button" data-act="buybowl" data-id="${v.def.id}" ${v.affordable ? "" : "disabled"}>${money(v.def.costYuan)}</button>`;
        return `<div class="lrow${v.owned ? "" : " locked"}">
          <div class="lbtns">${btn}</div>
          <div class="lname">${v.def.name}<span class="tag2">${v.def.effectText}</span></div>
          <div class="lmeta">${v.def.packWord ? `${v.def.packWord}｜` : ""}${v.def.look}｜${v.def.where}</div>
        </div>`;
      })
      .join("");
    const ups = UPGRADES.map((u) => {      const lv = upgradeLevel(s, u.id);
      const cost = upgradeCost(s, u.id);
      const maxed = lv >= u.maxLevel;
      return `<div class="lrow">
        <div class="lname">${u.name}<span class="tag2">Lv ${lv}/${u.maxLevel}</span></div>
        <div class="lmeta">${u.desc}</div>
        <div class="lbtns"><button type="button" data-act="buy" data-id="${u.id}" ${maxed ? "disabled" : ""}>${maxed ? "已满级" : money(cost)}</button></div>
      </div>`;
    }).join("");
    return `${nameBox}${todayBox}${gc.ready ? "" : ""}<div class="sec">
        <div class="sechd${hotSeat}">${icon("shop")}店面 · 座位 ${s.venue.seats} · 灶 ${s.venue.stoves}</div>
        <div class="lmeta" style="padding:0 2px 8px">扩建一次要几万，等于一两个月的净利；但座位和灶位只从这里涨。</div>
        ${expRow}
      </div>
      <div class="sec">
        <div class="sechd${hotEquip}">${icon("crate")}设备 · 现在出碗 ${serveNow.toFixed(1)} 分/碗<span class="tag2">最慢：${STATION_NAMES[slow.station]} ${slow.minutes.toFixed(1)} 分</span></div>
        <div class="lmeta tightline" data-tight>${tightLine}</div>
        <div class="lmeta" style="padding:0 2px 8px">一碗分成三段：${stageLine}。哪一段最慢就添哪一段，添别的会被最慢那段吃掉。钱不够就先别动，一碗毛利只有 ¥${(s.price - BOWL.costYuan).toFixed(1)}。</div>
        ${equipRows}
      </div>
      <div class="sec">
        <div class="sechd">${icon("crate")}店里 · 摆了 ${gearCount}/12 件家当<span class="sechint" data-shopmap-sum> ${shopMapSummary(s)}</span></div>
        <div class="lmeta" style="padding:0 2px 8px">买下一件就摆进店里，空格是还没添的东西。左边四列是后厨，中间是堂食，靠右是门口 —— 排队的人从门口往里站，绿点是在店里帮忙的人。</div>
        <div class="shopmap" data-style="${s.style ?? "none"}">${mapCells}</div>
        <div class="smlegend"><span class="smk sm-seat"></span>座位 <span class="smk sm-kitchen"></span>后厨 <span class="smk sm-wall"></span>墙面 <span class="smk sm-counter"></span>柜台 <span class="smk sm-decor"></span>摆设 <span class="smk sm-cust"></span>客人 <span class="smk sm-staff"></span>店员</div>
      </div>
      <div class="sec">
        <div class="sechd">${icon("heart")}人情 · ${favorSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">街坊给的面子：一碗吃到底、把不要的配方转手、比赛拿名次、熟客回礼都会攒。钱买不到，只能攒。</div>
        ${favorRows}
      </div>
      <div class="sec">
        <div class="sechd${gearHot ? " hot" : ""}">${icon("crate")}家当 · ${gearSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">店里那些不值钱、但天天用得上的旧东西。一件几十到几千，买一件算一件，效果都是常驻的。标「省事」的几件直接帮你把出碗、料钱、累不累往好里带。</div>
        ${gearRows}
        <div class="sechd" style="margin-top:8px">${icon("star")}搭配 · ${comboSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">两件东西凑一块才有的那点好处：一样都不贵，凑齐了比单买多一截。</div>
        ${comboRows}
      </div>
      <div class="sec">
        <div class="sechd">${icon("shop")}店的样子 · ${styleSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">门面、地面、桌子凳子整套换。店里同一时间只摆一套，装过的可以随时换回来，换不花钱。左边那张店图会跟着换颜色。${nextStyle(s) ? `最便宜还差「${nextStyle(s)!.def.name}」（${money(STYLES.find((d) => d.id === nextStyle(s)!.def.id)?.costYuan ?? 0)}）。` : "六套都装过了。"}</div>
        ${styleRows}
      </div>
      <div class="sec">
        <div class="sechd">${icon("bowl")}碗 · ${bowlSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">端出去的那只碗。同一时间只用一只，买过的随时换回来，换不花钱。钢碗不用自己洗所以出碗快，瓦煲要现煮所以慢一些 —— 但客人愿意等。${nextBowl(s) ? `最便宜还差「${nextBowl(s)!.name}」（${money(nextBowl(s)!.costYuan)}）。` : `五只都齐了。`}</div>
        ${bowlRows}
        <div class="lmeta" style="padding:4px 2px 0">现在这只：${currentBowl(s).line}</div>
      </div>
${layoutSec}${packSec}  ${retailSec}
      ${investSec}
      ${goodsSec}
      <div class="sec">
        <div class="sechd">${icon("crate")}摆件</div>
        ${ups}
      </div>
      ${sidesSec}
      ${gradeSec}
      ${skillSec}
      ${craftSec}
      ${streetSec}
      ${blockSec}
      ${branchSec}
      ${districtSec}
      <div class="sechd">${icon("flag")}换一局</div>
      <div class="lrow">
        <div class="lmeta">存档只保留这一局。想换个铺位、换个区从头再试，点右边（会清掉现在的存档）。</div>
        <button data-act="restart">新开一局</button>
      </div>`;
  }

  function contestHtml(s: GameState, _score: RecipeScore): string {
    const open = isContestMonth(s.month);
    const wait = monthsToContest(s.month);
    const maxTier = maxTierOf(s);
    const t = tierOf(maxTier);
    const gate = canEnter(s, maxTier);
    const typeRows = CONTEST_TYPES.map((c) => {
      const mine = contestScore(s, c.id);
      const g = canEnter(s, maxTier);
      return `<div class="lrow">
          <div class="lname">${c.name} <span class="lmeta" style="display:inline">· 你的竞技分 ${mine}</span></div>
          <div class="lmeta">${c.basis}｜备战：${c.prep}</div>
          <button type="button" class="widebtn" data-act="contest" data-id="${c.id}" ${g.ok ? "" : "disabled"}>报名（${money(t.feeYuan)}）</button>
        </div>`;
    }).join("");
    const history = s.contest.results
      .slice(-6)
      .reverse()
      .map((r) => {
        const name = CONTEST_TYPES.find((x) => x.id === r.type)?.name ?? r.type;
        return `<div class="lrow"><div class="lname">第 ${r.month + 1} 月 · ${name} · 第 ${r.rank} 名</div>
           <div class="lmeta">${r.tier} 档 · 竞技分 ${r.score} · 冠军 ${r.champion} · 奖金 ${money(r.prize)}</div></div>`;
      })
      .join("");
    const tViews = tourneyViews(s);
    const tLevels = levelProgressOf(s);
    const tourneySec = `<div class="sec">
        <div class="sechd">${icon("cup")}赛事阶梯 · ${tourneySummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">
          五级：街道办 → 城区 → 南宁市 → 广西 → 全国。街道办级随时能报（一天一场），
          其余跟一年两届走（六月 / 十二月，一届一场）。想报上一级，得先在下一级进过前三。
        </div>
        ${tLevels
          .map((p) => {
            const rows = tViews
              .filter((v) => v.def.level === p.level)
              .map((v) => {
                const best = v.best === 0 ? "还没进过名次" : `最好第 ${v.best} 名`;
                const times = v.played === 0 ? "" : ` · 打过 ${v.played} 次`;
                const basis = CONTEST_TYPE_BY_ID.get(v.def.type)?.basis ?? "";
                const why = v.gate.ok ? "" : `｜${v.gate.reason}`;
                return `<div class="lrow">
            <div class="lbtns"><button type="button" data-act="tourney" data-id="${v.def.id}" ${v.gate.ok ? "" : "disabled"}>${v.played > 0 ? "再打一次" : "报名"}</button></div>
            <div class="lname">${v.def.name} <span class="lmeta" style="display:inline">· ${best}${times}</span></div>
            <div class="lmeta">${v.def.host}｜比${basis}｜报名 ${v.feeYuan === 0 ? "免费" : money(v.feeYuan)} · 冠军 ${money(v.prizeYuan)} · 需第 ${v.minGrade} 段${why}</div>
          </div>`;
              })
              .join("");
            const head = p.best === 0 ? `${p.name} · ${p.played}/${p.total}` : `${p.name} · ${p.played}/${p.total} · 最好第 ${p.best} 名`;
            return `<div class="tgroup"><div class="tgname">${head}</div>${rows}</div>`;
          })
          .join("")}
      </div>`;
    const arenaCards = arenaViews(s)
      .map((v) => {
        const gate = v.open;
        const reason = gate.ok ? "" : gate.reason ?? "";
        return `<div class="lrow">
            <div class="lname">${v.def.name} <span class="lmeta" style="display:inline">· 这碗粉值 ${v.value}</span></div>
            <div class="lmeta">${v.def.pitch}｜对手：${v.rival.name}（约 ${v.rivalTarget} 分）${reason ? `｜${reason}` : ""}</div>
            <button type="button" class="widebtn" data-act="startarena" data-id="${v.def.id}" ${gate.ok ? "" : "disabled"}>上场</button>
          </div>`;
      })
      .join("");
    return `<div class="sec">
        <div class="sechd">${icon("cup")}${open ? "比赛月 · 可以报名" : `不是比赛月 · 还有 ${wait} 个月`}</div>
        <div class="lmeta" style="padding:0 2px 8px">
          一年两场，六月和十二月。你现在的段位能报 <b>${maxTier} 档</b>
          （冠军 ${money(t.prizeYuan)}，对手基准 ${t.rivalScore} 分）。段位不升，奖金封顶。
        </div>
        ${gate.ok ? "" : `<div class="hint">${gate.reason}</div>`}
        ${typeRows}
      </div>
      ${tourneySec}
      <div class="sec">
        <div class="sechd">${icon("flag")}落场 · ${arenaSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">
          六十秒一场，按 1 / 2 / 3 出招，分数高的赢。一天一场，多打一场要 6 点人情。
          同一个场地看重的味道不一样：菜市口认份量，江边认香气，擂台上四样都要齐。
          赢了会当场压低同条街最强的那家：它掉一格名气，赢满三场就服气，往后少抢你一半的客。
        </div>
        ${arenaCards}
      </div>
      <div class="sec">
        <div class="sechd">${icon("grade")}档位与段位门槛</div>
        ${CONTEST_TIERS.map(
          (x) =>
            `<div class="lrow"><div class="lname">${x.tier} 档 · 冠军 ${money(x.prizeYuan)}</div>
             <div class="lmeta">报名 ${x.feeYuan === 0 ? "免费" : money(x.feeYuan)} · 需第 ${x.minGrade} 段 · 对手 ${x.rivalScore}</div></div>`,
        ).join("")}
      </div>
      <div class="sec">
        <div class="sechd">${icon("flag")}参赛记录（前三 ${s.contest.wins} 次）</div>
        ${history || `<div class="empty2">还没参加过。</div>`}
      </div>`;
  }

  /** 一条组合的效果写成一行中文，面板与图鉴共用 */
/**
 * 进货档两行（A5）。
 *
 * 与碗/门面不同，这里没有买不买的问题 —— 三档随时可换，只是每碗料钱与分数变了。
 * 所以按钮不写价格，写「每碗 +¥0.50 · 汤 +3」这种当场能算清的账。
 */
function gradeBtn(kind: "rice" | "bone", def: GradeDef<string>, active: boolean): string {
  const delta =
    def.costDelta === 0
      ? "料钱不动"
      : def.costDelta > 0
        ? `每碗 +¥${def.costDelta.toFixed(2)}`
        : `每碗 −¥${Math.abs(def.costDelta).toFixed(2)}`;
  const eff = def.soupDelta
    ? ` · 汤 ${def.soupDelta > 0 ? "+" : ""}${def.soupDelta}`
    : def.noodleDelta
      ? ` · 粉 ${def.noodleDelta > 0 ? "+" : ""}${def.noodleDelta}`
      : "";
  return `<button class="mbtn${active ? " on" : ""}" data-act="set${kind}" data-id="${def.id}" title="${def.why}｜出处：${def.source.label}"><b>${def.name}</b><i>${delta}${eff}</i></button>`;
}

function gradesHtml(s: GameState): string {
  const r = riceViews(s);
  const b = boneViews(s);
  return (
    `<div class="grow"><span class="gk">米</span>${r.map((v) => gradeBtn("rice", v.def, v.active)).join("")}</div>` +
    `<div class="grow"><span class="gk">骨</span>${b.map((v) => gradeBtn("bone", v.def, v.active)).join("")}</div>` +
    `<div class="gnote">${r.find((v) => v.active)?.def.look ?? ""}｜${b.find((v) => v.active)?.def.look ?? ""}</div>`
  );
}

function effectWords(e: FlavorEffect | PairingEffect): string {
  const out: string[] = [];
  if (e.soup) out.push(`味道 +${e.soup}`);
  if (e.charm) out.push(`魅力 +${e.charm}`);
  if (e.sat) out.push(`满意 +${e.sat}`);
  if (e.patiencePct) out.push(`耐心 +${Math.round(e.patiencePct * 100)}%`);
  if (e.costPct) out.push(`料钱 −${Math.round(e.costPct * 100)}%`);
  if (e.servePct) out.push(`出碗 −${Math.round(e.servePct * 100)}%`);
  return out.join(" · ");
}

/**
 * 味道区（B1）：六条成型吃法。
 *
 * 成立的写效果，没成立的写「还差哪几味」—— 与成就同一条纪律：
 * 未达成的也写名字，让玩家看见还能试什么。
 * title 里带「什么时候最有用 + 为什么 + 出处」，想核对的人 hover 就能看到。
 */
function flavorBoxHtml(s: GameState): string {
  const nameOf = (id: string) => TOPPINGS.find((t) => t.id === id)?.name ?? id;
  const views = flavorViews({ toppings: s.recipe.toppings, noodle: s.noodle, nameOf });
  const nearDef = nearlyFlavor(s.recipe.toppings, s.noodle);
  const nearView = nearDef ? views.find((v) => v.def.id === nearDef.id) : null;
  const head = `<div class="flavhd">${icon("pan")}这锅的味道 · ${flavorSummary(s.recipe.toppings, s.noodle)}${
    nearView ? `<span class="sechint">再添「${nearView.missing.join("、")}」就凑成「${nearView.def.name}」</span>` : ""
  }</div>`;
  const chips = views
    .map((v) => {
      const title = `${v.def.when}｜${v.def.why}｜出处：${v.def.source.map((x) => x.label).join("；")}`;
      return `<span class="flav${v.active ? " on" : ""}" title="${title}">${v.def.name}${
        v.active ? `<b>${effectWords(v.def.effect)}</b>` : `<i>还差${v.missing.join("、")}</i>`
      }</span>`;
    })
    .join("");
  return `${head}<div class="flavlist">${chips}</div>`;
}

/**
 * 进货档（批次五）：三档 chips。这一档**不收钱**，代价全在每碗料钱里 ——
 * 所以按钮上直接写乘数，让玩家自己算一碗要贵几毛。
 */
function qualityBoxHtml(s: GameState): string {
  const views = qualityViews(s);
  const cur = views.find((v) => v.active)?.def;
  const chips = views
    .map((v) => {
      const title = `${v.def.word}｜${v.def.why}｜出处：${v.def.source.label}`;
      const act = v.def.id === (s.quality ?? "plain") ? " on" : "";
      const tag = v.def.id === (s.quality ?? "plain") ? `<b>正在用</b>` : `<i>料钱 ×${v.def.costMult}</i>`;
      return `<span class="qb${act}" data-act="quality" data-id="${v.def.id}" title="${title}">${v.def.name}${tag}</span>`;
    })
    .join("");
  return `<div class="qhd">进货 · ${qualitySummary(s)}<span class="sechint">${cur ? qualityWords(s) : ""}</span></div><div class="qlist">${chips}</div>`;
}

/**
 * 搭配区（A2）：24 条两件套。与味道区同一个写法，但**只列成立的与差一件的** ——
 * 24 条全铺出来会把配方页撑成一屏，玩家反而记不住哪条跟自己有关。
 * 其余那些收成一句「还有 N 搭要换别的配料」，想看全的去图鉴。
 */
function pairBoxHtml(s: GameState): string {
  const nameOf = (id: string) => TOPPINGS.find((t) => t.id === id)?.name ?? id;
  const views = pairingViews({ toppings: s.recipe.toppings, nameOf });
  const on = views.filter((v) => v.active);
  const near = views.filter((v) => !v.active && v.missing.length === 1);
  const restCount = PAIRING_TOTAL - on.length - near.length;
  const head = `<div class="flavhd">${icon("bowl")}这一碗的搭配 · ${pairingSummary(s.recipe.toppings)}${
    on.length === 0 && near.length > 0
      ? `<span class="sechint">再添「${near[0]!.missing.join("、")}」就是一搭「${near[0]!.def.name}」</span>`
      : restCount > 0
        ? `<span class="sechint">还有 ${restCount} 搭要换别的配料</span>`
        : ""
  }</div>`;
  const rows = [...on, ...near]
    .slice(0, 8)
    .map((v) => {
      const title = `${v.def.why}｜出处：${v.def.source.map((x) => x.label).join("；")}`;
      return `<span class="flav${v.active ? " on" : ""}" title="${title}">${v.def.name}${
        v.active ? `<b>${effectWords(v.def.effect)}</b>` : `<i>只差${v.missing.join("、")}</i>`
      }</span>`;
    })
    .join("");
  return `${head}<div class="flavlist">${rows || `<span class="flav"><i>这一碗还没凑成任何一搭</i></span>`}</div>`;
}

function collectionHtml(s: GameState): string {
    const p = collectionProgress(s);
    const chip = (name: string, unlocked: boolean): string =>
      `<span class="cchip${unlocked ? " on" : ""}">${unlocked ? name : "？？"}</span>`;

    const toppingChips = TOPPINGS.map((t) => chip(t.name, s.collection.toppings.includes(t.id))).join("");
    const customerChips = CUSTOMER_ARCHETYPES.map((c) =>
      chip(c.name, s.collection.customers.includes(c.id)),
    ).join("");
    const gradeChips = ["S", "A", "B", "C", "D"]
      .map((g) => chip(g, s.collection.grades.includes(g)))
      .join("");
    const provinceChips = CONTEST_RIVALS.map((r) =>
      chip(r.province, s.collection.provinces.includes(r.id)),
    ).join("");
    // 喜好按顾客聚合：同一位顾客发现了几维就亮几维，并显示已问出的具体取值
    const likeChips = CUSTOMER_ARCHETYPES.map((c) => {
      const found = LIKE_DIMS_ORDER.filter((d) => s.collection.likes.includes(`${c.id}:${d}`))
        .map((d) => `${LIKE_LABELS[d]}${likeValueLabel(c.prefs, d)}`)
        .join(" · ");
      return `<span class="cchip${found ? " on" : ""}">${c.name}${found ? ` · ${found}` : ""}</span>`;
    }).join("");
    // 分维进度：对标开罗 RallyData 的 GetLikeSoupNum，告诉玩家哪一口还没摸透
    const likeDimChips = likeStats(s)
      .map((d) => `<span class="cchip${d.found > 0 ? " on" : ""}">${LIKE_LABELS[d.dim]} ${d.found}/${d.total}</span>`)
      .join("");

    // 成就（B 批）：按组铺开，未达成的也写名字 —— 这批的目的就是「告诉玩家还有什么」，
    // 藏成「？？」等于把目标感又收回去了。
    const tv = trophyViews(s);
    const trophyGroups = TROPHY_GROUP_ORDER.map((g) => {
      const list = tv.filter((v) => v.def.group === g);
      const got = list.filter((v) => v.earned).length;
      const cards = list
        .map(
          (v) =>
            `<span class="tcard${v.earned ? " on" : ""}" title="${v.def.note}">${v.def.name}${
              v.earned ? "" : `<b class="tprog">${v.progressText}</b>`
            }</span>`,
        )
        .join("");
      return `<div class="tgroup"><div class="tgname">${TROPHY_GROUP_LABEL[g]} ${got}/${list.length}</div><div class="cgrid">${cards}</div></div>`;
    }).join("");
    // 味道（B1）：六条成型吃法，凑成一次就记下。每张卡都写清楚要哪几味、什么时候吃。
    const gotFlavors = s.collection.flavors ?? [];
    const flavorCards = FLAVORS.map((def) => {
      const got = gotFlavors.includes(def.id);
      const parts = def.toppings.map((id) => TOPPINGS.find((t) => t.id === id)?.name ?? id);
      if (def.noodle) parts.push(noodleById(def.noodle)?.short ?? def.noodle);
      const src = def.source.map((x) => x.label).join("；");
      return `<span class="tcard${got ? " on" : ""}" title="${def.why}｜出处：${src}">${def.name}<b class="tprog">${
        got ? def.when : parts.join(" + ")
      }</b></span>`;
    }).join("");
    /**
     * 街坊报（A11）：最近几天的头版，一天一条。
     * 只读不点 —— 报纸是拿来看的，做成任务就变味了。
     */
    const newsRows = newsList(s)
      .map((n) => `<div class="nrow"><span class="ndate">${newsDate(n)}</span><span class="ntext">${n.text}</span></div>`)
      .join("");
      /**
   * 南宁轻地图（A10）：十二个区摆在 6×4 格子上，上北下南。
   * 一格一句话 —— 你在哪、有没有分店、还有几家在抢。不做可走地图。
   */
  /** 地图下方那一行：这一片常去的地方（批 N′，只写名字不落数值） */
  function mapPlaceLine(s: GameState): string {
    const here = placeLineOf(s.district);
    if (!here) return "";
    return `这一片常去的地方：${here}。`;
  }

  function mapHtml(s: GameState): string {
    const cells = mapCells(s);
    const size = mapSize();
    /**
     * 锁住的格子不是不画，而是画成空框写「第 N 段能看到这一片」——
     * 直接不画会让地图缺角，看不出这城还有多大（批次九）。
     */
    const grid = cells
      .map((c) =>
        c.locked
          ? `<div class="mcell lock" style="grid-column:${c.x + 1};grid-row:${c.y + 1}" title="第 ${c.gate} 段能看到这一片">` +
            `<b>?</b><span class="mlock">第 ${c.gate} 段</span></div>`
          : `<div class="mcell${c.here ? " here" : ""}${c.branch ? " br" : ""}${c.rivals > 1 ? " hot" : ""}" ` +
            `style="grid-column:${c.x + 1};grid-row:${c.y + 1}" title="${c.name}｜每天约 ${c.traffic} 人｜${districtPitchOf(c.id)}${placeLineOf(c.id) ? `｜常去：${placeLineOf(c.id)}` : ""}${c.local ? `｜这一片产${c.local}` : ""}">` +
            `<b>${c.short}</b>` +
            (placeShortsOf(c.id).length > 0 ? `<span class="mplace">${placeShortsOf(c.id)[0]}</span>` : "") +
            (c.local ? `<em class="mprod">${c.local.slice(-2)}</em>` : "") +
            (c.rivals > 0 ? `<i>${c.rivals}</i>` : "") +
            (c.here ? `<span class="mhere">在这</span>` : c.branch ? `<span class="mbr">分店</span>` : "") +
            `</div>`,
      )
      .join("");
    return `<div class="sec">
        <div class="sechd">${icon("street")}南宁 · ${mapSummary(s)}</div>
        <div class="mmap" style="--mw:${size.w};--mh:${size.h}">${grid}</div>
        <div class="hint">${localSummary(s)}。格子里的小数字是同一条街上还在营业的同行；红框是竞争最挤的区；空框写着要几段才看得见。想搬区去「街面 · 换区」。</div>
        <div class="lmeta" data-places>${mapPlaceLine(s)}</div>
      </div>`;
  }

/**
   * 阿婆的笔记本（批次八）：图鉴最末一段。
   * 已解开的写正文（六十来字，阿婆口吻），没解开的只留一句「等你遇上」——
   * **不写条件**，写了就变成任务清单，册子就不是册子了。
   */
  const noteSec = `<div class="sec">
      <div class="sechd">${icon("book")}阿婆的笔记本 · ${noteSummary(s)}</div>
      <div class="sechint">她写字慢，一条一条来；遇上过的事，她才肯写下来。</div>
      ${NOTE_GROUPS.map((g) => {
        const rows = noteViews(s).filter((v) => v.def.group === g.id);
        const got = rows.filter((v) => v.unlocked).length;
        return `<div class="ngroup">
          <div class="nghd">${g.name} · ${got} / ${rows.length}</div>
          ${rows
            .map((v) =>
              v.unlocked
                ? `<div class="nrow2" title="阿婆原话：${v.def.elder}"><div class="ntitle">${v.def.title}</div><div class="nbody">${v.def.body}</div></div>`
                : `<div class="nrow2 locked"><div class="ntitle">${v.def.title}</div><div class="nbody">${v.def.cue}</div></div>`,
            )
            .join("")}
        </div>`;
      }).join("")}
    </div>`;

  /**
   * 店里的手册（批 N′）：十二页，一页一件事。
   *
   * 用 `<details>` 而不是弹窗：手册是拿来翻的，玩家常常只想扫标题。
   * 默认全收起 —— 打开图鉴就看到一大段说明书，反而不想读。
   */
  const manualSec = `<div class="sec">
      <div class="sechd">${icon("book")}店里的手册 · ${MANUAL_TOTAL} 页</div>
      <div class="sechint">一页一件事，点开看。手册只讲这间店真有的规矩。</div>
      ${manualSections()
        .map(
          (grp) => `<div class="mgroup"><div class="mghd">${grp.section}</div>
          ${grp.pages
            .map(
              (pg) => `<details class="mpage" data-manual="${pg.id}"><summary>${pg.title}</summary>
            <div class="mgist">${pg.gist}</div><div class="mbody">${pg.body}</div></details>`,
            )
            .join("")}
        </div>`,
        )
        .join("")}
    </div>`;

  const newsSec = `<div class="sec">
      <div class="sechd">${icon("book")}街坊报 · ${newsSummary(s)}</div>
      <div class="lmeta" style="padding:0 2px 8px">每天打烊出一条，写这条街上真发生过的事 —— 开了店、评了段、赢了赛、同行关门、街上修好了什么。报上不评价你，只把事记下来。</div>
      ${newsRows || `<div class="lmeta">今天还没出报，明天打烊就有了。</div>`}
    </div>`;
  const mapSec = mapHtml(s);
    const flavorSec = `<div class="sec"><div class="sechd">${icon("pan")}味道 · ${gotFlavors.length}/${FLAVOR_TOTAL}<span class="sechint">每条都是南宁真有人这么吃的，凑成一次就记下</span></div><div class="tgroups"><div class="tgroup"><div class="tgname">成型吃法</div><div class="cgrid">${flavorCards}</div></div></div></div>`;

    const near = nextTrophy(s);
    /**
     * 四维图例（批次一）：九档是「读法」，所以图鉴里要说清每一维看什么、
     * 九档各是什么话——玩家学的是客人的判断，不是看分数表。
     */
    const tierSec = `<div class="sec"><div class="sechd">${icon("star")}四维 · 九档<span class="sechint">客人评价一碗粉，只说这四句：够不够味、镬气有没有、够不够饱、好不好看</span></div><div class="tlegend">${DIMS.map(
      (d) =>
        `<div class="trow2" title="${d.what}"><span class="tdim2">${d.name}</span><span class="tcells2">${TIER_WORDS[d.id]
          .map((w, i) => `<i title="${tierWord(i + 1)}：${w}"></i>`)
          .join("")}</span><span class="twhat">${d.what}</span></div>`,
    ).join("")}</div></div>`;
    const trophySec = `<div class="sec"><div class="sechd">${icon("star")}成就 · ${trophySummary(s)}<span class="sechint">${
      near ? `下一条最近：「${near.def.name}」 ${near.progressText}` : "全收齐了"
    }</span></div><div class="tgroups">${trophyGroups}</div></div>`;

    const gotBowls = BOWLS.filter((b) => b.free || (s.bowls ?? []).includes(b.id) || (BOWL_BY_ID.has(b.id) && s.bowl === b.id));    const bowlCards = BOWLS.map((b) => {
      const on = gotBowls.includes(b);
      return `<div class="tcard${on ? " on" : ""}"><b class="tname">${b.name}</b><span class="tprog">${
        on ? b.effectText : "？？"
      }</span></div>`;
    }).join("");
    const bowlSec = `<div class="sec"><div class="sechd">${icon("bowl")}碗 · ${gotBowls.length}/${BOWL_TOTAL}<span class="sechint">端出去的那只 —— 消毒钢碗、搪瓷碗、大盆、瓦煲、打包碗</span></div><div class="tgroups"><div class="tgroup"><div class="tgname">用过的手感</div><div class="cgrid">${bowlCards}</div></div></div></div>`;

    return `<div class="sec"><div class="sechd">浇头 ${p.toppings}/${TOPPINGS.length}</div><div class="cgrid">${toppingChips}</div></div>
      <div class="sec"><div class="sechd">顾客 ${p.customers}/${CUSTOMER_ARCHETYPES.length}</div><div class="cgrid">${customerChips}</div></div>
      <div class="sec"><div class="sechd">口味喜好 ${p.likes}/${LIKES_TOTAL}</div><div class="cgrid">${likeDimChips}</div><div class="cgrid">${likeChips}</div></div>
      <div class="sec"><div class="sechd">评级 ${p.grades}/5</div><div class="cgrid">${gradeChips}</div></div>
      <div class="sec"><div class="sechd">赢过的省 ${p.provinces}/${CONTEST_RIVALS.length}</div><div class="cgrid">${provinceChips}</div></div>
      ${tierSec}
      ${trophySec}
      ${flavorSec}${mapSec}${newsSec}${noteSec}${manualSec}
      ${bowlSec}`;
  }

  /**
   * 手艺页（批 K′）：四条线 × 四格 = 十六项。
   *
   * 为什么是一格一格的树而不是一列长列表：这是「点」的动作，开罗的点数树也是
   * 一格一格往上点。四条线各用一个已有色（镬气红 / 刀工金 / 记性绿 / 人情蓝），
   * **不新增颜色** —— 色板只有十二个（`game/src/render/palette.ts`）。
   */
  function perkHtml(s: GameState): string {
    const views = perkViews(s);
    const pts = perkPoints(s);
    const fams = perkFamilies(s);
    const familyColor: Record<string, string> = {
      heat: "red",
      knife: "gold",
      memory: "green",
      human: "blue",
    };
    const blocks = fams
      .map((fam) => {
        const cells = fam.rows
          .map((v) => {
            const rec = fam.rec === v.def.id;
            const cls = v.owned ? "pc on" : v.affordable ? "pc can" : v.blocked ? "pc blk" : "pc";
            const title = `${rec ? "先点这个 · " : ""}${v.def.name}｜${v.effectWords}｜${v.reason || "点一下就用掉手艺点"}`;
            return `<button type="button" class="${cls}${rec ? " rec" : ""} ${familyColor[fam.family] ?? "ink"}" data-act="buyperk" data-id="${v.def.id}"${rec ? ' data-rec="1"' : ""} title="${title}">${v.def.name}</button>`;
          })
          .join("");
        return `<div class="pblock"><div class="phead">${fam.name}<span class="tag2">${fam.owned} / ${fam.total}</span></div><div class="ptree">${cells}</div></div>`;
      })
      .join("");
    return `
  <div class="sec">
    <div class="sechd">${icon("star")}${perkSummary(s)}</div>
    <div class="sechint">段位每升一级发手艺点，一共 ${perkPoints(s)} 点在手。<b>点了就退不回来</b>，四条线各管一头：镬气管味道、刀工管浇头、记性管出碗、人情管人情。线要从最便宜那一项起手，前一项没点，后一项写「先点「X」」。</div>
    <div class="ppoints">还剩 <b>${pts}</b> 点手艺</div>
    ${blocks}
    <div class="lmeta">${views.filter((v) => v.owned).length} / ${views.length} 项已经点上</div>
  </div>`;
  }

  function ledgerHtml(s: GameState): string {
    const report = s.pendingReport;
    const reportHtml = report
      ? `<div class="report">
          <div class="rt">第 ${report.year} 年结算<span class="grade g${report.rating}">${report.rating}</span></div>
          <div class="rline">营收 ${money(report.revenue)} / 目标 ${money(report.target)}</div>
          <div class="rline">客流 ${report.customers} 位 · 平均满意度 ${report.avgSat}</div>
          <div class="rline">奖金 ${money(report.bonus)}</div>
          ${report.final ? `<div class="rline strong">三年经营结束，你就是南宁的老友粉王。</div>` : ""}
          <button type="button" class="widebtn" data-act="dismiss">收下奖金</button>
        </div>`
      : "";

    const months = s.months
      .slice(-8)
      .reverse()
      .map(
        (m) => `<div class="lrow compact">
          <div class="lname">${Math.floor(m.month / 12) + 1} 年 ${(m.month % 12) + 1} 月<span class="grade g${m.grade}">${m.grade}</span></div>
          <div class="lmeta">营收 ${money(m.revenue)} / 目标 ${money(m.target)} · 客 ${m.customers} · 满意 ${m.avgSat} · 利润 ${money(m.profit)}</div>
        </div>`,
      )
      .join("");

    const years = s.years
      .map(
        (y) => `<div class="lrow compact">
          <div class="lname">第 ${y.year} 年<span class="grade g${y.rating}">${y.rating}</span></div>
          <div class="lmeta">营收 ${money(y.revenue)} · 客 ${y.customers} · 平均满意 ${y.avgSat} · 奖金 ${money(y.bonus)}</div>
        </div>`,
      )
      .join("");

    return `${reportHtml}
      <div class="sec"><div class="sechd">${icon("crate")}月度账本 · 最近 8 个月</div>${months || `<div class="empty2">还没走完一个月。</div>`}</div>
      <div class="sec"><div class="sechd">${icon("crate")}年度成绩</div>${years || `<div class="empty2">满 12 个月出一次年度结算。</div>`}</div>`;
  }

  const bodyOf = (tab: PanelTab): HTMLElement | null =>
    wrap.querySelector<HTMLElement>(`[data-body="${tab}"]`);

  /**
   * 粉型卡片（P42）：把原来「粉宽 / 粉型」两个滑块换成六种能点的粉。
   *
   * 滑块的问题是玩家在猜数字；粉型是离散选择，每张卡直接说清
   * 「它跟现在的汤配不配（契合度）」「当季还是反季」「还差几位客人解锁」。
   */
  function renderNoodles(s: GameState): void {
    const views = noodleViews(s);
    const key = views
      .map((v) => `${v.def.id}:${v.on ? 1 : 0}:${v.unlocked ? 1 : 0}:${v.fit}:${v.seasonFactor}`)
      .join(",");
    noodleSumEl.textContent = ` ${noodleSummary(s)}`;
    if (key === noodleKey) return;
    noodleKey = key;
    noodlesEl.innerHTML = views
      .map((v) => {
        const cls = ["ncard"];
        if (v.on) cls.push("on");
        if (!v.unlocked) cls.push("locked");
        const seasonTag = v.def.season
          ? v.inSeason
            ? `<b class="ntag hot">当季 ×1.15</b>`
            : `<b class="ntag cold">反季 ×0.85</b>`
          : `<b class="ntag all">全年</b>`;
        const foot = v.unlocked
          ? `<span class="nfit">契合 <b>${v.fit}%</b></span>`
          : `<span class="nfit">还差 ${v.short} 位客人</span>`;
        return `<button type="button" class="${cls.join(" ")}" data-act="setnoodle" data-id="${v.def.id}" ${v.unlocked ? "" : "disabled"}>
          <span class="nname">${v.def.name}</span>
          ${seasonTag}
          ${foot}
          <span class="nline">${v.def.line}</span>
        </button>`;
      })
      .join("");
  }

  /**
   * 主料卡片（P46）：老友粉的菜单是按主料分行的 —— 老友粉 / 老友猪杂粉 /
   * 老友牛肉粉 / 老友牛腩粉…… 所以主料不是滑块，是十张能点的卡。
   * 每张卡说清：料钱贵多少、建议加价多少、满意加多少、还差几位客人。
   */
  function renderMains(s: GameState): void {
    const views = mainViews(s);
    const key = views
      .map((v) => `${v.def.id}:${v.on ? 1 : 0}:${v.unlocked ? 1 : 0}`)
      .join(",");
    mainSumEl.textContent = ` ${mainSummary(s)}`;
    if (key === mainKey) return;
    mainKey = key;
    mainsEl.innerHTML = views
      .map((v) => {
        const cls = ["ncard", "mcard"];
        if (v.on) cls.push("on");
        if (!v.unlocked) cls.push("locked");
        const money = v.def.costYuan === 0 ? "不额外花料钱" : `料钱 ${v.def.costYuan > 0 ? "+" : "−"}¥${Math.abs(v.def.costYuan).toFixed(1)}`;
        const suggest =
          v.def.suggestAddYuan === 0
            ? "建议价照旧"
            : `建议加价 ${v.def.suggestAddYuan > 0 ? "+" : "−"}¥${Math.abs(v.def.suggestAddYuan)}`;
        const foot = v.unlocked
          ? `<span class="nfit">${money} · ${suggest}</span>`
          : `<span class="nfit">还差 ${v.short} 位客人</span>`;
        return `<button type="button" class="${cls.join(" ")}" data-act="setmain" data-id="${v.def.id}" ${v.unlocked ? "" : "disabled"}>
          <span class="nname">${v.def.name}</span>
          ${v.def.satBonus > 0 ? `<b class="ntag hot">满意 +${v.def.satBonus}</b>` : `<b class="ntag all">基础</b>`}
          ${foot}
          <span class="nline">${v.def.line}</span>
        </button>`;
      })
      .join("");
  }

  /**
   * 菜单（P47）：同时卖几款。
   *
   * 开罗的售卖机上挂一排券，客人自己挑一款买票（help.txt `Staff 3`），
   * 店铺人气按菜单里所有款聚合（`Shop Stats`）。这里的卡片就是那排券：
   * 点一张切过去编辑它，上架/下架决定客人今天买不买得到。
   */
  /**
   * 一款的「方子」那一行（A6）。
   *
   * 没定过：四个小印章按钮，人情/钱不够就灰掉并在 title 里写原因；
   * 定过：只显示那个印章和方子名 —— 一锅只定一条，定了就不再给别的选项。
   */
  function masterRow(s: GameState, item: MenuItem, index: number): string {
    const cur = masterOf(item);
    if (cur) {
      return `<div class="macts done" title="${cur.line}｜${cur.what}"><span class="mseal">${cur.seal}</span><span class="mname">${cur.name}</span></div>`;
    }
    const views = masterViews(s, item);
    const chips = views
      .map((v) => {
        const cost = [v.def.favorCost > 0 ? `人情 ${v.def.favorCost}` : "", v.def.costYuan > 0 ? `¥${v.def.costYuan}` : ""]
          .filter(Boolean)
          .join(" · ");
        const tip = `${v.def.name}：${v.def.what}（要 ${cost || "不花钱"}）`;
        return `<button type="button" class="mact" data-act="master" data-id="${index}|${v.def.id}" ${v.affordable ? "" : "disabled"} title="${tip}"><span class="mseal">${v.def.seal}</span></button>`;
      })
      .join("");
    return `<div class="macts"><span class="mlead" title="师傅定的方子一锅只能定一条，定了不能改">请师傅定</span>${chips}</div>`;
  }

  function renderMenu(s: GameState): void {
    const views = menuViews(s);
    const key = `${views.map((v) => `${v.item.id}:${v.item.on ? 1 : 0}:${v.editing ? 1 : 0}:${v.item.price}:${v.sold}`).join(",")}|${views.map((v) => s.menuAlias?.[String(v.item.id)] ?? "").join(",")}|${s.gradeLevel}|${views.map((v) => v.item.master ?? "").join(",")}|${s.favor}|${s.cash}|${views.map((v) => `${v.item.main}${v.item.noodle}${v.item.portion}:${v.item.recipe.toppings.join("-")}`).join(",")}`;
    menuSumEl.textContent = ` ${menuSummary(s)}`;
    if (key === menuKey) return;
    menuKey = key;
    const cards = views
      .map((v) => {
        const cls = ["dcard"];
        if (v.item.on) cls.push("on");
        if (v.editing) cls.push("editing");
        const sold = v.sold > 0 ? `已卖 ${v.sold} 碗` : "还没开张";
        return `<div class="${cls.join(" ")}">
          <button type="button" class="dhead" data-act="pickdish" data-id="${v.index}">
            <span class="nname">${dishNameOfItem(s, v.item)}</span>
            <b class="dprice">¥${v.price}</b>
          </button>
          <label class="drename" title="自己起个名，八个字以内；留空改回系统名"><span>叫</span><input type="text" maxlength="8" data-rename="${v.item.id}" value="${escAttr(dishNameOfItem(s, v.item))}"></label>
          ${isHouseBowl(v.item) ? '<span class="dmine" title="老友猪杂伊面 —— 南宁最家常的一碗，也是老板自己想吃的那碗">老板那碗</span>' : ""}
          <span class="nfit">味道 ${Math.round(v.score.total)} · ${v.score.grade} · ${sold}</span>
          <span class="ntier" title="四维九档：客人怎么评价这一碗">${tierLine(v.item, v.score)}</span>
          <div class="dacts">
            <button type="button" class="dbtn${v.item.on ? " on" : ""}" data-act="toggledish" data-id="${v.index}" ${v.canToggle ? "" : "disabled"}>${v.item.on ? "在架" : "下架"}</button>
            <button type="button" class="dbtn" data-act="sellrecipe" data-id="${v.index}" ${v.canRemove ? "" : "disabled"} title="转手给别人，换人情">转手</button>
          </div>
          ${masterRow(s, v.item, v.index)}
        </div>`;
      })
      .join("");
    const cap = menuCap(s);
    const full = views.length >= cap;
    const addLabel = full ? `菜单位满了（${views.length}/${cap}）· 评到第 ${s.gradeLevel + 2} 段再挂一款` : `＋ 加一款（照着这碗改）`;
    menuEl.innerHTML = `${cards}<button type="button" class="dcard add" data-act="adddish" ${full ? "disabled" : ""}>${addLabel}</button>`;
  }

  /** 份量（P46）：店里的原话就是「二两还是三两」 */
  function renderPortions(s: GameState): void {
    const size = portionOf(s.portion).size;
    portionSumEl.textContent = ` ${portionSummary(s)}`;
    if (size === portionKey) return;
    portionKey = size;
    portionsEl.innerHTML = PORTIONS.map((p) => {
      const on = p.size === size;
      const foot =
        p.priceDelta === 0
          ? "菜单价就是这个"
          : `成本 +¥${p.costYuan.toFixed(1)} · 卖价 +¥${p.priceDelta} · 出碗慢 ${Math.round((p.serveFactor - 1) * 100)}%`;
      return `<button type="button" class="pbtn${on ? " on" : ""}" data-act="setportion" data-id="${p.size}">
        <b>${p.name}</b><span>${foot}</span>
      </button>`;
    }).join("");
  }

  function renderPane(s: GameState, score: RecipeScore): void {
    if (current === "recipe") {
      (["soup", "noodle"] as const).forEach((group) => {
        const defs = group === "soup" ? SOUP_DEFS : NOODLE_DEFS;
        const values = group === "soup" ? s.recipe.soup : s.recipe.noodle;
        defs.forEach((d, i) => {
          const input = wrap.querySelector<HTMLInputElement>(`[data-param="${group}:${i}"]`);
          if (input) {
            if (document.activeElement !== input) {
              input.value = String(values[i] ?? d.min);
            }
            input.min = String(d.min);
            input.max = String(d.max);
          }
          const label = wrap.querySelector<HTMLElement>(`[data-slval="${group}:${i}"]`);
          if (label) label.textContent = String(Math.round(values[i] ?? 0));
        });
      });
      if (document.activeElement !== priceInput) priceInput.value = String(s.price);
      priceV.textContent = `¥${s.price}`;
      renderMenu(s);
    renderMains(s);
      renderPortions(s);
      renderNoodles(s);
      // 这碗粉叫什么（P43）：四轴（做法×主料×粉型×加料）从当前配置推出来，评语按分数 5 档
      const dishKey = `${dishNameOf(s)}|${score.total}`;
      if (dishKey !== lastDishKey) {
        lastDishKey = dishKey;
        const note = dishNoteOf(score.total);
        dishNameEl.textContent = dishNameOf(s);
        dishNoteEl.textContent = `${note.word} —— ${note.line}`;
      }
      scoreBig.textContent = String(score.total);
      gradeEl.textContent = score.grade;
      gradeEl.className = `grade g${score.grade}`;
      const suggested = suggestPriceWithMain(s.main, s.portion);
      // 毛利按「实收价」算：三两加 ¥2 是收进来的钱，不能只拿菜单价减成本
      const realMargin = bowlPriceOf(s) - score.cost;
      const gKey = `${s.rice}|${s.bone}`;
      const qualityKey = `${s.quality ?? "plain"}|${Math.floor(s.cash / 1000)}`;
      if (gKey !== lastGradeKey) {
        lastGradeKey = gKey;
        gradesEl.innerHTML = gradesHtml(s);
        gradeSumEl.textContent = ` ${gradeSummary(s)}`;
      }
      const fKey = `${s.noodle}|${s.recipe.toppings.join(",")}`;
      if (fKey !== lastFlavorKey) {
        lastFlavorKey = fKey;
        flavorsEl.innerHTML = flavorBoxHtml(s);
        pairsEl.innerHTML = pairBoxHtml(s);
      }
      if (qualityKey !== lastQualityKey) {
        lastQualityKey = qualityKey;
        qualityEl.innerHTML = qualityBoxHtml(s);
      }
      econ2.innerHTML = `魅力 <b>${score.charm}</b> · 性价比 <b>${score.valueScore}</b><br>成本 ¥${score.cost.toFixed(1)} · 实收 ¥${bowlPriceOf(s).toFixed(0)} · 毛利 ¥${realMargin.toFixed(1)}<br>建议卖 ¥${suggested}<br>门店吸引力 <b>${score.storeScore}</b>`;
      const subKey = score.subs.map((x) => Math.round(x.value)).join(",");
      if (keys.recipe !== subKey) {
        keys.recipe = subKey;
        subList.innerHTML = score.subs
          .map(
            (x) =>
              `<div class="subrow"><span>${x.label}</span><span class="sbar"><i class="${x.group}" style="width:${Math.round(x.value)}%"></i></span><b>${Math.round(x.value)}</b></div>`,
          )
          .join("");
      }
      return;
    }

    const body = bodyOf(current);
    if (!body) return;

    let html = "";
    let key = "";
    if (current === "staff") {
      key = `${s.staff.roster.map((m) => `${m.uid}:${m.fatigue}:${m.resting}:${m.xp ?? 0}`).join(",")}|${s.staff.candidates.map((c) => c.uid).join(",")}|${Math.floor(s.cash / 100)}|${s.staff.lastEvent}`;
      html = staffHtml(s);
    } else if (current === "shop") {
      key = `${Object.entries(s.venue.upgrades).join(",")}|${Math.floor(s.cash / 100)}|${s.venue.seats}|${s.venue.stoves}|${s.capacity}|${s.venue.expansion}|${s.gradeLevel}|${s.district}|${s.sides.active.join("+")}|${Object.keys(s.sides.sold).length}|${s.tally.comboHits}|${s.venue.seats}|${s.venue.stoves}|${Object.values(s.equipment ?? {}).join("")}|${s.branches.length}|${branchPick}|${s.sides.mealDeal}|${s.sides.drinkTemp}|${(s.streets ?? []).length}|${(s.gear ?? []).length}|${s.style ?? ""}|${(s.styles ?? []).length}|${s.bowl ?? ""}|${(s.bowls ?? []).length}|${s.menu.map((m) => `${m.id}:${m.price}`).join(",")}|${(s.rivals ?? []).filter((r) => r.closed).length}|${s.retail?.channel ?? ""}|${Object.entries(s.retail?.prices ?? {}).map(([k, v]) => `${k}:${v}`).join(",")}|${Object.values(s.retail?.sold ?? {}).reduce((n, v) => n + v, 0)}|${Object.entries(s.investments ?? {}).map(([k, v]) => `${k}:${v}`).join(",")}|${Object.entries(s.goods ?? {}).map(([k, v]) => `${k}:${v}`).join(",")}|${Math.round(s.favor ?? 0)}|${remoteLineCount()}`;
      html = shopHtml(s);
    } else if (current === "perk") {
      key = `${Object.keys(s.perks ?? {}).sort().join(",")}|${s.gradeLevel}`;
      html = perkHtml(s);
    } else if (current === "contest") {
      key = `${s.month}|${s.contest.lastMonth}|${s.contest.results.length}|${score.total}|${Math.floor(s.cash / 100)}`;
      html = contestHtml(s, score);
    } else if (current === "collection") {
      key = `${s.collection.toppings.length}|${s.collection.customers.length}|${s.collection.grades.length}|${s.collection.provinces.length}|${s.collection.likes.length}|${(s.collection.flavors ?? []).length}|${(s.bowls ?? []).length}|${(s.flow.notes ?? []).length}|${s.news.length}|${(s.rivals ?? []).filter((r) => !r.closed).length}|${s.bowl ?? ""}|${s.gradeLevel}|${s.district}|${(s.branches ?? []).length}`;
      html = collectionHtml(s);
    } else {
      key = `${s.months.length}|${s.years.length}|${s.pendingReport?.year ?? -1}|${s.finished}|${Math.floor(s.cash / 100)}`;
      html = ledgerHtml(s);
    }
    if (keys[current] !== key) {
      keys[current] = key;
      body.innerHTML = html;
    }
  }

  const render = (s: GameState, score: RecipeScore): void => {
    lastState = s;
    lastScore = score;
    if (s.pendingReport && s.pendingReport.year !== lastReportYear) {
      lastReportYear = s.pendingReport.year;
      open("ledger");
    }
    if (wrap.hidden) return;
    renderPane(s, score);
  };

  return {
    open,
    close,
    isOpen: () => !wrap.hidden,
    render,
  };
}
