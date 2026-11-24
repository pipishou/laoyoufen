/**
 * 建店（六阶的 S0，对应开罗开局先选店）。
 *
 * 这里只做两件事：**选铺位**和**起店名**，然后把状态机从 `setup` 推进到 `prep`。
 * 不做「开店教学」「装修向导」——那些属于 S3，进来会跟教程抢注意力。
 *
 * 设计约束：
 *   - 只在 `setup` 阶段可调；已经有店（`phase !== "setup"`）或钱不够一律拒绝，且**不扣钱**。
 *   - 选铺位是**一次性、不可逆**的动作（退款＝重开档），所以 UI 上要写清转让费。
 *   - 时间、顾客、日结在 `setup` 阶段全部冻结（`tickMinute` 已按 phase 拦截）。
 */

import { siteById, type SiteDef } from "../data/sites";
import { validShopName } from "../data/shop-names";
import { rentMonthlyOf } from "../data/balance";
import { takeoverRentFactor } from "./rivals";
import type { GameState } from "./state";

export interface SetupResult {
  ok: boolean;
  /** 失败原因（给 UI 直接显示，一句话，不写数值以外的术语） */
  reason?: string;
  site?: SiteDef;
}

/** 这个铺位现在能不能拿下（不给改状态，UI 用来上灰） */
export function canTakeSite(state: GameState, siteId: string): SetupResult {
  if (state.phase !== "setup") return { ok: false, reason: "店已经开了" };
  const site = siteById(siteId);
  if (!site) return { ok: false, reason: "没有这个铺位" };
  if (state.cash < site.feeYuan) {
    return { ok: false, reason: `转让费还差 ¥${site.feeYuan - state.cash}`, site };
  }
  return { ok: true, site };
}

/**
 * 开张：定下铺位与店名，扣转让费，把座位 / 灶台 / 日上限换成该铺位的值。
 *
 * 为什么座位与灶台要在这里改而不是「买升级」：现实里看铺面时你就知道能摆几张桌、
 * 几个灶眼——这是选址的一部分，不是后续投资。后续投资（S3–S5）改的是同一批数字的增量。
 */
export function openForBusiness(
  state: GameState,
  siteId: string,
  shopName: string,
): SetupResult {
  const check = canTakeSite(state, siteId);
  if (!check.ok) return check;
  const site = check.site!;
  const name = shopName.trim();
  if (!validShopName(name)) return { ok: false, reason: "店名要 2–12 个字", site };

  state.cash -= site.feeYuan;
  state.venue.seats = site.seats;
  state.venue.stoves = site.stoves;
  state.capacity = site.capacity;
  state.site = site.id;
  state.shopName = name;
  state.phase = "prep";
  return { ok: true, site };
}

export interface RenameResult {
  ok: boolean;
  line: string;
  reason: string;
}

/**
 * 换招牌（批 Y′，照开罗 `custom` 的「店名与招牌」）。
 *
 * 开罗的 `custom` 是 4 类 × 5 级，玩家能买样式、改名字；我们此前店名只在开张那一次
 * 填得进去，之后界面上一行字都改不了（`state.shopName` 只有 `openForBusiness` 写过）。
 *
 * 规矩与开张一致：清洗规则复用 `validShopName`（2–12 字、去换行与尖括号），
 * 不改任何数值、不花钱 —— 换个名字不该动经营，只该让街坊报、打烊单与顶栏一起换口。
 */
export function renameShop(state: GameState, raw: string): RenameResult {
  if (state.phase === "setup") return { ok: false, line: "", reason: "还没开张" };
  const name = raw.trim();
  if (name === state.shopName) return { ok: false, line: "", reason: "还叫这个" };
  if (!validShopName(name)) return { ok: false, line: "", reason: "店名要 2–12 个字" };
  state.shopName = name;
  return { ok: true, line: `招牌换了：${name}`, reason: "" };
}

/**
 * 当月房租（元）：铺位的固定月租 × 每满一年 3% 的续约涨幅。
 *
 * 没选铺位（`phase === "setup"`）时按巷内小店 ¥4,600 预演，让面板上有个数可看。
 */
export function monthlyRentOf(state: GameState): number {
  const base = siteById(state.site)?.rentMonthly ?? 4_600;
  // M1 接手铺面：盘下同行倒闭的铺子后，这条街的租金谈得下来（每多一家再低一档）。
  return Math.round(rentMonthlyOf(base, state.month) * takeoverRentFactor(state));
}
