import { CONTEST_RIVALS, CONTEST_TIERS, CONTEST_TYPES, CONTEST_TYPE_BY_ID, tierOf } from "../data/contest";
import { BOWL } from "../data/anchors";
import { CUSTOMER_ARCHETYPES, LIKE_DIMS_ORDER, LIKE_LABELS, likeValueLabel } from "../data/customers";
import { TOPPINGS } from "../data/ingredients";
import { EQUIPMENT } from "../data/equipment";
import { HIRE_FEE_RATE, MAX_STAFF, ROLE_LABEL, monthlyWageOf, nextStaffNeed, staffSlots } from "../data/staff";
import { UPGRADES } from "../data/shop";
import { collectionProgress, likeStats, LIKES_TOTAL } from "../sim/collection";
import { canEnter, contestScore, maxTierOf } from "../sim/contest";
import { arenaSummary, arenaViews } from "../sim/arena";
import { isContestMonth, monthsToContest } from "../sim/calendar";
import { districtOptions } from "../sim/district";
import { checkGrade } from "../sim/grade";
import { equipLevel, equipNextCost } from "../sim/equipment";
import { expansionLevel, expansionLockReason, nextExpansion } from "../sim/expansion";
import { gradeOf, unlockViews } from "../sim/unlocks";
import { kindLabel, drinkTempSummary, sideShareOf, sideSummary, sideViews } from "../sim/sides";
import { noodleSummary, noodleViews } from "../sim/noodles";
import { bowlPriceOf, mainSummary, mainViews, portionSummary } from "../sim/mains";
import { PORTIONS, portionOf, suggestPriceWithMain } from "../data/mains";
import { dishNameOf, dishNameOfItem } from "../sim/dish";
import { menuCap, menuSummary, menuViews } from "../sim/menu";
import { dishNoteOf } from "../data/dish-name";
import { branchSizeOptions, branchSummary, branchViews } from "../sim/branches";
import { MAX_BRANCHES, MANAGER_MONTHLY } from "../data/branches";
import { districtNameOf } from "../data/nanning";
import { rivalViews, standingOf, streetSummary } from "../sim/rivals";
import { nextRequest, streetMap, streetSummary as blockSummary, streetViews } from "../sim/streets";
import { GEAR_EFFICIENCY_IDS, gearEfficiencyLeft, gearSummary, gearViews } from "../sim/gear";
import { comboSummary, comboViews } from "../sim/combo";
import { GEAR_BY_ID, GEAR_SPOT_LABEL } from "../data/gear";
import { shopMap, shopMapSummary } from "../sim/shopmap";
import { CAPACITY_LOST_RATE, lostRateOf } from "../sim/hook";
import { favorSummary, favorViews } from "../sim/favor";
import { TROPHY_GROUP_LABEL, TROPHY_GROUP_ORDER } from "../data/trophies";
import { FLAVORS, FLAVOR_TOTAL, type FlavorEffect } from "../data/flavor";
import { noodleById } from "../data/noodles";
import { flavorSummary, flavorViews, nearlyFlavor } from "../sim/flavor";
import { nextTrophy, trophySummary, trophyViews } from "../sim/trophies";
import { STYLES, STYLE_PART_LABEL } from "../data/style";
import { nextStyle, styleSummary, styleViews } from "../sim/style";
import { levelProgressOf, tourneySummary, tourneyViews } from "../sim/tourneys";
import { devNote } from "./dev";
import { getLine, remoteLineCount } from "../ai/lines";
import { icon } from "./icons";
import type { RecipeScore } from "../sim/score";
import { upgradeCost, upgradeLevel } from "../sim/shop";
import { bowlMinutes, dailyWage } from "../sim/staff";
import { SERVE_MINUTES } from "../sim/customer";
import { equipServeMultiplier } from "../sim/equipment";
import type { GameState } from "../sim/state";

export type PanelTab = "recipe" | "staff" | "shop" | "contest" | "collection" | "ledger";

const TAB_TITLE: Record<PanelTab, string> = {
  recipe: "配方研发 · 汤 / 粉 / 浇头",
  staff: "员工 · 招募与疲劳",
  shop: "店铺 · 门面与手艺",
  contest: "全国老友粉大赛",
  collection: "图鉴 · 收集进度",
  ledger: "账本 · 月度与年度结算",
};

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: "recipe", label: "配方" },
  { id: "staff", label: "员工" },
  { id: "shop", label: "店铺" },
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

export interface PanelActions {
  setParam(group: "soup" | "noodle", index: number, value: number): void;
  setPrice(value: number): void;
  hire(uid: string): void;
  fire(uid: string): void;
  toggleRest(uid: string): void;
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
              <div class="flavorbox" data-flavors></div>
            </div>
          </div>
        </section>
        <section class="pane" data-pane="staff" hidden><div data-body="staff"></div></section>
        <section class="pane" data-pane="shop" hidden><div data-body="shop"></div></section>
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
      case "fire":
        actions.fire(id);
        break;
      case "rest":
        actions.toggleRest(id);
        break;
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
          <div class="lname">${m.name}<span class="tag2">${ROLE_LABEL[m.role]}</span><span class="tag2">技能 ${m.skill}</span></div>
          <div class="lmeta">日薪 ¥${m.wage}${m.resting ? " · 今天休息（半薪）" : ""}</div>
          <div class="fat"><i class="${fatigueClass}" style="width:${Math.min(100, m.fatigue)}%"></i></div>
          <div class="lbtns">
            <button type="button" data-act="rest" data-id="${m.uid}">${m.resting ? "复工" : "休息"}</button>
            <button type="button" class="danger" data-act="fire" data-id="${m.uid}">辞退</button>
          </div>
        </div>`;
      })
      .join("");

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
        <div class="sechd">${icon("staff")}在职 ${s.staff.roster.length}/${slots} · 日薪 ${money(dailyWage(s))}</div>
        ${roster || `<div class="empty2">还没雇人。你自己一个人炒锅，出碗 6 分钟。</div>`}
        <div class="hint">${s.staff.lastEvent || "疲劳到 100 会辞职，记得安排休息。"}</div>
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
    const equipRows = EQUIPMENT.map((e) => {
      const lv = equipLevel(s, e.id);
      const cost = equipNextCost(s, e.id);
      const maxed = !Number.isFinite(cost);
      const next = maxed ? "已到顶档" : e.effects[lv] ?? "";
      return `<div class="lrow">
        <div class="lname">${e.name}<span class="tag2">Lv ${lv}/4</span><span class="tag2">${next}</span></div>
        <div class="lmeta">${e.desc}</div>
        <div class="lbtns"><button type="button" data-act="buyequip" data-id="${e.id}" ${maxed ? "disabled" : ""}>${maxed ? "已到顶档" : money(cost)}</button></div>
      </div>`;
    }).join("");
    const serveNow = bowlMinutes(s, SERVE_MINUTES, equipServeMultiplier(s));
    // 流失超过 45%：这一页最该看的不是菜单，是「店面」和「设备」（P70）
    const hot = lostRateOf(s) >= CAPACITY_LOST_RATE ? " hot" : "";

    // 扩建：四档，按顺序买（data/expansion.ts），后两档挂段位门槛（开罗 rank）
    const nextExp = nextExpansion(s);
    const expLv = expansionLevel(s);
    const expLock = expansionLockReason(s);
    const expRow = nextExp
      ? `<div class="lrow${expLock ? " locked" : ""}">
          <div class="lname">${nextExp.name}<span class="tag2">第 ${expLv + 1}/4 步</span>${nextExp.minGrade > 0 ? `<span class="tag2">需第 ${nextExp.minGrade} 段</span>` : ""}</div>
          <div class="lmeta">${nextExp.desc} · 座位 +${nextExp.seats}${nextExp.stoves ? ` · 灶 +${nextExp.stoves}` : ""}</div>
          <div class="lbtns"><button type="button" data-act="buildexpand" ${s.cash < nextExp.costYuan || expLock ? "disabled" : ""}>${expLock ? "段位不够" : money(nextExp.costYuan)}</button></div>
        </div>`
      : `<div class="lrow"><div class="lname">已经扩到顶了<span class="tag2">座位 ${s.venue.seats} · 灶 ${s.venue.stoves}</span></div><div class="lmeta">下一步是换区开分店（S6）。</div></div>`;

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
        <div class="lmeta" style="padding:0 2px 8px">本区客流每季度 −9%，别处每季度 +6%%。转让费一次性，搬完能量从 100%% 重新开始。</div>
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
              ? `招牌 ¥${sig.price} · 实力 ${sig.taste} · 服气了，抢的人砍半`
              : `招牌 ¥${sig.price} · 实力 ${sig.taste} · 再赢 ${v.toPacify} 场就服气`;
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
          ${rumour ? `<div class="lmeta rumour">街坊说：${rumour}</div>` : ""}
          ${btn}
        </div>`;
      })
      .join("");
    const streetSec = `<div class="sec">
        <div class="sechd">${icon("people")}同条街 · ${streetSummary(s)}</div>
        <div class="lmeta" style="padding:0 2px 8px">这条街不止你一家，客人是同一批人：他们抢走多少，你就少卖多少。比赛赢多了他们会服气（每家 3 次），服气后抢的人砍半；撑不下去关门的铺子可以接手，租金打折。</div>
        <div class="lmeta"><b>你在这条街的口碑 ${standing}</b>（跟这条街最强的同行比：越高越是你说了算）</div>
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
    const gearHot = lostRateOf(s) >= CAPACITY_LOST_RATE && gearEfficiencyLeft(s).length > 0;
    const gearRows = gv
      .map(
        (v) => `<div class="lrow${v.owned ? " locked" : ""}">
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
    const ups = UPGRADES.map((u) => {      const lv = upgradeLevel(s, u.id);
      const cost = upgradeCost(s, u.id);
      const maxed = lv >= u.maxLevel;
      return `<div class="lrow">
        <div class="lname">${u.name}<span class="tag2">Lv ${lv}/${u.maxLevel}</span></div>
        <div class="lmeta">${u.desc}</div>
        <div class="lbtns"><button type="button" data-act="buy" data-id="${u.id}" ${maxed ? "disabled" : ""}>${maxed ? "已满级" : money(cost)}</button></div>
      </div>`;
    }).join("");
    return `<div class="sec">
        <div class="sechd${hot}">${icon("shop")}店面 · 座位 ${s.venue.seats} · 灶 ${s.venue.stoves}</div>
        <div class="lmeta" style="padding:0 2px 8px">扩建一次要几万，等于一两个月的净利；但座位和灶位只从这里涨。</div>
        ${expRow}
      </div>
      <div class="sec">
        <div class="sechd${hot}">${icon("crate")}设备 · 现在出碗 ${serveNow.toFixed(1)} 分/碗</div>
        <div class="lmeta" style="padding:0 2px 8px">换灶、换粉篓、加案台，都是买一次用到底。钱不够就先别动，一碗毛利只有 ¥${(s.price - BOWL.costYuan).toFixed(1)}。</div>
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
        <div class="sechd">${icon("crate")}摆件</div>
        ${ups}
      </div>
      ${sidesSec}
      ${gradeSec}
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
function effectWords(e: FlavorEffect): string {
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
    const flavorSec = `<div class="sec"><div class="sechd">${icon("pan")}味道 · ${gotFlavors.length}/${FLAVOR_TOTAL}<span class="sechint">每条都是南宁真有人这么吃的，凑成一次就记下</span></div><div class="tgroups"><div class="tgroup"><div class="tgname">成型吃法</div><div class="cgrid">${flavorCards}</div></div></div></div>`;

    const near = nextTrophy(s);
    const trophySec = `<div class="sec"><div class="sechd">${icon("star")}成就 · ${trophySummary(s)}<span class="sechint">${
      near ? `下一条最近：「${near.def.name}」 ${near.progressText}` : "全收齐了"
    }</span></div><div class="tgroups">${trophyGroups}</div></div>`;

    return `<div class="sec"><div class="sechd">浇头 ${p.toppings}/${TOPPINGS.length}</div><div class="cgrid">${toppingChips}</div></div>
      <div class="sec"><div class="sechd">顾客 ${p.customers}/${CUSTOMER_ARCHETYPES.length}</div><div class="cgrid">${customerChips}</div></div>
      <div class="sec"><div class="sechd">口味喜好 ${p.likes}/${LIKES_TOTAL}</div><div class="cgrid">${likeDimChips}</div><div class="cgrid">${likeChips}</div></div>
      <div class="sec"><div class="sechd">评级 ${p.grades}/5</div><div class="cgrid">${gradeChips}</div></div>
      <div class="sec"><div class="sechd">赢过的省 ${p.provinces}/${CONTEST_RIVALS.length}</div><div class="cgrid">${provinceChips}</div></div>
      ${trophySec}
      ${flavorSec}`;
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
  function renderMenu(s: GameState): void {
    const views = menuViews(s);
    const key = `${views.map((v) => `${v.item.id}:${v.item.on ? 1 : 0}:${v.editing ? 1 : 0}:${v.item.price}:${v.sold}`).join(",")}|${s.gradeLevel}`;
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
          <span class="nfit">味道 ${Math.round(v.score.total)} · ${v.score.grade} · ${sold}</span>
          <div class="dacts">
            <button type="button" class="dbtn${v.item.on ? " on" : ""}" data-act="toggledish" data-id="${v.index}" ${v.canToggle ? "" : "disabled"}>${v.item.on ? "在架" : "下架"}</button>
            <button type="button" class="dbtn" data-act="sellrecipe" data-id="${v.index}" ${v.canRemove ? "" : "disabled"} title="转手给别人，换人情">转手</button>
          </div>
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
      const fKey = `${s.noodle}|${s.recipe.toppings.join(",")}`;
      if (fKey !== lastFlavorKey) {
        lastFlavorKey = fKey;
        flavorsEl.innerHTML = flavorBoxHtml(s);
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
      key = `${s.staff.roster.map((m) => `${m.uid}:${m.fatigue}:${m.resting}`).join(",")}|${s.staff.candidates.map((c) => c.uid).join(",")}|${Math.floor(s.cash / 100)}|${s.staff.lastEvent}`;
      html = staffHtml(s);
    } else if (current === "shop") {
      key = `${Object.entries(s.venue.upgrades).join(",")}|${Math.floor(s.cash / 100)}|${s.venue.seats}|${s.venue.stoves}|${s.capacity}|${s.venue.expansion}|${s.gradeLevel}|${s.district}|${s.sides.active.join("+")}|${Object.keys(s.sides.sold).length}|${s.tally.comboHits}|${s.branches.length}|${branchPick}|${s.sides.mealDeal}|${s.sides.drinkTemp}|${(s.streets ?? []).length}|${(s.gear ?? []).length}|${s.style ?? ""}|${(s.styles ?? []).length}|${remoteLineCount()}`;
      html = shopHtml(s);
    } else if (current === "contest") {
      key = `${s.month}|${s.contest.lastMonth}|${s.contest.results.length}|${score.total}|${Math.floor(s.cash / 100)}`;
      html = contestHtml(s, score);
    } else if (current === "collection") {
      key = `${s.collection.toppings.length}|${s.collection.customers.length}|${s.collection.grades.length}|${s.collection.provinces.length}|${s.collection.likes.length}`;
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
