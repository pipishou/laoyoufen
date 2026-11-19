/**
 * 菜单的容量规则（P47 多款粉同时上菜单）。
 *
 * 开罗的做法：售卖机上挂一排拉面券，客人自己选一款买票（help.txt `Staff 3`
 * 「After a customer buys a ticket…」、`Shop Stats`「popularity and charisma are
 * calculated based on the total values of the dishes it sells」）。菜单是**多款商品**，
 * 不是一个「当前商品」—— 所以我们也要有「同时卖几款」这件事。
 *
 * 开罗没有明写菜单上限，它靠「Ramen Lab 能卖掉不要的配方」和 rank 给的新动词
 * 来控制节奏。我们把它挂在段位上：评得越高，售卖机上挂得越多。
 */

/** 最多同时卖几款（再多顾客也挑不过来，界面也摆不下） */
export const MENU_MAX = 6;

/**
 * 第 `gradeLevel` 段能挂几款。
 * 0–1 段 1 款、2–3 段 2 款、4–5 段 3 款、6–7 段 4 款、8–9 段 5 款、10 段以上 6 款。
 */
export function menuCapOf(gradeLevel: number): number {
  const g = Number.isFinite(gradeLevel) ? Math.max(0, Math.floor(gradeLevel)) : 0;
  return Math.max(1, Math.min(MENU_MAX, 1 + Math.floor(g / 2)));
}

/** 给界面用的一句解释 */
export const MENU_CAP_HINT =
  "菜单位跟段位走：第 2 段能挂 2 款、第 4 段 3 款，最多 6 款。墙上贴一排价目，客人自己挑。";
