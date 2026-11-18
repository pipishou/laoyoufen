/**
 * 落场（M4）：60 秒小局的状态机。
 *
 * 一局的生命周期：`startArena` → 反复 `arenaStrike` / `arenaAdvance(dt)` → `arenaAdvance` 返回 finished
 * → 内部的 `settle` 结算并清空 `state.arena`。
 *
 * 设计上的三条纪律：
 *   ① **进行中的局不存档**（刷新就当没打成），只把「今天打过几次」落盘 —— 免得存读盘能把冷却与分数带走；
 *   ② 分数 = 这碗粉的底子 × 手速，所以「把粉做好」和「按得准」都得有，不是纯手速游戏；
 *   ③ 输赢都给人情（输 2、赢 6），但只有赢才给现金与口碑 —— 上擂台是练手，不是稳赚。
 */
import {
  ARENAS,
  ARENA_REWARD,
  ARENA_SECONDS,
  ARENA_RETRY_FAVOR,
  ARENA_RETRY_MAX,
  ARENA_PER_DAY,
  RIVAL_BURST_AT,
  RIVAL_BURST_GAIN,
  RIVAL_RATE_PER_SEC,
  arenaById,
  axesOf,
  baseValueOf,
  commandById,
  commandScore,
  type ArenaDef,
  type CommandId,
} from "../data/arena";
import { currentDish, scoreDish } from "./menu";
import { rivalsOfDistrict } from "../data/rivals";
import { noteWin } from "./rivals";
import type { GameState } from "./state";

export interface ArenaResult {
  win: boolean;
  mine: number;
  rival: number;
  repGain: number;
  favorGain: number;
  cashGain: number;
  line: string;
}

export interface ArenaRun {
  arena: string;
  msLeft: number;
  mine: number;
  rival: number;
  /** 每条命令还剩多少冷却（毫秒） */
  cds: Record<string, number>;
  hits: number;
  burstsDone: number;
  log: string[];
  result: ArenaResult | null;
}

export interface ArenaOpen {
  ok: boolean;
  reason?: string;
}

export interface ArenaStart {
  ok: boolean;
  reason?: string;
  run?: ArenaRun;
}

export interface ArenaStrike {
  ok: boolean;
  reason?: string;
  gained?: number;
}

export interface ArenaStep {
  finished: boolean;
  result?: ArenaResult;
}

/** 今天的编号（与 state.day/month 绑定，month 是 0 基） */
function todayOf(state: GameState): number {
  return state.month * 100 + state.day;
}

/** 今天已经落了几场 */
export function arenaRunsToday(state: GameState): number {
  return (state.arenaDay ?? -1) === todayOf(state) ? (state.arenaRuns ?? 0) : 0;
}

/** 这场落场端上去的那碗 —— 就是菜单上当前在编辑的那一款 */
function currentAxes(state: GameState) {
  const item = currentDish(state);
  const sc = scoreDish(item);
  return axesOf({
    total: sc.total,
    soup: item.recipe.soup,
    portion: item.portion,
    reputation: state.reputation,
  });
}

/** 本区最强的同行（没人就造一个「路过的高手」） */
/** 本区最强那家（未关门）；落场赢了要落在它头上，所以带 id */
export function arenaRivalEntryOf(
  state: GameState,
): { id: string; name: string; taste: number } | null {
  let best: { id: string; name: string; taste: number } | null = null;
  for (const def of rivalsOfDistrict(state.district)) {
    const rs = (state.rivals ?? []).find((r) => r.id === def.id);
    if (!rs || rs.closed) continue;
    if (!best || def.signature.taste > best.taste) {
      best = { id: def.id, name: def.name, taste: def.signature.taste };
    }
  }
  return best;
}

export function arenaRivalOf(state: GameState): { name: string; taste: number } {
  const best = arenaRivalEntryOf(state);
  return best ? { name: best.name, taste: best.taste } : { name: "路口新开的摊", taste: 58 };
}

/** 对手在这 60 秒里能到多少分 */
export function rivalTargetOf(state: GameState, def: ArenaDef): number {
  const r = arenaRivalOf(state);
  const craft = 1 + Math.max(-0.3, (r.taste - 60) / 100);
  const place = 1 + def.rivalEdge / 40;
  const flat = ARENA_SECONDS * RIVAL_RATE_PER_SEC * craft * place;
  const bursts = RIVAL_BURST_AT.length * RIVAL_BURST_GAIN * place;
  return Math.round(flat + bursts);
}

/** 能不能上场 */
export function arenaOpen(state: GameState, id: string): ArenaOpen {
  const def = arenaById(id);
  if (!def) return { ok: false, reason: "没有这个场地" };
  if (state.arena) return { ok: false, reason: "你还在场上" };
  if ((state.gradeLevel ?? 0) < def.minGrade) {
    return { ok: false, reason: `要评到第 ${def.minGrade} 段才准进${def.name}` };
  }
  const runs = arenaRunsToday(state);
  const quota = ARENA_PER_DAY + ARENA_RETRY_MAX;
  if (runs >= quota) return { ok: false, reason: "今天已经落过两回了，明天再来" };
  if (runs >= ARENA_PER_DAY) {
    if ((state.favor ?? 0) < ARENA_RETRY_FAVOR) {
      return { ok: false, reason: `今天已经落过一场了，想再上要 ${ARENA_RETRY_FAVOR} 点人情` };
    }
  }
  return { ok: true };
}

export function startArena(state: GameState, id: string): ArenaStart {
  const gate = arenaOpen(state, id);
  if (!gate.ok) return { ok: false as const, reason: gate.reason };
  const def = arenaById(id)!;
  const runs = arenaRunsToday(state);
  if (runs >= ARENA_PER_DAY) {
    state.favor = Math.max(0, (state.favor ?? 0) - ARENA_RETRY_FAVOR);
  }
  if ((state.arenaDay ?? -1) !== todayOf(state)) {
    state.arenaDay = todayOf(state);
    state.arenaRuns = 0;
  }
  state.arenaRuns = (state.arenaRuns ?? 0) + 1;

  const run: ArenaRun = {
    arena: def.id,
    msLeft: ARENA_SECONDS * 1000,
    mine: 0,
    rival: 0,
    cds: {},
    hits: 0,
    burstsDone: 0,
    log: [`${def.name}开锣 —— 对面是${arenaRivalOf(state).name}`],
    result: null,
  };
  state.arena = run;
  return { ok: true as const, run };
}

/** 按一条命令 */
export function arenaStrike(state: GameState, cmdId: string): ArenaStrike {
  const run = state.arena;
  if (!run || run.result) return { ok: false, reason: "现在不在场上" };
  const def = arenaById(run.arena);
  const cmd = commandById(cmdId);
  if (!def || !cmd) return { ok: false, reason: "没有这个动作" };
  const cd = run.cds[cmd.id] ?? 0;
  if (cd > 0) return { ok: false, reason: `${cmd.name}还没缓过来` };

  const ax = currentAxes(state);
  const serve = state.staff.roster.filter((m) => m.role === "server").reduce((a, m) => a + m.skill, 0);
  const gained = commandScore(def, cmd, ax, serve);
  run.mine += gained;
  run.hits += 1;
  run.cds[cmd.id] = cmd.cdMs;
  if (run.log.length < 14) run.log.push(`${cmd.name} +${gained}`);
  return { ok: true, gained };
}

/** 推进一帧（真实毫秒）。返回这一帧是否结束了一局 */
export function arenaAdvance(state: GameState, dtMs: number): ArenaStep {
  const run = state.arena;
  if (!run) return { finished: false };
  if (run.result) return { finished: true, result: run.result };
  const def = arenaById(run.arena);
  if (!def) {
    state.arena = null;
    return { finished: true };
  }

  const step = Math.max(0, Math.min(dtMs, 500));
  for (const cmdId of Object.keys(run.cds)) {
    run.cds[cmdId] = Math.max(0, (run.cds[cmdId] ?? 0) - step);
  }
  const elapsed = ARENA_SECONDS * 1000 - run.msLeft;
  run.rival += (RIVAL_RATE_PER_SEC * step) / 1000;
  for (let i = run.burstsDone; i < RIVAL_BURST_AT.length; i += 1) {
    if (elapsed + step >= RIVAL_BURST_AT[i]!) {
      run.rival += RIVAL_BURST_GAIN * (1 + def.rivalEdge / 40);
      run.burstsDone = i + 1;
      if (run.log.length < 14) run.log.push("对面突然发力，人全围过去了！");
    }
  }
  run.msLeft = Math.max(0, run.msLeft - step);

  if (run.msLeft > 0) return { finished: false };
  const result = settle(state, run, def);
  return { finished: true, result };
}

function settle(state: GameState, run: ArenaRun, def: ArenaDef): ArenaResult {
  const mine = Math.round(run.mine);
  const rival = Math.round(run.rival);
  const win = mine >= rival * (1 + ARENA_REWARD.winMargin);
  const adj = win ? "赢" : "没赢";
  let line = win
    ? `${def.name}${adj}了 —— ${mine} 比 ${rival}，评审把分打给了这碗粉`
    : `${def.name}${adj} —— ${mine} 比 ${rival}，回去把粉再调调`;
  const repGain = win ? ARENA_REWARD.repWin : ARENA_REWARD.repLose;
  const favorGain = win ? ARENA_REWARD.favorWin : ARENA_REWARD.favorLose;
  const cashGain = win ? def.prizeYuan : 0;

  state.reputation = Math.min(5, (state.reputation ?? 0) + repGain);
  state.favor = Math.min(999, (state.favor ?? 0) + favorGain);
  state.favorTotal = Math.max(state.favorTotal ?? 0, state.favor ?? 0);
  if (cashGain > 0) {
    state.cash += cashGain;
    state.monthRevenue += cashGain;
    state.flow.revenueToday += cashGain;
  }
  state.flow.lastFavor = win
    ? `落场赢了，街坊给了 ${favorGain} 点人情`
    : `落场没赢，街坊还是给了 ${favorGain} 点人情`;
  state.tally.arenaRuns = (state.tally.arenaRuns ?? 0) + 1;
  if (win) state.tally.arenaWins = (state.tally.arenaWins ?? 0) + 1;

  // 赢了当场把对面按下去：记一次胜 + 名气压一格。
  // 赢满三次它就服气（份额砍半），名气掉到零则月底关门 ——
  // 落场与「同条街」共用一套规则，不做第二套计数器（P60）。
  if (win) {
    const target = arenaRivalEntryOf(state);
    const rs = target ? (state.rivals ?? []).find((r) => r.id === target.id) : null;
    if (target && rs) {
      const justPacified = noteWin(state, target.id);
      rs.fame = Math.max(0, rs.fame - 1);
      rs.lastLine = justPacified
        ? `${target.name}服气了：「做不过你，客人都往你那边跑。」`
        : `${target.name}在落场上输了一场，脸色不太好看。`;
      if (justPacified) line += `；${target.name}服气了，往后少抢你一半的客`;
    }
  }

  const result: ArenaResult = { win, mine, rival, repGain, favorGain, cashGain, line };
  run.result = result;
  // 结算完就把局清掉：进行中的局不落盘，UI 拿到 result 就够了
  state.arena = null;
  return result;
}

/** 三块地的情况（面板用） */
export interface ArenaView {
  def: ArenaDef;
  open: ArenaOpen;
  /** 这碗粉在这个场地值多少（把场地权重算进去的直观分） */
  value: number;
  rival: { name: string; taste: number };
  rivalTarget: number;
  runsToday: number;
}

export function arenaViews(state: GameState): ArenaView[] {
  const ax = currentAxes(state);
  return ARENAS.map((def) => ({
    def,
    open: arenaOpen(state, def.id),
    value: Math.round(baseValueOf(def, ax)),
    rival: arenaRivalOf(state),
    rivalTarget: rivalTargetOf(state, def),
    runsToday: arenaRunsToday(state),
  }));
}

export function arenaSummary(state: GameState): string {
  const runs = arenaRunsToday(state);
  const win = state.tally.arenaWins ?? 0;
  const all = state.tally.arenaRuns ?? 0;
  if (all === 0) return runs === 0 ? "今天还没落场" : `今天已经落了 ${runs} 场`;
  return `落场 ${all} 场 · 赢 ${win} 场${runs > 0 ? ` · 今天落了 ${runs} 场` : ""}`;
}

export type { ArenaDef, CommandId };
