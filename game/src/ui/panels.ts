import { CONTEST_ENTRY_FEE, CONTEST_RIVALS } from "../data/contest";
import { CUSTOMER_ARCHETYPES, LIKE_DIMS_ORDER, LIKE_LABELS, likeValueLabel } from "../data/customers";
import { TOPPINGS } from "../data/ingredients";
import { MAX_STAFF, ROLE_LABEL } from "../data/staff";
import { UPGRADES } from "../data/shop";
import { collectionProgress, likeStats, LIKES_TOTAL } from "../sim/collection";
import { canEnter } from "../sim/contest";
import type { RecipeScore } from "../sim/score";
import { upgradeCost, upgradeLevel } from "../sim/shop";
import { dailyWage } from "../sim/staff";
import type { GameState } from "../sim/state";

export type PanelTab = "recipe" | "staff" | "shop" | "contest" | "collection" | "ledger";

const TAB_TITLE: Record<PanelTab, string> = {
  recipe: "配方研发 · 汤 / 粉 / 浇头",
  staff: "员工 · 招募与疲劳",
  shop: "店铺 · 扩建与摆件",
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
  { label: "粉宽", min: 0, max: 4, step: 1 },
  { label: "粉型（0切/1圆/2细）", min: 0, max: 2, step: 1 },
];

export interface PanelActions {
  setParam(group: "soup" | "noodle", index: number, value: number): void;
  setPrice(value: number): void;
  hire(uid: string): void;
  fire(uid: string): void;
  toggleRest(uid: string): void;
  buy(id: string): void;
  enterContest(): void;
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
              <div class="sechd">汤底 · 8 参</div>
              <div class="sliders" data-sliders="soup">${sliderRows("soup", SOUP_DEFS)}</div>
              <div class="sechd">米粉 · 7 参</div>
              <div class="sliders" data-sliders="noodle">${sliderRows("noodle", NOODLE_DEFS)}</div>
              <div class="sechd">售价 · 客单价</div>
              <label class="sl"><span class="slk">每碗</span><input type="range" min="6" max="25" step="1" data-price><b data-pricev>12</b></label>
            </div>
            <div class="rcol narrow">
              <div class="sechd">实时评分</div>
              <div class="scorebig"><b data-scorebig>--</b><span data-grade>B</span></div>
              <div class="subs" data-sub-list></div>
              <div class="econ2" data-econ2></div>
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

  let current: PanelTab = "recipe";
  let lastReportYear = -1;
  const keys: Partial<Record<PanelTab, string>> = {};

  const show = (tab: PanelTab): void => {
    current = tab;
    wrap.querySelectorAll<HTMLElement>("[data-pane]").forEach((p) => {
      p.hidden = p.dataset.pane !== tab;
    });
    wrap.querySelectorAll<HTMLElement>("[data-tab2]").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab2 === tab);
    });
    title.textContent = TAB_TITLE[tab];
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
      case "contest":
        actions.enterContest();
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

    const cands = s.staff.candidates
      .map(
        (m) => `<div class="lrow">
          <div class="lname">${m.name}<span class="tag2">${ROLE_LABEL[m.role]}</span><span class="tag2">技能 ${m.skill}</span></div>
          <div class="lmeta">日薪 ¥${m.wage} · 介绍费 ¥${m.wage * 2}</div>
          <div class="lbtns"><button type="button" data-act="hire" data-id="${m.uid}" ${s.staff.roster.length >= MAX_STAFF ? "disabled" : ""}>雇佣</button></div>
        </div>`,
      )
      .join("");

    return `<div class="sec">
        <div class="sechd">在职 ${s.staff.roster.length}/${MAX_STAFF} · 日薪 ${money(dailyWage(s))}</div>
        ${roster || `<div class="empty2">还没雇人。你自己一个人炒锅，出碗 6 分钟。</div>`}
        <div class="hint">${s.staff.lastEvent || "疲劳到 100 会辞职，记得安排休息。"}</div>
      </div>
      <div class="sec">
        <div class="sechd">今日候选 · 每天换一批</div>
        ${cands || `<div class="empty2">今天没人来问工。</div>`}
      </div>`;
  }

  function shopHtml(s: GameState): string {
    return UPGRADES.map((u) => {
      const lv = upgradeLevel(s, u.id);
      const cost = upgradeCost(s, u.id);
      const maxed = lv >= u.maxLevel;
      return `<div class="lrow">
        <div class="lname">${u.name}<span class="tag2">Lv ${lv}/${u.maxLevel}</span></div>
        <div class="lmeta">${u.desc}</div>
        <div class="lbtns"><button type="button" data-act="buy" data-id="${u.id}" ${maxed ? "disabled" : ""}>${maxed ? "已满级" : money(cost)}</button></div>
      </div>`;
    }).join("");
  }

  function contestHtml(s: GameState, score: RecipeScore): string {
    const gate = canEnter(s);
    const history = s.contest.results
      .slice(-6)
      .reverse()
      .map(
        (r) =>
          `<div class="lrow"><div class="lname">第 ${r.month + 1} 月 · 第 ${r.rank} 名</div>
           <div class="lmeta">口味分 ${r.score} · 冠军 ${r.champion} · 奖金 ${money(r.prize)}</div></div>`,
      )
      .join("");
    const top = [...CONTEST_RIVALS].sort((a, b) => b.strength - a.strength).slice(0, 5);
    return `<div class="sec">
        <div class="sechd">参赛 · 本月口味分 ${score.total}</div>
        <div class="lmeta" style="padding:0 2px 8px">34 个省级代表，按口味分排名。报名费 ${money(CONTEST_ENTRY_FEE)}，前三有奖金。</div>
        <button type="button" class="widebtn" data-act="contest" ${gate.ok ? "" : "disabled"}>报名参赛</button>
        <div class="hint">${gate.ok ? "本月还没报名" : gate.reason}</div>
      </div>
      <div class="sec">
        <div class="sechd">夺冠热门</div>
        ${top.map((r) => `<div class="lrow"><div class="lname">${r.province} · ${r.signature}</div><div class="lmeta">实力 ${r.strength}</div></div>`).join("")}
      </div>
      <div class="sec">
        <div class="sechd">参赛记录</div>
        ${history || `<div class="empty2">还没参加过。</div>`}
      </div>`;
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

    return `<div class="sec"><div class="sechd">浇头 ${p.toppings}/${TOPPINGS.length}</div><div class="cgrid">${toppingChips}</div></div>
      <div class="sec"><div class="sechd">顾客 ${p.customers}/${CUSTOMER_ARCHETYPES.length}</div><div class="cgrid">${customerChips}</div></div>
      <div class="sec"><div class="sechd">口味喜好 ${p.likes}/${LIKES_TOTAL}</div><div class="cgrid">${likeDimChips}</div><div class="cgrid">${likeChips}</div></div>
      <div class="sec"><div class="sechd">评级 ${p.grades}/5</div><div class="cgrid">${gradeChips}</div></div>
      <div class="sec"><div class="sechd">赢过的省 ${p.provinces}/${CONTEST_RIVALS.length}</div><div class="cgrid">${provinceChips}</div></div>`;
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
      <div class="sec"><div class="sechd">月度账本 · 最近 8 个月</div>${months || `<div class="empty2">还没走完一个月。</div>`}</div>
      <div class="sec"><div class="sechd">年度成绩</div>${years || `<div class="empty2">满 12 个月出一次年度结算。</div>`}</div>`;
  }

  const bodyOf = (tab: PanelTab): HTMLElement | null =>
    wrap.querySelector<HTMLElement>(`[data-body="${tab}"]`);

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
      scoreBig.textContent = String(score.total);
      gradeEl.textContent = score.grade;
      gradeEl.className = `grade g${score.grade}`;
      econ2.innerHTML = `魅力 <b>${score.charm}</b> · 性价比 <b>${score.valueScore}</b><br>成本 ¥${score.cost.toFixed(1)} · 毛利 ¥${score.margin.toFixed(1)}<br>门店吸引力 <b>${score.storeScore}</b>`;
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
      key = `${Object.entries(s.venue.upgrades).join(",")}|${Math.floor(s.cash / 100)}|${s.venue.seats}|${s.venue.stoves}|${s.capacity}`;
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
