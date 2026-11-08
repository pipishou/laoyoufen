import { ARCHETYPE_BY_ID, LIKE_DIMS_ORDER } from "../data/customers";
import { TOTAL_MONTHS, SAVE_VERSION, type GameState } from "./state";

/** 存档只序列化模拟状态，渲染对象（Phaser 的 Sprite/Scene）一律不进存档。 */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNumberArray(v: unknown, len: number): boolean {
  return Array.isArray(v) && v.length === len && v.every(isFiniteNumber);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isStaffMember(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    typeof v.uid === "string" &&
    typeof v.templateId === "string" &&
    typeof v.name === "string" &&
    (v.role === "cook" || v.role === "prep" || v.role === "server") &&
    isFiniteNumber(v.skill) &&
    isFiniteNumber(v.wage) &&
    isFiniteNumber(v.fatigue) &&
    typeof v.resting === "boolean"
  );
}

function isMonthRecord(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    isFiniteNumber(v.month) &&
    isFiniteNumber(v.revenue) &&
    isFiniteNumber(v.customers) &&
    isFiniteNumber(v.lost) &&
    isFiniteNumber(v.avgSat) &&
    isFiniteNumber(v.wages) &&
    isFiniteNumber(v.rent) &&
    isFiniteNumber(v.profit) &&
    isFiniteNumber(v.target) &&
    typeof v.grade === "string"
  );
}

function isYearRecord(v: unknown): v is Record<string, unknown> {
  if (!isRecord(v)) return false;
  return (
    isFiniteNumber(v.year) &&
    isFiniteNumber(v.revenue) &&
    isFiniteNumber(v.customers) &&
    isFiniteNumber(v.avgSat) &&
    isFiniteNumber(v.target) &&
    typeof v.rating === "string" &&
    isFiniteNumber(v.bonus) &&
    typeof v.final === "boolean"
  );
}

function isContestResult(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    isFiniteNumber(v.month) &&
    isFiniteNumber(v.score) &&
    isFiniteNumber(v.rank) &&
    typeof v.champion === "string" &&
    isFiniteNumber(v.prize)
  );
}

function isEventLogEntry(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return isFiniteNumber(v.day) && typeof v.title === "string" && typeof v.result === "string";
}

function isGameState(v: unknown): v is GameState {
  if (!isRecord(v)) return false;
  if (v.saveVersion !== SAVE_VERSION) return false;
  if (typeof v.playerId !== "string" || v.playerId.length === 0) return false;
  if (typeof v.connectCode !== "string" || v.connectCode.length !== 6) return false;
  if (!isRecord(v.rng) || !isFiniteNumber(v.rng.s)) return false;
  if (!isFiniteNumber(v.month) || v.month < 0 || v.month >= TOTAL_MONTHS) return false;
  if (!isFiniteNumber(v.day) || v.day < 1 || v.day > 30) return false;
  if (!isFiniteNumber(v.cash) || !isFiniteNumber(v.reputation)) return false;
  if (!isFiniteNumber(v.capacity) || !isFiniteNumber(v.todayCustomers)) return false;
  if (!isFiniteNumber(v.totalCustomers)) return false;
  if (!isFiniteNumber(v.monthRevenue) || !isFiniteNumber(v.monthTarget)) return false;
  if (!isFiniteNumber(v.monthServed) || !isFiniteNumber(v.monthLost)) return false;
  if (!isFiniteNumber(v.monthWages) || !isFiniteNumber(v.monthSatSum) || !isFiniteNumber(v.monthSatCount)) {
    return false;
  }
  if (!isFiniteNumber(v.price) || v.price < 0) return false;
  if (!isRecord(v.recipe)) return false;
  if (!isNumberArray(v.recipe.soup, 8) || !isNumberArray(v.recipe.noodle, 7)) return false;
  if (!isStringArray(v.recipe.toppings)) return false;

  if (!isRecord(v.flow)) return false;
  const flow = v.flow;
  if (!isFiniteNumber(flow.nextId) || !isFiniteNumber(flow.minuteOfDay)) return false;
  if (!isFiniteNumber(flow.serveCooldown)) return false;
  if (!isFiniteNumber(flow.servedToday) || !isFiniteNumber(flow.lostToday)) return false;
  if (!isFiniteNumber(flow.revenueToday) || !isFiniteNumber(flow.lastSatisfaction)) return false;
  if (!Array.isArray(flow.customers)) return false;
  for (const c of flow.customers) {
    if (!isRecord(c)) return false;
    if (!isFiniteNumber(c.id) || typeof c.archetypeId !== "string") return false;
    if (c.status !== "waiting" && c.status !== "eating") return false;
    if (!isFiniteNumber(c.elapsed) || !isFiniteNumber(c.waited)) return false;
    if (!isFiniteNumber(c.patience) || !isFiniteNumber(c.satisfaction)) return false;
    if (typeof c.regular !== "boolean") return false;
    // survey 是后加字段：旧档没有，读档时补 0
    if ("survey" in c && !isFiniteNumber(c.survey)) return false;
  }

  if (!isRecord(v.trend)) return false;
  const trend = v.trend;
  if (
    !isFiniteNumber(trend.sourBamboo) ||
    !isFiniteNumber(trend.douchi) ||
    !isFiniteNumber(trend.porkOffal) ||
    !isFiniteNumber(trend.broth)
  ) {
    return false;
  }

  if (!isRecord(v.staff)) return false;
  if (!Array.isArray(v.staff.roster) || !v.staff.roster.every(isStaffMember)) return false;
  if (!Array.isArray(v.staff.candidates) || !v.staff.candidates.every(isStaffMember)) return false;
  if (!isFiniteNumber(v.staff.candidateDay) || typeof v.staff.lastEvent !== "string") return false;

  if (!isRecord(v.venue)) return false;
  if (!isFiniteNumber(v.venue.seats) || !isFiniteNumber(v.venue.stoves)) return false;
  if (!isRecord(v.venue.upgrades)) return false;
  for (const level of Object.values(v.venue.upgrades)) {
    if (!isFiniteNumber(level) || level < 0) return false;
  }

  if (!isRecord(v.regulars)) return false;
  for (const rec of Object.values(v.regulars)) {
    if (!isRecord(rec)) return false;
    if (!isFiniteNumber(rec.visits) || !isFiniteNumber(rec.satSum)) return false;
    if (!isFiniteNumber(rec.lastDay) || typeof rec.favTopping !== "string") return false;
    // likeHits / giftCount 是后加字段：旧档没有，读档时由 regulars.recordOf 归一化成 0，不判废
    if ("likeHits" in rec && !isFiniteNumber(rec.likeHits)) return false;
    if ("giftCount" in rec && !isFiniteNumber(rec.giftCount)) return false;
  }

  if (!isRecord(v.collection)) return false;
  if (!isStringArray(v.collection.toppings) || !isStringArray(v.collection.customers)) return false;
  if (!isStringArray(v.collection.grades) || !isStringArray(v.collection.provinces)) return false;
  if (!isStringArray(v.collection.likes)) return false;

  if (!Array.isArray(v.months) || !v.months.every(isMonthRecord)) return false;
  if (!Array.isArray(v.years) || !v.years.every(isYearRecord)) return false;

  if (!isRecord(v.contest)) return false;
  if (!Array.isArray(v.contest.results) || !v.contest.results.every(isContestResult)) return false;
  if (!isFiniteNumber(v.contest.lastMonth)) return false;

  if (!isRecord(v.events)) return false;
  const events = v.events;
  if (events.pending !== null) {
    if (!isRecord(events.pending)) return false;
    if (typeof events.pending.id !== "string" || !isFiniteNumber(events.pending.absDay)) return false;
  }
  if (!isRecord(events.lastFired)) return false;
  for (const day of Object.values(events.lastFired)) {
    if (!isFiniteNumber(day)) return false;
  }
  if (!isStringArray(events.seen)) return false;
  if (!Array.isArray(events.log) || !events.log.every(isEventLogEntry)) return false;
  if (!isFiniteNumber(events.rolledDay) || !isFiniteNumber(events.count)) return false;

  if (v.pendingReport !== null && !isYearRecord(v.pendingReport)) return false;
  if (typeof v.finished !== "boolean") return false;

  return true;
}

/** 读档：任何不合法一律返回 null，由调用方决定新建还是提示 */
export function deserialize(raw: string): GameState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isGameState(parsed)) return null;
  // 旧档补字段：likeHits / giftCount 是本版新增的常客累计计数，缺省补 0，避免老档判废
  for (const rec of Object.values(parsed.regulars)) {
    if (typeof rec.likeHits !== "number" || !Number.isFinite(rec.likeHits)) rec.likeHits = 0;
    if (typeof rec.giftCount !== "number" || !Number.isFinite(rec.giftCount)) rec.giftCount = 0;
  }
  for (const c of parsed.flow.customers) {
    if (typeof c.survey !== "number" || !Number.isFinite(c.survey)) c.survey = 0;
  }
  if (parsed.flow.lastGift === undefined) parsed.flow.lastGift = null;
  // 喜好迁到开罗三维（thick/shape/soup）：旧的 sour/spicy/rich/light 键直接丢弃并去重
  const dims = new Set<string>(LIKE_DIMS_ORDER);
  parsed.collection.likes = [...new Set(parsed.collection.likes)].filter((id) => {
    const i = id.lastIndexOf(":");
    if (i <= 0) return false;
    return ARCHETYPE_BY_ID.has(id.slice(0, i)) && dims.has(id.slice(i + 1));
  });
  return parsed;
}

export const SAVE_STORAGE_KEY = "laoyou.save.v4";
