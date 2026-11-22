import type { GameState } from "./state";
import { NEWS, NEWS_KEEP, type NewsDef, type NewsKind } from "../data/news";
import { streetById } from "../data/streets";
import { gradeOf } from "./grade";
import { RIVAL_BY_ID } from "../data/rivals";
import { hashString } from "./rng";

/**
 * 街坊报（A11）：每天打烊时写一条，只写「这条街今天真发生过的事」。
 *
 * 怎么挑：按当天的状态决定「今天值得写什么」，再在同一类里用哈希选一句。
 * 同一局同一档读回来是同一条 —— 不消耗 state.rng，不影响确定性测试。
 *
 * 优先级：同行（关门/服气）> 赛事 > 段位 > 袋装 > 街面 > 开张 > 日常。
 * 越靠前越像「今天真的变了」的事；日常兜底保证天天有报。
 */

export interface NewsItem {
  month: number;
  day: number;
  /** 报上那一行（已替换店名、街名、段位、同行名） */
  text: string;
  kind: NewsKind;
  kairo: string;
}

function hash(s: string): number {
  return hashString(s);
}

function ofKind(kind: NewsKind): NewsDef[] {
  const pool = NEWS.filter((n) => n.kind === kind);
  return pool.length > 0 ? pool : NEWS.filter((n) => n.kind === "plain");
}

/** 今天该写哪一类 —— 条件全部来自已有状态，不新增任何计数 */
export function newsKindOf(state: GameState): NewsKind {
  const rivals = state.rivals ?? [];
  if (rivals.some((r) => r.closed)) return "rival";
  if (rivals.some((r) => r.pacified) && state.day % 2 === 0) return "rival";
  if (state.contest && state.contest.lastMonth === state.month) return "contest";
  if (state.gradeLevel >= 2) return "grade";
  if (state.pack) return "pack";
  if ((state.streets ?? []).length >= 1) return "street";
  if (state.tally.bowls < 40) return "open";
  return "plain";
}

function fill(line: string, state: GameState): string {
  const lastStreet = (state.streets ?? [])
    .map((id) => streetById(id)?.name ?? "")
    .filter((x) => x)
    .slice(-1)[0];
  const rival = (state.rivals ?? []).find((r) => !r.closed) ?? (state.rivals ?? [])[0];
  const grade = gradeOf(state.gradeLevel);
  return line
    .replaceAll("{街}", lastStreet ?? "这条巷")
    .replaceAll("{店}", state.shopName && state.shopName.length > 0 ? state.shopName : "这间粉店")
    .replaceAll("{段}", grade?.title ?? "摆摊仔")
    .replaceAll("{同行}", (rival ? RIVAL_BY_ID.get(rival.id)?.name : undefined) ?? "隔壁那家");
}

/** 生成今天这一条（纯函数，不改状态） */
export function todayNews(state: GameState): NewsItem {
  const kind = newsKindOf(state);
  const pool = ofKind(kind);
  const def = pool[hash(`${state.playerId}:${state.month}:${state.day}:${kind}`) % pool.length]!;
  return {
    month: state.month,
    day: state.day,
    text: fill(def.line, state),
    kind: def.kind,
    kairo: def.kairo,
  };
}

/** 打烊时调用：写进 state.news，只留最近几条 */
export function pushNews(state: GameState): NewsItem {
  const item = todayNews(state);
  const list = [...(state.news ?? []), item];
  state.news = list.slice(-NEWS_KEEP);
  return item;
}

/** 倒序：最新的在最上面 */
/**
 * 练满一支时在报上留一行（批次十一：外部回声）。
 *
 * 只写「练成了」这一件事，不报数字、不给奖励 —— 报纸是读的。
 */
export function pushSkillNews(state: GameState, branchName: string): NewsItem {
  const pool = NEWS.filter((n) => n.kind === "skill");
  const tpl = pool[Math.abs(hash(`${state.playerId}:skill:${branchName}:${state.month}:${state.day}`)) % pool.length]!;
  const street = state.streets?.[0] ? (streetById(state.streets[0])?.name ?? state.district) : state.district;
  const item: NewsItem = {
    month: state.month,
    day: state.day,
    text: tpl.line.replace("{店}", state.shopName).replace("{街}", street),
    kind: "skill",
    kairo: tpl.kairo,
  };
  state.news = [...(state.news ?? []), item].slice(-NEWS_KEEP);
  return item;
}

export function newsList(state: GameState): NewsItem[] {
  return [...(state.news ?? [])].reverse();
}

export function latestNews(state: GameState): NewsItem | null {
  const list = state.news ?? [];
  return list.length === 0 ? null : list[list.length - 1]!;
}

export function newsSummary(state: GameState): string {
  const n = (state.news ?? []).length;
  return n === 0 ? "还没出过报" : `最近 ${n} 天`;
}

/** 报上的日期写法：一月三日 */
const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
function cnNum(n: number): string {
  if (n < 10) return CN_NUM[n]!;
  if (n === 10) return "十";
  if (n < 20) return `十${CN_NUM[n - 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${CN_NUM[tens]}十${ones === 0 ? "" : CN_NUM[ones]}`;
}

export function newsDate(item: NewsItem): string {
  return `${cnNum(item.month + 1)}月${cnNum(item.day)}日`;
}
