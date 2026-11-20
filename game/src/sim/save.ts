import { ARCHETYPE_BY_ID, LIKE_DIMS_ORDER } from "../data/customers";
import { START_SIDES } from "../data/sides";
import { NOODLE_BY_ID, START_NOODLE } from "../data/noodles";
import { DEFAULT_PORTION, MAIN_BY_ID, START_MAIN, type MainId } from "../data/mains";
import { TOTAL_MONTHS, SAVE_VERSION, type GameState } from "./state";
import { initRivals } from "./rivals";
import { STREET_BY_ID } from "../data/streets";
import { GEAR_BY_ID } from "../data/gear";
import { TROPHY_BY_ID } from "../data/trophies";
import { TOURNEY_BY_ID } from "../data/tourneys";
import { FLAVOR_BY_ID } from "../data/flavor";
import { STYLE_BY_ID } from "../data/style";
import { BOWL_BY_ID, DEFAULT_BOWL_ID } from "../data/bowl";

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
  // 老档（v10 以前）的比赛记录只有 month/score/rank/champion/prize，没有 round/type/tier，
  // 所以这几项不参与判废，由 deserialize 的迁移补默认值。
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
  // v5..v9 老档允许读入（缺的字段在 deserialize 里补默认值），不判废
  // ——玩家练了三年的店不该因为一次改版清零。
  if (
    v.saveVersion !== SAVE_VERSION &&
    v.saveVersion !== 27 &&
    v.saveVersion !== 26 &&
    v.saveVersion !== 25 &&
    v.saveVersion !== 24 &&
    v.saveVersion !== 22 &&
    v.saveVersion !== 23 &&
    v.saveVersion !== 18 &&
    v.saveVersion !== 19 &&
    v.saveVersion !== 21 &&
  v.saveVersion !== 20 &&
    v.saveVersion !== 17 &&
    v.saveVersion !== 16 &&
    v.saveVersion !== 15 &&
    v.saveVersion !== 14 &&
    v.saveVersion !== 13 &&
    v.saveVersion !== 12 &&
    v.saveVersion !== 11 &&
    v.saveVersion !== 10 &&
    v.saveVersion !== 9 &&
    v.saveVersion !== 8 &&
    v.saveVersion !== 7 &&
    v.saveVersion !== 6 &&
    v.saveVersion !== 5
  )
    return false;
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
  // v5 → v6（K1 目标换骨）：补累计成就计数与段位，老档继续可玩
  if (!parsed.tally || typeof parsed.tally !== "object") {
    parsed.tally = {
      bowls: 0,
      bestDayRevenue: 0,
      maxQueue: 0,
      districts: ["xingning"],
      sideRevenue: 0,
      comboHits: 0,
      branchBowls: 0,
      arenaRuns: 0,
      arenaWins: 0,
      recipesSold: 0,
    };
  } else {
    if (typeof parsed.tally.bowls !== "number") parsed.tally.bowls = 0;
    if (typeof parsed.tally.bestDayRevenue !== "number") parsed.tally.bestDayRevenue = 0;
    if (typeof parsed.tally.maxQueue !== "number") parsed.tally.maxQueue = 0;
    if (!Array.isArray(parsed.tally.districts) || parsed.tally.districts.length === 0) {
      parsed.tally.districts = ["xingning"];
    }
  }
  if (typeof parsed.gradeLevel !== "number" || !Number.isFinite(parsed.gradeLevel)) {
    parsed.gradeLevel = 0;
  }
  // v6 → v7（一天三态）：老档没有 phase/dayReport/days。
  // 老档读进来时可能正卡在一天中间，这里统一回到「今日准备」，让玩家重新开门，
  // 而不是把半天的数字塞进一张还没生成的日结单。
  if (
    parsed.phase !== "prep" &&
    parsed.phase !== "open" &&
    parsed.phase !== "closing" &&
    parsed.phase !== "setup"
  ) {
    parsed.phase = "prep";
    parsed.flow.minuteOfDay = 0;
    parsed.flow.customers = [];
    parsed.flow.servedToday = 0;
    parsed.flow.lostToday = 0;
    parsed.flow.revenueToday = 0;
    parsed.flow.serveCooldown = 0;
  }
  if (!Array.isArray(parsed.days)) parsed.days = [];
  if (parsed.dayReport === undefined) parsed.dayReport = null;
  if (typeof parsed.flow.satSumToday !== "number") parsed.flow.satSumToday = 0;
  if (typeof parsed.flow.satCountToday !== "number") parsed.flow.satCountToday = 0;
  // v7 → v8（建店 S0）：老档没有 site / shopName。
  // 老档已经是「开着店」的档，所以直接补成默认铺位的名字，不把玩家踢回 setup
  // ——只有全新存档才从 setup 开始（见 createInitialState）。
  if (typeof parsed.site !== "string") parsed.site = "";
  if (parsed.site === "" && parsed.phase !== "setup") {
    parsed.site = "alley";
  }
  if (typeof parsed.shopName !== "string" || parsed.shopName.trim() === "") {
    parsed.shopName = parsed.phase === "setup" ? "" : "老友粉店";
  }
  // v8 → v9（设备 S4）：老档没有 equipment，补成空对象（全 0 档＝原样不变）。
  if (typeof parsed.equipment !== "object" || parsed.equipment === null || Array.isArray(parsed.equipment)) {
    parsed.equipment = {};
  }
  // v9 → v10（扩建 S5）：老档没有 venue.expansion。旧档可能买过 seats/stove/hall 三件旧升级，
  // 那些加出来的座位与灶位已经落在 venue.seats/stoves 里，这里不再回退，只把档位记 0。
  if (!isRecord(parsed.venue)) parsed.venue = { seats: 4, stoves: 1, upgrades: {}, expansion: 0 };
  if (typeof parsed.venue.expansion !== "number" || !isFinite(parsed.venue.expansion)) {
    parsed.venue.expansion = 0;
  }
  // v10 → v11（中期节奏：竞赛日历 / 区县能量）：
  // ① contest 多出 lastRound 与 wins —— 老档的比赛记录没有 round/type/tier，补默认值；
  // ② 老档没有 district/districtSince，默认就是起始区、从第 0 个月算起（能量满格）。
  if (typeof parsed.contest.lastRound !== "number" || !isFinite(parsed.contest.lastRound)) {
    parsed.contest.lastRound = -1;
  }
  if (typeof parsed.contest.wins !== "number" || !isFinite(parsed.contest.wins)) {
    parsed.contest.wins = parsed.contest.results.filter((r) => r.rank <= 3).length;
  }
  parsed.contest.results = parsed.contest.results.map((r) => ({
    ...r,
    round: typeof r.round === "number" ? r.round : 0,
    type: typeof r.type === "string" ? r.type : "shop",
    tier: typeof r.tier === "number" ? r.tier : 1,
  }));
  if (typeof parsed.district !== "string" || parsed.district === "") {
    parsed.district = "xingning";
  }
  if (typeof parsed.districtSince !== "number" || !isFinite(parsed.districtSince)) {
    parsed.districtSince = 0;
  } else if (parsed.districtSince > parsed.month) {
    parsed.districtSince = parsed.month;
  }
  // v11 → v12（热卖槽 Ramen Frenzy）：老档没有 frenzy，补成「槽空、没在热卖、0 次」。
  // 不补的话 frenzyTick 里 `state.frenzy` 为 undefined 会直接跳过，热卖永远不触发——
  // 老档玩家会以为这功能坏了，而不是「还没攒到」。
  const fz = (parsed as { frenzy?: unknown }).frenzy as Record<string, unknown> | undefined;
  if (!fz || typeof fz !== "object") {
    parsed.frenzy = { gauge: 0, until: -1, restUntil: -1, count: 0 };
  } else {
    parsed.frenzy = {
      gauge: typeof fz.gauge === "number" && isFinite(fz.gauge) ? fz.gauge : 0,
      until: typeof fz.until === "number" && isFinite(fz.until) ? fz.until : -1,
      restUntil: typeof fz.restUntil === "number" && isFinite(fz.restUntil) ? fz.restUntil : -1,
      count: typeof fz.count === "number" && isFinite(fz.count) ? fz.count : 0,
    };
  }
  if (parsed.flow && typeof parsed.flow === "object") {
    const fl = parsed.flow as { lastFrenzy?: unknown };
    if (typeof fl.lastFrenzy !== "string") fl.lastFrenzy = null;
  }
  // v12 → v13（加料台与饮料柜）：老档没有 sides，补成「开局三样上架、没卖过」；
  // tally 补两个累加字段。不补的话 settle 里读 state.sides.sold 会炸。
  const sd = (parsed as { sides?: unknown }).sides as Record<string, unknown> | undefined;
  if (!sd || typeof sd !== "object") {
    parsed.sides = { active: [...START_SIDES], sold: {}, mealDeal: false, drinkTemp: "ice" };
  } else {
    const active = Array.isArray(sd.active) ? sd.active.filter((x): x is string => typeof x === "string") : [];
    const sold = sd.sold && typeof sd.sold === "object" ? (sd.sold as Record<string, number>) : {};
    parsed.sides = {
      active: active.length > 0 ? active : [...START_SIDES],
      sold,
      mealDeal: sd.mealDeal === true,
      // v15 → v16（P43 饮料冰热）：老档没有这个字段，按夏天默认冰的
      drinkTemp: sd.drinkTemp === "hot" ? "hot" : "ice",
    };
  }
  if (parsed.tally && typeof parsed.tally === "object") {
    const t = parsed.tally as { sideRevenue?: unknown; comboHits?: unknown; branchBowls?: unknown };
    if (typeof t.sideRevenue !== "number" || !isFinite(t.sideRevenue)) t.sideRevenue = 0;
    if (typeof t.comboHits !== "number" || !isFinite(t.comboHits)) t.comboHits = 0;
    if (typeof t.branchBowls !== "number" || !isFinite(t.branchBowls)) t.branchBowls = 0;
  }
  // v13 → v14（粉型本土化）：老档没有 noodle，补成切粉（老友粉的正统）。
  // 非法值也回切粉 —— 否则 noodleFit 会读到 undefined 尺寸。
  const nd = (parsed as { noodle?: unknown }).noodle;
  if (typeof nd !== "string" || !NOODLE_BY_ID.has(nd)) parsed.noodle = START_NOODLE;
  // v14 → v15（分店 S6）：老档没开过分店，补空数组；非数组也补空。
  const br = (parsed as { branches?: unknown }).branches;
  if (!Array.isArray(br)) parsed.branches = [];
  // v18 → v19（M1 同条街）：老档没有 rivals / takenOver / flow.lastStreet。
  // 同行按当前数据表的初始名气补上；已经接过手的铺子补空；传闻补 null。
  const rv = (parsed as { rivals?: unknown }).rivals;
  if (
    !Array.isArray(rv) ||
    rv.length === 0 ||
    rv.some((x) => !x || typeof (x as { id?: unknown }).id !== "string")
  ) {
    parsed.rivals = initRivals();
  }
  const to = (parsed as { takenOver?: unknown }).takenOver;
  if (!Array.isArray(to)) parsed.takenOver = [];
  // v19 → v20（M2 街面）：老档街上什么都没修。
  // 只认数据表里存在的 id，坏值直接丢掉，免得面板渲染出一行空条目。
  const st = (parsed as { streets?: unknown }).streets;
  parsed.streets = Array.isArray(st)
    ? st.filter((x): x is string => typeof x === "string" && STREET_BY_ID.has(x))
    : [];
  // v20 → v21（M3 家当）：老档店里还没有这些旧东西。只认表里存在的 id。
  const gs = (parsed as { gear?: unknown }).gear;
  parsed.gear = Array.isArray(gs)
    ? gs.filter((x): x is string => typeof x === "string" && GEAR_BY_ID.has(x))
    : [];
  const seen = (parsed as { streetSeen?: unknown }).streetSeen;
  parsed.streetSeen = Array.isArray(seen)
    ? seen.filter((x): x is string => typeof x === "string")
    : [];
  if (typeof parsed.flow?.lastStreet !== "string" && parsed.flow) {
    parsed.flow.lastStreet = null;
  }
  // v21 → v22（M3b 人情）：老档没人情。点数为负或非数一律归零；
  // treatDay 只认「month*100+day」这种形状的正整数，其余当没摆过。
  const fv = (parsed as { favor?: unknown }).favor;
  parsed.favor = typeof fv === "number" && Number.isFinite(fv) && fv > 0 ? Math.round(fv) : 0;
  const ft = (parsed as { favorTotal?: unknown }).favorTotal;
  parsed.favorTotal =
    typeof ft === "number" && Number.isFinite(ft) && ft > 0 ? Math.round(ft) : parsed.favor;
  const td = (parsed as { treatDay?: unknown }).treatDay;
  parsed.treatDay = typeof td === "number" && Number.isFinite(td) && td > 0 ? Math.round(td) : -1;
  if (parsed.flow) {
    if (typeof parsed.flow.lastFavor !== "string") parsed.flow.lastFavor = null;
    const fy = (parsed.flow as { favorToday?: unknown }).favorToday;
    parsed.flow.favorToday = typeof fy === "number" && Number.isFinite(fy) && fy > 0 ? Math.round(fy) : 0;
  }
  // v22 → v23（M4 落场）：进行中的局不落盘 —— 存档里永远不带局面；
  // arenaDay/arenaRuns 只记「今天落了几场」，坏值当没落过。
  (parsed as { arena?: unknown }).arena = null;
  const ad = (parsed as { arenaDay?: unknown }).arenaDay;
  parsed.arenaDay = typeof ad === "number" && Number.isFinite(ad) && ad > 0 ? Math.round(ad) : -1;
  const ar = (parsed as { arenaRuns?: unknown }).arenaRuns;
  parsed.arenaRuns = typeof ar === "number" && Number.isFinite(ar) && ar > 0 ? Math.round(ar) : 0;
  if (parsed.tally) {
    const t1 = (parsed.tally as { arenaRuns?: unknown }).arenaRuns;
    parsed.tally.arenaRuns = typeof t1 === "number" && Number.isFinite(t1) && t1 > 0 ? Math.round(t1) : 0;
    const t2 = (parsed.tally as { arenaWins?: unknown }).arenaWins;
    parsed.tally.arenaWins = typeof t2 === "number" && Number.isFinite(t2) && t2 > 0 ? Math.round(t2) : 0;
  }
  // v16 → v17（P46 主料与份量）：老档没有 main/portion。
  // 主料认不出就回碎肉（老友粉的本分），份量只认 2/3，其余回二两。
  const mn = (parsed as { main?: unknown }).main;
  if (typeof mn !== "string" || !MAIN_BY_ID.has(mn as MainId)) parsed.main = START_MAIN;
  const pt = (parsed as { portion?: unknown }).portion;
  if (pt !== 2 && pt !== 3) parsed.portion = DEFAULT_PORTION;
  // v17 → v18（P47 多款粉同时上菜单）：老档只有「一碗」，把它变成菜单里的第一款。
  // 编辑缓冲（recipe/price/noodle/main/portion）原样保留，所以老档读进来就是在编辑那一款。
  const mi = parsed as unknown as {
    menu?: unknown;
    editing?: unknown;
    recipe: unknown;
    noodle?: string;
    main?: string;
    portion?: number;
    price?: number;
  };
  const rawMenu = mi.menu;
  const menuOk =
    Array.isArray(rawMenu) &&
    rawMenu.length > 0 &&
    rawMenu.every(
      (d) =>
        !!d &&
        typeof d === "object" &&
        typeof (d as { id?: unknown }).id === "number" &&
        typeof (d as { price?: unknown }).price === "number" &&
        typeof (d as { on?: unknown }).on === "boolean" &&
        !!(d as { recipe?: unknown }).recipe,
    );
  if (!menuOk) {
    mi.menu = [
      {
        id: 1,
        recipe: mi.recipe,
        noodle: mi.noodle ?? START_NOODLE,
        main: mi.main ?? START_MAIN,
        portion: mi.portion ?? DEFAULT_PORTION,
        price: mi.price ?? 9,
        on: true,
        sold: 0,
      },
    ];
    mi.editing = 0;
  } else {
    const menu = rawMenu as { noodle?: unknown; main?: unknown; portion?: unknown; sold?: unknown }[];
    for (const d of menu) {
      if (typeof d.noodle !== "string" || !NOODLE_BY_ID.has(d.noodle)) d.noodle = START_NOODLE;
      if (typeof d.main !== "string" || !MAIN_BY_ID.has(d.main as MainId)) d.main = START_MAIN;
      if (d.portion !== 2 && d.portion !== 3) d.portion = DEFAULT_PORTION;
      if (typeof d.sold !== "number" || !Number.isFinite(d.sold)) d.sold = 0;
    }
    const ed = mi.editing;
    if (typeof ed !== "number" || !Number.isInteger(ed) || ed < 0 || ed >= menu.length) mi.editing = 0;
  }
  // v23 → v24（B 批成就）：只认表里有的 id，坏值丢弃；
  // 播报队列（pendingTrophies）不落盘 —— 读档时重复弹一遍旧成就是噪音。
  const tr = (parsed as { trophies?: unknown }).trophies;
  parsed.trophies = Array.isArray(tr)
    ? (tr as unknown[]).filter((x): x is string => typeof x === "string" && TROPHY_BY_ID.has(x))
    : [];
  parsed.pendingTrophies = [];
  if (parsed.tally) {
    const rs = (parsed.tally as { recipesSold?: unknown }).recipesSold;
    parsed.tally.recipesSold = typeof rs === "number" && Number.isFinite(rs) && rs > 0 ? Math.round(rs) : 0;
  }
  // v24 → v25（C 批具名赛事）：tourneys 只认「id 在表里、played/best 是正整数」的项；
  // 两个冷却位（tourneyDay / tourneyRound）只认非负整数，坏值当「今天没打过」。
  const tj = (parsed as { tourneys?: unknown }).tourneys;
  const clean: Record<string, { played: number; best: number }> = {};
  if (tj && typeof tj === "object" && !Array.isArray(tj)) {
    for (const [id, rec] of Object.entries(tj as Record<string, unknown>)) {
      if (!TOURNEY_BY_ID.has(id)) continue;
      const r = rec as { played?: unknown; best?: unknown };
      const played = typeof r?.played === "number" && Number.isFinite(r.played) && r.played > 0 ? Math.round(r.played) : 0;
      const best = typeof r?.best === "number" && Number.isFinite(r.best) && r.best > 0 ? Math.round(r.best) : 0;
      if (played > 0 || best > 0) clean[id] = { played, best };
    }
  }
  parsed.tourneys = clean;
  const tdy = (parsed as { tourneyDay?: unknown }).tourneyDay;
  parsed.tourneyDay = typeof tdy === "number" && Number.isInteger(tdy) && tdy >= 0 ? tdy : -1;
  const trnd = (parsed as { tourneyRound?: unknown }).tourneyRound;
  parsed.tourneyRound = typeof trnd === "number" && Number.isInteger(trnd) && trnd >= 0 ? trnd : -1;
  // v25 → v26（B1 味道层）：图鉴多一格 flavors，只认表里有的 id；
  // 老档没有这一格就补空数组 —— 读档不崩比补历史更重要。
  const fl = (parsed.collection as { flavors?: unknown } | undefined)?.flavors;
  if (parsed.collection) {
    parsed.collection.flavors = Array.isArray(fl)
      ? (fl as unknown[]).filter((x): x is string => typeof x === "string" && FLAVOR_BY_ID.has(x))
      : [];
  }
  // v26 → v27（A1 店的样子）：装过哪几套门面、现在摆的是哪一套。
  // styles 只认表里有的 id；style 必须是「装过的那一套」，否则回空铺 ——
  // 不然读档会摆出一套从没买过的门面。
  const sts = (parsed as { styles?: unknown }).styles;
  parsed.styles = Array.isArray(sts)
    ? [...new Set((sts as unknown[]).filter((x): x is string => typeof x === "string" && STYLE_BY_ID.has(x)))]
    : [];
  const stl = (parsed as { style?: unknown }).style;
  parsed.style = typeof stl === "string" && parsed.styles.includes(stl) ? stl : null;
  // v27 → v28（A4 碗）：买过哪几只碗、现在用的是哪一只。
  // 规矩与门面一致：只认表里有的 id；现在那只必须买过，否则退回默认钢碗 ——
  // 不然读档会端出一只从没买过的碗，数值对不上。
  const bws = (parsed as { bowls?: unknown }).bowls;
  parsed.bowls = Array.isArray(bws)
    ? [...new Set((bws as unknown[]).filter((x): x is string => typeof x === "string" && BOWL_BY_ID.has(x)))]
    : [];
  const bwl = (parsed as { bowl?: unknown }).bowl;
  parsed.bowl =
    typeof bwl === "string" && BOWL_BY_ID.has(bwl) && (BOWL_BY_ID.get(bwl)?.free || parsed.bowls.includes(bwl))
      ? bwl
      : DEFAULT_BOWL_ID;
  parsed.saveVersion = SAVE_VERSION;
  return parsed;
}

/**
 * 存档键名停在 v4：改键名等于让所有老档变成孤儿，而版本判断已由
 * `saveVersion` 字段承担。真要挪键名，得先写一次读旧键的迁移。
 */
export const SAVE_STORAGE_KEY = "laoyou.save.v4";
