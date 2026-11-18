/**
 * 落场（M4）的界面：一块 60 秒的像素擂台。
 *
 * 为什么用 DOM 而不是 Phaser 场景：擂台只要两条分数条、两个原地踏步的小人和三颗按钮，
 * 用 DOM + CSS 画更像「街边摆开的一块地方」，而且不用把 Phaser 场景栈和现有的
 * 店铺/面板耦合在一起（现有 HUD 也是 DOM）。
 *
 * 组件只做三件事：把 state.arena 画出来、把点击/键盘转成 arenaStrike、每帧调 arenaAdvance。
 */
import {
  ARENA_SECONDS,
  COMMANDS,
  arenaById,
  type CommandDef,
} from "../data/arena";
import { arenaAdvance, arenaRivalOf, arenaStrike, type ArenaResult } from "../sim/arena";
import type { GameState } from "../sim/state";

export interface ArenaUiOptions {
  getState: () => GameState;
  /** 一局结束（结算卡已经画好）后回调，用来刷新后面的面板 */
  onDone?: (result: ArenaResult) => void;
  /** 结算卡上点「再来一场」：由外面决定还能不能打（要不要扣人情） */
  onReplay?: () => void;
}

export interface ArenaUi {
  render: () => void;
  destroy: () => void;
  /** 浮层在不在（结算后 state.arena 已经是 null，键盘只能看这个） */
  isOpen: () => boolean;
  /** 键盘用：返回 true 表示这一下被擂台吃掉了 */
  strike: (cmdId: string) => boolean;
  flee: () => void;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function mountArena(root: HTMLElement, opts: ArenaUiOptions): ArenaUi {
  const wrap = document.createElement("div");
  wrap.className = "arena";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="abox" role="dialog" aria-label="落场">
      <div class="ahead">
        <b data-atitle>落场</b>
        <span class="atime" data-atime>60.0s</span>
      </div>
      <div class="abars">
        <div class="arow me">
          <span class="aname">我</span>
          <div class="atrack"><i data-amine style="width:0%"></i></div>
          <b data-aminenum>0</b>
        </div>
        <div class="arow rival">
          <span class="aname" data-arivalname>对面</span>
          <div class="atrack"><i data-arival style="width:0%"></i></div>
          <b data-arivalnum>0</b>
        </div>
      </div>
      <div class="astage">
        <i class="alane l1"></i><i class="alane l2"></i><i class="alane l3"></i>
        <span class="arunner me" data-arunnerme>我</span>
        <span class="arunner rival" data-arunnerrival>对</span>
      </div>
      <div class="alog" data-alog></div>
      <div class="acmds" data-acmds></div>
      <div class="afoot">
        <span class="ahint">按 1 / 2 / 3 出招，Esc 收摊</span>
        <button type="button" class="aflee" data-act="aflee">收摊走人</button>
      </div>
      <div class="aresult" data-aresult hidden></div>
    </div>`;
  root.append(wrap);

  const q = <T extends Element>(sel: string): T => wrap.querySelector(sel) as T;
  const el = {
    box: q<HTMLDivElement>(".abox"),
    title: q<HTMLElement>("[data-atitle]"),
    time: q<HTMLElement>("[data-atime]"),
    mine: q<HTMLElement>("[data-amine]"),
    mineNum: q<HTMLElement>("[data-aminenum]"),
    rival: q<HTMLElement>("[data-arival]"),
    rivalNum: q<HTMLElement>("[data-arivalnum]"),
    rivalName: q<HTMLElement>("[data-arivalname]"),
    runnerMe: q<HTMLElement>("[data-arunnerme]"),
    runnerRival: q<HTMLElement>("[data-arunnerrival]"),
    log: q<HTMLElement>("[data-alog]"),
    cmds: q<HTMLElement>("[data-acmds]"),
    result: q<HTMLElement>("[data-aresult]"),
  };

  let raf = 0;
  let lastTs = 0;
  let shownResult: ArenaResult | null = null;
  let cmdsBuilt = false;

  const cmdButton = (c: CommandDef): string =>
    `<button type="button" class="acmd" data-act="astrike" data-id="${c.id}">
      <span class="akey">${c.key}</span>
      <span class="alabel">${esc(c.name)}</span>
      <span class="acool" data-acool="${c.id}"></span>
    </button>`;

  function buildCmds(): void {
    if (cmdsBuilt) return;
    el.cmds.innerHTML = COMMANDS.map(cmdButton).join("");
    cmdsBuilt = true;
  }

  function drawResult(r: ArenaResult): void {
  // 结算之后这一局就结束了，三招不该还看着能按
  wrap.querySelectorAll<HTMLButtonElement>(".acmd").forEach((b) => {
    b.disabled = true;
  });
    shownResult = r;
    el.result.hidden = false;
    el.result.className = `aresult ${r.win ? "win" : "lose"}`;
    el.result.innerHTML = `
      <div class="artitle">${r.win ? "赢了" : "没赢"}</div>
      <div class="arline">${esc(r.line)}</div>
      <div class="argrid">
        <span>我 <b>${r.mine}</b></span>
        <span>对面 <b>${r.rival}</b></span>
        <span>口碑 <b>+${r.repGain.toFixed(2)}</b></span>
        <span>人情 <b>+${r.favorGain}</b></span>
        <span>现金 <b>+¥${r.cashGain}</b></span>
      </div>
      <div class="arfoot">
        <button type="button" class="abtn main" data-act="aagain">再来一场</button>
        <button type="button" class="abtn" data-act="aflee">收摊</button>
      </div>`;
    opts.onDone?.(r);
  }

  function render(): void {
    const s = opts.getState();
    const run = s.arena;
    if (!run) {
      // 局已经结束（结算卡还在，等玩家点按钮）或者还没开始
      if (!shownResult) {
        wrap.hidden = true;
        stopLoop();
      }
      return;
    }
    wrap.hidden = false;
    buildCmds();
    el.result.hidden = true;
    shownResult = null;

    const def = arenaById(run.arena);
    const rival = arenaRivalOf(s);
    el.title.textContent = def ? def.name : "落场";
    el.rivalName.textContent = rival.name;
    el.time.textContent = `${(run.msLeft / 1000).toFixed(1)}s`;

    const top = Math.max(120, run.mine, run.rival) * 1.12;
    el.mine.style.width = `${Math.min(100, (run.mine / top) * 100)}%`;
    el.rival.style.width = `${Math.min(100, (run.rival / top) * 100)}%`;
    el.mineNum.textContent = String(Math.round(run.mine));
    el.rivalNum.textContent = String(Math.round(run.rival));

    const span = Math.max(1, el.box.clientWidth - 120);
    el.runnerMe.style.transform = `translateX(${Math.min(1, run.mine / top) * span}px)`;
    el.runnerRival.style.transform = `translateX(${Math.min(1, run.rival / top) * span}px)`;

    el.log.innerHTML = run.log.slice(-4).map((line) => `<div>${esc(line)}</div>`).join("");
    for (const c of COMMANDS) {
      const cd = run.cds[c.id] ?? 0;
      const btn = el.cmds.querySelector<HTMLButtonElement>(`[data-id="${c.id}"]`);
      const cool = el.cmds.querySelector<HTMLElement>(`[data-acool="${c.id}"]`);
      if (btn) btn.disabled = cd > 0;
      if (cool) {
        cool.textContent = cd > 0 ? `${(cd / 1000).toFixed(1)}` : "";
        cool.style.opacity = cd > 0 ? "1" : "0";
      }
    }
    startLoop();
  }

  function tick(ts: number): void {
    const s = opts.getState();
    if (!s.arena) {
      stopLoop();
      return;
    }
    if (lastTs === 0) lastTs = ts;
    const dt = Math.min(200, ts - lastTs);
    lastTs = ts;
    const step = arenaAdvance(s, dt);
    if (step.finished) {
      stopLoop();
      if (step.result) {
        drawResult(step.result);
        wrap.hidden = false;
      } else {
        wrap.hidden = true;
      }
      return;
    }
    render();
    raf = requestAnimationFrame(tick);
  }

  function startLoop(): void {
    if (raf) return;
    lastTs = 0;
    raf = requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function strike(cmdId: string): boolean {
    const s = opts.getState();
    if (!s.arena || shownResult) return false;
    const r = arenaStrike(s, cmdId);
    if (r.ok) render();
    return true;
  }

  function flee(): void {
    const s = opts.getState();
    s.arena = null;
    shownResult = null;
    wrap.hidden = true;
    stopLoop();
  }

  wrap.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement | null;
    const btn = t?.closest<HTMLElement>("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id ?? "";
    if (act === "astrike") strike(id);
    else if (act === "aflee") flee();
    else if (act === "aagain") {
      shownResult = null;
      el.result.hidden = true;
      // 「再来一场」交给外面：能不能再打（有的要花人情）由 sim 层判，擂台不管规则
      opts.onReplay?.();
    }
  });

  return {
    render,
    destroy: () => {
      stopLoop();
      wrap.remove();
    },
    strike,
    flee,
    // 结算之后 state.arena 已经是 null，键盘只能看浮层本身在不在
    isOpen: () => !wrap.hidden,
  };
}

export const ARENA_SECONDS_LABEL = ARENA_SECONDS;
