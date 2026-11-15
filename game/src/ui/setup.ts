/**
 * 建店界面（六阶的 S0）。
 *
 * 只出现一次：`state.phase === "setup"` 时盖住整个画面，选好铺位 + 起好店名后调用
 * `openForBusiness()`，自己把自己摘掉。
 *
 * 规矩（跟 HUD 一致）：暖纸底、3px 描边、粗硬阴影；所有按钮必须写
 * `pointer-events:auto`（`#hud` 整体是 none，见 hud.css）。
 */

import { monthTargetFor } from "../data/balance";
import { CAPITAL } from "../data/anchors";
import { nameCandidates, validShopName } from "../data/shop-names";
import { SITES, type SiteDef } from "../data/sites";
import type { GameState } from "../sim/state";

export interface SetupOptions {
  /** 玩家点了「开张营业」：由 main.ts 调 `openForBusiness`，成功则返回 true */
  onOpen: (siteId: string, shopName: string) => boolean;
}

export interface SetupScreen {
  render(state: GameState): void;
  destroy(): void;
}

function yuan(n: number): string {
  if (n === 0) return "不用";
  return `¥${n.toLocaleString("zh-CN")}`;
}

/** 该铺位第一年的月租（只用于展示，实际扣费走 ledger + rentFactorOf） */
function rentOf(site: SiteDef): number {
  const base = Math.round(monthTargetFor(1) * 0.22);
  return Math.round(base * site.rentFactor);
}

export function mountSetup(root: HTMLElement, opts: SetupOptions): SetupScreen {
  const seed = `${Date.now()}`;
  let batch = 0;
  let picked: string | null = null;
  let pickedName = nameCandidates(seed, 0)[0]!;

  const wrap = document.createElement("div");
  wrap.className = "setup";
  wrap.innerHTML = `
    <div class="setupbox" role="dialog" aria-modal="true" aria-label="开张">
      <div class="shead">
        <div class="sttl">开 张</div>
        <div class="ssub">先挑铺面，再起个街坊叫得顺口的名字。转让费一次性付，房租每月从账上扣。</div>
      </div>
      <div class="sitegrid" data-sites></div>
      <div class="namerow">
        <label class="nlabel" for="shopname">店名</label>
        <input id="shopname" class="ninput" data-name maxlength="12" spellcheck="false" />
        <button type="button" class="sbtn ghost" data-reroll>换一批</button>
      </div>
      <div class="namechips" data-chips></div>
      <div class="sfoot">
        <div class="scash" data-cash></div>
        <button type="button" class="sbtn main" data-open disabled>开张营业</button>
      </div>
      <div class="snote" data-note></div>
    </div>`;
  root.appendChild(wrap);

  const $ = <T extends HTMLElement>(sel: string): T => wrap.querySelector(sel) as T;
  const sitesEl = $<HTMLDivElement>("[data-sites]");
  const chipsEl = $<HTMLDivElement>("[data-chips]");
  const nameEl = $<HTMLInputElement>("[data-name]");
  const cashEl = $<HTMLDivElement>("[data-cash]");
  const noteEl = $<HTMLDivElement>("[data-note]");
  const openBtn = $<HTMLButtonElement>("[data-open]");

  let latest: GameState | null = null;

  const fmtLeft = (): string => {
    if (!latest) return "";
    const site = SITES.find((s) => s.id === picked);
    if (!site) return `现金 ${yuan(latest.cash)}`;
    const left = latest.cash - site.feeYuan;
    return `现金 ${yuan(latest.cash)} · 付完转让费还剩 ${yuan(Math.max(0, left))}`;
  };

  const sync = (): void => {
    if (!latest) return;
    for (const card of Array.from(sitesEl.querySelectorAll<HTMLElement>("[data-site]"))) {
      const id = card.dataset.site ?? "";
      const site = SITES.find((s) => s.id === id)!;
      const affordable = latest.cash >= site.feeYuan;
      card.classList.toggle("picked", picked === id);
      card.classList.toggle("broke", !affordable);
      card.setAttribute("aria-pressed", picked === id ? "true" : "false");
      const badge = card.querySelector<HTMLElement>("[data-badge]");
      if (badge) badge.textContent = affordable ? "" : `转让费还差 ${yuan(site.feeYuan - latest.cash)}`;
    }
    cashEl.textContent = fmtLeft();
    const nameOk = validShopName(nameEl.value);
    openBtn.disabled = !picked || !nameOk;
    noteEl.textContent = !picked
      ? "选一个铺面"
      : !nameOk
        ? "店名要 2–12 个字"
        : "";
  };

  const paintChips = (): void => {
    chipsEl.innerHTML = "";
    for (const name of nameCandidates(seed, batch)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = name;
      b.addEventListener("click", () => {
        nameEl.value = name;
        pickedName = name;
        sync();
      });
      chipsEl.appendChild(b);
    }
  };

  sitesEl.innerHTML = "";
  for (const site of SITES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "sitecard";
    card.dataset.site = site.id;
    card.innerHTML = `
      <div class="scardhd">
        <span class="sname">${site.name}</span>
        <span class="sfee">转让费 ${yuan(site.feeYuan)}</span>
      </div>
      <div class="spitch">${site.pitch}</div>
      <div class="sstats">
        <span>${site.seats} 座</span><span>${site.stoves} 口灶</span><span>月租约 ${yuan(rentOf(site))}</span>
      </div>
      <div class="sbadge" data-badge></div>`;
    card.addEventListener("click", () => {
      if (!latest || latest.cash < site.feeYuan) return;
      picked = site.id;
      sync();
    });
    sitesEl.appendChild(card);
  }

  paintChips();
  nameEl.value = pickedName;
  nameEl.addEventListener("input", sync);
  $<HTMLButtonElement>("[data-reroll]").addEventListener("click", () => {
    batch += 1;
    paintChips();
  });
  openBtn.addEventListener("click", () => {
    if (!picked) return;
    const ok = opts.onOpen(picked, nameEl.value.trim());
    if (ok) {
      noteEl.textContent = "";
      wrap.remove();
    }
  });

  return {
    render(state: GameState): void {
      latest = state;
      if (state.phase !== "setup") {
        wrap.remove();
        return;
      }
      wrap.hidden = false;
      sync();
    },
    destroy(): void {
      wrap.remove();
    },
  };
}

/** 建店界面用到的常量（给文档与测试引用） */
export const SETUP_REF = {
  styleSets: CAPITAL.styleSetYuan.length,
} as const;
