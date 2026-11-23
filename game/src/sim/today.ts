import type { GameState } from "./state";
import { nextHook } from "./hook";
import { capacityOf, tightWords } from "./bottleneck";
import { scoreOf } from "./dish";
import { GEARS } from "../data/gear";
import { EQUIPMENT, STATION_NAMES, STATION_ORDER, STATION_EQUIP } from "../data/equipment";

/**
 * 「今天这一句」—— 把钩子那一行补成一句能照着做的话（批 F′）。
 *
 * 试玩 11-22-2109 第 5 条：店铺页上「← 现在最缺」「最慢：炒锅 2.2 分」「可评定…」
 * 三处都在抢眼，玩家读完不知道该动哪一件。开罗的做法是**同一时刻只指一件事**
 * （左侧菜单进去才是 Shop Stats 的 Staff / Equipment / Deco 三段），
 * 而线砖、盆栽这类「不在前台出现的东西」写进帮助里说明它属于哪一段
 * （`help.txt` 的 `Construction (Other)`）。
 *
 * 我们这一句就是那张「现在该动哪一件、它在哪一段、几天回本」的纸条：
 * 主句沿用钩子（本地算），副句由这里算出来，AI 只负责再加一句街坊口气。
 */
export interface TodayLine {
  /** 主句：今天该做的那件事 */
  main: string;
  /** 副句：回本与位置（数字都在这一句里，模型不许改） */
  detail: string;
  /** 给 AI 用的稳定键（名词，不含数字） */
  key: string;
  /** 指向面板里的哪一件（店铺页拿来高亮那一行） */
  gearId?: string;
  equipId?: string;
  /** 今天到底卡在哪（给 AI 的上下文用，界面不显示） */
  blocked?: string;
}

/** 一碗能赚几个钱（今天的价签减这一碗的料钱） */
export function marginPerBowl(state: GameState): number {
  const cost = scoreOf(state).cost;
  return Math.max(0.5, state.price - (Number.isFinite(cost) ? cost : 0));
}

/** 这件家当在「家当」段是第几行（1 起，按 `data/gear.ts` 的顺序，和面板渲染同源） */
export function gearRowOf(id: string): number {
  return GEARS.findIndex((g) => g.id === id) + 1;
}

/** 这件设备在「设备」段是第几行（1 起，按 `data/equipment.ts` 的顺序） */
export function equipRowOf(id: string): number {
  return EQUIPMENT.findIndex((e) => e.id === id) + 1;
}

/** 买下这一件，约几天回本（一天多卖几碗 × 一碗赚几块） */
export function paybackDays(cost: number, gain: number, margin: number): number {
  const perDay = Math.max(0, gain) * Math.max(0.01, margin);
  if (perDay <= 0) return 0;
  return Math.max(1, Math.ceil(cost / perDay));
}

/**
 * 回本给一个区间，而不是一个数（P273 / P275）。
 *
 * 一个数会让人以为「第七天准回本」。可这个数只按**今天这一碗**的料钱与卖价算，
 * 明天换了配料、涨了价、来了台风，它就变了。所以上界取今天，下界按七五折的赚头算，
 * 并在句子里写明「按今天这碗算」——把口径摆在数字旁边，比把数字算准更要紧。
 */
export function paybackRange(cost: number, gain: number, margin: number): [number, number] {
  const best = paybackDays(cost, gain, margin);
  const worst = paybackDays(cost, gain, margin * 0.75);
  if (best <= 0 || worst <= 0) return [0, 0];
  return best === worst ? [best, best] : [best, worst];
}

/** 「约 4–6 天回本（按今天这碗算）」；白送就只说一句 */
export function paybackWords(cost: number, gain: number, margin: number): string {
  if (cost <= 0) return "不花钱，当天就见效";
  const [lo, hi] = paybackRange(cost, gain, margin);
  if (lo <= 0) return "看不清几天回本";
  return lo === hi ? `约 ${lo} 天回本（按今天这碗算）` : `约 ${lo}–${hi} 天回本（按今天这碗算）`;
}

/**
 * 今天那一句。没有该做的事（`kind === "none"`）时返回 null ——
 * 「在没有可说之处开口，是机器味的第一来源」。
 */
export function todayLine(state: GameState): TodayLine | null {
  const plan = nextHook(state);
  if (plan.kind === "none" || !plan.text) return null;
  const margin = marginPerBowl(state);
  const ref = plan.ref;

  if (plan.kind === "capacity" && ref) {
    const bowls = Math.max(1, Math.round(ref.gain));
    const money = Math.round(ref.cost);
    if (ref.gearId) {
      return {
        main: plan.text,
        detail: `多坐一位，一天多卖约 ${bowls} 碗，${paybackWords(ref.cost, ref.gain, margin)} · 在「家当」第 ${gearRowOf(ref.gearId)} 行`,
        key: plan.key,
        gearId: ref.gearId,
        blocked: tightWords(state),
      };
    }
    if (ref.equipId) {
      const station = (Object.keys(STATION_EQUIP) as (keyof typeof STATION_EQUIP)[]).find(
        (k) => STATION_EQUIP[k] === ref.equipId,
      );
      const minutes = capacityOf(state).serveNow;
      const buy = money > 0 ? `，${paybackWords(ref.cost, ref.gain, margin)}` : "";
      return {
        main: plan.text,
        detail: `今天卡在${tightWords(state)}：这一段 ${minutes.toFixed(1)} 分一碗${buy} · 在「设备」第 ${equipRowOf(
          String(ref.equipId),
        )} 行${station ? `（${STATION_NAMES[station]}）` : ""}`,
        key: plan.key,
        equipId: String(ref.equipId),
        blocked: tightWords(state),
      };
    }
  }

  if (plan.kind === "price") {
    return {
      main: plan.text,
      detail: `街坊掏钱时手会停一下：降一块，一天能多留几个人 · 价签在「配方」页`,
      key: plan.key,
      blocked: "价签",
    };
  }

  if (plan.kind === "grade") {
    return {
      main: plan.text,
      detail: `招牌换一块，路过的人才认得 · 在「评定」段，交一次费升一段`,
      key: plan.key,
    };
  }

  if (plan.kind === "gear" && ref?.gearId) {
    return {
      main: plan.text,
      detail: `当天就见效的小件 · 在「家当」第 ${gearRowOf(ref.gearId)} 行`,
      key: plan.key,
      gearId: ref.gearId,
      blocked: tightWords(state),
    };
  }

  if (plan.kind === "street") {
    return { main: plan.text, detail: `修的是门口这条街 · 在「街上」段`, key: plan.key };
  }
  if (plan.kind === "arena") {
    return { main: plan.text, detail: `一天一场 · 在「落场」段`, key: plan.key };
  }

  return { main: plan.text, detail: "", key: plan.key };
}

/** 面板高亮用：今天这一句指的是哪一件（家当 / 设备二选一） */
export function todayHot(state: GameState): { gearId?: string; equipId?: string } {
  const line = todayLine(state);
  return { gearId: line?.gearId, equipId: line?.equipId };
}

/** 副句给 AI 的上下文：只给名词 */
export function todayVoiceContext(line: TodayLine): Record<string, string> {
  return {
    // 服务端的 `CN_QUANTITY` 会把带数量词的句子整句丢掉（模型爱回抄上下文），
    // 所以这里把「一位 / 几碗 / 两天」这类片段先剥掉，只留事情本身。
    事: line.main
      .replace(/（.*?）/g, "")
      .replace(/[¥0-9]/g, "")
      .replace(/[一二两三四五六七八九十百千万]+(?:几|多)?(?:位|碗|元|块|天|人|张|个|家|份|次|名|斤)/g, "")
      .trim(),
    在: line.detail.includes("家当")
      ? "店里的家当"
      : line.detail.includes("设备")
        ? "厨房的设备"
        : line.detail.includes("评定")
          ? "门口的招牌"
          : "店里的事",
    // P277：模型只看到「该做什么」，说不出「为什么现在卡这里」。
    // 这一格给它一个名词（座位 / 出碗 / 价签 …），让它一句闲话能落在因果上。
    卡: (line.blocked ?? "").replace(/[¥0-9]/g, "").slice(0, 12),
  };
}

/** 「设备」段还需要哪一段（给副句挑名字用） */
export function stationNameOf(id: string): string {
  const hit = (STATION_ORDER as readonly string[]).find((k) => STATION_EQUIP[k as keyof typeof STATION_EQUIP] === id);
  return hit ? STATION_NAMES[hit as keyof typeof STATION_NAMES] : "";
}
